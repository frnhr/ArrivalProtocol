// Slice 1a, Track SIM: the landing from the lock to the LANDING REPORT (01-landing §3.10, plan §5). All five ships from
// a constructed lock (harness-landing lockOn: no capture flown), landed by the strip (followLanding): every pod down (in
// an LZ with room, or off-site after a WIDE DROP once slice 1b widened the drop), the report reached, and the real
// seconds per window printed as INFO (target 24–30, §3.2); a PARTIAL orbit with e > 0 whose second LZ is out of band
// (review M1) lands too, mislanded into the in-band LZ. Then the
// soft fails: END LANDING parks; an eaten driver can't launch and ends parked, eaten; a ship that left orbit takes its
// pods (NOT LAUNCHED); a Core lost while landing parks every pod; HOLLOW's story beat and LAST LIGHT's duel hold the
// report (the duel's L0 on the strip). Last, the pooled receiver (§3.16) that lays out the unit at the next ship.
import { check, finish } from './checks';
import { followLanding, landInstantly, lockOn } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { endLanding, forceLandAll } from '@systems/landing';
import { endFlight } from '@systems/orbit-sim';
import { getDropSolution } from '@systems/drop-cache';
import { getPrediction } from '@systems/predict';
import { countdownChip } from '@systems/flight-hud';
import { groundTrackModel, miniHudLanding } from '@systems/landing-hud';
import { landingResult, onTargetTally, canEverLaunch } from '@systems/landing-rules';
import { shipLost, shipOutcomeOf, shipResultOf } from '@systems/run';
import { packUnit, layoutCarried, freshUnitRacks, RACK_E_START } from '@systems/carry';
import { replaceRange, requireAddr, newSegId } from '@systems/memory-ops';
import { recordDriverLost } from '@state/actions';
import { driversInMemory } from '@state/selectors';
import { getShip, SHIPS } from '@data/ships';
import { DRIVER_RULES } from '@data/script';
import { FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, MEMORY_TOTAL_BLOCKS, lastPodRackTrailingFree } from '@data/memory';
import { UNIT_TAIL_BLOCKS } from '@data/tuning';
import type { GameState, ShipOutcome } from '@state/schema';
import type { HollowSegment, Segment } from '@/types/segment';

const h = createHarness7(1);
const state = (): GameState => h.store.getState();

// A ship alone, its HOLLOW asleep for good and its driver lesson done, so the strip shows the landing; LAST LIGHT's duel
// is settled first (the finale's hold has its own check below).
function boardShip(index: number, seed = 1): void {
  if (index === 0) h.resetTo('flight', seed);
  else h.shipAlone(index, seed);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault');
    if (draft.landing.finalShip) draft.hollow.finale.phase = 'purged';
    // Slice 1b (risk 5): the engine is open in landing, so VESPER's failing Thrust Ctrl fires there too, and this kid
    // presses no SPACE: unswapped, its RETRO bursts take ▼ under the planet in about 90 s. The flight's tutorial has the
    // kid SWAP Thrust.alt in first (wp10 vesper-flow); engine-landing.test covers a burst during the landing.
    for (const seg of draft.memory) if (seg.role === 'thrust-ctrl' && 'integrity' in seg) seg.integrity = 100;
  });
}

function fates(): string {
  return state().landing.pods.map((record) => {
    const fate = record.fate;
    if (fate.kind === 'down') return `${record.pod}:${fate.touchdown.place}${fate.touchdown.lz ? `@${fate.touchdown.lz}` : ''}${fate.touchdown.touch === 'hard' ? '!' : ''}`;
    if (fate.kind === 'parked') return `${record.pod}:parked(${fate.why})`;
    return `${record.pod}:${fate.kind}`;
  }).join(' ');
}

