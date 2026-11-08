// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §2.8, §6.2). The FOUNDATION wrote the final
// signatures (plan §6.1 item 6); SWATH built them. The UI may call any of them on every paint. Others ask by message.
// SURVEY's pure rules: the cells a tick sweeps, a site's ★, what SURVEY is doing, the swath's width, why a site can't take an
// LZ, the LZs a site can take, the swap the strip offers. No module state, no store. (mappedPct is
// state/survey-selectors.ts's: the ship's record needs it.)
import type { GameState } from '@state/schema';
import type { LzState } from '@/types/landing';
import type { SurveySite, AssignRefusal, SurveyRunning } from '@/types/survey';
import type { EffectiveVersion } from '@/types/skill';
import { isLivePhase } from '@systems/clock';
import { pendingTouchdowns } from '@systems/landing-rules';
import { surveyVersion, groundKnownAt, siteVisible, lzOnSite } from '@state/survey-selectors';
import { fileLevel } from '@systems/skill-levels';
import {
  SURVEY_CELL_DEG, SURVEY_CELLS, SURVEY_SWATH_DEG, SURVEY_SWEEP_FACTOR, SURVEY_SWEEP_VERSION, SURVEY_RATE_VERSION,
} from '@data/tuning';

const TWO_PI = 2 * Math.PI;
const CELL_RAD = (SURVEY_CELL_DEG * Math.PI) / 180;

// An angle in [0, 2π).
function wrap(rad: number): number {
  const out = rad % TWO_PI;
  return out < 0 ? out + TWO_PI : out;
}

// The cell a world angle falls in (0..SURVEY_CELLS − 1): the site-finding rule (a site is found when its centre's cell is
// mapped).
export function cellOf(rad: number): number {
  return Math.min(SURVEY_CELLS - 1, Math.floor(wrap(rad) / CELL_RAD));
}

// The cells (indices into survey.mapped, SURVEY_CELL_DEG each from 0 rad) whose centre lies within the arc the ship swept
// from `fromRad` to `toRad` going `dir` (1 CCW, −1 CW), widened by ±`swathRad` (plan §2.8 step 3; a wrap through 0
// included). `fullTurn`: the tick's game-time step was a period or more (a long SKIP), so the ship passed over every angle
// and every cell is swept whatever the two angles say. In ascending order.
export function sweptCells(fromRad: number, toRad: number, dir: 1 | -1, swathRad: number, fullTurn = false): number[] {
  if (!(swathRad >= 0)) throw new Error(`sweptCells: a swath of ${swathRad} rad`);
  // The swept arc as [start, start + length] going CCW: a CW sweep from `from` to `to` is the CCW arc from `to` to `from`.
  const length = fullTurn ? TWO_PI : wrap(dir === 1 ? toRad - fromRad : fromRad - toRad);
  const start = (dir === 1 ? fromRad : toRad) - swathRad;
  const span = length + 2 * swathRad;
  if (span >= TWO_PI) return Array.from({ length: SURVEY_CELLS }, (_, i) => i);
  const cells: number[] = [];
  for (let i = 0; i < SURVEY_CELLS; i++) {
    const centre = (i + 0.5) * CELL_RAD;
    if (wrap(centre - start) <= span) cells.push(i);
  }
  return cells;
}

// A site's rating (R11): 3 ★★★ FLAT and not NARROW, 2 ★★ FLAT NARROW, 1 ★ ROCKY or WET, 0 a wreck (no stars). Read only once
// its ground is known.
export type SiteStars = 0 | 1 | 2 | 3;

export function siteStars(site: Readonly<Pick<SurveySite, 'kind' | 'ground' | 'width'>>): SiteStars {
  if (site.kind === 'wreck') return 0;
  if (site.ground !== 'flat') return 1;
  return site.width === 'narrow' ? 2 : 3;
}

// The swath's half-width at a version (01 §3.13: ±SURVEY_SWATH_DEG; v3 SWEEP × SURVEY_SWEEP_FACTOR), in radians: the tick's
// sweep and SITES's wedge. 0 at version 0.
export function swathHalfRad(version: EffectiveVersion): number {
  if (version === 0) return 0;
  return (SURVEY_SWATH_DEG * (version >= SURVEY_SWEEP_VERSION ? SURVEY_SWEEP_FACTOR : 1) * Math.PI) / 180;
}

// Whether SURVEY also maps a swath around the drop dot now (OPEN-DECISIONS 52, deviating from 01 §3.13): in the LANDING, at
// SURVEY_RATE_VERSION or better, while it runs. The dot itself is the drop cache's (systems/drop-cache.ts getDropSolution):
// SITES's wedge reads it there.
export function dropSwathOn(state: Readonly<GameState>): boolean {
  return state.run.phase === 'landing' && surveyVersion(state) >= SURVEY_RATE_VERSION && surveyRunning(state) === 'running';
}

