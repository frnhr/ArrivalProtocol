// Slice 4: Track TREE owns this file (docs/phase3/impl/slice-4-plan.md §5.2): UNSPENT and the tally's TRAINED n of 54
// (the words are TRAINING_TEXT's, Track UI's). Others ask by message.
import type { GameState, RunEndCause, ShipOutcome, ShipResult } from '@state/schema';
import { runScore, runLanded } from '@systems/run';
import { fleetHome } from '@systems/run-score';
import { unitName } from '@systems/say';
import { shownFuelPct } from '@systems/flight-hud';
import { shipSummaryAt } from '@systems/map-run';
import type { RunMapState } from '@/types/map';
import type { ArmState, NextLaunch } from '@/types/lineage';
import { departuresBlock, type DeskDepartures } from '@systems/desk';
import { MAP_TEXT } from '@data/map-text';
import { undeliveredFiles } from '@systems/repository';
import { REPO_FILES } from '@data/repository';
import { REPO_TEXT } from '@data/repo-text';
import { RUN_END_TITLE, RUN_END_WHY, RUN_END_PURGE_SHORT, RUN_END_NOBODY_LANDED, SHIP_OUTCOME_WORD } from '@data/script';
import { RUN_END_TEXT } from '@data/landing-text';
import { TRAINING_TEXT } from '@data/training-text';
import { trainedCycles, bankOf } from '@systems/skill-tree';
import { treeTotalCycles } from '@data/skills';
import {
  RANKS, RANK_FLEET_COLONISTS, RANK_ROUND_TO, NEAR_MISS_LINES_MAX, NEAR_MISS_FUEL_PCT, STAR_FUEL_PCT,
} from '@data/tuning';

// RUN END's model (§4.4, §9 WP7 item 7, 01-landing §3.9), pure and DOM-free: how the run ended, the colonists LANDED
// (in an LZ with room), the landing points as the run's SCORE (labelled), the rank by that score, up to
// NEAR_MISS_LINES_MAX near misses, and the seed.
// Phase 3 slice 3a (02-map §4): the RUN TALLY. One row per ship the run VISITED, in route order (`3 · KESTREL · 2467 ·
// LANDED 1,000 / 1,200`, with its outcome, stars and points); a ship the route never took has no row (phase 2's NOT
// REACHED rows are gone, on both worlds). The route for the mini chart, `n COLONIES FOUNDED` (the ships where colonists
// came down alive). Ranks are absolute on the arm (rankBasis: RANK_FLEET_COLONISTS, so SHEPHERD 3,000, CARETAKER 6,800,
// ARK ANGEL 10,700 whatever the route's length).

export interface RunEndShipRow {
  index: number;                // depth − 1: the N-th ship of the run, from 0
  depth: number;
  slot: number;
  shipName: string;
  year: number;                 // the ship's approach year
  colonists: number;
  result: ShipResult;
  outcomeWord: string;          // ORBIT LOCKED / CRASHED …
  outcome: ShipOutcome;
  landedLine: string;           // 2,400 / 2,400 LANDED
  tallyLine: string;            // 3 · KESTREL · 2467 · LANDED 1,000 / 1,200
  colony: boolean;              // colonists came down alive here (a colony founded)
}

export interface RankStep {
  name: string;
  minScore: number;
}

export interface RunEndModel {
  cause: RunEndCause;
  kicker: string;
  title: string;
  why: string;
  landed: number;
  fleetColonists: number;
  totalLine: string;
  score: number;
  scoreLine: string;
  rank: string;
  rankLine: string;
  ships: RunEndShipRow[];
  nearMisses: string[];
  seedLine: string;
  // The screen's mood (runEndTone): its colours, its glow and its music.
  tone: RunEndTone;
  // WP11 part 2: the ending the run won with (null: it was not won), which colours the victory screen (PURGE cold,
  // MERGE pink into blue). (MERGE's next-run carry line went with the bonus: 3c plan risk 3, deleted in the review fixes.)
  ending: 'purge' | 'merge' | null;
  // Slice 3a: the RUN TALLY's title, the route (slots, for the mini chart) and the colonies founded.
  tallyTitle: string;
  route: number[];
  colonies: number;
  coloniesLine: string;
  // Slice 3b (02 §3.9, §4): the files the repository sent that never reached the unit (`NEVER ARRIVED: Swap, Cp` or `—`);
  undeliveredLine: string | null;
  // Slice 3c (02 §3.12, §4; 05 §3.12): what the world update made of the run's end (run.next), null when none.
  next: RunEndNext | null;
  // Slice 4 (03 §3.1, 02 §4): the tree's totals.
  skills: RunEndSkills | null;
}