// --- Every ship, by the strip --------------------------------------------------------------------------------------------
for (let index = 0; index < SHIPS.length; index++) {
  boardShip(index);
  lockOn(h);
  const name = state().level.shipName;
  const result = followLanding(h, { maxWall: 600 });
  // Slice 1b: the drop is as wide as the files make it (every ship arrives with Sensor Interp at 78, ×1.5, and some with
  // hurt drivers), so a sure window may take fewer pods than the bay holds and the strip's next launch is L5's `WIDE
  // DROP, some may miss`. Ends and rows, not points (plan §4): every pod down, a miss only after a WIDE DROP line, and
  // never most of them.
  const pods = state().landing.pods;
  const missed = pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.lz === null);
  const allDown = pods.every((record) => record.fate.kind === 'down');
  const wideSaid = result.texts.some((text) => text.includes('WIDE DROP'));
  // The hurt drivers (ARES-VII's POD 02 at 44 on run 1) were left unrepaired: they land hard, every other pod soft.
  const hurt = new Set(state().landing.hurt);
  const touchOk = pods.every((record) => record.fate.kind === 'down'
    && record.fate.touchdown.touch === (hurt.has(record.pod) ? 'hard' : 'soft'));
  const tally = onTargetTally(state());
  check(`${name}: landed by the strip to the LANDING REPORT, every pod down, a miss only after WIDE DROP (${missed.length} missed)`,
    state().run.phase === 'report' && allDown && touchOk && (missed.length === 0 || wideSaid) && missed.length <= pods.length / 4
    && !(tally.earned && hurt.size > 0), `${state().run.phase} · ${fates()}`);
  check(`${name}: the strip never said IMPACT, scatter or deorbit`, !result.texts.some((text) => /impact|scatter|deorbit/i.test(text)));
  const lzCount = state().landing.lzs.length;
  check(`${name}: about one window per LZ (${result.windows} for ${lzCount})`, result.windows >= lzCount && result.windows <= lzCount + 2,
    `${result.windows} windows, ${result.launchPresses} [L], ${result.skipPresses} [F]`);
  console.log(`INFO  ${name}: ${result.wall.toFixed(1)} real s for ${result.windows} windows = ${(result.wall / result.windows).toFixed(1)} s per window (target 24–30)`);
}

// --- A PARTIAL orbit, e > 0, with one LZ out of band (review M1, p2) --------------------------------------------------------
// HALCYON ACCEPTed on ▼ 5,500 km, e 0.4, ω 260°: LZ-A's window is in the band, LZ-B's never is. Once LZ-A is full the strip
// used to loop `LZ-A FULL — hold the pods for LZ-B` / `WAIT — LZ-A … [F]` for ever. Now it says NO ROOM IN THE BAND and
// offers the mislanded launch, which the kid takes: the pods come down in LZ-A (the late ones MISLANDED), never in LZ-B.
// Slice 1b: the drop is wider (Sensor Interp at 78), so one of the late launches may come down off-site beside LZ-A.
{
  boardShip(1);
  lockOn(h, { r: 5500, e: 0.4, argPeriDeg: 260, status: 'accepted' });
  // Every reader of the launch moment names in-band windows only (review M3): the chip, the mini-HUD, the ground track.
  const namedB: string[] = [];
  const onTick = (): void => {
    if (state().run.phase !== 'landing') return;
    const sol = getDropSolution();
    const chip = countdownChip(state(), getPrediction(), sol);
    const mini = miniHudLanding(state(), sol);
    const ahead = groundTrackModel(state(), sol).strip.ahead;
    if (chip?.event.includes('LZ-B')) namedB.push(`chip ${chip.event}`);
    if (mini?.window?.text.includes('LZ-B')) namedB.push(`mini ${mini.window.text}`);
    if (ahead.some((item) => item.lz === 'LZ-B')) namedB.push('ground track');
  };
  const result = followLanding(h, { maxWall: 300, onTick });
  const pods = state().landing.pods;
  const downNotB = pods.every((record) => record.fate.kind === 'down' && record.fate.touchdown.lz !== 'LZ-B')
    && pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.lz === null).length <= 1;
  const mislanded = state().landing.pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.place === 'mislanded').length;
  check('HALCYON PARTIAL (e 0.4, LZ-B out of band): landed by the strip to the LANDING REPORT, every pod down by LZ-A, none in LZ-B',
    state().run.phase === 'report' && downNotB && mislanded > 0, `${state().run.phase} after ${result.wall.toFixed(0)} s · ${fates()}`);
  check('…the strip said NO ROOM IN THE BAND with the mislanded launch, and never held the pods for the out-of-band LZ-B',
    result.texts.some((text) => text.startsWith('NO ROOM IN THE BAND — [L]')) && !result.texts.some((text) => text.includes('for LZ-B')),
    [...new Set(result.texts.map((text) => text.replace(/\d/g, '#')))].join(' | '));
  check('…the countdown chip, the mini-HUD and the ground track never count down to the out-of-band LZ-B', namedB.length === 0,
    [...new Set(namedB)].join(', '));
}

