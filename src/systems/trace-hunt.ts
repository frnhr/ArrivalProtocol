// =====================================================================================================================
// Slice 7c: Track TRACE owns this file (docs/phase3/impl/slice-7-plan.md §2.4, §5.3; R33's hunt). Pure and DOM-free (no
// store, no module state): systems/hollow.ts and systems/hollow-verbs.ts call it on HOLLOW's hot paths, so the FOUNDATION's
// stubs are neutral or unreachable while TRACES_BUILT.reassignment is down.
// =====================================================================================================================
// REASSIGNMENT's cost (05 §3.8: "it knows what you value"): on the final ship the root is the last unit, and HOLLOW's RM
// verb takes the highest-version `.skl` in memory first while one is a fair target (ties: the larger file; HUNT_PREFER_WEIGHT,
// TRACE's tuning), and its seeds land beside it.
// • huntTarget: hollow-verbs.ts startVerb passes it to hollow.ts chooseVerb as `prefer` (RM takes that file when it is among
//   rmTargets, whatever the tier draw; the draws are taken either way, so a null prefer changes nothing).
// • nearSkillSeedSpot: hollow.ts seedSpotFor's 'near-skill' target, which threat-plan.ts planThreat sets on the FINALE's own
//   seeds only when ThreatInput.traces.hunt (systems/traces.ts finalTraceInput: REASSIGNMENT held and built).
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { SeedSpot } from '@systems/hollow';
import { notBuilt } from '@systems/not-built';

// The file HOLLOW's RM goes for first now (a segment id), or null: no hunt (no REASSIGNMENT trace, not the final ship, no
// skill in memory). Neutral: null.
export function huntTarget(state: Readonly<GameState>): string | null {
  void state;
  return null;
}

// Where a 'near-skill' seed lands (the gap beside the highest-version skill, by hollow.ts seedSpot's own fairness rules), or
// null when there is none. Unreachable until planThreat sets 'near-skill' (REASSIGNMENT built).
export function nearSkillSeedSpot(memory: readonly Segment[], untried: readonly FsToolKind[]): SeedSpot | null {
  return notBuilt('nearSkillSeedSpot', 'TRACE', memory, untried);
}
