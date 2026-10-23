// LEAD-1 item 5 (WP5's deferred question 1, the lead's option a): run 1 holds SKIP for the colonists
// (`CHECK THE COLONISTS FIRST`) only until the ask has stood SOULS_ASK_HOLD_SEC AI seconds on the strip,
// either wording. Meanwhile the mode toggle names it (`MIND ▸ CHECK THE 2,400`, pulsing like any alert).
// Then the amber ask steps aside, the coast's `WAIT … · [F] SKIP` comes back, and nothing reveals itself
// mid-flight: a kid who never scans STASIS still meets the colonists at the bite's breach or the printer.
// The WP5 review measured 125 s of forced CRUISE coast for a kid who ignores the ask.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness5 } from '../wp5/harness5';
import { getPrediction } from '@systems/predict';
import { skipBlockReason, SKIP_REFUSAL_COLONISTS, COLONISTS_HOLD_RELEASED } from '@systems/pace';
import { setPaused } from '@systems/clock';
import { setMode } from '@systems/mode';
import { colonistsAskToggle, COLONISTS_ASK_ID } from '@data/script';
import { archiveSealed } from '@state/selectors';
import { SOULS_ASK_HOLD_SEC } from '@data/tuning';

const h = createHarness5(1);
const state = () => h.store.getState();
const held = (): boolean => skipBlockReason(state(), getPrediction()) === SKIP_REFUSAL_COLONISTS;
const released = (): boolean => state().director.done.includes(COLONISTS_HOLD_RELEASED);

// --- The kid who ignores the ask: the WP1 literal follower (flies the flight table, presses F when the
//     line offers it, never TABs) on run 1's sealed ship 1 ----------------------------------------------
{
  h.resetTo('flight');
  let askSec = 0;               // AI s the amber ask was the strip's line
  let askSecAtRelease = NaN;
  let heldCruiseSec = 0;        // wall s at CRUISE with SKIP refused for the colonists
  let toggleWhileAsk = 0;
  let toggleWithoutAsk = 0;
  let toggleText = '';
  let stageAtRelease = '';
  let skipLineAfterRelease = '';
  let skippedAfterRelease = false;
  let releasedAtWall = NaN;
  followStrip(h, 0.4, 400, () => {
    const shown = state().director.shown;
    const toggle = colonistsAskToggle(state());
    if (shown?.id === COLONISTS_ASK_ID) { askSec += 0.05; if (toggle) toggleWhileAsk++; toggleText ||= toggle ?? ''; }
    else if (toggle) toggleWithoutAsk++;
    if (state().clock.pace === 'cruise' && held()) heldCruiseSec += 0.05;
    if (released() && Number.isNaN(releasedAtWall)) {
      releasedAtWall = h.wall();
      askSecAtRelease = askSec;
      stageAtRelease = state().souls.reveal.stage;
    }
    // The follower presses F as soon as the line offers it, and a running SKIP takes the hint away again.
    const soon = !Number.isNaN(releasedAtWall) && h.wall() < releasedAtWall + 2;
    if (soon && !skipLineAfterRelease && shown?.text.includes('· [F] SKIP')) skipLineAfterRelease = shown.text;
    if (soon && state().clock.pace === 'skip') skippedAfterRelease = true;
  });
  check(`the hold is released once the ask has stood ${SOULS_ASK_HOLD_SEC} AI-s`,
    released() && Math.abs(askSecAtRelease - SOULS_ASK_HOLD_SEC) < 0.2, `released after ${askSecAtRelease.toFixed(2)} s of the ask`);
  check('while the ask stood, the mode toggle named it, and only then', toggleWhileAsk > 0 && toggleWithoutAsk === 0
    && toggleText === 'CHECK THE 2,400', `"${toggleText}": ${toggleWhileAsk} ticks with the ask, ${toggleWithoutAsk} without`);
  check('released, the amber ask stepped aside for the coast\'s WAIT with [F] SKIP, and the kid SKIPped at once',
    /^WAIT — .* · \[F\] SKIP$/.test(skipLineAfterRelease) && skippedAfterRelease, `"${skipLineAfterRelease}", skipped: ${skippedAfterRelease}`);
  check('nothing revealed itself at the release (the archive still sealed, no reveal started)',
    stageAtRelease === 'sealed', stageAtRelease);
  check(`forced CRUISE with SKIP held: about ${SOULS_ASK_HOLD_SEC} s (the WP5 review measured 125 s)`,
    heldCruiseSec <= SOULS_ASK_HOLD_SEC + 8, `${heldCruiseSec.toFixed(1)} s`);
  check('the kid still locks, and the colonists come out after (the breach, then the printer)',
    h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s, archive sealed at the lock: ${archiveSealed(state())}`);
}

// --- Before LEAD-1, for comparison: the same follower with the hold never released --------------------
{
  h.resetTo('flight');
  let heldCruiseSec = 0;
  followStrip(h, 0.4, 600, () => {
    if (released()) h.store.mutate((d) => { d.director.done = d.director.done.filter((id) => id !== COLONISTS_HOLD_RELEASED); });
    if (state().clock.pace === 'cruise' && held()) heldCruiseSec += 0.05;
  });
  console.log(`      (before LEAD-1 this follower coasted ${heldCruiseSec.toFixed(1)} s at CRUISE with SKIP held, locked at ${h.wall().toFixed(1)} s)`);
  check('…which is what the old hold cost this follower', heldCruiseSec > 2 * SOULS_ASK_HOLD_SEC, `${heldCruiseSec.toFixed(1)} s`);
}

// --- The ask's two wordings share one clock; pause stops it; in blue the ask stays after the release ----
{
  h.resetTo('flight');
  h.noFault();
  // The opening by the book, to the coast's WAIT; then into the mind, and stay.
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.stepUntil(() => /TURN AROUND/.test(h.objective()?.text ?? ''), 5);
  h.press('KeyS');
  h.stepUntil(() => /^WAIT/.test(h.objective()?.text ?? ''), 10);
  setMode(h.store, 'memory');
  let blueAskSec = 0;
  let pausedFor = 0;
  let releasedAfter = NaN;
  for (let i = 0; i < 1200 && Number.isNaN(releasedAfter); i++) {
    // Three seconds of pause in the middle: AI time stops, so the ask's clock does too.
    if (i === 100) setPaused(h.store, true);
    if (i === 160) setPaused(h.store, false);
    h.step();
    if (state().clock.paused) pausedFor += 0.05;
    if (state().director.shown?.id === 'tut-scan-stasis') blueAskSec += state().clock.paused ? 0 : 0.05;
    if (released()) releasedAfter = blueAskSec;
  }
  h.stepFor(1);
  check(`in blue the ask (SCAN the STASIS file) counts too: released after ${SOULS_ASK_HOLD_SEC} AI-s of it, not counting a pause`,
    Math.abs(releasedAfter - SOULS_ASK_HOLD_SEC) < 0.2 && pausedFor > 2.5, `${releasedAfter.toFixed(2)} s of the blue ask, ${pausedFor.toFixed(1)} s paused`);
  check('…and in blue the ask stays on the strip after the release (the scan is one click away)',
    state().director.shown?.id === 'tut-scan-stasis' && !held(), `${state().director.shown?.id}, SKIP ${skipBlockReason(state(), getPrediction())}`);
  check('the toggle names the ask only in amber', colonistsAskToggle(state()) === null);
}

finish();
