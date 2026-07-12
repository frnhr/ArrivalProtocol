import type { GameState } from '@state/schema';
import type { SegmentType } from '@/types/segment';

// The terminal error model. Two distinct files govern the typing surface, each with its
// own corruption story:
//   • TERMINAL ('termcore') — the parser/dispatcher. Its health is the baseline roll on
//     every command anyone enters (including the assistant): as it corrupts, commands
//     misparse, drop, or misfire.
//   • ASSISTANT ('assist') — the aux persona. Its health governs the assistant itself:
//     how accurately it TYPES commands into the terminal for you, and whether its panel
//     runs the full GUI or collapses into SAFE MODE.
// Subsystem files (Engine I/O, Sensor Interp, …) add command-specific rolls on top of the
// terminal baseline. Rolled in order, the FIRST layer to fail owns the error and its class.

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

// Below this the assistant's panel falls back to SAFE MODE: the chat GUI is gone, replaced
// by a bare arrow-key menu with no history — the persona degrading in front of you.
export const SAFE_MODE_INTEGRITY = 60;

export interface ErrFile { rootId: string; types: readonly SegmentType[] }
export const TERMINAL_FILE: ErrFile = { rootId: 'termcore', types: ['tool'] };
export const ASSISTANT_FILE: ErrFile = { rootId: 'assist', types: ['tool'] };

// Integrity of the best usable copy of a logical file FOR THE ERROR ROLL. Deliberately
// distinct from selectors' bestLiveIntegrity: a file that is mid-repair ('repairing') or
// otherwise `operating` is treated as functional at its CURRENT integrity, NOT as offline —
// otherwise following the boot's own "scan and repair me" advice would spike errors to ~88%
// for the whole repair. Truly-offline states (deactivated / moving) and a deleted file DO
// count as unusable (integrity 0), so deleting either terminal file genuinely cripples it.
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

export type ErrLayer = 'terminal' | 'subsystem';
export interface ErrResult { layer: ErrLayer; integrity: number }

// Roll each file in the chain (terminal baseline first). The first to fail owns the error.
export function rollCommandError(state: GameState, subsystem: ErrFile[]): ErrResult | null {
  const chain: { file: ErrFile; layer: ErrLayer }[] = [
    { file: TERMINAL_FILE, layer: 'terminal' },
    ...subsystem.map((f) => ({ file: f, layer: 'subsystem' as ErrLayer })),
  ];
  for (const { file, layer } of chain) {
    const integ = errorFileIntegrity(state, file);
    if (Math.random() < pErrorFromIntegrity(integ)) return { layer, integrity: integ };
  }
  return null;
}

// Health of the Terminal parser (0 if deleted / deactivated) — drives the boot warning and
// the terminal's status dot.
export function terminalIntegrity(state: GameState): number {
  return errorFileIntegrity(state, TERMINAL_FILE);
}

// Health of the Assistant persona — drives its panel mode (GUI vs SAFE MODE) and its
// typing accuracy.
export function assistantIntegrity(state: GameState): number {
  return errorFileIntegrity(state, ASSISTANT_FILE);
}

// ── assistant typing mistakes ────────────────────────────────────────────
// When the assistant types a command for the player, it rolls its OWN file's S-curve.
// A failed roll mangles what it types — visibly, character by character — with nastier
// mistakes gated deeper into corruption (mirrors the manifestation gating in engine.ts):
//   any damage  → typo (transposed/substituted chars — bounces off the parser, harmless)
//   < 70        → wrong VALUE (types a different throttle than intended)
//   < 35        → wrong DIRECTION (retro ↔ pro — dangerous; burn auto-cut still protects)
export interface TypedCommand { text: string; mistake: boolean }
export function mangleCommand(cmd: string, integrity: number): TypedCommand {
  if (Math.random() >= pErrorFromIntegrity(integrity)) return { text: cmd, mistake: false };

  const roll = Math.random();
  if (integrity < 35 && roll < 0.25) {
    // Wrong direction — swap the pointing sense if present.
    if (/\bretro(grade)?\b/.test(cmd)) return { text: cmd.replace(/\bretro(grade)?\b/, 'pro'), mistake: true };
    if (/\bpro(grade)?\b/.test(cmd)) return { text: cmd.replace(/\bpro(grade)?\b/, 'retro'), mistake: true };
  }
  if (integrity < 70 && roll < 0.5) {
    // Wrong value — replace the first numeric token with a different one.
    const m = /\d+/.exec(cmd);
    if (m) {
      const n = parseInt(m[0], 10);
      const wrong = Math.max(10, Math.min(100, n + (Math.random() < 0.5 ? -1 : 1) * (25 + Math.floor(Math.random() * 40))));
      if (wrong !== n) return { text: cmd.replace(/\d+/, String(wrong)), mistake: true };
    }
  }
  // Typo — transpose two adjacent letters or substitute one (parser bounces it; the player
  // SEES the assistant fumble).
  const chars = cmd.split('');
  const letterIdx: number[] = [];
  chars.forEach((c, i) => { if (/[a-z]/i.test(c)) letterIdx.push(i); });
  if (letterIdx.length >= 2) {
    const k = letterIdx[Math.floor(Math.random() * (letterIdx.length - 1))]!;
    if (Math.random() < 0.5 && /[a-z]/i.test(chars[k + 1] ?? '')) {
      const t = chars[k]!; chars[k] = chars[k + 1]!; chars[k + 1] = t;   // transpose
    } else {
      chars[k] = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // substitute
    }
    const text = chars.join('');
    return { text, mistake: text !== cmd };
  }
  return { text: cmd, mistake: false };
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
