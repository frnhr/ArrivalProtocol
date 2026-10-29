import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { getSensedPrediction, type Prediction } from '@systems/predict';
import { isThrustOn, isGhostFiring } from '@systems/orbit-sim';
import { capabilitiesNow } from '@systems/capabilities';
import {
  plotViewRadius, plotChip, plotReadouts, plotMarkers, plotZones, noSignalReason, type Label, type PlotMarker, type Tone,
  type PlotZoneModel,
} from '@systems/flight-hud';
import { makeProjector, type Projector, type Vec2 } from '@/types/orbit';
import type { Zone } from '@/types/zone';
import { requireById } from '@components/dom';
import { isMobileViewport } from '@/utils/viewport';
import { renderKeyCaps } from '@components/hud/keycaps';
import { createScrambler } from '@components/hud/scrambler';
import {
  SVG_NS, svgEl, fmt, setCircle, annulus, circlePath, pathsByColour, hazardPath, bandWidth,
} from '@components/hud/plot-draw';
import { PLOT_FUZZ_MIN_UNITS, PLOT_UNCERTAIN_MIN_UNITS, PLOT_PLANET_MIN_UNITS, TOUCHDOWN_FLOAT_MS } from '@data/tuning';
import { BAND_TEXT, TOUCHDOWN_FLOAT_TEXT } from '@data/landing-text';
import { on } from '@systems/events';
import { getDropSolution } from '@systems/drop-cache';
import { plotLandingModel, ringLabel } from '@systems/landing-hud';
import { replayAnimation } from '@components/dom';
import { createPlotLandingLayer } from './plot-landing';

// NAV PLOT, the hero window (§7.1). Everything on it comes from the predicted path
// (systems/predict) and the HUD model (systems/flight-hud):
// • the planet, its dashed atmosphere and the fat SAFE ORBIT ring;
// • the path as red (ends on the surface), dashed bright (FLYBY, or a loop's arcs outside the
//   ring) and green (a loop's arcs inside the ring) subpaths;
// • ✕ IMPACT, ▼ LOWEST (a ghost underground on a crash course), ▲ HIGHEST and START BURN;
// • the ship (a notched arrow, so it never reads as a ▼/▲ marker) along its heading, with a
//   fading trail of where it just was and a flame while thrust is delivered;
// • the line-state chip and the readout row;
// • hazard zones (WP9, §6.8): a debris cloud as a hatched circle flecked with fragments, a belt as a hatched
//   annulus, each in the colour of what the instruments say it will do (red: the path runs into it, green: it
//   misses, grey: PATH UNCERTAIN can't tell, dim red: it already hit), with its label beside it
//   (`DEBRIS · HITS RACK C` / `IN 03:30`, `DEBRIS · CLEAR`, `DEBRIS · RACK C · HIT?`, `HIT · RACK C`); and the
//   path's run through a zone that can still hurt, hatched red over the line's own colour.
// What the instruments can show (C3, capabilities.ts) changes all of it: a degraded Sensor Interp
// puts a soft fuzz band along the line and ≈ on the altitudes; a failing one turns the line into
// one grey band with no colours or altitudes (PATH UNCERTAIN, repainted only as often as the stale
// sensor refreshes); a dead or missing Nav Plotter shows a NO SIGNAL veil. A damaged Telemetry
// file scrambles the readout row's digits.
// Nodes are built once and patched in place at the game tick. Colours are CSS tokens (the
// classes live in game.css), so the plot reskins with the mode like everything else.

const VIEWBOX = 320;     // the svg's viewBox is set to "0 0 320 320" at mount
const MARGIN = 14;       // viewBox units kept clear around the plot radius

// Label layout, in viewBox units (font sizes live in game.css and must match roughly). LINE_H, CHAR_W and
// BASELINE_LIFT are for the desktop's font size; a phone scales them with its labels (labelScale below).
const LABEL_GAP = 9;     // marker → label distance
const LINE_H = 8.5;
const CHAR_W = 4.6;      // ≈ JetBrains Mono advance at the label font size
const EDGE = 3;
const BASELINE_LIFT = 1.5;  // descender room under each line
// WP12 review, the phone's labels: the plot is a square of about 290 px for its 320 units at 390×844, and game.css's
// label sizes (these, in viewBox units) drew IMPACT, ▼, START BURN and a debris cloud's `RACK C · HIT?` at 6.8 px and
// the ring's name at 5.7 px. On a phone each is scaled (game.css --np-label-scale / --np-ring-scale) so it renders at
// PHONE_LABEL_MIN_PX at least; the collision pass lays the labels out at that size too.
const LABEL_FONT_UNITS = 7.4;
const RING_FONT_UNITS = 6.2;
const PHONE_LABEL_MIN_PX = 10;
// A label leans to one side (start/end anchor, or above/below) once its push direction is this
// far off the axis; closer to the axis it is centred on the marker.
const LABEL_SIDE_COS = 0.35;
// WP11 part 2: an impact path's ✕ and the ghost ▼ under the ground sit close together on a steep plunge (LAST LIGHT's
// opener), and both labels pointed outward ran into each other (`UNDERGROUNDIMPACT 03:04`). Closer than this, the ▼
// label turns sideways, to the side away from the ✕.
const LABEL_CLASH_UNITS = 40;
// WP12 p3, the labels' collision pass (placeClear; the lead's WP12 notes: ▲'s label on the ring's name, ▼'s next to
// the ship, START BURN's on ▼'s, HALCYON's far zoom on the ring and the planet, ▲ and the ship under the chip). A label
// tries its own side first, then that side turned by these angles (degrees), and takes the first that hits nothing;
// with none clear, the one that hits least. The side it took is kept while it stays clear, and while no other side hits
// clearly less (LABEL_HOP_MIN_AREA) or it moved less than LABEL_HOLD_MS ago, so labels never hop; but never over another
// label's text, which it leaves at once (final review, placeClear).
const LABEL_TRY_TURNS_DEG = [0, 45, -45, 90, -90, 135, -135, 180];
// Room kept around a glyph, the ship and the chip (viewBox units).
const OBSTACLE_PAD = 2;
// Room kept between two labels: flush against each other, START BURN over `▼ 08:23 / LOWEST …` read as one block.
const LABEL_SPACING = 3;
// WP12 fix round 2: a label that hits something moves only to a side that hits less by at least this area (viewBox
// units², a sliver one line tall and LABEL_SPACING wide: less is a touch, not a collision; times the label scale
// squared on a phone). With "the least wins" ▼'s label on ship 1's approx band jumped across ▼ (over the planet, onto
// START BURN) and back every second or two, START BURN's with it: its outward side and its inward one touched the
// band by under 1 unit² in turn.
const LABEL_HOP_MIN_AREA = LINE_H * LABEL_SPACING;
// A label that moved holds its new side at least this long (wall ms) before it moves again (the lead's round-2 note: a
// label that stays put matters more than one that never touches anything).
const LABEL_HOLD_MS = 1000;
// The ring's name as obstacles: boxes this far apart along its arc, reaching this far from it.
const RING_NAME_STEP = 9;
const RING_NAME_HALF = 4.5;
// Zoomed far out the ring is small, and a label beside a marker lands on it (HALCYON's opening, r0 30,000 km): with the
// ring's outer edge under this many viewBox units the ring and the planet are an obstacle too. Closer in a label reads
// on the ring band (its dark outline), and avoiding the whole ring would push labels off the plot.
const SMALL_RING_UNITS = 60;
// The small ring's cost is the label's area over it, estimated on a grid this fine (viewBox units). WP12 review: it was
// one flat cost, so with ▼ itself on the ring every side cost the same and ▼'s label lay across the band and the path
// (HALCYON at 1440×900); by area, the side that covers least of it wins.
const RING_COST_STEP = 2;
// The drawn path (or a blind plot's grey band) as an obstacle for the labels (WP12 review: the dashed FLYBY path ran
// through `LOWEST ≈1,980 km` and the FLYBY tag; on a phone's bigger labels it crossed IMPACT's and a debris cloud's),
// reaching this far from its line (or half the band). Its cost is the band's area over a label (pathArea), not boxes
// sampled along it: WP12 fix round 2, those boxes started at the ship and slid with it every frame.
const PATH_OBSTACLE_HALF = 1.5;
// Letter advance of the labels with a wider letter-spacing (game.css): START BURN and the FLYBY tag.
const CHAR_W_BURN = 5;
const CHAR_W_TAG = 5.9;
// The ring's name runs over the top of the ring, between these angles (degrees, world frame).
const RING_LABEL_FROM_DEG = 160;
const RING_LABEL_TO_DEG = 20;
// The ring's name: `SAFE ORBIT · LAUNCH BAND` in flight, `LAUNCH BAND` while landing (landing-hud ringLabel).
const RING_LABEL_TEXT = BAND_TEXT.ringFlight;
// One character of the ring's name along its arc (game.css .np-ring-label: 6.2 px JetBrains Mono, 0.6 em
// advance, plus 0.22 em letter-spacing). Zoomed far out (HALCYON's start, r0 30,000 km) the arc is shorter
// than the name, which the textPath then cut to `RBIT · PRINTER` under the START BURN label: the name is
// drawn only once the arc holds it whole.
const RING_LABEL_CHAR_ALONG = 6.2 * (0.6 + 0.22);

