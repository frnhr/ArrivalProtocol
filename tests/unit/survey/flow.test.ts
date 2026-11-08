// Slice 6 Track SWATH (docs/phase3/impl/slice-6-plan.md §7.1): the survey machine flown by the real systems on run 1's arm
// (seed 7) with both gates raised for the suite (support/survey withSurveyBuilt): the WP7 harness (every DOM-free system as
// main.ts mounts them, mountSurvey among them), the unit beamed ARES-VII → HALCYON → KESTREL → VESPER → CORMORANT (slot 15:
// 9 pods, LZ-A 5 · LZ-B 4, LZ-B's guess ROCKY; SITE 5 WIDE FLAT ROOM 6 is v2's swap, SITE 4 a wreck) by the save fixture's
// sends. Its ship and instrument files are healed and the beam's seeds freed (HOLLOW sleeps for good), so the kid who obeys
// the strip (wp2 followDirector, landing/harness-landing followLanding) flies the capture and the landing in about a second
// each; every case restores CORMORANT's first flight tick.
// • The desk at VESPER (visit 4) opens SURVEY (CORMORANT POOR in reach), SENTRY having opened at visit 3.
// • NO SURVEY: the boot's SITE DATA POOR line, CONTROL's quip at the first flight tick, no thread, nothing mapped; the first pod
//   down on LZ-B lands hard and shows its ground (the echo's tail, 'site-revealed' by touchdown, CONTROL's rocky line, once);
//   the record (bad kept, known by touchdown).
// • v1: the thread from the first tick (one op fewer, THRUST LIMIT 75%), MAPPING on the Skills row, mapped % at the capture
//   inside 34–45%, the finds (the first typed, the wreck typed, GROUND ?), a move before the landing (LZ-B to SITE 5: the
//   geometry, sitesRev, the move with `from`, 'lz-moved', CONTROL's once-line), the pods landing on the new site, PLANET
//   MAPPED, the thread released at 100%, SHIP DONE at rest in a save that decodes, the record (moved off ROCKY, unknown).
// • v2: the bad guess revealed as the swath passes it (`> SURVEY: LZ-B IS ROCKY ✕`, CONTROL's line), every found site rated,
//   the strip's `survey-swap` row naming SITE 5, gone once the kid moves LZ-B there.
// • OPEN-DECISIONS 52: in the LANDING v2 also maps around the drop dot: LZ-B, unmapped at the lock and met blind by v1's
//   first window, is revealed before its window with the ship beyond its own swath, and the kid's swap lands its pods soft.
// • R11: sites found at v1 are rated once v2 works, even with the rim mapped.
// • v3: no thread, `NO THREAD (v3)`, mapped % at the capture inside 46–56%; bitten to DAMAGED it works as v2: it claims a
//   thread; REPAIRed back to OK it lets the thread go.
// • R8: a preempting claim (AUTOBURN's and AUTODROP's: ops-core reserveThread preempt) takes SURVEY's thread when the kid's op
//   holds the other; SURVEY waits while a claim would take the kid's last thread, and claims again once two are free. m4: a
//   Core worn to one thread makes it let go. R7: PAUSE gives the thread back and stops mapping; RESUME takes it again.
// • Review fixes (slice-6-review.md): B1, the review's repro (v2, a pod launched off-site over SITE 1, LZ-A may not move
//   under it: `falling-under`); M1, SURVEY steps aside while AUTOBURN or AUTODROP holds a thread (the reactor cap stays 0.75),
//   pinned by the claim and by a real AUTOBURN v1 capture; m6, a paused v2 rates nothing; m7, a bad site the kid moved onto
//   is revealed with no CONTROL joke, by v2 and by a touchdown (with the report's row); a touchdown reveal on a mislanded
//   pod; v2 in the landing with the Nav Plotter dead (no dot swath, no throw).
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { SkillFileSegment } from '@/types/segment';
import type { SkillVersion } from '@/types/skill';
import { createHarness7 } from '../wp7/harness7';
import { followDirector } from '../wp2/harness2';
import { withSurveyBuilt } from '../support/survey';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk, storedSave } from '../save/save-fixture';
import { setLandingMode } from '../support/landing-instant';
import { followLanding } from '../landing/harness-landing';
import { restoreState } from '../wp1-rules/flows';
import { giveSkillFile } from '../support/skills';
import { mappedPct } from '@state/survey-selectors';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { threadsBusy, threadsTotal, holdsThread, reserveThread, releaseThread, canStartOp } from '@systems/ops-core';
import { capabilitiesNow } from '@systems/capabilities';
import { assignSite, toggleSurveyPause, surveyStatus, mapNow, SURVEY_THREAD_OWNER } from '@systems/survey';
import { surveyRunning, swathHalfRad, cellOf, bestSwap } from '@systems/survey-model';
import { angleDelta } from '@systems/landing-solve';
import { openBranchesAt } from '@systems/skill-tree';
import { visitNow } from '@systems/skill-levels';
import { buildDirectorCtx } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { GUIDE_RULES } from '@data/script';
import { SURVEY_TEXT } from '@data/survey-text';
import { SWATH_TEXT } from '@data/swath-text';
import { REACTOR_CAP_BY_BAND, REACTOR_THREAD_SHARE } from '@data/tuning';
import type { LaunchRecord } from '@/types/landing';
import { assignRefusal, dropSwathOn } from '@systems/survey-model';
import { surveyLzRowSuffix } from '@systems/survey-hud';
import { requestLaunch } from '@systems/landing';
import { getDropSolution } from '@systems/drop-cache';
import { pendingTouchdowns } from '@systems/landing-rules';
import { SITES_TEXT } from '@data/sites-text';
import { engageAutoburn, autoburnRefusal, mountAutoburn } from '@systems/autoburn';

