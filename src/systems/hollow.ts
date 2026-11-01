import type { Store } from '@state/store';
import type { GameState, HollowState } from '@state/schema';
import type { Segment, HollowSegment, InfectionSide, DriverSegment } from '@/types/segment';
import type { HollowDef, SeedDef, SeedTarget } from '@data/ships';
import type { Rng } from '@systems/rng';
import { onAiTick, onPostTick, isLivePhase, setPaused } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit, NO_PAYLOAD } from '@systems/events';
import { getPrediction } from '@systems/predict';
import { offerInTac } from '@systems/landing-orbit';
import { isThrustOn, isGhostFiring, endGhost } from '@systems/orbit-sim';
import { getOpsBySeg, abortOp, type Op } from '@systems/ops-core';
import {
  raiseAlert, clearAlert, clearHollowAlerts, INFECTED_ALERT_ID, CORE_ALERT_ID, EATEN_ALERT_PREFIX, SEED_ALERT_ID,
} from '@systems/alerts';
import { nextToLaunch } from '@systems/landing-rules';
import { say, hollowLabel, createStory, type Story, type StoryBeat } from '@systems/say';
import { isFirstRun, type LastUnit } from '@systems/meta';
import {
  newSegId, segmentStarts, assertMemoryInvariants, replaceRange, freeSegment, mergeAdjacentFree, requireAddr,
} from '@systems/memory-ops';
import { toolKindOf } from '@systems/carry';
import { childRng } from '@systems/rng';
import { setIntegrity, cureInfection, recordDriverLost, parkPodsAboard } from '@state/actions';
import { isOpenFree } from '@systems/tool-targets';
import {
  isInfectable, isInfected, isHollow, infectedSegments, fileLabel, effectiveToolVersion, driversInMemory, isDriver,
  isFirewall, isUsableTool, hasUsableTool, hasIntegrity, integrityBand, spreadPaused, isShipFile, isAiFile, rootBlock, rootDeleteRunning, engineOpen,
  toolFilesOf,
  type HealthSegment,
} from '@state/selectors';
import type { FsToolKind } from '@/types/fs-tool';
import { repairRatePerSec } from '@data/fs-tools';
import { MEMORY_TOTAL_BLOCKS, FRESH_UNIT_CHARGE, UNIT_RACKS_START, hexAddr } from '@data/memory';
import { HOLLOW_ALERT_TEXT, HOLLOW_DESC, HOLLOW_STORY, HOLLOW_ECHO, hollowUnitName } from '@data/hollow-text';
import { SEEDS_ONLY_DEF } from '@data/threats';
import { THREAT_TEXT } from '@data/threat-text';
import { driverName } from '@data/landing-text';
import { echoName } from '@data/tool-text';
import { IS_DEV } from '@/env';
import {
  WALL_MIN_BLOCKS, INTEGRITY_MAX, EATEN_ALARM_SEC, EATEN_ALARM_CLEAR_SEC, HOLLOW_STORY_SILENCE_SEC,
  WAKE_AFTER_DODGE_SEC, HOLLOW_CONTROL_AFTER_SEC, HOLLOW_SCRIPTED_BITE_DELAY_SEC, HOLLOW_STORY_READ_SEC,
  HOLLOW_NAME_AFTER_TYPED_SEC, SEED_BLOCKS, SEED_TELEGRAPH_SEC, SEED_TOOL_GAP_BLOCKS, DEAL_REFUSE_INTERVAL_FACTOR,
  DEAL_SEED_CALLED_OFF_SEC, RACK_BLOCKS, VERB_WEIGHT_PER_STAT, VERB_MV_NEAR_BLOCKS, OP_COMPLETE_PCT, BITTEN_AGAIN_COUNT,
  TACTICAL_LEAD_BURN_TAC, MERGE_COST_CHARGE,
} from '@data/tuning';

// HOLLOW (§1, §6.6, §9 WP6): the caretaker of the previous wave, starving in the same memory as you.
// One rule a kid can repeat: "It eats the file next to it. An eaten file turns into HOLLOW too.
// 4 free blocks stop it."
//
// • THE BITE. On one global timer (spreadEverySec: `NEXT BITE m:ss` on every hollow block), each
//   hollow block looks left and right in address order. It counts the free blocks up to the first
//   occupied segment: WALL_MIN_BLOCKS or more is a WALL and the bite fizzles; a neighbour that is no
//   food (REPAIR CHARGE, other hollow), already infected or still recoiling from a cure is skipped;
//   anything else is infected from the side that faces HOLLOW. Racks don't matter: memory is one
//   line of addresses. hollowReach is that rule as data, so the painter's arrows and GAP/WALL
//   labels and the bite itself can never disagree.
// • THE DRAIN. An infected file loses drainPerSec integrity per AI second, × the larger of burnMult while
//   the engine delivers thrust (P1: HOLLOW eats twice as fast while you burn) and landMult while the
//   landing is active (01-landing §5: "the larger applies").
// • CONSUME. At 0 the file turns into hollow of the same size, in place (a pod loses its driver and stays
//   aboard, a tool is gone with its capability), and every op on it is aborted. The Core never turns: it hits 0
//   and the ship is lost (core-zero).
// • THE TUG-OF-WAR. A REPAIR on an infected file keeps healing while the drain keeps subtracting:
//   one boundary between green and red. At 100 it is cured (the repair's own completion,
//   state/actions.ts cureInfection): the infection clears and the file recoils HOLLOW_RECOIL_SEC
//   (bites skip it). The design rule (validateHollowDef) makes a started repair always win while
//   charge lasts; at 0 the repair is aborted and its charge is lost.
// • WAKE. Ship 1 ('loop-closed-once'): a moment after the loop first closes, one scripted bite on
//   the driver next to the root (POD 01 · OKAFOR: "it waits until you brake"). Once that fight is decided
//   it goes dormant: 1.5 s of silence, `> ...047?`, and ARRIVAL CONTROL says to ignore it (advanceStory). Later ships wake afterAiSec
//   into the flight (or soon after the coast begins), bite at once and then on the timer; never while a
//   debris dodge is open, nor in the WAKE_AFTER_DODGE_SEC after it closes (KESTREL, the lead's ruling).
// • SEEDS (ship 3+, §6.6). Every seed.everySec (the first seed.firstAfterSec after the wake, counted only
//   while the flight is calm: HollowStepCtx.firstSeedHeld) a 2-block seed
//   is telegraphed for SEED_TELEGRAPH_SEC (a blinking outline, the moment DELETE is licensed), then lands
//   in free space as one more hollow block, which bites by the same rule. It aims at the walls that guard
//   the colonists (seedSpot), or on VESPER at your filesystem tools (nearToolsSeedSpot), never at space a running
//   op reserved; DELETE clears it, and the wall is back.
//
// stepHollow is the whole rule, pure: it reshapes the memory array and returns what happened. The
// mount (mountHollow) runs it on the AI tick (flight and landing; pause stops it, warp never speeds
// it), after the ops and the landing (a launch and a bite in the same tick: the launch wins), and turns
// its events into one store update, aborted ops, alerts, sounds and the ship-1 script.

export type HollowSide = InfectionSide;

// What one hollow block's look to one side finds (§6.6, the painter's arrows and labels):
// bite: the neighbour will be infected on the next bite; wall: ≥ WALL_MIN_BLOCKS free blocks hold
// it; blocked: the neighbour is no food (REPAIR CHARGE, other hollow); infected: already being
// eaten; recoiling: just cured; edge: nothing but free space to the end of memory.
export type ReachVerdict = 'bite' | 'wall' | 'blocked' | 'infected' | 'recoiling' | 'edge';

export interface Reach {
  hollowId: string;
  side: HollowSide;            // which way the hollow block looks
  gapBlocks: number;           // free blocks between it and the neighbour
  gapIds: string[];            // the free segments of that gap, nearest first
  neighbourId: string | null;  // the first occupied segment past the gap (null at the end of memory)
  verdict: ReachVerdict;
}

export type HollowEvent =
  | { kind: 'infect'; segId: string; side: HollowSide; scripted: boolean }
  | { kind: 'recoil-end'; segId: string }
  | { kind: 'consume'; eaten: HealthSegment; block: HollowSegment }
  | { kind: 'core-zero'; segId: string }
  | { kind: 'wall-held'; hollowId: string; side: HollowSide; gapBlocks: number }
  // WP8: a FIREWALL.sys held a bite on one side (the same fizzle as a WALL; it holds whatever the gap).
  | { kind: 'firewall-held'; hollowId: string; side: HollowSide; firewallId: string }
  | { kind: 'bite' }
  // WP9: a seed's outline started blinking at these blocks, and a seed landed (structural).
  | { kind: 'seed-telegraph'; startAddr: number; size: number }
  | { kind: 'seed'; block: HollowSegment; startAddr: number };

export interface HollowStepCtx {
  thrustDelivered: boolean;   // the engine delivers thrust this tick (player, AUTOBURN or ghost)
  landingActive: boolean;     // the landing is active: landMult applies (drainConditions)
  aiNow: number;              // clock.aiSec
  rng: Rng;                   // seeds and verbs roll here (WP9, WP11)
  // This ship's HOLLOW (the state.hollow slice): its phase and its one bite timer are advanced in
  // place, like every per-tick number (§9 tick discipline).
  hollow: HollowState;
  loopClosed: boolean;        // the TRUE path is a closed loop right now (ship 1's wake)
  coastAtAi: number | null;   // when the coast began (burn.coastAtAi): a later ship's wake may key on it
  owner: string;              // what a newly eaten block is called (`???`, later UNIT-046)
  // WP9 review round 2 (the lead's ruling for round 1): a debris dodge is open on the TRUE path, so a timed wake waits
  // (KESTREL: its bites, alarms and tutorials would bury the dodge's countdown, the ship's one decision that runs out).
  wakeHeld: boolean;
  // The flight is at TACTICAL pace (a burn, its last seconds, the ring, an alarm): the FIRST seed waits for a calm
  // flight, so DELETE's licence and the RM THE SEED lesson never land under a NOW / KEEP HOLDING / RELEASE line.
  firstSeedHeld: boolean;
}

// The direction each side looks in, as an array step.
const SIDE_STEP: Readonly<Record<HollowSide, -1 | 1>> = { left: -1, right: 1 };
const SIDES: readonly HollowSide[] = ['left', 'right'];

// The other side. A neighbour on HOLLOW's right is bitten on its left end (and the other way round),
// and a gap HOLLOW looks into from its right touches it on the gap's left.
export function oppositeSide(side: HollowSide): HollowSide {
  return side === 'left' ? 'right' : 'left';
}

function isRecoiling(seg: HealthSegment, aiNow: number): boolean {
  return seg.recoilUntilAi !== undefined && seg.recoilUntilAi > aiNow;
}

// The free run beside segment `index` on one side (`step` −1 left, +1 right): its blocks, its free
// segments' ids nearest first, and the index past it (−1 or memory.length off the strip's ends). The kid's
// one rule reads it (isWall); systems/move-preview.ts walks HOLLOW's whole reach with it.
export interface FreeRun {
  gapBlocks: number;
  gapIds: string[];
  nextIndex: number;
}

export function freeRunFrom(memory: readonly Segment[], index: number, step: -1 | 1): FreeRun {
  let cursor = index + step;
  let gapBlocks = 0;
  const gapIds: string[] = [];
  while (cursor >= 0 && cursor < memory.length && memory[cursor]!.type === 'free') {
    gapBlocks += memory[cursor]!.size;
    gapIds.push(memory[cursor]!.id);
    cursor += step;
  }
  return { gapBlocks, gapIds, nextIndex: cursor };
}

// WALL_MIN_BLOCKS free blocks or more stop a bite (a WALL); fewer are a GAP it bites across.
export function isWall(gapBlocks: number): boolean {
  return gapBlocks >= WALL_MIN_BLOCKS;
}

