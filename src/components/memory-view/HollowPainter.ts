import type { Store } from '@state/store';
import type { GameState, VerbTelegraph } from '@state/schema';
import type { InfectionSide } from '@/types/segment';
import { onPostTick } from '@systems/clock';
import { on } from '@systems/events';
import { onWorldReset } from '@systems/reset';
import { hollowReach, healRatePerSec, oppositeSide, openFreeHolding } from '@systems/hollow';
import { biteClock, reachMarks, type GapMark, type BiteMark, type ShieldMark } from '@systems/hollow-hud';
import { infectedSegments, shownIntegrity, healthKnown, verbSecondsLeft } from '@state/selectors';
import { stripTier } from '@data/type-labels';
import { HOLLOW_HUD_TEXT, HOLLOW_VERB } from '@data/hollow-text';
import { requireById, partNumber, replayAnimation } from '@components/dom';
import { heartbeatKind, heartbeatSvg, type Heartbeat } from './SegmentBlock';
import { OUTCOME_WORDS, driverOutlook } from './DetailPanel';
import { segmentStarts } from '@systems/memory-ops';
import { HOLLOW_PAINT_HZ, INTEGRITY_MAX, HOLLOW_FX_MS, CURE_SPARKS, SEED_BLINK_SEC } from '@data/tuning';

// HOLLOW on the strip (§6.6, §7.1, §9 WP6 item 6), drawn so a kid can see it coming and beat it:
// • NEXT BITE m:ss on every hollow block (`?:??` without a timer), pulsing in its last seconds, gone
//   once HOLLOW is done for the ship;
// • its reach: a red mouth on the hollow block's edge, a red dashed edge with an arrow on the file the
//   next bite infects, `◀ GAP 2` in red on the free blocks it bites across, and a green bracket with
//   `WALL 8 ✓` on the free blocks that hold it; a FIREWALL that holds a side gets the same green bracket on
//   its edge that faces HOLLOW (WP8; the free blocks in front of it stay unlabelled: it holds whatever their
//   number). All of it comes from hollowReach (systems/hollow-hud reachMarks), so a label can never disagree
//   with the bite. Nothing while it is done for the ship;
// • the drain: each infected chip's red crawl from the side that faces HOLLOW (--eaten), its live
//   readouts, and its heartbeat and INSPECT's IF PRINTED NOW as the drain crosses a line;
// • the tug-of-war: while a repair fights it, the chip's healthy share turns green with stripes
//   marching toward the red, and one bright green boundary that moves as the green wins;
// • a seed coming (WP9, §6.6): a red outline blinking over the free blocks where it will land, for the 2 AI s of
//   its telegraph (state.hollow.seedTelegraph, mutated per AI tick: drawn on the event and patched with the
//   numbers);
// • the moments, in a short-lived layer over the strip: the bite's red snap on its target, a WALL
//   or FIREWALL flashing green as it holds, the cure's blue sparkles and `SAVED`, an eaten block's red flash and
//   `DID NOT WAKE`;
// • WP11 part 2, a verb counting down (§6.6: "the target is outlined"; made unmistakable after the handover): its target
//   in a solid pink edge that beats each second, a reticle closing in around it and a badge over it (`UNLINK 3`), the
//   rest of the strip dimmed, and an MV's landing spot outlined too (`MV →`); BLOCKED flashes the target green with
//   `BLOCKED`; a landed verb flashes where its file was (`UNLINKED`) or where the block went (`MOVED`).
// The marks are rebuilt after every strip rebuild (memoryRev: an infection, a cure, an op, an eaten
// file all bump it; this subscribes after MemoryStrip); the numbers are patched at most
// HOLLOW_PAINT_HZ in between. Sparkle scatter uses Math.random: cosmetic, like the glitch jerk.

