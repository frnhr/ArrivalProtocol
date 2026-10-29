// Slice 1a, the logic fixes after the full review (plan Deviations, "Review fixes"). Each section is one bug, built
// straight from a state (lockOn: no capture flown), so the suite stays fast:
// • a driver lost after the landing ended (HOLLOW, the zones, THE DEAL's ACCEPT, the instant landing) updates its parked
//   pod instead of throwing, and THE DEAL is never offered, nor left standing, once the landing has ended;
// • ship 1's scripted fight lives in state (hollow.scriptTargetId), and the LANDING REPORT waits for it after an early
//   END LANDING, so `> ...047?` is never skipped;
// • drivers that can't launch and can't be repaired end the landing (L12, then the risk-7 auto-end), and the root's
//   DELETE is read from a selector (the pure table imports no stateful module);
// • the launch moment: GET READY's beeps only while a pod can launch;
// • L0 and 'all-pods-down' when some pods were parked; run 1's first pod named on its launch record;
// • the minors: FUEL noted at the end of the landing (N3), the drop cache keyed on the orbit epoch and ω (N4), LOAD NEXT
//   and END LANDING refusals (N7), RUN END's NOBODY WOKE judged on pods down (N2);
// • issue 5: on a fresh unit VESPER's tool-hunting seed borders a tool (the pooled receiver's hunting ground).
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { endLanding, forceLandAll, setLoadNext } from '@systems/landing';
import { requestSkip } from '@systems/pace';
import { setPaused } from '@systems/clock';
import { getDropSolution } from '@systems/drop-cache';
import { computeDropSolution } from '@systems/landing-solve';
import { dropFactors, nextToLaunch } from '@systems/landing-rules';
import { capabilitiesNow } from '@systems/capabilities';
import { runEndModel } from '@systems/run-end';
import { shipResultOf } from '@systems/run';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import { getShip } from '@data/ships';
import { stateFromElements } from '@/types/orbit';
import { freeSegment, mergeAdjacentFree, segmentStarts } from '@systems/memory-ops';
import { packUnit, layoutCarried } from '@systems/carry';
import { FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F } from '@data/memory';
import { SEED_BLOCKS, SEED_TOOL_GAP_BLOCKS } from '@data/tuning';
import type { Segment } from '@/types/segment';
import { acceptDeal, infectNow, rootDeleteProgress, theRoot, nearToolsSeedSpot, isWall } from '@systems/hollow';
import { actionDelete } from '@state/actions';
import { offerDealNow } from '@systems/hollow-deal';
import { recordDriverLost, setIntegrity } from '@state/actions';
import { driversInMemory, rootDeleteRunning, rootDeletable, repairPossible } from '@state/selectors';
import { podRecord } from '@systems/landing-rules';
import { DRIVER_RULES, RUN_END_NOBODY_WOKE } from '@data/script';
import { HOLLOW_STORY, HOLLOW_FINALE } from '@data/hollow-text';
import { LANDING_NONE_LEFT_SEC } from '@data/tuning';
import { isAiFile } from '@state/selectors';
import type { DriverSegment } from '@/types/segment';

const h = createHarness7(5);
const state = () => h.store.getState();

// The ship alone, locked in the middle of its ring, its tutorial asks already met (the hurt-driver lesson would pause
// nothing here, but keeps the strip quiet).
function landingOn(ship: number, seed = 5): void {
  if (ship === 0) h.newRun(seed);
  else h.shipAlone(ship, seed);
  h.store.update((draft) => { draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id)); });
  lockOn(h);
  h.stepFor(0.2);
}

