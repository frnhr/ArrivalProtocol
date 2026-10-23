// WP11 acceptance 2 (§9 WP11, §6.6): HOLLOW's verbs and the root duel on LAST LIGHT.
// A. Fairness, pure, over 1,000 seeded verb rolls on memories built from LAST LIGHT's layout and shaken up (tool copies,
//    spares and originals at random health, copies of every AI tool, upgrade files, FIREWALLs, Thrust.alt in reserve or
//    in service, files and clusters HOLLOW ate, seeds, the root gone to its last block, no Scan or no Delete at all):
//    no RM ever takes the last working copy of a kind, the Core, a soul, Engine I/O, Nav Plotter, REPAIR CHARGE, a
//    FIREWALL, a ship file doing its job or HOLLOW's own; its tiers come in order (spares, then upgrades, then a backup
//    in reserve); every verb is blockable (RM: a working Scan or Delete; MV: a working Delete); MV moves a seed or an
//    eaten block (never the root or the last block) and never lands closer than 4 free blocks to a soul, nor where it
//    could bite at the next bite. The checks are written from §6.6 here, not with the module's helpers. Each roll also
//    spares a random set of tools (licensed on this ship, not used yet: the lead's TODO for WP11), which RM never takes.
// B. The live counter (systems/hollow-verbs.ts): an unblocked RM lands at the end of its countdown (the file is gone,
//    the echo, glitchBurst(0.3, 400)); the ship's first verb counts 4 s (on the coast the next one still comes everySec
//    after its start; in the duel its extra second pushes the next one back), every later one counts 3 s, and a new ship
//    starts over at 4 (the unlink pass, Fran after the handover; on screen RM is `unlink`); a SCAN on the target during the telegraph blocks it at once (the file stays,
//    `... BLOCKED`); an op started and cancelled within one tick still blocks it; a target already mid-op blocks it at
//    its start; a DELETE on an MV's seed blocks it; the clock and the countdown stand still while the flight is at
//    TACTICAL; with nothing fair to aim at HOLLOW skips its turn; the weights follow the last unit's habits.
// C. The competent scripted defender (the strip-following kid, WP7–WP10's defender, and the WP11 one: it blocks every
//    verb 0.8 s into its countdown and starts the root's DELETE as soon as a thread is free) flies LAST LIGHT on 200
//    seeds: it completes the root's DELETE and loses ≤ 4 of 16 clusters on average.
import { check, finish } from '../wp1/harness';
import { createHarness11, LAST_LIGHT } from './harness11';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import { getShip } from '@data/ships';
import { createRng, type Rng } from '@systems/rng';
import { chooseVerb, landVerb, verbWeights, type Verb } from '@systems/hollow';
import { verbNow } from '@systems/hollow-verbs';
import { replaceRange, mergeAdjacentFree, assertMemoryInvariants, newSegId, segmentStarts, freeSegment } from '@systems/memory-ops';
import { createToolFiles, FS_TOOL_KINDS } from '@data/fs-tools';
import { MEMORY_TOTAL_BLOCKS, rootRemains } from '@data/memory';
import { actionScan, actionDelete, actionMove } from '@state/actions';
import { cancelOp, getOps, getOpsBySeg } from '@systems/ops-core';
import { isInfectable, isHollow } from '@state/selectors';
import { glitchBurstLevel } from '@systems/glitch';
import { installTool, isLicensed } from '@systems/licences';
import type { Segment, HollowSegment, FsToolSegment, ToolSegment, UpgradeSegment, FirewallSegment, SoulSegment } from '@/types/segment';
import type { GameState } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';
import {
  BAND_DEGRADED_MIN, WALL_MIN_BLOCKS, GLITCH_BURST_LEVEL, GLITCH_BURST_MS, VERB_TELEGRAPH_SEC, VERB_FIRST_TELEGRAPH_SEC,
} from '@data/tuning';
import { HOLLOW_VERB } from '@data/hollow-text';

// --- A. Fairness, pure ------------------------------------------------------------------------------------------------

const ship = getShip(LAST_LIGHT);

