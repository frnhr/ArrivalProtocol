import type { Segment, RedundancySegment, DriverSegment, FreeSegment, HollowSegment, LogSegment } from '@/types/segment';
import { shownIntegrity, isInfected, integrityBand, fileLabel, type HealthSegment } from '@state/selectors';
import { INTEGRITY_MAX } from '@data/tuning';
import { podCode } from '@data/landing-text';
import {
  fileHintTarget, podHintTarget, toolFileHintTarget, firewallHintTarget, SEED_HINT_TARGET, ROOT_HINT_TARGET,
} from '@data/fs-tools';
import { stripTier, stripName, type StripTier } from '@data/type-labels';
import { HOLLOW_HUD_TEXT, HOLLOW_FINALE, UNNAMED_HOLLOW } from '@data/hollow-text';
import { UPGRADE_FILE_TEXT } from '@data/upgrades';
import { LOG_SEG_ID } from '@data/log-text';

interface SegmentPartLayout {
  partSize: number;
  partIdx: number;
  totalParts: number;
  partOffset: number;
  // The grid columns the part spans when that is fewer than its blocks: a phone row's free part that also draws the
  // rack's last few free blocks rather than open a row for them (MemoryStrip, WP12 review). Its painters all measure
  // a part as a share of its width, so its blocks are only drawn narrower.
  spanCols?: number;
}

export interface SegmentBehavior {
  onClick: (seg: Segment, event: MouseEvent) => void;
  onMouseEnter: (seg: Segment, part: HTMLElement) => void;
  onMouseLeave: (seg: Segment, part: HTMLElement) => void;
}

// The share of one part of REPAIR CHARGE that still holds points (its --used fill). Fill =
// points / size, so each visible block is one block of memory and the spent blocks show as the
// empty tail that Repair v2 squeezes out. Shared with OpBars, which patches it live while a
// repair spends charge (a full strip rebuild per tick would swallow clicks).
export function chargePartUsedPct(seg: RedundancySegment, partOffset: number, partSize: number): number {
  const filled = Math.max(0, Math.min(seg.size, seg.used));
  const totalPct = seg.size > 0 ? (filled / seg.size) * 100 : 0;
  const partStartPct = (partOffset / seg.size) * 100;
  const partEndPct = ((partOffset + partSize) / seg.size) * 100;
  if (totalPct <= partStartPct) return 0;
  const overlapEnd = Math.min(totalPct, partEndPct);
  return ((overlapEnd - partStartPct) / (partEndPct - partStartPct)) * 100;
}

export function chargeMeta(seg: RedundancySegment): string {
  return `${seg.used}/${seg.size}`;
}

// The AI Core's thread dots: one per thread of capacity. Lit = an op (or a reserved thread) is
// running on it; out = lost while the Core is below 50 (§3.3 C5). Ops already running when the
// Core drops keep their threads until they finish (shownThreadsTotal), so a busy dot never reads
// as lost and the count never reads 2/1.
export function threadRowHtml(capacity: number, threads: number, busy: number): string {
  const shown = shownThreadsTotal(threads, busy);
  const dots: string[] = [];
  for (let i = 0; i < capacity; i++) {
    const cls = i < busy ? ' lit' : i >= shown ? ' out' : '';
    dots.push(`<span class="thread-dot${cls}"></span>`);
  }
  return `${dots.join('')}<span class="thread-count">${busy}/${shown}</span>`;
}

// The thread total a readout shows: the Core's threads, or more while ops that started before a
// drop are still finishing on the lost ones.
export function shownThreadsTotal(threads: number, busy: number): number {
  return Math.max(threads, busy);
}

// What the integrity readout says: `↻ 62%` while a repair heals it, the plain number otherwise.
export const LIVE_REPAIR_PREFIX = '↻ ';

// --- HOLLOW on the strip (§6.6, §7.1) --------------------------------------------------------------

