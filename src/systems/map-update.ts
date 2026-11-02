// Slice 3c: Track WORLD owns this file (docs/phase3/impl/slice-3c-plan.md §5.1); SAVE and UI request changes by message.
import type { ArmShip, RunMapState, ShipKey, ShipKind } from '@/types/map';
import type { ArmState, Departure, LeaveReason, LeaveWords, NextLaunch, Visit } from '@/types/lineage';
import type { RunState } from '@state/schema';
import type { Rng } from '@systems/rng';
import { createRng, hashSeed } from '@systems/rng';
import {
  assembleRun1Arm, freshArm, MAP_GENERATOR_VERSION, bases, rollTiming, rollArkExtra, arkYear, finalYear, podsFor, memoryClassOf,
  armChecks, armReach, shipsFromFrames, bestRoutePods, type ArmProblem, type ShipFrame,
} from '@systems/map-generator';
import { visitsOf } from '@systems/lineage';
import { layerOf, distTable } from '@systems/map-geometry';
import { ARM_CONTENT_VERSION, END_SLOTS, FIRST_SLOT, WORLDS, LAYER_COUNT, slotsInLayer } from '@data/arm';
import { MAP_STATE_VERSION } from '@data/map-state';
import { UPDATE_SHIP_NAMES, aresName, finalShipNameOfSerial } from '@data/ship-names';
import {
  LAUNCH_GAP_TABLE, RUN_START_YEAR, DRIFT_LIMIT_YEARS, VALVE_FLOOR_PODS, VALVE_YEARS, MAX_RUNS_ON_CHART, RESOLVE_CHANCE,
  RESOLVE_CORE_SHARE, FINAL_FLOOR_MIN_GAP_YEARS, UPDATE_REPAIR_FROM_ATTEMPT, UPDATE_FEEDER_FROM_ATTEMPT, GEN_MAX_ATTEMPTS,
  LIGHT_SHARE, LATE_TIGHT_FROM_LAYER, MAX_LATE_TIGHT_PER_LAYER, ARK_PATTERNS, BEAM_RANGE_LY,
} from '@data/tuning';

// The world update between runs (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.3; 02-map §3.12 steps 1–6, §3.1,
// §3.4, §3.6): the arm a run started with plus its route → the arm the next unit starts on. Pure and deterministic: every
// roll goes through an UpdateDice (seeded `upd:` streams in play, scripted by the §3.14 fixture), so 200 consecutive
// updates run in a suite with no store. Reference: docs/phase3/map-sim/arm_sim.py (update_arm, chain), whose rules this
// ports step for step and whose statistics tests/unit/world/update-stats checks; where it parts from the sim, the comment
// says so (the plan's "Deviations (Track WORLD)").
// Cycle guard (plan §5.4): never imports data/script.ts, systems/meta.ts or systems/run.ts.

// Bump when a rule or a stream of the update changes what it makes: an archive's arm made by another update is a content
// reset (02 §10), and the run save refuses it.
export const MAP_UPDATE_VERSION = 1;

export type { Visit } from '@/types/lineage';

export interface UpdateInput {
  from: Readonly<Pick<ArmState, 'armSeed' | 'run' | 'startYear' | 'finalSerial' | 'lastFinal' | 'ships'>>;
  visited: readonly Visit[];        // the route's ships in order (an abandoned run's so far; lineage.ts visitsOf)
}

export interface ArmUpdate {
  next: ArmState;
  attempts: number;                 // the checks' attempts the update needed (1: the first passed)
  valveOpened: boolean;
  bestPods: number;                 // the next arm's best route, pods (the valve's score)
  reasons: Record<LeaveReason, number>;
}

