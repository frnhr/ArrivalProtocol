// Slice 8 Step 0 (docs/phase3/impl/slice-8-plan.md §1, §2, §3.3): the balance report's rows and the sweeps that feed them.
// Pure data, no game import, so balance/report.mjs reads it through tsx without loading a system, and balance/targets.test.ts
// (the quick tier, < 1 s) checks every row names its sweep, its metric id and its OD item.
// • A row is one metric id (support/balance-out.ts writeMetrics) against a band: `min` and/or `max` (both ends included), or
//   no band at all (INFO: information, G7 and the "now" numbers §2 asks for beside a target).
// • `source` is the sweep job that emits the id (SWEEPS below); `stem` is the part of the id the sweep's source file spells
//   out literally (an id built from a template, `drop.Δpods.${ship}.${kid}.v${version}`, names its fixed stem), which
//   targets.test greps for, so a row can't point at a sweep that never writes it.
// • `od` lists the OPEN-DECISIONS items the row answers ([] for a goal no item asked about yet); `lever` is §2's first lever,
//   printed under the table when the row is LOW or HIGH.
// • Percentages are 0–100 (unit '%'); pods are whole pods (200 colonists).
// Every §1 metric id is here (targets.test lists them), and so is every acceptance number of §2 that a sweep can measure.

export type SweepId =
  | 'playthrough' | 'playthrough-loo' | 'full-run' | 'traces-sweep' | 'survey-sweep' | 'survey-busy' | 'v3-sweep'
  | 'autodrop-sweep' | 'corrupted-sweep' | 'sleeper-sweep' | 'last-landing-sweep' | 'decoy-stats' | 'signal-stats';

export type Unit = '%' | 'pods' | 'per run' | 'per ship' | 'cycles' | 'pod/cycle' | 'ratio' | 's' | 'pts' | 'charge' | 'min' | 'fuel %' | '';

export interface Target {
  goal: string;
  label: string;
  metric: string;
  stem?: string;
  min?: number;
  max?: number;
  unit: Unit;
  source: SweepId;
  od: readonly number[];
  lever: string;
}

// One sweep run by the report: its suite file, its knobs in each profile, the parallel group it runs in ('playthrough' runs
// first, alone: it shards itself over PT_WORKERS), and the env the report adds for an A/B copy.
export interface SweepJob {
  id: string;
  source: SweepId;
  file: string;
  group: 'playthrough' | 'pool';
  quick: Readonly<Record<string, string>> | null;   // null: not run in this profile (its rows read `—`)
  full: Readonly<Record<string, string>> | null;
}

// The leave-one-out variants (§3.2): each drops one skill (or its versions from n up) from COMPETENT's buys.
export const LOO_VARIANTS: Readonly<Record<'quick' | 'full', readonly string[]>> = {
  quick: ['no-autoburn-v2', 'no-autoburn-v3', 'no-autodrop', 'no-sentry'],
  full: ['no-autoburn-v2', 'no-autoburn-v3', 'no-autodrop', 'no-autodrop-v3', 'no-sentry', 'no-sentry-v3'],
};

const PT_MAIN_OUT = 'tests/.out/balance/pt-main';

