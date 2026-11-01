// WP2 headless harness: WP1's harness (store, clock, orbit-sim, predictor, pace, input router,
// flight and time keys) plus every DOM-free WP2 system: say, boot, flight events, the director
// and the mode keys. Audio is not unlocked headless, so every cue is a no-op; the event log
// below records what audio would have played from.
// One harness per test file (systems are module singletons); reset() between scenarios.
import { createHarness, type Harness, type HarnessOpts } from '../wp1/harness';
import { createInitialState } from '@state/initial';
import { DRIVER_RULES } from '@data/script';
import type { GameState, ObjectiveLine, RunPhase } from '@state/schema';
import { resetWorld } from '@systems/reset';
import { mountSay } from '@systems/say';
import { mountBoot } from '@systems/boot';
import { mountFlightEvents } from '@systems/flight-events';
import { mountDirector } from '@systems/director';
import { registerModeKeys } from '@systems/mode';
import { onAny, type GameEventName } from '@systems/events';

export interface RecordedEvent {
  name: GameEventName;
  payload: unknown;
  wall: number;
}

export interface Harness2 extends Harness {
  events: RecordedEvent[];
  shown: () => ObjectiveLine | null;
  log: () => GameState['log']['entries'];
  // Fresh state in the given phase (default: flight, like WP1).
  resetTo: (phase?: RunPhase, seed?: number) => void;
  stepFor: (wallSec: number, each?: () => void) => void;
}

// opts: see HarnessOpts (WP5: the colonists are already found unless soulsFound is false).
export function createHarness2(seed = 1, opts: HarnessOpts = {}): Harness2 {
  const soulsFound = opts.soulsFound ?? true;
  const base = createHarness(seed, opts);
  mountSay(base.store);
  mountBoot(base.store);
  mountFlightEvents(base.store);
  mountDirector(base.store);
  registerModeKeys(base.store);
  const events: RecordedEvent[] = [];
  onAny((name, payload) => { events.push({ name, payload, wall: base.wall() }); });

  const harness: Harness2 = {
    ...base,
    events,
    shown: () => base.store.getState().director.shown,
    log: () => base.store.getState().log.entries,
    resetTo(phase = 'flight', nextSeed = seed) {
      // The WP1 reset first (it zeroes the wall clock and its own filter), then the phase.
      base.reset(nextSeed);
      if (phase !== 'flight') {
        base.store.update((d) => {
          Object.assign(d, createInitialState({ seed: nextSeed, phase }));
          if (soulsFound) {
            d.director.done.push(...DRIVER_RULES.map((rule) => rule.id));
          }
        });
        resetWorld();
      }
      events.length = 0;
    },
    stepFor(wallSec, each) {
      const end = base.wall() + wallSec;
      while (base.wall() < end - 1e-9) { base.step(); each?.(); }
    },
  };
  return harness;
}

// The WP1 literal follower, reading the DIRECTOR's line (the strip the kid sees) instead of the
// bare flight table. Same reactions: let go on RELEASE/TOO EARLY/WAIT/TURN AROUND, press any
// named preset, hold on hold/KEEP HOLDING/NOW, F on WAIT.
export interface FollowOpts {
  reactionSec: number;
  maxWall: number;
  // Called every tick before the follower reacts; true while a scripted mistake owns the
  // controls (the follower is ignored meanwhile).
  mistake?: (h: Harness2, ctx: { holding: boolean; setHolding: (on: boolean) => void }) => boolean;
}

export function followDirector(h: Harness2, opts: FollowOpts): string[] {
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) h.keyDown('Space');
    if (!on && holding) h.keyUp('Space');
    holding = on;
  };
  const react = (text: string): void => {
    const keyMatch = text.match(/press \[([WASD])\]/);
    if (/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(text)) {
      setHolding(false);
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
      if (/^WAIT/.test(text)) h.press('KeyF');
      return;
    }
    if (keyMatch) h.press(`Key${keyMatch[1]}`);
    if (/hold \[SPACE\]|KEEP HOLDING|NOW/.test(text)) setHolding(true);
  };
  const texts: string[] = [];
  const queue: { at: number; text: string }[] = [];
  let lastText = '';
  let suspended = false;
  const end = h.wall() + opts.maxWall;
  while (h.status() === 'approaching' && h.wall() < end) {
    h.step();
    const text = h.shown()?.text ?? '';
    if (opts.mistake?.(h, { holding, setHolding })) { suspended = true; queue.length = 0; continue; }
    if (suspended) { suspended = false; lastText = ''; }
    if (text !== lastText) {
      lastText = text;
      if (text) {
        queue.push({ at: h.wall() + opts.reactionSec, text });
        if (texts[texts.length - 1] !== text) texts.push(text);
      }
    }
    while (queue.length > 0 && queue[0]!.at <= h.wall() + 1e-9) react(queue.shift()!.text);
  }
  setHolding(false);
  return texts;
}

// Collapses ticking countdowns so a printed script stays readable.
export function scriptOf(texts: string[]): string {
  const collapsed: string[] = [];
  for (const text of texts) {
    const generic = text.replace(/\d+:\d\d/g, 'm:ss');
    if (collapsed[collapsed.length - 1] !== generic) collapsed.push(generic);
  }
  return collapsed.join('\n      ');
}
