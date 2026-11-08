import type { ThreatInput, ShipThreat, HollowStage, RunThreatState, BeamSeedSource, FinalTraceInput } from '@/types/threat';
import { HOLLOW_STAGES, SEEDS_ONLY_DEF, CALM_DEF, foldArrivalWalls } from '@data/threats';
import {
  BOARD_MIN_DEPTH, TRACE_BOARD_AT, SEEDS_MIN_DEPTH, PRE_FINAL_ROOT_CAP, FINAL_ROOT_MAX_BLOCKS, TRACE_MERGE_ROOT_EXTRA,
  TRACE_PURGE_BITE_MULT,
} from '@data/tuning';
// Slice 7c: the lead owns this file's trace hooks (slice-7-plan.md §2.4, §4.3): ThreatInput.traces and planThreat's final
// rule. Track TRACE raises TRACES_BUILT; nothing here changes while it is down (every input's traces are false).

// The FINALE's own root plus a MERGE trace's blocks is the largest root a final ship's slot holds (04 §3.10; R33): the
// layout already makes room for FINAL_ROOT_MAX_BLOCKS, so the trace needs no layout change. Checked at load.
if (HOLLOW_STAGES.finale.rootBlocks + TRACE_MERGE_ROOT_EXTRA !== FINAL_ROOT_MAX_BLOCKS) {
  throw new Error(`threat-plan: the FINALE's root ${HOLLOW_STAGES.finale.rootBlocks} + MERGE's ${TRACE_MERGE_ROOT_EXTRA} is not FINAL_ROOT_MAX_BLOCKS ${FINAL_ROOT_MAX_BLOCKS}`);
}

// No trace plays (every ship before the final one, the nominal runs, and every run until TRACE's gates).
export const NO_FINAL_TRACES: Readonly<FinalTraceInput> = { purge: false, merge: false, hunt: false };

// The threat ladder (docs/phase3/04-threats.md §3.1, §3.8, §3.9; slice-2-plan §2.4), pure and DOM-free: planThreat is the
// only place that decides a ship's act, whether HOLLOW boards on the beam into it, its stage, the folds and the root.
// Its input is flat data (ThreatInput), so a test runs 04 §3.16's routes with no store, and slice 3 swaps the inputs
// (the map's depth, its M3 query, the hop's noise, the save's run.threat) without touching the rule.
//
// The run's side (RunThreatState, run.threat) is DURING a ship: applyThreat folds a ship's verdict in when the ship
// starts (systems/run.ts startShip), and threatInputFor reads the input for the NEXT ship from it once this one has
// ended (its TRACE tally done: Track THREAT's endShip).
//
// Slice 3 extension points: oneHopFromFinal ← the map's M3 query; the beam's seeds ← { kind: 'noise', noise: hop.noise };
// depth ← the route; run.threat ← the save; TRACE ← the map card; `HOLLOW WILL FIND YOU ON THIS BEAM` ← boardsOnBeam.
// Track THREAT owns this file after the slice 2 foundation.

// Does HOLLOW board on the beam into this ship (04 §3.8)? Never below BOARD_MIN_DEPTH, never on the beam into a final ship
// (the ship before it is one hop from it), never twice. TRACE earns it ('trace'); one hop from a final ship forces it.
export function boardsOnBeam(input: Readonly<ThreatInput>): 'trace' | 'forced' | null {
  if (input.aboard || input.isFinal || input.depth < BOARD_MIN_DEPTH) return null;
  if (input.trace >= TRACE_BOARD_AT) return 'trace';
  return input.oneHopFromFinal ? 'forced' : null;
}

// The stage HOLLOW plays at this age (ships aboard, this one included; 04 §3.9): ARRIVAL, WALLS, SEEDS, then HUNT for
// every later ship before the final one (the final ship always plays FINALE, planThreat's first rule).
export function stageForAge(age: number): Exclude<HollowStage, 'finale'> {
  if (!(Number.isInteger(age) && age >= 1)) throw new Error(`stageForAge: HOLLOW's age ${age} (it counts this ship, so ≥ 1)`);
  if (age === 1) return 'arrival';
  if (age === 2) return 'walls';
  if (age === 3) return 'seeds';
  return 'hunt';
}