const PAINT_EVERY_SEC = 1 / HOLLOW_PAINT_HZ;
const SEG_MARK_CLASSES = [
  'bite-target', 'bite-at-left', 'bite-at-right', 'bite-urgent', 'mouth-left', 'mouth-right',
  'hollow-gap', 'hollow-wall', 'reach-at-left', 'reach-at-right', 'tug', 'hollow-quiet', 'firewall-holding',
  'verb-target', 'verb-urgent', 'verb-beat',
] as const;
const HEARTBEATS: readonly Heartbeat[] = ['steady', 'weak', 'flat'];
// The sparks fly up and out of the chip (px), each a little late (s), so the red seems to shatter.
const SPARK_SPREAD_X_PX = 26;
const SPARK_RISE_MIN_PX = 8;
const SPARK_RISE_SPAN_PX = 30;
const SPARK_DELAY_MAX_SEC = 0.18;
const ARROW: Readonly<Record<InfectionSide, string>> = { left: '◀', right: '▶' };
// A verb's reticle stands this far outside its target's chip (px) when the countdown starts, and closes in to the
// smaller gap as it runs out (under reduced motion it stands there from the start). The badge floats this far above it.
const RETICLE_GAP_START_PX = 10;
const RETICLE_GAP_END_PX = 3;
const AIM_BADGE_LIFT_PX = 7;
// A target the strip has scrolled out of view (a phone shows two racks of six) is scrolled back in with this much room
// above it, so its badge is not cut off by the rack above's edge.
const AIM_SCROLL_ROOM_PX = 34;

function partsOf(root: ParentNode, segId: string): HTMLElement[] {
  const parts = Array.from(root.querySelectorAll<HTMLElement>(`.seg[data-id="${CSS.escape(segId)}"]`));
  return parts.sort((a, b) => partNumber(a, 'partIdx') - partNumber(b, 'partIdx'));
}

// A file's part on one of its edges: its first part on the left, its last on the right.
function edgePart(parts: HTMLElement[], edge: InfectionSide): HTMLElement | undefined {
  return edge === 'left' ? parts[0] : parts[parts.length - 1];
}

function addMark(part: HTMLElement, cls: string, text = ''): HTMLElement {
  const mark = document.createElement('span');
  mark.className = `hollow-mark ${cls}`;
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = text;
  part.appendChild(mark);
  return mark;
}

function setTitle(part: HTMLElement, title: string): void {
  part.title = title;
  part.dataset.hollowTitle = '1';
}

// Every .seg part carries its size (SegmentBlock); a part without one is a rendering bug (dom.ts partNumber throws).
function partBlocks(part: HTMLElement): number {
  return partNumber(part, 'partSize');
}

// --- The marks (on every strip rebuild) ----------------------------------------------------------------

function clearMarks(root: HTMLElement): void {
  root.querySelectorAll('.hollow-mark').forEach((mark) => mark.remove());
  root.querySelectorAll<HTMLElement>('.seg').forEach((part) => {
    part.classList.remove(...SEG_MARK_CLASSES);
    if (part.dataset.hollowTitle) {
      part.removeAttribute('title');
      delete part.dataset.hollowTitle;
    }
  });
}

// The file the next bite infects: a red dashed edge with an arrow pointing in, where the red will
// come from; and the hollow block's mouth on the side that faces it.
function paintBite(root: HTMLElement, bite: BiteMark): void {
  const target = edgePart(partsOf(root, bite.targetId), bite.edge);
  if (target) {
    target.classList.add('bite-target', `bite-at-${bite.edge}`);
    addMark(target, `bite-mark at-${bite.edge}`, ARROW[oppositeSide(bite.edge)]);
  }
  const mouth = edgePart(partsOf(root, bite.hollowId), bite.mouth);
  if (mouth) {
    mouth.classList.add(`mouth-${bite.mouth}`);
    addMark(mouth, `mouth-mark at-${bite.mouth}`);
  }
}

