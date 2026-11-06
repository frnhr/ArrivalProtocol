// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2): TRAINING [T]. Others ask by message.
import type { DeskWindowId } from '@/types/map';
import type { DeskTabBadges } from '@systems/desk';
import { make } from '@components/dom';
import { REPO_TEXT } from '@data/repo-text';
import { TRAINING_TEXT } from '@data/training-text';

// The desk's tabs (02-map §3.10, §4; slice-3b-plan §5.2 item 1): CARD / REPOSITORY [R] / TRAINING [T] / INBOX [I] in the
// right window's title bar, the open one lit, each with its badge (the REPOSITORY's request or `:)`, TRAINING's unspent
// cycles, pulsing while there are any (03 §4), the INBOX's unread count). On a phone the same bar is the bottom sheet's
// handle, so the windows are tabs inside the sheet. A click names the tab in data-tab ('card' for the SHIP CARD, whose
// ui.deskWindow is null); DeskScreen owns the clicks and the keys. A label's key (`[R]`) is its own span, so a narrow
// card drops the keys before the names.

export type DeskTab = 'card' | DeskWindowId;

export interface DeskTabsView {
  root: HTMLElement;
  // `arm`: the REPOSITORY, TRAINING and INBOX tabs exist on the arm only (the review's nit: the classic world has none of
  // them, so its card keeps the CARD tab alone as its title).
  paint: (open: DeskWindowId | null, badges: Readonly<DeskTabBadges>, arm: boolean) => void;
}

const TABS: readonly { id: DeskTab; label: string }[] = [
  { id: 'card', label: REPO_TEXT.desk.tabCard },
  { id: 'repository', label: REPO_TEXT.desk.tabRepository },
  { id: 'training', label: TRAINING_TEXT.tab },
  { id: 'inbox', label: REPO_TEXT.desk.tabInbox },
];

const KEY_SUFFIX = /^(.*?)(\s*\[[^\]]+\])?$/;

function badgeText(id: DeskTab, badges: Readonly<DeskTabBadges>): string | null {
  switch (id) {
    case 'card': return null;
    case 'repository': return badges.repository;
    case 'training': return badges.training;
    case 'inbox': return badges.inbox;
  }
}

export function buildDeskTabs(): DeskTabsView {
  const root = make('div', 'desk-tabs');
  const buttons = TABS.map((tab) => {
    const button = make('button', 'desk-tab');
    button.tabIndex = -1;
    button.dataset.tab = tab.id;
    const badge = make('span', 'desk-tab-badge');
    badge.hidden = true;
    const [, name = tab.label, key = ''] = KEY_SUFFIX.exec(tab.label) ?? [];
    const label = make('span', 'desk-tab-label', name);
    if (key !== '') label.appendChild(make('span', 'desk-tab-key', key));
    button.append(label, badge);
    root.appendChild(button);
    return { id: tab.id, button, badge };
  });
  return {
    root,
    paint: (open, badges, arm) => {
      for (const { id, button, badge } of buttons) {
        button.hidden = id !== 'card' && !arm;
        button.classList.toggle('on', (open ?? 'card') === id);
        const text = badgeText(id, badges);
        badge.hidden = text === null;
        badge.textContent = text ?? '';
        button.classList.toggle('has-badge', text !== null);
        // TRAINING's badge pulses while cycles are unspent and the tab is closed (03 §4).
        button.classList.toggle('pulse', id === 'training' && text !== null && open !== 'training');
      }
    },
  };
}
