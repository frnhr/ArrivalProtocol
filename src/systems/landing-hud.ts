// Slice 7b: the lead owns this file (slice-7-plan.md §4.2): the launchDrivers swap (R24) and the beacons' `restored` (R29:
// THE LAST LANDING's pods ride as steady amber beacons; Track VIEW draws them in plot-landing.ts).
// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §5): the GROUND TRACK's survey hooks (Track SITES's
// models in systems/survey-hud.ts: the candidate brackets and the unmapped rim). Slice 4c–4e's Track DROP parts stand:
// bayWindowModel.autodrop, the AUTODROP pip, the plan table's model. Others ask by message.
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  DragKick, DropFactors, DropSolution, LandingState, LzState, LzWindow, NoGoArcState, Place, Touch, TerrainWord,
} from '@/types/landing';
import type { BurnPoint, Prediction, PredictOutcome } from '@systems/predict';
import { elementsFromState, propagateConic, semiMajorAxis, type OrbitState, type Vec2 } from '@/types/orbit';
import { getByRole, launchDrivers } from '@state/selectors';
import { angleDelta, dropHalfWidthKm } from '@systems/landing-solve';
import { capabilitiesNow, skillLive, BAND_COPY, type Band, type Capabilities } from '@systems/capabilities';
import { dragLineKm } from '@systems/landing-orbit';
import { paid } from '@systems/skill-levels';
import { passCounts, passRows, planLanding } from '@systems/autodrop-plan';
import { repairWord, whoGoesLower } from '@systems/autodrop';
import { AUTODROP_TEXT } from '@data/autodrop-text';
import { surveyGroundBrackets, surveyUnmapped, type RimArc } from '@systems/survey-hud';
import {
  bayMembers, bayShown, driverTouch, dropFactors, isLaunchable, launchGuard, launchRefusal, lzAt, lzDownFill, lzProjectedFill, nextToLaunch,
  endLandingRefusal, landingMoment, onTargetTally, podCounts, podsWithFate, landingView as landingViewOf,
} from '@systems/landing-rules';
import {
  BAND_TEXT, GROUND_TRACK_TEXT, LANDING_HUD_TEXT, LANDING_PLOT_TEXT, LAUNCH_REFUSAL_TEXT, MINI_LANDING_TEXT, POD_BAY_STATUS_TEXT,
  POD_BAY_TEXT, DRIVER_DETAIL_TEXT, LAUNCH_CONFIRM_TEXT, DRAG_STAMP_TEXT, END_LANDING_REFUSAL_TEXT, minSec,
} from '@data/landing-text';
import {
  AUTODROP_PLAN_MAX_PASSES, BAND_OK_MIN, WINDOW_TACTICAL_LEAD_TAC,
  BAND_FAILING_MIN, BAY_RELOAD_TAC, BAY_SLOTS, BEACON_LAG_FRAC, DRAG_STAMP_MIN_KM, GROUND_TRACK_AHEAD_MAX, GROUND_TRACK_SPAN_KM,
  POD_FIRST_DESCENT_SEC, STREAK_TRAIL_FRAC, TERRAIN_ALT_SHARE, TERRAIN_STRETCH_DEG,
} from '@data/tuning';

// What the landing's own screens show (01-landing §4), as plain data: the NAV PLOT's brackets, dot, pod arc, streaks,
// landing marks and parked-pod beacons (plotLandingModel), the GROUND TRACK panel (groundTrackModel), the POD BAY
// window (bayWindowModel), the MIND's BAY / NEXT tags (podTags), a driver's predicted landing (driverLanding), the
// footer's pods (footerPods) and the mini-HUD's landing rows (miniHudLanding). Pure and DOM-free like flight-hud.ts:
// every function takes the state and, where it draws the drop, the drop solution, which the component reads from
// drop-cache's getDropSolution() (never currentDropSolution: that one re-solves on every call). "Window open now" is
// read from state.landing.window only (landing.ts writes it), so the strip, the brackets and [L] agree.
//
// Extendable as data (later slices fill what 1a leaves empty): no-go arcs (1b), out-of-band stretches (the windows a
// PARTIAL orbit can't use; 1b's decay), survey candidate brackets, drawn dashed (slice 6, `candidate`), and terrain
// glyphs per stretch of ground (terrainStretches: 1b's pattern per terrain word; slice 6's survey maps more).
//
// Slice 1b (plan §3 Track UI): the DRAG line, the grey DROP UNCERTAIN dot (`≈` widths), GO LOWER's ◇ and its target tick,
// the drag stamp, out-of-band windows at the right edge, Bay Ctrl's pip and NO BAY CTRL, the class line. ORBIT's answers
// that were still the foundation's stubs when this was written (the burn offer, the decay forecast) come in as
// parameters, as in flight-hud, so this module is tested against crafted states (landing.decay.last, landing.goLow,
// sol.uncertain, an injected offer).

// --- Shared pieces ------------------------------------------------------------------------------------------------------

function tacOf(state: Readonly<GameState>, gameSec: number): number {
  return gameSec / state.level.tacticalWarp;
}

// An LZ's counters (§3.5 "the counters show everywhere"): pods down in it (touchdown order, MISLANDED's fill), the
// projected fill (down plus falling into it: what [L]'s guard reads), and its count in pods.
export interface LzCounter {
  lz: string;
  down: number;
  projected: number;
  count: number;
  full: boolean;          // by the projected fill: a pod launched now at it would be mislanded
  text: string;           // `LZ-A 1/3`, `LZ-A 3/3 ✓`
}

export function lzCounters(state: Readonly<GameState>): LzCounter[] {
  const down = lzDownFill(state);
  const projected = lzProjectedFill(state);
  return state.landing.lzs.map((lz) => {
    const shownDown = down[lz.label] ?? 0;
    const shownProjected = projected[lz.label] ?? 0;
    return {
      lz: lz.label, down: shownDown, projected: shownProjected, count: lz.pods, full: shownProjected >= lz.pods,
      text: LANDING_PLOT_TEXT.bracket(lz.label, shownDown, lz.pods),
    };
  });
}

// How a bracket looks (§4): `full` once its count is reached (by the projected fill), else `open` while the dot's centre
// is in it in the band (the GROUND TRACK's bright dashed bracket), `sure` while the whole dot fits (green), `target` for
// the LZ the next window opens for, `idle` otherwise. `candidate` is SURVEY's dashed bracket (slice 6).
export type BracketLook = 'idle' | 'target' | 'open' | 'sure' | 'full' | 'candidate';

export interface BracketModel {
  lz: string;
  centreRad: number;
  halfWidthRad: number;
  widthKm: number;
  down: number;
  count: number;
  look: BracketLook;
  label: string;          // `LZ-A 1/3`
  outOfBand: boolean;     // its next window can't be launched from inside the band (a PARTIAL orbit): hatched
}

function windowOf(sol: Readonly<DropSolution> | null, lz: string): LzWindow | null {
  return sol?.windows.find((w) => w.lz === lz) ?? null;
}

