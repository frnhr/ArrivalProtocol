import { onWorldReset } from '@systems/reset';
import { emit, NO_PAYLOAD } from '@systems/events';

// One keyboard router for the whole game (§6.11). A single capture-phase keydown/keyup pair
// on the window, a modal stack (title > the run's cards > inline confirm > choice > game) that decides who
// hears a key, and the held-key bookkeeping that makes "hold SPACE to burn" safe:
// • auto-repeat never re-triggers a key, so a key held across a modal needs a fresh press;
// • a keyup goes to the layer that saw the keydown, never to whoever is on top now;
// • losing window focus releases everything (no burn stuck on after alt-tab).
// Modules register their keys here instead of adding their own listeners.
//
// DOM-free apart from the event target it is mounted on, so harnesses can drive it with a
// plain EventTarget and synthetic events.

// 'report', 'transmit' and 'end' are full-screen cards that own the keys while they are up (the WAKE
// REPORT, TRANSMIT, RUN END; WP7): like the title, nothing under them may hear SPACE, TAB or P. They are
// never up together (one per run phase); each has its own layer so a card's keys are never heard by
// another card's handler.
export type InputLayer = 'title' | 'report' | 'transmit' | 'end' | 'confirm' | 'choice' | 'game';
export type ModalLayer = Exclude<InputLayer, 'game'>;

// Highest priority first.
const LAYER_PRIORITY: readonly InputLayer[] = ['title', 'report', 'transmit', 'end', 'confirm', 'choice', 'game'];

export interface KeyBinding {
  layer: InputLayer;
  codes: readonly string[];      // KeyboardEvent.code values ('Space', 'KeyW', …)
  onDown?: (code: string) => void;
  onUp?: (code: string) => void;
}

// Keys whose browser default (scroll, focus moves, button activation, find-as-you-type)
// would fight the game. Prevented unless the player is typing into a text field.
const PREVENTED_CODES: ReadonlySet<string> = new Set([
  'Space', 'Tab', 'KeyF', 'KeyP', 'KeyM', 'KeyB', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
]);

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text', 'search', 'email', 'number', 'password', 'url', 'tel',
]);

const bindings = new Set<KeyBinding>();
const openModals: ModalLayer[] = [];
const held = new Map<string, InputLayer>(); // code → the layer that received its keydown

export function registerKeys(binding: KeyBinding): () => void {
  bindings.add(binding);
  return () => { bindings.delete(binding); };
}

export function activeLayer(): InputLayer {
  for (const layer of LAYER_PRIORITY) {
    if (layer === 'game' || openModals.includes(layer)) return layer;
  }
  return 'game';
}

function dispatch(layer: InputLayer, code: string, phase: 'down' | 'up'): void {
  for (const binding of bindings) {
    if (binding.layer !== layer || !binding.codes.includes(code)) continue;
    if (phase === 'down') binding.onDown?.(code);
    else binding.onUp?.(code);
  }
}

function release(code: string): void {
  const layer = held.get(code);
  if (layer === undefined) return;
  held.delete(code);
  dispatch(layer, code, 'up');
}

// Whether `code` is physically down and its keydown went to `layer` (a key pressed on the title
// and still held is not a game key).
export function isKeyHeld(code: string, layer: InputLayer): boolean {
  return held.get(code) === layer;
}

// Hands a key whose keydown a modal layer just took to whichever layer is on top now (the modal
// has closed itself first); its keyup then goes there too. The inline confirm lets TAB and P
// through this way, so the screen switch and pause never wait on a question.
export function passKeyDown(code: string): void {
  const layer = activeLayer();
  held.set(code, layer);
  dispatch(layer, code, 'down');
}

// Lets go of every held key (each layer hears its keyup). Window blur, modal opens and world
// resets call this.
export function releaseAllKeys(): void {
  for (const code of [...held.keys()]) release(code);
}