// Every roll of the update (plan §2.3): seeded in play (seededDice), scripted by §3.14's fixture
// (tests/unit/world/run2-fixture.ts). A scripted pick, order or name outside what was offered throws.
export interface UpdateDice {
  gap(): number;
  resolve(ship: Readonly<ArmShip>): 'core-coming' | 'own-way' | null;   // null: stays (RESOLVE_CHANCE)
  patternTie(): readonly number[];
  pick(what: 'ark-slot' | 'victim' | 'repair' | 'feeder', slots: readonly number[]): number;
  order(slots: readonly number[]): number[];                            // the sim's refill shuffle
  // The kind of a slot a repair emptied (the sim's `light if rng < LIGHT_SHARE else std`).
  refillKind(slot: number): 'light' | 'standard';
  timing(key: Readonly<ShipKey>, base: readonly number[], layer: number): { approachYear: number; late: boolean };   // = rollTiming
  arkExtra(key: Readonly<ShipKey>): number;                              // = rollArkExtra
  name(pool: readonly string[]): string;
}

export type UpdatePass = 'first' | 'valve';

// The valve's pass keys its new ships from this attempt on, so they never share a ShipKey (and its rolls) with a ship the
// first pass timed: a re-timed ship has a new id (3a m5).
const VALVE_ATTEMPT_OFFSET = GEN_MAX_ATTEMPTS;

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

function pickFrom<T>(rng: Rng, list: readonly T[], what: string): T {
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new Error(`seededDice: no ${what} to pick from`);
  return item;
}

