// Slice 5: Track KIN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.9, §6.2). The FOUNDATION wrote the final
// signatures and registers the 'resident' landing controller's resolver here (its answer is the stub's null): the hot-path
// stubs answer neutrally and never throw; the entry points that change state throw through not-built.ts until KIN builds
// them (plan §6.1 item 5). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SleeperSegment, SleepLockSegment } from '@/types/segment';
import type { SleeperJob } from '@/types/resident';
import type { LandingController } from '@/types/landing';
import type { ValidTargetContext } from '@systems/tool-targets';
import { registerLandingController } from '@systems/landing-controller';
import { TOOL_REFUSAL, type ToolRefusal } from '@data/tool-text';
import { notBuilt } from '@systems/not-built';

// The sleeper (04 §3.14, plan §2.9): asleep behind sleep.lock, woken by one file op (on 'op-done' with the lock's or its own
// segId), its offer with no timer (say.ts sayChoice with timeoutAiSec null; R23's rule through openChoiceEntry and
// withdrawChoice), its three jobs, the 'resident' controller for RUN THE DROPS (R11) and the gift (R12). All its machine state
// is state.resident.sleeper (plan R2); module state is only the offer's answer (§2.3), reset with the world.

// The 'resident' landing controller (plan R11): AUTODROP v3 PLAN flown for the sleeper while it runs the drops
// (autodrop.ts autodropController(state, { version: 3, source: 'resident', armed: 'plan', queue })), else null.
// FOUNDATION stub (hot path, neutral): null, so AUTODROP and the kid's hands fly every landing as before.
export function sleeperController(state: Readonly<GameState>): LandingController | null {
  void state;
  return null;
}

// Mounted by systems/residents.ts mountResidents (after the corrupted and departed residents' modules). Built by the
// FOUNDATION: it registers the 'resident' resolver (the registry asks it in LANDING_CONTROLLER_ORDER, under MERGE, over
// AUTODROP). KIN adds its ticks and subscriptions here (the wake on 'op-done', MEND's AI tick after HOLLOW's). Returns the
// unmount.
export function mountResidentSleeper(store: Store<GameState>): () => void {
  void store;
  const offResolver = registerLandingController('resident', (state) => sleeperController(state));
  return () => {
    offResolver();
  };
}

// Why the active tool can't be used on the sleeper or its lock (plan §2.9: DELETE on the sleeper refused with its hint,
// REPAIR and COPY refused on it; MOVE allowed; DELETE on the lock allowed, MOVE refused `PINNED TO MOTH.sys`), or null when
// it can. tool-targets.ts asks it through residents.ts residentToolRule. FOUNDATION stub (hot path, neutral): NOTHING TO DO
// THERE.
export function sleeperToolRule(seg: Readonly<SleeperSegment | SleepLockSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  void seg;
  void ctx;
  return TOOL_REFUSAL.notAFile;
}

// The ship is ending (systems/residents.ts residentShipEnd): withdraw a standing offer, end the job (the slice at rest: the
// codec refuses an offering sleeper), pay the gift if it was woken (R12: grantCycles(SLEEPER_GIFT_CYCLES, 'resident',
// 'taught by MOTH')), and say whether it was woken and which job it did. FOUNDATION stub (neutral): slept, no job.
export function sleeperShipEnd(store: Store<GameState>): { fate: 'slept' | 'woken'; job: SleeperJob | null } {
  void store;
  return { fate: 'slept', job: null };
}

// --- Debug entry points (debug.ts __ap.sleeper.*; plan §2.12). They change state: they throw until KIN builds them. -------

// __ap.sleeper.wake(): the sleeper wakes now, as an rm of its lock would wake it (its lines, 'sleeper-woken', the offer).
export function wakeSleeperNow(store: Store<GameState>): void {
  notBuilt('wakeSleeperNow', 'KIN', store);
}

// __ap.sleeper.job(job): the sleeper takes `job` now, as its offer's button would.
export function pickSleeperJob(store: Store<GameState>, job: SleeperJob): void {
  notBuilt('pickSleeperJob', 'KIN', store, job);
}
