import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';

// Maps a tool id (matches dock-item[data-tool=…]) to the window selector in the tools view. Every window on the
// amber desk has an entry and a dock item (§9 WP12 item 3): on a phone the dock is the only way to reach a window.
const TAB_WINDOWS: Record<string, string> = {
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

// The tab a phone opens on: the NAV PLOT, where the line goes green (the touch flight bar sits under it).
const DEFAULT_TAB = 'navplot';

// Closes one window as if its dock item were clicked shut (desktop), or goes back to the default tab if it is the phone's
// tab (slice 3b review m4: the INBOX opened in flight stayed open over the NAV PLOT on every later ship, because nothing
// but a click ever took it out of `desktopOpen`). Set while mounted.
let closeWindow: ((id: string) => void) | null = null;

export function closeToolWindow(id: string): void {
  if (!closeWindow) throw new Error('closeToolWindow: the tools tabs are not mounted');
  closeWindow(id);
}

// On mobile, the bottom dock's tool items double as a tab bar: at most one window is visible at a time, and clicking
// an item switches to it. On desktop, dock items are independent open/close toggles that hide/show their panel.
// The two meanings of a dock item's `open` mark live apart: which windows are open on the desk is kept in
// `desktopOpen`, so a trip across the breakpoint (a phone turned, a window resized) and back leaves the desk as the kid
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
  const desktopOpen = new Set(toolItems.filter((item) => item.classList.contains('open')).map((item) => item.dataset.tool ?? ''));
  let activeTab = DEFAULT_TAB;

  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);

  // Where a dragged window sat on the desk (Window.ts writes these inline), kept while it is a tab.
  const DRAG_PROPS = ['position', 'left', 'top', 'right'] as const;
  const deskSpots = new Map<HTMLElement, Record<(typeof DRAG_PROPS)[number], string>>();

  const renderDesktop = (): void => {
    toolsView.classList.remove('tools-tabs-mode');
    toolItems.forEach((item) => {
      const id = item.dataset.tool ?? '';
      const open = desktopOpen.has(id);
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
    toolsView.dataset.activeTool = activeTab;
    toolItems.forEach((item) => {
      const id = item.dataset.tool ?? '';
      setMark(item, id === activeTab);
      const win = windowOf(id);
      win.classList.add('tools-tab-panel');
      win.hidden = id !== activeTab;
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
      activeTab = id;
      renderMobile();
      return;
    }
    // Desktop: the item opens and closes its own window.
    // Only that window changes: the others keep where the kid dragged them.
    if (target.classList.contains('warn')) return;
    if (desktopOpen.has(id)) desktopOpen.delete(id);
    else desktopOpen.add(id);
    const open = desktopOpen.has(id);
    setMark(target, open);
    windowOf(id).hidden = !open;
  };

  dock.addEventListener('click', onClick, true);
  mq.addEventListener('change', sync);
  sync();
  closeWindow = (id) => {
    windowOf(id);
    desktopOpen.delete(id);
    if (activeTab === id) activeTab = DEFAULT_TAB;
    sync();
  };

  return () => {
    dock.removeEventListener('click', onClick, true);
    mq.removeEventListener('change', sync);
    closeWindow = null;
  };
}
