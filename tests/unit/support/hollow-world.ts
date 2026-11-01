// Phase 3 slice 2: HOLLOW's configs moved from the ships to the stages (src/data/threats.ts HOLLOW_STAGES). Phase 2's
// suites were written against "ship n's HOLLOW"; each ship's def now lives on as one stage (04 §3.9's table), so a suite
// that still means phase 2's ship-n numbers reads them here. Track THREAT grows this helper (plantRoot, slice-2-plan §6.2)
// when it re-keys those suites.
import type { HollowDef, HollowStage } from '@/types/threat';
import { HOLLOW_STAGES } from '@data/threats';

// Phase 2's ship index → the stage its HollowDef became.
export const PHASE2_STAGE_OF_SHIP: readonly HollowStage[] = ['arrival', 'walls', 'seeds', 'hunt', 'finale'];

// Phase 2's HollowDef for ship `index` (ARES-VII 0 … LAST LIGHT 4), copied.
export function phase2HollowOf(index: number): HollowDef {
  const stage = PHASE2_STAGE_OF_SHIP[index];
  if (stage === undefined) throw new Error(`phase2HollowOf: no phase-2 ship ${index}`);
  return structuredClone(HOLLOW_STAGES[stage].hollow);
}
