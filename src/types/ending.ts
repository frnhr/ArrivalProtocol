// Slice 7a: the lead owns this file (docs/phase3/impl/slice-7-plan.md §2.2, §4.1); tracks ask by message. A new saved field
// is folded into the sub-slice's one save bump by the lead (R2).
// The endings' types (05-story §3.7, §3.8; 02-map §4): the FINALE's two steps, the pieces the archive counts, the record a
// won (or unresolved) run leaves the next one, and THE LAST LANDING's state (7b's, typed and saved as null from 7a on, so 7b
// needs no save bump). Type-only imports; flat and JSON-safe (the save and the archive store them as they are).
import type { DriverSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';

// Step 1, what becomes of HOLLOW (05 §3.7). 'followed': UNRESOLVED (R10), the root was never deleted, so there was no
// step-1 choice (and no step-1 trace).
export type HollowChoice = 'purge' | 'merge' | 'spare';
export type HollowFate = HollowChoice | 'followed';

// Step 2, what becomes of you. 'contact' is 7d's: the type holds it from 7a on (R2: no finale change in 7d), and the gate
// refuses it until data/endings.ts ENDINGS_BUILT.contact is raised.
export type YouChoice = 'sunset' | 'stay' | 'reassignment' | 'contact';

// The endings found (meta.endingsSeen, the final card's two rows, the title's ENDINGS n/6): the step-1 choices and the
// step-2 choices. 'followed' is not a piece (nothing was chosen).
export type EndingPiece = HollowChoice | YouChoice;

// The FINALE's machine (systems/finale.ts; R6, R7, R13):
// • none: the root is still LOCKED (or this is not the final ship); duel: DELETE THE ROOT (as built in WP11);
// • asleep: the root's DELETE left its last block and HOLLOW sleeps there (no bites, seeds or verbs); the landing goes on;
// • step1 / step2: the card (the FINALE), step 1 what becomes of it, step 2 what becomes of you; nothing is applied yet;
// • verdict: step 2 was confirmed and applied; the short typed verdict (≤ FINALE_VERDICT_MAX_LINES lines) is on the card;
// • last-landing: THE LAST LANDING after a MERGE (7b; in 7a the reopened landing, R15);
// • done: decided; the LANDING REPORT may open (ENDING CHOSEN is saved as it does, R14).
export type FinalePhase = 'none' | 'duel' | 'asleep' | 'step1' | 'step2' | 'verdict' | 'last-landing' | 'done';

// How a won (or unresolved) run ended, as the archive keeps it (LastUnit.ending, META 4) and the run end reads it
// (systems/ending-rules.ts endingRecordOf, while run.phase is 'end'): every fact 7c's traces and 7a's epilogue need, so
// neither reads a run that is gone. A lost run has none (null). Frozen at step 2's confirm (FinaleState.record, review M4).
export interface EndingRecord {
  hollow: HollowFate;
  you: YouChoice;
  // Who the root was (run.hollowUnits on the final ship): SPARE's `<UNIT>'S CACHE`, the face lines, 046·047 after a MERGE.
  rootUnits: number[];
  // The final ship's arm slot; null on the classic world (it has no arm) and on a migrated record that kept no trail.
  finalSlot: number | null;
  finalShip: string;
  // The final ship's approach year (the face line's wait, R35), on either world (the classic map has real years too: review
  // m6); null only on a migrated record that kept no trail (the wait then reads its floor).
  finalYear: number | null;
  // STAY's colony (its supply packet, R31): the ship's slot (its route index on the classic world), the colony's name and
  // the year it was founded (that ship's approach year, on either world). null for every other step 2.
  stay: { slot: number; colony: string; year: number } | null;
  // The fs-tool kinds the unit ended with (a usable copy in memory at the FINALE's confirm): SUNSET's gift (R32).
  kit: FsToolKind[];
  // The empty ship's FUEL as shown (shownFuelPct) for SPARE and SUNSET (the epilogue's `23% fuel`); null otherwise.
  fuelPct: number | null;
  // REPAIR CHARGE left at the end (REASSIGNMENT's `26 blocks of charge`): after MERGE's price is spent.
  charge: number;
}

// THE LAST LANDING (7b; 01 §3.17): the drivers MERGE gave back by radio, and how they fly. Always null in 7a, and null at
// every save point (the codec refuses it set).
// Slice 7b: Track DROP may change the fields below (not `pods` and `drivers`, which the lead's seams read: selectors
// launchDrivers, landing.ts launchDriver, landing-hud parkedBeacons): it never reaches a save, so no bump follows. It asks
// the lead by message, who makes the edit (this file is the lead's).
// Track DROP (7b) added `startTSec` … `stuckAiSec` (its Deviations; no save effect) and reads `cadenceLeftSec` in tactical s.
export interface LastLandingState {
  pods: number[];                       // restored pods, in pod order
  drivers: DriverSegment[];             // by radio, at MERGE_DRIVER_INTEGRITY; never in memory (R24)
  flier: 'v1' | 'v2' | 'v3' | 'blind';  // decided at the start (R27)
  orbitsFlown: number;                  // AUTODROP's orbits so far (LAST_LANDING_AUTODROP_ORBITS)
  // Tactical s of world time until the next launch may go (R26), counted down as the bay's cadence is (landing.ts bayAfter):
  // 01's "2.0 s between launches … so the rhythm reads" is the bay's rhythm at TACTICAL (Track DROP's Deviation 1).
  cadenceLeftSec: number;
  skipped: boolean;                     // [ENTER] asked (R28)
  startTSec: number;                    // game s THE LAST LANDING started: AUTODROP's orbits count from here
  // Game s AUTODROP stops flying (start + LAST_LANDING_AUTODROP_ORBITS periods); null for a blind flier. From then a pod it
  // has not placed drops blind in the next window (R27).
  autodropUntilTSec: number | null;
  // v1 and blind (one pod per window, in pass order): every window whose centre is at or before this game time has had its
  // turn, and `turns` windows have (each blind turn draws its moment from its own 'last-landing:<turn>' stream).
  passedTSec: number;
  turns: number;
  target: LastLandingTarget | null;     // v1 and blind: the window the next pod goes in, and when
  stuckAiSec: number;                   // AI s nothing could fly (no drop dot, no in-band window): it ends the landing
  // v2: the pass THE LAST LANDING arms each orbit, its own (autodrop.ts AutodropOverride.pass reads it), so the kid's AUTODROP
  // machine (landing.autodrop) is never written while MERGE flies (7b review). null until the first arm, and for v1/v3/blind.
  pass: LastLandingPass | null;
}

// v2's pass under THE LAST LANDING (7b review): the counts [G] would prefill, what has gone since the arm, and when it was
// armed (a pass ends one period later), as AutodropState's own three fields.
export interface LastLandingPass {
  pass: Record<string, number>;
  sent: Record<string, number>;
  armedAtTSec: number;
}

// One pod's turn (v1 or blind): its window's LZ and centre (game s), the moment it launches (v1: the centre plus AUTODROP's
// learned offset, inside the pod's sure part; blind: uniform within ±(W/2 + BLIND_MARGIN_KM) of the centre) and the last
// moment it may still go (past it, the window's turn is over unused).
export interface LastLandingTarget {
  lz: string;
  centreTSec: number;
  atTSec: number;
  untilTSec: number;
  blind: boolean;
}

// The run end's three screens after CONTINUE (R19): the RUN TALLY, the EPILOGUE, the FINAL CARD (ui.runEndStage, unsaved:
// the run save is cleared at endRun).
export type RunEndStage = 'tally' | 'epilogue' | 'final';
