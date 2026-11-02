// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { ChartModel, ChartNode, OlderColonyDot } from '@systems/desk';
import { MAP_TEXT } from '@data/map-text';
import {
  CHART_NODE_PX, CHART_ARK_PX, CHART_PAD_PX, CHART_LABEL_ROOM_PX, CHART_STARS, CHART_PHONE_PX_PER_LY, CHART_PORTRAIT_DEG, CHART_LANDSCAPE_DEG,
  TAKEN_MARK_OFFSET_PX,
} from '@data/tuning';

// The STAR CHART's drawing (02-map §4; slice-3a-plan §5.2), one SVG shared by the DESK, the title card's faint chart and
// the RUN TALLY's mini route. It draws in pixels (the SVG's viewBox is its own size), so node squares, line weights and
// labels keep their size at any zoom; the arm is projected onto it from LY (SOL at the origin, y up), turned by
// `rotateDeg` (the phone turns the arm to run from SOL at the bottom to the final ship at the top) and fitted with a
// margin, or (`pxPerLy`) drawn at a fixed scale for a scrolling phone chart. Uplink's vocabulary: square nodes (arks
// bigger, a TIGHT ship's corner notched), the final ship a pulsing beacon, beams solid when CLEAN and more broken with
// noise, noise clouds as hatched static, the route a bright trail, the last unit's trail faint and dashed (046's written
// one on run 1), the six key rings round SOL with the next one labelled. States are classes (styles/desk.css colours
// them); a node carries data-slot for the views' clicks and hovers, a trail mark or an older colony data-tip (its words).
// Slice 3c (3c plan risk 10): each of the trail's stops is a small mark offset along the trail toward the stop before it
// (TAKEN_MARK_OFFSET_PX), so a live ship at the same world keeps its node: a hollow square while TAKEN, a green dot once
// it is a colony, a grey ring for NO COLONY; the grey cross where it was lost; a ring round the first stop for its beacon;
// older units' colonies as faint green dots on the other side of the world. Pure DOM building: no store, no listeners.

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ChartDrawOpts {
  width: number;               // px (the host's)
  height: number | null;       // px; null: as tall as the arm needs at `pxPerLy` (the phone's scrolling chart)
  rotateDeg: number;           // counter-clockwise, applied to the arm before fitting
  pxPerLy?: number;            // a fixed scale (with height null)
  labels: 'all' | 'beacon' | 'route' | 'none';
  beams: boolean;              // the beams from the current ship (the desk)
  clouds: boolean;
  rings: boolean;
  trail: boolean;              // the last unit's trail (its marks, the grey cross, the beacon) and older units' colonies
  route: boolean;
  stars: boolean;
  beamFromSol?: boolean;       // the title's RECEIVE beam, SOL → the first ship
  idPrefix: string;            // the hatch patterns' ids (several charts on one page)
}

export interface ChartGeometry {
  width: number;
  height: number;
  at: (x: number, y: number) => { px: number; py: number };
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (cls) node.setAttribute('class', cls);
  return node;
}

function text(x: number, y: number, content: string, cls: string, anchor: 'start' | 'middle' | 'end' = 'start'): SVGTextElement {
  const node = el('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor }, cls);
  node.textContent = content;
  return node;
}

// A small deterministic scatter (the chart's faint stars): the same sky every time, no Math.random in a view.
function scatter(count: number): { along: number; across: number; size: number }[] {
  let seed = 0x2300;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from({ length: count }, () => ({ along: -20 + next() * 220, across: (next() - 0.5) * (40 + next() * 60), size: next() }));
}
const SKY = scatter(CHART_STARS);
// The arm's axis (SOL → New Haven), for the stars and the ring labels.
const AXIS_RAD = Math.atan2(116, 138);

// The projection: LY → px, fitted to the box (or at a fixed scale).
export function chartGeometry(model: Readonly<ChartModel>, opts: Readonly<ChartDrawOpts>): ChartGeometry {
  const rad = (opts.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const turn = (x: number, y: number): { u: number; v: number } => ({ u: x * cos - y * sin, v: x * sin + y * cos });
  const points = [{ x: 0, y: 0 }, ...model.nodes.map((node) => ({ x: node.x, y: node.y }))].map((p) => turn(p.x, p.y));
  const minU = Math.min(...points.map((p) => p.u));
  const maxU = Math.max(...points.map((p) => p.u));
  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));
  const labelRoom = opts.labels === 'all' ? CHART_LABEL_ROOM_PX : opts.labels === 'none' ? 0 : CHART_LABEL_ROOM_PX / 2;
  const padL = CHART_PAD_PX;
  const padR = CHART_PAD_PX + labelRoom;
  const padT = CHART_PAD_PX + (opts.labels === 'none' ? 0 : 14);
  const padB = CHART_PAD_PX + (opts.labels === 'none' ? 0 : 14);
  const spanU = Math.max(1, maxU - minU);
  const spanV = Math.max(1, maxV - minV);
  let scale: number;
  let height: number;
  if (opts.height === null) {
    scale = opts.pxPerLy ?? CHART_PHONE_PX_PER_LY;
    scale = Math.min(scale, (opts.width - padL - padR) / spanU);
    height = Math.ceil(spanV * scale + padT + padB);
  } else {
    height = opts.height;
    scale = Math.max(0.5, Math.min((opts.width - padL - padR) / spanU, (height - padT - padB) / spanV));
  }
  const offU = padL + (opts.width - padL - padR - spanU * scale) / 2;
  const offV = padT + (height - padT - padB - spanV * scale) / 2;
  return {
    width: opts.width,
    height,
    at: (x, y) => {
      const p = turn(x, y);
      return { px: offU + (p.u - minU) * scale, py: offV + (maxV - p.v) * scale };
    },
  };
}