// An infected file's chip: the red crawl comes in from the side that faces HOLLOW and covers the
// share already eaten (--eaten; HollowPainter patches it live, at most HOLLOW_PAINT_HZ on the wall
// clock, so it paints while paused too). A ship file nobody has scanned shows only a fixed hatch:
// the infection is always visible, its health is not (§3.2).
function infectedClasses(seg: Segment, healthShown: boolean): string {
  if (!isInfected(seg)) return '';
  return ` infected from-${seg.infected.side}${healthShown ? '' : ' infected-unknown'}`;
}

function setEaten(part: HTMLElement, seg: Segment, healthShown: boolean): void {
  if (!isInfected(seg) || !healthShown) return;
  part.style.setProperty('--eaten', `${Math.max(0, INTEGRITY_MAX - seg.integrity)}%`);
}

// The live readout of a file being eaten: always the number (an infected file at 85% must not read
// OK), in the warning colour, patched by HollowPainter as it drains.
function infectedHealthHtml(seg: HealthSegment, prefix: string): string {
  return `<span class="health warn live" data-live-integrity="${seg.id}" data-live-prefix="${prefix}">${prefix}${shownIntegrity(seg.integrity)}%</span>`;
}

// A hollow block (§7.1): black with crawling red static, its owner's name (`???`), its NEXT BITE
// countdown (HollowPainter writes and ticks it: `data-hollow-bite`), LOCKED on the root, `ATE C12` on
// a block that was colonists (where they went), the blocks it took on any other eaten one. A 1-block
// one is a glyph; the painter's arrows carry its reach.
// The name and LOCKED (or its size) share the top row, so the countdown under them keeps its big
// digits in a 52 px rack row at 1280×720 (game.css: the tag drops under a long name once the countdown
// is gone; a name cut short carries its whole self in the title).
function hollowPartHtml(seg: HollowSegment, layout: SegmentPartLayout, tier: StripTier): string {
  if (layout.partIdx !== 0) return `<div class="hollow-static" aria-hidden="true"></div>`;
  if (tier === 'micro') return `<div class="hollow-static" aria-hidden="true"></div><div class="seg-name">▚</div>`;
  let tag = `<span class="hollow-tag">${seg.size}B</span>`;
  if (seg.locked) tag = '<span class="hollow-tag locked">LOCKED</span>';
  else if (seg.root) tag = `<span class="hollow-tag root">${HOLLOW_FINALE.rootTag(seg.size)}</span>`;
  else if (seg.atePod !== undefined) tag = `<span class="hollow-tag ate">${HOLLOW_HUD_TEXT.ateTag(podCode(seg.atePod))}</span>`;
  // Phase 3 slice 2 (04 §3.4): a beam seed came with the packet, behind the file the boot's ECC line named: its tag says
  // ECC (where it was named) instead of its size, so it reads apart from HOLLOW's own seeds.
  if (seg.seed && seg.beam) tag = `<span class="hollow-tag ecc">${BEAM_SEED_TAG}</span>`;
  // A seed is a SEED on the strip (WP9): the word the kid is told to DELETE.
  const name = seg.seed ? HOLLOW_HUD_TEXT.seedChip : stripName(seg, layout.partSize);
  return `
    <div class="hollow-static" aria-hidden="true"></div>
    <div class="hollow-head"><div class="seg-name" title="${seg.name}">${name}</div>${tag}</div>
    <div class="hollow-bite" data-hollow-bite><span class="bite-k"></span><span class="bite-t"></span></div>`;
}

// The beam seed's tag (slice 2): the boot's ECC line named it.
const BEAM_SEED_TAG = 'ECC';

// WP11 part 2 (WP8's note): a merged HOLLOW's name (`UNIT-046·047`) was cut to `UNIT-046·…` on an 8-block chip at
// 1280×720. A name longer than one unit's (`UNIT-046`) is set tighter (game.css .long-name) so it fits whole.
const ONE_UNIT_NAME_CHARS = 8;

