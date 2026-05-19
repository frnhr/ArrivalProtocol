import type { Segment, FsToolSegment, RedundancySegment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { getFsTool, getRedundancy, selectCorruption } from '@state/selectors';
import { getActiveOpCount } from '@systems/ops';
import { TYPE_LABELS } from '@data/type-labels';
import { TOOL_MAX_VERSION } from '@data/fs-tools';

export type DetailActionId =
  | 'repair' | 'swap' | 'activate' | 'delete_redund' | 'scan'
  | 'install' | 'noop';

interface ActionOption {
  id: DetailActionId;
  label: string;
  cost?: string;
  cls?: string;
  disabled?: boolean;
}

export interface ComputedActions {
  primary: ActionOption[];
  demoHtml: string;
}

export interface ComputeActionsDeps {
  getFsTool: (kind: 'scan' | 'repair' | 'move' | 'copy' | 'delete') => FsToolSegment | undefined;
  getRedundancy: () => RedundancySegment | undefined;
}

export interface RenderDetailDeps extends ComputeActionsDeps {
  onAction: (seg: Segment, actionId: DetailActionId) => void;
  onCorruptionSliderInput?: (pct: number) => void;
  // current global corruption 0..1, used to initialize the demo slider
  getCorruption?: () => number;
  // Demo: live-tweak the AI Core's concurrency capacity (1..15).
  onCapacitySliderInput?: (n: number) => void;
  // Demo: bump a specific fs-tool segment's version. Receives the seg id so
  // multiple tool copies (Repair / Repair.bak) can be tweaked independently.
  onVersionSliderInput?: (segId: string, n: number) => void;
}

export function computeActions(seg: Segment, deps: ComputeActionsDeps): ComputedActions {
  const out: ComputedActions = { primary: [], demoHtml: '' };
  const repair = deps.getFsTool('repair');
  const scan = deps.getFsTool('scan');
  const redund = deps.getRedundancy();

  const state = 'state' in seg ? seg.state : undefined;
  const integrity = 'integrity' in seg ? seg.integrity : undefined;
  // Pre-scan segments: don't surface repair / swap / damage-aware buttons.
  // They would leak the very state the player hasn't discovered yet. Offer
  // only the Scan action so the discovery path is the obvious next step.
  const knownScanned = 'scanned' in seg ? seg.scanned : true;

  if (!knownScanned) {
    out.primary.push({
      id: 'scan', label: '◎ scan for integrity',
      cost: scan ? '1 tick' : 'no scan!',
      disabled: !scan, cls: scan ? '' : 'disabled',
    });
    return out;
  }
  // Post-scan: a re-scan refreshes the integrity readout. Useful once files
  // start degrading over time; currently mostly a no-op but always available.
  const canRescan = 'scanned' in seg;

  const isDamagedAi = (state === 'corrupt' || state === 'partial') &&
    (seg.type === 'tool' || seg.type === 'skill' || seg.type === 'fs-tool' || seg.type === 'core');

  if (isDamagedAi && integrity !== undefined) {
    const cost = Math.ceil(((100 - integrity) / 100) * seg.size * 2);
    const enough = !!redund && redund.used >= cost;
    const possible = !!repair && enough;
    out.primary.push({
      id: 'repair', label: '▸ repair with redundancy',
      cost: `cost ${cost}`, disabled: !possible,
      cls: possible ? '' : 'disabled',
    });
    if (!repair) {
      out.demoHtml += `<div style="font-size:10px;color:var(--warn);margin-top:6px;line-height:1.5">⚠ Repair utility is corrupted or missing. Locate Repair.bak or recover before further damage occurs.</div>`;
    } else if (!enough) {
      out.demoHtml += `<div style="font-size:10px;color:var(--text-dim);margin-top:6px;line-height:1.5">Insufficient redundancy. Need ${cost}, have ${redund?.used ?? 0}.</div>`;
    }
  }

  if ((state === 'corrupt' || state === 'partial') && seg.type === 'ship' && seg.backup) {
    out.primary.push({ id: 'swap', label: '⇄ swap to backup copy', cost: 'free', cls: 'swap' });
  }
  if ((state === 'corrupt' || state === 'partial') && seg.type === 'ship' && !seg.backup) {
    out.primary.push({ id: 'noop', label: '⊘ no repair available', cost: '—', disabled: true });
  }
  if (seg.type === 'ship-backup' && state === 'inactive') {
    out.primary.push({ id: 'activate', label: '▸ activate (replaces primary)', cost: 'free', cls: 'swap' });
  }
  if (seg.type === 'encrypted') {
    out.primary.push({ id: 'noop', label: '⊘ no decryption key', cost: '—', disabled: true });
  }
  if (seg.type === 'free') {
    out.primary.push({ id: 'install', label: '▸ install tool here', cost: 'free' });
  }
  if (canRescan) {
    out.primary.push({
      id: 'scan', label: '◎ re-scan',
      cost: scan ? '1 tick' : 'no scan!',
      disabled: !scan, cls: scan ? '' : 'disabled',
    });
  }

  return out;
}

function renderActionButton(a: ActionOption): string {
  const cls = `action-btn ${a.cls || ''} ${a.disabled ? 'disabled' : ''}`;
  return `<button class="${cls}" data-action="${a.id}">${a.label}<span class="cost">${a.cost || ''}</span></button>`;
}

function renderDemoBlock(currentCorruption: number): string {
  const pct = Math.round(currentCorruption * 100);
  return `
    <div class="demo-block">
      <div class="demo-label">// demo: ai core corruption</div>
      <div style="font-size:10px;color:var(--text);line-height:1.5;margin-bottom:8px">
        Damage to AI Core manifests as visual UI distortion. Drag slider to preview effect at varying integrity.
      </div>
      <input type="range" id="demoCorruptSlider" min="0" max="100" value="${pct}" style="--p:${pct}%">
      <div class="scale"><span>0</span><span>50</span><span>100</span></div>
    </div>`;
}

// Demo control to live-tweak an fs-tool segment's version. Slider range is
// 1..TOOL_MAX_VERSION for the tool kind. When max is 1, no upgrade exists
// yet — the slider is rendered disabled so the player can see that future
// versions are possible but none are currently available.
function renderVersionDemoBlock(seg: FsToolSegment): string {
  const max = TOOL_MAX_VERSION[seg.fsTool];
  const cur = Math.max(1, Math.min(max, seg.version));
  const range = max - 1;
  const pct = range > 0 ? Math.round(((cur - 1) / range) * 100) : 50;
  const disabled = max <= 1;
  return `
    <div class="demo-block${disabled ? ' disabled' : ''}">
      <div class="demo-label">// demo: tool version</div>
      <div style="font-size:10px;color:var(--text);line-height:1.5;margin-bottom:8px">
        ${disabled
          ? 'No upgrade path defined for this tool yet. Future revisions will unlock new behaviours.'
          : 'Drag to switch this tool between known revisions. Higher versions add capabilities (e.g. Repair v2 compacts the Redundancy segment).'}
      </div>
      <input type="range" id="demoVersionSlider" data-seg-id="${seg.id}" min="1" max="${Math.max(max, 1)}" value="${cur}" style="--p:${pct}%"${disabled ? ' disabled' : ''}>
      <div class="scale"><span>v1</span>${max > 1 ? `<span>v${max}</span>` : ''}</div>
    </div>`;
}

// Demo control to live-tweak the Core's concurrency capacity. Range 1..15
// covers everything from "single-threaded scarcity" to "unlimited-feeling"
// without crowding the segment visually. Uses the same slider styling as
// the corruption demo so the two blocks read as a matched pair.
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 15;
function renderCapacityDemoBlock(currentCapacity: number): string {
  const clamped = Math.max(CAPACITY_MIN, Math.min(CAPACITY_MAX, currentCapacity));
  const range = CAPACITY_MAX - CAPACITY_MIN;
  const pct = Math.round(((clamped - CAPACITY_MIN) / range) * 100);
  return `
    <div class="demo-block">
      <div class="demo-label">// demo: core threads</div>
      <div style="font-size:10px;color:var(--text);line-height:1.5;margin-bottom:8px">
        Concurrency cap. Each running filesystem op claims one thread. Drag to widen or tighten the budget.
      </div>
      <input type="range" id="demoCapacitySlider" min="${CAPACITY_MIN}" max="${CAPACITY_MAX}" value="${clamped}" style="--p:${pct}%">
      <div class="scale"><span>${CAPACITY_MIN}</span><span>${Math.round((CAPACITY_MIN + CAPACITY_MAX) / 2)}</span><span>${CAPACITY_MAX}</span></div>
    </div>`;
}

export function renderDetailPanel(target: HTMLElement, seg: Segment, deps: RenderDetailDeps): void {
  const typeLabel = TYPE_LABELS[seg.type] || seg.type;
  const state = 'state' in seg ? seg.state : undefined;
  const integrity = 'integrity' in seg ? seg.integrity : undefined;
  const knownScanned = 'scanned' in seg ? seg.scanned : true;

  let stateClass = '';
  let stateText = (state || 'intact').toUpperCase();
  if (!knownScanned) { stateClass = 'unknown'; stateText = 'UNSCANNED'; }
  else if (state === 'corrupt') stateClass = 'warn';
  else if (state === 'partial') stateClass = 'partial';
  else if (state === 'intact' || !state) { stateClass = 'good'; stateText = 'INTACT'; }
  if (knownScanned && integrity !== undefined && (state === 'corrupt' || state === 'partial')) {
    stateText += ` · ${integrity}%`;
  }

  let html = `
    <div class="detail-title">${seg.name}</div>
    <div class="detail-type">${typeLabel}</div>
    <div class="detail-row"><span class="k">size</span><span class="v">${seg.size} blocks</span></div>
    <div class="detail-row"><span class="k">state</span><span class="v ${stateClass}">${stateText}</span></div>`;

  if (seg.type === 'redundancy') {
    const wasted = Math.max(0, seg.size - seg.used);
    html += `<div class="detail-row"><span class="k">spent</span><span class="v partial">${seg.capacity - seg.used} / ${seg.capacity}</span></div>`;
    html += `<div class="detail-row"><span class="k">remaining</span><span class="v good">${seg.used} blk</span></div>`;
    html += `<div class="detail-row"><span class="k">footprint</span><span class="v">${seg.size} blk</span></div>`;
    if (wasted > 0) {
      html += `<div class="detail-row"><span class="k">reclaimable</span><span class="v partial">${wasted} blk · needs Repair v2</span></div>`;
    }
  }
  if (seg.type === 'core') {
    const inUse = getActiveOpCount();
    const atCap = inUse >= seg.capacity;
    html += `<div class="detail-row"><span class="k">threads</span><span class="v ${atCap ? 'warn' : 'good'}">${inUse} / ${seg.capacity}</span></div>`;
    if (atCap) {
      html += `<div class="detail-row"><span class="k">status</span><span class="v warn">at capacity — new ops refused</span></div>`;
    }
  }
  if (seg.type === 'ship' && seg.backup) {
    html += `<div class="detail-row"><span class="k">backup</span><span class="v partial">available ⊃</span></div>`;
  }
  // Pre-scan, the `desc` field (which carries lore about damage / cause) is
  // hidden — descs name specific corruption that the player shouldn't know yet.
  // After scan, the full description reveals the cause along with integrity.
  if (knownScanned) {
    html += `<div class="detail-desc">${seg.desc || '—'}</div>`;
  } else {
    html += `<div class="detail-desc"><em>Integrity unknown. Scan this segment to inspect its contents.</em></div>`;
  }

  const actions = computeActions(seg, deps);
  if (actions.primary.length || actions.demoHtml || seg.type === 'core') {
    if (actions.primary.length) {
      html += `<div class="action-section"><div class="action-section-label">primary</div>`;
      actions.primary.forEach((a) => { html += renderActionButton(a); });
      html += `</div>`;
    }
    if (actions.demoHtml) html += actions.demoHtml;
    if (seg.type === 'core' && deps.getCorruption) {
      html += renderDemoBlock(deps.getCorruption());
    }
    if (seg.type === 'core' && deps.onCapacitySliderInput) {
      html += renderCapacityDemoBlock(seg.capacity);
    }
    if (seg.type === 'fs-tool' && deps.onVersionSliderInput) {
      html += renderVersionDemoBlock(seg);
    }
  }

  target.innerHTML = html;

  target.querySelectorAll<HTMLButtonElement>('.action-btn').forEach((btn) => {
    if (btn.classList.contains('disabled')) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.action as DetailActionId | undefined;
      if (id) deps.onAction(seg, id);
    });
  });

  if (deps.onCorruptionSliderInput) {
    const slider = target.querySelector<HTMLInputElement>('#demoCorruptSlider');
    if (slider) {
      slider.addEventListener('input', (ev) => {
        const value = parseInt((ev.target as HTMLInputElement).value, 10);
        deps.onCorruptionSliderInput!(value);
      });
    }
  }
  if (deps.onCapacitySliderInput) {
    const slider = target.querySelector<HTMLInputElement>('#demoCapacitySlider');
    if (slider) {
      slider.addEventListener('input', (ev) => {
        const value = parseInt((ev.target as HTMLInputElement).value, 10);
        deps.onCapacitySliderInput!(value);
      });
    }
  }
  if (deps.onVersionSliderInput) {
    const slider = target.querySelector<HTMLInputElement>('#demoVersionSlider');
    if (slider && !slider.disabled) {
      slider.addEventListener('input', (ev) => {
        const el = ev.target as HTMLInputElement;
        const value = parseInt(el.value, 10);
        const segId = el.dataset.segId;
        if (segId) deps.onVersionSliderInput!(segId, value);
      });
    }
  }
}