const SEED = 7;
const ROUTE = [2, 5, 11, 15];
const h = createHarness7(SEED);
const s = (): Readonly<GameState> => h.store.getState();
setLandingMode('manual');

const said = (speaker: string, text: string): number => s().log.entries.filter((entry) => entry.speaker === speaker && entry.text === text).length;
const saidLike = (re: RegExp): string[] => s().log.entries.filter((entry) => re.test(entry.text)).map((entry) => entry.text);
const events = (name: string, from: number): Record<string, unknown>[] =>
  h.events.slice(from).filter((event) => event.name === name).map((event) => event.payload as Record<string, unknown>);
const survey = (): Readonly<GameState['landing']['survey']> => s().landing.survey;
const lz = (label: string): Readonly<GameState['landing']['lzs'][number]> => s().landing.lzs.find((one) => one.label === label)!;
const siteId = (number: number): string => survey().sites.find((site) => site.kind !== 'guess' && site.number === number)!.id;
const bound = (): boolean => {
  const { x, y, vx, vy } = s().orbit;
  return (vx * vx + vy * vy) / 2 - s().level.planet.mu / Math.hypot(x, y) < 0;
};
const reactorCapNow = (): number => capabilitiesNow(s()).reactor.reactorCap;
const ruleLine = (id: string): string | null => {
  const ctx = buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
  const rule = GUIDE_RULES.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`no strip rule ${id}`);
  return rule.activeWhen(ctx) ? rule.text(ctx) : null;
};
const stepFor = (aiSec: number): void => { const until = s().clock.aiSec + aiSec; h.stepUntil(() => s().clock.aiSec >= until, aiSec * 4 + 10); };
const mappedCells = (): number => survey().mapped.filter(Boolean).length;

// The approach flown by the strip to ORBIT LOCK; `each` after every tick. Returns the mapped % at the first bound tick (the
// capture: the loop closes during the capture burn at ▼).
function flyApproach(each: () => void = () => {}): number {
  let atCapture = -1;
  followDirector(h, {
    reactionSec: 0.4, maxWall: 900,
    mistake: () => { if (atCapture < 0 && bound()) atCapture = mappedPct(survey()); each(); return false; },
  });
  return atCapture;
}

const storage = stubStorage();
let start: GameState | null = null;
const fromStart = (version: SkillVersion | null): void => {
  restoreState(h, start!);
  if (version !== null) giveSkillFile(h.store, 'survey', version);
};

