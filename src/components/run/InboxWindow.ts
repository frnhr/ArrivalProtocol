import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on } from '@systems/events';
import { inboxUnread } from '@systems/inbox';
import { requireById, requireIn } from '@components/dom';
import { mountInboxView } from '@components/desk/InboxView';
import { INBOX_TEXT } from '@data/inbox-text';

// The INBOX in flight (05-story §3.3, §4; slice-3b-plan §1.1 item 17): an amber window from the dock's SYSTEM section
// (ToolsTabs' `inbox` entry), closed at first, hosting the same view as the desk's INBOX tab (components/desk/InboxView.ts):
// mail arrives at the boot and is read in flight and between ships. The dock item reads `INBOX n` while n messages are
// unread, and pulses from the boot's `> n NEW MESSAGES · INBOX` line ('inbox-new': the chime is audio-cues') until the
// window is opened. Mail never blocks anything: the window is only ever opened by the kid.

const DOCK_WORD = 'Inbox';

export function mountInboxWindow(store: Store<GameState>): () => void {
  const win = requireById('inboxWin');
  const body = requireById('inboxBody');
  const dockItem = requireIn<HTMLElement>(document, '.dock-item[data-tool="inbox"]', '.dock-item[data-tool="inbox"]');
  const label = requireById('inboxDockLabel');
  const view = mountInboxView(store, 'flight');
  body.appendChild(view.root);

  function paint(): void {
    const state = store.getState();
    const unread = inboxUnread(state).length;
    label.textContent = unread > 0 ? INBOX_TEXT.window.badge(unread) : DOCK_WORD;
    dockItem.classList.toggle('has-mail', unread > 0);
    // The pulse ends once the window is open (ToolsTabs marks the dock item open, on desktop and as a tab), or the mail
    // is all read.
    // (Removed only when present: the class observer below would otherwise see every paint as a change.)
    if ((dockItem.classList.contains('open') || unread === 0) && dockItem.classList.contains('fresh-mail')) dockItem.classList.remove('fresh-mail');
    if (!win.hidden) view.paint();
  }

  const offNew = on('inbox-new', () => {
    if (!dockItem.classList.contains('open')) dockItem.classList.add('fresh-mail');
    paint();
  });
  // The mail grows with the route and the ships; the marks with the reader (here or at the desk); a new world resets both.
  const unsub = store.subscribe(
    (s) => `${s.run.rev}|${s.run.map.route.length}|${s.run.ships.length}|${s.run.inbox.read.length}`,
    paint,
  );
  // Opened (the dock, or a tab on a phone): painted at once, between ships too.
  const shown = new MutationObserver(paint);
  shown.observe(win, { attributes: true, attributeFilter: ['hidden'] });
  const dockOpen = new MutationObserver(paint);
  dockOpen.observe(dockItem, { attributes: true, attributeFilter: ['class'] });
  paint();

  return () => {
    offNew();
    unsub();
    shown.disconnect();
    dockOpen.disconnect();
    view.destroy();
  };
}