// Hazard zones (WP9). The hatching's stripe spacing and width, the band hatched along the path's run through a
// zone, and the fragments flecking a debris cloud: a fixed sunflower spiral (no randomness: the same cloud
// looks the same every frame), drawn only once the cloud is big enough on screen to hold them.
const HATCH_PERIOD = 3.2;
const HATCH_STRIPE = 1.1;
const HAZARD_BAND = 6;
// The band through a small cloud (WP9 review round 1): at the arrival zoom the 900 km cloud is about 18 px, and a 6-unit
// band of the same red hatching over it was one texture with the cloud. There the band is a share of the cloud's
// on-screen radius (never under the floor), so the cloud's own hatching shows on both sides of it, and a dark casing
// this much wider runs under it: the path's run through the cloud reads as a line of its own across it.
const HAZARD_BAND_CLOUD_SHARE = 0.55;
const HAZARD_BAND_MIN = 2.2;
const HAZARD_CASING_EXTRA = 1.6;
const SPECKS = 11;
const SPECK_SIZE = 1.1;
const SPECK_SPREAD = 0.82;      // the share of the radius the fragments fill
const SPECK_MIN_RADIUS = 4;     // viewBox units
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// A debris label sits beside its cloud, square to the drawn path where it passes nearest, on the side away from
// the planet (debrisLabelSide): the arrival path runs through the cloud, and ▼, START BURN and the ring are all
// on the planet's side of it. A belt's sits on its middle radius at this angle (degrees, world frame: lower left,
// clear of the ring's name at the top).
const BELT_LABEL_DEG = 225;
const DEBRIS_LABEL_VERTICAL_COS = 0.8;
const ZONE_HATCH_IDS = { hit: 'npHatchHit', unknown: 'npHatchUnknown', spent: 'npHatchSpent' } as const;

// Glyph sizes, viewBox units.
const MARK_SIZE = 5;
const TICK_HALF = 7;
const SHIP_TIP = 9;
const SHIP_BACK = 4.5;
const SHIP_HALF = 5.5;
const SHIP_NOTCH = 3.5;  // how far the tail notch cuts in from the back corners
const FLAME_LEN = 9;

// The trail: this many past positions, one kept each time the ship has moved this fraction of
// the plot radius, so it is at most a fifth of the radius long: enough to show which way the
// ship is heading, short enough to stay clear of the path. Spacing by distance (not time)
// keeps its shape the same at every pace.
const TRAIL_POINTS = 20;
const TRAIL_SPACING_FRAC = 0.01;
const TRAIL_MAX_OPACITY = 0.6;

interface MarkerNodes {
  glyph: SVGPathElement | SVGPolygonElement | SVGLineElement;
  label: SVGTextElement;
}

interface ZoneNodes {
  glyph: SVGPathElement;
  specks: SVGPathElement;
  label: SVGTextElement;
}

interface PlotNodes {
  ringText: SVGTextPathElement;
  zones: SVGGElement;
  zoneLabels: SVGGElement;
  hazard: SVGPathElement;
  hazardCasing: SVGPathElement;
  planet: SVGCircleElement;
  surface: SVGCircleElement;
  atm: SVGCircleElement;
  ring: SVGPathElement;
  ringArc: SVGPathElement;
  ringLabel: SVGTextElement;
  band: SVGPathElement;
  pathFlyby: SVGPathElement;
  pathGreen: SVGPathElement;
  pathImpact: SVGPathElement;
  startBurn: MarkerNodes;
  impact: MarkerNodes;
  peri: MarkerNodes;
  apo: MarkerNodes;
  flyby: SVGTextElement;
  trail: SVGLineElement[];
  flame: SVGPolygonElement;
  ship: SVGPolygonElement;
}

function build(svg: SVGSVGElement): PlotNodes {
  const defs = svg.querySelector('defs');
  if (!defs) throw new Error('#navplotSvg <defs> missing from index.html');
  const ringArc = svgEl('path', '');
  ringArc.id = 'npRingArc';
  defs.appendChild(ringArc);

  const ringLabel = svgEl('text', 'np-ring-label');
  const ringText = svgEl('textPath', '');
  ringText.setAttribute('href', '#npRingArc');
  ringText.setAttribute('startOffset', '50%');
  ringText.setAttribute('text-anchor', 'middle');
  ringText.textContent = RING_LABEL_TEXT;
  ringLabel.appendChild(ringText);

  // The hatch fills (WP9): diagonal stripes in the zone's verdict colour (the stripe's class takes its token).
  for (const [verdict, id] of Object.entries(ZONE_HATCH_IDS)) {
    const pattern = svgEl('pattern', '');
    pattern.id = id;
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', fmt(HATCH_PERIOD));
    pattern.setAttribute('height', fmt(HATCH_PERIOD));
    pattern.setAttribute('patternTransform', 'rotate(45)');
    const stripe = svgEl('rect', `np-hatch-stripe verdict-${verdict}`);
    stripe.setAttribute('width', fmt(HATCH_STRIPE));
    stripe.setAttribute('height', fmt(HATCH_PERIOD));
    pattern.appendChild(stripe);
    defs.appendChild(pattern);
  }

  const marker = (glyph: MarkerNodes['glyph'], cls: string): MarkerNodes => ({ glyph, label: svgEl('text', `np-label ${cls}`) });
  const nodes: PlotNodes = {
    ringText,
    zones: svgEl('g', 'np-zones'),
    zoneLabels: svgEl('g', 'np-zone-labels'),
    hazard: svgEl('path', 'np-hazard'),
    hazardCasing: svgEl('path', 'np-hazard-casing'),
    planet: svgEl('circle', 'np-planet'),
    surface: svgEl('circle', 'np-surface'),
    atm: svgEl('circle', 'np-atm'),
    ring: svgEl('path', 'np-ring'),
    ringArc,
    ringLabel,
    band: svgEl('path', 'np-band'),
    pathFlyby: svgEl('path', 'np-path np-path-flyby'),
    pathGreen: svgEl('path', 'np-path np-path-green'),
    pathImpact: svgEl('path', 'np-path np-path-impact'),
    startBurn: marker(svgEl('line', 'np-burn-tick'), 'np-burn-label'),
    impact: marker(svgEl('path', 'np-impact-mark'), 'np-impact-label'),
    peri: marker(svgEl('polygon', 'np-apsis np-peri'), 'np-peri-label'),
    apo: marker(svgEl('polygon', 'np-apsis np-apo'), 'np-apo-label'),
    flyby: svgEl('text', 'np-label np-flyby-tag'),
    trail: Array.from({ length: TRAIL_POINTS }, () => svgEl('line', 'np-trail')),
    flame: svgEl('polygon', 'np-flame'),
    ship: svgEl('polygon', 'np-ship'),
  };
  nodes.planet.setAttribute('fill', 'url(#planetFill)');
  // Back to front: later nodes paint on top.
  nodes.hazard.setAttribute('stroke', `url(#${ZONE_HATCH_IDS.hit})`);

  svg.append(
    nodes.planet, nodes.surface, nodes.atm, nodes.ring, nodes.ringLabel, nodes.zones,
    nodes.band, nodes.pathFlyby, nodes.pathGreen, nodes.pathImpact, nodes.hazardCasing, nodes.hazard,
    nodes.startBurn.glyph, nodes.impact.glyph, nodes.peri.glyph, nodes.apo.glyph,
    ...nodes.trail, nodes.flame, nodes.ship,
    nodes.zoneLabels, nodes.startBurn.label, nodes.impact.label, nodes.peri.label, nodes.apo.label, nodes.flyby,
  );
  return nodes;
}

