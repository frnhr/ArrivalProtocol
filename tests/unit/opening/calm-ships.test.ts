// Slice 2, Track OPENING (slice-2-plan §1.1 items 9–15, §3, §6.1): the calm opening as a kid meets it.
// • Calm ships: ARES-VII and HALCYON have no root slot and no HOLLOW block; the ladder plays them calm; HALCYON's sensor
//   arrives at 62 at most (risk 10); the licences re-flowed (§3.2).
// • Driver arrival damage per layer (01-landing §3.8, §3.15): seeded and stable, ceil(pods ÷ 5) degraded, one failing from
//   layer 4, never the lead or the root slot's neighbours (risk 9); ARES-VII's scripted POD 02 at 44.
// • Ship 1 walked (constructed coast and lock, no capture flown, so the suite stays fast): the hurt-driver lesson, then the
//   SCAN `???` lesson in a WAIT once POD 02 is settled; the SCAN's header, CONTROL's line and the name flip; the landing's
//   `◆ PODS LAND WHERE THE DOT IS`; the first-landing moment (§3.3); the LANDING REPORT with no story wait; entry 01 and the
//   reader opening by itself on the TRANSMIT screen.
// • HALCYON after a real TRANSMIT: the boot's ECC line and `> 046.log · KEY FOUND · ENTRY 02`, one degraded driver, the
//   sensor at 62, no MOVE; its landing's split lesson.
// • The other boots' keys (03, 04, 10–11), entry 12 from the root, the name derived from run.log (the simulation retry),
//   and run 2's ship 1 with no ghost and no naming (risk 11 and its follow-up: the ghost speaks where the last unit was
//   lost, opening/ghost-placement).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { followLanding, lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { receiveTransmission } from '@systems/boot';
import { continueAfterReport } from '../support/classic-flow';
import { mountStoryLog } from '@systems/story-log';
import { logEntriesAtBoot, logKnown, logDisplayName } from '@state/log-selectors';
import { setMode } from '@systems/mode';
import { pickUpTool } from '@systems/fs-tools';
import { actionScan } from '@state/actions';
import { licenceSchedule } from '@systems/licences';
import { podStreaks } from '@systems/landing-hud';
import { nominalShipThreat } from '@systems/threat-plan';
import { lineageOf, freshMeta, recordRunStart, recordRunEnd, ghostLine } from '@systems/meta';
import { createInitialState } from '@state/initial';
import { resetWorld } from '@systems/reset';
import { childRng, createRng } from '@systems/rng';
import { driverArrivalDamage, hurtDriversFor, rootSlotNeighbours } from '@data/driver-damage';
import { rootSlotRack } from '@data/memory';
import { LOG_TEXT, LOG_NAME, LOG_HINT_TARGET, logEntryLines } from '@data/log-text';
import { LANDING_LESSONS, LANDING_BEATS, LANDING_STAMP_TEXT, groundRadioLine } from '@data/landing-text';
import { TOOL_HINT_TARGET } from '@data/fs-tools';
import { classicShip, CLASSIC_FIVE, CLASSIC_LICENCES } from '@data/classic-five';
import { stateFromElements } from '@/types/orbit';
import {
  DRIVER_ROLLED_MIN, DRIVER_ROLLED_MAX, DRIVER_FAILING_MIN, DRIVER_FAILING_MAX, POD_FIRST_DESCENT_SEC, BAND_DEGRADED_MIN,
  LOG_SCAN_AFTER_COAST_SEC, LOG_SCAN_ASK_SEC,
} from '@data/tuning';
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';

const h = createHarness7(1);
mountStoryLog(h.store);
// The landings here are flown by the strip (the first-landing moment, the lessons), not landed instantly.
setLandingMode('manual');
const state = (): GameState => h.store.getState();
const shownText = (): string => state().director.shown?.text ?? '';
const shownId = (): string => state().director.shown?.id ?? '';
const logTexts = (): string[] => state().log.entries.map((entry) => entry.text);
const drivers = (): DriverSegment[] => state().memory.filter((seg): seg is DriverSegment => seg.type === 'driver');
const logSeg = () => state().memory.find((seg) => seg.type === 'log');
const eventsOf = (name: string) => h.events.filter((event) => event.name === name);
function stepUntil(done: () => boolean, maxWall: number): boolean {
  const end = h.wall() + maxWall;
  while (!done() && h.wall() < end) h.step();
  return done();
}

