import type { ArmShip, RunMapState, ShipKey } from '@/types/map';
import type { ArmState, LeaveReason } from '@/types/lineage';
import type { Rng } from '@systems/rng';
import { createRng, hashSeed } from '@systems/rng';
import { assembleRun1Arm, freshArm, MAP_GENERATOR_VERSION } from '@systems/map-generator';
import { ARM_CONTENT_VERSION, END_SLOTS } from '@data/arm';
import { MAP_STATE_VERSION } from '@data/map-state';
import { LAUNCH_GAP_TABLE, RUN_START_YEAR } from '@data/tuning';

// The world update between runs (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.3; 02-map §3.12 steps 1–6, §3.1,
// §3.4, §3.6): the arm a run started with plus its route → the arm the next unit starts on. Pure and deterministic: every
// roll goes through an UpdateDice (seeded `upd:` streams in play, scripted by the §3.14 fixture), so 200 consecutive
// updates run in a suite with no store. Reference: docs/phase3/map-sim/arm_sim.py (update_arm, chain).
// Cycle guard (plan §5.4): never imports data/script.ts, systems/meta.ts or systems/run.ts.
// The foundation laid down the final signatures, rollLaunchGap and a working updateArm stub (a fresh roll a year later,
// nobody leaving: the page keeps playing while SAVE wires it); Track WORLD owns this file after.

// Bump when a rule or a stream of the update changes what it makes: an archive's arm made by another update is a content
// reset (02 §10), and the run save refuses it.
export const MAP_UPDATE_VERSION = 1;

// One ship the unit visited (02 §3.12 step 1: it leaves as a colony marker, or `NO COLONY` when nobody landed in an LZ).
// The caller reads `colony` from the route's ShipResults (an abandoned run's ship not yet ended: false).
export interface Visit {
  slot: number;
  colony: boolean;
}

export interface UpdateInput {
  from: Readonly<Pick<ArmState, 'armSeed' | 'run' | 'startYear' | 'finalSerial' | 'lastFinal' | 'ships'>>;
  visited: readonly Visit[];        // the route's ships in order (an abandoned run's so far)
}

export interface ArmUpdate {
  next: ArmState;
  attempts: number;                 // the checks' attempts the update needed (1: the first passed)
  valveOpened: boolean;
  bestPods: number;                 // the next arm's best route, pods (the valve's score)
  reasons: Record<LeaveReason, number>;
}

// Every roll of the update (plan §2.3): seeded in play (seededDice), scripted by §3.14's fixture
// (tests/unit/world/run2-fixture.ts).
export interface UpdateDice {
  gap(): number;
  resolve(ship: Readonly<ArmShip>): 'core-coming' | 'own-way' | null;   // null: stays (RESOLVE_CHANCE)
  patternTie(): readonly number[];
  pick(what: 'ark-slot' | 'victim' | 'repair' | 'feeder', slots: readonly number[]): number;
  order(slots: readonly number[]): number[];                            // the sim's refill shuffle
  timing(key: Readonly<ShipKey>, base: readonly number[], layer: number): { approachYear: number; late: boolean };   // = rollTiming
  arkExtra(key: Readonly<ShipKey>): number;                              // = rollArkExtra
  name(pool: readonly string[]): string;
}

export type UpdatePass = 'first' | 'valve';

// The update's streams (`upd:` namespace, apart from the arm's `arm:` and the ships' `ship:`): one per arm seed, next run,
// pass (the valve's re-run rolls afresh) and name.
export function updRng(armSeed: number, nextRun: number, pass: UpdatePass, stream: string): Rng {
  return createRng(hashSeed(`upd:${armSeed >>> 0}:${nextRun}:${pass}:${stream}`));
}

// The launch gap (02 §3.1): one roll on LAUNCH_GAP_TABLE.
export function rollLaunchGap(rng: Rng): number {
  const roll = rng();
  let sum = 0;
  for (const [years, chance] of LAUNCH_GAP_TABLE) {
    sum += chance;
    if (roll < sum) return years;
  }
  // The chances sum to 1 up to rounding: a roll in that sliver is the table's last row.
  const last = LAUNCH_GAP_TABLE.at(-1);
  if (last === undefined) throw new Error('rollLaunchGap: LAUNCH_GAP_TABLE is empty');
  return last[0];
}