// The arc the ring label runs along: the ring's middle radius, over the top, left to right.
function topArc(cx: number, cy: number, radius: number): string {
  const fromAngle = (RING_LABEL_FROM_DEG * Math.PI) / 180;
  const toAngle = (RING_LABEL_TO_DEG * Math.PI) / 180;
  return `M${fmt(cx + radius * Math.cos(fromAngle))},${fmt(cy - radius * Math.sin(fromAngle))}`
    + `A${fmt(radius)},${fmt(radius)} 0 0,1 ${fmt(cx + radius * Math.cos(toAngle))},${fmt(cy - radius * Math.sin(toAngle))}`;
}

function show(node: SVGElement, visible: boolean): void {
  node.style.display = visible ? '' : 'none';
}

function setTone(node: SVGElement, base: string, tone: Tone): void {
  const cls = `${base} tone-${tone}`;
  if (node.getAttribute('class') !== cls) node.setAttribute('class', cls);
}

// A box in viewBox units.
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface LabelLayout {
  box: Box;
  x: number;
  top: number;
  anchor: 'start' | 'end' | 'middle';
}

// What a label must stay off (placeClear): boxes (glyphs, the ship, the chip, the ring's name), the labels placed
// before it (the zones' and the markers', their text's own boxes), and, zoomed far out, the small ring and the planet
// inside it. The labels are kept apart from the rest: a label over another label's text leaves at once (placeClear).
interface Obstacles {
  boxes: Box[];
  labels: Box[];
  ring: { cx: number; cy: number; radius: number } | null;
}

// The drawn path, an obstacle for the labels that sit on it (pathArea).
export interface PathObstacle {
  segments: Array<{ from: Vec2; to: Vec2 }>;
  reach: number;
}

function boxAround(spot: Vec2, reach: number): Box {
  return { left: spot.x - reach, top: spot.y - reach, right: spot.x + reach, bottom: spot.y + reach };
}

function padded(box: Box, by: number): Box {
  return { left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by };
}

// Where a label's letters are inside its box (viewBox units at scale 1): a line box is LINE_H tall for capitals about
// LABEL_FONT_UNITS × 0.7 high, with the leading above and the descender room below them, and the first and last
// character cells have side bearings. Two labels whose boxes only share that margin read as stacked, not overlapping
// (HALCYON after its burn: START BURN's box 2 units into `▼ 08:19`'s, the letters apart).
const LABEL_INK_INSET_Y = 2;
const LABEL_INK_INSET_X = 1;

function inkBox(box: Box, scale: number): Box {
  return {
    left: box.left + LABEL_INK_INSET_X * scale, right: box.right - LABEL_INK_INSET_X * scale,
    top: box.top + LABEL_INK_INSET_Y * scale, bottom: box.bottom - LABEL_INK_INSET_Y * scale,
  };
}

function overlapArea(first: Box, second: Box): number {
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function boxTouchesCircle(box: Box, circle: { cx: number; cy: number; radius: number }): boolean {
  const nearestX = Math.min(Math.max(circle.cx, box.left), box.right);
  const nearestY = Math.min(Math.max(circle.cy, box.top), box.bottom);
  return Math.hypot(nearestX - circle.cx, nearestY - circle.cy) < circle.radius;
}

function turned(direction: Vec2, degrees: number): Vec2 {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: direction.x * Math.cos(angle) - direction.y * Math.sin(angle),
    y: direction.x * Math.sin(angle) + direction.y * Math.cos(angle),
  };
}

// Where a multi-line label next to a marker goes, pushed away from the marker along `away` (a screen-space unit
// vector) and kept inside the plot frame. `scale`: the label font's scale (1 on a desktop; see LABEL_FONT_UNITS).
function layoutLabel(lines: readonly string[], spot: Vec2, away: Vec2, scale: number, charW: number = CHAR_W): LabelLayout {
  const origin = { x: spot.x + away.x * LABEL_GAP, y: spot.y + away.y * LABEL_GAP };
  const anchor = away.x > LABEL_SIDE_COS ? 'start' : away.x < -LABEL_SIDE_COS ? 'end' : 'middle';
  const width = Math.max(...lines.map((line) => line.length)) * charW * scale;
  const height = lines.length * LINE_H * scale;

  let top: number;
  if (away.y > LABEL_SIDE_COS) top = origin.y;
  else if (away.y < -LABEL_SIDE_COS) top = origin.y - height;
  else top = origin.y - height / 2;
  top = Math.min(Math.max(top, EDGE), VIEWBOX - EDGE - height);

  let x = origin.x;
  if (anchor === 'start') x = Math.min(x, VIEWBOX - EDGE - width);
  else if (anchor === 'end') x = Math.max(x, EDGE + width);
  else x = Math.min(Math.max(x, EDGE + width / 2), VIEWBOX - EDGE - width / 2);
  x = Math.min(Math.max(x, EDGE), VIEWBOX - EDGE);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { box: { left, top, right: left + width, bottom: top + height }, x, top, anchor };
}

function writeLabel(label: SVGTextElement, lines: readonly string[], layout: LabelLayout, scale: number): void {
  const { x, top, anchor } = layout;
  label.setAttribute('text-anchor', anchor);
  while (label.childNodes.length > lines.length) label.lastChild?.remove();
  lines.forEach((line, index) => {
    let tspan = label.childNodes[index] as SVGTSpanElement | undefined;
    if (!tspan) {
      tspan = document.createElementNS(SVG_NS, 'tspan');
      label.appendChild(tspan);
    }
    tspan.setAttribute('x', fmt(x));
    // The first baseline sits one line below the block's top edge.
    tspan.setAttribute('y', fmt(top + (LINE_H * (index + 1) - BASELINE_LIFT) * scale));
    if (tspan.textContent !== line) tspan.textContent = line;
  });
}

// A label pushed along `away` with no regard for the others (the zones' labels); returns its box.
function placeLabel(label: SVGTextElement, lines: readonly string[], spot: Vec2, away: Vec2, scale: number): Box {
  const layout = layoutLabel(lines, spot, away, scale);
  writeLabel(label, lines, layout, scale);
  return layout.box;
}

// Whether a label that hits `keptCost` on its side should move to a side that hits `cost` (LABEL_HOP_MIN_AREA).
export function hitsClearlyLess(cost: number, keptCost: number, scale: number): boolean {
  return keptCost - cost >= LABEL_HOP_MIN_AREA * scale * scale;
}

// The area of a box over a disc (the small ring and the planet inside it), on a RING_COST_STEP grid.
function areaOverDisc(box: Box, disc: { cx: number; cy: number; radius: number }): number {
  if (!boxTouchesCircle(box, disc)) return 0;
  let inside = 0;
  for (let y = box.top + RING_COST_STEP / 2; y < box.bottom; y += RING_COST_STEP) {
    for (let x = box.left + RING_COST_STEP / 2; x < box.right; x += RING_COST_STEP) {
      if (Math.hypot(x - disc.cx, y - disc.cy) < disc.radius) inside++;
    }
  }
  // A box thinner than one step still touches: count it as one cell.
  return Math.max(1, inside) * RING_COST_STEP * RING_COST_STEP;
}