function renderHollowPart(part: HTMLElement, seg: HollowSegment, layout: SegmentPartLayout, behavior: SegmentBehavior): HTMLElement {
  const tier = stripTier(layout.partSize);
  // `named`: HOLLOW has said who it is (HALCYON's `> i was 046.`): its name is longer than `???` (WP7).
  const named = seg.owner !== UNNAMED_HOLLOW;
  let cls = `seg hollow tier-${tier}${seg.root ? ' hollow-root' : ''}${seg.locked ? ' locked' : ''}${named ? ' named' : ''}${seg.seed ? ' hollow-seed' : ''}`;
  // Beam-born (slice 2, 04 §3.7): a beam seed, or a block one made by eating a file; it counts for TRACE.
  if (seg.beam) cls += ' hollow-beam';
  if (seg.owner.length > ONE_UNIT_NAME_CHARS) cls += ' long-name';
  if (layout.totalParts > 1) {
    cls += ' is-part';
    if (layout.partIdx < layout.totalParts - 1) cls += ' part-continues-right';
    if (layout.partIdx > 0) cls += ' part-continues-left';
  }
  part.className = cls;
  stampPart(part, seg, layout);
  if (seg.operating) part.classList.add('operating');
  part.title = seg.ate ? `${seg.name} · was ${seg.ate}` : seg.name;
  // WP9: a seed HOLLOW dropped is what `RM THE SEED — pick up DELETE, click the seed` lights (its chip reads SEED).
  if (seg.seed && layout.partIdx === 0) part.dataset.hintTarget = SEED_HINT_TARGET;
  // WP11: LAST LIGHT's root, open for the duel, is what `DELETE THE ROOT` lights.
  if (seg.root && !seg.locked && layout.partIdx === 0) part.dataset.hintTarget = ROOT_HINT_TARGET;
  part.innerHTML = hollowPartHtml(seg, layout, tier);
  wire(part, seg, behavior);
  return part;
}

// The log chip's short names on the strip (LogReader's chip painter writes the known one).
export const LOG_STRIP_UNKNOWN = '???';
export const LOG_STRIP_KNOWN = '046';

// --- 046.log (phase 3 slice 2, 05 §3.2, §4) ---------------------------------------------------------------------------
// The log UNIT-046 left: a locked 2-block file in rack F, never infectable, never anyone's to move. Its chip carries the
// name and `3/12` (the keys found) and glows while an entry is unread; LogReader's chip painter writes those from
// run.log after every strip rebuild (`data-log-chip`), because what the run has found is not the segment's (it is copied
// through packets). A strip line can light it (`data-hint-target` = its id: the run-1 SCAN lesson).
function renderLogPart(part: HTMLElement, seg: LogSegment, layout: SegmentPartLayout, behavior: SegmentBehavior): HTMLElement {
  const tier = stripTier(layout.partSize);
  let cls = `seg log locked-log tier-${tier}`;
  if (layout.totalParts > 1) {
    cls += ' is-part';
    if (layout.partIdx < layout.totalParts - 1) cls += ' part-continues-right';
    if (layout.partIdx > 0) cls += ' part-continues-left';
  }
  part.className = cls;
  stampPart(part, seg, layout);
  part.title = seg.name;
  if (layout.partIdx === 0) {
    part.dataset.logChip = '1';
    part.dataset.hintTarget = LOG_SEG_ID;
    // A 2-block chip is about 26 px wide at 1440: the name is cut to its unit's number (`046`, `???` before it is known)
    // over `3/12`; INSPECT and the title carry `046.log` whole.
    part.innerHTML = tier === 'micro'
      ? `<div class="seg-name log-name" data-log-name>${LOG_STRIP_UNKNOWN}</div>`
      : `<div class="seg-name log-name" data-log-name>${LOG_STRIP_UNKNOWN}</div><div class="seg-meta"><span class="log-count" data-log-count></span></div>`;
  } else {
    part.innerHTML = `<div class="seg-cont-marker">↪</div>`;
  }
  wire(part, seg, behavior);
  return part;
}

