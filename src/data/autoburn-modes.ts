// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §5.2, §6). Others ask by message.
// AUTOBURN's modes as one table (plan §5.2, the review's "places a mode touches"): what each mode needs, which burns it
// flies, when it has nothing left to fly, and its words when the reserve or a downgrade stops it. A new mode is a type error
// until it has its row. Data only: systems/autoburn.ts (the machine) and systems/predict.ts (the planner) both read it, and
// predict may not import autoburn.ts (which imports predict), so the table lives here.
import type { AutoburnEnd } from '@state/schema';
import type { AutoMode, SkillVersion } from '@/types/skill';
import { AUTOBURN_TEXT } from '@data/skill-text';

export interface ModeRule {
  // The effective version the mode's burns need (03 §3.6). A capture is v1's whatever the mode, so it always flies on.
  needs: SkillVersion;
  // On an open path its first burn is the capture (planModeBurn).
  fromFlyby: boolean;
  // It ends 'flight-over' once the landing begins (v1's capture: v1 does not fly in LANDING).
  flightOnly: boolean;
  // Its burns are apsis burns to the circle at auto.targetKm (predict planToCircle; the machine reads the ship's exact
  // state against circleStep every tick).
  circle: boolean;
  // The planner plans no shrink while it is engaged (it flies only at ▼ and ▲, 03 §3.6).
  noShrink: boolean;
  // After its capture: 'end' hands back (v1), 'continue' re-arms for the mode's next burn.
  afterCapture: 'end' | 'continue';
  // Nothing left to fly, read by the armed machine on the ship's own loop: the loop closed, in the ring, or at its circle.
  doneWhen: 'loop-closed' | 'in-ring' | 'circle';
  // ...and what it does then: stand down with this end, or (AUTOBURN v3) hold the circle, armed.
  then: { phase: 'idle' | 'done'; end: AutoburnEnd } | 'hold';
  // The radio when the fuel reserve or a downgrade stops it, by whether this engagement flew a capture.
  stopped: { reserve: (captured: boolean) => string; downgraded: (captured: boolean) => string };
}

const CAPTURE_STOPPED: ModeRule['stopped'] = {
  reserve: (captured) => (captured ? AUTOBURN_TEXT.reserveCaptured : AUTOBURN_TEXT.reserveGreen),
  downgraded: (captured) => (captured ? AUTOBURN_TEXT.downgradedCaptured : AUTOBURN_TEXT.downgradedGreen),
};

export const MODE_RULES: Readonly<Record<AutoMode, ModeRule>> = {
  capture: {
    needs: 1, fromFlyby: true, flightOnly: true, circle: false, noShrink: false, afterCapture: 'end',
    doneWhen: 'loop-closed', then: { phase: 'idle', end: 'no-capture' }, stopped: CAPTURE_STOPPED,
  },
  green: {
    needs: 2, fromFlyby: true, flightOnly: false, circle: false, noShrink: true, afterCapture: 'continue',
    doneWhen: 'in-ring', then: { phase: 'done', end: 'green' }, stopped: CAPTURE_STOPPED,
  },
  round: {
    needs: 2, fromFlyby: false, flightOnly: false, circle: true, noShrink: false, afterCapture: 'continue',
    doneWhen: 'circle', then: { phase: 'done', end: 'round' },
    stopped: { reserve: () => AUTOBURN_TEXT.reserveRound, downgraded: () => AUTOBURN_TEXT.downgradedRound },
  },
  'landing-orbit': {
    needs: 3, fromFlyby: true, flightOnly: false, circle: true, noShrink: true, afterCapture: 'continue',
    doneWhen: 'circle', then: 'hold',
    stopped: {
      reserve: () => AUTOBURN_TEXT.reserveOrbit,
      downgraded: (captured) => (captured ? AUTOBURN_TEXT.downgradedCaptured : AUTOBURN_TEXT.downgradedOrbit),
    },
  },
};
