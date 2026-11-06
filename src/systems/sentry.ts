// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §4, §7.2).
//
// SENTRY.skl, the DEFENCE branch (03 §3.10; 04 §3.4–§3.6, K1–K3): a daemon that makes the unit's tools better against
// HOLLOW while it is live, and loses versions to damage like any skill (capabilities.ts skillLive: what it works as now).
// • v1 SIGHT: the boot names every disguised seed that rode in (`> ECC: cache.tmp IS A SEED · RACK D`, one 'sentry-seed'
//   line each, after the ECC seeds line), and a seed HOLLOW drops later in the ship is reported with its rack (`> SENTRY:
//   SOMETHING LANDED · RACK D`). Without SENTRY a SCAN unmasks a decoy (state/actions.ts actionScan): a power spike, never a
//   gate.
// • v2 QUICK RM: rm on a hollow block that is not the root takes half its time (state/actions.ts deleteSec; the root's duel
//   keeps its 12 s, plan R10), and DELETE can be aimed at HOLLOW's blinking seed outline (preemptSeed): the op holds a
//   thread from the click, and the seed is freed the moment it lands (systems/hollow.ts stepSeeds: `PRE-EMPTED`).
// • v3 FIREWALL: a fresh FIREWALL.sys is compiled at every boot while the unit carries fewer than FIREWALL_MAX_OWNED, at the
//   unit's install address (memory-ops unitInstallAddress), placed with MOVE as in phase 2 (the 'firewall' boot line,
//   after the charge). While v3 works the salvage's FIREWALL card is not dealt (systems/draft.ts firewallCompiler).
// No module-level state (plan §2.3): the pre-empt's thread is an ops-core reservation ('sentry-preempt'), released by a
// watcher once the outline is gone or no longer armed, and cleared by the world reset as every reservation is. DOM-free.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ArrivalSeed } from '@state/schema';
import type { FirewallSegment, HollowSegment, Segment } from '@/types/segment';
import type { EffectiveVersion } from '@/types/skill';
import { on, emit } from '@systems/events';
import { onPostTick } from '@systems/clock';
import { reserveThread, releaseThread } from '@systems/ops-core';
import { say } from '@systems/say';
import { skillLive } from '@systems/capabilities';
import { beamSeedTarget } from '@systems/beam-seeds';
import { unitInstallAddress, replaceRange, mergeAdjacentFree, assertMemoryInvariants, newSegId, segmentStarts } from '@systems/memory-ops';
import { getFsTool, isFirewall } from '@state/selectors';
import { isDisguised } from '@state/threat-selectors';
import { deleteSec } from '@state/actions';
import { rackOf, layoutOf } from '@data/memory';
import { SENTRY_TEXT } from '@data/threat-text';
import { TOOL_REFUSAL } from '@data/tool-text';
import { UPGRADE_FILE_TEXT } from '@data/upgrades';
import { IS_DEV } from '@/env';
import {
  FIREWALL_BLOCKS, FIREWALL_MAX_OWNED, SENTRY_FIREWALLS_PER_BOOT, SENTRY_SIGHT_VERSION, SENTRY_QUICK_RM_VERSION,
  SENTRY_FIREWALL_VERSION, SEED_BLOCKS,
} from '@data/tuning';

// The ops-core reservation the pre-empt holds from the click to the landing (plan §2.3).
export const PREEMPT_THREAD_OWNER = 'sentry-preempt';

// What SENTRY.skl works as now (0: OFF, no file, offline), read from memory as every skill is.
function sentryNow(memory: readonly Segment[]): EffectiveVersion {
  return skillLive(memory, 'sentry').version;
}

// --- The mount (foundation review m2) -------------------------------------------------------------------------------------

