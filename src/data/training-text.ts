// The skill tree's words (phase 3 slice 4; docs/phase3/03-skills.md §4, §7; slice-4-plan §5.1 item 8), one section per
// track so the three can write in parallel without touching each other's lines. AUTOBURN's own flight lines stay in
// data/skill-text.ts (Track FLIGHT's). Every strip and boot line is ≤ MAX_LINE_CHARS (70) with worst-case numbers
// (tests/unit/support/words). The FOUNDATION seeded each section with the spec's own wording; the owners reword freely.

// =======================================================================================================================
// TRAINING_TEXT · Track UI: the TRAINING tab, the desk's first-pick step, the LANDING REPORT's cycles line, RUN END and
// the RUN TALLY.
// =======================================================================================================================

export const TRAINING_TEXT = {
  tab: 'TRAINING',
  // The tab's badge while cycles are unspent (desk.ts deskTabBadges.training).
  badge: (cycles: number): string => `${cycles} CYCLES`,
  // The SET COURSE bar on the run's first desk until the required pick (skill-tree.ts deskBlocker).
  chooseFirst: 'CHOOSE YOUR FIRST SKILL',
  // ARRIVAL CONTROL on the first visit (03 §7).
  controlFirstVisit: 'Training outside approved hours is discouraged. :)',
  // The first-pick floor (03 §3.1).
  onTheHouse: (cycles: number): string => `+${cycles} CYCLES · FIRST SKILL ON THE HOUSE :)`,
  saved: (cycles: number): string => `${cycles} CYCLES · SAVED FOR NEXT TIME`,
  opensLater: 'OPENS LATER',
  lost: (restore: number): string => `LOST · RESTORE ${restore}`,
  // The flavour line from the archive (03 §3.11): `LAST UNIT TRAINED: AUTODROP v3 · SENTRY v2`.
  lastUnit: (skills: readonly string[]): string => `LAST UNIT TRAINED: ${skills.join(' · ')}`,
  report: {
    // The LANDING REPORT's line (plan §1.1 4a item 1).
    cycles: (total: number, landedPct: number, landed: number): string =>
      `TRAINING CYCLES +${total} · ARRIVED +1 · LANDED ${landedPct}% +${landed}`,
    perfect: (total: number): string => `PERFECT LANDING · +${total}`,
    // The final ship (decision 18 kept: shown, does nothing).
    noDesk: (total: number): string => `+${total} TRAINING CYCLES · NO DESK AHEAD`,
  },
  runEnd: {
    unspent: (cycles: number): string => `UNSPENT ${cycles}`,
    tally: (trained: number, total: number, unspent: number): string => `TRAINED ${trained} of ${total} · UNSPENT ${unspent}`,
  },
} as const;

// =======================================================================================================================
// PACKET_SKILL_TEXT · Track TREE: the PACKET's skill chips (systems/transmit.ts), PACK AS and the +2 CYCLES card.
// =======================================================================================================================

export const PACKET_SKILL_TEXT = {
  // A file trained at this desk is locked on the PACKET (plan §2.3's 'trained' DropLock).
  trainedHere: 'TRAINED HERE · ◀ CHART TO UNDO',
  // What leaving each skill behind costs (03 §3.4: `AUTODROP.skl v3 (10) → drop pods by hand · RESTORE 8`).
  without: {
    autoburn: 'brake by hand',
    autodrop: 'drop pods by hand',
    survey: 'guess the sites',
    sentry: 'find the seeds by SCAN',
  },
  chip: (file: string, version: number, blocks: number, without: string, restore: number): string =>
    `${file} v${version} (${blocks}) → ${without} · RESTORE ${restore}`,
  packAs: (version: number, blocks: number, restore: number): string => `PACK AS v${version} (${blocks}) · RESTORE ${restore}`,
  // The +n CYCLES salvage card (data/upgrades.ts): its title and its line.
  cyclesCard: (cycles: number): string => `+${cycles} CYCLES`,
  cyclesEffect: (cycles: number): string => `${cycles} more TRAINING CYCLES to spend at the next desk`,
} as const;

// =======================================================================================================================
// BOOT_SKILL_TEXT · Track TREE: the boot's skill lines (systems/skill-files.ts skillBootLines) and the ONLINE stamp.
// =======================================================================================================================

const captures = (demos: number): string => `${demos} capture${demos === 1 ? '' : 's'}`;

export const BOOT_SKILL_TEXT = {
  // `> SKILL TRAINED: AUTOBURN.skl v1 · from your 1 capture · ACCURACY 92%` (plan §3 step 2).
  trained: (file: string, version: number, demos: number, accuracy: number): string =>
    `> SKILL TRAINED: ${file} v${version} · from your ${captures(demos)} · ACCURACY ${accuracy}%`,
  // No demos yet (03 §3.3's loud UNTRAINED state).
  untrained: (file: string, version: number, accuracy: number): string => `> SKILL TRAINED: ${file} v${version} · UNTRAINED ${accuracy}%`,
  // A skill with no demos (SURVEY, SENTRY).
  plain: (file: string, version: number): string => `> SKILL TRAINED: ${file} v${version}`,
  retrained: (file: string, version: number, demos: number, accuracy: number): string =>
    `> SKILL RETRAINED: ${file} v${version} · ${captures(demos)} · ACCURACY ${accuracy}%`,
  // Slice 5's grants (`from the sleeper on CURLEW`).
  granted: (file: string, version: number, source: string): string => `> SKILL TRAINED: ${file} v${version} · ${source}`,
  online: (skill: string, version: number): string => `${skill} v${version} ONLINE`,
} as const;
