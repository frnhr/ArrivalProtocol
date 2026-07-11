import type { Store } from '@state/store';
import type { GameState, BurnStatus } from '@state/schema';
import { selectSensorConfidence } from '@state/selectors';
import { fmtKm } from '@/utils/format';
import { onGameTick } from '@systems/clock';
import {
  deriveOrbit, sampleConic, pointAt, periapsisPoint, apoapsisPoint,
  makeProjector, elementsFromState,
  type OrbitElements, type PlanetParams, type OrbitRenderOpts, type Vec2,
} from '@/types/orbit';

// Orbital trajectory plot, driven live by the orbit sim. Each game tick it reads the
// 2D truth state, derives the current conic, and patches the SVG; on a terminal it
// paints the frozen final frame. `renderOrbit` consumes only OrbitElements +
// PlanetParams (the sim↔render seam), so the same function served the dev-slider
// fixture in slice 1. Node-cache + attribute patching keeps it cheap at 20Hz. All
// colours are CSS vars so the amber→blue memory-mode reskin happens automatically.

const VB = 320;        // svg viewBox is "0 0 320 320"
const MARGIN_PX = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Two-phase plot scale (see renderOrbit): far out the view fits the ship (it rides the
// edge while the planet grows); once the ship is within the near-field floor the scale
// locks and the ship travels the orbit.
const MIN_VIEW_FACTOR = 1.7;    // near-field floor as a multiple of the target-band outer radius
const SHIP_EDGE_MARGIN = 1.05;  // keeps the far-out ship just inside the plot edge

interface OrbitNodes {
  planet: SVGCircleElement;
  crash: SVGCircleElement;
  atm: SVGCircleElement;
  band: SVGPathElement;
  ghost: SVGPathElement;
  conic: SVGPathElement;
  peri: SVGCircleElement;
  apo: SVGCircleElement;
  prograde: SVGLineElement;
  ship: SVGPolygonElement;
}

// Keyed by svg element so multiple plot instances each keep their own nodes.
const nodeCache = new WeakMap<SVGSVGElement, OrbitNodes>();

function el(tag: 'circle' | 'path' | 'line' | 'polygon', cls: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  node.setAttribute('class', cls);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function build(svg: SVGSVGElement): OrbitNodes {
  // Created back-to-front so later elements paint on top.
  const planet = el('circle', 'np-planet', { fill: 'url(#planetFill)', stroke: 'none' }) as SVGCircleElement;
  const crash = el('circle', 'np-crash', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' }) as SVGCircleElement;
  const atm = el('circle', 'np-atm', { fill: 'none', stroke: 'var(--accent-dim)', 'stroke-width': '1', 'stroke-dasharray': '3 4', 'vector-effect': 'non-scaling-stroke' }) as SVGCircleElement;
  const band = el('path', 'np-band', { fill: 'var(--good)', 'fill-opacity': '0.10', 'fill-rule': 'evenodd', stroke: 'var(--good)', 'stroke-opacity': '0.4', 'stroke-width': '0.75', 'vector-effect': 'non-scaling-stroke' }) as SVGPathElement;
  const ghost = el('path', 'np-ghost', { fill: 'none', stroke: 'var(--accent)', 'stroke-opacity': '0.45', 'stroke-width': '1', 'stroke-dasharray': '2 4', 'vector-effect': 'non-scaling-stroke' }) as SVGPathElement;
  const conic = el('path', 'np-conic', { fill: 'none', stroke: 'var(--accent-bright)', 'stroke-width': '1.4', 'vector-effect': 'non-scaling-stroke' }) as SVGPathElement;
  const peri = el('circle', 'np-peri', { r: '3', fill: 'var(--accent-bright)' }) as SVGCircleElement;
  const apo = el('circle', 'np-apo', { r: '3', fill: 'var(--accent)' }) as SVGCircleElement;
  const prograde = el('line', 'np-prograde', { stroke: 'var(--good)', 'stroke-width': '1.5', 'stroke-dasharray': '2 2', 'vector-effect': 'non-scaling-stroke' }) as SVGLineElement;
  // Ship marker: a triangle whose apex is the nose, so heading reads unambiguously (a plain
  // line could be mistaken for either the nose or the exhaust). Filled green like the old dot.
  const ship = el('polygon', 'np-ship', { fill: 'var(--good)', stroke: 'var(--bg)', 'stroke-width': '1', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }) as SVGPolygonElement;

  const nodes: OrbitNodes = { planet, crash, atm, band, ghost, conic, peri, apo, prograde, ship };
  [planet, crash, atm, band, ghost, conic, peri, apo, prograde, ship].forEach((n) => svg.appendChild(n));
  nodeCache.set(svg, nodes);
  return nodes;
}

function pathFrom(pts: Vec2[], closed: boolean): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i];
    if (pt) d += `L${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
  }
  return closed ? `${d}Z` : d;
}

// Two concentric circle subpaths; with fill-rule:evenodd this fills the ring.
function ringSubpath(cx: number, cy: number, r: number): string {
  const rr = r.toFixed(2);
  return `M${(cx - r).toFixed(2)},${cy.toFixed(2)}a${rr},${rr} 0 1,0 ${(2 * r).toFixed(2)},0a${rr},${rr} 0 1,0 ${(-2 * r).toFixed(2)},0Z`;
}

function setCircle(node: SVGCircleElement, cx: number, cy: number, r: number): void {
  node.setAttribute('cx', cx.toFixed(2));
  node.setAttribute('cy', cy.toFixed(2));
  node.setAttribute('r', r.toFixed(2));
}

// A short reference tick from the ship pointing at angleRad (world frame; SVG y is
// flipped) — used for the prograde marker. Hidden when the angle is undefined.
function setDirTick(node: SVGLineElement, from: Vec2, angleRad: number | undefined, len: number): void {
  if (angleRad === undefined) { node.style.display = 'none'; return; }
  node.style.display = '';
  node.setAttribute('x1', from.x.toFixed(2));
  node.setAttribute('y1', from.y.toFixed(2));
  node.setAttribute('x2', (from.x + len * Math.cos(angleRad)).toFixed(2));
  node.setAttribute('y2', (from.y - len * Math.sin(angleRad)).toFixed(2));
}

// Ship marker triangle: the apex (nose) points along headingRad (world frame; SVG y is
// flipped) and the base trails behind. TIP = 2·BACK puts the centroid on the ship
// position, so the glyph shows location and facing at once. Sized in screen px, so it
// stays legible whether the ship rides the far edge or sits deep in the near view.
function setShipTriangle(node: SVGPolygonElement, center: Vec2, headingRad: number): void {
  const TIP = 9, BACK = 4.5, HALF = 5.5;
  const fx = Math.cos(headingRad), fy = -Math.sin(headingRad);   // forward (screen)
  const px = -fy, py = fx;                                        // forward rotated +90°
  const tip = `${(center.x + fx * TIP).toFixed(2)},${(center.y + fy * TIP).toFixed(2)}`;
  const left = `${(center.x - fx * BACK + px * HALF).toFixed(2)},${(center.y - fy * BACK + py * HALF).toFixed(2)}`;
  const right = `${(center.x - fx * BACK - px * HALF).toFixed(2)},${(center.y - fy * BACK - py * HALF).toFixed(2)}`;
  node.setAttribute('points', `${tip} ${left} ${right}`);
}

export function renderOrbit(
  svg: SVGSVGElement,
  orbit: OrbitElements,
  planet: PlanetParams,
  opts: OrbitRenderOpts,
): void {
  const nodes = nodeCache.get(svg) ?? build(svg);
  const { ra, isClosed } = deriveOrbit(orbit);

  // Ghost / uncertainty conic (stub: offset elements; truth never touched).
  const ghostEl: OrbitElements | null = opts.showGhost
    ? { ...orbit, e: orbit.e * opts.ghostScale, rp: orbit.rp + opts.ghostDr }
    : null;

  // Two-phase scale. FAR: fit the ship — it rides the plot edge while the view zooms
  // in and the planet grows as the ship closes in. NEAR: once the ship is inside the
  // near-field floor (a multiple of the target band), hold that fixed scale and let
  // the ship travel along the orbit. No floor on the planet size — far out it's a
  // sub-pixel dot, exactly to scale.
  const shipPoint = pointAt(orbit, orbit.nu);
  const shipR = Math.hypot(shipPoint.x, shipPoint.y);
  const viewMaxR = Math.max(shipR * SHIP_EDGE_MARGIN, planet.rMax * MIN_VIEW_FACTOR);
  const proj = makeProjector(viewMaxR, VB, MARGIN_PX);
  const half = VB / 2;
  const s = proj.scale;

  // Concentric furniture.
  setCircle(nodes.planet, half, half, planet.R * s);
  setCircle(nodes.crash, half, half, planet.R * s);
  setCircle(nodes.atm, half, half, planet.rAtm * s);
  nodes.band.setAttribute('d', ringSubpath(half, half, planet.rMax * s) + ringSubpath(half, half, planet.rMin * s));

  if (ghostEl) {
    nodes.ghost.style.display = '';
    const g = sampleConic(ghostEl, viewMaxR);
    nodes.ghost.setAttribute('d', pathFrom(g.pts.map(proj.project), g.closed));
  } else {
    nodes.ghost.style.display = 'none';
  }

  // True conic.
  const c = sampleConic(orbit, viewMaxR);
  nodes.conic.setAttribute('d', pathFrom(c.pts.map(proj.project), c.closed));

  // Periapsis pip (always), apoapsis pip (ellipse only, and only when it fits the
  // clamped view — a near-parabolic capture's apoapsis runs off-frame), ship at nu.
  const pp = proj.project(periapsisPoint(orbit));
  setCircle(nodes.peri, pp.x, pp.y, 3);
  if (isClosed && ra !== null && ra <= viewMaxR) {
    nodes.apo.style.display = '';
    const ap = proj.project(apoapsisPoint(orbit, ra));
    setCircle(nodes.apo, ap.x, ap.y, 3);
  } else {
    nodes.apo.style.display = 'none';
  }
  const sp = proj.project(shipPoint);

  // Prograde reference tick (green dashed), then the ship triangle on top pointing along
  // the heading. Falls back to prograde / +x if no heading is supplied (e.g. dev fixture).
  setDirTick(nodes.prograde, sp, opts.progradeRad, 13);
  setShipTriangle(nodes.ship, sp, opts.headingRad ?? opts.progradeRad ?? 0);
}

const STATUS_LABEL: Record<BurnStatus, string> = {
  briefing: 'HOLDING',
  approaching: 'INSERTING',
  inserted: 'INSERTED',
  captured: 'OFF-TGT',
  escaped: 'ESCAPED',
  crashed: 'CRASHED',
};

const STATUS_CLASS: Record<BurnStatus, string> = {
  briefing: '',
  approaching: '',
  inserted: 'good',
  captured: '',
  escaped: 'warn',
  crashed: 'warn',
};

export function mountNavPlotWindow(store: Store<GameState>): () => void {
  const svg = document.getElementById('navplotSvg') as SVGSVGElement | null;
  if (!svg) return () => {};

  const eccVal = document.getElementById('np-ecc-val');
  const periVal = document.getElementById('np-peri-val');
  const apoVal = document.getElementById('np-apo-val');
  const statusVal = document.getElementById('np-status-val');

  function paintReadout(orbit: OrbitElements, planet: PlanetParams, status: BurnStatus): void {
    const { ra, isClosed } = deriveOrbit(orbit);
    if (eccVal) eccVal.textContent = orbit.e.toFixed(3);
    if (periVal) periVal.textContent = fmtKm(orbit.rp - planet.R);
    if (apoVal) apoVal.textContent = isClosed && ra !== null ? fmtKm(ra - planet.R) : '—';
    if (statusVal) {
      statusVal.textContent = STATUS_LABEL[status];
      const cls = STATUS_CLASS[status];
      statusVal.className = cls ? `v ${cls}` : 'v';
    }
  }

  // Sensor-uncertainty span: at confidence c the ghost conic offsets from the
  // predicted one by SPAN·(1−c/100), applied jointly to the eccentricity scale
  // and the periapsis radius (one constant — the two halves of the band must
  // agree on how uncertain the sensors are). Calibrated so the seed confidence
  // (62%) reproduces the original fixed ghost (scale 1.04 / dr 0.04·R); repairs
  // visibly tighten the band, a dead Sensor Interp (15%) leaves it untrustworthy.
  const GHOST_SPAN = 0.105;

  function redraw(): void {
    const state = store.getState();
    const planet = state.level.planet;
    const orbit = elementsFromState(state.orbit, planet.mu);
    // The ghost conic is the sensor-uncertainty envelope, driven live by the
    // Sensor Interp file's health (selector, not the telemetry snapshot — the
    // memoryRev redraw below must see memory changes made while paused).
    const uncertainty = (100 - selectSensorConfidence(state)) / 100;
    const opts: OrbitRenderOpts = {
      showGhost: true,
      ghostScale: 1 + GHOST_SPAN * uncertainty,
      ghostDr: planet.R * GHOST_SPAN * uncertainty,
      headingRad: state.burn.heading,
      progradeRad: Math.atan2(state.orbit.vy, state.orbit.vx),
    };
    renderOrbit(svg!, orbit, planet, opts);
    paintReadout(orbit, planet, state.burn.status);
  }

  // Three redraw triggers:
  //  1. game tick — live update while approaching. Registered here (mountNavPlotWindow
  //     runs AFTER mountOrbitSim in main.ts), so it reads freshly-integrated state.
  //  2. burn.status — paints the FROZEN terminal frame; onGameTick stops firing once
  //     the sim pauses the clock, so without this the captured/escaped/crashed frame
  //     would never be drawn. The sim mutates final geometry before flipping status,
  //     so this reads consistent state.
  //  3. ui.memoryRev — memory ops fired while the clock is paused (repair start
  //     taking Sensor Interp offline, an instant swap) must reshape the ghost
  //     band immediately, not on the next tick after resume.
  const offTick = onGameTick(() => redraw());
  const unsubStatus = store.subscribe((s) => s.burn.status, () => redraw());
  const unsubMemory = store.subscribe((s) => s.ui.memoryRev, () => redraw());

  redraw(); // initial paint of the seed orbit

  return () => {
    offTick();
    unsubStatus();
    unsubMemory();
  };
}