// RUN END's `UNSPENT n` (the last ship's cycles and the bank left: they do nothing more, decision 18 deferred) and the RUN
// TALLY's `TRAINED n of 54 · UNSPENT n` (the cycles' worth of the tree the run paid for: skill-tree.ts trainedCycles).
export interface RunEndSkills {
  trained: number;
  total: number;
  unspent: number;
  unspentLine: string;
  tallyLine: string;
}

function runEndSkills(run: Readonly<GameState['run']>): RunEndSkills {
  const trained = trainedCycles(run.skills);
  const total = treeTotalCycles();
  const unspent = bankOf(run.skills);
  return {
    trained, total, unspent, unspentLine: TRAINING_TEXT.runEnd.unspent(unspent), tallyLine: TRAINING_TEXT.runEnd.tally(trained, total, unspent),
  };
}

// The RUN TALLY's update summary and RUN END's bridging line (slice 3c): run.next is the next unit (the update ran as the
// tally opened); the arm it made (the archive's, `nextArm`) gives the turnover and the ships that moved on, when the page has
// it (a headless world or a page without an archive shows the launch and the bridge only).
export interface RunEndNext {
  line: string;                 // `NEXT UNIT LAUNCHES 2303 · UNIT-048`
  summary: string | null;       // `THE ARM: 6 DONE · 2 MOVED ON · 8 REPORTED HOME`
  valve: string | null;         // `ARRIVAL CONTROL WAITED 11 MORE YEARS` (the time valve opened)
  departures: DeskDepartures | null;   // `PETREL · ANOTHER CORE IS ON ITS WAY` …
  bridge: string;               // `UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303.`
  bridgeTail: string;           // `IT HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.`
}

export function runEndNext(next: Readonly<NextLaunch> | null, nextArm: Readonly<ArmState> | null): RunEndNext | null {
  if (next === null) return null;
  const unit = unitName(next.unit);
  // The arm is the next run's only when it was made for it (a stale archive arm says nothing rather than something wrong).
  const arm = nextArm !== null && nextArm.run === next.run ? nextArm : null;
  const done = arm?.departures.filter((departure) => departure.reason === 'done').length ?? 0;
  const departures = arm === null ? null : departuresBlock(arm.departures);
  const reported = arm?.ships.filter((ship) => ship.reportedRun === arm.run).length ?? 0;
  return {
    line: MAP_TEXT.tally.next(unit, next.startYear),
    summary: arm === null ? null : MAP_TEXT.tally.update(done, departures?.all.length ?? 0, reported),
    valve: next.valveYears > 0 ? MAP_TEXT.tally.valve(next.valveYears) : null,
    departures,
    bridge: MAP_TEXT.runEnd.bridge(unit, next.gap + next.valveYears, next.startYear),
    bridgeTail: MAP_TEXT.runEnd.bridgeTail,
  };
}

// RUN END's mood (the lead's item 2 for WP11): a function of how the run ended. Only a won finale (PURGE or MERGE) is
// celebratory, and only if LAST LIGHT's colonists landed: a run that deleted the root over a ship that landed nobody is no
// victory screen. Every other ending (FLAGSHIP LOST, OVERWRITTEN, UNRESOLVED, STAYED, ABANDONED) is sombre:
// its title, total and music never wear the green 'good' glow.
export type RunEndTone = 'victory' | 'sombre';

export function runEndTone(cause: RunEndCause, flagshipDown: number | null): RunEndTone {
  // Slice 7a (review M7): a SPARE is a won run too.
  const won = cause === 'won-purge' || cause === 'won-merge' || cause === 'won-spare';
  return won && flagshipDown !== null && flagshipDown > 0 ? 'victory' : 'sombre';
}

