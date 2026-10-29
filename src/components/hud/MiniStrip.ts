import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { miniStripRows, type MiniCell } from '@systems/hollow-hud';
import { requireById } from '@components/dom';
import { RACK_NAMES } from '@data/memory';
import { MINI_STRIP_PAINT_HZ } from '@data/tuning';
import { IS_DEV } from '@/env';

// The amber mini-strip (§7.1, §9 WP6 item 10): the memory at a glance from the ship, inside the MIND
// chip above the screen toggle (a click on the chip jacks in). One row per rack, each segment a cell
// as wide as its blocks: the pods' drivers in the colonists' mint (yellow while a pod would land hard), the thing
// eating them red and pulsing, an infected file blinking with its eaten share in red from the side
// HOLLOW bites (a hatch while its health is unknown), and green while a repair pushes back. So a kid
// burning in amber sees the red creep into C12 without leaving the ship.
// Rebuilt on a discrete change (memoryRev, the reveal, HOLLOW's phase, coming back to amber); in
// between the red shares and the colours are patched at most MINI_STRIP_PAINT_HZ. Painted only while
// amber shows it: in blue the chip is hidden and the strip itself is in view.

const PAINT_EVERY_SEC = 1 / MINI_STRIP_PAINT_HZ;

function cellClass(cell: MiniCell): string {
  let cls = `ms-cell ms-${cell.kind}`;
  if (cell.infected !== null) cls += ` ms-infected from-${cell.infected}${cell.eatenPct === null ? ' ms-unknown' : ''}`;
  if (cell.healing) cls += ' ms-healing';
  return cls;
}

function paintCell(cellElement: HTMLElement, cell: MiniCell): void {
  const cls = cellClass(cell);
  if (cellElement.className !== cls) cellElement.className = cls;
  const eaten = cell.eatenPct === null ? '' : `${cell.eatenPct.toFixed(1)}%`;
  if (cellElement.style.getPropertyValue('--eaten') !== eaten) cellElement.style.setProperty('--eaten', eaten);
}

function makeCell(cell: MiniCell): HTMLElement {
  const cellElement = document.createElement('span');
  cellElement.dataset.id = cell.segId;
  cellElement.style.flexGrow = String(cell.blocks);
  paintCell(cellElement, cell);
  return cellElement;
}

function rackName(rack: number): string {
  const name = RACK_NAMES[rack];
  if (name === undefined) throw new Error(`MiniStrip: no RACK_NAMES entry for rack ${rack}`);
  return name;
}

export function mountMiniStrip(store: Store<GameState>): () => void {
  const root = requireById('miniStrip');
  const inAmber = (): boolean => store.getState().ui.mode === 'tools';

  function build(): void {
    const rows = miniStripRows(store.getState());
    root.replaceChildren(...rows.map((cells, rack) => {
      const row = document.createElement('span');
      row.className = 'ms-row';
      row.dataset.rack = rackName(rack);
      row.append(...cells.map(makeCell));
      return row;
    }));
  }

  // The same cells in the same order as the last build: only numbers move between rebuilds. A layout
  // that changed without a memoryRev is a missed rebuild somewhere else (a memory change that forgot
  // its bump), so in dev it throws, like assertMemoryInvariants; a release build redraws instead of
  // stopping the game's tick over a picture.
  function missedRebuild(why: string): void {
    if (IS_DEV) throw new Error(`MiniStrip: the memory changed without a memoryRev bump (${why})`);
    build();
  }

  function patch(): void {
    const rows = miniStripRows(store.getState());
    const rowElements = root.children;
    for (let rack = 0; rack < rows.length; rack++) {
      const cells = rows[rack]!;
      const cellElements = rowElements[rack]?.children;
      if (!cellElements || cellElements.length !== cells.length) { missedRebuild(`rack ${rackName(rack)} has a new cell count`); return; }
      for (let i = 0; i < cells.length; i++) {
        const cellElement = cellElements[i] as HTMLElement;
        if (cellElement.dataset.id !== cells[i]!.segId) { missedRebuild(`rack ${rackName(rack)} has a new file at cell ${i}`); return; }
        paintCell(cellElement, cells[i]!);
      }
    }
  }

  build();
  const unsub = store.subscribe(
    (s) => `${s.ui.memoryRev}|${s.ui.mode}|${s.hollow.phase}`,
    () => { if (inAmber()) build(); },
  );
  let sincePaint = 0;
  const offTick = onPostTick((dtWall) => {
    sincePaint += dtWall;
    if (sincePaint < PAINT_EVERY_SEC || !inAmber()) return;
    sincePaint = 0;
    patch();
  });

  return () => {
    unsub();
    offTick();
  };
}