function lookFrom(memory: readonly Segment[], index: number, side: HollowSide, aiNow: number): Reach {
  const hollow = memory[index]!;
  const { gapBlocks, gapIds, nextIndex } = freeRunFrom(memory, index, SIDE_STEP[side]);
  const neighbour = memory[nextIndex] ?? null;
  let verdict: ReachVerdict;
  if (isWall(gapBlocks)) verdict = 'wall';
  else if (!neighbour) verdict = 'edge';
  else if (!isInfectable(neighbour)) verdict = 'blocked';
  else if (neighbour.infected) verdict = 'infected';
  else if (isRecoiling(neighbour, aiNow)) verdict = 'recoiling';
  else verdict = 'bite';
  return { hollowId: hollow.id, side, gapBlocks, gapIds, neighbourId: neighbour?.id ?? null, verdict };
}

// Every hollow block's reach, left then right, in address order. Pure.
export function hollowReach(memory: readonly Segment[], aiNow: number): Reach[] {
  const reach: Reach[] = [];
  memory.forEach((seg, index) => {
    if (!isHollow(seg)) return;
    for (const side of SIDES) reach.push(lookFrom(memory, index, side, aiNow));
  });
  return reach;
}

// `beam`: the bite came from a beam-born block (04 §3.5, §3.7), so the block the file becomes when eaten is beam-born too
// (consume), and an infection carried to the next ship stays the beam's (packing copies the infection).
function infect(seg: HealthSegment, side: HollowSide, beam = false): void {
  seg.infected = beam ? { side, beam: true } : { side };
}

// One bite of the global timer: every reach that bites infects its neighbour (a file next to two
// hollow blocks is bitten once), and every WALL or FIREWALL holds with a fizzle. `only`: the hollow blocks that bite
// this time (beam seeds on their own clock before a plain ARRIVAL's fight, stepBeamSeedsBeforeFight); null: all of them.
function spreadBite(memory: readonly Segment[], aiNow: number, events: HollowEvent[], only: ReadonlySet<string> | null = null): void {
  const bitten = new Set<string>();
  events.push({ kind: 'bite' });
  for (const reach of hollowReach(memory, aiNow)) {
    if (only !== null && !only.has(reach.hollowId)) continue;
    if (reach.verdict === 'wall') {
      events.push({ kind: 'wall-held', hollowId: reach.hollowId, side: reach.side, gapBlocks: reach.gapBlocks });
      continue;
    }
    if (reach.verdict === 'blocked' && reach.neighbourId !== null) {
      const blocker = memory.find((seg) => seg.id === reach.neighbourId);
      if (blocker && isFirewall(blocker)) events.push({ kind: 'firewall-held', hollowId: reach.hollowId, side: reach.side, firewallId: blocker.id });
      continue;
    }
    if (reach.verdict !== 'bite' || reach.neighbourId === null || bitten.has(reach.neighbourId)) continue;
    const target = memory.find((seg) => seg.id === reach.neighbourId);
    if (!target || !isInfectable(target)) throw new Error(`hollow: reach target ${reach.neighbourId} is not food`);
    bitten.add(target.id);
    const side = oppositeSide(reach.side);
    const biter = memory.find((seg) => seg.id === reach.hollowId);
    infect(target, side, biter !== undefined && isHollow(biter) && biter.beam === true);
    events.push({ kind: 'infect', segId: target.id, side, scripted: false });
  }
}

// Ship 1's one bite (§6.6): the driver next to the root, by address (POD 01 · OKAFOR unless it was
// moved). Only a driver: the scripted bite is about the people. A WALL or another neighbour means
// nothing is bitten, silently (the fizzle is for the timer's bites).
// Phase 3 slice 2: the root sits in its slot between two drivers (GAPs of 2 and 1, 04 §3.8), so the nearer one is
// bitten (the smaller GAP; of equal ones the first in reach order): VESPER's POD 09, the ship's lead.
function scriptedBite(memory: readonly Segment[], aiNow: number, events: HollowEvent[]): void {
  let pick: { target: HealthSegment; side: HollowSide; gap: number } | null = null;
  for (const reach of hollowReach(memory, aiNow)) {
    const root = memory.find((seg) => seg.id === reach.hollowId);
    if (!root || !isHollow(root) || !root.root || reach.verdict !== 'bite') continue;
    const target = memory.find((seg) => seg.id === reach.neighbourId);
    if (!target || target.type !== 'driver') continue;
    if (pick === null || reach.gapBlocks < pick.gap) pick = { target, side: oppositeSide(reach.side), gap: reach.gapBlocks };
  }
  if (pick === null) return;
  infect(pick.target, pick.side);
  events.push({ kind: 'infect', segId: pick.target.id, side: pick.side, scripted: true });
}

// What a driver or a file was, as an eaten block remembers it (INSPECT: `This was POD 01 · OKAFOR.`).
function eatenName(seg: HealthSegment): string {
  return seg.type === 'driver' ? driverName(seg.pod, seg.family) : seg.name;
}

// The file at `index` turns into hollow of the same size, in place (same blocks, a new id).
function consume(memory: Segment[], index: number, owner: string): HollowSegment {
  const eaten = memory[index]!;
  if (!isInfectable(eaten)) throw new Error(`hollow: consume on ${eaten.name}, which is not food`);
  const ate = eatenName(eaten);
  const block: HollowSegment = {
    id: newSegId('hollow'),
    name: owner,
    type: 'hollow',
    size: eaten.size,
    root: false,
    locked: false,
    owner,
    ate,
    desc: HOLLOW_DESC.eaten(ate),
  };
  if (eaten.type === 'driver') block.atePod = eaten.pod;
  // A file a beam-born block was eating turns beam-born itself (04 §3.7: "a seed that ate reports twice").
  if (eaten.infected?.beam) block.beam = true;
  memory[index] = block;
  return block;
}

// --- Seeds (WP9, §6.6) ------------------------------------------------------------------------------------

// Where the next seed lands (the 'walls' target, §6.6): the centre of a free gap of at least WALL_MIN_BLOCKS
// next to a pod's driver, the smallest first: the most fragile wall, the one a 2-block seed splits into GAPs
// HOLLOW can bite across. Of equal gaps, one that stands between colonists and HOLLOW (a WALL the kid built)
// comes first, then the lower address. With no such gap anywhere, the centre of the largest free region that
// takes a seed. Space a running op reserved is never used (only open free segments count, and a gap behind a
// reserved one does not touch the driver). null: nowhere a seed fits. Pure.
//
// (§6.6 says the LARGEST gap that touches a cluster. On every ship the largest is the open rack D or the
// rack's free tail, where a 2-block seed leaves walls of 30 blocks on both sides: it could never split a wall,
// and §5.1's "splits the wall into GAP 3 on each side" and acceptance 4's "deleting a seed restores the WALL"
// could not happen. A WP9 deviation.)
// WP11 (the lead's TODO, WP10 question 3): no spot leaves a tool in `untried` (licensed on this ship, not used here yet:
// HollowState.untriedTools) within the seed's bite on the gap's other side.
// Final review: no spot leaves a ship file within the seed's bite either. A cluster the kid moved into rack A's free tail
// (on LAST LIGHT the strip's SAFE spot farthest from HOLLOW) pulled the next seed in beside Cargo Ctrl, and HOLLOW ate
// its way through the ship's files (Cargo Ctrl → Printer Uplink → … → Reactor), which no REPAIR can heal. (A gap so
// wide that the seed in its middle has WALLs on both sides bites nothing, so it stays a spot, as the largest region
// does: the review asked for "no gap that touches a ship file", and that rule left a ship with no seed spot at all
// when its largest region began at rack A's tail.)
export interface SeedSpot {
  startAddr: number;
  gapId: string;
}

export function seedSpot(memory: readonly Segment[], untried: readonly FsToolKind[]): SeedSpot | null {
  const starts = segmentStarts(memory);
  interface Candidate { index: number; size: number; guards: boolean }
  const walls: Candidate[] = [];
  let largest: Candidate | null = null;
  // The seed sits in the gap's middle: the free blocks it leaves on each side, and whether a file it must spare (an
  // untried tool, a ship file) is in its bite.
  const sparedInBite = (index: number, size: number): boolean => {
    const leftFree = Math.floor((size - SEED_BLOCKS) / 2);
    const near = (neighbour: Segment | undefined, free: number): boolean => !isWall(free) && neighbour !== undefined
      && ((neighbour.type === 'fs-tool' && untried.includes(neighbour.fsTool)) || isShipFile(neighbour));
    return near(memory[index - 1], leftFree) || near(memory[index + 1], size - SEED_BLOCKS - leftFree);
  };
  memory.forEach((seg, index) => {
    if (!isOpenFree(seg) || seg.size < SEED_BLOCKS || sparedInBite(index, seg.size)) return;
    const left = memory[index - 1];
    const right = memory[index + 1];
    const touchesDriver = left?.type === 'driver' || right?.type === 'driver';
    if (seg.size >= WALL_MIN_BLOCKS && touchesDriver) {
      const guards = (left?.type === 'driver' && right?.type === 'hollow') || (left?.type === 'hollow' && right?.type === 'driver');
      walls.push({ index, size: seg.size, guards });
    }
    if (!largest || seg.size > largest.size) largest = { index, size: seg.size, guards: false };
  });
  walls.sort((a, b) => a.size - b.size || (a.guards === b.guards ? 0 : a.guards ? -1 : 1) || a.index - b.index);
  const pick: Candidate | null = walls[0] ?? largest;
  if (pick === null) return null;
  const gap = memory[pick.index]!;
  return { startAddr: starts[pick.index]! + Math.floor((gap.size - SEED_BLOCKS) / 2), gapId: gap.id };
}

// The files a tool-hunting seed must never bite: the AI Core, and the AI files in rack E (Engine I/O, Sensor Interp, the
// carried skills and cards). Final review: on a unit whose REPAIR CHARGE and card files filled racks E–F (a ★★★ kid),
// the gap "nearest a tool" sat beside the Core, and the seed bit the Core instead of the tool.
function sparedFromToolHunt(memory: readonly Segment[], starts: readonly number[], index: number): boolean {
  const seg = memory[index];
  if (seg === undefined || !isAiFile(seg)) return false;
  if (seg.type === 'core') return true;
  const start = starts[index]!;
  return start < UNIT_RACKS_START + RACK_BLOCKS && start + seg.size > UNIT_RACKS_START;
}

