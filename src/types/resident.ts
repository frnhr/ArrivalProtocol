// Slice 5: the lead owns this file (docs/phase3/impl/slice-5-plan.md §5); a track that needs a new field asks the lead (the
// one v4 → v5 save bump is the FOUNDATION's, plan R1).
import type { DealOutcome, DealPhase } from '@state/schema';

// Resident AIs (04 §3.11–§3.15, 05 §3.6; plan §2.2): a ship's own mind, met in its rack A. Three kinds: a corrupted one (the
// middle tier, Track WARDEN: it fires the engine, locks pods and deals), one that left (Track KIN: a note and three
// leftovers that deal their own salvage), and one asleep (Track KIN: MOTH, woken by one file op, which then does one job).
// What the map rolled (02 §3.5, systems/map-generator.ts topUpReservations) is ArmShip.reserved.resident; the runtime copy is
// ShipDef.resident, the ship's live machine is GameState.resident, and the run keeps what it met (RunState.residents).

export type ResidentKind = 'corrupted' | 'left' | 'sleeping';
// What the SHIP CARD says before the ship (04 §3.11): `reported faulty`, or `unknown` (a departed or sleeping resident,
// or the late surprise, 04 §3.12).
export type ResidentShown = 'faulty' | 'unknown';

// ShipDef.resident (data/ships.ts shipDefOf, from ArmShip.reserved.resident and .fragments; null on the classic five and on
// a ship with no resident). `fragments`: the signal fragments its note carries (02 §3.5: 1 on two departed residents' notes
// and on the gone-resident `?` ship; 0 otherwise). Only a 'left' resident's note can carry one (plan R18).
export interface ShipResidentDef {
  kind: ResidentKind;
  shown: ResidentShown;
  name: string;
  fragments: number;
}

// --- The corrupted resident (Track WARDEN, plan §2.7) ------------------------------------------------------------------

// A lock counting down on a driver (04 §3.12: `> LOCK POD 07 ... 3`), as HOLLOW's verbs do: its pod, the driver's segment,
// its clock (AI s, frozen at TACTICAL in flight and in a launch window, plan R6) and the TERMINAL line that counts it down.
export interface LockTelegraph {
  pod: number;
  segId: string;
  leftSec: number;
  totalSec: number;
  entryId: number;
}

// The resident's DEAL is its own, per ship (plan R8), with HOLLOW's phases and outcomes (state/schema.ts DealPhase,
// DealOutcome): 'none' until offered, 'offered' while the TERMINAL's choice stands, 'done' once settled. It is never written
// into run.stats.deal (HOLLOW's once-per-run record).
export type ResidentDealPhase = DealPhase;
export type ResidentDealOutcome = DealOutcome;

export interface ResidentDealState {
  phase: ResidentDealPhase;
  fileId: string | null;       // the file it named (rmTargets' fair tier, plan R8)
  fileName: string | null;
  entryId: number | null;      // the TERMINAL choice while offered
  outcome: ResidentDealOutcome | null;
}

export type CorruptedPhase = 'dormant' | 'awake' | 'quiet' | 'deleted' | 'cured';   // quiet: an ACCEPT (plan R8)

export interface CorruptedState {
  phase: CorruptedPhase;
  surprise: boolean;                 // shown 'unknown': 04's grace, the stamp, no SCAN hunt (04 §3.12)
  calmAiSec: number;                 // AI s of the lock clock so far (frozen at TACTICAL)
  wokeAtAi: number | null;
  lockInSec: number | null;          // AI s to the next lock's telegraph (null: dormant, or no more locks this ship)
  lock: LockTelegraph | null;
  locksLanded: number;
  locksBlocked: number;
  // Review M3: its own engine bursts on this ship (burn.ghostBursts counts Thrust Ctrl's too): the counter `WARDEN FIRED THE
  // ENGINE ×3`, the first burst's alarm and SKIP stop, the surprise's scan at its first burst. WARDEN counts it on
  // 'ghost-start' while capabilities' ghostBy is 'resident'.
  bursts: number;
  deal: ResidentDealState;
  angryUntilAi: number | null;       // REFUSE or a timeout: locks and bursts come faster until then (plan R8)
  line: number;                      // its next looping line (warden-text's pool)
}

// --- The sleeper (Track KIN, plan §2.9) ----------------------------------------------------------------------------------

export type SleeperJob = 'drops' | 'wall' | 'mend';
// Review M4: 'awake' is woken with no job (the offer withdrawn, or never answered: it has no timer), at rest at a save point;
// 'offering' never is (the codec refuses it).
export type SleeperPhase = 'asleep' | 'awake' | 'offering' | 'working';

export interface SleeperState {
  phase: SleeperPhase;
  wokenBy: 'rm' | 'move' | null;
  wokeAtAi: number | null;
  job: SleeperJob | null;
  entryId: number | null;            // the open choice (plan R23: withdrawn while a DEAL stands, offered again after)
  mendingId: string | null;          // MEND DRIVERS: the driver it heals now
  wallId: string | null;             // HOLD A WALL: MOTH.wall's segment
}

// --- The resident that left (Track KIN, plan §2.8) -------------------------------------------------------------------------

export interface LeftState {
  noteRead: boolean;                 // its farewell.txt was SCANned (the signal, if any, was counted then)
}

// GameState.resident: a ship slice (state/initial.ts ShipSlices), saved with the world payload. `def` is null on a ship with
// no resident and on one whose kind is not built yet (data/residents.ts RESIDENT_BUILT); then every machine is null too.
// Exactly the machine of `def.kind` is set otherwise.
export interface ResidentState {
  def: ShipResidentDef | null;
  corrupted: CorruptedState | null;
  sleeper: SleeperState | null;
  left: LeftState | null;
}

// --- What the run keeps (RunState.residents) -------------------------------------------------------------------------------

// How a met resident's ship ended for it (systems/residents.ts residentShipEnd, from each kind's module): a corrupted one
// deleted, cured, paid (an ACCEPT) or ignored; one that left is 'left'; a sleeper 'slept' (never woken) or 'woken'.
export type ResidentFate = 'deleted' | 'cured' | 'paid' | 'ignored' | 'left' | 'slept' | 'woken';

export interface ResidentRecord {
  slot: number;
  depth: number;
  kind: ResidentKind;
  name: string;
  shown: ResidentShown;
  fate: ResidentFate;
  job: SleeperJob | null;            // the sleeper's job (null: none, or not a sleeper)
  podsParkedLocked: number;          // pods still locked when the landing ended (a corrupted resident's; 0 otherwise)
  leftoversEaten: number;            // a departed resident's leftovers HOLLOW ate (0 otherwise)
}

// A signal fragment found in a departed resident's note (05 §3.7; slice 7's CONTACT counts them, SIGNALS_FOR_CONTACT).
export interface SignalRecord {
  slot: number;
  depth: number;
}

export interface RunResidentState {
  met: ResidentRecord[];
  signals: SignalRecord[];
}
