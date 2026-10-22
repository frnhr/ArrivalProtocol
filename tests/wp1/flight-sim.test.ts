// WP1 acceptance 2: ship-1 flight scenarios, driven through the real clock/sim/predictor/pace
// and (for the followers) the real input router and guidance table.
import { createHarness, check, finish, TICK, type Harness } from './harness';
import { sweetZone } from '@systems/predict';
import type { Pace } from '@state/schema';

const harness = createHarness(1);
const MAX_WALL = 400;

function runUntilDone(h: Harness, maxWall = MAX_WALL): void {
  while (h.status() === 'approaching' && h.wall() < maxWall) h.step();
}

function summary(h: Harness): string {
  const burn = h.store.getState().burn;
  return `status=${burn.status} wall=${h.wall().toFixed(2)}s fuel=${burn.fuelPct.toFixed(1)}% rp=${Math.round(h.rp())}`;
}

// --- (a) competent pilot ---------------------------------------------------------------
// OUT until rp ≥ 6,000; release; RETRO; hold from the burn point until in ring; release.
function competentPilot(h: Harness, outStopRp: number, onTick?: () => void): void {
  h.keyDown('Space');
  while (h.rp() < outStopRp && h.status() === 'approaching' && h.wall() < MAX_WALL) { h.step(); onTick?.(); }
  h.keyUp('Space');
  h.press('KeyS');
  while (h.status() === 'approaching' && h.wall() < MAX_WALL) {
    const bp = h.burnPointTac();
    if (bp !== null && bp <= 0) break;
    h.step(); onTick?.();
  }
  h.keyDown('Space');
  while (!h.inRing() && h.status() === 'approaching' && h.store.getState().burn.fuelPct > 0 && h.wall() < MAX_WALL) {
    h.step(); onTick?.();
  }
  h.keyUp('Space');
  while (h.status() === 'approaching' && h.wall() < MAX_WALL) { h.step(); onTick?.(); }
}

{
  harness.reset();
  competentPilot(harness, 6000);
  const state = harness.store.getState();
  check('(a) competent pilot locks', state.burn.status === 'locked', summary(harness));
  check('(a) within 240 wall-s', harness.wall() <= 240, `${harness.wall().toFixed(1)} s`);
  check('(a) fuel ≥ 30%', state.burn.fuelPct >= 30, `${state.burn.fuelPct.toFixed(1)}%`);
}

// --- (b) idle pilot crashes at 163 ± 5 wall-s -------------------------------------------
{
  harness.reset();
  const impactTacAtStart = harness.countdown();
  runUntilDone(harness);
  check('(b) idle pilot crashes', harness.status() === 'crashed', summary(harness));
  check('(b) at 163 ± 5 wall-s', Math.abs(harness.wall() - 163) <= 5,
    `${harness.wall().toFixed(2)} s (opening countdown ${impactTacAtStart?.kind} ${impactTacAtStart?.tacSec.toFixed(1)} tac s)`);
}

// --- (c) negative case: stop OUT at rp 3,400, then RETRO at ▼ ---------------------------
{
  harness.reset();
  competentPilot(harness, 3400);
  check('(c) stopping OUT at 3,400 never locks', harness.status() !== 'locked', summary(harness));
}

// --- (d)/(e) the literal follower ----------------------------------------------------------
// A scripted kid who obeys only the objective strip, reacting 0.4 s after each new line.
const REACTION_SEC = 0.4;
const RELEASE_WORDS = /RELEASE|TOO EARLY|WAIT|TURN AROUND/;
const HOLD_WORDS = /hold \[SPACE\]|KEEP HOLDING|NOW/;

interface Mistake {
  name: string;
  // Called every tick before the follower reacts. Returns true while the mistake owns the
  // controls (the follower is ignored meanwhile).
  apply: (h: Harness, ctx: { holding: boolean; setHolding: (on: boolean) => void }) => boolean;
}

interface FollowerLog {
  texts: string[];
  paces: Set<Pace>;
}

function follow(h: Harness, mistake: Mistake | null): FollowerLog {
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) h.keyDown('Space');
    if (!on && holding) h.keyUp('Space');
    holding = on;
  };
  const react = (text: string): void => {
    const keyMatch = text.match(/press \[([WASD])\]/);
    if (RELEASE_WORDS.test(text)) {
      setHolding(false);
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
      if (/^WAIT/.test(text)) h.press('KeyF');
      return;
    }
    if (keyMatch) h.press(`Key${keyMatch[1]}`);
    if (HOLD_WORDS.test(text)) setHolding(true);
  };

  const log: FollowerLog = { texts: [], paces: new Set() };
  const queue: { at: number; text: string }[] = [];
  let lastText = '';
  let suspended = false;
  while (h.status() === 'approaching' && h.wall() < MAX_WALL) {
    h.step();
    log.paces.add(h.pace());
    const shown = h.shownObjective();
    const text = shown?.text ?? '';
    const mistakeActive = mistake ? mistake.apply(h, { holding, setHolding }) : false;
    if (mistakeActive) { suspended = true; queue.length = 0; continue; }
    if (suspended) { suspended = false; lastText = ''; } // back from the mistake: re-read the strip
    if (text !== lastText) {
      lastText = text;
      if (text) {
        queue.push({ at: h.wall() + REACTION_SEC, text });
        if (log.texts[log.texts.length - 1] !== text) log.texts.push(text);
      }
    }
    while (queue.length > 0 && queue[0]!.at <= h.wall() + 1e-9) react(queue.shift()!.text);
  }
  setHolding(false);
  return log;
}

