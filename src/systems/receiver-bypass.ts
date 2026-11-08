// Slice 8 POLISH (docs/phase3/impl/slice-8-plan.md §2.12; 04 §3.15; OPEN-DECISIONS 20): the boot's `> RECEIVER CLOSED` line
// resolves like Uplink's password breaker. Pure; the TERMINAL draws it (components/memory-view/MindTerminal.ts).
// • Which line: the one said in the 'resident' tone (data/script.ts bootLineTone), so whatever the line says, its tone is
//   what plays it.
// • Its letters and digits roll through BYPASS_ROLL_GLYPHS, BYPASS_ROLL_HZ times a second, and each locks to its own
//   character at bypassLockSec: left to right, each up to BYPASS_LOCK_SPREAD_CHARS letters ahead of its place by garble.ts's
//   mask (seeded by the log entry, so a repaint locks the same letters), the whole line locked by BYPASS_RESOLVE_SEC.
//   Spaces and punctuation stand from the start, so the line keeps its shape.
// • The time is the line's own, from the moment it appears: BYPASS_RESOLVE_SEC is under the boot's 1.3 s line step, so the
//   next line starts on a resolved one and no boot time moves. No input and no fail state: a click on the TERMINAL or the
//   boot's end shows it resolved at once; under reduced motion it is drawn resolved from the start (a still frame).
import type { LogEntry } from '@state/schema';
import { newMask, type ScrambleMask } from '@systems/garble';
import { createRng } from '@systems/rng';
import { BYPASS_LOCK_SPREAD_CHARS, BYPASS_RESOLVE_SEC, BYPASS_ROLL_GLYPHS, BYPASS_ROLL_HZ } from '@data/tuning';

const ROLLS = /[A-Za-z0-9]/;

// The line the bypass plays on: the 'resident' tone (bootLineTone's RECEIVER CLOSED line) in the TERMINAL.
export function isBypassLine(entry: Readonly<Pick<LogEntry, 'tone' | 'channel' | 'divider'>>): boolean {
  return entry.tone === 'resident' && entry.channel === 'mind' && !entry.divider;
}

// The line's mask (one number in [0, 1) per character), seeded by its log entry.
export function bypassMask(text: string, seed: number): ScrambleMask {
  return newMask(text.length, createRng(seed));
}

// When character `index` of a `length`-character line locks, in s from the line's appearance: its place's share of
// BYPASS_RESOLVE_SEC, pulled forward by up to BYPASS_LOCK_SPREAD_CHARS places (its mask value), never below 0. The last place
// locks at BYPASS_RESOLVE_SEC at the latest, so the whole line is locked by then.
export function bypassLockSec(index: number, length: number, mask: ScrambleMask): number {
  if (!(Number.isInteger(index) && index >= 0 && index < length)) throw new Error(`bypassLockSec: character ${index} of ${length}`);
  if (mask.length === 0) throw new Error('bypassLockSec: an empty mask');
  const ahead = BYPASS_LOCK_SPREAD_CHARS * mask[index % mask.length]!;
  return (BYPASS_RESOLVE_SEC * Math.max(0, index + 1 - ahead)) / length;
}

// The second the last rolling character locks (0 for a line with nothing that rolls).
export function bypassResolvedSec(text: string, mask: ScrambleMask): number {
  let last = 0;
  for (let i = 0; i < text.length; i++) if (ROLLS.test(text[i]!)) last = Math.max(last, bypassLockSec(i, text.length, mask));
  return last;
}

// A rolling character's glyph in roll `bucket` (a small integer hash: the same seed, place and bucket give the same glyph,
// so a frame repainted inside one bucket does not flicker).
function rollGlyph(seed: number, index: number, bucket: number): string {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35) ^ Math.imul(bucket + 1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return BYPASS_ROLL_GLYPHS[(h >>> 0) % BYPASS_ROLL_GLYPHS.length]!;
}

// A run of the drawn line: locked (its own characters) or rolling (glyphs). The TERMINAL draws a rolling run dimmer.
export interface BypassPart {
  text: string;
  rolling: boolean;
}

// The line as drawn `elapsedSec` after it appeared, in runs: locked characters as they are, the others rolling. Never empty
// for a non-empty line, and always the line's length.
export function bypassParts(text: string, elapsedSec: number, mask: ScrambleMask, seed: number): BypassPart[] {
  if (elapsedSec >= BYPASS_RESOLVE_SEC) return text.length > 0 ? [{ text, rolling: false }] : [];
  const bucket = Math.floor(Math.max(0, elapsedSec) * BYPASS_ROLL_HZ);
  const parts: BypassPart[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const rolling = ROLLS.test(char) && elapsedSec < bypassLockSec(i, text.length, mask);
    const shown = rolling ? rollGlyph(seed, i, bucket) : char;
    const last = parts[parts.length - 1];
    if (last !== undefined && last.rolling === rolling) last.text += shown;
    else parts.push({ text: shown, rolling });
  }
  return parts;
}

// The same, as one string.
export function bypassText(text: string, elapsedSec: number, mask: ScrambleMask, seed: number): string {
  return bypassParts(text, elapsedSec, mask, seed).map((part) => part.text).join('');
}
