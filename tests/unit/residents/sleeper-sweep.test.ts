// BALANCE_ONLY: each sleeper job against none on run 1's CURLEW, seeds × whole landings (plan §7.2; information for R11–R13).
// Slice 5, Track KIN. CURLEW (slot 7, via PETREL) on each seed, drivers as the hops left them, HOLLOW dormant and the beam's seed
// freed (a calm ship: HOLD A WALL is not offered there; residents/sleeper.test checks its wall), DELETE and MOVE in hand. Each
// row restores the same ship in flight, locks mid-band and lands it:
// • by hand: the kid who obeys the strip ([L] when it says so, [F] when it offers a SKIP; skills/landing-kid);
// • RUN THE DROPS, no hands: MOTH alone (a pod that fits no LZ stays aboard: AUTODROP v3's rule, OPEN-DECISIONS 5);
// • RUN THE DROPS with the kid's hands too (since the review fix pass, M1, the strip waits with no [L] in the windows MOTH's
//   plan owns, and gives the kid's rows back once the plan is empty);
// • MEND DRIVERS for 20 AI s of the approach, then by hand;
// • AUTODROP v3 bought instead, the kid arming it with [G] (the comparison R11 asks for).
// It prints landed % (colonists in an LZ) and the launches by source per row. Its hard checks: MEND leaves every driver
// at 100 by the lock, and every row with the kid's hands ends with no pod aboard.
// Slice 8 Step 0 (slice-8-plan §2.6, §2.7; OD 25, 27), each off by default (the rows above print what they printed):
// • SLEEPER_KIT=route: per seed, a second unit beamed to CURLEW along the same route asking at every desk for what ARRIVAL
//   CONTROL tags (the tools the route delivers, by WORKED_KIT's rule), the sleeper SCANned, then woken the ways that kit
//   allows, in order: rm sleep.lock, MOVE the sleeper, REPAIR sleep.lock (`sleeper.woken`: the seeds where one worked); and
//   a count over SLEEPER_ARMS run-1 arms (default 200) × a random route through CURLEW, sent desk to desk the same way: the
//   share that reaches the sleeper with neither DELETE nor MOVE (`sleeper.noKit`).
// • SLEEPER_HOLLOW=1: CURLEW with the beam's seed not freed and a seed planted behind the first driver (__ap.seed's
//   helper), flown by hand with and without HOLD A WALL (when MOTH offers it): driver bites, drivers eaten and landed %,
//   and `moth.wall.Δeaten` (drivers eaten with the wall less without, mean over the seeds where the wall was offered).
import { check, finish } from '../landing/checks';
import { writeMetrics } from '../support/balance-out';
import { toDesk, armRun } from '../map/repo-fixture';
import { recommendation } from '@systems/repository';
import { routes } from '@systems/map-route';
import { createRng } from '@systems/rng';
import { plantBeamSeed } from '@systems/beam-seeds';
import { hollowLabel } from '@systems/say';
import { sleeperJobsNow } from '@systems/resident-sleeper';
import { actionScan, actionDelete, actionMove, actionRepair } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { RESIDENT_SEG_IDS } from '@data/residents';
import { SEEDS_ONLY_DEF } from '@data/threats';
import { SEED_WORDS_POOL } from '@data/threat-text';
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
const KIT = process.env.SLEEPER_KIT ?? 'given';
if (KIT !== 'given' && KIT !== 'route') throw new Error(`SLEEPER_KIT=${KIT} is neither given nor route`);
const HOLLOW_ROW = process.env.SLEEPER_HOLLOW === '1';
const woken: number[] = [];
const wallDelta: number[] = [];
let wallOffered = 0;
let noKitPct: number | null = null;

// SLEEPER_KIT=route: CURLEW reached with what the route's requests delivered, the sleeper SCANned, then each way in that the
// kit allows until one wakes it. Returns the way that worked, or null.
function wakeByKit(seed: number): string | null {
  h.newRun(seed);
  startRun(h.store, seed, FIRST_RUN_LINEAGE, 'arm');
  receiveTransmission(h.store);
  h.stepUntil(() => st().run.phase === 'flight', 30);
  for (const slot of ROUTE) {
    h.store.update((draft) => { draft.run.phase = 'report'; });
    toDesk(h.store);
    send(h.store, slot, recommendation(st()));
    h.stepUntil(() => st().run.phase === 'flight', 40);
  }
  const asleep = (): boolean => st().resident.sleeper?.phase === 'asleep';
  const seg = (id: string) => st().memory.find((one) => one.id === id);
  const idle = (): boolean => getOps().length === 0;
  const sleeper = seg(RESIDENT_SEG_IDS.sleeper);
  if (sleeper === undefined || !asleep()) throw new Error(`sleeper-sweep: seed ${seed}: no sleeper asleep on ${st().level.shipName}`);
  actionScan(h.store, sleeper);
  h.stepUntil(idle, 30);
  const kit = st().run.licences;
  const ways: { way: string; can: boolean; go: () => unknown }[] = [
    { way: 'rm sleep.lock', can: kit.includes('delete'), go: () => actionDelete(h.store, seg(RESIDENT_SEG_IDS.sleepLock)!) },
    { way: 'MOVE the sleeper', can: kit.includes('move'), go: () => {
      const free = st().memory.filter((one) => one.type === 'free' && one.reservedBy === undefined).sort((a, b) => b.size - a.size)[0];
      return free === undefined ? 'no room' : actionMove(h.store, seg(RESIDENT_SEG_IDS.sleeper)!, { regionSegIds: [free.id], col: 0 });
    } },
    { way: 'REPAIR sleep.lock', can: kit.includes('repair'), go: () => actionRepair(h.store, seg(RESIDENT_SEG_IDS.sleepLock)!) },
  ];
  for (const way of ways) {
    if (!way.can || !asleep() || seg(RESIDENT_SEG_IDS.sleepLock) === undefined) continue;
    way.go();
    h.stepUntil(() => idle() && !asleep(), 30);
    h.step();
    if (!asleep()) { console.log(`seed ${seed}  the route's kit (${kit.join(',')}) woke the sleeper: ${way.way}`); return way.way; }
  }
  console.log(`seed ${seed}  the route's kit (${kit.join(',')}) could not wake the sleeper`);
  return null;
}