export const SWEEPS: readonly SweepJob[] = [
  {
    id: 'playthrough', source: 'playthrough', file: 'tests/unit/wp12/playthrough.test.ts', group: 'playthrough',
    quick: { PT_SEEDS: '24', PT_PLAYERS: 'COMPETENT,SLOPPY,LITERAL', PT_ROUTES: 'worked', PT_LANDING: 'strip', PT_OUT: PT_MAIN_OUT },
    full: { PT_SEEDS: '200', PT_PLAYERS: 'COMPETENT,SLOPPY,LITERAL', PT_ROUTES: 'set', PT_LANDING: 'strip', PT_OUT: PT_MAIN_OUT },
  },
  ...LOO_VARIANTS.full.map((variant): SweepJob => ({
    id: `playthrough-${variant}`, source: 'playthrough-loo', file: 'tests/unit/wp12/playthrough.test.ts', group: 'playthrough',
    quick: LOO_VARIANTS.quick.includes(variant)
      ? { PT_SEEDS: '24', PT_PLAYERS: 'COMPETENT', PT_ROUTES: 'worked', PT_LANDING: 'strip', PT_VARIANT: variant, PT_BASE: PT_MAIN_OUT, PT_OUT: `tests/.out/balance/pt-${variant}` }
      : null,
    full: { PT_SEEDS: '50', PT_PLAYERS: 'COMPETENT', PT_ROUTES: 'worked', PT_LANDING: 'strip', PT_VARIANT: variant, PT_BASE: PT_MAIN_OUT, PT_OUT: `tests/.out/balance/pt-${variant}` },
  })),
  { id: 'full-run', source: 'full-run', file: 'tests/unit/wp11/full-run.test.ts', group: 'pool', quick: { RUN_SEEDS: '10' }, full: { RUN_SEEDS: '50' } },
  { id: 'traces-sweep', source: 'traces-sweep', file: 'tests/unit/traces/traces-sweep.test.ts', group: 'pool', quick: { TS_SEEDS: '6', TS_CONTACT: '1' }, full: { TS_SEEDS: '20', TS_CONTACT: '1' } },
  { id: 'survey-sweep', source: 'survey-sweep', file: 'tests/unit/survey/survey-sweep.test.ts', group: 'pool', quick: { SURVEY_SWEEP_SEEDS: '3' }, full: { SURVEY_SWEEP_SEEDS: '10' } },
  { id: 'survey-busy', source: 'survey-busy', file: 'tests/unit/survey/survey-sweep.test.ts', group: 'pool', quick: { SURVEY_SWEEP_KID: 'busy' }, full: { SURVEY_SWEEP_KID: 'busy' } },
  { id: 'v3-sweep', source: 'v3-sweep', file: 'tests/unit/skills/v3-sweep.test.ts', group: 'pool', quick: { V3_SHIPS: 'VESPER,LAST LIGHT' }, full: {} },
  {
    id: 'autodrop-sweep', source: 'autodrop-sweep', file: 'tests/unit/skills/autodrop-sweep.test.ts', group: 'pool',
    quick: { SWEEP_SHIPS: 'CORMORANT,VESPER', SWEEP_KIDS: 'quiet,sloppy' }, full: { SWEEP_KIDS: 'healed,quiet,busy,sloppy' },
  },
  { id: 'corrupted-sweep', source: 'corrupted-sweep', file: 'tests/unit/residents/corrupted-sweep.test.ts', group: 'pool', quick: { CS_SEEDS: '7', CS_KIDS: 'strip,sloppy' }, full: { CS_SEEDS: '3,5,7,9,11', CS_KIDS: 'strip,sloppy' } },
  {
    id: 'sleeper-sweep', source: 'sleeper-sweep', file: 'tests/unit/residents/sleeper-sweep.test.ts', group: 'pool',
    quick: { SLEEPER_SEEDS: '1,7', SLEEPER_KIT: 'route', SLEEPER_HOLLOW: '1', SLEEPER_ARMS: '40' },
    full: { SLEEPER_SEEDS: '1,3,5,7,9', SLEEPER_KIT: 'route', SLEEPER_HOLLOW: '1', SLEEPER_ARMS: '200' },
  },
  { id: 'last-landing-sweep', source: 'last-landing-sweep', file: 'tests/unit/ending/last-landing-sweep.test.ts', group: 'pool', quick: { LL_SEEDS: '2' }, full: { LL_SEEDS: '8' } },
  { id: 'decoy-stats', source: 'decoy-stats', file: 'tests/unit/balance/decoy-stats.test.ts', group: 'pool', quick: {}, full: {} },
  { id: 'signal-stats', source: 'signal-stats', file: 'tests/unit/balance/signal-stats.test.ts', group: 'pool', quick: {}, full: {} },
];

