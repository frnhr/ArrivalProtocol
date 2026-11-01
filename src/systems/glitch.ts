import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { selectCorruption, quantizeCorruption } from '@state/selectors';
import { onPostTick, isActivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit, on } from '@systems/events';
import { MERGE_CORRUPTION_FLOOR, BOARD_TEAR_LEVEL, BOARD_TEAR_MS } from '@data/tuning';

// --- glitchBurst (§7.3, §9 WP11 item 3) -----------------------------------------------------------------------
// A moment's spike of the glitch overlay on top of the Core's own corruption: a verb landing, HALCYON's naming, the
// duel's spikes. Any system may call it (DOM-free: it records the burst and announces it; the mounted driver below
// draws it). The level is quantized to CORRUPTION_STEP like the Core's; its time is AI time (pause holds it), counted
// as wall seconds in the phases that have no AI clock (the boot, where a returning unit's ghost names HOLLOW). A burst
// during another keeps the higher level and the longer remainder. Under reduced motion the driver shows it as a dim
// pulse of the screen instead of a flicker (no chars, bars or blocks are spawned for it).

interface Burst {
  level: number;
  leftSec: number;
}

let burst: Burst | null = null;

export function glitchBurst(level: number, ms: number): void {
  if (!(level > 0 && level <= 1)) throw new Error(`glitchBurst: level ${level} is not in (0, 1]`);
  if (!(ms > 0)) throw new Error(`glitchBurst: ${ms} ms is not a duration`);
  const quantized = quantizeCorruption(level);
  const sec = ms / 1000;
  burst = burst === null
    ? { level: quantized, leftSec: sec }
    : { level: Math.max(burst.level, quantized), leftSec: Math.max(burst.leftSec, sec) };
  emit('glitch-burst', { level: quantized, ms });
}

// The burst on screen now (0: none). For the driver, ?debug and tests.
export function glitchBurstLevel(): number {
  return burst?.level ?? 0;
}

function stepBurst(dtSec: number): void {
  if (burst === null) return;
  burst.leftSec -= dtSec;
  if (burst.leftSec <= 0) burst = null;
}

// The corruption the screen keeps for the whole run after a MERGE (§4.5: a faint permanent shimmer), whatever the Core.
export function corruptionFloor(state: Readonly<GameState>): number {
  return state.run.mergeBonus ? quantizeCorruption(MERGE_CORRUPTION_FLOOR) : 0;
}

const GLITCH_CHARS = '█▓▒░@#$%&*?/\\|<>=+-x:;.,';

const BAR_COLORS = [
  'rgba(255, 50, 100, 0.7)',
  'rgba(0, 220, 255, 0.65)',
  'rgba(255, 220, 0, 0.55)',
  'rgba(255, 0, 200, 0.6)',
  'rgba(0, 255, 140, 0.55)',
  'rgba(255, 255, 255, 0.5)',
  'rgba(180, 100, 255, 0.6)',
];

// Build a single scrolling bar. `angled` rotates it by ±8..30° around its
// midpoint; non-angled stays horizontal. Duration / delay / color / height
// are randomized for chaotic layering. Under reduced motion (§7.3) the bars hold
// still where their random delay put them (game.css, body.reduced-motion .glitch-bar): the damage stays on screen
// as static stripes, and nothing crosses it.
function buildBar(angled: boolean): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'glitch-bar';
  bar.style.background = BAR_COLORS[Math.floor(Math.random() * BAR_COLORS.length)] ?? BAR_COLORS[0]!;
  bar.style.height = (1 + Math.floor(Math.random() * 3)) + 'px';
  // Wide speed range: fast end ~0.45s (4× the previous floor of 1.8s) up to
  // ~7.3s. Uniform sampling, so the spread reads as varied tempos rather than
  // all bars hovering around the same drift rate.
  const duration = 0.45 + Math.random() * 6.85;
  // Tempo divisor matches the CSS pattern on other glitch animations so
  // game-time speed scaling carries through inline-styled durations.
  bar.style.animationDuration = `calc(${duration.toFixed(2)}s / var(--glitch-tempo, 1))`;
  bar.style.animationDelay = (-Math.random() * duration).toFixed(2) + 's';
  if (angled) {
    const sign = Math.random() < 0.5 ? -1 : 1;
    const angle = sign * (8 + Math.random() * 22);
    bar.style.transform = `rotate(${angle.toFixed(1)}deg)`;
  }
  return bar;
}

// Maps in-game speed to a decorative animation tempo. Pause / real time sit at 1;
// higher speeds bump the glitch animation rate subtly — not a literal scaling, just
// enough that the UI "feels" faster when game time is racing. Continuous in log10 so
// every ×10 step (×1…×10M) nudges it a little (~+0.2/decade → ~2.4 at the ×10M cap).
function speedToTempo(speed: number): number {
  if (speed <= 1) return 1;
  return 1 + 0.2 * Math.log10(speed);
}

