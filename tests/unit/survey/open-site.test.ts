// Playtest 1, Track C-SITES (docs/phase3/impl/playtest-1-plan.md §3.13, Q18; Fran's note 18: "Seems I should be able to land
// pods into sites, but cannot and/or the 'F' speeds past them"). A found site can be opened as a new LZ once the landing pins
// the LZs, and then it is an LZ like any other. Flown by the real systems on run 1's arm (seed 7), CORMORANT (slot 15: 9 pods,
// LZ-A 5 · LZ-B 4, LZ-B's guess ROCKY; SITE 5 WIDE FLAT ROOM 6), SURVEY v2, as survey/flow flies it:
//  1. In flight every LZ can still move: no OPEN pill, the plot's and the GROUND TRACK's labels read `· MOVE AN LZ HERE`.
//  2. The kid lands one pod in LZ-A and one in LZ-B: both pinned. SITE 5's pills: both moves refused (`pods-down`), each with
//     its strip flash naming the way out (`LZ-A HAS PODS DOWN — OPEN SITE 5 AS LZ-C`), and `OPEN AS LZ-C (1,200)`. The
//     director shows a refused pill's flash on the strip. The labels read `· OPEN AS LZ-C`.
//  3. openSite: LZ-C stands on SITE 5 with its ROOM as its count (planned 0), sitesRev, 'lz-moved' from null, the TERMINAL's
//     line, the commit's thread for SURVEY_OPEN_COMMIT_SEC AI s and then let go. The SITES row says OPENED.
//  4. The refusals: 'taken' once opened, 'lz-cap' at four LZs, 'falling-under' over a falling pod, 'no-thread' with the Core
//     full, 'can-move' while an LZ could move there.
//  5. Hold [F] (the kid's own hands): the hold stops HARD at LZ-C's window (`LZ-C WINDOW`); the kid's pods launched there land
//     in LZ-C, soft, in plan ('lz', full points).
//  6. The landing ends: the report's row `LZ-C 1,200 · OPENED ON SITE 5` (count 0, good), the save at SHIP DONE decodes with
//     three LZs, and the next desk's SHIP CARD reads `POOR · LZ-C OPENED`.
//  7. AUTODROP v3 plans it: LZ-A's leftover count first, then LZ-C, never the known-ROCKY LZ-B; the plan is complete; one [G]
//     and the held [F] fly it, and its pods land in LZ-C.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createHarness7 } from '../wp7/harness7';
import { followDirector } from '../wp2/harness2';
import { withSurveyBuilt } from '../support/survey';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk, storedSave } from '../save/save-fixture';
import { setLandingMode } from '../support/landing-instant';
import { ensureLandingKeys, followLanding } from '../landing/harness-landing';
import { flyOnce, restoreState } from '../wp1-rules/flows';
import { giveSkillFile } from '../support/skills';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { threadsBusy, threadsTotal, reserveThread, releaseThread, holdsThread } from '@systems/ops-core';
import { openSite, openCommitting, mapNow, SURVEY_OPEN_THREAD_OWNER } from '@systems/survey';
import { openRefusal, assignRefusal } from '@systems/survey-model';
import { sitesWindowModel, surveyGroundBrackets, surveyPlotModel, surveyCardRow } from '@systems/survey-hud';
import { landingResult, landingView, lzOpened, lzRemaining, podPoints } from '@systems/landing-rules';
import { landingReportModel } from '@systems/landing-report';
import { capabilitiesNow } from '@systems/capabilities';
import { getDropSolution } from '@systems/drop-cache';
import { getPrediction } from '@systems/predict';
import { fastForwardView, skipBlockReason, FF_TEXT } from '@systems/pace';
import { planLanding } from '@systems/autodrop-plan';
import { pressAutodrop } from '@systems/autodrop';
import { emit } from '@systems/events';
import { SITES_TEXT, sitesFlashReason } from '@data/sites-text';
import { SURVEY_TEXT } from '@data/survey-text';
import { SURVEY_OPEN_COMMIT_SEC, SURVEY_OPEN_MAX_LZS, COLONISTS_PER_POD } from '@data/tuning';
import type { LandingView, LzState } from '@/types/landing';