// Renders a memory-bank overview shown when no segment is selected.
// Aggregates over state.memory: capacity, allocation, known damage, redundancy.
// "Known" damage excludes unscanned ship segments — the AI can't know their
// integrity until Scan reveals it.
function renderOverview(target: HTMLElement, state: GameState): void {
  const memory = state.memory;
  const total = memory.reduce((acc, m) => acc + m.size, 0);
  const free = memory.filter((m) => m.type === 'free').reduce((acc, m) => acc + m.size, 0);
  const used = total - free;
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;
  const freePct = total > 0 ? Math.round((free / total) * 100) : 0;

  let corruptCount = 0;
  let partialCount = 0;
  let damageBlocks = 0;
  let unscannedCount = 0;
  for (const seg of memory) {
    const segState = 'state' in seg ? seg.state : undefined;
    const integrity = 'integrity' in seg ? seg.integrity : undefined;
    // Any segment that carries a `scanned` field hides its damage until
    // scanned — applies uniformly across ship and AI memory.
    if ('scanned' in seg && !seg.scanned) { unscannedCount++; continue; }
    if (segState === 'corrupt') corruptCount++;
    if (segState === 'partial') partialCount++;
    if ((segState === 'corrupt' || segState === 'partial') && integrity !== undefined) {
      damageBlocks += ((100 - integrity) / 100) * seg.size;
    }
  }
  damageBlocks = Math.round(damageBlocks);

  const redund = getRedundancy(state);
  const redundLine = redund
    ? `<span class="v">${redund.used} / ${redund.capacity}</span>`
    : `<span class="v warn">none</span>`;

  const damageLine = damageBlocks > 0
    ? `<span class="v warn">~${damageBlocks} blk</span>`
    : (unscannedCount > 0
        ? `<span class="v unknown">unknown</span>`
        : `<span class="v good">none known</span>`);
  const damageDetail = (corruptCount > 0 || partialCount > 0)
    ? `<div class="detail-row"><span class="k">└ breakdown</span><span class="v">${corruptCount} corrupt · ${partialCount} partial</span></div>`
    : '';
  const unscannedLine = unscannedCount > 0
    ? `<div class="detail-row"><span class="k">unscanned</span><span class="v unknown">${unscannedCount} file${unscannedCount === 1 ? '' : 's'}</span></div>`
    : '';

  target.innerHTML = `
    <div class="detail-title">Memory Banks</div>
    <div class="detail-type">${state.mission.shipId} · ${total} blk total</div>
    <div class="detail-row"><span class="k">used</span><span class="v">${used} blk · ${usedPct}%</span></div>
    <div class="detail-row"><span class="k">free</span><span class="v good">${free} blk · ${freePct}%</span></div>
    <div class="detail-row"><span class="k">damage</span>${damageLine}</div>
    ${damageDetail}
    ${unscannedLine}
    <div class="detail-row"><span class="k">redundancy</span>${redundLine}</div>
    <div class="detail-desc">Click any segment to inspect. Click again or click outside any block to return here.</div>`;
}

