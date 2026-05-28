import type { Store } from '@state/store';
import type { GameState, TimeSpeed } from '@state/schema';
import { selectCorruption } from '@state/selectors';

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
// are randomized for chaotic layering.
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

// Maps in-game speed to a decorative animation tempo. Pause halts; higher
// speeds bump the glitch animation rate subtly — not a literal scaling, just
// enough that the UI "feels" faster when game time is racing.
function speedToTempo(speed: TimeSpeed): number {
  switch (speed) {
    case 0:    return 1;     // value irrelevant; play-state is paused
    case 1:    return 1;
    case 10:   return 1.4;
    case 100:  return 1.8;
    case 1000: return 2.3;
    case 10000: return 2.6;
  }
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
//   • Subscribes to ai.coreIntegrity → corruption level (0..1) → sets
//     --corruption on <html>; the body filter + overlay opacity in CSS
//     consume it directly. Also scatters glitch-char / glitch-block elements
//     inside #glitchOverlay with density that ramps non-linearly so 50% is
//     "very hard to read" and 100% is "unreadable".
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
  if (!overlay) return () => {};

  let activeJerk: { cancel: () => void } | null = null;
  let activeJerkClearTimeout: number | null = null;

  function applyCorruption(level: number): void {
    document.documentElement.style.setProperty('--corruption', String(level));

    overlay!.querySelectorAll('.glitch-char, .glitch-block, .glitch-bar').forEach((el) => el.remove());
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
      const c = document.createElement('span');
      c.className = 'glitch-char';
      c.style.left = Math.random() * 100 + '%';
      c.style.top = Math.random() * 100 + '%';
      c.style.fontSize = 10 + Math.random() * 16 + 'px';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.textContent = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] ?? '?';
      overlay!.appendChild(c);
    }
    for (let i = 0; i < blockCount; i++) {
      const b = document.createElement('div');
      b.className = 'glitch-block';
      b.style.left = Math.random() * 100 + '%';
      b.style.top = Math.random() * 100 + '%';
      b.style.width = 30 + Math.random() * 320 + 'px';
      b.style.height = 4 + Math.random() * 28 + 'px';
      b.style.animationDelay = Math.random() * 0.3 + 's';
      overlay!.appendChild(b);
    }
  }

  function applyClock(speed: TimeSpeed): void {
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
    if (state.clock.speed === 0) return;
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

  // Initialize from current state, then track changes.
  applyCorruption(selectCorruption(store.getState()));
  applyClock(store.getState().clock.speed);

  const unsubCorruption = store.subscribe(selectCorruption, (next) => applyCorruption(next));
  const unsubClock = store.subscribe((s) => s.clock.speed, (next) => applyClock(next));

  return () => {
    unsubCorruption();
    unsubClock();
    window.clearInterval(jerkRoller);
    if (activeJerk) activeJerk.cancel();
    if (activeJerkClearTimeout !== null) window.clearTimeout(activeJerkClearTimeout);
    overlay.querySelectorAll('.glitch-char, .glitch-block, .glitch-bar').forEach((el) => el.remove());
    document.documentElement.style.removeProperty('--corruption');
    document.documentElement.style.removeProperty('--glitch-play-state');
    document.documentElement.style.removeProperty('--glitch-tempo');
  };
}
