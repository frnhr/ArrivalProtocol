import { createRng } from '@systems/rng';
import { SCRAMBLE_GLYPH } from '@data/tuning';

// A bad signal on screen (C3 Telemetry, C6 AI Comms): characters the damaged file lost are shown
// as ▓. Pure. A view decides WHICH characters are lost with a mask (one number in [0, 1) per
// character position): a character is lost when its mask value is below the loss fraction, so a
// file getting worse only ever adds holes, and a view that re-rolls its mask at most SCRAMBLE_HZ
// keeps the holes still between rolls while the live numbers underneath keep changing.
//
// The masks for the Telemetry digits are cosmetic (Math.random, like the glitch jerk); a CONTROL
// line's mask is seeded by its log entry, so COMMS and the ticker lose the same letters.

export type ScrambleMask = readonly number[];

const DIGIT = /[0-9]/;
const LETTER_OR_DIGIT = /[A-Za-z0-9]/;

function lose(text: string, fraction: number, mask: ScrambleMask, keep: RegExp): string {
  if (fraction <= 0) return text;
  // An empty mask would lose nothing at all: a view bug that hid every ▓, so it fails loudly.
  if (mask.length === 0 && text.length > 0) throw new Error('garble: an empty mask for a damaged signal');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const roll = mask[i % mask.length]!;
    out += keep.test(char) && (fraction >= 1 || roll < fraction) ? SCRAMBLE_GLYPH : char;
  }
  return out;
}

// Telemetry and the plot readouts: only the digits go, so `12,345 km` reads `1▓,3▓5 km`, a
// number you can see is broken rather than a wrong number.
export function scrambleDigits(text: string, fraction: number, mask: ScrambleMask): string {
  return lose(text, fraction, mask, DIGIT);
}

// A CONTROL line on a damaged radio: letters and digits go, spaces and punctuation stay, so the
// line keeps its shape (`Your R▓PA▓R lic▓nce is ap▓roved. :)`).
export function garbleText(text: string, fraction: number, seed: number): string {
  if (fraction <= 0) return text;
  return lose(text, fraction, newMask(text.length, createRng(seed)), LETTER_OR_DIGIT);
}

// A fresh mask of `length` positions from `roll` (Math.random for cosmetic masks).
export function newMask(length: number, roll: () => number = Math.random): number[] {
  return Array.from({ length }, () => roll());
}
