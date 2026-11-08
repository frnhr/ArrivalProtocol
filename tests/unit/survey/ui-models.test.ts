// Slice 6, Track SITES (docs/phase3/impl/slice-6-plan.md §7.1): SURVEY's view models (systems/survey-hud.ts), pure, on
// hand-built states: seed 7's CORMORANT (slot 15, POOR: LZ-A on a FLAT guess, LZ-B on a ROCKY one; foundation's Deviations)
// built with both gates raised for the suite (tests/unit/support/survey.ts), its survey slice then written by hand. Under a
// second. It checks:
// • the SITES window: the header's five run states (survey-model.ts surveyRunning, Track SWATH's), the rim strip, the LZ
//   rows (`GUESS`, `UNSURVEYED` with no SURVEY, `GROUND ?` before a rating, `ROCKY ✕` once known), the found sites by what is
//   known (★ by siteStars, the wreck's words), the selection's pills (`SET AS LZ-B (800)`) and the refusals dimmed, written to
//   survey-model.ts assignableLzs' contract (plan §6.3, review M8);
// • the NAV PLOT's model: the mapped and unmapped arcs, the free sites' brackets, the LZs' `?` and `✕`, the wedge's width by
//   version while SURVEY runs (twice as wide at v3);
// • the GROUND TRACK's candidates and unmapped rim, through landing-hud.ts groundTrackModel;
// • the SHIP CARD's SITE DATA row (GOOD, POOR ahead, after the ship: moved, kept, not surveyed, and a pre-v6 record: m11), the
//   AHEAD line (open, closed), the LANDING REPORT's LZ suffixes, and every word at its worst case ≤ 70 (support/words checks
//   the templates; this checks what the models build).
import { check, finish } from '../landing/checks';
import type { GameState, ShipResult } from '@state/schema';
import type { SurveyRecord } from '@/types/survey';
import type { PodFate } from '@/types/landing';
import { createStore } from '@state/store';
import { createInitialState, createSurveyState } from '@state/initial';
import { armShipSlices } from '../support/residents';
import { withSurveyBuilt } from '../support/survey';
import { giveSkillFile } from '../support/skills';
import {
  sitesWindowModel, surveyPlotModel, surveyGroundBrackets, surveyUnmapped, surveyCardRow, surveyAheadLine, surveyLzRowSuffix,
  cellArcs, freeSites,
} from '@systems/survey-hud';
import { surveyRunning, swathHalfRad } from '@systems/survey-model';
import { groundTrackModel } from '@systems/landing-hud';
import { SITES_TEXT } from '@data/sites-text';
import { SURVEY_TEXT } from '@data/survey-text';
import { MAX_LINE_CHARS, SURVEY_CELLS, SITES_RIM_BAR_CELLS } from '@data/tuning';

const SEED = 7;
const CORMORANT = 15;
const VESPER = 11;
const TAU = 2 * Math.PI;

// CORMORANT in flight, POOR, nothing mapped; `edit` writes the rest by hand. Built with both gates up (the slices keep
// what they were built with); the models read the gates too, so every read below runs inside withSurveyBuilt.
function cormorant(edit: (state: GameState) => void = () => {}): GameState {
  return withSurveyBuilt(() => {
    const { run, slices } = armShipSlices(SEED, CORMORANT);
    const state = { ...createInitialState({ seed: SEED }), run: { ...run, phase: 'flight' as const }, ...slices } as GameState;
    edit(state);
    return state;
  });
}
const cellOf = (rad: number): number => Math.floor((((rad % TAU) + TAU) % TAU) / (TAU / SURVEY_CELLS));
// Maps cells [from, to) and marks every site whose centre lies in them found (and rated with `rate`), as SWATH's tick would.
function mapCells(state: GameState, from: number, to: number, rate: boolean): void {
  const survey = state.landing.survey;
  for (let i = from; i < to; i++) survey.mapped[i % SURVEY_CELLS] = true;
  for (const site of survey.sites) {
    if (!survey.mapped[cellOf(site.centreRad)]) continue;
    site.found = true;
    if (rate) site.groundKnown = true;
  }
}
const giveSurvey = (state: GameState, version: 1 | 2 | 3): GameState => {
  const store = createStore(state);
  withSurveyBuilt(() => giveSkillFile(store, 'survey', version));
  return store.getState();
};
const fits = (texts: readonly string[]): string[] => texts.filter((text) => text.length > MAX_LINE_CHARS);
const built = <T>(fn: () => T): T => withSurveyBuilt(fn);

