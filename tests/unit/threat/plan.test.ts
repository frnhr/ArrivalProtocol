// Phase 3 slice 2 (slice-2-plan §6.1, Track THREAT): the threat ladder as pure data, with no store.
// • 04 §3.16's routes A, B and C as ThreatInput sequences, each ship's end tallied as endShip does (beam-born blocks left
//   report home, or feed HOLLOW's next root once it is aboard);
// • the boarding conditions: never below depth 4, forced one hop from a final ship, earned at TRACE 3, never on the beam
//   into a final ship, never twice;
// • the folds: ARRIVAL takes WALLS along one hop from a final ship; THE DEAL folds into the FINALE when the run has not had
//   it; stage → def; root sizes, what HOLLOW was fed, and the cap;
// • nominalRunThreat(0..4) and nominalShipThreat on the fixed five.
import { check, finish } from '../landing/checks';
import {
  planThreat, boardsOnBeam, stageForAge, rootBlocksFor, createRunThreat, applyThreat, threatInputFor, nominalRunThreat,
  nominalShipThreat, fixedShipFacts, NO_FINAL_TRACES, type ShipThreatFacts,
} from '@systems/threat-plan';
import { HOLLOW_STAGES, SEEDS_ONLY_DEF, CALM_DEF, foldArrivalWalls } from '@data/threats';
import { PRE_FINAL_ROOT_CAP, TRACE_BOARD_AT, BOARD_MIN_DEPTH } from '@data/tuning';
import type { RunThreatState, ShipThreat, ThreatInput, BeamSeedSource } from '@/types/threat';

const NOISY: BeamSeedSource = { kind: 'noise', noise: 2 };
const CLEAN: BeamSeedSource = { kind: 'noise', noise: 0 };

// One route: the ships' facts in order, and the beam-born blocks each ship leaves behind at its end.
interface RouteShip { facts: ShipThreatFacts; left: number }

function routeShip(depth: number, length: number, left: number, beamSeeds: BeamSeedSource = NOISY): RouteShip {
  return { facts: { depth, isFinal: depth === length, oneHopFromFinal: depth === length - 1, beamSeeds }, left };
}

// Flies a route through the ladder: plan, apply as the ship starts, tally as it ends (endShip's rule).
function fly(route: readonly RouteShip[]): { plans: ShipThreat[]; threats: RunThreatState[] } {
  let threat = createRunThreat();
  let dealDone = false;
  const plans: ShipThreat[] = [];
  const threats: RunThreatState[] = [];
  for (const ship of route) {
    const plan = planThreat(threatInputFor(threat, ship.facts, dealDone, NO_FINAL_TRACES));
    plans.push(plan);
    threat = applyThreat(threat, plan);
    if (plan.hollow.deal) dealDone = true;
    if (threat.aboard) threat = { ...threat, fed: threat.fed + ship.left };
    else threat = { ...threat, trace: threat.trace + ship.left };
    threats.push(threat);
  }
  return { plans, threats };
}

const shape = (plan: ShipThreat): string => `${plan.act}${plan.stage ? `:${plan.stage}` : ''}${plan.folded.length ? `+${plan.folded.join('+')}` : ''}`
  + `${plan.boards ? `!${plan.boards}` : ''}${plan.rootBlocks !== null ? `/${plan.rootBlocks}` : ''}`;

// --- Route A: 5 ships, noisy ---------------------------------------------------------------------------------------
{
  const route = [routeShip(1, 5, 0), routeShip(2, 5, 0), routeShip(3, 5, 2), routeShip(4, 5, 1), routeShip(5, 5, 0)];
  const { plans } = fly(route);
  const got = plans.map(shape).join(' ');
  check('route A (5 ships, noisy): calm, calm, seeds, HOLLOW boards forced with WALLS folded in (root 10), FINALE + DEAL (16)',
    got === 'calm calm seeds hollow:arrival+walls!forced/10 finale:finale+hunt/16', got);
  check('…the seeds ship runs the seeds-only config, the calm ones CALM_DEF',
    JSON.stringify(plans[2]!.hollow) === JSON.stringify(SEEDS_ONLY_DEF) && JSON.stringify(plans[0]!.hollow) === JSON.stringify(CALM_DEF));
  check('…the folded arrival runs foldArrivalWalls (\'arrives\'), and the FINALE offers THE DEAL',
    JSON.stringify(plans[3]!.hollow) === JSON.stringify(foldArrivalWalls()) && plans[3]!.hollow.story === 'arrives' && plans[4]!.hollow.deal);
}

