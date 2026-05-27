import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';

// Maps a tool id (matches dock-item[data-tool=…]) to the window selector in
// the tools view. Only tools listed here have a real panel; other dock items
// are decorative placeholders for future content.
const TAB_WINDOWS: Record<string, string> = {
  telemetry: '.telemetry-win',
  engine: '.engine-win',
};

// On mobile, the bottom dock's tool items double as a tab bar: at most one
// window is visible at a time, and clicking an item switches to it. On desktop,
// dock items are independent open/close toggles that hide/show their panel.
export function mountToolsTabs(): () => void {
  const toolsView = document.querySelector<HTMLElement>('.desktop > .tools-view');
  const dock = document.querySelector<HTMLElement>('.dock-content.tools-view');
  if (!toolsView || !dock) return () => {};

  const windowOf = (id: string): HTMLElement | null =>
    toolsView.querySelector<HTMLElement>(TAB_WINDOWS[id] ?? '');

  const toolItems = Array.from(
    dock.querySelectorAll<HTMLElement>('.dock-item[data-tool]'),
  );

  const setMark = (item: HTMLElement, open: boolean): void => {
    item.classList.toggle('open', open);
    const mark = item.querySelector('.mark');
    if (mark) mark.textContent = open ? '●' : '○';
  };

  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);

  const renderDesktop = (): void => {
    toolsView.classList.remove('tools-tabs-mode');
    toolItems.forEach((item) => {
      const id = item.dataset.tool;
      if (!id) return;
      const win = windowOf(id);
      if (win) {
        win.hidden = !item.classList.contains('open');
        win.classList.remove('tools-tab-panel');
        win.style.position = '';
        win.style.left = '';
        win.style.top = '';
        win.style.right = '';
      }
    });
  };

  const renderMobile = (activeId: string): void => {
    toolsView.classList.add('tools-tabs-mode');
    toolsView.dataset.activeTool = activeId;
    toolItems.forEach((item) => {
      const id = item.dataset.tool;
      if (!id) return;
      setMark(item, id === activeId);
      const win = windowOf(id);
      if (!win) return;
      win.classList.add('tools-tab-panel');
      win.hidden = id !== activeId;
      win.style.position = '';
      win.style.left = '';
      win.style.top = '';
      win.style.right = '';
    });
  };

  const pickActiveId = (): string => {
    const stored = toolsView.dataset.activeTool;
    if (stored && TAB_WINDOWS[stored]) return stored;
    const firstOpen = toolItems.find((i) => i.classList.contains('open') && i.dataset.tool);
    return firstOpen?.dataset.tool ?? 'telemetry';
  };

  const sync = (): void => {
    if (mq.matches) renderMobile(pickActiveId());
    else renderDesktop();
  };

  const onClick = (e: Event): void => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.dock-item[data-tool]');
    if (!target || !dock.contains(target)) return;
    const id = target.dataset.tool;
    if (!id) return;

    if (mq.matches) {
      if (!TAB_WINDOWS[id]) return;
      e.stopPropagation();
      renderMobile(id);
    }
  };

  dock.addEventListener('click', onClick, true);
  mq.addEventListener('change', sync);
  sync();

  return () => {
    dock.removeEventListener('click', onClick, true);
    mq.removeEventListener('change', sync);
  };
}
