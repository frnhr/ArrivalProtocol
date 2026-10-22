import type { PresetMode } from '@state/schema';
import { splitKeyCaps, PRESET_KEY, PRESET_NAME, type TextPart } from '@systems/flight-hud';

// Fills `target` with text and <kbd class="keycap"> nodes built from the "[KEY]" notation the
// guidance and HUD models use. Real DOM nodes, never innerHTML, so no text can inject markup.
//
// A phone has no keyboard (§9 WP12 item 3), so every cap also carries the name of the on-screen control that does
// the same (`data-touch`: [SPACE] is the BURN button, [D] the OUT preset, [F] the ▸▸ SKIP button), and the phone
// stylesheet draws that name instead of the key. The key stays the cap's text, so desktop and every reader of the
// text are unchanged. Two cases read wrong on a phone and are marked for the stylesheet to drop there:
// • the control's OWN key on its own button (`HOLD [SPACE] · BURN` on BURN, `[D] OUT` on OUT): the cap goes, with the
//   word or dot that tied it to the text (`· `, `or `, `PRESS `), so BURN reads `HOLD · BURN` and a hint `click or
//   [SPACE] to go on` reads `click to go on`;
// • the control's name right after its cap (`press [D] (OUT)`, `· or [B] AUTO`), which would say it twice.

export interface CapOptions {
  // The key whose control this text is on (the BURN button's SPACE): dropped on a phone.
  own?: string;
  // What [TAB] names on a phone: the screen the line's controls are on (the strip's SHIP / MIND); else ⇄.
  tab?: string;
}

const PRESET_TOUCH: Record<string, string> = Object.fromEntries(
  (Object.keys(PRESET_KEY) as PresetMode[]).map((mode) => [PRESET_KEY[mode], PRESET_NAME[mode]]),
);

// The on-screen control each key stands for. A key with no control here (the draft's digits, ENTER) has no touch
// name, and its container hides it on a phone.
const TOUCH_CAP_LABEL: Readonly<Record<string, string>> = {
  SPACE: 'BURN',
  F: '▸▸',
  P: '❚❚',
  M: '♪',
  B: 'AUTO',
  Q: '↺',
  E: '↻',
  TAB: '⇄',
  ...PRESET_TOUCH,
};

// The words that tie a dropped own cap to the text before it: `or` and `PRESS` always go with it (there is nothing
// else to press), a dot only when the cap ends the text (`AUTO · [B]`; in `HOLD [SPACE] · BURN` it still separates
// two words). A cap that opens the text takes the space or dot after it.
const OWN_TIE_WORD = /\s*\b(?:or|PRESS|press)\s*$/;
const OWN_TIE_DOT = /\s*·\s*$/;
const OWN_TIE_SPACE = /\s*$/;
const OWN_GAP_AFTER = /^\s*(?:·\s*)?/;

function touchLabel(key: string, options: CapOptions = {}): string | null {
  if (key === 'TAB' && options.tab !== undefined) return options.tab;
  return TOUCH_CAP_LABEL[key] ?? null;
}

export function renderKeyCaps(target: HTMLElement, text: string, options: CapOptions = {}): void {
  renderParts(target, splitKeyCaps(text), options);
}

// One piece of the rendered text: plain, a cap, or a stretch of plain text a phone drops.
interface Piece {
  text: string;
  cap?: { touch: string | null; own: boolean };
  phoneDrops?: 'own-gap' | 'dup';
}

// The pieces of `parts` with the phone's marks (pure: tests/wp12/p2/keycaps.test.ts runs it headless).
export function capPieces(parts: readonly TextPart[], options: CapOptions = {}): Piece[] {
  const pieces: Piece[] = [];
  let dropNextGap = false;
  parts.forEach((part, i) => {
    if (part.key) {
      const own = options.own !== undefined && part.text === options.own;
      if (own) {
        const previous = pieces[pieces.length - 1];
        if (previous && !previous.cap && !previous.phoneDrops) {
          const last = parts.slice(i + 1).every((later) => !later.key && later.text.trim().length === 0);
          let kept = previous.text;
          let gap = OWN_TIE_WORD.exec(kept)?.[0] ?? OWN_TIE_SPACE.exec(kept)?.[0] ?? '';
          kept = kept.slice(0, kept.length - gap.length);
          if (last) {
            const dot = OWN_TIE_DOT.exec(kept)?.[0] ?? '';
            kept = kept.slice(0, kept.length - dot.length);
            gap = dot + gap;
          }
          previous.text = kept;
          if (kept.length === 0) pieces.pop();
          if (gap.length > 0) pieces.push({ text: gap, phoneDrops: 'own-gap' });
        } else if (!previous) dropNextGap = true;
      }
      pieces.push({ text: part.text, cap: { touch: touchLabel(part.text, options), own } });
      return;
    }
    let text = part.text;
    if (dropNextGap) {
      dropNextGap = false;
      const gap = OWN_GAP_AFTER.exec(text)?.[0] ?? '';
      if (gap.length > 0) {
        pieces.push({ text: gap, phoneDrops: 'own-gap' });
        text = text.slice(gap.length);
      }
    }
    // `[D] (OUT)` / `[B] AUTO`: the control's name right after its (kept) cap.
    const before = i > 0 ? parts[i - 1] : undefined;
    const touch = before?.key === true && before.text !== options.own ? touchLabel(before.text, options) : null;
    if (touch !== null) {
      const escaped = touch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dup = new RegExp(`^ (?:\\(${escaped}\\)|${escaped}(?![A-Z]))`).exec(text)?.[0];
      if (dup) {
        pieces.push({ text: dup, phoneDrops: 'dup' });
        text = text.slice(dup.length);
      }
    }
    if (text.length > 0) pieces.push({ text });
  });
  return pieces;
}

// The same from already split parts (the typed objective strip reveals them a few at a time).
export function renderParts(target: HTMLElement, parts: readonly TextPart[], options: CapOptions = {}): void {
  const nodes = capPieces(parts, options).map((piece): Node => {
    if (piece.cap) {
      const cap = document.createElement('kbd');
      cap.className = piece.cap.own ? 'keycap cap-own' : 'keycap';
      cap.textContent = piece.text;
      if (piece.cap.touch !== null) cap.dataset.touch = piece.cap.touch;
      return cap;
    }
    if (piece.phoneDrops) {
      const span = document.createElement('span');
      span.className = piece.phoneDrops === 'own-gap' ? 'cap-own-gap' : 'cap-dup';
      span.textContent = piece.text;
      return span;
    }
    return document.createTextNode(piece.text);
  });
  target.replaceChildren(...nodes);
}
