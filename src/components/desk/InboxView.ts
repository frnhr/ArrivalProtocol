// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { InboxMessage } from '@/types/inbox';
import { inboxMessages, markMessageRead } from '@systems/inbox';
import { make } from '@components/dom';
import { INBOX_TEXT } from '@data/inbox-text';

// The INBOX (05-story §3.3, §4; slice-3b-plan §1.1 item 17): one view, two hosts (the desk's INBOX tab,
// components/desk/DeskScreen.ts, and the flight dock window, components/run/InboxWindow.ts). Uplink's mail in amber: a
// list above a reader. The list has FROM, SUBJECT and RECEIVED, the newest boot first, unread in bold; a click opens a
// message in the reader (and marks it read: systems/inbox.ts markMessageRead) with its two stamps, `SENT 2522 · RECEIVED
// 2651` (the gap is light travel), its tag (`FOR UNIT-046`) and its body. Mail with no address is in HOLLOW's pink with a
// light glitch (reduced motion: a steady dim, game.css). Built from systems/inbox.ts inboxMessages only; the classic world
// has no mail. The host repaints it when the mail or the read marks change (paint()).

export interface InboxView {
  root: HTMLElement;
  paint: () => void;
  // Open message `id` (the host's keys, the debug helper), or the list only (null).
  open: (id: string | null) => void;
  destroy: () => void;
}

const TONE_CLASS: Readonly<Record<InboxMessage['tone'], string>> = { control: 'tone-control', colony: 'tone-colony', hollow: 'tone-hollow' };

function rowNode(message: Readonly<InboxMessage>, unread: boolean, open: boolean): HTMLButtonElement {
  const row = make('button', `ib-row ${TONE_CLASS[message.tone]}`);
  row.tabIndex = -1;
  row.dataset.id = message.id;
  row.classList.toggle('unread', unread);
  row.classList.toggle('open', open);
  row.append(
    make('span', 'ib-from', message.from),
    make('span', 'ib-subject', message.subject),
    make('span', 'ib-received', String(message.receivedYear)),
  );
  return row;
}

function readerNode(message: Readonly<InboxMessage>): HTMLElement {
  const reader = make('div', `ib-reader ${TONE_CLASS[message.tone]}`);
  reader.dataset.id = message.id;
  const head = make('div', 'ib-reader-head');
  const from = make('div', 'ib-reader-from');
  from.append(make('span', 'ib-k', INBOX_TEXT.window.from), make('span', 'ib-v', message.from));
  head.append(from, make('div', 'ib-stamps', INBOX_TEXT.window.stamps(message.sentYear, message.receivedYear)));
  const subject = make('div', 'ib-reader-subject');
  subject.append(make('span', 'ib-k', INBOX_TEXT.window.subject), make('span', 'ib-v', message.subject));
  if (message.tag !== null) subject.appendChild(make('span', 'ib-tag', message.tag));
  const body = make('div', 'ib-body');
  for (const line of message.body) body.appendChild(make('div', 'ib-line', line));
  reader.append(head, subject, body);
  return reader;
}

export function mountInboxView(store: Store<GameState>, variant: 'desk' | 'flight'): InboxView {
  const root = make('div', `inbox-view inbox-${variant}`);
  const listHead = make('div', 'ib-head');
  listHead.append(
    make('span', 'ib-from', INBOX_TEXT.window.from),
    make('span', 'ib-subject', INBOX_TEXT.window.subject),
    make('span', 'ib-received', INBOX_TEXT.window.received),
  );
  const list = make('div', 'ib-list');
  const readerHost = make('div', 'ib-reader-host');
  const empty = make('div', 'ib-empty');
  root.append(listHead, list, readerHost, empty);

  let openId: string | null = null;
  // What the list shows now: rebuilt only when this changes (the mail grew, a mark was read, another message opened).
  let shownKey = '';

  function paint(): void {
    const state = store.getState();
    const arm = state.run.map.world === 'arm';
    // Newest boot first: the mail that just came is at the top.
    const messages = [...inboxMessages(state)].reverse();
    const read = state.run.inbox.read;
    if (openId !== null && !messages.some((message) => message.id === openId)) openId = null;
    const key = `${arm}|${messages.map((message) => message.id).join(',')}|${read.join(',')}|${openId ?? ''}`;
    if (key === shownKey) return;
    shownKey = key;
    empty.hidden = messages.length > 0;
    empty.textContent = arm ? INBOX_TEXT.window.empty : INBOX_TEXT.window.classic;
    listHead.hidden = messages.length === 0;
    list.replaceChildren(...messages.map((message) => rowNode(message, !read.includes(message.id), message.id === openId)));
    const message = messages.find((candidate) => candidate.id === openId);
    readerHost.replaceChildren(...(message === undefined ? [] : [readerNode(message)]));
    root.classList.toggle('reading', message !== undefined);
  }

  function open(id: string | null): void {
    openId = id;
    if (id !== null) markMessageRead(store, id);
    paint();
  }

  const onClick = (event: MouseEvent): void => {
    const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('.ib-row');
    const id = row?.dataset.id;
    if (id === undefined) return;
    // (The row is a button: its pointerdown already ticked, systems/input.ts emitUiClicks.)
    event.stopPropagation();
    open(id);
  };
  list.addEventListener('click', onClick);
  paint();

  return {
    root,
    paint,
    open,
    destroy: () => {
      list.removeEventListener('click', onClick);
      root.remove();
    },
  };
}
