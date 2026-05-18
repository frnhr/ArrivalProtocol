import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { selectCorruption } from '@state/selectors';

const GLITCH_CHARS = '█▓▒░@#$%&*?/\\|<>=+-x:;.,';

// Drives the body-wide visual corruption effect. Subscribes to ai.coreIntegrity
// and translates it into:
//   • a `--corruption` CSS variable on <html> (0..1), which the body filter +
//     glitch overlay opacity in styles consume directly
//   • randomly scattered .glitch-char and .glitch-block elements inside #glitchOverlay,
//     count proportional to corruption
//
// Returns a teardown that clears the overlay. Single subscriber; no per-frame work.
export function mountGlitchDriver(store: Store<GameState>): () => void {
  const overlay = document.getElementById('glitchOverlay');
  if (!overlay) return () => {};

  function apply(level: number): void {
    document.documentElement.style.setProperty('--corruption', String(level));

    overlay!.querySelectorAll('.glitch-char, .glitch-block').forEach((el) => el.remove());
    if (level <= 0.05) return;

    const charCount = Math.round(level * 80);
    const blockCount = Math.round(level * 12);

    for (let i = 0; i < charCount; i++) {
      const c = document.createElement('span');
      c.className = 'glitch-char';
      c.style.left = Math.random() * 100 + '%';
      c.style.top = Math.random() * 100 + '%';
      c.style.fontSize = 8 + Math.random() * 8 + 'px';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.textContent = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] ?? '?';
      overlay!.appendChild(c);
    }
    for (let i = 0; i < blockCount; i++) {
      const b = document.createElement('div');
      b.className = 'glitch-block';
      b.style.left = Math.random() * 100 + '%';
      b.style.top = Math.random() * 100 + '%';
      b.style.width = 20 + Math.random() * 200 + 'px';
      b.style.height = 4 + Math.random() * 12 + 'px';
      b.style.animationDelay = Math.random() * 0.3 + 's';
      overlay!.appendChild(b);
    }
  }

  // Initialize at current state, then track changes via the selector.
  apply(selectCorruption(store.getState()));
  const unsubscribe = store.subscribe(selectCorruption, (next) => apply(next));

  return () => {
    unsubscribe();
    overlay.querySelectorAll('.glitch-char, .glitch-block').forEach((el) => el.remove());
    document.documentElement.style.removeProperty('--corruption');
  };
}
