import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { chargeLeft, getFreeTotal, healthKnown, hasIntegrity } from '@state/selectors';
import { INTEGRITY_MAX } from '@data/tuning';
import { onOpsChange } from '@systems/ops-core';
import { totalBlocks } from '@systems/memory-ops';
import { formatCount } from '@data/script';
import { RACK_NAMES, hexAddr } from '@data/memory';
import { requireById } from '@components/dom';

// The stats row over the strip (§7.1: a computed `.mem-stats`) and the strip's header. Every number
// is read from memory, nothing is written in the page: the colonists whose drivers are still in memory (pods aboard),
// the REPAIR CHARGE left, the free blocks, the damage
// the kid can see, and the memory's size. Repainted when memory changes (memoryRev) and while a
// repair spends charge point by point (op progress, without a store update).

type MemStatKey = 'pods' | 'charge' | 'free' | 'damage' | 'total';
type MemStatTone = 'plain' | 'soul' | 'warn' | 'unknown' | 'good';

interface MemStat {
  key: MemStatKey;
  label: string;
  value: string;
  small: string;
  tone: MemStatTone;
}

// The damage a kid can see, in blocks: (100 − integrity)% of every file they may look at, whatever
// its health word (Engine I/O at 85% still reads "intact" but is 1.2 blocks short). Unscanned ship
// files hide theirs by design (an unscanned Bay Ctrl at 71% must not leak here); `hidden`
// says some damage could be out of sight, so a 0 doesn't read as "verified clean". INSPECT's overview
// reads the same number (DetailPanel; final review: it counted only CORRUPT and PARTIAL files, so the
// two DAMAGE readouts on one screen disagreed).
export function visibleDamage(state: Readonly<GameState>): { blocks: number; hidden: boolean } {
  let blocks = 0;
  let hidden = false;
  for (const seg of state.memory) {
    if (!healthKnown(seg)) { hidden = true; continue; }
    if (hasIntegrity(seg)) blocks += ((INTEGRITY_MAX - seg.integrity) / INTEGRITY_MAX) * seg.size;
  }
  return { blocks: Math.round(blocks), hidden };
}

// DAMAGE, not CORRUPT: it counts every visible file's missing integrity, while the sidebar's
// STATUS · CORRUPT counts files in the failing or dead bands; one word for both read as a lie
// (`CORRUPT 5 blk` beside `0 CORRUPT`).
export function memStatsModel(state: Readonly<GameState>): Record<MemStatKey, MemStat> {
  const total = totalBlocks(state.memory);
  // The pods still aboard (01-landing §3.10: aboard until launched, whether or not their driver is still in memory) and
  // the people in them. (The tone names the colonists' green, the --soul colour token.)
  const aboard = state.landing.pods.filter((record) => record.fate.kind === 'aboard');
  const people = aboard.reduce((sum, record) => sum + record.colonists, 0);
  const damage = visibleDamage(state);
  return {
    pods: {
      key: 'pods', label: 'pods aboard', value: String(aboard.length), small: `${formatCount(people)} colonists`, tone: 'soul',
    },
    charge: { key: 'charge', label: 'repair charge', value: String(chargeLeft(state)), small: 'blk', tone: 'plain' },
    free: { key: 'free', label: 'free', value: String(getFreeTotal(state)), small: 'blk', tone: 'plain' },
    damage: damage.blocks > 0
      ? { key: 'damage', label: 'damage', value: String(damage.blocks), small: 'blk', tone: 'warn' }
      : damage.hidden
        ? { key: 'damage', label: 'damage', value: '—', small: 'unscanned', tone: 'unknown' }
        : { key: 'damage', label: 'damage', value: '0', small: 'blk', tone: 'good' },
    total: { key: 'total', label: 'memory', value: String(total), small: `blk · ${RACK_NAMES.length} racks`, tone: 'plain' },
  };
}

// The strip header's address range, rack by rack: `RACK A → F · 0x000 → 0x17F`.
export function stripRangeLabel(state: Readonly<GameState>): string {
  const total = totalBlocks(state.memory);
  return `RACK ${RACK_NAMES[0]} → ${RACK_NAMES[RACK_NAMES.length - 1]} · ${hexAddr(0)} → ${hexAddr(total - 1)}`;
}

const STAT_IDS: Readonly<Record<MemStatKey, string>> = {
  pods: 'statPods',
  charge: 'statRedund',
  free: 'statFree',
  damage: 'statDamage',
  total: 'statTotal',
};

export function mountMemoryStats(store: Store<GameState>): () => void {
  const statEls = Object.fromEntries(
    (Object.keys(STAT_IDS) as MemStatKey[]).map((key) => [key, requireById(STAT_IDS[key])]),
  ) as Record<MemStatKey, HTMLElement>;
  // Each value's label is the `.lbl` beside it (the colonists' one changes at the reveal).
  const labelEls = Object.fromEntries((Object.keys(STAT_IDS) as MemStatKey[]).map((key) => {
    const label = statEls[key].parentElement?.querySelector<HTMLElement>('.lbl');
    if (!label) throw new Error(`#${STAT_IDS[key]} has no .lbl beside it in index.html`);
    return [key, label];
  })) as Record<MemStatKey, HTMLElement>;
  const shipEl = requireById('memShip');
  const rangeEl = requireById('memRange');

  const lastHtml = new Map<MemStatKey, string>();
  function paint(state: Readonly<GameState>): void {
    const model = memStatsModel(state);
    for (const key of Object.keys(model) as MemStatKey[]) {
      const stat = model[key];
      const html = `${stat.value} <span class="small">${stat.small}</span>`;
      if (labelEls[key].textContent !== stat.label) labelEls[key].textContent = stat.label;
      if (lastHtml.get(key) === html) continue;
      lastHtml.set(key, html);
      const element = statEls[key];
      element.className = stat.tone === 'plain' ? 'v' : `v ${stat.tone}`;
      element.innerHTML = html;
    }
    if (shipEl.textContent !== state.level.shipName) shipEl.textContent = state.level.shipName;
    const range = stripRangeLabel(state);
    if (rangeEl.textContent !== range) rangeEl.textContent = range;
  }

  paint(store.getState());
  const unsub = store.subscribe((s) => s.ui.memoryRev, () => paint(store.getState()));
  const offOps = onOpsChange((change) => {
    if (change.type === 'progress' && change.operation.kind === 'repair') paint(store.getState());
  });

  return () => { unsub(); offOps(); };
}
