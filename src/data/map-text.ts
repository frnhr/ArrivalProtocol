import type { ModifierId, MemoryClass, RoomFit } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import { formatCount } from '@data/format';

// PLACEHOLDER(05): every word slice 3a puts on screen for the galaxy map (docs/phase3/02-map.md §4, 01-landing §3.16's
// MEMORY row and room bar, 05-story.md §3.11–§3.12's title and trail; slice-3a-plan §3), drafted from the specs' sample
// lines for 05-story's owner to sign off. Each line renders to at most MAX_LINE_CHARS (70) with the longest names and
// numbers (tests/unit/map/text.test.ts) and says no never-say word (tests/unit/support/words.test.ts).
// Track DESK owns this file after the foundation; Track GEN adds its boot lines here too (MAP_TEXT.boot).

const yrs = (years: number): string => `${years} ${Math.abs(years) === 1 ? 'YR' : 'YRS'}`;

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
  },
  // The header crumb gains the year (02 §4): `UNIT-047 / KESTREL · 2467 / FLYBY`.
  crumb: (unit: string, ship: string, year: number, state: string): string => `${unit} / ${ship} · ${year} / ${state}`,

  // --- The DESK (02 §3.10, §4) ---------------------------------------------------------------------------------------
  desk: {
    title: 'STAR CHART',
    pickShip: 'PICK YOUR NEXT SHIP — click a ship or ← →',
    setCourse: (ship: string): string => `SET COURSE ▸ ${ship} [ENTER]`,
    controlPick: (unit: number): string => `Lovely work, Unit ${unit}! :) Pick your next ship.`,
    greyed: (count: number): string => `${count} ${count === 1 ? 'SHIP' : 'SHIPS'} NOW OUT OF YOUR REACH`,
    onlyNext: 'ONE SHIP IN REACH',
    controlTag: 'ARRIVAL CONTROL',
    stepPick: 'A SHIP',
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
    early: (years: number): string => `${yrs(years)} EARLY`,
    behind: 'BEHIND YOU · THE BEAM ONLY GOES OUTWARD',
    notNext: 'NOT ON THIS BEAM · ONE SHIP AT A TIME',
    colony: (name: string, age: number, unit: string): string => `${name} · ${age} ${age === 1 ? 'YEAR' : 'YEARS'} OLD · ${unit}`,
    lost046: 'UNIT-046 WAS LOST HERE',
    solName: 'SOL',
    solTag: 'ARRIVAL CONTROL',
  },

  // --- The SHIP CARD (02 §4; 01 §3.16's MEMORY row) --------------------------------------------------------------------
  card: {
    top: (ship: string, world: string, colonists: number, pods: number): string =>
      `${ship} · ${world} · ${formatCount(colonists)} COLONISTS · ${pods} PODS`,
    ark: 'ARK',
    finalShip: 'FINAL SHIP',
    // The card's lead (the lead's call: colonists, years early or late, and what the trip costs, then the fit line); the
    // TIMELINE strip under the rows carries the years themselves, so the schedule line is only the difference.
    sub: (world: string, pods: number): string => `${world} · ${pods} PODS`,
    colonists: (colonists: number): string => `${formatCount(colonists)} COLONISTS`,
    early: (slack: number): string => `${yrs(slack)} EARLY`,
    late: (short: number): string => `TOO LATE BY ${yrs(short)}`,
    cost: (hits: number, fixed: number, land: number): string =>
      `${hits} ${hits === 1 ? 'HIT' : 'HITS'} · ${fixed} FIXED WHILE YOU SLEEP → ${land} ${land === 1 ? 'LANDS' : 'LAND'}`,
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
    lzs: (count: number): string => `LZ: ${count} · SET BY ARRIVAL CONTROL`,
    // The BEAM row in two parts (02 §4's one line is 72 characters at its longest): the hop, then its noise and seeds.
    // The hits and what ECC fixes are the lead's cost line (card.cost), so the BEAM row is the hop itself.
    beam: (ly: number, link: number): string => `${ly} LY · LINK ${link}`,
    noise: (noise: LinkNoise, seeds: string): string => `NOISE ${NOISE_WORD[noise]}${noise > 0 ? ` · ${noise}` : ''} · ${seeds}`,
    seeds: (range: { min: number; max: number } | null): string =>
      (range === null ? 'SEEDS: none' : range.max === range.min ? `SEEDS ${range.min}` : `SEEDS ${range.min}–${range.max}`),
    shipOfRun: (depth: number, minLeft: number, maxLeft: number): string =>
      `SHIP ${depth} OF YOUR RUN · ${minLeft === maxLeft ? minLeft : `${minLeft}–${maxLeft}`} MORE TO THE FINAL SHIP`,
    lastOfRun: (depth: number): string => `SHIP ${depth} OF YOUR RUN · THE LAST`,
    timeline: (leave: number, arrive: number, approach: number): string =>
      `${leave} you leave · ${arrive} you get there · ${approach} ▲ approach`,
  },

  // --- The PACKET (02 §4; 01 §3.16's room bar) -------------------------------------------------------------------------
  packet: {
    headline: (ship: string, colonists: number, ly: number, slack: number): string =>
      `NEXT: ${ship} · ${formatCount(colonists)} COLONISTS · ${ly} LY · ${yrs(slack)} EARLY`,
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

  // --- The RUN TALLY (02 §4) -------------------------------------------------------------------------------------------
  tally: {
    title: 'RUN TALLY',
    row: (depth: number, ship: string, year: number, landed: number, total: number): string =>
      `${depth} · ${ship} · ${year} · LANDED ${formatCount(landed)} / ${formatCount(total)}`,
    colonies: (count: number): string => `${count} ${count === 1 ? 'COLONY' : 'COLONIES'} FOUNDED`,
    route: 'YOUR ROUTE',
  },
} as const;