// --- The world under test -----------------------------------------------------------------------------------------------
const base = cormorant();
const sites = base.landing.survey.sites;
const bad = sites.find((site) => site.kind === 'guess' && site.ground !== 'flat');
const wreck = sites.find((site) => site.kind === 'wreck');
const wide = sites.find((site) => site.kind === 'candidate' && site.ground === 'flat' && site.width === 'wide');
check('CORMORANT (seed 7) plays POOR: two guesses, LZ-B on ROCKY ground, a wreck and a WIDE FLAT candidate (the foundation\'s roll)',
  base.landing.survey.site === 'poor' && bad?.id === 'guess-B' && bad.ground === 'rocky' && wreck !== undefined && wide !== undefined,
  sites.map((site) => `${site.id}:${site.ground}:${site.width}`).join(' '));

// --- cellArcs ---------------------------------------------------------------------------------------------------------
{
  const none = Array.from({ length: 8 }, () => false);
  const some = [true, true, false, false, false, true, false, true];
  const arcs = cellArcs(some, true);
  const step = TAU / 8;
  check('cellArcs: nothing mapped is one unmapped turn and no mapped arc', cellArcs(none, true).length === 0
    && cellArcs(none, false).length === 1 && cellArcs(none, false)[0]!.toRad === TAU);
  check('…runs merge across the 0 rad seam (cells 7, 0, 1 are one arc running past 2π), the rest stand alone',
    arcs.length === 2 && Math.abs(arcs[0]!.fromRad - 5 * step) < 1e-9 && Math.abs(arcs[0]!.toRad - 6 * step) < 1e-9
    && Math.abs(arcs[1]!.fromRad - 7 * step) < 1e-9 && Math.abs(arcs[1]!.toRad - 10 * step) < 1e-9, JSON.stringify(arcs));
}