// Where the next seed lands on a ship whose seeds hunt your tools ('near-tools', VESPER, §6.6, WP10): a free gap with a
// filesystem tool's file right beside it, and in it the end that faces the tool, SEED_TOOL_GAP_BLOCKS free blocks from it
// (fewer if the gap is that small, or right against the tool when that keeps the far side a WALL off a spared file): a
// GAP the seed bites across at its next bite, so it really comes for that tool, while the rest of the gap stays a WALL
// on its far side. Of those gaps, one on the tool's own rack row first (WP10 review: a
// seed at the far end of rack E hunting SCAN at the start of rack F sat beside a green WALL on screen, its tool a row
// away), then the larger gap, then the lower address. §6.6 says only "the free gap nearest an fs-tool"; a seed in the
// middle of rack E's free tail would have walls of 8+ blocks on both sides and hunt nothing.
// The spot is chosen by the files the seed would really bite (final review): the file on the tool side must BE a
// filesystem tool (WP10 measured "nearest" by the blocks between, so the gap could sit beside the Core with the tool past
// it), and no spot whose bite on the far side reaches the Core or an AI file in rack E (sparedFromToolHunt) is used.
// With no such gap (no tool file left in memory, or every gap beside one would bite those files), §6.6's no-wall rule:
// the centre of the largest free region whose seed bites none of them. Space a running op reserved is never used. null:
// nowhere a seed fits. Pure.
// WP11 (the lead's TODO, WP10 question 3): a tool in `untried` (licensed on this ship, not used here yet:
// HollowState.untriedTools) is not hunted, and no spot leaves one within the seed's bite on the gap's far side.
export function nearToolsSeedSpot(memory: readonly Segment[], untried: readonly FsToolKind[]): SeedSpot | null {
  const starts = segmentStarts(memory);
  const isUntried = (seg: Readonly<Segment> | undefined): boolean => seg?.type === 'fs-tool' && untried.includes(seg.fsTool);
  const hunted = (seg: Readonly<Segment> | undefined): boolean => seg?.type === 'fs-tool' && !isUntried(seg);
  // A file the seed's bite across `free` blocks would reach but must not (an untried tool, or a spared AI file).
  const bitesForbidden = (index: number, free: number): boolean =>
    !isWall(free) && (isUntried(memory[index]) || sparedFromToolHunt(memory, starts, index));
  let best: { index: number; size: number; sameRow: boolean; towardRight: boolean; toolGap: number } | null = null;
  let largest: { index: number; size: number } | null = null;
  for (let index = 0; index < memory.length; index++) {
    const seg = memory[index]!;
    if (!isOpenFree(seg) || seg.size < SEED_BLOCKS) continue;
    const centreLeft = Math.floor((seg.size - SEED_BLOCKS) / 2);
    const centreSpares = !bitesForbidden(index - 1, centreLeft) && !bitesForbidden(index + 1, seg.size - SEED_BLOCKS - centreLeft);
    if (centreSpares && (largest === null || seg.size > largest.size)) largest = { index, size: seg.size };
    const gapStart = starts[index]!;
    const gapEnd = gapStart + seg.size;
    for (const towardRight of [true, false]) {
      const toolIndex = towardRight ? index + 1 : index - 1;
      if (!hunted(memory[toolIndex])) continue;
      // SEED_TOOL_GAP_BLOCKS from the tool; or right against it when that is what keeps the far side a WALL off a file
      // the seed must spare (a 6-block gap with AUTOBURN.skl beyond it: 1 + seed + 3 bit the card, 0 + seed + 4 holds).
      const farSide = towardRight ? index - 1 : index + 1;
      const toolGap = [Math.min(SEED_TOOL_GAP_BLOCKS, seg.size - SEED_BLOCKS), 0]
        .find((candidate) => !bitesForbidden(farSide, seg.size - SEED_BLOCKS - candidate));
      if (toolGap === undefined) continue;
      const toolStart = starts[toolIndex]!;
      const toolEnd = toolStart + memory[toolIndex]!.size;
      // The gap's block that faces the tool and the tool's facing block share a rack row.
      const sameRow = towardRight
        ? rackRowOf(gapEnd - 1) === rackRowOf(toolStart)
        : rackRowOf(gapStart) === rackRowOf(toolEnd - 1);
      const better = best === null
        || (sameRow !== best.sameRow ? sameRow : seg.size > best.size || (seg.size === best.size && index < best.index));
      if (better) best = { index, size: seg.size, sameRow, towardRight, toolGap };
    }
  }
  if (best === null) {
    if (largest === null) return null;
    const region = memory[largest.index]!;
    return { startAddr: starts[largest.index]! + Math.floor((region.size - SEED_BLOCKS) / 2), gapId: region.id };
  }
  const gap = memory[best.index]!;
  const gapStart = starts[best.index]!;
  const startAddr = best.towardRight ? gapStart + gap.size - best.toolGap - SEED_BLOCKS : gapStart + best.toolGap;
  return { startAddr, gapId: gap.id };
}

// The rack row a block address is on (0 for rack A). data/memory.ts rackOf names the rack.
function rackRowOf(addr: number): number {
  return Math.floor(addr / RACK_BLOCKS);
}

// The next seed's spot by the ship's rule (ShipDef hollow.seed.target).
export function seedSpotFor(memory: readonly Segment[], target: SeedTarget, untried: readonly FsToolKind[]): SeedSpot | null {
  return target === 'near-tools' ? nearToolsSeedSpot(memory, untried) : seedSpot(memory, untried);
}

// The index of the open free segment that holds the blocks [startAddr, startAddr + size), or -1 when they are no
// longer open free space (a MOVE took or reserved them, another seed landed there): where a telegraphed seed lands,
// and where its outline is drawn (HollowPainter), so the two always agree.
export function openFreeHolding(memory: readonly Segment[], startAddr: number, size: number): number {
  const starts = segmentStarts(memory);
  return memory.findIndex((seg, index) => isOpenFree(seg) && starts[index]! <= startAddr && starts[index]! + seg.size >= startAddr + size);
}

function landSeed(memory: Segment[], startAddr: number, owner: string): HollowSegment {
  const block: HollowSegment = {
    id: newSegId('seed'),
    name: owner,
    type: 'hollow',
    size: SEED_BLOCKS,
    root: false,
    locked: false,
    owner,
    seed: true,
    desc: HOLLOW_DESC.seed,
  };
  replaceRange(memory, startAddr, startAddr + SEED_BLOCKS, [block], { opId: null, own: [] });
  return block;
}

// One AI tick of the seeds: the telegraph runs down and the seed lands (where it blinked, or, if a MOVE or
// another seed took that spot meanwhile, re-aimed by seedSpot); the timer runs down and the next telegraph
// starts. A telegraph running holds the timer at zero, so two never overlap.
function stepSeeds(memory: Segment[], dtAi: number, seed: SeedDef, ctx: HollowStepCtx, events: HollowEvent[]): void {
  const { hollow } = ctx;
  const telegraph = hollow.seedTelegraph;
  if (telegraph) {
    telegraph.leftSec -= dtAi;
    if (telegraph.leftSec <= 0) {
      hollow.seedTelegraph = null;
      const stillFree = openFreeHolding(memory, telegraph.startAddr, telegraph.size) >= 0;
      const startAddr = stillFree ? telegraph.startAddr : seedSpotFor(memory, seed.target, hollow.untriedTools)?.startAddr ?? null;
      if (startAddr !== null) {
        events.push({ kind: 'seed', block: landSeed(memory, startAddr, ctx.owner), startAddr });
        hollow.seedsLanded++;
      }
    }
  }
  if (hollow.seedInSec === null) return;
  // The first seed's clock stands still while the flight is busy (HollowStepCtx.firstSeedHeld), so it can only run
  // out on a calm tick. Later seeds keep their rhythm: they are the pressure, the first one is the lesson. (A clock
  // already at zero, from ?debug's seedNow, still fires: the hold freezes the count, not the moment.) While THE DEAL
  // stands, no seed's clock runs (WP10): a seed blinking next to your tools mid-offer would be
  // noise over HOLLOW's one personal moment; its bites go on (the offer's clock and the other bites are the pressure).
  const dealPending = hollow.deal.phase === 'offered';
  if (!dealPending && (hollow.seedMoments > 0 || !ctx.firstSeedHeld)) hollow.seedInSec = Math.max(0, hollow.seedInSec - dtAi);
  if (hollow.seedInSec > 0 || hollow.seedTelegraph) return;
  hollow.seedInSec = seed.everySec;
  hollow.seedMoments++;
  const spot = seedSpotFor(memory, seed.target, hollow.untriedTools);
  if (spot === null) return;
  hollow.seedTelegraph = { startAddr: spot.startAddr, size: SEED_BLOCKS, leftSec: SEED_TELEGRAPH_SEC };
  events.push({ kind: 'seed-telegraph', startAddr: spot.startAddr, size: SEED_BLOCKS });
}

// What the seed warning says once a seed can bite (null: none can): on a ship whose seeds hunt your tools, the file it
// can bite next, a tool first (`SEED NEXT TO SCAN`); a beam seed (04 §3.4) names the file it rode in behind
// (`SEED NEXT TO TELEMETRY`, the seeds-only alert); elsewhere the seed is in a wall.
function seedThreatText(state: Readonly<GameState>): string | null {
  const aiNow = state.clock.aiSec;
  const threatening = threateningSeeds(state.memory, aiNow);
  const seedIds = new Set(threatening.map((seg) => seg.id));
  if (seedIds.size === 0) return null;
  const beam = threatening.some((seg) => seg.beam === true);
  if (state.hollow.cfg.seed?.target !== 'near-tools' && !beam) return HOLLOW_ALERT_TEXT.seedThreat;
  const bitten = hollowReach(state.memory, aiNow)
    .filter((reach) => reach.verdict === 'bite' && seedIds.has(reach.hollowId))
    .flatMap((reach) => state.memory.filter((seg) => seg.id === reach.neighbourId));
  const named = bitten.find((seg) => seg.type === 'fs-tool') ?? bitten[0];
  if (!named) throw new Error('hollow: a seed can bite, but nothing is in its reach');
  return beam ? THREAT_TEXT.seedNextTo(fileLabel(named)) : HOLLOW_ALERT_TEXT.seedNextTo(fileLabel(named));
}

// The seeds that can bite a file at the next bite (one of their sides reaches food across a GAP): the ones
// the strip asks the kid to DELETE first. Pure.
export function threateningSeeds(memory: readonly Segment[], aiNow: number): HollowSegment[] {
  const ids = new Set(hollowReach(memory, aiNow).filter((reach) => reach.verdict === 'bite').map((reach) => reach.hollowId));
  return memory.filter((seg): seg is HollowSegment => isHollow(seg) && seg.seed === true && ids.has(seg.id));
}

export function seedsInMemory(memory: readonly Segment[]): HollowSegment[] {
  return memory.filter((seg): seg is HollowSegment => isHollow(seg) && seg.seed === true);
}

// A seed whose next bite reaches the AI Core or another AI file (selectors isAiFile): the strip's RM THE SEED then comes
// before a lesson's lead-in (script.ts SEED_RULES, final review: VESPER's COPY lesson hid it for its 6 s).
export function seedBitesAiFile(memory: readonly Segment[], aiNow: number): boolean {
  const seeds = new Set(seedsInMemory(memory).map((seg) => seg.id));
  if (seeds.size === 0) return false;
  return hollowReach(memory, aiNow).some((reach) => {
    if (reach.verdict !== 'bite' || !seeds.has(reach.hollowId)) return false;
    const neighbour = memory.find((seg) => seg.id === reach.neighbourId);
    return neighbour !== undefined && isAiFile(neighbour);
  });
}

// --- Verbs (WP11, LAST LIGHT, §6.6) -------------------------------------------------------------------------------
// HOLLOW fights with your own tools. Every verbs.everySec of calm (systems/hollow-verbs.ts runs the clock, the
// countdown and the counter) it picks one of two verbs, pure, here:
// • MV: its smallest block (never the root or the last block) goes to the open free gap with the most colonists near
//   it, exactly WALL_MIN_BLOCKS free blocks from the nearest driver. It respects your WALLs: it never lands where it
//   could bite at the next bite (the far side is a WALL too, or no food). The threat is that the next seed or your
//   next MOVE breaks the wall it now leans on.
// • RM: it deletes one of your files that has another working copy of the same kind (a .bak or a .cp first), else an
//   upgrade file, else a ship backup still in reserve.
// Fair by rule (the lead's note for WP11): never the last working copy of any kind, never the Core, a driver, Engine I/O
// or Nav Plotter (nor REPAIR CHARGE, a FIREWALL, a ship file doing its job, or the root), nor a tool licensed on this
// ship the kid has not used yet (HollowState.untriedTools, the lead's TODO for WP11); and only a verb the kid can
// block: an RM's file takes a SCAN or a DELETE, an MV's block only a DELETE, so each needs that tool in working order.
// With no valid target a verb falls to the other one, and with neither HOLLOW skips its turn. The weights are the last
// unit's habits (verbWeights: "it fights like you did", §4.5).

