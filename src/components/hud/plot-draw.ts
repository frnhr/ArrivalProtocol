// Slice 4: Track FLIGHT owns this file (docs/phase3/impl/slice-4-plan.md §5.2): the LOCK bracket and the ghost. Others
// ask by message.
import type { Prediction } from '@systems/predict';
import type { Projector, Vec2 } from '@/types/orbit';

// SVG building blocks shared by the NAV PLOT (components/tools-view/NavPlotWindow) and the
// mini-HUD's plot (components/hud/MiniHud): the same path, coloured the same way, at two sizes.

export const SVG_NS = 'http://www.w3.org/2000/svg';

type SvgTag = 'circle' | 'path' | 'line' | 'polygon' | 'text' | 'textPath' | 'g' | 'pattern' | 'rect';

export function svgEl<K extends SvgTag>(tag: K, cls: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (cls) node.setAttribute('class', cls);
  return node;
}

export function fmt(value: number): string {
  return value.toFixed(2);
}

export function setCircle(node: SVGCircleElement, cx: number, cy: number, radius: number): void {
  node.setAttribute('cx', fmt(cx));
  node.setAttribute('cy', fmt(cy));
  node.setAttribute('r', fmt(Math.max(0, radius)));
}

// One circle as a closed path (two arcs).
export function circlePath(cx: number, cy: number, radius: number): string {
  const radiusText = fmt(radius);
  return `M${fmt(cx - radius)},${fmt(cy)}a${radiusText},${radiusText} 0 1,0 ${fmt(2 * radius)},0`
    + `a${radiusText},${radiusText} 0 1,0 ${fmt(-2 * radius)},0Z`;
}

// Two concentric circle subpaths; with fill-rule:evenodd this fills the ring.
export function annulus(cx: number, cy: number, outer: number, inner: number): string {
  return circlePath(cx, cy, outer) + circlePath(cx, cy, inner);
}

// The drawn path's runs through hazard zones (WP9, Prediction.hazardSpans) as one `d`: the plot hatches it red
// over the line's own colour, so the part of the path that flies through the cloud is unmistakable.
export function hazardPath(pred: Prediction, proj: Projector): string {
  let pathData = '';
  for (const span of pred.hazardSpans) {
    for (let i = span.from; i <= span.to; i++) {
      const point = pred.points[i];
      if (!point) throw new Error(`plot: hazard span of ${span.zoneId} points past the path (${i})`);
      const screen = proj.project(point);
      pathData += `${i === span.from ? 'M' : 'L'}${fmt(screen.x)},${fmt(screen.y)}`;
    }
  }
  return pathData;
}

interface ColouredPaths {
  flyby: string;
  green: string;
  impact: string;
  // The whole path as one line, whatever its colours: the ≈ fuzz band and the grey PATH
  // UNCERTAIN band are drawn along it.
  whole: string;
}

// One `d` string per colour: each span becomes its own subpath, so neighbouring spans of
// different colours meet exactly at their shared ring-crossing point.
export function pathsByColour(pred: Prediction, proj: Projector): ColouredPaths {
  const out: ColouredPaths = { flyby: '', green: '', impact: '', whole: '' };
  for (const span of pred.spans) {
    let pathData = '';
    for (let i = span.from; i <= span.to; i++) {
      const point = pred.points[i];
      if (!point) throw new Error(`plot: span ${span.kind} points past the path (${i})`);
      const screen = proj.project(point);
      pathData += `${i === span.from ? 'M' : 'L'}${fmt(screen.x)},${fmt(screen.y)}`;
    }
    if (span.kind === 'impact') out.impact += pathData;
    else if (span.kind === 'in-ring') out.green += pathData;
    else out.flyby += pathData;
    out.whole += pathData;
  }
  return out;
}

// The width of a band drawn as a stroke along the path, in viewBox units: ±fuzzKm on each side,
// at least ±minUnits so it never hides under the line itself.
export function bandWidth(fuzzKm: number, proj: Projector, minUnits: number): number {
  return 2 * Math.max(minUnits, fuzzKm * proj.scale);
}

// --- Slice 4 (Track FLIGHT): AUTOBURN's marks ---------------------------------------------------------------------------

// The run of the drawn path between `fromInSec` and `toInSec` game seconds from `nowTSec` (the LOCK bracket, flight-hud
// lockBracket), as one `d`, plus its first point (where the LOCK label goes); null when no drawn point falls inside it.
// The path's times are game s after pred.asOfTSec.
export function pathRun(
  pred: Prediction, proj: Projector, nowTSec: number, fromInSec: number, toInSec: number,
): { d: string; start: Vec2 } | null {
  const since = nowTSec - pred.asOfTSec;
  let pathData = '';
  let start: Vec2 | null = null;
  for (let i = 0; i < pred.points.length; i++) {
    const inSec = (pred.times[i] ?? 0) - since;
    if (inSec < fromInSec || inSec > toInSec) continue;
    const point = pred.points[i];
    if (!point) throw new Error(`plot: path point ${i} missing`);
    const screen = proj.project(point);
    pathData += `${start === null ? 'M' : 'L'}${fmt(screen.x)},${fmt(screen.y)}`;
    start ??= screen;
  }
  return start === null ? null : { d: pathData, start };
}

// AUTOBURN's dashed target (flight-hud autoGhost): the conic with these apsides and ▼ toward `omega`, the planet at its
// focus, as one closed `d` of GHOST_SAMPLES points.
const GHOST_SAMPLES = 120;

export function ghostLoop(rpKm: number, raKm: number, omega: number, proj: Projector): string {
  const e = (raKm - rpKm) / (raKm + rpKm);
  const semiLatus = rpKm * (1 + e);
  let pathData = '';
  for (let i = 0; i <= GHOST_SAMPLES; i++) {
    const nu = (2 * Math.PI * i) / GHOST_SAMPLES;
    const radius = semiLatus / (1 + e * Math.cos(nu));
    const screen = proj.project({ x: radius * Math.cos(nu + omega), y: radius * Math.sin(nu + omega) });
    pathData += `${i === 0 ? 'M' : 'L'}${fmt(screen.x)},${fmt(screen.y)}`;
  }
  return `${pathData}Z`;
}