// --- END LANDING parks -----------------------------------------------------------------------------------------------------
boardShip(0, 2);
lockOn(h);
h.stepFor(0.5);
check('END LANDING ends the landing', endLanding(h.store) === null && state().landing.ended === 'end-landing');
check('...and parks every pod aboard in orbit, no time', state().landing.pods.every((record) => record.fate.kind === 'parked' && record.fate.why === 'no-time'),
  fates());
h.stepUntil(() => state().run.phase !== 'landing', 10);
check('...then the LANDING REPORT, the parked pods in the result', state().run.phase === 'report'
  && landingResult(state(), 'locked').parked.length === state().landing.pods.length);

// --- An eaten driver: CAN'T LAUNCH, then parked, eaten ----------------------------------------------------------------------
function eat(pod: number): void {
  const driver = driversInMemory(state()).find((candidate) => candidate.pod === pod);
  if (!driver) throw new Error(`eat: no driver for pod ${pod}`);
  const memory = state().memory;
  const block: HollowSegment = { id: newSegId('hollow'), name: 'HOLLOW', type: 'hollow', size: driver.size, root: false, locked: false, owner: 'HOLLOW', atePod: pod };
  replaceRange(memory, requireAddr(memory, driver), requireAddr(memory, driver) + driver.size, [block], { opId: null, own: [driver] });
  h.store.update((draft) => { recordDriverLost(draft, driver, 'eaten'); draft.ui.memoryRev++; });
}
{
  boardShip(1, 3);
  lockOn(h);
  eat(2);
  check('an eaten driver\'s pod can never launch', !canEverLaunch(state(), 2) && canEverLaunch(state(), 1));
  const result = followLanding(h, { maxWall: 400 });
  const pod2 = state().landing.pods.find((record) => record.pod === 2)!;
  check('the others land by the strip; the strip says NO POD CAN LAUNCH and the kid ends it', state().run.phase === 'report'
    && result.texts.some((text) => /NO POD CAN LAUNCH/.test(text)), `${fates()} · ended ${state().landing.ended}`);
  check('the eaten pod is parked in orbit: eaten, restorable', pod2.fate.kind === 'parked' && pod2.fate.why === 'eaten' && pod2.fate.restorable,
    JSON.stringify(pod2.fate));
}
{
  // Nobody at the controls: the landing ends itself LANDING_NONE_LEFT_SEC after the last driver is gone (risk 7).
  boardShip(0, 4);
  lockOn(h);
  for (const record of state().landing.pods) eat(record.pod);
  h.stepUntil(() => state().landing.ended !== null, 20);
  check('every driver eaten: the landing ends itself (no-driver-left)', state().landing.ended === 'no-driver-left', String(state().landing.ended));
}

// --- Outcomes that left orbit, and a Core lost while landing ------------------------------------------------------------
{
  boardShip(2, 5);
  lockOn(h);
  h.stepFor(0.2);
  const byOutcome = (outcome: ShipOutcome): string[] => [...new Set(landingResult(state(), outcome).pods.map((summary) => summary.fate))];
  check('crashed, escaped or abandoned: every pod aboard is NOT LAUNCHED',
    (['crashed', 'escaped', 'abandoned'] as const).every((outcome) => byOutcome(outcome).join() === 'not-launched'));
  check('stranded or emergency (still in orbit): parked', byOutcome('stranded').join() === 'parked' && byOutcome('emergency').join() === 'parked');
  h.store.update((draft) => { draft.run.coreLost = true; });
  const outcome = shipOutcomeOf(state());
  const result = shipResultOf(state(), outcome, 0);
  check('a Core lost while landing: the ship is lost, and its result parks every pod', shipLost(state()) && outcome === 'emergency'
    && result.parked.length === state().landing.pods.length && result.notLaunched === 0, `${outcome} · parked ${result.parked.length}`);
}

{
  // The ending is written into the pods the moment it is known (before the LOST card), not only into the result.
  boardShip(1, 8);
  endFlight(h.store, 'stranded');
  check('STRANDED parks the pods aboard in orbit at once', state().landing.pods.every((record) => record.fate.kind === 'parked'), fates());
  boardShip(1, 8);
  endFlight(h.store, 'crashed');
  check('CRASHED: the pods aboard are NOT LAUNCHED at once', state().landing.pods.every((record) => record.fate.kind === 'not-launched'), fates());
}