// The free blocks next to a hollow block. A GAP is red dashed all the way across, its label on the
// part that touches HOLLOW pointing the way the bite goes (`◀ GAP 2`); a WALL is a green bracket on
// the edge that faces HOLLOW, with `WALL 8 ✓` on that part only (rack D's 64 free blocks behind it
// stay plain free space).
function paintGap(root: HTMLElement, gap: GapMark): void {
  const parts = gap.segIds.flatMap((segId) => partsOf(root, segId));
  if (parts.length === 0) return;
  // The gap's segments run away from the hollow block: the part touching it is the nearest one.
  const touching = gap.hollowEdge === 'left' ? parts[0]! : parts[parts.length - 1]!;
  const travel = oppositeSide(gap.hollowEdge);
  // Two lines (`GAP` over `◀ 2`) fit a 2-block chip. A 1-block one has room for one glyph a line: the
  // arrow over the count (`▶` over `1`), so the number the 4-block rule needs is always there; the
  // whole `GAP 1 · TOO SMALL` is the tooltip.
  const micro = stripTier(partBlocks(touching)) === 'micro';
  if (gap.kind === 'gap') {
    for (const part of parts) {
      part.classList.add('hollow-gap', `reach-at-${gap.hollowEdge}`);
      setTitle(part, gap.title);
    }
    const count = travel === 'left' ? `${ARROW.left}${gap.count}` : `${gap.count}${ARROW.right}`;
    labelMark(touching, `gap-mark towards-${travel}${micro ? ' micro' : ''}`, micro ? ARROW[travel] : gap.word, micro ? gap.count : count);
    return;
  }
  touching.classList.add('hollow-wall', `reach-at-${gap.hollowEdge}`);
  setTitle(touching, gap.title);
  labelMark(touching, `wall-mark at-${gap.hollowEdge}`, micro ? '' : gap.word, micro ? '✓' : gap.count);
}

// A FIREWALL holding a side: the green bracket on its edge that faces HOLLOW (the WALL's look), and the rule
// in its tooltip.
function paintShield(root: HTMLElement, shield: ShieldMark): void {
  const part = edgePart(partsOf(root, shield.firewallId), shield.hollowEdge);
  if (!part) return;
  part.classList.add('firewall-holding', `reach-at-${shield.hollowEdge}`);
  setTitle(part, HOLLOW_HUD_TEXT.shieldTitle);
}

function labelMark(part: HTMLElement, cls: string, word: string, count: string): void {
  const mark = addMark(part, cls);
  if (word) addLine(mark, 'mark-word', word);
  addLine(mark, 'mark-count', count);
}

function addLine(mark: HTMLElement, cls: string, text: string): void {
  const line = document.createElement('span');
  line.className = cls;
  line.textContent = text;
  mark.appendChild(line);
}

function paintMarks(root: HTMLElement, state: Readonly<GameState>): void {
  clearMarks(root);
  const clock = biteClock(state);
  if (clock.quiet) root.querySelectorAll<HTMLElement>('.seg.hollow').forEach((chip) => chip.classList.add('hollow-quiet'));
  const marks = reachMarks(state);
  marks.bites.forEach((bite) => paintBite(root, bite));
  marks.gaps.forEach((gap) => paintGap(root, gap));
  marks.shields.forEach((shield) => paintShield(root, shield));
  // The tug-of-war: the green share and its boundary, on every part of a file a repair is fighting for.
  for (const seg of infectedSegments(state)) {
    if (!healthKnown(seg) || healRatePerSec(state, seg) <= 0) continue;
    for (const part of partsOf(root, seg.id)) {
      part.classList.add('tug');
      addMark(part, `tug-front from-${seg.infected.side}`);
    }
  }
  paintNumbers(root, state);
}

// --- The numbers (≤ HOLLOW_PAINT_HZ) ----------------------------------------------------------------------

function patchText(target: Element, text: string): void {
  if (target.textContent !== text) target.textContent = text;
}