// --- The SITES window ---------------------------------------------------------------------------------------------------
built(() => {
  const none = sitesWindowModel(base);
  check('SITES: null on a GOOD planet and at the desk', sitesWindowModel(cormorant((s) => { s.landing.survey = createSurveyState('good', []); })) === null
    && sitesWindowModel(cormorant((s) => { s.run.phase = 'desk'; })) === null);
  check('…no SURVEY: `NO SURVEY · ARRIVAL CONTROL\'S GUESSES` in the warning tone, MAPPED 0%, an empty rim strip, no PAUSE',
    none !== null && none.status === SITES_TEXT.window.status.none && none.tone === 'warn' && none.header === SITES_TEXT.window.header(0)
    && none.rim === SITES_TEXT.window.rimUnmapped.repeat(SITES_RIM_BAR_CELLS) && none.pause === null, JSON.stringify(none));
  check('…both LZs on CONTROL\'s guesses read `UNSURVEYED` (`LZ-B · GUESS · 4 PODS · WIDE · UNSURVEYED`), no site found',
    none !== null && none.lzs.length === 2 && none.lzs.every((row) => row.ground.word === SITES_TEXT.row.unsurveyed)
    && none.lzs[1]!.text === SITES_TEXT.row.lz('LZ-B', SITES_TEXT.row.guess, 4, 'WIDE', SITES_TEXT.row.unsurveyed)
    && none.sites.length === 0 && none.empty === SITES_TEXT.window.emptyNone, none?.lzs.map((row) => row.text).join(' | '));

  // v1, half the rim mapped from 0 rad: the finds show ROOM and WIDTH, GROUND ?.
  const v1 = giveSurvey(cormorant((s) => mapCells(s, 0, 36, false)), 1);
  const m1 = sitesWindowModel(v1);
  const found1 = v1.landing.survey.sites.filter((site) => site.kind !== 'guess' && site.found);
  check('v1 · half mapped: `MAPPED 50%`, the strip half ▓, every LZ `GROUND ?`',
    m1 !== null && m1.header === SITES_TEXT.window.header(50)
    && m1.rim === SITES_TEXT.window.rimMapped.repeat(SITES_RIM_BAR_CELLS / 2) + SITES_TEXT.window.rimUnmapped.repeat(SITES_RIM_BAR_CELLS / 2)
    && m1.lzs.every((row) => row.ground.word === SITES_TEXT.row.groundUnknown), JSON.stringify(m1?.lzs));
  check('…the sites found in it listed in rim order with ROOM and WIDTH (`SITE 1 · ROOM 1,000 · NARROW · GROUND ?`), selectable',
    m1 !== null && found1.length > 0 && m1.sites.length === found1.length
    && m1.sites.every((row, i) => row.site === [...found1].sort((a, b) => a.centreRad - b.centreRad)[i]!.id && row.ground.known === null)
    && m1.sites.filter((row) => row.kind === 'site').every((row) => row.selectable && /^SITE \d+ · ROOM [\d,]+ · (WIDE|STANDARD|NARROW) · GROUND \?$/.test(row.text)),
    m1?.sites.map((row) => row.text).join(' | '));

  // v2, every cell mapped and rated: ★ and grounds, the bad guess `ROCKY ✕`, the wreck's words.
  const v2 = giveSurvey(cormorant((s) => mapCells(s, 0, SURVEY_CELLS, true)), 2);
  const m2 = sitesWindowModel(v2);
  const lzB = m2?.lzs.find((row) => row.key === 'LZ-B');
  const wreckRow = m2?.sites.find((row) => row.kind === 'wreck');
  const wideRow = m2?.sites.find((row) => row.site === wide?.id);
  check('v2 · all mapped and rated: LZ-B reads `ROCKY ✕` (★ 1), LZ-A `FLAT ★★★`', lzB?.ground.word === SITES_TEXT.row.bad('rocky')
    && lzB.ground.stars === 1 && m2?.lzs[0]?.ground.word === SITES_TEXT.row.flat(3), JSON.stringify(m2?.lzs));
  check('…the WIDE FLAT candidate `FLAT ★★★`, a NARROW FLAT one `FLAT ★★`, the wreck `… · AN OLD POD. NOT OURS.` and not selectable',
    wideRow?.ground.word === SITES_TEXT.row.flat(3)
    && (m2?.sites.filter((row) => row.text.includes('NARROW') && row.ground.known === 'flat').every((row) => row.ground.stars === 2) ?? false)
    && wreckRow !== undefined && !wreckRow.selectable && wreckRow.text.endsWith('AN OLD POD. NOT OURS.'), m2?.sites.map((row) => row.text).join(' | '));
  check('…all mapped: the header says it, no PAUSE, and no `NONE YET` line', m2 !== null && m2.header === SITES_TEXT.window.header(100)
    && m2.pause === null && m2.empty === null && m2.status.includes('PLANET MAPPED'), m2?.status);

  // The header's five run states (survey-model.ts surveyRunning, Track SWATH's), half mapped: each built as the rule reads it.
  const runAt = (version: 2 | 3, edit: (state: GameState) => void): GameState =>
    giveSurvey(cormorant((s) => { mapCells(s, 0, 30, false); edit(s); }), version);
  const candidates = sites.filter((site) => site.kind === 'candidate').length;   // the wreck is no site to land (review m3)
  const cases: { name: string; state: GameState; want: string; tone: string; pause: string | null }[] = [
    { name: 'running (v2, its thread held)', state: runAt(2, (s) => { s.landing.survey.claimed = true; }),
      want: SITES_TEXT.window.status.running(2), tone: 'good', pause: SITES_TEXT.window.pause },
    { name: 'running (v3, no thread)', state: runAt(3, () => {}), want: SITES_TEXT.window.status.sweeping(3), tone: 'good', pause: SITES_TEXT.window.pause },
    { name: 'waiting (v2, no spare thread)', state: runAt(2, () => {}), want: SITES_TEXT.window.status.waiting(2), tone: 'warn', pause: SITES_TEXT.window.pause },
    { name: 'paused', state: runAt(2, (s) => { s.landing.survey.paused = true; }), want: SITES_TEXT.window.status.paused(2), tone: 'warn',
      pause: SITES_TEXT.window.resume },
    { name: 'off (the clock paused)', state: runAt(2, (s) => { s.clock.paused = true; }), want: SITES_TEXT.window.status.idle(2), tone: 'dim', pause: null },
    { name: 'done (after the landing too)', state: runAt(2, (s) => { mapCells(s, 0, SURVEY_CELLS, false); s.run.phase = 'report'; }),
      want: SITES_TEXT.window.status.done(2, candidates), tone: 'good', pause: null },
  ];
  const wrong = cases.filter(({ state, want, tone, pause }) => {
    const model = sitesWindowModel(state);
    return model === null || model.status !== want || model.tone !== tone || (model.pause?.label ?? null) !== pause;
  });
  check(`…the header names SURVEY's state by surveyRunning: ${cases.map((c) => c.name).join(', ')}`, wrong.length === 0,
    wrong.map((c) => `${c.name} → ${surveyRunning(c.state)}: ${sitesWindowModel(c.state)?.status}`).join(' | '));
  const paused = giveSurvey(cormorant((s) => { mapCells(s, 0, 30, false); s.landing.survey.paused = true; }), 2);
  check('…a PAUSE reads `PAUSED · ITS THREAD IS FREE` with `[ RESUME ]` ',
    surveyRunning(paused) === 'paused' && sitesWindowModel(paused)?.status === SITES_TEXT.window.status.paused(2)
    && sitesWindowModel(paused)?.pause?.label === SITES_TEXT.window.resume, `${surveyRunning(paused)} ${JSON.stringify(sitesWindowModel(paused)?.pause)}`);

  // The pills (assignableLzs' contract: every LZ with its refusal, in label order).
  if (wide !== undefined) {
    const pick = sitesWindowModel(v2, wide.id);
    const selectedRow = pick?.sites.find((row) => row.selected);
    check('…a click selects the site: its row marked, the hint gone', selectedRow?.site === wide.id && pick?.hint === null);
    const set = pick?.pills.find((pill) => pill.lz === 'LZ-B');
    check(`…its pills: \`SET AS LZ-B (${SURVEY_TEXT.room(4)})\` for an LZ it can take (assignableLzs)`,
      pick !== null && pick.pills.length === 2 && set?.refusal === null && set.text === SITES_TEXT.pill('LZ-B', SURVEY_TEXT.room(4)),
      JSON.stringify(pick?.pills));
    const landing = cormorant((s) => {
      mapCells(s, 0, SURVEY_CELLS, true);
      s.run.phase = 'landing';
      s.burn.status = 'locked';
      const record = s.landing.pods[0]!;
      record.fate = { kind: 'down', launch: {} as never, touchdown: { place: 'lz', lz: 'LZ-B', points: 100, missKm: null, touch: 'hard', atAi: 0 } } as PodFate;
    });
    const refused = sitesWindowModel(giveSurvey(landing, 2), wide.id)?.pills.find((pill) => pill.lz === 'LZ-B');
    check('…an LZ with a pod down: dimmed with the lead\'s words (`LZ-B ✕ LZ-B HAS PODS DOWN`)', refused?.refusal === 'pods-down'
      && refused.text === SITES_TEXT.pillRefused('LZ-B', SURVEY_TEXT.refusal['pods-down']({ site: 'SITE 5', lz: 'LZ-B', holds: 0, needs: 0 })),
      JSON.stringify(refused));
  }
  check('…a wreck or a site an LZ stands on can\'t be selected (no row marked, no pills)', wreck !== undefined
    && sitesWindowModel(v2, wreck.id)?.pills.length === 0 && !(sitesWindowModel(v2, 'guess-A')?.sites.some((row) => row.selected) ?? true));

  // A moved LZ: its row names the site, its guess becomes a free site again.
  if (wide !== undefined) {
    const moved = giveSurvey(cormorant((s) => {
      mapCells(s, 0, SURVEY_CELLS, true);
      const lz = s.landing.lzs.find((candidate) => candidate.label === 'LZ-B')!;
      Object.assign(lz, { centreRad: wide.centreRad, halfWidthRad: wide.halfWidthRad, widthKm: wide.widthKm, ground: wide.ground, site: wide.id });
      s.landing.sitesRev = 1;
      s.landing.survey.moves.push({ lz: 'LZ-B', from: 'guess-B', site: wide.id });
    }), 2);
    const model = sitesWindowModel(moved);
    const row = model?.lzs.find((candidate) => candidate.key === 'LZ-B');
    check('…LZ-B moved: its row `LZ-B · SITE 5 · 4 PODS · WIDE · FLAT ★★★` (moved), and `LZ-B GUESS` is listed as a site, `ROCKY ✕`',
      row?.moved === true && row.text === SITES_TEXT.row.lz('LZ-B', 'SITE 5', 4, 'WIDE', SITES_TEXT.row.flat(3))
      && model?.sites.some((site) => site.site === 'guess-B' && site.ground.word === SITES_TEXT.row.bad('rocky')) === true
      && !model.sites.some((site) => site.site === wide.id), JSON.stringify(model?.lzs));
  }
  check('every SITES row, header, status and pill fits ≤ 70', [m1, m2, none, sitesWindowModel(v2, wide?.id ?? null)].every((model) => model !== null
    && fits([model.header, model.status, model.rim, ...model.lzs.map((r) => r.text), ...model.sites.map((r) => r.text), ...model.pills.map((p) => p.text)]).length === 0));
});

