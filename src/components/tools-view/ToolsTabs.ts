const TAB_WINDOWS: Record<string, string> = {
  telemetry: '.telemetry-win',
  engine: '.engine-win',
};

export function mountToolsTabs(): () => void {
  const toolsView = document.querySelector<HTMLElement>('.desktop > .tools-view');
  const tabBar = toolsView?.querySelector<HTMLElement>('.tools-tabs');
  if (!toolsView || !tabBar) return () => {};

  const tabs = Array.from(tabBar.querySelectorAll<HTMLElement>('.tools-tab'));
  const windows = new Map(
    Object.entries(TAB_WINDOWS).map(([id, sel]) => [
      id,
      toolsView.querySelector<HTMLElement>(sel),
    ]),
  );

  const setActive = (id: string): void => {
    toolsView.dataset.activeTool = id;
    tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tool === id);
    });
    windows.forEach((win, winId) => {
      if (win) win.classList.toggle('tools-tab-panel', true);
      if (win) win.hidden = winId !== id;
    });
  };

  const onTabClick = (tab: HTMLElement): void => {
    const id = tab.dataset.tool;
    if (id) setActive(id);
  };

  const handlers: Array<[HTMLElement, () => void]> = tabs.map((tab) => {
    const handler = (): void => onTabClick(tab);
    tab.addEventListener('click', handler);
    return [tab, handler];
  });

  const mq = window.matchMedia('(max-width: 768px)');
  const syncLayout = (): void => {
    const mobile = mq.matches;
    toolsView.classList.toggle('tools-tabs-mode', mobile);
    tabBar.hidden = !mobile;
    windows.forEach((win) => {
      if (!win) return;
      if (mobile) {
        win.style.position = '';
        win.style.left = '';
        win.style.top = '';
        win.style.right = '';
        win.classList.add('tools-tab-panel');
      } else {
        win.hidden = false;
        win.classList.remove('tools-tab-panel');
      }
    });
    if (mobile) {
      const active = toolsView.dataset.activeTool ?? 'telemetry';
      setActive(active);
    }
  };

  syncLayout();
  mq.addEventListener('change', syncLayout);
  if (mq.matches) {
    setActive(toolsView.dataset.activeTool ?? 'telemetry');
  }

  return () => {
    mq.removeEventListener('change', syncLayout);
    handlers.forEach(([tab, handler]) => tab.removeEventListener('click', handler));
  };
}