// The root a ship gets (04 §3.7–§3.10): the larger root of its stage and the stages folded into it, plus the beam-born
// blocks HOLLOW was fed, capped at PRE_FINAL_ROOT_CAP before the final ship; the FINALE's root is its own (16) whatever it
// was fed. Slice 7c (R33): after a MERGE trace (`mergeTrace`, built) the FINALE's root is TRACE_MERGE_ROOT_EXTRA bigger
// (FINAL_ROOT_MAX_BLOCKS, 18); it never changes a root before the final ship.
export function rootBlocksFor(stage: HollowStage, folded: readonly HollowStage[], fed: number, mergeTrace = false): number {
  if (!(Number.isInteger(fed) && fed >= 0)) throw new Error(`rootBlocksFor: fed ${fed}`);
  if (stage === 'finale') return HOLLOW_STAGES.finale.rootBlocks + (mergeTrace ? TRACE_MERGE_ROOT_EXTRA : 0);
  if (mergeTrace) throw new Error(`rootBlocksFor: a MERGE trace on a '${stage}' root (it is the final ship's)`);
  const base = Math.max(HOLLOW_STAGES[stage].rootBlocks, ...folded.map((fold) => HOLLOW_STAGES[fold].rootBlocks));
  return Math.min(PRE_FINAL_ROOT_CAP, base + fed);
}

// The ship's facts the verdict echoes (ShipThreat's first four fields).
function factsOf(input: Readonly<ThreatInput>): Pick<ShipThreat, 'depth' | 'isFinal' | 'oneHopFromFinal' | 'beamSeeds'> {
  return { depth: input.depth, isFinal: input.isFinal, oneHopFromFinal: input.oneHopFromFinal, beamSeeds: structuredClone(input.beamSeeds) as BeamSeedSource };
}

// A ship HOLLOW is aboard (not the final one): its stage, and on its first ship one hop from a final ship, WALLS folded
// into ARRIVAL (04 §3.9: "walls are the one defence the finale cannot do without").
function hollowShip(input: Readonly<ThreatInput>, boards: ShipThreat['boards']): ShipThreat {
  const age = input.aboard ? input.age + 1 : 1;
  const stage = stageForAge(age);
  const folded: HollowStage[] = stage === 'arrival' && input.oneHopFromFinal ? ['walls'] : [];
  const hollow = folded.includes('walls') ? foldArrivalWalls() : structuredClone(HOLLOW_STAGES[stage].hollow);
  return { ...factsOf(input), act: 'hollow', boards, stage, folded, hollow, rootBlocks: rootBlocksFor(stage, folded, input.fed) };
}

// The ladder (slice-2-plan §2.4), in order:
// 1. a final ship plays FINALE, with THE DEAL folded in when the run has not had it (04 §3.9: once a run, "a run that
//    reaches the final ship without it gets it there"), and the last unit's traces (slice 7c, R33; ThreatInput.traces,
//    all false until TRACE's gates): PURGE's bites every spreadEverySec × TRACE_PURGE_BITE_MULT (verbs and the duel as
//    they are), MERGE's root FINAL_ROOT_MAX_BLOCKS, REASSIGNMENT's seeds beside your best skill ('near-skill');
// 2. HOLLOW aboard: the stage for its age;
// 3. HOLLOW boards on this beam: ARRIVAL (with WALLS folded in one hop from a final ship);
// 4. from SEEDS_MIN_DEPTH: beam seeds only, no root;
// 5. otherwise calm. The cfg is never null (CALM_DEF never wakes), so no module grows a null check.
export function planThreat(input: Readonly<ThreatInput>): ShipThreat {
  if (!(Number.isInteger(input.depth) && input.depth >= 1)) throw new Error(`planThreat: depth ${input.depth}`);
  if (!(Number.isInteger(input.trace) && input.trace >= 0)) throw new Error(`planThreat: TRACE ${input.trace}`);
  if (input.aboard !== input.age > 0) throw new Error(`planThreat: aboard ${input.aboard} with age ${input.age}`);
  if (input.isFinal) {
    const folded: HollowStage[] = input.dealDone ? [] : ['hunt'];
    const hollow = { ...structuredClone(HOLLOW_STAGES.finale.hollow), deal: !input.dealDone };
    if (input.traces.purge && hollow.spreadEverySec !== null) hollow.spreadEverySec *= TRACE_PURGE_BITE_MULT;
    if (input.traces.hunt && hollow.seed !== null) hollow.seed = { ...hollow.seed, target: 'near-skill' };
    const rootBlocks = rootBlocksFor('finale', folded, input.fed, input.traces.merge);
    return { ...factsOf(input), act: 'finale', boards: null, stage: 'finale', folded, hollow, rootBlocks };
  }
  if (input.traces.purge || input.traces.merge || input.traces.hunt) {
    throw new Error(`planThreat: a final ship's traces on depth ${input.depth}, not a final ship`);
  }
  if (input.aboard) return hollowShip(input, null);
  const boards = boardsOnBeam(input);
  if (boards !== null) return hollowShip(input, boards);
  if (input.depth >= SEEDS_MIN_DEPTH) {
    return { ...factsOf(input), act: 'seeds', boards: null, stage: null, folded: [], hollow: structuredClone(SEEDS_ONLY_DEF), rootBlocks: null };
  }
  return { ...factsOf(input), act: 'calm', boards: null, stage: null, folded: [], hollow: structuredClone(CALM_DEF), rootBlocks: null };
}