// --- HOLLOW's story and the finale hold the report ----------------------------------------------------------------------
{
  boardShip(1, 6);
  lockOn(h);
  h.store.update((draft) => { draft.hollow.story = 'pending'; });
  forceLandAll(h.store);
  h.stepFor(5);
  check('HOLLOW\'s story beat holds the LANDING REPORT', state().run.phase === 'landing' && state().landing.lingerAiSec === 0);
  h.store.update((draft) => { draft.hollow.story = 'told'; });
  h.stepFor(0.2);
  check('...which follows once it is told', state().run.phase === 'report');
}
{
  boardShip(4, 7);
  h.store.update((draft) => { draft.hollow.finale.phase = 'none'; });
  lockOn(h);
  h.stepFor(0.2);
  check('LAST LIGHT: the duel opens at the lock', state().hollow.finale.phase === 'duel');
  landInstantly(h, 4);
  check('every pod down before the root: the strip says EVERY POD IS DOWN — now DELETE THE ROOT', state().run.phase === 'landing'
    && h.shown()?.id === 'landing-L0', h.shown()?.text ?? '');
  h.store.update((draft) => { draft.hollow.finale.phase = 'purged'; });
  h.stepFor(2);
  check('...and the LANDING REPORT comes after the duel', state().run.phase === 'report');
}

// --- The pooled receiver (§3.16) --------------------------------------------------------------------------------------------
{
  const freshFiles = [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
    .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item)).map((item) => structuredClone(item) as Segment);
  const contiguous = (segs: readonly Segment[]): boolean => {
    const firstFree = segs.findIndex((seg) => seg.type === 'free');
    return firstFree < 0 || segs.slice(firstFree).every((seg) => seg.type === 'free');
  };
  // A ship whose seeds hunt tools (VESPER) keeps one free run inside the block: the hunting ground before its first tool
  // (carry.ts huntingGapBlocks, review issue 5).
  const withoutHuntingGround = (segs: readonly Segment[]): Segment[] => {
    const firstTool = segs.findIndex((seg) => seg.type === 'fs-tool');
    return segs.filter((seg, index) => !(index === firstTool - 1 && seg.type === 'free'));
  };
  for (const ship of SHIPS.filter((candidate) => candidate.arrival)) {
    const racks = freshUnitRacks(ship);
    const hunts = ship.hollow.seed?.target === 'near-tools';
    check(`${ship.name}: the unit lands as one block from rack E's start, files then charge, then free${hunts ? ' (a hunting ground before the tools)' : ''}`,
      racks.startAddr === RACK_E_START && contiguous(hunts ? withoutHuntingGround(racks.segs) : racks.segs)
      && hunts === (racks.segs.length !== withoutHuntingGround(racks.segs).length) && racks.segs.some((seg) => seg.type === 'redundancy')
      && racks.segs.reduce((sum, seg) => sum + seg.size, 0) === MEMORY_TOTAL_BLOCKS - RACK_E_START,
      racks.segs.map((seg) => `${seg.type}:${seg.size}`).join(' '));
  }
  const ship = getShip(4);
  const packet = packUnit(freshFiles, 200, []);
  const receiver = MEMORY_TOTAL_BLOCKS - RACK_E_START;
  const tail = Math.min(UNIT_TAIL_BLOCKS, lastPodRackTrailingFree(ship));
  const files = packet.filesBlocks;
  const fits = layoutCarried(packet, receiver - files + 10, ship);
  check(`a block 10 longer than the receiver starts 10 blocks into the last pod rack's tail`, fits.racks.startAddr === RACK_E_START - 10
    && fits.overflowLost === 0, `start ${fits.racks.startAddr}`);
  const over = layoutCarried(packet, receiver - files + tail + 7, ship);
  check(`...never more than the tail (${tail}): the rest of the charge is lost, loudly`, over.racks.startAddr === RACK_E_START - tail
    && over.overflowLost === 7 && over.chargeBlocks === receiver + tail - files, `start ${over.racks.startAddr}, lost ${over.overflowLost}`);
  let threw = false;
  try { layoutCarried({ ...packet, rackF: [...packet.rackF, { id: 'x', name: 'Huge', type: 'skill', size: receiver + tail } as unknown as Segment] }, 0, ship); } catch { threw = true; }
  check('files that do not fit the room throw', threw);
}

finish();