// --- The NAV PLOT and the GROUND TRACK ----------------------------------------------------------------------------------
built(() => {
  const half = giveSurvey(cormorant((s) => mapCells(s, 0, 36, true)), 2);
  const plot = surveyPlotModel(half);
  check('plot: null on a GOOD planet and outside flight and landing', surveyPlotModel(cormorant((s) => { s.landing.survey = createSurveyState('good', []); })) === null
    && surveyPlotModel(cormorant((s) => { s.run.phase = 'report'; })) === null);
  check('…half mapped from 0 rad: one mapped arc [0, π), one unmapped [π, 2π)', plot !== null && plot.mapped.length === 1
    && Math.abs(plot.mapped[0]!.toRad - Math.PI) < 1e-9 && plot.unmapped.length === 1 && Math.abs(plot.unmapped[0]!.fromRad - Math.PI) < 1e-9);
  const freeIds = freeSites(half).map((site) => site.id);
  check('…the free sites found are its brackets (`SITE n`, the wreck `WRECK`), no LZ\'s site among them',
    plot !== null && plot.brackets.map((bracket) => bracket.site).join() === freeIds.join() && freeIds.length > 0
    && plot.brackets.every((bracket) => !half.landing.lzs.some((lz) => lz.site === bracket.site))
    && plot.brackets.every((bracket) => (bracket.look === 'wreck') === (bracket.label === SITES_TEXT.track.wreck)), JSON.stringify(plot?.brackets));
  const lzA = plot?.lzs.find((lz) => lz.lz === 'LZ-A');
  const lzB = plot?.lzs.find((lz) => lz.lz === 'LZ-B');
  // LZ-A (160°) is in the rated half, LZ-B (346°) is not.
  check('…in FLIGHT each LZ is outlined and named: LZ-A known FLAT (no glyph, `LZ-A`), LZ-B not yet rated (`LZ-B ?`)',
    lzA?.glyph === null && lzA.label === 'LZ-A' && lzB?.glyph === SITES_TEXT.plot.unknown && lzB.label === 'LZ-B ?', JSON.stringify(plot?.lzs));
  const all = giveSurvey(cormorant((s) => { mapCells(s, 0, SURVEY_CELLS, true); s.run.phase = 'landing'; }), 2);
  const landingPlot = surveyPlotModel(all, null);
  check('…once rated bad LZ-B reads `✕` (red); in LANDING the glyph alone (the landing layer names the LZ)',
    landingPlot?.lzs.find((lz) => lz.lz === 'LZ-B')?.glyph === SITES_TEXT.plot.bad && landingPlot.lzs.every((lz) => lz.label === null)
    && landingPlot.mapped.length === 1 && landingPlot.mapped[0]!.toRad === TAU && landingPlot.unmapped.length === 0);
  // The wedge: while SURVEY runs, ±swathHalfRad under the ship, twice as wide at v3.
  const v3 = giveSurvey(cormorant((s) => mapCells(s, 0, 10, false)), 3);
  const wedge3 = surveyPlotModel(v3)?.wedges.find((wedge) => wedge.at === 'ship') ?? null;
  check(`…v3 running (${surveyRunning(v3)}): the wedge under the ship, ±swathHalfRad(3) = 2 × swathHalfRad(1) `,
    wedge3 !== null && wedge3.halfRad === swathHalfRad(3) && Math.abs(swathHalfRad(3) - 2 * swathHalfRad(1)) < 1e-12 && swathHalfRad(1) > 0
    && Math.abs(wedge3.centreRad - Math.atan2(v3.orbit.y, v3.orbit.x)) < 1e-12, JSON.stringify(wedge3));
  check('…no wedge while SURVEY does not map (no SURVEY aboard)', surveyPlotModel(cormorant())?.wedges.length === 0);
  // In the LANDING at v2+ a second swath around the drop dot (OPEN-DECISIONS 52: survey-model.ts dropSwathOn), as wide.
  const dropAt = (version: 1 | 2): GameState => giveSurvey(cormorant((s) => {
    mapCells(s, 0, 10, false);
    s.run.phase = 'landing';
    s.burn.status = 'locked';
    s.landing.survey.claimed = true;
  }), version);
  const dot2 = surveyPlotModel(dropAt(2), 1.25)?.wedges ?? [];
  const dot1 = surveyPlotModel(dropAt(1), 1.25)?.wedges ?? [];
  check('…LANDING at v2: a second wedge at the drop dot, ±swathHalfRad(2); at v1, or with no dot, the ship\'s alone',
    dot2.length === 2 && dot2[1]!.at === 'dot' && dot2[1]!.centreRad === 1.25 && dot2[1]!.halfRad === swathHalfRad(2)
    && dot1.length === 1 && surveyPlotModel(dropAt(2), null)?.wedges.length === 1, JSON.stringify(dot2));

  // The GROUND TRACK (LANDING): candidates dashed and clickable by their site id, the unmapped rim as `░`.
  const ground = giveSurvey(cormorant((s) => { mapCells(s, 0, 36, true); s.run.phase = 'landing'; }), 2);
  const brackets = surveyGroundBrackets(ground);
  const model = groundTrackModel(ground, null);
  check('GROUND TRACK: the free sites as candidate brackets keyed by their site (`SITE 2 ★★★` once rated), none on a GOOD planet',
    brackets.length === freeSites(ground).length && brackets.every((bracket) => /^(SITE \d+( ★+)?|WRECK)$/.test(bracket.label))
    && model.planet.brackets.filter((bracket) => bracket.look === 'candidate').every((bracket) => bracket.site !== null && bracket.lz === bracket.site)
    && model.planet.brackets.filter((bracket) => bracket.look === 'candidate').length === brackets.length
    && surveyGroundBrackets(cormorant((s) => { s.landing.survey = createSurveyState('good', []); })).length === 0,
    brackets.map((bracket) => bracket.label).join(' | '));
  const unmapped = surveyUnmapped(ground);
  check('…the rim not mapped is `░`: one arc [π, 2π) here, the whole turn with nothing mapped, none on a GOOD planet',
    unmapped.length === 1 && Math.abs(unmapped[0]!.fromRad - Math.PI) < 1e-9 && model.planet.unmapped.length >= 1
    && surveyUnmapped(cormorant())[0]?.toRad === TAU && surveyUnmapped(cormorant((s) => { s.landing.survey = createSurveyState('good', []); })).length === 0);
});

