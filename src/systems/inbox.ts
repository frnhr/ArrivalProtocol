import type { Store } from '@state/store';
import type { GameState, RunState } from '@state/schema';
import type { InboxMessage } from '@/types/inbox';

// The INBOX (05-story §3.3–§3.5, §4; slice-3b-plan §2.4): messages are DERIVED, never queued. inboxMessages builds them
// from the route, run.ships (colony, landed, featured), the map, 046's written trail and the lineage, up to the current
// stop, with systems/delivery-rule.ts lightArrival (one light rule: a message sent from P in year T is read at the first
// route stop X after the sending stop with A(X) ≥ T + |P − X|). Stored state is only run.inbox.read and
// run.log.toldReading, which 3c saves. The arm only: the classic world has no mail.
// CYCLE GUARD (plan §5.4): this module never imports data/script.ts or systems/arrival-preview.ts, directly or through
// another module (script.ts's boot plan reads newMessagesAtBoot).
// Track UI owns this file after the foundation; inboxMessages returns empty until then (`TODO(3b-UI)`).

// Every message the unit has received so far this run, oldest boot first.
export function inboxMessages(state: Readonly<GameState>): InboxMessage[] {
  if (state.run.map.world !== 'arm') return [];
  return []; // TODO(3b-UI): the welcome, policy, arm-complete, replies, postcards, letters and no-address mail (plan §2.4).
}

// The messages this boot brings (the boot's `> n NEW MESSAGES · INBOX` line): those read at the current depth.
export function newMessagesAtBoot(state: Readonly<GameState>): InboxMessage[] {
  const depth = state.run.shipIndex + 1;
  return inboxMessages(state).filter((message) => message.readAtDepth === depth);
}

// The messages received and not yet opened (the dock's and the desk tab's `INBOX n` badge; unread in bold).
export function inboxUnread(state: Readonly<GameState>): InboxMessage[] {
  return inboxMessages(state).filter((message) => !state.run.inbox.read.includes(message.id));
}

// The kid opened message `id` in the reader. Opening one twice changes nothing; an id the INBOX does not hold is a bug in
// the view, so it throws.
export function markMessageRead(store: Store<GameState>, id: string): void {
  const state = store.getState();
  if (!inboxMessages(state).some((message) => message.id === id)) throw new Error(`markMessageRead: no message '${id}' in the INBOX`);
  if (state.run.inbox.read.includes(id)) return;
  store.update((draft) => { draft.run.inbox.read.push(id); });
}

// A letter to the unit ahead (05 §3.3): a colony of the last unit's route writing to it at colony year 1. 3c's archive v2
// fills these (`FOR UNIT-047`); on run 1 the seam gives 046's MERIDIAN (Marrow, landed 2350).
export interface LetterSource {
  id: string;                 // the message id: 'letter:meridian', 'letter:<worldSlot>'
  colony: string;
  worldSlot: number;
  landedYear: number;
  toUnit: number;
}

// The seam 3c fills from archive v2 (plan §2.6).
export function letterSources(run: Readonly<RunState>): LetterSource[] {
  void run;
  return []; // TODO(3b-UI): run 1's MERIDIAN letter to 046; 3c adds the last unit's colonies.
}