function openFreeSpots(memory: readonly Segment[], size: number): { addr: number }[] {
  const starts = segmentStarts(memory);
  const spots: { addr: number }[] = [];
  memory.forEach((seg, index) => {
    if (seg.type !== 'free' || seg.reservedBy !== undefined || seg.size < size) return;
    for (let offset = 0; offset + size <= seg.size; offset++) spots.push({ addr: starts[index]! + offset });
  });
  return spots;
}

function place(memory: Segment[], seg: Segment, rng: Rng): boolean {
  const spots = openFreeSpots(memory, seg.size);
  const spot = spots[Math.floor(rng() * spots.length)];
  if (!spot) return false;
  replaceRange(memory, spot.addr, spot.addr + seg.size, [seg], { opId: null, own: [] });
  mergeAdjacentFree(memory);
  return true;
}

function replaceWith(memory: Segment[], seg: Segment, by: Segment[]): void {
  const start = segmentStarts(memory)[memory.indexOf(seg)]!;
  replaceRange(memory, start, start + seg.size, by, { opId: null, own: [seg] });
  mergeAdjacentFree(memory);
}

function health(rng: Rng): number {
  return rng() < 0.35 ? Math.floor(rng() * BAND_DEGRADED_MIN) : BAND_DEGRADED_MIN + Math.floor(rng() * (101 - BAND_DEGRADED_MIN));
}

function fsCopy(kind: FsToolKind, index: number, rng: Rng): FsToolSegment {
  const files = createToolFiles(kind);
  const file = structuredClone(files[index % files.length]!);
  file.id = newSegId(file.id);
  if (index >= files.length) file.name = `${files[0]!.name}.cp`;
  file.integrity = health(rng);
  return file;
}

// A LAST LIGHT memory shaken up (see A in the header).
function shakenMemory(seed: number): Segment[] {
  const rng = createRng(seed * 7919 + 13);
  const memory = createInitialState({ seed, shipIndex: LAST_LIGHT, carried: freshUnitRacks(ship) }).memory;
  // The unit's own fs-tools: the fresh unit brings Scan; a run brings the others. 0–3 copies of each kind.
  for (const seg of memory.filter((candidate) => candidate.type === 'fs-tool')) replaceWith(memory, seg, [freeSegment(seg.size)]);
  for (const kind of FS_TOOL_KINDS) {
    const copies = Math.floor(rng() * 4);
    for (let i = 0; i < copies; i++) place(memory, fsCopy(kind, i, rng), rng);
  }
  // Copies of AI tools (Engine I/O and Nav Plotter included: a copy is still never a verb's).
  for (const seg of memory.filter((candidate): candidate is ToolSegment => candidate.type === 'tool')) {
    if (rng() < 0.6) seg.integrity = health(rng);
    if (rng() < 0.35) {
      const copy = structuredClone(seg);
      copy.id = newSegId(seg.id);
      copy.name = `${seg.name}.cp`;
      copy.integrity = health(rng);
      place(memory, copy, rng);
    }
  }
  if (rng() < 0.4) {
    const trim: UpgradeSegment = { id: newSegId('trim'), name: 'FUEL TRIM', type: 'upgrade', upgrade: 'fuel-trim', size: 2, integrity: health(rng), scanned: true };
    place(memory, trim, rng);
  }
  if (rng() < 0.3) {
    const skill: UpgradeSegment = { id: newSegId('skill'), name: 'AUTOBURN.skl', type: 'upgrade', upgrade: 'autoburn', size: 6, integrity: health(rng), scanned: true };
    place(memory, skill, rng);
  }
  if (rng() < 0.4) {
    const firewall: FirewallSegment = { id: newSegId('firewall'), name: 'FIREWALL.sys', type: 'firewall', size: 2 };
    place(memory, firewall, rng);
  }
  // Thrust.alt in reserve, swapped into service, or deleted.
  const alt = memory.find((seg) => seg.type === 'ship-backup');
  const roll = rng();
  if (alt && roll < 0.3) alt.role = 'thrust-ctrl';
  else if (alt && roll < 0.45) replaceWith(memory, alt, [freeSegment(alt.size)]);
  // HOLLOW ate some files and clusters (in place, a block of the same size).
  const food = memory.filter((seg) => isInfectable(seg) && seg.type !== 'core');
  const eats = Math.floor(rng() * 4);
  for (let i = 0; i < eats; i++) {
    const seg = food.splice(Math.floor(rng() * food.length), 1)[0];
    if (!seg || !memory.includes(seg)) continue;
    const block: HollowSegment = { id: newSegId('hollow'), name: 'UNIT-046', type: 'hollow', size: seg.size, root: false, locked: false, owner: 'UNIT-046', ate: seg.name };
    if (seg.type === 'soul') block.ateCluster = seg.cluster;
    replaceWith(memory, seg, [block]);
  }
  const seeds = Math.floor(rng() * 4);
  for (let i = 0; i < seeds; i++) {
    const seedBlock: HollowSegment = { id: newSegId('seed'), name: 'UNIT-046', type: 'hollow', size: 2, root: false, locked: false, owner: 'UNIT-046', seed: true };
    place(memory, seedBlock, rng);
  }
  // The duel done: the root is its last block.
  const root = memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.root);
  if (root && rng() < 0.25) replaceWith(memory, root, rootRemains(root));
  assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  return memory;
}