// --- The desk: the SHIP CARD's row and the AHEAD line --------------------------------------------------------------------
built(() => {
  const atVesper = (edit: (state: GameState) => void = () => {}): GameState => {
    const { run, slices } = armShipSlices(SEED, VESPER);
    const state = { ...createInitialState({ seed: SEED }), run: { ...run, phase: 'desk' as const }, ...slices } as GameState;
    edit(state);
    return state;
  };
  const desk = atVesper();
  const poor = surveyCardRow(desk, CORMORANT);
  const good = surveyCardRow(desk, 12);   // SKYLARK: GOOD on seed 7
  check('card: CORMORANT ahead reads `SITE DATA · POOR · ARRIVAL CONTROL GUESSED` (warn); a GOOD ship `GOOD` (plain)',
    poor?.label === 'SITE DATA' && poor.value === SITES_TEXT.card.poor && poor.tone === 'warn' && good?.value === SITES_TEXT.card.good && good.tone === 'plain',
    `${JSON.stringify(poor)} ${JSON.stringify(good)}`);
  const record = (patch: Partial<SurveyRecord>): SurveyRecord => ({ ranAt: 0, mappedPct: 0, found: 0, moves: [], badKept: [], movedOff: [], ...patch });
  const visited = (survey: SurveyRecord | null): GameState => {
    const { run, slices } = armShipSlices(SEED, CORMORANT);
    return { ...createInitialState({ seed: SEED }), run: { ...run, phase: 'desk', ships: [{ slot: CORMORANT, survey } as unknown as ShipResult] }, ...slices } as GameState;
  };
  check('…after the ship: `POOR · LZ-B MOVED` (good), `POOR · SURVEYED, KEPT`, `POOR · NOT SURVEYED`',
    surveyCardRow(visited(record({ ranAt: 2, moves: [{ lz: 'LZ-B', from: 'guess-B', site: 'site-5' }] })), CORMORANT)?.value === SITES_TEXT.card.moved('LZ-B')
    && surveyCardRow(visited(record({ ranAt: 2, moves: [{ lz: 'LZ-B', from: 'guess-B', site: 'site-5' }] })), CORMORANT)?.tone === 'good'
    && surveyCardRow(visited(record({ ranAt: 1 })), CORMORANT)?.value === SITES_TEXT.card.kept
    && surveyCardRow(visited(record({})), CORMORANT)?.value === SITES_TEXT.card.notSurveyed);
  check('…a POOR ship played before v6 (no record: a migrated SHIP DONE, m11) reads NOT SURVEYED, never GOOD',
    surveyCardRow(visited(null), CORMORANT)?.value === SITES_TEXT.card.notSurveyed);
  check('AHEAD: CORMORANT selected with SURVEY neither open nor held: `SITE DATA POOR · ARRIVAL CONTROL GUESSED THE LZs`; GOOD or none: no line',
    surveyAheadLine(armShipDesk(0), CORMORANT) === SITES_TEXT.ahead.closed && surveyAheadLine(desk, VESPER) === null && surveyAheadLine(desk, null) === null,
    String(surveyAheadLine(armShipDesk(0), CORMORANT)));
  check('…SURVEY held (or its branch open at this desk): `SITE DATA POOR · SURVEY FINDS BETTER SITES`',
    surveyAheadLine(giveSurvey(desk, 1), CORMORANT) === SITES_TEXT.ahead.open);

  // A desk with no ship done yet (visit 0): SURVEY's branch can't be open (visit 4 at the earliest).
  function armShipDesk(ships: number): GameState {
    return atVesper((s) => { s.run.ships = s.run.ships.slice(0, ships); });
  }
});

