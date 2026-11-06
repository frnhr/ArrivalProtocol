import type { GameState, VerbTelegraph, HollowState } from './schema';
import type {
  Segment, RedundancySegment, FsToolSegment, CoreSegment, ToolSegment, SkillFileSegment, SegmentState, SegmentRole,
  DriverSegment, SegmentType, HollowSegment, Infection, UpgradeSegment, UpgradeKind, FirewallSegment, ShipSegment,
} from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { SkillId } from '@/types/skill';
import { SKILL_IDS } from '@data/skills';
import {
  CORE_LOW_INTEGRITY, CORE_LOW_THREADS, BAND_OK_MIN, BAND_DEGRADED_MIN, BAND_FAILING_MIN, CORRUPTION_STEP,
  INTEGRITY_MAX, THRUST_CTRL_REPAIR_MAX,
} from '@data/tuning';
import { podCode } from '@data/landing-text';

// THE DEAL's hold on the spread (WP10, §6.6): after an ACCEPT neither the bite timer nor the seeds run until its pause
// ends. It lives here, a leaf module, rather than in hollow.ts (WP12 review): pace.ts needs it, and pace → hollow closed
// an import cycle (guidance → pace → hollow → printer → script → flight-controls → guidance; printer is landing.ts since
// phase 3) in which flight-controls and
// script read imported values at load, so an entry reaching the cycle through guidance or director threw at load.
export function spreadPaused(hollow: Readonly<HollowState>, aiNow: number): boolean {
  return hollow.deal.pauseUntilAi !== null && aiNow < hollow.deal.pauseUntilAi;
}

export function getSegmentById(state: Readonly<GameState>, id: string): Segment | undefined {
  return state.memory.find((seg) => seg.id === id);
}

// REPAIR CHARGE (the redundancy segment). There is only ever one: it can't be copied.
export function getRedundancy(state: Readonly<GameState>): RedundancySegment | undefined {
  return state.memory.find((seg): seg is RedundancySegment => seg.type === 'redundancy');
}

// REPAIR CHARGE left, in whole points (0 when the pool is gone).
export function chargeLeft(state: Readonly<GameState>): number {
  return getRedundancy(state)?.used ?? 0;
}

// The AI Core segment also carries the concurrency budget: the Core IS the compute substrate
// that runs both the player's consciousness and the tools (systems/ops-core.ts).
export function getAiCore(state: Readonly<GameState>): CoreSegment | undefined {
  return state.memory.find((seg): seg is CoreSegment => seg.type === 'core');
}

// How many ops the Core can run at once: its capacity, or CORE_LOW_THREADS while it is below
// CORE_LOW_INTEGRITY (§3.3 C5). The Core can never be deleted or moved, so a missing one is a bug.
export function coreThreads(state: Readonly<GameState>): number {
  const core = getAiCore(state);
  if (!core) throw new Error('coreThreads: the AI Core is missing from memory');
  return core.integrity < CORE_LOW_INTEGRITY ? Math.min(CORE_LOW_THREADS, core.capacity) : core.capacity;
}

// --- Health bands (§6.4) ---------------------------------------------------------------------

// A file's health in the four bands every readout, pip and capability uses.
export type HealthBand = 'ok' | 'degraded' | 'failing' | 'dead';

export function integrityBand(integrity: number): HealthBand {
  if (integrity >= BAND_OK_MIN) return 'ok';
  if (integrity >= BAND_DEGRADED_MIN) return 'degraded';
  if (integrity >= BAND_FAILING_MIN) return 'failing';
  return 'dead';
}

// A copy of a tool works while it is degraded or better: one bad copy of Repair and the .bak
// takes over.
export function isUsableTool(seg: FsToolSegment): boolean {
  const band = integrityBand(seg.integrity);
  return band === 'ok' || band === 'degraded';
}

// The fs-tool files of one kind (its copies included), whatever their health.
export function toolFilesOf(memory: readonly Segment[], kind: FsToolKind): FsToolSegment[] {
  return memory.filter((seg): seg is FsToolSegment => seg.type === 'fs-tool' && seg.fsTool === kind);
}

// A copy of the tool its chip can use now (WP12 review: one selector for what licences, hollow, script and guidance each
// wrote by hand, two of them as `hasWorkingTool`s that disagreed). `infected` says which question is asked:
// • 'counts': a copy being eaten still works until it is gone (HOLLOW's fairness, never the last working copy; the
//   strip's hints that send the kid to REPAIR);
// • 'excluded': only a copy that will last (a crossing eats an infected file on arrival: the REPAIR renewal).
export function hasUsableTool(memory: readonly Segment[], kind: FsToolKind, infected: 'counts' | 'excluded'): boolean {
  return toolFilesOf(memory, kind).some((seg) => isUsableTool(seg) && (infected === 'counts' || seg.infected === undefined));
}