// --- Calm ships, as data ------------------------------------------------------------------------------------------------
{
  const calm = [0, 1].map((index) => ({ ship: classicShip(index), threat: nominalShipThreat(index) }));
  check('ARES-VII and HALCYON have no root slot, and the ladder plays them calm with no root',
    calm.every(({ ship, threat }) => rootSlotRack(ship) === null && threat.act === 'calm' && threat.rootBlocks === null),
    calm.map(({ ship, threat }) => `${ship.id}: ${threat.act} root ${threat.rootBlocks}`).join(' · '));
  check('the calm ships\' layouts: `P P P _40` on ARES-VII, `P P P P P _24` on HALCYON (01-landing §3.16)',
    classicShip(0).memory.podRacks.B === 'P P P _40' && classicShip(1).memory.podRacks.B === 'P P P P P _24');
  check('HALCYON\'s Sensor Interp arrives at 62 at most, scripted (risk 10)',
    JSON.stringify(classicShip(1).arrivalDamage) === JSON.stringify([{ role: 'sensor', maxIntegrity: 62 }]));
  const kinds = (index: number) => licenceSchedule(index).length;
  const kestrel = CLASSIC_LICENCES[2]!;
  check('licences re-flowed (§3.2): none on HALCYON; KESTREL DELETE at its start and MOVE at its coast; MOVE is nowhere earlier',
    CLASSIC_LICENCES[1]!.length === 0 && CLASSIC_LICENCES[0]!.length === 0
      && kestrel.some((licence) => licence.kind === 'delete' && licence.afterAiSec === 0)
      && kestrel.some((licence) => licence.kind === 'move' && licence.atCoast && licence.afterAiSec === null)
      && kinds(1) === 1,
    `${kinds(0)} ${kinds(1)} ${kinds(2)} rules`);
}

// --- Driver arrival damage per layer --------------------------------------------------------------------------------------
{
  const rolled = CLASSIC_FIVE.map((ship, index) => ({ ship, hurt: hurtDriversFor(ship, true, childRng(7, index, 'hurt')) }));
  check('ARES-VII on run 1: the scripted POD 02 at 44', JSON.stringify(rolled[0]!.hurt) === JSON.stringify([{ pod: 2, integrity: 44 }]));
  const expectCount = (pods: number, layer: number): { degraded: number; failing: number } =>
    ({ degraded: Math.ceil(pods / 5), failing: layer >= 4 ? 1 : 0 });
  let tableOk = true;
  const detail: string[] = [];
  for (const { ship, hurt } of rolled.slice(1)) {
    const pods = ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0);
    const want = expectCount(pods, ship.layer);
    const degraded = hurt.filter((driver) => driver.integrity >= DRIVER_ROLLED_MIN && driver.integrity <= DRIVER_ROLLED_MAX).length;
    const failing = hurt.filter((driver) => driver.integrity >= DRIVER_FAILING_MIN && driver.integrity <= DRIVER_FAILING_MAX).length;
    if (degraded !== want.degraded || failing !== want.failing || hurt.length !== want.degraded + want.failing) tableOk = false;
    detail.push(`${ship.id} L${ship.layer} ${pods}p: ${degraded}+${failing}`);
  }
  check('the layer table: HALCYON 1, KESTREL 3 degraded; VESPER 3 + 1 failing, LAST LIGHT 4 + 1 failing', tableOk, detail.join(' · '));
  let avoidOk = true;
  let stable = true;
  for (let seed = 0; seed < 200; seed++) {
    for (const [index, ship] of CLASSIC_FIVE.entries()) {
      for (const firstRun of [true, false]) {
        const hurt = hurtDriversFor(ship, firstRun, childRng(seed, index, 'hurt'));
        const avoid = rootSlotNeighbours(ship);
        if (hurt.some((driver) => driver.pod === ship.memory.drivers.lead || avoid.includes(driver.pod))) avoidOk = false;
        if (new Set(hurt.map((driver) => driver.pod)).size !== hurt.length) avoidOk = false;
        if (JSON.stringify(hurt) !== JSON.stringify(hurtDriversFor(ship, firstRun, childRng(seed, index, 'hurt')))) stable = false;
      }
    }
  }
  check('200 seeds: never the lead nor the drivers flanking the root slot (VESPER 8–9, LAST LIGHT 11–12), never a pod twice',
    avoidOk && JSON.stringify(rootSlotNeighbours(classicShip(3))) === '[8,9]' && JSON.stringify(rootSlotNeighbours(classicShip(4))) === '[11,12]');
  check('…and the same seed hurts the same pods by the same amounts', stable);
  const later = hurtDriversFor(classicShip(0), false, childRng(3, 0, 'hurt'));
  check('a returning unit\'s ARES-VII: one driver at 44, reseeded, never the lead', later.length === 1 && later[0]!.integrity === 44
    && later[0]!.pod !== classicShip(0).memory.drivers.lead);
  let threw = false;
  try { driverArrivalDamage({ layer: 4, pods: 3, lead: 1, avoid: [2, 3], firstRun: true, scripted: null }, createRng(1)); } catch { threw = true; }
  check('a ship with no pod left to hurt fails loudly', threw);
}