// --- Pod drivers (01-landing §3.8) ----------------------------------------------------------------
// A driver's chip: the family on top, the heartbeat (the pod's stasis monitor), then the pod (`POD 03`, `P03` on a
// narrow chip: a container query in game.css picks one) and the health, and a corner slot for the bay's BAY / NEXT tag,
// which PodTags paints from the live bay (it changes without a memory change: a reload, a repair finishing).

// The heartbeat line on a driver's chip, the pod's stasis monitor (an ECG trace in a 48×12 box): steady while it would
// land soft, ragged and fast while it would land hard, flat once it can't launch. The bright pulse runs along it (CSS);
// reduced motion keeps the trace and drops the pulse.
export type Heartbeat = 'steady' | 'weak' | 'flat';
const HEARTBEAT_PATH: Readonly<Record<Heartbeat, string>> = {
  steady: 'M0 7 H14 L16 5 L18 7 H21 L23 1 L25 11 L27 6 L28 7 H33 L35 5 L37 7 H48',
  weak: 'M0 7 H8 L10 5.5 L11 7 H15 L16.5 3.5 L18 9.5 L19.5 7 H26 L27 6 L28 7 H31 L32.5 4.5 L33.5 9 L35 7 H40 L41 8 L42 7 H48',
  flat: 'M0 7 H48',
};

// The heartbeat of a driver at this integrity (the chip and INSPECT draw the same one): by its band.
export function heartbeatKind(integrity: number): Heartbeat {
  const band = integrityBand(integrity);
  return band === 'ok' || band === 'degraded' ? 'steady' : band === 'failing' ? 'weak' : 'flat';
}

function heartbeatOf(driver: DriverSegment): Heartbeat {
  return heartbeatKind(driver.integrity);
}

export function heartbeatSvg(kind: Heartbeat): string {
  const path = HEARTBEAT_PATH[kind];
  return `<svg class="heartbeat hb-${kind}" viewBox="0 0 48 12" preserveAspectRatio="none" aria-hidden="true">`
    + `<path class="hb-trace" d="${path}" pathLength="100"/><path class="hb-pulse" d="${path}" pathLength="100"/></svg>`;
}

// A driver's part on the strip. The chip reads like every file (name, bar, meta) with people behind it: the family on
// top (the name a kid remembers), the heartbeat where a file has its bar, then the pod the strip's lines use (POD 03)
// beside the health. Continuation parts of a chip split by a row break show only the ↪ marker.
function driverPartHtml(driver: DriverSegment, layout: SegmentPartLayout): string {
  const isFirst = layout.partIdx === 0;
  if (!isFirst) return `<div class="seg-cont-marker">↪</div>`;
  const shown = shownIntegrity(driver.integrity);
  const beat = heartbeatOf(driver);
  const healthCls = beat === 'steady' ? '' : beat === 'weak' ? ' partial' : ' warn';
  let health: string;
  if (driver.state === 'repairing') {
    health = `<span class="health live${driver.infected ? ' warn' : ''}" data-live-integrity="${driver.id}" data-live-prefix="${LIVE_REPAIR_PREFIX}">${LIVE_REPAIR_PREFIX}${shown}%</span>`;
  } else if (driver.infected) {
    health = infectedHealthHtml(driver, '');
  } else {
    health = driver.state === 'transferring' ? `<span class="health partial">↻ XFER</span>` : `<span class="health${healthCls}">${shown}%</span>`;
  }
  const code = podCode(driver.pod);
  return `
    <span class="drv-tag" data-pod-tag="${driver.pod}"></span>
    <div class="drv-family">${driver.family.toUpperCase()}</div>
    ${heartbeatSvg(heartbeatOf(driver))}
    <div class="seg-meta"><span class="drv-code"><span class="drv-code-long">${code}</span><span class="drv-code-short">${code.replace('POD ', 'P')}</span><span class="drv-count">${driver.colonists}</span></span>${health}</div>`;
}

