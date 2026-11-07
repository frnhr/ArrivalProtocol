// Slice 5: the lead owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §5): the residents' dispatcher. It sends each
// rack-A file type to its kind's module (WARDEN: `resident`; KIN: `sleeper`, `sleep-lock`, `note`, `leftover`), mounts the
// three modules, registers the 'resident' landing controller, and writes the run's record of every resident met. Tracks never edit it: the kinds' functions it calls have
// their final signatures (plan §6.1 item 5). A ship holds one resident (02), so WARDEN's and KIN's modules never run on the
// same ship.
import type { Store } from '@state/store';
import type { GameState, ShipResult } from '@state/schema';
import type { ResidentFileSegment } from '@/types/segment';
import type { ResidentRecord, ResidentState, RunResidentState } from '@/types/resident';
import type { ValidTargetContext } from '@systems/tool-targets';
import type { LandingController } from '@/types/landing';
import type { ToolRefusal, ConfirmText } from '@data/tool-text';
import {
  mountResidentCorrupted, corruptedToolRule, corruptedDeleteSec, corruptedDeleteQuestion, corruptedShipEnd,
} from '@systems/resident-corrupted';
import { mountResidentLeft, leftToolRule, leftShipEnd } from '@systems/resident-left';
import { mountResidentSleeper, sleeperToolRule, sleeperShipEnd, sleeperController } from '@systems/resident-sleeper';
import { registerLandingController } from '@systems/landing-controller';
import { DELETE_SEC } from '@data/tuning';

let mounted = false;

// Mounted right after THE DEAL (main.ts; tests/unit/wp6/harness6.ts, which every later harness extends), so the residents'
// AI ticks run after HOLLOW's and its deal's (MEND DRIVERS' tug-of-war, plan R13; the resident's DEAL checks HOLLOW's, R8):
// the corrupted resident's module, then the departed resident's, then the sleeper's (plan §2.4). Returns the unmount.
export function mountResidents(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountResidents: already mounted');
  mounted = true;
  const offs = [
    mountResidentCorrupted(store), mountResidentLeft(store), mountResidentSleeper(store),
    registerLandingController('resident', residentController),
  ];
  return () => {
    for (const off of offs.reverse()) off();
    mounted = false;
  };
}

// The 'resident' landing controller (landing-controller.ts asks it in LANDING_CONTROLLER_ORDER, under MERGE, over AUTODROP):
// the one slot every resident kind shares, dispatched on the ship's kind as the tool rules are (review architecture 1), so a
// second kind that wants the landing (04's "fights for the helm", slice 7's STAY) adds a case here, not a registration.
// Today only the sleeper flies it (RUN THE DROPS, R11).
function residentController(state: Readonly<GameState>): LandingController | null {
  switch (state.resident.def?.kind) {
    case 'sleeping': return sleeperController(state);
    case 'corrupted':
    case 'left':
    case undefined: return null;
  }
}

// Why the active tool can't be used on a resident's file, or null when its kind allows it: its kind's rule (tool-targets.ts
// targetRefusal asks here for every resident file type, after the busy and disguise checks). On null the tools' own rules
// still apply after it (REPAIR's charge and ALREADY 100%, MOVE's and COPY's infection), so a kind's rule says only what is
// its own (SCAN IT FIRST, IT WON'T BE MOVED, PINNED TO MOTH.sys …).
export function residentToolRule(seg: Readonly<ResidentFileSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  switch (seg.type) {
    case 'resident': return corruptedToolRule(seg, ctx);
    case 'note':
    case 'leftover': return leftToolRule(seg, ctx);
    case 'sleeper':
    case 'sleep-lock': return sleeperToolRule(seg, ctx);
  }
}

// How long DELETE takes on a resident's file (state/actions.ts deleteSec): WARDEN.sys is cut out block by block (04 §3.12);
// every other file (the sleeper's lock, plan §2.9: 1.0 s) deletes in DELETE_SEC, whatever its kind's tool rule allows.
export function residentDeleteSec(seg: Readonly<ResidentFileSegment>): number {
  return seg.type === 'resident' ? corruptedDeleteSec(seg) : DELETE_SEC;
}

// DELETE's inline confirm on a resident's file (tool-targets.ts deleteQuestion), or null: WARDEN.sys asks its own
// (`DELETE WARDEN.sys? It is the ship's own mind.`); the sleeper's lock goes with no question (plan §2.9).
export function residentDeleteQuestion(state: Readonly<GameState>, seg: Readonly<ResidentFileSegment>): ConfirmText | null {
  return seg.type === 'resident' ? corruptedDeleteQuestion(state, seg) : null;
}

// The ship is ending (run.ts endShip, right after the ship's result is recorded, before SHIP DONE's save): the resident's
// kind ends whatever runs (a telegraph, an offer, a job: the codec reads the slice at rest) and says how its ship ended for
// it, and the run keeps one record of it (plan §2.2). Nothing on a ship with no resident, or one whose kind is not built.
export function residentShipEnd(store: Store<GameState>, result: Readonly<ShipResult>): void {
  const def = store.getState().resident.def;
  if (def === null) return;
  // Review m2: before the kind runs (a sleeper's gift must not be paid on a ship already recorded).
  if (store.getState().run.residents.met.some((met) => met.slot === result.slot)) {
    throw new Error(`residentShipEnd: ${def.name} on slot ${result.slot} is already recorded`);
  }
  const base: Omit<ResidentRecord, 'fate'> = {
    slot: result.slot, depth: result.depth, kind: def.kind, name: def.name, shown: def.shown, job: null, podsParkedLocked: 0,
    leftoversEaten: 0,
  };
  let record: ResidentRecord;
  switch (def.kind) {
    case 'corrupted': {
      const end = corruptedShipEnd(store);
      record = { ...base, fate: end.fate, podsParkedLocked: end.podsParkedLocked };
      break;
    }
    case 'left': {
      const end = leftShipEnd(store);
      record = { ...base, fate: end.fate, leftoversEaten: end.leftoversEaten };
      break;
    }
    case 'sleeping': {
      const end = sleeperShipEnd(store);
      record = { ...base, fate: end.fate, job: end.job };
      break;
    }
  }
  store.update((draft) => { draft.run.residents.met.push(record); });
}

// __ap.resident() (plan §2.12): the ship's resident slice and the run's records, as data.
export interface ResidentDebug extends ResidentState, RunResidentState {}

export function residentDebug(state: Readonly<GameState>): ResidentDebug {
  return structuredClone({ ...state.resident, ...state.run.residents }) as ResidentDebug;
}
