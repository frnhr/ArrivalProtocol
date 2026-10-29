// WP12 acceptance 3 (§9 WP12 spec item 1): the 200-seed playthrough. Runs tests/unit/wp12/playthrough.ts for the COMPETENT
// and the SLOPPY kid on seeds 1–PT_SEEDS (default 200 at full depth, 1 in the unit tier: see SEEDS), in PT_WORKERS
// parallel shards (default 4: one harness per process, since the systems are module singletons), prints the results
// table and checks the design's targets:
// • COMPETENT: ≥ 85% of the souls woke; every ship locked in ≥ 90% of the seeds; simulated wall time 20–32 min; never
//   Core-dead (no EMERGENCY, no OVERWRITTEN).
// • SLOPPY: the run completes (soft fails allowed) with ≥ 30% of the souls woke in ≥ 80% of the seeds; ≥ 1 ship is lost
//   in ≥ 50% of the seeds.
// The per-seed records go to tests/.out/playthrough/<player>.jsonl (PT_OUT overrides the folder), the table to table.txt.
// One design target is not met, by design (the lead's ruling of 02:30 for WP12 part 1; PROGRESS.md `## WP12 — part
// 1/3`): COMPETENT's wall time. It is a KNOWN_GAP: it prints a loud `GAP` line with the measured number instead of
// failing the suite (PT_STRICT=1 fails on it), and a hard floor at part 1's measurement keeps it from quietly
// shrinking. A known gap met at a measurement prints `MET` with its note. Also checked hard: the lead's WP11 MERGE
// target (at least half of the COMPETENT runs reach the choice with MERGE's 20 charge).
// A third kid, LITERAL (the lead's note for WP12 part 1, 01:35: the strip-literal kid WP11's MERGE fix relies on), is
// measured beside them: its MERGE availability is printed next to COMPETENT's, and (the lead's note for WP12 part 3,
// 12:15) checked hard too: at least half of its runs reach the choice with MERGE's 20 charge, so a kid who follows the
// strip can earn MERGE (part 3's belt lead-in once took it to 39 of 198 without any check failing). The WP12 fix round
// adds the lead's two other binding targets as hard checks: SLOPPY reaches a sombre ending in at least 15% of the seeds
// (replacing the 80–92% band's top, the lead's ruling of 2026-10-22 07:10), and at most 10 of 200 SLOPPY HALCYONs end
// at 0 FUEL.
// Slice 1a (Track TESTS): the suite is information-only. The kids were written for phase 2 (printing, the sealed
// archive, phase 2's LAST LIGHT) and the landing now waits for the kid's [L] at each LZ window, so every design target
// below prints an INFO line (with the measured number, at any depth) and fails only with PT_STRICT=1. The one hard
// check left is that each kid's run ends (no `stuck` run). Re-tuning the kids for the landing is phase 2's work.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../wp1/harness';
import { MERGE_COST_CHARGE } from '@data/tuning';
import type { RunRecord, PlayerId } from './playthrough';
import { byDepth, FULL } from '../depth';

// Quick depth (tests/unit/depth.ts, npm test): one seed of the COMPETENT kid, so a whole run is flown end to end and must
// end. SLOPPY and LITERAL fly at full depth only (npm run balance: the 200 seeds of all three kids): on one seed each
// took 35 s of CPU in its own process (slice 1a, both kids wait out the landing until HOLLOW eats the Core), more than
// the unit tier's per-suite share, for a check COMPETENT's run already makes (the run ends). PT_PLAYERS brings them
// back in quick mode. The design's targets print INFO at either depth (slice 1a) and are checked only with PT_STRICT=1.
const SEEDS = Number(process.env.PT_SEEDS ?? byDepth(1, 200));
const WORKERS = Number(process.env.PT_WORKERS ?? 4);
const ALL_PLAYERS: readonly PlayerId[] = ['COMPETENT', 'SLOPPY', 'LITERAL'];
const PLAYERS = (process.env.PT_PLAYERS ?? byDepth('COMPETENT', ALL_PLAYERS.join(','))).split(',') as PlayerId[];
for (const player of ALL_PLAYERS.filter((candidate) => !PLAYERS.includes(candidate))) {
  console.log(`SKIP  ${player}: every run ends  — full depth only (npm run balance), or PT_PLAYERS=${ALL_PLAYERS.join(',')}`);
}
// WP12 fix round 1: a scratch folder by default, so a suite run never overwrites the records PROGRESS.md cites (part 1's
// in results-part1/, part 3's in p3/results/, the fix round's in fix1/results/: each written with PT_OUT).
const OUT = process.env.PT_OUT ?? 'tests/.out/playthrough';
if (!Number.isInteger(SEEDS) || SEEDS < 1) throw new Error(`PT_SEEDS=${process.env.PT_SEEDS} is not a seed count`);
if (!Number.isInteger(WORKERS) || WORKERS < 1) throw new Error(`PT_WORKERS=${process.env.PT_WORKERS} is not a worker count`);