// §6.6's rules, written out here.
const working = (seg: Segment): boolean => 'integrity' in seg && seg.integrity >= BAND_DEGRADED_MIN && !('state' in seg && seg.state === 'inactive');
function kindOf(seg: Segment): string | null {
  if (seg.type === 'fs-tool') return `fs:${seg.fsTool}`;
  if (seg.type === 'tool' && seg.role) return `role:${seg.role}`;
  return null;
}
const hasWorking = (memory: readonly Segment[], kind: FsToolKind): boolean =>
  memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === kind && working(seg));
function isSpare(memory: readonly Segment[], seg: Segment): boolean {
  if (seg.type !== 'fs-tool' && seg.type !== 'tool') return false;
  if (seg.role === 'engine-io' || seg.role === 'navplot') return false;
  const kind = kindOf(seg);
  return kind !== null && memory.some((other) => other !== seg && kindOf(other) === kind && working(other));
}

function rmProblem(memory: readonly Segment[], target: Segment, untried: readonly FsToolKind[]): string | null {
  if (target.type === 'core' || target.type === 'soul' || target.type === 'redundancy' || target.type === 'firewall' || target.type === 'hollow' || target.type === 'ship') {
    return `a ${target.type}`;
  }
  if (target.role === 'engine-io' || target.role === 'navplot') return `the ${target.role}`;
  if (!hasWorking(memory, 'scan') && !hasWorking(memory, 'delete')) return 'unblockable (no working Scan or Delete)';
  if (target.type === 'fs-tool' && untried.includes(target.fsTool)) return `${target.fsTool}, licensed here and not used yet`;
  if (target.type === 'fs-tool' || target.type === 'tool') {
    if (!isSpare(memory, target)) return `the last working copy of ${kindOf(target)}`;
    return null;
  }
  // (A spared tool is no spare RM may take, so it does not hold the next tier back.)
  const fairSpare = (seg: Segment): boolean => isSpare(memory, seg) && !(seg.type === 'fs-tool' && untried.includes(seg.fsTool));
  if (memory.some(fairSpare)) return `a ${target.type} while a spare exists`;
  if (target.type === 'upgrade') return null;
  if (target.type === 'ship-backup') {
    if (target.role !== undefined) return 'a backup in service';
    if (memory.some((seg) => seg.type === 'upgrade')) return 'a backup while an upgrade exists';
    return null;
  }
  return `a ${target.type}`;
}

// Where the moved block stands after landing, and whether it keeps §6.6's distance (4 free blocks to any soul) and
// can't bite at the next bite (each side a WALL, or no food, or the end of memory).
function mvProblem(memory: Segment[], verb: Extract<Verb, { kind: 'mv' }>): string | null {
  const block = memory.find((seg) => seg.id === verb.targetId);
  if (!block || !isHollow(block)) return 'not HOLLOW\'s block';
  if (block.root || block.last) return block.root ? 'the root' : 'the last block';
  if (!hasWorking(memory, 'delete')) return 'unblockable (no working Delete)';
  const after = structuredClone(memory);
  if (!landVerb(after, verb, [])) return 'it chose a move it can\'t land';
  assertMemoryInvariants(after, MEMORY_TOTAL_BLOCKS);
  const index = after.findIndex((seg) => seg.id === verb.targetId);
  let soulSideExact = false;
  for (const step of [-1, 1]) {
    let cursor = index + step;
    let gap = 0;
    while (cursor >= 0 && cursor < after.length && after[cursor]!.type === 'free') { gap += after[cursor]!.size; cursor += step; }
    const neighbour = after[cursor];
    if (neighbour?.type === 'soul' && gap < WALL_MIN_BLOCKS) return `${gap} free blocks from ${(neighbour as SoulSegment).cluster}`;
    if (neighbour?.type === 'soul' && gap === WALL_MIN_BLOCKS) soulSideExact = true;
    if (neighbour && gap < WALL_MIN_BLOCKS && isInfectable(neighbour)) return `a GAP of ${gap} to ${neighbour.name}: it bites at the next bite`;
  }
  return soulSideExact ? null : 'not exactly 4 free blocks from a cluster';
}