// A SWAP the unit has aboard right now (slice 3b review: the ONE reading of "has Swap" that the ghost lessons, the no-Swap
// line, the ENGINE FAULT SKIP refusal and the repository's recommendation share): a usable Swap file in memory, a copy
// being eaten included (it works until it is gone, as the strip's tool hints count it). A licence alone is not a Swap
// (a seed may have eaten the file since), and a request on its way is not aboard yet.
export function swapAboard(state: Readonly<Pick<GameState, 'memory'>>): boolean {
  return hasUsableTool(state.memory, 'swap', 'counts');
}

// --- Roles (§6.4) ------------------------------------------------------------------------------

// A segment that carries a health number (everything but free space, HOLLOW, REPAIR CHARGE and a
// FIREWALL, which is a wall, not something with health).
export type HealthSegment = Exclude<Segment, { type: 'free' | 'hollow' | 'redundancy' | 'firewall' | 'log' }>;

export function hasIntegrity(seg: Segment): seg is HealthSegment {
  return 'integrity' in seg;
}

// --- HOLLOW (§6.6) -------------------------------------------------------------------------------

// What HOLLOW can bite: every file with a health number (the Core, your tools and skills, the
// filesystem tools, the ship's files, the pods' drivers, the upgrade files you carry). Free space, other
// hollow, REPAIR CHARGE and a FIREWALL are not food: they stop the spread on that side (§6.6). A list,
// not "has an integrity", so a new file type has to choose.
const INFECTABLE_TYPES: ReadonlySet<SegmentType> = new Set<SegmentType>(['core', 'tool', 'fs-tool', 'ship', 'ship-backup', 'driver', 'upgrade']);

export function isInfectable(seg: Segment): seg is HealthSegment {
  return INFECTABLE_TYPES.has(seg.type) && hasIntegrity(seg);
}

export function isHollow(seg: Segment): seg is HollowSegment {
  return seg.type === 'hollow';
}

// One of the ship's own files (rack A: the controllers, the reactor, STASIS…, and their backups). REPAIR can't heal
// them (SWAP or DELETE does), so HOLLOW reaching one is a chain the kid can only cut.
export function isShipFile(seg: Segment): boolean {
  return seg.type === 'ship' || seg.type === 'ship-backup';
}

// One of the unit's own files that is not a filesystem tool: the Core, the AI tools (Engine I/O, Sensor Interp…) and
// the carried skills and cards. Rack E holds them on arrival.
export function isAiFile(seg: Segment): boolean {
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'upgrade';
}

export function isFirewall(seg: Segment): seg is FirewallSegment {
  return seg.type === 'firewall';
}

// The carried upgrade files of one kind (FUEL TRIM, AUTOBURN.skl), in memory order: the effect
// readers (systems/capabilities.ts liveUpgrades) and the draft's "owned" count read this.
export function upgradeFiles(memory: readonly Segment[], kind: UpgradeKind): UpgradeSegment[] {
  return memory.filter((seg): seg is UpgradeSegment => seg.type === 'upgrade' && seg.upgrade === kind);
}

// A skill file (phase 3 slice 4; types/segment.ts SkillFileSegment): an upgrade file of a skill kind, with a version.
export function isSkillFile(seg: Segment): seg is SkillFileSegment {
  return seg.type === 'upgrade' && (SKILL_IDS as readonly string[]).includes(seg.upgrade);
}

// The skill files of one skill, whatever their health or state, in memory order (capabilities.ts skillLive picks the one
// that counts).
export function skillFilesOf(memory: readonly Segment[], id: SkillId): SkillFileSegment[] {
  return memory.filter((seg): seg is SkillFileSegment => isSkillFile(seg) && seg.upgrade === id);
}

// A file being eaten right now: its infection is set, so readers need no `!` on it. (A guard that
// narrowed to HealthSegment alone would make TypeScript read every clean file as `never` on the
// false branch.)
export type InfectedSegment = HealthSegment & { infected: Infection };

export function isInfected(seg: Segment): seg is InfectedSegment {
  return isInfectable(seg) && seg.infected !== undefined;
}

export function infectedSegments(state: Readonly<GameState>): InfectedSegment[] {
  return state.memory.filter(isInfected);
}