// Builds a single visual part of a memory segment.
// For non-split segments, totalParts === 1 and partSize === seg.size.
// For split segments, only the first part shows the full label/badge/bar/meta;
// continuation parts show a small ↪ marker so they read as the same file. Free space is the
// exception: every part of a free run is whole (see freePartHtml).
// What a chip shows also depends on its width (stripTier): a 4-block file at 1280 px is about 40 px
// across, so it keeps a smaller name and its health and drops the rest (INSPECT has it all).
export function renderSegmentPart(
  seg: Segment,
  layout: SegmentPartLayout,
  behavior: SegmentBehavior,
): HTMLElement {
  const { partSize, partIdx, totalParts } = layout;
  const isFirst = partIdx === 0;
  const isLast = partIdx === totalParts - 1;
  const isSplit = totalParts > 1;
  const tier = stripTier(partSize);

  const part = document.createElement('div');
  if (seg.type === 'driver') return renderDriverPart(part, seg, layout, behavior);
  if (seg.type === 'hollow') return renderHollowPart(part, seg, layout, behavior);
  if (seg.type === 'log') return renderLogPart(part, seg, layout, behavior);
  let cls = `seg ${seg.type} tier-${tier}`;
  const state = 'state' in seg ? seg.state : undefined;
  // `scanned` is what gates visible damage indicators on the memory strip.
  // Unscanned files render the bar/state as "unknown"; their underlying state
  // is still in the data (drives glitch, window-grip flicker), just not shown
  // here. Segments without a `scanned` field (free, hollow, redundancy)
  // count as "known" for rendering purposes.
  const knownScanned = 'scanned' in seg ? seg.scanned : true;
  if (knownScanned) {
    if (state === 'corrupt') cls += ' corrupt';
    else if (state === 'partial') cls += ' partial';
  } else {
    cls += ' unscanned';
  }
  if (state === 'transferring') cls += ' transferring';
  if (state === 'repairing') cls += ' repairing';
  if (state === 'offline') cls += ' offline offline-state';
  if (state === 'inactive') cls += ' inactive';
  // WP10: a backup a SWAP put to work is a ship file doing its job now: drawn as one, not as a dashed spare.
  if (seg.type === 'ship-backup' && seg.role) cls += ' in-use';
  // Free space a running move/copy carved out around its clone: part of that op, not usable.
  if (seg.type === 'free' && seg.reservedBy !== undefined) cls += ' reserved';
  cls += infectedClasses(seg, knownScanned);
  // A free run that crosses a rack border is drawn as a whole piece of space in each rack, so its
  // parts keep their own borders; a file split by a row break reads as one file with open edges.
  if (isSplit) {
    cls += ' is-part';
    if (seg.type !== 'free') {
      if (!isLast) cls += ' part-continues-right';
      if (!isFirst) cls += ' part-continues-left';
    }
  }
  part.className = cls;
  stampPart(part, seg, layout);
  setEaten(part, seg, knownScanned);
  // A strip line can point at the file that does a job ("CLICK ENGINE I/O"), whatever its id.
  if (isFirst && seg.role) part.dataset.hintTarget = fileHintTarget(seg.role);
  else if (isFirst && seg.type === 'firewall') part.dataset.hintTarget = firewallHintTarget(seg.id);
  else if (isFirst && seg.type === 'fs-tool') part.dataset.hintTarget = toolFileHintTarget(seg.fsTool);
  // A small chip shows a short or broken name: the whole one is a hover away.
  if (tier === 'tiny' || tier === 'micro') part.title = seg.name;

  if (seg.type === 'redundancy') part.style.setProperty('--used', chargePartUsedPct(seg, layout.partOffset, partSize) + '%');

  if (seg.type === 'free') {
    part.innerHTML = freePartHtml(seg, partSize, tier);
  } else if (isFirst) {
    part.innerHTML = filePartHtml(seg, layout, tier, knownScanned, state);
  } else {
    part.innerHTML = `
      <div class="seg-cont-marker">↪</div>
      <div class="seg-meta cont"><span>${partSize} of ${seg.size}B</span></div>
    `;
  }

  wire(part, seg, behavior);
  return part;
}

