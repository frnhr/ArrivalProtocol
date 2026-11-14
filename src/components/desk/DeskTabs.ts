// Playtest 1: Track B-DESK owns this file (docs/phase3/impl/playtest-1-plan.md §3.6, §4 Batch B). Others ask by message.
import type { DeskWindowId } from '@/types/map';
import type { DeskTabBadges } from '@systems/desk';
import { make } from '@components/dom';
import { REPO_TEXT } from '@data/repo-text';

// The desk's tabs (02-map §3.10, §4; slice-3b-plan §5.2 item 1): CARD / REPOSITORY [R] / INBOX [I] in the right window's
// title bar, the open one lit, each with its badge (the INBOX's unread count). Playtest 1 (B-DESK, §3.6): TRAINING is the
// REPOSITORY's lower half now (COMPILE HERE), so its tab is gone and `ui.deskWindow === 'training'` lights the REPOSITORY
// (the alias the save codec and run.ts deskUiOnOpen keep). The REPOSITORY carries both halves' badges: the request (`Mv`,
// or `:)` while CONTROL recommends a file), then the unspent cycles (`5 CYCLES`), which pulse while the tab is closed
// (03 §4). On a phone the same bar is the bottom sheet's handle. A click names the tab in data-tab ('card' for the SHIP
// CARD, whose ui.deskWindow is null); DeskScreen owns the clicks and the keys. A label's key (`[R]`) is its own span, so a
// narrow card drops the keys before the names.

export type DeskTab = 'card' | DeskWindowId;

export interface DeskTabsView {
  root: HTMLElement;
  paint: (open: DeskWindowId | null, badges: Readonly<DeskTabBadges>) => void;
}

type ShownTab = 'card' | 'repository' | 'inbox';

const TABS: readonly { id: ShownTab; label: string }[] = [
  { id: 'card', label: REPO_TEXT.desk.tabCard },
  { id: 'repository', label: REPO_TEXT.desk.tabRepository },
  { id: 'inbox', label: REPO_TEXT.desk.tabInbox },
];

const KEY_SUFFIX = /^(.*?)(\s*\[[^\]]+\])?$/;

// The tab a window lights: the COMPILE half is the REPOSITORY's.
export function shownTab(open: DeskWindowId | null): ShownTab {
  return open === null ? 'card' : open === 'training' ? 'repository' : open;
}

function badgeText(id: ShownTab, badges: Readonly<DeskTabBadges>): string | null {
  switch (id) {
    case 'card': return null;
    case 'repository': return badges.repository;
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
    // The REPOSITORY's second badge: the cycles COMPILE HERE has to spend.
    const cycles = tab.id === 'repository' ? make('span', 'desk-tab-badge desk-tab-cycles') : null;
    if (cycles !== null) { cycles.hidden = true; button.appendChild(cycles); }
    root.appendChild(button);
    return { id: tab.id, button, badge, cycles };
  });
  return {
    root,
    paint: (open, badges) => {
      const on = shownTab(open);
      for (const { id, button, badge, cycles } of buttons) {
        button.classList.toggle('on', on === id);
        const text = badgeText(id, badges);
        badge.hidden = text === null;
        badge.textContent = text ?? '';
        const cycleText = cycles === null ? null : badges.training;
        if (cycles !== null) {
          cycles.hidden = cycleText === null;
          cycles.textContent = cycleText ?? '';
        }
        button.classList.toggle('has-badge', text !== null || cycleText !== null);
        // The cycles badge pulses while they are unspent and the REPOSITORY is closed (03 §4).
        button.classList.toggle('pulse', cycleText !== null && on !== id);
      }
    },
  };
}
