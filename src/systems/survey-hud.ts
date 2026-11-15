// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §2.14, §6.2): SURVEY's view models, pure,
// which the painters (SitesWindow, plot-survey on the NAV PLOT, GroundTrack through landing-hud, the SHIP CARD through
// desk.ts, TRAINING's AHEAD line through training-model.ts, the LANDING REPORT through landing-report.ts) read. The
// FOUNDATION wrote the final signatures; SITES widened the models' fields. No module state (plan §2.3). Words are
// data/sites-text.ts's (and data/survey-text.ts's labels and refusals). They paint STATE: what SWATH's machine wrote into
// landing.survey, and its pure readers (survey-model.ts surveyRunning, swathHalfRad, siteStars, assignableLzs).
import type { GameState } from '@state/schema';
import type { LzState } from '@/types/landing';
import type { SurveySite, SurveyState, BadGround, AssignRefusal } from '@/types/survey';
import { siteDataOf, SURVEY_BUILT } from '@data/survey';
import { siteLabel, SURVEY_TEXT } from '@data/survey-text';
import { SITES_TEXT as T } from '@data/sites-text';
import { COLONISTS_PER_POD, SITES_RIM_BAR_CELLS, SURVEY_SWEEP_VERSION } from '@data/tuning';
import { lzLetter } from '@data/survey-sites';
import { surveyVersion, mappedPct, lzSiteOf, siteVisible, lzOnSite, candidatesFound, surveyNetOutcome } from '@state/survey-selectors';
import {
  surveyRunning, swathHalfRad, siteStars, assignableLzs, dropSwathOn, guessTell, openRefusal, openOffered, nextLzLabel,
  type SiteStars, type OpenRefusal,
} from '@systems/survey-model';
import { lzOpened } from '@systems/landing-rules';
import { SURVEY_OPEN_MAX_LZS } from '@data/tuning';
import { getDropSolution } from '@systems/drop-cache';
import { shipSummaryAt } from '@systems/map-run';
import { openBranchesAt } from '@systems/skill-tree';
import { visitNow, fileLevel } from '@systems/skill-levels';

const TAU = 2 * Math.PI;

// An arc of the rim in world radians (from < to; `to` may run past 2π): a mapped or unmapped stretch, a swath's edges.
export interface RimArc {
  fromRad: number;
  toRad: number;
}

// A free site's dashed bracket (look 'candidate', landing-hud.ts BracketLook) on the GROUND TRACK and the NAV PLOT: world
// angles, its label (`SITE 4`, `SITE 4 ★★★`). landing-hud.ts groundTrackModel lays them onto the overview line and the strip.
export interface SurveyBracket {
  site: string;           // the SurveySite id (a click selects it in SITES)
  centreRad: number;
  halfWidthRad: number;
  label: string;
  look: 'candidate' | 'wreck' | 'bad';   // a site to take, the wreck, a site known to be ROCKY or WET
}

// --- Shared readers ---------------------------------------------------------------------------------------------------

// The survey of a planet that plays POOR now, else null (a GOOD planet: SITES paints nothing).
function poorSurvey(state: Readonly<GameState>): Readonly<SurveyState> | null {
  return state.landing.survey.site === 'poor' ? state.landing.survey : null;
}

// The rim's arcs whose cells are (want = true) or are not (false) mapped, merged across the cells' 0 rad seam (an arc may
// then run past 2π). The whole rim as one arc when every cell agrees.
export function cellArcs(mapped: readonly boolean[], want: boolean): RimArc[] {
  const n = mapped.length;
  if (n === 0 || !mapped.includes(want)) return [];
  if (mapped.every((cell) => cell === want)) return [{ fromRad: 0, toRad: TAU }];
  const step = TAU / n;
  const arcs: RimArc[] = [];
  for (let i = 0; i < n; i++) {
    if (mapped[i] !== want || mapped[(i - 1 + n) % n] === want) continue;
    let last = i;
    while (mapped[(last + 1) % n] === want) last++;
    arcs.push({ fromRad: i * step, toRad: (last + 1) * step });
  }
  return arcs;
}

