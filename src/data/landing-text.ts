import type { ForgivenessClass, LaunchRefusal, Place, ParkReason, TerrainWord, Touch } from '@/types/landing';
import { formatCount } from '@data/format';
import { STAR_FUEL_PCT } from '@data/tuning';
import { podTag } from '@data/pod-ids';

// Every landing word (docs/phase3/01-landing.md, slice 1a) as a PLACEHOLDER: 05-story owns the final wording, and the
// state words of §3.10 (CAN'T LAUNCH, PARKED IN ORBIT · fate unknown, NOT LAUNCHED) are the decided set. A pod is never
// "lost", "offline" or "not recovered"; never say "scatter", "deorbit" or "insertion", and never IMPACT for a pod (red
// IMPACT is the ship's crash).
//
// This module imports no systems on purpose: the landing's text sits outside the import cycle that runs through
// data/script.ts (guidance → pace → hollow → … → script → flight-controls → guidance), so any system may read it.
// Sections: SIM (the sim, the rules, the strip and the TERMINAL) and UI (the windows, panels and the report).

// `0:05`, `2:10`: a countdown as the strip and the panels print it (whole seconds, rounded up so 0:00 means now).
export function minSec(sec: number): string {
  const whole = Math.max(0, Math.ceil(sec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// `POD 03` on screen (the TERMINAL's `pod03` and the segment id `driver_pod03` are ids: data/pod-ids.ts).
export function podCode(pod: number): string {
  return `POD ${String(pod).padStart(2, '0')}`;
}

// The driver's segment name: `POD 03 · OKAFOR`.
export function driverName(pod: number, family: string): string {
  return `${podCode(pod)} · ${family.toUpperCase()}`;
}

// =====================================================================================================================
// SIM
// =====================================================================================================================

// What [L] says when it can't launch (the 'refused' event's reason → the strip's flash).
export const LAUNCH_REFUSAL_TEXT: Readonly<Record<LaunchRefusal, string>> = {
  'NOT LANDING': 'NOTHING TO LAUNCH YET',
  'LANDING OVER': 'THE LANDING IS OVER',
  'PAUSED': 'PAUSED',
  'SHIP SCREEN': 'SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]',
  'ENGINE FIRING': "ENGINE FIRING — can't launch under thrust",
  'NO DROP SOLUTION': 'NO DROP SOLUTION — REPAIR NAV PLOTTER',
  'OUT OF THE LAUNCH BAND': 'OUT OF THE LAUNCH BAND',
  'NO POD READY': 'NO POD READY — REPAIR a driver',
  'RELOADING': 'RELOADING',
  'BAY EMPTY': 'BAY EMPTY — reloading',
};

// A refused launch's 'refused' event reason (landing.ts requestLaunch, for the player only), namespaced so it can't
// collide with the tools' refusals ('PAUSED'), and its line on the strip for a moment (data/script.ts REFUSAL_LINES:
// the buzz alone never says why).
export function launchRefusalKey(refusal: LaunchRefusal): string {
  return `LAUNCH|${refusal}`;
}

export const LAUNCH_REFUSAL_LINES: Readonly<Record<string, { text: string; keys: readonly string[] }>> = Object.fromEntries(
  (Object.entries(LAUNCH_REFUSAL_TEXT) as [LaunchRefusal, string][]).map(([refusal, text]) => [
    launchRefusalKey(refusal), { text, keys: refusal === 'SHIP SCREEN' ? ['TAB'] : [] },
  ]),
);

// The inline confirms at [L] (§3.3) and END LANDING (§3.10). Enter confirms.
export const LAUNCH_CONFIRM_TEXT = {
  offSite: (terrain: TerrainWord, points: number): string => `LAUNCH OFF-SITE? ${terrain} · scores ${formatCount(points)}`,
  full: (lz: string, points: number): string => `${lz} IS FULL — LAUNCH ANYWAY? scores ${formatCount(points)}`,
  endLanding: (pods: number): string =>
    pods === 0 ? 'END THE LANDING?' : `${pods} POD${pods === 1 ? '' : 'S'} WILL BE PARKED IN ORBIT · NOT COUNTED`,
  yes: '✓ LAUNCH',
  no: '✗ WAIT',
} as const;

// The TERMINAL's echoes (§3.8): `> launch pod03 ... LZ-A`, then `> pod03 ... LANDED`.
export const LANDING_ECHO = {
  launch: (pod: number, aimLz: string | null): string => `> launch ${podTag(pod)} ... ${aimLz ?? 'OFF-SITE'}`,
  touchdown: (pod: number, place: Place, lz: string | null, touch: Touch): string => {
    const hard = touch === 'hard' ? ' · HARD' : '';
    switch (place) {
      case 'lz': return `> ${podTag(pod)} ... LANDED${hard}`;
      case 'mislanded': return `> ${podTag(pod)} ... LANDED · ${lz ?? '?'} FULL${hard}`;
      case 'off-site': return `> ${podTag(pod)} ... OFF-SITE${hard}`;
      case 'no-go': return `> ${podTag(pod)} ... NO-GO ZONE`;
      default: throw new Error(`LANDING_ECHO: unknown place '${String(place)}'`);
    }
  },
  parked: (pod: number): string => `> ${podTag(pod)} ... PARKED IN ORBIT`,
} as const;

// The boot's host line (§2): `> HOST: ARES-VII · 3 PODS · 600 COLONISTS`.
export function hostLine(shipName: string, pods: number, colonists: number): string {
  return `> HOST: ${shipName} · ${pods} POD${pods === 1 ? '' : 'S'} · ${formatCount(colonists)} COLONISTS`;
}

// The decided state words (§3.10), one per state.
export const POD_STATE_TEXT = {
  cantLaunch: "CAN'T LAUNCH",
  parked: 'PARKED IN ORBIT · fate unknown',
  notLaunched: 'NOT LAUNCHED',
  launched: 'LAUNCHED',
} as const;

// Why a pod was parked, for the report's PARKED row and the TERMINAL.
export const PARK_REASON_TEXT: Readonly<Record<ParkReason, string>> = {
  eaten: 'its driver was eaten',
  dead: 'its driver died',
  'no-time': 'no time',
};

// The landing guidance table (§3.11), rows L0–L7 and L11–L13 (plus L12b). landing-guidance.ts (Track SIM) picks the row.
export const LANDING_LINES = {
  L0: 'EVERY POD IS DOWN — now DELETE THE ROOT',
  L1: 'NO DROP SOLUTION — TAB, REPAIR NAV PLOTTER',
  L3: (full: string, next: string | null): string => (next === null ? `${full} FULL — hold the pods` : `${full} FULL — hold the pods for ${next}`),
  L4: (lz: string, down: number, count: number): string => `LAUNCH NOW — press [L] · ${lz} ${down}/${count}`,
  L5: 'LAUNCH — press [L] · WIDE DROP, some may miss',
  L6: (inSec: number): string => `RELOADING — next pod in ${minSec(inSec)}`,
  L7: (lz: string, inSec: number): string => `GET READY — ${lz} IN ${minSec(inSec)}`,
  L11: (pod: number): string => `${podCode(pod)} CAN'T LAUNCH — TAB, REPAIR its driver`,
  L12: 'NO POD CAN LAUNCH — END LANDING parks them in orbit',
  L12b: (falling: number): string => (falling > 0 ? `ALL PODS AWAY · ${falling} FALLING` : 'ALL PODS AWAY'),
  L13: (lz: string, inSec: number, outOfBand: boolean): string =>
    `WAIT — ${lz} in ${minSec(inSec)} ▸▸ · [F] to SKIP${outOfBand ? ' · OUT OF BAND' : ''}`,
} as const;

// The landing's SKIP inhibitors (§3.12).
export const LANDING_SKIP_REFUSAL = {
  windowOpen: 'WINDOW OPEN',
  podsInFlight: 'PODS IN FLIGHT',
} as const;

// The strip's asks and hints around a landing (§3.11, plan §1.6).
export const LANDING_ASKS = {
  hurtDriver: (pod: number): string => `${podCode(pod)} WILL LAND HARD — REPAIR its driver`,
  mindClear: (lz: string): string => `MIND CLEAR — press [F] to SKIP to ${lz}`,
} as const;

// Lessons, once each (§3.11).
export const LANDING_LESSONS = {
  dot: '◆ PODS LAND WHERE THE DOT IS',
  split: (counts: readonly { lz: string; pods: number }[]): string =>
    `◆ ${counts.length} SITES · ${counts.map((count) => `${count.lz} ${count.pods}`).join(', ')} — don't overfill`,
} as const;

// ARRIVAL CONTROL's beats (§2): at the landing's start and at the first touchdown.
export const LANDING_BEATS = {
  start: "Lovely orbit! Let's get them down. :)",
  firstDown: "They're down! :)",
} as const;

// The radio line from the ground at a ship's first touchdown: `POD 01 · OKAFOR: "Is it morning?"`.
export function groundRadioLine(pod: number, family: string, firstWords: string): string {
  return `${driverName(pod, family)}: "${firstWords}"`;
}

// The filesystem tools on a driver (§3.8): a mistake never costs a pod.
export const DRIVER_TOOL_TEXT = {
  copy: 'ONE POD, ONE DRIVER',
  delete: "You can't delete a pod's driver.",
  scan: 'NO SCAN NEEDED',
} as const;

// The colony's name (05 §, placeholder pool): run 1's written one, else `{FAMILY} LANDING` half the time, else one of
// these. One name per ship, given at its first touchdown.
export const COLONY_NAME_POOL: readonly string[] = [
  'LANTERN', 'HOPEWELL', 'NEW DAWN', 'FIRSTFIELD', 'HARBOUR', 'KINDLE', 'STILLWATER', 'GREENREACH', 'TALLGRASS', 'HEARTH',
];

export function familyColonyName(family: string): string {
  return `${family.toUpperCase()} LANDING`;
}

// =====================================================================================================================
// UI — everything below this banner is owned by Track UI (slice-1a-plan §4). SIM and TESTS don't edit it; SIM's words
// stay above.
// =====================================================================================================================

// `1,200 / 2,400 LANDED` (the same words as data/script.ts LANDED_TEXT.count, which the strip uses).
function landedCount(landed: number, of: number): string {
  return `${formatCount(landed)} / ${formatCount(of)} LANDED`;
}

// RUN END (§9 WP7 item 7, 01-landing §3.9): LANDED counts the colonists who came down in an LZ with room; the run's
// SCORE is the landing points, shown only here and labelled as one; the rank is by SCORE.
// TODO(slice1a-UI): RUN END's layout for the landing (per-ship LANDED rows, points); these are its words for now.
// (Moved here from data/script.ts in the foundation follow-up: it is UI's.)
export const RUN_END_TEXT = {
  kicker: (unit: string, wave: number): string => `RUN OVER · ${unit} · WAVE ${wave}`,
  total: landedCount,
  score: (score: number): string => `SCORE ${formatCount(score)}`,
  scoreNote: 'the SCORE is the landing points: less for hard, mislanded and off-site pods',
  rank: (rank: string): string => `RANK · ${rank}`,
  shipLanded: landedCount,
  notReached: 'NOT REACHED',
  // Near misses (§4.4: `▼ was 140 km from a perfect lock`, `41 points short of CARETAKER`). The gap is in SCORE points,
  // so it says points (final review: `41 SCORE short of` read as a typo).
  rankGap: (gap: number, rank: string): string => `${formatCount(gap)} points short of ${rank}`,
  lockMiss: (apsis: string, km: number, ship: string): string => `${apsis} was ${formatCount(km)} km from a perfect lock on ${ship}`,
  fuelMiss: (pct: number, ship: string): string => `${ship} locked with FUEL ${pct}% — the ★ is at ${STAR_FUEL_PCT}%`,
  seed: (seed: number): string => `SEED ${seed.toString(16).toUpperCase().padStart(8, '0')}`,
  newRun: 'NEW RUN ▸ [SPACE]',
} as const;


// The NAV PLOT's ring and the readouts that named the printer.
export const BAND_TEXT = {
  ringFlight: 'SAFE ORBIT · LAUNCH BAND',
  ringLanding: 'LAUNCH BAND',
  inBand: (pct: number): string => `IN BAND ${pct}%`,
  accept: (pct: number): string => `ACCEPT · IN BAND ${pct}%`,
} as const;

// The POD BAY window (§4).
export const POD_BAY_TEXT = {
  title: 'POD BAY',
  launch: '[ L · LAUNCH POD ]',
  bay: (loaded: number, slots: number, reloadSec: number | null): string =>
    `BAY ${'▮'.repeat(loaded)}${'▯'.repeat(Math.max(0, slots - loaded))} ${loaded}/${slots}${reloadSec === null ? '' : ` · RELOAD ${minSec(reloadSec)}`}`,
  next: (pod: number, family: string, touch: Touch, halfWidthKm: number): string =>
    `NEXT ${driverName(pod, family)} · ${touch === 'soft' ? 'SOFT' : 'HARD'} · ±${Math.round(halfWidthKm)} km`,
  lzCounter: (lz: string, down: number, count: number): string => `${lz} ${down}/${count}${down >= count ? ' ✓' : ''}`,
  endLanding: 'END LANDING',
  bayCtrl: 'BAY CTRL',
} as const;

// The header's crumbs and the footer (§4).
export const LANDING_HUD_TEXT = {
  crumbLanding: (down: number, total: number): string => `LANDING · ${down}/${total} DOWN`,
  crumbAllDown: 'ALL DOWN',
  footer: (aboard: number, landed: number, cantLaunch: number): string =>
    `PODS: ${aboard} ABOARD · ${landed} LANDED${cantLaunch > 0 ? ` · ${cantLaunch} CAN'T LAUNCH` : ''}`,
  toggleOpen: (lz: string): string => `◀ SHIP · ${lz} OPEN`,
  onTarget: (pods: number, of: number): string => `ON TARGET ${pods}/${of}`,
} as const;

// The detail panel on a driver (§3.8).
export const DRIVER_DETAIL_TEXT = {
  soft: (halfWidthKm: number): string => `WILL LAND SOFT · DROP ±${Math.round(halfWidthKm)} km`,
  hard: 'WILL LAND HARD',
  cantLaunch: "CAN'T LAUNCH — REPAIR IT",
  loadNext: 'LOAD NEXT',
  tagBay: 'BAY',
  tagNext: 'NEXT',
} as const;

// The touchdown's float (§4 juice) and stamps.
export const TOUCHDOWN_FLOAT_TEXT = {
  lz: (points: number, lz: string, touch: Touch): string => `+${points} ${touch === 'hard' ? 'HARD' : 'LANDED'} · ${lz}`,
  mislanded: (points: number, lz: string): string => `+${points} MISLANDED · ${lz} FULL`,
  offSite: (points: number, touch: Touch): string => `+${points} ${touch === 'hard' ? 'HARD · ' : ''}OFF-SITE`,
  noGo: '+0 NO-GO ZONE',
} as const;

export const LANDING_STAMP_TEXT = {
  firstLanding: 'FIRST LANDING',
  allDown: 'ALL PODS DOWN',
} as const;

// The forgiveness classes as the card and the report name them (§3.15).
export const FORGIVENESS_TEXT: Readonly<Record<ForgivenessClass, { word: string; offSite: string }>> = {
  gentle: { word: 'GENTLE', offSite: 'off-site pods score half' },
  rough: { word: 'ROUGH', offSite: 'off-site pods score a quarter' },
  harsh: { word: 'HARSH', offSite: 'off-site pods score nothing' },
};

// The LANDING REPORT (§4). Track UI builds the real screen; these are its words.
export const LANDING_REPORT_TEXT = {
  title: 'LANDING REPORT',
  route: (ship: string, world: string, terrain: TerrainWord, cls: ForgivenessClass): string =>
    `${ship} → ${world.toUpperCase()} · ${terrain} · ${FORGIVENESS_TEXT[cls].word}`,
  colony: (name: string): string => `they are calling it ${name}`,
  lzRow: (lz: string, landed: number, count: number): string =>
    landed >= count ? `${lz} ${formatCount(landed)} / ${formatCount(count)} ✓`
      : `${lz} ${formatCount(landed)} / ${formatCount(count)} · ${formatCount(count - landed)} SHORT`,
  short: (lz: string, colonists: number): string => `${lz} ${formatCount(colonists)} SHORT`,
  offSite: (colonists: number): string => `OFF-SITE ${formatCount(colonists)}`,
  noGo: (colonists: number): string => `NO-GO ${formatCount(colonists)}`,
  parked: (pod: number): string => `${podCode(pod)} · ${POD_STATE_TEXT.parked}`,
  notLaunched: (pod: number): string => `${podCode(pod)} · ${POD_STATE_TEXT.notLaunched}`,
  restored: 'RESTORED BY MERGE',
  headline: (landed: number, aboard: number): string => `LANDED ${formatCount(landed)} / ${formatCount(aboard)}`,
  points: (points: number): string => `${formatCount(points)} POINTS`,
  nearMiss: (pod: number, km: number, lz: string): string => `${podCode(pod)} landed ${Math.round(km)} km outside ${lz}`,
  continue: 'CONTINUE ▸ [SPACE]',
  runEnd: 'RUN END ▸ [SPACE]',
} as const;

// The stars as the LANDING REPORT judges them (§3.9).
export const LANDING_STAR_TEXT = {
  locked: 'ORBIT LOCKED',
  onTarget: (pods: number, of: number): string => `ON TARGET ${pods}/${of}`,
  fuel: (shownPct: number): string => `FUEL ${shownPct}%`,
} as const;

export const LANDING_STAR_MISSED = {
  accepted: 'ACCEPTED — part of the loop stayed outside the band',
  onTarget: (short: number): string => `${formatCount(short)} colonists missed a soft landing in an LZ with room`,
  fuelNoLock: 'the FUEL ★ is counted only after ORBIT LOCKED',
  fuelLow: (shownPct: number, starPct: number): string => `FUEL ${shownPct}% at the end of the landing — the ★ notch is at ${starPct}%`,
} as const;

// The LOST card's pods line (components/burn/BurnResult.ts): what the lost ship still carried, and what got down first.
export const LOST_CARD_TEXT = {
  pods: (aboard: number, landed: number): string => `${formatCount(aboard)} colonists aboard · ${formatCount(landed)} landed`,
} as const;

// The GROUND TRACK panel (§4): its header (`KEPLER-186F · RIVERSIDE` once the colony is named), the brackets on the
// strip (`[ LZ-A · 1/3 ]`), the next LZs waiting at the right edge (`LZ-B ▸ 2:10`) and what it says with no dot.
export const GROUND_TRACK_TEXT = {
  header: (world: string, colony: string | null): string => (colony === null ? world.toUpperCase() : `${world.toUpperCase()} · ${colony}`),
  bracket: (lz: string, down: number, count: number): string => `[ ${lz} · ${down}/${count}${down >= count ? ' ✓' : ''} ]`,
  ahead: (lz: string, countdown: string): string => `${lz} ▸ ${countdown}`,
  aheadOpen: (lz: string): string => `${lz} ▸ OPEN`,
  aheadFull: (lz: string): string => `${lz} ✓`,
  noSolution: 'NO DROP SOLUTION',
  noDot: 'NO DROP · THE ORBIT IS OPEN',
  outOfBand: 'OUT OF BAND',
  drop: (halfWidthKm: number): string => `DROP ±${Math.round(halfWidthKm)} km`,
} as const;

// The NAV PLOT's bracket labels (`LZ-A 1/3`) and the header countdown chip in LANDING (the next window: `LZ-A IN`, then
// `LZ-A OPEN` while it is open).
export const LANDING_PLOT_TEXT = {
  bracket: (lz: string, down: number, count: number): string => `${lz} ${down}/${count}${down >= count ? ' ✓' : ''}`,
  chipIn: (lz: string): string => `${lz} IN`,
  chipOpen: (lz: string): string => `${lz} OPEN`,
} as const;

// The POD BAY window's live words beyond POD_BAY_TEXT: why [L] would not launch now, and what it would ask first.
export const POD_BAY_STATUS_TEXT = {
  ready: 'READY',
  offSite: 'DOT OFF-SITE · asks first',
  full: (lz: string): string => `${lz} FULL · asks first`,
  allAway: 'ALL PODS AWAY',
  noNext: 'NO POD READY',
  cantLaunch: (pods: number): string => `${pods} CAN'T LAUNCH`,
  endConfirmYes: '✓ END LANDING',
  endConfirmNo: '✗ KEEP LANDING',
  phoneLaunch: 'LAUNCH',
} as const;

// The mini-HUD in blue while landing (§4): the next window and the bay.
export const MINI_LANDING_TEXT = {
  windowOpen: (lz: string): string => `${lz} OPEN`,
  windowIn: (lz: string, countdown: string): string => `${lz} IN ${countdown}`,
  allAway: 'ALL PODS AWAY',
  bay: (shown: number, slots: number): string => `BAY ${'▮'.repeat(shown)}${'▯'.repeat(Math.max(0, slots - shown))}`,
} as const;

// The LANDING REPORT's other words (§4): the skip, the charge the stars carry, the last ship, a credit's line.
export const LANDING_REPORT_UI_TEXT = {
  skip: 'SKIP ▸▸ [SPACE]',
  charge: (bonus: number, perStar: number): string => (bonus > 0
    ? `+${bonus} REPAIR CHARGE ON NEXT SHIP`
    : `+0 REPAIR CHARGE ON NEXT SHIP · each ★ is worth +${perStar}`),
  lastShip: 'THE LAST SHIP · the run ends here',
  // `OKAFOR, ADA (11) · LZ-A · "Is it morning?"`
  credit: (name: string, age: number, where: string, words: string): string => `${name.toUpperCase()} (${age}) · ${where} · “${words}”`,
  creditWhere: (place: Place, lz: string | null, touch: Touch): string => {
    const hard = touch === 'hard' ? ' · HARD' : '';
    switch (place) {
      case 'lz': return `${lz ?? '?'}${hard}`;
      case 'mislanded': return `${lz ?? '?'} FULL${hard}`;
      case 'off-site': return `OFF-SITE${hard}`;
      case 'no-go': return 'NO-GO';
      default: throw new Error(`creditWhere: unknown place '${String(place)}'`);
    }
  },
  breakdown: (soft: number, hard: number, mislanded: number, offSite: number): string =>
    `${formatCount(soft)} soft · ${formatCount(hard)} hard · ${formatCount(mislanded)} mislanded · ${formatCount(offSite)} off-site`,
} as const;
