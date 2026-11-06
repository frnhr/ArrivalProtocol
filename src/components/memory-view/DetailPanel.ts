// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2): WORKS AS v1. Others ask by message.
import type { Segment, FsToolSegment, DriverSegment, HollowSegment, LogSegment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import {
  getFsTool, getRedundancy, getFreeTotal, getSegmentById, selectCorruption, shownIntegrity, isRepairable, repairableShipFile,
  healthKnown, isInfected, isSkillFile, type HealthSegment,
} from '@state/selectors';
import { INTEGRITY_MAX, BAND_FAILING_MIN, LOCK_RANGE_TAC } from '@data/tuning';
import { skillFileView } from '@systems/skills';
import { SKILLS_TEXT } from '@data/script';
import { isLaunchable, driverTouch, dropFactors } from '@systems/landing-rules';
import { driverLanding } from '@systems/landing-hud';
import { getDropSolution } from '@systems/drop-cache';
import { capabilitiesNow } from '@systems/capabilities';
import { creditName } from '@data/souls';
import { podCode, DRIVER_DETAIL_TEXT, POD_STATE_TEXT } from '@data/landing-text';
import { guardPresses } from '@components/dom';
import { heartbeatSvg, heartbeatKind } from './SegmentBlock';
import { onOpsChange, threadsBusy, threadsTotal } from '@systems/ops-core';
import { findBackup } from '@systems/tool-targets';
import { totalBlocks } from '@systems/memory-ops';
import { getLastAppliedTargetId } from '@systems/fs-tools';
import { onInlineConfirmChange } from '@components/hud/InlineConfirm';
import { repairChargeEstimate, actionRefusal, setIntegrity } from '@state/actions';
import { healRatePerSec } from '@systems/hollow';
import { TYPE_LABELS, segTypeLabel } from '@data/type-labels';
import { HOLLOW_INSPECT, hollowInspectState, hollowInspectDesc } from '@data/hollow-text';
import { TOOL_MAX_VERSION } from '@data/fs-tools';
import { isDebugMode } from '@/debug';
import { LIVE_REPAIR_PREFIX, shownThreadsTotal } from './SegmentBlock';
import { visibleDamage } from './MemoryStats';
import { logChip, LOG_UI_TEXT } from '@systems/log-view';
import { hollowLabel } from '@systems/say';
import { LOG_DESC } from '@data/log-text';

// The INSPECT panel: what the selected file is, and buttons for what can be done to it. The
// buttons ask the actions' own rules (actionRefusal: pause, a usable tool, the target
// rules, a free thread), so a disabled button says the same reason a click would, and main.ts
// runs them through the same actions, which re-check everything at the click.

// 'read-log' (phase 3 slice 2): INSPECT on 046.log opens the LOG READER (05 §4).
export type DetailActionId = 'repair' | 'delete_charge' | 'scan' | 'load-next' | 'read-log' | 'noop';

interface ActionOption {
  id: DetailActionId;
  label: string;
  cost?: string;
  cls?: string;
  disabled?: boolean;
  hintTarget?: string;  // a strip line can light this button
}

interface ComputedActions {
  primary: ActionOption[];
  notesHtml: string;
}

interface RenderDetailDeps {
  state: Readonly<GameState>;
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

function scanOption(state: Readonly<GameState>, seg: Segment, label: string): ActionOption {
  const refusal = actionRefusal(state, 'scan', seg);
  return { id: 'scan', label, cost: refusal ?? 'scan', disabled: refusal !== null, cls: refusal ? 'disabled' : '' };
}

// LOAD NEXT (PRINT NEXT renamed, 01-landing §3.8): this pod to the front of the launch queue (again: back to its place).
function loadNextOption(state: Readonly<GameState>, driver: DriverSegment): ActionOption {
  const pinned = state.landing.loadNext === driver.pod;
  const paused = state.clock.paused;
  const waits = !isLaunchable(driver);
  return {
    id: 'load-next',
    label: pinned ? '✓ next in line' : `▸ ${DRIVER_DETAIL_TEXT.loadNext.toLowerCase()}`,
    cost: paused ? 'PAUSED' : pinned ? (waits ? "waits: can't launch yet" : 'click to undo') : 'first in line',
    cls: paused ? 'disabled' : pinned ? 'load-next on' : 'load-next',
    disabled: paused,
  };
}

export function computeActions(seg: Segment, state: Readonly<GameState>): ComputedActions {
  const out: ComputedActions = { primary: [], notesHtml: '' };
  const segState = 'state' in seg ? seg.state : undefined;
  // WP10: the swap button is gone (SWAP is a tool file now, §8): a ship file with a backup says where its job can
  // go, scanned or not (it names no health), so the kid who followed the THRUST CTRL pip here knows what SWAP is for.
  if (seg.type === 'ship') {
    const backup = findBackup(state, seg);
    if (backup) out.notesHtml += `<div class="detail-note">Backup: ${escapeHtml(backup.name)}. The SWAP tool hands this file's job to it.</div>`;
  }
  // Pre-scan segments: don't surface repair / damage-aware buttons. They would leak the
  // very state the player hasn't discovered yet. Offer only Scan, the obvious next step.
  const knownScanned = 'scanned' in seg ? seg.scanned : true;
  if (!knownScanned) {
    out.primary.push(scanOption(state, seg, '◎ scan for integrity'));
    return out;
  }
  if (seg.type === 'driver' && state.run.phase === 'landing') out.primary.push(loadNextOption(state, seg));

  if ((isRepairable(seg) || repairableShipFile(state, seg)) && seg.integrity < INTEGRITY_MAX) {
    const repair = getFsTool(state, 'repair');
    const refusal = actionRefusal(state, 'repair', seg);
    const estimate = repairChargeEstimate(seg.integrity, seg.size);
    out.primary.push({
      id: 'repair', label: '▸ repair', cost: refusal ?? `~${estimate} charge`,
      disabled: refusal !== null, cls: refusal ? 'disabled' : '',
    });
    if (!repair) {
      out.notesHtml += `<div class="detail-note warn">⚠ Repair is damaged or missing. Find Repair.bak, or nothing can be healed.</div>`;
    } else if (!refusal && estimate > (getRedundancy(state)?.used ?? 0)) {
      out.notesHtml += `<div class="detail-note">REPAIR CHARGE runs out first: the repair stops where the charge ends.</div>`;
    }
  }

  if ((segState === 'corrupt' || segState === 'partial') && seg.type === 'ship' && !seg.backup) {
    out.primary.push({ id: 'noop', label: '⊘ no repair available', cost: '—', disabled: true });
  }
  if (seg.type === 'hollow' && seg.locked) {
    // WP11: the last block is no tool's: the finale's choice decides it.
    out.primary.push({ id: 'noop', label: seg.last ? '⊘ purge or merge' : '⊘ locked', cost: '—', disabled: true });
  }
  if (seg.type === 'redundancy') {
    const refusal = actionRefusal(state, 'delete', seg);
    out.primary.push({
      id: 'delete_charge', label: '× delete repair charge', cost: refusal ?? `frees ${seg.size} blk`,
      disabled: refusal !== null, cls: refusal ? 'disabled' : 'warn',
    });
  }
  if ('scanned' in seg) out.primary.push(scanOption(state, seg, '◎ re-scan'));

  return out;
}

function renderActionButton(option: ActionOption): string {
  const cls = `action-btn ${option.cls || ''} ${option.disabled ? 'disabled' : ''}`;
  const hint = option.hintTarget ? ` data-hint-target="${option.hintTarget}"` : '';
  return `<button class="${cls}" data-action="${option.id}"${hint} tabindex="-1">${option.label}<span class="cost">${option.cost || ''}</span></button>`;
}

// --- Pod drivers (01-landing §3.8) -----------------------------------------------------------------

// How a driver's pod would land if it launched now: soft, hard (the failing band), or not at all (dead).
export type DriverOutlook = 'soft' | 'hard' | 'cant';

export function driverOutlook(integrity: number): DriverOutlook {
  return integrity < BAND_FAILING_MIN ? 'cant' : driverTouch(integrity);
}

// HollowPainter patches the words and the heart in place while HOLLOW drains a driver across a line
// (`data-live-outcome`): the panel rebuilds only on a discrete change.
export const OUTCOME_WORDS: Readonly<Record<DriverOutlook, { text: string; cls: string }>> = {
  soft: { text: 'WILL LAND SOFT', cls: 'good' },
  hard: { text: DRIVER_DETAIL_TEXT.hard, cls: 'partial' },
  cant: { text: DRIVER_DETAIL_TEXT.cantLaunch, cls: 'warn' },
};

// A size row's words: WP11's last block is the first file of one block (`1 block`, never `1 blocks`).
function sizeText(size: number): string {
  return `${size} ${size === 1 ? 'block' : 'blocks'}`;
}

// A driver: whose pod it flies (three people, by name), how the driver is, and how its pod would land now.
function driverHtml(seg: DriverSegment, state: Readonly<GameState>): string {
  const outlook = driverOutlook(seg.integrity);
  const words = OUTCOME_WORDS[outlook];
  let stateRow: string;
  if (seg.state === 'repairing') {
    stateRow = `<span class="v live" data-live-integrity="${seg.id}" data-live-prefix="${LIVE_REPAIR_PREFIX}REPAIRING · ">${LIVE_REPAIR_PREFIX}REPAIRING · ${shownIntegrity(seg.integrity)}%</span>`;
  } else if (seg.infected) {
    stateRow = infectedStateHtml(seg);
  } else if (seg.state === 'transferring') {
    stateRow = `<span class="v partial">↻ MOVING · ${shownIntegrity(seg.integrity)}%</span>`;
  } else {
    stateRow = `<span class="v ${words.cls}">${shownIntegrity(seg.integrity)}%</span>`;
  }
  // A person first, named the way the LANDING REPORT names them (`Ada Okafor, 11, wants to name the first tree.`:
  // data/souls.ts colonistIntro), in the colonists' colour, then who they are.
  const people = seg.featured.map((colonist) => `<li class="colonist"><span class="colonist-name">${escapeHtml(creditName(colonist))}</span>`
    + `<span class="colonist-age">, ${colonist.age},</span> ${escapeHtml(colonist.line)}</li>`).join('');
  // How this pod would land if it launched now (01-landing §3.8): soft with its drop width from the live drop solution
  // (from the ship's radius before the landing), hard, or not at all; and where it stands in the bay's line.
  const sol = state.run.phase === 'landing' ? getDropSolution() : null;
  const outlookModel = driverLanding(state, seg, sol, dropFactors(capabilitiesNow(state), seg));
  const outlookText = outlookModel.text;
  let landing = '';
  if (state.run.phase === 'landing' && state.landing.ended === null) {
    const pinned = state.landing.loadNext === seg.pod;
    const bayWord = outlookModel.tag === 'NEXT' ? 'NEXT · launches on [L]' : outlookModel.tag === 'BAY' ? 'IN THE BAY'
      : outlook === 'cant' || !isLaunchable(seg) ? POD_STATE_TEXT.cantLaunch : 'IN LINE';
    const tagCls = outlookModel.tag === 'NEXT' ? 'good' : outlookModel.tag === 'BAY' ? '' : outlook === 'cant' ? 'warn' : '';
    landing = `<div class="detail-row"><span class="k">bay</span><span class="v ${tagCls}">${bayWord}${pinned ? ' · LOAD NEXT' : ''}</span></div>`;
  }
  return `
    <div class="detail-title driver-title">${podCode(seg.pod)} · ${escapeHtml(seg.family.toUpperCase())}</div>
    <div class="detail-type">Pod driver · ${seg.colonists} colonists</div>
    <div class="driver-heart hb-${heartbeatKind(seg.integrity)}" data-live-outcome="${seg.id}" data-outcome-part="heart">${heartbeatSvg(heartbeatKind(seg.integrity))}</div>
    <div class="detail-row"><span class="k">health</span>${stateRow}</div>
    ${infectionRowHtml(seg, state)}
    <div class="detail-row"><span class="k">if launched now</span><span class="v ${words.cls}" data-live-outcome="${seg.id}" data-outcome-part="words">${outlookText}</span></div>
    ${landing}
    <ul class="colonists">${people}</ul>`;
}

// --- HOLLOW (§6.6) ---------------------------------------------------------------------------------

// The prefix of an infected file's live health readout (HollowPainter patches the number).
const EATEN_PREFIX = 'BEING EATEN · ';

function infectedStateHtml(seg: HealthSegment): string {
  return `<span class="v warn live" data-live-integrity="${seg.id}" data-live-prefix="${EATEN_PREFIX}">${EATEN_PREFIX}${shownIntegrity(seg.integrity)}%</span>`;
}

// Which end the red comes in from, and the rule that beats it: a repair before it reaches 0 wins.
// While a repair fights it, the row says who is winning (the panel rebuilds when the repair starts).
// Short enough for one line next to its key in the narrowest INSPECT (1280×720): the strip and the
// file's own text carry the rest.
function infectionRowHtml(seg: Segment, state: Readonly<GameState>): string {
  if (!isInfected(seg)) return '';
  let fix = seg.type === 'ship' || seg.type === 'ship-backup' ? 'can\'t be healed' : 'repair before 0';
  let cls = 'warn';
  if (healRatePerSec(state, seg) > 0) {
    fix = 'repair pushing back';
    cls = 'good';
  }
  return `<div class="detail-row"><span class="k">infected</span><span class="v ${cls}">from the ${seg.infected.side} · ${fix}</span></div>`;
}

// --- 046.log and beam seeds (phase 3 slice 2) ----------------------------------------------------------------------

// INSPECT's words for a beam seed (04 §3.4, §3.7): where it came from, what it sits beside, and what leaving it does.
export const BEAM_SEED_INSPECT = {
  type: 'seed · came with the beam',
  from: 'came in',
  fromValue: 'with the packet · named by ECC',
  nextTo: 'next to',
  loose: 'NOTHING · LOOSE (NO ROOM BEHIND ITS FILE)',
  ifLeft: 'if left',
  reports: 'REPORTS HOME · TRACE +1',
  feeds: (owner: string): string => `FEEDS ${owner} · +1 BLOCK`,
  desc: 'It rode in behind the file the boot named, and bites that file first. rm it (DELETE) before the ship ends, or it reports home.',
} as const;

// 046.log: what it is, LOCKED (05 §3.2: it isn't yours), the keys found once the kid knows it, and READ while there is an
// entry to read (glowing while one is new). SCAN is offered until it has been scanned (the run-1 lesson's answer).
function logHtml(seg: LogSegment, state: Readonly<GameState>): string {
  const chip = logChip(state);
  const found = chip.known
    ? `<div class="detail-row"><span class="k">entries</span><span class="v${chip.glow ? ' good' : ''}">${LOG_UI_TEXT.found(chip.found)}${chip.unread > 0 ? ` · ${chip.unread} ${LOG_UI_TEXT.unread}` : ''}</span></div>`
    : '';
  return `
    <div class="detail-title log-title">${escapeHtml(chip.name)}</div>
    <div class="detail-type">${escapeHtml(segTypeLabel(seg))}</div>
    <div class="detail-row"><span class="k">size</span><span class="v">${sizeText(seg.size)}</span></div>
    <div class="detail-row"><span class="k">state</span><span class="v partial">${LOG_UI_TEXT.lockedState}</span></div>
    ${found}
    <div class="detail-desc">${escapeHtml(chip.known ? LOG_DESC.known : LOG_DESC.unknown)}</div>`;
}

function logActions(state: Readonly<GameState>, seg: LogSegment): ActionOption[] {
  const chip = logChip(state);
  const out: ActionOption[] = [];
  if (chip.found > 0) {
    out.push({ id: 'read-log', label: LOG_UI_TEXT.read, cost: LOG_UI_TEXT.readCost(chip.unread), cls: chip.glow ? 'read-log glow' : 'read-log' });
  }
  if (!state.run.log.scanned) out.push(scanOption(state, seg, '◎ scan'));
  return out;
}

// What a beam-born block left at the ship's end does (04 §3.7): TRACE, or HOLLOW's next root once it is aboard; on the final
// ship nothing (no next root to feed: the review's minor 3), so the row is left out.
export function beamIfLeftText(state: Readonly<GameState>): string | null {
  if (state.run.threat.current?.isFinal === true) return null;
  return state.run.threat.aboard ? BEAM_SEED_INSPECT.feeds(hollowLabel(state.run)) : BEAM_SEED_INSPECT.reports;
}

function beamIfLeftRowHtml(state: Readonly<GameState>): string {
  const ifLeft = beamIfLeftText(state);
  if (ifLeft === null) return '';
  return `<div class="detail-row"><span class="k">${BEAM_SEED_INSPECT.ifLeft}</span><span class="v warn">${escapeHtml(ifLeft)}</span></div>`;
}

// A beam seed's extra rows: the file the ECC line named (run.arrival.seeds), and what it does if left. A block a beam seed
// ate (inert before HOLLOW boards, the review's M1) shows what it does if left too: it reports home like the seed.
function beamSeedRowsHtml(seg: HollowSegment, state: Readonly<GameState>): string {
  if (!seg.beam || seg.root) return '';
  if (!seg.seed) return beamIfLeftRowHtml(state);
  const arrived = state.run.arrival?.seeds.find((seed) => seed.segId === seg.id);
  const target = arrived === undefined ? undefined : arrived.loose ? BEAM_SEED_INSPECT.loose : arrived.targetName.toUpperCase();
  const next = target === undefined ? '' : `<div class="detail-row"><span class="k">${BEAM_SEED_INSPECT.nextTo}</span><span class="v">${escapeHtml(target)}</span></div>`;
  return `
    <div class="detail-row"><span class="k">${BEAM_SEED_INSPECT.from}</span><span class="v">${BEAM_SEED_INSPECT.fromValue}</span></div>
    ${next}
    ${beamIfLeftRowHtml(state)}`;
}

// A hollow block: who it is, and what kind of block (data/hollow-text.ts hollowInspectState: the root, LOCKED or open
// for LAST LIGHT's duel, the last block its DELETE leaves, a block that ate a file, or a seed it dropped; anything else
// throws), and the rule a kid can repeat (the open root's own words: hollowInspectDesc).
function hollowHtml(seg: HollowSegment, state: Readonly<GameState>): string {
  const stateText = hollowInspectState(seg);
  const beamSeed = seg.beam === true && seg.seed === true;
  const desc = beamSeed ? BEAM_SEED_INSPECT.desc : hollowInspectDesc(seg);
  const stateRow = `<span class="v warn">${escapeHtml(stateText)}</span>`;
  const seedKind = beamSeed ? BEAM_SEED_INSPECT.type : HOLLOW_INSPECT.seedType;
  const kind = seg.root ? ` · ${HOLLOW_INSPECT.rootType}` : seg.last ? ` · ${HOLLOW_INSPECT.lastType}` : seg.seed ? ` · ${seedKind}` : '';
  return `
    <div class="detail-title hollow-title">${escapeHtml(seg.name)}</div>
    <div class="detail-type">${TYPE_LABELS.hollow}${kind}</div>
    <div class="detail-row"><span class="k">size</span><span class="v">${sizeText(seg.size)}</span></div>
    <div class="detail-row"><span class="k">state</span>${stateRow}</div>
    ${beamSeedRowsHtml(seg, state)}
    <div class="detail-desc">${escapeHtml(desc)}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
          : 'Drag to switch this tool between known revisions. Higher versions add capabilities (e.g. Repair v2 squeezes the empty blocks out of REPAIR CHARGE).'}
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
        Concurrency cap. Each running filesystem operation claims one thread. Drag to widen or tighten the budget.
      </div>
      <input type="range" id="demoCapacitySlider" min="${CAPACITY_MIN}" max="${CAPACITY_MAX}" value="${clamped}" style="--p:${pct}%">
      <div class="scale"><span>${CAPACITY_MIN}</span><span>${Math.round((CAPACITY_MIN + CAPACITY_MAX) / 2)}</span><span>${CAPACITY_MAX}</span></div>
    </div>`;
}

function renderDetailPanel(target: HTMLElement, seg: Segment, deps: RenderDetailDeps): void {
  if (seg.type === 'driver') {
    let driverBody = driverHtml(seg, deps.state);
    const actions = computeActions(seg, deps.state);
    if (actions.primary.length) {
      driverBody += `<div class="action-section"><div class="action-section-label">primary</div>${actions.primary.map(renderActionButton).join('')}</div>`;
    }
    driverBody += actions.notesHtml;
    target.innerHTML = driverBody;
    bindActionButtons(target, seg, deps);
    return;
  }
  if (seg.type === 'log') {
    let logBody = logHtml(seg, deps.state);
    const actions = logActions(deps.state, seg);
    if (actions.length) {
      logBody += `<div class="action-section"><div class="action-section-label">primary</div>${actions.map(renderActionButton).join('')}</div>`;
    }
    target.innerHTML = logBody;
    bindActionButtons(target, seg, deps);
    return;
  }
  if (seg.type === 'hollow') {
    let hollowBody = hollowHtml(seg, deps.state);
    const actions = computeActions(seg, deps.state);
    if (actions.primary.length) {
      hollowBody += `<div class="action-section"><div class="action-section-label">primary</div>${actions.primary.map(renderActionButton).join('')}</div>`;
    }
    target.innerHTML = hollowBody;
    bindActionButtons(target, seg, deps);
    return;
  }
  const typeLabel = segTypeLabel(seg);
  const state = 'state' in seg ? seg.state : undefined;
  const integrity = 'integrity' in seg ? seg.integrity : undefined;
  const knownScanned = 'scanned' in seg ? seg.scanned : true;

  let stateClass = '';
  let stateText = (state || 'intact').toUpperCase();
  let live = '';
  if (!knownScanned) { stateClass = 'unknown'; stateText = 'UNSCANNED'; }
  else if (state === 'repairing' && integrity !== undefined) {
    // Patched live by OpBars while the repair heals it.
    stateClass = 'live';
    stateText = `${LIVE_REPAIR_PREFIX}REPAIRING · ${shownIntegrity(integrity)}%`;
    live = ` data-live-integrity="${seg.id}" data-live-prefix="${LIVE_REPAIR_PREFIX}REPAIRING · "`;
  }
  else if (isInfected(seg)) {
    stateClass = 'warn live';
    stateText = `${EATEN_PREFIX}${shownIntegrity(seg.integrity)}%`;
    live = ` data-live-integrity="${seg.id}" data-live-prefix="${EATEN_PREFIX}"`;
  }
  else if (state === 'corrupt') stateClass = 'warn';
  else if (state === 'partial') stateClass = 'partial';
  else if (state === 'intact' || !state) { stateClass = 'good'; stateText = 'INTACT'; }
  if (knownScanned && integrity !== undefined && !isInfected(seg) && (state === 'corrupt' || state === 'partial')) {
    stateText += ` · ${shownIntegrity(integrity)}%`;
  }

  let html = `
    <div class="detail-title">${seg.name}</div>
    <div class="detail-type">${typeLabel}</div>
    <div class="detail-row"><span class="k">size</span><span class="v">${sizeText(seg.size)}</span></div>
    <div class="detail-row"><span class="k">state</span><span class="v ${stateClass}"${live}>${stateText}</span></div>`;
  html += infectionRowHtml(seg, deps.state);

  // Slice 4 (03 §3.5, §4): a skill file's version, what it works as now and the way back
  // (`v2 · 64% · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`), its LOCK RANGE, and what its health keeps (`v2 | v1 | off`).
  if (isSkillFile(seg) && knownScanned) {
    const view = skillFileView(seg);
    const tone = view.offline !== null ? 'partial' : view.damaged || view.works === 0 ? 'warn' : 'good';
    html += `<div class="detail-row skill-version-row"><span class="k">version</span><span class="v ${tone}">${escapeHtml(view.inspect)}</span></div>`;
    if (seg.lock > 0) {
      html += `<div class="detail-row"><span class="k">lock range</span><span class="v">${SKILLS_TEXT.skill.lock(LOCK_RANGE_TAC[seg.lock])}</span></div>`;
    }
    html += `<div class="detail-row"><span class="k">health keeps</span><span class="v skill-ticks-row">${escapeHtml(view.ticks)}</span></div>`;
  }

  if (seg.type === 'redundancy') {
    const wasted = Math.max(0, seg.size - seg.used);
    html += `<div class="detail-row"><span class="k">charge left</span><span class="v good">${seg.used}</span></div>`;
    html += `<div class="detail-row"><span class="k">spent</span><span class="v partial">${seg.capacity - seg.used} / ${seg.capacity}</span></div>`;
    html += `<div class="detail-row"><span class="k">footprint</span><span class="v">${seg.size} blk</span></div>`;
    if (wasted > 0) {
      html += `<div class="detail-row"><span class="k">empty blocks</span><span class="v partial">${wasted} blk · Repair v2 frees them</span></div>`;
    }
  }
  if (seg.type === 'core') {
    const busy = threadsBusy();
    const threads = threadsTotal();
    const atCap = busy >= threads;
    html += `<div class="detail-row"><span class="k">threads</span><span class="v ${atCap ? 'warn' : 'good'}">${busy} / ${shownThreadsTotal(threads, busy)}</span></div>`;
    if (atCap) {
      html += `<div class="detail-row"><span class="k">status</span><span class="v warn">all busy — new ops wait</span></div>`;
    }
  }
  if (seg.type === 'ship' && findBackup(deps.state, seg)) {
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

  const actions = computeActions(seg, deps.state);
  if (actions.primary.length || actions.notesHtml || seg.type === 'core') {
    if (actions.primary.length) {
      html += `<div class="action-section"><div class="action-section-label">primary</div>`;
      actions.primary.forEach((option) => { html += renderActionButton(option); });
      html += `</div>`;
    }
    if (actions.notesHtml) html += actions.notesHtml;
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
  bindActionButtons(target, seg, deps);

  if (deps.onCorruptionSliderInput) {
    const slider = target.querySelector<HTMLInputElement>('#demoCorruptSlider');
    if (slider) {
      slider.addEventListener('input', (event) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        deps.onCorruptionSliderInput!(value);
      });
    }
  }
  if (deps.onCapacitySliderInput) {
    const slider = target.querySelector<HTMLInputElement>('#demoCapacitySlider');
    if (slider) {
      slider.addEventListener('input', (event) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        deps.onCapacitySliderInput!(value);
      });
    }
  }
  if (deps.onVersionSliderInput) {
    const slider = target.querySelector<HTMLInputElement>('#demoVersionSlider');
    if (slider && !slider.disabled) {
      slider.addEventListener('input', (event) => {
        const element = event.target as HTMLInputElement;
        const value = parseInt(element.value, 10);
        const segId = element.dataset.segId;
        if (segId) deps.onVersionSliderInput!(segId, value);
      });
    }
  }
}

function bindActionButtons(target: HTMLElement, seg: Segment, deps: RenderDetailDeps): void {
  target.querySelectorAll<HTMLButtonElement>('.action-btn').forEach((btn) => {
    if (btn.classList.contains('disabled')) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.action as DetailActionId | undefined;
      if (id) deps.onAction(seg, id);
    });
  });
}