// Anything at all is being eaten (PRINT FAST waits for this to clear, §6.7).
export function anythingInfected(state: Readonly<GameState>): boolean {
  return state.memory.some(isInfected);
}

// What a strip line calls a file: a driver by its pod (POD 03, as the chips say), anything else by
// its name in capitals (ENGINE I/O, REPAIR.BAK).
export function fileLabel(seg: Segment): string {
  return seg.type === 'driver' ? podCode(seg.pod) : seg.name.toUpperCase();
}

// Every file with this role, in memory order (a copy or a swapped-in backup carries the role too).
export function filesWithRole(state: Readonly<GameState>, role: SegmentRole): Segment[] {
  return state.memory.filter((seg) => seg.role === role);
}

// The copy of a role that counts (§6.4): the live one (not inactive) with the highest integrity,
// or null when there is none. Game code finds files this way, never by id. REPAIR CHARGE has no
// integrity and only ever one copy.
export function getByRole(state: Readonly<GameState>, role: SegmentRole): Segment | null {
  let best: Segment | null = null;
  for (const seg of state.memory) {
    if (seg.role !== role) continue;
    if ('state' in seg && seg.state === 'inactive') continue;
    if (!best) { best = seg; continue; }
    const integrity = hasIntegrity(seg) ? seg.integrity : INTEGRITY_MAX;
    const bestIntegrity = hasIntegrity(best) ? best.integrity : INTEGRITY_MAX;
    if (integrity > bestIntegrity) best = seg;
  }
  return best;
}

// The best usable copy of an fs-tool kind: the highest version, so v2+ is picked over v1
// automatically. Tools are not consumed by use; the Core's threads limit how many ops run.
export function getFsTool(state: Readonly<GameState>, kind: FsToolKind): FsToolSegment | undefined {
  let best: FsToolSegment | undefined;
  for (const seg of state.memory) {
    if (seg.type !== 'fs-tool' || seg.fsTool !== kind || !isUsableTool(seg)) continue;
    if (!best || seg.version > best.version) best = seg;
  }
  return best;
}

// The version a held tool works at: the highest among the usable copies of its kind (bumping
// Repair.bak to v2 upgrades the Repair in your hand without re-picking it).
export function effectiveToolVersion(state: Readonly<GameState>, kind: FsToolKind): number {
  return getFsTool(state, kind)?.version ?? 1;
}

// The segments REPAIR can heal: the AI's own files (Core, tools, skills, fs-tools, upgrade files) and the pods'
// drivers (§6.5: no scan gate for them). Ship files can't be healed (SWAP or DELETE them); REPAIR CHARGE is "repaired"
// only by v2's squeeze; a FIREWALL has no health to heal.
export type RepairableSegment = CoreSegment | ToolSegment | FsToolSegment | DriverSegment | UpgradeSegment;

export function isRepairable(seg: Segment): seg is RepairableSegment {
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'fs-tool' || seg.type === 'upgrade' || seg.type === 'driver';
}

// Slice 3b (Fran's decision, the limping engine): on the arm REPAIR also heals Thrust Ctrl, the one ship file it may touch
// (SWAP to Thrust.alt, or a request for Swap, may be ships away). Every other ship file, and Thrust Ctrl on the classic
// world, keeps phase 2's rule: SWAP or DELETE it.
export function repairableShipFile(state: Readonly<Pick<GameState, 'run'>>, seg: Segment): seg is ShipSegment {
  return state.run.map.world === 'arm' && seg.type === 'ship' && seg.role === 'thrust-ctrl';
}

// How far REPAIR heals `seg`: to 100, except the arm's Thrust Ctrl, healed only to THRUST_CTRL_REPAIR_MAX unless HOLLOW is
// eating it (then the repair must reach 100 to win).
export function repairCeiling(state: Readonly<Pick<GameState, 'run'>>, seg: Segment): number {
  return repairableShipFile(state, seg) && seg.infected === undefined ? THRUST_CTRL_REPAIR_MAX : INTEGRITY_MAX;
}

// --- Pods and their drivers (01-landing §3.8) ----------------------------------------------------

export function isDriver(seg: Segment): seg is DriverSegment {
  return seg.type === 'driver';
}

// The phase that replaced printing: the orbit is locked or accepted and the pods are going down. Code asks this rather
// than comparing the phase literal, so the next phase change is one edit.
export function isLanding(state: Readonly<GameState>): boolean {
  return state.run.phase === 'landing';
}