// --- Route B: 8 ships, clean and careful ---------------------------------------------------------------------------
{
  const route = [1, 2, 3, 4, 5, 6, 7, 8].map((depth) => routeShip(depth, 8, depth === 4 ? 1 : 0, depth <= 2 ? CLEAN : NOISY));
  const { plans, threats } = fly(route);
  const got = plans.map(shape).join(' ');
  check('route B (8 ships, careful): calm ×2, seeds ×4 (TRACE stays under 3), HOLLOW boards forced at 7 with WALLS, FINALE + DEAL',
    got === 'calm calm seeds seeds seeds seeds hollow:arrival+walls!forced/10 finale:finale+hunt/16', got);
  check('…TRACE is 1 when it boards', threats[5]!.trace === 1, `${threats[5]!.trace}`);
}

// --- Route C: 8 ships, noisy and sloppy ----------------------------------------------------------------------------
{
  const route = [routeShip(1, 8, 0), routeShip(2, 8, 0), routeShip(3, 8, 2), routeShip(4, 8, 1), routeShip(5, 8, 1),
    routeShip(6, 8, 2), routeShip(7, 8, 0), routeShip(8, 8, 0)];
  const { plans, threats } = fly(route);
  const got = plans.map(shape).join(' ');
  check('route C (8 ships, sloppy): TRACE 2 then 3, HOLLOW boards at 5 by TRACE (plain ARRIVAL, 8), WALLS fed (+1 = 11), SEEDS fed (+3 = 15 capped 14), FINALE 16',
    got === 'calm calm seeds seeds hollow:arrival!trace/8 hollow:walls/11 hollow:seeds/14 finale:finale+hunt/16', got);
  check('…TRACE stops counting once HOLLOW is aboard; what is left feeds it, cumulatively',
    threats[3]!.trace === 3 && threats[7]!.trace === 3 && threats[5]!.fed === 3, `trace ${threats.map((t) => t.trace).join(',')} fed ${threats.map((t) => t.fed).join(',')}`);
  check('…the run remembers where and why it boarded, and the stages it played (the folded DEAL\'s HUNT only once offered)',
    threats[4]!.boardedAtDepth === 5 && threats[4]!.boardCause === 'trace' && threats[7]!.stagesPlayed.join() === 'arrival,walls,seeds,finale',
    `${threats[7]!.stagesPlayed.join()}`);
  check('…and the current ship\'s verdict facts (run.threat.current: the final ship here)',
    JSON.stringify(threats[7]!.current) === JSON.stringify({ oneHopFromFinal: false, isFinal: true, stage: 'finale', boards: null })
    && threats[6]!.current?.oneHopFromFinal === true && threats[4]!.current?.boards === 'trace', JSON.stringify(threats[7]!.current));
}

// --- The boarding conditions ---------------------------------------------------------------------------------------
{
  const base: ThreatInput = { depth: 4, isFinal: false, oneHopFromFinal: false, beamSeeds: NOISY, trace: 0, aboard: false, age: 0, dealDone: false, fed: 0, traces: NO_FINAL_TRACES };
  check(`never below depth ${BOARD_MIN_DEPTH}, whatever TRACE or the final ship`,
    boardsOnBeam({ ...base, depth: 3, trace: 9, oneHopFromFinal: true }) === null);
  check(`earned at TRACE ${TRACE_BOARD_AT} from depth 4`, boardsOnBeam({ ...base, trace: TRACE_BOARD_AT }) === 'trace'
    && boardsOnBeam({ ...base, trace: TRACE_BOARD_AT - 1 }) === null);
  check('forced one hop from a final ship', boardsOnBeam({ ...base, oneHopFromFinal: true }) === 'forced');
  check('never on the beam into a final ship (the ship before it was one hop from it)', boardsOnBeam({ ...base, depth: 6, isFinal: true, trace: 5 }) === null);
  check('never twice (already aboard)', boardsOnBeam({ ...base, aboard: true, age: 1, trace: 5, oneHopFromFinal: true }) === null);
  const earnedOneHop = planThreat({ ...base, trace: 3, oneHopFromFinal: true });
  check('TRACE wins the cause when both hold, and the arrival still folds WALLS in one hop out',
    earnedOneHop.boards === 'trace' && earnedOneHop.folded.join() === 'walls' && earnedOneHop.rootBlocks === 10);
  check('below the seeds depth a ship is calm, from it seeds-only', planThreat({ ...base, depth: 2 }).act === 'calm' && planThreat({ ...base, depth: 3 }).act === 'seeds');
  let threw = false;
  try { planThreat({ ...base, aboard: true, age: 0 }); } catch { threw = true; }
  check('aboard with age 0 is a broken input: it throws', threw);
}

