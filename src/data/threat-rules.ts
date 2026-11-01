import type { GuideRule } from '@systems/director';

// The strip's rules for the threat ladder (docs/phase3/04-threats.md §3.3, §3.5; slice-2-plan §2.1, §5.1): the beam
// seeds' `RM THE SEED` lesson and its no-rm line, the seeds-only alerts, the last-rm line. Track THREAT owns this file;
// data/script.ts spreads THREAT_RULES into GUIDE_RULES right before SEED_RULES (a beam seed's line sits where phase 2's
// seed lines do: after HOLLOW's eating lines, before the WALL and COPY lessons), so THREAT never edits script.ts.
// Where a phase-2 SEED_RULES line applies to beam seeds, THREAT moves it here.
export const THREAT_RULES: readonly GuideRule[] = [];