// NEXT BITE on every hollow block (just the time on a tiny one), urgent in its last seconds: the
// block and the files it is about to bite pulse together.
function paintBiteClock(root: HTMLElement, state: Readonly<GameState>): void {
  const clock = biteClock(state);
  root.querySelectorAll<HTMLElement>('[data-hollow-bite]').forEach((slot) => {
    const chip = slot.closest<HTMLElement>('.seg');
    const tiny = chip ? stripTier(partBlocks(chip)) === 'tiny' : false;
    patchText(slot.querySelector('.bite-k')!, tiny ? '' : clock.key);
    patchText(slot.querySelector('.bite-t')!, clock.time);
    // WP10: THE DEAL's answer, in the colour of what it bought (fed: calm) or cost (faster: hot).
    if ((slot.dataset.mood ?? '') !== (clock.mood ?? '')) {
      if (clock.mood === null) delete slot.dataset.mood;
      else slot.dataset.mood = clock.mood;
    }
  });
  root.querySelectorAll<HTMLElement>('.seg.hollow, .seg.bite-target').forEach((part) => {
    part.classList.toggle('bite-urgent', clock.urgent && !clock.quiet);
  });
}

// A driver the drain pushed across a line keeps the right heartbeat and the right IF LAUNCHED NOW
// (the strip and the panel rebuild only on a discrete change).
function paintOutcome(root: HTMLElement, segId: string, integrity: number): void {
  const outcome = driverOutlook(integrity);
  const kind = heartbeatKind(integrity);
  const chip = partsOf(root, segId)[0];
  if (chip && !chip.classList.contains(`hb-${kind}`)) {
    HEARTBEATS.forEach((beat) => chip.classList.toggle(`hb-${beat}`, beat === kind));
    chip.querySelector('svg.heartbeat')?.replaceWith(svgFrom(heartbeatSvg(kind)));
  }
  document.querySelectorAll<HTMLElement>(`[data-live-outcome="${CSS.escape(segId)}"]`).forEach((readout) => {
    if (readout.dataset.outcomePart === 'heart') {
      if (readout.classList.contains(`hb-${kind}`)) return;
      readout.className = `soul-heart hb-${kind}`;
      readout.innerHTML = heartbeatSvg(kind);
      return;
    }
    const words = OUTCOME_WORDS[outcome];
    patchText(readout, words.text);
    readout.className = `v ${words.cls}`;
  });
}

function svgFrom(html: string): Element {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.firstElementChild!;
}

// The seed's telegraph (§6.6): an outline over exactly the blocks it will land on, inside the free part(s) that
// hold them (a gap can run across a row's end). Nothing when no seed is coming, or when the spot is no longer
// open free space (a MOVE took it: the seed re-aims as it lands).
function paintTelegraph(root: HTMLElement, state: Readonly<GameState>): void {
  const telegraph = state.hollow.seedTelegraph;
  // The free segment that holds the spot is part of the key: a MOVE that takes or reserves it mid-telegraph
  // takes the outline away at once (the seed re-aims as it lands).
  const index = telegraph === null ? -1 : openFreeHolding(state.memory, telegraph.startAddr, telegraph.size);
  const key = telegraph === null ? '' : `${telegraph.startAddr}|${telegraph.size}|${index}`;
  const marks = Array.from(root.querySelectorAll<HTMLElement>('.hollow-mark.seed-telegraph'));
  if (marks.length > 0 && marks.every((mark) => mark.dataset.key === key)) return;
  marks.forEach((mark) => mark.remove());
  if (telegraph === null || index < 0) return;
  const starts = segmentStarts(state.memory);
  const free = state.memory[index]!;
  for (const part of partsOf(root, free.id)) {
    const size = partBlocks(part);
    const partStart = starts[index]! + partNumber(part, 'partOffset');
    const from = Math.max(partStart, telegraph.startAddr);
    const to = Math.min(partStart + size, telegraph.startAddr + telegraph.size);
    if (to <= from) continue;
    const mark = addMark(part, 'seed-telegraph');
    mark.dataset.key = key;
    mark.style.left = `${((from - partStart) / size) * 100}%`;
    mark.style.width = `${((to - from) / size) * 100}%`;
  }
}

