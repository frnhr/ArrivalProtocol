import type { Projector, Vec2 } from '@/types/orbit';
import type { BracketModel, PlotLandingModel, LandMark } from '@systems/landing-hud';
import { svgEl, fmt, setCircle } from '@components/hud/plot-draw';

// The landing's layer on the NAV PLOT (01-landing §4), drawn from landing-hud's plotLandingModel:
// • the LZ brackets as thick rim arcs (BRACKET_WIDTH ≥ 4 viewBox units, sitting on the surface) in their look's colour,
//   each labelled `LZ-A 1/3` just outside the rim; no-go arcs red-hatched on the rim (1b fills them);
// • the pod arc from the ship down to the drop dot, dotted bright amber (grey outside the band), and the dot itself
//   glowing on the surface;
// • each falling pod's streak along its fixed arc, a fading trail behind a bright head that turns white-hot below the
//   atmosphere line (a flare at the crossing), and the `◘` mark where each pod landed, in its place's colour;
// • the pods parked in orbit as small blinking beacons on the ship's orbit;
// • the touchdown float (`+200 LANDED · LZ-A`) rising from the bracket, and the ring's pulse (NavPlotWindow).
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
  // Everything off (a new world, or out of LANDING).
  clear(): void;
}

export function createPlotLandingLayer(svg: SVGSVGElement, below: SVGElement, above: SVGElement): PlotLandingLayer {
  const rim = svgEl('g', 'np-landing-rim');
  const arcPath = svgEl('path', 'np-pod-arc');
  const dot = svgEl('circle', 'np-drop-dot');
  const dotHalo = svgEl('circle', 'np-drop-halo');
  const streaks = svgEl('g', 'np-streaks');
  const marks = svgEl('g', 'np-marks');
  const beacons = svgEl('g', 'np-beacons');
  const labels = svgEl('g', 'np-lz-labels');
  const floats = svgEl('g', 'np-floats');
  below.after(rim);
  above.before(arcPath, dotHalo, dot, marks, beacons, streaks);
  svg.append(labels, floats);

  const brackets = new Map<string, BracketNodes>();
  const noGo: SVGPathElement[] = [];
  const streakNodes = new Map<number, StreakNodes>();
  const markNodes = new Map<number, SVGTextElement>();
  const beaconNodes = new Map<number, SVGCircleElement>();
  let geometry = { cx: 0, cy: 0, planetR: 0 };

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
    noGo.forEach((node) => node.remove());
    noGo.length = 0;
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
      if (brackets.size > 0 || streakNodes.size > 0 || markNodes.size > 0 || beaconNodes.size > 0) clear();
      show(dot, false);
      show(dotHalo, false);
      arcPath.setAttribute('d', '');
      return [];
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
    // No-go arcs (1b): red-hatched rim arcs, no label.
    while (noGo.length < model.noGo.length) {
      const node = svgEl('path', 'np-nogo');
      rim.appendChild(node);
      noGo.push(node);
    }
    noGo.forEach((node, i) => {
      const arc = model.noGo[i];
      show(node, arc !== undefined);
      if (!arc) return;
      node.setAttribute('d', rimArc(cx, cy, planetR + BRACKET_GAP + BRACKET_WIDTH / 2, arc.centreRad, arc.halfWidthRad));
      node.setAttribute('stroke-width', fmt(BRACKET_WIDTH));
    });

    // The pod arc and the dot.
    arcPath.setAttribute('d', model.arc ? polyline(model.arc.points, proj) : '');
    arcPath.classList.toggle('out-of-band', model.arc !== null && !model.arc.inBand);
    show(dot, model.dot !== null);
    show(dotHalo, model.dot !== null);
    if (model.dot) {
      const at = polar(cx, cy, planetR, model.dot.rad);
      setCircle(dot, at.x, at.y, DOT_RADIUS);
      setCircle(dotHalo, at.x, at.y, Math.max(DOT_RADIUS * 1.7, model.dot.halfWidthRad * planetR));
      const look = !model.dot.inBand ? 'out-of-band' : model.dot.fits === 'whole' ? 'whole' : model.dot.fits === 'centre' ? 'centre' : 'none';
      dot.setAttribute('class', `np-drop-dot fits-${look}`);
      dotHalo.setAttribute('class', `np-drop-halo fits-${look}`);
    }

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

    // Beacons.
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

  return { paint, float, clear };
}