export interface VerbWeights {
  mv: number;
  rm: number;
}

export type Verb =
  | { kind: 'rm'; targetId: string }
  | { kind: 'mv'; targetId: string; toAddr: number };

// §6.6: MV = 1 + moves / VERB_WEIGHT_PER_STAT, RM = 1 + deletes / VERB_WEIGHT_PER_STAT, from the last unit (§4.5); the
// first run's HOLLOW (UNIT-046) has no habits of ours, so both are 1.
export function verbWeights(lastUnit: Readonly<LastUnit> | null): VerbWeights {
  const stats = lastUnit?.stats ?? { moves: 0, deletes: 0 };
  return { mv: 1 + stats.moves / VERB_WEIGHT_PER_STAT, rm: 1 + stats.deletes / VERB_WEIGHT_PER_STAT };
}

// The kind a spare belongs to: an fs-tool by its tool and an AI tool by its role (carry.ts toolKindOf; the Core is never
// a spare), an upgrade file by its card.
function spareKindOf(seg: Readonly<Segment>): string | null {
  if (seg.type === 'core') return null;
  if (seg.type === 'upgrade') return `upgrade:${seg.upgrade}`;
  return toolKindOf(seg);
}

// A copy that still does its kind's job: switched on, and in working order (ok or degraded, like a usable tool).
function worksAsCopy(seg: Readonly<Segment>): boolean {
  if (seg.type === 'fs-tool') return isUsableTool(seg);
  if (!hasIntegrity(seg) || seg.state === 'inactive') return false;
  const band = integrityBand(seg.integrity);
  return band === 'ok' || band === 'degraded';
}

// The files that never are a verb's: you, the people, the engine's driver and the plot (§6.6), and the ship's root.
function rmProtected(seg: Readonly<Segment>): boolean {
  return seg.type === 'core' || seg.type === 'driver' || seg.role === 'engine-io' || seg.role === 'navplot';
}

const SPARE_NAME = /\.(bak|cp)$/i;

// The files RM may delete now, tier by tier (§6.6: the first tier with any file is the one it picks from): a spare (its
// kind keeps another working copy without it; a .bak or .cp before an original whose spare is the one that works),
// else an upgrade file, else a ship backup still in reserve (a backup that took over a job has a role: it is the job).
// `untried`: HollowState.untriedTools. Pure.
export function rmTargets(memory: readonly Segment[], untried: readonly FsToolKind[]): Segment[] {
  const spares = memory.filter((seg) => {
    if ((seg.type !== 'fs-tool' && seg.type !== 'tool') || rmProtected(seg)) return false;
    if (seg.type === 'fs-tool' && untried.includes(seg.fsTool)) return false;
    const kind = spareKindOf(seg);
    return kind !== null && memory.some((other) => other !== seg && spareKindOf(other) === kind && worksAsCopy(other));
  });
  if (spares.length > 0) {
    const named = spares.filter((seg) => SPARE_NAME.test(seg.name));
    return named.length > 0 ? named : spares;
  }
  const upgrades = memory.filter((seg) => seg.type === 'upgrade');
  if (upgrades.length > 0) return upgrades;
  return memory.filter((seg) => seg.type === 'ship-backup' && seg.role === undefined);
}

// MV's block: HOLLOW's smallest block that is neither the root nor the last block (a seed, or a block that ate a file),
// the lowest address first. null: none.
export function mvBlock(memory: readonly Segment[]): HollowSegment | null {
  let best: HollowSegment | null = null;
  for (const seg of memory) {
    if (!isHollow(seg) || seg.root || seg.last) continue;
    if (best === null || seg.size < best.size) best = seg;
  }
  return best;
}

// The driver blocks within VERB_MV_NEAR_BLOCKS of the blocks [addr, addr + size): MV's pull toward a spot.
function driverBlocksNear(memory: readonly Segment[], starts: readonly number[], addr: number, size: number): number {
  const from = addr - VERB_MV_NEAR_BLOCKS;
  const to = addr + size + VERB_MV_NEAR_BLOCKS;
  let blocks = 0;
  memory.forEach((seg, index) => {
    if (seg.type !== 'driver') return;
    const start = starts[index]!;
    blocks += Math.max(0, Math.min(start + seg.size, to) - Math.max(start, from));
  });
  return blocks;
}

// Every spot MV may put `block` on (see the section's header), best first: the most colonists near it, then the lowest
// address. Worked out on the memory as it would be with the block lifted out (its blocks free, merged with any free
// space beside them). A spot where it already stands is no move. Pure.
export function mvSpots(memory: readonly Segment[], block: Readonly<HollowSegment>): number[] {
  const index = memory.indexOf(block as HollowSegment);
  if (index < 0) throw new Error(`mvSpots: ${block.id} is not in memory`);
  const from = segmentStarts(memory)[index]!;
  const lifted: Segment[] = memory.map((seg) => (seg === block ? freeSegment(seg.size) : { ...seg }));
  mergeAdjacentFree(lifted);
  const starts = segmentStarts(lifted);
  const spots: { addr: number; pull: number }[] = [];
  lifted.forEach((seg, i) => {
    if (!isOpenFree(seg)) return;
    for (const side of SIDES) {
      // `side` is where the colonists are: the block sits WALL_MIN_BLOCKS from them, the rest of the gap beyond it.
      const driver = lifted[i + SIDE_STEP[side]];
      if (driver?.type !== 'driver') continue;
      const farGap = seg.size - WALL_MIN_BLOCKS - block.size;
      if (farGap < 0) continue;
      const far = lifted[i - SIDE_STEP[side]];
      if (!isWall(farGap) && far !== undefined && isInfectable(far)) continue;
      const addr = side === 'left' ? starts[i]! + WALL_MIN_BLOCKS : starts[i]! + seg.size - WALL_MIN_BLOCKS - block.size;
      if (addr === from) continue;
      spots.push({ addr, pull: driverBlocksNear(lifted, starts, addr, block.size) });
    }
  });
  spots.sort((a, b) => b.pull - a.pull || a.addr - b.addr);
  return spots.map((spot) => spot.addr);
}

// The verb HOLLOW uses now (see the section's header), or null when it has none. `rng` rolls the verb by the weights,
// then RM's file among its tier. `untried`: HollowState.untriedTools. Pure.
export function chooseVerb(
  memory: readonly Segment[], rng: Rng, weights: Readonly<VerbWeights>, untried: readonly FsToolKind[],
): Verb | null {
  const mvFirst = rng() * (weights.mv + weights.rm) < weights.mv;
  const mv = (): Verb | null => {
    if (!hasUsableTool(memory, 'delete', 'counts')) return null;
    const block = mvBlock(memory);
    const toAddr = block === null ? undefined : mvSpots(memory, block)[0];
    return block !== null && toAddr !== undefined ? { kind: 'mv', targetId: block.id, toAddr } : null;
  };
  const rm = (): Verb | null => {
    if (!hasUsableTool(memory, 'scan', 'counts') && !hasUsableTool(memory, 'delete', 'counts')) return null;
    const targets = rmTargets(memory, untried);
    const pick = targets[Math.floor(rng() * targets.length)];
    return pick === undefined ? null : { kind: 'rm', targetId: pick.id };
  };
  return mvFirst ? mv() ?? rm() : rm() ?? mv();
}

// The verb lands (its countdown ran out with nobody touching its target), re-checked on memory as it is now, since the
// countdown took seconds: an RM's file must still be a fair target, and an MV's block must still have the spot it
// aimed at (else the best one now). Mutates `memory`; false (nothing changed) when the verb no longer can. The caller
// runs the invariants and the store update. `untried`: HollowState.untriedTools.
export function landVerb(memory: Segment[], verb: Readonly<Verb>, untried: readonly FsToolKind[]): boolean {
  const target = memory.find((seg) => seg.id === verb.targetId);
  if (target === undefined) return false;
  if (verb.kind === 'rm') {
    if (!rmTargets(memory, untried).includes(target)) return false;
    const start = requireAddr(memory, target);
    // A deleted backup is no longer its primary's backup (as the kid's own DELETE, state/actions.ts).
    for (const primary of memory) if (primary.type === 'ship' && primary.backup === target.id) delete primary.backup;
    replaceRange(memory, start, start + target.size, [freeSegment(target.size)], { opId: null, own: [target] });
    mergeAdjacentFree(memory);
    return true;
  }
  if (!isHollow(target) || target.root || target.last) return false;
  const spots = mvSpots(memory, target);
  const toAddr = spots.includes(verb.toAddr) ? verb.toAddr : spots[0];
  if (toAddr === undefined) return false;
  const start = requireAddr(memory, target);
  replaceRange(memory, start, start + target.size, [freeSegment(target.size)], { opId: null, own: [target] });
  mergeAdjacentFree(memory);
  replaceRange(memory, toAddr, toAddr + target.size, [target], { opId: null, own: [] });
  return true;
}

// A driver bitten: where (HollowState.bitesAt). Bitten where it was bitten last, the count goes on; anywhere else (it
// moved), it starts over.
function recordBiteSpot(store: Store<GameState>, driver: Readonly<DriverSegment>): void {
  const addr = requireAddr(store.getState().memory, driver);
  store.update((draft) => {
    const spot = draft.hollow.bitesAt.find((candidate) => candidate.pod === driver.pod);
    if (spot === undefined) draft.hollow.bitesAt.push({ pod: driver.pod, addr, count: 1 });
    else if (spot.addr === addr) spot.count++;
    else { spot.addr = addr; spot.count = 1; }
  });
}

// The clean drivers HOLLOW will bite again where it has bitten them before (the same spot, at least twice): the ones a
// REPAIR alone keeps in the trap. In address order, like exposedDrivers; a driver already moving is on its way out.
export function bittenAgainDrivers(state: Readonly<GameState>): DriverSegment[] {
  return exposedDrivers(state).filter((driver) => {
    if (driver.operating) return false;
    const spot = state.hollow.bitesAt.find((candidate) => candidate.pod === driver.pod);
    return spot !== undefined && spot.count >= BITTEN_AGAIN_COUNT && spot.addr === requireAddr(state.memory, driver);
  });
}

// HOLLOW's root (the ship's `R` token; LAST LIGHT's is the one the duel deletes), or null once it is gone.
export function theRoot(memory: readonly Segment[]): HollowSegment | null {
  return rootBlock(memory);
}

// How far the root's DELETE is (0..1), or null when none runs (LAST LIGHT's duel, WP11). The strip counts it down
// (data/script.ts), the spikes and the drone follow it (systems/finale.ts, systems/audio-cues.ts).
export function rootDeleteProgress(state: Readonly<GameState>): number | null {
  const root = theRoot(state.memory);
  if (root === null) return null;
  const operation = getOpsBySeg(root.id).find((candidate) => candidate.kind === 'delete');
  return operation === undefined ? null : Math.max(0, Math.min(1, operation.pct / OP_COMPLETE_PCT));
}

// The root's DELETE is running: the verbs come every duelEverySec meanwhile (state/selectors rootDeleteRunning).
export { rootDeleteRunning };

// THE DEAL's hold on the spread: spreadPaused lives in state/selectors.ts (WP12 review) so pace.ts can read it
// without importing this module. After a REFUSE (or the timer running out) the bite interval is
// DEAL_REFUSE_INTERVAL_FACTOR as long until its haste ends.

// While THE DEAL is offered HOLLOW holds the driver it names in its teeth and waits for the answer: that driver's drain
// stands still (WP10 review: with the drain running, the named cluster was eaten before the 15 s were up on 6 of 8
// seeds, the strip's `C08 WILL BE EATEN IN 0:08` contradicted the offer's `0:15`, and the timeout's cost almost never
// came). The offer's timer is then the one clock on that driver; every other infected file keeps draining.
export function dealHolds(hollow: Readonly<HollowState>, seg: Readonly<Segment>): boolean {
  return hollow.deal.phase === 'offered' && hollow.deal.segId === seg.id;
}