for (const SEED of SEEDS) {
if (KIT === 'route') woken.push(wakeByKit(SEED) === null ? 0 : 100);
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
if (HOLLOW_ROW) {
  // The HOLLOW row: the same ship, the beam's seed kept and a seed planted behind the first driver, with HOLLOW's seeds-only
  // config (as __ap.seed lays one on a calm ship), flown by hand with and without HOLD A WALL.
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
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
    const driver = draft.memory.find((one) => one.type === 'driver')!;
    plantBeamSeed(draft.memory, driver.id, SEED_WORDS_POOL[0]!, hollowLabel(draft.run));
    if (draft.hollow.cfg.wake === 'never') draft.hollow.cfg = structuredClone(SEEDS_ONLY_DEF);
    draft.ui.memoryRev++;
  });
  giveTools(h.store, ['delete', 'move']);
  const HOLLOW_BASE = structuredClone(st());
  const eatenBy: Record<string, number> = {};
  for (const wall of [false, true]) {
    restoreState(h, HOLLOW_BASE);
    kid.launches.length = 0;
    let offered = true;
    if (wall) {
      wakeSleeperNow(h.store);
      h.step();
      offered = sleeperJobsNow(st()).includes('wall');
      if (offered) pickSleeperJob(h.store, 'wall');
    }
    const bitten0 = st().run.stats.driversBitten;
    const eaten0 = st().run.stats.driversLost;
    lockOn(h);
    kid.obey(900);
    const label = wall ? 'HOLLOW, HOLD A WALL' : 'HOLLOW, no wall';
    eatenBy[label] = st().run.stats.driversLost - eaten0;
    (sums[label] ??= []).push(kid.landedPct());
    console.log(`seed ${SEED}  ${label.padEnd(30)} ${wall && !offered ? 'not offered (no wall spot)' : `landed ${String(kid.landedPct()).padStart(3)}%  `
      + `driver bites ${st().run.stats.driversBitten - bitten0}  drivers eaten ${eatenBy[label]}`}`);
    if (wall && offered) { wallOffered++; wallDelta.push(eatenBy[label]! - eatenBy['HOLLOW, no wall']!); }
  }
}
}
if (KIT === 'route') {
  // The pure count: run-1 arms × a random route through CURLEW, sent desk to desk asking for CONTROL's tag.
  const ARMS = Number(process.env.SLEEPER_ARMS ?? 200);
  let noKit = 0;
  for (let seed = 1; seed <= ARMS; seed++) {
    const store = armRun(seed, 1);
    const through = routes(store.getState().run.map).filter((route) => route.includes(ROUTE[ROUTE.length - 1]!));
    const route = through[Math.floor(createRng(seed * 7919)() * through.length)]!;
    for (const slot of route.slice(1, route.indexOf(ROUTE[ROUTE.length - 1]!) + 1)) {
      toDesk(store);
      send(store, slot, recommendation(store.getState()));
      store.update((draft) => { draft.run.phase = 'report'; });
    }
    const kit = store.getState().run.licences;
    if (!kit.includes('delete') && !kit.includes('move')) noKit++;
  }
  console.log(`the sleeper reached with neither DELETE nor MOVE: ${noKit} of ${ARMS} run-1 arms on a random route through CURLEW`);
  noKitPct = (100 * noKit) / ARMS;
}
for (const [label, pcts] of Object.entries(sums)) console.log(`mean ${label.padEnd(30)} ${(pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)}% landed  (${pcts.join(', ')})`);
const meanOf = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
if (HOLLOW_ROW) console.log(`HOLD A WALL: drivers eaten with the wall less without, ${meanOf(wallDelta)?.toFixed(2) ?? '—'} (offered on ${wallOffered} of ${SEEDS.length} seeds)`);
writeMetrics('sleeper-sweep', {
  'sleeper.woken': meanOf(woken), 'sleeper.noKit': noKitPct, 'moth.wall.Δeaten': meanOf(wallDelta), 'moth.wall.offered': HOLLOW_ROW ? wallOffered : null,
}, { seeds: SEEDS.join(','), kit: KIT, hollow: HOLLOW_ROW ? 1 : 0 });
finish();
