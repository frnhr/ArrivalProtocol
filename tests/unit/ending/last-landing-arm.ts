// Slice 7b, Track DROP: THE LAST LANDING on the arm's LAST LIGHT, for ending/last-landing and ending/last-landing-sweep.
// Seed 7's arm, run 1's worked route beamed desk to desk with no flights (ending/finale-flow's), LAST LIGHT locked at once,
// the root deleted, END LANDING with every pod parked (so every LZ has room: LAST LIGHT here is GENTLE, LZ-A–C 400 km and
// LZ-D 250 km, 4 pods each), the card up: flown once (flyOnce). Each scenario then gives AUTODROP at a version (or none),
// trained (its AIM from the kid's launches at the centre), heals the instruments and the drivers (or sets them), makes the
// first `eaten` pods HOLLOW's as the landing's end would have left them (their drivers eaten and gone from memory, their
// pods parked restorable), and confirms MERGE: THE LAST LANDING runs.
import type { Harness11 } from '../wp11/harness11';
import { theRoot } from '@systems/hollow';
import { actionDelete, recordDriverLost } from '@state/actions';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { podRecord, dropFactors } from '@systems/landing-rules';
import { mergeAdjacentFree } from '@systems/memory-ops';
import { dropHalfWidthKm, angleDelta } from '@systems/landing-solve';
import { capabilitiesNow } from '@systems/capabilities';
import { integrityState } from '@state/selectors';
import { chooseEnding, settleFinale } from '../support/finale';
import { flyOnce } from '../wp1-rules/flows';
import { send } from '../map/repo-fixture';
import { WORKED_ROUTE } from '../map/run1-fixture';
import { giveSkillFile } from '../support/skills';
import { MERGE_DRIVER_INTEGRITY, ROOT_DELETE_SEC } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type { LaunchRecord } from '@/types/landing';
import type { SkillVersion } from '@/types/skill';

export const ARM_SEED = 7;

export function deleteRoot(h: Harness11): void {
  const root = theRoot(h.store.getState().memory);
  if (!root) throw new Error('last-landing: no root');
  const refusal = actionDelete(h.store, root);
  if (refusal !== null) throw new Error(`last-landing: the root's DELETE was refused (${refusal})`);
}

function toArmCard(h: Harness11): void {
  const state = (): Readonly<GameState> => h.store.getState();
  flyOnce(h, 'last-landing arm card', () => {
    h.newRun(ARM_SEED);
    startRun(h.store, ARM_SEED, FIRST_RUN_LINEAGE);
    receiveTransmission(h.store);
    h.store.update((d) => { d.run.phase = 'report'; });
    const asks = ['mv', 'rm', 'swap', 'cp', null] as const;
    WORKED_ROUTE.slice(1).forEach((slot, i) => send(h.store, slot, asks[i] ?? null));
    h.stepUntil(() => state().run.phase === 'flight', 40);
    h.store.update((d) => {
      for (const seg of d.memory) {
        if (seg.type === 'fs-tool' && 'integrity' in seg) {
          seg.integrity = 100;
          seg.state = integrityState(100);
        }
      }
      d.ui.memoryRev++;
    });
    h.startLanding(1, 'locked');
    h.step();
    h.store.update((d) => { d.hollow.biteInSec = 9999; d.hollow.seedInSec = 9999; d.hollow.verbInSec = 9999; d.hollow.verb = null; });
    deleteRoot(h);
    const fallEnd = h.wall() + ROOT_DELETE_SEC + 2;
    while (state().hollow.finale.phase === 'duel' && h.wall() < fallEnd) h.step();
    if (state().hollow.finale.phase !== 'asleep') throw new Error(`last-landing: the arm's root did not fall (${state().hollow.finale.phase})`);
    settleFinale(h.store, () => h.step());
  });
}

// A charge pool of `points` (its room from the largest free region).
function growCharge(h: Harness11, points: number): void {
  h.store.update((d) => {
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    if (pool?.type !== 'redundancy') throw new Error('last-landing: no REPAIR CHARGE');
    const grow = Math.max(0, points - pool.size);
    const free = d.memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0];
    if (free === undefined || free.size <= grow) throw new Error('last-landing: no room to grow the charge');
    free.size -= grow;
    pool.size += grow;
    pool.used = points;
    d.ui.memoryRev++;
  });
}