// Whether the ship is where SURVEY maps (plan §2.8 step 1): a live flight, or the landing until it ends, with the clock running.
function mappingPhase(state: Readonly<GameState>): boolean {
  if (!isLivePhase(state) || state.clock.paused) return false;
  return state.run.phase === 'flight' || state.landing.ended === null;
}

// What SURVEY is doing now (plan §2.8 step 1, review M2): the one rule SWATH's tick and SITES's header and wedge share.
// • 'off': a GOOD planet, or no SURVEY aboard that works (not carried, OFF by damage, not built);
// • 'done': every cell mapped (whatever the phase: the SITES header keeps saying so after the landing);
// • 'off' too outside a live flight or an open landing, or with the clock paused;
// • 'paused': the kid's PAUSE;
// • 'waiting': below v3 it wants a spare Core thread and holds none (`claimed`, reconciled by the tick each tick);
// • 'running': it maps (at v1–v2 with its thread held, at v3 with none).
export function surveyRunning(state: Readonly<GameState>): SurveyRunning {
  const { survey } = state.landing;
  if (survey.site !== 'poor') return 'off';
  const version = surveyVersion(state);
  if (version === 0) return 'off';
  if (survey.mapped.every(Boolean)) return 'done';
  if (!mappingPhase(state)) return 'off';
  if (survey.paused) return 'paused';
  if (version < SURVEY_SWEEP_VERSION && !survey.claimed) return 'waiting';
  return 'running';
}

// Whether SURVEY wants its thread now (the tick's claim rule): it would map, below v3, whether or not it holds one.
export function surveyWantsThread(state: Readonly<GameState>): boolean {
  const running = surveyRunning(state);
  return (running === 'running' || running === 'waiting') && surveyVersion(state) < SURVEY_SWEEP_VERSION;
}

function lzOf(state: Readonly<GameState>, label: string): LzState {
  const lz = state.landing.lzs.find((candidate) => candidate.label === label);
  if (lz === undefined) throw new Error(`survey: no LZ ${label}`);
  return lz;
}

function siteOf(state: Readonly<GameState>, siteId: string): SurveySite {
  const site = state.landing.survey.sites.find((candidate) => candidate.id === siteId);
  if (site === undefined) throw new Error(`survey: no site '${siteId}' on this planet`);
  return site;
}

// A pod down in the LZ (in it with room, or mislanded there: both stand on its ground).
function podsDownIn(state: Readonly<GameState>, lz: string): boolean {
  return state.landing.pods.some((record) => record.fate.kind === 'down' && record.fate.touchdown.lz === lz);
}

const anyFalling = (state: Readonly<GameState>): boolean => state.landing.pods.some((record) => record.fate.kind === 'falling');

// A pod falling that was aimed at the LZ, or will come down in it as it stands (pendingTouchdowns: the touchdown's own rule).
function podFallingTo(state: Readonly<GameState>, lz: string): boolean {
  if (!anyFalling(state)) return false;
  if (state.landing.pods.some((record) => record.fate.kind === 'falling' && record.fate.launch.aimLz === lz)) return true;
  for (const touchdown of pendingTouchdowns(state).values()) if (touchdown.lz === lz) return true;
  return false;
}

// Review B1: whether moving the LZ `lz` onto `site` would change where a pod already falling comes down (its place or its LZ).
// A pod's fate is fixed at its touchdown, from its launch's landingRad against the LZs as they stand then (landing-rules
// classifyLanding, through pendingTouchdowns), so a free LZ moved under a pod falling off-site would make it an LZ pod. Every
// falling pod is judged against the LZs now and against the moved ones; any difference refuses the move (R4: no pod in
// flight is re-judged).
function moveRejudgesFalling(state: Readonly<GameState>, lz: string, site: Readonly<SurveySite>): boolean {
  if (!anyFalling(state)) return false;
  const lzs = state.landing.lzs.map((one): LzState => (one.label !== lz ? one : {
    ...one, centreRad: site.centreRad, halfWidthRad: site.halfWidthRad, widthKm: site.widthKm, ground: site.ground, site: site.id,
  }));
  const before = pendingTouchdowns(state);
  const after = pendingTouchdowns({ ...state, landing: { ...state.landing, lzs } });
  for (const [pod, touchdown] of before) {
    const moved = after.get(pod);
    if (moved === undefined || moved.place !== touchdown.place || moved.lz !== touchdown.lz) return true;
  }
  return false;
}