// --- The LANDING REPORT's LZ suffixes -------------------------------------------------------------------------------------
built(() => {
  const down = (lz: string, touch: 'soft' | 'hard'): PodFate => ({ kind: 'down', launch: {} as never, touchdown: { place: 'lz', lz, points: 100, missKm: null, touch, atAi: 0 } });
  const landed = cormorant((s) => {
    s.run.phase = 'report';
    s.landing.pods.slice(0, 3).forEach((record) => { record.fate = down('LZ-B', 'hard'); });
    s.landing.pods.slice(3, 5).forEach((record) => { record.fate = down('LZ-A', 'soft'); });
  });
  check('report: LZ-B on ROCKY with 3 pods down: ` · ROCKY · 3 HARD`; LZ-A on its FLAT guess: nothing',
    surveyLzRowSuffix(landed, 'LZ-B') === SITES_TEXT.report.hard('rocky', 3) && surveyLzRowSuffix(landed, 'LZ-A') === '',
    `${surveyLzRowSuffix(landed, 'LZ-B')}|${surveyLzRowSuffix(landed, 'LZ-A')}`);
  if (wide !== undefined) {
    const moved = cormorant((s) => {
      const lz = s.landing.lzs.find((candidate) => candidate.label === 'LZ-B')!;
      Object.assign(lz, { centreRad: wide.centreRad, halfWidthRad: wide.halfWidthRad, widthKm: wide.widthKm, ground: wide.ground, site: wide.id });
      s.landing.survey.moves.push({ lz: 'LZ-B', from: 'guess-B', site: wide.id });
    });
    check('…LZ-B moved onto SITE 5: ` · SITE 5`; a known bad guess no pod went to: ` · ROCKY`',
      surveyLzRowSuffix(moved, 'LZ-B') === SITES_TEXT.report.site('SITE 5')
      && surveyLzRowSuffix(cormorant((s) => { s.landing.survey.sites.find((site) => site.id === 'guess-B')!.groundKnown = true; }), 'LZ-B') === SITES_TEXT.report.bad('rocky'));
  }
  check('…an unknown bad guess nobody landed on says nothing; a GOOD planet nothing',
    surveyLzRowSuffix(cormorant(), 'LZ-B') === '' && surveyLzRowSuffix(cormorant((s) => { s.landing.survey = createSurveyState('good', []); }), 'LZ-B') === '');
});