{
  let rm = 0;
  let mv = 0;
  let none = 0;
  const problems: string[] = [];
  const kinds = new Set<string>();
  let sparedRolls = 0;
  for (let roll = 0; roll < 1000; roll++) {
    const memory = shakenMemory(roll);
    const rng = createRng(roll * 31 + 7);
    const weights = { mv: 1 + rng() * 4, rm: 1 + rng() * 4 };
    // A random set of tools licensed on this ship and not used yet (never Repair: HollowState.untriedTools).
    const spareRng = createRng(roll * 17 + 3);
    const untried = FS_TOOL_KINDS.filter((kind) => kind !== 'repair' && spareRng() < 0.3);
    if (untried.length > 0) sparedRolls++;
    const verb = chooseVerb(memory, rng, weights, untried);
    if (verb === null) { none++; continue; }
    if (verb.kind === 'rm') {
      rm++;
      const target = memory.find((seg) => seg.id === verb.targetId);
      const problem = target ? rmProblem(memory, target, untried) : 'a file not in memory';
      if (target) kinds.add(target.type);
      if (problem) problems.push(`roll ${roll}: RM ${target?.name}: ${problem}`);
    } else {
      mv++;
      const problem = mvProblem(memory, verb);
      if (problem) problems.push(`roll ${roll}: MV ${verb.targetId}: ${problem}`);
    }
  }
  check(`A: 1,000 seeded verb rolls: no RM takes the last working copy of a kind, the Core, a soul, Engine I/O, Nav Plotter, a protected file or a tool not used yet (${sparedRolls} rolls spared some); tiers in order; all blockable`,
    problems.filter((problem) => problem.includes('RM')).length === 0, problems.filter((problem) => problem.includes('RM')).slice(0, 5).join(' | '));
  check('A: …every MV moves a seed or an eaten block, never closer than 4 free blocks to a soul, never where it could bite',
    problems.filter((problem) => problem.includes('MV')).length === 0, problems.filter((problem) => problem.includes('MV')).slice(0, 5).join(' | '));
  // (A backup in reserve is RM's third tier: a shaken memory almost always holds a spare or an upgrade first. The tier is
  // checked on its own below.)
  check('A: …both verbs were rolled, and RM reached spare tools, AI tool copies and upgrades', rm > 100 && mv > 100
    && kinds.has('fs-tool') && kinds.has('tool') && kinds.has('upgrade'), `RM ${rm}, MV ${mv}, none ${none}; RM kinds ${[...kinds].join(', ')}`);
}

