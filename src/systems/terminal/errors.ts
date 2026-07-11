import type { GameState } from '@state/schema';
import type { SegmentType } from '@/types/segment';
import { bestLiveIntegrity } from '@state/selectors';

// The terminal error model. Every command rolls against the health of the files it depends
// on; the chance of an error rises on a steep logistic (S-curve) with damage, so a pristine
// terminal is flawless and a badly-corrupted one is barely usable. The Terminal Assistant
// file is the baseline layer on every command; subsystem files (Engine I/O, Sensor Interp,
// …) add command-specific rolls on top. Rolled in order, the FIRST layer to fail owns the
// error and its class (a parse fault from the assistant vs an execution fault from a
// subsystem). Matches the product-of-success shape of selectEngineEffectiveness.

// p = 0.9 / (1 + e^(−9·(d − 0.55))), with a hard deadzone at integrity ≥ 92 (0%).
// integrity 100/90/70/50/30/10  →  0% / 1.5% / 8.6% / 35% / 71% / 86%.
export function pErrorFromIntegrity(integrity: number): number {
  if (integrity >= 92) return 0;
  const d = Math.max(0, Math.min(1, (100 - integrity) / 100));
  return 0.9 / (1 + Math.exp(-9 * (d - 0.55)));
}

export interface ErrFile { rootId: string; types: readonly SegmentType[] }
export const ASSISTANT_FILE: ErrFile = { rootId: 'termasst', types: ['tool'] };

export type ErrLayer = 'assistant' | 'subsystem';
export interface ErrResult { layer: ErrLayer; integrity: number }

// Live integrity of the Terminal Assistant (0 if deleted / offline) — drives the boot
// warning and the terminal's status dot.
export function assistantIntegrity(state: GameState): number {
  return bestLiveIntegrity(state, ASSISTANT_FILE.rootId, ASSISTANT_FILE.types) ?? 0;
}

// Roll each file in the chain (assistant first). The first to fail owns the error. A
// missing / offline (repairing) file counts as integrity 0 — maximum unreliability.
export function rollCommandError(state: GameState, subsystem: ErrFile[]): ErrResult | null {
  const chain: { file: ErrFile; layer: ErrLayer }[] = [
    { file: ASSISTANT_FILE, layer: 'assistant' },
    ...subsystem.map((f) => ({ file: f, layer: 'subsystem' as ErrLayer })),
  ];
  for (const { file, layer } of chain) {
    const integ = bestLiveIntegrity(state, file.rootId, file.types) ?? 0;
    if (Math.random() < pErrorFromIntegrity(integ)) return { layer, integrity: integ };
  }
  return null;
}

// Corrupt text for the "garbled output" manifestation — swap a fraction of glyphs.
const GLITCH = '█▓▒░@#%&*?/\\<>=+';
export function garble(text: string, intensity: number): string {
  let out = '';
  for (const c of text) {
    out += c !== ' ' && Math.random() < intensity
      ? GLITCH[Math.floor(Math.random() * GLITCH.length)]!
      : c;
  }
  return out;
}