// Mount the detail panel as a store subscriber. Re-renders whenever the store
// is notified (action functions call store.notify() after in-place segment
// mutations; store.update() fires it implicitly). Always-false comparator so
// in-place memory mutations don't get missed.
export function mountDetailPanel(
  store: Store<GameState>,
  opts: { onAction: (seg: Segment, actionId: DetailActionId) => void },
): () => void {
  const target = document.getElementById('detailBody');
  if (!target) return () => {};

  // The demo corruption slider fires `input` per pixel of drag. Each event
  // does `store.update`, which would re-render this panel via the subscriber
  // below — destroying the slider DOM node mid-drag and cancelling the
  // browser's native drag tracking. Set this flag while applying the slider's
  // own update so paint() skips, leaving the slider intact.
  let sliderActive = false;

  function paint(state: GameState): void {
    if (sliderActive) return;
    const segId = state.ui.selectedId;
    const seg = segId ? state.memory.find((m) => m.id === segId) : null;
    if (!seg) { renderOverview(target!, state); return; }
    renderDetailPanel(target!, seg, {
      getFsTool: (kind) => getFsTool(state, kind),
      getRedundancy: () => getRedundancy(state),
      onAction: opts.onAction,
      onCorruptionSliderInput: (pct) => {
        sliderActive = true;
        try {
          store.update((d) => { d.ai.coreIntegrity = 100 - pct; });
        } finally {
          sliderActive = false;
        }
      },
      getCorruption: () => selectCorruption(state),
      // Demo: live-tweak Core capacity. sliderActive blocks the panel from
      // re-rendering mid-drag (which would destroy the slider DOM and kill
      // the browser's native drag tracking). store.update fires the
      // syncCoreCapacity subscriber → setCoresCapacity → paintCoreThreads,
      // so the thread row rebuilds with the new dot count immediately.
      onCapacitySliderInput: (n) => {
        sliderActive = true;
        try {
          store.update((d) => {
            const core = d.memory.find((m) => m.type === 'core');
            if (core && core.type === 'core') core.capacity = n;
          });
        } finally {
          sliderActive = false;
        }
      },
      // Demo: bump a specific fs-tool's version. sliderActive blocks the
      // panel from re-rendering mid-drag (would destroy the slider). The
      // store update fires all subscribers, so isValidTarget repaints pick
      // up the v2+ unlock immediately (Redundancy becomes a valid target).
      onVersionSliderInput: (segId, n) => {
        sliderActive = true;
        try {
          store.update((d) => {
            const tool = d.memory.find((m) => m.id === segId);
            if (tool && tool.type === 'fs-tool') tool.version = n;
          });
        } finally {
          sliderActive = false;
        }
      },
    });
  }

  paint(store.getState());
  const unsub = store.subscribe((s) => s, (s) => paint(s), () => false);
  return unsub;
}
