import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { on } from '@systems/events';
import { setMode } from '@systems/mode';
import { CAPABILITY_ROLES, BAND_COPY, roleHealth, type CapabilityRole } from '@systems/capabilities';
import { windowPip, type PipLook, type PipModel } from '@systems/flight-hud';
import type { SkillPipLook } from '@systems/skills';
import { getByRole } from '@state/selectors';
import { replayAnimation } from '@components/dom';
import { PIP_FLASH_MS } from '@data/tuning';
import { pipHintTarget } from '@data/fs-tools';

// Every flight window names the files behind it (§7.1 title pips, C3, pillar 4): `data-roles=
// "engine-io reactor …"` on the window becomes a row of pips under its title, one per file, in
// the §6.4 band colours. A ship file the kid has not scanned is a `?` (its damage stays hidden,
// §3.2), a file being repaired is ↻, a missing one is ✕. A click on a pip jumps to the MIND with
// that file selected, so every loss on the ship has a file the kid can find in one click.
// • The title grip flickers with the worst pip, as before (green / yellow / red).
// • A scripted fault flashes the pip of the file it broke (the ENGINE I/O FAULT, §5.1), and so does every
//   uncommanded burst the THRUST CTRL pip (WP10), which also carries their count (`? THRUST CTRL FIRED ×3`): the
//   engine firing by itself points at its cause, one click from the file.
// • TASK 700 hybrid: a window whose own file is gone (`data-veil-role`) shows a loud NO X veil
//   instead of vanishing, so the cause stays on screen (the NAV PLOT draws its own NO SIGNAL).
// Painted every tick, patching only what changed: a repair's integrity climbs without a store
// update.

// The grip's three looks, from the pips' (shared with the Skills window, whose FIREWALL pips add HOLDING and
// IDLE: a wall that holds nothing yet is not a fault).
export type Grip = 'intact' | 'partial' | 'corrupt';

const GRIP_OF_LOOK: Readonly<Record<PipLook | SkillPipLook, Grip>> = {
  ok: 'intact',
  unknown: 'intact',
  holding: 'intact',
  idle: 'intact',
  degraded: 'partial',
  offline: 'partial',
  failing: 'corrupt',
  dead: 'corrupt',
  missing: 'corrupt',
};
const GRIP_ORDER: readonly Grip[] = ['intact', 'partial', 'corrupt'];

// The worse of the grip so far and a pip's look.
export function worseGrip(grip: Grip, look: PipLook | SkillPipLook): Grip {
  const other = GRIP_OF_LOOK[look];
  return GRIP_ORDER.indexOf(other) > GRIP_ORDER.indexOf(grip) ? other : grip;
}

// Paints a title grip's look (green / yellow / red flicker, legacy-components.css).
export function paintGrip(grip: HTMLElement, look: Grip): void {
  grip.classList.remove('intact', 'partial', 'corrupt');
  grip.classList.add(look);
}

interface PipView {
  role: CapabilityRole;
  button: HTMLButtonElement;
  glyph: HTMLElement;
  label: HTMLElement;
  reading: HTMLElement;
  count: HTMLElement;
  key: string;
  flashTimer: ReturnType<typeof setTimeout> | null;
}

interface WindowView {
  grip: HTMLElement;
  pips: PipView[];
  veil: { role: CapabilityRole; element: HTMLElement } | null;
  gripKey: Grip | '';
}

function isCapabilityRole(role: string): role is CapabilityRole {
  return (CAPABILITY_ROLES as readonly string[]).includes(role);
}

function buildPip(role: CapabilityRole): PipView {
  const button = document.createElement('button');
  button.className = 'pip';
  button.tabIndex = -1;
  button.dataset.role = role;
  // A strip line can light the pip that leads to the file (WP10: the THRUST CTRL pip under the engine firing by itself).
  button.dataset.hintTarget = pipHintTarget(role);
  const glyph = document.createElement('span');
  glyph.className = 'pip-glyph';
  const label = document.createElement('span');
  label.className = 'pip-label';
  const reading = document.createElement('span');
  reading.className = 'pip-reading';
  const count = document.createElement('span');
  count.className = 'pip-count';
  count.hidden = true;
  button.append(glyph, label, reading, count);
  return { role, button, glyph, label, reading, count, key: '', flashTimer: null };
}

function paintPip(view: PipView, model: PipModel): void {
  const key = `${model.look}|${model.reading}|${model.title}|${model.count}`;
  if (key === view.key) return;
  view.key = key;
  view.button.dataset.look = model.look;
  view.glyph.textContent = model.glyph;
  view.label.textContent = model.label;
  view.reading.textContent = model.reading;
  view.reading.hidden = model.reading === '';
  view.count.textContent = model.count;
  view.count.hidden = model.count === '';
  view.button.title = `${model.title} — click to see the file`;
}

