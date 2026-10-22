import type { TextPart } from '@systems/flight-hud';
import { WALL_FRAME_MAX_SEC } from '@data/tuning';

// Type-on text for the objective strip, the COMMS radio and the TERMINAL (§7.1).
//
// Typing is presentation, so it runs on wall time through requestAnimationFrame: it keeps going
// while the game is paused (pause is for reading), stops while the tab is hidden and resumes
// where it stopped (each frame advances at most WALL_FRAME_MAX_SEC). The game's clocks never
// wait for it.
//
// A job reveals `length` units one after another. The caller decides what a unit is: a
// character of a log line, or a character or a whole key cap of an objective (revealParts).

// --- DOM-free core (tested headless) -----------------------------------------------------------

// Key caps count as one unit each: [SPACE] pops in whole, never as S-P-A.
export function partsLength(parts: readonly TextPart[]): number {
  return parts.reduce((sum, part) => sum + (part.key ? 1 : part.text.length), 0);
}

// The first `count` units of a line.
export function revealParts(parts: readonly TextPart[], count: number): TextPart[] {
  const shown: TextPart[] = [];
  let left = count;
  for (const part of parts) {
    if (left <= 0) break;
    if (part.key) {
      shown.push(part);
      left--;
    } else if (part.text.length <= left) {
      shown.push(part);
      left -= part.text.length;
    } else {
      shown.push({ text: part.text.slice(0, left), key: false });
      left = 0;
    }
  }
  return shown;
}

// The unit at `index` as a character ('' for a key cap), so a typing sound can skip spaces.
export function unitChar(parts: readonly TextPart[], index: number): string {
  let left = index;
  for (const part of parts) {
    const size = part.key ? 1 : part.text.length;
    if (left < size) return part.key ? '' : part.text[left] ?? '';
    left -= size;
  }
  return '';
}

// How many units should be on screen after `elapsedSec` of a job (after its lead-in).
export function unitsAt(elapsedSec: number, leadSec: number, cps: number, length: number): number {
  if (elapsedSec <= leadSec) return 0;
  return Math.min(length, Math.floor((elapsedSec - leadSec) * cps));
}

// --- The queue --------------------------------------------------------------------------------

interface TypeJob {
  // Units to reveal. Read every frame: a job may change it while typing (the strip patches a
  // line's numbers mid-type), and the job ends at whatever it is then.
  readonly length: number;
  cps: number;                    // units per wall second
  leadSec?: number;               // silence before the first unit (CONTROL's chime)
  onStart?: () => void;           // the job became the one being typed
  onUnit?: (index: number) => void;  // a unit appeared (sounds; at most one call per frame)
  paint: (count: number, done: boolean) => void;
}

export interface TypeQueue {
  push: (job: TypeJob) => void;
  // Shows every queued line in full at once (a click on the log): no sounds.
  finishAll: () => void;
  // Drops every job without painting it (the strip replaced its line).
  clear: () => void;
  // Shows every line but the newest in full at once, silently: the view just came back on
  // screen, and only the newest line is worth watching type (the rest are old news).
  catchUp: () => void;
  // Starts the frame loop if there is work and the view is active (call on mode changes).
  kick: () => void;
  busy: () => boolean;
}

interface Running {
  job: TypeJob;
  elapsedSec: number;
  shown: number;
}

// `isActive`: typing only advances while its view is on screen; a line spoken on the hidden
// screen waits, and types itself when the kid looks.
export function createTypeQueue(isActive: () => boolean): TypeQueue {
  const waiting: TypeJob[] = [];
  let current: Running | null = null;
  let frame: number | null = null;
  let lastFrameMs = 0;

  const startNext = (): void => {
    const job = waiting.shift();
    current = job ? { job, elapsedSec: 0, shown: 0 } : null;
    if (current) {
      current.job.onStart?.();
      current.job.paint(0, current.job.length === 0);
    }
  };

  const step = (nowMs: number): void => {
    frame = null;
    if (!isActive()) return;
    const dtSec = Math.min(WALL_FRAME_MAX_SEC, Math.max(0, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;
    if (!current) startNext();
    let budget = dtSec;
    // A frame can finish one line and start the next (a short line, a long frame). Every pass
    // either stops on an unfinished line or consumes a finished one, so the loop ends.
    while (current) {
      const { job } = current;
      current.elapsedSec += budget;
      const lead = job.leadSec ?? 0;
      const count = unitsAt(current.elapsedSec, lead, job.cps, job.length);
      const done = count >= job.length;
      // A line that shrank below what is already shown still gets its final (done) paint.
      if (count > current.shown || done) {
        if (count > current.shown) job.onUnit?.(count - 1);
        current.shown = count;
        job.paint(count, done);
      }
      if (!done) break;
      // Carry the frame time this line did not need into the next one.
      budget = Math.max(0, current.elapsedSec - (lead + job.length / job.cps));
      startNext();
    }
    if (current || waiting.length > 0) frame = requestAnimationFrame(step);
  };

  const kick = (): void => {
    if (frame !== null || !isActive() || (!current && waiting.length === 0)) return;
    lastFrameMs = performance.now();
    frame = requestAnimationFrame(step);
  };

  return {
    push(job) {
      waiting.push(job);
      kick();
    },
    finishAll() {
      if (current) current.job.paint(current.job.length, true);
      for (const job of waiting) job.paint(job.length, true);
      current = null;
      waiting.length = 0;
    },
    clear() {
      current = null;
      waiting.length = 0;
    },
    catchUp() {
      const jobs = current ? [current.job, ...waiting] : [...waiting];
      const newest = jobs.pop();
      if (!newest) return;
      for (const job of jobs) job.paint(job.length, true);
      if (current && current.job === newest) {
        waiting.length = 0;
        return;
      }
      current = null;
      waiting.length = 0;
      waiting.push(newest);
    },
    kick,
    busy: () => current !== null || waiting.length > 0,
  };
}
