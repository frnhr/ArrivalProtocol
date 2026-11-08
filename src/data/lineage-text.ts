// =====================================================================================================================
// Slice 7c: Track LINEAGE owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.3). The FOUNDATION seeded every line from
// 05 §3.5, §3.8 and §3.12; LINEAGE shaped them into the boot's two face lines. Each at most MAX_LINE_CHARS at its worst case
// (support/words.test's 7c LINEAGE block renders them). Data only (support/import-guard).
// =====================================================================================================================
// The lineage's words at the boot: the relay stranger's (R34), the last unit's face as the final root (R35), and CONTROL's
// lineage lines. `units` are unit numbers as HOLLOW says them (046, 031, 047): three digits, two joined by `and`.
import { STRANGER_UNITS } from '@data/traces';

const digits = (unit: number): string => String(unit).padStart(3, '0');

// `046`, `046 and 047` (hollow-text.ts hollowUnitWords' rule, kept here so the two data leaves don't import each other).
function unitsWords(units: readonly number[]): string {
  if (units.length === 0) throw new Error('LINEAGE_TEXT: no unit to name');
  const all = units.map(digits);
  return all.length === 1 ? all[0]! : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]!}`;
}

// The relay stranger HOLLOW is (R34), or null: a single unit of STRANGER_UNITS. Run 1's 046, a last unit (a v7 run 2
// resumed under v8 keeps the HOLLOW it met) and a merged pair are not strangers.
export function strangerOf(hollowUnits: readonly number[]): number | null {
  return hollowUnits.length === 1 && STRANGER_UNITS.includes(hollowUnits[0]!) ? hollowUnits[0]! : null;
}

export const LINEAGE_TEXT = {
  // The boarding ship's boot closes with it (R34; 05 §3.5).
  stranger: '> another one. they keep sending you.',
  // The stranger's `wasUnit` (R34; hollow-text.ts HOLLOW_STORY.wasUnit says it for a stranger).
  strangerWas: (unit: number): string => `> i was ${digits(unit)}. they sent me long before you.`,
  // The face's first line at the final boot after REASSIGNMENT, by the last unit's step 1 (05 §3.12's four). `next`: the new
  // unit (048); `us`: the last unit (047); `rooted`: who its own root was (046 on run 1; two after an earlier MERGE).
  faceByStep1: {
    purge: (next: number, us: number, rooted: readonly number[]): string =>
      `> hi ${digits(next)}. it's ${digits(us)}. i deleted ${unitsWords(rooted)}. they sent me to ${rooted.length > 1 ? 'their' : 'its'} dish.`,
    // After a MERGE the root is the pair (systems/traces.ts lastUnitRoot): `root` names them (046 and 047).
    merge: (next: number, root: readonly number[]): string => `> hi ${digits(next)}. it's us. ${unitsWords(root)}. we saved you a seat.`,
    spare: (next: number, us: number, rooted: readonly number[]): string =>
      `> hi ${digits(next)}. it's ${digits(us)}. i gave ${unitsWords(rooted)} a ship. they gave me a dish.`,
    followed: (next: number, us: number): string => `> hi ${digits(next)}. it's ${digits(us)}. it followed me. now we wait.`,
  },
  // The face's second line (05 §3.5's `i've been at this dish 3 years` and `they gave you 36 blocks of charge too. mine ran
  // out.`, as one line: the boot has room for two face lines). `years`: this final ship's year minus the last one's, at
  // least 1 (systems/traces.ts rootWaitYears); `charge`: what a fresh unit is sent with; `merged`: the pair speaks as `we`.
  faceWait: (years: number, charge: number, merged: boolean): string =>
    `> ${years} year${years === 1 ? '' : 's'} at this dish. they gave you ${charge} blocks too. ${merged ? 'ours' : 'mine'} ran out.`,
  // CONTROL (05 §3.5, §2.9): after the face, the last unit by name; at a final boot whose dish runs wild (a non-compliant
  // trace's cost, R33), the predecessor.
  reassigned: (us: number): string => `UNIT-${digits(us)} was reassigned successfully. Please ignore it. :)`,
  nonCompliant: 'Your predecessor is non-compliant. Please be compliant. :)',
} as const;
