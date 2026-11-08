// Slice 8 POLISH (docs/phase3/impl/slice-8-plan.md §2.12; 04 §3.15; OPEN-DECISIONS 20): the receiver bypass's timing, pure
// (systems/receiver-bypass.ts; the TERMINAL draws it, MindTerminal.ts, and e2e residents watches it in the page).
// • It hangs on the 'resident' tone, the RECEIVER CLOSED boot line's (script.ts bootLineTone), and on nothing else.
// • Its whole line is locked by BYPASS_RESOLVE_SEC, under the boot's 1.3 s line step, and the step is unchanged.
// • Letters lock left to right, each at most BYPASS_LOCK_SPREAD_CHARS places early; spaces and punctuation never roll; the
//   line keeps its length on every frame; frames inside one roll bucket are equal, the next bucket rolls.
// • The same entry locks the same letters (its mask is seeded), and a mid-line frame really is scrambled.
import { check, finish } from '../wp1/harness';
import { isBypassLine, bypassMask, bypassLockSec, bypassResolvedSec, bypassParts, bypassText } from '@systems/receiver-bypass';
import { bootLineTone } from '@data/script';
import { RESIDENT_TEXT } from '@data/resident-text';
import { BOOT_LINE_AT_SEC, BYPASS_LOCK_SPREAD_CHARS, BYPASS_RESOLVE_SEC, BYPASS_ROLL_GLYPHS, BYPASS_ROLL_HZ, TERMINAL_TYPE_CPS } from '@data/tuning';

const LINE = RESIDENT_TEXT.receiverClosed;
const ROLLS = /[A-Za-z0-9]/;

// --- Which line ------------------------------------------------------------------------------------------------------------
check('the bypass hangs on the \'resident\' tone (the RECEIVER CLOSED boot line\'s), in the TERMINAL, and on no other line',
  bootLineTone('receiver-closed') === 'resident' && isBypassLine({ tone: 'resident', channel: 'mind' })
    && !isBypassLine({ tone: 'resident', channel: 'radio' }) && !isBypassLine({ channel: 'mind' })
    && !isBypassLine({ tone: 'good', channel: 'mind' }) && !isBypassLine({ tone: 'resident', channel: 'mind', divider: true }));

// --- The timing ------------------------------------------------------------------------------------------------------------
const steps = BOOT_LINE_AT_SEC.slice(1).map((at, i) => at - BOOT_LINE_AT_SEC[i]!);
const step = Math.min(...steps);
check(`the line resolves in ${BYPASS_RESOLVE_SEC} s, inside the boot's ${step.toFixed(1)} s line step (unchanged: every step 1.3 s)`,
  BYPASS_RESOLVE_SEC < step && steps.every((gap) => Math.abs(gap - 1.3) < 1e-9), steps.map((gap) => gap.toFixed(2)).join());
check(`…and inside the line's own typing time (${(LINE.length / TERMINAL_TYPE_CPS).toFixed(2)} s at the TERMINAL's ${TERMINAL_TYPE_CPS} cps), which the TERMINAL keeps`,
  BYPASS_RESOLVE_SEC <= LINE.length / TERMINAL_TYPE_CPS);

const seeds = [1, 7, 23, 404, 9001];
let lockOk = true;
let lastAtMost = true;
let resolvedOk = true;
let leftToRight = true;
for (const seed of seeds) {
  const mask = bypassMask(LINE, seed);
  const locks = [...LINE].map((_, i) => bypassLockSec(i, LINE.length, mask));
  for (let i = 0; i < LINE.length; i++) {
    const place = (BYPASS_RESOLVE_SEC * (i + 1)) / LINE.length;
    const early = (BYPASS_RESOLVE_SEC * BYPASS_LOCK_SPREAD_CHARS) / LINE.length;
    if (!(locks[i]! <= place + 1e-9 && locks[i]! >= place - early - 1e-9 && locks[i]! >= 0)) lockOk = false;
  }
  if (Math.max(...locks) > BYPASS_RESOLVE_SEC + 1e-9) lastAtMost = false;
  const resolvedAt = bypassResolvedSec(LINE, mask);
  if (!(bypassText(LINE, resolvedAt, mask, seed) === LINE && resolvedAt <= BYPASS_RESOLVE_SEC && resolvedAt > BYPASS_RESOLVE_SEC * 0.8)) resolvedOk = false;
  // Left to right on the whole: the first third has locked by the time the last third starts locking.
  const third = Math.floor(LINE.length / 3);
  if (Math.max(...locks.slice(0, third)) > Math.min(...locks.slice(2 * third))) leftToRight = false;
}
check(`each letter locks at its place's share of ${BYPASS_RESOLVE_SEC} s, at most ${BYPASS_LOCK_SPREAD_CHARS} places early (${seeds.length} seeds)`, lockOk);
check('…none after BYPASS_RESOLVE_SEC; the line reads true from the last lock on, which comes in the last fifth', lastAtMost && resolvedOk);
check('…left to right: the first third has locked before the last third starts', leftToRight);

