import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on, emit } from '@systems/events';
import { onWorldReset } from '@systems/reset';
import { requireById, replayAnimation } from '@components/dom';
import { glitchBurst } from '@systems/glitch';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { HOLLOW_NAME_DECODE_MS, HOLLOW_NAME_SEEN_DELAY_SEC, GLITCH_BURST_LEVEL, GLITCH_BURST_MS } from '@data/tuning';

// HOLLOW names itself (§1 reveal 2, §5.1 2:50, §9 WP7 item 5): the story's second turn, given the same
// care as the STASIS reveal. 0.4 s after `> i was 046. they sent me first.` has typed (systems/hollow.ts),
// every hollow block is renamed in the store; this is the moment on screen:
// • on every hollow block, `???` decodes into UNIT-046 through static, a letter at a time, while the whole screen
//   glitches for a moment (WP11: glitchBurst(0.3, 400), which replaced WP7's pink pulse on the chips; under reduced
//   motion it is a dim pulse) and the strip jolts once. The chips keep full strength while they decode (`naming`): a
//   tool in hand dims the files it can't use, and HOLLOW is never one a tool can use then;
// • every `[user: ???]` already in the TERMINAL becomes `[user: UNIT-046]` with a flicker (new echoes are
//   written with the name: say.ts hollowLabel);
// • 'hollow-name-shown' lets audio-cues play the reveal's truth note under HOLLOW's falling blips.
// It plays when the kid sees it: at once in blue, else on their first look at the mind (like the crack),
// HOLLOW_NAME_SEEN_DELAY_SEC after the jack-in so the scanline wipe has cleared. The strip may rebuild
// during it (a bite, a repair's tick): the decode re-finds the names every frame, and `naming` is put back on
// the rebuilt chips. Letter glyphs are Math.random: cosmetic, like the glitch jerk. Reduced motion: no scramble or
// jolt; the names glow pink and settle under the burst's dim pulse.

const STATIC_GLYPHS = '▚▞▓░█#?';
// The decode's first share holds `???` breaking up (the old name, still there); the rest reveals the new
// one left to right.
const HOLD_OLD_FRAC = 0.22;

function decodeFrame(finalName: string, progress: number): string {
  if (progress < HOLD_OLD_FRAC) {
    const noise = Math.floor((progress / HOLD_OLD_FRAC) * (finalName.length - UNNAMED_HOLLOW.length));
    let tail = '';
    for (let i = 0; i < noise; i++) tail += STATIC_GLYPHS[Math.floor(Math.random() * STATIC_GLYPHS.length)];
    return UNNAMED_HOLLOW + tail;
  }
  const revealed = Math.floor(((progress - HOLD_OLD_FRAC) / (1 - HOLD_OLD_FRAC)) * finalName.length);
  let text = finalName.slice(0, revealed);
  for (let i = revealed; i < finalName.length; i++) text += STATIC_GLYPHS[Math.floor(Math.random() * STATIC_GLYPHS.length)];
  return text;
}

const USER_TAG_UNNAMED = `[user: ${UNNAMED_HOLLOW}]`;