// The engine answers the throttle (slice-1b-plan §1.4): during a live approach, and during a landing that has not ended
// (trims, GO LOWER, the 'lift' burn). Its readers: flight-controls' refusal (FLIGHT OVER / LANDING OVER), flight-hud's
// burn button, hollow's drain, flight-events' thrust and beeps, audio-cues' engine loop, orbit-sim. ACCEPT ORBIT, the lock
// hold, faults' FILE_FAULTS and closedIdleAiSec stay flight-only (status === 'approaching').
// In landing the ship must still be in orbit (locked or accepted): a crash or escape during the landing closes it at
// once, before endLandingLost writes ended = 'ship-lost'. Track ORBIT owns it; defined by the foundation, not read yet.
export function engineOpen(state: Readonly<GameState>): boolean {
  if (state.run.phase === 'flight') return state.burn.status === 'approaching';
  const inOrbit = state.burn.status === 'locked' || state.burn.status === 'accepted';
  return state.run.phase === 'landing' && state.landing.ended === null && inOrbit;
}

// The ghost bursts of the phase the ship is in (review M2): the landing counts its own (LandingState.ghostBursts), so its
// FIRST burst is a SKIP's stop and a TACTICAL moment as the flight's first is (pace skipLandsInSec, thrustHoldsTactical):
// the kid sees the engine fire by itself once in the landing, not only inside SKIPs. burn.ghostBursts is the ship's.
export function ghostBurstsThisPhase(state: Readonly<GameState>): number {
  return state.run.phase === 'landing' ? state.landing.ghostBursts : state.burn.ghostBursts;
}

// The drivers still in memory, in address order, ONE PER POD. A MOVE that jumps to free space elsewhere keeps its
// source in memory (offline) until the clone is written (§6.5), so for the whole move one driver is two segments with
// the same pod; counting segments would read one pod twice. The first copy in address order stands for the pod (both
// fly the same people, and neither launches while it moves). The strip still draws both: it walks memory itself. Two
// copies outside a move are a bug (a driver can't be copied).
export function driversInMemory(state: Readonly<GameState>): DriverSegment[] {
  const byPod = new Map<number, DriverSegment>();
  for (const seg of state.memory) {
    if (!isDriver(seg)) continue;
    const twin = byPod.get(seg.pod);
    if (!twin) { byPod.set(seg.pod, seg); continue; }
    if (seg.state !== 'transferring' || twin.state !== 'transferring') {
      throw new Error(`driversInMemory: two copies of pod ${seg.pod}'s driver in memory outside a move`);
    }
  }
  return [...byPod.values()];
}

// The ship's colonists by where their pod is (the footer, the mini-HUD, the LOST card): still aboard, falling, down
// (and of those, in an LZ with room), parked in orbit, gone with a ship that left orbit.
export interface ColonistCounts {
  aboard: number;
  falling: number;
  down: number;
  landedInLz: number;
  parked: number;
  notLaunched: number;
}

export function colonistCounts(state: Readonly<GameState>): ColonistCounts {
  const counts: ColonistCounts = { aboard: 0, falling: 0, down: 0, landedInLz: 0, parked: 0, notLaunched: 0 };
  for (const record of state.landing.pods) {
    switch (record.fate.kind) {
      case 'aboard': counts.aboard += record.colonists; break;
      case 'falling': counts.falling += record.colonists; break;
      case 'down':
        counts.down += record.colonists;
        if (record.fate.touchdown.place === 'lz') counts.landedInLz += record.colonists;
        break;
      case 'parked': counts.parked += record.colonists; break;
      case 'not-launched': counts.notLaunched += record.colonists; break;
      default: throw new Error(`colonistCounts: unknown fate '${String((record.fate as { kind: string }).kind)}'`);
    }
  }
  return counts;
}

// Whether the kid may see this file's health (§3.2): a ship file only once scanned. Your own files and the drivers are
// always visible. Every readout of damage (the strip, INSPECT, the stats, the sidebar counts) asks this.
export function healthKnown(seg: Segment): boolean {
  return 'scanned' in seg ? seg.scanned : true;
}

// The health word an integrity earns on the strip, from its band: ok reads intact, degraded
// partial, failing and dead corrupt.
export function integrityState(integrity: number): SegmentState {
  const band = integrityBand(integrity);
  if (band === 'ok') return 'intact';
  if (band === 'degraded') return 'partial';
  return 'corrupt';
}

// Integrity as a kid reads it: whole percent, rounded down, so 99.6 never shows as 100.
export function shownIntegrity(integrity: number): number {
  return Math.floor(integrity);
}

