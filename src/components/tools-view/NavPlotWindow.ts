import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import {
  deriveOrbit, sampleConic, pointAt, periapsisPoint, apoapsisPoint,
  viewMaxRadius, makeProjector,
  type OrbitElements, type PlanetParams, type OrbitRenderOpts, type Vec2,
} from '@/types/orbit';

// Orbital trajectory plot. THIS SLICE renders from hand-fed elements scrubbed by
// dev sliders — no sim, no store reads. `renderOrbit` consumes only OrbitElements
// + PlanetParams, so the future Verlet sim can feed the exact same function
// (derive elements from {x,y,vx,vy} → renderOrbit). The node-cache + attribute
// patching keeps it cheap enough to drive at 20Hz then. All colours are CSS vars
// so the amber→blue memory-mode reskin happens automatically.

const VB = 320;        // svg viewBox is "0 0 320 320"
const MARGIN_PX = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

interface OrbitNodes {
  planet: SVGCircleElement;
  crash: SVGCircleElement;
  atm: SVGCircleElement;
  band: SVGPathElement;
  ghost: SVGPathElement;
  conic: SVGPathElement;
  peri: SVGCircleElement;
  apo: SVGCircleElement;
  ship: SVGCircleElement;
}

// Keyed by svg element so multiple plot instances each keep their own nodes.
const nodeCache = new WeakMap<SVGSVGElement, OrbitNodes>();

function el(tag: 'circle' | 'path', cls: string, attrs: Record<string, string>): SVGElement {
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
  const ship = el('circle', 'np-ship', { r: '4', fill: 'var(--good)', stroke: 'var(--bg)', 'stroke-width': '1' }) as SVGCircleElement;

  const nodes: OrbitNodes = { planet, crash, atm, band, ghost, conic, peri, apo, ship };
  [planet, crash, atm, band, ghost, conic, peri, apo, ship].forEach((n) => svg.appendChild(n));
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

  // Fit to both the true orbit and the ghost so the whole envelope shows.
  const viewMaxR = Math.max(
    viewMaxRadius(orbit, planet),
    ghostEl ? viewMaxRadius(ghostEl, planet) : 0,
  );
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

  // Periapsis pip (always), apoapsis pip (ellipse only), ship at true anomaly.
  const pp = proj.project(periapsisPoint(orbit));
  setCircle(nodes.peri, pp.x, pp.y, 3);
  if (isClosed && ra !== null) {
    nodes.apo.style.display = '';
    const ap = proj.project(apoapsisPoint(orbit, ra));
    setCircle(nodes.apo, ap.x, ap.y, 3);
  } else {
    nodes.apo.style.display = 'none';
  }
  const sp = proj.project(pointAt(orbit, orbit.nu));
  setCircle(nodes.ship, sp.x, sp.y, 4);
}

export function mountNavPlotWindow(_store: Store<GameState>): () => void {
  const svg = document.getElementById('navplotSvg') as SVGSVGElement | null;
  if (!svg) return () => {};

  // Hand-fed fixture for this slice (world units: planet radius = 1).
  const planet: PlanetParams = { R: 1, rAtm: 1.18, rMin: 1.5, rMax: 1.9, mu: 1 };
  const orbit: OrbitElements = { rp: 1.35, e: 0.5, omega: -0.6, nu: 0.8 };
  const opts: OrbitRenderOpts = { showGhost: true, ghostScale: 1.06, ghostDr: 0.06 };

  // --- DEV sliders — removed when the live sim drives this plot ---
  const ecc = document.getElementById('np-ecc') as HTMLInputElement | null;
  const anom = document.getElementById('np-nu') as HTMLInputElement | null;
  const peri = document.getElementById('np-rp') as HTMLInputElement | null;
  const eccVal = document.getElementById('np-ecc-val');
  const anomVal = document.getElementById('np-nu-val');
  const periVal = document.getElementById('np-rp-val');

  const redraw = (): void => {
    if (ecc) orbit.e = Number(ecc.value);
    if (anom) orbit.nu = Number(anom.value);
    if (peri) orbit.rp = Number(peri.value);
    if (eccVal) eccVal.textContent = orbit.e.toFixed(2);
    if (anomVal) anomVal.textContent = orbit.nu.toFixed(2);
    if (periVal) periVal.textContent = orbit.rp.toFixed(2);
    renderOrbit(svg, orbit, planet, opts);
  };

  ecc?.addEventListener('input', redraw);
  anom?.addEventListener('input', redraw);
  peri?.addEventListener('input', redraw);
  redraw();

  return () => {
    ecc?.removeEventListener('input', redraw);
    anom?.removeEventListener('input', redraw);
    peri?.removeEventListener('input', redraw);
  };
}