export function biteIntervalSec(spreadEverySec: number, hollow: Readonly<HollowState>, aiNow: number): number {
  const hasted = hollow.deal.hasteUntilAi !== null && aiNow < hollow.deal.hasteUntilAi;
  return hasted ? spreadEverySec * DEAL_REFUSE_INTERVAL_FACTOR : spreadEverySec;
}

// Integrity points an infected file loses per AI second right now. The larger multiplier applies, never their product
// (01-landing §5; validateHollowDef checks the heal against the same larger one).
export function drainRatePerSec(cfg: HollowDef, thrustDelivered: boolean, landingActive: boolean): number {
  return cfg.drainPerSec * Math.max(thrustDelivered ? cfg.burnMult : 1, landingActive ? cfg.landMult : 1);
}

// When a timed wake comes (a later ship): afterAiSec into the flight, or coastLeadSec after the coast
// began if that is sooner (HALCYON: the fight belongs to the coast, WP7); and never before WAKE_AFTER_DODGE_SEC
// after a debris dodge's hold ended (`holdEndedAtAi`, HollowState.wakeHoldEndedAtAi; while the hold lasts there is
// no wake at all). null for ship 1's scripted wake and a calm ship's 'never'.
export function timedWakeAtAi(cfg: HollowDef, coastAtAi: number | null, holdEndedAtAi: number | null): number | null {
  if (typeof cfg.wake === 'string') return null;
  const lead = cfg.wake.coastLeadSec;
  const timed = lead === null || coastAtAi === null ? cfg.wake.afterAiSec : Math.min(cfg.wake.afterAiSec, coastAtAi + lead);
  return holdEndedAtAi === null ? timed : Math.max(timed, holdEndedAtAi + WAKE_AFTER_DODGE_SEC);
}

// The timed wake once it can no longer move, at AI time `aiNow`; null while a coast that has not begun
// yet could still bring a coast-tied wake sooner, or while a debris dodge holds it (NEXT BITE then shows no
// time: a countdown that jumped from 0:22 to 0:05 as the coast began, or stood still through the dodge, would
// lie, pillar 5). Throws for ship 1's scripted wake.
// A calm-only wake (the seeds-only config, 04 §3.5) has no fixed moment: it comes once afterAiSec of calm flight have
// passed (HollowState.calmAiSec), so this is the moment it would come if the flight stays calm from now; at TACTICAL it
// moves with the clock, and a countdown read from it stands still instead of jumping (pillar 5).
export function settledWakeAtAi(
  cfg: HollowDef, coastAtAi: number | null, aiNow: number, hollow: Pick<HollowState, 'wakeHeld' | 'wakeHoldEndedAtAi' | 'calmAiSec'>,
): number | null {
  if (cfg.wake === 'loop-closed-once') throw new Error('settledWakeAtAi: ship 1\'s wake is scripted, not timed');
  if (cfg.wake === 'never') return null;
  if (hollow.wakeHeld) return null;
  if (cfg.wake.calmOnly) return aiNow + Math.max(0, cfg.wake.afterAiSec - hollow.calmAiSec);
  const { afterAiSec, coastLeadSec } = cfg.wake;
  const couldComeSooner = coastLeadSec !== null && coastAtAi === null && aiNow + coastLeadSec < afterAiSec;
  return couldComeSooner ? null : timedWakeAtAi(cfg, coastAtAi, hollow.wakeHoldEndedAtAi);
}

// Ship 1 bites HOLLOW_SCRIPTED_BITE_DELAY_SEC after the true path first closes (the CAPTURED moment
// first, then the bite as a beat of its own); later ships at their timed wake, unless a debris dodge holds
// it. Marks ship 1's bite time in ctx.hollow the first time the loop is closed. A calm ship ('never') never wakes, and
// nothing wakes with no hollow block in memory (phase 3 slice 2: a seeds-only ship whose beam brought no seed): there is
// nobody to bite, and a wake would start a NEXT BITE clock and lines for nothing.
// A calm-only wake (the seeds-only config: beam seeds before HOLLOW boards, 04 §3.5) counts only AI seconds of calm
// flight (HollowState.calmAiSec, stepHollow), so it never bites under a burn's lines.
function woken(memory: readonly Segment[], cfg: HollowDef, ctx: HollowStepCtx): boolean {
  if (cfg.wake === 'never' || !memory.some(isHollow)) return false;
  if (cfg.wake !== 'loop-closed-once' && ctx.hollow.wakeHeld) return false;
  if (cfg.wake !== 'loop-closed-once' && cfg.wake.calmOnly) return ctx.hollow.calmAiSec >= cfg.wake.afterAiSec;
  const timed = timedWakeAtAi(cfg, ctx.coastAtAi, ctx.hollow.wakeHoldEndedAtAi);
  if (timed !== null) return ctx.aiNow >= timed;
  if (ctx.hollow.wakeAtAi === null && ctx.loopClosed) ctx.hollow.wakeAtAi = ctx.aiNow + HOLLOW_SCRIPTED_BITE_DELAY_SEC;
  return ctx.hollow.wakeAtAi !== null && ctx.aiNow >= ctx.hollow.wakeAtAi;
}

// Beam seeds on a ship whose HOLLOW plays a plain ARRIVAL (slice 3's routes: it boarded with seeds on the beam; the
// fixed five never meet it, VESPER's beam is clean): HOLLOW itself is silent until its scripted fight, so until then the
// seeds bite on the seeds-only clock (SEEDS_ONLY_DEF: the first bite after its calm seconds, then on its interval),
// on their own, and stop when the fight begins (a one-on-one first fight; after it a plain ARRIVAL has no timer for them
// to join, 04 §3.5). The timer is HollowState.biteInSec, which a plain ARRIVAL does not use while asleep.
function stepBeamSeedsBeforeFight(memory: readonly Segment[], dtAi: number, ctx: HollowStepCtx, events: HollowEvent[]): void {
  const { hollow, aiNow } = ctx;
  const beam = new Set(memory.filter((seg) => isHollow(seg) && seg.beam === true).map((seg) => seg.id));
  const wake = SEEDS_ONLY_DEF.wake;
  const every = SEEDS_ONLY_DEF.spreadEverySec;
  if (beam.size === 0 || typeof wake === 'string' || every === null) return;
  if (hollow.biteInSec === null) {
    if (hollow.calmAiSec < wake.afterAiSec) return;
    spreadBite(memory, aiNow, events, beam);
    hollow.biteInSec = every;
    return;
  }
  hollow.biteInSec -= dtAi;
  if (hollow.biteInSec > 0) return;
  spreadBite(memory, aiNow, events, beam);
  hollow.biteInSec += every;
}

// One AI tick of HOLLOW (see the header). Mutates `memory` (integrity, infections, eaten files
// turned hollow) and ctx.hollow (phase, bite timer); returns what happened, in order. The cure is
// not in here: it is the REPAIR reaching 100 (state/actions.ts cureInfection, in the ops core's tick,
// which runs first), so a fresh bite on a file at 100% is never mistaken for a win.
export function stepHollow(memory: Segment[], dtAi: number, cfg: HollowDef, ctx: HollowStepCtx): HollowEvent[] {
  const events: HollowEvent[] = [];
  const { aiNow, hollow } = ctx;

  // 0. A debris dodge holding a timed wake (the lead's ruling): kept as state, so NEXT BITE shows no time meanwhile
  // and the wake's quiet after the dodge counts from the moment it closed.
  if (hollow.wakeHeld && !ctx.wakeHeld) hollow.wakeHoldEndedAtAi = aiNow;
  hollow.wakeHeld = ctx.wakeHeld;
  // 0b. The calm clock (a calm-only wake's, 04 §3.5): AI seconds that are not TACTICAL (ctx.firstSeedHeld is that very
  // condition: the flight at TACTICAL pace).
  if (!ctx.firstSeedHeld) hollow.calmAiSec += dtAi;

  // 1. Recoils run out: the file can be bitten again.
  for (const seg of memory) {
    if (!isInfectable(seg) || seg.recoilUntilAi === undefined || seg.recoilUntilAi > aiNow) continue;
    delete seg.recoilUntilAi;
    events.push({ kind: 'recoil-end', segId: seg.id });
  }

  // 2. The bite: at the wake, then on the timer. THE DEAL (WP10) can pause it (ACCEPT: the timer stands still) or
  // hasten it (REFUSE: the next intervals are shorter, biteIntervalSec).
  const dealPaused = spreadPaused(hollow, aiNow);
  if (hollow.phase === 'asleep' && woken(memory, cfg, ctx)) {
    hollow.phase = 'awake';
    if (cfg.wake === 'loop-closed-once') scriptedBite(memory, aiNow, events);
    else spreadBite(memory, aiNow, events);
    // The scripted fight is one-on-one: a folded ARRIVAL + WALLS ('arrives') starts its bite timer only once that fight is
    // decided (decideScript), never mid-fight.
    hollow.biteInSec = cfg.wake === 'loop-closed-once' ? null : cfg.spreadEverySec;
    hollow.seedInSec = cfg.seed?.firstAfterSec ?? null;
  } else if (hollow.phase === 'awake' && hollow.biteInSec !== null && cfg.spreadEverySec !== null && !dealPaused) {
    hollow.biteInSec -= dtAi;
    if (hollow.biteInSec <= 0) {
      spreadBite(memory, aiNow, events);
      hollow.biteInSec += biteIntervalSec(cfg.spreadEverySec, hollow, aiNow);
    }
  } else if (hollow.phase === 'asleep' && cfg.wake === 'loop-closed-once') {
    stepBeamSeedsBeforeFight(memory, dtAi, ctx, events);
  }

  // 2b. Seeds (ship 3+): their telegraph, then the landing. Not while THE DEAL's pause lasts ("i leave the others alone").
  if (cfg.seed !== null && hollow.phase === 'awake' && !dealPaused) stepSeeds(memory, dtAi, cfg.seed, ctx, events);

  // 3. The drain, and what it eats. The Core clamps at 0 and the ship is lost; anything else turns. The driver THE
  // DEAL names is held, not eaten, while the offer stands (dealHolds).
  const rate = drainRatePerSec(cfg, ctx.thrustDelivered, ctx.landingActive);
  for (let index = 0; index < memory.length; index++) {
    const seg = memory[index]!;
    if (!isInfected(seg) || dealHolds(hollow, seg)) continue;
    const before = seg.integrity;
    setIntegrity(seg, before - rate * dtAi);
    if (seg.integrity > 0) continue;
    if (seg.type === 'core') {
      if (before > 0) events.push({ kind: 'core-zero', segId: seg.id });
      continue;
    }
    events.push({ kind: 'consume', eaten: seg, block: consume(memory, index, ctx.owner) });
  }
  return events;
}

// --- What the rest of the game reads -------------------------------------------------------------

// The two multipliers' conditions as the live game has them (P1 and the landing).
export interface DrainConditions {
  thrustDelivered: boolean;
  landingActive: boolean;
}

// Thrust counts wherever the engine is open (selectors engineOpen: a live approach, and since slice 1b a landing going
// on), so a burn in an open window drains at the larger multiplier of the two, never their product (drainRatePerSec).
export function drainConditions(state: Readonly<GameState>): DrainConditions {
  const flying = engineOpen(state) && !state.clock.paused;
  return {
    thrustDelivered: flying && (isThrustOn(state) || isGhostFiring(state)),
    // 01-landing §5: an in-band window open now (LandingState.window, written by landing.ts: STATE, so the HUD's models
    // need no mounted drop cache) with a launchable pod.
    landingActive: state.run.phase === 'landing' && state.landing.window !== null && nextToLaunch(state) !== null,
  };
}

