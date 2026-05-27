import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';

// Generalized drag behavior for any .window element with a .window-title grip.
// Positions are written to `left`/`top` style on the win element, relative to
// the offset parent (.desktop). Returns a teardown that removes listeners.
export function makeDraggable(win: HTMLElement, titleSelector = '.window-title'): () => void {
  const title = win.querySelector<HTMLElement>(titleSelector);
  if (!title) return () => {};

  let dx = 0;
  let dy = 0;
  let dragging = false;

  const onMouseDown = (e: MouseEvent): void => {
    dragging = true;
    const r = win.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    win.style.right = 'auto';
    document.body.style.userSelect = 'none';
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!dragging) return;
    const wrap = win.parentElement?.parentElement?.getBoundingClientRect();
    if (!wrap) return;
    win.style.left = e.clientX - dx - wrap.left + 'px';
    win.style.top = e.clientY - dy - wrap.top + 'px';
  };

  const onMouseUp = (): void => {
    dragging = false;
    document.body.style.userSelect = '';
  };

  title.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    title.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

// Convenience: makes every .window in the document draggable on desktop only.
export function mountAllWindows(): () => void {
  const wins = Array.from(document.querySelectorAll<HTMLElement>('.window'));
  let teardowns: Array<() => void> = [];

  const sync = (): void => {
    teardowns.forEach((t) => t());
    teardowns = [];
    if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      teardowns = wins.map((w) => makeDraggable(w));
    }
  };

  sync();
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  mq.addEventListener('change', sync);

  return () => {
    mq.removeEventListener('change', sync);
    teardowns.forEach((t) => t());
  };
}
