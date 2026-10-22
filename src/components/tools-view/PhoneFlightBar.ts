import { MOBILE_MEDIA_QUERY } from '@/utils/viewport';
import { requireById, requireIn } from '@components/dom';

// The phone's flight bar (§9 WP12 item 3: a big touch BURN button). On a phone the desk is one window at a time
// (ToolsTabs), and the default tab is the NAV PLOT, so the opening `hold [SPACE]` could not be followed there (WP1
// deferral): the BURN button lived in the ENGINE tab. At ≤ 768 px the Engine window's controls a strip line can ask
// for move into this bar under every tab: FUEL, the presets, the big BURN (hold it with a finger: pointer events, so
// touch works like the mouse), AUTO, ACCEPT ORBIT and BEAM OUT with its bar (WP7 verify: both BEAM OUT buttons sat in
// hidden tabs). Above the breakpoint they go back to their places in the Engine window. The elements are MOVED, not
// copied: EngineWindow keeps painting and wiring the same nodes wherever they are, so the two layouts can never
// disagree. Each part leaves a comment node at home to come back to. The bar is inside the amber view, so it hides
// with it in blue.

// The Engine window's parts that ride in the bar, in the bar's order (top to bottom).
const BAR_PARTS = [
  ':scope .engine-body > .fuel-block',
  ':scope .engine-body .preset-row',
  '#burnBtn',
  '#autoBtn',
  '#acceptBtn',
  '#beamBtn',
  '#beamBar',
] as const;

export function mountPhoneFlightBar(): () => void {
  const bar = requireById('phoneBar');
  const engine = requireIn<HTMLElement>(document, '.desktop > .tools-view > .engine-win', '.engine-win');
  if (bar.parentElement !== engine.parentElement) throw new Error('#phoneBar must sit in the tools view beside .engine-win');

  const parts = BAR_PARTS.map((selector) => {
    const element = requireIn<HTMLElement>(engine, selector, `${selector} in .engine-win`);
    const home = document.createComment(`phone flight bar: ${selector}`);
    element.before(home);
    return { element, home };
  });

  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  const sync = (): void => {
    if (mq.matches) {
      bar.append(...parts.map((part) => part.element));
      bar.hidden = false;
    } else {
      parts.forEach((part) => part.home.after(part.element));
      bar.hidden = true;
    }
  };
  // A long press on BURN must not open the phone's context menu (it would also cancel the hold).
  const burn = requireById('burnBtn');
  const onContextMenu = (event: Event): void => event.preventDefault();
  burn.addEventListener('contextmenu', onContextMenu);
  mq.addEventListener('change', sync);
  sync();

  return () => {
    mq.removeEventListener('change', sync);
    burn.removeEventListener('contextmenu', onContextMenu);
    parts.forEach((part) => { part.home.after(part.element); part.home.remove(); });
    bar.hidden = true;
  };
}
