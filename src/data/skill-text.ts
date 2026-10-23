// The words AUTOBURN says (WP9, §6.10): its boot line, its radio lines and why it can't engage. Kept apart from
// script.ts (like tool-text.ts) so systems/autoburn.ts and guidance can import them without the director.
// Every line is checked against the strip width with worst-case numbers by tests/unit/wp9 tests (≤ 70 chars).

import type { AutoburnEnd } from '@state/schema';
import { AUTOBURN_WINDOW_TAC, BAND_DEGRADED_MIN } from '@data/tuning';

export const AUTOBURN_TEXT = {
  // The boot (§5.1 4:40), the moment the kid's two captures became a skill (the lead: say so when it installs).
  trained: (demos: number, accuracy: number): string =>
    `> SKILL TRAINED: AUTOBURN.skl · from your ${demos} captures · ACCURACY ${accuracy}%`,
  retrained: (demos: number, accuracy: number): string =>
    `> SKILL RETRAINED: AUTOBURN.skl · from your ${demos} captures · ACCURACY ${accuracy}%`,
  // The strip while it flies (guidance's AUTO rows).
  armed: (time: string): string => `AUTOBURN ARMED — it brakes at ▼ in ${time} · [B] to cancel`,
  burning: 'AUTOBURN BRAKING — [SPACE] takes over',
  burningMind: 'AUTOBURN BRAKING — it flies the ship while you fight',
  // The hand-back (strip and radio): it flew the capture through, and what is left is a trim later (a burn at ▲,
  // or the next pass), or nothing but HOLD STEADY.
  braked: 'AUTOBURN: CAPTURED — trim it green yourself',
  brakedTab: 'AUTOBURN: CAPTURED — [TAB], trim it green yourself',
  inRing: 'AUTOBURN: IN THE RING — hold steady',
  // The first time it can be used this run (script.ts, a tutorial).
  ready: 'AUTOBURN READY — press [B] and it brakes at ▼ for you',
  // The capture timeline's tail while AUTO could take it (guidance F10).
  offerTail: ' · or [B] AUTO',
  // The radio, when the kid lets go of it or takes the throttle.
  off: 'AUTOBURN OFF — you have the controls',
} as const;

// A drop mid-flight (§6.10: the file consumed mid-burn → `AUTOBURN.skl LOST — MANUAL`, and the klaxon): the
// alarm's strip line and the radio's, per reason. The ends that are not drops have none.
export const AUTOBURN_DROP_TEXT: Readonly<Partial<Record<AutoburnEnd, string>>> = {
  lost: 'AUTOBURN.skl LOST — MANUAL',
  damaged: 'AUTOBURN.skl DAMAGED — MANUAL',
  engine: 'AUTOBURN OFF — ENGINE NOT RESPONDING',
  presets: 'AUTOBURN OFF — AUTOPILOT DAMAGED',
};
// ...and in blue, where the controls are a TAB away.
export const AUTOBURN_DROP_TAB = ' · [TAB]';

// Why B (or the AUTO button) does nothing right now. Short: the button's tooltip and the refusal buzz.
export const AUTOBURN_REFUSAL = {
  over: 'FLIGHT OVER',
  paused: 'PAUSED',
  noFile: 'NO AUTOBURN.skl',
  // WP12 p3 (LEAD-2's wording item): a unit that never trained it (ships 1–2 of a run) has nothing that is "gone".
  untrained: 'NOT TRAINED YET',
  damaged: 'AUTOBURN.skl DAMAGED',
  presets: 'AUTOPILOT DAMAGED',
  engine: 'ENGINE NOT RESPONDING',
  noCapture: 'NOTHING TO CAPTURE',
  tooFar: 'TOO FAR FROM ▼',
  burning: 'YOU ARE BURNING',
  threads: 'ALL THREADS BUSY — WAIT FOR ONE',
  // A SKIP is running: [B] would only stop it (the lead's ruling for LEAD-2 review round 2), so AUTO is not offered.
  skipping: 'SKIPPING',
} as const;

export type AutoburnRefusal = (typeof AUTOBURN_REFUSAL)[keyof typeof AUTOBURN_REFUSAL];

// A refused [B] explained on the strip for a moment (the director's REFUSAL_LINES), as SPACE's are: in the MIND there
// is no AUTO button to read the reason from, so a bare buzz read as "B is broken" (WP9 review round 1). Its own key,
// so it can never be mistaken for SPACE's or SKIP's refusal in the same words ('AUTOPILOT DAMAGED', 'PAUSED'). No line
// for a pause (PAUSED has its own) or a flight that is over.
export function autoRefusalKey(refusal: AutoburnRefusal): string {
  return `AUTO|${refusal}`;
}