// --- The frames --------------------------------------------------------------------------------------------------------------
{
  const seed = 31;
  const mask = bypassMask(LINE, seed);
  const frames = Array.from({ length: Math.ceil(BYPASS_RESOLVE_SEC * 60) + 2 }, (_, f) => bypassText(LINE, f / 60, mask, seed));
  const shape = frames.every((frame) => frame.length === LINE.length
    && [...frame].every((char, i) => ROLLS.test(LINE[i]!) ? (char === LINE[i] || BYPASS_ROLL_GLYPHS.includes(char)) : char === LINE[i]));
  check('every frame keeps the line\'s length and shape: spaces and punctuation stand, a rolling letter shows a breaker glyph', shape);
  const first = frames[0]!;
  const rolledAtStart = [...first].filter((char, i) => ROLLS.test(LINE[i]!) && char !== LINE[i]).length;
  const letters = [...LINE].filter((char) => ROLLS.test(char)).length;
  check(`…at its first frame the line is scrambled (${rolledAtStart} of ${letters} letters rolling), at ${BYPASS_RESOLVE_SEC} s it reads true`,
    rolledAtStart > letters * 0.7 && bypassText(LINE, BYPASS_RESOLVE_SEC, mask, seed) === LINE, first);
  // Locked letters stay locked.
  let monotone = true;
  for (let f = 1; f < frames.length; f++) {
    for (let i = 0; i < LINE.length; i++) if (frames[f - 1]![i] === LINE[i] && ROLLS.test(LINE[i]!) && elapsedLocked(i, (f - 1) / 60) && frames[f]![i] !== LINE[i]) monotone = false;
  }
  function elapsedLocked(i: number, sec: number): boolean { return sec >= bypassLockSec(i, LINE.length, mask); }
  check('…a locked letter never rolls again', monotone);
  // The letters still rolling at both moments: the same glyphs inside one roll, new ones at the next.
  const bucketSec = 1 / BYPASS_ROLL_HZ;
  const start = 2 * bucketSec;
  const rollingAt = (sec: number): number[] => [...LINE].map((_, i) => i).filter((i) => ROLLS.test(LINE[i]!) && !elapsedLocked(i, sec));
  const sameRoll = (a: number, b: number): boolean => {
    const fa = bypassText(LINE, a, mask, seed);
    const fb = bypassText(LINE, b, mask, seed);
    return rollingAt(b).every((i) => fa[i] === fb[i]);
  };
  const inBucket = sameRoll(start + 0.001, start + bucketSec * 0.9);
  const nextBucket = !sameRoll(start + 0.001, start + bucketSec + 0.001);
  check(`…it re-rolls ${BYPASS_ROLL_HZ} times a second: equal within one roll, different at the next`, inBucket && nextBucket);
  const again = bypassText(LINE, 0.5, bypassMask(LINE, seed), seed) === bypassText(LINE, 0.5, mask, seed);
  const other = bypassText(LINE, 0.5, bypassMask(LINE, seed + 1), seed + 1) !== bypassText(LINE, 0.5, mask, seed);
  check('…the same entry draws the same frame (its mask is seeded by the entry), another entry another', again && other);
  const parts = bypassParts(LINE, 0.6, mask, seed);
  const alternates = parts.every((part, i) => i === 0 || part.rolling !== parts[i - 1]!.rolling);
  check('the TERMINAL\'s runs: locked and rolling runs alternate, and join to the frame', alternates && parts.some((part) => part.rolling)
    && parts.some((part) => !part.rolling) && parts.map((part) => part.text).join('') === bypassText(LINE, 0.6, mask, seed));
  check('…resolved, one locked run', JSON.stringify(bypassParts(LINE, BYPASS_RESOLVE_SEC, mask, seed)) === JSON.stringify([{ text: LINE, rolling: false }]));
}

// --- Fails loudly -------------------------------------------------------------------------------------------------------------
const throws = (fn: () => unknown): boolean => { try { fn(); return false; } catch { return true; } };
check('a character outside the line, or an empty mask, throws', throws(() => bypassLockSec(LINE.length, LINE.length, bypassMask(LINE, 1)))
  && throws(() => bypassLockSec(-1, LINE.length, bypassMask(LINE, 1))) && throws(() => bypassLockSec(0, 4, [])));

finish();