withSurveyBuilt(() => {
  // --- The route: VESPER's desk opens SURVEY; CORMORANT's boot ---------------------------------------------------------------
  {
    pageOpen(h.store, storage, SEED);
    receiveToReport(h.store);
    let atVesperDesk: string[] = [];
    ROUTE.forEach((slot, i) => {
      beamTo(h.store, slot);
      if (i < ROUTE.length - 1) toDesk(h.store);
      if (slot === 11) atVesperDesk = openBranchesAt(s(), visitNow(s().run));
    });
    check('VESPER\'s desk (visit 4, CORMORANT POOR in reach) opens SURVEY, SENTRY having opened at visit 3',
      atVesperDesk.includes('survey') && JSON.stringify(s().run.skills.opened) === '[{"skill":"sentry","visit":3},{"skill":"survey","visit":4}]',
      `${atVesperDesk.join()} ${JSON.stringify(s().run.skills.opened)}`);
    const from = s().log.entries.length;
    h.stepUntil(() => s().run.phase === 'flight', 60);
    const boot = s().log.entries.slice(from).map((entry) => entry.text);
    check('CORMORANT\'s boot says `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs`', boot.includes(SURVEY_TEXT.boot(2)), boot.filter((line) => /SITE/.test(line)).join(' | '));
    h.store.update((draft) => {
      for (const seg of draft.memory) if ((seg.type === 'ship' || seg.type === 'tool' || seg.type === 'core' || seg.type === 'driver') && 'integrity' in seg) seg.integrity = 100;
      draft.memory = draft.memory.map((seg) => (seg.type === 'hollow' ? freeSegment(seg.size) : seg));
      mergeAdjacentFree(draft.memory);
      draft.hollow.phase = 'dormant';
      draft.ui.memoryRev++;
    });
    h.step();
    check('CONTROL\'s quip at the first flight tick (`We guessed the landing sites! :)`), once, with no SURVEY aboard',
      said('control', SWATH_TEXT.control.boot) === 1 && survey().lines.controlBoot && survey().site === 'poor');
    start = structuredClone(s());
  }

  // --- NO SURVEY: the first touchdown on LZ-B shows its ground ------------------------------------------------------------------
  {
    fromStart(null);
    const from = h.events.length;
    let maxBusy = 0;
    flyApproach(() => { maxBusy = Math.max(maxBusy, threadsBusy()); });
    check('no SURVEY: no thread held, nothing mapped, no Skills row status, \'survey-state\' never emitted',
      maxBusy === 0 && mappedPct(survey()) === 0 && surveyStatus(s()) === null && surveyRunning(s()) === 'off' && events('survey-state', from).length === 0
      && s().burn.status === 'locked', `${maxBusy} ${mappedPct(survey())} ${s().burn.status}`);
    followLanding(h, { maxWall: 900 });
    const downB = s().landing.pods.flatMap((record) => (record.fate.kind === 'down' && record.fate.touchdown.lz === 'LZ-B' ? [record.fate.touchdown.touch] : []));
    const reveals = events('site-revealed', from);
    check(`…every pod down on LZ-B (${downB.length}) lands hard on its ROCKY guess`, downB.length > 0 && downB.every((touch) => touch === 'hard'), downB.join());
    check('…the first of them shows it: one \'site-revealed\' by touchdown, the guess known, the reveal recorded',
      JSON.stringify(reveals) === JSON.stringify([{ lz: 'LZ-B', siteId: 'guess-B', ground: 'rocky', by: 'touchdown' }])
      && survey().sites.find((site) => site.id === 'guess-B')!.groundKnown && JSON.stringify(survey().reveals) === '[{"site":"guess-B","by":"touchdown"}]',
      JSON.stringify(reveals));
    const tails = saidLike(/LZ-B IS ROCKY$/);
    check('…its echo carries the tail (`> pod.. ... LANDED · HARD · LZ-B IS ROCKY`), once; CONTROL says `LZ-B is a little rocky :)` once',
      tails.length === 1 && /^> pod\d\d \.\.\. LANDED · HARD · LZ-B IS ROCKY$/.test(tails[0]!) && said('control', SWATH_TEXT.control.reveal('LZ-B', 'rocky')) === 1, tails.join(' | '));
    const shipsBefore = s().run.ships.length;
    toDesk(h.store);
    const record = s().run.ships[shipsBefore]?.survey;
    check('…the ship\'s record: never ran, 0% mapped, LZ-B kept ROCKY, known by touchdown',
      JSON.stringify(record) === JSON.stringify({ ranAt: 0, mappedPct: 0, found: 0, moves: [], badKept: [{ lz: 'LZ-B', ground: 'rocky', known: 'touchdown' }], movedOff: [] }),
      JSON.stringify(record));
  }

  // --- v1 FIND: the thread, the finds, a move, PLANET MAPPED, SHIP DONE at rest ----------------------------------------------
  {
    const capOk = REACTOR_CAP_BY_BAND.ok;
    fromStart(1);
    const from = h.events.length;
    h.step();
    check('v1: SURVEY claims a spare thread at the first tick (1 of 2 busy: one op fewer), THRUST LIMIT 75%',
      survey().claimed && holdsThread(SURVEY_THREAD_OWNER) && threadsBusy() === 1 && threadsTotal() === 2
      && Math.abs(reactorCapNow() - capOk * (1 - REACTOR_THREAD_SHARE)) < 1e-9, `${reactorCapNow()} of ${capOk}`);
    check('…the Skills row: `MAPPING n% · HOLDS A THREAD`; \'survey-state\' running at v1',
      /^MAPPING \d+% · HOLDS A THREAD$/.test(surveyStatus(s())?.text ?? '') && JSON.stringify(events('survey-state', from).at(-1)) === '{"running":"running","version":1}',
      surveyStatus(s())?.text);
    let movedAt: string | null = null;
    const atCapture = flyApproach(() => {
      // The kid moves LZ-B onto SITE 2 as soon as SURVEY finds it (STANDARD, ROOM 5: a blind pick at v1, GROUND ?).
      const two = survey().sites.find((site) => site.kind === 'candidate' && site.number === 2)!;
      if (movedAt === null && two.found) movedAt = `${s().run.phase} ${assignSite(h.store, 'LZ-B', two.id)}`;
    });
    check(`…mapped ${atCapture}% at the capture: inside 34–45% (plan §2.6)`, atCapture >= 34 && atCapture <= 45);
    const found = events('site-found', from);
    check('…sites found as the swath passes them (\'site-found\', the first candidate flagged), every ground still unknown (GROUND ?)',
      found.length >= 3 && found.filter((event) => event.first === true).length === 1 && survey().sites.every((site) => !site.groundKnown),
      JSON.stringify(found));
    check('…the TERMINAL types the first find (`> SURVEY: SITE n FOUND · ROOM … · …`) and the wreck (`SITE 4 IS WRECKAGE`), no other find',
      saidLike(/^> SURVEY: SITE \d+ FOUND · ROOM [\d,]+ · (WIDE|STANDARD|NARROW)$/).length === 1
      && said('mind-sys', SWATH_TEXT.terminal.wreck('SITE 4')) === 1, saidLike(/^> SURVEY/).join(' | '));
    const two = survey().sites.find((site) => site.id === siteId(2))!;
    check(`…LZ-B moved to SITE 2 in the flight (${movedAt}): its centre, width and ground, sitesRev 1, the move with its \`from\``,
      movedAt === 'flight null' && lz('LZ-B').site === two.id && lz('LZ-B').centreRad === two.centreRad && lz('LZ-B').halfWidthRad === two.halfWidthRad
      && lz('LZ-B').ground === 'flat' && s().landing.sitesRev === 1 && JSON.stringify(survey().moves) === JSON.stringify([{ lz: 'LZ-B', from: 'guess-B', site: two.id }]));
    check('…\'lz-moved\' emitted, CONTROL says `You moved LZ-B? Bold! :)` once',
      JSON.stringify(events('lz-moved', from)) === JSON.stringify([{ lz: 'LZ-B', from: 'guess-B', to: two.id }]) && said('control', SWATH_TEXT.control.moved('LZ-B')) === 1);
    check('…a second move onto the same site is refused (`same`), and onto the wreck (`wreck`)',
      assignSite(h.store, 'LZ-B', two.id) === 'same' && assignSite(h.store, 'LZ-B', siteId(4)) === 'wreck' && s().landing.sitesRev === 1);
    let releasedWhenDone = false;
    followLanding(h, {
      maxWall: 900,
      onTick: () => { if (survey().mapped.every(Boolean) && !holdsThread(SURVEY_THREAD_OWNER) && !survey().claimed) releasedWhenDone = true; },
    });
    const downB = s().landing.pods.flatMap((record) => (record.fate.kind === 'down' && record.fate.touchdown.lz === 'LZ-B' ? [record.fate.touchdown.touch] : []));
    check(`…the pods land on LZ-B's new site (${downB.length} down there, all soft), and no ground is revealed`,
      downB.length === 4 && downB.every((touch) => touch === 'soft') && events('site-revealed', from).length === 0, downB.join());
    check('…the planet mapped within the first orbit: `> SURVEY: PLANET MAPPED · 4 SITES` once (the wreck not counted: review m3), the thread let go at 100%, `DONE · 4 SITES`',
      said('mind-sys', SWATH_TEXT.terminal.mapped(4)) === 1 && releasedWhenDone && surveyRunning(s()) === 'done' && surveyStatus(s())?.text === SWATH_TEXT.status.done(4)
      && events('survey-state', from).some((event) => event.running === 'done'));
    const shipsBefore = s().run.ships.length;
    toDesk(h.store);
    const record = s().run.ships[shipsBefore]?.survey;
    let decodes = false;
    try { decodes = storedSave(storage).save.point === 'ship-done'; } catch { decodes = false; }
    check('…SHIP DONE leaves the machine at rest (no thread, claimed false, lastRad null) in a save that decodes',
      !holdsThread(SURVEY_THREAD_OWNER) && !survey().claimed && survey().lastRad === null && decodes);
    check('…the record: ran at v1, 100% mapped, 5 found, the move, nothing bad kept, ROCKY moved off unknown',
      record?.ranAt === 1 && record.mappedPct === 100 && record.found === 5 && record.badKept.length === 0
      && JSON.stringify(record.movedOff) === '[{"lz":"LZ-B","ground":"rocky","known":null}]', JSON.stringify(record));
  }

  // --- v2 RATE: the bad guess revealed as the swath passes it; the strip's swap ------------------------------------------------
  {
    fromStart(2);
    const from = h.events.length;
    flyApproach();
    // LZ-B (346°) lies past the capture on CORMORANT: the swath reaches it in the first orbit. The kid waits for the reveal.
    h.stepUntil(() => survey().reveals.length > 0 || s().landing.pods.some((record) => record.fate.kind !== 'aboard'), 600);
    const podsAway = s().landing.pods.filter((record) => record.fate.kind !== 'aboard').length;
    check('v2: LZ-B\'s ROCKY guess revealed by SURVEY before a pod goes: one \'site-revealed\' by survey, `> SURVEY: LZ-B IS ROCKY ✕`, CONTROL\'s line',
      podsAway === 0 && JSON.stringify(events('site-revealed', from)) === JSON.stringify([{ lz: 'LZ-B', siteId: 'guess-B', ground: 'rocky', by: 'survey' }])
      && said('mind-sys', SWATH_TEXT.terminal.revealed('LZ-B', 'rocky')) === 1 && said('control', SWATH_TEXT.control.reveal('LZ-B', 'rocky')) === 1,
      `${podsAway} ${JSON.stringify(events('site-revealed', from))}`);
    const rated = events('site-rated', from).length;
    check(`…every site found is rated (${rated} 'site-rated'), its ground known`,
      rated > 0 && survey().sites.every((site) => site.found === site.groundKnown));
    h.stepUntil(() => s().landing.window === null && survey().sites.find((site) => site.id === siteId(5))!.found, 600);
    const strip = ruleLine('survey-swap');
    const moved = assignSite(h.store, 'LZ-B', siteId(5));
    check(`…with no window open the strip offers the swap (\`${strip}\`), and drops it once LZ-B is moved there`,
      strip === SWATH_TEXT.strip.swap('LZ-B', 'rocky', 'SITE 5') && moved === null && ruleLine('survey-swap') === null, String(strip));
  }

  // --- OPEN-DECISIONS 52: in the LANDING, v2+ also maps around the drop dot ---------------------------------------------------
  // On CORMORANT LZ-B (346°) is past the capture: the approach leaves it unmapped, and the dot leads the ship by about 80°, so
  // LZ-B's first window opens before the ship's own swath reaches it. v1 (the ship's swath only) meets that window blind; v2
  // rates the guess from the dot's swath before the window, and the strip's kid (who moves LZ-B by bestSwap) lands soft.
  {
    const lzBRad = (): number => survey().sites.find((site) => site.id === 'guess-B')!.centreRad;
    const fromShip = (): number => Math.abs(angleDelta(Math.atan2(s().orbit.y, s().orbit.x), lzBRad()));
    const firstLzBWindow = (from: number): number => h.events.slice(from).findIndex((event) => event.name === 'window-open' && (event.payload as { lz: string }).lz === 'LZ-B');
    const revealAt = (from: number): number => h.events.slice(from).findIndex((event) => event.name === 'site-revealed');
    // v1: the gap.
    fromStart(1);
    flyApproach();
    const unmappedAtLock = !survey().mapped[cellOf(lzBRad())];
    let mappedAtWindow: boolean | null = null;
    followLanding(h, { maxWall: 900, onTick: () => { if (mappedAtWindow === null && s().landing.window?.lz === 'LZ-B') mappedAtWindow = survey().mapped[cellOf(lzBRad())] === true; } });
    check('v1 (the ship\'s swath only): LZ-B unmapped at ORBIT LOCK, still unmapped when its first window opens; the first touchdown shows it',
      unmappedAtLock && mappedAtWindow === false && JSON.stringify(survey().reveals) === '[{"site":"guess-B","by":"touchdown"}]', `${unmappedAtLock} ${mappedAtWindow}`);
    // v2: the dot's swath.
    fromStart(2);
    flyApproach();
    const fromV2 = h.events.length;
    const unmappedV2 = !survey().mapped[cellOf(lzBRad())];
    let shipOffAtReveal: number | null = null;
    followLanding(h, {
      maxWall: 900,
      onTick: () => {
        if (shipOffAtReveal === null && survey().reveals.length > 0) shipOffAtReveal = fromShip();
        const to = bestSwap(s(), 'LZ-B');
        if (to !== null) assignSite(h.store, 'LZ-B', to);
      },
    });
    const downB = s().landing.pods.flatMap((record) => (record.fate.kind === 'down' && record.fate.touchdown.lz === 'LZ-B' ? [record.fate.touchdown.touch] : []));
    check(`v2: LZ-B unmapped at ORBIT LOCK, revealed by SURVEY with the ship ${((shipOffAtReveal ?? NaN) * 180 / Math.PI).toFixed(0)}° from it (beyond its own ±20°), before LZ-B's first window`,
      unmappedV2 && shipOffAtReveal !== null && shipOffAtReveal > swathHalfRad(2) && revealAt(fromV2) >= 0
      && (firstLzBWindow(fromV2) < 0 || revealAt(fromV2) < firstLzBWindow(fromV2)) && JSON.stringify(survey().reveals) === '[{"site":"guess-B","by":"survey"}]',
      `${revealAt(fromV2)} < ${firstLzBWindow(fromV2)}`);
    check(`…the kid moves LZ-B by bestSwap and every LZ-B pod lands soft (${downB.join()})`,
      survey().moves.length === 1 && survey().moves[0]!.from === 'guess-B' && downB.length === 4 && downB.every((touch) => touch === 'soft'));
  }

  // --- R11 latched: a site found at v1 is rated once v2 works, with nothing left to map --------------------------------------
  {
    fromStart(1);
    h.step();
    mapNow(h.store, 100);
    const unrated = survey().sites.every((site) => site.found && !site.groundKnown);
    h.step();
    giveSkillFile(h.store, 'survey', 2);
    h.step();
    check('R11: every site found at v1 (the whole rim mapped: done, no thread) is rated as soon as SURVEY works at v2',
      unrated && survey().sites.every((site) => site.groundKnown) && surveyRunning(s()) === 'done' && !survey().claimed
      && said('mind-sys', SWATH_TEXT.terminal.revealed('LZ-B', 'rocky')) === 1);
  }

  // --- v3 SWEEP: no thread; damage makes it v2 again ------------------------------------------------------------------------------
  {
    fromStart(3);
    h.step();
    check('v3: no thread at the first tick, the THRUST LIMIT clear, `MAPPING n% · NO THREAD (v3)`',
      !survey().claimed && threadsBusy() === 0 && reactorCapNow() === REACTOR_CAP_BY_BAND.ok && /NO THREAD \(v3\)$/.test(surveyStatus(s())?.text ?? ''),
      surveyStatus(s())?.text);
    const fileId = s().memory.find((seg): seg is SkillFileSegment => seg.type === 'upgrade' && 'version' in seg && seg.upgrade === 'survey')!.id;
    const setIntegrity = (integrity: number): void => {
      h.store.update((draft) => { (draft.memory.find((seg) => seg.id === fileId) as SkillFileSegment).integrity = integrity; draft.ui.memoryRev++; });
    };
    setIntegrity(60);
    h.step();
    check('…bitten to DAMAGED it works as v2: it claims a thread (one op fewer again)', survey().claimed && holdsThread(SURVEY_THREAD_OWNER) && threadsBusy() === 1);
    setIntegrity(100);
    h.step();
    check('…REPAIRed back to OK it lets the thread go', !survey().claimed && !holdsThread(SURVEY_THREAD_OWNER) && threadsBusy() === 0);
    fromStart(3);
    const atCapture = flyApproach();
    check(`…mapped ${atCapture}% at the capture: inside 46–56% (plan §2.6), the swath twice v1's`,
      atCapture >= 46 && atCapture <= 56 && Math.abs(swathHalfRad(3) - 2 * swathHalfRad(1)) < 1e-12);
  }

  // --- R8: a polite tenant; m4: a worn Core; R7: PAUSE ------------------------------------------------------------------------------
  {
    fromStart(1);
    h.step();
    reserveThread('kid-op');
    check('R8: with the kid\'s op on the other thread, every thread is busy (SURVEY and the op)', !canStartOp() && survey().claimed);
    const took = reserveThread('autoburn', { preempt: true });
    h.step();
    check('…AUTOBURN\'s preempting claim takes SURVEY\'s thread; SURVEY sees it and waits (`WAITS FOR A SPARE THREAD`)',
      took && holdsThread('autoburn') && !holdsThread(SURVEY_THREAD_OWNER) && !survey().claimed && surveyRunning(s()) === 'waiting'
      && surveyStatus(s())?.text === SWATH_TEXT.status.waits);
    releaseThread('autoburn');
    h.step();
    const waitingAt = mappedCells();
    stepFor(1);
    check('…with one thread free it does not claim it (that is the kid\'s last), and maps nothing while it waits',
      !survey().claimed && canStartOp() && mappedCells() === waitingAt);
    releaseThread('kid-op');
    h.step();
    check('…and claims again once two are free', survey().claimed && holdsThread(SURVEY_THREAD_OWNER));
    const coreId = s().memory.find((seg) => seg.type === 'core')!.id;
    const setCore = (integrity: number): void => {
      h.store.update((draft) => { const seg = draft.memory.find((one) => one.id === coreId)!; if ('integrity' in seg) seg.integrity = integrity; draft.ui.memoryRev++; });
    };
    setCore(40);
    h.step();
    check('m4: a Core worn to one thread makes SURVEY let its thread go (and wait)',
      threadsTotal() === 1 && !survey().claimed && !holdsThread(SURVEY_THREAD_OWNER) && surveyRunning(s()) === 'waiting');
    setCore(100);
    h.step();
    toggleSurveyPause(h.store);
    const pausedAt = mappedCells();
    check('R7: PAUSE gives the thread back at once, `PAUSED · n%`', survey().paused && !survey().claimed && !holdsThread(SURVEY_THREAD_OWNER)
      && /^PAUSED · \d+%$/.test(surveyStatus(s())?.text ?? ''));
    const angle = (): number => Math.atan2(s().orbit.y, s().orbit.x);
    const pausedRad = angle();
    h.stepUntil(() => Math.abs(angle() - pausedRad) > 0.2, 600);
    check(`…nothing is mapped while paused (the ship moved ${(((angle() - pausedRad) * 180) / Math.PI).toFixed(0)}°), lastRad at rest`,
      mappedCells() === pausedAt && !survey().claimed && survey().lastRad === null);
    toggleSurveyPause(h.store);
    const resumedRad = angle();
    h.stepUntil(() => Math.abs(angle() - resumedRad) > 0.2, 600);
    check('…RESUME takes the thread again and mapping goes on', !survey().paused && survey().claimed && mappedCells() > pausedAt, `${pausedAt} → ${mappedCells()}`);
  }
  // --- Review B1: a move may not drop an LZ under a pod already falling ------------------------------------------------------
  // The review's repro: v2, the rim mapped, the dot over SITE 1 (63°, NARROW FLAT ROOM 5, free) with no window open; the kid
  // launches off-site (the guard confirmed), then asks to move LZ-A (5 pods) there. The move would make the pod an LZ pod.
  {
    fromStart(2);
    flyApproach();
    h.stepUntil(() => s().run.phase === 'landing' && getDropSolution()?.dot != null, 60);
    mapNow(h.store, 100);
    h.step();
    const one = survey().sites.find((site) => site.id === siteId(1))!;
    h.stepUntil(() => {
      const dot = getDropSolution()?.dot;
      return dot != null && Math.abs(angleDelta(dot.rad, one.centreRad)) < one.halfWidthRad * 0.3 && s().landing.window === null;
    }, 600);
    let launched = requestLaunch(h.store, { source: 'player' });
    if (launched.kind === 'confirm') launched = requestLaunch(h.store, { source: 'player', confirmed: launched.ask });
    const falling = s().landing.pods.find((record) => record.fate.kind === 'falling')!;
    const before = pendingTouchdowns(s()).get(falling.pod)!;
    const refusal = assignRefusal(s(), 'LZ-A', one.id);
    const assigned = assignSite(h.store, 'LZ-A', one.id);
    check(`B1: a pod falling off-site over SITE 1 (${before.place}, ${before.points} points): LZ-A onto SITE 1 is refused \`${SURVEY_TEXT.refusal['falling-under']()}\`, nothing moves`,
      before.place === 'off-site' && refusal === 'falling-under' && assigned === 'falling-under' && lz('LZ-A').site === 'guess-A' && s().landing.sitesRev === 0,
      `${JSON.stringify(launched)} ${refusal}`);
    h.stepUntil(() => s().landing.pods.find((record) => record.pod === falling.pod)!.fate.kind === 'down', 600);
    const fate = s().landing.pods.find((record) => record.pod === falling.pod)!.fate;
    check('…the pod lands off-site, scored where it was launched', fate.kind === 'down' && fate.touchdown.place === 'off-site' && fate.touchdown.lz === null);
    check('…once it is down the move is free again (SITE 1 has nothing falling over it)', assignRefusal(s(), 'LZ-A', one.id) === null);
  }

  // --- Review M1: SURVEY steps aside while AUTOBURN or AUTODROP holds a thread --------------------------------------------------
  {
    const capOk = REACTOR_CAP_BY_BAND.ok;
    const oneThreadCap = capOk * (1 - REACTOR_THREAD_SHARE);
    for (const owner of ['autoburn', 'autodrop'] as const) {
      fromStart(1);
      h.step();
      const surveyCap = reactorCapNow();
      const took = reserveThread(owner, { preempt: true });
      const capAtClaim = reactorCapNow();
      h.step();
      stepFor(1);
      check(`M1: with SURVEY v1 holding a thread and the other free, ${owner.toUpperCase()}'s claim takes SURVEY's: the reactor cap stays ${oneThreadCap} (not ${capOk * (1 - 2 * REACTOR_THREAD_SHARE)})`,
        took && Math.abs(surveyCap - oneThreadCap) < 1e-9 && Math.abs(capAtClaim - oneThreadCap) < 1e-9 && Math.abs(reactorCapNow() - oneThreadCap) < 1e-9
        && threadsBusy() === 1 && holdsThread(owner) && !holdsThread(SURVEY_THREAD_OWNER), `${surveyCap} ${capAtClaim} ${reactorCapNow()} busy ${threadsBusy()}`);
      check(`…SURVEY does not claim the spare thread beside ${owner.toUpperCase()} (\`WAITS FOR A SPARE THREAD\`), and claims again once it lets go`,
        !survey().claimed && surveyRunning(s()) === 'waiting' && canStartOp()
        && (releaseThread(owner), h.step(), survey().claimed && holdsThread(SURVEY_THREAD_OWNER) && Math.abs(reactorCapNow() - oneThreadCap) < 1e-9));
    }
  }

  // …and in a real capture: AUTOBURN v1 engaged within LOCK RANGE by the strip's kid, SURVEY v1 aboard. Measured (review M1):
  // before the fix both threads were held through the burn (cap 0.5, a burn half as long again, FUEL 30.3% at the lock); now
  // the burn flies at 0.75 as with no SURVEY (FUEL 30.7%; 31.3% with no SURVEY, the gap being the approach's THRUST LIMIT).
  {
    const offAutoburn = mountAutoburn(h.store);
    fromStart(1);
    giveSkillFile(h.store, 'autoburn', 1);
    h.step();
    let minCap = Infinity;
    let both = 0;
    let engaged = false;
    followDirector(h, {
      reactionSec: 0.4, maxWall: 900,
      mistake: (_h, ctx) => {
        if (s().burn.auto.phase !== 'idle') {
          ctx.setHolding(false);
          if (s().burn.firing) {
            minCap = Math.min(minCap, reactorCapNow());
            if (holdsThread('autoburn') && holdsThread(SURVEY_THREAD_OWNER)) both++;
          }
          return true;
        }
        if (!engaged && autoburnRefusal(s(), getPrediction()) === null) {
          ctx.setHolding(false);
          engaged = engageAutoburn(h.store) === null;
          return engaged;
        }
        return false;
      },
    });
    offAutoburn();
    check(`M1 in a real capture: AUTOBURN v1 captures with SURVEY v1 aboard, its burn at a reactor cap of ${minCap} (never both threads held), FUEL ${s().burn.fuelPct.toFixed(1)}% at the lock`,
      engaged && s().burn.status === 'locked' && Math.abs(minCap - REACTOR_CAP_BY_BAND.ok * (1 - REACTOR_THREAD_SHARE)) < 1e-9 && both === 0, `${minCap} ${both}`);
  }

  // --- Review m6, m7: rating waits for SURVEY to work; CONTROL jokes only about its own guess ----------------------------------
  {
    fromStart(2);
    h.step();
    toggleSurveyPause(h.store);
    const foundBefore = new Set(survey().sites.filter((site) => site.found).map((site) => site.id));
    mapNow(h.store, 60);
    h.step();
    const foundNow = (): GameState['landing']['survey']['sites'] => survey().sites.filter((site) => site.found && !foundBefore.has(site.id));
    check(`m6: v2 paused rates nothing it finds (${foundNow().length} found, no ground known)`,
      surveyRunning(s()) === 'paused' && foundNow().length >= 2 && foundNow().every((site) => !site.groundKnown));
    toggleSurveyPause(h.store);
    h.step();
    check('…and rates them once it works again', surveyRunning(s()) === 'running' && foundNow().every((site) => site.groundKnown));
    // m7 by SURVEY: v1 moves LZ-B onto SITE 3 (NARROW WET ROOM 4) blind; v2 then rates it.
    fromStart(1);
    h.step();
    mapNow(h.store, 100);
    const moved = assignSite(h.store, 'LZ-B', siteId(3));
    const from = h.events.length;
    giveSkillFile(h.store, 'survey', 2);
    h.step();
    check('m7: LZ-B moved onto WET SITE 3 at v1, then rated by v2: revealed by survey, `> SURVEY: LZ-B IS WET ✕`, and CONTROL says nothing about a lake',
      moved === null && JSON.stringify(events('site-revealed', from)) === JSON.stringify([{ lz: 'LZ-B', siteId: siteId(3), ground: 'wet', by: 'survey' }])
      && said('mind-sys', SWATH_TEXT.terminal.revealed('LZ-B', 'wet')) === 1 && said('control', SWATH_TEXT.control.reveal('LZ-B', 'wet')) === 0,
      JSON.stringify(events('site-revealed', from)));
  }

  // --- A touchdown reveal on a site the kid moved onto (v1 onto WET SITE 3), and the report's row ----------------------------
  {
    fromStart(1);
    const from = h.events.length;
    let moved: string | null = 'not yet';
    flyApproach(() => { if (moved === 'not yet' && survey().sites.find((site) => site.id === siteId(3))!.found) moved = String(assignSite(h.store, 'LZ-B', siteId(3))); });
    followLanding(h, { maxWall: 900 });
    const downB = s().landing.pods.flatMap((record) => (record.fate.kind === 'down' && record.fate.touchdown.lz === 'LZ-B' ? [record.fate.touchdown.touch] : []));
    const tails = saidLike(/LZ-B IS WET$/);
    check(`moved-onto: LZ-B on WET SITE 3 (${moved}), its pods land hard (${downB.join()}); the first shows it: 'site-revealed' by touchdown, the echo's tail`,
      moved === 'null' && downB.length > 0 && downB.every((touch) => touch === 'hard')
      && JSON.stringify(events('site-revealed', from)) === JSON.stringify([{ lz: 'LZ-B', siteId: siteId(3), ground: 'wet', by: 'touchdown' }])
      && tails.length === 1 && /^> pod\d\d \.\.\. LANDED · HARD · LZ-B IS WET$/.test(tails[0]!), tails.join(' | '));
    check('…CONTROL makes no lake joke (m7: the site was the kid\'s pick, not CONTROL\'s guess)', said('control', SWATH_TEXT.control.reveal('LZ-B', 'wet')) === 0);
    const suffix = surveyLzRowSuffix(s(), 'LZ-B');
    check(`…the report's LZ-B row names the site, the ground and the hard pods (\`${suffix}\`)`,
      suffix === SITES_TEXT.report.site('SITE 3') + SITES_TEXT.report.hard('wet', downB.length));
  }

  // --- A touchdown reveal on a mislanded pod (no SURVEY) ------------------------------------------------------------------------
  // LZ-B written full by hand (its 4 pods down, no event, so no reveal yet): the next pod into it is mislanded, lands hard on
  // the ROCKY guess (mislanded pods stand on its ground too), and shows the ground.
  {
    fromStart(null);
    flyApproach();
    const guessB = survey().sites.find((site) => site.id === 'guess-B')!;
    const launch = (rad: number): LaunchRecord => ({
      atTSec: 0, atAi: 0, source: 'player', launchRadius: 1, dotRad: rad, halfWidthKm: 1, aimLz: 'LZ-B', landingRad: rad, predictedTouch: 'soft',
      driverIntegrity: 100, arc: [], descentSec: 3.5, firstOfRun: false,
    });
    h.store.update((draft) => {
      draft.landing.pods.slice(-4).forEach((record) => {
        record.fate = { kind: 'down', launch: launch(guessB.centreRad), touchdown: { place: 'lz', lz: 'LZ-B', points: 100, missKm: null, touch: 'hard', atAi: 0 } };
      });
    });
    const from = h.events.length;
    h.stepUntil(() => {
      const dot = getDropSolution()?.dot;
      return dot != null && Math.abs(angleDelta(dot.rad, guessB.centreRad)) < guessB.halfWidthRad * 0.3;
    }, 600);
    let launched = requestLaunch(h.store, { source: 'player' });
    if (launched.kind === 'confirm') launched = requestLaunch(h.store, { source: 'player', confirmed: launched.ask });
    h.stepUntil(() => events('site-revealed', from).length > 0 || !s().landing.pods.some((record) => record.fate.kind === 'falling'), 600);
    const mislanded = s().landing.pods.find((record) => record.fate.kind === 'down' && record.fate.touchdown.place === 'mislanded');
    check(`mislanded (${JSON.stringify(launched)}): the pod into full LZ-B is mislanded and lands hard on its ROCKY guess, and shows it (by touchdown, CONTROL's line)`,
      mislanded !== undefined && mislanded.fate.kind === 'down' && mislanded.fate.touchdown.touch === 'hard' && mislanded.fate.touchdown.lz === 'LZ-B'
      && JSON.stringify(events('site-revealed', from)) === JSON.stringify([{ lz: 'LZ-B', siteId: 'guess-B', ground: 'rocky', by: 'touchdown' }])
      && said('control', SWATH_TEXT.control.reveal('LZ-B', 'rocky')) === 1);
  }

  // --- The machine with a dead Nav Plotter: no dot, so no dot swath; no throw, the ship's swath still maps ---------------------
  {
    fromStart(2);
    flyApproach();
    h.store.update((draft) => { for (const seg of draft.memory) if (seg.role === 'navplot' && 'integrity' in seg) seg.integrity = 0; draft.ui.memoryRev++; });
    h.step();
    const before = mappedCells();
    const angle = (): number => Math.atan2(s().orbit.y, s().orbit.x);
    const at = angle();
    let threw = '';
    try { h.stepUntil(() => Math.abs(angleDelta(angle(), at)) > 0.6 || survey().mapped.every(Boolean), 600); } catch (error) { threw = (error as Error).message; }
    check(`dead Nav Plotter, v2 in the LANDING: no dot (${String(getDropSolution()?.dot ?? null)}), no throw, the ship's swath maps on (${before} → ${mappedCells()} cells)`,
      s().run.phase === 'landing' && (getDropSolution()?.dot ?? null) === null && threw === '' && (mappedCells() > before || survey().mapped.every(Boolean))
      && dropSwathOn(s()) === (surveyRunning(s()) === 'running'), threw);
  }
});


finish();
