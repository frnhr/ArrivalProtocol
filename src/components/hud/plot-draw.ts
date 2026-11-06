// Slice 4: Track FLIGHT owns this file (docs/phase3/impl/slice-4-plan.md §5.2): the LOCK bracket and the ghost. Others
// ask by message.
import type { Prediction } from '@systems/predict';
import type { Projector } from '@/types/orbit';

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
