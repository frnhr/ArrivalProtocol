// WP2 review fixes, round 1. One check per fixed finding that can be driven headless:
// • the director does not fan out a store.update per tick while a countdown ticks (SKIP, CRUISE),
//   and director.shown still carries the fresh numbers (mutated in place);
// • a refusal flash ("SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]") is gone once TAB is pressed;
// • SPACE still held when the kid comes back to amber burns (and a paused TAB neither burns nor
//   buzzes);
// • CONTROL's outcome quips are said even when the say() queue is busy at the end of the flight;
// • "Nice! Now please orbit it. :)" survives a kid who releases 1.5 s late;
// • a double-click / second SPACE right after RECEIVE TRANSMISSION does not skip the boot;
// • the strip's typing job ends at the line's CURRENT length when the line grows or shrinks;
// • the strip's upcoming events never repeat the apsis the header's burn countdown is centred on.
import { createHarness2, followDirector, type Harness2 } from './harness2';
import { say, queuedLines } from '@systems/say';
import { receiveTransmission, skipBoot } from '@systems/boot';
import { sameObjectiveStructure } from '@systems/director';
import { mainCountdown } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { upcomingEvents } from '@systems/flight-hud';
import { createTypeQueue } from '@components/hud/typewriter';
import type { ObjectiveLine } from '@state/schema';
import { BOOT_SKIP_GRACE_SEC, SELF_CHECK_SKIP_SEEN_SEC } from '@data/tuning';

let failures = 0;
let total = 0;
function check(name: string, ok: boolean, detail = ''): void {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const h: Harness2 = createHarness2(1);

// --- 1. No store fan-out per tick while a countdown ticks ------------------------------------------
{
  h.resetTo('flight');
  let fanouts = 0;
  const unsub = h.store.subscribe((s) => s, () => { fanouts++; }, () => false);
  const byPace = new Map<string, { ticks: number; fanTicks: number; textChanges: number }>();
  let lastFanouts = 0;
  let lastText = '';
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 400,
    mistake: (harness) => {
      const pace = harness.store.getState().clock.pace;
      const bucket = byPace.get(pace) ?? { ticks: 0, fanTicks: 0, textChanges: 0 };
      bucket.ticks++;
      if (fanouts > lastFanouts) bucket.fanTicks++;
      const text = harness.shown()?.text ?? '';
      if (text !== lastText) bucket.textChanges++;
      lastText = text;
      lastFanouts = fanouts;
      byPace.set(pace, bucket);
      return false;
    },
  });
  unsub();
  const skip = byPace.get('skip');
  const cruise = byPace.get('cruise');
  const share = (bucket: { ticks: number; fanTicks: number } | undefined): number => (bucket ? bucket.fanTicks / bucket.ticks : 1);
  check('fan-out: the flight still locks with the director in the loop', h.status() === 'locked', h.status());
  check('fan-out: SKIP has store updates on ≤ 5% of its ticks (was 79%)', skip !== undefined && share(skip) <= 0.05,
    skip ? `${skip.fanTicks}/${skip.ticks} ticks` : 'no SKIP');
  check('fan-out: CRUISE has store updates on ≤ 10% of its ticks (was 18%)', cruise !== undefined && share(cruise) <= 0.1,
    cruise ? `${cruise.fanTicks}/${cruise.ticks} ticks` : 'no CRUISE');
  check('fan-out: director.shown still carries the ticking countdown under SKIP', skip !== undefined && skip.textChanges > skip.ticks / 2,
    skip ? `${skip.textChanges} text changes in ${skip.ticks} ticks` : 'no SKIP');
}

// --- 1b. What counts as a new line -----------------------------------------------------------------
{
  const line = (text: string, id = 'F10-wait'): ObjectiveLine =>
    ({ id, text, keys: ['F'], urgency: 'wait', layer: 'ship', highlight: null, source: 'flight' });
  check('structure: a countdown tick is the same line',
    sameObjectiveStructure(line('WAIT — brake at ▼ in 2:58'), line('WAIT — brake at ▼ in 10:00')));
  check('structure: new words are a new line',
    !sameObjectiveStructure(line('WAIT — brake at ▼ in 2:58'), line('WAIT — brake at ▼ in 2:58 · hold [F]')));
  check('structure: a new id is a new line', !sameObjectiveStructure(line('X 1'), line('X 1', 'other')));
}

