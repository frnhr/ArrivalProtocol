// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §4, §7.2). The FOUNDATION wrote it as
// stubs with their final signatures (plan §7.1 item 5): the boot's counts and the Skills row's status return a neutral
// answer (no line, the plain row), so every boot plans and plays exactly as before; the entry points that change state,
// and the line texts that a count of 0 never reaches, throw through not-built.ts until SENTRY builds them.
//
// SENTRY (03 §3.10; 04 §3.4–§3.6): v1 SIGHT names the disguised seeds at the boot and reports a seed landing; v2 QUICK RM
// (state/actions.ts deleteSec) and the pre-empt on HOLLOW's blinking outline; v3 FIREWALL compiled at the boot.
// No module-level state (plan §2.3): the pre-empt's thread is an ops-core reservation ('sentry-preempt'), cleared by the
// world reset as every reservation is.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { notBuilt } from '@systems/not-built';

// --- The boot (data/script.ts bootLinePlan, bootLine) --------------------------------------------------------------------

// How many `> ECC: cache.tmp IS A SEED · RACK D` lines this boot says (one per disguised seed, planned after 'seeds', while
// skillLive('sentry').version ≥ 1 at the plan). STUB (every boot plans with it): 0.
export function sentryBootLineCount(state: Readonly<GameState>): number {
  void state;
  return 0;
}

// Whether this boot says v3's `> SENTRY: FIREWALL.sys COMPILED` (or its NO ROOM twin), after 'charge'. STUB: false.
export function firewallBootLineDue(state: Readonly<GameState>): boolean {
  void state;
  return false;
}

// The words of the `ordinal`th 'sentry-seed' line. STUB: throws (a count of 0 never reaches it).
export function sentrySeedBootText(state: Readonly<GameState>, ordinal: number): string {
  return notBuilt('sentrySeedBootText', 'SENTRY', state, ordinal);
}

// The words of the 'firewall' line. STUB: throws (firewallBootLineDue false never reaches it).
export function firewallBootText(state: Readonly<GameState>): string {
  return notBuilt('firewallBootText', 'SENTRY', state);
}

// What v3's compile did (plan §4.5): one written at unitInstallAddress, none with no room, none past FIREWALL_MAX_OWNED.
export type FirewallCompile = 'compiled' | 'no-room' | 'capped';

// Says the 'firewall' line: writes FIREWALL.sys (draft.ts's FirewallSegment shape) and emits 'firewall-compiled'. STUB:
// throws.
export function compileFirewall(store: Store<GameState>): FirewallCompile {
  return notBuilt('compileFirewall', 'SENTRY', store);
}

// --- v2's pre-empt (plan §4.4) -------------------------------------------------------------------------------------------

// Why DELETE on HOLLOW's blinking outline was refused (null: armed).
export type PreemptRefusal = 'no-outline' | 'no-sentry' | 'no-thread' | 'armed';

// DELETE armed on the outline (tool-targets.ts's 'outline' target; `__ap.preempt()`): reserves 'sentry-preempt' and sets
// hollow.seedTelegraph.preempted. STUB: throws.
export function preemptSeed(store: Store<GameState>): PreemptRefusal | null {
  return notBuilt('preemptSeed', 'SENTRY', store);
}

// --- The Skills row (systems/skills.ts SKILL_ROW_HOOKS) ------------------------------------------------------------------

// `SIGHT · 2 SEEDS NAMED AT THE BOOT`, `QUICK RM · a seed in 1.0 s`, `FIREWALL · 1 COMPILED AT THE BOOT`; null: the plain
// row (whether it works). STUB: null.
export function sentryStatus(state: Readonly<GameState>): { text: string; tone: 'good' | 'warn' } | null {
  void state;
  return null;
}