// --- Ship 1, run 1: a kid who never repairs POD 02 still meets the SCAN lesson (the review's minor 10) ------------------------
h.newRun(12);
receiveTransmission(h.store);
stepUntil(() => state().run.phase === 'flight', 30);
{
  const { ring, planet } = state().level;
  const elems = stateFromElements((ring.min + ring.max) / 2, 0.6, 0, Math.PI, planet.mu);
  h.store.update((draft) => {
    draft.orbit = { x: elems.x, y: elems.y, vx: elems.vx, vy: elems.vy };
    draft.burn.sasMode = 'retrograde';
  });
  const seen: { id: string; at: number }[] = [];
  for (let t = 0; t < LOG_SCAN_AFTER_COAST_SEC + LOG_SCAN_ASK_SEC + 12; t += 0.5) {
    h.stepFor(0.5);
    const id = shownId();
    if (seen[seen.length - 1]?.id !== id) seen.push({ id, at: state().clock.aiSec - (state().burn.coastAtAi ?? Infinity) });
  }
  const scan = seen.find((entry) => entry.id.startsWith('tut-scan-log'));
  const scanIndex = seen.findIndex((entry) => entry === scan);
  check(`POD 02 left hurt: its lesson has the coast first, then after ${LOG_SCAN_AFTER_COAST_SEC} s the SCAN lesson, then POD 02's again`,
    seen[0]?.id.startsWith('tut-hurt-driver') === true && scan !== undefined && scan.at >= LOG_SCAN_AFTER_COAST_SEC - 0.6
    && seen.slice(scanIndex + 1).some((entry) => entry.id.startsWith('tut-hurt-driver')) && drivers().find((d) => d.pod === 2)?.integrity === 44,
    seen.map((entry) => `${entry.id}@${entry.at.toFixed(1)}`).join(' → '));
  check('…missable: it stepped aside without the file known (no SCAN), and the lesson is done', !logKnown(state().run.log)
    && state().director.done.includes('tut-scan-log'));
}