// The seeded dice of one update pass. TODO(3c-WORLD): every roll but the gap (plan §2.3: `updRng(seed, run, pass, stream)`,
// timing = rollTiming, arkExtra = rollArkExtra); the foundation's throw says which one was asked.
export function seededDice(armSeed: number, nextRun: number, pass: UpdatePass): UpdateDice {
  const todo = (what: string): never => { throw new Error(`seededDice.${what}: TODO(3c-WORLD)`); };
  return {
    gap: () => rollLaunchGap(updRng(armSeed, nextRun, pass, 'gap')),
    resolve: () => todo('resolve'),
    patternTie: () => todo('patternTie'),
    pick: () => todo('pick'),
    order: () => todo('order'),
    timing: () => todo('timing'),
    arkExtra: () => todo('arkExtra'),
    name: () => todo('name'),
  };
}

// The content versions an arm made now carries (ArmState.content; the save adds the catalogue).
export function armContent(): ArmState['content'] {
  return { arm: ARM_CONTENT_VERSION, generator: MAP_GENERATOR_VERSION, update: MAP_UPDATE_VERSION, mapState: MAP_STATE_VERSION };
}

// What the update reads of the arm a run played (RUN END's update reads the run's own map, plan risk 13). The final ship
// on the chart is the arm's last final (02 §3.4's floor); the serial comes from the map's history.
export function armStateOfMap(map: Readonly<RunMapState>): UpdateInput['from'] {
  if (map.world !== 'arm') throw new Error('armStateOfMap: the classic world is never updated');
  const final = map.arm[END_SLOTS[0]!];
  if (final === undefined || final.kind !== 'final') throw new Error('armStateOfMap: the arm has no final ship in its end slot');
  return {
    armSeed: map.armSeed, run: map.run, startYear: map.startYear, finalSerial: map.history.finalSerial,
    lastFinal: { name: final.name, year: final.approachYear }, ships: map.arm,
  };
}

function noReasons(): Record<LeaveReason, number> {
  return { 'done': 0, 'first-past': 0, 'drifted': 0, 'aged': 0, 'resolved': 0, 'off-pattern-ark': 0, 'made-room': 0, 'unreachable': 0 };
}

// The update (02 §3.12): the gap, then steps 1–5 (Done, Older, the ark pattern, Reported home, the checks with repairs from
// UPDATE_REPAIR_FROM_ATTEMPT and a throw after GEN_MAX_ATTEMPTS), then the valve (step 6: below VALVE_FLOOR_PODS, again
// from the same input with VALVE_YEARS more and seededDice(…, 'valve')). `opts.valveFloor` forces the valve in a suite.
// TODO(3c-WORLD): plan §2.3. The foundation's stub is a fresh roll one year later with nobody leaving (the page keeps
// playing while Track SAVE wires it into RUN END and abandonment); it reads no dice.
export function updateArm(
  input: Readonly<UpdateInput>, dice: UpdateDice = seededDice(input.from.armSeed, input.from.run + 1, 'first'), opts: { valveFloor?: number } = {},
): ArmUpdate {
  void dice;
  void opts;
  const gap = 1;
  const next = freshArmState(input.from.armSeed, input.from.run + 1, input.from.startYear + gap, null);
  return { next: { ...next, gap }, attempts: 1, valveOpened: false, bestPods: 0, reasons: noReasons() };
}

// A fresh arm state (run 1's assembled arm, or a fresh roll for `run`): the content reset's arm and the suites'. `prev`
// carries the lineage of final ships across a reset (the serial, the floor).
// TODO(3c-WORLD): the final ship's name by serial and its floor from `prev` (plan §2.3, map-generator's freshArm gains
// them); until then freshArm names it finalShipName(run) and the serial follows the run, as 3a's interim did.
export function freshArmState(armSeed: number, run: number, startYear: number, prev: Readonly<ArmState> | null): ArmState {
  if (run === 1 && startYear !== RUN_START_YEAR) throw new Error(`freshArmState: run 1 starts in ${RUN_START_YEAR}, not ${startYear}`);
  const ships = run === 1 ? assembleRun1Arm(armSeed) : freshArm(armSeed, run, startYear);
  const final = ships[END_SLOTS[0]!];
  if (final === undefined) throw new Error('freshArmState: the arm has no final ship');
  void prev;
  return {
    armSeed: armSeed >>> 0, run, startYear, gap: 0, valveYears: 0, finalSerial: run - 1,
    lastFinal: { name: final.name, year: final.approachYear }, ships, departures: [], content: armContent(),
  };
}
