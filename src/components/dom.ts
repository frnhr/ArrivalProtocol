// Mounts look their elements up through this, so a renamed or deleted id in index.html fails
// loudly at load (§9) instead of a window silently showing nothing.
export function requireById<T extends Element = HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T | null;
  if (!element) throw new Error(`#${id} missing from index.html`);
  return element;
}

// The same for an element found by selector under `root` (a window's own parts, a dock item): `what` names
// it in the error.
export function requireIn<T extends Element = HTMLElement>(root: ParentNode, selector: string, what: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`${what} missing from index.html`);
  return element;
}

// A new element with its class and, optionally, its text: the run's screens (LANDING REPORT, TRANSMIT, RUN
// END) build their rows with it.
export function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A strip part's geometry (SegmentBlock stampPart puts all four on every .seg part): its size and its offset in its
// segment, in blocks, its index among the segment's parts and their count. A part without it is a rendering bug, never
// a 0 (final review: nine sites read a missing value as 0 or 1 and drew on).
export type PartKey = 'partSize' | 'partOffset' | 'partIdx' | 'totalParts';

export function partNumber(part: HTMLElement, key: PartKey): number {
  const value = part.dataset[key];
  if (value === undefined) {
    const attr = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    throw new Error(`.seg part of '${part.dataset.id ?? '?'}' has no data-${attr}`);
  }
  return Number(value);
}

// Restarts a one-shot CSS animation carried by `cls` (the reflow in between makes the browser
// see the class as new).
export function replayAnimation(element: Element, cls: string): void {
  element.classList.remove(cls);
  void (element as HTMLElement).offsetWidth;
  element.classList.add(cls);
}

// Lights the control a strip line points at (`hint-pulse` on the [data-hint-target] equal to
// `highlight`, off on every other one under `root`). ObjectiveStrip paints it when the line
// changes; SelectionHighlight re-applies it to the strip's files after a rebuild replaces them.
export function paintHintTargets(root: ParentNode, highlight: string | null): void {
  root.querySelectorAll<HTMLElement>('[data-hint-target]').forEach((element) => {
    element.classList.toggle('hint-pulse', highlight !== null && element.dataset.hintTarget === highlight);
  });
}

// A click is a press and a release on the same element. A view that rebuilds on its own clock (a
// print every 2.5 s, an op ending) can replace that element in between, and the browser then sends
// the click to a common ancestor: the chip or button never hears it (REPAIR on C09 "before it
// prints" lost at random). A press guard lets the view hold such a rebuild while a press that began
// inside `root` is down, and runs it once the click has landed: in the task after the release
// (pointerup, mouseup and click are dispatched together, so a timeout runs after all three).
interface PressGuard {
  // True while a press inside the root is down; the caller then skips its rebuild, and `flush`
  // runs once after the release.
  holds: () => boolean;
  dispose: () => void;
}

export function guardPresses(root: Element, flush: () => void): PressGuard {
  let pressed = false;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onDown = (event: Event): void => {
    if (event.target instanceof Node && root.contains(event.target)) pressed = true;
  };
  // Also on blur and pointercancel: a press the page never sees released must not freeze the view.
  const onRelease = (): void => {
    if (!pressed) return;
    pressed = false;
    if (!held) return;
    held = false;
    timer = setTimeout(() => { timer = null; flush(); }, 0);
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointerup', onRelease, true);
  document.addEventListener('pointercancel', onRelease, true);
  window.addEventListener('blur', onRelease);
  return {
    holds() {
      if (pressed) held = true;
      return pressed;
    },
    dispose() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onRelease, true);
      document.removeEventListener('pointercancel', onRelease, true);
      window.removeEventListener('blur', onRelease);
      if (timer !== null) clearTimeout(timer);
    },
  };
}
