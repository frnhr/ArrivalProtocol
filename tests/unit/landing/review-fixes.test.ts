// Slice 1a, the logic fixes after the full review (plan Deviations, "Review fixes"). Each section is one bug, built
// straight from a state (lockOn: no capture flown), so the suite stays fast:
// • a driver lost after the landing ended (HOLLOW, the zones, THE DEAL's ACCEPT, the instant landing) updates its parked
//   pod instead of throwing, and THE DEAL is never offered, nor left standing, once the landing has ended;
// • ship 1's scripted fight lives in state (hollow.scriptTargetId), and the LANDING REPORT waits for it after an early
//   END LANDING, so `> ...047?` is never skipped;
// • drivers that can't launch and can't be repaired end the landing (L12, then the risk-7 auto-end), and the root's
//   DELETE is read from a selector (the pure table imports no stateful module).
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { endLanding, forceLandAll } from '@systems/landing';
import { acceptDeal, infectNow, rootDeleteProgress, theRoot } from '@systems/hollow';
import { actionDelete } from '@state/actions';
import { offerDealNow } from '@systems/hollow-deal';
import { recordDriverLost, setIntegrity } from '@state/actions';
import { driversInMemory, rootDeleteRunning, rootDeletable, repairPossible } from '@state/selectors';
import { podRecord } from '@systems/landing-rules';
import { DRIVER_RULES } from '@data/script';
import { HOLLOW_STORY } from '@data/hollow-text';
import { LANDING_NONE_LEFT_SEC } from '@data/tuning';
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

finish();