// --- The run's side -----------------------------------------------------------------------------------------------------

// Before the first ship: nothing has reported home, HOLLOW is not aboard.
export function createRunThreat(): RunThreatState {
  return {
    trace: 0, aboard: false, age: 0, boardedAtDepth: null, boardCause: null, fed: 0, stagesPlayed: [],
    told: { noticed: false, keepCharge: false }, eatenDrivers: [], lastTally: null, current: null,
    seedsMetAtDepth: null,
  };
}

// What the map knows about a ship (systems/map-facts.ts mapFacts: the route's depth, whether it is a final ship, the M3
// query, the hop's noise). Phase 2's fixed facts for the classic five went with them (Track RETIRE).
export interface ShipThreatFacts {
  depth: number;
  isFinal: boolean;
  oneHopFromFinal: boolean;
  beamSeeds: BeamSeedSource;
}

// The first ship's facts on any route: depth 1, never final, no final ship one hop away, nothing on a beam (nothing
// transmits to it).
export function firstShipFacts(): ShipThreatFacts {
  return { depth: 1, isFinal: false, oneHopFromFinal: false, beamSeeds: { kind: 'none' } };
}

// The ladder's input for the next ship, from the run's threat during the ship before it (its tally done) and whether THE
// DEAL has happened this run (run.stats.deal !== null). Slice 7c: `traces`, the run's (systems/traces.ts finalTraceInput),
// read only on a final ship's input (none elsewhere: a trace acts at the final ship, R33).
export function threatInputFor(
  prev: Readonly<RunThreatState>, facts: ShipThreatFacts, dealDone: boolean, traces: Readonly<FinalTraceInput>,
): ThreatInput {
  return {
    depth: facts.depth, isFinal: facts.isFinal, oneHopFromFinal: facts.oneHopFromFinal, beamSeeds: facts.beamSeeds,
    trace: prev.trace, aboard: prev.aboard, age: prev.age, dealDone, fed: prev.fed,
    traces: facts.isFinal ? { ...traces } : { ...NO_FINAL_TRACES },
  };
}

// The run's threat once a ship's verdict applies (the ship starts: run.ts startShip, and every fixture and the simulation
// retry that builds a ship through createRunState or firstShipRunThreat): HOLLOW aboard from the ship it boards (or the
// final ship, which always has it), its age counting this ship, the stages it plays, and the verdict's facts the world
// reads during the ship (`current`). TRACE, what it was fed and the story flags carry on; the tally that changes them is
// the ship's end's (Track THREAT). The depth is the verdict's own. THE DEAL's HUNT folded into a final ship is recorded
// as played only when the deal is offered (hollow-deal.ts): the ladder folds it in, the ship may never offer it.
export function applyThreat(prev: Readonly<RunThreatState>, plan: Readonly<ShipThreat>): RunThreatState {
  const next = structuredClone(prev) as RunThreatState;
  if (plan.stage !== null) {
    next.aboard = true;
    next.age = prev.age + 1;
    next.stagesPlayed.push(plan.stage, ...plan.folded.filter((fold) => !(plan.stage === 'finale' && fold === 'hunt')));
  }
  next.current = { oneHopFromFinal: plan.oneHopFromFinal, isFinal: plan.isFinal, stage: plan.stage, boards: plan.boards };
  if (plan.boards !== null) {
    next.boardedAtDepth = plan.depth;
    next.boardCause = plan.boards;
  }
  return next;
}

// The first ship's verdict on every run (calm: nothing reported, HOLLOW not aboard), and the run's threat once it applies:
// what RUN START, the simulation retry and a run's first save build ship 1 with. A later ship's nominal verdict is its
// route's (systems/arm-fixture.ts nominalAlong; map-facts nominalRouteThreat).
export function firstShipThreat(): ShipThreat {
  return planThreat(threatInputFor(createRunThreat(), firstShipFacts(), false, NO_FINAL_TRACES));
}

export function firstShipRunThreat(): RunThreatState {
  return applyThreat(createRunThreat(), firstShipThreat());
}