// The sites no LZ stands on that SITES shows: the candidates and the wreck once found, and a guess an LZ moved off (CONTROL's
// guesses stay sites, plan R10), in rim order.
export function freeSites(state: Readonly<GameState>): SurveySite[] {
  const survey = poorSurvey(state);
  if (survey === null) return [];
  return survey.sites
    .filter((site) => lzOnSite(state.landing, site.id) === null && siteVisible(site))
    .sort((a, b) => a.centreRad - b.centreRad);
}

// What is known of a site's ground, as the rows show it: `FLAT ★★★`, `ROCKY ✕`, `GROUND ?` (SURVEY aboard, not rated: OFF by
// damage too, review m1), or `UNSURVEYED` (no SURVEY.skl aboard: CONTROL's guess, as 01 §3.13 flags it).
export interface GroundShown {
  word: string;
  known: 'flat' | BadGround | null;
  stars: SiteStars;               // 0 while unknown (and a wreck's)
}

function groundShown(state: Readonly<GameState>, site: Readonly<SurveySite>, surveying: boolean): GroundShown {
  if (!site.groundKnown) {
    // Slice 8 (OPEN-DECISIONS 53): a guess the swath passed reads v1's rough tell, `FLAT ?` or `ROUGH ?`, still unrated.
    const tell = guessTell(state, site);
    if (tell !== null) return { word: tell === 'rough' ? T.row.tellRough : T.row.tellFlat, known: null, stars: 0 };
    return { word: surveying || site.kind !== 'guess' ? T.row.groundUnknown : T.row.unsurveyed, known: null, stars: 0 };
  }
  const stars = siteStars(site);
  if (site.ground === 'flat') return { word: T.row.flat(stars), known: 'flat', stars };
  return { word: T.row.bad(site.ground), known: site.ground, stars };
}

const lookOf = (site: Readonly<SurveySite>): SurveyBracket['look'] =>
  site.kind === 'wreck' ? 'wreck' : site.groundKnown && site.ground !== 'flat' ? 'bad' : 'candidate';

// --- The GROUND TRACK ---------------------------------------------------------------------------------------------------

// What can be done with a free site now (playtest 1, Fran's note 18): an LZ can move onto it, it can be opened as a new LZ
// (the label it would take), or neither.
export type SiteAction = { kind: 'move' } | { kind: 'open'; lz: string } | null;

export function siteAction(state: Readonly<GameState>, site: Readonly<SurveySite>): SiteAction {
  if (site.kind === 'wreck' || state.landing.survey.site !== 'poor') return null;
  if (assignableLzs(state, site.id).some((one) => one.refusal === null)) return { kind: 'move' };
  return openRefusal(state, site.id) === null ? { kind: 'open', lz: nextLzLabel(state) } : null;
}

// A free site's label on the GROUND TRACK and the NAV PLOT: its name (rated: `SITE 4 ★★★`), with what it is for while
// something can be done with it (`SITE 4 · MOVE AN LZ HERE`, `SITE 4 ★★★ · OPEN AS LZ-D`) and its ground is not known bad;
// the wreck's `WRECK`.
function siteBracketLabel(state: Readonly<GameState>, site: Readonly<SurveySite>, rated: boolean): string {
  if (site.kind === 'wreck') return T.track.wreck;
  const name = rated && site.groundKnown ? T.track.rated(siteLabel(site), siteStars(site)) : siteLabel(site);
  // A site known ROCKY or WET is drawn as bad: its label invites nothing (its SITES pills still offer what it can take).
  if (site.groundKnown && site.ground !== 'flat') return name;
  const action = siteAction(state, site);
  if (action === null) return name;
  return action.kind === 'move' ? T.track.moveHere(name) : T.track.openHere(name, action.lz);
}

