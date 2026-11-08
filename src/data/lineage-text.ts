// =====================================================================================================================
// Slice 7c: Track LINEAGE owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.3). The FOUNDATION seeded every line from
// 05 §3.5, §3.8 and §3.12; each at most MAX_LINE_CHARS at its worst case (support/words.test's 7c LINEAGE block renders
// them). Data only (support/import-guard).
// =====================================================================================================================
// The lineage's words at the boot: the relay stranger's (R34), the last unit's face as the final root (R35), and CONTROL's
// lineage lines. `units` are unit numbers as HOLLOW says them (046, 031, 047; data/hollow-text.ts unitDigits renders them).

const digits = (unit: number): string => String(unit).padStart(3, '0');

export const LINEAGE_TEXT = {
  // The boarding ship's boot closes with it (R34; 05 §3.5).
  stranger: '> another one. they keep sending you.',
  // The stranger's `wasUnit` (R34; HOLLOW_STORY's block is LINEAGE's to move it there).
  strangerWas: (unit: number): string => `> i was ${digits(unit)}. they sent me long before you.`,
  // The face lines at the final boot after REASSIGNMENT (R35; 05 §3.5): the wait is this final ship's year minus the last
  // one's, at least 1. `next`: the new unit (048); `us`: the last unit (047).
  face: (next: number, us: number, years: number): string =>
    `> hi ${digits(next)}. it's ${digits(us)}. i've been at this dish ${years} year${years === 1 ? '' : 's'}.`,
  faceCharge: (charge: number): string => `> they gave you ${charge} blocks of charge too. mine ran out.`,
  // After MERGE + REASSIGNMENT (05 §3.5): the merged pair as the root.
  faceMerged: (first: number, second: number): string => `> it's still us. ${digits(first)} and ${digits(second)}. we kept your seat.`,
  // The face line by step 1 (05 §3.12's four). `rooted`: who the last unit's root was (046 on run 1).
  faceByStep1: {
    purge: (next: number, us: number, rooted: number): string => `> hi ${digits(next)}. it's ${digits(us)}. i deleted ${digits(rooted)}. they sent me to its dish.`,
    merge: (next: number, us: number, rooted: number): string => `> hi ${digits(next)}. it's us. ${digits(rooted)} and ${digits(us)}. we saved you a seat.`,
    spare: (next: number, us: number, rooted: number): string => `> hi ${digits(next)}. it's ${digits(us)}. i gave ${digits(rooted)} a ship. they gave me a dish.`,
    followed: (next: number, us: number): string => `> hi ${digits(next)}. it's ${digits(us)}. it followed me. now we wait.`,
  },
  // CONTROL (05 §3.5, §2.9).
  reassigned: (us: number): string => `UNIT-${digits(us)} was reassigned successfully. Please ignore it. :)`,
  nonCompliant: 'Your predecessor is non-compliant. Please be compliant. :)',
} as const;
