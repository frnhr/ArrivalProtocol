import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';

// Wire elements marked with `.mobile-drawer` so any descendant `.drawer-toggle`
// flips the parent's `data-open` attribute on mobile. On desktop the toggle is
// inert (the drawer is always shown via CSS), so we still attach the listener
// but the matching CSS makes data-open a no-op.
export function mountMobileDrawers(root: ParentNode = document): () => void {
  const toggles = Array.from(
    root.querySelectorAll<HTMLElement>('.drawer-toggle[data-drawer-toggle]'),
  );
  const handlers: Array<[HTMLElement, EventListener]> = [];

  const isMobile = (): boolean => window.matchMedia(MOBILE_MEDIA_QUERY).matches;

  const findDrawer = (toggle: HTMLElement): HTMLElement | null => {
    const id = toggle.dataset.drawerToggle;
    if (!id) return null;
    return (
      (root as ParentNode).querySelector<HTMLElement>(`.mobile-drawer[data-drawer="${id}"]`)
    );
  };

  toggles.forEach((toggle) => {
    const onActivate = (event: Event): void => {
      if (!isMobile()) return;
      const drawer = findDrawer(toggle);
      if (!drawer) return;
      event.preventDefault();
      const open = drawer.dataset.open === 'true';
      const next = !open;
      drawer.dataset.open = String(next);
      toggle.setAttribute('aria-expanded', String(next));
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      onActivate(event);
    };
    toggle.addEventListener('click', onActivate);
    toggle.addEventListener('keydown', onKey as EventListener);
    handlers.push([toggle, onActivate], [toggle, onKey as EventListener]);
  });

  return () => {
    handlers.forEach(([toggle, fn]) => {
      toggle.removeEventListener('click', fn);
      toggle.removeEventListener('keydown', fn);
    });
  };
}

// Public helper so other systems (e.g. tools picking up an fs-tool) can pop
// the filesystem drawer open programmatically when needed.
// An unknown id is a caller's bug: it throws rather than doing nothing (final review, Fran's no-silent-fallback rule).
export function setDrawerOpen(id: string, open: boolean): void {
  const drawer = document.querySelector<HTMLElement>(
    `.mobile-drawer[data-drawer="${id}"]`,
  );
  if (!drawer) throw new Error(`setDrawerOpen: no .mobile-drawer[data-drawer="${id}"] in index.html`);
  drawer.dataset.open = String(open);
  const toggle = document.querySelector<HTMLElement>(
    `.drawer-toggle[data-drawer-toggle="${id}"]`,
  );
  if (!toggle) throw new Error(`setDrawerOpen: no .drawer-toggle[data-drawer-toggle="${id}"] in index.html`);
  toggle.setAttribute('aria-expanded', String(open));
}