// The drawn path as an obstacle (viewBox units): its segments that touch the frame, and how far the band reaches.
function pathObstacle(pred: Prediction, proj: Projector, reach: number): PathObstacle {
  const inFrame = (spot: Vec2): boolean => spot.x >= 0 && spot.x <= VIEWBOX && spot.y >= 0 && spot.y <= VIEWBOX;
  const segments: PathObstacle['segments'] = [];
  let previous: Vec2 | null = null;
  for (const point of pred.points) {
    const spot = proj.project(point);
    if (previous && (inFrame(previous) || inFrame(spot))) segments.push({ from: previous, to: spot });
    previous = spot;
  }
  return { segments, reach };
}

// The length of a segment inside a box (Liang–Barsky clipping).
function lengthInside(from: Vec2, to: Vec2, box: Box): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let leave = 1;
  // Per edge: the segment's rate toward the outside, and its room inside at the start.
  const edges: ReadonlyArray<readonly [number, number]> = [
    [-dx, from.x - box.left], [dx, box.right - from.x], [-dy, from.y - box.top], [dy, box.bottom - from.y],
  ];
  for (const [rate, room] of edges) {
    if (rate === 0) {
      if (room < 0) return 0;
      continue;
    }
    const cut = room / rate;
    if (rate < 0) enter = Math.max(enter, cut);
    else leave = Math.min(leave, cut);
    if (enter > leave) return 0;
  }
  return (leave - enter) * Math.hypot(dx, dy);
}

// The band's area over a label's box, about: the length of the path's line inside the box grown by its reach, times
// the band's width (never less than the true area). It holds still when the prediction's points slide along the same
// curve, as they do every frame from the ship.
export function pathArea(box: Box, path: PathObstacle | null): number {
  if (!path) return 0;
  const grown = { left: box.left - path.reach, top: box.top - path.reach, right: box.right + path.reach, bottom: box.bottom + path.reach };
  let length = 0;
  for (const { from, to } of path.segments) {
    if (Math.max(from.x, to.x) < grown.left || Math.min(from.x, to.x) > grown.right) continue;
    if (Math.max(from.y, to.y) < grown.top || Math.min(from.y, to.y) > grown.bottom) continue;
    length += lengthInside(from, to, grown);
  }
  return length * 2 * path.reach;
}

// The ring's name as boxes along its arc (topArc's angles), for the collision pass. `scale`: its font's.
function ringNameBoxes(cx: number, cy: number, radius: number, scale: number): Box[] {
  const from = (RING_LABEL_FROM_DEG * Math.PI) / 180;
  const to = (RING_LABEL_TO_DEG * Math.PI) / 180;
  const steps = Math.max(1, Math.ceil((radius * (from - to)) / RING_NAME_STEP));
  const boxes: Box[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    boxes.push(boxAround({ x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) }, RING_NAME_HALF * scale));
  }
  return boxes;
}

function outwardFrom(center: number, spot: Vec2): Vec2 {
  const dx = spot.x - center;
  const dy = spot.y - center;
  const length = Math.hypot(dx, dy);
  return length > 1e-6 ? { x: dx / length, y: dy / length } : { x: 0, y: -1 };
}

function triangle(spot: Vec2, pointsDown: boolean): string {
  const tipY = pointsDown ? spot.y + MARK_SIZE : spot.y - MARK_SIZE;
  const baseY = pointsDown ? spot.y - MARK_SIZE * 0.75 : spot.y + MARK_SIZE * 0.75;
  return `${fmt(spot.x - MARK_SIZE)},${fmt(baseY)} ${fmt(spot.x + MARK_SIZE)},${fmt(baseY)} ${fmt(spot.x)},${fmt(tipY)}`;
}

function cross(spot: Vec2): string {
  const size = MARK_SIZE;
  return `M${fmt(spot.x - size)},${fmt(spot.y - size)}L${fmt(spot.x + size)},${fmt(spot.y + size)}`
    + `M${fmt(spot.x - size)},${fmt(spot.y + size)}L${fmt(spot.x + size)},${fmt(spot.y - size)}`;
}

// Ship marker: a notched arrow whose nose points along the heading (world frame; SVG y is
// flipped) and leads the ship position. The flame comes out of the notch: amber for the kid's burn, the warning
// colour while the engine fires by itself (WP10, C2: nobody is on the throttle, and the plot says so where ▼ drifts).
function setShip(
  ship: SVGPolygonElement, flame: SVGPolygonElement, spot: Vec2, headingRad: number, thrusting: boolean, ghost: boolean,
): void {
  const fx = Math.cos(headingRad);
  const fy = -Math.sin(headingRad);
  const px = -fy;
  const py = fx;
  const point = (along: number, side: number): string => `${fmt(spot.x + fx * along + px * side)},${fmt(spot.y + fy * along + py * side)}`;
  const notch = -SHIP_BACK + SHIP_NOTCH;
  ship.setAttribute('points',
    `${point(SHIP_TIP, 0)} ${point(-SHIP_BACK, SHIP_HALF)} ${point(notch, 0)} ${point(-SHIP_BACK, -SHIP_HALF)}`);
  const lit = thrusting || ghost;
  show(flame, lit);
  flame.classList.toggle('ghost', ghost && !thrusting);
  if (lit) {
    flame.setAttribute('points', `${point(notch, SHIP_HALF * 0.5)} ${point(notch, -SHIP_HALF * 0.5)} ${point(-SHIP_BACK - FLAME_LEN, 0)}`);
  }
}

// The fading trail behind the ship: segments from the oldest kept position (transparent) to
// the ship itself (TRAIL_MAX_OPACITY).
function setTrail(segments: SVGLineElement[], kept: readonly Vec2[], shipAt: Vec2, proj: Projector): void {
  const spots = [...kept.map((point) => proj.project(point)), shipAt];
  segments.forEach((segment, index) => {
    const from = spots[index];
    const to = spots[index + 1];
    show(segment, from !== undefined && to !== undefined);
    if (!from || !to) return;
    segment.setAttribute('x1', fmt(from.x));
    segment.setAttribute('y1', fmt(from.y));
    segment.setAttribute('x2', fmt(to.x));
    segment.setAttribute('y2', fmt(to.y));
    segment.style.opacity = fmt(TRAIL_MAX_OPACITY * (index + 1) / (spots.length - 1));
  });
}

// The fragments flecking a debris cloud of `radius` (viewBox units) centred on `spot`: small squares on a
// sunflower spiral, one subpath each.
function speckPath(spot: Vec2, radius: number): string {
  if (radius < SPECK_MIN_RADIUS) return '';
  let pathData = '';
  for (let i = 0; i < SPECKS; i++) {
    const along = radius * SPECK_SPREAD * Math.sqrt((i + 0.5) / SPECKS);
    const angle = i * GOLDEN_ANGLE;
    const x = spot.x + along * Math.cos(angle) - SPECK_SIZE / 2;
    const y = spot.y + along * Math.sin(angle) - SPECK_SIZE / 2;
    pathData += `M${fmt(x)},${fmt(y)}h${fmt(SPECK_SIZE)}v${fmt(SPECK_SIZE)}h${fmt(-SPECK_SIZE)}Z`;
  }
  return pathData;
}

// Which way a debris cloud's label goes (a screen-space unit vector): square to the drawn path where it passes
// nearest the cloud, on the side away from the planet (`out`: from the plot's centre through the cloud). A path
// too short to have a direction leaves it straight out. A label that would not fit beside the cloud (the frame's
// edge would push it back over the cloud) goes below or above it instead. paintZones then takes the cloud's side that
// keeps the label off the path, this one first.
function debrisLabelSide(
  pred: Prediction, proj: Projector, centre: Vec2, out: Vec2, spot: Vec2, radius: number, lines: readonly string[], scale: number,
): Vec2 {
  const side = pathSide(pred, proj, centre, out);
  const width = Math.max(...lines.map((line) => line.length)) * CHAR_W * scale;
  const reach = radius + LABEL_GAP + width;
  const fits = side.x > 0 ? spot.x + reach <= VIEWBOX - EDGE : side.x < 0 ? spot.x - reach >= EDGE : true;
  if (fits) return side;
  return { x: 0, y: out.y < 0 ? -1 : 1 };
}