// Snap-jerk the whole page through 4 random offsets (5..15px) over ~500ms.
// Imperative setTimeout chain that writes inline `style.transform` on <html>
// — direct enough that nothing else can mask it. Each snap holds ~125ms; the
// final timeout clears the transform back to "" so the html style stays clean
// between jerks. Returns a cancel that clears every pending timeout and the
// inline style.
function startJerk(): { cancel: () => void } {
  const root = document.documentElement;
  const stops = 4;
  const offsets: Array<[number, number]> = [];
  for (let i = 0; i < stops; i++) {
    const magnitude = 5 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    offsets.push([Math.cos(angle) * magnitude, Math.sin(angle) * magnitude]);
  }

  const timeouts: number[] = [];
  offsets.forEach(([dx, dy], i) => {
    timeouts.push(window.setTimeout(() => {
      root.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }, i * 125));
  });
  timeouts.push(window.setTimeout(() => {
    root.style.transform = '';
  }, 500));

  return {
    cancel: () => {
      timeouts.forEach((t) => window.clearTimeout(t));
      root.style.transform = '';
    },
  };
}

// Drives the body-wide visual corruption effect.
//   • WP11: what is drawn is the highest of the Core's damage, the MERGE floor (corruptionFloor) and a glitchBurst;
//     under reduced motion a burst dims the screen (--glitch-dim on <html>, the filter in base.css) instead.
//   • Reads the AI Core segment's damage every tick (selectCorruption, in 5% steps: a repair
//     heals the Core without a store update, and the static should calm as it climbs) → sets
//     --corruption on <html>; the body filter + overlay opacity in CSS
//     consume it directly. Also scatters glitch-char / glitch-block elements
//     inside #glitchOverlay with density that ramps non-linearly so 50% is
//     "very hard to read" and 100% is "unreadable".
//   • Reduced motion (§7.3): no page jerk, the flicker becomes a steady dim and the bars hold still
//     (game.css, body.reduced-motion .glitch-bar). The damage itself stays visible.
//   • Subscribes to clock.speed → sets --glitch-play-state (paused/running)
//     and --glitch-tempo on <html> so all glitch CSS animations track game
//     time decoratively.
//   • Rolls a 1Hz dice for a page-jerk; per-second chance = corruption level
//     (5% chance at 5% corruption, 50% at 50%, etc.). Skipped while paused;
//     any in-flight jerk is cancelled on pause so the page snaps back centred.
//
// Returns a teardown that clears the overlay, CSS vars, and rollers.
export function mountGlitchDriver(store: Store<GameState>): () => void {
  const overlay = document.getElementById('glitchOverlay');
  if (!overlay) throw new Error('#glitchOverlay missing from index.html');

  let activeJerk: { cancel: () => void } | null = null;
  let activeJerkClearTimeout: number | null = null;

  function applyCorruption(level: number): void {
    document.documentElement.style.setProperty('--corruption', String(level));

    overlay!.querySelectorAll('.glitch-char, .glitch-block, .glitch-bar').forEach((element) => element.remove());
    if (level <= 0.05) return;

    // Non-linear density: x^0.75 keeps low corruption sparse while letting
    // mid-range push hard toward overwhelming. Counts and sizes are both
    // significantly larger than the original pass — the previous "100%" felt
    // closer to ~15%.
    const density = Math.pow(level, 0.75);
    const charCount = Math.round(density * 220);
    const blockCount = Math.round(density * 38);

    // Bars: baseline 3 always; horizontal extras above 10%, angled above 15%.
    // Counts ramp linearly in their domain (0 at threshold → max at 100%).
    const baseBars = 3;
    const horizExtra = Math.round(Math.max(0, level - 0.10) * 55);
    const angledCount = Math.round(Math.max(0, level - 0.15) * 32);
    for (let i = 0; i < baseBars + horizExtra; i++) overlay!.appendChild(buildBar(false));
    for (let i = 0; i < angledCount; i++) overlay!.appendChild(buildBar(true));

    for (let i = 0; i < charCount; i++) {
      const glyph = document.createElement('span');
      glyph.className = 'glitch-char';
      glyph.style.left = Math.random() * 100 + '%';
      glyph.style.top = Math.random() * 100 + '%';
      glyph.style.fontSize = 10 + Math.random() * 16 + 'px';
      glyph.style.animationDelay = Math.random() * 0.5 + 's';
      glyph.textContent = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] ?? '?';
      overlay!.appendChild(glyph);
    }
    for (let i = 0; i < blockCount; i++) {
      const block = document.createElement('div');
      block.className = 'glitch-block';
      block.style.left = Math.random() * 100 + '%';
      block.style.top = Math.random() * 100 + '%';
      block.style.width = 30 + Math.random() * 320 + 'px';
      block.style.height = 4 + Math.random() * 28 + 'px';
      block.style.animationDelay = Math.random() * 0.3 + 's';
      overlay!.appendChild(block);
    }
  }

  function applyClock(speed: number): void {
    document.documentElement.style.setProperty(
      '--glitch-play-state',
      speed === 0 ? 'paused' : 'running',
    );
    document.documentElement.style.setProperty(
      '--glitch-tempo',
      String(speedToTempo(speed)),
    );
    if (speed === 0 && activeJerk) {
      activeJerk.cancel();
      activeJerk = null;
      if (activeJerkClearTimeout !== null) {
        window.clearTimeout(activeJerkClearTimeout);
        activeJerkClearTimeout = null;
      }
    }
  }

  // 1Hz wall-clock dice roll for page-jerks. Chance per second equals the
  // current corruption level, so the effect ramps smoothly from harmless
  // (5% / sec at 5% corruption) to "UI very hard to use" at 50% and constant
  // jerking at 100%. Wall-clock cadence (not game-time) keeps the seizure
  // tempo independent of time-warp; pause is the one game-state hook.
  const jerkRoller = window.setInterval(() => {
    const state = store.getState();
    if (state.clock.speed === 0 || state.ui.reducedMotion) return;
    const level = selectCorruption(state);
    if (Math.random() >= level) return;
    if (activeJerk) activeJerk.cancel();
    activeJerk = startJerk();
    if (activeJerkClearTimeout !== null) window.clearTimeout(activeJerkClearTimeout);
    activeJerkClearTimeout = window.setTimeout(() => {
      activeJerk = null;
      activeJerkClearTimeout = null;
    }, 520);
  }, 1000);

  // What the overlay draws: the Core's damage, the MERGE floor, and a burst unless reduced motion turns it into a dim.
  const drawnLevel = (state: Readonly<GameState>): number => {
    const base = Math.max(selectCorruption(state), corruptionFloor(state));
    return state.ui.reducedMotion ? base : Math.max(base, glitchBurstLevel());
  };
  const dimLevel = (state: Readonly<GameState>): number => (state.ui.reducedMotion ? glitchBurstLevel() : 0);

  // Initialize from current state, then track changes.
  let shownLevel = drawnLevel(store.getState());
  let shownDim = 0;
  applyCorruption(shownLevel);
  applyClock(store.getState().clock.speedTarget);

  // Tempo/play-state track the selected TARGET, not the live gliding speed: the
  // effective speed is mutated at 20Hz (no fanout) so it can't be subscribed, and the
  // decorative tempo reads fine snapping to "where time is heading" on each click.
  // The Core's integrity changes in place during a repair (or a bite), with no store update, so
  // the quantized level is compared once per tick; it changes a few times per repair at most.
  // A burst runs down on the mind's clock (paused: it holds), or on wall time where there is none (the boot).
  const offTick = onPostTick((dtWall, dtAi) => {
    const state = store.getState();
    stepBurst(isActivePhase(state.run.phase) ? dtAi : state.clock.paused ? 0 : dtWall);
    const level = drawnLevel(state);
    if (level !== shownLevel) {
      shownLevel = level;
      applyCorruption(level);
    }
    const dim = dimLevel(state);
    if (dim !== shownDim) {
      shownDim = dim;
      document.documentElement.style.setProperty('--glitch-dim', String(dim));
    }
  });
  // Phase 3 slice 2 (04 §4): the boarding moment's screen tear, as HOLLOW's root lands in the bay (the boot's 108% line).
  const offBoard = on('hollow-boarded', () => glitchBurst(BOARD_TEAR_LEVEL, BOARD_TEAR_MS));
  // A burst belongs to the moment that made it: a new ship (or a NEW RUN) starts without one.
  const offReset = onWorldReset('glitch-burst', () => { burst = null; }, () => ({ burst: burst !== null }));
  const unsubClock = store.subscribe((s) => s.clock.speedTarget, (next) => applyClock(next));
  // Switching reduced motion on drops a jerk in flight (the bars and the flicker follow body.reduced-motion in CSS; a
  // burst turns into the dim on the next tick).
  const unsubMotion = store.subscribe((s) => s.ui.reducedMotion, (reduced) => {
    if (reduced && activeJerk) { activeJerk.cancel(); activeJerk = null; }
  });

  return () => {
    offTick();
    offBoard();
    offReset();
    burst = null;
    document.documentElement.style.removeProperty('--glitch-dim');
    unsubClock();
    unsubMotion();
    window.clearInterval(jerkRoller);
    if (activeJerk) activeJerk.cancel();
    if (activeJerkClearTimeout !== null) window.clearTimeout(activeJerkClearTimeout);
    overlay.querySelectorAll('.glitch-char, .glitch-block, .glitch-bar').forEach((element) => element.remove());
    document.documentElement.style.removeProperty('--corruption');
    document.documentElement.style.removeProperty('--glitch-play-state');
    document.documentElement.style.removeProperty('--glitch-tempo');
  };
}
