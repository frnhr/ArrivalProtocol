import { scrambleDigits, newMask } from '@systems/garble';
import { SCRAMBLE_HZ } from '@data/tuning';

// Damaged Telemetry's digits (C3): a view applies one scrambler per readout. The holes re-roll at
// most SCRAMBLE_HZ (wall clock, cosmetic: Math.random like the glitch), while the number under
// them stays live, so a damaged readout flickers like a bad signal instead of strobing.

// Long enough for any readout (`99,999 km`, `≈12,345 km`); positions past it reuse the mask.
const MASK_LENGTH = 16;

interface Scrambler {
  apply(text: string, fraction: number): string;
}

export function createScrambler(): Scrambler {
  let mask = newMask(MASK_LENGTH);
  let rolledAt = -Infinity;
  return {
    apply(text, fraction) {
      if (fraction <= 0) return text;
      const now = performance.now();
      if (now - rolledAt >= 1000 / SCRAMBLE_HZ) {
        mask = newMask(MASK_LENGTH);
        rolledAt = now;
      }
      return scrambleDigits(text, fraction, mask);
    },
  };
}