// --- Ship 1, run 1: the boot and the coast ----------------------------------------------------------------------------------
h.newRun(11);
receiveTransmission(h.store);
stepUntil(() => state().run.phase === 'flight', 30);
{
  check('ship 1 boots calm: no HOLLOW block in memory, the `???` file in rack F, no key line',
    state().run.phase === 'flight' && !state().memory.some((seg) => seg.type === 'hollow') && logSeg()?.name === LOG_NAME.unknown
      && !logTexts().some((text) => text.includes('KEY FOUND')));
  const pod2 = drivers().find((driver) => driver.pod === 2);
  check('POD 02 BRANDT arrives at 44 and no other driver is hurt', pod2?.integrity === 44
    && drivers().every((driver) => driver.pod === 2 || driver.integrity === 100), drivers().map((d) => d.integrity).join(','));
  // A constructed coast: ▼ in the ring, the ship near ▲ of a big loop, so the strip WAITs for the shrink at ▼.
  const { ring, planet } = state().level;
  const rp = (ring.min + ring.max) / 2;
  const elems = stateFromElements(rp, 0.6, 0, Math.PI, planet.mu);
  h.store.update((draft) => {
    draft.orbit = { x: elems.x, y: elems.y, vx: elems.vx, vy: elems.vy };
    draft.burn.sasMode = 'retrograde';
  });
  h.stepFor(1);
  check('setup: a coast the strip WAITs on, POD 02\'s lesson first (`POD 02 WILL LAND HARD`)',
    shownId().startsWith('tut-hurt-driver'), `${shownId()}: ${shownText()}`);
  h.store.update((draft) => {
    for (const seg of draft.memory) if (seg.type === 'driver' && seg.pod === 2) seg.integrity = 100;
    draft.ui.memoryRev++;
  });
  h.stepFor(1);
  check('POD 02 settled, in a WAIT: `A FILE YOU DIDN\'T PACK — SCAN it — [TAB]` in amber',
    shownId() === 'tut-scan-log-tab' && shownText() === LOG_TEXT.scanAskTab, `${shownId()}: ${shownText()}`);
  setMode(h.store, 'memory');
  h.stepFor(0.5);
  const chipFirst = state().director.shown?.highlight === TOOL_HINT_TARGET.scan;
  pickUpTool(h.store, 'scan');
  h.stepFor(0.5);
  check('…in blue it lights the SCAN chip, then (SCAN in hand) the file', shownId() === 'tut-scan-log' && chipFirst
    && state().director.shown?.highlight === LOG_HINT_TARGET, `${shownId()} → ${state().director.shown?.highlight}`);
  const seg = logSeg();
  if (!seg) throw new Error('no log segment');
  check('the SCAN starts on the file', actionScan(h.store, seg) === null);
  stepUntil(() => logKnown(state().run.log), 10);
  h.stepFor(1);
  const texts = logTexts();
  const header = texts.findIndex((text) => text.includes(LOG_TEXT.scan(0)));
  const control = texts.indexOf(LOG_TEXT.control);
  check('the SCAN echoes `046.log · origin UNIT-046 · 12 entries · 0 found`, then CONTROL: "Please ignore it. :)"',
    header >= 0 && control > header, texts.slice(-4).join(' | '));
  check('…and the file reads `046.log` from then on (run.log.scanned)', state().run.log.scanned && logSeg()?.name === LOG_NAME.known);
  check('…the lesson is done and gone from the strip', state().director.done.includes('tut-scan-log')
    && !shownId().startsWith('tut-scan-log'), shownId());
  setMode(h.store, 'tools');
}

// --- Ship 1: the landing, the first-landing moment, the report, entry 01 ------------------------------------------------------
{
  h.events.length = 0;
  lockOn(h);
  h.stepFor(0.5);
  check('the landing opens on `◆ PODS LAND WHERE THE DOT IS` (a ship line, run 1)',
    shownId() === 'lesson-pods-dot' && shownText() === LANDING_LESSONS.dot && state().director.shown?.layer === 'ship',
    `${shownId()}: ${shownText()}`);
  let firstLaunch: { firstOfRun: boolean; descentSec: number } | null = null;
  let firstStreak = false;
  let lastDownWall = 0;
  let storyPending = false;
  const result = followLanding(h, {
    maxWall: 300,
    onTick: () => {
      for (const record of state().landing.pods) {
        if (record.fate.kind === 'falling' && firstLaunch === null) firstLaunch = record.fate.launch;
      }
      if (podStreaks(state()).some((streak) => streak.first)) firstStreak = true;
      if (state().hollow.story === 'pending') storyPending = true;
      if (state().landing.pods.every((record) => record.fate.kind === 'down') && lastDownWall === 0) lastDownWall = h.wall();
    },
  });
  const launch = firstLaunch as { firstOfRun: boolean; descentSec: number } | null;
  check('the dot lesson was on the strip before the first launch', result.texts.includes(LANDING_LESSONS.dot));
  check(`the first pod of the run falls slow (${POD_FIRST_DESCENT_SEC} s) and says so (LaunchRecord.firstOfRun)`,
    launch !== null && launch.firstOfRun && launch.descentSec === POD_FIRST_DESCENT_SEC, JSON.stringify(launch));
  check('…its streak is the bright one (landing-hud podStreaks `first`)', firstStreak);
  const entry = eventsOf('pod-entry')[0]?.payload as { first: boolean } | undefined;
  const landed = eventsOf('pod-landed').map((event) => event.payload as { firstOfRun: boolean; firstOnShip: boolean });
  check('pod-entry and pod-landed carry the first landing (the flare, the choir and stampHit, the FIRST LANDING stamp read them)',
    entry?.first === true && landed[0]?.firstOfRun === true && landed[0].firstOnShip && landed.slice(1).every((pod) => !pod.firstOfRun)
      && LANDING_STAMP_TEXT.firstLanding === 'FIRST LANDING', `${entry?.first} ${landed.map((pod) => pod.firstOfRun).join(',')}`);
  const texts = logTexts();
  const radio = groundRadioLine(1, 'OKAFOR', 'Is it morning?');
  check('CONTROL: "They\'re down! :)", then the ground: `POD 01 · OKAFOR: "Is it morning?"`',
    texts.indexOf(LANDING_BEATS.firstDown) >= 0 && texts.indexOf(radio) > texts.indexOf(LANDING_BEATS.firstDown), radio);
  check('the LANDING REPORT opens promptly: no HOLLOW story to wait for (within 5 s of the last touchdown)',
    state().run.phase === 'report' && !storyPending && lastDownWall > 0 && h.wall() - lastDownWall <= 5,
    `${state().run.phase} ${(h.wall() - lastDownWall).toFixed(1)} s`);
  check('no key opens before the report closes', state().run.log.found.length === 0 && state().ui.logReader === null);
  continueAfterReport(h.store);
  h.step();
  check('the report closed: entry 01 is found and the LOG READER opens on it by itself over the TRANSMIT screen',
    state().run.phase === 'transmit' && JSON.stringify(state().run.log.found) === '[1]' && state().ui.logReader?.entry === 1
      && state().run.log.autoOpened, `${state().run.phase} ${JSON.stringify(state().run.log)} ${JSON.stringify(state().ui.logReader)}`);
  h.store.update((draft) => { draft.ui.logReader = null; });
  h.step();
  check('…once: closed, it stays closed', state().ui.logReader === null);
}