// With nothing fair to aim at, HOLLOW skips; MV with nowhere to go falls to RM.
{
  const memory = createInitialState({ seed: 3, shipIndex: LAST_LIGHT, carried: freshUnitRacks(ship) }).memory;
  // The fresh unit: Scan only (no spare), no upgrade; Thrust.alt deleted; no block but the root.
  const alt = memory.find((seg) => seg.type === 'ship-backup')!;
  replaceWith(memory, alt, [freeSegment(alt.size)]);
  check('A: no spare, no upgrade, no backup in reserve, no block to move: no verb (HOLLOW skips its turn)', chooseVerb(memory, createRng(1), { mv: 1, rm: 1 }, []) === null);
  const seedBlock: HollowSegment = { id: newSegId('seed'), name: 'UNIT-046', type: 'hollow', size: 2, root: false, locked: false, owner: 'UNIT-046', seed: true };
  place(memory, seedBlock, createRng(9));
  check('A: …a seed to move, but no working Delete to block an MV with: still none (an MV must be blockable)', chooseVerb(memory, createRng(1), { mv: 1, rm: 0.001 }, []) === null);
  const rmFile = createToolFiles('delete')[0]!;
  place(memory, rmFile, createRng(4));
  const mvVerb = chooseVerb(memory, createRng(1), { mv: 1000, rm: 1 }, []);
  check('A: …with Rm in memory: MV takes the seed', mvVerb?.kind === 'mv' && mvVerb.targetId === seedBlock.id, JSON.stringify(mvVerb));
  // Fill every free block but the seed's neighbours so no spot fits: MV falls to RM (a reserve backup comes back).
  const backup = structuredClone(createInitialState({ seed: 3, shipIndex: LAST_LIGHT, carried: freshUnitRacks(ship) }).memory.find((seg) => seg.type === 'ship-backup')!);
  backup.id = newSegId('alt');
  place(memory, backup, createRng(5));
  const crowded = memory.map((seg) => (seg.type === 'free' && seg.size >= 2 ? seg : seg));
  for (const seg of [...crowded]) {
    if (seg.type !== 'free' || !memory.includes(seg)) continue;
    const filler: FirewallSegment = { id: newSegId('fill'), name: 'FILL', type: 'firewall', size: seg.size };
    replaceWith(memory, seg, [filler]);
  }
  const fallen = chooseVerb(memory, createRng(1), { mv: 1000, rm: 1 }, []);
  check('A: …no free space anywhere for MV: it falls to RM (the backup in reserve)', fallen?.kind === 'rm' && fallen.targetId === backup.id, JSON.stringify(fallen));
}

// A tool licensed on this ship and not used yet is never RM'd, even as a spare; once used it is (the lead's TODO).
{
  const memory = createInitialState({ seed: 4, shipIndex: LAST_LIGHT, carried: freshUnitRacks(ship) }).memory;
  const alt = memory.find((seg) => seg.type === 'ship-backup')!;
  replaceWith(memory, alt, [freeSegment(alt.size)]);
  // Copy and Copy.cp: the only spare. Scan and Rm so every verb is blockable.
  for (const seg of [...createToolFiles('delete'), fsCopy('copy', 0, createRng(1)), fsCopy('copy', 1, createRng(2))]) {
    if (seg.type === 'fs-tool') seg.integrity = 100;
    place(memory, seg, createRng(seg.name.length));
  }
  const rmOnly = { mv: 0.000001, rm: 1 };
  const tried = chooseVerb(memory, createRng(1), rmOnly, []);
  const triedTarget = memory.find((seg) => seg.id === tried?.targetId);
  const spared = chooseVerb(memory, createRng(1), rmOnly, ['copy']);
  check('A: a spare Copy, COPY used on this ship: RM takes it; COPY licensed here and not used yet: no RM (nothing else is fair)',
    tried?.kind === 'rm' && triedTarget?.type === 'fs-tool' && triedTarget.fsTool === 'copy' && spared === null,
    `tried ${triedTarget?.name ?? JSON.stringify(tried)}, spared ${JSON.stringify(spared)}`);
  // ...and a verb already counting down on it does not land once the target turns out to be spared.
  const after = structuredClone(memory);
  check('A: …landVerb re-checks it (an RM on an untried Copy does not land)', tried !== null && !landVerb(after, tried, ['copy']));
}

