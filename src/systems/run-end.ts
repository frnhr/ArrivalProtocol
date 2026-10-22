import type { GameState, RunEndCause, ShipOutcome, ShipResult } from '@state/schema';
import { runScore, runWoke } from '@systems/run';
import { fleetHome } from '@systems/run-score';
import { unitName } from '@systems/say';
import { shownFuelPct } from '@systems/flight-hud';
import { SHIPS } from '@data/ships';
import { shipSouls } from '@data/memory';
import { RUN_END_TITLE, RUN_END_WHY, RUN_END_TEXT, RUN_END_PURGE_SHORT, RUN_END_NOBODY_WOKE, SHIP_OUTCOME_WORD } from '@data/script';
import { HOLLOW_FINALE } from '@data/hollow-text';
import {
  RANKS, RANK_FLEET_SOULS, RANK_ROUND_TO, NEAR_MISS_LINES_MAX, NEAR_MISS_FUEL_PCT, STAR_FUEL_PCT, MERGE_BONUS_CORE_CAPACITY,
} from '@data/tuning';

// RUN END's model (§4.4, §9 WP7 item 7), pure and DOM-free: how the run ended, the souls that woke (heads,
// like everywhere: the lead's rule), every ship in the fleet with its outcome and stars (a ship the run
// never reached says so), §4.4's half-credit number as the run's SCORE (labelled), the rank by that score,
// up to NEAR_MISS_LINES_MAX near misses, and the seed.

export interface RunEndShipRow {
  index: number;
  shipName: string;
  souls: number;
  result: ShipResult | null;    // null: the run never reached this ship
  outcomeWord: string;          // ORBIT LOCKED / CRASHED … or NOT REACHED
  outcome: ShipOutcome | null;
  wokeLine: string;             // 2,400 / 2,400 WOKE, or '' when not reached
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
  woke: number;
  half: number;
  fleetSouls: number;
  totalLine: string;
  missingLine: string | null;
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
  // MERGE pink into blue), and what a MERGE carries into the next run (null otherwise).
  ending: 'purge' | 'merge' | null;
  carryLine: string | null;
}

// RUN END's mood (the lead's item 2 for WP11): a function of how the run ended. Only a won finale (PURGE or MERGE) is
// celebratory, and only if LAST LIGHT's colonists woke: a run that deleted the root over a ship whose every cluster was
// lost is no victory screen. Every other ending (FLAGSHIP LOST, OVERWRITTEN, UNRESOLVED, STAYED, ABANDONED) is sombre:
// its title, total and music never wear the green 'good' glow.
export type RunEndTone = 'victory' | 'sombre';

export function runEndTone(cause: RunEndCause, flagshipWoke: number | null): RunEndTone {
  const won = cause === 'won-purge' || cause === 'won-merge';
  return won && flagshipWoke !== null && flagshipWoke > 0 ? 'victory' : 'sombre';
}

// Every ship's souls together: what the run could have woken.
export function fleetSouls(): number {
  return SHIPS.reduce((sum, ship) => sum + shipSouls(ship), 0);
}

// §4.4's rank thresholds for a fleet of `souls` (scaled from the full 12,400-soul fleet; see RANKS).
export function rankSteps(souls: number): RankStep[] {
  return RANKS.map((rank) => ({
    name: rank.name,
    minScore: Math.round((rank.minScore * souls) / RANK_FLEET_SOULS / RANK_ROUND_TO) * RANK_ROUND_TO,
  }));
}

export function rankOf(score: number, souls: number): { rank: RankStep; next: RankStep | null } {
  const steps = rankSteps(souls);
  let index = 0;
  steps.forEach((step, i) => { if (score >= step.minScore) index = i; });
  return { rank: steps[index]!, next: steps[index + 1] ?? null };
}