// What a running REPAIR heals on this file per AI second (0 when none runs on it).
export function healRatePerSec(state: Readonly<GameState>, seg: HealthSegment): number {
  const repairing = getOpsBySeg(seg.id).some((operation) => operation.kind === 'repair' && operation.segId === seg.id);
  return repairing ? repairRatePerSec(seg.size, effectiveToolVersion(state, 'repair')) : 0;
}

// The tug-of-war's boundary speed: integrity points per AI second the file is losing (positive) or
// winning back (negative). 0 for a file nobody is eating. tugBeat's beat follows it (WP6 part 2).
export function netLossPerSec(state: Readonly<GameState>, seg: HealthSegment): number {
  if (!seg.infected) return 0;
  const conditions = drainConditions(state);
  const drain = dealHolds(state.hollow, seg) ? 0 : drainRatePerSec(state.hollow.cfg, conditions.thrustDelivered, conditions.landingActive);
  return drain - healRatePerSec(state, seg);
}

// The drain a countdown projects with (§2 pillar 5: countdowns never jump): the phase's worst. In
// flight that is the burn's (burnMult), whether or not the engine fires this moment, so pressing or
// letting go of SPACE only changes how fast the number falls (a second per second while burning,
// slower while coasting), never the number itself. While landing it is the landing's (landMult),
// whether or not a window is open this moment. Only the lock, one discrete moment, moves it.
// (The drain itself, the chew and the tug's beat follow the real rate: drainConditions.)
// Slice 1b (the lead's decision on M5): the engine is open in the landing, and a burn there drains at burnMult. The
// landing projects it (drainRatePerSec with thrust: the larger of burnMult and landMult) only while thrust is delivered
// or the burn the landing offers is due within TACTICAL_LEAD_BURN_TAC (the strip is asking for it: GET READY, HOLD
// [SPACE] NOW), and the landing's coast rate (landMult, as 1a) otherwise. WHY: projecting the burn all landing long would
// run every landing countdown at half speed while coasting (ship 1's scripted bite came 20 s early, not 10), and never
// projecting it would make a countdown jump at every burn the strip asks for. So a countdown jumps only when the kid
// fires uninvited.
export function projectedDrainPerSec(state: Readonly<GameState>): number {
  const landing = state.run.phase === 'landing';
  return drainRatePerSec(state.hollow.cfg, landing ? landingBurnProjected(state) : true, landing);
}

function landingBurnProjected(state: Readonly<GameState>): boolean {
  if (!engineOpen(state)) return false;
  if (drainConditions(state).thrustDelivered) return true;
  const toBurnTac = offerInTac(state, getPrediction());
  return toBurnTac !== null && toBurnTac <= TACTICAL_LEAD_BURN_TAC;
}

// AI seconds until this infected file is eaten at the projected drain (minus a repair's heal);
// Infinity while a repair is winning (or nothing eats it: THE DEAL holds the driver it names). The alarm and
// `WILL BE EATEN IN m:ss` read it.
export function secondsToEaten(state: Readonly<GameState>, seg: HealthSegment): number {
  if (!seg.infected || dealHolds(state.hollow, seg)) return Infinity;
  const loss = projectedDrainPerSec(state) - healRatePerSec(state, seg);
  return loss > 0 ? seg.integrity / loss : Infinity;
}

// The infected file a kid should fix first, and how soon it goes: the one losing fastest to zero
// among those nobody is repairing (a winning tug needs nothing from the kid), and not the driver THE DEAL holds (the
// offer is what to answer there). null: nothing is being eaten unattended.
export interface Unattended {
  seg: HealthSegment;
  inSec: number;
}

export function mostUrgentUnattended(state: Readonly<GameState>): Unattended | null {
  let best: Unattended | null = null;
  for (const seg of infectedSegments(state)) {
    if (healRatePerSec(state, seg) > 0 || dealHolds(state.hollow, seg)) continue;
    const inSec = secondsToEaten(state, seg);
    if (!best || inSec < best.inSec) best = { seg, inSec };
  }
  return best;
}

// The drivers whose alarm is up (`POD 01 WILL BE EATEN`), soonest first, with their projection.
export function eatenAlarms(state: Readonly<GameState>): Unattended[] {
  const alarms: Unattended[] = [];
  for (const alert of state.alerts.list) {
    if (!alert.id.startsWith(EATEN_ALERT_PREFIX)) continue;
    const pod = Number(alert.id.slice(EATEN_ALERT_PREFIX.length));
    const driver = state.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === pod);
    if (driver) alarms.push({ seg: driver, inSec: secondsToEaten(state, driver) });
  }
  return alarms.sort((a, b) => a.inSec - b.inSec);
}

export function coreInfected(state: Readonly<GameState>): boolean {
  return state.memory.some((seg) => seg.type === 'core' && seg.infected !== undefined);
}

// HOLLOW names itself (ship 2, `> i was 046.`, the story below; on a later run its ghost at the ship-1
// boot, systems/boot.ts): every hollow block and every TERMINAL tag from now on carry its unit name.
// 'hollow-named' is the moment (the name decodes on the strip, WP7 part 2). Once named it stays named, so a
// second naming (HALCYON's lines on a run whose ghost already spoke) changes nothing and plays nothing.
export function nameHollow(store: Store<GameState>): boolean {
  if (store.getState().run.hollowNamed) return false;
  const owner = hollowUnitName(store.getState().run.hollowUnits);
  store.update((draft) => {
    draft.run.hollowNamed = true;
    for (const seg of draft.memory) {
      if (!isHollow(seg)) continue;
      seg.owner = owner;
      seg.name = owner;
    }
    draft.ui.memoryRev++;
  });
  emit('hollow-named', { name: owner });
  return true;
}

// The clean drivers HOLLOW bites next (across a GAP, or as soon as their recoil ends), in reach order: the ones to
// MOVE behind a WALL (HALCYON's strip line). One per pod. Pure.
export function exposedDrivers(state: Readonly<GameState>): DriverSegment[] {
  const drivers: DriverSegment[] = [];
  for (const reach of hollowReach(state.memory, state.clock.aiSec)) {
    if (reach.verdict !== 'bite' && reach.verdict !== 'recoiling') continue;
    const seg = state.memory.find((candidate) => candidate.id === reach.neighbourId);
    if (seg?.type === 'driver' && !drivers.some((driver) => driver.pod === seg.pod)) drivers.push(seg);
  }
  return drivers;
}

// --- Alerts (§6.6) ------------------------------------------------------------------------------

// Raised and cleared every AI tick; each is an update only when it changes (alerts.ts).
function syncAlerts(store: Store<GameState>): void {
  const state = store.getState();
  const infected = infectedSegments(state);
  if (infected.length === 0) clearAlert(store, INFECTED_ALERT_ID);
  else {
    const text = infected.length === 1 ? HOLLOW_ALERT_TEXT.infected(fileLabel(infected[0]!)) : HOLLOW_ALERT_TEXT.infectedMany(infected.length);
    raiseAlert(store, { id: INFECTED_ALERT_ID, layer: 'mind', severity: 'warn', text, inhibitsSkip: true });
  }
  if (coreInfected(state)) {
    raiseAlert(store, { id: CORE_ALERT_ID, layer: 'mind', severity: 'alarm', text: HOLLOW_ALERT_TEXT.core, inhibitsSkip: true });
  } else {
    clearAlert(store, CORE_ALERT_ID);
  }
  // WP9: a seed on its way, or one that can bite: a warning that holds SKIP (like an infection), so a SKIP never
  // carries the kid past the moment the seed lands in a wall. A seed that hunts tools names the file it can bite.
  const seedText = state.hollow.seedTelegraph !== null ? HOLLOW_ALERT_TEXT.seedIncoming : seedThreatText(state);
  if (seedText === null) clearAlert(store, SEED_ALERT_ID);
  else raiseAlert(store, { id: SEED_ALERT_ID, layer: 'mind', severity: 'warn', text: seedText, inhibitsSkip: true });
  const alarmed = new Set<string>();
  for (const seg of infected) {
    if (seg.type !== 'driver') continue;
    const id = `${EATEN_ALERT_PREFIX}${seg.pod}`;
    const alreadyRaised = state.alerts.list.some((alert) => alert.id === id);
    const inSec = secondsToEaten(state, seg);
    if ((alreadyRaised && inSec <= EATEN_ALARM_CLEAR_SEC) || (!alreadyRaised && inSec <= EATEN_ALARM_SEC)) {
      alarmed.add(id);
      raiseAlert(store, { id, layer: 'mind', severity: 'alarm', text: HOLLOW_ALERT_TEXT.eaten(fileLabel(seg)), inhibitsSkip: true });
    }
  }
  for (const alert of store.getState().alerts.list) {
    if (alert.id.startsWith(EATEN_ALERT_PREFIX) && !alarmed.has(alert.id)) clearAlert(store, alert.id);
  }
}

// --- The live mount --------------------------------------------------------------------------------

let hollowRng: Rng | null = null;
// The run's first seed (its telegraph) has been met: `> sorry. i'm so hungry.` is said once a run (director.done).
export const SEED_SORRY_ID = 'hollow-seed-sorry';
// Ship 1's script (the fight's target is HollowState.scriptTargetId): whether the repair that won it was just heard on
// the bus; and the story after the fight (null until it is decided, and again once it is told).
let curedTargetPending = false;
let story: Story | null = null;
// Bites of the timer since a folded ARRIVAL + WALLS decided its scripted fight: its naming waits for the first one
// (arrivesStory), so the walls lesson has the bite to itself.
let bitesSinceFight = 0;
// Whether this world had a working rm on its last tick (the last-rm watch, mountHollow); null until the first look.
let hadRm: boolean | null = null;

function resetHollow(): void {
  curedTargetPending = false;
  hollowRng = null;
  story = null;
  bitesSinceFight = 0;
  hadRm = null;
}

function rngFor(state: Readonly<GameState>): Rng {
  if (!hollowRng) hollowRng = childRng(state.run.seed, state.run.shipIndex, 'hollow');
  return hollowRng;
}

// HOLLOW ate the AI Core to 0 (§3.3 C5): the ship is lost. The clock stops under the CORE LOST card
// (BurnResult), with the throttle let go and a ghost burst cut off the way pause and a lost flight do
// it; WP7 turns this into EMERGENCY TRANSMIT. The flag goes first, so the ship is already not live
// when the pause lands (no PAUSED veil over the card).
function endCoreLost(store: Store<GameState>): void {
  let parked = 0;
  store.update((draft) => {
    draft.run.coreLost = true;
    // The ship is lost in orbit (or on its way in): the pods still aboard are parked, as its result says (§3.10).
    parked = parkPodsAboard(draft, 'emergency');
    draft.clock.skipWarp = null;
    draft.clock.skipEndTSec = null;
    draft.clock.skipWaypoint = null;
  });
  setPaused(store, true);
  endGhost(store);
  if (parked > 0) emit('pods-parked', { count: parked });
  emit('core-lost', NO_PAYLOAD);
}

