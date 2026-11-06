// Slices 4c–4e: the FOUNDATION built this registry (docs/phase3/impl/slice-4cde-plan.md §2.4, R3); Track DROP owns the file
// after it (plan §7.2). Others ask by message.
import type { GameState } from '@state/schema';
import type { LandingController, LaunchSource } from '@/types/landing';

// The landing's controllers (01-landing §3.14: AUTODROP 4c, the resident 5, MERGE's last landing 7), derived from STATE
// each time they are asked: each source registers a resolver (a function of the state, with no data of its own) at mount,
// and activeLandingController asks them in LANDING_CONTROLLER_ORDER. A controller therefore dies with its file the tick
// HOLLOW eats it: there is no module variable to outlive it (1a's note, plan 4 debt 7). Held apart from landing.ts so pace
// can read `holdsTactical` without importing the landing (which imports pace for a controller's SKIP).
// The resolver list is the one module-level value here: functions, no state, so a world reset leaves it alone (plan §2.3).

export type ControllerSource = Exclude<LaunchSource, 'player'>;
export type ControllerResolver = (state: Readonly<GameState>) => LandingController | null;

// Who flies the landing when several could (plan R3): MERGE's last landing (slice 7) over the resident (slice 5) over
// AUTODROP. Data, so slices 5 and 7 add a resolver, not a branch.
export const LANDING_CONTROLLER_ORDER: readonly ControllerSource[] = ['merge', 'resident', 'autodrop'];

const resolvers = new Map<ControllerSource, ControllerResolver>();

// Registers `source`'s resolver; returns its unregister. A second registration of a source throws (two AUTODROPs mounted
// is a bug: the second would silently shadow the first).
export function registerLandingController(source: ControllerSource, resolve: ControllerResolver): () => void {
  if (resolvers.has(source)) throw new Error(`registerLandingController: '${source}' is already registered`);
  resolvers.set(source, resolve);
  return () => {
    if (resolvers.get(source) === resolve) resolvers.delete(source);
  };
}

// The controller flying the landing now, or null (the kid's hands): the first registered source, in the order above, whose
// resolver returns one. A resolver that answers for another source is a bug and throws.
export function activeLandingController(state: Readonly<GameState>): LandingController | null {
  for (const source of LANDING_CONTROLLER_ORDER) {
    const resolve = resolvers.get(source);
    if (resolve === undefined) continue;
    const controller = resolve(state);
    if (controller === null) continue;
    if (controller.source !== source) {
      throw new Error(`activeLandingController: the '${source}' resolver returned a '${controller.source}' controller`);
    }
    return controller;
  }
  return null;
}

// §3.12/§3.14: the window rule (TACTICAL around a window, WINDOW OPEN refusing a SKIP) holds for hand drops, and for a
// controller only if it says so; a higher AUTODROP may drop inside a SKIP (not in 4c: plan R7, every version holds it).
export function windowRuleHolds(state: Readonly<GameState>): boolean {
  const controller = activeLandingController(state);
  return controller === null || controller.holdsTactical;
}