// The seeded dice of one update pass: each kind of roll its own stream (the valve's pass rolls afresh), a ship's resolve
// roll keyed by its slot, timing and ark extras by the new ship's own ShipKey (map-generator rollTiming, rollArkExtra), so
// the update's rolls never move a ship's details. Stateful: a stream asked twice gives its next number.
export function seededDice(armSeed: number, nextRun: number, pass: UpdatePass): UpdateDice {
  const streams = new Map<string, Rng>();
  const rng = (stream: string): Rng => {
    let r = streams.get(stream);
    if (r === undefined) { r = updRng(armSeed, nextRun, pass, stream); streams.set(stream, r); }
    return r;
  };
  return {
    gap: () => rollLaunchGap(rng('gap')),
    resolve: (ship) => {
      const r = rng(`resolve:${ship.slot}`);
      if (r() >= RESOLVE_CHANCE) return null;
      return r() < RESOLVE_CORE_SHARE ? 'core-coming' : 'own-way';
    },
    patternTie: () => pickFrom(rng('pattern'), ARK_PATTERNS, 'ark pattern'),
    pick: (what, slots) => pickFrom(rng(`pick:${what}`), slots, what),
    order: (slots) => {
      const r = rng('order');
      const out = [...slots];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    refillKind: () => (rng('refill-kind')() < LIGHT_SHARE ? 'light' : 'standard'),
    timing: (key, base, layer) => rollTiming(key, base, layer),
    arkExtra: (key) => rollArkExtra(key),
    name: (pool) => pickFrom(rng('names'), pool, 'ship name'),
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

// A scripted die must pick from what it was offered.
function offered(what: string, slots: readonly number[], slot: number): number {
  if (!slots.includes(slot)) throw new Error(`updateArm: the dice picked ${slot} for ${what}, not one of ${slots.join(', ')}`);
  return slot;
}

interface PassResult {
  ships: ArmShip[];
  departures: Departure[];
  reasons: Record<LeaveReason, number>;
  attempts: number;
  finalSerial: number;
}

// Steps 1–5 and the details (02 §3.12; the sim's update_arm) for a next run starting in `start`, `gapTotal` years after the
// last (the valve's included: the final ship's floor reads it).
function runPass(input: Readonly<UpdateInput>, dice: UpdateDice, pass: UpdatePass, start: number, gapTotal: number): PassResult {
  const from = input.from;
  const nextRun = from.run + 1;
  const base = bases(start);
  const arm: (ArmShip | null)[] = from.ships.map((ship) => ship);
  const departures: Departure[] = [];
  const reasons = noReasons();
  const leave = (ship: Readonly<ArmShip>, reason: LeaveReason, words: LeaveWords): void => {
    arm[ship.slot] = null;
    departures.push({ slot: ship.slot, name: ship.name, reason, words });
    reasons[reason]++;
  };
  const isEnd = (slot: number): boolean => END_SLOTS.includes(slot);

  // 1. Done: every visited ship, in route order, as a colony marker or NO COLONY; the first ship always (its approach is
  // behind the next unit).
  for (const visit of input.visited) leave(from.ships[visit.slot]!, 'done', visit.colony ? 'colony' : 'no-colony');
  if (arm[FIRST_SLOT] !== null) leave(from.ships[FIRST_SLOT]!, 'first-past', null);

  // 2. Older, slot by slot as the sim: the drift limit (final ships included), then a final ship stays, then the 3rd run,
  // then RESOLVE_CHANCE for a generated ship (authored ships are exempt).
  for (const ship of from.ships) {
    if (arm[ship.slot] === null) continue;
    const older: ArmShip = { ...ship, runsOnChart: ship.runsOnChart + 1 };
    arm[ship.slot] = older;
    if (start - ship.timedAgainstStart > DRIFT_LIMIT_YEARS) { leave(older, 'drifted', 'own-way'); continue; }
    if (isEnd(ship.slot)) continue;
    if (older.runsOnChart > MAX_RUNS_ON_CHART) { leave(older, 'aged', 'own-way'); continue; }
    if (ship.authored === null) {
      const words = dice.resolve(older);
      if (words !== null) leave(older, 'resolved', words);
    }
  }

  // 3. The ark pattern: an authored ark forces its own; else the one the waiting arks fit best; a tie is a coin flip.
  const arkLayers = (test: (ship: ArmShip) => boolean): Set<number> =>
    new Set(arm.flatMap((ship) => (ship !== null && ship.kind === 'ark' && test(ship) ? [layerOf(ship.slot)] : [])));
  const arks = arkLayers(() => true);
  const forced = arkLayers((ship) => ship.authored !== null);
  const fits = ARK_PATTERNS.map((pattern) => pattern.filter((layer) => arks.has(layer)).length);
  let pattern: readonly number[];
  if (forced.size > 0) pattern = ARK_PATTERNS.find((candidate) => candidate.some((layer) => forced.has(layer)))!;
  else if (fits[0] !== fits[1]) pattern = ARK_PATTERNS[fits[0]! > fits[1]! ? 0 : 1]!;
  else {
    pattern = dice.patternTie();
    if (!ARK_PATTERNS.some((candidate) => candidate.join() === pattern.join())) throw new Error(`updateArm: ${pattern.join()} is no ark pattern`);
  }
  for (const ship of [...arm]) {
    if (ship !== null && ship.kind === 'ark' && !pattern.includes(layerOf(ship.slot))) leave(ship, 'off-pattern-ark', 'core-coming');
  }
  const wantArk = new Set<number>();
  for (const layer of pattern) {
    const slots = slotsInLayer(layer);
    if (slots.some((slot) => arm[slot]?.kind === 'ark')) continue;
    let empty = slots.filter((slot) => arm[slot] === null);
    if (empty.length === 0) {
      const candidates = slots.map((slot) => arm[slot]!).filter((ship) => ship.authored === null);
      if (candidates.length === 0) throw new Error(`updateArm: layer ${layer} needs an ark and holds only authored ships`);
      const oldest = Math.max(...candidates.map((ship) => ship.runsOnChart));
      const victims = candidates.filter((ship) => ship.runsOnChart === oldest).map((ship) => ship.slot);
      const victim = offered('victim', victims, dice.pick('victim', victims));
      leave(arm[victim]!, 'made-room', 'core-coming');
      empty = [victim];
    }
    wantArk.add(offered('ark-slot', empty, dice.pick('ark-slot', empty)));
  }

  // 4. Reported home: the first ship, a final ship, the arks step 3 asked for, then light ships back to LIGHT_SHARE of the
  // non-ark ships (never a third light ship in a layer from LATE_TIGHT_FROM_LAYER), in the dice's order, else standard.
  const plan = new Map<number, ShipKind>();
  const open: number[] = [];
  for (const def of WORLDS) {
    if (arm[def.slot] !== null) continue;
    if (def.slot === FIRST_SLOT) plan.set(def.slot, 'first');
    else if (isEnd(def.slot)) plan.set(def.slot, 'final');
    else if (wantArk.has(def.slot)) plan.set(def.slot, 'ark');
    else open.push(def.slot);
  }
  const middle = WORLDS.filter((def) => def.layer >= 2 && def.layer < LAYER_COUNT).map((def) => def.slot);
  const nonArk = middle.filter((slot) => arm[slot]?.kind !== 'ark' && plan.get(slot) !== 'ark');
  const lightsWaiting = arm.filter((ship) => ship?.kind === 'light').length;
  let need = Math.max(0, Math.min(open.length, Math.round(LIGHT_SHARE * nonArk.length) - lightsWaiting));
  const crowded = (slot: number): boolean => layerOf(slot) >= LATE_TIGHT_FROM_LAYER
    && slotsInLayer(layerOf(slot)).filter((x) => arm[x]?.kind === 'light' || plan.get(x) === 'light').length >= MAX_LATE_TIGHT_PER_LAYER;
  const order = dice.order(open);
  if ([...order].sort((a, b) => a - b).join() !== open.join()) throw new Error(`updateArm: the dice's order ${order.join()} is not the open slots ${open.join()}`);
  for (const slot of order) {
    if (need > 0 && !crowded(slot)) { plan.set(slot, 'light'); need--; } else plan.set(slot, 'standard');
  }
  // A slot a repair empties (the sim's refill roll; this port also keeps the late-layer cap there).
  const refill = (slot: number): ShipKind => {
    const kind = dice.refillKind(slot);
    return kind === 'light' && crowded(slot) ? 'standard' : kind;
  };
  const lateTight = (ship: Readonly<ShipFrame> | null): boolean => ship !== null && layerOf(ship.slot) >= LATE_TIGHT_FROM_LAYER && ship.memoryClass === 'TIGHT';

  // 5. The checks: the new ships re-roll with the next attempt in their keys; from UPDATE_REPAIR_FROM_ATTEMPT a waiting ship
  // that is part of the failure leaves (the sim's repairs); a throw after GEN_MAX_ATTEMPTS.
  const offset = pass === 'valve' ? VALVE_ATTEMPT_OFFSET : 0;
  const floor = from.lastFinal === null ? null : from.lastFinal.year + Math.max(gapTotal, FINAL_FLOOR_MIN_GAP_YEARS);
  let problems: ArmProblem[] = [];
  for (let attempt = 0; attempt < GEN_MAX_ATTEMPTS; attempt++) {
    const keyOf = (slot: number): ShipKey => ({ armSeed: from.armSeed >>> 0, reportedRun: nextRun, slot, attempt: attempt + offset });
    const planned = [...plan.keys()].sort((a, b) => a - b);
    const frames: (ShipFrame | null)[] = arm.map((ship) => ship);
    for (const slot of planned) {
      const kind = plan.get(slot)!;
      const layer = layerOf(slot);
      const pods = podsFor(kind, layer);
      const timing = kind === 'first' ? { approachYear: start, late: false }
        : kind === 'light' || kind === 'standard' ? dice.timing(keyOf(slot), base, layer) : { approachYear: 0, late: false };
      frames[slot] = { slot, kind, memoryClass: memoryClassOf(kind, pods), name: '', pods, authored: null, ...timing };
    }
    for (const slot of planned.filter((x) => plan.get(x) === 'ark').sort((a, b) => layerOf(a) - layerOf(b))) {
      frames[slot]!.approachYear = arkYear(frames, slot, dice.arkExtra(keyOf(slot)));
    }
    for (const slot of planned.filter((x) => plan.get(x) === 'final')) frames[slot]!.approachYear = finalYear(frames, slot, floor);
    const timed = frames.map((frame, slot) => {
      if (frame === null) throw new Error(`updateArm: slot ${slot} left empty`);
      return frame;
    });
    problems = armChecks(timed);
    if (problems.length === 0) return detail(timed, planned, attempt + offset, attempt + 1);
    const number = attempt + 1;
    if (number < UPDATE_REPAIR_FROM_ATTEMPT) continue;
    // The sim's check also names the ship a one-hop ark is reachable from ('ark-one-hop-from'): a waiting one is part of it.
    const named = problems.flatMap((problem): { check: ArmProblem['check'] | 'ark-one-hop-from'; slot: number }[] => (problem.check !== 'ark-one-hop' ? [problem]
      : [problem, ...slotsInLayer(layerOf(problem.slot) - 1).filter((p) => armReach(timed, p, problem.slot)).map((p) => ({ check: 'ark-one-hop-from' as const, slot: p }))]));
    if (named.some((problem) => problem.check === 'forced-tight')) {
      const latePlanned = planned.filter((slot) => plan.get(slot) === 'light' && layerOf(slot) >= LATE_TIGHT_FROM_LAYER);
      if (latePlanned.length > 0) plan.set(offered('repair', latePlanned, dice.pick('repair', latePlanned)), 'standard');
      else {
        const blocker = arm.find((ship) => ship !== null && !plan.has(ship.slot) && lateTight(ship));
        if (blocker) { leave(blocker, 'unreachable', 'core-coming'); plan.set(blocker.slot, 'standard'); }
      }
    }
    for (const problem of named) {
      const slot = problem.slot;
      if (problem.check === 'no-predecessor' && plan.has(slot) && number >= UPDATE_FEEDER_FROM_ATTEMPT) {
        // A new ship nobody can reach: one waiting ship that could feed it makes room.
        const feeders = arm.flatMap((ship) => (ship !== null && !plan.has(ship.slot) && ship.slot !== FIRST_SLOT && !isEnd(ship.slot)
          && layerOf(slot) - layerOf(ship.slot) >= 1 && layerOf(slot) - layerOf(ship.slot) <= 2 && distTable(ship.slot, slot) <= BEAM_RANGE_LY ? [ship.slot] : []));
        if (feeders.length > 0) {
          const feeder = offered('feeder', feeders, dice.pick('feeder', feeders));
          leave(arm[feeder]!, 'unreachable', 'own-way');
          plan.set(feeder, layerOf(feeder) < LATE_TIGHT_FROM_LAYER ? dice.refillKind(feeder) : 'standard');
        }
        continue;
      }
      if (problem.check === 'forced-tight') continue;
      const ship = arm[slot] ?? null;
      if (plan.has(slot) || ship === null || slot === FIRST_SLOT || isEnd(slot)) continue;
      leave(ship, 'unreachable', 'own-way');
      plan.set(slot, ship.kind === 'ark' ? 'ark' : refill(slot));
    }
  }
  throw new Error(`updateArm: no valid arm in ${GEN_MAX_ATTEMPTS} attempts (seed ${from.armSeed >>> 0}, run ${nextRun}, pass ${pass}, start ${start}; `
    + `problems ${problems.map((problem) => `${problem.check} ${problem.slot}`).join(', ')}; plan ${[...plan].map(([slot, kind]) => `${slot}:${kind}`).join(' ')})`);

  // 6. The details, new ships only: names (UPDATE_SHIP_NAMES minus the chart's names and minus this update's departed ships'
  // names, both hard: slice 3c review fix M5; the pool is big enough that the rule never gives way, data/ship-names.ts),
  // ARES by run, the final ship by serial; then the reservations' top-up, the Debris guarantee and the self-check
  // (map-generator shipsFromFrames). Waiting ships stay byte-identical but runsOnChart.
  function detail(timed: ShipFrame[], planned: readonly number[], keyAttempt: number, attempts: number): PassResult {
    const onChart = new Set(arm.flatMap((ship) => (ship === null ? [] : [ship.name])));
    const departed = new Set(departures.map((departure) => departure.name));
    let finalSerial = from.finalSerial;
    for (const slot of planned) {
      const frame = timed[slot]!;
      if (frame.kind === 'first') frame.name = aresName(nextRun);
      else if (frame.kind === 'final') frame.name = finalShipNameOfSerial(++finalSerial);
      else {
        const offer = UPDATE_SHIP_NAMES.filter((name) => !onChart.has(name) && !departed.has(name));
        if (offer.length === 0) throw new Error(`updateArm: no ship name left for slot ${slot} (the pool's bound is broken)`);
        const name = dice.name(offer);
        if (!offer.includes(name)) throw new Error(`updateArm: the dice named slot ${slot} ${name}, not one of ${offer.join(', ')}`);
        frame.name = name;
        onChart.add(name);
      }
    }
    const keyOf = (slot: number): ShipKey => ({ armSeed: from.armSeed >>> 0, reportedRun: nextRun, slot, attempt: keyAttempt });
    const ships = shipsFromFrames(timed, arm, keyOf, start, from.armSeed, nextRun, keyAttempt);
    for (const ship of from.ships) {
      if (arm[ship.slot] === null) continue;
      if (JSON.stringify(ships[ship.slot]) !== JSON.stringify({ ...ship, runsOnChart: ship.runsOnChart + 1 })) {
        throw new Error(`updateArm: waiting ship ${ship.name} changed beyond its runsOnChart`);
      }
    }
    // Done first in route order, then the others as they left (the opening desk's departures block reads them so).
    return { ships, departures, reasons, attempts, finalSerial };
  }
}

// The update (02 §3.12): the gap, then steps 1–5 (Done, Older, the ark pattern, Reported home, the checks with repairs from
// UPDATE_REPAIR_FROM_ATTEMPT and a throw after GEN_MAX_ATTEMPTS) and the details, then the valve (step 6: below
// VALVE_FLOOR_PODS, again from the same input with VALVE_YEARS more and the valve's dice; every waiting ship is then past
// the drift limit, so the next arm is a fresh roll around the old final ship's floor; it never opens twice). `dice(pass)`
// gives each pass its rolls (seeded in play; a suite scripts the valve's pass too); `opts.valveFloor` forces the valve in
// a suite.
export function updateArm(
  input: Readonly<UpdateInput>,
  dice: (pass: UpdatePass) => UpdateDice = (pass) => seededDice(input.from.armSeed, input.from.run + 1, pass),
  opts: { valveFloor?: number } = {},
): ArmUpdate {
  const from = input.from;
  if (!(Number.isInteger(from.run) && from.run >= 1)) throw new Error(`updateArm: run ${from.run}`);
  if (from.ships.length !== WORLDS.length || from.ships.some((ship, slot) => ship.slot !== slot)) throw new Error(`updateArm: an arm of ${from.ships.length} ships out of slot order`);
  const slots = input.visited.map((visit) => visit.slot);
  if (new Set(slots).size !== slots.length || slots.some((slot) => from.ships[slot] === undefined)) throw new Error(`updateArm: visited ${slots.join(', ')}`);
  const first = dice('first');
  const gap = first.gap();
  if (!(Number.isInteger(gap) && gap >= 0)) throw new Error(`updateArm: a launch gap of ${gap}`);
  let start = from.startYear + gap;
  let result = runPass(input, first, 'first', start, gap);
  let bestPods = bestRoutePods(result.ships);
  let valveOpened = false;
  if (bestPods < (opts.valveFloor ?? VALVE_FLOOR_PODS)) {
    valveOpened = true;
    start += VALVE_YEARS;
    result = runPass(input, dice('valve'), 'valve', start, gap + VALVE_YEARS);
    bestPods = bestRoutePods(result.ships);
  }
  const final = result.ships[END_SLOTS[0]!]!;
  const next: ArmState = {
    armSeed: from.armSeed >>> 0, run: from.run + 1, startYear: start, gap, valveYears: valveOpened ? VALVE_YEARS : 0,
    finalSerial: result.finalSerial, lastFinal: { name: final.name, year: final.approachYear }, ships: result.ships,
    departures: result.departures, content: armContent(),
  };
  return { next, attempts: result.attempts, valveOpened, bestPods, reasons: result.reasons };
}

// RUN END's one step, the pure half (plan §2.4 "Run end"): the arm the run played (its own map, risk 13) and its route →
// the next arm, and the bridging line's numbers (`UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303`). The classic world is never
// updated (it throws). Track SAVE's archiveRunEnded records `update.next` and sets run.next.
export function updateAfterRun(
  run: Readonly<Pick<RunState, 'map' | 'ships' | 'unitNumber'>>, dice?: (pass: UpdatePass) => UpdateDice,
): { update: ArmUpdate; next: NextLaunch } {
  const update = updateArm({ from: armStateOfMap(run.map), visited: visitsOf(run) }, dice);
  return { update, next: nextLaunchOf(run.unitNumber, update.next) };
}

// The next unit's launch (RunState.next: RUN END's bridging line and the title's), from the arm the update made for it.
export function nextLaunchOf(unitNumber: number, next: Readonly<ArmState>): NextLaunch {
  return { unit: unitNumber + 1, run: next.run, startYear: next.startYear, gap: next.gap, valveYears: next.valveYears };
}

// The next run's arm when the update itself throws (a bug; slice 3c review fix, minor 2: RUN END and the abandon must never
// be left half-done): a fresh roll for `nextRun` from the played arm's start year, its final-ship lineage carried (the next
// serial, 02 §3.4's floor), as a content reset would make it.
export function resetArmAfter(from: Readonly<UpdateInput['from']>, nextRun: number): ArmState {
  const prev: ArmState = {
    ...structuredClone(from) as UpdateInput['from'], gap: 0, valveYears: 0, ships: [], departures: [], content: armContent(),
  };
  return freshArmState(from.armSeed, nextRun, from.startYear, prev);
}

// A fresh arm state (run 1's assembled arm, or a fresh roll for `run`): the content reset's arm and the suites'. `prev` (the
// arm it replaces) carries the lineage of final ships across a reset: the next serial's name, and 02 §3.4's floor (its
// final year plus the years since its start, at least FINAL_FLOOR_MIN_GAP_YEARS); replacing an arm for the same run keeps
// that arm's gap and valve years (the title's launch line stays true). Without `prev` the serial follows the run (3a's
// interim naming: one new final ship per run).
export function freshArmState(armSeed: number, run: number, startYear: number, prev: Readonly<ArmState> | null): ArmState {
  if (run === 1 && startYear !== RUN_START_YEAR) throw new Error(`freshArmState: run 1 starts in ${RUN_START_YEAR}, not ${startYear}`);
  let ships: ArmShip[];
  let finalSerial: number;
  if (run === 1) {
    ships = assembleRun1Arm(armSeed);
    finalSerial = 0;
  } else {
    finalSerial = prev === null ? run - 1 : prev.finalSerial + 1;
    const floor = prev?.lastFinal ? prev.lastFinal.year + Math.max(startYear - prev.startYear, FINAL_FLOOR_MIN_GAP_YEARS) : null;
    ships = freshArm(armSeed, run, startYear, { final: finalShipNameOfSerial(finalSerial) }, floor);
  }
  const final = ships[END_SLOTS[0]!];
  if (final === undefined) throw new Error('freshArmState: the arm has no final ship');
  const same = prev !== null && prev.run === run;
  return {
    armSeed: armSeed >>> 0, run, startYear, gap: same ? prev.gap : 0, valveYears: same ? prev.valveYears : 0, finalSerial,
    lastFinal: { name: final.name, year: final.approachYear }, ships, departures: [], content: armContent(),
  };
}