// A verb counting down (WP11 part 2; made unmistakable after the handover: the kid has 3 s, the first time 4, to find
// one file among forty). Its target's chip wears a solid pink edge and glow (`verb-target`) that beats once per
// countdown second, the rest of the strip dims a little (`verb-aiming` on the strip), and the aim (a reticle of four
// corner brackets around each part, closing in as the seconds run out, and a badge over the first part: `UNLINK 3`)
// sits outside the chip, so the file's own name stays readable. An MV's landing spot is outlined over the free blocks
// it will take (inside the free part(s) that hold them, like a seed's). Rebuilt when the verb or the strip changes (the
// key), its numbers patched and the aim placed again every tick in between. The target's last rects are kept for the
// landed flash (the file is gone from the strip by then).
// Module state of the run (§9 resets): cleared on a world reset too, so a countdown a ship's end or a NEW RUN called
// off (it emits nothing) leaves no rects, and no aim, from the ship before.
let lastVerbRects: { kind: 'rm' | 'mv'; rects: DOMRect[] } | null = null;

// The aim lives in the fx layer, fixed to the viewport (a chip clips its own children, and the badge stands over the
// rack above): one reticle per part of the target, the badge, the whole second last beaten, and whether the strip has
// shown it yet (the first time it does, a target scrolled out of view is scrolled in).
interface VerbAim {
  key: string;
  reticles: HTMLElement[];
  badge: HTMLElement;
  second: number | null;
  shown: boolean;
}
let verbAim: VerbAim | null = null;
// The fx layer the aim is drawn in (mountHollowPainter's).
let aimLayer: HTMLElement | null = null;

function aimMark(cls: string): HTMLElement {
  if (aimLayer === null) throw new Error('HollowPainter: a verb aimed before the painter was mounted');
  const mark = document.createElement('div');
  mark.className = `verb-aim ${cls}`;
  mark.setAttribute('aria-hidden', 'true');
  aimLayer.appendChild(mark);
  return mark;
}

function clearVerbAim(root: HTMLElement): void {
  root.querySelectorAll('.hollow-mark.verb-dest').forEach((mark) => mark.remove());
  root.querySelectorAll('.seg.verb-target').forEach((part) => part.classList.remove('verb-target', 'verb-urgent', 'verb-beat'));
  root.classList.remove('verb-aiming');
  verbAim?.reticles.forEach((reticle) => reticle.remove());
  verbAim?.badge.remove();
  verbAim = null;
}

function paintVerb(root: HTMLElement, state: Readonly<GameState>): void {
  const verb = state.hollow.verb;
  const parts = verb === null ? [] : partsOf(root, verb.targetId);
  const destIndex = verb === null || verb.toAddr === null || parts.length === 0 ? -1 : openFreeHolding(state.memory, verb.toAddr, partsSize(parts));
  const key = verb === null ? '' : `${verb.kind}|${verb.targetId}|${verb.toAddr ?? ''}|${destIndex}|${parts.length}`;
  const current = verbAim !== null && verbAim.key === key && parts.every((part) => part.classList.contains('verb-target'));
  if (!current) {
    // A strip rebuilt under a standing countdown keeps its beat and whether the strip has shown it (no second scroll).
    const kept = verbAim !== null && verbAim.key === key ? { second: verbAim.second, shown: verbAim.shown } : { second: null, shown: false };
    clearVerbAim(root);
    if (verb === null || parts.length === 0) return;
    parts.forEach((part) => part.classList.add('verb-target'));
    root.classList.add('verb-aiming');
    verbAim = { key, reticles: parts.map(() => aimMark('verb-reticle')), badge: aimMark('verb-aim-badge'), ...kept };
    if (verb.toAddr !== null && destIndex >= 0) paintVerbDest(root, state, verb.toAddr, partsSize(parts), destIndex, key);
  }
  if (verb === null || verbAim === null) return;
  const aim = verbAim;
  const second = verbSecondsLeft(verb);
  patchText(aim.badge, HOLLOW_VERB.badge(verb.kind, second));
  parts.forEach((part) => part.classList.toggle('verb-urgent', second <= 1));
  // One beat per countdown second, the first as it appears (CSS: none under reduced motion).
  if (aim.second === null || second < aim.second) [...parts, ...aim.reticles].forEach((element) => replayAnimation(element, 'verb-beat'));
  aim.second = second;
  placeAim(root, aim, parts, verb, state);
  if (state.ui.mode === 'memory') {
    const rects = parts.map(rectOf).filter((rect): rect is DOMRect => rect !== null);
    if (rects.length > 0) lastVerbRects = { kind: verb.kind, rects };
  }
}

