import type { ForgivenessClass, LaunchRefusal, Place, ParkReason, TerrainWord, Touch } from '@/types/landing';
import { formatCount } from '@data/format';

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

// `POD 03` on screen, `pod03` in the TERMINAL's echoes, `driver_pod03` as the segment id.
export function podCode(pod: number): string {
  return `POD ${String(pod).padStart(2, '0')}`;
}

export function podTag(pod: number): string {
  return `pod${String(pod).padStart(2, '0')}`;
}

export function driverSegId(pod: number): string {
  return `driver_${podTag(pod)}`;
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

// The inline confirms at [L] (§3.3) and END LANDING (§3.10). Enter confirms.
export const LAUNCH_CONFIRM_TEXT = {
  offSite: (terrain: TerrainWord, points: number): string => `LAUNCH OFF-SITE? ${terrain} · scores ${formatCount(points)}`,
  full: (lz: string, points: number): string => `${lz} IS FULL — LAUNCH ANYWAY? scores ${formatCount(points)}`,
  endLanding: (pods: number): string =>
    pods === 0 ? 'END THE LANDING?' : `${pods} POD${pods === 1 ? '' : 'S'} WILL BE PARKED IN ORBIT · NOT COUNTED`,
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
// UI
// =====================================================================================================================

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
