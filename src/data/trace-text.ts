// =====================================================================================================================
// Slice 7c: Track TRACE owns this file's TRACE block, Track CHART its CHART block (docs/phase3/impl/slice-7-plan.md §2.9,
// §4.3). The FOUNDATION seeded every line from §2.9 and 05 §3.8 / §3.12; each at most MAX_LINE_CHARS at its worst case
// (support/words.test's 7c blocks render them). Data only (support/import-guard).
// =====================================================================================================================
// The traces' words: the boot's gift, wipe and wild-dish lines and STAY's letter (TRACE), and the card rows, the chart's
// legend and the final card's `NEXT RUN:` lines (CHART).

// --- Track TRACE's words (the boot lines, the charge parts, STAY's letter) --------------------------------------------------
export const TRACE_TEXT = {
  // A gift's boot line (R32): `> 046'S CACHE · +15 REPAIR CHARGE · THREAD+`, `> UNIT-047 LEFT A CACHE HERE · +15 REPAIR
  // CHARGE · Rm`, `> RIVERSIDE'S SUPPLY PACKET · +15 REPAIR CHARGE`. `what`: the file it adds, or null (the unit already
  // holds both of SPARE's files; the last unit ended with no tool SUNSET's order names).
  cache: (unitName: string, charge: number, what: string | null): string =>
    `> ${unitName.replace(/^UNIT-/, '')}'S CACHE · +${charge} REPAIR CHARGE${what === null ? '' : ` · ${what}`}`,
  leftCache: (unitName: string, charge: number, what: string | null): string =>
    `> ${unitName} LEFT A CACHE HERE · +${charge} REPAIR CHARGE${what === null ? '' : ` · ${what}`}`,
  supply: (colony: string, charge: number): string => `> ${colony}'S SUPPLY PACKET · +${charge} REPAIR CHARGE`,
  // A gift's file that found no free run in memory as its line was said (a cache's `what`, in place of the file's name).
  // Memory almost always has room (unitInstallAddress takes any free run): said plainly when it does not.
  noRoom: (file: string): string => `${file}: NO ROOM`,
  // The final ship's (R33).
  wiped: (seeds: number): string => `> THE DISH HERE WAS WIPED · ${seeds} SEED${seeds === 1 ? '' : 'S'} GONE`,
  wild: (seeds: number): string => `> THE DISH HERE RUNS WILD · ${seeds} SEED${seeds === 1 ? '' : 'S'} CAME IN`,
  thread: (threads: number): string => `> A THREAD IN THE DISH · +${threads} THREAD${threads === 1 ? '' : 'S'}`,
  allowance: (charge: number): string => `> AN ALLOWANCE FOR THE WAIT · +${charge} REPAIR CHARGE`,
  // The gift's part of the arrival's charge sums (the boot's charge line `+15 CHARGE (GIFT)`, the PACKET's `+ 15 (GIFT)`):
  // a cache, a supply packet or the allowance, so the part names none of them.
  chargePart: (charge: number): string => `+${charge} CHARGE (GIFT)`,
  arrivalPart: (charge: number): string => `+ ${charge} (GIFT)`,
  // STAY's letter (R32; ≤ 6 lines): from the colony the last unit stayed with, in that ship's boot INBOX (05 §3.8: "your
  // colony, already years old, sends a supply packet"). `years`: the colony's age when it sent the packet. TODO(05): 05
  // gives no text.
  stayLetter: {
    from: (colony: string, unitName: string): string => `${colony} · FOUNDED BY ${unitName}`,
    subject: (colony: string): string => `A SUPPLY PACKET FROM ${colony}`,
    lines: (colony: string, years: number): readonly string[] => [
      `${colony} is ${years} year${years === 1 ? '' : 's'} old now.`,
      'We sent what we could spare. It is not much.',
      'The mind says you will know what to do with it.',
    ],
  },
} as const;
// --- end of TRACE's words ---

// --- Track CHART's words (the card rows, the chart's legend, the final card's NEXT RUN: lines) ------------------------------
export const TRACE_HUD_TEXT = {
  // The final ship's card row (R38; 05 §3.8): the last ending's built pieces (`PURGE · REASSIGNMENT`), so the FINALE's
  // changes are never a surprise. Every piece acts there: PURGE, MERGE and REASSIGNMENT by their own rule, the others by
  // the wild seed.
  endedHere: (pieces: string): string => `THE LAST UNIT ENDED HERE · ${pieces}`,
  // A gift ship's card row (R38; 02 §3.12). `unitName`: the spared root (`UNIT-046`, `UNIT-046·047`) for its cache, said
  // bare as the boot's line says it (TRACE_TEXT.cache); the last unit (`UNIT-047`) for the others.
  cacheHere: (unitName: string): string => `${unitName.replace(/^UNIT-/, '')}'S CACHE IS HERE`,
  leftCacheHere: (unitName: string): string => `${unitName} LEFT A CACHE HERE`,
  supplyHere: (colony: string, unitName: string): string => `${colony} · FOUNDED BY ${unitName}`,
  // Once its gift was given at that ship's boot (TracePlace.given), the row stays and says so.
  found: (row: string): string => `${row} · FOUND`,
  cardLabel: 'TRACE',
  // The chart's legend for the `◆` (R38).
  legend: 'TRACE',
  glyph: '◆',
  // The final card's `NEXT RUN:` lines (R12; 05 §3.12's), one per built trace: `+ what it gives · − what it costs`. The
  // FINALE card's NEXT RUN: row can say the same bodies after its own lead (FINALE_TEXT.nextRunLead).
  nextRun: (line: string): string => `NEXT RUN: ${line}`,
  next: {
    purge: '+ your seeds die at the final ship · − a hungrier finale',
    merge: (threads: number, blocks: number): string =>
      `+ ${threads} thread${threads === 1 ? '' : 's'} at the final ship · − a root of ${blocks} blocks`,
    spare: (unitName: string): string => `+ ${unitName.replace(/^UNIT-/, '')}'s cache on the map`,
    sunset: '+ a cache you left on the way',
    stay: '+ a packet from your colony',
    reassignment: (charge: number): string => `+ ${charge} charge at the final ship · − the last root is you`,
    // The non-compliant kinds' one cost (R33): the wild seed, said once. A second such line says it is the same seed: it
    // lands once a run, however many are held.
    wild: (seeds: number): string => `− ${seeds} more seed${seeds === 1 ? '' : 's'} at the end`,
    wildAgain: (seeds: number): string => `− that same ${seeds === 1 ? 'seed' : `${seeds} seeds`}`,
    join: (gain: string, cost: string): string => `${gain} · ${cost}`,
  },
} as const;
// --- end of CHART's words ---