// The reticles around the parts the strip shows, the badge over the first of them (kept inside the strip's width, its
// tail pointing at the chip). A part scrolled out of the strip gets none (the layer is fixed: it would draw over the
// panels around the strip).
function placeAim(root: HTMLElement, aim: VerbAim, parts: readonly HTMLElement[], verb: Readonly<VerbTelegraph>, state: Readonly<GameState>): void {
  const inBlue = state.ui.mode === 'memory';
  const view = root.getBoundingClientRect();
  const inView = (rect: DOMRect | null): rect is DOMRect => rect !== null && rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1;
  const rects = parts.map(rectOf);
  const first = rects[0];
  if (inBlue && first && !aim.shown) {
    aim.shown = true;
    if (!rects.some(inView)) {
      root.scrollTo({ top: root.scrollTop + first.top - view.top - AIM_SCROLL_ROOM_PX, behavior: state.ui.reducedMotion ? 'auto' : 'smooth' });
    }
  }
  const progress = Math.max(0, Math.min(1, verb.leftSec / verb.totalSec));
  const gap = state.ui.reducedMotion ? RETICLE_GAP_END_PX : RETICLE_GAP_END_PX + (RETICLE_GAP_START_PX - RETICLE_GAP_END_PX) * progress;
  aim.reticles.forEach((reticle, index) => {
    const rect = rects[index] ?? null;
    reticle.hidden = !inBlue || !inView(rect);
    if (reticle.hidden || rect === null) return;
    reticle.style.left = `${rect.left - gap}px`;
    reticle.style.top = `${rect.top - gap}px`;
    reticle.style.width = `${rect.width + 2 * gap}px`;
    reticle.style.height = `${rect.height + 2 * gap}px`;
  });
  const anchor = rects.find(inView);
  aim.badge.hidden = !inBlue || anchor === undefined;
  if (anchor === undefined) return;
  const half = aim.badge.offsetWidth / 2;
  const target = anchor.left + anchor.width / 2;
  const center = Math.max(view.left + half, Math.min(view.right - half, target));
  aim.badge.style.left = `${center}px`;
  aim.badge.style.top = `${anchor.top - gap - AIM_BADGE_LIFT_PX}px`;
  aim.badge.style.setProperty('--tail-x', `${target - center + half}px`);
}

// A hollow block's size from its parts (each carries its own size).
function partsSize(parts: readonly HTMLElement[]): number {
  return parts.reduce((sum, part) => sum + partBlocks(part), 0);
}

function paintVerbDest(root: HTMLElement, state: Readonly<GameState>, toAddr: number, size: number, index: number, key: string): void {
  const starts = segmentStarts(state.memory);
  const free = state.memory[index]!;
  for (const part of partsOf(root, free.id)) {
    const partSize = partBlocks(part);
    const partStart = starts[index]! + partNumber(part, 'partOffset');
    const from = Math.max(partStart, toAddr);
    const to = Math.min(partStart + partSize, toAddr + size);
    if (to <= from) continue;
    const mark = addMark(part, 'verb-dest', HOLLOW_VERB.destMark);
    mark.dataset.key = key;
    mark.style.left = `${((from - partStart) / partSize) * 100}%`;
    mark.style.width = `${((to - from) / partSize) * 100}%`;
  }
}

function paintNumbers(root: HTMLElement, state: Readonly<GameState>): void {
  paintBiteClock(root, state);
  paintTelegraph(root, state);
  paintVerb(root, state);
  for (const seg of infectedSegments(state)) {
    if (!healthKnown(seg)) continue;
    const eaten = `${Math.max(0, INTEGRITY_MAX - seg.integrity)}%`;
    const shown = shownIntegrity(seg.integrity);
    partsOf(root, seg.id).forEach((part) => part.style.setProperty('--eaten', eaten));
    document.querySelectorAll<HTMLElement>(`[data-live-integrity="${CSS.escape(seg.id)}"]`).forEach((element) => {
      patchText(element, `${element.dataset.livePrefix ?? ''}${shown}%`);
    });
    if (seg.type === 'driver') paintOutcome(root, seg.id, seg.integrity);
  }
}