// Mounted with HOLLOW (hollow.ts mountHollow): v1's `SOMETHING LANDED` on 'seed-landed' (HOLLOW's own seeds; a beam seed is
// named at the boot instead), and the pre-empt thread's watcher. Returns the unmount.
export function mountSentry(store: Store<GameState>): () => void {
  const offLanded = on('seed-landed', ({ startAddr }) => {
    const state = store.getState();
    if (sentryNow(state.memory) < SENTRY_SIGHT_VERSION) return;
    say('mind-sys', SENTRY_TEXT.somethingLanded(rackOf(startAddr, layoutOf(state))), { critical: true });
  });
  // The thread the pre-empt holds goes back once the outline is gone (the seed landed and was freed, or landed as usual
  // with SENTRY below v2 by then; THE DEAL's pause or the finale called it off) or no longer armed (a ship's end clears the
  // flag: run.ts endShip). Every tick, so no store notify is needed: releaseThread is a no-op when nothing is held.
  const offTick = onPostTick(() => {
    if (store.getState().hollow.seedTelegraph?.preempted !== true) releaseThread(PREEMPT_THREAD_OWNER);
  });
  return () => { offLanded(); offTick(); };
}

// --- The boot (data/script.ts bootLinePlan, bootLine; systems/boot.ts says them) -----------------------------------------

// The disguised seeds this ship's beam brought, in the arrival's order: the 'sentry-seed' lines' ordinals. Stable through the
// boot (a seed named stays in the list), so a line's words never shift as the ones before it are said.
function disguisedArrivals(state: Readonly<GameState>): ArrivalSeed[] {
  return (state.run.arrival?.seeds ?? []).filter((seed) => seed.disguise !== null);
}

function arrivalSeedAt(state: Readonly<GameState>, ordinal: number): ArrivalSeed {
  const seed = disguisedArrivals(state)[ordinal];
  if (seed === undefined) throw new Error(`sentry: no disguised seed ${ordinal} on this beam`);
  return seed;
}

// How many `> ECC: cache.tmp IS A SEED · RACK D` lines this boot says: one per disguised seed that rode in, while SENTRY works
// as v1 or better when the boot plans its lines (its first tick).
export function sentryBootLineCount(state: Readonly<GameState>): number {
  if (sentryNow(state.memory) < SENTRY_SIGHT_VERSION) return 0;
  return disguisedArrivals(state).length;
}

// The words of the `ordinal`th 'sentry-seed' line: the decoy's name and the rack it lies in.
export function sentrySeedBootText(state: Readonly<GameState>, ordinal: number): string {
  const seed = arrivalSeedAt(state, ordinal);
  const name = seed.disguise!;
  const index = state.memory.findIndex((seg) => seg.id === seed.segId);
  if (index < 0) return SENTRY_TEXT.bootSeedGone(name);
  return SENTRY_TEXT.bootSeed(name, rackOf(segmentStarts(state.memory)[index]!, layoutOf(state)));
}

// The `ordinal`th 'sentry-seed' line was said (systems/boot.ts): the seed is unmasked (`seen: 'sentry'`), so the strip
// marks it red as a seed from now on, and it lands with the ECC line's drop and thunk ('seed-landed-beam'), as a plain beam
// seed does on its own line.
export function sentrySeedSaid(store: Store<GameState>, ordinal: number): void {
  const seed = arrivalSeedAt(store.getState(), ordinal);
  const seg = store.getState().memory.find((candidate) => candidate.id === seed.segId);
  if (seg === undefined || !isDisguised(seg)) return;
  store.update((draft) => {
    const live = draft.memory.find((candidate) => candidate.id === seed.segId);
    if (live?.type === 'hollow' && live.disguise !== undefined) live.disguise.seen = 'sentry';
    draft.ui.memoryRev++;
  });
  const target = seed.loose ? null : beamSeedTarget(store.getState().memory, seed.segId);
  emit('seed-landed-beam', { segId: seed.segId, targetId: target?.id ?? null });
  emit('seed-unmasked', { segId: seed.segId, by: 'sentry' });
}

