// WP10, the lead's item 4 (two LEAD-2 round-3 leftovers in flight-controls.ts, the lead's rulings), on ship 1 and on
// KESTREL with AUTOBURN.skl (harness9):
//  1. a hold whose press only stopped a SKIP does not go live on `AUTOBURN BRAKING — [SPACE] takes over` (an offer, not
//     an ask): AUTOBURN armed, SKIP, SPACE pressed under the armed line and kept down: AUTOBURN fires and keeps the
//     throttle; a FRESH press still takes over;
//  2. a dropped hold is cleared when the game pauses: SPACE pressed as the SKIP to the capture lands (WAIT), kept down
//     through a pause and on to `HOLD [SPACE] NOW`: nothing burns (a live hold needs a fresh press after a pause, so a
//     dropped one does too); without the pause the same hold burns at `HOLD [SPACE] NOW` (LEAD-2's round-3 rule, kept);
//     a fresh press after the pause burns.
import { check, finish } from '../wp1/harness';
import { createHarness9 } from '../wp9/harness9';
import { getPrediction } from '@systems/predict';
import { autoburnAvailable } from '@systems/autoburn';
import { setPaused } from '@systems/clock';
import { skipBlockReason } from '@systems/pace';
import { text, stepUntil } from '../wp1-rules/flows';
import { openArchive } from '@state/initial';
import { SOUL_RULES } from '@data/script';
import { COLONISTS_HOLD_RELEASED } from '@systems/pace';

const h = createHarness9(3);
const state = () => h.store.getState();

// --- 1. AUTOBURN's offer is not an ask --------------------------------------------------------------------------
{
  h.kestrel(3, { hollowAsleep: true, sensorHealed: true });
  // The early IN correction (TOO WIDE), then RETRO and the coast to the capture, with the skill installed.
  h.giveSkill([2, 2]);
  h.keyDown('Space');
  stepUntil(h, () => /^RELEASE/.test(text(h)) || /RELEASE/.test(h.objective()?.text ?? ''), 40);
  h.keyUp('Space');
  stepUntil(h, () => /TURN AROUND/.test(h.objective()?.text ?? ''), 10);
  h.press('KeyS');
  stepUntil(h, () => autoburnAvailable(state(), getPrediction()), 300);
  h.press('KeyB');
  h.step();
  const armed = state().burn.auto.phase === 'armed';
  const skipOk = skipBlockReason(state(), getPrediction()) === null;
  h.press('KeyF');
  h.stepFor(0.5);
  const skipping = state().clock.skipWarp !== null;
  h.keyDown('Space');
  h.step();
  const stopped = state().clock.skipWarp === null && !state().burn.firing;
  stepUntil(h, () => state().burn.auto.phase === 'burning', 120);
  const burning = state().burn.auto.phase === 'burning';
  // A second of AUTOBURN braking with the old hold still down.
  let takenOver = false;
  h.stepFor(1, () => { if (state().burn.firingSource === 'player') takenOver = true; });
  check('AUTOBURN armed, SKIP; SPACE pressed under the armed line only stops the SKIP (nothing burns)', armed && skipOk && skipping && stopped,
    `armed ${armed} skip ${skipOk}/${skipping} stopped ${stopped}`);
  check('…kept down, it does not take over when AUTOBURN fires (`[SPACE] takes over` is an offer, not an ask)',
    burning && !takenOver && state().burn.firingSource === 'auto', `burning ${burning} takenOver ${takenOver} source ${state().burn.firingSource}`);
  h.keyUp('Space');
  h.step();
  h.keyDown('Space');
  h.step();
  check('…a fresh press takes over at once', state().burn.firingSource === 'player' && state().burn.firing, `${state().burn.firingSource}`);
  h.keyUp('Space');
}

// --- 2. A pause clears a dropped hold ------------------------------------------------------------------------------
function toSkipToCapture(seed: number): void {
  h.resetTo('flight', seed);
  // The colonists already found (run 1's STASIS step would hold SKIP).
  h.store.update((d) => {
    openArchive(d);
    d.director.done.push(...SOUL_RULES.map((rule) => rule.id), COLONISTS_HOLD_RELEASED);
  });
  h.keyDown('Space');
  stepUntil(h, () => /^RELEASE/.test(text(h)), 30);
  h.keyUp('Space');
  stepUntil(h, () => /TURN AROUND/.test(text(h)), 5);
  h.press('KeyS');
  stepUntil(h, () => /^WAIT/.test(text(h)), 10);
  h.press('KeyF');
  const warp = state().level.tacticalWarp;
  stepUntil(h, () => state().clock.skipEndTSec !== null && state().clock.skipEndTSec! - state().clock.tSec < 60 * warp, 60);
}

// Holds SPACE (pressed as the SKIP lands under WAIT) to the capture's `HOLD [SPACE] NOW`, pausing first if asked; true
// when it burned there.
function earlyHold(pause: boolean): { skipping: boolean; burnedAtNow: boolean } {
  toSkipToCapture(4);
  const skipping = state().clock.skipWarp !== null && /^WAIT/.test(text(h));
  h.keyDown('Space');
  h.step();
  if (pause) {
    setPaused(h.store, true);
    h.stepFor(1);
    setPaused(h.store, false);
  }
  stepUntil(h, () => /HOLD \[SPACE\] NOW/.test(h.objective()?.text ?? ''), 60);
  h.stepFor(0.5);
  const burnedAtNow = state().burn.firing && state().burn.lastTickDvKmS > 0;
  h.keyUp('Space');
  h.step();
  return { skipping, burnedAtNow };
}
{
  const kept = earlyHold(false);
  check('without a pause, the dropped hold burns at HOLD [SPACE] NOW (LEAD-2 round 3, kept)', kept.skipping && kept.burnedAtNow, JSON.stringify(kept));
  const paused = earlyHold(true);
  check('with a pause between, the same hold burns nothing at HOLD [SPACE] NOW (a pause clears a dropped hold)',
    paused.skipping && !paused.burnedAtNow, JSON.stringify(paused));
  h.keyDown('Space');
  h.stepFor(0.3);
  check('…a fresh press burns', state().burn.firing && state().burn.lastTickDvKmS > 0);
  h.keyUp('Space');
}

finish();