// --- 2. The SHIP SCREEN refusal clears on TAB ------------------------------------------------------
{
  h.resetTo('flight');
  h.stepFor(1);
  h.press('Tab');
  h.stepFor(0.5);
  h.keyDown('Space');
  h.keyUp('Space');
  h.stepFor(0.5);
  check('refusal: SPACE in blue explains where the controls are', h.shown()?.id.startsWith('flash-') === true, h.shown()?.text);
  h.press('Tab');
  h.step();
  const shown = h.shown();
  check('refusal: back in amber the strip shows the flight line at once',
    h.store.getState().ui.mode === 'tools' && shown?.source === 'flight' && !(shown.keys.includes('TAB')), JSON.stringify(shown?.text));
}

// --- 3. SPACE held across a screen switch ----------------------------------------------------------
{
  // Pressed in blue (refused), held through TAB: burns on arrival in amber.
  h.resetTo('flight');
  h.stepFor(1);
  h.press('Tab');
  h.stepFor(0.3);
  h.keyDown('Space');
  h.stepFor(0.3);
  check('held SPACE: refused in blue', !h.store.getState().burn.firing);
  h.press('Tab');
  h.stepFor(0.3);
  check('held SPACE: pressed in blue, burns once back in amber', h.store.getState().burn.firing && h.store.getState().burn.firingSource === 'player');
  h.keyUp('Space');
  h.step();
  check('held SPACE: and letting go stops it', !h.store.getState().burn.firing);

  // Held in amber through TAB, TAB.
  h.resetTo('flight');
  h.stepFor(1);
  h.keyDown('Space');
  h.stepFor(0.3);
  h.press('Tab');
  h.step();
  check('held SPACE: entering blue lets go of the burn', !h.store.getState().burn.firing);
  h.press('Tab');
  h.step();
  check('held SPACE: TAB back mid-hold burns again', h.store.getState().burn.firing);
  h.keyUp('Space');
  h.step();

  // Paused: TAB back with SPACE held neither burns nor buzzes.
  h.resetTo('flight');
  h.stepFor(1);
  h.press('Tab');
  h.press('KeyP');
  h.keyDown('Space');
  const refusedBefore = h.events.filter((event) => event.name === 'refused').length;
  h.press('Tab');
  h.step();
  const refusedAfter = h.events.filter((event) => event.name === 'refused').length;
  check('held SPACE: paused, TAB back does not burn', !h.store.getState().burn.firing);
  check('held SPACE: paused, TAB back does not buzz', refusedAfter === refusedBefore, `${refusedAfter - refusedBefore} refusal(s)`);
  h.keyUp('Space');
}

// --- 4. Outcome quips are said even when the queue is busy -----------------------------------------
{
  h.resetTo('flight');
  let spoke = false;
  while (h.status() === 'approaching' && h.wall() < 400) {
    h.step();
    const chip = h.countdown();
    if (!spoke && chip?.kind === 'impact' && chip.tacSec < 1) {
      say('sys', 'HULL SENSORS: SURFACE CONTACT IMMINENT');
      spoke = true;
    }
  }
  h.stepFor(2);
  const radio = h.log().filter((entry) => entry.channel === 'radio').map((entry) => entry.text);
  check('outcome quip: crashed right after another line, "Oh no. :)" is still said', h.status() === 'crashed' && radio.includes('Oh no. :)'),
    JSON.stringify(radio));
  check('outcome quip: nothing is stuck in the queue', !queuedLines().some((line) => line.text === 'Oh no. :)'));
}

