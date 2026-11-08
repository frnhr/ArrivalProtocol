// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): BULLSEYE. Others ask by message.
import type { ForgivenessClass, LandingEnd, LaunchRefusal, Place, ParkReason, TerrainWord, Touch } from '@/types/landing';
import type { BadGround } from '@/types/survey';
import { formatCount } from '@data/format';
import { STAR_FUEL_PCT } from '@data/tuning';
import { podTag } from '@data/pod-ids';
import { AUTODROP_TEXT } from '@data/autodrop-text';
import { SWATH_TEXT } from '@data/swath-text';

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
  // Slice 7b (Track DROP, the lead's grant): THE LAST LANDING's pods are MERGE's to fly (R26: no input but [ENTER]), so the
  // kid's [L], the POD BAY's LAUNCH and __ap.launch are refused while it flies.
  'MERGE FLYING': 'MERGE IS FLYING THEM — [ENTER] SKIPS TO THE END',
  'PAUSED': 'PAUSED',
  'SHIP SCREEN': 'SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]',
  // Bay Ctrl missing (§3.4's BAY OFFLINE). Said as BAND_COPY.bay.missing says it: "offline" next to pods would read as
  // theirs (§3.10).
  'BAY OFFLINE': 'NO BAY CTRL — no pod can launch',
  'ENGINE FIRING': "ENGINE FIRING — can't launch under thrust",
  'NO DROP SOLUTION': 'NO DROP SOLUTION — REPAIR NAV PLOTTER',
  'OUT OF THE LAUNCH BAND': 'OUT OF THE LAUNCH BAND',
  // Slice 5 (04 §3.12, plan R7): a corrupted resident's lock. The table is static, so it names the ship's AI, not the
  // resident (the strip's own resident line names it: data/resident-rules.ts).
  'POD LOCKED': 'CAN\'T LAUNCH · LOCKED BY THE SHIP\'S AI',
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

// END LANDING refused on a path into the planet (review B1, landing-rules endLandingRefusal 'IMPACT'): the landing can't
// end (and park the pods in orbit) while the ship is about to leave it through the ground. The POD BAY's END LANDING
// button says it in place of its label, and the 'refused' event flashes it on the strip (END_LANDING_REFUSAL_KEY).
export const END_LANDING_REFUSAL_TEXT = "DON'T HIT THE PLANET first";
export const END_LANDING_REFUSAL_KEY = 'END|HITS THE PLANET';

// The inline confirms at [L] (§3.3) and END LANDING (§3.10). Enter confirms.
export const LAUNCH_CONFIRM_TEXT = {
  offSite: (terrain: TerrainWord, points: number): string => `LAUNCH OFF-SITE? ${terrain} · scores ${formatCount(points)}`,
  full: (lz: string, points: number): string => `${lz} IS FULL — LAUNCH ANYWAY? scores ${formatCount(points)}`,
  // The dot's centre over a no-go arc (§3.6), in the arc's own word: `LAUNCH INTO LAVA? scores 0` (slice 1b).
  noGo: (word: string, points: number): string => `LAUNCH INTO ${word}? scores ${formatCount(points)}`,
  endLanding: (pods: number): string =>
    pods === 0 ? 'END THE LANDING?' : `${pods} POD${pods === 1 ? '' : 'S'} WILL BE PARKED IN ORBIT · NOT COUNTED`,
  yes: '✓ LAUNCH',
  no: '✗ WAIT',
} as const;

