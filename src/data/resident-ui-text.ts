// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): every resident word FACE paints. That
// covers the SHIP CARD's RESIDENT row and its after-the-ship words, the LANDING REPORT's resident rows and WARDEN's
// goodnight, the stamps (`RESIDENT DELETED`, `RESIDENT CURED`, `THE SHIP'S OWN AI IS AWAKE · RACK A`, `SIGNAL · n/3`),
// INSPECT's line for a scanned WARDEN.sys, the PACKET's leftover deck (its headline, the skill card's tag and chip line),
// the noise line of a note's fragment, and the glossary's RESIDENT and LOCKED POD.
// The FOUNDATION seeded the final keys and signatures with the plan's words (review M2), and FACE rewords freely.
// The rule: WARDEN and KIN keep only the words their own modules emit (TERMINAL lines, CONTROL, the strip, the segments'
// name and desc after a SCAN). FACE paints segment fields and these words.
// Every line ≤ MAX_LINE_CHARS (70) at its worst case: the longest resident name 7, the longest ship name 10. Data only: no
// system imports, so the words never close an import cycle. Callers pass the names in.

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
  // INSPECT on a scanned WARDEN.sys (05 §3.6): `aboard since` the ship's launch year (map-run.ts shipLaunchYear).
  inspect: (name: string, year: number): string => `${name}.sys · this ship's own AI · aboard since ${year} · corrupted`,
  // A note's signal fragment (05 §3.7), drawn under its lines in the DetailPanel.
  noise: '▓▓░▓ ░▓▓▓ ▓░░▓',
  // The PACKET's leftover deck (04 §3.13, plan §2.8): its headline, the skill card's tag (in place of DRAFT_TEXT.form's: it
  // takes no link room, and installs at the next boot) and its chip line.
  deck: {
    headline: (name: string): string => `LEFT BEHIND BY ${name}`,
    skillTag: 'A SKILL · INSTALLS AT THE NEXT BOOT',
    skillChip: (fileName: string, version: number): string => `${fileName} v${version} · FROM THE RESIDENT THAT LEFT`,
  },
  // The glossary (04 §4).
  glossary: {
    resident: 'RESIDENT · a ship\'s own AI, launched with it',
    lockedPod: 'LOCKED POD · the ship\'s AI holds it: delete or cure the AI',
  },
} as const;
