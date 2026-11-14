import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';

// Generalized drag behavior for any .window element with a .window-title grip.
// Positions are written to `left`/`top` style on the win element, relative to
// the offset parent (.desktop). Returns a teardown that removes listeners.
function makeDraggable(win: HTMLElement, titleSelector = '.window-title'): () => void {
  const title = win.querySelector<HTMLElement>(titleSelector);
  if (!title) return () => {};

  let dx = 0;
  let dy = 0;
  let dragging = false;

  const onMouseDown = (event: MouseEvent): void => {
    // A press on the title bar's × is a click, not a drag: the window would otherwise jump under the pointer as it shut.
    if ((event.target as HTMLElement | null)?.closest('.ctl')) return;
    dragging = true;
    const rect = win.getBoundingClientRect();
    dx = event.clientX - rect.left;
    dy = event.clientY - rect.top;
    win.style.right = 'auto';
    document.body.style.userSelect = 'none';
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!dragging) return;
    const wrap = win.parentElement?.parentElement?.getBoundingClientRect();
    if (!wrap) return;
    win.style.left = event.clientX - dx - wrap.left + 'px';
    win.style.top = event.clientY - dy - wrap.top + 'px';
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
