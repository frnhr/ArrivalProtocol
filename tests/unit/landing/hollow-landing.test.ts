// Slice 1a, Track SIM: HOLLOW during the landing (01-landing §5, plan §1.6, risk 9). The drain takes the LARGER of the
// burn's and the landing's multipliers, never their product; landMult applies only while an in-band window is open AND
// a pod can launch (§5's definition: state.landing.window plus nextToLaunch); the projected drain (the countdowns) uses
// landMult in landing. MERGE (LAST LIGHT) restores an eaten driver in place at MERGE_DRIVER_INTEGRITY, the landing
// resumes and the restored pod launches again; a pod whose eaten block is gone stays parked, restorable.
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { drainConditions, drainRatePerSec, projectedDrainPerSec } from '@systems/hollow';
import { chooseFinale } from '@systems/finale';
import { endLanding, forceLandAll } from '@systems/landing';
import { landingResult, nextToLaunch } from '@systems/landing-rules';
import { replaceRange, requireAddr, freeSegment, mergeAdjacentFree, newSegId } from '@systems/memory-ops';
import { createInitialState } from '@state/initial';
import { recordDriverLost } from '@state/actions';
import { driversInMemory, chargeLeft } from '@state/selectors';
import { freshUnitRacks } from '@systems/carry';
import { getShip, type HollowDef } from '@data/ships';
import { driverName } from '@data/landing-text';
import { DRIVER_RULES } from '@data/script';
import { MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { HollowSegment } from '@/types/segment';

// --- The drain's multiplier ----------------------------------------------------------------------------------------------
{
  const cfg = { drainPerSec: 4, burnMult: 2, landMult: 1.5 } as HollowDef;
  check('drain = drainPerSec × max(burnMult, landMult): never their product',
    drainRatePerSec(cfg, false, false) === 4 && drainRatePerSec(cfg, true, false) === 8 && drainRatePerSec(cfg, false, true) === 6
    && drainRatePerSec(cfg, true, true) === 8,
    [drainRatePerSec(cfg, false, false), drainRatePerSec(cfg, true, false), drainRatePerSec(cfg, false, true), drainRatePerSec(cfg, true, true)].join(' '));
  const landHeavy = { drainPerSec: 4, burnMult: 1.2, landMult: 3 } as HollowDef;
  check('...whichever is larger', drainRatePerSec(landHeavy, true, true) === 12);
}

// --- landMult's condition (§5): a window open in the band AND a pod that can launch ---------------------------------------
{
  const KESTREL = 2;
  const base = createInitialState({ seed: 3, shipIndex: KESTREL, carried: freshUnitRacks(getShip(KESTREL)) });
  const landing = (over: Partial<GameState['landing']>, phase: GameState['run']['phase'] = 'landing'): GameState =>
    ({ ...base, run: { ...base.run, phase }, landing: { ...base.landing, ...over } });
  const withWindow = landing({ window: { lz: 'LZ-A', sure: true } });
  check('no window open: no landMult', drainConditions(landing({ window: null })).landingActive === false);
  check('a window open with a launchable pod: landMult', nextToLaunch(withWindow) !== null && drainConditions(withWindow).landingActive === true);
  const allInfected: GameState = {
    ...withWindow,
    memory: withWindow.memory.map((seg) => (seg.type === 'driver' ? { ...seg, infected: { side: 'left' as const } } : seg)),
  };
  check('a window open but no pod can launch: no landMult', nextToLaunch(allInfected) === null && drainConditions(allInfected).landingActive === false);
  check('the same window in flight: no landMult', drainConditions(landing({ window: { lz: 'LZ-A', sure: true } }, 'flight')).landingActive === false);
  const cfg = base.hollow.cfg;
  check('the projected drain uses landMult in landing, burnMult in flight',
    projectedDrainPerSec(withWindow) === cfg.drainPerSec * Math.max(1, cfg.landMult)
    && projectedDrainPerSec(landing({}, 'flight')) === cfg.drainPerSec * Math.max(1, cfg.burnMult),
    `${projectedDrainPerSec(withWindow)} / ${projectedDrainPerSec(landing({}, 'flight'))} (cfg ${cfg.drainPerSec} × ${cfg.landMult} / ${cfg.burnMult})`);
  check('...whether or not a window is open this moment (countdowns never jump)',
    projectedDrainPerSec(landing({ window: null })) === projectedDrainPerSec(withWindow));
}

// --- MERGE on LAST LIGHT ------------------------------------------------------------------------------------------------
const LAST_LIGHT = 4;
const h = createHarness7(5);
h.shipAlone(LAST_LIGHT, 5);
h.store.update((draft) => {
  draft.hollow.phase = 'dormant';
  draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id));
});
lockOn(h);
h.stepFor(0.2);
const state = (): GameState => h.store.getState();

