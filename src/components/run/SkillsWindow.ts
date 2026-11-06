// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { setMode } from '@systems/mode';
import { skillsModel, type SkillRow, type SkillPip } from '@systems/skills';
import { requireById, requireIn, make, guardPresses } from '@components/dom';
import { worseGrip, paintGrip, type Grip } from '@components/tools-view/WindowGrip';
import { SKILLS_TEXT } from '@data/script';

// SKILLS (§7.1 dock SYSTEM, §9 WP8 item 3): the amber window that lists the cards this unit carries, each
// with its one-line effect, what it is doing right now (`HOLDING ??? BACK`, `THIS SHIP: +15% FUEL`) and a
// pip per file it lives in, in the band colours of the other windows' pips. A click on a pip jumps to that
// file in the MIND, selected, like every window's pips: a card is a file a kid can find and repair.
// • It opens from the dock (ToolsTabs: the `skills` entry), closed at first. When a card lands on a new
//   ship, or a boot trains AUTOBURN.skl (WP9), and the window is closed, the dock item pulses NEW until the kid
//   opens it.
// • On the desk it sits in the right column under the Engine window, from Engine's measured bottom down to
//   the desk's (game.css; it scrolls when that is short), and is draggable like the others. It comes before
//   Engine in index.html, so where the two still meet (Engine's MANUAL fold open on a 720-px desk) Engine's
//   controls are on top: Q/E and POWER are the flight's fallback when the Autopilot file is hurt.
// • Painted from systems/skills.ts every tick while it is open, patching only what changed, like the flight
//   windows' pips (a repair climbs, and a FIREWALL starts holding, without a store update). The rows are
//   rebuilt only when what they are changes (a card lands, a file goes), and never while a press is down
//   inside the window: a rebuild between press and release would swallow the pip's click (dom.ts
//   guardPresses). The title grip flickers with the worst file, like the flight windows'.

// The least room under the Engine window that still shows a card (its title, effect and pips): below it the window
// docks in the left column.
const SKILLS_RIGHT_MIN_PX = 150;
// The gutters stacked with the Engine window and Skills in the right column (game.css): the Engine window's top one,
// and .skills-win's top (calc(--engine-h + 2 × --gutter): its own plus the Engine's bottom) and bottom ones. The room
// left for Skills is the tools view's height less the Engine's and these (keep it in step with game.css).
const SKILLS_STACK_GUTTERS = 3;

interface PipView {
  button: HTMLButtonElement;
  glyph: HTMLElement;
  reading: HTMLElement;
  key: string;
}

interface RowView {
  node: HTMLElement;
  status: HTMLElement;
  version: { root: HTMLElement; pips: HTMLElement; text: HTMLElement } | null;
  pips: PipView[];
  key: string;
}

function pipView(model: SkillPip): PipView {
  const button = make('button', 'pip skill-pip');
  button.tabIndex = -1;
  if (model.segId !== null) button.dataset.segId = model.segId;
  const glyph = make('span', 'pip-glyph');
  const reading = make('span', 'pip-reading');
  button.append(glyph, make('span', 'pip-label', model.label), reading);
  return { button, glyph, reading, key: '' };
}

function paintPip(view: PipView, model: SkillPip): void {
  const key = `${model.look}|${model.reading}|${model.title}`;
  if (key === view.key) return;
  view.key = key;
  view.button.dataset.look = model.look;
  view.glyph.textContent = model.glyph;
  view.reading.textContent = model.reading;
  view.button.title = model.title;
}