// Free space as its rack sees it: FREE and the blocks in this part. One free segment can span racks
// (rack C's tail and the empty rack D are one gap in memory), and `↪ 64 of 72B` on an empty rack
// read as a broken file. A sliver of free space too narrow for the word shows only its size.
function freePartHtml(seg: FreeSegment, partSize: number, tier: StripTier): string {
  if (tier === 'micro') return '';
  const name = tier === 'tiny' ? '' : `<div class="seg-name">${seg.name}</div>`;
  return `${name}<div class="seg-meta"><span>${partSize}B</span></div>`;
}

// A file's first part: its badge, name, health bar (dim until scanned), the Core's thread row, and
// the meta row (size or badge on the left, health on the right).
function filePartHtml(
  seg: Exclude<Segment, DriverSegment | FreeSegment | HollowSegment>,
  layout: SegmentPartLayout,
  tier: StripTier,
  knownScanned: boolean,
  state: string | undefined,
): string {
  const { partSize, totalParts } = layout;
  const roomy = tier === 'wide' || tier === 'narrow';
  // The backup badges sit in the meta row, where the size was: in the top corner they covered the
  // name of an 8-block Thrust Controller at 1280 px. A tool file needs no FS badge: it is purple,
  // and it lives in rack F with the others.
  // After a SWAP (WP10) the pair reads as what each now is: the backup doing the job (ALT ✓), and the switched-off
  // primary (OLD: a ship file with no job, the only kind a swap leaves).
  let badge = '';
  if (roomy && seg.type === 'ship' && seg.backup) badge = '<span class="seg-badge alt">BAK ⊃</span>';
  else if (roomy && seg.type === 'ship-backup') {
    badge = seg.role ? '<span class="seg-badge alt on">ALT ✓</span>' : '<span class="seg-badge alt">ALT</span>';
  } else if (roomy && seg.type === 'ship' && seg.role === undefined) badge = '<span class="seg-badge alt old">OLD</span>';

  const integrity = 'integrity' in seg ? seg.integrity : undefined;
  const shown = integrity === undefined ? undefined : shownIntegrity(integrity);

  let bar = '';
  if (integrity !== undefined && seg.type !== 'redundancy') {
    if (knownScanned) {
      bar = `<div class="seg-bar"><div class="fill" style="width:${integrity}%"></div></div>`;
    } else {
      // Pre-scan: no integrity readout. Render a flat, dim placeholder bar so
      // the row visually parks where the bar would be without revealing health.
      bar = `<div class="seg-bar unscanned"></div>`;
    }
  }

  // A 1-block chip is its glyph and its bar: the bar's colour is its health.
  if (tier === 'micro') return `<div class="seg-name">${stripName(seg, partSize)}</div>${bar}`;

  // Inactive / transferring / repairing / locked are observable mid-op states, not health —
  // shown regardless of scan status. Everything else is gated behind a scan. A tiny chip keeps the
  // number and drops the prefix glyphs (◆, ↻: the op bar above it already says REPAIRING).
  const livePrefix = roomy ? LIVE_REPAIR_PREFIX : '';
  let metaR: string;
  if (state === 'inactive') metaR = `<span class="health partial">IDLE</span>`;
  else if (state === 'locked') metaR = `<span class="health warn">LOCK</span>`;
  else if (state === 'transferring') metaR = `<span class="health partial">${roomy ? '↻ XFER' : 'XFER'}</span>`;
  else if (state === 'repairing') {
    metaR = `<span class="health live${isInfected(seg) ? ' warn' : ''}" data-live-integrity="${seg.id}" data-live-prefix="${livePrefix}">${livePrefix}${shown}%</span>`;
  }
  else if (isInfected(seg) && knownScanned) metaR = infectedHealthHtml(seg, '');
  else if (seg.type === 'redundancy') metaR = `<span class="health" data-live-charge>${chargeMeta(seg)}</span>`;
  // A FIREWALL has no health: its chip says what it does (WP8).
  else if (seg.type === 'firewall') {
    metaR = `<span class="health">${roomy ? UPGRADE_FILE_TEXT.firewall.chip : UPGRADE_FILE_TEXT.firewall.chipGlyph}</span>`;
  }
  else if (!knownScanned) metaR = `<span class="health unknown">— —</span>`;
  else if (state === 'corrupt') metaR = `<span class="health warn">${roomy ? '◆ ' : ''}${shown}%</span>`;
  else if (state === 'partial') metaR = `<span class="health partial">${shown}%</span>`;
  else metaR = `<span class="health">OK</span>`;

  const sizeLabel = totalParts > 1 ? `${partSize}/${seg.size}B` : `${seg.size}B`;
  const metaL = !roomy ? '' : badge || `<span>${sizeLabel}</span>`;

  // AI Core renders a row of "thread" dots; OpBars paints them live as ops start and end.
  const threadRow = seg.type === 'core' ? `<div class="thread-row" data-threads></div>` : '';

  return `
    <div class="seg-name">${stripName(seg, partSize)}</div>
    ${bar}
    ${threadRow}
    <div class="seg-meta">${metaL}${metaR}</div>
  `;
}