// The run's near misses, most useful first: how far the next rank is, then the loops that were nearly
// locked (the closest first), then a lock that nearly kept its FUEL ★.
export function nearMisses(ships: readonly ShipResult[], score: number, souls: number): string[] {
  const lines: string[] = [];
  const { next } = rankOf(score, souls);
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

export function runEndModel(state: Readonly<GameState>): RunEndModel {
  const run = state.run;
  if (run.phase !== 'end' || run.endCause === null) throw new Error(`runEndModel: the run is not over (phase ${run.phase})`);
  const cause = run.endCause;
  const souls = fleetSouls();
  const woke = runWoke(run.ships);
  const half = run.ships.reduce((sum, ship) => sum + ship.half, 0);
  const score = runScore(run.ships);
  const { rank } = rankOf(score, souls);
  const lastShip = run.ships[run.ships.length - 1]?.shipName ?? state.level.shipName;
  const ships = SHIPS.map((ship, index): RunEndShipRow => {
    // By id, not by position: a ship can be flown twice (the run-1 simulation keeps no record of its first
    // go) or, with ?debug, skipped.
    const result = run.ships.find((candidate) => candidate.shipId === ship.id) ?? null;
    const shipTotal = shipSouls(ship);
    return {
      index,
      shipName: ship.name,
      souls: shipTotal,
      result,
      outcome: result?.outcome ?? null,
      outcomeWord: result ? SHIP_OUTCOME_WORD[result.outcome] : RUN_END_TEXT.notReached,
      wokeLine: result ? RUN_END_TEXT.shipWoke(result.woke, shipTotal) : '',
    };
  });
  const unit = unitName(run.unitNumber);
  // The words and the mood follow one count: a won finale over a flagship where nobody woke is sombre (runEndTone) and
  // says so (the lead's item 2, WP11 review). Otherwise a PURGE claims the whole fleet only when every ship reached
  // orbit, and else says how many did (the lead's note).
  const wokeOnFlagship = flagshipWoke(run.ships);
  const fleet = fleetHome(run.ships, SHIPS.length);
  let title = RUN_END_TITLE[cause](unit, lastShip);
  let why = RUN_END_WHY[cause](lastShip);
  if ((cause === 'won-purge' || cause === 'won-merge') && wokeOnFlagship === 0) {
    title = RUN_END_NOBODY_WOKE.title;
    why = RUN_END_NOBODY_WOKE.why[cause];
  } else if (cause === 'won-purge' && !fleet.all) {
    title = RUN_END_PURGE_SHORT.title(fleet.home, fleet.total);
    why = RUN_END_PURGE_SHORT.why(fleet.home, fleet.total);
  }
  return {
    cause,
    kicker: RUN_END_TEXT.kicker(unit, run.wave),
    title,
    why,
    woke,
    half,
    fleetSouls: souls,
    totalLine: RUN_END_TEXT.total(woke, souls),
    missingLine: half > 0 ? RUN_END_TEXT.missing(half) : null,
    score,
    scoreLine: RUN_END_TEXT.score(score),
    rank: rank.name,
    rankLine: RUN_END_TEXT.rank(rank.name),
    ships,
    nearMisses: nearMisses(run.ships, score, souls),
    seedLine: RUN_END_TEXT.seed(run.seed),
    tone: runEndTone(cause, wokeOnFlagship),
    ending: cause === 'won-purge' ? 'purge' : cause === 'won-merge' ? 'merge' : null,
    carryLine: cause === 'won-merge' ? HOLLOW_FINALE.mergeCarries(MERGE_BONUS_CORE_CAPACITY) : null,
  };
}

// How many woke on the flagship (null: the run never finished it). It is the last ship, so its result is the last one.
function flagshipWoke(ships: readonly ShipResult[]): number | null {
  const flagship = SHIPS.find((ship) => ship.flagship);
  if (!flagship) throw new Error('runEndModel: the fleet has no flagship');
  return ships.find((result) => result.shipId === flagship.id)?.woke ?? null;
}
