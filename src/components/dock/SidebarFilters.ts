import type { Store } from '@state/store';
import type { GameState, FilterKey, StatusKey } from '@state/schema';
import type { Segment } from '@/types/segment';
import { ALL_FILTER_KEYS, categoryOf, countByStatus, matchesStatus } from '@state/sidebar-filters';
import { archiveSealed } from '@state/selectors';
import { requireById } from '@components/dom';

// Owns click handlers on Filter / Status dock items, plus their visual state
// (mark dot + .open class + live counts). State lives in store.ui.filtersOff
// and store.ui.spotlight.
//
// Semantics:
//   - Filter items default ON (all visible). Clicking OFF adds the key to
//     filtersOff → DimPainter dims that category.
//   - Status items default OFF (no spotlight). Clicking ON adds the key to
//     spotlight → DimPainter dims everything NOT matching ANY active spotlight.
//   - Both use the same `.dimmed` mechanic in the strip, just inverted defaults.
export function mountSidebarFilters(store: Store<GameState>): () => void {
  const filterItems = Array.from(
    document.querySelectorAll<HTMLElement>('.dock-item[data-filter]'),
  );
  const statusItems = Array.from(
    document.querySelectorAll<HTMLElement>('.dock-item[data-status]'),
  );

  type ItemHandlers = [HTMLElement, string, EventListener];
  const handlers: ItemHandlers[] = [];

  // Hover preview state: which predicate is currently being previewed (if any).
  // Stored so we can reapply the `.hl-preview` class after MemoryStrip rebuilds
  // the DOM (e.g. when a player triggers an action while still hovering an item).
  let hoverPredicate: ((seg: Segment) => boolean) | null = null;

  function applyHighlight(predicate: (seg: Segment) => boolean): void {
    const memory = store.getState().memory;
    const ids = new Set<string>();
    for (const seg of memory) if (predicate(seg)) ids.add(seg.id);
    document.querySelectorAll<HTMLElement>('.seg').forEach((part) => {
      const id = part.dataset.id;
      if (id && ids.has(id)) part.classList.add('hl-preview');
    });
  }

  function clearHighlight(): void {
    document
      .querySelectorAll('.seg.hl-preview')
      .forEach((part) => part.classList.remove('hl-preview'));
  }

  function bindItem(item: HTMLElement, predicate: (seg: Segment) => boolean, onClick: () => void): void {
    const enter: EventListener = () => {
      hoverPredicate = predicate;
      applyHighlight(predicate);
    };
    const leave: EventListener = () => {
      hoverPredicate = null;
      clearHighlight();
    };
    const click: EventListener = () => onClick();
    item.addEventListener('mouseenter', enter);
    item.addEventListener('mouseleave', leave);
    item.addEventListener('click', click);
    handlers.push([item, 'mouseenter', enter], [item, 'mouseleave', leave], [item, 'click', click]);
  }

  filterItems.forEach((item) => {
    const key = item.dataset.filter as FilterKey | undefined;
    if (!key) return;
    bindItem(item, (seg) => categoryOf(seg) === key, () => {
      // Photoshop-style solo behavior on Filters:
      //   - Clicking when ALL are on → solo the clicked one (others off)
      //   - Clicking the LAST active one → un-solo (everything back on)
      //   - Otherwise: plain toggle
      // Array reference is replaced (not mutated in place) so default-Object.is
      // subscribers see a real change and fire.
      store.update((draft) => {
        const off = draft.ui.filtersOff;
        const clickedIsOn = !off.includes(key);
        const activeCount = ALL_FILTER_KEYS.length - off.length;

        if (clickedIsOn && activeCount === ALL_FILTER_KEYS.length) {
          // All on → solo: everything except `key` goes off.
          draft.ui.filtersOff = ALL_FILTER_KEYS.filter((k) => k !== key);
        } else if (clickedIsOn && activeCount === 1) {
          // Last active → un-solo: everything back on.
          draft.ui.filtersOff = [];
        } else {
          // Plain toggle.
          draft.ui.filtersOff = clickedIsOn
            ? [...off, key]
            : off.filter((k) => k !== key);
        }

        // Filter interaction takes over: clear any active spotlight so the
        // strip reflects the filter selection alone.
        if (draft.ui.spotlight.length > 0) draft.ui.spotlight = [];
      });
    });
  });

  statusItems.forEach((item) => {
    const key = item.dataset.status as StatusKey | undefined;
    if (!key) return;
    bindItem(item, (seg) => matchesStatus(seg, key), () => {
      store.update((draft) => {
        draft.ui.spotlight = draft.ui.spotlight.includes(key)
          ? draft.ui.spotlight.filter((k) => k !== key)
          : [...draft.ui.spotlight, key];
      });
    });
  });

  // When a Status spotlight is active it visually dims everything that doesn't
  // match — overriding the Filter state. Reflect that on the Filter buttons by
  // showing them all as off. Underlying ui.filtersOff isn't touched, so the
  // user's filter selection restores once the spotlight is cleared.
  function paintFilters(filtersOff: readonly FilterKey[], spotlight: readonly StatusKey[]): void {
    const spotlightActive = spotlight.length > 0;
    filterItems.forEach((item) => {
      const key = item.dataset.filter as FilterKey | undefined;
      if (!key) return;
      const on = !spotlightActive && !filtersOff.includes(key);
      item.classList.toggle('open', on);
      const mark = item.querySelector('.mark');
      if (mark) mark.textContent = on ? '●' : '○';
    });
  }

  function paintSpotlight(spotlight: readonly StatusKey[]): void {
    statusItems.forEach((item) => {
      const key = item.dataset.status as StatusKey | undefined;
      if (!key) return;
      const on = spotlight.includes(key);
      item.classList.toggle('open', on);
      const mark = item.querySelector('.mark');
      if (mark) mark.textContent = on ? '●' : '○';
    });
  }

  // CORRUPT and PARTIAL are status bands (adjectives: `1 Corrupt`, `3 Partial`); BACKUP counts files, so it takes a
  // plural (final review: the dock read `1 Backups`).
  const corruptEl = requireById('countCorrupt');
  const partialEl = requireById('countPartial');
  const backupEl = requireById('countBackup');
  const backupWordEl = requireById('countBackupWord');
  function paintCounts(state: GameState): void {
    const counts = countByStatus(state.memory);
    corruptEl.textContent = String(counts.corrupt);
    partialEl.textContent = String(counts.partial);
    backupEl.textContent = String(counts.backup);
    backupWordEl.textContent = counts.backup === 1 ? 'Backup' : 'Backups';

    // Warn-color the row when the count is non-zero and the status is bad.
    statusItems.forEach((item) => {
      const key = item.dataset.status as StatusKey | undefined;
      if (!key) return;
      const count = counts[key];
      if (key === 'corrupt' || key === 'partial') {
        item.classList.toggle('warn', count > 0);
      }
    });
  }

  // The Souls filter appears with the colonists (WP5): before the STASIS reveal it would give the
  // secret away in the dock.
  const soulsItem = filterItems.find((item) => item.dataset.filter === 'souls');
  if (!soulsItem) throw new Error('.dock-item[data-filter="souls"] missing from index.html');
  const paintSoulsItem = (state: Readonly<GameState>): void => { soulsItem.hidden = archiveSealed(state); };

  paintFilters(store.getState().ui.filtersOff, store.getState().ui.spotlight);
  paintSpotlight(store.getState().ui.spotlight);
  paintCounts(store.getState());
  paintSoulsItem(store.getState());

  const unsubFilters = store.subscribe(
    (s) => s.ui.filtersOff,
    (filtersOff) => paintFilters(filtersOff, store.getState().ui.spotlight),
  );
  // Spotlight changes affect both spotlight buttons AND filter buttons
  // (filters render as off while spotlight is active).
  const unsubSpotlight = store.subscribe(
    (s) => s.ui.spotlight,
    (spotlight) => {
      paintSpotlight(spotlight);
      paintFilters(store.getState().ui.filtersOff, spotlight);
    },
  );
  // Counts depend on memory contents (state changes via scan/repair etc.).
  // Memory mutates in place + memoryRev bumps on every action — subscribe to
  // memoryRev so this fires only when memory shape/state actually changes.
  // Also re-apply hover highlight here: if the strip rebuilt while the user
  // was hovering a sidebar item, the .hl-preview class was wiped.
  const unsubCounts = store.subscribe(
    (s) => s.ui.memoryRev,
    () => {
      paintCounts(store.getState());
      paintSoulsItem(store.getState());
      if (hoverPredicate) applyHighlight(hoverPredicate);
    },
  );

  return () => {
    handlers.forEach(([item, type, fn]) => item.removeEventListener(type, fn));
    unsubFilters();
    unsubSpotlight();
    unsubCounts();
  };
}
