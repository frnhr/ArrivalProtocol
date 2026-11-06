// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2). Others ask by message.
// The words AUTOBURN says (WP9, §6.10): its radio lines and why it can't engage. Kept apart from script.ts (like
// tool-text.ts) so systems/autoburn.ts and guidance can import them without the director.
// Every line is checked against the strip width with worst-case numbers by tests/unit/wp9 tests (≤ 70 chars).
// (Slice 4: the boot's TRAINED / RETRAINED lines are TREE's now, training-text.ts BOOT_SKILL_TEXT.)

import type { AutoburnEnd } from '@state/schema';
import type { AutoMode } from '@/types/skill';
import type { OfflineReason } from '@systems/capabilities';
import { BAND_DEGRADED_MIN, AUTO_FUEL_RESERVE_PCT } from '@data/tuning';

// The mode's word on the tails and the AUTO button (03 §3.6: `[B] AUTO · GREEN`).
const MODE_WORD: Readonly<Record<Exclude<AutoMode, 'capture'>, string>> = { green: 'GREEN', round: 'ROUND', 'landing-orbit': 'LANDING ORBIT' };

export const AUTOBURN_TEXT = {
  // The strip while it waits (guidance's AUTO rows): the capture (v1, and v2's first burn), a ring trim (GREEN) and a
  // circle burn (ROUND), each at the apsis it burns at.
  armed: (time: string): string => `AUTOBURN ARMED — it brakes at ▼ in ${time} · [B] to cancel`,
  armedTrim: (glyph: string, time: string): string => `AUTOBURN ARMED — trims at ${glyph} in ${time} · [B] to cancel`,
  armedRound: (glyph: string, time: string): string => `AUTOBURN ARMED — rounds it at ${glyph} in ${time} · [B] to cancel`,
  // Its claim found every Core thread busy (03 §3.6, plan §7 R6: hack or burn, no pre-emption): urgent, and it names the
  // fix, an op's × in the MIND (from the ship, [TAB] first).
  threadWait: (time: string): string => `AUTOBURN NEEDS A THREAD IN ${time} — × AN OP`,
  threadWaitShip: (time: string): string => `AUTOBURN NEEDS A THREAD IN ${time} — [TAB], × AN OP`,
  threadWaitLate: 'AUTOBURN NEEDS A THREAD NOW — × AN OP',
  threadWaitLateShip: 'AUTOBURN NEEDS A THREAD NOW — [TAB], × AN OP',
  // ...while it flies, by the burn: the capture, a trim, a ROUND burn.
  burning: 'AUTOBURN BRAKING — [SPACE] takes over',
  burningMind: 'AUTOBURN BRAKING — it flies the ship while you fight',
  trimming: 'AUTOBURN TRIMMING — [SPACE] takes over',
  trimmingMind: 'AUTOBURN TRIMMING — it flies the ship while you fight',
  rounding: 'AUTOBURN ROUNDING — [SPACE] takes over',
  roundingMind: 'AUTOBURN ROUNDING — it flies the ship while you fight',
  // The hand-back (strip and radio): it flew the capture through, and what is left is a trim later (a burn at ▲,
  // or the next pass), or nothing but HOLD STEADY.
  braked: 'AUTOBURN: CAPTURED — trim it green yourself',
  brakedTab: 'AUTOBURN: CAPTURED — [TAB], trim it green yourself',
  inRing: 'AUTOBURN: IN THE RING — hold steady',
  // v2's hand-backs (03 §3.6, decision 15): the whole loop green, then round. In landing there is no lock to hold for.
  green: 'AUTOBURN: GREEN ORBIT — hold steady, or [B] to round it',
  greenLanding: 'AUTOBURN: GREEN ORBIT — [B] rounds it',
  round: 'AUTOBURN: ROUND ORBIT — hold steady',
  roundLanding: 'AUTOBURN: ROUND ORBIT — every pass drops the same',
  // The fuel reserve stopped the plan (03 §3.6; never the capture, plan §7 R4).
  reserveCaptured: 'AUTOBURN: CAPTURED, NOT GREEN — SAVING FUEL',
  reserveGreen: 'AUTOBURN: NOT GREEN — SAVING FUEL',
  reserveRound: 'AUTOBURN: GREEN, NOT ROUND — SAVING FUEL',
  // Graded damage took the version its mode needs (03 §3.5): it finished what the lower version can do, then let go.
  downgradedCaptured: 'AUTOBURN DAMAGED TO v1 — CAPTURED, trim it green yourself',
  downgradedGreen: 'AUTOBURN DAMAGED TO v1 — trim it green yourself',
  downgradedRound: 'AUTOBURN DAMAGED TO v1 — it can no longer round it',
  // AUTOBURN v3 (4e, plan §5.2): the reserve stopped its transfer or a top-up; damage took it to v1 (v1 does not fly in
  // LANDING, plan R14).
  reserveOrbit: `AUTOBURN v3 KEEPS ${AUTO_FUEL_RESERVE_PCT}% FUEL — the orbit is yours`,
  downgradedOrbit: 'AUTOBURN DAMAGED TO v1 — the landing orbit is yours',
  // ROUND in landing (plan §7 R2): the burns at ▼ and at ▲ both cross a window of an LZ with room, so it burns at ▼ anyway.
  roundCostsWindow: (lz: string): string => `AUTOBURN: ROUND COSTS ${lz}'s WINDOW`,
  // GREEN in landing (an accepted orbit) trims at its apsis whatever the window (slice 4 review (a)): said at the press, so
  // the kid can drop that window first and press [B] after it.
  greenCostsWindow: (lz: string): string => `AUTOBURN: GREEN COSTS ${lz}'s WINDOW`,
  // The first time it can be used this run (script.ts, a tutorial).
  ready: 'AUTOBURN READY — press [B] and it brakes at ▼ for you',
  // ...and the first time v2 can act (03 §4: a tutorial line, once).
  readyV2: 'AUTOBURN v2 — [B] makes it green. [B] on green makes it round.',
  // Slice 4e (plan §5.4): v3's once-only lesson (data/script.ts SKILL_4CDE_RULES; autoburn-v3.ts v3TutorialDue).
  readyV3: 'AUTOBURN v3 — [B] flies to the orbit where every drop fits',
  // The tails (03 §3.7): the capture timeline's while AUTO could take it (v1), the mode's (v2: trims too, and HOLD
  // STEADY's ROUND), and a correction row's while it waits.
  offerTail: ' · or [B] AUTO',
  offerMode: (mode: AutoMode): string => (mode === 'capture' ? ' · or [B] AUTO' : ` · or [B] ${MODE_WORD[mode]}`),
  armedTail: ' · AUTO ARMED',
  // The radio, when the kid lets go of it or takes the throttle.
  off: 'AUTOBURN OFF — you have the controls',
  // The kid's own REPAIR or MOVE took the file offline while it was engaged (03 §3.5: a choice, so no klaxon; review m2).
  offline: {
    repairing: 'AUTOBURN OFF WHILE IT IS REPAIRED — you have the controls',
    transferring: 'AUTOBURN OFF WHILE IT MOVES — you have the controls',
    inactive: 'AUTOBURN.skl SWITCHED OFF — you have the controls',
  } satisfies Record<OfflineReason, string>,
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
  // Review (words): not `NOT TRAINED YET`, which a kid reads as the UNTRAINED of a skill with no demos.
  untrained: 'NO AUTOBURN YET',
  damaged: 'AUTOBURN.skl DAMAGED',
  presets: 'AUTOPILOT DAMAGED',
  engine: 'ENGINE NOT RESPONDING',
  noCapture: 'NOTHING TO CAPTURE',
  // v2: the loop is already round (ROUND_E_TOL), or the path hits the planet (AUTOBURN never steers: F4 is the kid's).
  round: 'ALREADY ROUND',
  impact: 'FIX THE PATH FIRST',
  // v2: its first burn is a trim or a ROUND burn that would leave less than AUTO_FUEL_RESERVE_PCT.
  reserve: 'SAVING FUEL',
  // The mode's first burn is further off than the lock range (03 §3.7; the NAV PLOT's LOCK bracket shows the range).
  tooFar: 'TOO FAR FROM THE BURN',
  burning: 'YOU ARE BURNING',
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

// One line per refusal, whatever the lock level: the LOCK bracket on the NAV PLOT shows how far the range reaches (slice 4:
// 90, 270 or 810 tac s, by the file's effective LOCK RANGE).
export const AUTO_REFUSAL_LINES: Readonly<Partial<Record<AutoburnRefusal, { text: string; keys: readonly string[] }>>> = {
  [AUTOBURN_REFUSAL.noFile]: { text: 'AUTOBURN.skl IS GONE — RESTORE it between ships', keys: [] },
  [AUTOBURN_REFUSAL.untrained]: { text: 'NO AUTOBURN — train it between ships', keys: [] },
  [AUTOBURN_REFUSAL.damaged]: { text: `AUTOBURN.skl DAMAGED — REPAIR it to ${BAND_DEGRADED_MIN}% first`, keys: [] },
  [AUTOBURN_REFUSAL.presets]: { text: 'AUTOBURN NEEDS THE AUTOPILOT — REPAIR it first', keys: [] },
  [AUTOBURN_REFUSAL.engine]: { text: 'AUTOBURN: ENGINE NOT RESPONDING — fix ENGINE I/O first', keys: [] },
  [AUTOBURN_REFUSAL.noCapture]: { text: 'AUTOBURN BRAKES INTO ORBIT AT ▼ — nothing to capture now', keys: [] },
  [AUTOBURN_REFUSAL.round]: { text: 'THE ORBIT IS ROUND — AUTOBURN has nothing to fly', keys: [] },
  [AUTOBURN_REFUSAL.impact]: { text: 'AUTOBURN NEVER STEERS — lift ▼ out of the planet first', keys: [] },
  [AUTOBURN_REFUSAL.reserve]: { text: `AUTOBURN KEEPS ${AUTO_FUEL_RESERVE_PCT}% FUEL — this burn is yours`, keys: [] },
  [AUTOBURN_REFUSAL.tooFar]: { text: 'TOO FAR — [B] works once the ship is in the LOCK bracket', keys: ['B'] },
  [AUTOBURN_REFUSAL.burning]: { text: 'YOU ARE BURNING — let go of [SPACE], then [B]', keys: ['SPACE', 'B'] },
};

// The Engine window's AUTO button (§7.1 `AUTO · B`, WP9 part 2): its name and key on the left, what it is doing
// (or why it can't) on the right in small print. A refusal too long for that corner has a short form here.
// Slice 4: the head names the mode [B] would fly (03 §3.6: `AUTO · GREEN [B]`); v1's capture keeps phase 2's head.
export const AUTO_BUTTON_TEXT = {
  head: 'AUTO · [B]',
  modeHead: (mode: AutoMode): string => (mode === 'capture' ? 'AUTO · [B]' : `AUTO · ${MODE_WORD[mode]} [B]`),
  armedHead: 'AUTO ARMED',
  pointingHead: 'AUTO TURNING…',
  burningHead: 'AUTO BRAKING',
  trimmingHead: 'AUTO TRIMMING',
  roundingHead: 'AUTO ROUNDING',
  ready: 'BRAKES AT ▼ FOR YOU',
  readyGreen: 'MAKES IT GREEN',
  readyRound: 'MAKES IT ROUND',
  armed: (time: string): string => `BRAKES IN ${time} · [B] OFF`,
  armedTrim: (time: string): string => `TRIMS IN ${time} · [B] OFF`,
  armedRound: (time: string): string => `ROUNDS IN ${time} · [B] OFF`,
  threadWait: 'NEEDS A THREAD',
  burning: '[SPACE] TAKES OVER',
  title: (accuracy: number): string =>
    `AUTOBURN.skl flies the capture at ▼ for you (accuracy ${accuracy}%). [B] or click; works from the MIND too`,
  titleV2: (accuracy: number): string =>
    `AUTOBURN.skl v2: [B] makes it green, [B] on green makes it round (accuracy ${accuracy}%). Works from the MIND too`,
  titleNoSkill: 'AUTOBURN.skl is gone: RESTORE it at the next desk',
} as const;

// The NAV PLOT's AUTOBURN marks (03 §3.6–§3.7): the LOCK bracket's label, the late claim on the chip.
export const AUTO_PLOT_TEXT = {
  lock: 'LOCK',
  late: (time: string): string => `AUTO LATE ${time} · NEEDS A THREAD`,
} as const;

// The Engine window's AUTOBURN pip (03 §4; 4b's graded damage: `v2▸v1`).
export const AUTO_PIP_TEXT = {
  label: 'AUTOBURN',
  version: (version: number): string => `AUTOBURN v${version}`,
  worksAs: (nominal: number, effective: number): string => (effective === 0 ? `AUTOBURN v${nominal}▸off` : `AUTOBURN v${nominal}▸v${effective}`),
  ok: (version: number): string => `AUTOBURN.skl v${version} — click to see the file`,
  damaged: (nominal: number, effective: number, okMin: number): string => (effective === 0
    ? `AUTOBURN.skl v${nominal} — too damaged to work: REPAIR it`
    : `AUTOBURN.skl v${nominal} — WORKS AS v${effective}: REPAIR it to ${okMin}% for v${nominal}`),
  offline: (version: number): string => `AUTOBURN.skl v${version} — offline while REPAIR or MOVE runs`,
  missing: 'AUTOBURN.skl is gone: RESTORE it at the next desk',
} as const;

// The mini-HUD card in the MIND while AUTOBURN works (the lead's note: show it flying while the kid fights in blue).
export const AUTO_MINI_TEXT = {
  ready: 'AUTO READY · PRESS [B]',
  // What it does next, by the burn it is armed for (autoburn.ts autoArmedBurn): brakes into the capture, trims, or rounds.
  armed: (time: string, kind: 'capture' | 'trim' | 'round' = 'capture'): string =>
    `AUTO ARMED · ${kind === 'capture' ? 'BRAKES' : kind === 'trim' ? 'TRIMS' : 'ROUNDS'} IN ${time}`,
  flying: 'AUTOBURN IS FLYING THE SHIP',
} as const;

export const AUTO_BUTTON_REASON: Readonly<Partial<Record<AutoburnRefusal, string>>> = {
  [AUTOBURN_REFUSAL.skipping]: 'STOPS THE SKIP FIRST',
  [AUTOBURN_REFUSAL.impact]: 'FIX THE PATH',
};

// The Skills window's AUTOBURN.skl row (systems/skills.ts): a trained skill, not a card.
export const AUTOBURN_SKILL_ROW = {
  title: 'AUTOBURN.skl',
  effect: 'Brakes at ▼ for you, even from the MIND: press [B] when ▼ is near',
  trained: (accuracy: number, demos: number): string => `ACCURACY ${accuracy}% · FROM YOUR ${demos} CAPTURE${demos === 1 ? '' : 'S'}`,
  // 03 §3.3's loud UNTRAINED state: no demos yet, so it fires late (plan §7 R3).
  untrained: (accuracy: number): string => `UNTRAINED ${accuracy}% · CAPTURE BY HAND TO TEACH IT`,
  // Armed, by the mode it flies (one row per mode: 4e's landing orbit has its own).
  armed: {
    capture: 'ARMED — IT BRAKES AT ▼',
    green: 'ARMED — IT MAKES THE ORBIT GREEN',
    round: 'ARMED — IT ROUNDS THE ORBIT',
    'landing-orbit': 'ARMED — IT FLIES THE LANDING ORBIT',
  } satisfies Record<AutoMode, string>,
  waiting: 'WAITING FOR A THREAD — × AN OP',
  flying: 'FLYING THE SHIP NOW',
  damaged: (min: number): string => `DAMAGED — REPAIR IT TO ${min}% OR MORE`,
  // 4b (03 §3.5): graded damage costs a version per colour.
  worksAs: (version: number, nominal: number): string => `WORKS AS v${version} — REPAIR IT FOR v${nominal}`,
  gone: 'ITS FILE IS GONE — RESTORE IT AT THE NEXT DESK',
} as const;