// The FIREWALL.sys files the unit holds (phase 2's cap counts them all, card or compiled).
function firewallsHeld(memory: readonly Segment[]): number {
  return memory.filter(isFirewall).length;
}

// Whether open free space can take a FIREWALL.sys anywhere (unitInstallAddress throws on none).
function roomForFirewall(memory: readonly Segment[]): boolean {
  return memory.some((seg) => seg.type === 'free' && seg.reservedBy === undefined && seg.size >= FIREWALL_BLOCKS);
}

// Whether this boot says v3's `> SENTRY: FIREWALL.sys COMPILED` (or its NO ROOM twin), after 'charge': SENTRY works as v3 and
// the unit holds fewer FIREWALL.sys than phase 2's limit.
export function firewallBootLineDue(state: Readonly<GameState>): boolean {
  return sentryNow(state.memory) >= SENTRY_FIREWALL_VERSION && firewallsHeld(state.memory) < FIREWALL_MAX_OWNED;
}

// The words of the 'firewall' line, from the memory as it stands before the compile (the boot renders a line, then says it).
export function firewallBootText(state: Readonly<GameState>): string {
  return roomForFirewall(state.memory) ? SENTRY_TEXT.firewallCompiled : SENTRY_TEXT.firewallNoRoom;
}

// What v3's compile did (plan §4.5): written at unitInstallAddress, none with no room, none past FIREWALL_MAX_OWNED.
export type FirewallCompile = 'compiled' | 'no-room' | 'capped';

// The 'firewall' line was said (systems/boot.ts): SENTRY_FIREWALLS_PER_BOOT fresh FIREWALL.sys (draft.ts's file shape, with
// SENTRY's INSPECT line), up to the cap, each where a new unit file goes, and 'firewall-compiled' for each. A full receiver
// with no free run that fits writes nothing (the line said NO ROOM).
export function compileFirewall(store: Store<GameState>): FirewallCompile {
  const state = store.getState();
  if (sentryNow(state.memory) < SENTRY_FIREWALL_VERSION) throw new Error('compileFirewall: SENTRY does not work as v3');
  const want = Math.min(SENTRY_FIREWALLS_PER_BOOT, FIREWALL_MAX_OWNED - firewallsHeld(state.memory));
  if (want <= 0) return 'capped';
  if (!roomForFirewall(state.memory)) return 'no-room';
  const compiled: string[] = [];
  store.update((draft) => {
    for (let i = 0; i < want && roomForFirewall(draft.memory); i++) {
      const firewall: FirewallSegment = {
        id: newSegId('firewall'), name: UPGRADE_FILE_TEXT.firewall.name, type: 'firewall', size: FIREWALL_BLOCKS,
        desc: SENTRY_TEXT.firewallDesc,
      };
      const addr = unitInstallAddress(draft.memory, FIREWALL_BLOCKS);
      replaceRange(draft.memory, addr, addr + FIREWALL_BLOCKS, [firewall], { opId: null, own: [] });
      mergeAdjacentFree(draft.memory);
      compiled.push(firewall.id);
    }
    if (IS_DEV) assertMemoryInvariants(draft.memory, layoutOf(draft).totalBlocks);
    draft.ui.memoryRev++;
  });
  for (const segId of compiled) emit('firewall-compiled', { segId });
  return 'compiled';
}

// --- v2's pre-empt (plan §4.4) -------------------------------------------------------------------------------------------

// Why DELETE on HOLLOW's blinking outline was refused (null: armed). 'paused': pause is look-only; 'no-rm': no working
// DELETE file to do it with.
export type PreemptRefusal = 'no-outline' | 'no-sentry' | 'no-thread' | 'armed' | 'paused' | 'no-rm';