const AUTO_WINDOW_TEXT = `${Math.floor(AUTOBURN_WINDOW_TAC / 60)}:${String(AUTOBURN_WINDOW_TAC % 60).padStart(2, '0')}`;

export const AUTO_REFUSAL_LINES: Readonly<Partial<Record<AutoburnRefusal, { text: string; keys: readonly string[] }>>> = {
  [AUTOBURN_REFUSAL.noFile]: { text: 'AUTOBURN.skl IS GONE — capture by hand to train it again', keys: [] },
  [AUTOBURN_REFUSAL.untrained]: { text: 'NO AUTOBURN YET — capture by hand and it learns from you', keys: [] },
  [AUTOBURN_REFUSAL.damaged]: { text: `AUTOBURN.skl DAMAGED — REPAIR it to ${BAND_DEGRADED_MIN}% first`, keys: [] },
  [AUTOBURN_REFUSAL.presets]: { text: 'AUTOBURN NEEDS THE AUTOPILOT — REPAIR it first', keys: [] },
  [AUTOBURN_REFUSAL.engine]: { text: 'AUTOBURN: ENGINE NOT RESPONDING — fix ENGINE I/O first', keys: [] },
  [AUTOBURN_REFUSAL.noCapture]: { text: 'AUTOBURN BRAKES INTO ORBIT AT ▼ — nothing to capture now', keys: [] },
  [AUTOBURN_REFUSAL.tooFar]: { text: `TOO FAR FROM ▼ — [B] works in the last ${AUTO_WINDOW_TEXT} before the brake`, keys: ['B'] },
  [AUTOBURN_REFUSAL.burning]: { text: 'YOU ARE BURNING — let go of [SPACE], then [B]', keys: ['SPACE', 'B'] },
  [AUTOBURN_REFUSAL.threads]: { text: 'AUTOBURN NEEDS A THREAD — wait for an op to end, then [B]', keys: ['B'] },
};

// The Engine window's AUTO button (§7.1 `AUTO · B`, WP9 part 2): its name and key on the left, what it is doing
// (or why it can't) on the right in small print. A refusal too long for that corner has a short form here.
export const AUTO_BUTTON_TEXT = {
  head: 'AUTO · [B]',
  armedHead: 'AUTO ARMED',
  pointingHead: 'AUTO TURNING…',
  burningHead: 'AUTO BRAKING',
  ready: 'BRAKES AT ▼ FOR YOU',
  armed: (time: string): string => `BRAKES IN ${time} · [B] OFF`,
  burning: '[SPACE] TAKES OVER',
  title: (accuracy: number): string =>
    `AUTOBURN.skl flies the capture at ▼ for you (accuracy ${accuracy}%). [B] or click; works from the MIND too`,
  titleNoSkill: 'AUTOBURN.skl is gone: capture by hand and it trains again at the next ship',
} as const;

// The mini-HUD card in the MIND while AUTOBURN works (the lead's note: show it flying while the kid fights in blue).
export const AUTO_MINI_TEXT = {
  ready: 'AUTO READY · PRESS [B]',
  armed: (time: string): string => `AUTO ARMED · BRAKES IN ${time}`,
  flying: 'AUTOBURN IS FLYING THE SHIP',
} as const;

export const AUTO_BUTTON_REASON: Readonly<Partial<Record<AutoburnRefusal, string>>> = {
  [AUTOBURN_REFUSAL.threads]: 'THREADS BUSY',
  [AUTOBURN_REFUSAL.skipping]: 'STOPS THE SKIP FIRST',
};

// The Skills window's AUTOBURN.skl row (systems/skills.ts): a trained skill, not a card.
export const AUTOBURN_SKILL_ROW = {
  title: 'AUTOBURN.skl',
  effect: 'Brakes at ▼ for you, even from the MIND: press B when ▼ is near',
  trained: (accuracy: number, demos: number): string => `ACCURACY ${accuracy}% · FROM YOUR ${demos} CAPTURES`,
  armed: 'ARMED — IT BRAKES AT ▼',
  flying: 'FLYING THE SHIP NOW',
  damaged: (min: number): string => `DAMAGED — REPAIR IT TO ${min}% OR MORE`,
  gone: 'ITS FILE IS GONE — CAPTURE BY HAND TO TRAIN IT AGAIN',
} as const;