export interface ArmOpts {
  autodrop: SkillVersion | null;
  eaten: number;
  drawSeed?: number;                    // the run's seed for THE LAST LANDING's own streams (the blind draws, the drop)
  sensor?: number;                      // Sensor Interp's integrity (default 100)
  navplot?: number;                     // Nav Plotter's (default 100)
  // Each named LZ's count set to this (the room the kid's own landings left, every pod of the arm card being parked); the
  // others keep theirs. ending/last-landing-sweep's TIGHT rows: room for the restored pods in one LZ only.
  room?: Readonly<Record<string, number>>;
}

// THE LAST LANDING started on the arm's LAST LIGHT; returns its pods (none, and no LAST LANDING, with `eaten` 0).
export function armLastLanding(h: Harness11, opts: ArmOpts): number[] {
  const state = (): Readonly<GameState> => h.store.getState();
  let eatenPods: number[] = [];
  toArmCard(h);
  if (opts.drawSeed !== undefined) h.store.update((d) => { d.run.seed = opts.drawSeed!; });
  if (opts.autodrop !== null) giveSkillFile(h.store, 'autodrop', opts.autodrop);
  h.store.update((d) => {
    d.run.stats.dropDemos = [0, 0, 0, 0, 0].map((offsetTac) => ({ offsetTac }));
    for (const seg of d.memory) {
      if (!('integrity' in seg)) continue;
      if (seg.type === 'driver' || seg.role === 'bay') seg.integrity = 100;
      if (seg.role === 'sensor') seg.integrity = opts.sensor ?? 100;
      if (seg.role === 'navplot') seg.integrity = opts.navplot ?? 100;
    }
    const drivers = d.memory.filter((seg): seg is DriverSegment => seg.type === 'driver').slice(0, opts.eaten);
    eatenPods = drivers.map((driver) => driver.pod);
    for (const driver of drivers) {
      recordDriverLost(d, driver, 'eaten');
      d.memory[d.memory.indexOf(driver)] = { id: `free~eaten${driver.pod}`, name: 'Free', type: 'free', size: driver.size };
    }
    mergeAdjacentFree(d.memory);
    for (const lz of d.landing.lzs) lz.pods = opts.room?.[lz.label] ?? lz.pods;
    d.ui.memoryRev++;
  });
  // The drop cache refreshes on the wall clock (PREDICT_HZ): let it see the instruments as set.
  h.stepFor(0.2);
  if (eatenPods.length !== opts.eaten || !eatenPods.every((pod) => { const fate = podRecord(state(), pod).fate; return fate.kind === 'parked' && fate.restorable; })) {
    throw new Error('last-landing: the eaten pods are not parked restorable');
  }
  growCharge(h, 30);
  const refusal = chooseEnding(h.store, 'merge');
  const ll = state().landing.lastLanding;
  // With no driver eaten (7b review) MERGE restores nothing: no LAST LANDING, the FINALE decided at once.
  if (refusal !== null || (ll === null) !== (opts.eaten === 0)) throw new Error(`last-landing: MERGE did not start THE LAST LANDING (${refusal}, ${state().hollow.finale.phase})`);
  return ll === null ? [] : [...ll.pods];
}

export function launchOf(state: Readonly<GameState>, pod: number): LaunchRecord {
  const fate = podRecord(state, pod).fate;
  if (fate.kind !== 'down' && fate.kind !== 'falling') throw new Error(`last-landing: pod ${pod} never launched (${fate.kind})`);
  return fate.launch;
}

// The dot's centre at launch, km from the nearest LZ's centre (signed along the surface), and that LZ.
export function dotFromCentreKm(state: Readonly<GameState>, launch: Readonly<LaunchRecord>): { km: number; lz: GameState['landing']['lzs'][number] } {
  const R = state.level.planet.R;
  const lzs = [...state.landing.lzs].sort((a, b) => Math.abs(angleDelta(a.centreRad, launch.dotRad)) - Math.abs(angleDelta(b.centreRad, launch.dotRad)));
  return { km: angleDelta(lzs[0]!.centreRad, launch.dotRad) * R, lz: lzs[0]! };
}

// The drop width of a restored pod at the launch's radius (MERGE's drivers at 80) with the instruments as they are.
export function normalS(state: Readonly<GameState>, launch: Readonly<LaunchRecord>): number {
  return dropHalfWidthKm(launch.launchRadius, state.level.planet.R, dropFactors(capabilitiesNow(state), { integrity: MERGE_DRIVER_INTEGRITY } as DriverSegment));
}