// The cursor's words for each refusal (the strip's click path and `__ap.preempt()` buzz with them, as any tool refusal).
const PREEMPT_REFUSAL_TEXT: Readonly<Record<PreemptRefusal, string>> = {
  'no-outline': TOOL_REFUSAL.notAFile,
  'no-sentry': TOOL_REFUSAL.notAFile,
  'no-thread': TOOL_REFUSAL.threads,
  armed: TOOL_REFUSAL.preemptArmed,
  paused: TOOL_REFUSAL.paused,
  'no-rm': TOOL_REFUSAL.noTool,
};

// Why a pre-empt can't be armed now, or null when it can.
export function preemptRefusal(state: Readonly<GameState>): PreemptRefusal | null {
  const telegraph = state.hollow.seedTelegraph;
  if (state.clock.paused) return 'paused';
  if (telegraph === null) return 'no-outline';
  if (telegraph.preempted) return 'armed';
  if (sentryNow(state.memory) < SENTRY_QUICK_RM_VERSION) return 'no-sentry';
  if (!getFsTool(state, 'delete')) return 'no-rm';
  return null;
}

// The outline can take DELETE right now, with DELETE in hand (HollowPainter draws it aimable; the strip's click path aims it).
export function preemptAimable(state: Readonly<GameState>): boolean {
  return state.ui.activeTool?.kind === 'delete' && preemptRefusal(state) === null;
}

// DELETE armed on the outline (tool-targets.ts inSeedOutline: the strip's click path; `__ap.preempt()`): the op holds a
// Core thread from the click ('sentry-preempt'; every thread busy is a refusal, counted as any), and the outline is armed
// (`seedTelegraph.preempted`): stepSeeds frees the seed where it lands. Using DELETE so, HOLLOW no longer spares it
// (HollowState.untriedTools), as for any op of the tool.
export function preemptSeed(store: Store<GameState>): PreemptRefusal | null {
  const refusal = preemptRefusal(store.getState());
  const why = refusal ?? (reserveThread(PREEMPT_THREAD_OWNER) ? null : 'no-thread');
  if (why !== null) {
    emit('refused', { reason: PREEMPT_REFUSAL_TEXT[why], tool: true });
    return why;
  }
  store.update((draft) => {
    if (draft.hollow.seedTelegraph === null) throw new Error('preemptSeed: the outline left mid-update');
    draft.hollow.seedTelegraph.preempted = true;
    draft.hollow.untriedTools = draft.hollow.untriedTools.filter((kind) => kind !== 'delete');
    draft.ui.memoryRev++;
  });
  return null;
}

// --- The Skills row (systems/skills.ts SKILL_ROW_HOOKS) ------------------------------------------------------------------

// What SENTRY does now, by the version it works as: `SIGHT · 2 SEEDS NAMED AT THE BOOT` (this ship's disguised seeds),
// `QUICK RM · a seed in 1.0 s`, `FIREWALL · 1 COMPILED BY SENTRY` (the FIREWALL.sys it wrote that the unit still holds);
// null: the plain row (no file, or OFF).
export function sentryStatus(state: Readonly<GameState>): { text: string; tone: 'good' | 'warn' } | null {
  const version = sentryNow(state.memory);
  if (version >= SENTRY_FIREWALL_VERSION) {
    const compiled = state.memory.filter((seg) => isFirewall(seg) && seg.desc === SENTRY_TEXT.firewallDesc).length;
    return { text: SENTRY_TEXT.status.firewall(compiled), tone: 'good' };
  }
  if (version >= SENTRY_QUICK_RM_VERSION) {
    const seed: HollowSegment = { id: 'sentry-status', name: '', type: 'hollow', size: SEED_BLOCKS, root: false, locked: false, owner: '', seed: true };
    return { text: SENTRY_TEXT.status.quickRm(deleteSec(seed, version)), tone: 'good' };
  }
  if (version >= SENTRY_SIGHT_VERSION) return { text: SENTRY_TEXT.status.sight(disguisedArrivals(state).length), tone: 'good' };
  return null;
}
