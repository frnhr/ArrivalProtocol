// Slice 7d: the `?` ships' and the signal file's stateful part (docs/phase3/impl/slice-7-plan.md §2.1, R39–R41). The pure
// rules are systems/signals.ts's (the lead's); this module plays them:
// • the `▓▓░▓` file's SCAN (R39, R41): the fragments it carries are found once (run.residents.signals, a record with its
//   source and its `n`), the strip's `SIGNAL · n/3` stamp ('signal-found', as a note's), 'signal-event' with the fragments,
//   and the TERMINAL's line;
// • its tool rule: SCAN only (it is not the unit's to delete, copy, move or repair, as 046.log is not);
// • the SHIP CARD of a `?` ship not visited yet (R39): its public schedule (approach, slack, distance, noise, memory, and
//   the unit's own rows: the fit, deliveries, the run), every other row `??? · NO TRANSPONDER`.
// Module state: only the SCANs the bus brought since the last tick (as resident-left.ts), reset with the world.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SignalSegment } from '@/types/segment';
import type { ValidTargetContext } from '@systems/tool-targets';
import type { CardModel, CardRow } from '@systems/desk';
import type { ToolRefusal } from '@data/tool-text';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { say } from '@systems/say';
import { currentSlot, currentStop } from '@systems/map-streams';
import { signalCount, unknownShown } from '@systems/signals';
import { SIGNAL_SEG_ID } from '@data/unknown';
import { UNKNOWN_TEXT } from '@data/unknown-text';
import { TOOL_REFUSAL } from '@data/tool-text';
import { SIGNALS_FOR_CONTACT } from '@data/tuning';

let scanned = false;

function reset(): void {
  scanned = false;
}

// The signal file in memory, or null (none on this ship, or a hit took its block: it is a blocker, never food).
function signalFile(state: Readonly<GameState>): SignalSegment | null {
  const seg = state.memory.find((candidate) => candidate.id === SIGNAL_SEG_ID);
  return seg !== undefined && seg.type === 'signal' ? seg : null;
}

// A SCAN read the file: its fragments are found, once a run on this ship and source.
function readSignal(store: Store<GameState>): void {
  const state = store.getState();
  const file = signalFile(state);
  if (file === null || !file.scanned) return;
  const slot = currentSlot(state.run);
  if (state.run.residents.signals.some((record) => record.slot === slot && record.source === file.source)) return;
  const n = file.fragments;
  store.update((draft) => {
    draft.run.residents.signals.push({ slot, depth: currentStop(draft.run).depth, source: file.source, n });
    const seg = draft.memory.find((candidate) => candidate.id === SIGNAL_SEG_ID);
    if (seg !== undefined && seg.type === 'signal') seg.desc = UNKNOWN_TEXT.signal.read(n);
    draft.ui.memoryRev++;
  });
  const count = signalCount(store.getState().run);
  say('mind-sys', UNKNOWN_TEXT.signal.found(n, count, SIGNALS_FOR_CONTACT));
  emit('signal-found', { slot, count });
  emit('signal-event', { slot, n });
}

function tick(store: Store<GameState>): void {
  if (!scanned) return;
  scanned = false;
  readSignal(store);
}

let mounted = false;

// Mounted by systems/residents.ts mountResidents (the rack-A files' dispatcher), so every harness that mounts the residents
// mounts it. Returns the unmount.
export function mountUnknownEvents(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountUnknownEvents: already mounted');
  mounted = true;
  const offScan = on('scanned', ({ segId }) => {
    if (segId === SIGNAL_SEG_ID) scanned = true;
  });
  const offTick = onPostTick(() => tick(store));
  const offReset = onWorldReset('unknown-events', reset, () => ({ scanned }));
  return () => {
    offScan();
    offTick();
    offReset();
    reset();
    mounted = false;
  };
}

// Why the active tool can't be used on the signal file, or null for SCAN (systems/residents.ts residentToolRule sends it
// here): it is not the unit's, as 046.log is not.
export function signalToolRule(seg: Readonly<SignalSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  void seg;
  switch (ctx.activeKind) {
    case 'scan': return null;
    case 'swap': return TOOL_REFUSAL.swapShipOnly;
    case 'delete': return TOOL_REFUSAL.logDelete;
    case 'copy': return TOOL_REFUSAL.logCopy;
    case 'move': return TOOL_REFUSAL.logMove;
    case 'repair': return TOOL_REFUSAL.logRepair;
  }
}

// --- The `?` card (R39) ----------------------------------------------------------------------------------------------------

// The rows a `?` card keeps whole: its public schedule (memory and the fit against it, the beam and its noise or its range)
// and the unit's own (its deliveries, HOLLOW's boarding verdict on this beam, the only-from-here and the run's count). Every
// other row reads `??? · NO TRANSPONDER`, and the rows whose presence alone would tell (no Swap for an ENGINE FAULT, the no-go
// sites) are dropped.
// Playtest 1 (C-UNROLL): the noise is on the BEAM row now, the no-go zones on the LANDING row ('planet', which a `?` card hides).
const PUBLIC_ROWS: ReadonlySet<CardRow['key']> = new Set<CardRow['key']>(['fit', 'memory', 'beam', 'range', 'deliveries', 'threat', 'only', 'history', 'trail']);
const DROPPED_ROWS: ReadonlySet<CardRow['key']> = new Set<CardRow['key']>(['noswap']);

// The SHIP CARD as a `?` ship not yet visited shows it (systems/desk.ts cardModel passes its model through), else `model`
// as it is.
export function unknownCard(state: Readonly<GameState>, slot: number, model: Readonly<CardModel>, world: string): CardModel {
  if (!unknownShown(state.run, slot)) return model as CardModel;
  const T = UNKNOWN_TEXT.card;
  const rows = model.rows
    .filter((row) => !DROPPED_ROWS.has(row.key))
    .map((row): CardRow => (PUBLIC_ROWS.has(row.key) ? row : { ...row, value: T.noTransponder, tone: 'plain' }));
  return {
    ...model, top: T.top(model.name, world), sub: T.sub(world), colonists: T.colonists, tags: [], rows,
  };
}