// The traces-sweep's cases (its CASES, plus TS_CONTACT's three): G6's rows, one Δpods each.
export const TRACE_CASES: readonly string[] = [
  'REASSIGNMENT', 'PURGE+REASSIGN', 'MERGE+REASSIGN', 'SPARE+REASSIGN', 'SUNSET', 'STAY', 'CONTACT', 'PURGE+CONTACT', 'MERGE+CONTACT',
];
// The cases whose trace waits at a ship on the route (a placed gift: SPARE's cache, SUNSET's, STAY's packet, CONTACT's stops).
export const GIFT_CASES: readonly string[] = ['SPARE+REASSIGN', 'SUNSET', 'STAY', 'CONTACT', 'PURGE+CONTACT', 'MERGE+CONTACT'];

const KIDS = ['competent', 'literal', 'sloppy'] as const;

// Rows the report works out from two others (a ratio), after every sweep has written its metrics.
export const DERIVED: readonly { metric: string; ratio: readonly [string, string] }[] = [
  { metric: 'worth.autoburn.v3ratio', ratio: ['worth.autoburn.v3', 'worth.autoburn.v2'] },
];

export const TARGETS: readonly Target[] = [
  // --- G1: run win rate (R6: won-purge, won-merge, won-spare) ---------------------------------------------------------
  { goal: 'G1', label: 'COMPETENT wins', metric: 'win.competent', min: 90, unit: '%', source: 'playthrough', od: [88], lever: 'G2/G5 first: a COMPETENT loss is a pod or Core problem, read its seed with PT_TRACE=1 (R1)' },
  { goal: 'G1', label: 'LITERAL wins (the strip alone)', metric: 'win.literal', min: 80, unit: '%', source: 'playthrough', od: [], lever: 'the strip asks for less than it needs: read a lost LITERAL seed (PT_TRACE=1)' },
  { goal: 'G1', label: 'SLOPPY wins', metric: 'win.sloppy', min: 30, max: 65, unit: '%', source: 'playthrough', od: [], lever: 'BEAM_SEED_ODDS[1] (THREAT, §2.16) before the ladder' },
  { goal: 'G1b', label: 'SLOPPY ends sombre', metric: 'sombre.sloppy', min: 15, unit: '%', source: 'playthrough', od: [], lever: 'the lead\'s 07:10 ruling: careless play keeps a sombre ending' },
  { goal: 'G1c', label: 'COMPETENT wins, 5-ship route', metric: 'win.competent.r5', min: 85, unit: '%', source: 'playthrough', od: [], lever: 'README tension: HOLLOW compressed (PT_ROUTES=set, full profile)' },
  { goal: 'G1c', label: 'COMPETENT wins, 8-ship route', metric: 'win.competent.r8', min: 85, unit: '%', source: 'playthrough', od: [], lever: 'late MIND load (mind.busy, RESIDENT_LOCK_EVERY_SEC)' },
  // --- G2: pods landed in an LZ with room, of the route's pods ----------------------------------------------------------
  { goal: 'G2', label: 'COMPETENT pods landed', metric: 'pods.competent', min: 85, unit: '%', source: 'playthrough', od: [88], lever: '01\'s widths and drag only if every kid misses (§2.16)' },
  { goal: 'G2', label: 'COMPETENT pods, worst seed', metric: 'pods.competent.worst', min: 60, unit: '%', source: 'playthrough', od: [], lever: 'read the worst seed (PT_TRACE=1)' },
  { goal: 'G2', label: 'LITERAL pods landed', metric: 'pods.literal', min: 75, unit: '%', source: 'playthrough', od: [], lever: 'the strip\'s landing rows' },
  { goal: 'G2', label: 'SLOPPY pods landed', metric: 'pods.sloppy', min: 35, max: 70, unit: '%', source: 'playthrough', od: [88], lever: 'G5\'s ladder numbers (THREAT, §2.16)' },
  { goal: 'G2', label: 'COMPETENT pods, 5-ship route', metric: 'pods.competent.r5', unit: '%', source: 'playthrough', od: [], lever: '' },
  { goal: 'G2', label: 'COMPETENT pods, 8-ship route', metric: 'pods.competent.r8', unit: '%', source: 'playthrough', od: [], lever: '' },
  { goal: 'G2', label: 'COMPETENT pods, TIGHT route', metric: 'pods.competent.tight', unit: '%', source: 'playthrough', od: [], lever: '' },
  // --- G2b: ships lost -----------------------------------------------------------------------------------------------------
  { goal: 'G2b', label: 'COMPETENT ships lost per run', metric: 'lost.competent', max: 0.1, unit: 'per run', source: 'playthrough', od: [], lever: 'read the lost ship\'s seed (PT_TRACE=1)' },
  { goal: 'G2b', label: 'SLOPPY loses ≥ 1 ship', metric: 'lost1.sloppy', min: 50, unit: '%', source: 'playthrough', od: [], lever: 'the existing SLOPPY target: the ladder (§2.16)' },
  { goal: 'G2b', label: 'SLOPPY ships lost per run', metric: 'lost.sloppy', max: 2.5, unit: 'per run', source: 'playthrough', od: [], lever: 'the ladder\'s bite numbers (§2.16)' },
  // --- G3: cycles (worked route) -------------------------------------------------------------------------------------------
  { goal: 'G3', label: 'COMPETENT cycles earned', metric: 'cyc.earned.competent', min: 24, max: 32, unit: 'cycles', source: 'playthrough', od: [], lever: 'under 24: decision 18 to Fran (§2.15), the steps stay' },
  { goal: 'G3', label: 'COMPETENT cycles spent', metric: 'cyc.spent', unit: 'cycles', source: 'playthrough', od: [], lever: '' },
  { goal: 'G3', label: 'COMPETENT unspent at the last desk', metric: 'cyc.unspentLastDesk', max: 3, unit: 'cycles', source: 'playthrough', od: [], lever: 'the cheapest v2 price comes down by 1 (§2.15)' },
  { goal: 'G3', label: 'COMPETENT trains of the tree', metric: 'cyc.treeShare', min: 40, max: 60, unit: '%', source: 'playthrough', od: [53], lever: 'prices (§2.15, G4)' },
  { goal: 'G3', label: 'SLOPPY cycles earned', metric: 'cyc.earned.sloppy', min: 14, unit: 'cycles', source: 'playthrough', od: [], lever: 'decision 18 (§6)' },
  { goal: 'G3', label: 'SLOPPY first-pick floor fires', metric: 'cyc.floor.sloppy', max: 5, unit: '%', source: 'playthrough', od: [], lever: 'FIRST_PICK_FLOOR_CYCLES (§2.15)' },
  // --- G4: how much each skill pays (paired leave-one-out; pods per run ÷ the dropped cells' price) ----------------------
  { goal: 'G4', label: 'AUTOBURN v2+v3 pays', metric: 'worth.autoburn.v2', min: 0.1, max: 0.5, unit: 'pod/cycle', source: 'playthrough-loo', od: [3], lever: 'a cell under 0.10 with no time value comes down by 1 (§2.15)' },
  { goal: 'G4', label: 'AUTOBURN v3 pays', metric: 'worth.autoburn.v3', min: 0.1, max: 0.5, unit: 'pod/cycle', source: 'playthrough-loo', od: [3], lever: 'v3 price 8 → 7, then v3 holds any landing orbit (§2.2)' },
  { goal: 'G4', label: 'AUTOBURN v3 over v2 (of v2\'s pods/cycle)', metric: 'worth.autoburn.v3ratio', min: 0.4, unit: 'ratio', source: 'playthrough-loo', od: [3], lever: '§2.2' },
  { goal: 'G4', label: 'AUTODROP path pays', metric: 'worth.autodrop.v1', min: 0.1, max: 0.5, unit: 'pod/cycle', source: 'playthrough-loo', od: [9], lever: 'the sloppy kid\'s gain (§2.3), then the WIDE DROP pass' },
  { goal: 'G4', label: 'AUTODROP v3 pays', metric: 'worth.autodrop.v3', min: 0.1, max: 0.5, unit: 'pod/cycle', source: 'playthrough-loo', od: [9], lever: '§2.3 (full profile only)' },
  { goal: 'G4', label: 'SENTRY path pays', metric: 'worth.sentry.v1', min: 0.1, max: 0.5, unit: 'pod/cycle', source: 'playthrough-loo', od: [4], lever: 'SENTRY v1 at 1 cycle (§2.4); its value is mostly time, not pods' },
  { goal: 'G4', label: 'SENTRY v3 pays', metric: 'worth.sentry.v3', min: 0.1, max: 0.5, unit: 'pod/cycle', source: 'playthrough-loo', od: [], lever: '§2.15 (full profile only)' },
  // --- G5: threat pressure --------------------------------------------------------------------------------------------------
  { goal: 'G5', label: 'SLOPPY boarded by TRACE', metric: 'board.trace.sloppy', min: 15, max: 35, unit: '%', source: 'playthrough', od: [], lever: 'BEAM_SEED_ODDS[1] first, TRACE_BOARD_AT is a word on screen (§2.16)' },
  { goal: 'G5', label: 'COMPETENT boarded by TRACE', metric: 'board.trace.competent', max: 10, unit: '%', source: 'playthrough', od: [], lever: 'BEAM_SEED_ODDS[1] (§2.16)' },
  { goal: 'G5', label: 'COMPETENT drivers eaten per run', metric: 'eaten.competent', max: 2, unit: 'per run', source: 'playthrough', od: [], lever: 'the ladder\'s bite numbers (§2.16)' },
  { goal: 'G5', label: 'SLOPPY drivers eaten per run', metric: 'eaten.sloppy', min: 4, max: 12, unit: 'per run', source: 'playthrough', od: [], lever: 'the ladder\'s bite numbers (§2.16)' },
  { goal: 'G5', label: 'COMPETENT Core-dead runs', metric: 'core.dead.competent', max: 0, unit: '%', source: 'playthrough', od: [], lever: 'read the seed (PT_TRACE=1)' },
  { goal: 'G5', label: 'COMPETENT Core lowest, median', metric: 'core.min', min: 40, unit: '', source: 'playthrough', od: [], lever: 'the crossings\' Core hits' },
  { goal: 'G5', label: 'COMPETENT every thread busy, last 2 ships', metric: 'mind.busy', max: 30, unit: '%', source: 'playthrough', od: [], lever: 'RESIDENT_LOCK_EVERY_SEC 40 → 50 on a HOLLOW ship (§2.16)' },
  { goal: 'G5', label: 'COMPETENT thread waits per ship', metric: 'waits', max: 1, unit: 'per ship', source: 'playthrough', od: [], lever: 'AUTODROP / AUTOBURN claims (§2.16)' },
  { goal: 'G5b', label: 'a depth-5 run meets a decoy', metric: 'decoy.run', min: 40, unit: '%', source: 'decoy-stats', od: [4], lever: 'DISGUISE_CHANCE_BY_DEPTH 1/2, 2/3; else SENTRY v1 at 1 cycle (§2.4)' },
  { goal: 'G5b', label: 'ships with a decoy, depth 5', metric: 'decoy.ship.d5', stem: 'decoy.ship.d', unit: '%', source: 'decoy-stats', od: [4], lever: '' },
  { goal: 'G5b', label: 'ships with a decoy, depth 6', metric: 'decoy.ship.d6', stem: 'decoy.ship.d', unit: '%', source: 'decoy-stats', od: [4], lever: '' },
  { goal: 'G5b', label: 'ships with a decoy, depth 7', metric: 'decoy.ship.d7', stem: 'decoy.ship.d', unit: '%', source: 'decoy-stats', od: [4], lever: '' },
  // --- G6: the endings' traces at the next run's final ship ---------------------------------------------------------------
  ...TRACE_CASES.map((id): Target => ({
    goal: 'G6', label: `${id} Δpods (next run)`, metric: `trace.Δpods.${id}`, stem: 'trace.Δpods.', min: -1, max: 1, unit: 'pods', source: 'traces-sweep',
    od: id.includes('REASSIGN') ? [70] : id.includes('CONTACT') ? [84] : [45],
    lever: id.includes('REASSIGN') ? 'TRACE_ALLOWANCE_CHARGE 8 (§2.8)' : id.includes('CONTACT') ? 'CONTACT_GIFT_CHARGE (§2.9)' : 'TRACE_GIFT_CHARGE (§2.14)',
  })),
  { goal: 'G6', label: 'PURGE\'s own effect (PURGE+REASSIGN − REASSIGN)', metric: 'trace.Δpods.purgeOwn', min: -0.5, max: 0.5, unit: 'pods', source: 'traces-sweep', od: [70], lever: 'TRACE_PURGE_BITE_MULT (§2.14)' },
  { goal: 'G6', label: 'MERGE\'s own effect (MERGE+REASSIGN − REASSIGN)', metric: 'trace.Δpods.mergeOwn', min: -0.5, max: 0.5, unit: 'pods', source: 'traces-sweep', od: [70], lever: 'TRACE_MERGE_THREADS, TRACE_MERGE_ROOT_EXTRA (§2.14)' },
  { goal: 'G6', label: 'duel won, worst ending against no trace', metric: 'trace.Δduel', min: -5, max: 5, unit: '%', source: 'traces-sweep', od: [70], lever: '§2.8' },
  ...GIFT_CASES.map((id): Target => ({
    goal: 'G6', label: `${id} gift at its ship`, metric: `trace.gift.${id}`, stem: 'trace.gift.', min: 0, max: 15, unit: 'charge', source: 'traces-sweep',
    od: id.includes('CONTACT') ? [84] : [45], lever: id.includes('CONTACT') ? 'each stop +8 (CONTACT_GIFT_CHARGE)' : 'TRACE_GIFT_CHARGE',
  })),
  // --- G6b: the endings' prices --------------------------------------------------------------------------------------------
  { goal: 'G6b', label: 'MERGE affordable, COMPETENT', metric: 'merge.afford.competent', min: 50, max: 85, unit: '%', source: 'playthrough', od: [88], lever: 'MERGE_COST_CHARGE 18 / 16 / 15 / 14 by A/B (§2.10)' },
  { goal: 'G6b', label: 'MERGE affordable, LITERAL', metric: 'merge.afford.literal', min: 50, max: 85, unit: '%', source: 'playthrough', od: [88], lever: 'MERGE_COST_CHARGE (§2.10), then POLISH\'s PACKET hint' },
  { goal: 'G6b', label: 'COMPETENT charge at the choice, median', metric: 'merge.charge.competent', unit: 'charge', source: 'playthrough', od: [88], lever: '' },
  { goal: 'G6b', label: 'full-run: MERGE affordable', metric: 'merge.afford.fullrun', unit: '%', source: 'full-run', od: [88], lever: '' },
  { goal: 'G6b', label: 'full-run: charge at the choice p25', metric: 'merge.charge.p25', unit: 'charge', source: 'full-run', od: [88], lever: '' },
  { goal: 'G6b', label: 'full-run: charge at the choice median', metric: 'merge.charge.median', unit: 'charge', source: 'full-run', od: [88], lever: '' },
  { goal: 'G6b', label: 'full-run: charge at the choice p75', metric: 'merge.charge.p75', unit: 'charge', source: 'full-run', od: [88], lever: '' },
  { goal: 'G6b', label: 'COMPETENT leaves the empty ship', metric: 'empty.competent', min: 50, unit: '%', source: 'playthrough', od: [], lever: 'EMPTY_SHIP_FUEL_PCT: WAIT, the lead brings it to Fran (§2.14)' },
  { goal: 'G6b', label: 'CONTACT open (3 signals at the final ship)', metric: 'contact.open', min: 15, max: 35, unit: '%', source: 'playthrough', od: [84], lever: 'SIGNALS_FOR_CONTACT 3 → 2 if under 15% (§2.9)' },
  { goal: 'G6b', label: 'a route can collect 3 signals (run-1 arms)', metric: 'contact.reach', unit: '%', source: 'signal-stats', od: [84], lever: '' },
  // --- G7: pace (information) --------------------------------------------------------------------------------------------
  { goal: 'G7', label: 'COMPETENT wall time, median', metric: 'wall.competent', unit: 'min', source: 'playthrough', od: [], lever: '' },
  // --- §2's acceptance numbers ---------------------------------------------------------------------------------------------
  { goal: '§2.1', label: 'SURVEY v1 closes of the none→GOOD gap', metric: 'survey.gap.v1', min: 40, unit: '%', source: 'survey-sweep', od: [53], lever: 'v1 price 2 → 1; then [FRAN] v1\'s GROUND ? tell' },
  { goal: '§2.1', label: 'SURVEY v2 against GOOD', metric: 'survey.dq.v2', min: -3, unit: 'pts', source: 'survey-sweep', od: [52], lever: '' },
  { goal: '§2.1', label: 'SURVEY v3 against GOOD', metric: 'survey.dq.v3', unit: 'pts', source: 'survey-sweep', od: [54], lever: '' },
  { goal: '§2.1', label: 'SURVEY v1 cycles per POOR ship over none', metric: 'worth.survey.v1', unit: 'cycles', source: 'survey-sweep', od: [53], lever: '' },
  { goal: '§2.1', label: 'busy CORMORANT: SURVEY v3 over v2', metric: 'survey.busy.Δpods.v3', min: 0.5, unit: 'pods', source: 'survey-busy', od: [54], lever: 'SURVEY_SWEEP_FACTOR 2 → 3 (§2.1)' },
  { goal: '§2.1', label: 'SURVEY v3 mapped at ORBIT LOCK', metric: 'survey.mappedAtLock.v3', unit: '%', source: 'survey-sweep', od: [54], lever: '' },
  { goal: '§2.2', label: 'AUTOBURN v3 over v2, ×2.25 VESPER / LAST LIGHT (worst)', metric: 'v3.Δpods.damaged', min: 1, unit: 'pods', source: 'v3-sweep', od: [3], lever: 'or the first drop ≥ 30 s sooner (next row)' },
  { goal: '§2.2', label: 'AUTOBURN v3 first drop against v2, ×2.25', metric: 'v3.Δfirst-drop-s', max: -30, unit: 's', source: 'v3-sweep', od: [3], lever: 'or ≥ +1 pod (row above)' },
  { goal: '§2.2', label: 'AUTOBURN v3 FUEL against v2 ROUND, healthy', metric: 'v3.Δfuel.healthy', max: 0, unit: 'fuel %', source: 'v3-sweep', od: [3], lever: '' },
  { goal: '§2.3', label: 'sloppy kid: AUTODROP v1 on CORMORANT', metric: 'drop.Δpods.CORMORANT.sloppy.v1', stem: 'drop.Δpods.', min: 10, unit: '%', source: 'autodrop-sweep', od: [9], lever: '[FRAN] v2+ fly a WIDE DROP\'s in-band opening (§2.3)' },
  { goal: '§2.3', label: 'sloppy kid: AUTODROP v3 on VESPER', metric: 'drop.Δpods.VESPER.sloppy.v3', stem: 'drop.Δpods.', min: 15, unit: '%', source: 'autodrop-sweep', od: [9], lever: '[FRAN] the WIDE DROP pass (§2.3)' },
  { goal: '§2.3', label: 'AUTODROP worst row against v0', metric: 'drop.worst', min: 0, unit: '%', source: 'autodrop-sweep', od: [9], lever: 'read that row\'s seed first (R1)' },
  { goal: '§2.5', label: 'ignored resident: flight ends with FUEL ≥ 5%', metric: 'res.ok.ignore', min: 80, unit: '%', source: 'corrupted-sweep', od: [24], lever: 'RESIDENT_GHOST*.amp 0.15 → 0.10 (§2.5)' },
  { goal: '§2.5', label: 'ignored resident: FUEL under no resident', metric: 'res.press.ignore', min: 8, unit: 'fuel %', source: 'corrupted-sweep', od: [24], lever: 'the pressure to act stays' },
  { goal: '§2.5', label: 'every answer against no resident (worst)', metric: 'res.answerGap', max: 4, unit: 'fuel %', source: 'corrupted-sweep', od: [24], lever: '§2.5' },
  { goal: '§2.5', label: 'ignored resident: FUEL at the flight\'s end', metric: 'res.fuel.ignore', stem: 'res.fuel.', unit: 'fuel %', source: 'corrupted-sweep', od: [24], lever: '' },
  { goal: '§2.5', label: 'resident push against a failing Thrust Ctrl', metric: 'res.push', unit: 'ratio', source: 'corrupted-sweep', od: [13, 24], lever: '' },
  { goal: '§2.6', label: 'HOLD A WALL: drivers eaten against none', metric: 'moth.wall.Δeaten', max: -1, unit: 'per ship', source: 'sleeper-sweep', od: [25], lever: 'MOTH.wall a 2-block blocker in a GAP (§2.6)' },
  { goal: '§2.7', label: 'the route\'s kit wakes the sleeper', metric: 'sleeper.woken', min: 100, unit: '%', source: 'sleeper-sweep', od: [27], lever: 'REPAIR of sleep.lock wakes it (§2.7)' },
  { goal: '§2.7', label: 'sleeper reached with neither DELETE nor MOVE', metric: 'sleeper.noKit', unit: '%', source: 'sleeper-sweep', od: [27], lever: '' },
  { goal: '§2.14', label: 'blind drop worth on GENTLE', metric: 'll.blind.gentle', min: 0.6, max: 0.9, unit: 'ratio', source: 'last-landing-sweep', od: [], lever: 'kept (§2.14)' },
  { goal: '§2.14', label: 'blind drop worth on HARSH', metric: 'll.blind.harsh', min: 0.35, max: 0.65, unit: 'ratio', source: 'last-landing-sweep', od: [], lever: 'kept (§2.14)' },
  { goal: '§2.15', label: 'COMPETENT ships ended under the ★ 20% FUEL', metric: 'fuel.under20.competent', max: 30, unit: '%', source: 'playthrough', od: [], lever: 'AUTO_FUEL_RESERVE_PCT (§2.15)' },
  { goal: '§2.15', label: 'COMPETENT SAVING FUEL refusals per run', metric: 'reserve.refusals', unit: 'per run', source: 'playthrough', od: [], lever: '' },
  { goal: '§2.13', label: 'restores that healed a file', metric: 'restore.healed', unit: 'per run', source: 'playthrough', od: [1], lever: '' },
  { goal: '§2.16', label: 'TIGHT route: files left behind per ship', metric: 'files.left.tight', unit: 'per ship', source: 'playthrough', od: [], lever: '' },
];

