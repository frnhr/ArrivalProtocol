// Slice 7b: Track DROP owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §4.2, §5.2). The FOUNDATION left the
// signatures, the 'merge' resolver's registration and the stubs below; DROP builds R24–R28 here and raises
// data/last-landing.ts LAST_LANDING_BUILT.
//
// THE LAST LANDING (01-landing §3.17; 05 §3.7): after MERGE, the drivers HOLLOW ate on the final ship come back by radio at
// MERGE_DRIVER_INTEGRITY and their pods land on their own, before the final LANDING REPORT.
// • The start (startLastLanding, called by finale.ts verdictDone once the verdict has typed, gate up, with finale.restored):
//   in one update the FINALE goes 'verdict' → 'last-landing', landing.lastLanding is set (each pod's driver from
//   ending-rules restoredDriver; never in memory, R24), the pods are released (fate 'aboard', riding as beacons, R25), the
//   landing reopens (ended, the linger and the FUEL note cleared, as finale.ts reopenLanding did for 7a), and the SHIP view
//   is forced (R26). Then the TERMINAL lists each pod (LAST_LANDING_TEXT.radio) and 'last-landing-start' is emitted.
// • The flier (R27), decided once at the start: AUTODROP's effective version (capabilities skillLive) and whether a drop
//   solution exists. v2/v3 fly through autodrop.ts autodropController(state, { version, queue, source: 'merge', armed,
//   skipBetween: true }); v1 and blind are this file's own decides (one pod per window in pass order; blind: the moment
//   uniform within ±(W/2 + BLIND_MARGIN_KM), the intent's `blind`, on its own 'last-landing' stream). AUTODROP gets
//   LAST_LANDING_AUTODROP_ORBITS; a pod it has not placed by then drops blind in the next window.
// • The launch path is the landing's own (landing.ts requestLaunch through controllerTick): source 'merge' spends no bay and
//   meets no inline confirm; launchDriver takes a radio driver off lastLanding.drivers and starts the cadence
//   (cadenceLeftSec = LAST_LANDING_CADENCE_SEC). This file's game tick counts the cadence down (game seconds).
// • [ENTER] (skipLastLanding, R28): clock.advance in a loop at the clock's own step until the last landing is over, capped
//   at LAST_LANDING_SKIP_MAX_STEPS (throws).
// • The end: every restored pod down (or parked by the auto-end), nothing falling: landing.lastLanding cleared and the
//   FINALE 'done' in the same update (the codec refuses lastLanding set at ENDING CHOSEN, and finale.ts's own
//   'last-landing' branch only ends a landing with no machine, 7a's interim), then 'last-landing-end'.
// • The input layer (systems/input.ts 'last-landing', R26): ENTER, P and M only, pushed while lastLanding is set.
// Module-level state allowed here (plan §2.3): none; the machine is landing.lastLanding, the resolver is in the registry.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { LandingController } from '@/types/landing';
import { registerLandingController } from '@systems/landing-controller';
import { notBuilt } from '@systems/not-built';

// THE LAST LANDING starts with MERGE's restored pods (finale.ts verdictDone, gate up; `pods` is finale.restored, in pod
// order, never empty). Throws until DROP builds it (it is only reached with LAST_LANDING_BUILT raised).
export function startLastLanding(store: Store<GameState>, pods: readonly number[]): void {
  notBuilt('startLastLanding', 'DROP', store, pods);
}

// The 'merge' resolver (landing-controller.ts: first in LANDING_CONTROLLER_ORDER): THE LAST LANDING's controller while
// landing.lastLanding is set, else null. Hot path (asked every tick by the landing, pace and AUTODROP): neutral null until
// DROP builds it.
export function lastLandingController(state: Readonly<GameState>): LandingController | null {
  void state;
  return null;
}

// [ENTER] SKIP TO THE END (R28): THE LAST LANDING flown to its end now, by the same rules and streams. Throws until built.
export function skipLastLanding(store: Store<GameState>): void {
  notBuilt('skipLastLanding', 'DROP', store);
}

let mounted = false;

// Mounted after the FINALE (main.ts, wp6/harness6): the 'merge' resolver joins the controller registry. DROP adds its game
// tick (the cadence), its AI tick (the end), the input layer and a world reset here.
export function mountLastLanding(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountLastLanding: already mounted');
  mounted = true;
  void store;
  const offResolver = registerLandingController('merge', lastLandingController);
  return () => {
    offResolver();
    mounted = false;
  };
}
