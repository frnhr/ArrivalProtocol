// Slice 5: Track KIN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.8, §6.2). The FOUNDATION wrote the final
// signatures; Track KIN built the bodies. Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment, NoteSegment, LeftoverSegment, LeftoverCard } from '@/types/segment';
import type { ValidTargetContext } from '@systems/tool-targets';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { currentSlot, currentStop, shipRng } from '@systems/map-streams';
import { draftContext } from '@systems/draft';
import { signalCount } from '@systems/signals';
import { draftCards, getUpgrade } from '@data/upgrades';
import { RESIDENT_SEG_IDS } from '@data/residents';
import { KIN_TEXT } from '@data/kin-text';
import { TOOL_REFUSAL, type ToolRefusal } from '@data/tool-text';
import { LEFTOVER_COUNT } from '@data/tuning';

// The resident that left (04 §3.13, plan §2.8): farewell.txt and its signal (05 §3.7), the three leftovers, their cards
// (rolled at the boot's first tick, R14) and the leftover deck at the PACKET (systems/draft.ts dealDraft, KIN's). All its
// machine state is state.resident.left and the segments' own fields (plan R2); module state is only the SCANs the bus brought
// since the last tick, reset with the world.
// • The cards: at the first tick a leftover has none (the boot's: postTick runs in every phase), two pool cards dealt by
//   upgrades.ts draftCards from the unit as it boots (no link bound: the PACKET checks the hop's room later) on the ship's own
//   'leftovers' stream, then the skill card, written onto leftover1–3 in that order. A resumed BEAM boots from the same state
//   and streams, so it rolls the same cards.
// • SCAN on the note: it is read (left.noteRead) and INSPECT shows its lines and the signature; a fragment is a signal, found
//   once a run on its ship (run.residents.signals, 'signal-found': `SIGNAL · n/3`).
// • SCAN on a leftover: its name becomes its card's (`FUEL TRIM · LEFT`, `A SKILL · LEFT`) and its desc the card's effect
//   ('leftover-read').

const LEFTOVER_IDS: readonly string[] = Array.from({ length: LEFTOVER_COUNT }, (_, index) => RESIDENT_SEG_IDS.leftover(index));

let scanned: string[] = [];

function resetLeft(): void {
  scanned = [];
}

function leftoverAt(memory: readonly Segment[], index: number): LeftoverSegment | null {
  const seg = memory.find((candidate) => candidate.id === RESIDENT_SEG_IDS.leftover(index));
  return seg !== undefined && seg.type === 'leftover' ? seg : null;
}

// The leftovers still in memory, in deck order (leftover1 first); an eaten one is gone (HOLLOW's block took its place).
export function leftoversInMemory(memory: readonly Segment[]): LeftoverSegment[] {
  return LEFTOVER_IDS.map((_, index) => leftoverAt(memory, index)).filter((seg): seg is LeftoverSegment => seg !== null);
}

// The note's lines (05 §3.6) from its tone and index.
export function noteLines(note: Readonly<NoteSegment>): readonly string[] {
  const lines = KIN_TEXT.notes[note.tone][note.text];
  if (lines === undefined) throw new Error(`resident-left: no ${note.tone} note ${note.text}`);
  return lines;
}

// A leftover's words once a SCAN read it: its card's name and effect.
function leftoverWords(card: Readonly<LeftoverCard>): { name: string; desc: string } {
  if (card.kind === 'skill') return { name: KIN_TEXT.leftover.skillName, desc: KIN_TEXT.leftover.skillDesc };
  const def = getUpgrade(card.id);
  return { name: KIN_TEXT.leftover.name(def.title), desc: def.effect };
}