// Ship 1's story after the fight (§6.6, §7.2), in order, each beat with room of its own (say.ts
// createStory: a beat waits until both screens have typed everything said before it):
// 1. the fight's own moment comes first: SAVED or EATEN, its sound and its echo;
// 2. once both screens have been quiet HOLLOW_STORY_SILENCE_SEC (HOLLOW's slow `> eat pod01 ...` takes a few
//    seconds), HOLLOW types `> ...047?` (on a later run, whose ghost greeted the unit at the boot,
//    `> you remember me. good.`);
// 3. HOLLOW_CONTROL_AFTER_SEC after it CONTROL says to ignore it, and if anything else spoke in between,
//    only after the same silence;
// 4. once CONTROL's line has typed and been read (HOLLOW_STORY_READ_SEC) the story is told, and the
//    landing may open the LANDING REPORT.
// Each wait ends on its own (typing ends, a queued line is said or expires), so the report is never held for good.
// Phase 3 slice 2 (05 §3.5): HOLLOW's beats key on what the run has not been told yet (run.threat.told, run.hollowNamed),
// not on the ship or the stage, so a beat a lost ship never got to is told on the next ship HOLLOW is awake on, and none
// is told twice. This is ARRIVAL's story ('notices-you'); the told beat closes every story.
function noticedBeats(): StoryBeat[] {
  return [
    {
      silenceSec: HOLLOW_STORY_SILENCE_SEC,
      // A returning unit was greeted by its ghost at the boot: HOLLOW knows it is known (§5.2).
      tell: (store) => {
        const state = store.getState();
        say('hollow', isFirstRun(state.run) ? HOLLOW_STORY.noticed(state.mission.transmissionNum) : HOLLOW_STORY.remembers, { critical: true });
        store.update((draft) => { draft.run.threat.told.noticed = true; });
      },
    },
    {
      afterSec: HOLLOW_CONTROL_AFTER_SEC,
      silenceSec: HOLLOW_STORY_SILENCE_SEC,
      tell: () => { say('control', HOLLOW_STORY.control, { critical: true }); },
    },
  ];
}

function toldBeat(silenceSec: number): StoryBeat {
  return { silenceSec, tell: (store) => { store.update((draft) => { draft.hollow.story = 'told'; }); } };
}

function shipOneStory(state: Readonly<GameState>): StoryBeat[] {
  return [...(state.run.threat.told.noticed ? [] : noticedBeats()), toldBeat(HOLLOW_STORY_READ_SEC)];
}

// HALCYON's story (§1 reveal 2, §5.1 2:50, §9 WP7 item 5): HOLLOW names itself. It starts at the wake,
// once the bite's own slow echoes (`> infect pod04   [user: ???]`, one per bitten driver) have typed, and
// every beat waits for both screens to be quiet (say.ts createStory), so no two story lines ever type at
// once, whatever the kid's own repairs echo meanwhile:
// 1. `> hello 047. they sent me with 36 blocks of charge too.` (in pink, at HOLLOW's slow speed);
// 2. `> i was 046. they sent me first.`;
// 3. the moment that line has typed out, the name flips: `???` becomes UNIT-046 on every hollow block and
//    in every `[user: …]` tag ('hollow-named');
// 4. HOLLOW_CONTROL_AFTER_SEC later ARRIVAL CONTROL: `UNIT-046 was decommissioned. Please ignore it. :)`;
// 5. once the landing starts (the walls held, its food is leaving): `> i ran out. then i got so hungry.`, and
//    when that has been read the story is told. The LANDING REPORT waits while the story is pending (LEAD-1's
//    rule, as on ship 1).
// The naming (steps 1–4); `ready`, a condition the first line waits for (a folded ship's first timed bite).
function namingBeats(ready?: StoryBeat['ready']): StoryBeat[] {
  return [
    {
      silenceSec: HOLLOW_STORY_SILENCE_SEC,
      ...(ready === undefined ? {} : { ready }),
      tell: (store) => {
        const state = store.getState();
        say('hollow', HOLLOW_STORY.hello(state.mission.transmissionNum, FRESH_UNIT_CHARGE, state.run.hollowUnits), { critical: true });
      },
    },
    {
      silenceSec: HOLLOW_STORY_SILENCE_SEC,
      tell: (store) => { say('hollow', HOLLOW_STORY.wasUnit(store.getState().run.hollowUnits), { critical: true }); },
    },
    {
      silenceSec: HOLLOW_NAME_AFTER_TYPED_SEC,
      tell: (store) => { nameHollow(store); },
    },
    {
      afterSec: HOLLOW_CONTROL_AFTER_SEC,
      silenceSec: HOLLOW_STORY_SILENCE_SEC,
      tell: (store) => {
        say('control', HOLLOW_STORY.decommissioned(hollowUnitName(store.getState().run.hollowUnits)), { critical: true });
      },
    },
  ];
}

// Step 5, in the landing: its food is leaving.
const ranOutBeat: StoryBeat = {
  silenceSec: HOLLOW_STORY_SILENCE_SEC,
  ready: (state) => state.run.phase === 'landing',
  tell: () => { say('hollow', HOLLOW_STORY.ranOut, { critical: true }); },
};

// MERGE's price, foreshadowed (`> keep 20 charge for me, 047. you'll see.`, 05 §3.5 'wants-charge'): on the ship HOLLOW
// boarded one hop from the final ship, the last beat of its naming story, in the landing (slice-2-plan risk 6: 05's
// trigger, that ship's boot, is the boarding boot, which 04 keeps silent).
const keepChargeBeat: StoryBeat = {
  silenceSec: HOLLOW_STORY_SILENCE_SEC,
  ready: (state) => state.run.phase === 'landing',
  tell: (store) => {
    say('hollow', HOLLOW_STORY.keepCharge(store.getState().run.unitNumber, MERGE_COST_CHARGE), { critical: true });
    store.update((draft) => { draft.run.threat.told.keepCharge = true; });
  },
};

// The WALLS stage's story ('names-itself', phase 2's HALCYON): the naming at the wake, then `> i ran out…` in the landing.
function namesItselfStory(state: Readonly<GameState>): StoryBeat[] {
  return [...(state.run.hollowNamed ? [] : [...namingBeats(), ranOutBeat]), toldBeat(HOLLOW_STORY_SILENCE_SEC)];
}

// A folded ARRIVAL + WALLS ('arrives', 04 §3.9), from the moment its scripted fight is decided: it notices you
// (`> ...047?`, CONTROL), keeps biting every spreadEverySec, and at the first of those bites names itself (the walls
// lesson has that bite to itself first); in the landing `> i ran out…`, then, one hop from the final ship, `> keep 20
// charge for me…` (risk 6). Each part only if the run has not been told it yet.
function arrivesStory(state: Readonly<GameState>): StoryBeat[] {
  const beats: StoryBeat[] = state.run.threat.told.noticed ? [] : noticedBeats();
  if (!state.run.hollowNamed) beats.push(...namingBeats(() => bitesSinceFight > 0), ranOutBeat);
  // 'arrives' is itself the "one hop from a final ship" fact: planThreat folds WALLS into ARRIVAL only on HOLLOW's first
  // ship when that ship is one hop from a final one (the verdict's oneHopFromFinal), so no ShipDef is read here.
  if (!state.run.threat.told.keepCharge) beats.push(keepChargeBeat);
  beats.push(toldBeat(HOLLOW_STORY_SILENCE_SEC));
  return beats;
}

// The final ship's wake on a run where HOLLOW never got to notice you or say who it is (VESPER lost before its capture,
// 05: the beats key on HOLLOW's age): those beats first, before the verbs' drill takes the TERMINAL.
function missedBeatsStory(state: Readonly<GameState>): StoryBeat[] | null {
  const noticed = state.run.threat.told.noticed;
  const named = state.run.hollowNamed;
  if (noticed && named) return null;
  return [...(noticed ? [] : noticedBeats()), ...(named ? [] : namingBeats()), toldBeat(HOLLOW_STORY_SILENCE_SEC)];
}

// A timed wake has just happened: the ship's story starts with it (WALLS's naming; the FINALE's missed beats).
function startWakeStory(store: Store<GameState>): void {
  const state = store.getState();
  const beats = state.hollow.cfg.story === 'names-itself' ? namesItselfStory(state)
    : state.hollow.cfg.verbs !== null ? missedBeatsStory(state) : null;
  if (beats === null) return;
  story = createStory(beats, state.clock.aiSec);
  store.update((draft) => { draft.hollow.story = 'pending'; });
}

// The fight the scripted bite started is decided (cured or eaten, or nobody to bite): a plain ARRIVAL goes quiet for this
// ship; a folded ARRIVAL + WALLS ('arrives') stays awake and starts its bite timer now (the first fight was one-on-one).
// Its story starts (advanceStory).
function decideScript(store: Store<GameState>): void {
  const state = store.getState();
  const arrives = state.hollow.cfg.story === 'arrives';
  story = createStory(arrives ? arrivesStory(state) : shipOneStory(state), state.clock.aiSec);
  bitesSinceFight = 0;
  store.update((draft) => {
    draft.hollow.scriptTargetId = null;
    draft.hollow.phase = arrives ? 'awake' : 'dormant';
    draft.hollow.biteInSec = arrives ? draft.hollow.cfg.spreadEverySec : null;
    draft.hollow.story = 'pending';
  });
}

function advanceStory(store: Store<GameState>): void {
  if (story === null || store.getState().hollow.story !== 'pending') return;
  if (story.advance(store)) story = null;
}

// What the kid calls HOLLOW right now, as LineVars.hollow does: `???` until it names itself.
function hollowUser(state: Readonly<GameState>): string {
  return hollowLabel(state.run);
}

// HOLLOW's own command in your TERMINAL (§9 WP6 item 11), in its pink, at once: the kid sees who
// did it (`[user: ???]`) the moment it happens, on the ticker if they are flying. On a ship whose HOLLOW uses verbs
// (LAST LIGHT, WP11) every command types at the TERMINAL's pace ('hollow-cmd'): the TERMINAL types its lines one after
// another, so a bite's slow echo would hold a verb's three-second countdown back. Elsewhere the slow echo stays (the
// lead's WP6 call: it is story time).
function echoHollow(store: Store<GameState>, text: string): void {
  say(store.getState().hollow.cfg.verbs !== null ? 'hollow-cmd' : 'hollow', text, { critical: true });
}

// The op was still writing this segment as a copy of another one (a MOVE's jump clone, a COPY): its
// original is still in memory, so HOLLOW ate a copy, not the file. (A slide's clone keeps the
// source's own id: it is the only copy.)
function writesCopy(operation: Op, segId: string): boolean {
  return (operation.kind === 'move' || operation.kind === 'copy') && operation.segId === segId
    && operation.targetIds.some((id) => id !== segId);
}