// What a card or skill is doing now comes right under its name, before what it does in general: on a short desk
// (1280×720) the window's body is a few lines tall, and AUTOBURN.skl's `ACCURACY 96% · FROM YOUR 2 CAPTURES` (the
// reward the kid earned) sat below the fold (WP9 review round 1).
function rowView(row: SkillRow): RowView {
  const node = make('div', 'skill-row');
  node.dataset.card = row.id;
  const head = make('div', 'skill-head');
  head.append(make('span', 'skill-title', row.title));
  if (row.count) head.append(make('span', 'skill-count', row.count));
  const status = make('div', 'skill-status');
  // Slice 4: a skill's version line under its status (`▮▮▯ v2 · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`).
  let version: RowView['version'] = null;
  if (row.version !== null) {
    const root = make('div', 'skill-version');
    const pipsEl = make('span', 'skill-version-pips');
    const text = make('span', 'skill-version-text');
    root.append(pipsEl, text);
    version = { root, pips: pipsEl, text };
  }
  node.append(head, status, ...(version === null ? [] : [version.root]), make('div', 'skill-effect', row.effect));
  const pips = row.pips.map(pipView);
  if (pips.length > 0) {
    const pipsEl = make('div', 'skill-pips');
    pipsEl.append(...pips.map((pip) => pip.button));
    node.append(pipsEl);
  }
  return { node, status, version, pips, key: '' };
}

function paintRow(view: RowView, row: SkillRow): void {
  row.pips.forEach((pip, i) => paintPip(view.pips[i]!, pip));
  const key = `${row.tone}|${row.status}|${row.version?.pips ?? ''}|${row.version?.text ?? ''}|${row.version?.tone ?? ''}`;
  if (key === view.key) return;
  view.key = key;
  view.node.className = `skill-row tone-${row.tone}`;
  view.status.textContent = row.status;
  if (view.version !== null && row.version !== null) {
    view.version.root.dataset.tone = row.version.tone;
    view.version.pips.textContent = row.version.pips;
    view.version.text.textContent = row.version.text;
  }
}

// What the rows are, as opposed to what they read: the cards, their names and effects, and which files their
// pips stand for. A change here rebuilds the list; anything else is patched in place.
function structureKey(rows: readonly SkillRow[]): string {
  return JSON.stringify(rows.map((row) => [row.id, row.title, row.count, row.effect, row.version !== null, row.pips.map((pip) => [pip.segId, pip.label])]));
}

// The purchases that pulse NEW: a skill really bought at a desk. A free entry (cost 0 at visit 0: a migrated save's phase-2
// AUTOBURN, a suite's or ?debug's gift) is no news, so a resumed save does not pulse (FOUNDATION review note for UI).
function boughtNews(state: Readonly<GameState>): number {
  return state.run.skills.bought.filter((purchase) => !(purchase.cost === 0 && purchase.visit === 0)).length;
}