// --- Review fixes (slice-6-review m1, m2, m4, m5, m8) -------------------------------------------------------------------
built(() => {
  // m1: SURVEY.skl aboard but OFF by damage is no "no SURVEY".
  const offline = (state: GameState): GameState => {
    for (const seg of state.memory) if (seg.type === 'upgrade' && 'version' in seg && seg.upgrade === 'survey') seg.integrity = 0;
    return state;
  };
  const off = offline(giveSurvey(cormorant((s) => { mapCells(s, 0, 30, false); }), 1));
  const offModel = sitesWindowModel(off);
  check('m1: SURVEY aboard but OFF: `SURVEY OFFLINE — REPAIR IT` (warn), the guesses `GROUND ?`, the pills refused `offline`',
    offModel?.status === SITES_TEXT.window.status.offline && offModel.tone === 'warn' && offModel.pause === null
    && offModel.lzs.every((row) => row.ground.word === SITES_TEXT.row.groundUnknown)
    && (sitesWindowModel(off, offModel.sites.find((row) => row.selectable)?.site ?? null)?.pills ?? []).filter((pill) => pill.refusal === 'offline').length === 2
    && SURVEY_TEXT.refusal.offline() === 'SURVEY OFFLINE — REPAIR IT',
    JSON.stringify(offModel?.lzs.map((row) => row.text)));
  check('…with nothing found an OFF SURVEY asks for a REPAIR (`REPAIR SURVEY.skl …`); with none aboard it still says TRAIN',
    sitesWindowModel(offline(giveSurvey(cormorant(), 1)))?.empty === SITES_TEXT.window.emptyOffline
    && sitesWindowModel(cormorant())?.empty === SITES_TEXT.window.emptyNone);
  // m2: v3's pause frees no thread.
  const v3Paused = giveSurvey(cormorant((s) => { mapCells(s, 0, 30, false); s.landing.survey.paused = true; s.clock.paused = false; s.burn.status = 'approaching'; }), 3);
  const p3 = sitesWindowModel(v3Paused);
  check('m2: a v3 PAUSE reads `SURVEY v3 · PAUSED`, its title names no thread; v2\'s still `ITS THREAD IS FREE`',
    surveyRunning(v3Paused) === 'paused' && p3?.status === SITES_TEXT.window.status.pausedFree(3) && p3.pause?.title === SITES_TEXT.window.pauseTitleFree
    && !/THREAD/.test(p3.status) && !/thread/i.test(p3.pause.title), `${p3?.status} | ${p3?.pause?.title}`);
  // m4: `1 POD`.
  check('m4: an LZ row counts `1 POD`, `4 PODS`', SITES_TEXT.row.lz('LZ-B', 'GUESS', 1, 'WIDE', 'GROUND ?') === 'LZ-B · GUESS · 1 POD · WIDE · GROUND ?'
    && SITES_TEXT.row.lz('LZ-B', 'GUESS', 4, 'WIDE', 'GROUND ?').includes('· 4 PODS ·'));
  // m8: an LZ that moved onto another LZ's guess names it in the report.
  const two = sites.find((site) => site.kind === 'candidate' && site.number === 2)!;
  const guessA = sites.find((site) => site.id === 'guess-A')!;
  const swapped = cormorant((s) => {
    const a = s.landing.lzs.find((one) => one.label === 'LZ-A')!;
    const b = s.landing.lzs.find((one) => one.label === 'LZ-B')!;
    Object.assign(a, { centreRad: two.centreRad, halfWidthRad: two.halfWidthRad, widthKm: two.widthKm, ground: two.ground, site: two.id });
    Object.assign(b, { centreRad: guessA.centreRad, halfWidthRad: guessA.halfWidthRad, widthKm: guessA.widthKm, ground: guessA.ground, site: guessA.id });
    s.landing.survey.moves.push({ lz: 'LZ-A', from: 'guess-A', site: two.id }, { lz: 'LZ-B', from: 'guess-B', site: 'guess-A' });
  });
  check('m8: LZ-B on LZ-A\'s guess reads ` · LZ-A GUESS` in the report; LZ-A on SITE 2 ` · SITE 2`',
    surveyLzRowSuffix(swapped, 'LZ-B') === SITES_TEXT.report.site('LZ-A GUESS') && surveyLzRowSuffix(swapped, 'LZ-A') === SITES_TEXT.report.site('SITE 2'),
    `${surveyLzRowSuffix(swapped, 'LZ-B')}|${surveyLzRowSuffix(swapped, 'LZ-A')}`);
});

