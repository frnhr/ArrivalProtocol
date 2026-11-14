import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';

// Maps a tool id (matches dock-item[data-tool=…]) to the window selector in the tools view. Every window on the
// amber desk has an entry and a dock item (§9 WP12 item 3): on a phone the dock is the only way to reach a window.
// Each selector is one class, so a window's id can be read back from its class list (`toolIdOfWindow`).
export const TOOL_WINDOWS: Readonly<Record<string, string>> = {
  telemetry: '.telemetry-win',
  engine: '.engine-win',
  navplot: '.navplot-win',
  comms: '.comms-win',
  // WP8: the cards this unit carries (SkillsWindow).
  skills: '.skills-win',
  // Slice 1a: the POD BAY, while landing (PodBayWindow; its dock item shows only then, body.landing).
  podbay: '.podbay-win',
  // Slice 3b: the INBOX (InboxWindow), read in flight and between ships.
  inbox: '.inbox-win',
  // Slice 6 SITES: a POOR planet's sites (SitesWindow); its dock item and window are survey-only (styles/survey.css).
  sites: '.sites-win',
};
const TAB_WINDOWS = TOOL_WINDOWS;

// The tab a phone opens on: the NAV PLOT, where the line goes green (the touch flight bar sits under it).
export const DEFAULT_TAB = 'navplot';

// The tool id of a window, read from its class list (`navplot-win` → `navplot`), or null for an element that is no tool
// window. The title bar's × finds the window it closes this way (playtest 1 note 14, §3.9).
export function toolIdOfWindow(classes: Iterable<string>): string | null {
  const list = [...classes];
  for (const [id, selector] of Object.entries(TOOL_WINDOWS)) {
    if (list.includes(selector.slice(1))) return id;
  }
  return null;
}

// Which windows are open: on the desk the set the kid opened (`open`), on a phone the one tab (`activeTab`). Pure, so the
// headless suites can close every window by its × without a DOM (tests/unit/ui/window-close.test.ts).
export interface ToolDesk { readonly open: ReadonlySet<string>; readonly activeTab: string; }

// A window's ×, and code that shuts a window: it leaves the desk, and a phone showing it goes back to the NAV PLOT.
export function closeInDesk(desk: ToolDesk, id: string): ToolDesk {
  if (!(id in TOOL_WINDOWS)) throw new Error(`closeInDesk: no window '${id}'`);
  const open = new Set(desk.open);
  open.delete(id);
  return { open, activeTab: desk.activeTab === id ? DEFAULT_TAB : desk.activeTab };
}

// Code that opens a window: it joins the desk (never toggled shut), and takes the phone's tab only with `onPhone`.
export function openInDesk(desk: ToolDesk, id: string, onPhone: boolean): ToolDesk {
  if (!(id in TOOL_WINDOWS)) throw new Error(`openInDesk: no window '${id}'`);
  const open = new Set(desk.open);
  open.add(id);
  return { open, activeTab: onPhone ? id : desk.activeTab };
}

// A dock item clicked on the desk: it opens and closes its own window.
export function toggleInDesk(desk: ToolDesk, id: string): ToolDesk {
  return desk.open.has(id) ? closeInDesk(desk, id) : openInDesk(desk, id, false);
}

// Closes one window as if its dock item were clicked shut (desktop), or goes back to the default tab if it is the phone's
// tab (slice 3b review m4: the INBOX opened in flight stayed open over the NAV PLOT on every later ship, because nothing
// but a click ever took it out of the open set). A window's × calls it too. Set while mounted.
let closeWindow: ((id: string) => void) | null = null;

export function closeToolWindow(id: string): void {
  if (!closeWindow) throw new Error('closeToolWindow: the tools tabs are not mounted');
  closeWindow(id);
}

// Slice 6 (review M6, SITES_AUTO_OPEN): opens one window from code. On the desktop it joins the open windows (an open one stays
// open, never toggled shut); on a phone it takes the tab only with `onPhone` (the boot keeps the NAV PLOT's tab by default).
// Set while mounted.
let openWindow: ((id: string, onPhone: boolean) => void) | null = null;

export function openToolWindow(id: string, opts: Readonly<{ onPhone?: boolean }> = {}): void {
  if (!openWindow) throw new Error('openToolWindow: the tools tabs are not mounted');
  openWindow(id, opts.onPhone ?? false);
}

