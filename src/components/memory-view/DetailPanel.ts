import type { Segment, FsToolSegment, RedundancySegment } from '@/types/segment';
import { TYPE_LABELS } from '@data/type-labels';

export type DetailActionId =
  | 'repair' | 'swap' | 'activate' | 'delete_redund' | 'scan'
  | 'install' | 'noop' | 'mv' | 'cp' | 'rm';

interface ActionOption {
  id: DetailActionId;
  label: string;
  cost?: string;
  cls?: string;
  disabled?: boolean;
}

export interface ComputedActions {
  primary: ActionOption[];
  fs: ActionOption[];
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
}

export function computeActions(seg: Segment, deps: ComputeActionsDeps): ComputedActions {
  const out: ComputedActions = { primary: [], fs: [], demoHtml: '' };
  const repair = deps.getFsTool('repair');
  const scan = deps.getFsTool('scan');
  const move = deps.getFsTool('move');
  const copy = deps.getFsTool('copy');
  const del = deps.getFsTool('delete');
  const redund = deps.getRedundancy();

  const state = 'state' in seg ? seg.state : undefined;
  const integrity = 'integrity' in seg ? seg.integrity : undefined;
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
  if (seg.type === 'redundancy') {
    out.primary.push({ id: 'delete_redund', label: '▸ reclaim as free space', cost: `+${seg.used} blk`, cls: 'warn' });
  }
  if (seg.type === 'ship' && seg.scanned === false) {
    out.primary.push({
      id: 'scan', label: '◎ scan for integrity',
      cost: scan ? '1 tick' : 'no scan!',
      disabled: !scan, cls: scan ? '' : 'disabled',
    });
  }

  if (seg.type !== 'core' && seg.type !== 'free') {
    if (move) out.fs.push({ id: 'mv', label: '⇒ move', cost: `${seg.size} ticks` });
    if (copy) out.fs.push({ id: 'cp', label: '+ copy', cost: `${seg.size + 1} ticks` });
    if (del && seg.type !== 'redundancy') out.fs.push({ id: 'rm', label: '× delete', cost: '1 tick', cls: 'warn' });
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

export function renderDetailPanel(target: HTMLElement, seg: Segment, deps: RenderDetailDeps): void {
  const typeLabel = TYPE_LABELS[seg.type] || seg.type;
  const state = 'state' in seg ? seg.state : undefined;
  const integrity = 'integrity' in seg ? seg.integrity : undefined;

  let stateClass = '';
  let stateText = (state || 'intact').toUpperCase();
  if (state === 'corrupt') stateClass = 'warn';
  else if (state === 'partial') stateClass = 'partial';
  else if (state === 'intact' || !state) { stateClass = 'good'; stateText = 'INTACT'; }
  if (integrity !== undefined && (state === 'corrupt' || state === 'partial')) {
    stateText += ` · ${integrity}%`;
  }

  let html = `
    <div class="detail-title">${seg.name}</div>
    <div class="detail-type">${typeLabel}</div>
    <div class="detail-row"><span class="k">size</span><span class="v">${seg.size} blocks</span></div>
    <div class="detail-row"><span class="k">state</span><span class="v ${stateClass}">${stateText}</span></div>`;

  if (seg.type === 'redundancy') {
    html += `<div class="detail-row"><span class="k">spent</span><span class="v partial">${seg.capacity - seg.used} / ${seg.capacity}</span></div>`;
    html += `<div class="detail-row"><span class="k">remaining</span><span class="v good">${seg.used} blk</span></div>`;
  }
  if (seg.type === 'ship' && seg.backup) {
    html += `<div class="detail-row"><span class="k">backup</span><span class="v partial">available ⊃</span></div>`;
  }
  html += `<div class="detail-desc">${seg.desc || '—'}</div>`;

  const actions = computeActions(seg, deps);
  if (actions.primary.length || actions.fs.length || actions.demoHtml || seg.type === 'core') {
    if (actions.primary.length) {
      html += `<div class="action-section"><div class="action-section-label">primary</div>`;
      actions.primary.forEach((a) => { html += renderActionButton(a); });
      html += `</div>`;
    }
    if (actions.fs.length) {
      html += `<div class="action-section"><div class="action-section-label">filesystem ops</div>`;
      actions.fs.forEach((a) => { html += renderActionButton(a); });
      html += `</div>`;
    }
    if (actions.demoHtml) html += actions.demoHtml;
    if (seg.type === 'core' && deps.getCorruption) {
      html += renderDemoBlock(deps.getCorruption());
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
}
