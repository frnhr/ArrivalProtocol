// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { ModifierId, MemoryClass, RoomFit } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import type { SaveRefusalKind } from '@/types/save';
import type { LeaveWords } from '@/types/lineage';
import type { SiteData } from '@/types/survey';
import { formatCount } from '@data/format';
import { SITES_TEXT } from '@data/sites-text';

// PLACEHOLDER(05): every word slice 3a puts on screen (slice 3c's foundation added the save, the trail and the bridge) for the galaxy map (docs/phase3/02-map.md §4, 01-landing §3.16's
// MEMORY row and room bar, 05-story.md §3.11–§3.12's title and trail; slice-3a-plan §3), drafted from the specs' sample
// lines for 05-story's owner to sign off. Each line renders to at most MAX_LINE_CHARS (70) with the longest names and
// numbers (tests/unit/map/text.test.ts) and says no never-say word (tests/unit/support/words.test.ts).
// Track DESK owns this file after the foundation; Track GEN adds its boot lines here too (MAP_TEXT.boot).

const yrs = (years: number): string => `${years} ${Math.abs(years) === 1 ? 'YR' : 'YRS'}`;
const years = (n: number): string => `${n} ${Math.abs(n) === 1 ? 'YEAR' : 'YEARS'}`;
// 2ND, 3RD, 4TH … (the card's `YOUR 3RD SHIP`).
const ordinal = (n: number): string => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
};
// A waiting ship the units before passed over (playtest 1, Q4: "run" is the game's word, not the world's): `runsOnChart` 2
// is once, and on its last run before it comes in on its own (`max`, MAX_RUNS_ON_CHART) it says it won't wait again.
const passedOver = (runsOnChart: number, max: number): string => {
  const passes = runsOnChart - 1;
  const times = passes === 1 ? 'ONCE' : passes === 2 ? 'TWICE' : `${passes} TIMES`;
  return runsOnChart >= max ? `PASSED OVER ${times} · IT WON'T WAIT AGAIN` : `PASSED OVER ${times}`;
};

// The words for a link's noise (02 §3.3): `NOISE LOW · 1`.
export const NOISE_WORD: Readonly<Record<LinkNoise, string>> = { 0: 'CLEAN', 1: 'LOW', 2: 'NOISY', 3: 'SEVERE' };

// The KNOWN PROBLEMS row's labels (02 §3.5). DEBRIS names its rack once the ship is built (`DEBRIS · RACK C`); the
// card shows `RACK ?` before (the rack is a roll).
export const MODIFIER_LABEL: Readonly<Record<ModifierId, string>> = {
  'impact-course': 'IMPACT COURSE',
  'too-wide': 'FLYBY, TOO WIDE',
  'sensor-damage': 'SENSOR DAMAGE',
  'debris': 'DEBRIS · RACK ?',
  'engine-fault': 'ENGINE FAULT',
  'radiation-belt': 'RADIATION BELT',
};