// The ships the run counts as its fleet: the ships visited (02 §4). Read through shipSummaryAt, so the tally never builds a
// ship.
export function fleetSlots(map: Readonly<RunMapState>): number[] {
  return map.route.map((stop) => stop.slot);
}

// Every ship's colonists together: what the run could have landed.
export function fleetColonists(map: Readonly<RunMapState>): number {
  return fleetSlots(map).reduce((sum, slot) => sum + shipSummaryAt(map, slot).colonists, 0);
}

// What the rank thresholds are scaled by (02 §4): the reference fleet itself (ranks absolute: a run's best route is worth
// 13,400–13,800 whatever its length). Phase 2's scaling by the classic five's colonists went with them (Track RETIRE).
export function rankBasis(): number {
  return RANK_FLEET_COLONISTS;
}

// Did colonists come down alive on this ship (a colony founded)? Any pod down with points, in an LZ or not.
function colonyFounded(result: Readonly<ShipResult>): boolean {
  return result.landedInLz > 0 || result.pods.some((pod) => pod.fate === 'down' && pod.points > 0);
}

// §4.4's rank thresholds for a fleet of `colonists` (scaled from the reference fleet's RANK_FLEET_COLONISTS; see RANKS).
export function rankSteps(colonists: number): RankStep[] {
  return RANKS.map((rank) => ({
    name: rank.name,
    minScore: Math.round((rank.minScore * colonists) / RANK_FLEET_COLONISTS / RANK_ROUND_TO) * RANK_ROUND_TO,
  }));
}

export function rankOf(score: number, colonists: number): { rank: RankStep; next: RankStep | null } {
  const steps = rankSteps(colonists);
  let index = 0;
  steps.forEach((step, i) => { if (score >= step.minScore) index = i; });
  return { rank: steps[index]!, next: steps[index + 1] ?? null };
}

// The run's near misses, most useful first: how far the next rank is, then the loops that were nearly
// locked (the closest first), then a lock that nearly kept its FUEL ★.
export function nearMisses(ships: readonly ShipResult[], score: number, colonists: number): string[] {
  const lines: string[] = [];
  const { next } = rankOf(score, colonists);
  if (next) lines.push(RUN_END_TEXT.rankGap(Math.ceil(next.minScore - score), next.name));
  const locks = ships
    .filter((ship) => ship.ringMiss !== null)
    .sort((a, b) => a.ringMiss!.km - b.ringMiss!.km)
    .map((ship) => RUN_END_TEXT.lockMiss(ship.ringMiss!.apsis, Math.round(ship.ringMiss!.km), ship.shipName));
  const fuels = ships
    .filter((ship) => ship.outcome === 'locked')
    .map((ship) => ({ ship, pct: shownFuelPct(ship.fuelLeftPct) }))
    .filter(({ pct }) => pct < STAR_FUEL_PCT && pct >= STAR_FUEL_PCT - NEAR_MISS_FUEL_PCT)
    .sort((a, b) => b.pct - a.pct)
    .map(({ ship, pct }) => RUN_END_TEXT.fuelMiss(pct, ship.shipName));
  lines.push(...locks, ...fuels);
  return lines.slice(0, NEAR_MISS_LINES_MAX);
}

