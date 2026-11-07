// Slice 5: Track KIN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.8, §6.2). The FOUNDATION wrote the final
// signatures: the hot-path stubs answer neutrally and never throw; the entry points that change state throw through
// not-built.ts until KIN builds them (plan §6.1 item 5). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { NoteSegment, LeftoverSegment } from '@/types/segment';
import type { ValidTargetContext } from '@systems/tool-targets';
import { TOOL_REFUSAL, type ToolRefusal } from '@data/tool-text';
import { notBuilt } from '@systems/not-built';

// The resident that left (04 §3.13, plan §2.8): farewell.txt and its signal (05 §3.7), the three leftovers, their cards
// (rolled at the boot's first tick, R14) and the leftover deck at the PACKET (systems/draft.ts, KIN's). All its machine
// state is state.resident.left and the segments' own fields (plan R2).

// Mounted by systems/residents.ts mountResidents. Built by the FOUNDATION as a no-op: KIN adds its ticks and subscriptions
// here (the boot's card roll, the SCAN reactions on 'scanned'). Returns the unmount.
export function mountResidentLeft(store: Store<GameState>): () => void {
  void store;
  return () => {};
}

// Why the active tool can't be used on a note or a leftover (plan §2.8: SCAN, REPAIR and MOVE on a leftover; DELETE and COPY
// refused with the log's words; the note takes SCAN only), or null when it can. tool-targets.ts asks it through
// residents.ts residentToolRule. FOUNDATION stub (hot path, neutral): NOTHING TO DO THERE.
export function leftToolRule(seg: Readonly<NoteSegment | LeftoverSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  void seg;
  void ctx;
  return TOOL_REFUSAL.notAFile;
}

// The ship is ending (systems/residents.ts residentShipEnd): how many leftovers HOLLOW ate (the record's leftoversEaten).
// FOUNDATION stub (neutral): none.
export function leftShipEnd(store: Store<GameState>): { fate: 'left'; leftoversEaten: number } {
  void store;
  return { fate: 'left', leftoversEaten: 0 };
}

// The leftovers' cards, rolled once at the boot's first tick (plan R14: two pool cards from draftCards(draftContext(state),
// shipRng(run, slot, 'leftovers')), then the skill card) and written onto the segments. Changes state: throws until KIN.
export function rollLeftoverCards(store: Store<GameState>): void {
  notBuilt('rollLeftoverCards', 'KIN', store);
}