export function getFreeTotal(state: Readonly<GameState>): number {
  return state.memory
    .filter((seg) => seg.type === 'free')
    .reduce((sum, seg) => sum + seg.size, 0);
}

// Corruption is the AI Core's damage as 0..1, in steps of CORRUPTION_STEP (§3.3 C5). It drives
// the glitch overlay and the body filter. The Core is found by type: there is only one, and it
// can't be deleted or moved, so a missing one is a bug.
export function selectCorruption(state: Readonly<GameState>): number {
  const core = getAiCore(state);
  if (!core) throw new Error('selectCorruption: the AI Core is missing from memory');
  return quantizeCorruption((INTEGRITY_MAX - core.integrity) / INTEGRITY_MAX);
}

// The whole seconds a verb's countdown shows (`> unlink repair.bak ... 3`, the strip's `(3…)`, the `UNLINK 3` badge, its
// tick; from 4 on the ship's first verb): rounded up, and never 0 while it stands. One rule for every readout, so the
// TERMINAL and the badge never read 3 and 2.
export function verbSecondsLeft(verb: Readonly<VerbTelegraph>): number {
  return Math.max(1, Math.ceil(verb.leftSec));
}

// A REPAIR could still be started on something: a usable Repair file, and at least one point of REPAIR CHARGE. What
// "repairable" means for the landing (a driver below the failing band can launch some day only if a REPAIR can bring it
// back: landing-rules canEverLaunch) and for the root's duel (a broken Rm a REPAIR could bring back: rootDeletable).
export function repairPossible(state: Readonly<GameState>): boolean {
  return getFsTool(state, 'repair') !== undefined && chargeLeft(state) >= 1;
}

// HOLLOW's root (the ship's `R` token; LAST LIGHT's is the one the duel deletes), or null once it is gone.
export function rootBlock(memory: readonly Segment[]): HollowSegment | null {
  return memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.root) ?? null;
}

// The root's DELETE is running (LAST LIGHT's duel, WP11): read from the root's own `operating` flag, which every op sets
// on its target for as long as it runs (state/actions.ts), and only DELETE can target a hollow block
// (tool-targets.ts). A selector rather than an ops-core lookup, so the landing's pure guidance table reads it with no
// stateful import (systems/hollow.ts rootDeleteProgress keeps the op's own progress).
export function rootDeleteRunning(state: Readonly<GameState>): boolean {
  return rootBlock(state.memory)?.operating === true;
}

// Something can still delete the root: a working Rm, or an Rm a REPAIR can bring back (repairPossible).
export function rootDeletable(state: Readonly<GameState>): boolean {
  if (getFsTool(state, 'delete')) return true;
  const anyRm = state.memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete');
  return anyRm && repairPossible(state);
}

// Ship 1's scripted fight is still undecided (HollowState.scriptTargetId): the bitten file is in memory and neither
// cured nor eaten yet. The LANDING REPORT waits for it as for the story it starts (systems/landing.ts). A target that left
// memory some other way (it never can today: an infected file can't launch or move) does not hold the report for good.
export function scriptFightOpen(state: Readonly<GameState>): boolean {
  const id = state.hollow.scriptTargetId;
  return id !== null && state.memory.some((seg) => seg.id === id);
}

// LAST LIGHT's finale is still on (WP11, systems/finale.ts): the duel, the choice still to be made, (part 2) the
// typed ending the choice brought, or UNRESOLVED's last line, until it has typed and been read. The LANDING REPORT waits
// for it (systems/landing.ts).
export function finalePending(state: Readonly<GameState>): boolean {
  const { phase, ending, unresolvedUntilAi } = state.hollow.finale;
  if (phase === 'duel' || phase === 'choice') return true;
  if (phase === 'unresolved') return unresolvedUntilAi !== null && state.clock.aiSec < unresolvedUntilAi;
  return ending !== null && state.clock.aiSec < ending.untilAi;
}

// A corruption level (0..1) in CORRUPTION_STEP steps: the Core's, a glitch burst's (WP11), the MERGE floor's.
export function quantizeCorruption(level: number): number {
  const clamped = Math.max(0, Math.min(1, level));
  // Dividing by the whole number of steps keeps the levels exact (3 / 20, not 3 × 0.05).
  const stepsPerWhole = Math.round(1 / CORRUPTION_STEP);
  return Math.min(1, Math.round(clamped * stepsPerWhole) / stepsPerWhole);
}
