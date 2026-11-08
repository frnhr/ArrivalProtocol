// Slice 8 POLISH (docs/phase3/impl/slice-8-plan.md §2.11; OPEN-DECISIONS 66): [ENTER] in THE LAST LANDING over frames,
// headless. ending/last-landing keeps the one-call skip's own check ("the same landing as the one watched"); this suite
// checks that the skip over frames (systems/last-landing.ts skipLastLandingFrames, the page's [ENTER] and button) ends
// THE LAST LANDING in exactly the state the one-call skip ends it in, pod for pod and field for field, on the arm's LAST
// LIGHT (ending/last-landing-arm.ts), with a fake frame scheduler and a fake wall clock:
// • blind (no AUTODROP: 2 pods, 4 at full depth), AUTODROP v2 (3 pods) and at full depth v3 (6): every frame a few steps,
//   the whole state equal at the end (a control first: two one-call skips from one setup are equal);
// • at full depth all 16 pods blind (the plan's worst case), with frames of one step;
// • a pause between two frames (a hidden tab) is let go at the next, and the end is still the same;
// • while it runs: a second [ENTER] and a second call do nothing, P is not heard, M is; the frames' budget is kept (no frame
//   runs past LAST_LANDING_SKIP_FRAME_MS plus the one step that crossed it); a world reset ends it between two frames.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { setLandingMode } from '../support/landing-instant';
import { armLastLanding, type ArmOpts } from './last-landing-arm';
import { skipLastLanding, skipLastLandingFrames, lastLandingSkipping, framedSkipProgress, type FrameScheduler } from '@systems/last-landing';
import { setPaused } from '@systems/clock';
import { isMuted } from '@systems/audio';
import { resetWorld } from '@systems/reset';
import { LAST_LANDING_SKIP_FRAME_MS } from '@data/tuning';
import { byDepth, fullOnly } from '../depth';
import type { GameState } from '@state/schema';

const h = createHarness11(31);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();

// A fake page: frames queue up and run when `drain` asks; the wall clock moves `msPerCall` on every read, so a frame
// fits a known number of steps.
function fakePage(msPerCall: number): { schedule: FrameScheduler; now: () => number; drain: (between?: (frame: number) => void) => number; reads: () => number } {
  const frames: (() => void)[] = [];
  let ms = 0;
  let reads = 0;
  return {
    schedule: (frame) => { frames.push(frame); },
    now: () => { reads++; ms += msPerCall; return ms; },
    drain: (between) => {
      let ran = 0;
      while (frames.length > 0) {
        between?.(ran);
        frames.shift()!();
        ran++;
        if (ran > 100_000) throw new Error('last-landing-frames: the skip never ends');
      }
      return ran;
    },
    reads: () => reads,
  };
}

// The whole state as JSON, with its two counters left out: the log entries' ids (say.ts) and the numbered segment ids
// (`autodrop~1572`, from the module counter that names a new segment). A restored setup (flyOnce) rewinds neither, so two
// one-call skips from the same setup differ there too, and only there (the control below).
function endState(): string {
  const s = state();
  return JSON.stringify({ ...s, log: { ...s.log, entries: s.log.entries.map(({ id: _id, ...entry }) => entry) } })
    .replace(/"([A-Za-z-]+)~\d+"/g, '"$1~#"');
}

// The state once THE LAST LANDING has been skipped from `opts`, the one-call way.
function skippedOnce(opts: ArmOpts): { pods: number[]; end: string } {
  const pods = armLastLanding(h, opts);
  skipLastLanding(h.store);
  return { pods, end: endState() };
}

// The same, over frames: the end state, the frames it took, and the most steps any one frame ran.
function skippedFramed(opts: ArmOpts, msPerCall: number, between?: (frame: number) => void): { pods: number[]; end: string; frames: number; maxSteps: number } {
  const pods = armLastLanding(h, opts);
  const page = fakePage(msPerCall);
  let maxSteps = 0;
  let lastSteps = 0;
  const ok = skipLastLandingFrames(h.store, { schedule: page.schedule, now: page.now });
  const firstSteps = framedSkipProgress()?.steps ?? 0;
  maxSteps = firstSteps;
  lastSteps = firstSteps;
  const frames = page.drain((frame) => {
    between?.(frame);
    const steps = framedSkipProgress()?.steps ?? lastSteps;
    maxSteps = Math.max(maxSteps, steps - lastSteps);
    lastSteps = steps;
  });
  if (!ok) throw new Error('last-landing-frames: the skip did not start');
  return { pods, end: endState(), frames: frames + 1, maxSteps };
}

const podsDown = (pods: number[]): boolean => pods.every((pod) => state().landing.pods.find((record) => record.pod === pod)?.fate.kind === 'down');