// HOLLOW eats a driver as hollow.ts consume does: the file turns into a hollow block of its size, in place, that remembers
// the pod (atePod), and the pod records its driver as eaten.
function eat(pod: number): HollowSegment {
  const driver = driversInMemory(state()).find((candidate) => candidate.pod === pod);
  if (!driver) throw new Error(`eat: no driver for pod ${pod}`);
  const memory = state().memory;
  const ate = driverName(driver.pod, driver.family);
  const block: HollowSegment = { id: newSegId('hollow'), name: 'HOLLOW', type: 'hollow', size: driver.size, root: false, locked: false, owner: 'HOLLOW', ate, atePod: pod };
  replaceRange(memory, requireAddr(memory, driver), requireAddr(memory, driver) + driver.size, [block], { opId: null, own: [driver] });
  h.store.update((draft) => { recordDriverLost(draft, driver, 'eaten'); draft.ui.memoryRev++; });
  return block;
}

const lead = state().landing.lead;
const otherPod = state().landing.pods.find((record) => record.pod !== lead)!.pod;
eat(lead);
const gone = eat(otherPod);
{
  // The kid DELETEd the second block: its pod's driver can't come back in place.
  const memory = state().memory;
  replaceRange(memory, requireAddr(memory, gone), requireAddr(memory, gone) + gone.size, [freeSegment(gone.size)], { opId: null, own: [gone] });
  mergeAdjacentFree(memory);
  h.store.update((draft) => { draft.ui.memoryRev++; });
}
check('the duel opened at the lock', state().hollow.finale.phase === 'duel', state().hollow.finale.phase);
endLanding(h.store);
const parkedBefore = state().landing.pods.filter((record) => record.fate.kind === 'parked');
check('END LANDING parks every pod aboard, the eaten ones restorable', parkedBefore.length === state().landing.pods.length
  && state().landing.pods.filter((record) => record.fate.kind === 'parked' && record.fate.restorable).length === 2);

// The choice, with the charge MERGE costs.
h.store.update((draft) => {
  draft.hollow.finale.phase = 'choice';
  const pool = draft.memory.find((seg) => seg.type === 'redundancy');
  if (pool && pool.type === 'redundancy') pool.used = Math.max(pool.used, MERGE_COST_CHARGE);
});
const refusal = chooseFinale(h.store, 'merge');
const leadRecord = state().landing.pods.find((record) => record.pod === lead)!;
const leadDriver = driversInMemory(state()).find((driver) => driver.pod === lead);
check('MERGE is chosen', refusal === null && state().hollow.finale.phase === 'merged', `${refusal} ${state().hollow.finale.phase} charge ${chargeLeft(state())}`);
check(`MERGE restores the eaten driver in place at ${MERGE_DRIVER_INTEGRITY}`, leadDriver !== undefined && leadDriver.integrity === MERGE_DRIVER_INTEGRITY
  && leadRecord.driverLost === null && leadRecord.restored && leadRecord.fate.kind === 'aboard', JSON.stringify(leadRecord.fate));
check('...and the landing resumes, its no-time pods unparked', state().landing.ended === null && state().landing.lingerAiSec === null
  && state().landing.pods.filter((record) => record.fate.kind === 'aboard').length === state().landing.pods.length - 1);
const goneRecord = state().landing.pods.find((record) => record.pod === otherPod)!;
check('a pod whose block is gone stays parked, eaten, restorable', goneRecord.fate.kind === 'parked' && goneRecord.fate.why === 'eaten'
  && goneRecord.fate.restorable && goneRecord.driverLost === 'eaten', JSON.stringify(goneRecord.fate));

forceLandAll(h.store);
const landed = state().landing.pods.find((record) => record.pod === lead)!;
check('the restored pod launches again and lands', landed.fate.kind === 'down', landed.fate.kind);
const tally = landingResult(state(), 'locked');
check('the result counts it as restored, and parks the other', tally.restored === leadRecord.colonists
  && tally.pods.find((summary) => summary.pod === lead)?.restored === true && tally.parked.some((entry) => entry.pod === otherPod && entry.why === 'eaten'),
  `restored ${tally.restored}, parked ${JSON.stringify(tally.parked)}`);

finish();