const SEED = 7;
const ROUTE = [2, 5, 11, 15];
const CORMORANT = 15;
const h = createHarness7(SEED);
const s = (): Readonly<GameState> => h.store.getState();
setLandingMode('manual');
ensureLandingKeys(h);

const survey = (): Readonly<GameState['landing']['survey']> => s().landing.survey;
const siteId = (number: number): string => survey().sites.find((site) => site.kind !== 'guess' && site.number === number)!.id;
const lz = (label: string): LzState | undefined => s().landing.lzs.find((one) => one.label === label);
const downIn = (label: string): number => s().landing.pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.lz === label).length;
const falling = (): number => s().landing.pods.filter((record) => record.fate.kind === 'falling').length;
const aboard = (): number => s().landing.pods.filter((record) => record.fate.kind === 'aboard').length;
const events = (name: string, from: number): Record<string, unknown>[] =>
  h.events.slice(from).filter((event) => event.name === name).map((event) => event.payload as Record<string, unknown>);
const said = (text: string): number => s().log.entries.filter((entry) => entry.text === text).length;
const viewNow = (): LandingView => landingView(s(), getDropSolution()!, capabilitiesNow(s()).bay.cadenceTac);
const stepFor = (aiSec: number): void => { const until = s().clock.aiSec + aiSec; h.stepUntil(() => s().clock.aiSec >= until, aiSec * 4 + 10); };
const line = (): string => h.shown()?.text ?? '';
const SITE5 = 'SITE 5';

// Taps the SKIP engine while nothing is open (the harness's [F] tap), and launches one pod into the open window of an LZ in
// `want` that has none yet; stops at `until` (or the landing's end, or maxWall).
function landOneEach(want: readonly string[], until: () => boolean, maxWall = 600): void {
  const start = h.wall();
  while (s().run.phase === 'landing' && s().landing.ended === null && h.wall() - start < maxWall && !until()) {
    h.step();
    const win = s().landing.window;
    if (win !== null && want.includes(win.lz) && downIn(win.lz) === 0 && falling() === 0 && /press \[L\]/.test(line())) {
      h.press('KeyL');
      continue;
    }
    if (win === null && s().clock.skipWarp === null && skipBlockReason(s(), getPrediction()) === null) h.press('KeyF');
  }
}

const storage = stubStorage();