// --- Stages, roots and the cap ---------------------------------------------------------------------------------------
{
  check('stageForAge: arrival, walls, seeds, then hunt for good', [1, 2, 3, 4, 7].map(stageForAge).join() === 'arrival,walls,seeds,hunt,hunt');
  check('each stage plays its own def (aboard, not folded)', (['walls', 'seeds', 'hunt'] as const).every((stage, index) => {
    const plan = planThreat({ depth: 6, isFinal: false, oneHopFromFinal: false, beamSeeds: NOISY, trace: 3, aboard: true, age: index + 1, dealDone: true, fed: 0, traces: NO_FINAL_TRACES });
    return plan.stage === stage && JSON.stringify(plan.hollow) === JSON.stringify(HOLLOW_STAGES[stage].hollow) && plan.rootBlocks === HOLLOW_STAGES[stage].rootBlocks;
  }));
  check('roots: 8, 10, 12, 14, 16; a fold takes the larger stage\'s root', rootBlocksFor('arrival', [], 0) === 8 && rootBlocksFor('walls', [], 0) === 10
    && rootBlocksFor('seeds', [], 0) === 12 && rootBlocksFor('hunt', [], 0) === 14 && rootBlocksFor('finale', [], 0) === 16
    && rootBlocksFor('arrival', ['walls'], 0) === 10);
  check(`what it was fed grows the root up to ${PRE_FINAL_ROOT_CAP} before the final ship; the FINALE's stays 16`,
    rootBlocksFor('arrival', [], 3) === 11 && rootBlocksFor('seeds', [], 5) === PRE_FINAL_ROOT_CAP && rootBlocksFor('finale', [], 9) === 16);
  const dealt = planThreat({ depth: 5, isFinal: true, oneHopFromFinal: false, beamSeeds: CLEAN, trace: 0, aboard: true, age: 1, dealDone: true, fed: 0, traces: NO_FINAL_TRACES });
  check('a run that had THE DEAL gets a plain FINALE', dealt.folded.length === 0 && !dealt.hollow.deal && dealt.hollow.verbs !== null);
}

// --- The fixed five ----------------------------------------------------------------------------------------------------
{
  const got = [0, 1, 2, 3, 4].map((index) => shape(nominalShipThreat(index))).join(' ');
  check('the fixed five (nominal, TRACE 0): calm, calm, seeds, VESPER boards forced with WALLS (10), LAST LIGHT FINALE + DEAL (16)',
    got === 'calm calm seeds hollow:arrival+walls!forced/10 finale:finale+hunt/16', got);
  const facts = [0, 1, 2, 3, 4].map(fixedShipFacts);
  check('the facts: depth = index + 1, the flagship is final, VESPER is one hop from it, KESTREL\'s beam is scripted',
    facts.map((fact) => fact.depth).join() === '1,2,3,4,5' && facts[4]!.isFinal && facts[3]!.oneHopFromFinal
    && facts[2]!.beamSeeds.kind === 'scripted' && facts[3]!.beamSeeds.kind === 'noise');
  const runs = [0, 1, 2, 3, 4].map(nominalRunThreat);
  check('nominalRunThreat: aboard from VESPER (age 1, forced, depth 4), age 2 on LAST LIGHT, nothing reported home',
    !runs[2]!.aboard && runs[3]!.aboard && runs[3]!.age === 1 && runs[3]!.boardCause === 'forced' && runs[3]!.boardedAtDepth === 4
    && runs[4]!.age === 2 && runs.every((run) => run.trace === 0 && run.fed === 0));
  check('the verdict echoes the facts it was planned from (the beam\'s seeds included)', [0, 1, 2, 3, 4].every((index) => {
    const plan = nominalShipThreat(index);
    return plan.depth === facts[index]!.depth && plan.isFinal === facts[index]!.isFinal
      && JSON.stringify(plan.beamSeeds) === JSON.stringify(facts[index]!.beamSeeds);
  }));
  let threw = false;
  try { nominalRunThreat(5); } catch { threw = true; }
  check('nominalRunThreat throws on a ship the fleet does not have', threw);
}

finish();