// Weights: the last unit's habits.
{
  const mover = verbWeights({ number: 47, woke: 0, shipName: 'X', cause: 'overwritten', stats: { moves: 30, deletes: 0 }, hollowUnits: [46] });
  const fresh = verbWeights(null);
  check('A: weights: MV = 1 + moves/10, RM = 1 + deletes/10 (a first run: 1 and 1)', mover.mv === 4 && mover.rm === 1 && fresh.mv === 1 && fresh.rm === 1,
    JSON.stringify({ mover, fresh }));
  // A shaken memory where both verbs have a fair target.
  let shaken = 0;
  while (chooseVerb(shakenMemory(shaken), createRng(1), { mv: 1, rm: 0.000001 }, [])?.kind !== 'mv'
    || chooseVerb(shakenMemory(shaken), createRng(1), { mv: 0.000001, rm: 1 }, [])?.kind !== 'rm') shaken++;
  const memory = shakenMemory(shaken);
  let mvs = 0;
  let both = 0;
  for (let i = 0; i < 400; i++) {
    const rng = createRng(1000 + i);
    const asMover = chooseVerb(memory, rng, mover, []);
    const rmOnly = chooseVerb(memory, createRng(1000 + i), { mv: 0.000001, rm: 1 }, []);
    const mvOnly = chooseVerb(memory, createRng(1000 + i), { mv: 1, rm: 0.000001 }, []);
    if (rmOnly?.kind !== 'rm' || mvOnly?.kind !== 'mv') continue;
    both++;
    if (asMover?.kind === 'mv') mvs++;
  }
  check('A: …a unit that moved a lot is fought with MV about 4 times in 5', both > 100 && mvs / both > 0.72 && mvs / both < 0.88, `${mvs}/${both}`);
}

// --- B. The live counter --------------------------------------------------------------------------------------------

const h = createHarness11(11);
const state = (): Readonly<GameState> => h.store.getState();
const events = (name: string): number => h.events.filter((event) => event.name === name).length;

// LAST LIGHT on its coast (CRUISE: nothing pressing), HOLLOW awake but not biting (the counter is what is measured).
function coast(seed: number): void {
  h.lastLight(seed);
  // REPAIR comes with the first look inside or the first need (licences.ts); this kid has looked: Repair and Repair.bak.
  if (!isLicensed(state(), 'repair')) installTool(h.store, 'repair');
  h.store.update((d) => {
    d.hollow.phase = 'awake';
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.hollow.seedMoments = 1;
  });
  // Off the crash course: the opening OUT burn done by the book (the WP1 follower), so the flight is calm.
  const end = h.wall() + 20;
  let holding = false;
  while (h.wall() < end && (h.pred().outcome === 'impact' || state().clock.pace === 'tactical')) {
    const text = h.shown()?.text ?? '';
    const hold = /hold \[SPACE\]|KEEP HOLDING/.test(text);
    if (hold && !holding) { h.keyDown('Space'); holding = true; }
    if (!hold && holding) { h.keyUp('Space'); holding = false; }
    h.step();
  }
  if (holding) h.keyUp('Space');
  h.stepFor(1);
  h.events.length = 0;
}

function telegraphNow(): GameState['hollow']['verb'] {
  verbNow(h.store);
  h.step();
  return state().hollow.verb;
}