// On mobile, the bottom dock's tool items double as a tab bar: at most one window is visible at a time, and clicking
// an item switches to it. On desktop, dock items are independent open/close toggles that hide/show their panel.
// The two meanings of a dock item's `open` mark live apart: which windows are open on the desk is kept in
// `desk.open`, so a trip across the breakpoint (a phone turned, a window resized) and back leaves the desk as the kid
// had it, instead of only the last tab (WP2 verify, deferred to WP12): the same windows open, and a window the kid had
// dragged back where it was (its inline position is put aside while it is a tab, WP12 review).
export function mountToolsTabs(): () => void {
  const toolsView = document.querySelector<HTMLElement>('.desktop > .tools-view');
  if (!toolsView) throw new Error('.desktop > .tools-view missing from index.html');
  const dock = document.querySelector<HTMLElement>('.dock-content.tools-view');
  if (!dock) throw new Error('.dock-content.tools-view missing from index.html');

  const windowOf = (id: string): HTMLElement => {
    const selector = TAB_WINDOWS[id];
    if (!selector) throw new Error(`ToolsTabs: no window for the dock item '${id}'`);
    const win = toolsView.querySelector<HTMLElement>(`:scope > ${selector}`);
    if (!win) throw new Error(`ToolsTabs: ${selector} missing from the tools view`);
    return win;
  };

  const toolItems = Array.from(dock.querySelectorAll<HTMLElement>('.dock-item[data-tool]'));
  const itemIds = toolItems.map((item) => item.dataset.tool ?? '');
  // Every dock item names a window, every window has a dock item: a window without one is unreachable on a phone.
  itemIds.forEach(windowOf);
  for (const id of Object.keys(TAB_WINDOWS)) {
    if (!itemIds.includes(id)) throw new Error(`ToolsTabs: the ${TAB_WINDOWS[id]} window has no dock item`);
  }
  toolsView.querySelectorAll<HTMLElement>(':scope > .window').forEach((win) => {
    if (!Object.values(TAB_WINDOWS).some((selector) => win.matches(selector))) {
      throw new Error(`ToolsTabs: the window .${[...win.classList].join('.')} has no TAB_WINDOWS entry`);
    }
  });

  const setMark = (item: HTMLElement, open: boolean): void => {
    item.classList.toggle('open', open);
    const mark = item.querySelector('.mark');
    if (mark) mark.textContent = open ? '●' : '○';
  };

  // The desk as index.html opens it (the dock items marked open), then as the kid opens and closes windows.
  let desk: ToolDesk = {
    open: new Set(toolItems.filter((item) => item.classList.contains('open')).map((item) => item.dataset.tool ?? '')),
    activeTab: DEFAULT_TAB,
  };

  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);

  // Where a dragged window sat on the desk (Window.ts writes these inline), kept while it is a tab.
  const DRAG_PROPS = ['position', 'left', 'top', 'right'] as const;
  const deskSpots = new Map<HTMLElement, Record<(typeof DRAG_PROPS)[number], string>>();

  const renderDesktop = (): void => {
    toolsView.classList.remove('tools-tabs-mode');
    toolItems.forEach((item) => {
      const id = item.dataset.tool ?? '';
      const open = desk.open.has(id);
      setMark(item, open);
      const win = windowOf(id);
      win.hidden = !open;
      win.classList.remove('tools-tab-panel');
      const spot = deskSpots.get(win);
      if (spot) for (const prop of DRAG_PROPS) win.style[prop] = spot[prop];
      deskSpots.delete(win);
    });
  };

  const renderMobile = (): void => {
    toolsView.classList.add('tools-tabs-mode');
    toolsView.dataset.activeTool = desk.activeTab;
    toolItems.forEach((item) => {
      const id = item.dataset.tool ?? '';
      setMark(item, id === desk.activeTab);
      const win = windowOf(id);
      win.classList.add('tools-tab-panel');
      win.hidden = id !== desk.activeTab;
      // As a tab a window flows with the rest; a spot it was dragged to on the desk is put aside for the way back.
      if (DRAG_PROPS.some((prop) => win.style[prop] !== '')) {
        deskSpots.set(win, { position: win.style.position, left: win.style.left, top: win.style.top, right: win.style.right });
      }
      for (const prop of DRAG_PROPS) win.style[prop] = '';
    });
  };

  const sync = (): void => {
    if (mq.matches) renderMobile();
    else renderDesktop();
  };

  const onClick = (event: Event): void => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('.dock-item[data-tool]');
    if (!target || !dock.contains(target)) return;
    const id = target.dataset.tool ?? '';
    event.stopPropagation();
    if (mq.matches) {
      desk = { open: desk.open, activeTab: id };
      renderMobile();
      return;
    }
    // Desktop: the item opens and closes its own window.
    // Only that window changes: the others keep where the kid dragged them.
    if (target.classList.contains('warn')) return;
    desk = toggleInDesk(desk, id);
    const open = desk.open.has(id);
    setMark(target, open);
    windowOf(id).hidden = !open;
  };

  // A window's × (playtest 1 note 14): before it, no code listened to the title bar's controls, so only the dock item
  // closed a window. One delegated listener serves every tool window, the ones index.html has and any added later.
  const onCloseClick = (event: Event): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('.win-close');
    if (!button || !toolsView.contains(button)) return;
    const win = button.closest<HTMLElement>('.window');
    const id = win ? toolIdOfWindow(win.classList) : null;
    if (id === null) throw new Error('ToolsTabs: a .win-close sits in no tool window');
    event.stopPropagation();
    closeWindow?.(id);
  };

  dock.addEventListener('click', onClick, true);
  toolsView.addEventListener('click', onCloseClick);
  mq.addEventListener('change', sync);
  sync();
  closeWindow = (id) => {
    windowOf(id);
    desk = closeInDesk(desk, id);
    sync();
  };
  openWindow = (id, onPhone) => {
    windowOf(id);
    desk = openInDesk(desk, id, onPhone);
    sync();
  };

  return () => {
    dock.removeEventListener('click', onClick, true);
    toolsView.removeEventListener('click', onCloseClick);
    mq.removeEventListener('change', sync);
    closeWindow = null;
    openWindow = null;
  };
}
