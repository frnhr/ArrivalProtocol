// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.10, §4.1; R19, R22, R23):
// the FINAL CARD after the EPILOGUE: the ending's title in its colour (PURGE cold white, MERGE pink into blue, SPARE green
// leaving amber, UNRESOLVED HOLLOW's dim pink; a lost run's in the warning colour), the endings found in two rows (lit, this
// run's marked, or `???` dim), the `NEXT RUN:` lines (7c's; their room kept, R12), the bridging line (moved from RUN END:
// run-end.ts runEndNext, review m10) and NEW RUN ▸ [ENTER], armed after FINAL_CARD_ARM_SEC. Mounted by main.ts after
// mountRunEnd, on index.html's #finalCard. Track CHART (7c) fills the NEXT RUN rows in its marked lines.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { finalCardModel, type FinalCardModel, type FinalCardPiece } from '@systems/epilogue';
import { startRun } from '@systems/run';
import { archiveLineage, archiveMeta } from '@systems/meta';
import { newRunSeed } from '@systems/rng';
import { registerKeys } from '@systems/input';
import { play } from '@systems/audio';
import { requireById, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { EPILOGUE_TEXT } from '@data/epilogue-text';
import { FINAL_CARD_ARM_SEC } from '@data/tuning';

function rowNode(label: string, pieces: readonly FinalCardPiece[]): HTMLElement {
  const row = make('div', 'nf-row');
  row.appendChild(make('span', 'nf-row-label', label));
  for (const piece of pieces) {
    row.appendChild(make('span', 'nf-sep', '·'));
    row.appendChild(make('span', `nf-piece${piece.found ? ' found' : ''}${piece.now ? ' now' : ''}`, piece.text));
  }
  row.setAttribute('aria-label', [label, ...pieces.map((piece) => piece.text)].join(' · '));
  return row;
}

// --- 7c CHART: one NEXT RUN line as two unbreakable parts, `NEXT RUN: + what it gives` and `· − what it costs`, so a narrow
// card (the phone) wraps between the gain and the cost, never inside either (desk.css's 7c CHART block) ---
function nextLineNode(line: string): HTMLElement {
  const node = make('div', 'nf-next-line');
  const cut = line.lastIndexOf(' · −');
  if (cut < 0) node.appendChild(make('span', 'nf-next-part', line));
  else node.append(make('span', 'nf-next-part', line.slice(0, cut)), ' ', make('span', 'nf-next-part', line.slice(cut + 1)));
  return node;
}
// --- end of 7c CHART ---

export function mountFinalCard(store: Store<GameState>): () => void {
  const root = requireById('finalCard');
  root.hidden = true;
  const inner = make('div', 'nf-inner');
  const kickerEl = make('div', 'nf-kicker');
  const titleEl = make('div', 'nf-title');
  const endingsEl = make('div', 'nf-endings');
  const rowsEl = make('div', 'nf-rows');
  // --- 7c CHART: the NEXT RUN rows (traceNextLines through the model); their room is kept while there are none (R12) ---
  const nextEl = make('div', 'nf-next');
  // --- end of 7c CHART's rows ---
  const bridgeEl = make('div', 'nf-bridge');
  const newBtn = make('button', 'nf-new');
  newBtn.tabIndex = -1;
  const foot = make('div', 'nf-foot');
  foot.appendChild(newBtn);
  inner.append(kickerEl, titleEl, endingsEl, rowsEl, nextEl, bridgeEl, foot);
  root.replaceChildren(inner);

  let model: FinalCardModel | null = null;
  let armTimer: ReturnType<typeof setTimeout> | null = null;
  let inputFromMs = Infinity;

  function open(card: FinalCardModel): void {
    model = card;
    kickerEl.textContent = card.kicker;
    titleEl.textContent = card.title;
    const hollow = card.ending?.hollow ?? null;
    for (const fate of ['purge', 'merge', 'spare', 'followed'] as const) root.classList.toggle(`ending-${fate}`, hollow === fate);
    root.classList.toggle('lost', card.ending === null);
    root.classList.toggle('reduced', store.getState().ui.reducedMotion);
    endingsEl.textContent = card.endingsLine;
    rowsEl.replaceChildren(rowNode(EPILOGUE_TEXT.rowHollow, card.rows.hollow), rowNode(EPILOGUE_TEXT.rowYou, card.rows.you));
    // --- 7c CHART: the NEXT RUN rows ---
    nextEl.replaceChildren(...card.next.map(nextLineNode));
    // --- end of 7c CHART's rows ---
    bridgeEl.hidden = card.bridge === null;
    bridgeEl.replaceChildren(...(card.bridge === null ? [] : [
      make('div', 'nf-bridge-line', card.bridge.line), make('div', 'nf-bridge-tail', card.bridge.tail),
    ]));
    renderKeyCaps(newBtn, card.newRun, { own: 'SPACE' });
    newBtn.classList.add('arming');
    root.hidden = false;
    play('stampHit', { heavy: card.ending === null });
    inputFromMs = performance.now() + FINAL_CARD_ARM_SEC * 1000;
    if (armTimer !== null) clearTimeout(armTimer);
    armTimer = setTimeout(() => newBtn.classList.remove('arming'), FINAL_CARD_ARM_SEC * 1000);
  }

  function close(): void {
    if (armTimer !== null) clearTimeout(armTimer);
    armTimer = null;
    model = null;
    inputFromMs = Infinity;
    root.hidden = true;
  }

  // NEW RUN: a fresh run in the page (the title card again), the archive's next unit.
  function newRun(): void {
    if (model === null || performance.now() < inputFromMs || store.getState().ui.runEndStage !== 'final') return;
    startRun(store, newRunSeed(), archiveLineage());
  }

  const sync = (): void => {
    const state = store.getState();
    if (state.run.phase !== 'end' || state.ui.runEndStage !== 'final') {
      close();
      return;
    }
    if (model !== null) return;
    const card = finalCardModel(state, state.archive.status === 'ok' ? archiveMeta() : null);
    // No card (never at a run end, kept as the stub's way on): deferred, never an update inside the store's fan-out.
    if (card === null) queueMicrotask(() => { if (store.getState().ui.runEndStage === 'final') startRun(store, newRunSeed(), archiveLineage()); });
    else open(card);
  };
  const onClick = (event: MouseEvent): void => { event.stopPropagation(); newRun(); };
  newBtn.addEventListener('click', onClick);
  const offKeys = registerKeys({ layer: 'end', codes: ['Space', 'Enter', 'NumpadEnter'], onDown: newRun });
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.runEndStage}`, sync);
  sync();
  return () => {
    newBtn.removeEventListener('click', onClick);
    offKeys();
    unsub();
    close();
  };
}
