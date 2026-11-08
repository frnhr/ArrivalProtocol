// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §2.8, §6.2). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { AssignRefusal, BadGround, SurveyRecord, SurveySite, SurveyState } from '@/types/survey';
import type { EffectiveVersion } from '@/types/skill';
import { onGameTick, onPostTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { say } from '@systems/say';
import { releaseThread, reserveThread, holdsThread, threadsTotal, threadsBusy } from '@systems/ops-core';
import { surveyRecordOf, surveyVersion, mappedPct, candidatesFound, lzSiteOf, lzOnSite } from '@state/survey-selectors';
import { sweptCells, swathHalfRad, surveyRunning, surveyWantsThread, cellOf, assignRefusal, dropSwathOn } from '@systems/survey-model';
import { getDropSolution } from '@systems/drop-cache';
import { SWATH_TEXT, WIDTH_WORD } from '@data/swath-text';
import { SURVEY_TEXT, siteLabel } from '@data/survey-text';
import { SURVEY_RATE_VERSION, SURVEY_SWEEP_VERSION, SURVEY_KEEP_FREE_THREADS, SURVEY_CELLS } from '@data/tuning';

// The survey machine (01-landing §3.13, 03-skills §3.9; plan §2.8): it maps the swath under the ship from the first flight
// tick after the boot, finds and rates the sites, holds a yieldable Core thread at v1–v2 (R8), and moves an LZ onto a site
// the kid picks (assignSite).
// • All its state is state.landing.survey. Whether it holds a thread is `claimed`, reconciled each tick with ops-core
//   holdsThread(SURVEY_THREAD_OWNER): AUTOBURN's and AUTODROP's preempting claims may take it (R8), and then it claims again
//   once a spare one frees. Its one module variable (plan §2.3, review m3) is `lastRunning`, the last 'survey-state' it
//   emitted, reset with the world: an emit "on a change" needs the last state, and a saved field for it would be a save change.
// • In the LANDING, v2+ also maps a swath around the drop dot (OPEN-DECISIONS 52, a deviation from 01 §3.13: "the
//   sensors look where the pods will go"), as wide as the ship's; v1 maps under the ship only. The thread rules are the same.
// • Two tick hooks: the game tick maps (it knows the game time the tick covered: a step of a period or more, a long SKIP,
//   maps the whole rim); the post tick, which runs in every phase, reconciles the thread, puts the machine at rest outside a
//   mapping tick (`lastRad` null), says CONTROL's boot quip at the first flight tick and emits 'survey-state' on a change.
// • The touchdown reveal (R5) listens on 'pod-landed': the first pod down on a bad ground nobody knew shows it, whether or
//   not SURVEY is aboard. landing.ts works out the echo's tail (`· LZ-B IS WET`) before the event.
// • Lines (R21): CONTROL's boot quip, its reveal quip (once per bad site: `reveals` keeps each once) and, at the first move,
//   `You moved LZ-B? Bold! :)`. The TERMINAL types the first candidate found, a wreck, a v2 reveal and PLANET MAPPED; every
//   other find only emits (the SITES window pings), so a seven-site planet is not seven lines.

// Its Core thread's owner (ops-core reserveThread(SURVEY_THREAD_OWNER, { yieldable: true })).
export const SURVEY_THREAD_OWNER = 'survey';

// The skills SURVEY steps aside for (R8 as the lead corrected it, review M1): while either holds a thread SURVEY holds none, so
// a skill's claim never adds a second thrust cut (each busy thread costs REACTOR_THREAD_SHARE) nor a second thread. ops-core's
// preempting claim takes SURVEY's thread when it holds one; this keeps SURVEY from claiming a spare one beside the skill.
// Their owners as autoburn.ts and autodrop.ts reserve them.
const STEP_ASIDE_FOR = ['autoburn', 'autodrop'] as const;
const skillHoldsThread = (): boolean => STEP_ASIDE_FOR.some((owner) => holdsThread(owner));

const OFF_KEY = 'off|0';
let lastRunning: string = OFF_KEY;

// --- The thread (R8, review m4) ---------------------------------------------------------------------------------------------

// Makes `claimed` true exactly when SURVEY holds its thread, and claims or lets go as the rule says: it wants one while it
// would map below v3 and neither AUTOBURN nor AUTODROP holds a thread (review M1: it steps aside for them); it claims only
// when SURVEY_KEEP_FREE_THREADS stay free after the claim (never the kid's last thread), and lets go of a held one when the
// Core runs fewer threads than that leaves room for (a worn Core down to one thread). threadsTotal() needs the AI Core in
// memory, so it is asked only while SURVEY wants a thread (a live flight or landing).
function syncThread(store: Store<GameState>): void {
  const holds = holdsThread(SURVEY_THREAD_OWNER);
  const wants = surveyWantsThread(store.getState()) && !skillHoldsThread();
  let claimed = holds;
  if (!wants) {
    if (holds) releaseThread(SURVEY_THREAD_OWNER);
    claimed = false;
  } else if (holds) {
    if (threadsTotal() < 1 + SURVEY_KEEP_FREE_THREADS) {
      releaseThread(SURVEY_THREAD_OWNER);
      claimed = false;
    }
  } else if (threadsTotal() - threadsBusy() >= 1 + SURVEY_KEEP_FREE_THREADS) {
    if (!reserveThread(SURVEY_THREAD_OWNER, { yieldable: true })) throw new Error('survey: no thread although one was free');
    claimed = true;
  }
  if (store.getState().landing.survey.claimed !== claimed) store.update((draft) => { draft.landing.survey.claimed = claimed; });
}

// --- Mapping, finding, rating (plan §2.8 steps 3–6) -------------------------------------------------------------------------

// The ship's angle over the planet (world radians), its sense of travel, and whether a step of `dtWorld` game seconds went
// round at least once (an ellipse's period; a hyperbola never does).
function overhead(state: Readonly<GameState>, dtWorld: number): { rad: number; dir: 1 | -1; fullTurn: boolean } {
  const { x, y, vx, vy } = state.orbit;
  const mu = state.level.planet.mu;
  const r = Math.hypot(x, y);
  const energy = (vx * vx + vy * vy) / 2 - mu / r;
  let fullTurn = false;
  if (energy < 0) {
    const a = -mu / (2 * energy);
    fullTurn = dtWorld >= 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  }
  return { rad: Math.atan2(y, x), dir: x * vy - y * vx >= 0 ? 1 : -1, fullTurn };
}

function mapTick(store: Store<GameState>, dtWorld: number): void {
  syncThread(store);
  const state = store.getState();
  if (surveyRunning(state) !== 'running') return;
  const version = surveyVersion(state);
  const { survey } = state.landing;
  const { rad, dir, fullTurn } = overhead(state, dtWorld);
  const swath = swathHalfRad(version);
  const from = survey.lastRad ?? rad;
  const swept = new Set(sweptCells(from, rad, dir, swath, fullTurn));
  // OPEN-DECISIONS 52: in the LANDING, v2+ also maps the same swath around the drop dot ("the sensors look where the pods will
  // go"): the dot leads the ship by about 80° in a landing orbit, so an LZ the approach missed is rated before its first
  // window, not after it. The dot's sweep this tick is the ship's, shifted by the dot's lead now (it changes slowly), so no
  // second angle is kept.
  const dotRad = dropSwathOn(state) ? getDropSolution()?.dot?.rad ?? null : null;
  if (dotRad !== null) {
    const lead = dotRad - rad;
    for (const cell of sweptCells(from + lead, dotRad, dir, swath, fullTurn)) swept.add(cell);
  }
  const cells = [...swept].filter((cell) => !survey.mapped[cell]);
  if (cells.length === 0 && survey.ranAt >= version) {
    store.mutate((draft) => { draft.landing.survey.lastRad = rad; });
    return;
  }
  store.update((draft) => {
    const slice = draft.landing.survey;
    for (const cell of cells) slice.mapped[cell] = true;
    slice.lastRad = rad;
    slice.ranAt = Math.max(slice.ranAt, version) as EffectiveVersion;
  });
  if (cells.length > 0) afterMapping(store);
}

// Finds what the mapped cells now cover, rates what v2+ has seen (R11: latched), reveals a bad ground an LZ stands on, and
// says PLANET MAPPED at the last cell. Then the events and the lines, outside the update.
function afterMapping(store: Store<GameState>): void {
  const state = store.getState();
  const { survey } = state.landing;
  const version = surveyVersion(state);
  const found = survey.sites.filter((site) => !site.found && survey.mapped[cellOf(site.centreRad)] === true);
  const foundIds = new Set(found.map((site) => site.id));
  // Review m6: v2 rates only while SURVEY works (running, or done with the rim mapped): a PAUSE, a wait for a spare thread or
  // a paused clock stop the rating with the mapping.
  const running = surveyRunning(state);
  const rated = version >= SURVEY_RATE_VERSION && (running === 'running' || running === 'done')
    ? survey.sites.filter((site) => (site.found || foundIds.has(site.id)) && !site.groundKnown)
    : [];
  const reveals = rated.flatMap((site) => {
    const lz = lzOnSite(state.landing, site.id);
    return lz !== null && site.ground !== 'flat' && !survey.reveals.some((reveal) => reveal.site === site.id)
      ? [{ lz, site, ground: site.ground as BadGround }] : [];
  });
  const firstCandidate = survey.lines.firstFind ? null : found.find((site) => site.kind === 'candidate') ?? null;
  const allMapped = survey.mapped.every(Boolean);
  const sayMapped = allMapped && !survey.lines.mapped;
  if (found.length === 0 && rated.length === 0 && !sayMapped) return;
  store.update((draft) => {
    const slice = draft.landing.survey;
    for (const site of slice.sites) {
      if (foundIds.has(site.id)) site.found = true;
      if (rated.some((one) => one.id === site.id)) site.groundKnown = true;
    }
    for (const reveal of reveals) slice.reveals.push({ site: reveal.site.id, by: 'survey' });
    if (firstCandidate !== null) slice.lines.firstFind = true;
    if (sayMapped) slice.lines.mapped = true;
  });
  for (const site of found) {
    emit('site-found', { siteId: site.id, kind: site.kind, first: site === firstCandidate });
    if (site === firstCandidate) {
      say('mind-sys', SWATH_TEXT.terminal.found(siteLabel(site), SURVEY_TEXT.room(site.roomPods), WIDTH_WORD[site.width]), { critical: true });
    }
    // The wreck's own line names it by its number (`SITE 4 IS WRECKAGE · …`): its label already says WRECKAGE.
    if (site.kind === 'wreck') say('mind-sys', SWATH_TEXT.terminal.wreck(siteLabel({ kind: 'candidate', number: site.number })), { critical: true });
  }
  for (const site of rated) emit('site-rated', { siteId: site.id, ground: site.ground });
  for (const reveal of reveals) {
    emit('site-revealed', { lz: reveal.lz, siteId: reveal.site.id, ground: reveal.ground, by: 'survey' });
    say('mind-sys', SWATH_TEXT.terminal.revealed(reveal.lz, reveal.ground), { critical: true });
    // Review m7: CONTROL's quip is about CONTROL's own bad guess; a bad site the kid moved onto gets the TERMINAL line only.
    if (reveal.site.kind === 'guess') say('control', SWATH_TEXT.control.reveal(reveal.lz, reveal.ground), { critical: true });
  }
  if (sayMapped) {
    // Done: the thread goes back now (the post tick would on its next look), and the line once.
    syncThread(store);
    say('mind-sys', SWATH_TEXT.terminal.mapped(candidatesFound(store.getState().landing.survey)), { critical: true });
  }
}

// --- The touchdown reveal (R5) ----------------------------------------------------------------------------------------------

function touchdownReveal(store: Store<GameState>, lz: string | null): void {
  if (lz === null) return;
  const state = store.getState();
  if (state.landing.survey.site !== 'poor') return;
  const site = lzSiteOf(state.landing, lz);
  if (site === null) throw new Error(`survey: ${lz} stands on no site on a POOR planet`);
  if (site.ground === 'flat' || site.groundKnown) return;
  const ground = site.ground as BadGround;
  const already = state.landing.survey.reveals.some((reveal) => reveal.site === site.id);
  store.update((draft) => {
    const slice = draft.landing.survey;
    slice.sites.find((one) => one.id === site.id)!.groundKnown = true;
    if (!already) slice.reveals.push({ site: site.id, by: 'touchdown' });
  });
  emit('site-revealed', { lz, siteId: site.id, ground, by: 'touchdown' });
  // Review m7: only on CONTROL's guess; on a site the kid moved onto, the echo's tail (`· LZ-B IS WET`) says it.
  if (!already && site.kind === 'guess') say('control', SWATH_TEXT.control.reveal(lz, ground), { critical: true });
}

// --- The post tick: the thread, at rest, CONTROL's boot quip, 'survey-state' ------------------------------------------------

function postTick(store: Store<GameState>): void {
  syncThread(store);
  const state = store.getState();
  const { survey } = state.landing;
  if (survey.site !== 'poor') {
    if (lastRunning !== OFF_KEY) { lastRunning = OFF_KEY; emit('survey-state', { running: 'off', version: 0 }); }
    return;
  }
  const running = surveyRunning(state);
  if (running !== 'running' && survey.lastRad !== null) store.mutate((draft) => { draft.landing.survey.lastRad = null; });
  // R11: while SURVEY works at v2+, every site it found is rated, mapped this tick or before (a site found at v1, rated once a
  // REPAIR brings v2 back, whether or not anything is left to map). Review m6: works = running, or done.
  if (isLivePhase(state) && surveyVersion(state) >= SURVEY_RATE_VERSION && (running === 'running' || running === 'done')
    && survey.sites.some((site) => site.found && !site.groundKnown)) {
    afterMapping(store);
  }
  // CONTROL's boot quip (R21): at the first flight tick of a POOR planet, SURVEY aboard or not.
  if (!survey.lines.controlBoot && state.run.phase === 'flight' && !state.clock.paused) {
    store.update((draft) => { draft.landing.survey.lines.controlBoot = true; });
    say('control', SWATH_TEXT.control.boot, { critical: true });
  }
  const version = surveyVersion(state);
  const key = `${running}|${version}`;
  if (key !== lastRunning) {
    lastRunning = key;
    emit('survey-state', { running, version });
  }
}

// Mounted by main.ts right after mountResidents (and by tests/unit/wp6/harness6.ts), after the landing and the ops core.
// Returns the unmount.
export function mountSurvey(store: Store<GameState>): () => void {
  const offGame = onGameTick((dtWorld) => mapTick(store, dtWorld));
  const offPost = onPostTick(() => postTick(store));
  const offLanded = on('pod-landed', ({ lz }) => touchdownReveal(store, lz));
  const offReset = onWorldReset('survey', () => { lastRunning = OFF_KEY; }, () => ({ lastRunning }));
  return () => {
    offGame();
    offPost();
    offLanded();
    offReset();
    lastRunning = OFF_KEY;
  };
}

// --- Assigning (R10) and the PAUSE (R7) -------------------------------------------------------------------------------------

// Moves the LZ `lz` onto the site `siteId` (R10): survey-model.ts assignRefusal first (its refusal is returned and nothing
// changes), then in one update the LZ takes the site's centre, half-width, widthKm, ground and id, sitesRev and moves grow
// (the move names the site it left: review M7), and 'lz-moved' is emitted; CONTROL's `You moved LZ-B? Bold! :)` at the
// ship's first move. Called by the SITES window's pill and __ap.survey.set.
export function assignSite(store: Store<GameState>, lz: string, siteId: string): AssignRefusal | null {
  const refusal = assignRefusal(store.getState(), lz, siteId);
  if (refusal !== null) return refusal;
  const state = store.getState();
  const from = state.landing.lzs.find((one) => one.label === lz)!.site;
  if (from === null) throw new Error(`assignSite: ${lz} stands on no site on a POOR planet`);
  const site: SurveySite = state.landing.survey.sites.find((one) => one.id === siteId)!;
  const firstMove = !state.landing.survey.lines.controlMoved;
  store.update((draft) => {
    const at = draft.landing.lzs.find((one) => one.label === lz)!;
    at.centreRad = site.centreRad;
    at.halfWidthRad = site.halfWidthRad;
    at.widthKm = site.widthKm;
    at.ground = site.ground;
    at.site = site.id;
    draft.landing.sitesRev++;
    draft.landing.survey.moves.push({ lz, from, site: site.id });
    draft.landing.survey.lines.controlMoved = true;
  });
  emit('lz-moved', { lz, from, to: site.id });
  if (firstMove) say('control', SWATH_TEXT.control.moved(lz), { critical: true });
  return null;
}

// The SITES header's [ PAUSE ] / [ RESUME ] (R7): flips survey.paused, and the thread goes back (or is claimed) at once.
// Only on a POOR planet (the SITES window shows nowhere else).
export function toggleSurveyPause(store: Store<GameState>): void {
  if (store.getState().landing.survey.site !== 'poor') throw new Error('toggleSurveyPause: a GOOD planet has no survey to pause');
  store.update((draft) => { draft.landing.survey.paused = !draft.landing.survey.paused; });
  syncThread(store);
}

// The ship is ending (run.ts endShip, after the landing's tally, before residentShipEnd; plan R20): the machine at rest
// (its thread released, `claimed` false, `lastRad` null: the codec reads SHIP DONE's slice so), and the ship's record (null
// on a GOOD planet; state/survey-selectors.ts surveyRecordOf's).
export function surveyShipEnd(store: Store<GameState>): SurveyRecord | null {
  releaseThread(SURVEY_THREAD_OWNER);
  const { survey } = store.getState().landing;
  if (survey.claimed || survey.lastRad !== null) {
    store.update((draft) => {
      draft.landing.survey.claimed = false;
      draft.landing.survey.lastRad = null;
    });
  }
  return surveyRecordOf(store.getState().landing);
}

// The Skills row's status (skills.ts SKILL_ROW_HOOKS.survey; words in data/swath-text.ts SWATH_TEXT.status), read every tick:
// `MAPPING 46% · HOLDS A THREAD` (`· NO THREAD (v3)`), `WAITS FOR A SPARE THREAD`, `PAUSED · 46%`, `DONE · 6 SITES`, `SITE DATA
// GOOD · IDLE` (R6). null (the plain row: its version, OFF or GONE) when SURVEY does not work, and outside a flight or a
// landing that maps.
export function surveyStatus(state: Readonly<GameState>): { text: string; tone: 'good' | 'warn' } | null {
  const version = surveyVersion(state);
  if (version === 0) return null;
  const { survey } = state.landing;
  if (survey.site === 'good') return { text: SWATH_TEXT.status.goodIdle, tone: 'good' };
  const pct = mappedPct(survey);
  switch (surveyRunning(state)) {
    case 'done': return { text: SWATH_TEXT.status.done(candidatesFound(survey)), tone: 'good' };
    case 'paused': return { text: SWATH_TEXT.status.paused(pct), tone: 'warn' };
    case 'waiting': return { text: SWATH_TEXT.status.waits, tone: 'warn' };
    case 'running':
      return { text: version >= SURVEY_SWEEP_VERSION ? SWATH_TEXT.status.mappingFree(pct) : SWATH_TEXT.status.mapping(pct), tone: 'good' };
    case 'off': return null;
  }
}

// --- Debug bodies (debug.ts __ap.survey; the lead owns the hooks, plan §2.15) -----------------------------------------------

// __ap.survey(): what the machine holds, as data.
export interface SurveyDebug {
  site: SurveyState['site'];
  sites: SurveyState['sites'];
  mappedPct: number;
  paused: boolean;
  claimed: boolean;
  ranAt: EffectiveVersion;
  moves: SurveyState['moves'];
  reveals: SurveyState['reveals'];
  version: EffectiveVersion;
}

export function surveyDebug(state: Readonly<GameState>): SurveyDebug {
  const survey = structuredClone(state.landing.survey);
  return {
    site: survey.site, sites: survey.sites, mappedPct: mappedPct(survey), paused: survey.paused, claimed: survey.claimed, ranAt: survey.ranAt,
    moves: survey.moves, reveals: survey.reveals, version: surveyVersion(state),
  };
}

// __ap.survey.map(pct): marks cells from the ship's angle onward (its sense of travel) until `pct` of the rim is mapped, and
// finds and rates as the tick would (rating at the version SURVEY works at now). A POOR planet only.
export function mapNow(store: Store<GameState>, pct: number): void {
  if (!(pct >= 0 && pct <= 100)) throw new Error(`__ap.survey.map(${pct}): a share of the rim is 0..100`);
  const state = store.getState();
  if (state.landing.survey.site !== 'poor') throw new Error('__ap.survey.map: a GOOD planet has no survey');
  const { rad, dir } = overhead(state, 0);
  const want = Math.ceil((pct / 100) * SURVEY_CELLS - 1e-9);
  store.update((draft) => {
    const mapped = draft.landing.survey.mapped;
    const start = cellOf(rad);
    for (let step = 0; step < SURVEY_CELLS && mapped.filter(Boolean).length < want; step++) {
      mapped[(((start + dir * step) % SURVEY_CELLS) + SURVEY_CELLS) % SURVEY_CELLS] = true;
    }
  });
  afterMapping(store);
}
