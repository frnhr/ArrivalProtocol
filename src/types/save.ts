import type { RunState, LogState } from '@state/schema';
import type { ShipSlices } from '@state/initial';
import type { CarriedRacks } from '@data/memory';
import type { ShipThreat } from '@/types/threat';
import type { ContentVersions } from '@/types/lineage';
import type { RUN_SAVE_VERSION } from '@data/tuning';

// The run save (phase 3 slice 3c, 02-map §3.11; docs/phase3/impl/slice-3c-plan.md §2.1, §2.5): one slot under
// RUN_SAVE_KEY, written whole at four points, each replacing the last. JSON, through systems/save-codec.ts (the one
// non-JSON number, a sticky ghost burst's Infinity, is tagged). The foundation lays the types down; Track SAVE owns this
// file after.
//
// Room to grow (3c plan §1.3, Fran's D5: mid-ship saves and ironman wait for a playtest of the plain save):
// • `mode` is a union of one ('ironman' joins it: the same slot, a 'tab-hidden' point, no rewind);
// • `payload` is a tagged union: a later 'mid-ship' kind (the slices plus the module snapshots) slots in beside 'boot' and
//   'world' without touching them;
// • a new point is a SavePoint member: systems/save-write.ts writeRunSave is the one entry point.

export type SavePoint = 'run-start' | 'ship-done' | 'beam' | 'ending-chosen';

// The title's RESUME line (`RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625`), worked out once at the write so the
// title never rebuilds a ship to name it.
export interface ResumeLine {
  unit: number;
  depth: number;                // the route position the save resumes on (run.shipIndex + 1)
  ship: string;                 // the ship being booted into (boot points) or the ship just done (world points)
  year: number;                 // the galaxy year there
  point: SavePoint;
  // Playtest 1 (RUN_SAVE_VERSION 10): the screen it resumes on. SHIP DONE is written twice (plan §3.3.3), at LEAVE ORBIT
  // ('leave-orbit' after a landing, 'leaving' after a lost ship: `LEAVING HALCYON`) and at the desk.
  stage: ResumeStage;
}

export type ResumeStage = 'boot' | 'leave-orbit' | 'leaving' | 'desk' | 'report';

// The parts of a boot that the store no longer holds once the ship is built (the BEAM point: startShip's racks and verdict).
export interface BootParts {
  carried: CarriedRacks | null;
  threat: ShipThreat;
}

// A save that resumes at a ship's boot (RUN START, BEAM): the run as startShip built it plus the boot's parts; the ship
// itself is re-derived through createShipSlices (deterministic by the ShipKey and the visit streams).
export interface BootPayload extends BootParts {
  kind: 'boot';
  run: RunState;
}

// A save that resumes on a screen between flights (SHIP DONE: LEAVE ORBIT or the desk, playtest 1; ENDING CHOSEN: the final
// LANDING REPORT): the run and the ship's slices as they stood.
export interface WorldPayload {
  kind: 'world';
  phase: 'leave' | 'desk' | 'report';
  run: RunState;
  slices: ShipSlices;
}

export type SavePayload = BootPayload | WorldPayload;

export type SaveMode = 'standard';

export interface RunSave {
  saveVersion: typeof RUN_SAVE_VERSION;
  mode: SaveMode;
  content: ContentVersions;
  writtenAt: number;            // Date.now() at the write (shown nowhere; a bug report reads it)
  unit: number;
  run: number;                  // the run number (map.run)
  archiveRuns: number;          // the archive's runs when written: a save from a run the archive has moved past is stale
  point: SavePoint;
  resume: ResumeLine;
  payload: SavePayload;
  log: LogState;                // the TERMINAL and COMMS history (05 §8.3: the log is part of the save)
  done: string[];               // the director's one-shot rules and beats already done
}

// The page's save (GameState.save). 'none': a headless world (nothing is ever written); 'ok': written at the points;
// 'offline': a read or write threw (play goes on, nothing more is written this page); 'cant-resume': a save is there but
// cannot be resumed (`refusal` says why; the title offers ABANDON RUN only).
export type SaveStatus = 'none' | 'ok' | 'offline' | 'cant-resume';

export interface SaveState {
  status: SaveStatus;
  resume: ResumeLine | null;    // a resumable save's line (the title's RESUME block), else null
  // 'cant-resume' only: why (the title's words are MAP_TEXT.save.reason[refusal.kind]; refusal.detail goes to the console
  // only, never on screen). null otherwise ('offline' says itself).
  refusal: SaveRefusal | null;
}

// Why a stored save can't be resumed, in the order the decoder checks (3c plan §2.1 "content check on load"): the first
// failure wins. 'stale', 'superseded' and 'archive' come from saveRefusal (the archive's view): 'stale' when the archive has
// no run in progress (the save's run already ended), 'superseded' when its run in progress is another (another tab's, or a
// run started in this page after the save went OFFLINE; review fix, minor 7); 'resume-threw' from the resume itself.
export type SaveRefusalKind =
  | 'not-json' | 'version' | 'content' | 'shape' | 'route' | 'ship' | 'stale' | 'superseded' | 'archive' | 'resume-threw';

export interface SaveRefusal {
  kind: SaveRefusalKind;
  detail: string;
}

export type DecodeResult = { ok: true; save: RunSave } | { ok: false; refusal: SaveRefusal };
