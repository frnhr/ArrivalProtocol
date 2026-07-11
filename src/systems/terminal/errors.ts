import type { GameState } from '@state/schema';
import type { SegmentType } from '@/types/segment';

// The terminal error model. Every command rolls against the health of the files it depends
// on; the chance of an error rises on a steep logistic (S-curve) with damage, so a pristine
// terminal is flawless and a badly-corrupted one is barely usable. The Terminal Assistant
// file is the baseline layer on every command; subsystem files (Engine I/O, Sensor Interp,
// …) add command-specific rolls on top. Rolled in order, the FIRST layer to fail owns the
// error and its class (a parse fault from the assistant vs an execution fault from a
// subsystem). Matches the product-of-success shape of selectEngineEffectiveness.

// p = 0.9 / (1 + e^(−9·(d − 0.55))). Deadzone at integrity > 90 (0%) — aligned with the
// game's "intact" threshold (createInitialMemory / WindowGrip use integrity > 90), so a
// file the UI shows as intact never rolls errors, and the status dot / boot warning use the
// same boundary. integrity 90/70/50/30/10 → 1.5% / 8.6% / 35% / 71% / 86%.
export const HEALTHY_INTEGRITY = 90;   // strictly above this = intact = error-free
export function pErrorFromIntegrity(integrity: number): number {
  if (integrity > HEALTHY_INTEGRITY) return 0;
  const d = Math.max(0, Math.min(1, (100 - integrity) / 100));
  return 0.9 / (1 + Math.exp(-9 * (d - 0.55)));
}

export interface ErrFile { rootId: string; types: readonly SegmentType[] }
export const ASSISTANT_FILE: ErrFile = { rootId: 'termasst', types: ['tool'] };

// Integrity of the best usable copy of a logical file FOR THE ERROR ROLL. Deliberately
// distinct from selectors' bestLiveIntegrity: a file that is mid-repair ('repairing') or
// otherwise `operating` is treated as functional at its CURRENT integrity, NOT as offline —
// otherwise following the boot's own "scan and repair me" advice would spike errors to ~88%
// for the whole repair. Truly-offline states (deactivated / moving) and a deleted file DO
// count as unusable (integrity 0), so deleting the assistant genuinely cripples the terminal.
const OFFLINE_STATES: ReadonlySet<string> = new Set(['inactive', 'offline', 'transferring']);
function errorFileIntegrity(state: GameState, file: ErrFile): number {
  let best = -1;
  for (const seg of state.memory) {
    if (!file.types.includes(seg.type) || !seg.id.startsWith(file.rootId) || !('integrity' in seg)) continue;
    const st = 'state' in seg ? seg.state : undefined;
    if (st !== undefined && OFFLINE_STATES.has(st)) continue;
    if (seg.integrity > best) best = seg.integrity;
  }
  return best < 0 ? 0 : best;
}

export type ErrLayer = 'assistant' | 'subsystem';
export interface ErrResult { layer: ErrLayer; integrity: number }

// Integrity of the Terminal Assistant (0 if deleted / deactivated) — drives the boot
// warning and the terminal's status dot. Matches the error roll's view (repairing counts).
export function assistantIntegrity(state: GameState): number {
  return errorFileIntegrity(state, ASSISTANT_FILE);
}

// Roll each file in the chain (assistant first). The first to fail owns the error. A
// missing / offline (repairing) file counts as integrity 0 — maximum unreliability.
export function rollCommandError(state: GameState, subsystem: ErrFile[]): ErrResult | null {
  const chain: { file: ErrFile; layer: ErrLayer }[] = [
    { file: ASSISTANT_FILE, layer: 'assistant' },
    ...subsystem.map((f) => ({ file: f, layer: 'subsystem' as ErrLayer })),
  ];
  for (const { file, layer } of chain) {
    const integ = errorFileIntegrity(state, file);
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
