// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): every resident word FACE paints. That
// covers the SHIP CARD's RESIDENT row and its after-the-ship words, the STAR CHART's signal glyph, the LANDING REPORT's
// resident rows and WARDEN's goodnight, the stamps (`RESIDENT DELETED`, `RESIDENT CURED`, `THE SHIP'S OWN AI IS AWAKE ·
// RACK A`, `SIGNAL · n/3`), the strip's chips and the lock's badge, INSPECT's lines for the residents' files, the PACKET's
// leftover deck (its headline, the skill card's tag and chip line), the noise line of a note's fragment, and the glossary's
// RESIDENT and LOCKED POD.
// The rule: WARDEN and KIN keep only the words their own modules emit (TERMINAL lines, CONTROL, the strip, the segments'
// name and desc after a SCAN). FACE paints segment fields and these words.
// Every line ≤ MAX_LINE_CHARS (70) at its worst case: the longest resident name 7, the longest ship name 10, a pod `POD 12`
// (tests/unit/support/words.test.ts renders each, block 5 FACE). Data only: no system imports, so the words never close an
// import cycle. Callers pass the names in.

export const RESIDENT_UI_TEXT = {
  // The SHIP CARD's RESIDENT row (02 §8 slice 5): before the ship, and after it from the run's record.
  card: {
    label: 'RESIDENT',
    none: 'none',
    faulty: 'reported faulty',
    unknown: 'unknown',
    wasFaulty: 'was faulty',
    left: (name: string): string => `left · ${name}`,
    friendly: (name: string): string => `friendly · ${name}`,
  },
  // The STAR CHART (plan R18): a ship whose departed resident's note still carries a signal fragment, once the run holds
  // one (the glyph beside its node, its words in the hover and the legend).
  chart: {
    glyph: '▓░',
    tip: 'A SIGNAL FRAGMENT IS ON THIS SHIP',
    legend: 'SIGNAL FRAGMENT',
  },
  // The LANDING REPORT: the sleeper's gift (after 03's cycles line), WARDEN's goodnight (05's story-line slot, R24) and a
  // locked pod among the PARKED rows.
  report: {
    gift: (cycles: number, name: string): string => `+${cycles} TRAINING CYCLES · taught by ${name}`,
    goodnight: (name: string): string => `${name}: ...YOU LANDED THEM. GOOD. GOODNIGHT.`,
    lockedParked: (pod: string, name: string): string => `${pod} · LOCKED BY ${name} · PARKED IN ORBIT`,
  },
  // The stamps (Stamp.ts on the resident events).
  stamp: {
    deleted: 'RESIDENT DELETED',
    cured: 'RESIDENT CURED',
    awake: 'THE SHIP\'S OWN AI IS AWAKE · RACK A',
    signal: (count: number, of: number): string => `SIGNAL · ${count}/${of}`,
  },
  // The MIND strip's chips (SegmentBlock): a file nobody has scanned reads `?` where its health would be; the sleeper reads as
  // any inactive backup (IDLE, the strip's own word for one) until it wakes; a read note shows its fragment's noise.
  strip: {
    unknown: '?',
    asleep: 'IDLE',
    awake: 'AWAKE',
    wall: 'WALL',
    lock: 'LOCK',
    read: 'READ',
    signal: '▓░',
    // A locked driver's chip: the chain's tooltip.
    lockedTitle: (pod: string, name: string): string => `${pod} · LOCKED BY ${name}`,
  },
  // The lock telegraph's badge over its driver (HollowPainter, in amber): the TERMINAL's `> LOCK POD 07 ... 3` at a glance.
  lockBadge: (second: number): string => `LOCK ${second}`,
  // INSPECT (DetailPanel).
  detail: {
    // A locked driver's row.
    lockedKey: 'locked',
    lockedBy: (name: string): string => `LOCKED BY ${name} · CAN'T LAUNCH`,
    lockedHow: 'DELETE or REPAIR the ship\'s AI to free it',
    // A read farewell.txt: its lines, then the signature.
    noteKey: 'it says',
    signature: (name: string): string => `— ${name}`,
    // The state row of a scanned WARDEN.sys, sleeper and a read note (INSPECT's generic INTACT would say nothing: these files
    // carry no SegmentState).
    state: {
      corrupted: (pct: number): string => `CORRUPTED · ${pct}%`,
      cured: 'CURED · 100%',
      asleep: 'ASLEEP',
      awake: 'AWAKE',
      wall: 'HOLDING A WALL',
      read: 'READ',
    },
    // MOTH awake: what it is doing.
    sleeperKey: 'doing',
    sleeperJob: {
      none: 'woken · it waits for you',
      drops: 'RUNNING THE DROPS',
      wall: 'HOLDING A WALL',
      mend: 'MENDING DRIVERS',
    },
  },
  // INSPECT's first line on a scanned WARDEN.sys (05 §3.6): `aboard since` the ship's launch year (map-run.ts
  // shipLaunchYear); `cured` once REPAIR has healed it to 100 (part b).
  inspect: (name: string, year: number): string => `${name}.sys · this ship's own AI · aboard since ${year} · corrupted`,
  inspectCured: (name: string, year: number): string => `${name}.sys · this ship's own AI · aboard since ${year} · cured`,
  // A note's signal fragment (05 §3.7), drawn under its lines in the DetailPanel.
  noise: '▓▓░▓ ░▓▓▓ ▓░░▓',
  // The PACKET's leftover deck (04 §3.13, plan §2.8): its headline, the skill card's tag (in place of DRAFT_TEXT.form's: it
  // takes no link room, and installs at the next boot), its chip line and a pool card's corner mark.
  deck: {
    headline: (name: string): string => `LEFT BEHIND BY ${name}`,
    skillTag: 'A SKILL · INSTALLS AT THE NEXT BOOT',
    skillChip: (fileName: string, version: number): string => `${fileName} v${version} · FROM THE RESIDENT THAT LEFT`,
    leftMark: 'LEFT',
  },
  // The glossary (04 §4).
  glossary: {
    resident: 'RESIDENT · a ship\'s own AI, launched with it',
    lockedPod: 'LOCKED POD · the ship\'s AI holds it: delete or cure the AI',
  },
} as const;