function idsOf(texts: string[]): string {
  // Collapse ticking countdowns so the printed script stays readable.
  const collapsed: string[] = [];
  for (const text of texts) {
    const generic = text.replace(/\d+:\d\d/g, 'm:ss');
    if (collapsed[collapsed.length - 1] !== generic) collapsed.push(generic);
  }
  return collapsed.join('\n      ');
}

{
  harness.reset();
  const log = follow(harness, null);
  check('(d) literal follower locks', harness.status() === 'locked', summary(harness));
  console.log(`      script:\n      ${idsOf(log.texts)}`);
}

const MISTAKES: Mistake[] = [
  (() => {
    // A 2 s RETRO burn 60 tactical s before the burn point.
    let started = -1;
    let done = false;
    return {
      name: '2 s RETRO 60 tac s early',
      apply(h, ctx) {
        if (done) return false;
        const bp = h.burnPointTac();
        const coasting = h.store.getState().burn.sasMode === 'retrograde' && !h.store.getState().burn.firing;
        if (started < 0 && coasting && bp !== null && bp <= 60 && h.pred().outcome === 'open') {
          started = h.wall();
          ctx.setHolding(true);
        }
        if (started < 0) return false;
        if (h.wall() - started >= 2) { ctx.setHolding(false); done = true; return false; }
        return true;
      },
    };
  })(),
  (() => {
    // Keep holding 2 s past RELEASE when green.
    let started = -1;
    let done = false;
    return {
      name: 'hold 2 s past RELEASE when green',
      apply(h, ctx) {
        if (done) return false;
        if (started < 0 && h.shownObjective()?.id === 'F3' && ctx.holding) started = h.wall();
        if (started < 0) return false;
        if (h.wall() - started >= 2) { done = true; return false; }
        return true;
      },
    };
  })(),
  (() => {
    // Start the capture 10 tactical s late: ignore the strip for 10 tac s from HOLD NOW.
    let started = -1;
    let done = false;
    return {
      name: 'capture 10 tac s late',
      apply(h) {
        if (done) return false;
        if (started < 0 && h.shownObjective()?.id === 'F10-now') started = h.store.getState().clock.tSec;
        if (started < 0) return false;
        const lateTac = (h.store.getState().clock.tSec - started) / h.store.getState().level.tacticalWarp;
        if (lateTac >= 10) { done = true; return false; }
        return true;
      },
    };
  })(),
];

for (const mistake of MISTAKES) {
  harness.reset();
  const log = follow(harness, mistake);
  const status = harness.status();
  check(`(e) follower + mistake '${mistake.name}' ends locked/accepted`,
    status === 'locked' || status === 'accepted', summary(harness));
  console.log(`      script:\n      ${idsOf(log.texts)}`);
}

// --- (f) the main countdown never increases with no trajectory change --------------------
{
  harness.reset();
  // Fly the correction and the flip by hand, then coast: CRUISE → SKIP → CRUISE → TACTICAL.
  harness.keyDown('Space');
  while (harness.rp() < 6000) harness.step();
  harness.keyUp('Space');
  harness.press('KeyS');
  let previous = Infinity;
  let increases = 0;
  let worst = 0;
  const paces = new Set<Pace>();
  let skipRequested = false;
  let coastTicks = 0;
  while (harness.status() === 'approaching' && harness.wall() < MAX_WALL) {
    harness.step();
    coastTicks++;
    const countdown = harness.countdown();
    if (!countdown || countdown.kind !== 'burn') break;
    paces.add(harness.pace());
    if (countdown.tacSec > previous) { increases++; worst = Math.max(worst, countdown.tacSec - previous); }
    previous = countdown.tacSec;
    // Let CRUISE run a few seconds, then SKIP.
    if (!skipRequested && coastTicks > 100) {
      harness.press('KeyF');
      skipRequested = true;
    }
  }
  check('(f) countdown monotonic across pace changes', increases === 0,
    `${increases} increases (worst +${worst.toExponential(2)} tac s)`);
  check('(f) saw CRUISE, SKIP and TACTICAL', paces.has('cruise') && paces.has('skip') && paces.has('tactical'),
    [...paces].join(','));
}

// --- (g) the lock hold lasts 3.0 ± 0.1 wall-s ---------------------------------------------
{
  harness.reset();
  let quietGreenSince = -1;
  let holdWall = -1;
  competentPilot(harness, 6000, () => {
    const state = harness.store.getState();
    const quietGreen = harness.inRing() && state.burn.lastTickDvKmS === 0;
    if (quietGreen && quietGreenSince < 0) quietGreenSince = harness.wall() - TICK;
    if (!quietGreen) quietGreenSince = -1;
    if (state.burn.status === 'locked' && holdWall < 0 && quietGreenSince >= 0) holdWall = harness.wall() - quietGreenSince;
  });
  check('(g) lock hold lasts 3.0 ± 0.1 wall-s', harness.status() === 'locked' && Math.abs(holdWall - 3) <= 0.1,
    `${holdWall.toFixed(3)} s`);
}

// Sweet-zone sanity (documents the ship-1 numbers the scenarios rely on).
{
  const sweet = sweetZone(harness.store.getState().level.ring);
  check('ship 1 sweet zone is 6,000–8,000 km', sweet.lo === 6000 && sweet.hi === 8000, `${sweet.lo}–${sweet.hi}`);
}

finish();