export function mountHollowNameFx(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const termLines = requireById('mindTermLines');
  const panel = memWrap.closest<HTMLElement>('.mem-strip-panel');
  if (!panel) throw new Error('HollowNameFx: #memWrap is not inside .mem-strip-panel in index.html');

  // A flip said but not yet seen (the kid was flying), and the one playing now.
  let pending: string | null = null;
  let startedMs: number | null = null;
  let frame: number | null = null;
  let seenTimer: ReturnType<typeof setTimeout> | null = null;
  // Each name element's own text (the rebuilt chip already says UNIT-046, or its short form on a small
  // part): what the decode lands on.
  let finals = new WeakMap<Element, string>();

  const reducedMotion = (): boolean => store.getState().ui.reducedMotion;
  const nameElements = (): HTMLElement[] => Array.from(memWrap.querySelectorAll<HTMLElement>('.seg.hollow .hollow-head .seg-name'));

  function finalOf(element: HTMLElement): string {
    const known = finals.get(element);
    if (known !== undefined) return known;
    const text = element.textContent ?? '';
    finals.set(element, text);
    return text;
  }

  // Every hollow chip at full strength while it decodes (a rebuild replaces the chips: they are marked again).
  function markChips(): void {
    if (startedMs === null) return;
    if (performance.now() - startedMs >= HOLLOW_NAME_DECODE_MS) return;
    memWrap.querySelectorAll<HTMLElement>('.seg.hollow').forEach((chip) => chip.classList.add('naming'));
  }

  function endFlip(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    nameElements().forEach((element) => {
      element.textContent = finalOf(element);
      element.classList.remove('name-decoding', 'name-still');
    });
    memWrap.querySelectorAll<HTMLElement>('.seg.hollow.naming').forEach((chip) => chip.classList.remove('naming'));
    startedMs = null;
    finals = new WeakMap();
  }

  // Every `[user: ???]` the TERMINAL already shows takes the name. A line still typing is left to its
  // typewriter (it only ever holds lines said after the story, which carry the name already).
  function renameEchoes(name: string): void {
    termLines.querySelectorAll<HTMLElement>('.term-line.speaker-hollow:not(.typing), .term-line.speaker-hollow-cmd:not(.typing)').forEach((row) => {
      const text = row.querySelector('.term-text');
      if (!text || !text.textContent?.includes(USER_TAG_UNNAMED)) return;
      text.textContent = text.textContent.split(USER_TAG_UNNAMED).join(`[user: ${name}]`);
      if (!reducedMotion()) replayAnimation(row, 'renamed');
    });
  }

  function play(name: string): void {
    pending = null;
    endFlip();
    startedMs = performance.now();
    renameEchoes(name);
    emit('hollow-name-shown', { name });
    glitchBurst(GLITCH_BURST_LEVEL, GLITCH_BURST_MS);
    markChips();
    if (reducedMotion()) {
      nameElements().forEach((element) => element.classList.add('name-still'));
      seenTimer = setTimeout(() => { seenTimer = null; endFlip(); }, HOLLOW_NAME_DECODE_MS);
      return;
    }
    replayAnimation(panel!, 'name-jolt');
    const tick = (now: number): void => {
      if (startedMs === null) return;
      const progress = Math.min(1, (now - startedMs) / HOLLOW_NAME_DECODE_MS);
      nameElements().forEach((element) => {
        element.classList.add('name-decoding');
        element.textContent = decodeFrame(finalOf(element), progress);
      });
      if (progress < 1) frame = requestAnimationFrame(tick);
      else endFlip();
    };
    frame = requestAnimationFrame(tick);
  }

  // The boot counts (WP8): a returning unit's ghost names HOLLOW while the strip assembles in blue.
  const inMind = (): boolean => {
    const state = store.getState();
    return state.ui.mode === 'memory' && (state.run.phase === 'boot' || state.run.phase === 'flight' || state.run.phase === 'printing');
  };

  const offNamed = on('hollow-named', ({ name }) => {
    pending = name;
    if (inMind()) play(name);
  });
  const unsubMode = store.subscribe((s) => s.ui.mode, (mode) => {
    if (mode !== 'memory' || pending === null) return;
    if (seenTimer !== null) clearTimeout(seenTimer);
    seenTimer = setTimeout(() => {
      seenTimer = null;
      if (pending !== null && inMind()) play(pending);
    }, HOLLOW_NAME_SEEN_DELAY_SEC * 1000);
  });
  // After a rebuild the new chips carry the new names: the decode finds them on its next frame, and they are marked
  // again.
  const unsubRebuild = store.subscribe((s) => s.ui.memoryRev, () => markChips());

  const reset = (): void => {
    pending = null;
    if (seenTimer !== null) clearTimeout(seenTimer);
    seenTimer = null;
    endFlip();
  };
  const offReset = onWorldReset('hollow-name-fx', reset, () => ({ pending, playing: startedMs !== null, waiting: seenTimer !== null }));

  return () => {
    offNamed();
    unsubMode();
    unsubRebuild();
    offReset();
    reset();
  };
}