function readScans(store: Store<GameState>): void {
  const ids = scanned;
  scanned = [];
  const state = store.getState();
  const def = state.resident.def;
  if (def === null || state.resident.left === null) return;
  const slot = currentSlot(state.run);
  const signals: number[] = [];
  const read: string[] = [];
  store.update((draft) => {
    for (const id of ids) {
      const seg = draft.memory.find((candidate) => candidate.id === id);
      if (seg?.type === 'note') {
        draft.resident.left!.noteRead = true;
        seg.desc = KIN_TEXT.noteDesc(noteLines(seg), def.name);
        // Slice 7d: a note's record says so (`source` 'note', its one fragment), since a CONTACT stop's file may share the slot.
        if (seg.fragment && !draft.run.residents.signals.some((signal) => signal.slot === slot && signal.source === 'note')) {
          draft.run.residents.signals.push({ slot, depth: currentStop(draft.run).depth, source: 'note', n: 1 });
          signals.push(signalCount(draft.run));
        }
      } else if (seg?.type === 'leftover' && seg.card !== null) {
        Object.assign(seg, leftoverWords(seg.card));
        read.push(seg.id);
      }
    }
    draft.ui.memoryRev++;
  });
  for (const count of signals) emit('signal-found', { slot, count });
  for (const segId of read) emit('leftover-read', { segId });
}

function tick(store: Store<GameState>): void {
  const state = store.getState();
  if (state.resident.left === null) {
    scanned = [];
    return;
  }
  if (leftoversInMemory(state.memory).some((seg) => seg.card === null)) rollLeftoverCards(store);
  if (scanned.length > 0) readScans(store);
}

let mounted = false;

// Mounted by systems/residents.ts mountResidents (after the corrupted resident's module). Its post tick rolls the cards at the
// boot and acts on the SCANs heard since. Returns the unmount.
export function mountResidentLeft(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountResidentLeft: already mounted');
  mounted = true;
  const offScan = on('scanned', ({ segId }) => {
    if (segId === RESIDENT_SEG_IDS.note || LEFTOVER_IDS.includes(segId)) scanned.push(segId);
  });
  const offTick = onPostTick(() => tick(store));
  const offReset = onWorldReset('resident-left', resetLeft, () => ({ scanned }));
  return () => {
    offScan();
    offTick();
    offReset();
    resetLeft();
    mounted = false;
  };
}

// Why the active tool can't be used on a note or a leftover (plan §2.8: SCAN, REPAIR and MOVE on a leftover, to protect it;
// DELETE and COPY refused with the log's words; the note takes SCAN only), or null when the kind allows it: the tools' own
// rules then still apply (REPAIR's charge, ALREADY 100%, an infection). tool-targets.ts asks it through residents.ts
// residentToolRule. SWAP on neither (no backup).
export function leftToolRule(seg: Readonly<NoteSegment | LeftoverSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  const tool = ctx.activeKind;
  if (tool === 'scan') return null;
  if (tool === 'swap') return TOOL_REFUSAL.swapShipOnly;
  if (tool === 'delete') return TOOL_REFUSAL.logDelete;
  if (tool === 'copy') return TOOL_REFUSAL.logCopy;
  if (seg.type === 'note') return tool === 'move' ? TOOL_REFUSAL.noteMove : TOOL_REFUSAL.logRepair;
  return null;
}

// The ship is ending (systems/residents.ts residentShipEnd): how many leftovers HOLLOW ate (the record's leftoversEaten).
export function leftShipEnd(store: Store<GameState>): { fate: 'left'; leftoversEaten: number } {
  resetLeft();
  return { fate: 'left', leftoversEaten: LEFTOVER_COUNT - leftoversInMemory(store.getState().memory).length };
}

// The leftovers' cards (plan R14): two pool cards from draftCards(draftContext(the unit as it boots), shipRng(run, slot,
// 'leftovers')), then the skill card (its skill is chosen at the PACKET), written onto the leftovers in that order. Called at
// the boot's first tick; throws on a ship whose resident did not leave.
export function rollLeftoverCards(store: Store<GameState>): void {
  const state = store.getState();
  if (state.resident.def?.kind !== 'left') throw new Error('rollLeftoverCards: this ship\'s resident did not leave');
  const pool = draftCards(draftContext(state), shipRng(state.run, currentSlot(state.run), 'leftovers'));
  if (pool.length < LEFTOVER_COUNT - 1) throw new Error(`rollLeftoverCards: the pool dealt ${pool.length} cards for ${LEFTOVER_COUNT - 1} leftovers`);
  store.update((draft) => {
    LEFTOVER_IDS.forEach((_, index) => {
      const seg = leftoverAt(draft.memory, index);
      if (seg === null) return;
      seg.card = index === LEFTOVER_COUNT - 1 ? { kind: 'skill' } : { kind: 'pool', id: pool[index]!.id };
    });
    draft.ui.memoryRev++;
  });
}