withSurveyBuilt(() => {
  // --- The setups: CORMORANT's first flight tick at v2; LZ-A and LZ-B each pinned by a pod -----------------------------------
  flyOnce(h, 'cormorant v2 flight', () => {
    pageOpen(h.store, storage, SEED);
    receiveToReport(h.store);
    ROUTE.forEach((slot, i) => { beamTo(h.store, slot); if (i < ROUTE.length - 1) toDesk(h.store); });
    h.stepUntil(() => s().run.phase === 'flight', 60);
    // Healed, the beam's seeds freed (HOLLOW sleeps for good), as survey/flow does: the suite is about the sites.
    h.store.update((draft) => {
      for (const seg of draft.memory) if ((seg.type === 'ship' || seg.type === 'tool' || seg.type === 'core' || seg.type === 'driver') && 'integrity' in seg) seg.integrity = 100;
      draft.memory = draft.memory.map((seg) => (seg.type === 'hollow' ? freeSegment(seg.size) : seg));
      mergeAdjacentFree(draft.memory);
      draft.hollow.phase = 'dormant';
      draft.ui.memoryRev++;
    });
    giveSkillFile(h.store, 'survey', 2);
    h.step();
  });
  const inFlight = structuredClone(s());

  // --- 1. In flight: an LZ can move, so no OPEN ----------------------------------------------------------------------------
  {
    // The swath's finds and ratings at once (__ap.survey.map's body), still in flight.
    mapNow(h.store, 100);
    h.step();
    const five = siteId(5);
    const pills = sitesWindowModel(s(), five)?.pills ?? [];
    check('1. in flight (SITE 5 found): every LZ can move there, `can-move`: the pills are the moves alone, no OPEN',
      s().run.phase === 'flight' && openRefusal(s(), five) === 'can-move' && pills.length === 2 && pills.every((pill) => pill.kind === 'move' && pill.refusal === null),
      `${s().run.phase} ${openRefusal(s(), five)} ${JSON.stringify(pills)}`);
    const track = surveyGroundBrackets(s()).find((bracket) => bracket.site === five)?.label;
    const plot = surveyPlotModel(s())?.brackets.find((bracket) => bracket.site === five)?.label;
    check(`…the GROUND TRACK's label \`${track}\` and the plot's \`${plot}\` say what the site is for (note 18's words)`,
      track === SITES_TEXT.track.moveHere(SITES_TEXT.track.rated(SITE5, 3)) && plot === SITES_TEXT.track.moveHere(SITE5));
    const wreck = surveyGroundBrackets(s()).find((bracket) => bracket.label === SITES_TEXT.track.wreck);
    check('…the wreck stays `WRECK`', wreck !== undefined);
  }

  // --- 2. Both LZs pinned by a pod: the refused moves, their flash, the OPEN pill ------------------------------------------
  flyOnce(h, 'cormorant v2 pinned', () => {
    restoreState(h, inFlight);
    followDirector(h, { reactionSec: 0.4, maxWall: 900 });
    landOneEach(['LZ-A', 'LZ-B'], () => downIn('LZ-A') > 0 && downIn('LZ-B') > 0 && falling() === 0);
    // A moment on, out of the last window (the pill is about the landing's hold, not an open window).
    h.stepUntil(() => s().landing.window === null, 120);
  });
  const pinned = structuredClone(s());
  const five = siteId(5);
  {
    check(`2. one pod down in LZ-A and one in LZ-B (${downIn('LZ-A')} · ${downIn('LZ-B')}), ${aboard()} aboard, LZ-B known ROCKY`,
      downIn('LZ-A') === 1 && downIn('LZ-B') === 1 && aboard() === 7 && s().landing.lzs.length === 2
      && survey().sites.find((site) => site.id === 'guess-B')!.groundKnown);
    const model = sitesWindowModel(s(), five)!;
    const [pillA, pillB, open] = model.pills;
    const why = (label: string): string => SURVEY_TEXT.refusal['pods-down']({ site: SITE5, lz: label, holds: 0, needs: 0 });
    check('…SITE 5\'s pills: `LZ-A ✕ LZ-A HAS PODS DOWN`, `LZ-B ✕ LZ-B HAS PODS DOWN`, then `OPEN AS LZ-C (1,200)`',
      model.pills.length === 3 && pillA?.refusal === 'pods-down' && pillA.text === SITES_TEXT.pillRefused('LZ-A', why('LZ-A'))
      && pillB?.refusal === 'pods-down' && open?.kind === 'open' && open.refusal === null && open.lz === 'LZ-C'
      && open.text === SITES_TEXT.pillOpen('LZ-C', SURVEY_TEXT.room(6)) && open.text === 'OPEN AS LZ-C (1,200)',
      JSON.stringify(model.pills));
    check('…each refused move carries its strip flash with the way out: `LZ-B HAS PODS DOWN — OPEN SITE 5 AS LZ-C`',
      pillB?.flash === 'LZ-B HAS PODS DOWN — OPEN SITE 5 AS LZ-C' && pillA?.flash === SITES_TEXT.flashOpen(why('LZ-A'), SITE5, 'LZ-C'), pillB?.flash ?? '');
    // The SITES window's click on a refused pill emits this (components/tools-view/SitesWindow.ts); the director shows it.
    emit('refused', { reason: sitesFlashReason(pillB!.flash!) });
    h.step();
    check(`…a click on the refused pill flashes it on the strip: \`${line()}\``, line() === 'LZ-B HAS PODS DOWN — OPEN SITE 5 AS LZ-C' && h.shown()?.source === 'flash');
    const track = surveyGroundBrackets(s()).find((bracket) => bracket.site === five)?.label;
    check(`…the GROUND TRACK reads \`${track}\``, track === SITES_TEXT.track.openHere(SITES_TEXT.track.rated(SITE5, 3), 'LZ-C'));
    check('…the hint, with nothing selected and no LZ able to move: `CLICK A SITE TO OPEN IT AS A NEW LZ`',
      sitesWindowModel(s(), null)?.hint === SITES_TEXT.window.hintOpen, String(sitesWindowModel(s(), null)?.hint));
  }

  // --- 3. Open it ----------------------------------------------------------------------------------------------------------
  {
    restoreState(h, pinned);
    const from = h.events.length;
    const rev = s().landing.sitesRev;
    const busy = threadsBusy();
    const result = openSite(h.store, five);
    const c = lz('LZ-C');
    const site = survey().sites.find((one) => one.id === five)!;
    check('3. openSite(SITE 5): LZ-C stands on it (its centre, width, ground), its ROOM as its count, sitesRev +1, no move recorded',
      result === null && s().landing.lzs.length === 3 && c !== undefined && c.site === five && c.centreRad === site.centreRad
      && c.halfWidthRad === site.halfWidthRad && c.widthKm === site.widthKm && c.ground === 'flat' && c.pods === 6
      && s().landing.sitesRev === rev + 1 && survey().moves.length === 0, JSON.stringify(c));
    check('…it is the opened one (no guess of its own: planned 0), LZ-A and LZ-B are CONTROL\'s; LZ-C has room for 6',
      lzOpened(s().landing, 'LZ-C') && !lzOpened(s().landing, 'LZ-A') && !lzOpened(s().landing, 'LZ-B') && lzRemaining(s())['LZ-C'] === 6);
    check('…\'lz-moved\' from null, the TERMINAL\'s `> SURVEY: LZ-C OPENED ON SITE 5 · ROOM 1,200`',
      JSON.stringify(events('lz-moved', from)) === JSON.stringify([{ lz: 'LZ-C', from: null, to: five }])
      && said('> SURVEY: LZ-C OPENED ON SITE 5 · ROOM 1,200') === 1, JSON.stringify(events('lz-moved', from)));
    check(`…the commit holds a Core thread (${busy} → ${threadsBusy()} busy, or SURVEY's own taken)`,
      openCommitting() && holdsThread(SURVEY_OPEN_THREAD_OWNER));
    stepFor(SURVEY_OPEN_COMMIT_SEC + 0.2);
    check(`…and lets it go after ${SURVEY_OPEN_COMMIT_SEC} AI s`, !openCommitting() && !holdsThread(SURVEY_OPEN_THREAD_OWNER));
    const row = sitesWindowModel(s(), null)!.lzs.find((one) => one.key === 'LZ-C');
    check(`…the SITES row: \`${row?.text}\``, row?.text === 'LZ-C · OPENED ON SITE 5 · ROOM 1,200 · WIDE · FLAT ★★★' && row.moved);
  }
  const opened = structuredClone(s());

  // --- 4. The refusals -----------------------------------------------------------------------------------------------------
  {
    check('4. SITE 5 again: `taken` (LZ-C stands on it); openSite changes nothing',
      openRefusal(s(), five) === 'taken' && openSite(h.store, five) === 'taken' && s().landing.lzs.length === 3);
    // A pinned landing with four LZs already: a fake LZ-D too big for every site (so none can move), pods down in A and B.
    const four = structuredClone(s()) as GameState;
    four.landing.lzs.push({ ...four.landing.lzs[0]!, label: 'LZ-D', pods: 99, site: siteId(1), centreRad: survey().sites.find((one) => one.id === siteId(1))!.centreRad });
    const freeTwo = siteId(2);
    check(`…at ${SURVEY_OPEN_MAX_LZS} LZs: \`lz-cap\`, its pill dimmed \`LZ-E ✕ 4 LZs ALREADY\``,
      openRefusal(four, freeTwo) === 'lz-cap' && sitesWindowModel(four, freeTwo)?.pills.at(-1)?.text === SITES_TEXT.pillRefused('LZ-E', SITES_TEXT.openRefusal['lz-cap'](4)),
      `${openRefusal(four, freeTwo)} ${JSON.stringify(sitesWindowModel(four, freeTwo)?.pills.at(-1))}`);
    // A pod falling onto SITE 2 off-site: opening it would make it an LZ pod (review B1's rule).
    const under = structuredClone(pinned) as GameState;
    const record = under.landing.pods.find((one) => one.fate.kind === 'down')!;
    if (record.fate.kind !== 'down') throw new Error('no pod down');
    const two = under.landing.survey.sites.find((one) => one.id === freeTwo)!;
    under.landing.pods.find((one) => one.fate.kind === 'aboard')!.fate = { kind: 'falling', launch: { ...record.fate.launch, landingRad: two.centreRad, aimLz: null } };
    check('…a pod falling onto the site: `falling-under` (its pill dimmed: `A POD IS FALLING — WAIT FOR IT`)',
      openRefusal(under, freeTwo) === 'falling-under' && sitesWindowModel(under, freeTwo)?.pills.at(-1)?.refusal === 'falling-under',
      String(openRefusal(under, freeTwo)));
    // The Core full: no thread for the commit.
    restoreState(h, pinned);
    const owners: string[] = [];
    for (let i = 0; threadsBusy() < threadsTotal(); i++) { const owner = `test-${i}`; reserveThread(owner); owners.push(owner); }
    check('…every Core thread busy (no yieldable one to take): `no-thread`, nothing opened',
      openSite(h.store, five) === 'no-thread' && s().landing.lzs.length === 2 && !holdsThread(SURVEY_OPEN_THREAD_OWNER));
    for (const owner of owners) releaseThread(owner);
    check('…`can-move` while an LZ could move there (the flight, part 1), and no site of the wreck\'s',
      openRefusal(inFlight, five) !== null && assignRefusal(s(), 'LZ-A', siteId(4)) === 'wreck');
  }

  // --- 5. Hold [F]: a HARD stop at LZ-C's window; the kid's pods land there -------------------------------------------------
  {
    restoreState(h, opened);
    const stops: string[] = [];
    for (let tries = 0; tries < 8 && stops.at(-1) !== FF_TEXT.window('LZ-C'); tries++) {
      h.keyDown('KeyF');
      const start = h.wall();
      while (fastForwardView().spent === null && h.wall() - start < 300) h.step();
      stops.push(fastForwardView().spent ?? 'none');
      h.keyUp('KeyF');
      if (stops.at(-1) !== FF_TEXT.window('LZ-C')) {
        // Another LZ's window: let it go by without a launch (the kid wants SITE 5).
        h.stepUntil(() => s().landing.window !== null, 120);
        h.stepUntil(() => s().landing.window === null, 300);
      }
    }
    check(`5. the held [F] stops HARD at LZ-C's window (${stops.join(' → ')}): the hold spent there, no SKIP running`,
      stops.at(-1) === FF_TEXT.window('LZ-C') && s().clock.skipWarp === null);
    const from = h.events.length;
    const before = downIn('LZ-C');
    const start = h.wall();
    while (h.wall() - start < 120) {
      h.step();
      if (s().landing.window?.lz === 'LZ-C' && /press \[L\]/.test(line())) h.press('KeyL');
      if (s().landing.window === null && falling() === 0 && downIn('LZ-C') > before) break;
    }
    const inC = s().landing.pods.flatMap((one) => (one.fate.kind === 'down' && one.fate.touchdown.lz === 'LZ-C' ? [one.fate.touchdown] : []));
    const launched = events('pod-launched', from).length;
    check(`…the kid's pods launched in that window (${launched}) land in LZ-C: ${inC.length} down, every one soft and in plan`,
      inC.length > 0 && inC.length === launched && inC.every((touch) => touch.place === 'lz' && touch.touch === 'soft'), JSON.stringify(inC));
    check('…and they score as any LZ pod (full points: podPoints lz · soft)',
      inC.every((touch) => touch.points === podPoints('lz', 'soft', s().landing.forgiveness, COLONISTS_PER_POD) && touch.points > 0));
  }

  // --- 6. The report, SHIP DONE's save, the card -----------------------------------------------------------------------------
  {
    followLanding(h, { maxWall: 900 });
    h.stepUntil(() => s().run.phase === 'report', 120);
    const tally = landingResult(s(), 'locked');
    const rowC = tally.lzs.find((row) => row.lz === 'LZ-C');
    const report = landingReportModel(s()).rows.find((row) => row.label === 'LZ-C');
    check(`6. the LANDING REPORT: LZ-C's row counts 0 (planned none), ${rowC?.landed} landed: \`${report?.line}\``,
      rowC?.count === 0 && (rowC.landed ?? 0) > 0
      && report?.line === `${SITES_TEXT.report.openedRow('LZ-C', (rowC.landed).toLocaleString('en-US'))}${SITES_TEXT.report.opened(SITE5)}` && report.tone === 'good',
      JSON.stringify(report));
    const shipsBefore = s().run.ships.length;
    toDesk(h.store);
    const saved = storedSave(storage).save;
    const lzsSaved = saved.payload.kind === 'world' ? saved.payload.slices.landing.lzs.length : -1;
    check(`…the save at SHIP DONE decodes, the landing with its three LZs (${lzsSaved}): no save change`,
      saved.point === 'ship-done' && lzsSaved === 3, `${saved.point} ${saved.payload.kind}`);
    check(`…the ship's tally keeps LZ-C's row; the next desk's SHIP CARD: \`${surveyCardRow(s(), CORMORANT)?.value}\``,
      s().run.ships[shipsBefore]?.lzs.some((row) => row.lz === 'LZ-C' && row.count === 0) === true
      && surveyCardRow(s(), CORMORANT)?.value === SITES_TEXT.card.opened('LZ-C'));
  }

  // --- 7. AUTODROP v3 plans it --------------------------------------------------------------------------------------------
  {
    restoreState(h, opened);
    giveSkillFile(h.store, 'autodrop', 3);
    h.step();
    const plan = planLanding(s(), viewNow());
    const toC = plan.rows.filter((row) => row.lz === 'LZ-C').reduce((sum, row) => sum + row.n, 0);
    const toA = plan.rows.filter((row) => row.lz === 'LZ-A').reduce((sum, row) => sum + row.n, 0);
    check(`7. AUTODROP v3's plan: LZ-A's count first (${toA}), the rest to LZ-C (${toC}), none to the known-ROCKY LZ-B, none mislanded`,
      toA === 4 && toC === 3 && !plan.rows.some((row) => row.lz === 'LZ-B') && plan.rows.every((row) => row.mislanded === 0),
      JSON.stringify(plan.rows.map((row) => `${row.lz}×${row.n}`)));
    check('…the plan is complete with nothing short (LZ-B\'s count is LZ-C\'s now)', plan.complete && plan.short.length === 0, JSON.stringify(plan.short));
    const from = h.events.length;
    const armed = pressAutodrop(h.store);
    h.keyDown('KeyF');
    const start = h.wall();
    while (h.wall() - start < 600 && s().run.phase === 'landing' && aboard() + falling() > 0) {
      h.step();
      // The game lets go of a spent hold; the kid holds again.
      if (fastForwardView().spent !== null) { h.keyUp('KeyF'); h.step(); h.keyDown('KeyF'); }
    }
    h.keyUp('KeyF');
    const launches = events('pod-launched', from);
    check(`…one [G] (${armed ?? 'armed'}) and the held [F] fly it: ${launches.length} pods by AUTODROP, ${downIn('LZ-C')} down in LZ-C, ${downIn('LZ-B')} in LZ-B`,
      armed === null && launches.length === 7 && launches.every((one) => one.source === 'autodrop') && downIn('LZ-C') === 3 && downIn('LZ-B') === 1 && downIn('LZ-A') === 5,
      `A ${downIn('LZ-A')} ${JSON.stringify(s().landing.pods.map((one) => one.fate.kind === 'down' ? `${one.fate.touchdown.lz}:${one.fate.touchdown.place}` : one.fate.kind))}`);
  }
});

finish();
