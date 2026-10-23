// LEAD-2 item 1's acceptance: "a debris zone on KESTREL is entered and hits exactly as before (compare against a
// warp-limited reference run)". The scenario (tests/unit/lead2/scenarios/kestrel-debris.ts) is flown per mode on this tree
// (the coast SKIP) and compared with the same scenario flown on the tree as it was before LEAD-2 (the warp-limited
// SKIP). That old tree is not versioned, so its two outcomes are recorded in
// tests/unit/lead2/scenarios/kestrel-debris.reference.json (flown on 2026-10-22, before the tests moved out of .tmp/).
// Same seed, same kid, same harness.
// • MODE=hit (the kid never steers IN): the same files in the same rack lose the same 25, within one TACTICAL tick of
//   the reference's game time; the SKIPs stop where the dodge rules say (15 tac s before the deadline, the zone's
//   TACTICAL lead before its entry), exactly on this tree, up to a tick early on the reference.
// • MODE=dodge (the kid steers IN where the first SKIP stopped): no hit on either, and the same zone-forecast verdict
//   change (hit → clear: CLEAR OF THE DEBRIS); the jump never carries the ship past the choice or past the verdict.
// LEAD-2 item 5 moved the dodge's deadline 2.2 tac s earlier (judged with every Core thread busy), so the first SKIP's
// stop moves with it: each tree is checked against its own deadline.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { check, finish } from '../wp1/harness';
import { SKIP_END_LEAD_TAC, ZONE_TACTICAL_LEAD_TAC, DODGE_DEADLINE_RESOLUTION_TAC } from '@data/tuning';
import { getShip } from '@data/ships';

interface Outcome {
  deadlineTac: number | null;
  hitTac: number | null;
  hitAt: { x: number; y: number } | null;
  hits: { segId: string; rack: string; from: number; to: number }[];
  spentIds: string[];
  forecasts: string[];
  skipEnds: { tac: number; pace: string; refusal: string | null }[];
  wall: number;
  status: string;
}

const REFERENCE = JSON.parse(readFileSync('tests/unit/lead2/scenarios/kestrel-debris.reference.json', 'utf8')) as Record<'hit' | 'dodge', Outcome>;

function fly(tree: 'lead2' | 'base', mode: 'hit' | 'dodge'): Outcome {
  if (tree === 'base') return REFERENCE[mode];
  const out = execFileSync('node_modules/.bin/tsx', ['--tsconfig', 'tsconfig.json', 'tests/unit/lead2/scenarios/kestrel-debris.ts'], {
    env: { ...process.env, MODE: mode, AP_SHIP: '0' }, encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const line = out.trim().split('\n').pop();
  if (!line) throw new Error(`kestrel-debris: no output from this tree (${mode})`);
  return JSON.parse(line) as Outcome;
}

const warp = getShip(2).flight.tacticalWarp;
// One TACTICAL tick (50 ms at the ship's tactical warp), in tactical seconds.
const TICK_TAC = 0.05;
// A SKIP's recorded stop is the tick after it lands (CRUISE ×80 there: 0.16 tac s on KESTREL).
const CRUISE_TICK_TAC = (0.05 * getShip(2).flight.cruiseWarp) / warp;

// --- MODE=hit -------------------------------------------------------------------------------------------------------
{
  const now = fly('lead2', 'hit');
  const before = fly('base', 'hit');
  const sameHits = now.hits.length > 0 && JSON.stringify(now.hits) === JSON.stringify(before.hits)
    && JSON.stringify(now.spentIds) === JSON.stringify(before.spentIds);
  check('KESTREL, no correction: the debris hits the same files in the same rack for the same loss as before LEAD-2',
    sameHits, `${now.hits.map((item) => `${item.segId} ${item.from}→${item.to}`).join(', ')} | before: ${before.hits.length} files`);
  const dtTac = Math.abs((now.hitTac ?? NaN) - (before.hitTac ?? NaN));
  check('…at the same game time, within one TACTICAL tick, and the same place',
    dtTac <= TICK_TAC && Math.hypot((now.hitAt?.x ?? NaN) - (before.hitAt?.x ?? NaN), (now.hitAt?.y ?? NaN) - (before.hitAt?.y ?? NaN)) < 5,
    `hit at ${now.hitTac?.toFixed(3)} tac s (before: ${before.hitTac?.toFixed(3)}, Δ ${dtTac.toFixed(3)})`);
  // This tree: the first SKIP lands exactly SKIP_END_LEAD_TAC before the deadline, the second exactly the zone's
  // TACTICAL lead before the entry the predictor sees then (read here at the hit, within the predictor's step).
  const [first, second] = now.skipEnds;
  const firstOk = first !== undefined && now.deadlineTac !== null
    && Math.abs(first.tac - CRUISE_TICK_TAC - (now.deadlineTac - SKIP_END_LEAD_TAC)) < DODGE_DEADLINE_RESOLUTION_TAC
    && first.refusal === 'DODGE THE DEBRIS FIRST';
  const secondOk = second !== undefined && now.hitTac !== null
    && Math.abs(second.tac - CRUISE_TICK_TAC - (now.hitTac - ZONE_TACTICAL_LEAD_TAC)) < 2 * TICK_TAC && second.refusal === 'DEBRIS AHEAD';
  check(`…its SKIPs stop exactly ${SKIP_END_LEAD_TAC} tac s before the dodge's deadline and the zone's ${ZONE_TACTICAL_LEAD_TAC} tac s TACTICAL lead before contact`,
    firstOk && secondOk,
    `deadline ${now.deadlineTac?.toFixed(2)}: SKIPs stopped at ${now.skipEnds.map((end) => `${end.tac.toFixed(2)} (${end.refusal})`).join(', ')} `
    + `| before LEAD-2: deadline ${before.deadlineTac?.toFixed(2)}, stops ${before.skipEnds.map((end) => end.tac.toFixed(2)).join(', ')}`);
  check('…and the dodge is judged at the worst case now: its deadline is no later than before',
    now.deadlineTac !== null && before.deadlineTac !== null && now.deadlineTac <= before.deadlineTac,
    `${now.deadlineTac?.toFixed(2)} vs ${before.deadlineTac?.toFixed(2)} tac s`);
}

// --- MODE=dodge -----------------------------------------------------------------------------------------------------
{
  const now = fly('lead2', 'dodge');
  const before = fly('base', 'dodge');
  check('KESTREL, the IN correction where the first SKIP stopped: no hit, and the same verdict change (hit → clear) on both trees',
    now.hits.length === 0 && before.hits.length === 0 && JSON.stringify(now.forecasts) === JSON.stringify(before.forecasts)
    && now.forecasts.includes('hit→clear'),
    `forecasts ${now.forecasts.join(', ')} | before: ${before.forecasts.join(', ')}`);
}

finish();