function untilReport(maxWall: number): string | null {
  try {
    const end = h.wall() + maxWall;
    while (state().run.phase === 'landing' && h.wall() < end) h.step();
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

// --- 1. A driver lost after the landing ended (review: recordDriverLost threw "pod N is parked, not aboard") ----------
{
  // END LANDING with an infected driver near 0: HOLLOW eats it during the linger (p1, HALCYON / KESTREL / VESPER).
  for (const ship of [1, 3]) {
    landingOn(ship);
    const driver = driversInMemory(state())[0]!;
    infectNow(h.store, driver);
    h.store.update((draft) => { setIntegrity(draft.memory.find((seg) => seg.id === driver.id) as DriverSegment, 3); });
    endLanding(h.store);
    const parkedAtEnd = podRecord(state(), driver.pod).fate;
    const threw = untilReport(30);
    const record = podRecord(state(), driver.pod);
    check(`${state().level.shipName}: END LANDING, then HOLLOW eats a parked pod's driver: no throw, the report opens`,
      threw === null && state().run.phase === 'report', threw ?? state().run.phase);
    check('…the pod was parked no-time at the end, and is parked eaten (restorable) once its driver is eaten',
      parkedAtEnd.kind === 'parked' && parkedAtEnd.why === 'no-time' && record.fate.kind === 'parked' && record.fate.why === 'eaten'
      && record.fate.restorable && record.driverLost === 'eaten', JSON.stringify(record.fate));
  }
  // A zone taking a parked pod's driver to 0 (zones.ts applyDamage), straight on a draft.
  landingOn(2);
  endLanding(h.store);
  const victim = driversInMemory(state())[0]!;
  h.store.update((draft) => { recordDriverLost(draft, victim, 'dead'); });
  const dead = podRecord(state(), victim.pod);
  check('a zone takes a parked pod\'s driver to 0: parked dead, not restorable (MERGE leaves it parked)',
    dead.fate.kind === 'parked' && dead.fate.why === 'dead' && !dead.fate.restorable && dead.driverLost === 'dead', JSON.stringify(dead.fate));
  // The test harness's instant landing parks an infected driver's pod, which HOLLOW then eats.
  landingOn(1);
  const sick = driversInMemory(state())[0]!;
  infectNow(h.store, sick);
  h.store.update((draft) => { setIntegrity(draft.memory.find((seg) => seg.id === sick.id) as DriverSegment, 2); });
  forceLandAll(h.store);
  const threw = untilReport(30);
  check('the instant landing parks an infected driver\'s pod, HOLLOW eats it: no throw, parked eaten',
    threw === null && podRecord(state(), sick.pod).fate.kind === 'parked' && podRecord(state(), sick.pod).driverLost === 'eaten', threw ?? '');
}

// --- 1b. THE DEAL and the end of the landing (p3) --------------------------------------------------------------------
{
  landingOn(3);
  const named = driversInMemory(state())[0]!;
  offerDealNow(h.store, named);
  endLanding(h.store);
  h.stepFor(0.1);
  const deal = state().hollow.deal;
  check('VESPER: a deal standing when the landing ends is withdrawn (invalidated), not left to answer',
    deal.phase === 'done' && state().run.stats.deal?.outcome === 'invalidated', `${deal.phase} / ${state().run.stats.deal?.outcome}`);
  let threw: string | null = null;
  try { acceptDeal(h.store, driversInMemory(state()).find((driver) => driver.pod === named.pod)!); } catch (error) { threw = (error as Error).message; }
  check('…and an ACCEPT that lands anyway eats a parked pod\'s driver without throwing (parked eaten)',
    threw === null && podRecord(state(), named.pod).fate.kind === 'parked' && podRecord(state(), named.pod).driverLost === 'eaten', threw ?? '');
  // Never offered after the end: HOLLOW awake with a driver at its front, the landing over.
  landingOn(3, 6);
  endLanding(h.store);
  h.store.update((draft) => { draft.hollow.phase = 'awake'; });
  h.stepFor(3);
  check('…and never offered once the landing has ended (HOLLOW awake, drivers at its front)',
    state().hollow.deal.phase === 'none' && state().run.stats.deal === null, state().hollow.deal.phase);
}

// --- 2. Ship 1's undecided scripted fight holds the report (review: END LANDING first skipped `> ...047?`) ------------
{
  landingOn(0);
  const end = h.wall() + 30;
  while (state().hollow.scriptTargetId === null && h.wall() < end) h.step();
  const targetId = state().hollow.scriptTargetId;
  const target = state().memory.find((seg) => seg.id === targetId);
  check('ARES-VII: the scripted bite records its target in state (hollow.scriptTargetId)', target?.type === 'driver' && target.infected !== undefined,
    String(targetId));
  if (target?.type === 'driver') h.store.update((draft) => { setIntegrity(draft.memory.find((seg) => seg.id === targetId) as DriverSegment, 6); });
  endLanding(h.store);
  untilReport(60);
  const said = h.log().some((entry) => entry.text === HOLLOW_STORY.noticed(state().mission.transmissionNum));
  check('…END LANDING before the fight is decided: the report waits for the fight and its story (`> ...047?` is said first)',
    state().run.phase === 'report' && state().hollow.story === 'told' && said && state().hollow.scriptTargetId === null,
    `${state().run.phase}, story ${state().hollow.story}, said ${said}`);
}

// --- 5. Drivers that can never launch end the landing (review M2, p4) -----------------------------------------------
{
  landingOn(1);
  h.store.update((draft) => {
    for (const seg of draft.memory) if (seg.type === 'driver') setIntegrity(seg, 10);
    for (const seg of draft.memory) if (seg.type === 'redundancy') seg.used = 0;
  });
  h.step();
  const shown = h.shown();
  check('HALCYON, every driver at 10% and no REPAIR CHARGE: the strip says L12 (NO POD CAN LAUNCH), not L11 or WAIT',
    !repairPossible(state()) && shown?.id === 'landing-L12', `${shown?.id}: ${shown?.text}`);
  h.stepFor(LANDING_NONE_LEFT_SEC + 0.5);
  check('…and the landing ends by itself after LANDING_NONE_LEFT_SEC (no-driver-left)', state().landing.ended === 'no-driver-left',
    String(state().landing.ended));
}

// --- N6. The root's DELETE from a selector (LAST LIGHT's duel) ------------------------------------------------------
{
  landingOn(4);
  h.stepFor(0.2);
  const root = theRoot(state().memory);
  check('LAST LIGHT: the duel opens, the root is deletable, its DELETE not running', state().hollow.finale.phase === 'duel' && root !== null
    && rootDeletable(state()) && !rootDeleteRunning(state()), state().hollow.finale.phase);
  const refused = root === null ? 'no root' : actionDelete(h.store, root);
  h.step();
  check('…DELETE on the root: selectors rootDeleteRunning agrees with the op\'s own progress', refused === null && rootDeleteRunning(state())
    && rootDeleteProgress(state()) !== null, String(refused));
}

// --- M3. GET READY's beeps count down only while a pod can launch ---------------------------------------------------
{
  landingOn(1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    for (const seg of draft.memory) if (seg.type === 'driver') seg.state = 'offline';
  });
  const before = h.events.length;
  const skipped = requestSkip(h.store).ok;
  h.stepUntil(() => state().clock.skipWarp === null && state().clock.pace !== 'skip', 30);
  h.stepFor(12);
  const beeps = h.events.slice(before).filter((event) => event.name === 'countdown-beep' && (event.payload as { kind: string }).kind === 'window');
  check('HALCYON, every driver offline (they will launch later, none can now): the SKIP still waits on the window, but no 5…1 beeps',
    skipped && nextToLaunch(state()) === null && beeps.length === 0, `${skipped ? 'skipped' : 'no skip'}, ${beeps.length} beeps`);
}

// --- 3. L0 and 'all-pods-down' when some pods were parked ------------------------------------------------------------
{
  // LAST LIGHT: two pods launched and down, END LANDING parks the rest: the duel's wait does not say EVERY POD IS DOWN.
  landingOn(4);
  h.stepFor(0.2);
  forceLandAllButFirst();
  endLanding(h.store);
  h.stepFor(0.6);
  check('LAST LIGHT, pods parked by END LANDING, the root to delete: L0 says NO POD LEFT TO LAUNCH, not EVERY POD IS DOWN',
    state().run.phase === 'landing' && h.shown()?.text === HOLLOW_FINALE.stripWaitsNobody, h.shown()?.text ?? '');
  // 'all-pods-down' carries the parked count (audio-cues plays lockArp only for none): every pod but the parked ones
  // falling, due on the next tick.
  const lastDownWith = (parkedPods: number): number[] => {
    landingOn(2, 7);
    const lz = state().landing.lzs[0]!;
    h.store.update((draft) => {
      for (const record of draft.landing.pods) {
        record.fate = record.pod <= parkedPods ? { kind: 'parked', why: 'no-time', restorable: false } : {
          kind: 'falling',
          launch: {
            atTSec: draft.clock.tSec, atAi: draft.clock.aiSec - 10, source: 'player', launchRadius: 6000, dotRad: lz.centreRad, halfWidthKm: 0,
            aimLz: lz.label, landingRad: lz.centreRad, predictedTouch: 'soft', driverIntegrity: 100, arc: [], descentSec: 3.5, firstOfRun: false,
          },
        };
      }
      draft.memory.forEach((seg, index) => { if (seg.type === 'driver') draft.memory[index] = freeSegment(seg.size); });
      mergeAdjacentFree(draft.memory);
      draft.landing.ended = 'end-landing';
    });
    const before = h.events.length;
    h.step();
    return h.events.slice(before).filter((event) => event.name === 'all-pods-down').map((event) => (event.payload as { parked: number }).parked);
  };
  const someParked = lastDownWith(2);
  const noneParked = lastDownWith(0);
  check('…and \'all-pods-down\' says how many were parked (2), and 0 when every pod landed', someParked.join() === '2' && noneParked.join() === '0',
    `${someParked.join()} / ${noneParked.join()}`);
}

// LAST LIGHT helper: every pod but POD 01 lands at once (forceLandAll lands only launchable drivers).
function forceLandAllButFirst(): void {
  h.store.update((draft) => { for (const seg of draft.memory) if (seg.type === 'driver' && seg.pod === 1) seg.state = 'offline'; });
  forceLandAll(h.store);
}

// --- N8. Run 1's first pod is named on its launch record ---------------------------------------------------------------
{
  landingOn(0, 9);
  const before = h.events.length;
  forceLandAll(h.store);
  h.step();
  const records = state().landing.pods.flatMap((record) => (record.fate.kind === 'down' ? [record.fate.launch] : []));
  check('run 1: only the very first pod\'s launch record says firstOfRun', records.length > 1 && records.filter((launch) => launch.firstOfRun).length === 1
    && records[0]?.firstOfRun === true, records.map((launch) => String(launch.firstOfRun)).join(','));
  check('…\'pod-entry\' carries it (no arc here: forceLandAll\'s pods never enter, so nothing claims first)',
    h.events.slice(before).filter((event) => event.name === 'pod-entry').every((event) => (event.payload as { first: boolean }).first === false));
}

// --- N3. FUEL is noted when the landing ends, and cleared when MERGE reopens it ------------------------------------------
{
  landingOn(1);
  h.store.update((draft) => { draft.burn.fuelPct = 61; });
  endLanding(h.store);
  h.store.update((draft) => { draft.burn.fuelPct = 12; });
  check('FUEL is noted at END LANDING (61), not when the report opens', state().landing.fuelAtEndPct === 61, String(state().landing.fuelAtEndPct));
}

// --- N7. LOAD NEXT once the landing has ended, END LANDING while paused ---------------------------------------------------
{
  landingOn(1);
  const pod = driversInMemory(state())[0]!.pod;
  setPaused(h.store, true);
  const paused = endLanding(h.store);
  setPaused(h.store, false);
  endLanding(h.store);
  check('END LANDING refuses while paused; LOAD NEXT refuses once the landing has ended', paused === 'PAUSED' && state().landing.ended === 'end-landing'
    && setLoadNext(h.store, pod) === 'LANDING OVER', String(paused));
}

// --- N4. The drop cache: a new orbit epoch re-solves at once; ω is in the dot track's key ------------------------------
{
  landingOn(1);
  const before = getDropSolution();
  h.store.update((draft) => {
    const { planet, ring } = draft.level;
    const orbit = stateFromElements((ring.min + ring.max) / 2, 0.2, 1.1, 0, planet.mu);
    draft.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
    draft.landing.orbitEpoch++;
  });
  check('a bumped orbit epoch re-solves at once (no stale solution for the old orbit)', getDropSolution() !== before);
  // Rotate the orbit (same ▼ and e, ω moved) without a bump: the next refresh must solve a fresh dot track.
  h.store.update((draft) => {
    const { planet, ring } = draft.level;
    const orbit = stateFromElements((ring.min + ring.max) / 2, 0.2, 2.6, 0, planet.mu);
    draft.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
  });
  h.stepFor(0.25);
  const cached = getDropSolution()!;
  const now = state();
  const fresh = computeDropSolution({
    state: now.orbit, tSec: now.clock.tSec, mu: now.level.planet.mu, R: now.level.planet.R, ring: now.level.ring, lzs: now.landing.lzs,
    factors: dropFactors(capabilitiesNow(now), nextToLaunch(now)), solution: true,
  });
  const same = cached.windows.length === fresh.windows.length && cached.windows.every((w, i) => w.lz === fresh.windows[i]!.lz
    && Math.abs(cached.asOfTSec + w.openInSec - (fresh.asOfTSec + fresh.windows[i]!.openInSec)) < 1);
  check('…and an orbit rotated in place (ω only) gets a fresh dot track: the cached windows match a fresh solve', same,
    `${cached.windows.map((w) => `${w.lz}@${w.openInSec.toFixed(0)}`).join(' ')} vs ${fresh.windows.map((w) => `${w.lz}@${w.openInSec.toFixed(0)}`).join(' ')}`);
}

// --- N2. NOBODY WOKE is judged on pods down, not on landedInLz ---------------------------------------------------------
{
  const LAST = 4;
  const world = createInitialState({ seed: 3, shipIndex: LAST, carried: freshUnitRacks(getShip(LAST)) });
  world.burn.status = 'locked';
  const lz = world.landing.lzs[0]!;
  // Every pod down, all MISLANDED (worth 150 each): people woke, though nobody landed in an LZ with room.
  for (const record of world.landing.pods) {
    record.fate = {
      kind: 'down',
      launch: {
        atTSec: 0, atAi: 0, source: 'player', launchRadius: 6000, dotRad: lz.centreRad, halfWidthKm: 0, aimLz: lz.label,
        landingRad: lz.centreRad, predictedTouch: 'soft', driverIntegrity: 100, arc: [], descentSec: 3.5, firstOfRun: false,
      },
      touchdown: { place: 'mislanded', lz: lz.label, points: 150, missKm: null, touch: 'soft', atAi: 1 },
    };
  }
  world.memory = world.memory.filter((seg) => seg.type !== 'driver');
  world.run.ships.push(shipResultOf(world, 'locked', 1));
  world.run.phase = 'end';
  world.run.endCause = 'won-purge';
  const model = runEndModel(world);
  check('RUN END: a won PURGE over a LAST LIGHT whose pods all came down mislanded is not NOBODY WOKE (victory)',
    model.title !== RUN_END_NOBODY_WOKE.title && model.tone === 'victory', `${model.title} · ${model.tone}`);
  for (const record of world.landing.pods) record.fate = { kind: 'parked', why: 'eaten', restorable: true };
  world.run.ships = [shipResultOf(world, 'locked', 0)];
  check('…and one whose pods were all parked still is', runEndModel(world).title === RUN_END_NOBODY_WOKE.title, runEndModel(world).title);
}

// --- Issue 5. VESPER's tool-hunting seed borders a tool on a fresh unit ------------------------------------------------
{
  const VESPER = 3;
  const world = createInitialState({ seed: 4, shipIndex: VESPER, carried: freshUnitRacks(getShip(VESPER)) });
  const memory = world.memory;
  const starts = segmentStarts(memory);
  const spot = nearToolsSeedSpot(memory, []);
  const gapIndex = spot === null ? -1 : memory.findIndex((seg) => seg.id === spot.gapId);
  const right = memory[gapIndex + 1];
  const left = memory[gapIndex - 1];
  const nearSide = spot === null ? -1 : starts[gapIndex + 1]! - (spot.startAddr + SEED_BLOCKS);
  const farSide = spot === null ? -1 : spot.startAddr - starts[gapIndex]!;
  check('a fresh unit on VESPER: the seed spot borders a filesystem tool, SEED_TOOL_GAP_BLOCKS from it',
    right?.type === 'fs-tool' && nearSide === SEED_TOOL_GAP_BLOCKS, `${right?.name} at ${nearSide}`);
  check('…with a WALL between the seed and the AI files on its far side (a chain through the tools stays off the Core)',
    left !== undefined && isAiFile(left) && isWall(farSide), `${left?.name} behind ${farSide} free blocks`);
  // Only the tool-hunting ship gets it: HALCYON's receiver stays back to back (01-landing §3.16).
  const files = [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
    .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item)).map((item) => structuredClone(item) as Segment);
  const packet = packUnit(files, 120, []);
  const halcyon = layoutCarried(packet, packet.chargeCarried, getShip(1)).racks.segs;
  check('…and HALCYON\'s unit is still laid out back to back (no free run before the charge)',
    halcyon.findIndex((seg) => seg.type === 'free') > halcyon.findIndex((seg) => seg.type === 'redundancy'));
}

finish();