function pathSide(pred: Prediction, proj: Projector, centre: Vec2, out: Vec2): Vec2 {
  let nearest = -1;
  let nearestKm = Infinity;
  pred.points.forEach((point, i) => {
    const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
    if (distance < nearestKm) { nearestKm = distance; nearest = i; }
  });
  const from = pred.points[Math.max(0, nearest - 1)];
  const to = pred.points[Math.min(pred.points.length - 1, nearest + 1)];
  if (nearest < 0 || !from || !to || from === to) return out;
  const fromScreen = proj.project(from);
  const toScreen = proj.project(to);
  const length = Math.hypot(toScreen.x - fromScreen.x, toScreen.y - fromScreen.y);
  if (length < 1e-6) return out;
  const normal = { x: -(toScreen.y - fromScreen.y) / length, y: (toScreen.x - fromScreen.x) / length };
  const side = normal.x * out.x + normal.y * out.y >= 0 ? normal : { x: -normal.x, y: -normal.y };
  // A label is wide and short: beside a path that runs up and down it goes left or right of the cloud (centred
  // on it), beside one that runs across it goes above or below.
  return Math.abs(side.y) > DEBRIS_LABEL_VERTICAL_COS ? { x: 0, y: Math.sign(side.y) } : { x: Math.sign(side.x), y: 0 };
}

// How wide the hatched band along the path's run through a zone is drawn (viewBox units): HAZARD_BAND, but no more than
// a share of the smallest debris cloud's on-screen radius (see HAZARD_BAND_CLOUD_SHARE).
function hazardBandWidth(zones: readonly Zone[], scale: number): number {
  let band = HAZARD_BAND;
  for (const zone of zones) {
    if (zone.kind === 'debris') band = Math.min(band, Math.max(HAZARD_BAND_MIN, zone.r * scale * HAZARD_BAND_CLOUD_SHARE));
  }
  return band;
}

// The fill a zone's glyph takes: its verdict's hatch, or none for a zone the path clears (only its outline).
function zoneFill(model: PlotZoneModel): string {
  return model.verdict === 'clear' ? 'none' : `url(#${ZONE_HATCH_IDS[model.verdict]})`;
}

function paintLabel(target: HTMLElement, label: Label, text: string = label.text): void {
  if (target.textContent !== text) target.textContent = text;
  const cls = `v tone-${label.tone}`;
  if (target.className !== cls) target.className = cls;
}