function build(win: HTMLElement): WindowView {
  const roles = (win.dataset.roles ?? '').split(/\s+/).filter(Boolean);
  const title = win.querySelector<HTMLElement>(':scope > .window-title');
  const grip = title?.querySelector<HTMLElement>('.grip[data-grip]');
  if (!title || !grip) throw new Error('WindowGrip: a .window[data-roles] has no .window-title with a grip');
  const row = document.createElement('div');
  row.className = 'window-pips';
  const pips = roles.map((role) => {
    if (!isCapabilityRole(role)) throw new Error(`WindowGrip: data-roles names '${role}', which drives no capability`);
    const pip = buildPip(role);
    row.appendChild(pip.button);
    return pip;
  });
  title.after(row);

  let veil: WindowView['veil'] = null;
  const veilRole = win.dataset.veilRole;
  if (veilRole !== undefined) {
    if (!isCapabilityRole(veilRole)) throw new Error(`WindowGrip: data-veil-role '${veilRole}' drives no capability`);
    const body = win.querySelector<HTMLElement>(':scope > .window-body');
    if (!body) throw new Error('WindowGrip: a .window[data-veil-role] has no .window-body');
    const element = document.createElement('div');
    element.className = 'window-veil';
    element.hidden = true;
    body.appendChild(element);
    veil = { role: veilRole, element };
  }
  return { grip, pips, veil, gripKey: '' };
}

export function mountWindowGrips(store: Store<GameState>): () => void {
  const windows = Array.from(document.querySelectorAll<HTMLElement>('.window[data-roles]')).map(build);
  if (windows.length === 0) throw new Error('WindowGrip: no .window[data-roles] in index.html');

  function paint(): void {
    const state = store.getState();
    for (const view of windows) {
      let worst: Grip = 'intact';
      for (const pip of view.pips) {
        const model = windowPip(state, pip.role);
        paintPip(pip, model);
        worst = worseGrip(worst, model.look);
      }
      if (worst !== view.gripKey) {
        view.gripKey = worst;
        paintGrip(view.grip, worst);
      }
      if (view.veil) {
        const missing = roleHealth(state, view.veil.role).band === 'missing';
        if (view.veil.element.hidden === missing) {
          view.veil.element.hidden = !missing;
          view.veil.element.textContent = missing ? BAND_COPY[view.veil.role].missing : '';
        }
      }
    }
  }

  // A pip jumps to its file in the MIND (selected, so INSPECT shows it). A missing file has
  // nothing to select: the jump still shows the MIND, where the hole is.
  const onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.window-pips .pip');
    const role = button?.dataset.role;
    if (!role || !isCapabilityRole(role)) return;
    const file = getByRole(store.getState(), role);
    setMode(store, 'memory');
    if (file) store.update((draft) => { draft.ui.selectedId = file.id; });
  };
  document.addEventListener('click', onClick);

  // The fault's pip flashes (wall clock: a cosmetic beat, which must also end while paused). The
  // timer alone sets how long: the CSS blinks until the class goes, and under reduced motion the
  // pip just stays lit that long.
  const flashPip = (role: CapabilityRole): void => {
    for (const view of windows) {
      for (const pip of view.pips) {
        if (pip.role !== role) continue;
        replayAnimation(pip.button, 'flash');
        if (pip.flashTimer !== null) clearTimeout(pip.flashTimer);
        pip.flashTimer = setTimeout(() => { pip.button.classList.remove('flash'); pip.flashTimer = null; }, PIP_FLASH_MS);
      }
    }
  };
  const offFault = on('file-fault', ({ role }) => { if (isCapabilityRole(role)) flashPip(role); });
  // Every burst flashes the THRUST CTRL pip, also one a SKIP flew through (WP10 review, the lead's ruling: every burst
  // flown through is seen; its count goes up on the pip in the same tick).
  const offGhost = on('ghost-start', () => flashPip('thrust-ctrl'));

  paint();
  const offTick = onPostTick(paint);
  // Ticks stop after the flight: a file changed then (a debug poke) still repaints.
  const unsub = store.subscribe((s) => s.ui.memoryRev, paint);

  return () => {
    document.removeEventListener('click', onClick);
    offFault();
    offGhost();
    offTick();
    unsub();
    windows.forEach((view) => view.pips.forEach((pip) => { if (pip.flashTimer !== null) clearTimeout(pip.flashTimer); }));
  };
}
