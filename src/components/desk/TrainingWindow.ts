// Playtest 1: Track B-DESK owns this file (docs/phase3/impl/playtest-1-plan.md §3.6, §4 Batch B). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { TrainingModel, TrainingCellView, TrainingBranch, TrainingCard, TrainingDetail } from '@systems/training-model';
import { trainingModel } from '@systems/training-model';
import { cyclesLedger, type CyclesLedger } from '@systems/cycles-ledger';
import {
  selectTrainingCell, stepTrainingCell, startTrainingHold, cancelTrainingHold, advanceTrainingHold, undoTraining,
} from '@systems/desk';
import { play } from '@systems/audio';
import { make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { halfHead } from '@components/desk/RepositoryWindow';
import { TRAINING_TEXT, type DemoArt } from '@data/training-text';
import { WALL_FRAME_MAX_SEC, TRAINING_BANK_ROLL_SEC, TRAINING_CHIRP_SEC } from '@data/tuning';

// COMPILE HERE, the REPOSITORY's lower half (phase 3 slice 4's TRAINING tab; 03-skills §4; slice-4-plan §2.5, §3 steps 1
// and 3; playtest 1 B-DESK, §3.6: one REPOSITORY, FROM EARTH above, this half below, [T] opens it here), drawn from
// systems/training-model.ts trainingModel and systems/cycles-ledger.ts cyclesLedger only. In the desk's amber, in the right
// window, which widens while the REPOSITORY is open (desk.css). Top to bottom:
// • the head: `COMPILE HERE [T]`, the bank in VT323 digits (`5 CYCLES`, what cycles are on hover), which rolls down as a
//   purchase lands;
// • the ledger (Fran's note 15: cycles "just magically appear"): where they came from and where they went, one signed row
//   each: CARRIED OVER, the ship just left as its LANDING REPORT said it (`+5 HALCYON · ARRIVED +1 · LANDED 83% +4`), the
//   CORE RESERVE or a lesson, then this desk's purchases (`−3 AUTOBURN v1`) with UNDO (it was its own section);
// • ARRIVAL CONTROL's line;
// • visit 1: CHOOSE YOUR FIRST SKILL over the cards (4a: AUTOBURN v1 alone), each with its key ([1], [2]), its pitch, a
//   looping mini-demo and `3 CYCLES · 6 BLOCKS`; a picked card is stamped TRAINED;
// • from visit 2: the grid, a column per open branch (versions down, LOCK RANGE on a side axis), traces that light from
//   the parent as cells are held, the closed branches as one `NOT YET` row each (why on hover); then the selected cell's
//   detail with its 4-second demo and TRAIN (or RESTORE on a lost cell);
// • TRAIN fills its bar over TRAINING_HOLD_SEC (wall time) with the op chirps, then the purchase lands with the ORBIT
//   LOCKED arpeggio (RESTORE: the repair-won sparkle); a refusal buzzes;
// • the AHEAD row, the packet preview (its tone: quiet, warn below the floor, red over), and the last unit's line.
// Clicks select a cell (or a card), press TRAIN, UNDO, or open a branch's accordion on a phone; DeskScreen routes the keys
// here (training.key/press/step) while the tab is open. Repainted whole when what it shows changes; the TRAIN bar and the
// rolling bank are patched in place, frame by frame.

export interface TrainingWindowView {
  root: HTMLElement;
  paint: () => void;
  // The keys, while the tab is open: ENTER on an armed cell (TRAIN; DeskScreen asks desk.ts deskEnter first), a card's
  // number (false when there is no such card), ↑ ↓ in the grid (false on visit 1).
  press: () => boolean;
  card: (index: number) => boolean;
  step: (dir: 1 | -1) => boolean;
  cancel: () => void;
  destroy: () => void;
}

const PHONE_QUERY = '(max-width: 768px)';

// A pod leaving the orbit at (x, y) and falling to the LZ at (toX, toY), in its turn of the volley (`tr-d1`…`tr-d3`). The
// pod is drawn a few units down its fall, so the bracket it left from does not hide it.
function drop(turn: string, x: number, y: number, toX: number, toY: number): string {
  const podY = y + 4;
  const podX = x + ((toX - x) * 4) / (toY - y || 1);
  return `<g class="${turn}"><path class="tr-demo-fall" d="M${x} ${y} L${toX} ${toY}"/>`
    + `<circle class="tr-demo-pod" cx="${podX.toFixed(1)}" cy="${podY.toFixed(1)}" r="1.8"/></g>`;
}

// A row of AUTODROP v3's plan table, in its turn.
function planRow(turn: string, y: number, words: string): string {
  return `<g class="${turn}"><rect class="tr-demo-row" x="2" y="${y}" width="56" height="11"/>`
    + `<text class="tr-demo-text" x="5" y="${y + 8.5}">${words}</text></g>`;
}

// A mini-demo (03 §4: "loops a 4-second mini-demo of the selected cell"), drawn in the desk's amber: a planet, then what
// the cell does to the path. CSS (desk.css .tr-demo-*) loops it; reduced motion holds its last frame.
// One drawing per DemoArt (the cells name theirs in data: training-text.ts TRAINING_DEMO_ART).
function demoSvg(kind: DemoArt): string {
  const planet = '<circle class="tr-demo-planet" cx="60" cy="40" r="11"/>';
  const ring = '<circle class="tr-demo-ring" cx="60" cy="40" r="24"/>';
  // AUTODROP's side view: the planet's limb below and the orbit's track above.
  const ground = '<path class="tr-demo-planet" d="M0 80 V66 Q60 54 120 66 V80 z"/>';
  const track = '<path class="tr-demo-orbit" d="M0 22 Q60 6 120 22"/>';
  switch (kind) {
    case 'capture':
      return `<svg class="tr-demo tr-demo-capture" viewBox="0 0 120 80">${ring}${planet}`
        + '<path class="tr-demo-flyby" d="M4 70 Q 48 52 60 14 Q 72 52 116 70"/>'
        + '<ellipse class="tr-demo-loop" cx="60" cy="32" rx="22" ry="20"/><circle class="tr-demo-ship" cx="60" cy="12" r="2.6"/></svg>';
    case 'green':
      return `<svg class="tr-demo tr-demo-green" viewBox="0 0 120 80">${ring}${planet}`
        + '<ellipse class="tr-demo-wide" cx="60" cy="34" rx="40" ry="28"/><circle class="tr-demo-round" cx="60" cy="40" r="24"/></svg>';
    // AUTOBURN v3 LANDING ORBIT (03 §4: `a dashed ghost loop, LANDING ORBIT · EVERY LZ FITS`): the loop fades, the dashed
    // ghost circle inside the band is flown round, and every LZ lights.
    case 'low-orbit':
      return `<svg class="tr-demo tr-demo-low" viewBox="0 0 120 80">${ring}${planet}`
        + '<ellipse class="tr-demo-wide" cx="60" cy="34" rx="40" ry="28"/><circle class="tr-demo-ghost" cx="60" cy="40" r="22"/>'
        + '<circle class="tr-demo-round" cx="60" cy="40" r="22"/><path class="tr-demo-lz" d="M56 29 h8 M71 37 v6 M49 37 v6"/></svg>';
    case 'lock':
      return `<svg class="tr-demo tr-demo-lock" viewBox="0 0 120 80">${ring}${planet}`
        + '<path class="tr-demo-flyby" d="M4 70 Q 48 52 60 14 Q 72 52 116 70"/><path class="tr-demo-bracket" d="M10 66 Q 48 50 58 16"/></svg>';
    // Slice 6 SITES: SURVEY's three demos (plan §2.14; styles/survey.css loops them): 'find' a wedge sweeps a tiny rim, mapping
    // it, and a dashed bracket pops up as it passes (`SITE 4`); 'rate' a bracket stamped `WET ✕` hands LZ-B to a ★★★ one;
    // 'sweep' a wedge twice as wide, and a THREADS pip going dark. Angles in degrees, counter-clockwise from the right.
    case 'find':
    case 'rate':
    case 'sweep': {
      const at = (r: number, deg: number): string =>
        `${(60 + r * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(40 - r * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
      const arc = (r: number, from: number, to: number): string => `M${at(r, from)} A${r} ${r} 0 0 0 ${at(r, to)}`;
      // The rim from the wedge's start, round the way it turns (pathLength: the mapping's dash runs 80 → 0).
      const rimPath = `M${at(14.5, 0)} A14.5 14.5 0 1 0 ${at(14.5, 180)} A14.5 14.5 0 1 0 ${at(14.5, 0)}`;
      const globe = `<circle class="tr-demo-planet" cx="60" cy="40" r="12"/><path class="tr-demo-rim" d="${rimPath}"/>`;
      if (kind === 'rate') {
        return `<svg class="tr-demo tr-demo-rate" viewBox="0 0 120 80">${globe}<path class="tr-demo-site bad" d="${arc(17, 150, 170)}"/>`
          + '<text class="tr-demo-tag bad" x="2" y="26">LZ-B</text><text class="tr-demo-tag bad" x="2" y="37">WET ✕</text>'
          + `<path class="tr-demo-site good" d="${arc(17, 10, 30)}"/>`
          + '<text class="tr-demo-tag good" x="118" y="26" text-anchor="end">LZ-B</text>'
          + '<text class="tr-demo-tag good" x="118" y="37" text-anchor="end">★★★</text></svg>';
      }
      const half = kind === 'sweep' ? 40 : 20;
      const swath = `<path class="tr-demo-swath" d="M60 40 L${at(36, -half)} A36 36 0 0 0 ${at(36, half)} Z"/>`;
      const mapped = `<path class="tr-demo-mapped" d="${rimPath}" pathLength="80"/>`;
      const site = `<path class="tr-demo-site" d="${arc(17, 134, 154)}"/><text class="tr-demo-tag" x="44" y="14" text-anchor="end">SITE 4</text>`;
      const threads = '<text class="tr-demo-text" x="2" y="77">THREADS</text>'
        + '<rect class="tr-demo-pip held" x="40" y="70" width="5" height="5"/><rect class="tr-demo-pip free" x="48" y="70" width="5" height="5"/>';
      return `<svg class="tr-demo tr-demo-${kind}" viewBox="0 0 120 80">${swath}${globe}${mapped}${kind === 'sweep' ? threads : site}</svg>`;
    }
    // (end of Slice 6 SITES)
    case 'plain':
      return `<svg class="tr-demo tr-demo-plain" viewBox="0 0 120 80">${planet}<circle class="tr-demo-round" cx="60" cy="40" r="24"/></svg>`;
    // AUTODROP v1 CENTRE (03 §3.8), seen from the side as the GROUND TRACK draws it: the orbit above, the ground below, the
    // bracket over an LZ with its centre ticked, and a volley that straddles it: the pods leave one after another, the
    // middle one on the centre.
    case 'centre':
      return `<svg class="tr-demo tr-demo-centre" viewBox="0 0 120 80">${ground}${track}`
        + '<path class="tr-demo-lz" d="M52 59.5 H68"/><path class="tr-demo-bracket" d="M44 14.6 Q60 13.2 76 14.6"/>'
        + '<path class="tr-demo-mid" d="M60 7 v4"/>'
        + drop('tr-d1', 54, 14.2, 57, 58) + drop('tr-d2', 60, 14, 60, 58) + drop('tr-d3', 66, 14.2, 63, 58) + '</svg>';
    // AUTODROP v2 PASS: the pass's split (`A×2 · B×1`), then each LZ's window flies its own pods.
    case 'pass':
      return `<svg class="tr-demo tr-demo-pass" viewBox="0 0 120 80">${ground}${track}`
        + '<text class="tr-demo-text" x="2" y="8">A×2 · B×1</text>'
        + '<path class="tr-demo-lz" d="M27 60.5 H41 M79 60.5 H93"/>'
        + '<path class="tr-demo-bracket" d="M24 16.9 Q34 15 44 14.6"/><path class="tr-demo-bracket" d="M76 14.6 Q86 15 96 16.9"/>'
        + drop('tr-d1', 31, 15.8, 32.5, 59) + drop('tr-d2', 37, 15.2, 35.5, 59) + drop('tr-d3', 86, 15.3, 86, 59) + '</svg>';
    // AUTODROP v3 PLAN: the plan table's passes tick in one by one, its check line closes, and every LZ is lit.
    case 'plan':
      return '<svg class="tr-demo tr-demo-plan" viewBox="0 0 120 80">'
        + planRow('tr-d1', 12, '1 · A2 B1') + planRow('tr-d2', 26, '2 · A2 C1') + planRow('tr-d3', 40, '3 · B1 C2')
        + '<text class="tr-demo-text tr-demo-check" x="4" y="64">PLAN ✓</text>'
        + '<circle class="tr-demo-ring" cx="90" cy="40" r="20"/><circle class="tr-demo-orbit" cx="90" cy="40" r="20"/>'
        + '<circle class="tr-demo-planet" cx="90" cy="40" r="10"/>'
        + '<path class="tr-demo-lz" d="M87 30 h6 M100 37 v6 M80 37 v6"/></svg>';
    // SENTRY v1 SIGHT (03 §3.10): a row of the unit's files; the small one is marked red as a seed, and bracketed.
    case 'sight':
      return '<svg class="tr-demo tr-demo-sight" viewBox="0 0 120 80"><rect class="tr-demo-file" x="6" y="28" width="34" height="24"/>'
        + '<rect class="tr-demo-file" x="44" y="28" width="34" height="24"/><rect class="tr-demo-file" x="90" y="28" width="16" height="24"/>'
        + '<rect class="tr-demo-seed" x="90" y="28" width="16" height="24"/><path class="tr-demo-mark" d="M86 24 h24 v32 h-24 z"/></svg>';
    // SENTRY v2 QUICK RM: a seed rm'd in half the time, and HOLLOW's blinking outline, where the next seed would land.
    case 'quick-rm':
      return '<svg class="tr-demo tr-demo-quick-rm" viewBox="0 0 120 80"><rect class="tr-demo-file" x="6" y="28" width="34" height="24"/>'
        + '<rect class="tr-demo-seed" x="52" y="28" width="16" height="24"/><path class="tr-demo-telegraph" d="M80 28 h16 v24 h-16 z"/>'
        + '<path class="tr-demo-rm" d="M52 60 h16"/></svg>';
    // SENTRY v3 FIREWALL: a FIREWALL.sys compiled between a seed and a file.
    case 'firewall':
      return '<svg class="tr-demo tr-demo-firewall" viewBox="0 0 120 80"><rect class="tr-demo-seed" x="6" y="28" width="16" height="24"/>'
        + '<rect class="tr-demo-wall" x="34" y="28" width="16" height="24"/><rect class="tr-demo-file" x="62" y="28" width="34" height="24"/></svg>';
  }
}

function svgNode(markup: string): HTMLElement {
  const holder = make('div', 'tr-demo-box');
  holder.innerHTML = markup;
  return holder;
}

function cellNode(cell: TrainingCellView): HTMLButtonElement {
  const node = make('button', `tr-cell look-${cell.look}`);
  node.tabIndex = -1;
  node.dataset.cell = cell.key;
  node.classList.toggle('selected', cell.selected);
  node.classList.toggle('lit', cell.lit);
  if (cell.parent !== null) node.dataset.parent = cell.parent;
  node.append(make('span', 'tr-cell-name', cell.name), make('span', 'tr-cell-mode', cell.mode));
  const foot = make('span', 'tr-cell-foot');
  foot.append(make('span', 'tr-cell-cost', cell.cost));
  if (cell.status !== '') foot.append(make('span', 'tr-cell-status', cell.status));
  node.append(foot);
  if (cell.why !== null) node.title = cell.why;
  return node;
}

// A column of the grid: the branch's name, its versions down a trace, LOCK RANGE beside them (each lock level hangs from
// the row it needs: LOCK 270 from v1, LOCK 810 from LOCK 270), and on a phone its accordion head.
function branchNode(branch: TrainingBranch, open: boolean): HTMLElement {
  const node = make('div', 'tr-branch');
  node.dataset.skill = branch.skill;
  node.classList.toggle('open', open);
  node.classList.toggle('has-side', branch.locks.length > 0);
  const head = make('button', 'tr-branch-head');
  head.tabIndex = -1;
  head.dataset.branch = branch.skill;
  head.append(make('span', 'tr-branch-name', branch.branch), make('span', 'tr-branch-skill', branch.name));
  const body = make('div', 'tr-branch-body');
  const main = make('div', 'tr-col tr-col-main');
  branch.versions.forEach((cell, i) => {
    if (i > 0) main.appendChild(make('div', `tr-trace${cell.lit ? ' lit' : ''}`));
    main.appendChild(cellNode(cell));
  });
  body.appendChild(main);
  if (branch.locks.length > 0) {
    const side = make('div', 'tr-col tr-col-side');
    side.appendChild(make('div', 'tr-side-label', TRAINING_TEXT.lockMode));
    branch.locks.forEach((cell) => {
      const row = make('div', 'tr-side-row');
      row.append(make('span', `tr-trace tr-trace-side${cell.lit ? ' lit' : ''}`), cellNode(cell));
      side.appendChild(row);
    });
    body.appendChild(side);
  }
  node.append(head, body);
  return node;
}

function cardNode(card: TrainingCard): HTMLButtonElement {
  const node = make('button', 'tr-card');
  node.tabIndex = -1;
  node.dataset.card = card.key;
  node.classList.toggle('selected', card.selected);
  node.classList.toggle('trained', card.trained);
  const top = make('span', 'tr-card-top');
  top.append(make('kbd', 'keycap', card.key), make('span', 'tr-card-name', card.name));
  node.append(top, svgNode(demoSvg(card.demo)), make('span', 'tr-card-pitch', card.pitch), make('span', 'tr-card-cost', card.cost));
  if (card.trained) node.appendChild(make('span', 'tr-card-stamp', TRAINING_TEXT.stamped));
  return node;
}

// The TRAIN button with its bar (patched each frame while it fills: paintHold).
function actionNode(detail: TrainingDetail | null): HTMLElement | null {
  const action = detail?.action ?? null;
  if (action === null) return null;
  const box = make('div', `tr-action kind-${action.kind}`);
  const button = make('button', 'tr-train');
  button.tabIndex = -1;
  button.dataset.action = action.kind;
  button.classList.toggle('waiting', !action.enabled);
  renderKeyCaps(button, action.label);
  const bar = make('div', 'tr-hold');
  bar.append(make('div', 'tr-hold-fill'), make('div', 'tr-hold-text'));
  box.append(button, bar);
  if (action.why !== null) box.appendChild(make('div', 'tr-why', action.why));
  return box;
}

function detailNode(detail: TrainingDetail): HTMLElement {
  const box = make('div', `tr-detail look-${detail.cell.look}`);
  const head = make('div', 'tr-detail-head');
  head.append(make('span', 'tr-detail-name', detail.cell.name));
  box.append(head, svgNode(demoSvg(detail.demo)));
  const lines = make('div', 'tr-detail-lines');
  detail.lines.forEach((line, i) => lines.appendChild(make('div', `tr-detail-line line-${i}`, line)));
  if (detail.status !== null) lines.appendChild(make('div', 'tr-detail-status', detail.status));
  box.appendChild(lines);
  const action = actionNode(detail);
  if (action !== null) box.appendChild(action);
  return box;
}

// The ledger's rows, each with UNDO while the purchase can be taken back.
function ledgerNode(ledger: Readonly<CyclesLedger>): HTMLElement {
  const box = make('div', 'tr-ledger');
  for (const entry of ledger.rows) {
    const line = make('div', `tr-ledger-row kind-${entry.kind}`);
    line.append(make('span', 'tr-ledger-amount', entry.amountText), make('span', 'tr-ledger-text', entry.text));
    if (entry.undo !== null) {
      const undo = make('button', 'tr-undo', TRAINING_TEXT.undo);
      undo.tabIndex = -1;
      undo.dataset.undo = String(entry.undo);
      line.appendChild(undo);
    }
    box.appendChild(line);
  }
  return box;
}

// What the window shows, as opposed to how far a bar has filled or the bank has rolled: a change here repaints it whole.
function structureKey(model: Readonly<TrainingModel>, ledger: Readonly<CyclesLedger>, openBranch: string | null): string {
  return JSON.stringify([
    model.visit, model.firstPick, model.title, model.bank, model.control, model.cards, model.closed, ledger.rows,
    model.branches.map((branch) => [branch.skill, branch.versions, branch.locks]), model.detail,
    model.ahead, model.aheadSite, model.preview, model.lastUnitLine, model.hold !== null, model.holdText, openBranch,
  ]);
}

export function mountTrainingWindow(store: Store<GameState>): TrainingWindowView {
  const root = make('div', 'desk-training');
  const phone = window.matchMedia(PHONE_QUERY);
  let lastKey = '';
  let shownBank: number | null = null;
  let rollFrom = 0;
  let rollStartMs = 0;
  let frame: number | null = null;
  let lastFrameMs = 0;
  let chirpIn = 0;
  // The phone's accordion: the branch whose cells show (the newest open branch until the kid opens another).
  let openBranch: string | null = null;
  let bankEl: HTMLElement | null = null;

  const reduced = (): boolean => store.getState().ui.reducedMotion;

  function paintBank(model: Readonly<TrainingModel>): void {
    if (bankEl === null) return;
    // Only a purchase rolls the counter down; a bank that grows (a new desk, a grant, an UNDO) just shows.
    if (shownBank === null || reduced() || (model.bank > shownBank && rollStartMs === 0)) {
      shownBank = model.bank;
    } else if (shownBank !== model.bank && rollStartMs === 0) {
      rollFrom = shownBank;
      rollStartMs = performance.now();
      ensureFrame();
    }
    if (rollStartMs > 0) {
      const t = Math.min(1, (performance.now() - rollStartMs) / 1000 / TRAINING_BANK_ROLL_SEC);
      const value = Math.round(rollFrom + (model.bank - rollFrom) * t);
      bankEl.textContent = TRAINING_TEXT.bank(value);
      if (t >= 1) { rollStartMs = 0; shownBank = model.bank; }
      return;
    }
    bankEl.textContent = TRAINING_TEXT.bank(model.bank);
  }

  function paintHold(model: Readonly<TrainingModel>): void {
    const bar = root.querySelector<HTMLElement>('.tr-hold');
    if (bar === null) return;
    bar.classList.toggle('on', model.hold !== null);
    const fill = bar.querySelector<HTMLElement>('.tr-hold-fill');
    const text = bar.querySelector<HTMLElement>('.tr-hold-text');
    if (fill) fill.style.width = `${((model.hold ?? 0) * 100).toFixed(1)}%`;
    if (text) text.textContent = model.holdText ?? '';
  }

  function render(model: Readonly<TrainingModel>, ledger: Readonly<CyclesLedger>): void {
    const parts: HTMLElement[] = [];
    const head = make('div', 'rp-half-head tr-head');
    head.title = TRAINING_TEXT.bankWhy;
    bankEl = make('div', 'tr-bank', TRAINING_TEXT.bank(shownBank ?? model.bank));
    head.append(halfHead(model.title, TRAINING_TEXT.key), bankEl);
    parts.push(head, ledgerNode(ledger));
    if (model.control !== null) {
      const control = make('div', 'tr-control');
      control.append(make('span', 'tr-control-tag', TRAINING_TEXT.controlTag), make('span', 'tr-control-text', model.control));
      parts.push(control);
    }

    if (model.firstPick) {
      parts.push(make('div', 'tr-choose', TRAINING_TEXT.chooseFirst));
      const cards = make('div', 'tr-cards');
      cards.append(...model.cards.map(cardNode));
      parts.push(cards);
      const action = actionNode(model.detail);
      if (action !== null) parts.push(action);
    } else {
      const grid = make('div', 'tr-grid');
      const open = openBranch ?? model.branches.find((branch) => branch.newest)?.skill ?? null;
      grid.append(...model.branches.map((branch) => branchNode(branch, !phone.matches || branch.skill === open)));
      parts.push(grid);
      if (model.closed.length > 0) {
        const closed = make('div', 'tr-closed');
        for (const branch of model.closed) {
          const row = make('div', 'tr-closed-row');
          row.title = branch.why;
          row.append(make('span', 'tr-closed-name', branch.name), make('span', 'tr-closed-why', TRAINING_TEXT.notYet));
          closed.appendChild(row);
        }
        parts.push(closed);
      }
      parts.push(make('div', 'tr-legend', TRAINING_TEXT.costLegend));
      if (model.detail !== null) parts.push(detailNode(model.detail));
    }

    const ahead = make('div', 'tr-ahead');
    if (model.ahead !== null) ahead.appendChild(make('div', 'tr-ahead-line', model.ahead));
    // Slice 6 (R15): the selected ship's site data, a second line (the AHEAD line is 69 characters at its worst).
    if (model.aheadSite !== null) ahead.appendChild(make('div', 'tr-ahead-line tr-ahead-site', model.aheadSite));
    if (model.preview !== null) {
      const preview = make('div', `tr-preview tone-${model.preview.tone}`, model.preview.text);
      preview.dataset.binding = model.preview.binding;
      ahead.appendChild(preview);
      if (model.preview.hint !== null) ahead.appendChild(make('div', 'tr-hint', model.preview.hint));
    }
    if (ahead.childElementCount > 0) parts.push(ahead);
    if (model.lastUnitLine !== null) parts.push(make('div', 'tr-last', model.lastUnitLine));
    root.replaceChildren(...parts);
    root.classList.toggle('first-pick', model.firstPick);
    root.classList.toggle('reduced', reduced());
  }

  function paint(): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    const model = trainingModel(state);
    const ledger = cyclesLedger(state);
    const key = structureKey(model, ledger, openBranch);
    if (key !== lastKey) {
      lastKey = key;
      render(model, ledger);
    }
    paintBank(model);
    paintHold(model);
    if (model.hold !== null) ensureFrame();
  }

  // One frame loop for the TRAIN bar and the rolling bank, on wall time; it stops when neither moves.
  function ensureFrame(): void {
    if (frame !== null) return;
    lastFrameMs = performance.now();
    frame = requestAnimationFrame(onFrame);
  }
  function onFrame(now: number): void {
    frame = null;
    const dtSec = Math.min(WALL_FRAME_MAX_SEC, Math.max(0, (now - lastFrameMs) / 1000));
    lastFrameMs = now;
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    if (state.ui.trainingHoldSec !== null) {
      chirpIn -= dtSec;
      if (chirpIn <= 0) { play('opChirp'); chirpIn = TRAINING_CHIRP_SEC; }
      const kind = trainingModel(state).detail?.action?.kind ?? 'train';
      const result = advanceTrainingHold(store, dtSec);
      if (result === 'done') play(kind === 'restore' ? 'driverSaved' : 'lockArp');
      else if (result !== 'filling') play('buzz');
    }
    paint();
    if (store.getState().ui.trainingHoldSec !== null || rollStartMs > 0) ensureFrame();
  }

  function press(): boolean {
    const state = store.getState();
    if (state.run.phase !== 'desk' || state.ui.trainingHoldSec !== null) return state.ui.trainingHoldSec !== null;
    const action = trainingModel(state).detail?.action ?? null;
    if (action === null) return false;
    if (!startTrainingHold(store)) { play('buzz'); return true; }
    chirpIn = 0;
    paint();
    ensureFrame();
    return true;
  }

  function card(index: number): boolean {
    const model = trainingModel(store.getState());
    const picked = model.cards[index];
    if (!model.firstPick || picked === undefined) return false;
    selectTrainingCell(store, picked.skill, { kind: 'version', version: 1 });
    paint();
    return true;
  }

  function step(dir: 1 | -1): boolean {
    if (trainingModel(store.getState()).firstPick) return false;
    stepTrainingCell(store, dir);
    paint();
    return true;
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target === null) return;
    const undo = target.closest<HTMLElement>('[data-undo]');
    if (undo) {
      event.stopPropagation();
      undoTraining(store, Number(undo.dataset.undo));
      play('chime', { falling: true });
      paint();
      return;
    }
    if (target.closest('[data-action]')) { event.stopPropagation(); press(); return; }
    const cardEl = target.closest<HTMLElement>('[data-card]');
    if (cardEl) { event.stopPropagation(); card(Number(cardEl.dataset.card) - 1); return; }
    const head = target.closest<HTMLElement>('[data-branch]');
    if (head && phone.matches) {
      event.stopPropagation();
      openBranch = head.dataset.branch ?? null;
      paint();
      return;
    }
    const cellEl = target.closest<HTMLElement>('[data-cell]');
    if (cellEl) {
      event.stopPropagation();
      const cell = trainingModel(store.getState()).cells.find((candidate) => candidate.key === cellEl.dataset.cell);
      if (cell === undefined) throw new Error(`TrainingWindow: a cell on screen ('${cellEl.dataset.cell}') is not in the model`);
      selectTrainingCell(store, cell.skill, cell.row);
      paint();
    }
  };
  root.addEventListener('click', onClick);
  const unsub = store.subscribe(
    (s) => `${s.run.phase}|${s.ui.deskWindow ?? ''}|${s.ui.deskSelected ?? ''}|${JSON.stringify(s.ui.trainingSel)}|${s.ui.trainingHoldSec === null ? 0 : 1}`
      + `|${s.ui.trainingArmed ? 1 : 0}`
      + `|${s.run.skills.pending.length}|${s.memory.length}`,
    () => paint(),
  );

  return {
    root, paint, press, card, step,
    cancel: () => { cancelTrainingHold(store); paint(); },
    destroy: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      root.removeEventListener('click', onClick);
      unsub();
    },
  };
}