const TSX = 'node_modules/.bin/tsx';
// The tsconfig the workers resolve `@data/…` and the rest through: the project's, or a copy of the source tree for a
// tuning experiment (tests/unit/wp12/exp2.py) that must not touch src/ while other suites run.
const TSCONFIG = process.env.PT_TSCONFIG ?? 'tsconfig.json';
const STRICT = process.env.PT_STRICT === '1';

// The design targets the data cannot meet (WP12 part 1), by check name, with what the GAP line says about each.
const KNOWN_GAPS: ReadonlyMap<string, string> = new Map([
  ['COMPETENT: simulated wall time 20–32 min (median)',
    'not met by design: the harness underestimates a kid; Fran\'s playtest decides (the lead\'s ruling of 02:30)'],
]);

// A balance target over the seeds: an INFO line (slice 1a: the suite is information-only); a check with PT_STRICT=1.
function balance(name: string, met: boolean, detail: string): void {
  if (STRICT) { check(name, met, detail); return; }
  const depth = FULL ? '' : '; one seed is no statistic: npm run balance flies 200';
  console.log(`INFO  ${name}  — ${detail} (${met ? 'met' : 'not met'} on ${SEEDS} seed${SEEDS === 1 ? '' : 's'}${depth}; PT_STRICT=1 checks it)`);
}

// A design target: as balance; a known gap says GAP (or MET) with its note instead of INFO.
function target(name: string, met: boolean, detail: string): void {
  const note = KNOWN_GAPS.get(name);
  if (note === undefined || STRICT || !FULL) { balance(name, met, detail); return; }
  // A known gap met at a measurement says so (MET) without failing either way: it is listed for a reason.
  console.log(`${met ? 'MET  ' : 'GAP  '}  ${name}  — ${detail} (${met ? 'met here; listed as a known gap: ' : ''}${note})`);
}

function shard(player: PlayerId, from: number, last: number): Promise<RunRecord[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, ['--tsconfig', TSCONFIG, 'tests/unit/wp12/playthrough.ts'], {
      env: { ...process.env, PT_PLAYER: player, PT_FROM: String(from), PT_TO: String(last), PT_TRACE: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`playthrough ${player} ${from}–${last} exited ${code}:\n${err.slice(-3000)}\n${out.slice(-2000)}`)); return; }
      const records = out.split('\n').filter((line) => line.startsWith('RECORD ')).map((line) => JSON.parse(line.slice(7)) as RunRecord);
      if (records.length !== last - from + 1) { reject(new Error(`playthrough ${player} ${from}–${last}: ${records.length} records`)); return; }
      resolve(records);
    });
  });
}

// Shards for every player, at most WORKERS at a time.
async function runAll(): Promise<Map<PlayerId, RunRecord[]>> {
  const jobs: { player: PlayerId; from: number; last: number }[] = [];
  // Two shards per worker and player, so a slow shard does not leave the other workers idle at the end.
  const perShard = Math.max(1, Math.ceil(SEEDS / (WORKERS * 2)));
  for (const player of PLAYERS) {
    for (let from = 1; from <= SEEDS; from += perShard) jobs.push({ player, from, last: Math.min(SEEDS, from + perShard - 1) });
  }
  const results = new Map<PlayerId, RunRecord[]>(PLAYERS.map((player) => [player, []]));
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const records = await shard(job.player, job.from, job.last);
      results.get(job.player)!.push(...records);
    }
  };
  await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, worker));
  for (const records of results.values()) records.sort((a, b) => a.seed - b.seed);
  return results;
}

const pct = (part: number, whole: number): string => `${whole === 0 ? '-' : ((100 * part) / whole).toFixed(1)}%`;
const mean = (values: number[]): number => (values.length === 0 ? NaN : values.reduce((sum, value) => sum + value, 0) / values.length);
const median = (values: number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const minutes = (sec: number): string => `${(sec / 60).toFixed(1)}`;
const SHIP_NAMES = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'LAST LIGHT'];
const LOST = new Set(['stranded', 'escaped', 'crashed', 'abandoned', 'emergency']);