// --- HALCYON after a real TRANSMIT ------------------------------------------------------------------------------------------
{
  h.transmit();
  check('setup: TRANSMIT ▸ boots HALCYON', state().run.phase === 'boot' && state().level.shipName === 'HALCYON', state().run.phase);
  stepUntil(() => state().run.phase === 'flight', 30);
  const texts = logTexts();
  const ecc = texts.findIndex((text) => text.startsWith('> ECC'));
  const key = texts.indexOf(LOG_TEXT.keyFound([2]));
  check('the boot names the transit hits on its ECC line, then `> 046.log · KEY FOUND · ENTRY 02`', ecc >= 0 && key > ecc,
    texts.slice(-8).join(' | '));
  check('…and entry 02 is found (story-log marks it on the boot\'s log-key)', JSON.stringify(state().run.log.found) === '[1,2]');
  const sensor = state().memory.find((seg) => seg.role === 'sensor');
  check('Sensor Interp arrives at 62 at most', sensor !== undefined && 'integrity' in sensor && sensor.integrity <= 62,
    sensor && 'integrity' in sensor ? String(sensor.integrity) : 'none');
  const hurt = drivers().filter((driver) => driver.integrity < 100);
  check('one driver arrives degraded (55–79), not the lead POD 05', hurt.length === 1 && hurt[0]!.integrity >= DRIVER_ROLLED_MIN
    && hurt[0]!.integrity <= DRIVER_ROLLED_MAX && hurt[0]!.pod !== 5, hurt.map((d) => `${d.pod}:${d.integrity}`).join(','));
  check('nothing attacks: no HOLLOW block, no root', !state().memory.some((seg) => seg.type === 'hollow'));
  h.stepFor(40);
  check('no MOVE on HALCYON (it moved to KESTREL\'s coast)', !state().run.licences.includes('move'), state().run.licences.join(','));
  // The split lesson at the landing (a constructed lock).
  h.store.update((draft) => {
    for (const seg of draft.memory) if ('integrity' in seg) seg.integrity = Math.max(seg.integrity, BAND_DEGRADED_MIN);
  });
  lockOn(h);
  h.stepFor(0.5);
  check('HALCYON\'s landing opens on `◆ 2 SITES · LZ-A 3, LZ-B 2 — don\'t overfill` (the run\'s first ship with two LZs)',
    shownId() === 'lesson-split' && shownText() === "2 SITES · LZ-A 3, LZ-B 2 — don't overfill" && state().director.shown?.layer === 'ship',
    `${shownId()}: ${shownText()}`);
  check('…and not the dot lesson again (once a run)', state().director.done.includes('lesson-pods-dot'));
}