// The GROUND TRACK's candidate brackets (the free sites; plan §2.14): `SITE 4`, rated `SITE 4 ★★★`, the wreck's `WRECK`, with
// what the site is for while it is for something (siteBracketLabel).
export function surveyGroundBrackets(state: Readonly<GameState>): SurveyBracket[] {
  return freeSites(state).map((site) => ({
    site: site.id, centreRad: site.centreRad, halfWidthRad: site.halfWidthRad, look: lookOf(site),
    label: siteBracketLabel(state, site, true),
  }));
}

// The rim not yet mapped (drawn `░` on the GROUND TRACK: landing-hud.ts terrainStretches' `unmapped`, and the overview
// line's planet.unmapped), as any arcs (landing-hud splitRimArcs cuts them, review M4): the whole rim before SURVEY maps
// (or with none aboard). None on a GOOD planet.
export function surveyUnmapped(state: Readonly<GameState>): RimArc[] {
  const survey = poorSurvey(state);
  return survey === null ? [] : cellArcs(survey.mapped, false);
}

// --- The NAV PLOT -------------------------------------------------------------------------------------------------------

// An LZ's mark on the plot: its geometry, the ground glyph (`?` until known, `✕` once bad, none once known FLAT), and in
// FLIGHT its own outline and name (`LZ-B ?`; in LANDING the landing layer draws the bracket and its name).
export interface SurveyPlotLz {
  lz: string;
  centreRad: number;
  halfWidthRad: number;
  glyph: string | null;
  bad: boolean;
  label: string | null;           // FLIGHT only
}

// A swath SURVEY maps now: ±halfRad around a world angle (`at`: under the ship, or around the drop dot in the LANDING at v2+).
export interface SurveyWedge {
  at: 'ship' | 'dot';
  centreRad: number;
  halfRad: number;
}

// The NAV PLOT's survey layer (plot-survey.ts, in flight and landing on POOR planets, under the landing layer): the swaths'
// wedges while SURVEY maps (±swath under the ship; twice as wide at v3), the mapped and unmapped rim, the free sites' dashed
// brackets, the LZs' `?` and `✕`. null: nothing drawn (a GOOD planet, or another phase).
export interface SurveyPlotModel {
  wedges: SurveyWedge[];
  mapped: RimArc[];
  unmapped: RimArc[];
  brackets: SurveyBracket[];
  lzs: SurveyPlotLz[];
}

// `dotRad`: the drop dot's angle (systems/drop-cache.ts getDropSolution, read by default; a suite passes its own): in the LANDING
// at v2+ SURVEY also maps a swath around it (survey-model.ts dropSwathOn, OPEN-DECISIONS 52), drawn as a second wedge.
export function surveyPlotModel(
  state: Readonly<GameState>, dotRad: number | null = state.run.phase === 'landing' ? getDropSolution()?.dot?.rad ?? null : null,
): SurveyPlotModel | null {
  const survey = poorSurvey(state);
  const phase = state.run.phase;
  if (survey === null || (phase !== 'flight' && phase !== 'landing')) return null;
  const running = surveyRunning(state);
  const halfRad = running === 'running' ? swathHalfRad(surveyVersion(state)) : 0;
  const lzs = state.landing.lzs.map((lz): SurveyPlotLz => {
    const site = lzSiteOf(state.landing, lz.label);
    const bad = site !== null && site.groundKnown && site.ground !== 'flat';
    const glyph = site === null || !site.groundKnown ? T.plot.unknown : bad ? T.plot.bad : null;
    return {
      lz: lz.label, centreRad: lz.centreRad, halfWidthRad: lz.halfWidthRad, glyph, bad,
      label: phase === 'flight' ? T.plot.lz(lz.label, glyph ?? '') : null,
    };
  });
  return {
    wedges: halfRad <= 0 ? [] : [
      { at: 'ship', centreRad: Math.atan2(state.orbit.y, state.orbit.x), halfRad },
      ...(dotRad !== null && dropSwathOn(state) ? [{ at: 'dot' as const, centreRad: dotRad, halfRad }] : []),
    ],
    mapped: cellArcs(survey.mapped, true),
    unmapped: cellArcs(survey.mapped, false),
    brackets: freeSites(state).map((site) => ({
      site: site.id, centreRad: site.centreRad, halfWidthRad: site.halfWidthRad, look: lookOf(site),
      label: siteBracketLabel(state, site, false),
    })),
    lzs,
  };
}