export function mountNavPlotWindow(store: Store<GameState>): () => void {
  const svg = requireById<SVGSVGElement>('navplotSvg');
  const chipEl = requireById('npChip');
  const lowestEl = requireById('npLowest');
  const lowestDriftEl = requireById('npLowestDrift');
  const highestEl = requireById('npHighest');
  const rangeEl = requireById('npRange');
  const statusEl = requireById('npStatus');
  const veilEl = requireById('npVeil');
  const veilWhyEl = requireById('npVeilWhy');
  const scramblers = { lowest: createScrambler(), highest: createScrambler(), range: createScrambler() };

  svg.setAttribute('viewBox', `0 0 ${VIEWBOX} ${VIEWBOX}`);
  const nodes = build(svg);
  const half = VIEWBOX / 2;
  // 01-landing §4: the brackets on the rim, the pod arc, the dot, the streaks, the marks and the beacons (plot-landing).
  const landingLayer = createPlotLandingLayer(svg, nodes.surface, nodes.startBurn.glyph);
  let ringText: string = RING_LABEL_TEXT;
  let lastPred: Prediction | null = null;
  let lastViewR = 0;
  let lastPlotKey = '';
  let lastVeilWhy = '';
  // One set of nodes per hazard zone of this flight (a new ship brings its own zones).
  const zoneNodes = new Map<string, ZoneNodes>();
  // World positions the ship passed, oldest first (the trail).
  const trail: Vec2[] = [];
  const offReset = onWorldReset('navplot-trail', () => { trail.length = 0; landingLayer.clear(); }, () => ({ trail: trail.length }));

  // The side each marker's label last took (an index into LABEL_TRY_TURNS_DEG) and when it moved there (performance.now()
  // ms), kept as LABEL_TRY_TURNS_DEG says.
  const labelTurns = new Map<SVGTextElement, { index: number; since: number }>();

  // The plot's on-screen geometry, read only when it changes (WP12 review: the chip's box was three layout reads every
  // game tick, right after the redraw's writes, even with the amber view hidden). A ResizeObserver keeps the svg's size;
  // the chip's box is measured again only when its words, its class or that size change.
  const geometry = { width: 0, height: 0, chipKey: '', chip: null as Box | null };
  // The labels' font scale (1 on a desktop; LABEL_FONT_UNITS) and the ring name's, from the svg's size on a phone.
  let labelScale = 1;
  let ringScale = 1;
  function rescale(): void {
    const pxPerUnit = Math.min(geometry.width, geometry.height) / VIEWBOX;
    if (pxPerUnit <= 0) return;  // hidden (the MIND, another tab): keep the last scale
    const phone = isMobileViewport();
    const labels = phone ? Math.max(1, PHONE_LABEL_MIN_PX / (LABEL_FONT_UNITS * pxPerUnit)) : 1;
    const ringName = phone ? Math.max(1, PHONE_LABEL_MIN_PX / (RING_FONT_UNITS * pxPerUnit)) : 1;
    if (labels === labelScale && ringName === ringScale) return;
    labelScale = labels;
    ringScale = ringName;
    svg.style.setProperty('--np-label-scale', fmt(labelScale));
    svg.style.setProperty('--np-ring-scale', fmt(ringScale));
    lastViewR = -1;  // the ring's name fits its arc or not at the new size: redraw the furniture
  }
  const resizeObserver = new ResizeObserver(() => {
    const rect = svg.getBoundingClientRect();
    geometry.width = rect.width;
    geometry.height = rect.height;
    geometry.chipKey = '';
    rescale();
    redraw();
  });
  resizeObserver.observe(svg);

  // The chip over the plot's corner (HTML), in viewBox units (through the svg's screen matrix, so a phone's letterboxed
  // square maps right too): the labels keep off it, and the ship is kept out from under it.
  function chipBox(): Box | null {
    if (chipEl.textContent === '' || geometry.width <= 0) return null;
    const key = `${chipEl.textContent}|${chipEl.className}|${geometry.width}|${geometry.height}`;
    if (key === geometry.chipKey) return geometry.chip;
    geometry.chipKey = key;
    const matrix = svg.getScreenCTM();
    const chipRect = chipEl.getBoundingClientRect();
    if (matrix === null || chipRect.width <= 0) {
      geometry.chip = null;
      return null;
    }
    const toUnits = matrix.inverse();
    const corner = (x: number, y: number): DOMPoint => new DOMPoint(x, y).matrixTransform(toUnits);
    const topLeft = corner(chipRect.left, chipRect.top);
    const bottomRight = corner(chipRect.right, chipRect.bottom);
    geometry.chip = {
      left: topLeft.x - OBSTACLE_PAD, top: topLeft.y - OBSTACLE_PAD,
      right: bottomRight.x + OBSTACLE_PAD, bottom: bottomRight.y + OBSTACLE_PAD,
    };
    return geometry.chip;
  }

  // The label on the first side that hits nothing (see LABEL_TRY_TURNS_DEG), else on the one that hits least, unless
  // the side it has hits barely more or it only just moved (mayMove). Its box joins the obstacles, so the labels placed
  // after it keep off it too. `path`: the drawn path, for the labels that keep off it (the markers' and FLYBY).
  // Whether a label on the plot moves from its side, which hits `keptCost`, to one that hits `cost`, `heldMs` after it
  // last moved (LABEL_HOP_MIN_AREA, LABEL_HOLD_MS).
  function mayMove(cost: number, keptCost: number, heldMs: number): boolean {
    return heldMs >= LABEL_HOLD_MS && hitsClearlyLess(cost, keptCost, labelScale);
  }

  // Final review: a label over another label's text (LAST LIGHT's START BURN under `▼ 03:20 / LOWEST ≈2,400 km`) is not
  // a touch to ride out. A side is judged by two numbers: `onText`, how much of its letters lie on the letters of the
  // labels placed before it (their ink boxes, inkBox: two line boxes that only share their leading are stacked, not on
  // each other), first; then `cost`, what it hits otherwise (the path, the glyphs, the chip, the ring, and those labels
  // with LABEL_SPACING around them). A side over less text wins at once, past the hysteresis and the hold; among sides
  // over as much text (none, nearly always) the hysteresis and the hold (mayMove) decide as before, so a label still
  // never hops on a touch of the path or the ring, and never moves onto another label's text to get off the path.
  function placeClear(label: SVGTextElement, lines: readonly string[], spot: Vec2, preferred: Vec2, obstacles: Obstacles,
    charW: number = CHAR_W, path: PathObstacle | null = null): void {
    interface Option { layout: LabelLayout; onText: number; cost: number }
    const tryTurn = (index: number): Option => {
      const layout = layoutLabel(lines, spot, turned(preferred, LABEL_TRY_TURNS_DEG[index]!), labelScale, charW);
      let cost = pathArea(layout.box, path);
      for (const box of obstacles.boxes) cost += overlapArea(layout.box, box);
      let onText = 0;
      const ink = inkBox(layout.box, labelScale);
      for (const box of obstacles.labels) {
        onText += overlapArea(ink, inkBox(box, labelScale));
        cost += overlapArea(layout.box, padded(box, LABEL_SPACING));
      }
      if (obstacles.ring) cost += areaOverDisc(layout.box, obstacles.ring);
      return { layout, onText, cost };
    };
    const better = (option: Option, than: Option): boolean =>
      option.onText < than.onText || (option.onText === than.onText && option.cost < than.cost);
    // A label just shown starts from its own side.
    const now = performance.now();
    const turn = labelTurns.get(label) ?? { index: 0, since: -Infinity };
    const kept = tryTurn(turn.index);
    let best = kept;
    let bestIndex = turn.index;
    if (kept.onText > 0 || kept.cost > 0) {
      for (let index = 0; index < LABEL_TRY_TURNS_DEG.length; index++) {
        const option = tryTurn(index);
        if (better(option, best)) { best = option; bestIndex = index; }
        if (best.onText === 0 && best.cost === 0) break;
      }
      const offText = best.onText < kept.onText;
      if (!offText && !mayMove(best.cost, kept.cost, now - turn.since)) { best = kept; bestIndex = turn.index; }
    }
    labelTurns.set(label, bestIndex === turn.index ? turn : { index: bestIndex, since: now });
    writeLabel(label, lines, best.layout, labelScale);
    obstacles.labels.push(best.layout.box);
  }

  function paintMarker(marker: MarkerNodes, model: PlotMarker | null, proj: Projector, glyphBase: string, labelBase: string,
    drawGlyph: (spot: Vec2) => void, obstacles: Obstacles, away?: Vec2, charW?: number, path?: PathObstacle | null): void {
    show(marker.glyph, model !== null);
    show(marker.label, model !== null);
    if (!model) { labelTurns.delete(marker.label); return; }
    const spot = proj.project(model.pos);
    drawGlyph(spot);
    setTone(marker.glyph, glyphBase, model.tone);
    setTone(marker.label, labelBase, model.tone);
    placeClear(marker.label, model.lines, spot, away ?? outwardFrom(half, spot), obstacles, charW, path);
  }

  // WP12 review (LEAD-2's item, its second half): the ship marker could pass under the chip for a moment of a long
  // SKIP, the ship riding the plot's edge at the chip's corner. Labels move off the chip; the ship cannot, so the plot
  // zooms out just enough that the ship's glyph (SHIP_TIP around it) clears the chip's box, only while it would not:
  // the view radius that puts the ship at the nearest clear spot along its own line from the planet.
  function clearOfChip(viewR: number, ship: Vec2, chip: Box | null): number {
    if (chip === null) return viewR;
    const reach = SHIP_TIP + OBSTACLE_PAD;
    const fitScale = (half - MARGIN) / viewR;
    const at = { x: half + ship.x * fitScale, y: half - ship.y * fitScale };
    if (overlapArea(boxAround(at, reach), chip) <= 0) return viewR;
    // The chip sits in a top corner: clear below its bottom edge, or beside its inner edge, whichever needs less zoom.
    const scales: number[] = [];
    if (ship.y > 0) scales.push((half - reach - chip.bottom) / ship.y);
    if (chip.left <= half && ship.x < 0) scales.push((half - reach - chip.right) / -ship.x);
    if (chip.right >= half && ship.x > 0) scales.push((chip.left - reach - half) / ship.x);
    // No zoom-out clears it (a chip reaching past the plot's centre on the ship's side): the view stays as it is.
    const scale = Math.max(...scales.filter((value) => value > 0));
    return Number.isFinite(scale) && scale < fitScale ? (half - MARGIN) / scale : viewR;
  }

  // The ▼ label's direction: outward as every marker's, unless the ✕ IMPACT label sits right there (see
  // LABEL_CLASH_UNITS): then sideways, away from the ✕.
  function periAway(peri: Vec2 | null, impact: Vec2 | null, proj: Projector): Vec2 | undefined {
    if (peri === null || impact === null) return undefined;
    const periSpot = proj.project(peri);
    const impactSpot = proj.project(impact);
    if (Math.hypot(periSpot.x - impactSpot.x, periSpot.y - impactSpot.y) > LABEL_CLASH_UNITS) return undefined;
    const out = outwardFrom(half, periSpot);
    const side = { x: -out.y, y: out.x };
    const fromImpact = (periSpot.x - impactSpot.x) * side.x + (periSpot.y - impactSpot.y) * side.y;
    return fromImpact >= 0 ? side : { x: -side.x, y: -side.y };
  }

  function zoneNodesFor(zoneId: string): ZoneNodes {
    let found = zoneNodes.get(zoneId);
    if (!found) {
      found = { glyph: svgEl('path', ''), specks: svgEl('path', ''), label: svgEl('text', '') };
      nodes.zones.append(found.glyph, found.specks);
      nodes.zoneLabels.appendChild(found.label);
      zoneNodes.set(zoneId, found);
    }
    return found;
  }

  // A debris cloud's label beside the cloud: on `preferred`'s side, else the side (of the four) that keeps it off the
  // drawn path, the cloud itself (the frame's edge can push a label back over it) and, zoomed far out, the small ring
  // and the planet, or covers least of them (WP12 review: a phone's bigger label straddled the path below the cloud).
  // The side it took is kept as the markers' are (LABEL_HOP_MIN_AREA).
  const SIDES: readonly Vec2[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  const zoneSides = new Map<SVGTextElement, { side: Vec2; since: number }>();
  function placeZoneLabel(label: SVGTextElement, lines: readonly string[], spot: Vec2, radius: number, preferred: Vec2,
    path: PathObstacle | null, smallRing: Obstacles['ring']): Box {
    const cloud = { cx: spot.x, cy: spot.y, radius };
    const layoutAt = (side: Vec2): { layout: LabelLayout; cost: number } => {
      const layout = layoutLabel(lines, { x: spot.x + side.x * radius, y: spot.y + side.y * radius }, side, labelScale);
      let cost = areaOverDisc(layout.box, cloud);
      cost += pathArea(layout.box, path);
      if (smallRing) cost += areaOverDisc(layout.box, smallRing);
      return { layout, cost };
    };
    const now = performance.now();
    const keptSide = zoneSides.get(label) ?? { side: preferred, since: -Infinity };
    const kept = layoutAt(keptSide.side);
    let best = kept;
    let bestSide = keptSide.side;
    if (kept.cost > 0) {
      for (const side of [preferred, ...SIDES]) {
        const option = layoutAt(side);
        if (option.cost < best.cost) { best = option; bestSide = side; }
        if (best.cost === 0) break;
      }
      if (!mayMove(best.cost, kept.cost, now - keptSide.since)) { best = kept; bestSide = keptSide.side; }
    }
    zoneSides.set(label, bestSide === keptSide.side ? keptSide : { side: bestSide, since: now });
    writeLabel(label, lines, best.layout, labelScale);
    return best.layout.box;
  }

  // The zones (WP9): every redraw, since their labels count down; the shapes are a handful of arcs. Returns the boxes of
  // the labels it placed (the markers' labels keep off them).
  function paintZones(
    models: readonly PlotZoneModel[], proj: Projector, pred: Prediction, path: PathObstacle | null, smallRing: Obstacles['ring'],
  ): Box[] {
    const placed: Box[] = [];
    for (const [zoneId, gone] of zoneNodes) {
      if (models.some((model) => model.zoneId === zoneId)) continue;
      gone.glyph.remove();
      gone.specks.remove();
      gone.label.remove();
      zoneSides.delete(gone.label);
      zoneNodes.delete(zoneId);
    }
    for (const model of models) {
      const zoneView = zoneNodesFor(model.zoneId);
      const zone = model.zone;
      setTone(zoneView.glyph, `np-zone np-zone-${zone.kind} verdict-${model.verdict}`, model.tone);
      zoneView.glyph.setAttribute('fill', zoneFill(model));
      setTone(zoneView.label, 'np-label np-zone-label', model.tone);
      if (zone.kind === 'debris') {
        const spot = proj.project(zone.centre);
        const radius = zone.r * proj.scale;
        zoneView.glyph.setAttribute('d', circlePath(spot.x, spot.y, radius));
        zoneView.specks.setAttribute('d', speckPath(spot, radius));
        setTone(zoneView.specks, `np-zone-specks verdict-${model.verdict}`, model.tone);
        // A cloud the plot has left behind (the view zoomed in past it) takes its label with it.
        const inFrame = spot.x + radius >= 0 && spot.x - radius <= VIEWBOX && spot.y + radius >= 0 && spot.y - radius <= VIEWBOX;
        show(zoneView.glyph, inFrame);
        show(zoneView.specks, inFrame);
        show(zoneView.label, inFrame);
        if (!inFrame) continue;
        const away = debrisLabelSide(pred, proj, zone.centre, outwardFrom(half, spot), spot, radius, model.lines, labelScale);
        placed.push(placeZoneLabel(zoneView.label, model.lines, spot, radius, away, path, smallRing));
      } else {
        zoneView.glyph.setAttribute('d', annulus(half, half, zone.rOut * proj.scale, zone.rIn * proj.scale));
        zoneView.specks.setAttribute('d', '');
        const angle = (BELT_LABEL_DEG * Math.PI) / 180;
        const radius = ((zone.rIn + zone.rOut) / 2) * proj.scale;
        const away = { x: Math.cos(angle), y: -Math.sin(angle) };
        placed.push(placeLabel(zoneView.label, model.lines, { x: half + away.x * radius, y: half + away.y * radius }, away, labelScale));
      }
    }
    return placed;
  }

  function redraw(): void {
    const state = store.getState();
    // What the instruments show (WP4): the sensed prediction, ≈ when Sensor Interp is damaged.
    const pred = getSensedPrediction();
    const caps = capabilitiesNow(state);
    const plot = caps.plot;
    const { planet, ring } = state.level;
    const ship: Vec2 = { x: state.orbit.x, y: state.orbit.y };
    // The chip first: its box is this frame's (the labels keep off it, the ship is zoomed out from under it).
    const chip = plotChip(state, pred, plot);
    if (chipEl.textContent !== chip.text) chipEl.textContent = chip.text;
    const chipCls = `np-chip tone-${chip.tone}`;
    if (chipEl.className !== chipCls) chipEl.className = chipCls;
    const chipArea = chipBox();
    const viewR = clearOfChip(plotViewRadius(state), ship, chipArea);
    const proj = makeProjector(viewR, VIEWBOX, MARGIN);
    const scale = proj.scale;
    const blind = plot.mode === 'uncertain';
    const noSignal = plot.mode === 'no-signal';
    const wantRing = ringLabel(state);
    if (wantRing !== ringText) {
      ringText = wantRing;
      nodes.ringText.textContent = ringText;
      lastViewR = -1;  // the name's length decides whether it fits its arc
    }

    // Furniture and the path only change with the prediction (≤ 10 Hz; a stale sensor every few
    // seconds), the scale, or what the instruments can show.
    const plotKey = `${plot.mode}|${plot.fuzzKm}`;
    if (pred !== lastPred || viewR !== lastViewR || plotKey !== lastPlotKey) {
      // The planet never shrinks under PLOT_PLANET_MIN_UNITS: a long SKIP's far zoom still shows what the loop goes
      // around. The atmosphere's dashes stay outside it.
      const planetR = Math.max(planet.R * scale, PLOT_PLANET_MIN_UNITS);
      setCircle(nodes.planet, half, half, planetR);
      setCircle(nodes.surface, half, half, planetR);
      setCircle(nodes.atm, half, half, Math.max(planet.rAtm * scale, planetR));
      nodes.ring.setAttribute('d', annulus(half, half, ring.max * scale, ring.min * scale));
      const ringMidR = ((ring.min + ring.max) / 2) * scale;
      nodes.ringArc.setAttribute('d', topArc(half, half, ringMidR));
      const arcLength = (ringMidR * (RING_LABEL_FROM_DEG - RING_LABEL_TO_DEG) * Math.PI) / 180;
      show(nodes.ringLabel, arcLength >= ringText.length * RING_LABEL_CHAR_ALONG * ringScale);
      const paths = pathsByColour(pred, proj);
      // Blind or dark, the coloured line is not drawn at all: a grey band (or nothing) instead.
      const colours = !blind && !noSignal;
      nodes.pathFlyby.setAttribute('d', colours ? paths.flyby : '');
      nodes.pathGreen.setAttribute('d', colours ? paths.green : '');
      nodes.pathImpact.setAttribute('d', colours ? paths.impact : '');
      // The path's run through a zone that can still hurt, hatched over its colour (not on a blind plot).
      const hazard = colours ? hazardPath(pred, proj) : '';
      const band = hazardBandWidth(state.level.zones, scale);
      nodes.hazard.setAttribute('d', hazard);
      nodes.hazard.setAttribute('stroke-width', fmt(band));
      nodes.hazardCasing.setAttribute('d', hazard);
      nodes.hazardCasing.setAttribute('stroke-width', fmt(band + HAZARD_CASING_EXTRA));
      const banded = plot.mode === 'approx' || blind;
      nodes.band.setAttribute('d', banded ? paths.whole : '');
      if (banded) {
        const minUnits = blind ? PLOT_UNCERTAIN_MIN_UNITS : PLOT_FUZZ_MIN_UNITS;
        nodes.band.setAttribute('stroke-width', fmt(bandWidth(plot.fuzzKm, proj, minUnits)));
        nodes.band.setAttribute('class', `np-band ${plot.mode}`);
      }
      lastPred = pred;
      lastViewR = viewR;
      lastPlotKey = plotKey;
    }
    nodes.ring.classList.toggle('hot', pred.fit.inRing && !blind && !noSignal);

    veilEl.hidden = !noSignal;
    if (noSignal) {
      const why = noSignalReason(state);
      // From the amber screen [TAB] leads to the MIND: on a phone the cap names it (keycaps.ts).
      if (why !== lastVeilWhy) { renderKeyCaps(veilWhyEl, why, { tab: 'MIND' }); lastVeilWhy = why; }
    }

    // The drawn path (a blind plot's grey band: half its width), which the labels keep off; nothing under NO SIGNAL.
    const banded = plot.mode === 'approx' || blind;
    const pathReach = banded
      ? bandWidth(plot.fuzzKm, proj, blind ? PLOT_UNCERTAIN_MIN_UNITS : PLOT_FUZZ_MIN_UNITS) / 2
      : PATH_OBSTACLE_HALF;
    const path = noSignal ? null : pathObstacle(pred, proj, pathReach);
    // Zoomed far out (see SMALL_RING_UNITS) the ring and the planet inside it are an obstacle for every label.
    const ringOuterUnits = ring.max * scale;
    const smallRing = ringOuterUnits < SMALL_RING_UNITS ? { cx: half, cy: half, radius: ringOuterUnits + OBSTACLE_PAD } : null;
    const zoneLabelBoxes = paintZones(plotZones(state, pred, plot), proj, pred, path, smallRing);

    const markers = plotMarkers(state, pred, plot);
    // ▲ only while it fits the frame; a just-captured loop's far end can be way off the plot.
    const apo = markers.apo && Math.hypot(markers.apo.pos.x, markers.apo.pos.y) <= viewR ? markers.apo : null;
    const burn = markers.startBurn;
    const shipAt = proj.project(ship);

    // What the labels keep off (placeClear): every glyph and the ship first, the ring's name while it is drawn, the
    // chip, the zones' labels, and each label placed before (in this order: IMPACT, ▼, ▲, START BURN, FLYBY).
    // The landing's layer first (01-landing §4): its brackets' names are obstacles for the markers' labels.
    const planetUnits = Math.max(planet.R * scale, PLOT_PLANET_MIN_UNITS);
    const landingModel = noSignal ? null : plotLandingModel(state, state.run.phase === 'landing' ? getDropSolution() : null);
    const bracketBoxes = landingLayer.paint(landingModel, proj, half, half, planetUnits);
    const obstacles: Obstacles = {
      boxes: [boxAround(shipAt, SHIP_TIP + OBSTACLE_PAD), ...bracketBoxes.map((box) => padded(box, OBSTACLE_PAD))],
      labels: [...zoneLabelBoxes], ring: smallRing,
    };
    for (const marker of [markers.impact, markers.peri, apo]) {
      if (marker) obstacles.boxes.push(boxAround(proj.project(marker.pos), MARK_SIZE + OBSTACLE_PAD));
    }
    if (burn) obstacles.boxes.push(boxAround(proj.project(burn.pos), TICK_HALF + OBSTACLE_PAD));
    const ringMidUnits = ((ring.min + ring.max) / 2) * scale;
    if (nodes.ringLabel.style.display !== 'none') obstacles.boxes.push(...ringNameBoxes(half, half, ringMidUnits, ringScale));
    if (chipArea) obstacles.boxes.push(chipArea);

    paintMarker(nodes.impact, markers.impact, proj, 'np-impact-mark', 'np-label np-impact-label',
      (spot) => nodes.impact.glyph.setAttribute('d', cross(spot)), obstacles, undefined, undefined, path);
    paintMarker(nodes.peri, markers.peri, proj, 'np-apsis np-peri', 'np-label np-peri-label',
      (spot) => nodes.peri.glyph.setAttribute('points', triangle(spot, true)), obstacles,
      periAway(markers.peri?.pos ?? null, markers.impact?.pos ?? null, proj), undefined, path);
    paintMarker(nodes.apo, apo, proj, 'np-apsis np-apo', 'np-label np-apo-label',
      (spot) => nodes.apo.glyph.setAttribute('points', triangle(spot, false)), obstacles, undefined, undefined, path);

    // START BURN: a tick across the path; its label goes on the planet side of the line so it
    // stays clear of the ▼ label, which points away from the planet (the collision pass turns it when it can't).
    let burnAway: Vec2 | undefined;
    if (burn) {
      const spot = proj.project(burn.pos);
      const normal = { x: burn.dir.y, y: burn.dir.x }; // screen-space normal (world y is flipped)
      const towardCenter = (half - spot.x) * normal.x + (half - spot.y) * normal.y;
      burnAway = towardCenter >= 0 ? normal : { x: -normal.x, y: -normal.y };
      const tick = nodes.startBurn.glyph as SVGLineElement;
      tick.setAttribute('x1', fmt(spot.x - normal.x * TICK_HALF));
      tick.setAttribute('y1', fmt(spot.y - normal.y * TICK_HALF));
      tick.setAttribute('x2', fmt(spot.x + normal.x * TICK_HALF));
      tick.setAttribute('y2', fmt(spot.y + normal.y * TICK_HALF));
    }
    paintMarker(nodes.startBurn, burn, proj, 'np-burn-tick', 'np-label np-burn-label', () => { /* drawn above */ }, obstacles,
      burnAway, CHAR_W_BURN, path);

    show(nodes.flyby, markers.flyby !== null);
    if (markers.flyby) {
      const spot = proj.project(markers.flyby.pos);
      placeClear(nodes.flyby, markers.flyby.lines, spot, outwardFrom(half, spot), obstacles, CHAR_W_TAG, path);
    } else {
      labelTurns.delete(nodes.flyby);
    }

    const newest = trail[trail.length - 1];
    if (!newest || Math.hypot(ship.x - newest.x, ship.y - newest.y) >= TRAIL_SPACING_FRAC * viewR) {
      trail.push(ship);
      if (trail.length > TRAIL_POINTS) trail.shift();
    }
    setTrail(nodes.trail, trail, shipAt, proj);
    setShip(nodes.ship, nodes.flame, shipAt, state.burn.heading, isThrustOn(state), isGhostFiring(state));

    // The readout row's numbers come through the Telemetry file: damaged, its digits scramble.
    const readouts = plotReadouts(state, pred, plot);
    const scramble = caps.telemetryScramble;
    paintLabel(lowestEl, readouts.lowest, scramblers.lowest.apply(readouts.lowest.text, scramble));
    lowestDriftEl.hidden = readouts.lowestDrift === null;
    const driftText = readouts.lowestDrift ?? '';
    if (lowestDriftEl.textContent !== driftText) lowestDriftEl.textContent = driftText;
    paintLabel(highestEl, readouts.highest, scramblers.highest.apply(readouts.highest.text, scramble));
    paintLabel(rangeEl, readouts.range, scramblers.range.apply(readouts.range.text, scramble));
    paintLabel(statusEl, readouts.status);
  }

  // A touchdown (01-landing §4): `+200 LANDED · LZ-A` floats up from its bracket (from the landing point off-site) and
  // the launch band's ring pulses once.
  const offLanded = on('pod-landed', ({ pod, place, lz, touch, points }) => {
    const state = store.getState();
    const record = state.landing.pods.find((candidate) => candidate.pod === pod);
    const bracket = lz === null ? undefined : state.landing.lzs.find((candidate) => candidate.label === lz);
    const rad = bracket?.centreRad ?? (record && (record.fate.kind === 'down' || record.fate.kind === 'falling') ? record.fate.launch.landingRad : null);
    if (rad === null || rad === undefined) return;
    const text = place === 'lz' ? TOUCHDOWN_FLOAT_TEXT.lz(points, lz ?? '?', touch)
      : place === 'mislanded' ? TOUCHDOWN_FLOAT_TEXT.mislanded(points, lz ?? '?')
        : place === 'off-site' ? TOUCHDOWN_FLOAT_TEXT.offSite(points, touch) : TOUCHDOWN_FLOAT_TEXT.noGo;
    const tone = place === 'lz' ? (touch === 'hard' ? 'hard' : 'good') : place === 'mislanded' ? 'mislanded' : 'off';
    landingLayer.float(text, rad, tone, TOUCHDOWN_FLOAT_MS);
    if (!state.ui.reducedMotion) replayAnimation(nodes.ring, 'pulse');
  });

  // Game ticks paint the live plot. Ticks stop while paused and after a terminal status, so
  // pause, status and firing changes repaint directly (the final frame, a flame that went out).
  const offTick = onGameTick(() => redraw());
  const unsub = store.subscribe(
    (s) => `${s.burn.status}|${s.clock.paused}|${s.burn.firing}|${s.burn.presetAligning}`,
    () => redraw(),
  );
  redraw();

  return () => {
    offTick();
    unsub();
    offReset();
    offLanded();
    landingLayer.clear();
    resizeObserver.disconnect();
  };
}