// The part data every chip carries, so the op bars, the split overlay and the hint painter find a
// file's parts the same way whatever it is: its width on the grid, its id, and where it sits.
function stampPart(part: HTMLElement, seg: Segment, layout: SegmentPartLayout): void {
  part.style.gridColumn = `span ${layout.spanCols ?? layout.partSize}`;
  part.dataset.id = seg.id;
  part.dataset.partIdx = String(layout.partIdx);
  part.dataset.totalParts = String(layout.totalParts);
  part.dataset.partSize = String(layout.partSize);
  part.dataset.partOffset = String(layout.partOffset);
}

function wire(part: HTMLElement, seg: Segment, behavior: SegmentBehavior): void {
  part.addEventListener('click', (event) => behavior.onClick(seg, event));
  part.addEventListener('mouseenter', () => behavior.onMouseEnter(seg, part));
  part.addEventListener('mouseleave', () => behavior.onMouseLeave(seg, part));
}

// A driver's part (see driverPartHtml). It keeps the shared part data (size, index, offset) so the
// op bars, the split overlay and the hint painter treat it like any file.
function renderDriverPart(part: HTMLElement, driver: DriverSegment, layout: SegmentPartLayout, behavior: SegmentBehavior): HTMLElement {
  const { partIdx, totalParts } = layout;
  const isFirst = partIdx === 0;
  let cls = `seg driver hb-${heartbeatOf(driver)}`;
  if (driver.state === 'transferring') cls += ' transferring';
  if (driver.state === 'repairing') cls += ' repairing';
  cls += infectedClasses(driver, true);
  if (totalParts > 1) {
    cls += ' is-part';
    if (partIdx < totalParts - 1) cls += ' part-continues-right';
    if (!isFirst) cls += ' part-continues-left';
  }
  part.className = cls;
  stampPart(part, driver, layout);
  setEaten(part, driver, true);
  part.dataset.pod = String(driver.pod);
  // A strip line can point at a driver by its pod (POD 02 WILL LAND HARD).
  if (isFirst) part.dataset.hintTarget = podHintTarget(fileLabel(driver));
  part.innerHTML = driverPartHtml(driver, layout);
  wire(part, driver, behavior);
  return part;
}
