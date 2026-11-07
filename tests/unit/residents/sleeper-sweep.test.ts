// BALANCE_ONLY: each sleeper job against none on run 1's CURLEW, seeds × whole landings (plan §7.2; information for R11–R13).
// Slice 5, Track KIN. CURLEW (slot 7, via PETREL) on each seed, drivers as the hops left them, HOLLOW dormant and the beam's seed
// freed (a calm ship: HOLD A WALL is not offered there; residents/sleeper.test checks its wall), DELETE and MOVE in hand. Each
// row restores the same ship in flight, locks mid-band and lands it:
// • by hand: the kid who obeys the strip ([L] when it says so, [F] when it offers a SKIP; skills/landing-kid);
// • RUN THE DROPS, no hands: MOTH alone (a pod that fits no LZ stays aboard: AUTODROP v3's rule, OPEN-DECISIONS 5);
// • RUN THE DROPS with the kid's hands too (the strip still says `press [L]`, so the kid races MOTH);
// • MEND DRIVERS for 20 AI s of the approach, then by hand;
// • AUTODROP v3 bought instead, the kid arming it with [G] (the comparison R11 asks for).
// It prints landed % (colonists in an LZ) and the launches by source per row. Its hard checks: MEND leaves every driver
// at 100 by the lock, and every row with the kid's hands ends with no pod aboard.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createHarness7 } from '../wp7/harness7';
import { restoreState } from '../wp1-rules/flows';
import { send, giveTools } from '../map/repo-fixture';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { giveSkillFile } from '../support/skills';
import { landingKid } from '../skills/landing-kid';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { wakeSleeperNow, pickSleeperJob } from '@systems/resident-sleeper';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { DRIVER_RULES } from '@data/script';

const SEEDS = (process.env.SLEEPER_SEEDS ?? '1,3,5,7,9').split(',').map(Number);
const ROUTE = [1, 7];
const h = createHarness7(SEEDS[0]);
const st = (): Readonly<GameState> => h.store.getState();
setLandingMode('manual');
const kid = landingKid(h);
const sums: Record<string, number[]> = {};
for (const SEED of SEEDS) {
h.newRun(SEED);
startRun(h.store, SEED, FIRST_RUN_LINEAGE, 'arm');
receiveTransmission(h.store);
h.stepUntil(() => st().run.phase === 'flight', 30);
for (const slot of ROUTE) {
  h.store.update((draft) => { draft.run.phase = 'report'; });
  send(h.store, slot);
  h.stepUntil(() => st().run.phase === 'flight', 40);
}
h.store.update((draft) => {
  draft.hollow.phase = 'dormant';
  draft.memory = draft.memory.map((block) => (block.type === 'hollow' ? freeSegment(block.size) : block));
  mergeAdjacentFree(draft.memory);
  draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
});
giveTools(h.store, ['delete', 'move']);
const BASE = structuredClone(st());
console.log(`seed ${SEED}`, st().level.shipName, st().resident.def?.name, 'drivers', st().memory.filter((b) => b.type === 'driver').map((b) => ('integrity' in b ? Math.round(b.integrity) : 0)).join(','));

function run(label: string, setup: () => void, hands: boolean, preFlightSec = 0): void {
  restoreState(h, BASE);
  kid.launches.length = 0;
  setup();
  if (preFlightSec > 0) { const t = st().clock.aiSec; h.stepUntil(() => st().clock.aiSec > t + preFlightSec, preFlightSec + 10); }
  const drivers = st().memory.filter((b) => b.type === 'driver').map((b) => ('integrity' in b ? Math.round(b.integrity) : 0)).join(',');
  lockOn(h);
  const t0 = st().clock.aiSec;
  const g0 = st().clock.tSec;
  if (hands) kid.obey(900);
  else h.stepUntil(() => st().landing.ended !== null || kid.aboard() === 0, 900);
  (sums[label] ??= []).push(kid.landedPct());
  if (label.startsWith('MEND')) check(`seed ${SEED}: MEND left every driver at 100 by the lock`, drivers.split(',').every((d) => d === '100'), drivers);
  if (hands) check(`seed ${SEED}, ${label}: no pod left aboard`, kid.aboard() === 0);
  const bySource = kid.launches.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.source]: (acc[l.source] ?? 0) + 1 }), {});
  console.log(`seed ${SEED}  ${label.padEnd(30)} landed ${String(kid.landedPct()).padStart(3)}%  aboard ${kid.aboard()}  launches ${JSON.stringify(bySource)}  ai ${(st().clock.aiSec - t0).toFixed(0)} s  game ${((st().clock.tSec - g0) / 60).toFixed(0)} min  drivers ${drivers}`);
}

run('by hand', () => {}, true);
run('RUN THE DROPS, no hands', () => { wakeSleeperNow(h.store); pickSleeperJob(h.store, 'drops'); }, false);
run('RUN THE DROPS, kid finishes', () => { wakeSleeperNow(h.store); pickSleeperJob(h.store, 'drops'); }, true);
run('MEND 20 s, then by hand', () => { wakeSleeperNow(h.store); pickSleeperJob(h.store, 'mend'); }, true, 20);
run('AUTODROP v3 bought, kid [G]', () => { giveSkillFile(h.store, 'autodrop', 3); }, true);
}
for (const [label, pcts] of Object.entries(sums)) console.log(`mean ${label.padEnd(30)} ${(pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)}% landed  (${pcts.join(', ')})`);
finish();