// The control: two one-call skips from the same setup give the same end state (so an equal framed one is not luck).
{
  const a = skippedOnce({ autodrop: 2, eaten: 3 });
  const b = skippedOnce({ autodrop: 2, eaten: 3 });
  check('the control: two one-call skips from one setup end in the same state', a.end === b.end);
}

// --- Blind, v2 and v3: the end state equal, field for field -----------------------------------------------------------------
// 4 ms per wall-clock read: a frame reads the clock once at its start and once per step, so 12 ms of budget is 3 steps.
// Quick: blind on 2 pods and v2 on 3; full: blind on 4 and v3 on 6 too. Each case flies its landing twice, and the quick
// tier's two cover both fliers' code.
for (const opts of byDepth<ArmOpts[]>([{ autodrop: null, eaten: 2 }, { autodrop: 2, eaten: 3 }],
  [{ autodrop: null, eaten: 4 }, { autodrop: 2, eaten: 3 }, { autodrop: 3, eaten: 6 }])) {
  const once = skippedOnce(opts);
  const framed = skippedFramed(opts, 4);
  const flier = opts.autodrop === null ? 'blind' : `AUTODROP v${opts.autodrop}`;
  check(`${flier}, ${opts.eaten} pods: over ${framed.frames} frames of ${framed.maxSteps} steps, the end state is the one-call skip's, field for field`,
    framed.frames > 10 && framed.maxSteps === 3 && framed.end === once.end && podsDown(framed.pods) && state().landing.lastLanding === null
      && state().hollow.finale.phase === 'done' && !lastLandingSkipping(),
    `${framed.frames} frames, ${framed.maxSteps} steps a frame, equal ${framed.end === once.end}`);
}

// --- Every pod blind, one step a frame (the plan's worst case: 16 pods, about 6 passes) -----------------------------------------
fullOnly('16 pods blind, one step a frame', () => {
  const opts: ArmOpts = { autodrop: null, eaten: 16 };
  const once = skippedOnce(opts);
  const framed = skippedFramed(opts, LAST_LANDING_SKIP_FRAME_MS);
  check(`16 pods blind, one step a frame (${framed.frames} frames): the same end state, every pod down`,
    framed.maxSteps === 1 && framed.end === once.end && podsDown(framed.pods), `${framed.frames} frames, equal ${framed.end === once.end}`);
});

// --- A pause between two frames (a hidden tab pauses the clock): let go at the next frame, the end unchanged ------------------
{
  const opts: ArmOpts = { autodrop: 2, eaten: 3 };
  const once = skippedOnce(opts);
  let paused = 0;
  const framed = skippedFramed(opts, 4, (frame) => {
    if (frame % 5 === 3 && state().landing.lastLanding !== null) {
      setPaused(h.store, true);
      paused++;
    }
  });
  check(`paused between frames ${paused} times (a hidden tab): each let go at the next frame, the same end state`,
    paused > 2 && framed.end === once.end && !state().clock.paused, `equal ${framed.end === once.end}`);
}

// --- While it runs: keys, a second call, the budget, a world reset --------------------------------------------------------------
{
  armLastLanding(h, { autodrop: 2, eaten: 3 });
  const page = fakePage(1);
  const started = skipLastLandingFrames(h.store, { schedule: page.schedule, now: page.now });
  const afterFirst = framedSkipProgress();
  const second = skipLastLandingFrames(h.store, { schedule: page.schedule, now: page.now });
  const tBefore = state().clock.tSec;
  h.press('Enter');
  const enterNothing = state().clock.tSec === tBefore && state().landing.lastLanding !== null;
  h.press('KeyP');
  const pNothing = !state().clock.paused;
  const muted = isMuted();
  h.press('KeyM');
  const mHeard = isMuted() !== muted;
  h.press('KeyM');
  check('while it runs: a second call returns false, [ENTER] does nothing, P is not heard, M is', started && !second && enterNothing && pNothing && mHeard
    && lastLandingSkipping() && state().landing.lastLanding?.skipped === true, JSON.stringify({ started, second, enterNothing, pNothing, mHeard }));
  // 1 ms a read: the first frame reads its start, then one per step, so it stops at the step that reaches 12 ms.
  check(`…a frame runs ${LAST_LANDING_SKIP_FRAME_MS} ms of steps (${afterFirst?.steps} at 1 ms a step), then yields`,
    afterFirst !== null && afterFirst.steps === LAST_LANDING_SKIP_FRAME_MS && afterFirst.frames === 1, JSON.stringify(afterFirst));
  page.drain((frame) => { if (frame === 2) resetWorld(); });
  check('…a world reset between two frames ends it: no frame flies on, nothing is skipping', !lastLandingSkipping() && framedSkipProgress() === null);
}

finish();