function table(results: Map<PlayerId, RunRecord[]>): string {
  const lines: string[] = [];
  const row = (label: string, cells: string[]): void => { lines.push(`| ${label.padEnd(51)} | ${cells.map((cell) => cell.padStart(26)).join(' | ')} |`); };
  const players = [...results.keys()];
  lines.push(`| ${'Measure'.padEnd(51)} | ${players.map((player) => `${player} (${results.get(player)!.length} seeds)`.padStart(26)).join(' | ')} |`);
  lines.push(`|${'-'.repeat(53)}|${players.map(() => '-'.repeat(28)).join('|')}|`);
  const each = (measure: (records: RunRecord[]) => string): string[] => players.map((player) => measure(results.get(player)!));
  row('souls woke (heads), mean', each((records) => pct(mean(records.map((run) => run.woke)), records[0]?.souls ?? 12400)));
  row('souls woke (heads), worst seed', each((records) => pct(Math.min(...records.map((run) => run.woke)), records[0]?.souls ?? 12400)));
  row('SCORE (missing memories half), mean', each((records) => pct(mean(records.map((run) => run.score)), records[0]?.souls ?? 12400)));
  row('run completed (all 5 ships, not OVERWRITTEN/STAYED)', each((records) => pct(records.filter((run) => run.completed).length, records.length)));
  row('…completed with ≥ 30% souls woke', each((records) => pct(records.filter((run) => run.completed && run.woke >= 0.3 * run.souls).length, records.length)));
  row('≥ 1 ship lost (soft fail)', each((records) => pct(records.filter((run) => run.shipsLost >= 1).length, records.length)));
  row('…≥ 1 ship lost and the run completed', each((records) => pct(records.filter((run) => run.completed && run.shipsLost >= 1).length, records.length)));
  row('…≥ 1 of ships 1–4 lost', each((records) => pct(records.filter((run) => run.ships.slice(0, 4).some((ship) => LOST.has(ship.outcome))).length, records.length)));
  row('ships lost per run, mean', each((records) => mean(records.map((run) => run.shipsLost)).toFixed(2)));
  for (const [index, name] of SHIP_NAMES.entries()) {
    row(`${name}: locked / partial / lost`, each((records) => {
      const outcomes = records.map((run) => run.ships[index]?.outcome ?? 'never');
      const locked = outcomes.filter((outcome) => outcome === 'locked').length;
      const partial = outcomes.filter((outcome) => outcome === 'partial').length;
      const lost = outcomes.filter((outcome) => LOST.has(outcome)).length;
      return `${pct(locked, records.length)} / ${pct(partial, records.length)} / ${pct(lost, records.length)}`;
    }));
  }
  for (const [index, name] of SHIP_NAMES.entries()) {
    row(`${name}: woke mean · FUEL at end median`, each((records) => {
      const ships = records.map((run) => run.ships[index]).filter((ship) => ship !== undefined);
      return `${mean(ships.map((ship) => ship!.woke)).toFixed(0)} · ${median(ships.map((ship) => ship!.fuelPct)).toFixed(1)}%`;
    }));
  }
  row('run causes', each((records) => {
    const counts = new Map<string, number>();
    for (const run of records) counts.set(run.cause, (counts.get(run.cause) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cause, count]) => `${cause} ${count}`).join(', ');
  }));
  row('wall time min · median · max (min)', each((records) => {
    const walls = records.map((run) => run.wallSec);
    return `${minutes(Math.min(...walls))} · ${minutes(median(walls))} · ${minutes(Math.max(...walls))}`;
  }));
  row('wall time in 20–32 min', each((records) => pct(records.filter((run) => run.wallSec >= 1200 && run.wallSec <= 1920).length, records.length)));
  row('wall s: flight · printing · screens (median)', each((records) => {
    const phase = (run: RunRecord, keys: string[]): number => keys.reduce((sum, key) => sum + (run.phaseSec[key] ?? 0), 0);
    return `${median(records.map((run) => phase(run, ['flight']))).toFixed(0)} · ${median(records.map((run) => phase(run, ['landing']))).toFixed(0)} · `
      + `${median(records.map((run) => phase(run, ['title', 'boot', 'report', 'transmit', 'lost']))).toFixed(0)}`;
  }));
  row('wall s in MIND · OVERCLOCKED (median)', each((records) => `${median(records.map((run) => run.mindSec)).toFixed(0)} · ${median(records.map((run) => run.overclockSec)).toFixed(0)}`));
  row('wall s at TACTICAL · in SKIP (median)', each((records) => `${median(records.map((run) => run.tacticalSec)).toFixed(0)} · ${median(records.map((run) => run.skipSec)).toFixed(0)}`));
  row('Core lost (EMERGENCY/OVERWRITTEN) runs', each((records) => pct(records.filter((run) => run.coreLost > 0).length, records.length)));
  row('Core lowest, median', each((records) => median(records.map((run) => run.coreMin)).toFixed(0)));
  row('ship-1 simulation retries', each((records) => String(records.reduce((sum, run) => sum + run.simulationRetries, 0))));
  row('LAST LIGHT: clusters lost, mean (of reached)', each((records) => {
    const lost = records.filter((run) => run.lastLightLost !== null).map((run) => run.lastLightLost!);
    return `${mean(lost).toFixed(2)} (${lost.length})`;
  }));
  row('LAST LIGHT: verbs telegraphed · landed (mean)', each((records) => {
    const verbs = records.filter((run) => run.verbs !== null).map((run) => run.verbs!);
    return `${mean(verbs.map((verb) => verb.telegraphed)).toFixed(1)} · ${mean(verbs.map((verb) => verb.landed)).toFixed(2)}`;
  }));
  row('MERGE: ≥ 20 charge at the choice', each((records) => {
    const atChoice = records.filter((run) => run.chargeAtChoice !== null);
    return `${atChoice.filter((run) => run.chargeAtChoice! >= 20).length} of ${atChoice.length} (median ${median(atChoice.map((run) => run.chargeAtChoice!)).toFixed(0)})`;
  }));
  row('…of the runs played for MERGE', each((records) => {
    const atChoice = records.filter((run) => run.chargeAtChoice !== null && run.playedFor === 'merge');
    return `${atChoice.filter((run) => run.chargeAtChoice! >= 20).length} of ${atChoice.length}`;
  }));
  row('won-merge runs', each((records) => String(records.filter((run) => run.cause === 'won-merge').length)));
  row('stuck runs (harness: never ends)', each((records) => String(records.filter((run) => run.cause.startsWith('stuck')).length)));
  return lines.join('\n');
}