export function bracketModels(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): BracketModel[] {
  const { landing } = state;
  const target = landingMoment(state, sol, state.clock.tSec, capabilitiesNow(state).bay.offline).target;
  const counters = lzCounters(state);
  return landing.lzs.map((lz, i) => {
    const counter = counters[i]!;
    const win = windowOf(sol, lz.label);
    // Full first: a green bracket says "launch here", and a pod launched into a full LZ is mislanded.
    let look: BracketLook = 'idle';
    if (counter.full) look = 'full';
    else if (landing.window?.lz === lz.label) look = landing.window.sure ? 'sure' : 'open';
    else if (target?.lz === lz.label) look = 'target';
    return {
      lz: lz.label, centreRad: lz.centreRad, halfWidthRad: lz.halfWidthRad, widthKm: lz.widthKm, down: counter.down,
      count: lz.pods, look, label: counter.text, outOfBand: win !== null && !win.inBand,
    };
  });
}

// The drop dot (§3.3): where a pod launched now would land, how wide, whether the ship is in the band (grey outside),
// which bracket its centre is in and whether the whole dot fits there, and how centred it is (0 at the bracket's edge,
// 1 dead centre: the window tone's pitch, §4).
export interface DotModel {
  rad: number;
  halfWidthKm: number;
  halfWidthRad: number;
  inBand: boolean;
  lz: string | null;
  fits: 'none' | 'centre' | 'whole';
  centredness: number | null;
  uncertain: boolean;     // Sensor Interp failing or worse (§3.8): the grey dot, `≈` on its width
}

export function dropDotModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): DotModel | null {
  const dot = sol?.dot ?? null;
  if (sol === null || sol.block !== null || dot === null) return null;
  const R = state.level.planet.R;
  const halfWidthRad = dot.halfWidthKm / R;
  const lz = lzAt(state.landing.lzs, dot.rad);
  let fits: DotModel['fits'] = 'none';
  let centredness: number | null = null;
  if (lz !== null) {
    const off = Math.abs(angleDelta(lz.centreRad, dot.rad));
    fits = off + halfWidthRad <= lz.halfWidthRad ? 'whole' : 'centre';
    centredness = Math.max(0, Math.min(1, 1 - off / lz.halfWidthRad));
  }
  return {
    rad: dot.rad, halfWidthKm: dot.halfWidthKm, halfWidthRad, inBand: dot.inBand, lz: lz?.label ?? null, fits, centredness,
    uncertain: dot.uncertain || sol.uncertain,
  };
}

// The window tone (§4: lockTone(fraction), fraction = how centred the dot is), or null: silent unless a window is open
// now (state.landing.window) and the dot sits in that window's bracket.
export function windowToneFraction(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): number | null {
  const open = state.landing.window;
  if (state.run.phase !== 'landing' || open === null || state.clock.paused) return null;
  const dot = dropDotModel(state, sol);
  if (dot === null || dot.lz !== open.lz) return null;
  return dot.centredness;
}

// --- The NAV PLOT (§4) --------------------------------------------------------------------------------------------------

// A falling pod's streak along its fixed arc (LaunchRecord.arc, decided at launch), run over its descentSec of AI time:
// the trail behind the head, the head itself, and whether it is below the atmosphere line (white-hot).
export interface StreakModel {
  pod: number;
  trail: Vec2[];          // world km, oldest first, ending at the head
  head: Vec2;
  progress: number;       // 0 at launch, 1 at touchdown
  hot: boolean;           // the head is inside the atmosphere: the entry flare
  first: boolean;         // run 1's first pod (the slower, brighter streak)
}

// The arc bent so it ends where the pod really lands: the solver's arc ends at the dot's centre, the pod at
// dotRad + u × s (≤ the drop width away), so the arc turns by that much, growing along it.
function bentArc(arc: readonly Vec2[], turnRad: number): Vec2[] {
  const last = arc.length - 1;
  return arc.map((point, i) => {
    const angle = (turnRad * i) / Math.max(1, last);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
  });
}

function pointAlong(arc: readonly Vec2[], at: number): Vec2 {
  const scaled = Math.max(0, Math.min(1, at)) * (arc.length - 1);
  const i = Math.min(arc.length - 2, Math.floor(scaled));
  const a = arc[i]!;
  const b = arc[i + 1]!;
  const t = scaled - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function podStreaks(state: Readonly<GameState>): StreakModel[] {
  const aiNow = state.clock.aiSec;
  const rAtm = state.level.planet.rAtm;
  const streaks: StreakModel[] = [];
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'falling') continue;
    const launch = record.fate.launch;
    if (launch.arc.length < 2) throw new Error(`podStreaks: pod ${record.pod}'s arc has ${launch.arc.length} points`);
    const arc = bentArc(launch.arc, angleDelta(launch.dotRad, launch.landingRad));
    const progress = Math.max(0, Math.min(1, (aiNow - launch.atAi) / launch.descentSec));
    const head = pointAlong(arc, progress);
    const from = Math.max(0, progress - STREAK_TRAIL_FRAC);
    const trail: Vec2[] = [pointAlong(arc, from)];
    const last = arc.length - 1;
    for (let i = Math.ceil(from * last); i < progress * last; i++) trail.push(arc[i]!);
    trail.push(head);
    streaks.push({
      pod: record.pod, trail, head, progress, hot: Math.hypot(head.x, head.y) < rAtm,
      first: launch.descentSec >= POD_FIRST_DESCENT_SEC,
    });
  }
  return streaks;
}

// A pod down on the surface (§4: `◘` where it landed), in its place's colour.
export interface LandMark {
  pod: number;
  rad: number;
  place: Place;
  touch: Touch;
  lz: string | null;
}

export function landMarks(state: Readonly<GameState>): LandMark[] {
  return state.landing.pods.flatMap((record) => (record.fate.kind === 'down'
    ? [{ pod: record.pod, rad: record.fate.launch.landingRad, place: record.fate.touchdown.place, touch: record.fate.touchdown.touch, lz: record.fate.touchdown.lz }]
    : []));
}

// The pods parked in orbit (§3.10), riding the ship's orbit as small blinking beacons, BEACON_LAG_FRAC of a period
// apart behind the ship (they left it when the landing ended).
// Slice 7b (R25, R29): during THE LAST LANDING the restored pods still to fly (released: aboard, with a driver by radio) ride
// as beacons too, `restored` (steady amber, 01 §3.17), in pod order with the parked ones.
export interface Beacon {
  pod: number;
  pos: Vec2;
  restored: boolean;
}

export function parkedBeacons(state: Readonly<GameState>): Beacon[] {
  const radio = new Set(state.landing.lastLanding?.drivers.map((driver) => driver.pod) ?? []);
  const parked = state.landing.pods.filter((record) => record.fate.kind === 'parked' || (record.fate.kind === 'aboard' && radio.has(record.pod)));
  if (parked.length === 0) return [];
  const { mu } = state.level.planet;
  const el = elementsFromState(state.orbit, mu);
  if (!(el.e < 1)) return [];
  const a = semiMajorAxis(el);
  const period = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  return parked.map((record, i) => {
    // Behind the ship by (i + 1) lags: forward by the rest of the period.
    const at = propagateConic(state.orbit, mu, period * (1 - BEACON_LAG_FRAC * (i + 1)));
    return { pod: record.pod, pos: { x: at.x, y: at.y }, restored: radio.has(record.pod) };
  });
}