// The §1 table's metric ids, by kid where the table says `<kid>` (targets.test checks each is a row).
export const SECTION1_METRICS: readonly string[] = [
  ...KIDS.map((kid) => `win.${kid}`), 'sombre.sloppy', 'win.competent.r5', 'win.competent.r8',
  ...KIDS.map((kid) => `pods.${kid}`), 'lost.competent', 'lost1.sloppy', 'lost.sloppy',
  'cyc.earned.competent', 'cyc.earned.sloppy', 'cyc.spent', 'cyc.unspentLastDesk', 'cyc.treeShare',
  'worth.autoburn.v2', 'worth.autoburn.v3', 'worth.autodrop.v1', 'worth.autodrop.v3', 'worth.sentry.v1',
  'board.trace.sloppy', 'board.trace.competent', 'eaten.competent', 'eaten.sloppy', 'core.min', 'mind.busy', 'waits',
  'decoy.run', ...TRACE_CASES.map((id) => `trace.Δpods.${id}`), 'trace.Δduel', ...GIFT_CASES.map((id) => `trace.gift.${id}`),
  'merge.afford.competent', 'merge.afford.literal', 'empty.competent', 'contact.open', 'wall.competent',
];

export function targetStatus(target: Readonly<Target>, value: number | null): 'OK' | 'LOW' | 'HIGH' | 'INFO' | '—' {
  if (target.min === undefined && target.max === undefined) return 'INFO';
  if (value === null) return '—';
  if (target.min !== undefined && value < target.min - 1e-9) return 'LOW';
  if (target.max !== undefined && value > target.max + 1e-9) return 'HIGH';
  return 'OK';
}

export function bandText(target: Readonly<Target>): string {
  const unit = target.unit === '%' ? '%' : '';
  const n = (value: number): string => `${value}${unit}`;
  if (target.min !== undefined && target.max !== undefined) {
    return target.min === -target.max && target.min !== 0 ? `±${target.max}${unit}` : `${n(target.min)}–${n(target.max)}`;
  }
  if (target.min !== undefined) return `≥ ${n(target.min)}`;
  if (target.max !== undefined) return `≤ ${n(target.max)}`;
  return 'info';
}