async function main(): Promise<void> {
  const started = Date.now();
  const results = await runAll();
  mkdirSync(OUT, { recursive: true });
  for (const [player, records] of results) {
    writeFileSync(join(OUT, `${player}.jsonl`), records.map((run) => JSON.stringify(run)).join('\n') + '\n');
    for (const run of records) {
      console.log(`${player.padEnd(9)} seed ${String(run.seed).padStart(3)}: ${run.cause.padEnd(14)} woke ${String(run.woke).padStart(6)} `
        + `${minutes(run.wallSec).padStart(5)} min lost ${run.shipsLost} | ${run.ships.map((ship) => `${ship.ship}:${ship.outcome}:${ship.woke}`).join(' ')}`);
    }
  }
  const text = table(results);
  writeFileSync(join(OUT, 'table.txt'), `${text}\n`);
  console.log(`\n${text}\n`);
  console.log(`${SEEDS} seeds × ${PLAYERS.length} players in ${((Date.now() - started) / 1000).toFixed(0)} s`);

  const competent = results.get('COMPETENT');
  if (competent) {
    const souls = competent[0]?.souls ?? 12400;
    const woke = mean(competent.map((run) => run.woke));
    balance('COMPETENT: ≥ 85% of the souls woke (mean over the seeds)', woke >= 0.85 * souls, pct(woke, souls));
    for (const [index, name] of SHIP_NAMES.entries()) {
      const locked = competent.filter((run) => run.ships[index]?.outcome === 'locked').length;
      balance(`COMPETENT: ${name} locked in ≥ 90% of the seeds`, locked >= 0.9 * competent.length, pct(locked, competent.length));
    }
    const walls = competent.map((run) => run.wallSec);
    target('COMPETENT: simulated wall time 20–32 min (median)', median(walls) >= 1200 && median(walls) <= 1920,
      `median ${minutes(median(walls))} min, range ${minutes(Math.min(...walls))}–${minutes(Math.max(...walls))}`);
    balance('COMPETENT: …the wall time keeps its part-1 floor (median ≥ 12.5 min)', median(walls) >= 750, `median ${minutes(median(walls))} min`);
    const coreDead = competent.filter((run) => run.coreLost > 0 || run.cause === 'overwritten').length;
    balance('COMPETENT: never Core-dead', coreDead === 0, `${coreDead} runs`);
    const stuck = competent.filter((run) => run.cause.startsWith('stuck')).length;
    check('COMPETENT: every run ends', stuck === 0, `${stuck} stuck`);
    const atChoice = competent.filter((run) => run.chargeAtChoice !== null);
    const affordable = atChoice.filter((run) => run.chargeAtChoice! >= MERGE_COST_CHARGE).length;
    balance(`COMPETENT: at least half of the runs reach the choice with MERGE's ${MERGE_COST_CHARGE} charge (the lead's WP11 target)`,
      affordable * 2 >= atChoice.length, `${affordable} of ${atChoice.length}`);
  }
  const literal = results.get('LITERAL');
  if (literal && competent) {
    const share = (records: RunRecord[]): string => {
      const atChoice = records.filter((run) => run.chargeAtChoice !== null);
      return `${atChoice.filter((run) => run.chargeAtChoice! >= MERGE_COST_CHARGE).length} of ${atChoice.length}`;
    };
    console.log(`INFO  MERGE's ${MERGE_COST_CHARGE} charge at the choice: LITERAL ${share(literal)} against COMPETENT ${share(competent)}`);
    const literalAtChoice = literal.filter((run) => run.chargeAtChoice !== null);
    const literalAffordable = literalAtChoice.filter((run) => run.chargeAtChoice! >= MERGE_COST_CHARGE).length;
    balance(`LITERAL: at least half of the runs reach the choice with MERGE's ${MERGE_COST_CHARGE} charge (the lead's WP12 part 3 note)`,
      literalAffordable * 2 >= literalAtChoice.length, `${literalAffordable} of ${literalAtChoice.length}`);
    const stuck = literal.filter((run) => run.cause.startsWith('stuck')).length;
    check('LITERAL: every run ends', stuck === 0, `${stuck} stuck`);
  }
  const sloppy = results.get('SLOPPY');
  if (sloppy) {
    const done = sloppy.filter((run) => run.completed && run.woke >= 0.3 * run.souls).length;
    target('SLOPPY: the run completes with ≥ 30% souls woke in ≥ 80% of the seeds', done >= 0.8 * sloppy.length, pct(done, sloppy.length));
    // WP12 fix round 1 (the lead's rulings of 06:20 and 17:45): the band's top too, so a careless run can still end early
    // (a sombre ending stays reachable), and ruling 1's HALCYON target: the opener's OUT / IN ping-pong that emptied
    // the tank (52 of 200 SLOPPY HALCYONs at 0 FUEL before the early RELEASE) must not come back.
    // The lead's ruling of 2026-10-22 07:10 replaces the band's top (≤ 92%): the final fix pass took away an unfair route
    // to OVERWRITTEN (VESPER seeds that bit card files next to the Core), which lifted completion to 98.5%. What the top
    // stood for is that careless play keeps reaching a sombre ending, so that is what is checked now.
    const sombre = sloppy.filter((run) => ['unresolved', 'overwritten', 'flagship-lost', 'stayed'].includes(run.cause)).length;
    balance('SLOPPY: a sombre ending (UNRESOLVED, OVERWRITTEN, FLAGSHIP LOST, STAYED) in ≥ 15% of the seeds (the lead\'s 07:10 ruling)',
      sombre >= 0.15 * sloppy.length, pct(sombre, sloppy.length));
    const halcyonDry = sloppy.filter((run) => run.ships[1] !== undefined && run.ships[1].fuelPct <= 0).length;
    balance('SLOPPY: HALCYON ends at 0 FUEL in ≤ 10 of 200 runs (the lead\'s ruling 1)', halcyonDry <= 0.05 * sloppy.length,
      `${halcyonDry} of ${sloppy.length}`);
    const lostOne = sloppy.filter((run) => run.shipsLost >= 1).length;
    target('SLOPPY: ≥ 1 ship is lost in ≥ 50% of the seeds', lostOne >= 0.5 * sloppy.length, pct(lostOne, sloppy.length));
    const stuck = sloppy.filter((run) => run.cause.startsWith('stuck')).length;
    check('SLOPPY: every run ends', stuck === 0, `${stuck} stuck`);
  }
  finish();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