export const MAP_TEXT = {
  // --- The title card (05 §3.12, slice-3a-plan §1.1 items 21–22) ---------------------------------------------------
  title: {
    logo: 'ARRIVAL PROTOCOL // OUTWARD BOUND',
    line: (unit: string, year: number, finalLy: number): string => `${unit} · YEAR ${year} · FINAL SHIP ${finalLy} LY OUT`,
    beacon: (ship: string, year: number): string => `FINAL SHIP · ${ship} · ${year}`,
    sol: 'ARRIVAL CONTROL',
    // Slice 3c (05 §3.12, 02 §4): from run 2 the title line says when this unit left after the last (the valve's years
    // included): `UNIT-048 · YEAR 2303 · LAUNCHED 3 YEARS AFTER UNIT-047`.
    launched: (unit: string, year: number, gap: number, last: string): string =>
      (gap === 0 ? `${unit} · YEAR ${year} · LAUNCHED IN THE SAME YEAR AS ${last}` : `${unit} · YEAR ${year} · LAUNCHED ${years(gap)} AFTER ${last}`),
    savesBetweenShips: 'runs save between ships',
    // Track UI: the stamp the launch line lands with once its year has rolled up (02 §3.12 step 6: the valve says so).
    stamp: (gap: number): string => `+${years(gap)}`,
    stampSameYear: 'SAME YEAR',
    stampValve: (gap: number): string => `+${years(gap)} · THE ARM MOVED ON`,
  },
  // The header crumb gains the year (02 §4): `UNIT-047 / KESTREL · 2467 / FLYBY`.
  crumb: (unit: string, ship: string, year: number, state: string): string => `${unit} / ${ship} · ${year} / ${state}`,

  // --- The DESK (02 §3.10, §4) ---------------------------------------------------------------------------------------
  desk: {
    title: 'STAR CHART',
    pickShip: 'PICK YOUR NEXT SHIP — click a ship or ← →',
    setCourse: (ship: string): string => `SET COURSE ▸ ${ship} [ENTER]`,
    // Slice 4 review (M3): while a TRAINING cell is armed ENTER trains it, so the step names SET COURSE's other key.
    setCourseSpace: (ship: string): string => `SET COURSE ▸ ${ship} [SPACE]`,
    controlPick: (unit: number): string => `Lovely work, Unit ${unit}! :) Pick your next ship.`,
    greyed: (count: number): string => `${count} ${count === 1 ? 'SHIP' : 'SHIPS'} NOW OUT OF YOUR REACH`,
    onlyNext: 'ONE SHIP IN REACH',
    controlTag: 'ARRIVAL CONTROL',
    stepPick: 'A SHIP',
    // Slice 3b: the first desk's file step (02 §4: ship → file → SET COURSE).
    stepFile: 'A FILE',
    stepCourse: 'SET COURSE',
    back: '◀ CHART',
    closeSheet: '✕',
    cardTitle: 'SHIP CARD',
    packetCrumb: 'TRANSMIT',
    trace: 'TRACE',
    yearLine: (year: number): string => `YEAR ${year}`,
    tooLateBuzz: (reason: string): string => reason,
  },

  // --- The STAR CHART's nodes and lines (02 §4) -----------------------------------------------------------------------
  chart: {
    node: (ship: string, colonists: number): string => `${ship} · ${formatCount(colonists)}`,
    finalTag: 'FINAL SHIP',
    tooLate: (years: number): string => `TOO LATE BY ${yrs(years)}`,
    outOfRange: (ly: number): string => `OUT OF RANGE · ${ly} LY`,
    past: (year: number): string => `OUT OF YOUR REACH · IT ARRIVED IN ${year}`,
    urgent: (years: number): string => `ONLY ${yrs(years)} TO SPARE`,
    onlyFromHere: 'ONLY FROM HERE',
    trail046: 'UNIT-046 GETS THERE FIRST',
    ring: (n: number, ly: number): string => `RING ${n} · ${ly} LY`,
    visited: (outcome: string): string => `VISITED · ${outcome}`,
    flown: 'FLOWN',
    here: 'YOU ARE HERE',
    // The years the unit sleeps in the ship's receiver before it reaches its planet (playtest 1, Q11: "EARLY" read as a score).
    sleep: (years: number): string => `SLEEP ${yrs(years)}`,
    behind: 'BEHIND YOU · THE BEAM ONLY GOES OUTWARD',
    colony: (name: string, age: number, unit: string): string => `${name} · ${age} ${age === 1 ? 'YEAR' : 'YEARS'} OLD · ${unit}`,
    lost046: 'UNIT-046 WAS LOST HERE',
    solName: 'SOL',
    solTag: 'ARRIVAL CONTROL',
    // --- Slice 3c: the last unit's trail on the chart, and what left it (02 §2, §4; 3c plan §3) ---
    // A trail stop whose year the galaxy year has not passed: the unit ahead gets there first (`HALCYON · TAKEN · …`).
    taken: (ship: string, unit: string): string => `${ship} · TAKEN · ${unit} GETS THERE FIRST`,
    // 046's written trail has no ship names: its worlds keep `UNIT-046 GETS THERE FIRST` (trail046 above).
    takenNoShip: (unit: string): string => `${unit} GETS THERE FIRST`,
    // A passed stop that founded nothing; a passed one with a colony is `colony` above (`RIVERSIDE · 3 YEARS OLD · UNIT-047`).
    noColony: (unit: string): string => `NO COLONY · ${unit}`,
    // The grey cross (05 §3.5).
    lostCross: (unit: string): string => `${unit} WAS LOST HERE`,
    // Why a ship of the last arm left (the opening desk's departures block, 3c plan §4.2): `PETREL · ANOTHER CORE IS ON ITS
    // WAY`. Said in the future tense: the ship's approach is still ahead of the new unit, just not this unit's (02 §3.12).
    leave: {
      'core-coming': 'ANOTHER CORE IS ON ITS WAY',
      'own-way': 'IT WILL COME IN ON ITS OWN',
      'no-colony': 'NO COLONY',
    } satisfies Readonly<Record<Exclude<LeaveWords, 'colony' | null>, string>>,
    leaveLine: (ship: string, words: string): string => `${ship} · ${words}`,
    leaveMore: (count: number): string => `+${count} MORE`,
    // Track UI: the departures block's head (the opening desk; the RUN TALLY's update summary uses it too).
    leaveTitle: (count: number): string => `${count} ${count === 1 ? 'SHIP' : 'SHIPS'} MOVED ON`,
    // Track UI: the last unit's beacon on its first ship's world (05 §3.5), the hover's words on the chart.
    beacon: (unit: string, yearsAgo: number): string =>
      `BEACON · SET BY ${unit} · ${yearsAgo === 0 ? 'THIS YEAR' : `${years(yearsAgo)} AGO`}`,
    // Track UI: an older colony's dot when its world holds more than one (`LANTERN · 49 YEARS OLD · UNIT-047 · +1`).
    olderMore: (label: string, more: number): string => `${label} · +${more}`,
    // Track UI: the chart's key for the trail's marks (the desk's corner).
    legendTaken: (unit: string): string => `${unit} GETS THERE FIRST`,
    legendColony: (unit: string): string => `${unit}'S COLONY`,
    legendLost: (unit: string): string => `WHERE ${unit} WAS LOST`,
    legendOlder: 'OLDER COLONIES',
    // A ship new on this run's chart (its first desk only), and one waiting from earlier runs: on the chart only on its last
    // run (`PASSED OVER TWICE · IT WON'T WAIT AGAIN`), on its card always.
    reportedHome: 'REPORTED HOME',
    passedOver,
    // CONTROL's one-liner at the first desk when the unit ahead took a ship there (PLACEHOLDER(05)).
    controlFirst: (unit: string): string => `${unit} got here first. :)`,
  },

  // --- The SHIP CARD (02 §4; 01 §3.16's MEMORY row) --------------------------------------------------------------------
  card: {
    top: (ship: string, world: string, colonists: number, pods: number): string =>
      `${ship} · ${world} · ${formatCount(colonists)} COLONISTS · ${pods} PODS`,
    ark: 'ARK',
    finalShip: 'FINAL SHIP',
    // The card's lead (the lead's call: colonists, the years asleep or late, and what the trip costs, then the fit line); the
    // TIMELINE strip under the rows carries the years themselves, so the schedule line is only the difference. Playtest 1
    // (Q11): the difference is said as the sleep, and what it buys (one transit hit fixed per ECC_YEARS_PER_HIT asleep).
    sub: (world: string, pods: number): string => `${world} · ${pods} PODS`,
    colonists: (colonists: number): string => `${formatCount(colonists)} COLONISTS`,
    sleep: (slack: number, fixes: number): string => `YOU SLEEP ${yrs(slack)} IN ITS RECEIVER · ECC FIXES ${fixes}`,
    late: (short: number): string => `TOO LATE BY ${yrs(short)}`,
    // ...and the hits under it: the sleep line above already names what ECC fixes.
    cost: (hits: number, land: number): string =>
      `${hits} ${hits === 1 ? 'HIT' : 'HITS'} ON THE WAY → ${land} ${land === 1 ? 'LANDS' : 'LAND'}`,
    problemsLabel: 'KNOWN PROBLEMS',
    memoryLabel: 'MEMORY',
    fitLabel: 'FIT',
    planetLabel: 'PLANET',
    noGoLabel: 'NO-GO',
    lzLabel: 'LANDING',
    beamLabel: 'BEAM',
    threatLabel: 'THREAT',
    onlyFromHere: 'ONLY FROM HERE · from any other ship you\'d be TOO LATE',
    here: (year: number): string => `YOU ARE HERE · ${year}`,
    debris: (rack: string): string => `DEBRIS · RACK ${rack}`,
    problems: (labels: readonly string[]): string => (labels.length === 0 ? 'none' : labels.join(', ')),
    memory: (total: number, cls: MemoryClass, room: number): string => `MEMORY ${total} · ${cls} · ROOM FOR YOU ${room}`,
    // The fit line (systems/arrival-preview.ts, from roomFit): the charge that arrives with the fewest seeds, the room's
    // worst case when seeds could take some (M2: on a TIGHT ship seeds come before the charge), and what the link leaves
    // behind (m2: `YOU FIT` alone hid it).
    fit: (fit: Readonly<RoomFit>): string => {
      const seeds = fit.word !== 'leave' && fit.chargeArrivesMin < fit.chargeArrives ? ` (${fit.chargeArrivesMin} IF SEEDS RIDE)` : '';
      const link = fit.word !== 'leave' && fit.linkLost > 0 ? ` · LINK LEAVES ${fit.linkLost}` : '';
      switch (fit.word) {
        case 'fits': return `${seeds === '' ? 'YOU FIT' : `YOU FIT · ${fit.chargeArrives} ARRIVES${seeds}`}${link}`;
        case 'squeezed': return `CHARGE SQUEEZED: ${fit.chargeArrives} ARRIVES${seeds}${link}`;
        case 'leave': return fit.overLink >= fit.over
          ? `LEAVE ${fit.overLink} BLOCKS BEHIND · TOO BIG FOR THE LINK`
          : `LEAVE ${fit.over} BLOCKS BEHIND · TOO BIG FOR THE ROOM`;
        case 'no-charge': return `NO CHARGE ARRIVES${link}`;
      }
    },
    planet: (terrain: string, offSite: string): string => `${terrain} · ${offSite}`,
    noGo: (words: readonly string[]): string => `NO-GO ZONES: ${[...new Set(words)].join(', ')}`,
    // Slice 6: a POOR planet's words are Track SITES's (data/sites-text.ts SITES_TEXT.card.lzs, 01 §3.15's
    // `LZ: 3 · SURVEY NEEDED`); `site` is the site data this build plays (data/survey.ts siteDataOf).
    lzs: (count: number, site: SiteData): string => (site === 'good' ? `LZ: ${count} · SET BY ARRIVAL CONTROL` : SITES_TEXT.card.lzs(count)),
    // The BEAM row in two parts (02 §4's one line is 72 characters at its longest): the hop, then its noise and seeds.
    // The hits and what ECC fixes are the lead's cost line (card.cost), so the BEAM row is the hop itself.
    beam: (ly: number, link: number): string => `${ly} LY · LINK ${link}`,
    noise: (noise: LinkNoise, seeds: string): string => `NOISE ${NOISE_WORD[noise]}${noise > 0 ? ` · ${noise}` : ''} · ${seeds}`,
    seeds: (range: { min: number; max: number } | null): string =>
      (range === null ? 'SEEDS: none' : range.max === range.min ? `SEEDS ${range.min}` : `SEEDS ${range.min}–${range.max}`),
    shipOfRun: (depth: number, minLeft: number, maxLeft: number): string =>
      `YOUR ${ordinal(depth)} SHIP · ${minLeft === maxLeft ? minLeft : `${minLeft}–${maxLeft}`} MORE TO THE FINAL SHIP`,
    lastOfRun: (depth: number): string => `YOUR ${ordinal(depth)} SHIP · THE LAST`,
    timeline: (leave: number, arrive: number, approach: number): string =>
      `${leave} you leave · ${arrive} you get there · ${approach} ▲ approach`,
    // Slice 3c: the card's history row (`REPORTED HOME` / `PASSED OVER ONCE` / `PASSED OVER TWICE · IT WON'T WAIT AGAIN`).
    historyLabel: 'HISTORY',
    history: (runsOnChart: number, max: number): string => (runsOnChart <= 1 ? 'REPORTED HOME' : passedOver(runsOnChart, max)),
    // Track UI: the last unit's mark at the ship's world (the chart's hover words, for the phone, which has no hover).
    trailLabel: 'LAST UNIT',
  },

  // --- The PACKET (02 §4; 01 §3.16's room bar) -------------------------------------------------------------------------
  packet: {
    // `colonists` null: a `?` ship not visited yet (slice 8 POLISH): its card said `??? COLONISTS`, and so does the PACKET.
    headline: (ship: string, colonists: number | null, ly: number, slack: number): string =>
      `NEXT: ${ship} · ${colonists === null ? '???' : formatCount(colonists)} COLONISTS · ${ly} LY · SLEEP ${yrs(slack)}`,
    room: (room: number, files: number, floor: number): string => `ROOM ${room} · FILES ${files} + FLOOR ${floor}`,
    roomNoFloor: (room: number, files: number): string => `ROOM ${room} · FILES ${files} · NO FLOOR`,
    squeeze: (held: number, arrives: number, lost: number): string => `CHARGE ${held} → ${arrives} ON ARRIVAL · ${lost} WON'T FIT`,
    // The room's worst case when the beam's seeds could take some of it first (M2).
    squeezeSeeds: (held: number, arrives: number, min: number, lost: number): string =>
      `CHARGE ${held} → ${arrives} ON ARRIVAL (${min} IF SEEDS RIDE) · ${lost} WON'T FIT`,
    seedsMay: (arrives: number, min: number): string => `CHARGE ${arrives} ON ARRIVAL (${min} IF SEEDS RIDE)`,
    zeroCharge: '→ 0 ON ARRIVAL',
    zeroConfirm: 'ARRIVE WITH NO REPAIR CHARGE?',
    zeroIfSeedsConfirm: '0 CHARGE IF SEEDS RIDE · TRANSMIT ANYWAY?',
    overRoom: (over: number): string => `${over} TOO MANY FOR THE ROOM · LEAVE FILES BEHIND`,
    overLink: (over: number): string => `${over} TOO MANY FOR THE LINK · LEAVE FILES BEHIND`,
    // The arrival line where the room binds: the same sum as phase 2's, and the room it meets (M1: one number).
    roomFor: (parts: string, total: number, arrives: number): string => `ON ARRIVAL: ${parts} = ${total} · ROOM FOR ${arrives}`,
    arrivalLeave: 'ON ARRIVAL: LEAVE FILES BEHIND FIRST',
    // 02 §4's `ON THE WAY: 4 TRANSIT HITS · …` is 75 characters; without TRANSIT it fits at its longest.
    onTheWay: (hits: number, ecc: number, years: number, land: number): string =>
      `ON THE WAY: ${hits} HITS · ${ecc} FIXED WHILE YOU SLEEP (${yrs(years)}) → ${land} ${land === 1 ? 'LANDS' : 'LAND'}`,
    backToChart: '◀ CHART [ESC]',
    stamp: 'OUTWARD BOUND',
    control: 'Outward bound! :)',
    controlTag: 'CONTROL',
    controlZero: 'Travelling light! Very light. :)',
    roomLabel: 'ROOM',
    linkLabel: 'LINK',
    confirmYes: 'TRANSMIT',
    confirmNo: 'KEEP PACKING',
    confirmKeys: '[ENTER] yes · [ESC] no',
    goOverRoom: 'LEAVE FILES BEHIND FIRST',
    wontFit: (blocks: number): string => `${blocks} WON'T FIT`,
    zeroDetail: (ship: string): string => `${ship} has no room left for REPAIR CHARGE`,
  },

  // --- The boot (02 §4's order; Track GEN's lines) ---------------------------------------------------------------------
  boot: {
    sleep: (ship: string, arrive: number, approach: number): string =>
      `> ASLEEP IN ${ship}'S RECEIVER · ${arrive} → ${approach} · ${approach - arrive} YEARS`,
    ecc: (fixed: number): string => `> ECC: ${fixed} TRANSIT ${fixed === 1 ? 'HIT' : 'HITS'} CORRECTED WHILE ASLEEP`,
    receiver: (racks: number, room: number): string => `> RECEIVER: ${racks} ${racks === 1 ? 'RACK' : 'RACKS'} · ROOM ${room}`,
    overflow: (lost: number, ship: string): string => `> CHARGE OVERFLOW · ${lost} LOST · NO ROOM ON ${ship}`,
    // A TIGHT arrival with no charge laid out: the one charge line (M1: it no longer types an OVERFLOW line too).
    zeroCharge: (ship: string, lost: number): string =>
      (lost > 0 ? `> REPAIR CHARGE 0 · ${lost} LOST · NO ROOM ON ${ship}` : `> REPAIR CHARGE 0 · NO ROOM ON ${ship}`),
  },

  // --- The MIND strip's header (01-landing §4): the memory class --------------------------------------------------------
  strip: {
    memory: (total: number, cls: MemoryClass): string => `MEMORY ${total} · ${cls}`,
  },

  // --- The LOST card on the arm (BurnResult): the kid picks the next ship at the desk -----------------------------------
  lossToChart: 'TO THE CHART ▸',

  // --- Slice 3c: the last unit's beacon on ship 1's LANDING REPORT (05 §3.5) ---------------------------------------------
  report: {
    beacon: (lz: string, unit: string, yearsAgo: number): string =>
      `${lz} · A BEACON WAS ALREADY THERE · SET BY ${unit} · ${yearsAgo === 0 ? 'THIS YEAR' : `${years(yearsAgo)} AGO`}`,
  },

  // --- Slice 3c: RUN END's bridging line, under NEW RUN (05 §3.12; slice 7 moves it to the final card) -----------------
  runEnd: {
    bridge: (next: string, gap: number, year: number): string =>
      (gap === 0 ? `${next} LEFT SOL IN THE SAME YEAR AS YOU, ${year}.` : `${next} LEFT SOL ${years(gap)} AFTER YOU, IN ${year}.`),
    bridgeTail: 'IT HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.',
  },

  // --- Slice 3c: the run save on the title, the TERMINAL and the footer (02 §3.11, 3c plan §2.1) ------------------------
  save: {
    // The RESUME block's line, by the point it was written at.
    resumeBoot: (unit: string, depth: number, ship: string, year: number): string => `RESUME · ${unit} · SHIP ${depth} · bound for ${ship} · ${year}`,
    resumeDesk: (unit: string, depth: number, year: number): string => `RESUME · ${unit} · SHIP ${depth} DONE · AT THE DESK · ${year}`,
    resumeReport: (unit: string, ship: string, year: number): string => `RESUME · ${unit} · ${ship} · LANDING REPORT · ${year}`,
    resume: 'RESUME ▸',
    newRun: 'NEW RUN',
    abandonConfirm: (unit: string): string => `ABANDON ${unit}'S RUN? · ITS SHIPS COUNT AS DONE`,
    abandon: 'ABANDON RUN',
    // Track UI: the confirm's way back, and the keys the RESUME block takes.
    keep: 'KEEP IT',
    resumeKey: 'RESUME ▸ [ENTER]',
    abandonKey: 'ABANDON RUN [ENTER]',
    // Review fix (minor 1): NEW RUN's confirm abandons only by a click or its own key; ENTER and ESC keep the run.
    abandonAskKey: 'ABANDON RUN [DEL]',
    keepKey: 'KEEP IT [ENTER]',
    cantResume: (reason: string): string => `RUN SAVE CAN'T RESUME · ${reason}`,
    // The reasons, by save-codec's refusal kind (types/save.ts SaveRefusalKind).
    reason: {
      'not-json': 'THE SAVE IS DAMAGED',
      'version': 'SAVED BY ANOTHER VERSION',
      'content': 'SAVED BY ANOTHER VERSION',
      'shape': 'THE SAVE IS DAMAGED',
      'route': 'THE SAVE IS DAMAGED',
      'ship': 'A SAVED SHIP DOES NOT BUILD',
      'stale': 'THAT RUN ALREADY ENDED',
      // Review fix (minor 7): another run is in progress (another tab's, or one started here after the save went offline).
      'superseded': 'ANOTHER RUN HAS STARTED SINCE',
      'archive': 'THE ARCHIVE CAN\'T BE READ',
      'resume-threw': 'THE SAVE DOES NOT REBUILD',
    } satisfies Readonly<Record<SaveRefusalKind, string>>,
    offline: 'RUN SAVE OFFLINE — a reload will lose this run',
    // Review fix (M2): the save went offline and the last one written could not be removed.
    offlineStale: 'RUN SAVE OFFLINE — a reload may go back to an older save',
    offlineTitle: 'RUN SAVE OFFLINE',
    footer: 'NO SAVE',
    // The title's one-off notes (archive v2), said once then cleared.
    olderArchive: 'AN OLDER ARCHIVE WAS FOUND · IT WAS NOT CARRIED OVER',
    armReset: 'THE ARM WAS REDRAWN · YOUR LINEAGE AND COLONIES ARE KEPT',
  },

  // --- The RUN TALLY (02 §4) -------------------------------------------------------------------------------------------
  tally: {
    title: 'RUN TALLY',
    row: (depth: number, ship: string, year: number, landed: number, total: number): string =>
      `${depth} · ${ship} · ${year} · LANDED ${formatCount(landed)} / ${formatCount(total)}`,
    colonies: (count: number): string => `${count} ${count === 1 ? 'COLONY' : 'COLONIES'} FOUNDED`,
    route: 'YOUR ROUTE',
    // Slice 3c (Track UI): what the world update made of the arm after this run (02 §3.12), under the route: who launches
    // next and when, the arm's turnover, the valve when it opened, and the ships that moved on (chart.leaveLine's words).
    next: (unit: string, year: number): string => `NEXT UNIT LAUNCHES ${year} · ${unit}`,
    update: (done: number, movedOn: number, reported: number): string =>
      `THE ARM: ${done} DONE · ${movedOn} MOVED ON · ${reported} REPORTED HOME`,
    valve: (years: number): string => `ARRIVAL CONTROL WAITED ${years} MORE YEARS`,
  },
} as const;

// The boot's sleep line rolls its approach year as it types (02 §4 step 2; components/memory-view/MindTerminal.ts, slice 3b):
// where that year sits in the line, and the years it rolls between. null for any other line. Read back from the words
// MAP_TEXT.boot.sleep types (tests/unit/map/text.test.ts pins the two together), so the TERMINAL needs no line kind.
export function sleepLineYears(text: string): { at: number; arrive: number; approach: number } | null {
  const match = /^> ASLEEP IN .+'S RECEIVER · (\d+) → (\d+) · \d+ YEARS$/.exec(text);
  if (match === null) return null;
  const arrive = Number(match[1]);
  const approach = Number(match[2]);
  const at = text.lastIndexOf(` → ${match[2]} · `) + ' → '.length;
  return { at, arrive, approach };
}
