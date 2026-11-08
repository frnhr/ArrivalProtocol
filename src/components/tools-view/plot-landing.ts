import type { Projector, Vec2 } from '@/types/orbit';
import type { BracketModel, PlotLandingModel, LandMark } from '@systems/landing-hud';
import { svgEl, fmt, setCircle } from '@components/hud/plot-draw';
import { LANDING_PLOT_TEXT } from '@data/landing-text';

// The landing's layer on the NAV PLOT (01-landing §4), drawn from landing-hud's plotLandingModel:
// • the LZ brackets as thick rim arcs (BRACKET_WIDTH ≥ 4 viewBox units, sitting on the surface) in their look's colour,
//   each labelled `LZ-A 1/3` just outside the rim; no-go arcs red-hatched on the rim (1b fills them);
// • the pod arc from the ship down to the drop dot, dotted bright amber (grey outside the band), and the dot itself
//   glowing on the surface;
// • each falling pod's streak along its fixed arc, a fading trail behind a bright head that turns white-hot below the
//   atmosphere line (a flare at the crossing), and the `◘` mark where each pod landed, in its place's colour;
// • the pods parked in orbit as small blinking beacons on the ship's orbit;
// • the touchdown float (`+200 LANDED · LZ-A`) rising from the bracket, and the ring's pulse (NavPlotWindow);
// • slice 1b: the faint dashed DRAG circle (§3.7) with its name, the no-go arcs hatched red through an SVG <pattern> with
//   their end ticks, the grey DROP UNCERTAIN dot and arc with `≈±195 km` inside the planet under it (§3.8), and the drag
//   stamp `DRAG · ▲ −110 km` where a kick happened, fading (NavPlotWindow calls stamp() on 'drag-kick').
//   GO LOWER's ◇ and target tick are the plot's markers (NavPlotWindow), so its label collision pass places them.
// Nodes are kept per LZ and per pod and patched in place. Returns the label boxes, so the plot's other labels keep off
// the brackets' names.

const BRACKET_WIDTH = 4.6;     // viewBox units: §4 "at least 4"
const BRACKET_GAP = 0.4;       // between the surface line and the bracket's inner edge
const TICK_IN = 1.2;           // the bracket's end ticks reach this far inside the surface line...
const TICK_OUT = 2.4;          // ...and this far past the rim arc
const LABEL_OUT = 10;          // the bracket label's distance outside the rim
const LABEL_SIDE_COS = 0.35;
const LABEL_LINE_H = 8.5;
const LABEL_CHAR_W = 4.6;
const DOT_RADIUS = 2.2;
const HEAD_RADIUS = 2.2;
const HOT_HEAD_RADIUS = 2.8;
const MARK_LIFT = 0.2;         // the ◘ glyph's centre above the surface line
const BEACON_RADIUS = 1.6;
const TRAIL_SEGMENTS = 8;      // the trail fades over this many pieces
const NOGO_HATCH_ID = 'npNoGoHatch';
const NOGO_HATCH_PERIOD = 2.2; // viewBox units between the red stripes: about two stripes across a 4.6-unit rim arc
const NOGO_HATCH_STRIPE = 0.9;
const DOT_LABEL_IN = 6;        // the grey dot's `≈±195 km` starts this far inside the surface, under the dot
const DRAG_LABEL_DEG = 212;    // the DRAG circle's name, lower left: clear of the ring's name (top) and the chip (top left)
const DRAG_LABEL_GAP = 2.5;    // inside the circle by this much
const STAMP_OUT = 7;           // the drag stamp's distance outside the kick's ▼

export interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface BracketNodes {
  arc: SVGPathElement;
  ticks: SVGPathElement;
  label: SVGTextElement;
}

interface StreakNodes {
  trail: SVGPathElement[];
  head: SVGCircleElement;
  hot: boolean;
}

function polar(cx: number, cy: number, radius: number, rad: number): Vec2 {
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
}

// A rim arc from rad − half to rad + half (world angles are CCW, which is sweep 0 in the flipped SVG frame).
export function rimArc(cx: number, cy: number, radius: number, centre: number, half: number): string {
  const from = polar(cx, cy, radius, centre - half);
  const to = polar(cx, cy, radius, centre + half);
  const large = 2 * half > Math.PI ? 1 : 0;
  return `M${fmt(from.x)},${fmt(from.y)}A${fmt(radius)},${fmt(radius)} 0 ${large},0 ${fmt(to.x)},${fmt(to.y)}`;
}