export function mountSkillsWindow(store: Store<GameState>): () => void {
  const win = requireById('skillsWin');
  const body = requireById('skillsBody');
  const grip = requireIn(win, ':scope > .window-title .grip[data-grip]', '#skillsWin .window-title grip');
  const dockItem = requireIn(document, '.dock-item[data-tool="skills"]', '.dock-item[data-tool="skills"]');
  const toolsView = win.parentElement;
  const engine = toolsView?.querySelector<HTMLElement>('.engine-win');
  if (!toolsView || !engine) throw new Error('.engine-win missing beside #skillsWin in index.html');

  const empty = make('div', 'skills-empty');
  empty.append(make('div', 'skills-empty-title', SKILLS_TEXT.empty), make('div', 'skills-empty-hint', SKILLS_TEXT.emptyHint));
  const list = make('div', 'skills-list');
  body.append(empty, list);

  let rowViews: RowView[] = [];
  let lastStructure: string | null = null;
  let lastGrip: Grip | '' = '';
  const presses = guardPresses(body, () => paint());
  function paint(): void {
    // The NEW pulse ends once the window is open (ToolsTabs marks the dock item open, on desktop and as a tab).
    if (dockItem.classList.contains('open')) dockItem.classList.remove('fresh');
    // A closed window has nothing to show: it is painted again the moment it opens (the observer below).
    if (win.hidden) return;
    const rows = skillsModel(store.getState());
    const structure = structureKey(rows);
    if (structure !== lastStructure) {
      if (presses.holds()) return;
      lastStructure = structure;
      empty.hidden = rows.length > 0;
      rowViews = rows.map(rowView);
      list.replaceChildren(...rowViews.map((view) => view.node));
    }
    rows.forEach((row, i) => paintRow(rowViews[i]!, row));
    let worst: Grip = 'intact';
    for (const row of rows) for (const pip of row.pips) worst = worseGrip(worst, pip.look);
    if (worst !== lastGrip) {
      lastGrip = worst;
      paintGrip(grip, worst);
    }
  }

  // A card landed (the run's picks grew, on the next ship's arrival): NEW on the dock item if it is closed.
  // A NEW RUN empties the picks and the pulse with them.
  const unsubPicks = store.subscribe((s) => s.run.upgrades.length, (count, prev) => {
    if (count > prev && !dockItem.classList.contains('open')) dockItem.classList.add('fresh');
    if (count === 0) dockItem.classList.remove('fresh');
    paint();
  });

  // A skill bought at a desk (slice 4: the run's committed purchases grew, at TRANSMIT ▸) pulses NEW the same way: the
  // window is where it says how good it is. A NEW RUN forgets the skills: with no card either, nothing is new. Free
  // entries (boughtNews) never pulse.
  const unsubSkill = store.subscribe(boughtNews, (count, prev) => {
    if (count > prev && !dockItem.classList.contains('open')) dockItem.classList.add('fresh');
    if (count === 0 && store.getState().run.upgrades.length === 0) dockItem.classList.remove('fresh');
    paint();
  });

  // A pip jumps to its file in the MIND, selected; a gone file has nothing to select.
  const onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('.skill-pip');
    if (!button) return;
    const segId = button.dataset.segId;
    if (segId === undefined) return;
    setMode(store, 'memory');
    if (store.getState().memory.some((seg) => seg.id === segId)) store.update((draft) => { draft.ui.selectedId = segId; });
  };
  body.addEventListener('click', onClick);

  // Under the Engine window, which grows and shrinks with its MANUAL fold and its context buttons (ACCEPT,
  // BEAM OUT): its measured height places this window's top (game.css --engine-h). When that leaves it less than
  // SKILLS_RIGHT_MIN_PX (MANUAL open on a 720-px desk left it 2 px: WP8 verify, WP12), it docks in the left column
  // under COMMS instead, which shortens to make room (data-skills-dock). A phone's tabs place it themselves.
  const syncEngineHeight = (): void => {
    if (toolsView.classList.contains('tools-tabs-mode')) return;
    const height = engine.offsetHeight;
    if (height <= 0) return;
    toolsView.style.setProperty('--engine-h', `${height}px`);
    const gutter = parseFloat(getComputedStyle(toolsView).getPropertyValue('--gutter'));
    if (!Number.isFinite(gutter)) throw new Error('SkillsWindow: the tools view has no --gutter');
    // While landing the POD BAY sits under the Engine window too (landing.css): Skills goes under both, or left.
    const podBay = toolsView.querySelector<HTMLElement>(':scope > .podbay-win');
    const podBayH = podBay !== null ? podBay.offsetHeight : 0;
    toolsView.style.setProperty('--podbay-h', `${podBayH}px`);
    const room = toolsView.clientHeight - height - SKILLS_STACK_GUTTERS * gutter - (podBayH > 0 ? podBayH + gutter : 0);
    toolsView.dataset.skillsDock = room < SKILLS_RIGHT_MIN_PX ? 'left' : 'right';
  };
  syncEngineHeight();
  const engineObserver = new ResizeObserver(syncEngineHeight);
  engineObserver.observe(engine);
  engineObserver.observe(toolsView);
  const podBayWin = toolsView.querySelector<HTMLElement>(':scope > .podbay-win');
  if (podBayWin) engineObserver.observe(podBayWin);
  // Opened (the dock, or a tab on a phone): paint at once, even between ships when no tick runs.
  const shownObserver = new MutationObserver(() => paint());
  shownObserver.observe(win, { attributes: true, attributeFilter: ['hidden'] });

  paint();
  const offTick = onPostTick(paint);
  // Ticks stop between ships (TRANSMIT, RUN END): a change there still repaints.
  const unsubMemory = store.subscribe((s) => `${s.ui.memoryRev}|${s.run.rev}`, paint);

  return () => {
    unsubPicks();
    unsubSkill();
    unsubMemory();
    offTick();
    body.removeEventListener('click', onClick);
    engineObserver.disconnect();
    shownObserver.disconnect();
    presses.dispose();
  };
}