coast(11);
check('B: on the coast (CRUISE), HOLLOW awake', state().clock.pace !== 'tactical' && state().hollow.phase === 'awake', `${state().clock.pace} ${state().hollow.phase}`);
{
  const verb = telegraphNow();
  const target = state().memory.find((seg) => seg.id === verb?.targetId);
  // Unlink pass: HOLLOW's RM types `unlink`, and the ship's first verb counts from 4 (VERB_FIRST_TELEGRAPH_SEC).
  check('B: verbNow: RM telegraphs, aimed at the spare Repair.bak; the strip says BLOCK IT (4…), the TERMINAL counts down from 4',
    verb?.kind === 'rm' && target?.name === 'Repair.bak' && /^BLOCK IT.*\(4…\)$/.test(h.shown()?.text ?? '')
    && verb.totalSec === VERB_FIRST_TELEGRAPH_SEC && state().hollow.verbTelegraphs === 1
    && h.log().some((entry) => entry.speaker === 'hollow-cmd' && entry.text === '> unlink repair.bak ... 4'),
    `${verb?.kind} ${target?.name} ${verb?.totalSec} | ${h.shown()?.text}`);
  // On the coast the clock keeps its everySec after the first verb too (only the duel's short clock is pushed back).
  check('B: …on the coast the next verb still comes everySec after the first one\'s start', state().hollow.verbInSec === ship.hollow.verbs!.everySec,
    `${state().hollow.verbInSec}`);
  check('B: …and a warning holds SKIP', state().alerts.list.some((alert) => alert.id === 'hollow-verb' && alert.inhibitsSkip));
  // 4 s of countdown (the first verb), then the strip's 0.3 s hysteresis before the next line.
  h.stepFor(4.6);
  check('B: unblocked, it lands when the countdown runs out: Repair.bak is gone, the echo names who did it, glitchBurst(0.3, 400)',
    !state().memory.some((seg) => seg.name === 'Repair.bak') && state().hollow.verbsLanded === 1
    && h.log().some((entry) => /^> unlink repair\.bak {3}\[user: /.test(entry.text))
    && h.events.some((event) => event.name === 'glitch-burst' && JSON.stringify(event.payload) === JSON.stringify({ level: GLITCH_BURST_LEVEL, ms: GLITCH_BURST_MS })),
    `landed ${state().hollow.verbsLanded}; burst level ${glitchBurstLevel()}`);
  check('B: …the warning is gone, the strip moves on', !state().alerts.list.some((alert) => alert.id === 'hollow-verb') && !/^BLOCK IT/.test(h.shown()?.text ?? ''));
  check('B: …and with Repair the last working copy now, no RM aims at it', (() => {
    const next = chooseVerb(state().memory, createRng(2), { mv: 1, rm: 1 }, state().hollow.untriedTools);
    return next === null || state().memory.find((seg) => seg.id === next.targetId)?.name !== 'Repair';
  })());
  // The second verb on the ship: the known drill, 3 s, and the clock back to everySec.
  const second = telegraphNow();
  check('B: the ship\'s second verb counts from 3 (`... 3`), and the next one comes everySec after it',
    second !== null && second.totalSec === VERB_TELEGRAPH_SEC && state().hollow.verbTelegraphs === 2
    && h.log().some((entry) => entry.speaker === 'hollow-cmd' && entry.text === HOLLOW_VERB.telegraph(second.kind, second.targetWord, 3))
    && state().hollow.verbInSec === ship.hollow.verbs!.everySec,
    `${JSON.stringify(second)} in ${state().hollow.verbInSec}`);
}

coast(12);
{
  const verb = telegraphNow();
  check('B: a new ship starts over: its first verb counts from 4 again', verb?.totalSec === VERB_FIRST_TELEGRAPH_SEC && state().hollow.verbTelegraphs === 1,
    JSON.stringify(verb));
  h.stepFor(1);
  const target = state().memory.find((seg) => seg.id === verb?.targetId)!;
  const refusal = actionScan(h.store, target);
  h.step();
  check('B: a SCAN on its target during the countdown blocks it at once: `... BLOCKED`, verb-blocked',
    refusal === null && state().hollow.verb === null && state().hollow.verbsBlocked === 1 && events('verb-blocked') === 1
    && h.log().some((entry) => entry.text === '> unlink repair.bak ... BLOCKED'), `refusal ${refusal}, blocked ${state().hollow.verbsBlocked}`);
  h.stepFor(4);
  check('B: …and Repair.bak is still there after the countdown would have run out', state().memory.some((seg) => seg.id === target.id) && state().hollow.verbsLanded === 0);
}

coast(13);
{
  const verb = telegraphNow();
  const target = state().memory.find((seg) => seg.id === verb?.targetId)!;
  actionScan(h.store, target);
  const scan = getOpsBySeg(target.id)[0];
  if (scan) cancelOp(scan.id);
  h.step();
  check('B: an op started and cancelled between two ticks still blocks it', state().hollow.verbsBlocked === 1 && state().hollow.verb === null,
    `blocked ${state().hollow.verbsBlocked}`);
}

coast(14);
{
  // Repair.bak already moving (an op on it) when HOLLOW aims at it: blocked at the start.
  const bak = state().memory.find((seg) => seg.name === 'Repair.bak')!;
  const free = state().memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]!;
  const moved = actionMove(h.store, bak, { regionSegIds: [free.id], col: 0 });
  const verb = telegraphNow();
  h.step();
  check('B: a target already mid-op (a MOVE running on it) is blocked on the countdown\'s first tick',
    moved === null && verb?.targetId === bak.id && state().hollow.verb === null && state().hollow.verbsBlocked === 1,
    `move ${moved}, verb ${JSON.stringify(verb)}, ops ${getOps().length}`);
}