// --- 5. The clear quip survives a late release -----------------------------------------------------
{
  h.resetTo('flight');
  followDirector(h, { reactionSec: 1.5, maxWall: 400 });
  h.stepFor(1);
  const control = h.log().filter((entry) => entry.speaker === 'companion').map((entry) => entry.text);
  const expected = ['Hello, Unit 47! ARES-VII is about to hit a planet. :)', 'Nice! Now please orbit it. :)', 'Captured! Mostly. :)', 'Great orbit! Probably. :)'];
  check('clear quip: a kid reacting in 1.5 s hears all four of PAL\'s lines', h.status() === 'locked' && expected.every((text) => control.includes(text)),
    `${h.status()} | ${control.join(' | ')}`);
}

// --- 6. The boot's skip grace --------------------------------------------------------------------
{
  h.resetTo('title');
  h.step();
  receiveTransmission(h.store);
  check('boot grace: a skip right after RECEIVE is ignored', skipBoot(h.store) === false && h.store.getState().run.phase === 'boot');
  h.keyDown('Space');
  h.keyUp('Space');
  check('boot grace: so is a second SPACE', h.store.getState().run.phase === 'boot');
  h.stepFor(BOOT_SKIP_GRACE_SEC + 0.1);
  // Playtest 1 (C-UNROLL): after it, a press hurries the SELF-CHECK's stage, the next skips the rest, and once what it showed
  // has been seen (SELF_CHECK_SKIP_SEEN_SEC) a press cuts to amber.
  check('boot grace: after it, a skip works (a hurry, a skip, then the cut)', skipBoot(h.store) === true && skipBoot(h.store) === true
    && h.store.getState().run.phase === 'boot' && (h.stepFor(SELF_CHECK_SKIP_SEEN_SEC + 0.05), skipBoot(h.store)) === true
    && h.store.getState().run.phase === 'flight');
}

// --- 7. A typing job ends at its line's current length ---------------------------------------------
{
  // A fake frame clock for the rAF-driven queue.
  let frames: FrameRequestCallback[] = [];
  let nowMs = 0;
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (callback: FrameRequestCallback): number => {
    frames.push(callback);
    return frames.length;
  };
  const originalNow = performance.now.bind(performance);
  performance.now = () => nowMs;
  const runFrames = (count: number): void => {
    for (let i = 0; i < count; i++) {
      nowMs += 16;
      const due = frames;
      frames = [];
      due.forEach((callback) => callback(nowMs));
    }
  };

  const typeLine = (initial: number, changeTo: number, changeAfterFrames: number): { count: number; done: boolean }[] => {
    let length = initial;
    const paints: { count: number; done: boolean }[] = [];
    const queue = createTypeQueue(() => true);
    queue.push({ get length() { return length; }, cps: 60, paint: (count, done) => { paints.push({ count, done }); } });
    runFrames(changeAfterFrames);
    length = changeTo;
    runFrames(200);
    return paints;
  };
  const grown = typeLine(20, 30, 5);
  const grownLast = grown[grown.length - 1];
  check('typing: a line that grows mid-type finishes at its new length', grownLast?.count === 30 && grownLast.done, JSON.stringify(grownLast));
  const shrunk = typeLine(30, 4, 8);
  const shrunkLast = shrunk[shrunk.length - 1];
  check('typing: a line that shrinks below what is shown still gets its done paint', shrunkLast?.count === 4 && shrunkLast.done, JSON.stringify(shrunkLast));
  performance.now = originalNow;
}

// --- 8. Upcoming events never repeat the burn's apsis ------------------------------------------------
{
  h.resetTo('flight');
  let repeats = 0;
  let samples = 0;
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 400,
    mistake: (harness) => {
      const state = harness.store.getState();
      const pred = getPrediction();
      const chip = mainCountdown(state, pred);
      if (chip?.kind !== 'burn' || !pred.burnPoint) return false;
      const glyph = pred.burnPoint.event === 'peri' ? '▼' : pred.burnPoint.event === 'apo' ? '▲' : null;
      const line = upcomingEvents(state, pred);
      samples++;
      if (glyph && line.split(' · ').some((item) => item.startsWith(glyph))) repeats++;
      return false;
    },
  });
  check('upcoming: while the chip counts a burn, its apsis is not listed again', samples > 0 && repeats === 0, `${repeats} of ${samples} ticks`);
}

console.log(`---- ${total - failures}/${total} checks passed`);
process.exit(failures === 0 ? 0 : 1);