// Opens a modal layer. Keys held below it are released now (a held SPACE stops the burn when
// a confirm pops up); the returned function closes it again.
export function pushModal(layer: ModalLayer): () => void {
  for (const [code, heldLayer] of [...held]) {
    if (LAYER_PRIORITY.indexOf(heldLayer) > LAYER_PRIORITY.indexOf(layer)) release(code);
  }
  openModals.push(layer);
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    const index = openModals.lastIndexOf(layer);
    if (index >= 0) openModals.splice(index, 1);
  };
}

function isTextTarget(target: EventTarget | null): boolean {
  const node = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  if (!node || typeof node.tagName !== 'string') return false;
  if (node.isContentEditable === true) return true;
  const tag = node.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && typeof node.type === 'string' && TEXT_INPUT_TYPES.has(node.type);
}

export interface InputTarget {
  addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: EventListenerOptions | boolean): void;
}

let mounted = false;

export function mountInput(target: InputTarget): () => void {
  if (mounted) throw new Error('mountInput: already mounted');
  mounted = true;

  const onKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (isTextTarget(key.target)) return;
    // Cmd/Ctrl/Alt chords belong to the browser (Find, Print, bookmarks…). Ignoring them
    // whole also matters on macOS, where a key pressed while Cmd is down never sends its
    // keyup: recording it as held would leave Q/E (or SPACE) stuck on.
    if (key.metaKey || key.ctrlKey || key.altKey) return;
    if (PREVENTED_CODES.has(key.code)) key.preventDefault();
    if (key.repeat) return;
    // A keydown for a key we think is still down means its keyup was lost: treat it as a
    // clean release + press so the key is never stuck.
    if (held.has(key.code)) release(key.code);
    const layer = activeLayer();
    held.set(key.code, layer);
    dispatch(layer, key.code, 'down');
  };
  const onKeyUp = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (!isTextTarget(key.target) && PREVENTED_CODES.has(key.code)) key.preventDefault();
    release(key.code);
  };
  const onBlur = (): void => releaseAllKeys();

  target.addEventListener('keydown', onKeyDown, { capture: true });
  target.addEventListener('keyup', onKeyUp, { capture: true });
  target.addEventListener('blur', onBlur);
  const offReset = onWorldReset('input-held-keys', releaseAllKeys, () => ({ held: held.size }));

  return () => {
    target.removeEventListener('keydown', onKeyDown, { capture: true });
    target.removeEventListener('keyup', onKeyUp, { capture: true });
    target.removeEventListener('blur', onBlur);
    offReset();
    held.clear();
    mounted = false;
  };
}

// Game buttons must never keep focus: a focused button would swallow SPACE (activation) or
// TAB (focus move). Buttons carry tabindex="-1" in the markup; this drops focus after a
// pointer press as well.
export function blurButtonsOnPointerUp(root: HTMLElement | Document): () => void {
  const onPointerUp = (event: Event): void => {
    const target = event.target as Element | null;
    const button = target?.closest?.('button');
    if (button instanceof HTMLElement) button.blur();
  };
  root.addEventListener('pointerup', onPointerUp);
  return () => root.removeEventListener('pointerup', onPointerUp);
}

// Pressing anything clickable (a button, the mode toggle, a tool chip, a dock item) announces a
// 'ui-click', which plays the soft tactile tick.
const CLICKABLE = 'button, .mode-toggle-opt, .fs-tool-chip.clickable, .dock-item, .op-cancel';

export function emitUiClicks(root: HTMLElement | Document): () => void {
  const onPointerDown = (event: Event): void => {
    const target = event.target as Element | null;
    const clickable = target?.closest?.(CLICKABLE);
    if (clickable && !(clickable instanceof HTMLButtonElement && clickable.disabled)) emit('ui-click', NO_PAYLOAD);
  };
  root.addEventListener('pointerdown', onPointerDown);
  return () => root.removeEventListener('pointerdown', onPointerDown);
}