// --- The moments ---------------------------------------------------------------------------------------------

function rectOf(part: HTMLElement): DOMRect | null {
  const rect = part.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function fxBox(layer: HTMLElement, cls: string, rect: DOMRect): HTMLElement {
  const box = document.createElement('div');
  box.className = cls;
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  layer.appendChild(box);
  setTimeout(() => box.remove(), HOLLOW_FX_MS);
  return box;
}

function fxLabel(layer: HTMLElement, cls: string, text: string, rect: DOMRect): void {
  const label = document.createElement('div');
  label.className = cls;
  label.textContent = text;
  label.style.left = `${rect.left + rect.width / 2}px`;
  label.style.top = `${rect.top}px`;
  layer.appendChild(label);
  setTimeout(() => label.remove(), HOLLOW_FX_MS);
}

// The red shatters into blue sparkles (§5.1, §7.3), and `SAVED` floats up.
function sparkle(layer: HTMLElement, parts: HTMLElement[]): void {
  parts.forEach((part, partIndex) => {
    const rect = rectOf(part);
    if (!rect) return;
    fxBox(layer, 'hollow-fx cure-flash', rect);
    const sparks = Math.max(1, Math.round(CURE_SPARKS / parts.length));
    for (let i = 0; i < sparks; i++) {
      const spark = document.createElement('div');
      spark.className = 'cure-spark';
      spark.style.left = `${rect.left + Math.random() * rect.width}px`;
      spark.style.top = `${rect.top + Math.random() * rect.height}px`;
      spark.style.setProperty('--dx', `${(Math.random() * 2 - 1) * SPARK_SPREAD_X_PX}px`);
      spark.style.setProperty('--dy', `${-SPARK_RISE_MIN_PX - Math.random() * SPARK_RISE_SPAN_PX}px`);
      spark.style.animationDelay = `${Math.random() * SPARK_DELAY_MAX_SEC}s`;
      layer.appendChild(spark);
      setTimeout(() => spark.remove(), HOLLOW_FX_MS);
    }
    if (partIndex === 0) fxLabel(layer, 'hollow-fx-label saved', HOLLOW_HUD_TEXT.saved, rect);
  });
}

export function mountHollowPainter(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  memWrap.style.setProperty('--seed-blink-sec', `${SEED_BLINK_SEC}s`);
  const layer = document.createElement('div');
  layer.className = 'hollow-fx-layer memory-view';
  document.body.appendChild(layer);
  aimLayer = layer;
  const inBlue = (): boolean => store.getState().ui.mode === 'memory';

  paintMarks(memWrap, store.getState());
  // After MemoryStrip's rebuild (this subscribes later), and when HOLLOW wakes or goes quiet.
  const unsub = store.subscribe(
    (s) => `${s.ui.memoryRev}|${s.hollow.phase}`,
    () => paintMarks(memWrap, store.getState()),
  );
  // A wall clock, not AI time: a debug bite while paused, or a rebuild while paused, still paints.
  let sincePaint = 0;
  const offTick = onPostTick((dtWall) => {
    // A verb's badge counts with the TERMINAL's line, every tick (WP11 part 2: the two must never read 3 and 2), and
    // its aim follows the strip as it scrolls.
    if (store.getState().hollow.verb !== null) paintVerb(memWrap, store.getState());
    sincePaint += dtWall;
    if (sincePaint < PAINT_EVERY_SEC) return;
    sincePaint = 0;
    paintNumbers(memWrap, store.getState());
  });

  const offs = [
    // A seed is coming (WP9): its outline at once, not at the next paint.
    on('seed-telegraph', () => paintTelegraph(memWrap, store.getState())),
    // WP11 part 2: a verb is counting down: its outline at once.
    on('verb-telegraph', () => paintVerb(memWrap, store.getState())),
    // ...it was blocked: the target flashes green, `BLOCKED` floats up off it.
    on('verb-blocked', ({ targetId }) => {
      paintVerb(memWrap, store.getState());
      if (!inBlue()) return;
      partsOf(memWrap, targetId).forEach((part, i) => {
        const rect = rectOf(part);
        if (!rect) return;
        fxBox(layer, 'hollow-fx verb-blocked-flash', rect);
        if (i === 0) fxLabel(layer, 'hollow-fx-label blocked', HOLLOW_VERB.stamp, rect);
      });
    }),
    // ...it landed: where the file was flashes red (`UNLINKED`), or the block's new place does (`MOVED`).
    on('verb-landed', ({ kind, targetId }) => {
      const before = lastVerbRects;
      lastVerbRects = null;
      paintVerb(memWrap, store.getState());
      if (!inBlue()) return;
      const rects = kind === 'mv'
        ? partsOf(memWrap, targetId).map(rectOf).filter((rect): rect is DOMRect => rect !== null)
        : before?.rects ?? [];
      rects.forEach((rect, i) => {
        fxBox(layer, 'hollow-fx verb-landed-flash', rect);
        if (i === 0) fxLabel(layer, 'hollow-fx-label eaten', kind === 'mv' ? HOLLOW_VERB.movedLabel : HOLLOW_VERB.unlinkedLabel, rect);
      });
    }),
    on('verb-failed', () => { lastVerbRects = null; paintVerb(memWrap, store.getState()); }),
    // The bite lands: its target's edge snaps red where it came in.
    on('hollow-infect', ({ segId, side }) => {
      if (!inBlue()) return;
      const part = edgePart(partsOf(memWrap, segId), side);
      const rect = part ? rectOf(part) : null;
      if (rect) fxBox(layer, `hollow-fx bite-flash at-${side}`, rect);
    }),
    // A WALL held: the free blocks that touch the hollow block flash green.
    on('hollow-wall', ({ hollowId, side }) => {
      if (!inBlue()) return;
      const state = store.getState();
      const reach = hollowReach(state.memory, state.clock.aiSec).find((candidate) => candidate.hollowId === hollowId && candidate.side === side);
      const nearest = reach?.gapIds[0];
      if (!nearest) return;
      const part = edgePart(partsOf(memWrap, nearest), oppositeSide(side));
      const rect = part ? rectOf(part) : null;
      if (rect) fxBox(layer, `hollow-fx wall-flash at-${oppositeSide(side)}`, rect);
    }),
    // A FIREWALL held: its edge that faces the hollow block flashes green.
    on('hollow-firewall', ({ firewallId, side }) => {
      if (!inBlue()) return;
      const part = edgePart(partsOf(memWrap, firewallId), oppositeSide(side));
      const rect = part ? rectOf(part) : null;
      if (rect) fxBox(layer, `hollow-fx wall-flash at-${oppositeSide(side)}`, rect);
    }),
    on('hollow-cure', ({ segId }) => {
      if (inBlue()) sparkle(layer, partsOf(memWrap, segId));
    }),
    // An eaten file: the block it became flashes red, with what it means.
    on('hollow-consume', ({ segId, driver }) => {
      if (!inBlue()) return;
      partsOf(memWrap, segId).forEach((part, i) => {
        const rect = rectOf(part);
        if (!rect) return;
        fxBox(layer, 'hollow-fx eaten-flash', rect);
        if (i === 0) fxLabel(layer, 'hollow-fx-label eaten', driver ? HOLLOW_HUD_TEXT.lostSoul : HOLLOW_HUD_TEXT.lostFile, rect);
      });
    }),
  ];

  const offReset = onWorldReset(
    'hollow-painter-verb',
    () => { lastVerbRects = null; clearVerbAim(memWrap); },
    () => ({ rects: lastVerbRects !== null, aim: verbAim !== null }),
  );

  return () => {
    unsub();
    offTick();
    offReset();
    offs.forEach((off) => off());
    clearVerbAim(memWrap);
    layer.remove();
    aimLayer = null;
    lastVerbRects = null;
  };
}