// --- The SHIP CARD and the AHEAD line (the desk) ------------------------------------------------------------------------

// The SHIP CARD's SITE DATA row for `slot` (desk.ts cardModel's reserved 'site' row, R15): `SITE DATA · GOOD`, `POOR ·
// ARRIVAL CONTROL GUESSED` (warn), and after the ship `POOR · LZ-B MOVED` (good) / `SURVEYED, KEPT` / `NOT SURVEYED` (review
// m11: a POOR ship played before v6 has no record, and reads NOT SURVEYED, never GOOD). null: no row.
export interface SurveyCardRow {
  label: string;
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

export function surveyCardRow(state: Readonly<GameState>, slot: number): SurveyCardRow | null {
  const map = state.run.map;
  // The row is POOR site data's (plan R19: the card rows wait on SURVEY_BUILT.poor with the rest of it).
  if (!SURVEY_BUILT.poor) return null;
  const row = (value: string, tone: SurveyCardRow['tone'] = 'plain'): SurveyCardRow => ({ label: T.card.label, value, tone });
  const site = siteDataOf({ site: shipSummaryAt(map, slot).reserved?.site ?? 'good' });
  if (site === 'good') return row(T.card.good);
  const visited = map.route.some((stop) => stop.slot === slot);
  const result = visited ? [...state.run.ships].reverse().find((ship) => ship.slot === slot) ?? null : null;
  if (result === null) return row(T.card.poor, 'warn');
  const record = result.survey;
  if (record === null || record === undefined) return row(T.card.notSurveyed);
  // Review m5: the LZs that ended off their own guess (a move away and back is none), from the record's net outcome.
  const moved = surveyNetOutcome(record).filter((outcome) => outcome.moved).map((outcome) => outcome.lz);
  // C-SITES: an LZ opened on a found site has a row of its own that counts 0 in the ship's tally (landing-rules landingResult).
  const opened = result.lzs.filter((lz) => lz.count === 0).map((lz) => lz.lz);
  if (moved.length > 0 && opened.length > 0) return row(T.card.movedOpened(moved.join(', '), opened.join(', ')), 'good');
  if (opened.length > 0) return row(T.card.opened(opened.join(', ')), 'good');
  if (moved.length > 0) return row(T.card.moved(moved.join(', ')), 'good');
  return record.ranAt > 0 ? row(T.card.kept) : row(T.card.notSurveyed);
}

// TRAINING's AHEAD row's second line for the selected ship `slot` (training-model.ts TrainingModel.aheadSite, R15): `SITE
// DATA POOR · SURVEY FINDS BETTER SITES` when SURVEY's branch is open at this desk, or the unit holds it or is training it,
// else `SITE DATA POOR · ARRIVAL CONTROL GUESSED THE LZs`; null on a GOOD ship or none selected.
export function surveyAheadLine(state: Readonly<GameState>, slot: number | null): string | null {
  const map = state.run.map;
  if (slot === null) return null;
  if (siteDataOf({ site: shipSummaryAt(map, slot).reserved?.site ?? 'good' }) !== 'poor') return null;
  const open = openBranchesAt(state, visitNow(state.run)).includes('survey')
    || fileLevel(state.memory, 'survey') !== null || state.run.skills.pending.some((purchase) => purchase.skill === 'survey');
  return open ? T.ahead.open : T.ahead.closed;
}

// --- The LANDING REPORT -------------------------------------------------------------------------------------------------

// The LANDING REPORT's LZ row suffix for `lz` (landing-report.ts, 01's LZ-row slot): the site it moved to (` · SITE 4`, or
// ` · LZ-A GUESS` for another LZ's guess: review m8), then a bad ground with the pods that landed hard on it (` · ROCKY · 5
// HARD`), or the bad ground alone when it is known and no pod went there. '' on a GOOD planet, or an LZ that stayed on a
// sound guess.
export function surveyLzRowSuffix(state: Readonly<GameState>, lz: string): string {
  const survey = poorSurvey(state);
  if (survey === null) return '';
  const site = lzSiteOf(state.landing, lz);
  if (site === null) return '';
  const ownGuess = site.kind === 'guess' && `LZ-${lzLetter(site.number)}` === lz;
  let suffix = ownGuess ? '' : lzOpened(state.landing, lz) ? T.report.opened(siteLabel(site)) : T.report.site(siteLabel(site));
  if (site.ground !== 'flat') {
    const hard = state.landing.pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.lz === lz
      && record.fate.touchdown.touch === 'hard').length;
    if (hard > 0) suffix += T.report.hard(site.ground, hard);
    else if (site.groundKnown) suffix += T.report.bad(site.ground);
  }
  return suffix;
}

