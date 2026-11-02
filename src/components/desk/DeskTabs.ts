// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { DeskWindowId } from '@/types/map';
import type { DeskTabBadges } from '@systems/desk';
import { make } from '@components/dom';
import { REPO_TEXT } from '@data/repo-text';

// The desk's tabs (02-map §3.10, §4; slice-3b-plan §5.2 item 1): CARD / REPOSITORY [R] / INBOX [I] in the right
// window's title bar, the open one lit, each with its badge (the REPOSITORY's request or `:)`, the INBOX's unread count).
// On a phone the same bar is the bottom sheet's handle, so the windows are tabs inside the sheet. A click names the tab
// in data-tab ('card' for the SHIP CARD, whose ui.deskWindow is null); DeskScreen owns the clicks and the keys.

export type DeskTab = 'card' | Exclude<DeskWindowId, 'training'>;

export interface DeskTabsView {
  root: HTMLElement;
  // `arm`: the REPOSITORY and INBOX tabs exist on the arm only (the review's nit: the classic world has neither, so its
  // card keeps the CARD tab alone as its title).
  paint: (open: DeskWindowId | null, badges: Readonly<DeskTabBadges>, arm: boolean) => void;
}

const TABS: readonly { id: DeskTab; label: string }[] = [
  { id: 'card', label: REPO_TEXT.desk.tabCard },
  { id: 'repository', label: REPO_TEXT.desk.tabRepository },
  { id: 'inbox', label: REPO_TEXT.desk.tabInbox },
];

export function buildDeskTabs(): DeskTabsView {
  const root = make('div', 'desk-tabs');
  const buttons = TABS.map((tab) => {
    const button = make('button', 'desk-tab');
    button.tabIndex = -1;
    button.dataset.tab = tab.id;
    const badge = make('span', 'desk-tab-badge');
    badge.hidden = true;
    button.append(make('span', 'desk-tab-label', tab.label), badge);
    root.appendChild(button);
    return { id: tab.id, button, badge };
  });
  return {
    root,
    paint: (open, badges, arm) => {
      for (const { id, button, badge } of buttons) {
        button.hidden = id !== 'card' && !arm;
        button.classList.toggle('on', (open ?? 'card') === id);
        const text = id === 'repository' ? badges.repository : id === 'inbox' ? badges.inbox : null;
        badge.hidden = text === null;
        badge.textContent = text ?? '';
        button.classList.toggle('has-badge', text !== null);
      }
    },
  };
}
