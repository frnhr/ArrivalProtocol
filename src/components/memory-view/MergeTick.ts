import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { mergeTickCharge } from '@systems/finale';
import { onOpsChange } from '@systems/ops-core';
import { chargeLeft } from '@state/selectors';
import { requireById, partNumber } from '@components/dom';
import { MERGE_TICK_TEXT } from '@data/hollow-text';

// The `MERGE 20` tick on the charge readouts (§7.1 `.mem-stats`, §9 WP11 item 1): on the flagship, from its boot until
// the finale is decided (systems/finale.ts mergeTickCharge), MERGE's price stands beside every REPAIR CHARGE readout:
// the stats row over the strip (`MERGE 20`), the footer, the amber MIND chip (`/20`), and as a tick on the REPAIR
// CHARGE pool itself at its 20th block. In HOLLOW's pink while the charge is short of it, green with ✓ once it covers
// it: the kid sees what a repair costs against it all the way through the last ship. Its tooltip only remembers what
// was asked on VESPER (`keep 20 charge for me`): what MERGE is waits for the choice.
// The strip's tick is re-placed after every strip rebuild (subscribed after MemoryStrip); the readouts follow the
// charge as a repair spends it in place (op progress).

export function mountMergeTick(store: Store<GameState>, memWrap: HTMLElement): () => void {
  const statEl = requireById('statMergeTick');
  const footEl = requireById('footMergeTick');
  const chipEl = requireById('mindChipMergeTick');
  let lastKey = '';

  function paintReadouts(force: boolean): void {
    const state = store.getState();
    const cost = mergeTickCharge(state);
    const charge = chargeLeft(state);
    const key = `${cost}|${charge}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    for (const element of [statEl, footEl, chipEl]) {
      element.hidden = cost === null;
      if (cost === null) continue;
      const met = charge >= cost;
      const word = element === chipEl ? MERGE_TICK_TEXT.short(cost) : MERGE_TICK_TEXT.label(cost);
      element.textContent = `${word}${met ? ` ${MERGE_TICK_TEXT.met}` : ''}`;
      element.classList.toggle('met', met);
      element.title = MERGE_TICK_TEXT.title(cost);
    }
    paintPool(cost, charge);
  }

  // The tick on the pool: in the part of the REPAIR CHARGE file that holds its cost-th block (a pool smaller than the
  // price gets it on its right edge, past its end).
  function paintPool(cost: number | null, charge: number): void {
    memWrap.querySelectorAll('.merge-tick-mark').forEach((mark) => mark.remove());
    if (cost === null) return;
    const parts = Array.from(memWrap.querySelectorAll<HTMLElement>('.seg.redundancy'));
    if (parts.length === 0) return;
    const poolSize = parts.reduce((sum, part) => sum + partNumber(part, 'partSize'), 0);
    const beyond = cost > poolSize;
    for (const part of parts) {
      const offset = partNumber(part, 'partOffset');
      const size = partNumber(part, 'partSize');
      const isLast = offset + size >= poolSize;
      const inside = cost > offset && cost <= offset + size;
      if (!inside && !(beyond && isLast)) continue;
      const mark = document.createElement('span');
      mark.className = `merge-tick-mark${charge >= cost ? ' met' : ''}${beyond ? ' beyond' : ''}`;
      mark.style.left = `${beyond ? 100 : ((cost - offset) / size) * 100}%`;
      // The label is drawn by CSS from data-label (the mark itself is a zero-width line).
      mark.dataset.label = MERGE_TICK_TEXT.label(cost);
      mark.title = MERGE_TICK_TEXT.title(cost);
      mark.setAttribute('aria-hidden', 'true');
      part.appendChild(mark);
    }
  }

  paintReadouts(true);
  const unsub = store.subscribe((s) => `${s.ui.memoryRev}|${s.hollow.finale.phase}|${s.run.shipIndex}`, () => paintReadouts(true));
  const offOps = onOpsChange((change) => {
    if (change.type === 'progress' && change.operation.kind === 'repair') paintReadouts(false);
  });
  return () => { unsub(); offOps(); };
}
