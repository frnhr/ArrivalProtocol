import type { ThreatInput, ShipThreat, HollowStage, RunThreatState, BeamSeedSource } from '@/types/threat';
import { HOLLOW_STAGES, SEEDS_ONLY_DEF, CALM_DEF, foldArrivalWalls } from '@data/threats';
import { CLASSIC_FIVE, CLASSIC_FACTS, classicShip } from '@data/classic-five';
import { BOARD_MIN_DEPTH, TRACE_BOARD_AT, SEEDS_MIN_DEPTH, PRE_FINAL_ROOT_CAP } from '@data/tuning';

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
// nominalRunThreat is retired by the generator (a generated run always has a real history).
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
// was fed. Slice 7 adds MERGE's trace here (`traces`: +2 on the final ship, FINAL_ROOT_MAX_BLOCKS).
export function rootBlocksFor(stage: HollowStage, folded: readonly HollowStage[], fed: number): number {
  if (!(Number.isInteger(fed) && fed >= 0)) throw new Error(`rootBlocksFor: fed ${fed}`);
  if (stage === 'finale') return HOLLOW_STAGES.finale.rootBlocks;
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
//    reaches the final ship without it gets it there");
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
    return { ...factsOf(input), act: 'finale', boards: null, stage: 'finale', folded, hollow, rootBlocks: rootBlocksFor('finale', folded, input.fed) };
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

// What the map knows about a ship of the classic five (data/classic-five.ts): its depth is its index + 1, LAST LIGHT is
// the final ship, and CLASSIC_FACTS says whether a final ship is one hop away and what the beam into it carries. The
// arm's facts come from systems/map-facts.ts mapFacts (the route's depth, the M3 query, the hop's noise) in the same
// shape; nothing downstream reads where they came from.
export interface ShipThreatFacts {
  depth: number;
  isFinal: boolean;
  oneHopFromFinal: boolean;
  beamSeeds: BeamSeedSource;
}

export function fixedShipFacts(index: number): ShipThreatFacts {
  const ship = classicShip(index);
  const facts = CLASSIC_FACTS[index]!;
  return {
    depth: index + 1, isFinal: ship.final, oneHopFromFinal: facts.oneHopFromFinal,
    beamSeeds: structuredClone(facts.beamSeeds) as BeamSeedSource,
  };
}

// The ladder's input for the next ship, from the run's threat during the ship before it (its tally done) and whether THE
// DEAL has happened this run (run.stats.deal !== null).
export function threatInputFor(prev: Readonly<RunThreatState>, facts: ShipThreatFacts, dealDone: boolean): ThreatInput {
  return {
    depth: facts.depth, isFinal: facts.isFinal, oneHopFromFinal: facts.oneHopFromFinal, beamSeeds: facts.beamSeeds,
    trace: prev.trace, aboard: prev.aboard, age: prev.age, dealDone, fed: prev.fed,
  };
}

// The run's threat once a ship's verdict applies (the ship starts: run.ts startShip, and every fixture and the simulation
// retry that builds a ship through createRunState or nominalRunThreat): HOLLOW aboard from the ship it boards (or the
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

// The run's threat during ship `shipIndex` of the classic five as if every ship before it had been flown with TRACE 0 and
// no DEAL (slice-2-plan risk 14): what createInitialState({ shipIndex }), the debug warp and the headless harnesses
// start a later ship with. Throws on an index the fleet does not have.
export function nominalRunThreat(shipIndex: number): RunThreatState {
  if (!(Number.isInteger(shipIndex) && shipIndex >= 0 && shipIndex < CLASSIC_FIVE.length)) throw new Error(`nominalRunThreat: no ship ${shipIndex}`);
  let threat = createRunThreat();
  for (let index = 0; index <= shipIndex; index++) {
    const facts = fixedShipFacts(index);
    threat = applyThreat(threat, planThreat(threatInputFor(threat, facts, false)));
  }
  return threat;
}

// The verdict for ship `shipIndex` on that nominal run (the plan nominalRunThreat(shipIndex) applied last).
export function nominalShipThreat(shipIndex: number): ShipThreat {
  const before = shipIndex === 0 ? createRunThreat() : nominalRunThreat(shipIndex - 1);
  return planThreat(threatInputFor(before, fixedShipFacts(shipIndex), false));
}