// The TERMINAL's echoes (§3.8): `> launch pod03 ... LZ-A`, then `> pod03 ... LANDED`.
export const LANDING_ECHO = {
  launch: (pod: number, aimLz: string | null): string => `> launch ${podTag(pod)} ... ${aimLz ?? 'OFF-SITE'}`,
  // `bullseye` (slice 4c): AUTODROP sent it and it came down soft in an LZ with room (`> pod03 ... LANDED · BULLSEYE`).
  // `revealing` (slice 6, plan §2.9; landing.ts touchDown works it out before 'pod-landed'): this touchdown makes a bad ground
  // known, its LZ's ROCKY or WET; null otherwise (and on every GOOD planet).
  touchdown: (pod: number, place: Place, lz: string | null, touch: Touch, bullseye = false, revealing: BadGround | null = null): string => {
    const hard = touch === 'hard' ? ' · HARD' : '';
    // Slice 6 SWATH: its one line here appends SWATH_TEXT.echoTail(lz, revealing) when `revealing` is set
    // (`> pod03 ... LANDED · HARD · LZ-B IS WET`).
    if (revealing !== null && lz !== null) return LANDING_ECHO.touchdown(pod, place, lz, touch, bullseye) + SWATH_TEXT.echoTail(lz, revealing);
    switch (place) {
      case 'lz': return `> ${podTag(pod)} ... LANDED${hard}${bullseye && touch === 'soft' ? AUTODROP_TEXT.bullseye : ''}`;
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

// A score factor as the strip says it: `¾`, else `×0.6`.
function scoreFraction(factor: number): string {
  const glyph: Readonly<Record<number, string>> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  return glyph[factor] ?? `×${factor}`;
}

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
  // L1 and L11 read in the MIND, where the TAB is done (the flight's F1/F2 do the same).
  L1Mind: 'NO DROP SOLUTION — REPAIR NAV PLOTTER',
  L11Mind: (pod: number): string => `${podCode(pod)} CAN'T LAUNCH — REPAIR its driver`,
  L12: 'NO POD CAN LAUNCH — END LANDING parks them in orbit',
  // L12's twin when no LZ ever passes under the dot while the ship is in the band (a PARTIAL orbit whose band arc misses
  // every bracket): with no engine in 1a nothing will change that (plan Deviations, Track SIM).
  L12band: 'NO LZ IN THE LAUNCH BAND — END LANDING parks them in orbit',
  L12b: (falling: number): string => (falling > 0 ? `ALL PODS AWAY · ${falling} FALLING` : 'ALL PODS AWAY'),
  // L3's twin when no LZ whose window is in the band has room left (review M1: a PARTIAL orbit whose other LZ is out of
  // band): the launch the kid still has is into a full LZ, at the mislanded score (`factor`: MISLANDED_FACTOR), and
  // END LANDING parks the rest. While that window is open: [L]; until it is: the wait to it.
  L3b: (factor: number): string => `NO ROOM IN THE BAND — [L] lands in a full LZ (${scoreFraction(factor)}), or END LANDING`,
  L13noRoom: (lz: string, inSec: number, skip: boolean): string =>
    `NO ROOM IN THE BAND — ${lz} in ${minSec(inSec)}${skip ? ' · [F] to SKIP' : ''}, or END LANDING`,
  // `· [F] to SKIP` only while a SKIP would start (as the flight's WAIT rows offer it).
  L13: (lz: string, inSec: number, skip: boolean, outOfBand: boolean): string =>
    `WAIT — ${lz} in ${minSec(inSec)} ▸▸${skip ? ' · [F] to SKIP' : ''}${outOfBand ? ' · OUT OF BAND' : ''}`,
  // Slice 5 review fix pass (M1): an open window another controller flies (autodrop.ts controllerWaitLine: the sleeper's
  // RUN THE DROPS, MERGE's landing): its next launch, with no key and no name (R21).
  L13controller: (lz: string, inSec: number): string => `WAIT — ${lz} in ${minSec(inSec)}`,
} as const;

// The landing's SKIP inhibitors (§3.12), and its "too close" refusal (the window's GET READY is about to start).
export const LANDING_SKIP_REFUSAL = {
  windowOpen: 'WINDOW OPEN',
  podsInFlight: 'PODS IN FLIGHT',
  windowSoon: 'WINDOW COMING UP',
  over: 'THE LANDING IS OVER',
} as const;

// The strip's asks and hints around a landing (§3.11, plan §1.6).
export const LANDING_ASKS = {
  hurtDriver: (pod: number): string => `${podCode(pod)} WILL LAND HARD — REPAIR its driver`,
  mindClear: (lz: string): string => `MIND CLEAR — press [F] to SKIP to ${lz}`,
} as const;

// Lessons, once each (§3.11).
// No layer glyph (slice 2, the 1b rule): the strip draws ◆ from the rule's layer (ObjectiveStrip LAYER_GLYPH).
// A returning unit's split lesson is the short form (v2 §5.2: "one hint each"): the counts, without the advice it already
// took on its first run.
const splitCounts = (counts: readonly { lz: string; pods: number }[]): string =>
  `${counts.length} SITES · ${counts.map((count) => `${count.lz} ${count.pods}`).join(', ')}`;
export const LANDING_LESSONS = {
  dot: 'PODS LAND WHERE THE DOT IS',
  split: (counts: readonly { lz: string; pods: number }[]): string => `${splitCounts(counts)} — don't overfill`,
  splitShort: splitCounts,
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

// --- 1b ORBIT ----------------------------------------------------------------------------------------------------------
// Slice 1b's ORBIT words (slice-1b-plan §3.0 item 4): owned by Track ORBIT; DROP and UI don't edit them. PLACEHOLDERS
// that keep §3.10's word rules (05-story owns the final wording); every line fits MAX_LINE_CHARS with worst-case values,
// [TAB] wordings included (tests/unit/landing/table.test.ts).

// The flight table's rows in landing (guidance landingFlightRow, shown as L2): GO LOWER's timeline (§3.7, the START BURN
// shape with the ◇ point), the 'lift' burn's rows (L10's key: F11's shape), and the L2 wrapper that names the LZ a burn
// is for when it fits. `press` is guidance's preset hint (`press [S] (RETRO)`, or the Q/E wording).
export const LANDING_FLIGHT_LINES = {
  goLow: (press: string): string => `GO LOWER — at ◇ ${press}`,
  goLowProblem: 'GO LOWER',                                               // due now: `GO LOWER — press [S] (RETRO), hold [SPACE] NOW`
  goLowKeep: (lz: string): string => `KEEP HOLDING — until ${lz}'s dot fits`,
  goLowRelease: 'RELEASE [SPACE]',
  liftProblem: 'ORBIT SINKING',                                           // `ORBIT SINKING — at ▲ press [W] (PRO) and burn`
  liftKeep: 'KEEP HOLDING — lift ▼ until the orbit holds',   // over the DRAG line, or just over the floor (liftTargetKm)
  liftRelease: 'RELEASE [SPACE]',
  // L2's wrapper: the tail naming the LZ a burn is for (GO LOWER's WAIT, a trim that brings an LZ back in band).
  forLz: (lz: string): string => ` · for ${lz}`,
} as const;

// L10 (§3.11): decay takes ▼ out of the band within DECAY_WARN_ORBITS orbits; the row carries the 'lift' burn's key.
// At 0 orbits ▼ is under the band already (review minor 2: it read `in 1 orbit`).
export const LANDING_DECAY_LINES = {
  L10: (orbits: number): string => {
    if (orbits <= 0) return 'ORBIT DECAYED — ▼ is out of the band';
    const whole = Math.max(1, Math.ceil(orbits));
    return `ORBIT DECAYING — out of the band in ${whole} orbit${whole === 1 ? '' : 's'}`;
  },
} as const;

// The landing table's fallback when there is no drop dot and no flight row leads (`landing-L13-nodrop`): an open path or
// an orbit outside the drop solver's domain (landing-orbit dropSolvable), so no window can be named until the orbit is
// back. Normally L2's flight row (F9/F10, a trim) says what to burn; this covers the moments it has nothing to say.
export const LANDING_NODROP_LINES = {
  L13noDrop: 'NO DROP DOT ON THIS PATH — fly back into the launch band',
  // L12's twin (`landing-L12-nodrop`, review M1): no drop dot and no burn can bring one back (the tank is empty, or
  // short of the burn the plan needs), so nothing will change; END LANDING is the way on, and the landing ends by itself
  // once the tank is empty (landing-rules landingStuck 'no-drop').
  L12noDrop: 'NO DROP DOT ON THIS ORBIT — END LANDING parks them in orbit',
} as const;

// L7b (review M2): the engine fires by itself during the landing (a failing Thrust Ctrl), and a SWAP fixes it. The flight
// table's F2 words a SWAP the same way (`[TAB], SWAP …` from the ship; `REPAIR Swap first` while the Swap file is too
// damaged); in the MIND it reads as the VESPER lesson (GHOST_TEXT.swapLesson) with the backup's name.
export const LANDING_GHOST_LINES = {
  swap: 'THE ENGINE FIRES BY ITSELF — [TAB], SWAP THRUST CTRL',
  swapMind: (spare: string): string => `THE ENGINE FIRES BY ITSELF — SWAP THRUST CTRL to ${spare}`,
  fixSwap: 'THE ENGINE FIRES BY ITSELF — [TAB], REPAIR Swap first',
  fixSwapMind: 'THE ENGINE FIRES BY ITSELF — REPAIR Swap, then SWAP THRUST CTRL',
} as const;

// The drag kick's stamp on the NAV PLOT (§3.7), from DRAG_STAMP_MIN_KM: the far apsis that moved, and by how much.
export const DRAG_STAMP_TEXT = {
  kick: (apsis: '▲' | '▼', dropKm: number): string => `DRAG · ${apsis} −${formatCount(Math.round(dropKm))} km`,
} as const;

// --- 1b DROP -----------------------------------------------------------------------------------------------------------
// Slice 1b's DROP words (slice-1b-plan §3.0 item 4): owned by Track DROP; ORBIT and UI don't edit them. PLACEHOLDERS
// under §3.10's word rules (a pod is never lost, offline or not recovered); every line fits MAX_LINE_CHARS with
// worst-case values, [TAB] wordings included.

export const LANDING_DROP_LINES = {
  // L8 (§3.11): Sensor Interp failing or worse with the next window close. By plotFault's cause: hurt asks for the REPAIR
  // (from the ship with TAB, as L1), a repair or move the kid started is only waited out, a missing file has no fix.
  L8: 'DROP UNCERTAIN — TAB, REPAIR SENSOR INTERP',
  L8Mind: 'DROP UNCERTAIN — REPAIR SENSOR INTERP',
  L8busy: (cause: 'repairing' | 'moving'): string => `DROP UNCERTAIN — SENSOR INTERP IS ${cause === 'repairing' ? 'REPAIRING' : 'MOVING'}…`,
  L8missing: 'DROP UNCERTAIN — NO SENSOR INTERP',
  // L9 (§3.11): the awaited LZ has no sure window. `file`: the REPAIR that gives one (`POD 05`, `SENSOR INTERP`, `NAV
  // PLOTTER`), null when only GO LOWER does; `lower`: GO LOWER would (L2 times the burn). `tab`: said from the ship, so
  // a REPAIR names the TAB first as L1, L8 and L11 do (§3.11's L9 text has none; every other row that asks for a REPAIR
  // from the ship says how to get there, and a kid who reads `REPAIR POD 05` in amber must not have to guess). The
  // worst case still fits with the SKIP tail: `DROP TOO WIDE FOR LZ-D — TAB, REPAIR SENSOR INTERP, or fly lower · [F]`
  // is 70. L9skip: the SKIP tail (risk 12), added only when the line still fits.
  L9: (lz: string, file: string | null, lower: boolean, tab: boolean): string => {
    if (file === null) return `DROP TOO WIDE FOR ${lz} — fly lower`;
    return `DROP TOO WIDE FOR ${lz} — ${tab ? 'TAB, ' : ''}REPAIR ${file}${lower ? ', or fly lower' : ''}`;
  },
  L9skip: ' · [F]',
  // L5's variant (risk 13): the dot's span overlaps a no-go arc, so a wide dot can land in it (the arc's own word).
  L5noGo: (word: string): string => `LAUNCH — press [L] · WIDE DROP, ${word} in reach`,
  // L3b's twin (`landing-L3b-wide`, review minor 8): the one launch left is into a full LZ, and the dot does not fit it
  // either, so some may land outside it (L5's WIDE DROP, said the same way).
  L3bWide: 'NO ROOM IN THE BAND — [L] lands in a full LZ, WIDE DROP',
  // L12-bay (§3.4): Bay Ctrl missing, no pod can launch; the landing auto-ends ('bay-offline') after LANDING_NONE_LEFT_SEC.
  L12bay: 'NO BAY CTRL — END LANDING parks them in orbit',
} as const;

// Why the landing ended, for the LANDING REPORT and the TERMINAL (null: nothing to say, the pods' own rows tell it).
// Only the bay's ending needs words: its parked pods' own reason reads `no time` (landing-rules parkReasonOf).
export const LANDING_END_TEXT: Readonly<Record<LandingEnd, string | null>> = {
  'all-launched': null,
  'end-landing': null,
  'no-driver-left': null,
  'bay-offline': 'NO BAY CTRL — the pods still aboard were parked in orbit',
  'ship-lost': null,   // the LOST card says it (run shipLost)
  'no-drop': 'NO DROP DOT ON THIS ORBIT — the pods still aboard were parked in orbit',
};

// The two lessons tied to 1b's mechanics (§3.11, risk 14), once each, said by data/script.ts (Track DROP is its editor).
// §3.11 writes them `◆ …`: the ◆ is the strip's ship-layer glyph (ObjectiveStrip draws it from the rule's layer), so it
// is not part of the text; with it the strip read `◆ ◆ THE DOT IS WIDE`.
export const LANDING_LESSONS_1B = {
  dragSinks: 'BELOW THE DRAG LINE THE ORBIT SINKS',
  dotWide: 'THE DOT IS WIDE — REPAIR, or fly lower',
} as const;

// =====================================================================================================================
// UI — everything below this banner is owned by Track UI (slice-1a-plan §4). SIM and TESTS don't edit it; SIM's words
// stay above.
// =====================================================================================================================

// `1,200 / 2,400 LANDED` (the same words as data/script.ts LANDED_TEXT.count, which the strip uses).
function landedCount(landed: number, of: number): string {
  return `${formatCount(landed)} / ${formatCount(of)} LANDED`;
}

// A drop's width as every readout prints it: `±78 km`, or `≈±195 km` from a failing Sensor Interp (§3.8's `≈` labels).
function dropWidth(halfWidthKm: number, approx: boolean): string {
  return `${approx ? '≈' : ''}±${Math.round(halfWidthKm)} km`;
}

// RUN END (§9 WP7 item 7, 01-landing §3.9): LANDED counts the colonists who came down in an LZ with room; the run's
// SCORE is the landing points, shown only here and labelled as one; the rank is by SCORE.
// (Moved here from data/script.ts in the foundation follow-up: it is UI's.)
export const RUN_END_TEXT = {
  kicker: (unit: string, wave: number): string => `RUN OVER · ${unit} · WAVE ${wave}`,
  total: landedCount,
  score: (score: number): string => `SCORE ${formatCount(score)}`,
  scoreNote: 'the SCORE is the landing points: less for hard, mislanded and off-site pods',
  rank: (rank: string): string => `RANK · ${rank}`,
  shipLanded: landedCount,
  shipPoints: (points: number): string => `${formatCount(points)} PTS`,
  notReached: 'NOT REACHED',
  // Near misses (§4.4: `▼ was 140 km from a perfect lock`, `41 points short of CARETAKER`). The gap is in SCORE points,
  // so it says points (final review: `41 SCORE short of` read as a typo).
  rankGap: (gap: number, rank: string): string => `${formatCount(gap)} points short of ${rank}`,
  lockMiss: (apsis: string, km: number, ship: string): string => `${apsis} was ${formatCount(km)} km from a perfect lock on ${ship}`,
  fuelMiss: (pct: number, ship: string): string => `${ship} locked with FUEL ${pct}% — the ★ is at ${STAR_FUEL_PCT}%`,
  seed: (seed: number): string => `SEED ${seed.toString(16).toUpperCase().padStart(8, '0')}`,
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
  // `approx`: a failing Sensor Interp's drop (§3.8 `≈` labels): `≈±195 km`.
  next: (pod: number, family: string, touch: Touch, halfWidthKm: number, approx = false): string =>
    `NEXT ${driverName(pod, family)} · ${touch === 'soft' ? 'SOFT' : 'HARD'} · ${dropWidth(halfWidthKm, approx)}`,
  lzCounter: (lz: string, down: number, count: number): string => `${lz} ${down}/${count}${down >= count ? ' ✓' : ''}`,
  endLanding: 'END LANDING',
  bayCtrl: 'BAY CTRL',
  // The card's class line (slice 1b; the ship card proper is slice 3): the ground and what a pod outside every bracket
  // scores, `PLAINS · off-site pods score half`; and the no-go arcs by their words, `NO-GO: LAVA`.
  classLine: (terrain: TerrainWord, cls: ForgivenessClass): string => `${terrain} · ${FORGIVENESS_TEXT[cls].offSite}`,
  noGoLine: (words: readonly string[]): string => `NO-GO: ${words.join(', ')}`,
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
  soft: (halfWidthKm: number, approx = false): string => `WILL LAND SOFT · DROP ${dropWidth(halfWidthKm, approx)}`,
  hard: 'WILL LAND HARD',
  cantLaunch: "CAN'T LAUNCH — REPAIR IT",
  loadNext: 'LOAD NEXT',
  tagBay: 'BAY',
  tagNext: 'NEXT',
} as const;

// The touchdown's float (§4 juice) and stamps.
export const TOUCHDOWN_FLOAT_TEXT = {
  // `bullseye` (slice 4c): AUTODROP sent it soft into an LZ with room (`+200 LANDED · LZ-A · BULLSEYE`; NavPlotWindow passes it).
  lz: (points: number, lz: string, touch: Touch, bullseye = false): string =>
    `+${points} ${touch === 'hard' ? 'HARD' : 'LANDED'} · ${lz}${bullseye && touch === 'soft' ? AUTODROP_TEXT.bullseye : ''}`,
  mislanded: (points: number, lz: string): string => `+${points} MISLANDED · ${lz} FULL`,
  offSite: (points: number, touch: Touch): string => `+${points} ${touch === 'hard' ? 'HARD · ' : ''}OFF-SITE`,
  // In the arc's own word (slice 1b): `+0 LAVA`, `+0 CLIFFS`.
  noGo: (word: string): string => `+0 ${word}`,
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
  // `3 PODS NOT LAUNCHED`, `2 PODS PARKED IN ORBIT · fate unknown · 400 landed first`
  podsFate: (pods: number, word: string, landed: number): string =>
    `${pods} POD${pods === 1 ? '' : 'S'} ${word}${landed > 0 ? ` · ${formatCount(landed)} landed first` : ''}`,
  allDown: (landed: number): string => `${formatCount(landed)} colonists landed`,
} as const;

// The GROUND TRACK panel (§4): its header (`KEPLER-186F · RIVERSIDE` once the colony is named), the brackets on the
// strip (`[ LZ-A · 1/3 ]`), the next LZs waiting at the right edge (`LZ-B ▸ 2:10`) and what it says with no dot.
export const GROUND_TRACK_TEXT = {
  header: (world: string, colony: string | null): string => (colony === null ? world.toUpperCase() : `${world.toUpperCase()} · ${colony}`),
  bracket: (lz: string, down: number, count: number): string => `[ ${lz} · ${down}/${count}${down >= count ? ' ✓' : ''} ]`,
  ahead: (lz: string, countdown: string): string => `${lz} ▸ ${countdown}`,
  aheadOpen: (lz: string): string => `${lz} ▸ OPEN`,
  aheadFull: (lz: string): string => `${lz} ✓`,
  // An LZ whose next window is launched from outside the band (a PARTIAL orbit, decay: slice 1b), at the right edge too.
  aheadOutOfBand: (lz: string): string => `${lz} ▸ OUT OF BAND`,
  noSolution: 'NO DROP SOLUTION',
  noDot: 'NO DROP · THE ORBIT IS OPEN',
  outOfBand: 'OUT OF BAND',
  drop: (halfWidthKm: number, approx = false): string => `DROP ${dropWidth(halfWidthKm, approx)}`,
} as const;

// The NAV PLOT's bracket labels (`LZ-A 1/3`) and the header countdown chip in LANDING (the next window: `LZ-A IN`, then
// `LZ-A OPEN` while it is open).
export const LANDING_PLOT_TEXT = {
  bracket: (lz: string, down: number, count: number): string => `${lz} ${down}/${count}${down >= count ? ' ✓' : ''}`,
  chipIn: (lz: string): string => `${lz} IN`,
  chipOpen: (lz: string): string => `${lz} OPEN`,
  // Slice 1b. The DRAG line's name on its faint dashed circle (§3.7); the grey dot's width (§3.8: `≈` labels); GO
  // LOWER's ◇ at its burn point (`◇ 00:42` over `GO LOWER`, as ▼ reads `▼ 08:23` over `LOWEST …`) and the LZ its target
  // tick is the launch point of.
  dragLine: 'DRAG',
  dotWidth: (halfWidthKm: number): string => dropWidth(halfWidthKm, true),
  goLowPoint: (countdown: string | null): string => (countdown === null ? '◇' : `◇ ${countdown}`),
  goLowWord: 'GO LOWER',
  goLowTarget: (lz: string): string => `${lz} ▸`,
} as const;

// The decay chip on the NAV PLOT (slice 1b, §3.7's forecast): whole orbits until ▼ leaves the band if nobody burns, and
// the 'lift' burn's key while that burn is offered (`DECAY · OUT OF BAND IN 2 ORBITS · [W]`).
// `lowerBound`: the forecast stopped at its kick limit, so the count is at least this (`IN 97+ ORBITS`, review minor 3); at
// 0 orbits ▼ is under the band already (minor 2).
export const DECAY_CHIP_TEXT = {
  chip: (orbits: number, lowerBound = false): string => {
    if (orbits <= 0) return 'DECAY · ▼ OUT OF BAND';
    const whole = Math.max(1, Math.ceil(orbits));
    return `DECAY · OUT OF BAND IN ${whole}${lowerBound ? '+' : ''} ORBIT${whole === 1 && !lowerBound ? '' : 'S'}`;
  },
  key: (key: string): string => ` · [${key}]`,
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
  down: (down: number, total: number): string => `${down}/${total} DOWN`,
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