function polyline(points: readonly Vec2[], proj: Projector): string {
  return points.map((point, i) => {
    const spot = proj.project(point);
    return `${i === 0 ? 'M' : 'L'}${fmt(spot.x)},${fmt(spot.y)}`;
  }).join('');
}

const MARK_TONE: Readonly<Record<LandMark['place'], string>> = { lz: 'good', mislanded: 'mislanded', 'off-site': 'off', 'no-go': 'nogo' };

export interface PlotLandingLayer {
  paint(model: PlotLandingModel | null, proj: Projector, cx: number, cy: number, planetR: number): LabelBox[];
  // `+200 LANDED · LZ-A` rising from a bracket (or the landing point), in the tone of how the pod came down.
  float(text: string, rad: number, tone: string, ms: number): void;
  // The drag stamp (`DRAG · ▲ −110 km`) at a kick's ▼ (world km), for `ms`; `garble` re-renders its text each paint
  // (Telemetry below 60 scrambles its number, C3).
  stamp(text: string, pos: Vec2, ms: number, garble: (text: string) => string): void;
  // Everything off (a new world, or out of LANDING).
  clear(): void;
}

// The no-go hatch (§3.6 "drawn red-hatched"): diagonal red stripes, user-space so every arc's stripes line up.
function addNoGoHatch(svg: SVGSVGElement): void {
  const defs = svg.querySelector('defs');
  if (!defs) throw new Error('plot-landing: #navplotSvg <defs> missing');
  if (defs.querySelector(`#${NOGO_HATCH_ID}`)) return;
  const pattern = svgEl('pattern', '');
  pattern.id = NOGO_HATCH_ID;
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', fmt(NOGO_HATCH_PERIOD));
  pattern.setAttribute('height', fmt(NOGO_HATCH_PERIOD));
  pattern.setAttribute('patternTransform', 'rotate(45)');
  const stripe = svgEl('rect', 'np-nogo-stripe');
  stripe.setAttribute('width', fmt(NOGO_HATCH_STRIPE));
  stripe.setAttribute('height', fmt(NOGO_HATCH_PERIOD));
  pattern.appendChild(stripe);
  defs.appendChild(pattern);
}

interface StampNode {
  node: SVGTextElement;
  text: string;
  pos: Vec2;
  garble: (text: string) => string;
}