// --- Labels: two lines (`NAME · colonists`, then the year) beside each node, placed greedily so they do not cover each
// other or another node: the ships that matter now first (the one being left, those in reach, the final ship), each
// at the first free spot of right, left, above and below, else the least covered. Widths are estimated from the
// monospace font (styles/desk.css: 11 px JetBrains Mono with a little letter spacing).
const LABEL_CHAR_PX = 7.3;
const LABEL_ASCENT_PX = 9;
const LABEL_LINE_PX = 11;
const LABEL_HEIGHT_PX = 23;
// The beacon's tag is set larger and wider-spaced (styles/desk.css .beacon-label: 12 px, 0.22 em).
const BEACON_CHAR_PX = 10;

interface LabelSpot { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
interface Box { x0: number; y0: number; x1: number; y1: number }

function yearLine(node: Readonly<ChartNode>): string {
  return node.isFinal ? `${MAP_TEXT.chart.finalTag} · ${node.year}` : String(node.year);
}

// --- The last unit's trail (slice 3c) --------------------------------------------------------------------------------------

// Where each trail mark is drawn, in px: a stop's mark sits TAKEN_MARK_OFFSET_PX back along the leg that reached it (from
// the stop before, or from SOL for the first), so it lies on the dashed trail and off the live node at that world (3c plan
// risk 10); the grey cross sits where the model put it. Older colonies' dots go the same distance the other way, below.
export interface TrailPoint { px: number; py: number; ox: number; oy: number }

function trailPoints(model: Readonly<ChartModel>, at: ChartGeometry['at']): TrailPoint[] {
  const marks = model.trail?.marks ?? [];
  let prev = at(0, 0);
  return marks.map((mark) => {
    const p = at(mark.x, mark.y);
    if (mark.kind === 'lost') return { px: p.px, py: p.py, ox: p.px, oy: p.py };
    const dx = prev.px - p.px;
    const dy = prev.py - p.py;
    const len = Math.hypot(dx, dy) || 1;
    const step = Math.min(TAKEN_MARK_OFFSET_PX, len / 2);
    prev = p;
    return { px: p.px, py: p.py, ox: p.px + (dx / len) * step, oy: p.py + (dy / len) * step };
  });
}

function olderPoint(dot: Readonly<OlderColonyDot>, at: ChartGeometry['at']): { px: number; py: number } {
  const p = at(dot.x, dot.y);
  const d = TAKEN_MARK_OFFSET_PX * Math.SQRT1_2;
  return { px: p.px + d, py: p.py + d };
}

const MARK_HALF_PX = 3;

const LABEL_ORDER: Readonly<Record<ChartNode['state'], number>> = {
  current: 0, urgent: 1, reachable: 1, visited: 2, 'too-late': 3, 'out-of-range': 4, past: 5,
};

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

// SOL's two-line tag sits above and right of its dot (SOL is the chart's lower-left corner: below and left is off the map).
function solLabelBox(sol: { px: number; py: number }): Box {
  return { x0: sol.px - 6, y0: sol.py - 32, x1: sol.px - 6 + MAP_TEXT.chart.solTag.length * LABEL_CHAR_PX, y1: sol.py - 6 };
}

function placeLabels(
  model: Readonly<ChartModel>, at: ChartGeometry['at'], sol: { px: number; py: number }, width: number, height: number,
): Map<number, LabelSpot> {
  const taken: Box[] = [{ x0: sol.px - 5, y0: sol.py - 5, x1: sol.px + 5, y1: sol.py + 5 }, solLabelBox(sol)];
  // Off the chart counts as covered, so a label near an edge turns inward.
  const outside = (box: Box): number => {
    const inside = overlap(box, { x0: 2, y0: 2, x1: width - 2, y1: height - 2 });
    return ((box.x1 - box.x0) * (box.y1 - box.y0) - inside) * 4;
  };
  for (const node of model.nodes) {
    const { px, py } = at(node.x, node.y);
    const h = (node.kind === 'ark' || node.isFinal ? CHART_ARK_PX : CHART_NODE_PX) / 2 + 2;
    taken.push({ x0: px - h, y0: py - h, x1: px + h, y1: py + h });
  }
  // The trail's marks and the older colonies' dots are small, but a label over them hides them (3c plan risk 10).
  const h = MARK_HALF_PX + 2;
  for (const p of trailPoints(model, at)) taken.push({ x0: p.ox - h, y0: p.oy - h, x1: p.ox + h, y1: p.oy + h });
  for (const dot of model.older) {
    const p = olderPoint(dot, at);
    taken.push({ x0: p.px - h, y0: p.py - h, x1: p.px + h, y1: p.py + h });
  }
  const out = new Map<number, LabelSpot>();
  const order = [...model.nodes].sort((a, b) => (a.isFinal ? -1 : LABEL_ORDER[a.state]) - (b.isFinal ? -1 : LABEL_ORDER[b.state]));
  for (const node of order) {
    const { px, py } = at(node.x, node.y);
    const h = (node.kind === 'ark' || node.isFinal ? CHART_ARK_PX : CHART_NODE_PX) / 2;
    const w = Math.max(node.label.length, yearLine(node).length) * LABEL_CHAR_PX;
    const candidates: (LabelSpot & { box: Box })[] = [
      { x: px + h + 5, y: py - 10, anchor: 'start', box: { x0: px + h + 4, y0: py - 11, x1: px + h + 6 + w, y1: py - 11 + LABEL_HEIGHT_PX } },
      { x: px - h - 5, y: py - 10, anchor: 'end', box: { x0: px - h - 6 - w, y0: py - 11, x1: px - h - 4, y1: py - 11 + LABEL_HEIGHT_PX } },
      { x: px, y: py - h - 4 - LABEL_HEIGHT_PX, anchor: 'middle', box: { x0: px - w / 2, y0: py - h - 5 - LABEL_HEIGHT_PX, x1: px + w / 2, y1: py - h - 3 } },
      { x: px, y: py + h + 4, anchor: 'middle', box: { x0: px - w / 2, y0: py + h + 3, x1: px + w / 2, y1: py + h + 5 + LABEL_HEIGHT_PX } },
    ];
    let best = candidates[0]!;
    let bestCover = Infinity;
    for (const spot of candidates) {
      const cover = taken.reduce((sum, box) => sum + overlap(box, spot.box), 0) + outside(spot.box);
      if (cover < bestCover) { best = spot; bestCover = cover; }
      if (cover === 0) break;
    }
    taken.push(best.box);
    out.set(node.slot, { x: best.x, y: best.y, anchor: best.anchor });
  }
  return out;
}

// A node's square (an ark's bigger), its corner notched on a TIGHT ship (a small ship has a small receiver).
function nodeShape(node: Readonly<ChartNode>, px: number, py: number): SVGElement {
  const size = node.kind === 'ark' || node.isFinal ? CHART_ARK_PX : CHART_NODE_PX;
  const h = size / 2;
  if (!node.tight) return el('rect', { x: (px - h).toFixed(1), y: (py - h).toFixed(1), width: size, height: size }, 'cn-box');
  const n = size * 0.42;
  const d = [
    `M${px - h},${py - h}`, `L${px + h - n},${py - h}`, `L${px + h},${py - h + n}`, `L${px + h},${py + h}`, `L${px - h},${py + h}`, 'Z',
  ].join(' ');
  return el('path', { d }, 'cn-box');
}

// Builds (replaces) the chart in `svg`. Returns the geometry, so a view can place its own overlays (the hover tag, the
// selected node's bracket, scrolling a phone chart to the ship being left).
export function drawChart(svg: SVGSVGElement, model: Readonly<ChartModel>, opts: Readonly<ChartDrawOpts>): ChartGeometry {
  const geo = chartGeometry(model, opts);
  const { width, height, at } = geo;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const parts: SVGElement[] = [];
  const id = (name: string): string => `${opts.idPrefix}-${name}`;

  const defs = el('defs', {});
  // Hatched static for the noise clouds: diagonal hatching over a speckle.
  const hatch = el('pattern', { id: id('hatch'), width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' });
  hatch.append(el('line', { x1: 0, y1: 0, x2: 0, y2: 8 }, 'cloud-hatch'));
  hatch.append(el('rect', { x: 3, y: 2, width: 1, height: 1 }, 'cloud-speck'));
  hatch.append(el('rect', { x: 5, y: 5, width: 1, height: 1 }, 'cloud-speck'));
  defs.append(hatch);
  parts.push(defs);

  if (opts.stars) {
    const sky = el('g', {}, 'chart-sky');
    for (const star of SKY) {
      const x = Math.cos(AXIS_RAD) * star.along - Math.sin(AXIS_RAD) * star.across;
      const y = Math.sin(AXIS_RAD) * star.along + Math.cos(AXIS_RAD) * star.across;
      const p = at(x, y);
      if (p.px < 0 || p.py < 0 || p.px > width || p.py > height) continue;
      sky.append(el('rect', { x: p.px.toFixed(1), y: p.py.toFixed(1), width: star.size > 0.85 ? 2 : 1, height: star.size > 0.85 ? 2 : 1 }, star.size > 0.6 ? 'star bright' : 'star'));
    }
    parts.push(sky);
  }

  const sol = at(0, 0);
  const scaleOf = (ly: number): number => Math.hypot(at(ly, 0).px - sol.px, at(ly, 0).py - sol.py);
  if (opts.rings) {
    const rings = el('g', {}, 'chart-rings');
    for (const ring of model.rings) {
      const r = scaleOf(ring.ly);
      rings.append(el('circle', { cx: sol.px.toFixed(1), cy: sol.py.toFixed(1), r: r.toFixed(1) }, ring.next ? 'ring next' : 'ring'));
      if (ring.next && opts.labels === 'all') {
        // On the ring just off the arm's axis, toward the outer lane, so it never sits on a node.
        const a = AXIS_RAD + 0.42;
        const p = at(Math.cos(a) * ring.ly, Math.sin(a) * ring.ly);
        rings.append(text(p.px + 4, p.py - 4, ring.label, 'ring-label'));
      }
    }
    parts.push(rings);
  }

  if (opts.clouds) {
    const clouds = el('g', {}, 'chart-clouds');
    for (const cloud of model.clouds) {
      const c = at(cloud.x, cloud.y);
      clouds.append(el('circle', { cx: c.px.toFixed(1), cy: c.py.toFixed(1), r: scaleOf(cloud.r).toFixed(1), fill: `url(#${id('hatch')})` },
        `cloud strength-${cloud.strength}`));
    }
    parts.push(clouds);
  }

  const bySlot = new Map(model.nodes.map((node) => [node.slot, node]));
  const xy = (slot: number): { px: number; py: number } => {
    const node = bySlot.get(slot);
    if (!node) throw new Error(`drawChart: no node in slot ${slot}`);
    return at(node.x, node.y);
  };

  // The last unit's dashed trail under everything else of the arm (its marks go on top of the nodes, below).
  const trailPts = opts.trail ? trailPoints(model, at) : [];
  if (opts.trail && model.trail !== null && model.trail.marks.length > 0) {
    const pts = trailPts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
    parts.push(el('polyline', { points: pts }, 'trail-last'));
  }

  if (opts.beamFromSol) {
    const first = model.route[0] ?? model.current;
    const p = xy(first);
    const len = Math.hypot(p.px - sol.px, p.py - sol.py);
    const beam = el('line', { x1: sol.px.toFixed(1), y1: sol.py.toFixed(1), x2: p.px.toFixed(1), y2: p.py.toFixed(1) }, 'sol-beam');
    beam.style.setProperty('--beam-len', `${len.toFixed(1)}`);
    parts.push(beam);
  }

  if (opts.beams) {
    const beams = el('g', {}, 'chart-beams');
    for (const line of model.lines) {
      const a = xy(line.from);
      const b = xy(line.to);
      beams.append(el('line', { x1: a.px.toFixed(1), y1: a.py.toFixed(1), x2: b.px.toFixed(1), y2: b.py.toFixed(1), 'data-to': line.to },
        `beam noise-${line.noise}${line.urgent ? ' urgent' : ''}${model.selected === line.to ? ' selected' : ''}`));
    }
    parts.push(beams);
  }

  if (opts.route && model.route.length > 1) {
    const pts = model.route.map(xy);
    parts.push(el('polyline', { points: pts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ') }, 'route-trail'));
  }

  // SOL, tagged ARRIVAL CONTROL.
  const solG = el('g', {}, 'chart-sol');
  solG.append(el('circle', { cx: sol.px.toFixed(1), cy: sol.py.toFixed(1), r: 3.5 }, 'sol-dot'));
  if (opts.labels === 'all' || opts.labels === 'beacon') {
    const box = solLabelBox(sol);
    solG.append(text(box.x0, box.y0 + LABEL_ASCENT_PX, MAP_TEXT.chart.solName, 'sol-name'));
    solG.append(text(box.x0, box.y0 + LABEL_ASCENT_PX + LABEL_LINE_PX + 1, MAP_TEXT.chart.solTag, 'sol-label'));
  }
  parts.push(solG);

  const nodes = el('g', {}, 'chart-nodes');
  const routeSlots = new Set(model.route);
  const placed = opts.labels === 'all' ? placeLabels(model, at, sol, width, height) : new Map<number, LabelSpot>();
  for (const node of model.nodes) {
    const { px, py } = at(node.x, node.y);
    const g = el('g', { 'data-slot': node.slot },
      `cn state-${node.state} kind-${node.kind}${node.tight ? ' tight' : ''}${node.isFinal ? ' final' : ''}${node.onlyFromHere ? ' only' : ''}`
      + `${model.selected === node.slot ? ' selected' : ''}${node.taken !== null ? ' taken' : ''}${node.tag !== null ? ' tagged' : ''}`);
    // A generous hit area: the squares are small, a kid's click is not.
    g.append(el('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 13 }, 'cn-hit'));
    if (node.isFinal) {
      g.append(el('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 9 }, 'cn-beacon'));
      g.append(el('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 9 }, 'cn-beacon late'));
    }
    if (node.state === 'urgent') g.append(el('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 9 }, 'cn-urgent'));
    if (model.selected === node.slot) {
      const s = (node.kind === 'ark' || node.isFinal ? CHART_ARK_PX : CHART_NODE_PX) / 2 + 5;
      const k = 4;
      g.append(el('path', {
        d: [
          `M${px - s},${py - s + k} L${px - s},${py - s} L${px - s + k},${py - s}`, `M${px + s - k},${py - s} L${px + s},${py - s} L${px + s},${py - s + k}`,
          `M${px + s},${py + s - k} L${px + s},${py + s} L${px + s - k},${py + s}`, `M${px - s + k},${py + s} L${px - s},${py + s} L${px - s},${py + s - k}`,
        ].join(' '),
      }, 'cn-bracket'));
    }
    g.append(nodeShape(node, px, py));
    // A ship REPORTED HOME on this run's first desk (slice 3c): a small green diamond at a corner (the desk's legend and
    // the hover say the words; written into every label they crowded layer 2 at 1280 × 720).
    if (node.tag !== null) {
      const c = (node.kind === 'ark' || node.isFinal ? CHART_ARK_PX : CHART_NODE_PX) / 2 + 3;
      const d = 2.6;
      // Top-left: labels start right of the node more often than anywhere else.
      g.append(el('path', { d: `M${px - c},${py - c - d} L${px - c + d},${py - c} L${px - c},${py - c + d} L${px - c - d},${py - c} Z` }, 'cn-new'));
    }
    const showLabel = opts.labels === 'all'
      || (opts.labels === 'beacon' && node.isFinal)
      || (opts.labels === 'route' && routeSlots.has(node.slot));
    if (showLabel) {
      const lx = px + (node.kind === 'ark' || node.isFinal ? CHART_ARK_PX : CHART_NODE_PX) / 2 + 5;
      if (opts.labels === 'beacon') {
        // Centred over the beacon, or ending (starting) at it when the centre would run off the chart's right (left) edge.
        const words = MAP_TEXT.title.beacon(node.name, node.year);
        const half = (words.length * BEACON_CHAR_PX) / 2;
        const margin = CHART_PAD_PX / 2;
        if (px + half > width - margin) g.append(text(px + 10, py - 18, words, 'cn-label beacon-label', 'end'));
        else if (px - half < margin) g.append(text(px - 10, py - 18, words, 'cn-label beacon-label', 'start'));
        else g.append(text(px, py - 18, words, 'cn-label beacon-label', 'middle'));
      } else if (opts.labels === 'route') {
        // The mini route numbers its ships as the tally's rows do.
        const depth = model.route.indexOf(node.slot) + 1;
        if (depth > 0) g.append(text(lx, py + 4, String(depth), 'cn-label'));
      } else {
        const spot = placed.get(node.slot);
        if (spot) {
          g.append(text(spot.x, spot.y + LABEL_ASCENT_PX, node.label, 'cn-label', spot.anchor));
          g.append(text(spot.x, spot.y + LABEL_ASCENT_PX + LABEL_LINE_PX, yearLine(node), 'cn-year', spot.anchor));
        }
      }
    }
    nodes.append(g);
  }
  parts.push(nodes);
  if (opts.trail) parts.push(trailMarks(model, trailPts, at));
  svg.replaceChildren(...parts);
  return geo;
}

// The trail's marks, the beacon and the older colonies (slice 3c), each in a group carrying its words (data-tip; the
// beacon's as data-tip2 on its stop) and data-trail-slot, so the desk's opening beat can turn a TAKEN mark green.
function trailMarks(model: Readonly<ChartModel>, pts: readonly TrailPoint[], at: ChartGeometry['at']): SVGGElement {
  const group = el('g', {}, 'chart-trail');
  const s = MARK_HALF_PX;
  for (const dot of model.older) {
    const p = olderPoint(dot, at);
    const g = el('g', { 'data-tip': dot.label }, 'tm older');
    g.append(el('circle', { cx: p.px.toFixed(1), cy: p.py.toFixed(1), r: 6 }, 'tm-hit'));
    g.append(el('circle', { cx: p.px.toFixed(1), cy: p.py.toFixed(1), r: 2 }, 'colony-old'));
    group.append(g);
  }
  const trail = model.trail;
  if (trail === null) return group;
  trail.marks.forEach((mark, i) => {
    const p = pts[i]!;
    const x = p.ox;
    const y = p.oy;
    const beacon = trail.beacon !== null && mark.kind !== 'lost' && mark.slot === trail.beacon.slot ? trail.beacon : null;
    const attrs: Record<string, string | number> = { 'data-tip': mark.label, 'data-trail-slot': mark.slot };
    if (beacon !== null) attrs['data-tip2'] = beacon.label;
    // A stop the year passed with a colony keeps its TAKEN square underneath (styled away), so the opening beat can show
    // the square first and turn it green on its note (StarChart.green).
    const g = el('g', attrs, `tm kind-${mark.kind}`);
    g.append(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 7 }, 'tm-hit'));
    if (beacon !== null) {
      g.append(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 6.5 }, 'tm-beacon'));
      g.append(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 6.5 }, 'tm-beacon late'));
    }
    if (mark.kind === 'lost') {
      const c = s + 1;
      g.append(el('path', { d: `M${x - c},${y - c} L${x + c},${y + c} M${x + c},${y - c} L${x - c},${y + c}` }, 'tm-cross'));
    } else {
      if (mark.kind === 'taken' || mark.kind === 'colony') {
        g.append(el('rect', { x: (x - s).toFixed(1), y: (y - s).toFixed(1), width: s * 2, height: s * 2 }, 'tm-taken'));
      }
      if (mark.kind === 'colony') g.append(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: s }, 'tm-colony'));
      if (mark.kind === 'no-colony') g.append(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: s - 0.5 }, 'tm-none'));
    }
    group.append(g);
  });
  return group;
}

// The phone turns the arm so it runs from SOL at the bottom to the final ship at the top (02 §4).
export const PORTRAIT_ROTATE_DEG = CHART_PORTRAIT_DEG;
// A desktop leans it a little toward the horizontal (SOL still at the lower left, the band still sweeping up and to the
// right), so a landscape window holds it at a bigger scale.
export const LANDSCAPE_ROTATE_DEG = CHART_LANDSCAPE_DEG;