// m5: the card reads the record's net outcome (state/survey-selectors.ts surveyNetOutcome).
built(() => {
  const { run, slices } = armShipSlices(SEED, VESPER);
  const visited = (survey: SurveyRecord): GameState => ({
    ...createInitialState({ seed: SEED }), run: { ...run, phase: 'desk', ships: [{ slot: CORMORANT, survey } as unknown as ShipResult],
      map: { ...run.map, route: [...run.map.route, { slot: CORMORANT } as never] } }, ...slices,
  } as GameState);
  const back: SurveyRecord = {
    ranAt: 1, mappedPct: 100, found: 5, badKept: [{ lz: 'LZ-B', ground: 'rocky', known: null }],
    moves: [{ lz: 'LZ-B', from: 'guess-B', site: 'site-5' }, { lz: 'LZ-B', from: 'site-5', site: 'guess-B' }],
    movedOff: [{ lz: 'LZ-B', ground: 'rocky', known: null }],
  };
  check('m5: LZ-B moved to SITE 5 and back to its guess: the card says `POOR · SURVEYED, KEPT`, not `LZ-B MOVED`',
    surveyCardRow(visited(back), CORMORANT)?.value === SITES_TEXT.card.kept, JSON.stringify(surveyCardRow(visited(back), CORMORANT)));
});

finish();
