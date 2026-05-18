// Wires the open/close affordance on dock items. Items marked `.warn` are
// click-locked (an open alert can't be dismissed by clicking the item).
// The mark dot character toggles between filled and hollow.
//
// Items with `data-filter` or `data-status` are owned by SidebarFilters and
// skipped here — they need to write through the store, not just toggle DOM.
export function mountDockItems(): () => void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.dock-item'));
  const handlers: Array<[HTMLElement, () => void]> = [];

  items.forEach((item) => {
    if (item.dataset.filter || item.dataset.status) return;
    const handler = (): void => {
      if (item.classList.contains('warn')) return;
      item.classList.toggle('open');
      const mark = item.querySelector('.mark');
      if (mark) mark.textContent = item.classList.contains('open') ? '●' : '○';
    };
    item.addEventListener('click', handler);
    handlers.push([item, handler]);
  });

  return () => {
    handlers.forEach(([item, handler]) => item.removeEventListener('click', handler));
  };
}