// --- The SITES window ---------------------------------------------------------------------------------------------------

// One row: an LZ (where it stands, its count, its ground) or a free site (its ROOM, WIDTH and ground; a click opens its pills).
export interface SitesRow {
  kind: 'lz' | 'site' | 'wreck';
  key: string;                    // the LZ's label, or the site's id
  site: string | null;            // the site id (an LZ's: the one it stands on)
  text: string;
  ground: GroundShown;
  selectable: boolean;            // a click opens its pills (a free site that is no wreck)
  selected: boolean;
  moved: boolean;                 // an LZ SURVEY moved off CONTROL's guess
}

// A pill under the selected site: an LZ that can take it (`SET AS LZ-B (800)`), or why not, dimmed; then, once the landing
// pins every LZ, the new LZ it can be opened as (`OPEN AS LZ-C (1,200)`: playtest 1, C-SITES). A refused pill still takes a
// click: it flashes `flash` on the strip (`LZ-B HAS PODS DOWN — OPEN SITE 4 AS LZ-C`), so the reason is never only a dim pill.
export interface SitesPill {
  kind: 'move' | 'open';
  lz: string;
  text: string;
  refusal: AssignRefusal | OpenRefusal | null;
  flash: string | null;           // the strip's words for a refused pill; null for one that works
}

export interface SitesWindowModel {
  header: string;
  rim: string;                                // `▓▓▓░░░…`: the rim mapped, SITES_RIM_BAR_CELLS glyphs from 0 rad
  status: string;                             // SURVEY's state and version, or NO SURVEY
  tone: 'good' | 'warn' | 'dim';
  pause: { label: string; paused: boolean; title: string } | null;   // [ PAUSE ] / [ RESUME ] while SURVEY works here
  lzs: SitesRow[];
  sites: SitesRow[];
  empty: string | null;                       // under SITES FOUND while there are none
  pills: SitesPill[];                         // the selected site's
  hint: string | null;                        // how to move an LZ, while a site could take one and none is selected
}

// The pill (or the refusal, in the lead's words) for one LZ and a site.
function pillOf(
  state: Readonly<GameState>, site: Readonly<SurveySite>, lz: Readonly<LzState>, refusal: AssignRefusal | null, open: string | null,
): SitesPill {
  const room = SURVEY_TEXT.room(lz.pods);
  if (refusal === null) return { kind: 'move', lz: lz.label, text: T.pill(lz.label, room), refusal, flash: null };
  // 'taken' names the LZ standing on the site (`SITE 4 IS LZ-A's`); every other refusal the LZ asked about.
  const owner = lzOnSite(state.landing, site.id) ?? lz.label;
  const why = SURVEY_TEXT.refusal[refusal]({
    site: siteLabel(site), lz: refusal === 'taken' ? owner : lz.label, holds: site.roomPods * COLONISTS_PER_POD, needs: lz.pods * COLONISTS_PER_POD,
  });
  // The way out, when the site can be opened instead (`open`: the label it would take).
  const flash = open === null ? T.flash(why) : T.flashOpen(why, siteLabel(site), open);
  return { kind: 'move', lz: lz.label, text: T.pillRefused(lz.label, why), refusal, flash };
}