// Why the site `siteId` can't take the LZ `lz` now, or null when it can (R10), checked in this order:
// • 'closed': a GOOD planet, no SURVEY aboard, or the ship is not in flight or landing (the boot, a desk); 'offline': a
//   SURVEY.skl aboard that damage has turned OFF (review m1: a REPAIR brings it back);
// • 'not-found' (a candidate or a wreck not mapped yet; CONTROL's guesses are known from the boot, so an LZ can go back),
//   'wreck', 'same' (the LZ stands on it);
// • 'too-small' (ROOM under the LZ's count), 'taken' (another LZ's);
// • 'landing-over';
// • 'pods-down' (01: "an LZ can't move once a pod has landed in it"), 'falling' (a pod on its way there), 'falling-under' (a
//   pod on its way elsewhere would come down in the moved LZ, or out of it: review B1);
// • 'window-open': its window is open now, or GO LOWER holds an aim for it (review m5: the burn would fly to the old place).
// Throws on an LZ or a site the ship does not have.
export function assignRefusal(state: Readonly<GameState>, lz: string, siteId: string): AssignRefusal | null {
  const { landing } = state;
  const at = lzOf(state, lz);
  if (landing.survey.site !== 'poor') return 'closed';
  const site = siteOf(state, siteId);
  const phase = state.run.phase;
  if (phase !== 'flight' && phase !== 'landing' && phase !== 'report') return 'closed';
  if (surveyVersion(state) === 0) return fileLevel(state.memory, 'survey') === null ? 'closed' : 'offline';
  if (!siteVisible(site)) return 'not-found';
  if (site.kind === 'wreck') return 'wreck';
  if (at.site === siteId) return 'same';
  if (site.roomPods < at.pods) return 'too-small';
  const owner = lzOnSite(landing, siteId);
  if (owner !== null && owner !== lz) return 'taken';
  if (phase === 'report' || (phase === 'landing' && landing.ended !== null) || !isLivePhase(state)) return 'landing-over';
  if (podsDownIn(state, lz)) return 'pods-down';
  if (podFallingTo(state, lz)) return 'falling';
  if (moveRejudgesFalling(state, lz, site)) return 'falling-under';
  if (landing.window?.lz === lz || (landing.goLow?.held === true && landing.goLow.lz === lz)) return 'window-open';
  return null;
}

// Every LZ with what assignRefusal says for the site `siteId`, in label order: the SITES window's pill row (`SET AS LZ-B
// (800)` for a null refusal, the refusal dimmed otherwise).
export function assignableLzs(state: Readonly<GameState>, siteId: string): { lz: string; refusal: AssignRefusal | null }[] {
  return [...state.landing.lzs]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((lz) => ({ lz: lz.label, refusal: assignRefusal(state, lz.label, siteId) }));
}

// The LZ `lz` stands on ground the kid knows is bad (ROCKY or WET: R5, R11).
export function knownBad(state: Readonly<GameState>, lz: string): boolean {
  const at = lzOf(state, lz);
  return state.landing.survey.site === 'poor' && at.ground !== 'flat' && groundKnownAt(state.landing, lz);
}

// The best site to move the LZ `lz` to when its ground is known bad (R22's strip row): a found site known FLAT, with ROOM for
// it, that assignRefusal allows; the widest first, then the most ROOM, then the lowest number. null: none, or the LZ's ground
// is not known bad.
export function bestSwap(state: Readonly<GameState>, lz: string): string | null {
  if (!knownBad(state, lz)) return null;
  const options = state.landing.survey.sites
    .filter((site) => site.kind !== 'wreck' && site.groundKnown && site.ground === 'flat' && siteVisible(site))
    .filter((site) => assignRefusal(state, lz, site.id) === null)
    .sort((a, b) => b.halfWidthRad - a.halfWidthRad || b.roomPods - a.roomPods || a.number - b.number);
  return options[0]?.id ?? null;
}

// The strip's swap (R22): the first LZ in label order SURVEY knows a better place for, and that place; null when none. Only
// while no window is open (a window is the kid's moment to launch, not to rearrange).
export function surveySwap(state: Readonly<GameState>): { lz: string; site: SurveySite } | null {
  if (state.landing.survey.site !== 'poor' || state.landing.window !== null) return null;
  for (const lz of [...state.landing.lzs].sort((a, b) => a.label.localeCompare(b.label))) {
    const siteId = bestSwap(state, lz.label);
    if (siteId !== null) return { lz: lz.label, site: siteOf(state, siteId) };
  }
  return null;
}