export function createPlotLandingLayer(svg: SVGSVGElement, below: SVGElement, above: SVGElement): PlotLandingLayer {
  addNoGoHatch(svg);
  const dragLine = svgEl('circle', 'np-drag-line');
  const dragLabel = svgEl('text', 'np-drag-label');
  dragLabel.textContent = LANDING_PLOT_TEXT.dragLine;
  dragLabel.setAttribute('text-anchor', 'middle');
  const rim = svgEl('g', 'np-landing-rim');
  const arcPath = svgEl('path', 'np-pod-arc');
  const dot = svgEl('circle', 'np-drop-dot');
  const dotHalo = svgEl('circle', 'np-drop-halo');
  const dotLabel = svgEl('text', 'np-dot-label');
  dotLabel.setAttribute('text-anchor', 'middle');
  dotLabel.setAttribute('dominant-baseline', 'central');
  const stampLayer = svgEl('g', 'np-stamps');
  const streaks = svgEl('g', 'np-streaks');
  const marks = svgEl('g', 'np-marks');
  const beacons = svgEl('g', 'np-beacons');
  const labels = svgEl('g', 'np-lz-labels');
  const floats = svgEl('g', 'np-floats');
  below.after(dragLine, dragLabel, rim);
  above.before(arcPath, dotHalo, dot, dotLabel, marks, beacons, streaks);
  svg.append(labels, floats, stampLayer);
  const stamps = new Set<StampNode>();

  const brackets = new Map<string, BracketNodes>();
  const noGo: { arc: SVGPathElement; ends: SVGPathElement }[] = [];
  const streakNodes = new Map<number, StreakNodes>();
  const markNodes = new Map<number, SVGTextElement>();
  const beaconNodes = new Map<number, SVGCircleElement>();
  let geometry = { cx: 0, cy: 0, planetR: 0 };
  let lastProj: Projector | null = null;

  const show = (node: SVGElement, visible: boolean): void => { node.style.display = visible ? '' : 'none'; };

  function bracketNodes(lz: string): BracketNodes {
    let found = brackets.get(lz);
    if (!found) {
      found = { arc: svgEl('path', 'np-lz'), ticks: svgEl('path', 'np-lz-ticks'), label: svgEl('text', 'np-label np-lz-label') };
      rim.append(found.arc, found.ticks);
      labels.appendChild(found.label);
      brackets.set(lz, found);
    }
    return found;
  }

  function paintBracket(model: BracketModel, cx: number, cy: number, planetR: number): LabelBox {
    const nodes = bracketNodes(model.lz);
    const radius = planetR + BRACKET_GAP + BRACKET_WIDTH / 2;
    nodes.arc.setAttribute('d', rimArc(cx, cy, radius, model.centreRad, model.halfWidthRad));
    nodes.arc.setAttribute('stroke-width', fmt(BRACKET_WIDTH));
    const cls = `np-lz look-${model.look}${model.outOfBand ? ' out-of-band' : ''}`;
    if (nodes.arc.getAttribute('class') !== cls) nodes.arc.setAttribute('class', cls);
    // The bracket's ends: thin radial ticks standing out past the rim arc, so even a 10-unit bracket reads `[ ]`.
    let ticks = '';
    for (const end of [model.centreRad - model.halfWidthRad, model.centreRad + model.halfWidthRad]) {
      const from = polar(cx, cy, planetR - TICK_IN, end);
      const to = polar(cx, cy, planetR + BRACKET_GAP + BRACKET_WIDTH + TICK_OUT, end);
      ticks += `M${fmt(from.x)},${fmt(from.y)}L${fmt(to.x)},${fmt(to.y)}`;
    }
    nodes.ticks.setAttribute('d', ticks);
    const tickCls = `np-lz-ticks look-${model.look}`;
    if (nodes.ticks.getAttribute('class') !== tickCls) nodes.ticks.setAttribute('class', tickCls);
    const at = polar(cx, cy, planetR + BRACKET_WIDTH + LABEL_OUT, model.centreRad);
    const cos = Math.cos(model.centreRad);
    const sin = Math.sin(model.centreRad);
    const anchor = cos > LABEL_SIDE_COS ? 'start' : cos < -LABEL_SIDE_COS ? 'end' : 'middle';
    // Above the planet the label sits on its baseline, below it hangs under the point.
    const baseline = sin > LABEL_SIDE_COS ? at.y : sin < -LABEL_SIDE_COS ? at.y + LABEL_LINE_H * 0.7 : at.y + LABEL_LINE_H * 0.35;
    nodes.label.setAttribute('x', fmt(at.x));
    nodes.label.setAttribute('y', fmt(baseline));
    nodes.label.setAttribute('text-anchor', anchor);
    if (nodes.label.textContent !== model.label) nodes.label.textContent = model.label;
    const labelCls = `np-label np-lz-label look-${model.look}`;
    if (nodes.label.getAttribute('class') !== labelCls) nodes.label.setAttribute('class', labelCls);
    const width = model.label.length * LABEL_CHAR_W;
    const left = anchor === 'start' ? at.x : anchor === 'end' ? at.x - width : at.x - width / 2;
    return { left, top: baseline - LABEL_LINE_H + 1.5, right: left + width, bottom: baseline + 1.5 };
  }

  function streakFor(pod: number): StreakNodes {
    let found = streakNodes.get(pod);
    if (!found) {
      found = {
        trail: Array.from({ length: TRAIL_SEGMENTS }, () => svgEl('path', 'np-streak-trail')),
        head: svgEl('circle', 'np-streak-head'),
        hot: false,
      };
      streaks.append(...found.trail, found.head);
      streakNodes.set(pod, found);
    }
    return found;
  }

  function flare(at: Vec2): void {
    const ring = svgEl('circle', 'np-entry-flare');
    setCircle(ring, at.x, at.y, HOT_HEAD_RADIUS * 2);
    streaks.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
  }

  function prune<T>(map: Map<number, T>, keep: ReadonlySet<number>, drop: (node: T) => void): void {
    for (const [pod, node] of map) {
      if (keep.has(pod)) continue;
      drop(node);
      map.delete(pod);
    }
  }

  function clear(): void {
    for (const nodes of brackets.values()) { nodes.arc.remove(); nodes.ticks.remove(); nodes.label.remove(); }
    brackets.clear();
    noGo.forEach((nodes) => { nodes.arc.remove(); nodes.ends.remove(); });
    noGo.length = 0;
    show(dragLine, false);
    show(dragLabel, false);
    show(dotLabel, false);
    for (const stampNode of stamps) stampNode.node.remove();
    stamps.clear();
    prune(streakNodes, new Set(), (nodes) => { nodes.trail.forEach((piece) => piece.remove()); nodes.head.remove(); });
    prune(markNodes, new Set(), (node) => node.remove());
    prune(beaconNodes, new Set(), (node) => node.remove());
    arcPath.setAttribute('d', '');
    show(dot, false);
    show(dotHalo, false);
    floats.replaceChildren();
  }

  function paint(model: PlotLandingModel | null, proj: Projector, cx: number, cy: number, planetR: number): LabelBox[] {
    geometry = { cx, cy, planetR };
    if (model === null) {
      if (brackets.size > 0 || streakNodes.size > 0 || markNodes.size > 0 || beaconNodes.size > 0 || stamps.size > 0) clear();
      show(dot, false);
      show(dotHalo, false);
      show(dotLabel, false);
      show(dragLine, false);
      show(dragLabel, false);
      arcPath.setAttribute('d', '');
      return [];
    }
    // The DRAG line (§3.7): a faint dashed circle at its radius, named at the lower left.
    show(dragLine, model.dragLineKm !== null);
    show(dragLabel, model.dragLineKm !== null);
    if (model.dragLineKm !== null) {
      const radius = model.dragLineKm * proj.scale;
      setCircle(dragLine, cx, cy, radius);
      const at = polar(cx, cy, radius - DRAG_LABEL_GAP, (DRAG_LABEL_DEG * Math.PI) / 180);
      dragLabel.setAttribute('x', fmt(at.x));
      dragLabel.setAttribute('y', fmt(at.y));
      const tilt = 90 - DRAG_LABEL_DEG;
      dragLabel.setAttribute('transform', `rotate(${fmt(tilt)} ${fmt(at.x)} ${fmt(at.y)})`);
    }
    // Brackets and their labels.
    const boxes: LabelBox[] = [];
    const live = new Set(model.brackets.map((bracket) => bracket.lz));
    for (const [lz, nodes] of brackets) {
      if (live.has(lz)) continue;
      nodes.arc.remove();
      nodes.ticks.remove();
      nodes.label.remove();
      brackets.delete(lz);
    }
    for (const bracket of model.brackets) boxes.push(paintBracket(bracket, cx, cy, planetR));
    // No-go arcs (1b): red-hatched rim arcs (the pattern's stripes in the arc's stroke) with red end ticks, no label (the
    // GROUND TRACK names them, and the POD BAY's NO-GO line).
    while (noGo.length < model.noGo.length) {
      const nodes = { arc: svgEl('path', 'np-nogo'), ends: svgEl('path', 'np-nogo-ends') };
      nodes.arc.setAttribute('stroke', `url(#${NOGO_HATCH_ID})`);
      rim.append(nodes.arc, nodes.ends);
      noGo.push(nodes);
    }
    noGo.forEach((nodes, i) => {
      const arc = model.noGo[i];
      show(nodes.arc, arc !== undefined);
      show(nodes.ends, arc !== undefined);
      if (!arc) return;
      nodes.arc.setAttribute('d', rimArc(cx, cy, planetR + BRACKET_GAP + BRACKET_WIDTH / 2, arc.centreRad, arc.halfWidthRad));
      nodes.arc.setAttribute('stroke-width', fmt(BRACKET_WIDTH));
      let ends = '';
      for (const end of [arc.centreRad - arc.halfWidthRad, arc.centreRad + arc.halfWidthRad]) {
        const from = polar(cx, cy, planetR - TICK_IN * 0.5, end);
        const to = polar(cx, cy, planetR + BRACKET_GAP + BRACKET_WIDTH + TICK_IN, end);
        ends += `M${fmt(from.x)},${fmt(from.y)}L${fmt(to.x)},${fmt(to.y)}`;
      }
      nodes.ends.setAttribute('d', ends);
    });

    // The pod arc and the dot.
    arcPath.setAttribute('d', model.arc ? polyline(model.arc.points, proj) : '');
    arcPath.classList.toggle('out-of-band', model.arc !== null && !model.arc.inBand);
    arcPath.classList.toggle('uncertain', model.arc !== null && model.arc.uncertain);
    show(dot, model.dot !== null);
    show(dotHalo, model.dot !== null);
    show(dotLabel, model.dot !== null && model.dotLabel !== null);
    if (model.dot) {
      const at = polar(cx, cy, planetR, model.dot.rad);
      setCircle(dot, at.x, at.y, DOT_RADIUS);
      setCircle(dotHalo, at.x, at.y, Math.max(DOT_RADIUS * 1.7, model.dot.halfWidthRad * planetR));
      // The grey dot (§3.8) whatever it fits: an uncertain drop can't promise the bracket.
      const look = !model.dot.inBand ? 'out-of-band' : model.dot.uncertain ? 'uncertain'
        : model.dot.fits === 'whole' ? 'whole' : model.dot.fits === 'centre' ? 'centre' : 'none';
      const dotCls = `np-drop-dot fits-${look}`;
      if (dot.getAttribute('class') !== dotCls) dot.setAttribute('class', dotCls);
      const haloCls = `np-drop-halo fits-${look}`;
      if (dotHalo.getAttribute('class') !== haloCls) dotHalo.setAttribute('class', haloCls);
      if (model.dotLabel !== null) {
        // Inside the planet, reading inward from the dot (clear of the bracket's label outside the rim and its ticks).
        const under = polar(cx, cy, planetR - DOT_LABEL_IN, model.dot.rad);
        const cos = Math.cos(model.dot.rad);
        dotLabel.setAttribute('text-anchor', cos > LABEL_SIDE_COS ? 'end' : cos < -LABEL_SIDE_COS ? 'start' : 'middle');
        dotLabel.setAttribute('x', fmt(under.x));
        dotLabel.setAttribute('y', fmt(under.y + Math.sin(model.dot.rad) * DOT_LABEL_IN * 0.4));
        if (dotLabel.textContent !== model.dotLabel) dotLabel.textContent = model.dotLabel;
      }
    }
    // The drag stamps: re-projected each paint (the plot zooms), their words re-garbled.
    lastProj = proj;
    for (const stampNode of stamps) placeStamp(stampNode, proj, cx, cy);

    // Streaks.
    const falling = new Set(model.streaks.map((streak) => streak.pod));
    prune(streakNodes, falling, (nodes) => { nodes.trail.forEach((piece) => piece.remove()); nodes.head.remove(); });
    for (const streak of model.streaks) {
      const nodes = streakFor(streak.pod);
      const spots = streak.trail.map((point) => proj.project(point));
      // The trail in TRAIL_SEGMENTS pieces, the oldest faintest.
      nodes.trail.forEach((piece, i) => {
        const from = Math.floor((i * (spots.length - 1)) / TRAIL_SEGMENTS);
        const to = Math.floor(((i + 1) * (spots.length - 1)) / TRAIL_SEGMENTS);
        const pieceSpots = spots.slice(from, Math.max(from + 2, to + 1));
        piece.setAttribute('d', pieceSpots.length >= 2 ? pieceSpots.map((spot, j) => `${j === 0 ? 'M' : 'L'}${fmt(spot.x)},${fmt(spot.y)}`).join('') : '');
        piece.style.opacity = fmt(((i + 1) / TRAIL_SEGMENTS) * 0.9);
        piece.classList.toggle('hot', streak.hot);
        piece.classList.toggle('first', streak.first);
      });
      const head = proj.project(streak.head);
      setCircle(nodes.head, head.x, head.y, streak.hot ? HOT_HEAD_RADIUS : HEAD_RADIUS);
      nodes.head.classList.toggle('hot', streak.hot);
      nodes.head.classList.toggle('first', streak.first);
      if (streak.hot && !nodes.hot) flare(head);
      nodes.hot = streak.hot;
    }

    // Landing marks.
    const down = new Set(model.marks.map((mark) => mark.pod));
    prune(markNodes, down, (node) => node.remove());
    for (const mark of model.marks) {
      let node = markNodes.get(mark.pod);
      if (!node) {
        node = svgEl('text', 'np-mark');
        node.textContent = '◘';
        node.setAttribute('text-anchor', 'middle');
        node.setAttribute('dominant-baseline', 'central');
        marks.appendChild(node);
        markNodes.set(mark.pod, node);
      }
      const at = polar(cx, cy, planetR + MARK_LIFT, mark.rad);
      node.setAttribute('x', fmt(at.x));
      node.setAttribute('y', fmt(at.y));
      const cls = `np-mark tone-${MARK_TONE[mark.place]}${mark.touch === 'hard' ? ' hard' : ''}`;
      if (node.getAttribute('class') !== cls) node.setAttribute('class', cls);
    }

    // Beacons. (Slice 7b, Track VIEW's marked edit: a beacon with `restored` is THE LAST LANDING's, steady amber, R29.)
    const parked = new Set(model.beacons.map((beacon) => beacon.pod));
    prune(beaconNodes, parked, (node) => node.remove());
    model.beacons.forEach((beacon, i) => {
      let node = beaconNodes.get(beacon.pod);
      if (!node) {
        node = svgEl('circle', 'np-beacon');
        node.style.animationDelay = `${(i * 0.23).toFixed(2)}s`;
        beacons.appendChild(node);
        beaconNodes.set(beacon.pod, node);
      }
      const at = proj.project(beacon.pos);
      setCircle(node, at.x, at.y, BEACON_RADIUS);
      // (7b VIEW) The class switches in place, so a parked pod MERGE gave back turns amber where it rides (landing.css).
      node.classList.toggle('restored', beacon.restored);
    });
    return boxes;
  }

  function float(text: string, rad: number, tone: string, ms: number): void {
    const { cx, cy, planetR } = geometry;
    if (planetR <= 0) return;
    const at = polar(cx, cy, planetR + BRACKET_WIDTH + LABEL_OUT + LABEL_LINE_H, rad);
    const node = svgEl('text', `np-float tone-${tone}`);
    node.textContent = text;
    node.setAttribute('x', fmt(at.x));
    node.setAttribute('y', fmt(at.y));
    node.setAttribute('text-anchor', 'middle');
    node.style.animationDuration = `${ms}ms`;
    floats.appendChild(node);
    setTimeout(() => node.remove(), ms);
  }

  // Just outside the kick's ▼, away from the planet, reading outward.
  function placeStamp(entry: StampNode, proj: Projector, cx: number, cy: number): void {
    const spot = proj.project(entry.pos);
    const out = Math.hypot(spot.x - cx, spot.y - cy) || 1;
    entry.node.setAttribute('x', fmt(spot.x + ((spot.x - cx) / out) * STAMP_OUT));
    entry.node.setAttribute('y', fmt(spot.y + ((spot.y - cy) / out) * STAMP_OUT));
    entry.node.setAttribute('text-anchor', spot.x >= cx ? 'start' : 'end');
    const text = entry.garble(entry.text);
    if (entry.node.textContent !== text) entry.node.textContent = text;
  }

  function stamp(text: string, pos: Vec2, ms: number, garble: (text: string) => string): void {
    const node = svgEl('text', 'np-drag-stamp');
    node.setAttribute('dominant-baseline', 'central');
    node.style.animationDuration = `${ms}ms`;
    const entry: StampNode = { node, text, pos: { ...pos }, garble };
    stamps.add(entry);
    stampLayer.appendChild(node);
    // Placed at once: a kick can land while the world is paused (no paint until it runs again).
    if (lastProj !== null) placeStamp(entry, lastProj, geometry.cx, geometry.cy);
    setTimeout(() => { node.remove(); stamps.delete(entry); }, ms);
  }

  return { paint, float, stamp, clear };
}