// --- The other boots' keys, entry 12 from the root ---------------------------------------------------------------------------
{
  check('the interim keys (05 §8.2): 02, 03, 04 at ships 2–4, 10–11 at the final ship',
    JSON.stringify([0, 1, 2, 3, 4].map((index) => logEntriesAtBoot(index, classicShip(index).final))) === '[[],[2],[3],[4],[10,11]]');
  for (const [index, entries] of [[2, [3]], [3, [4]], [4, [10, 11]]] as const) {
    h.shipAlone(index, 5);
    h.store.update((draft) => { draft.run.phase = 'boot'; draft.clock.paused = false; });
    stepUntil(() => state().run.phase === 'flight', 30);
    check(`${classicShip(index).name}'s boot types \`${LOG_TEXT.keyFound(entries)}\` and finds ${entries.join(', ')}`,
      logTexts().includes(LOG_TEXT.keyFound(entries)) && entries.every((entry) => state().run.log.found.includes(entry))
        && logSeg()?.name === LOG_NAME.known,
      `${JSON.stringify(state().run.log.found)} ${logSeg()?.name}`);
  }
  // LAST LIGHT's duel won: finale.ts moves to its choice at the root's last block (constructed here).
  h.store.update((draft) => { draft.hollow.finale.phase = 'choice'; });
  h.stepFor(0.5);
  const lines = logEntryLines(12, { charge: 0 }) ?? [];
  const texts = logTexts();
  check('at the root\'s last block, entry 12 types from the root as HOLLOW\'s lines, and is found',
    lines.length === 3 && lines.every((line) => texts.includes(LOG_TEXT.rootLine(line))) && state().run.log.found.includes(12)
      && state().log.entries.filter((entry) => lines.some((line) => entry.text === LOG_TEXT.rootLine(line))).every((entry) => entry.speaker === 'hollow'),
    texts.slice(-3).join(' | '));
  h.stepFor(0.5);
  check('…once', logTexts().filter((text) => text === LOG_TEXT.rootLine(lines[0]!)).length === 1);
}

// --- The name derives from run.log (risk 5; the simulation retry) -------------------------------------------------------------
{
  h.newRun(12);
  receiveTransmission(h.store);
  stepUntil(() => state().run.phase === 'flight', 30);
  h.store.update((draft) => { draft.run.log.scanned = true; });
  h.step();
  check('a scanned log renames the chip', logSeg()?.name === LOG_NAME.known && logDisplayName(state().run.log) === LOG_NAME.known);
  // The simulation retry rebuilds ship 1's unit with `???` while the run's log stays: the chip follows the log.
  h.store.update((draft) => {
    for (const seg of draft.memory) if (seg.type === 'log') seg.name = LOG_NAME.unknown;
  });
  h.step();
  check('a rebuilt `???` chip reads `046.log` again on the next tick while the run knows the file', logSeg()?.name === LOG_NAME.known);
  h.store.update((draft) => { draft.run.log = { scanned: false, found: [], read: [], autoOpened: false }; });
  h.step();
  check('…and `???` again for a log that starts over', logSeg()?.name === LOG_NAME.unknown);
}

// --- Run 2: ship 1 stays calm: no ghost at its boot (it speaks at VESPER's, where the last unit was lost), no naming -----------
{
  const meta = recordRunEnd(recordRunStart(freshMeta(), { unit: 47, shipName: 'ARES-VII', woke: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46] }, 0),
    { unit: 47, shipName: 'VESPER', woke: 3100, stats: { moves: 4, deletes: 0 }, hollowUnits: [46], cause: 'overwritten', score: 3000 });
  const lineage = lineageOf(meta);
  h.resetTo('flight', 13);
  h.store.update((draft) => { Object.assign(draft, createInitialState({ seed: 13, phase: 'title', lineage })); });
  resetWorld();
  receiveTransmission(h.store);
  stepUntil(() => state().run.phase === 'flight', 40);
  const ghost = ghostLine(48, lineage.lastUnit);
  check('run 2: the ghost does not type at ship 1\'s boot (05 §3.5: never at ship 1)', ghost !== null && !logTexts().includes(ghost)
    && !state().log.entries.some((entry) => entry.speaker === 'hollow') && !state().run.ghostSpoken, ghost ?? 'no ghost');
  check('…and HOLLOW stays unnamed (no root on a calm ship to rename; it names itself where it arrives)',
    !state().run.hollowNamed && state().run.phase === 'flight');
}

finish();