// The words of an open refusal (OpenRefusal): the site's own are the lead's assign words.
export function openRefusalWords(state: Readonly<GameState>, site: Readonly<SurveySite>, refusal: OpenRefusal): string {
  const words = { site: siteLabel(site), lz: lzOnSite(state.landing, site.id) ?? nextLzLabel(state), holds: site.roomPods * COLONISTS_PER_POD, needs: 0 };
  switch (refusal) {
    case 'closed': case 'offline': case 'not-found': case 'wreck': case 'taken': case 'landing-over':
      return SURVEY_TEXT.refusal[refusal](words);
    case 'lz-cap': return T.openRefusal['lz-cap'](SURVEY_OPEN_MAX_LZS);
    case 'can-move': case 'not-held': case 'falling-under': case 'no-thread':
      return T.openRefusal[refusal];
  }
}

// The OPEN pill for the site, or null when none is offered (survey-model openOffered).
function openPillOf(state: Readonly<GameState>, site: Readonly<SurveySite>): SitesPill | null {
  const refusal = openRefusal(state, site.id);
  if (!openOffered(refusal)) return null;
  const lz = nextLzLabel(state);
  if (refusal === null) return { kind: 'open', lz, text: T.pillOpen(lz, SURVEY_TEXT.room(site.roomPods)), refusal, flash: null };
  const why = openRefusalWords(state, site, refusal);
  return { kind: 'open', lz, text: T.pillRefused(lz, why), refusal, flash: T.flash(why) };
}

// The rim as SITES_RIM_BAR_CELLS glyphs: a glyph is mapped when every cell under it is.
function rimBar(mapped: readonly boolean[]): string {
  if (mapped.length === 0) return '';
  let bar = '';
  for (let i = 0; i < SITES_RIM_BAR_CELLS; i++) {
    const from = Math.floor((i * mapped.length) / SITES_RIM_BAR_CELLS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * mapped.length) / SITES_RIM_BAR_CELLS));
    bar += mapped.slice(from, to).every(Boolean) ? T.window.rimMapped : T.window.rimUnmapped;
  }
  return bar;
}