export interface NoGoModel {
  centreRad: number;
  halfWidthRad: number;
  word: string;
}

function noGoModels(noGo: readonly NoGoArcState[]): NoGoModel[] {
  return noGo.map((arc) => ({ centreRad: arc.centreRad, halfWidthRad: arc.halfWidthRad, word: arc.word }));
}

// The NAV PLOT's ring name (§4): `SAFE ORBIT · LAUNCH BAND` in flight, `LAUNCH BAND` while landing.
export function ringLabel(state: Readonly<GameState>): string {
  return state.run.phase === 'landing' ? BAND_TEXT.ringLanding : BAND_TEXT.ringFlight;
}

// The radius of the live conic at world angle `rad` (r = p / (1 + e·cos(rad − ω)), either direction of travel), or null
// on an open path: GO LOWER's marks sit on the orbit the kid is flying now.
function conicRadiusAt(orbit: Readonly<OrbitState>, mu: number, rad: number): number | null {
  const el = elementsFromState(orbit, mu);
  if (!(el.e < 1)) return null;
  const radius = (el.rp * (1 + el.e)) / (1 + el.e * Math.cos(rad - el.omega));
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

function polarKm(radius: number, rad: number): Vec2 {
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

// GO LOWER on the plot (§3.7, landing.goLow): the ◇ where the RETRO burn is centred (half an orbit before the launch
// point), with its countdown while the burn is the one offered (`◇ 00:42` over `GO LOWER`, as ▼ reads `▼ 08:23` over
// `LOWEST …`), and a small target tick at the launch point of the LZ it is for (`LZ-B ▸`). `offer`: landing-orbit
// landingBurnOffer's answer, injected (its times are game s after `pred.asOfTSec`); without it the marks show
// uncounted (an aim the kid declined, or one not offered yet).
export interface GoLowMarks {
  lz: string;
  held: boolean;
  point: { pos: Vec2; lines: string[]; countdown: string | null };
  target: { pos: Vec2; rad: number; label: string };
}

export function goLowMarks(
  state: Readonly<GameState>, pred: Readonly<Prediction> | null, offer: Readonly<BurnPoint> | null,
): GoLowMarks | null {
  const aim = state.landing.goLow;
  if (state.run.phase !== 'landing' || state.landing.ended !== null || aim === null) return null;
  const { mu } = state.level.planet;
  const pointR = conicRadiusAt(state.orbit, mu, aim.burnRad);
  const targetR = conicRadiusAt(state.orbit, mu, aim.launchRad);
  if (pointR === null || targetR === null) return null;
  let countdown: string | null = null;
  if (pred !== null && offer !== null && offer.reason === 'go-low' && (offer.aimLz ?? aim.lz) === aim.lz) {
    const gameSec = Math.max(0, offer.eventInSec - (state.clock.tSec - pred.asOfTSec));
    countdown = minSec(tacOf(state, gameSec)).padStart(5, '0');   // mm:ss, as the plot's ▼ and ▲ count
  }
  return {
    lz: aim.lz,
    held: aim.held,
    point: {
      pos: polarKm(pointR, aim.burnRad), countdown,
      lines: [LANDING_PLOT_TEXT.goLowPoint(countdown), LANDING_PLOT_TEXT.goLowWord],
    },
    target: { pos: polarKm(targetR, aim.launchRad), rad: aim.launchRad, label: LANDING_PLOT_TEXT.goLowTarget(aim.lz) },
  };
}

// The drag stamp (§3.7, risk 15): `DRAG · ▲ −110 km` where the kick happened (its ▼: `rad`, `rpKm`), only for a kick that
// moved the far apsis at least DRAG_STAMP_MIN_KM (the hiss and the lesson share the threshold); null for a smaller one.
export interface DragStamp {
  text: string;
  pos: Vec2;
  rad: number;
}

export function dragStamp(kick: Readonly<DragKick> | null): DragStamp | null {
  if (kick === null || kick.dropKm < DRAG_STAMP_MIN_KM) return null;
  return { text: DRAG_STAMP_TEXT.kick(kick.apsis, kick.dropKm), pos: polarKm(kick.rpKm, kick.rad), rad: kick.rad };
}

export interface PlotLandingModel {
  brackets: BracketModel[];
  noGo: NoGoModel[];
  dot: DotModel | null;
  // The pod arc: dotted bright amber, grey outside the band, grey and dim while the drop is uncertain (§3.8).
  arc: { points: Vec2[]; inBand: boolean; uncertain: boolean } | null;
  dotLabel: string | null;          // the grey dot's `≈±195 km` (§3.8); null for a sure dot (the GROUND TRACK says its width)
  dragLineKm: number | null;        // the faint dashed DRAG circle (§3.7), on ships with drag only
  goLow: GoLowMarks | null;
  streaks: StreakModel[];
  marks: LandMark[];
  beacons: Beacon[];
}

// Everything the landing adds to the NAV PLOT, or null outside LANDING. `pred` and `offer` (landing-orbit
// landingBurnOffer, injected) only time GO LOWER's ◇; without them its marks show uncounted.
export function plotLandingModel(
  state: Readonly<GameState>, sol: Readonly<DropSolution> | null,
  pred: Readonly<Prediction> | null = null, offer: Readonly<BurnPoint> | null = null,
): PlotLandingModel | null {
  if (state.run.phase !== 'landing') return null;
  const dot = dropDotModel(state, sol);
  const aboard = state.landing.ended === null && state.landing.pods.some((record) => record.fate.kind === 'aboard');
  const arc = dot !== null && aboard && sol !== null && sol.arc.length >= 2
    ? { points: sol.arc, inBand: dot.inBand, uncertain: dot.uncertain } : null;
  const shownDot = aboard ? dot : null;
  return {
    brackets: bracketModels(state, sol),
    noGo: noGoModels(state.landing.noGo),
    dot: shownDot,
    arc,
    dotLabel: shownDot !== null && shownDot.uncertain ? LANDING_PLOT_TEXT.dotWidth(shownDot.halfWidthKm) : null,
    dragLineKm: state.landing.drag ? dragLineKm(state.level.ring) : null,
    goLow: goLowMarks(state, pred, offer),
    streaks: podStreaks(state),
    marks: landMarks(state),
    beacons: parkedBeacons(state),
  };
}

// --- The GROUND TRACK (§4) ----------------------------------------------------------------------------------------------

// A span on one of the panel's lines, as fractions of its width (the strip's may run past 0..1: the component clips).
export interface Span {
  from: number;
  to: number;
}

export interface GroundBracket extends Span {
  lz: string;             // the LZ's label; a candidate's (look 'candidate', slice 6) is its site's id, so the nodes stay keyed
  look: BracketLook;
  label: string;          // `[ LZ-A · 1/3 ]`; a candidate's `SITE 4`
  outOfBand: boolean;
  site: string | null;    // slice 6: a SURVEY candidate's site id (a click selects it in SITES); null on an LZ's bracket
}

export interface GroundMark {
  pod: number;
  at: number;             // fraction across the line
  place: Place;
  touch: Touch;
}

export interface GroundAhead {
  lz: string;
  text: string;           // `LZ-B ▸ 2:10`; in strip.outOfBandAhead `LZ-B ▸ OUT OF BAND`
  open: boolean;
  full: boolean;
}

// The terrain glyph rows (§4: `≈` water, `·` plains, `^` rock, red `////` no-go), by terrain word: the ground's main
// glyph, the second one some stretches take (TERRAIN_ALT_SHARE), and the glyph under an LZ's bracket (an LZ is flat
// ground: OCEAN's brackets are its islands, `·` among the `≈`). No-go arcs draw no glyph: the strip hatches them red with
// their word over them (gt-nogo).
export interface TerrainPattern {
  ground: string;
  alt: string;
  site: string;
}

export const TERRAIN_PATTERN: Readonly<Record<TerrainWord, TerrainPattern>> = {
  PLAINS: { ground: '·', alt: '"', site: '·' },
  GRASSLAND: { ground: '"', alt: '·', site: '·' },
  OCEAN: { ground: '≈', alt: '≈', site: '·' },
  VOLCANIC: { ground: '^', alt: '·', site: '·' },
};

export function terrainGlyph(terrain: TerrainWord): string {
  return TERRAIN_PATTERN[terrain].ground;
}

// One stretch of the planet's ground, in world angles (from < to, possibly past ±π: callers take angleDelta). 'unmapped'
// (slice 6): ground SURVEY has not mapped yet on a POOR planet, drawn UNMAPPED_GLYPH.
export type TerrainKind = 'no-go' | 'site' | 'unmapped' | 'ground';

// Slice 6 (plan §2.14): the glyph of ground not mapped yet (`░`); Track SITES paints the rest of the look.
export const UNMAPPED_GLYPH = '░';

// Slice 6 (review M4): rim arcs cut where the views need them. The strip places a stretch by its middle's wrapped angle from
// the dot (angleDelta, in (−π, π]), so a stretch wider than π (the whole rim, unmapped at the boot) would be laid out behind
// the dot; the overview line draws a span from its middle and cuts what wraps past its ends at angle 0. Each piece is at
// most π wide and never crosses a multiple of 2π; a whole turn or more is the whole rim.
const TAU = 2 * Math.PI;
export function splitRimArcs(arcs: readonly RimArc[]): RimArc[] {
  const out: RimArc[] = [];
  for (const arc of arcs) {
    const width = Math.min(arc.toRad - arc.fromRad, TAU);
    if (!(width > 0)) continue;
    let from = ((arc.fromRad % TAU) + TAU) % TAU;
    let left = width;
    while (left > 0) {
      const toTurn = TAU - from;
      const piece = Math.min(left, Math.PI, toTurn);
      out.push({ fromRad: from, toRad: from + piece });
      left -= piece;
      from = piece === toTurn ? 0 : from + piece;
    }
  }
  return out;
}

export interface TerrainArc {
  fromRad: number;
  toRad: number;
  glyph: string;          // '' for no-go: hatched, not glyphed
  kind: TerrainKind;
  word: string | null;    // the no-go arc's word (LAVA), else null
}

// The same ground always reads the same: a fixed hash of a stretch's index picks its glyph.
function stretchHash(index: number): number {
  let h = Math.imul(index ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x165667b1);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// The planet's ground as stretches, highest priority first (the first that covers a place gives its glyph): the no-go
// arcs, the LZs' brackets, the rim SURVEY has not mapped (`unmapped`, slice 6: systems/survey-hud.ts surveyUnmapped; none on
// a GOOD planet), then the ground in TERRAIN_STRETCH_DEG stretches of the terrain's main or second glyph. Pure, from the
// landing's own data.
export function terrainStretches(landing: Readonly<Pick<LandingState, 'terrain' | 'lzs' | 'noGo'>>, unmappedArcs: readonly RimArc[] = []): TerrainArc[] {
  const unmapped = splitRimArcs(unmappedArcs);
  const pattern = TERRAIN_PATTERN[landing.terrain];
  const arcs: TerrainArc[] = [
    ...landing.noGo.map((arc): TerrainArc => ({
      fromRad: arc.centreRad - arc.halfWidthRad, toRad: arc.centreRad + arc.halfWidthRad, glyph: '', kind: 'no-go', word: arc.word,
    })),
    ...landing.lzs.map((lz): TerrainArc => ({
      fromRad: lz.centreRad - lz.halfWidthRad, toRad: lz.centreRad + lz.halfWidthRad, glyph: pattern.site, kind: 'site', word: null,
    })),
    ...unmapped.map((arc): TerrainArc => ({ fromRad: arc.fromRad, toRad: arc.toRad, glyph: UNMAPPED_GLYPH, kind: 'unmapped', word: null })),
  ];
  const count = Math.round(360 / TERRAIN_STRETCH_DEG);
  const step = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const glyph = stretchHash(i) < TERRAIN_ALT_SHARE ? pattern.alt : pattern.ground;
    arcs.push({ fromRad: i * step, toRad: (i + 1) * step, glyph, kind: 'ground', word: null });
  }
  return arcs;
}

// A stretch of the strip and its glyph (terrainStretches mapped onto the strip, in the same priority order).
export interface TerrainStretch extends Span {
  glyph: string;
  kind: TerrainKind;
}

// A place on the strip's terrain row: the first stretch (by priority) that covers it, or null.
export function terrainAt(terrain: readonly TerrainStretch[], at: number): TerrainStretch | null {
  return terrain.find((stretch) => at >= stretch.from && at < stretch.to) ?? null;
}

export interface GroundTrackModel {
  header: string;               // KEPLER-186F · RIVERSIDE
  // The whole planet unrolled, 0..1 starting at angle 0 in the direction of travel.
  planet: {
    brackets: GroundBracket[];
    noGo: Span[];
    unmapped: Span[];           // slice 6: the rim SURVEY has not mapped (`░` on the overview line); none on a GOOD planet
    outOfBand: Span[];
    marks: GroundMark[];
    dot: number | null;
    view: Span;                 // the main strip's stretch of it
  };
  // The main strip: GROUND_TRACK_SPAN_KM of surface under the fixed central dot; ahead is to the right.
  strip: {
    spanKm: number;
    groundKm: number;           // the ground under the dot, in km from angle 0 (the glyph rows scroll by it)
    terrain: TerrainStretch[];
    brackets: GroundBracket[];
    noGo: (Span & { word: string })[];
    marks: GroundMark[];
    dot: { half: number; inBand: boolean; fits: DotModel['fits']; uncertain: boolean; text: string } | null;
    ahead: GroundAhead[];
    // Slice 1b: the LZs whose next window is launched from outside the band, named after `ahead` at the right edge with no
    // countdown (`LZ-B ▸ OUT OF BAND`). Kept apart from `ahead`, which lists only what the landing counts down to (M3).
    outOfBandAhead: GroundAhead[];
  };
  blocked: string | null;       // NO DROP SOLUTION (and nothing on the strip but the ground)
  outOfBand: boolean;           // the ship is outside the launch band now: the dot greys
}

function travelSign(state: Readonly<GameState>): 1 | -1 {
  const { x, y, vx, vy } = state.orbit;
  return x * vy - y * vx >= 0 ? 1 : -1;
}

// An angle's place on the unrolled planet line (0..1 from angle 0 along the travel direction).
function planetFrac(rad: number, sign: 1 | -1): number {
  const turn = (sign * rad) / (2 * Math.PI);
  return turn - Math.floor(turn);
}

export function groundTrackModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): GroundTrackModel {
  const { landing } = state;
  const R = state.level.planet.R;
  const sign = travelSign(state);
  const dot = dropDotModel(state, sol);
  const brackets = bracketModels(state, sol);
  const marks = landMarks(state);
  // With no dot the strip centres on the ship's own ground point, so the brackets still scroll by.
  const centreRad = dot?.rad ?? Math.atan2(state.orbit.y, state.orbit.x);
  const spanKm = GROUND_TRACK_SPAN_KM;
  const stripAt = (rad: number): number => 0.5 + (sign * angleDelta(centreRad, rad) * R) / spanKm;
  const stripSpan = (centre: number, half: number): Span => {
    const mid = stripAt(centre);
    const halfFrac = (half * R) / spanKm;
    return { from: mid - halfFrac, to: mid + halfFrac };
  };
  const planetSpan = (centre: number, half: number): Span => {
    const mid = planetFrac(centre, sign);
    const halfFrac = half / (2 * Math.PI);
    return { from: mid - halfFrac, to: mid + halfFrac };
  };
  const bracketOn = (model: BracketModel, span: Span, label: string): GroundBracket => ({
    ...span, lz: model.lz, look: model.look, label, outOfBand: model.outOfBand, site: null,
  });
  // Slice 6 (plan §2.4): SURVEY's found sites as dashed 'candidate' brackets after the LZs' (Track SITES's model).
  const candidates = surveyGroundBrackets(state);
  const candidateOn = (bracket: (typeof candidates)[number], span: Span): GroundBracket => ({
    ...span, lz: bracket.site, look: 'candidate', label: bracket.label, outOfBand: false, site: bracket.site,
  });
  const stripBrackets = [
    ...brackets.map((model) => bracketOn(model, stripSpan(model.centreRad, model.halfWidthRad),
      GROUND_TRACK_TEXT.bracket(model.lz, model.down, model.count))),
    ...candidates.map((bracket) => candidateOn(bracket, stripSpan(bracket.centreRad, bracket.halfWidthRad))),
  ];
  const onStrip = (span: Span): boolean => span.to > 0 && span.from < 1;

  // The next LZs past the right edge, soonest launch moment first, with its countdown: the in-band windows as of now
  // (landing-rules landingMoment, the strip's and the chip's count); an LZ never in the band is hatched, not listed.
  // Only while the landing waits on windows (moment.awaited, review minor 9): with NO BAY CTRL (or no driver that can
  // ever launch) nothing is counted down to, and a countdown at the edge read as "wait for it".
  const ahead: GroundAhead[] = [];
  const moment = landingMoment(state, sol, state.clock.tSec, capabilitiesNow(state).bay.offline);
  const waiting = (moment.awaited ? moment.upcoming : [])
    .filter((w) => {
      const bracket = stripBrackets.find((b) => b.lz === w.lz);
      return bracket !== undefined && bracket.from >= 1;
    })
    .sort((a, b) => a.launchInSec - b.launchInSec)
    .slice(0, GROUND_TRACK_AHEAD_MAX);
  for (const w of waiting) {
    const open = w.launchInSec <= 0;
    const text = w.full ? GROUND_TRACK_TEXT.aheadFull(w.lz)
      : open ? GROUND_TRACK_TEXT.aheadOpen(w.lz) : GROUND_TRACK_TEXT.ahead(w.lz, minSec(tacOf(state, w.launchInSec)));
    ahead.push({ lz: w.lz, text, open, full: w.full });
  }
  // Slice 1b: an LZ whose next window is launched from outside the band (a PARTIAL orbit, or one decay has sunk) is still
  // named at the edge after the in-band ones, `LZ-B ▸ OUT OF BAND`: the kid sees the site is there and why it isn't
  // counted down (the strip's L2 names the burn that brings it back). Not one on the strip already, nor a full one.
  const counters = new Map(lzCounters(state).map((counter) => [counter.lz, counter]));
  const outOfBandAhead: GroundAhead[] = [];
  for (const bracket of brackets) {
    if (ahead.length + outOfBandAhead.length >= GROUND_TRACK_AHEAD_MAX) break;
    if (!bracket.outOfBand || counters.get(bracket.lz)?.full === true || ahead.some((entry) => entry.lz === bracket.lz)) continue;
    const onStripNow = stripBrackets.find((b) => b.lz === bracket.lz);
    if (onStripNow !== undefined && onStrip(onStripNow)) continue;
    outOfBandAhead.push({ lz: bracket.lz, text: GROUND_TRACK_TEXT.aheadOutOfBand(bracket.lz), open: false, full: false });
  }

  const blocked = sol !== null && sol.block !== null ? GROUND_TRACK_TEXT.noSolution
    : dot === null ? GROUND_TRACK_TEXT.noDot : null;
  // The terrain under the strip: the planet's stretches that reach it, in priority order (terrainAt takes the first).
  const unmapped = splitRimArcs(surveyUnmapped(state));
  const terrain: TerrainStretch[] = terrainStretches(landing, unmapped).flatMap((arc): TerrainStretch[] => {
    const span = stripSpan((arc.fromRad + arc.toRad) / 2, (arc.toRad - arc.fromRad) / 2);
    return onStrip(span) ? [{ ...span, glyph: arc.glyph, kind: arc.kind }] : [];
  });
  const viewHalf = spanKm / 2 / R;
  const viewMid = planetFrac(centreRad, sign);
  const viewHalfFrac = viewHalf / (2 * Math.PI);
  return {
    header: GROUND_TRACK_TEXT.header(state.mission.destination, landing.colony),
    planet: {
      brackets: [
        ...brackets.map((model) => bracketOn(model, planetSpan(model.centreRad, model.halfWidthRad), model.lz)),
        ...candidates.map((bracket) => candidateOn(bracket, planetSpan(bracket.centreRad, bracket.halfWidthRad))),
      ],
      noGo: landing.noGo.map((arc) => planetSpan(arc.centreRad, arc.halfWidthRad)),
      unmapped: unmapped.map((arc) => planetSpan((arc.fromRad + arc.toRad) / 2, (arc.toRad - arc.fromRad) / 2)),
      outOfBand: brackets.filter((model) => model.outOfBand).map((model) => planetSpan(model.centreRad, model.halfWidthRad)),
      marks: marks.map((mark) => ({ pod: mark.pod, at: planetFrac(mark.rad, sign), place: mark.place, touch: mark.touch })),
      dot: dot === null ? null : planetFrac(dot.rad, sign),
      view: { from: viewMid - viewHalfFrac, to: viewMid + viewHalfFrac },
    },
    strip: {
      spanKm,
      groundKm: sign * centreRad * R,
      terrain,
      brackets: stripBrackets.filter(onStrip),
      noGo: landing.noGo.map((arc) => ({ ...stripSpan(arc.centreRad, arc.halfWidthRad), word: arc.word })).filter(onStrip),
      marks: marks.map((mark) => ({ pod: mark.pod, at: stripAt(mark.rad), place: mark.place, touch: mark.touch }))
        .filter((mark) => mark.at >= 0 && mark.at <= 1),
      dot: dot === null ? null : {
        half: dot.halfWidthKm / spanKm, inBand: dot.inBand, fits: dot.fits, uncertain: dot.uncertain,
        text: GROUND_TRACK_TEXT.drop(dot.halfWidthKm, dot.uncertain),
      },
      ahead,
      outOfBandAhead,
    },
    blocked,
    outOfBand: dot !== null && !dot.inBand,
  };
}

// --- The POD BAY window (§4) --------------------------------------------------------------------------------------------

// [ L · LAUNCH POD ]: `go` when [L] would launch into an open window now, `asks` when it would launch after a confirm
// (the dot off-site, or its LZ full), `blocked` with the refusal's words otherwise.
export type LaunchLook = 'go' | 'asks' | 'blocked';

// The BAY CTRL pip in the window (§3.4, slice 1b): Bay Ctrl's band, in BAND_COPY.bay's words (`BAY CTRL DAMAGED · …`),
// and `offline` with the file missing: then no pod can launch, said `NO BAY CTRL` (§3.10: "offline" never stands next to
// pods; BAND_COPY.bay.missing). `unknown` while Bay Ctrl is a ship file the kid has not scanned: its damage stays hidden
// (§3.2), as the window's title pip says `?` (flight-hud windowPip). A missing file is loud whether scanned or not.
export interface BayCtrlModel {
  band: Band | 'unknown';
  offline: boolean;
  text: string;
}

// The class line (the card labels 1a's risk 5 left; the ship card proper is slice 3): `PLAINS · off-site pods score half`,
// and the no-go arcs by their words, `NO-GO: LAVA` (null on a ship without arcs).
export interface BayClassModel {
  text: string;
  noGo: string | null;
}

// The refusals that outrank BAY OFFLINE in launchRefusal's order (the LaunchRefusal union's): the window shows those
// words, and NO BAY CTRL over every later one. MERGE FLYING too: THE LAST LANDING's pods leave from no bay (slice 7b).
const OUTRANKS_BAY_OFFLINE: ReadonlySet<string> = new Set(['NOT LANDING', 'LANDING OVER', 'MERGE FLYING', 'PAUSED']);

export interface BayWindowModel {
  launch: { label: string; look: LaunchLook; status: string };
  bay: { shown: number; loaded: number; slots: number; reloadTac: number | null; text: string };
  ctrl: BayCtrlModel;
  cls: BayClassModel;
  next: { pod: number; family: string; touch: Touch; halfWidthKm: number | null; text: string } | null;
  nextText: string;                 // the NEXT line, or why there is none
  lzs: LzCounter[];
  cantLaunch: number;               // pods aboard that can't launch now
  aboard: number;
  endLanding: { label: string; confirm: string; enabled: boolean };
  // Slice 4c (plan §3.8): AUTODROP's pip, key line, v2's pass rows and v3's plan table; null while the unit has no
  // AUTODROP.skl and never trained it.
  autodrop: AutodropBayModel | null;
}

// --- AUTODROP in the POD BAY (slice 4c, plan §3.3, §3.4, §3.8) ------------------------------------------------------------

export type AutodropPipLook = Band | 'offline';

export interface AutodropBayModel {
  // The BAY window's AUTODROP pip (03 §4: `AUTODROP v2▸v1`; a click jumps to the file, as every pip does).
  pip: { segId: string | null; label: string; look: AutodropPipLook; glyph: string; reading: string; title: string };
  version: number;                  // what it works as now (0: OFF)
  // What [L] and [G] do now, and the [G] button (shown from v2: it arms, or cancels while armed).
  key: { text: string; look: 'go' | 'armed' | 'off' | 'wait' };
  go: { shown: boolean; label: string; armed: boolean };
  // v2's rows (`A [−] 2 [+]`), while AUTODROP works as v2.
  pass: { lz: string; n: number; max: number; warn: string | null }[] | null;
  // v3's plan table, its check line and the never-fits lines, while it works as v3.
  plan: {
    rows: { text: string; forecast: boolean; mislanded: boolean; now: boolean }[];
    check: string;
    complete: boolean;
    notes: string[];
  } | null;
}

const AUTODROP_PIP_GLYPH: Readonly<Record<AutodropPipLook, string>> = {
  ok: '●', degraded: '●', failing: '●', dead: '●', missing: '✕', offline: '↻',
};

// The plan table shows this many volleys (six keep the POD BAY above the desk's foot at 900 px); the rest say `+n MORE`.
const PLAN_ROWS_SHOWN = 6;

export function autodropBayModel(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): AutodropBayModel | null {
  const live = skillLive(state.memory, 'autodrop');
  if (live.file === null && paid(state.run.skills, 'autodrop') === null) return null;
  const words = AUTODROP_TEXT.bay;
  const nominal = live.file?.version ?? 0;
  const look: AutodropPipLook = live.file === null ? 'missing' : live.offline !== null ? 'offline' : live.band;
  const pip = {
    segId: live.file?.id ?? null,
    label: live.file === null ? words.pipLabel : live.version === nominal ? words.pipVersion(nominal) : words.pipWorksAs(nominal, live.version),
    look,
    glyph: AUTODROP_PIP_GLYPH[look],
    reading: live.file !== null && live.band !== 'ok' ? `${Math.round(live.file.integrity)}%` : '',
    title: live.file === null ? words.pipMissing : live.offline !== null ? words.pipOffline(nominal)
      : live.version === nominal ? words.pipOk(nominal) : words.pipDamaged(nominal, live.version, BAND_OK_MIN),
  };
  const ad = state.landing.autodrop;
  const armed = ad.armed !== null && live.version >= 2;
  let key: AutodropBayModel['key'];
  if (live.version === 0) key = { text: words.keyOff, look: 'off' };
  else if (armed && ad.waitingSinceTSec !== null) key = { text: words.keyWaiting, look: 'wait' };
  else if (armed) key = { text: ad.armed === 'plan' ? words.keyArmedPlan : words.keyArmedPass, look: 'armed' };
  else key = { text: live.version >= 3 ? words.keyPlan : live.version === 2 ? words.keyPass : words.keyHold, look: 'go' };
  const go = { shown: live.version >= 2 || armed, label: armed ? words.goButtonArmed : words.goButton, armed };
  const landing = state.run.phase === 'landing' && state.landing.ended === null && sol !== null && sol.block === null && sol.dot !== null;
  if (!landing) return { pip, version: live.version, key, go: { ...go, shown: false }, pass: null, plan: null };
  const view = landingViewOf(state, sol, capabilitiesNow(state).bay.cadenceTac);
  let pass: AutodropBayModel['pass'] = null;
  if (live.version === 2 || (armed && ad.armed === 'pass')) {
    const counts = armed ? ad.pass : passCounts(state, view);
    pass = passRows(state, view, counts).map((row) => ({
      lz: row.lz, n: row.want, max: view.remaining[row.lz] ?? 0,
      warn: row.fits === 0 ? words.noWindow(row.lz)
        : row.bayHas !== null ? words.shortBay(row.lz, row.want, row.bayHas)
          : row.fits < row.want ? words.shortFit(row.lz, row.want, row.fits) : null,
    }));
  }
  let plan: AutodropBayModel['plan'] = null;
  if (live.version >= 3 && ad.armed !== 'pass') {
    const planned = planLanding(state, view);
    const now = state.clock.tSec;
    const rows = planned.rows.slice(0, PLAN_ROWS_SHOWN).map((row) => {
      const tac = tacOf(state, row.atTSec - now);
      return {
        text: words.planRow(row.pass, row.lz, row.n, tac <= 0.05 ? words.planNow : words.planIn(minSec(tac)), row.mislanded),
        forecast: row.forecast, mislanded: row.mislanded > 0, now: tac <= WINDOW_TACTICAL_LEAD_TAC,
      };
    });
    const extra = planned.rows.length - rows.length;
    if (extra > 0) rows.push({ text: words.planMore(extra), forecast: true, mislanded: false, now: false });
    const missing = [...planned.neverFits.map((never) => never.lz),
      ...state.landing.lzs.filter((lz) => (view.remaining[lz.label] ?? 0) > (planned.perLz[lz.label] ?? 0)
        && !planned.neverFits.some((never) => never.lz === lz.label)).map((lz) => lz.label)];
    const perLz: Record<string, number> = {};
    for (const lz of state.landing.lzs) if ((view.remaining[lz.label] ?? 0) > 0) perLz[lz.label] = planned.perLz[lz.label] ?? 0;
    const notes = planned.neverFits.map((never) => words.neverFits(never.lz, repairWord(never.repair), whoGoesLower(state, never.lz)));
    if (planned.laterPasses > 0) notes.push(words.planLater(planned.laterPasses, AUTODROP_PLAN_MAX_PASSES));
    plan = {
      rows: rows.length === 0 ? [{ text: words.planEmpty, forecast: true, mislanded: false, now: false }] : rows,
      check: words.planCheck(planned.passes, perLz, [...new Set(missing)].sort()),
      complete: planned.complete, notes,
    };
  }
  return { pip, version: live.version, key, go, pass, plan };
}

// `outcome`: the prediction's (getPrediction().outcome; END LANDING is refused on a path into the planet, review B1).
// `caps` (default: now) is a parameter so a test can hand in Bay Ctrl's state directly.
export function bayWindowModel(
  state: Readonly<GameState>, sol: Readonly<DropSolution> | null, outcome: PredictOutcome,
  caps: Readonly<Capabilities> = capabilitiesNow(state),
): BayWindowModel {
  const { landing } = state;
  const shown = bayShown(state);
  const reloading = landing.bay.loaded < BAY_SLOTS;
  const reloadTac = reloading ? Math.max(0, BAY_RELOAD_TAC - landing.bay.reloadTac) : null;
  const refusal = launchRefusal(state, sol, { source: 'player', fromMind: false });
  const aboard = podsWithFate(state, 'aboard');
  let look: LaunchLook = 'blocked';
  let status = refusal === null ? POD_BAY_STATUS_TEXT.ready : LAUNCH_REFUSAL_TEXT[refusal];
  // In the MIND the window isn't on screen; the button still says what it would do from amber.
  if (refusal === 'SHIP SCREEN') status = POD_BAY_STATUS_TEXT.ready;
  if (refusal === null || refusal === 'SHIP SCREEN') {
    // No guard: the dot is in a bracket with room, in the band, so the window is open (or opens on this AI tick).
    const guard = sol !== null ? launchGuard(state, sol) : null;
    look = guard === null ? 'go' : 'asks';
    if (guard !== null) status = guard.ask === 'full' && guard.lz !== null ? POD_BAY_STATUS_TEXT.full(guard.lz) : POD_BAY_STATUS_TEXT.offSite;
  }
  // NO BAY CTRL (§3.4's BAY OFFLINE): LAUNCH disabled with its words, in launchRefusal's order. landing-rules says it too;
  // read here from capabilities as well, so the window can never offer a launch the bay has no file to make.
  const ctrlOffline = caps.bay.offline;
  if (ctrlOffline && (refusal === null || !OUTRANKS_BAY_OFFLINE.has(refusal))) {
    look = 'blocked';
    status = LAUNCH_REFUSAL_TEXT['BAY OFFLINE'];
  }
  if (aboard.length === 0) status = POD_BAY_STATUS_TEXT.allAway;
  // Slice 4c: held for AUTODROP v1, the button says AUTODROP times the volley (the dot's off-site ask is not the kid's).
  else if (landing.autodrop.held) {
    look = 'go';
    status = AUTODROP_TEXT.bay.launchHeld;
  }

  const nextDriver = nextToLaunch(state);
  // The NEXT pod's drop (risk 19: LOAD NEXT changes the dot): the solved dot's own width, which drop-cache solves for
  // this very pod with every factor (§3.8), else the driver's at the ship's radius through landing-rules dropFactors.
  const nextLanding = nextDriver === null ? null : driverLanding(state, nextDriver, sol, dropFactors(caps, nextDriver));
  const next = nextLanding === null ? null : { ...nextLanding, halfWidthKm: sol?.dot?.halfWidthKm ?? nextLanding.halfWidthKm };
  const approx = sol?.uncertain === true;
  const bayFile = getByRole(state, 'bay');
  const bayHidden = bayFile !== null && (bayFile.type === 'ship' || bayFile.type === 'ship-backup') && !bayFile.scanned;
  const ctrlBand: Band | 'unknown' = ctrlOffline ? 'missing' : bayHidden ? 'unknown' : caps.bay.band;
  const noGoWords = [...new Set(landing.noGo.map((arc) => arc.word))];
  const launchable = new Set(launchDrivers(state).filter(isLaunchable).map((driver) => driver.pod));
  const cantLaunch = aboard.filter((record) => !launchable.has(record.pod)).length;
  const endRefusal = endLandingRefusal(state, outcome);
  return {
    launch: { label: POD_BAY_TEXT.launch, look, status },
    bay: { shown, loaded: landing.bay.loaded, slots: BAY_SLOTS, reloadTac, text: POD_BAY_TEXT.bay(shown, BAY_SLOTS, reloadTac) },
    ctrl: {
      band: ctrlBand, offline: ctrlOffline,
      text: ctrlBand === 'ok' || ctrlBand === 'unknown' ? POD_BAY_TEXT.bayCtrl : BAND_COPY.bay[ctrlBand],
    },
    cls: {
      text: POD_BAY_TEXT.classLine(landing.terrain, landing.forgiveness),
      noGo: noGoWords.length === 0 ? null : POD_BAY_TEXT.noGoLine(noGoWords),
    },
    next: nextDriver === null || next === null ? null : {
      pod: nextDriver.pod, family: nextDriver.family, touch: driverTouch(nextDriver.integrity), halfWidthKm: next.halfWidthKm,
      text: POD_BAY_TEXT.next(nextDriver.pod, nextDriver.family, driverTouch(nextDriver.integrity), next.halfWidthKm ?? 0, approx),
    },
    nextText: nextDriver === null ? (aboard.length === 0 ? POD_BAY_STATUS_TEXT.allAway : POD_BAY_STATUS_TEXT.noNext)
      : POD_BAY_TEXT.next(nextDriver.pod, nextDriver.family, driverTouch(nextDriver.integrity), next?.halfWidthKm ?? 0, approx),
    lzs: lzCounters(state),
    cantLaunch,
    aboard: aboard.length,
    // Refused on a path into the planet: the button says why in place of its label (landing-rules endLandingRefusal).
    endLanding: {
      label: endRefusal === 'IMPACT' ? END_LANDING_REFUSAL_TEXT : POD_BAY_TEXT.endLanding,
      confirm: LAUNCH_CONFIRM_TEXT.endLanding(aboard.length),
      enabled: endRefusal === null,
    },
    autodrop: autodropBayModel(state, sol),
  };
}

// --- The MIND ------------------------------------------------------------------------------------------------------------

// The BAY / NEXT tags (§3.4): the next launchable drivers the bay holds slots for say BAY, the very next one NEXT.
export type PodTag = 'BAY' | 'NEXT';

export function podTags(state: Readonly<GameState>): Map<number, PodTag> {
  const tags = new Map<number, PodTag>();
  if (state.run.phase !== 'landing' || state.landing.ended !== null) return tags;
  const { bay, next } = bayMembers(state);
  for (const pod of bay) tags.set(pod, DRIVER_DETAIL_TEXT.tagBay);
  if (next !== null) tags.set(next, DRIVER_DETAIL_TEXT.tagNext);
  return tags;
}

// How a driver's pod would land if it launched now (§3.8 detail panel): soft with its drop width, hard, or not at all.
export type DriverOutlook = 'soft' | 'hard' | 'cant';

export interface DriverLanding {
  outlook: DriverOutlook;
  halfWidthKm: number | null;   // null: no drop to judge (no solution, or below the surface)
  text: string;                 // `WILL LAND SOFT · DROP ±78 km`, `WILL LAND HARD`, `CAN'T LAUNCH — REPAIR IT`
  tag: PodTag | null;
}

// `factors`: the drop width's multipliers for this driver (landing-rules dropFactors(caps, driver), all 1 in 1a); a
// component passes them so this stays free of the capabilities' live thread count.
export function driverLanding(
  state: Readonly<GameState>, driver: Readonly<DriverSegment>, sol: Readonly<DropSolution> | null,
  factors: DropFactors = { sensor: 1, plotter: 1, driver: 1 },
): DriverLanding {
  const outlook: DriverOutlook = driver.integrity < BAND_FAILING_MIN ? 'cant' : driverTouch(driver.integrity);
  const R = state.level.planet.R;
  const radius = sol?.dot?.launchRadius ?? Math.hypot(state.orbit.x, state.orbit.y);
  const halfWidthKm = radius > R ? dropHalfWidthKm(radius, R, factors) : null;
  const text = outlook === 'cant' ? DRIVER_DETAIL_TEXT.cantLaunch
    : outlook === 'hard' ? DRIVER_DETAIL_TEXT.hard
      : halfWidthKm === null ? 'WILL LAND SOFT' : DRIVER_DETAIL_TEXT.soft(halfWidthKm, sol?.uncertain === true);
  return { outlook, halfWidthKm, text, tag: podTags(state).get(driver.pod) ?? null };
}

// The footer (§4): `PODS: 8 ABOARD · 3 LANDED · 1 CAN'T LAUNCH`, in pods. CAN'T LAUNCH counts the pods aboard whose
// driver is gone or can't launch right now (dead, infected, busy).
export interface FooterPods {
  aboard: number;
  landed: number;
  cantLaunch: number;
  text: string;
}

export function footerPods(state: Readonly<GameState>): FooterPods {
  const launchable = new Set(launchDrivers(state).filter(isLaunchable).map((driver) => driver.pod));
  let aboard = 0;
  let landed = 0;
  let cantLaunch = 0;
  for (const record of state.landing.pods) {
    if (record.fate.kind === 'down') landed++;
    if (record.fate.kind !== 'aboard') continue;
    aboard++;
    if (!launchable.has(record.pod)) cantLaunch++;
  }
  return { aboard, landed, cantLaunch, text: LANDING_HUD_TEXT.footer(aboard, landed, cantLaunch) };
}

// The mini-HUD's landing rows in blue (§4): the next window (`LZ-A OPEN`, `LZ-B IN 2:10`), the bay, the pods down, and
// the ON TARGET star as it stands (`★ ON TARGET 5/6`: gold while earned, the hurt yellow while it can still be, an
// empty star once it can't).
export interface MiniHudLanding {
  window: { text: string; open: boolean } | null;
  bay: string;
  down: string;
  onTarget: { text: string; tone: 'good' | 'risk' | 'lost' };
}

export function miniHudLanding(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): MiniHudLanding | null {
  if (state.run.phase !== 'landing') return null;
  const { landing } = state;
  const aboard = podCounts(state).aboard;
  let window: MiniHudLanding['window'] = null;
  if (aboard === 0 || landing.ended !== null) window = { text: MINI_LANDING_TEXT.allAway, open: false };
  else {
    // Counting to the awaited window's launch moment (the strip's GET READY, the chip: landing-rules landingMoment), OPEN
    // once it has come.
    const moment = landingMoment(state, sol, state.clock.tSec, capabilitiesNow(state).bay.offline);
    if (moment.open !== null && moment.open.awaited && moment.open.launchCome) {
      window = { text: MINI_LANDING_TEXT.windowOpen(moment.open.lz), open: true };
    } else if (moment.target !== null) {
      window = { text: MINI_LANDING_TEXT.windowIn(moment.target.lz, minSec(tacOf(state, moment.target.launchInSec))), open: false };
    }
  }
  const down = landing.pods.filter((record) => record.fate.kind === 'down').length;
  const tally = onTargetTally(state);
  const tone = tally.earned ? 'good' : tally.possible ? 'risk' : 'lost';
  return {
    window,
    bay: MINI_LANDING_TEXT.bay(bayShown(state), BAY_SLOTS),
    down: MINI_LANDING_TEXT.down(down, landing.pods.length),
    onTarget: { text: `${tone === 'lost' ? '☆' : '★'} ${LANDING_HUD_TEXT.onTarget(tally.onTargetPods, tally.pods)}`, tone },
  };
}

// The LZ a touchdown float rises from on the plot and the strip (`+200 LANDED · LZ-A`): its bracket, else the landing
// point itself (off-site).
export function lzOf(lzs: readonly LzState[], label: string | null): LzState | null {
  return label === null ? null : lzs.find((lz) => lz.label === label) ?? null;
}