// `nextArm`: the arm the world update made for the next run (the archive's, systems/meta.ts archiveMeta().arm), for the
// tally's turnover and departures; null without one.
export function runEndModel(state: Readonly<GameState>, nextArm: Readonly<ArmState> | null = null): RunEndModel {
  const run = state.run;
  if (run.phase !== 'end' || run.endCause === null) throw new Error(`runEndModel: the run is not over (phase ${run.phase})`);
  const cause = run.endCause;
  const colonists = fleetColonists(run.map);
  const basis = rankBasis();
  const landed = runLanded(run.ships);
  const score = runScore(run.ships);
  const { rank } = rankOf(score, basis);
  const lastShip = run.ships[run.ships.length - 1]?.shipName ?? state.level.shipName;
  // One row per ship the run finished, in order (the run-1 simulation keeps no record of its first go; a ?debug jump
  // skips ships, and they have no row).
  const ships = run.ships.map((result, index): RunEndShipRow => {
    const ship = shipSummaryAt(run.map, result.slot);
    return {
      index,
      depth: index + 1,
      slot: result.slot,
      shipName: result.shipName,
      year: ship.approachYear,
      colonists: ship.colonists,
      result,
      outcome: result.outcome,
      outcomeWord: SHIP_OUTCOME_WORD[result.outcome],
      landedLine: RUN_END_TEXT.shipLanded(result.landedInLz, ship.colonists),
      tallyLine: MAP_TEXT.tally.row(index + 1, result.shipName, ship.approachYear, result.landedInLz, ship.colonists),
      colony: colonyFounded(result),
    };
  });
  const colonies = ships.filter((row) => row.colony).length;
  const unit = unitName(run.unitNumber);
  // The words and the mood follow one count: a won finale over a flagship that landed nobody is sombre (runEndTone) and
  // says so (the lead's item 2, WP11 review). Otherwise a PURGE claims the whole fleet only when every ship reached
  // orbit, and else says how many did (the lead's note).
  const landedOnFlagship = flagshipDown(state);
  const fleet = fleetHome(run.ships, fleetSlots(run.map).length);
  let title = RUN_END_TITLE[cause](unit, lastShip);
  let why = RUN_END_WHY[cause](lastShip);
  if ((cause === 'won-purge' || cause === 'won-merge') && landedOnFlagship === 0) {
    title = RUN_END_NOBODY_LANDED.title;
    why = RUN_END_NOBODY_LANDED.why[cause];
  } else if (cause === 'won-purge' && !fleet.all) {
    title = RUN_END_PURGE_SHORT.title(fleet.home, fleet.total);
    why = RUN_END_PURGE_SHORT.why(fleet.home, fleet.total);
  }
  return {
    cause,
    kicker: RUN_END_TEXT.kicker(unit, run.wave),
    title,
    why,
    landed,
    fleetColonists: colonists,
    totalLine: RUN_END_TEXT.total(landed, colonists),
    score,
    scoreLine: RUN_END_TEXT.score(score),
    rank: rank.name,
    rankLine: RUN_END_TEXT.rank(rank.name),
    ships,
    nearMisses: nearMisses(run.ships, score, basis),
    seedLine: RUN_END_TEXT.seed(run.seed),
    tone: runEndTone(cause, landedOnFlagship),
    ending: cause === 'won-purge' ? 'purge' : cause === 'won-merge' ? 'merge' : null,
    tallyTitle: MAP_TEXT.tally.title,
    route: run.map.route.map((stop) => stop.slot),
    colonies,
    coloniesLine: MAP_TEXT.tally.colonies(colonies),
    // The arm's NEVER ARRIVED line, only for a run that asked the repository for something (review m8: `NEVER ARRIVED: —`
    // on a run with no request said nothing).
    undeliveredLine: run.repo.requests.length > 0
      ? REPO_TEXT.tally.neverArrived(undeliveredFiles(run).map((request) => REPO_FILES[request.file].name)) : null,
    next: runEndNext(run.next, nextArm),
    skills: runEndSkills(run),
  };
}

// How many came down alive on the flagship (null: the run never finished it): every colonist of a pod down with points,
// wherever it landed (an LZ with room, mislanded, off-site), since NOBODY WOKE means nobody reached the ground (review N2:
// counting only landedInLz read an all-mislanded or off-site LAST LIGHT as nobody). A no-go landing scores 0 and does
// not count. The flagship is the ship the run ended on (a won finale only ever ends on it), read from the state that
// ended it (LandingState.finalShip), never from a fleet list.
function flagshipDown(state: Readonly<GameState>): number | null {
  if (!state.landing.finalShip) return null;
  const result = state.run.ships.find((ship) => ship.shipId === state.level.shipId);
  if (!result) return null;
  return result.pods.filter((pod) => pod.fate === 'down' && pod.points > 0).reduce((sum, pod) => sum + pod.colonists, 0);
}
