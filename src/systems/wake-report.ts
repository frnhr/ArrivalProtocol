import type { GameState, ClusterOutcome, ClusterResult } from '@state/schema';
import type { Colonist } from '@/types/segment';
import { soulCounts } from '@state/selectors';
import { shipStars, starCharge, type ShipStar } from '@systems/stars';
import { creditName, GAPS_WORDS_POOL } from '@data/souls';
import { isLastShip } from '@data/ships';
import { REPORT_TEXT, CREDIT_STATUS } from '@data/script';

// What the WAKE REPORT shows (§4.1 step 4, §5.1 1:55, §9 WP5 item 8), as data: pure and DOM-free,
// built once when the ship reaches 'report' (components/run/WakeReport.ts draws it).
// • The credits: one colonist per cluster, by name, with the first thing they said (no two say the
//   same thing). The lead cluster's first colonist leads (Ada Okafor, 11: "Is it morning?"), with
//   who she is; then the other clusters in the order they woke. A cluster that woke with missing
//   memories says a line from GAPS_WORDS_POOL instead of its own; one that did not wake says nothing.
// • The totals: WOKE counts heads (the lead's rule, WP7: one meaning of WOKE everywhere), out of
//   everyone aboard; the line under it says how many of them woke with missing memories (the cost, in
//   the hurt yellow), then how they woke (intact, gaps, did not wake). §4.4's half-credit SCORE is the
//   run's, on RUN END only.
// • The stars (systems/stars.ts) and the REPAIR CHARGE they carry.

export interface CreditEntry {
  lead: boolean;
  cluster: string;
  family: string;
  souls: number;
  outcome: ClusterOutcome;
  name: string;           // 'Ada Okafor'
  age: number;
  about: string | null;   // who they are; only the lead's credit carries it
  words: string | null;   // what they said waking up; null when they did not wake
  status: string;         // WOKE / WOKE · MISSING MEMORIES / DID NOT WAKE
}

export interface WakeReportModel {
  title: string;
  route: string;          // ARES-VII → KEPLER-186F
  credits: CreditEntry[];
  woke: number;           // everyone who woke, intact or with missing memories (heads)
  wokeWithGaps: number;   // how many of them woke with missing memories
  total: number;
  totalsLine: string;     // 2,400 / 2,400 WOKE
  missingLine: string | null;  // 2,200 WITH MISSING MEMORIES (null when nobody did)
  breakdown: string;      // 2,400 intact · 0 missing memories · 0 did not wake
  stars: ShipStar[];
  charge: number;
  chargeLine: string;      // what the stars carry to the next ship, or, on the last ship, that the run ends
  continueLabel: string;   // CONTINUE ▸, or RUN END ▸ on the last ship
  lastShip: boolean;       // the fleet's last ship: CONTINUE ends the run
}

function clusterNumber(code: string): number {
  const number = Number(code.replace(/^C/, ''));
  if (!Number.isInteger(number) || number < 1) throw new Error(`wake-report: '${code}' is not a cluster code`);
  return number;
}

// A gaps line for this cluster: its own place in the pool (by cluster number, so the same report
// always reads the same), or the next one nobody has said yet. The pool is at least as long as the
// biggest ship's cluster count (data/ships.ts validates it), so it never runs out.
function gapsWordsFor(result: ClusterResult, saidWords: ReadonlySet<string>): string {
  const start = clusterNumber(result.cluster) - 1;
  for (let i = 0; i < GAPS_WORDS_POOL.length; i++) {
    const words = GAPS_WORDS_POOL[(start + i) % GAPS_WORDS_POOL.length]!;
    if (!saidWords.has(words)) return words;
  }
  throw new Error(`wake-report: every missing-memories line is taken before ${result.cluster}`);
}

function wordsFor(result: ClusterResult, colonist: Colonist, saidWords: ReadonlySet<string>): string | null {
  if (result.outcome === 'woke') return colonist.firstWords;
  if (result.outcome === 'gaps') return gapsWordsFor(result, saidWords);
  return null;
}

// Who a cluster is credited by: its first featured colonist, unless their first words were already
// said higher up the credits (the roster deals words from a deck that reshuffles, so two families
// can share a line); then the next of the three who has words of their own.
function creditedColonist(result: ClusterResult, saidWords: ReadonlySet<string>): Colonist {
  const first = result.featured[0];
  if (!first) throw new Error(`wake-report: ${result.cluster} has nobody to credit`);
  if (result.outcome !== 'woke') return first;
  return result.featured.find((colonist) => !saidWords.has(colonist.firstWords)) ?? first;
}

function credit(result: ClusterResult, lead: boolean, saidWords: Set<string>): CreditEntry {
  const colonist = creditedColonist(result, saidWords);
  const words = wordsFor(result, colonist, saidWords);
  if (words !== null) saidWords.add(words);
  return {
    lead,
    cluster: result.cluster,
    family: result.family,
    souls: result.souls,
    outcome: result.outcome,
    name: creditName(colonist),
    age: colonist.age,
    about: lead ? colonist.line : null,
    words,
    status: CREDIT_STATUS[result.outcome],
  };
}

// The credits in the order they roll: the lead cluster first, then the rest as they left memory.
export function creditsOf(state: Readonly<GameState>): CreditEntry[] {
  const results = state.souls.results;
  const lead = results.find((result) => result.cluster === state.souls.lead);
  if (!lead) throw new Error(`wake-report: the lead cluster ${state.souls.lead} never left memory`);
  const saidWords = new Set<string>();
  const first = credit(lead, true, saidWords);
  return [first, ...results.filter((result) => result !== lead).map((result) => credit(result, false, saidWords))];
}

export function wakeReportModel(state: Readonly<GameState>): WakeReportModel {
  if (state.run.phase !== 'report') throw new Error(`wakeReportModel: the ship is in '${state.run.phase}', not 'report'`);
  const counts = soulCounts(state);
  const total = counts.heads + counts.lost;
  const stars = shipStars(state);
  const charge = starCharge(stars);
  const lastShip = isLastShip(state.run.shipIndex);
  return {
    title: REPORT_TEXT.title,
    route: REPORT_TEXT.route(state.level.shipName, state.mission.destination),
    credits: creditsOf(state),
    woke: counts.heads,
    wokeWithGaps: counts.wokeWithGaps,
    total,
    totalsLine: REPORT_TEXT.totals(counts.heads, total),
    missingLine: counts.wokeWithGaps > 0 ? REPORT_TEXT.missing(counts.wokeWithGaps) : null,
    breakdown: REPORT_TEXT.breakdown(counts.intact, counts.wokeWithGaps, counts.lost),
    stars,
    charge,
    chargeLine: lastShip ? REPORT_TEXT.lastShip : REPORT_TEXT.charge(charge),
    continueLabel: lastShip ? REPORT_TEXT.runEnd : REPORT_TEXT.continue,
    lastShip,
  };
}
