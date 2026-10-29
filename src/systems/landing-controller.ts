import type { LandingController } from '@/types/landing';

// The one landing controller at a time (01-landing §3.14: AUTODROP 4c, the resident 5, MERGE's landing 7), held apart
// from landing.ts so pace can read `holdsTactical` without importing the landing (which imports pace for a controller's
// SKIP). landing.ts sets it (setLandingController), asks it every AI tick, and clears it at the world reset.
// Slice 4 should resolve the controller from STATE each tick instead of holding it here: AUTODROP is a file HOLLOW can
// eat, and a module variable would outlive its file.

let controller: LandingController | null = null;

export function setActiveLandingController(next: LandingController | null): void {
  controller = next;
}

export function activeLandingController(): LandingController | null {
  return controller;
}

// §3.12/§3.14: the window rule (TACTICAL around a window, WINDOW OPEN refusing a SKIP) holds for hand drops, and for a
// controller only if it says so; a higher AUTODROP drops inside a SKIP.
export function windowRuleHolds(): boolean {
  return controller === null || controller.holdsTactical;
}
