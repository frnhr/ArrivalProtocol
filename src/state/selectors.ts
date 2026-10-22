import type { GameState, VerbTelegraph, HollowState } from './schema';
import type {
  Segment, RedundancySegment, FsToolSegment, CoreSegment, ToolSegment, SkillSegment, SegmentState, SegmentRole,
  SoulSegment, SegmentType, HollowSegment, Infection, UpgradeSegment, UpgradeKind, FirewallSegment,
} from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import {
  CORE_LOW_INTEGRITY, CORE_LOW_THREADS, BAND_OK_MIN, BAND_DEGRADED_MIN, BAND_FAILING_MIN, CORRUPTION_STEP,
  INTEGRITY_MAX, SOUL_WAKE_INTACT_MIN, REVEAL_LINE_AT_SEC,
} from '@data/tuning';
import type { ClusterOutcome } from './schema';

// THE DEAL's hold on the spread (WP10, §6.6): after an ACCEPT neither the bite timer nor the seeds run until its pause
// ends. It lives here, a leaf module, rather than in hollow.ts (WP12 review): pace.ts needs it, and pace → hollow closed
// an import cycle (guidance → pace → hollow → printer → script → flight-controls → guidance) in which flight-controls and
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

// --- Roles (§6.4) ------------------------------------------------------------------------------

// A segment that carries a health number (everything but free space, HOLLOW, REPAIR CHARGE and a
// FIREWALL, which is a wall, not something with health).
export type HealthSegment = Exclude<Segment, { type: 'free' | 'hollow' | 'redundancy' | 'firewall' }>;

export function hasIntegrity(seg: Segment): seg is HealthSegment {
  return 'integrity' in seg;
}

// --- HOLLOW (§6.6) -------------------------------------------------------------------------------

// What HOLLOW can bite: every file with a health number (the Core, your tools and skills, the
// filesystem tools, the ship's files, the colonists, the upgrade files you carry). Free space, other
// hollow, REPAIR CHARGE and a FIREWALL are not food: they stop the spread on that side (§6.6). A list,
// not "has an integrity", so a new file type has to choose.
const INFECTABLE_TYPES: ReadonlySet<SegmentType> = new Set<SegmentType>(['core', 'tool', 'skill', 'fs-tool', 'ship', 'ship-backup', 'soul', 'upgrade']);

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
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'skill' || seg.type === 'upgrade';
}

export function isFirewall(seg: Segment): seg is FirewallSegment {
  return seg.type === 'firewall';
}