coast(15);
{
  // A seed for MV, weighted so MV comes: a DELETE on the seed blocks it (and takes the seed away).
  const seedBlock: HollowSegment = { id: newSegId('seed'), name: 'UNIT-046', type: 'hollow', size: 2, root: false, locked: false, owner: 'UNIT-046', seed: true };
  const memory = state().memory;
  const free = memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]!;
  const start = segmentStarts(memory)[memory.indexOf(free)]! + 1;
  replaceRange(memory, start, start + 2, [seedBlock], { opId: null, own: [] });
  mergeAdjacentFree(memory);
  h.store.update((d) => {
    d.ui.memoryRev++;
    d.run.lastUnit = { number: 47, woke: 0, shipName: 'X', cause: 'overwritten', stats: { moves: 999, deletes: 0 }, hollowUnits: [46] };
  });
  const verb = telegraphNow();
  // The ship's first verb, an MV this time: it counts from 4 too (the first of either kind).
  check('B: MV telegraphs on the seed (`> mv seed ... 4`, the ship\'s first verb; `BLOCK IT — DELETE its SEED`)', verb?.kind === 'mv' && verb.targetId === seedBlock.id
    && h.log().some((entry) => entry.text === '> mv seed ... 4') && /DELETE its SEED/.test(h.shown()?.text ?? ''), `${JSON.stringify(verb)} | ${h.shown()?.text}`);
  const refusal = actionDelete(h.store, state().memory.find((seg) => seg.id === seedBlock.id)!);
  h.step();
  check('B: …a DELETE on the seed blocks it', refusal === null && state().hollow.verb === null && state().hollow.verbsBlocked === 1);
  h.stepFor(3);
  check('B: …and the DELETE takes the seed away', !state().memory.some((seg) => seg.id === seedBlock.id));
}

// The clock and the countdown stand still while the flight is at TACTICAL (the crash course at the start).
h.lastLight(16);
h.store.update((d) => { d.hollow.phase = 'awake'; d.hollow.biteInSec = 9999; d.hollow.seedInSec = 9999; d.hollow.seedMoments = 1; });
h.step();
{
  const before = state().hollow.verbInSec;
  h.stepFor(2);
  check('B: on the crash course (TACTICAL) the verb clock stands still', state().clock.pace === 'tactical' && before !== null && state().hollow.verbInSec === before,
    `${state().clock.pace} ${before} → ${state().hollow.verbInSec}`);
  h.store.mutate((d) => { d.hollow.verbInSec = 0; });
  h.step();
  check('B: …and no verb starts there even when its clock is out', state().hollow.verb === null && state().hollow.verbMoments === 0);
}

// --- C. The competent defender, 200 seeds ----------------------------------------------------------------------------

{
  const SEEDS = Number(process.env.BOSS_SEEDS ?? 200);
  let completed = 0;
  let lostTotal = 0;
  let worst = 0;
  let locked = 0;
  let landed = 0;
  let blocked = 0;
  let verbs = 0;
  const failures: string[] = [];
  const started = Date.now();
  for (let seed = 1; seed <= SEEDS; seed++) {
    h.lastLight(seed);
    h.flyLastLight(900);
    if (h.status() !== 'locked' && h.status() !== 'accepted') { failures.push(`seed ${seed}: ${h.status()}`); lostTotal += 16; continue; }
    if (h.status() === 'locked') locked++;
    const end = h.finishFinale('purge', 500);
    if (end.reachedChoice) completed++;
    else failures.push(`seed ${seed}: no choice (${state().hollow.finale.phase}, ${state().run.phase})`);
    const lost = state().souls.results.filter((result) => result.outcome === 'lost').length;
    lostTotal += lost;
    worst = Math.max(worst, lost);
    landed += state().hollow.verbsLanded;
    blocked += state().hollow.verbsBlocked;
    verbs += state().hollow.verbMoments;
  }
  const mean = lostTotal / SEEDS;
  console.log(`C: ${SEEDS} seeds in ${((Date.now() - started) / 1000).toFixed(0)} s: locked ${locked}, root deleted ${completed}, lost ${mean.toFixed(2)} on average (worst ${worst}); verbs ${verbs} (landed ${landed}, blocked ${blocked})`);
  check(`C: the competent defender completes the root's DELETE on every seed (${SEEDS})`, completed === SEEDS, failures.slice(0, 5).join(' | '));
  check('C: …and loses ≤ 4 of 16 clusters on average', mean <= 4, `${mean.toFixed(2)} (worst ${worst})`);
}

finish();