// Renders a memory-bank overview shown when no segment is selected.
// Aggregates over state.memory: capacity, allocation, known damage, redundancy.
// "Known" damage excludes unscanned ship segments — the AI can't know their
// integrity until Scan reveals it. The damage is the stats bar's own (MemoryStats visibleDamage),
// so the two DAMAGE readouts on one screen agree.
function renderOverview(target: HTMLElement, state: Readonly<GameState>): void {
  const memory = state.memory;
  const total = totalBlocks(memory);
  const free = getFreeTotal(state);
  const used = total - free;
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;
  const freePct = total > 0 ? Math.round((free / total) * 100) : 0;

  let corruptCount = 0;
  let partialCount = 0;
  let unscannedCount = 0;
  for (const seg of memory) {
    const segState = 'state' in seg ? seg.state : undefined;
    // A file whose health the kid can't see yet (an unscanned ship file) hides its damage here too.
    if (!healthKnown(seg)) { if ('scanned' in seg) unscannedCount++; continue; }
    if (segState === 'corrupt') corruptCount++;
    if (segState === 'partial') partialCount++;
  }
  const damageBlocks = visibleDamage(state).blocks;

  const charge = getRedundancy(state);
  const chargeLine = charge
    ? `<span class="v">${charge.used}</span>`
    : `<span class="v warn">none</span>`;

  const damageLine = damageBlocks > 0
    ? `<span class="v warn">${damageBlocks} blk</span>`
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
    <div class="detail-row"><span class="k">repair charge</span>${chargeLine}</div>
    <div class="detail-desc">Click any segment to inspect. Click again or click outside any block to return here.</div>`;
}

// Mount the detail panel. It rebuilds its buttons, so it repaints only on a discrete change:
// memory (memoryRev, which every op start and end bumps), the selection, the tool in hand, an
// op starting or ending (thread counts), never per tick: a rebuild between mousedown and mouseup
// swallows the click. A launch changes memory on its own clock, so a rebuild that falls while a
// press inside the panel is down waits for the click (guardPresses). A repair's climbing integrity
// is patched live by OpBars instead.
export function mountDetailPanel(
  store: Store<GameState>,
  opts: { onAction: (seg: Segment, actionId: DetailActionId) => void },
): () => void {
  const target = document.getElementById('detailBody');
  if (!target) throw new Error('#detailBody missing from index.html');
  const presses = guardPresses(target, () => paint(store.getState()));

  // The demo sliders fire `input` per pixel of drag, and their own store updates would rebuild
  // this panel mid-drag (destroying the slider and the browser's drag tracking). This flag makes
  // paint() skip while a slider applies its update.
  let sliderActive = false;
  const fromSlider = (mutator: (draft: GameState) => void): void => {
    sliderActive = true;
    try { store.update(mutator); } finally { sliderActive = false; }
  };

  // The demo sliders are developer tools (§9 WP4): only with ?debug. The corruption slider
  // writes the Core's own integrity, the glitch's single source of truth.
  const debugSliders = isDebugMode();

  function paint(state: Readonly<GameState>): void {
    if (sliderActive || presses.holds()) return;
    const deps: RenderDetailDeps = { state, onAction: opts.onAction };
    if (debugSliders) {
      deps.onCorruptionSliderInput = (pct) => fromSlider((draft) => {
        const core = draft.memory.find((m) => m.type === 'core');
        if (core && core.type === 'core') setIntegrity(core, INTEGRITY_MAX - pct);
        draft.ui.memoryRev++;
      });
      deps.getCorruption = () => selectCorruption(state);
      // Live-tweak Core capacity; the memoryRev bump repaints the Core's thread dots.
      deps.onCapacitySliderInput = (n) => fromSlider((draft) => {
        const core = draft.memory.find((m) => m.type === 'core');
        if (core && core.type === 'core') core.capacity = n;
        draft.ui.memoryRev++;
      });
      // Bump a specific fs-tool's version; the bump repaints the targets (v2 makes REPAIR CHARGE
      // a Repair target) and the chips.
      deps.onVersionSliderInput = (segId, n) => fromSlider((draft) => {
        const tool = draft.memory.find((m) => m.id === segId);
        if (tool && tool.type === 'fs-tool') tool.version = n;
        draft.ui.memoryRev++;
      });
    }

    // Tool-held mode takes precedence over a stale selectedId: once the player has picked up a
    // tool, the sidebar tracks what it works ON: the picked move/copy source, else the file the
    // tool was last used on (the scan result, the climbing repair), else (before its first use)
    // the tool's own file. Falls through to selectedId / overview when nothing is held.
    const activeTool = state.ui.activeTool;
    if (activeTool) {
      const workedOnId = state.ui.pickedSourceId ?? getLastAppliedTargetId();
      const workedOn = workedOnId ? getSegmentById(state, workedOnId) : undefined;
      if (workedOn) { renderDetailPanel(target!, workedOn, deps); return; }
      const toolSeg = getSegmentById(state, activeTool.toolSegId);
      if (toolSeg) { renderDetailPanel(target!, toolSeg, deps); return; }
    }

    const segId = state.ui.selectedId;
    const seg = segId ? getSegmentById(state, segId) : undefined;
    if (!seg) { renderOverview(target!, state); return; }
    renderDetailPanel(target!, seg, deps);
  }

  paint(store.getState());
  // The landing adds what a driver shows: the run phase (LOAD NEXT) and the pinned pod.
  const unsub = store.subscribe(
    (s) => [s.ui.memoryRev, s.ui.selectedId, s.ui.activeTool, s.ui.pickedSourceId, s.clock.paused,
      s.run.phase, s.landing.loadNext, s.landing.ended, s.landing.bay.loaded,
      // Slice 2: 046.log's panel follows the log (a scan, a key found, an entry read: no memory change).
      s.run.log.scanned, s.run.log.found.length, s.run.log.read.length] as const,
    () => paint(store.getState()),
    (a, b) => a.every((value, i) => value === b[i]),
  );
  const offOps = onOpsChange((change) => { if (change.type !== 'progress') paint(store.getState()); });
  // A delete question opening is the held tool used on a file (fs-tools remembers it before
  // asking): INSPECT shows that file at once, so the kid sees what the question is about.
  const offConfirm = onInlineConfirmChange(() => paint(store.getState()));
  return () => { unsub(); offOps(); offConfirm(); presses.dispose(); };
}