// SITES's header, rows and the selected site's pills (`selected`: the site id the kid clicked, SitesWindow's; ignored when
// it is no free site). null while it has nothing to show: a GOOD planet, or a phase with no tools view (the desk).
export function sitesWindowModel(state: Readonly<GameState>, selected: string | null = null): SitesWindowModel | null {
  const survey = poorSurvey(state);
  const phase = state.run.phase;
  if (survey === null || !(phase === 'boot' || phase === 'flight' || phase === 'landing' || phase === 'report')) return null;
  const version = surveyVersion(state);
  const surveying = version > 0;
  // Review m1: SURVEY.skl aboard but OFF by damage is no "no SURVEY": the kid needs a REPAIR, and the guesses read GROUND ?.
  const aboard = fileLevel(state.memory, 'survey') !== null;
  const running = surveyRunning(state);
  const pct = mappedPct(survey);
  const allMapped = survey.mapped.length > 0 && survey.mapped.every(Boolean);
  const found = candidatesFound(survey);
  const threadless = version >= SURVEY_SWEEP_VERSION;

  let status: string;
  let tone: SitesWindowModel['tone'] = 'good';
  if (!surveying) { status = aboard ? T.window.status.offline : T.window.status.none; tone = 'warn'; }
  else if (running === 'done' || allMapped) status = T.window.status.done(version, found);
  else if (running === 'running') status = threadless ? T.window.status.sweeping(version) : T.window.status.running(version);
  else if (running === 'waiting') { status = T.window.status.waiting(version); tone = 'warn'; }
  // Review m2: v3 holds no thread, so its pause frees none.
  else if (running === 'paused') { status = threadless ? T.window.status.pausedFree(version) : T.window.status.paused(version); tone = 'warn'; }
  else { status = T.window.status.idle(version); tone = 'dim'; }
  const pausable = surveying && !allMapped && (running === 'running' || running === 'waiting' || running === 'paused');
  const pause = pausable ? {
    label: survey.paused ? T.window.resume : T.window.pause, paused: survey.paused,
    title: threadless ? T.window.pauseTitleFree : T.window.pauseTitle,
  } : null;

  const lzs = state.landing.lzs.map((lz): SitesRow => {
    const site = lzSiteOf(state.landing, lz.label);
    if (site === null) throw new Error(`sitesWindowModel: ${lz.label} stands on no site on a POOR planet`);
    const ground = groundShown(state, site, aboard);
    const where = site.kind === 'guess' ? T.row.guess : siteLabel(site);
    // C-SITES: an opened LZ says so, with its ROOM (its count is the site's room: it was planned to take none).
    const text = lzOpened(state.landing, lz.label)
      ? T.row.lzOpened(lz.label, siteLabel(site), SURVEY_TEXT.room(lz.pods), T.width[site.width], ground.word)
      : T.row.lz(lz.label, where, lz.pods, T.width[site.width], ground.word);
    return {
      kind: 'lz', key: lz.label, site: site.id, text, ground,
      selectable: false, selected: false, moved: site.kind !== 'guess',
    };
  });
  const free = freeSites(state);
  const chosen = free.find((site) => site.id === selected && site.kind !== 'wreck') ?? null;
  const sites = free.map((site): SitesRow => {
    const ground = groundShown(state, site, aboard);
    if (site.kind === 'wreck') {
      return { kind: 'wreck', key: site.id, site: site.id, text: T.row.wreck(siteLabel(site)), ground, selectable: false, selected: false, moved: false };
    }
    return {
      kind: 'site', key: site.id, site: site.id, text: T.row.site(siteLabel(site), SURVEY_TEXT.room(site.roomPods), T.width[site.width], ground.word),
      ground, selectable: true, selected: site.id === chosen?.id, moved: false,
    };
  });
  const openPill = chosen === null ? null : openPillOf(state, chosen);
  const pills = chosen === null ? [] : assignableLzs(state, chosen.id).map(({ lz, refusal }) => {
    const at = state.landing.lzs.find((candidate) => candidate.label === lz);
    if (at === undefined) throw new Error(`sitesWindowModel: assignableLzs named ${lz}, which the landing does not have`);
    return pillOf(state, chosen, at, refusal, openPill?.refusal === null ? openPill.lz : null);
  });
  if (openPill !== null) pills.push(openPill);
  const empty = sites.length > 0 ? null
    : !surveying ? (aboard ? T.window.emptyOffline : T.window.emptyNone) : allMapped ? T.window.emptyDone : T.window.emptyMapping;
  const anyRoom = sites.some((row) => row.kind === 'site');
  // C-SITES: once no LZ can move anywhere but a site can be opened, the hint says so.
  const actions = chosen === null && anyRoom && surveying ? free.map((site) => siteAction(state, site)) : [];
  const hint = chosen !== null || !anyRoom || !surveying ? null
    : !actions.some((action) => action?.kind === 'move') && actions.some((action) => action?.kind === 'open') ? T.window.hintOpen : T.window.hint;
  return {
    header: T.window.header(pct), rim: rimBar(survey.mapped), status, tone, pause, lzs, sites, empty, pills, hint,
  };
}