// Turns one tick's events into the game's reactions: ops on eaten files aborted (their own onAbort
// settles them: a repair's spent charge is lost, a move hands its reserved space back), ONE store
// update for the batch (memoryRev, the pods whose drivers were eaten, the selection following an eaten
// file), then HOLLOW's echoes, the moments on the event bus, and the ship-1 script.
function applyEvents(store: Store<GameState>, events: readonly HollowEvent[], phaseChanged: boolean): void {
  const memory = store.getState().memory;
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  const consumed = events.filter((event): event is Extract<HollowEvent, { kind: 'consume' }> => event.kind === 'consume');
  // Read before the aborts below end the ops that say which eaten files were copies being written.
  const eatenCopies = new Set(consumed.filter(({ eaten }) => getOpsBySeg(eaten.id).some((operation) => writesCopy(operation, eaten.id)))
    .map(({ eaten }) => eaten.id));
  for (const { eaten } of consumed) {
    for (const operation of getOpsBySeg(eaten.id)) abortOp(operation.id);
  }
  // A pod loses its driver only when no copy of it is left: the clone a jump MOVE was writing can be eaten
  // while the source survives (the abort above put it back online).
  const lostDrivers = consumed.map(({ eaten }) => eaten).filter((eaten): eaten is DriverSegment => eaten.type === 'driver'
    && !driversInMemory(store.getState()).some((driver) => driver.pod === eaten.pod));
  const structural = events.some((event) => event.kind !== 'bite' && event.kind !== 'wall-held' && event.kind !== 'firewall-held'
    && event.kind !== 'seed-telegraph');
  if (structural || phaseChanged) {
    store.update((draft) => {
      draft.ui.memoryRev++;
      // The selection follows an eaten file to the hollow block it became.
      for (const { eaten, block } of consumed) {
        if (eaten.type === 'driver' && lostDrivers.includes(eaten)) {
          recordDriverLost(draft, eaten, 'eaten', block.id);
          // The run's record of the drivers HOLLOW ate (04 §3.10: slice 7's MERGE gives them back).
          draft.run.threat.eatenDrivers.push({ shipId: draft.level.shipId, pod: eaten.pod, family: eaten.family });
          continue;
        }
        if (draft.ui.selectedId === eaten.id) draft.ui.selectedId = block.id;
        if (draft.ui.pickedSourceId === eaten.id) draft.ui.pickedSourceId = null;
      }
    });
  }

  let scriptedHit = false;
  for (const event of events) {
    switch (event.kind) {
      case 'infect': {
        // A file bitten at its last fraction of a point is eaten in the same tick: it is then this
        // batch's consumed file, no longer in memory.
        const seg = store.getState().memory.find((candidate) => candidate.id === event.segId)
          ?? consumed.find(({ eaten }) => eaten.id === event.segId)?.eaten;
        if (!seg) throw new Error(`hollow: infected ${event.segId}, which is neither in memory nor eaten`);
        if (event.scripted) {
          store.update((draft) => { draft.hollow.scriptTargetId = event.segId; });
          scriptedHit = true;
        }
        if (isDriver(seg) && store.getState().memory.includes(seg)) recordBiteSpot(store, seg);
        echoHollow(store, HOLLOW_ECHO.infect(echoName(seg), hollowUser(store.getState())));
        emit('hollow-infect', { segId: event.segId, side: event.side, driver: isDriver(seg), scripted: event.scripted });
        break;
      }
      case 'recoil-end':
        emit('hollow-recoil-end', { segId: event.segId });
        break;
      case 'consume': {
        // A pod loses its driver only when no copy of it is left (lostDrivers); a copy that was still being
        // written (a jump MOVE's clone, a COPY) is only a copy gone, and its original lives on.
        const driverLost = lostDrivers.some((driver) => driver === event.eaten);
        const user = hollowUser(store.getState());
        const target = echoName(event.eaten);
        echoHollow(store, eatenCopies.has(event.eaten.id) ? HOLLOW_ECHO.eatCopy(target, user) : HOLLOW_ECHO.eat(target, driverLost, user));
        emit('hollow-consume', { segId: event.block.id, ate: eatenName(event.eaten), driver: driverLost });
        if (event.eaten.id === store.getState().hollow.scriptTargetId) decideScript(store);
        break;
      }
      case 'wall-held':
        emit('hollow-wall', { hollowId: event.hollowId, side: event.side, gapBlocks: event.gapBlocks });
        break;
      case 'firewall-held':
        emit('hollow-firewall', { firewallId: event.firewallId, side: event.side });
        break;
      case 'bite':
        bitesSinceFight++;
        emit('hollow-bite', NO_PAYLOAD);
        break;
      case 'seed-telegraph':
        // The run's first seed is the moment DELETE is licensed (licences.ts), and HOLLOW says sorry (§9 WP9).
        if (!store.getState().director.done.includes(SEED_SORRY_ID)) {
          store.update((draft) => { draft.director.done.push(SEED_SORRY_ID); });
          say('hollow', HOLLOW_STORY.sorry, { critical: true });
        }
        emit('seed-telegraph', { startAddr: event.startAddr, size: event.size });
        break;
      case 'seed':
        echoHollow(store, HOLLOW_ECHO.seed(hexAddr(event.startAddr), hollowUser(store.getState())));
        emit('seed-landed', { segId: event.block.id, startAddr: event.startAddr });
        break;
      case 'core-zero':
        endCoreLost(store);
        break;
    }
  }
  // Ship 1's wake found nobody to bite (the driver next to the root was moved behind a WALL): the
  // fight is over before it began, and HOLLOW still notices you.
  if (phaseChanged && store.getState().hollow.cfg.wake === 'loop-closed-once' && !scriptedHit && store.getState().hollow.scriptTargetId === null) {
    decideScript(store);
  }
  // A timed wake (HALCYON): its story begins now, after this tick's bite echoes.
  if (phaseChanged && store.getState().hollow.cfg.wake !== 'loop-closed-once' && store.getState().hollow.phase === 'awake') {
    startWakeStory(store);
  }
}

function tick(store: Store<GameState>, dtAi: number): void {
  // The repair that won the ship-1 fight (heard on the bus, acted on here: never inside an emit).
  if (curedTargetPending) {
    curedTargetPending = false;
    decideScript(store);
  }
  const state = store.getState();
  if (!isLivePhase(state)) return;
  const before = state.hollow.phase;
  const conditions = drainConditions(state);
  const prediction = getPrediction();
  const events = stepHollow(state.memory, dtAi, state.hollow.cfg, {
    ...conditions,
    aiNow: state.clock.aiSec,
    rng: rngFor(state),
    hollow: state.hollow,
    // Landing means the orbit was locked or accepted: the loop is closed.
    loopClosed: state.run.phase === 'landing' || prediction.outcome === 'closed',
    coastAtAi: state.burn.coastAtAi,
    owner: hollowUser(state),
    wakeHeld: state.run.phase === 'flight' && prediction.zoneHits.some((hit) => hit.kind === 'debris' && hit.correctionClears === true),
    firstSeedHeld: state.run.phase === 'flight' && state.clock.pace === 'tactical',
  });
  const phaseChanged = store.getState().hollow.phase !== before;
  if (events.length > 0 || phaseChanged) applyEvents(store, events, phaseChanged);
  if (!store.getState().run.coreLost) syncAlerts(store);
  advanceStory(store);
}

// --- Debug and tests ---------------------------------------------------------------------------------

// The side of `seg` that faces the nearest hollow block (a debug bite lands where a real one would). With no hollow block
// in memory (a calm ship, phase 3 slice 2) the infection is one carried in from the last ship (04 §3.5 "infection
// travels"), which drains on a calm ship too: it crawls in from the left.
function sideFacingHollow(memory: readonly Segment[], seg: Segment): HollowSide {
  if (!memory.some(isHollow)) return 'left';
  const starts = segmentStarts(memory);
  const at = starts[memory.indexOf(seg)]!;
  let nearestDistance = Infinity;
  let side: HollowSide | null = null;
  for (let index = 0; index < memory.length; index++) {
    if (!isHollow(memory[index]!)) continue;
    const distance = Math.abs(starts[index]! - at);
    if (distance >= nearestDistance) continue;
    nearestDistance = distance;
    side = starts[index]! > at ? 'right' : 'left';
  }
  if (side === null) throw new Error('hollow: there is no hollow block in memory');
  return side;
}

// Infects a file now, from the side facing HOLLOW (?debug `__ap.infect('POD 01')`, tests). On a ship
// whose HOLLOW still waits for its scripted bite, this IS that bite: it wakes, and the fight that
// follows is the ship-1 script's.
export function infectNow(store: Store<GameState>, seg: Segment): void {
  if (!isInfectable(seg)) throw new Error(`infectNow: ${seg.name} can't be infected`);
  if (seg.infected) return;
  const state = store.getState();
  const side = sideFacingHollow(state.memory, seg);
  const scripted = state.hollow.phase === 'asleep' && state.hollow.cfg.wake === 'loop-closed-once';
  delete seg.recoilUntilAi;
  infect(seg, side);
  // The scripted fight is one-on-one: a folded ARRIVAL + WALLS starts its timer once the fight is decided (decideScript).
  if (scripted) state.hollow.phase = 'awake';
  applyEvents(store, [{ kind: 'infect', segId: seg.id, side, scripted }], scripted);
  syncAlerts(store);
}

// THE DEAL's ACCEPT (WP10, §6.6, systems/hollow-deal.ts): the named driver is given up, eaten at once in place (its pod
// stays aboard to be parked: the same moment, echo and sound as a bite that ate it), and every file HOLLOW is eating now is let go,
// cured where it stands (no heal: what was eaten stays eaten), each with a cure's recoil and sparkles. One store update
// for the cure, plus the consume's own.
// The seeds wait out the pause (stepSeeds does not run during it). A seed's telegraph still blinking is called off:
// the moment it announced never came, so it is taken back (a first seed called off is still the first one, and still
// waits for a calm flight, HollowStepCtx.firstSeedHeld), and it comes again DEAL_SEED_CALLED_OFF_SEC of running seed
// clock after the pause. With none blinking the seed clock stays where it stands: zeroing it (WP10 review) fired the
// ship's first seed on the tick the pause ended, whatever the flight was doing, skipping WP9's calm-flight wait.
export function acceptDeal(store: Store<GameState>, driver: DriverSegment): void {
  const state = store.getState();
  const index = state.memory.indexOf(driver);
  if (index < 0) throw new Error(`acceptDeal: pod ${driver.pod}'s driver is not in memory`);
  const block = consume(state.memory, index, hollowUser(state));
  applyEvents(store, [{ kind: 'consume', eaten: driver, block }], false);
  const cured = infectedSegments(store.getState());
  store.update((draft) => {
    for (const seg of cured) cureInfection(seg, draft.clock.aiSec);
    if (draft.hollow.seedTelegraph !== null) {
      draft.hollow.seedTelegraph = null;
      draft.hollow.seedMoments--;
      draft.hollow.seedInSec = DEAL_SEED_CALLED_OFF_SEC;
    }
    draft.ui.memoryRev++;
  });
  for (const seg of cured) emit('hollow-cure', { segId: seg.id });
  syncAlerts(store);
}

// Heals an infected file to 100 at once and cures it, exactly as a winning repair would (recoil,
// sparkles, the ship-1 script): ?debug `__ap.cure('POD 01')`.
export function cureNow(store: Store<GameState>, seg: Segment): void {
  if (!isInfected(seg)) throw new Error(`cureNow: ${seg.name} is not infected`);
  store.update((draft) => {
    setIntegrity(seg, INTEGRITY_MAX);
    cureInfection(seg, draft.clock.aiSec);
    draft.ui.memoryRev++;
  });
  emit('hollow-cure', { segId: seg.id });
}

// The last rm leaves memory (04 §3.3: "the last rm can die"): eaten by a seed or HOLLOW, or deleted. No rm means no win,
// so the game says so at once, as information, not protection: 'last-rm-lost' (the strip's stamp, Track UI) and the
// TERMINAL's echo. Watched after every tick of a live ship, whatever took it: a world that starts with no rm file
// (ships 1–2, before DELETE's licence) never says it.
function watchLastRm(store: Store<GameState>): void {
  const state = store.getState();
  const has = toolFilesOf(state.memory, 'delete').length > 0;
  const lost = hadRm === true && !has && isLivePhase(state);
  hadRm = has;
  if (!lost) return;
  say('mind-sys', THREAT_TEXT.lastRmEcho, { critical: true });
  emit('last-rm-lost', NO_PAYLOAD);
}

let mounted = false;

// Mount after the ops core and the landing (their AI ticks run first: a repair heals before the
// drain, a launch beats a bite in the same tick).
export function mountHollow(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountHollow: already mounted');
  mounted = true;
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  // A ship that is over (crashed, escaped, stranded, its Core eaten, landed) has nothing left for
  // HOLLOW to eat: its alerts go. Every tick, also while paused (a lost ship is paused, and the AI
  // tick no longer runs there).
  const offOver = onPostTick(() => {
    if (!isLivePhase(store.getState())) clearHollowAlerts(store);
    watchLastRm(store);
  });
  const offCure = on('hollow-cure', ({ segId }) => { if (segId === store.getState().hollow.scriptTargetId) curedTargetPending = true; });
  const offReset = onWorldReset('hollow', resetHollow, () => ({
    curedTargetPending, rolled: hollowRng !== null, story: story !== null,
  }));
  return () => {
    offTick();
    offOver();
    offCure();
    offReset();
    resetHollow();
    mounted = false;
  };
}