// The carried upgrade files of one kind (FUEL TRIM, AUTOBURN.skl), in memory order: the effect
// readers (systems/capabilities.ts liveUpgrades) and the draft's "owned" count read this.
export function upgradeFiles(memory: readonly Segment[], kind: UpgradeKind): UpgradeSegment[] {
  return memory.filter((seg): seg is UpgradeSegment => seg.type === 'upgrade' && seg.upgrade === kind);
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

// What a strip line calls a file: a cluster by its code (C12, as the chips say), anything else by
// its name in capitals (ENGINE I/O, REPAIR.BAK).
export function fileLabel(seg: Segment): string {
  return seg.type === 'soul' ? seg.cluster : seg.name.toUpperCase();
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

// The segments REPAIR can heal: the AI's own files (Core, tools, skills, fs-tools, upgrade files) and
// the colonists once the archive is open (§6.5: no scan gate for souls). Ship files can't be healed
// (SWAP or DELETE them); REPAIR CHARGE is "repaired" only by v2's squeeze; a sealed cluster can't
// be reached at all; a FIREWALL has no health to heal.
export type RepairableSegment = CoreSegment | ToolSegment | SkillSegment | FsToolSegment | SoulSegment | UpgradeSegment;

export function isRepairable(seg: Segment): seg is RepairableSegment {
  if (seg.type === 'soul') return !seg.sealed;
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'skill' || seg.type === 'fs-tool' || seg.type === 'upgrade';
}

// --- Souls (§6.7) --------------------------------------------------------------------------------

export function isSoul(seg: Segment): seg is SoulSegment {
  return seg.type === 'soul';
}

// The soul clusters still in memory, in address order, ONE PER CLUSTER. A MOVE that jumps to free
// space elsewhere keeps its source in memory (offline) until the clone is written (§6.5), so for
// the whole move one cluster is two `soul` segments with the same code; counting segments read
// `SOULS: 2,600 IN MEMORY` and `PRINTING n/13`. The first copy in address order stands for the
// cluster (both are the same people, and neither prints while it moves). The strip still draws
// both: it walks memory itself. Two copies outside a move are a bug (a cluster can't be copied).
export function soulsInMemory(state: Readonly<GameState>): SoulSegment[] {
  const byCode = new Map<string, SoulSegment>();
  for (const seg of state.memory) {
    if (!isSoul(seg)) continue;
    const twin = byCode.get(seg.cluster);
    if (!twin) { byCode.set(seg.cluster, seg); continue; }
    if (seg.state !== 'transferring' || twin.state !== 'transferring') {
      throw new Error(`soulsInMemory: two copies of ${seg.cluster} in memory outside a move`);
    }
  }
  return [...byCode.values()];
}

// Any cluster still behind the sealed slabs: the STASIS reveal has not happened (§1). On run 1 it
// holds SKIP (pace.ts) and the footer reads SOULS IN STASIS.
export function archiveSealed(state: Readonly<GameState>): boolean {
  return state.memory.some((seg) => seg.type === 'soul' && seg.sealed);
}

// A reveal is due or playing (systems/reveal.ts): its lines are about to land or landing.
export function revealUnderway(state: Readonly<GameState>): boolean {
  return state.souls.reveal.stage === 'pending' || state.souls.reveal.stage === 'playing';
}

// The reveal's lines have all landed and its crack is waiting for the kid to look at the mind
// (systems/reveal.ts holds it, at most REVEAL_VIEW_WAIT_MAX_SEC).
export function revealAwaitsView(state: Readonly<GameState>): boolean {
  return state.souls.reveal.stage === 'playing' && state.souls.reveal.lines.length >= REVEAL_LINE_AT_SEC.length
    && archiveSealed(state) && state.ui.mode !== 'memory';
}

// What a cluster would wake as if it printed now (§4.4, INSPECT's predicted outcome): intact at or
// above SOUL_WAKE_INTACT_MIN, with missing memories while any of it is left, not at all at 0.
export function soulOutcome(integrity: number): ClusterOutcome {
  if (integrity >= SOUL_WAKE_INTACT_MIN) return 'woke';
  return integrity > 0 ? 'gaps' : 'lost';
}

// The ship's colonists, counted (§4.4, §7.1 footer): still in memory, woke intact, woke with missing
// memories, did not wake. WOKE means one number everywhere (the lead's rule, WP7): `heads`, everyone who
// woke, intact or not. §4.4's half credit is only the run's SCORE (systems/run.ts runScore).
export interface SoulCounts {
  inMemory: number;
  intact: number;
  wokeWithGaps: number;
  heads: number;
  lost: number;
}

export function soulCounts(state: Readonly<GameState>): SoulCounts {
  const counts: SoulCounts = { inMemory: 0, intact: 0, wokeWithGaps: 0, heads: 0, lost: 0 };
  for (const soul of soulsInMemory(state)) counts.inMemory += soul.souls;
  for (const result of state.souls.results) {
    if (result.outcome === 'woke') counts.intact += result.souls;
    else if (result.outcome === 'gaps') counts.wokeWithGaps += result.souls;
    else counts.lost += result.souls;
  }
  counts.heads = counts.intact + counts.wokeWithGaps;
  return counts;
}

// Whether the kid may see this file's health (§3.2): a ship file only once scanned, a cluster only
// once the archive is open. Your own files are always visible. Every readout of damage (the strip,
// INSPECT, the stats, the sidebar counts) asks this, so a sealed C09 at 71% never leaks.
export function healthKnown(seg: Segment): boolean {
  if (seg.type === 'soul') return !seg.sealed;
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

// The whole seconds a verb's countdown shows (`> rm repair.bak ... 3`, the strip's `(3…)`, the `RM 3` badge, its tick):
// rounded up, and never 0 while it stands. One rule for every readout, so the TERMINAL and the badge never read 3 and 2.
export function verbSecondsLeft(verb: Readonly<VerbTelegraph>): number {
  return Math.max(1, Math.ceil(verb.leftSec));
}

// LAST LIGHT's finale is still on (WP11, systems/finale.ts): the duel, the choice still to be made, (part 2) the
// typed ending the choice brought, or UNRESOLVED's last line, until it has typed and been read. The WAKE REPORT waits
// for it (systems/printer.ts).
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
