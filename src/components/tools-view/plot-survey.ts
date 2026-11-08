// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.14, §6.2): SURVEY's layer on the NAV PLOT, in
// flight and landing on POOR planets, under the landing layer (plot-landing.ts): the swath's translucent wedge from the
// planet's centre under the ship (±swath; twice as wide at v3; it breathes, and holds still under reduced motion), the
// footprint it maps on the rim, the mapped rim as a brighter stroke over the dim dotted unmapped rim, the free sites as
// dashed brackets with `SITE 4` (the wreck's `WRECK`, a site known bad in red), and each LZ's `?` until its ground is known
// and a red `✕` once bad (in FLIGHT also the LZ's own thin outline and name, `LZ-B ?`: the landing layer draws LZs only in
// LANDING). A click on a site's bracket selects it in SITES (its nodes carry `data-site`: SitesWindow's document handler).
// It paints systems/survey-hud.ts surveyPlotModel.
import type { Projector, Vec2 } from '@/types/orbit';
import type { SurveyPlotModel, SurveyBracket, SurveyPlotLz, RimArc } from '@systems/survey-hud';
import { svgEl, fmt } from '@components/hud/plot-draw';
import { selectedSite } from './SitesWindow';
import { rimArc, type LabelBox } from './plot-landing';
import { SURVEY_WEDGE_REACH } from '@data/tuning';

const RIM_GAP = 1.0;           // the mapped / unmapped rim's stroke sits this far outside the surface line
const BRACKET_GAP = 0.4;       // as plot-landing's: a site's bracket sits where an LZ's would
const BRACKET_WIDTH = 3.2;     // thinner than an LZ's 4.6, dashed: a place, not a target
const HIT_WIDTH = 9;           // the invisible stroke a click lands on
const LABEL_OUT = 9;
const LABEL_SIDE_COS = 0.35;
const LABEL_LINE_H = 8.5;
const LABEL_CHAR_W = 4.6;
const LABEL_MIN_PLANET = 18;   // below this planet radius (viewBox units, zoomed far out) the sites go unnamed: no room
const GLYPH_IN = 7;            // an LZ's `?` / `✕` sits this far inside the surface, under its centre

function polar(cx: number, cy: number, radius: number, rad: number): Vec2 {
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export interface PlotSurveyLayer {
  // `cx`, `cy`: the planet's centre in viewBox units; `planetUnits`: its radius there (as plot-landing's paint). Returns the
  // boxes of the labels it drew (`SITE 4`), which the plot's other labels keep off.
  paint(model: SurveyPlotModel | null, proj: Projector, cx: number, cy: number, planetUnits: number): LabelBox[];
  clear(): void;
}

interface SiteNodes {
  hit: SVGPathElement;
  arc: SVGPathElement;
  label: SVGTextElement;
}

interface LzNodes {
  outline: SVGPathElement;
  label: SVGTextElement;
  glyph: SVGTextElement;
}

// NavPlotWindow creates it once, right after the landing layer, with the plot's svg and the surface line: nodes put in with
// `below.after(…)` then sit between the surface and the landing layer's (Element.after: the layer made last is the lowest).
export function createPlotSurveyLayer(svg: SVGSVGElement, below: SVGElement): PlotSurveyLayer {
  const root = svgEl('g', 'np-survey');
  const wedge = svgEl('path', 'np-swath');
  const footprint = svgEl('path', 'np-swath-foot');
  const unmappedPath = svgEl('path', 'np-rim-unmapped');
  const mappedPath = svgEl('path', 'np-rim-mapped');
  const sitesGroup = svgEl('g', 'np-sites');
  const lzGroup = svgEl('g', 'np-survey-lzs');
  root.append(wedge, unmappedPath, mappedPath, footprint, sitesGroup, lzGroup);
  below.after(root);
  // Site names go over the plot with the other labels, just under the landing layer's (its LZ names, floats and stamps).
  const labels = svgEl('g', 'np-site-labels');
  const landingLabels = svg.querySelector(':scope > .np-lz-labels');
  if (landingLabels) landingLabels.before(labels);
  else svg.appendChild(labels);

  const sites = new Map<string, SiteNodes>();
  const lzs = new Map<string, LzNodes>();
  const show = (node: SVGElement, visible: boolean): void => { node.style.display = visible ? '' : 'none'; };
  const setCls = (node: SVGElement, cls: string): void => { if (node.getAttribute('class') !== cls) node.setAttribute('class', cls); };
  const setText = (node: SVGTextElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

  function arcsPath(arcs: readonly RimArc[], cx: number, cy: number, radius: number): string {
    return arcs.map((arc) => (arc.toRad - arc.fromRad >= 2 * Math.PI - 1e-9
      // A whole turn as two halves (one SVG arc can't close on itself).
      ? rimArc(cx, cy, radius, arc.fromRad + Math.PI / 2, Math.PI / 2) + rimArc(cx, cy, radius, arc.fromRad + (3 * Math.PI) / 2, Math.PI / 2)
      : rimArc(cx, cy, radius, (arc.fromRad + arc.toRad) / 2, (arc.toRad - arc.fromRad) / 2))).join('');
  }

  // A label just outside the rim at `rad`, anchored to the side it sits on (plot-landing's rule); its box.
  function placeLabel(node: SVGTextElement, text: string, cx: number, cy: number, radius: number, rad: number): LabelBox {
    const at = polar(cx, cy, radius, rad);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchor = cos > LABEL_SIDE_COS ? 'start' : cos < -LABEL_SIDE_COS ? 'end' : 'middle';
    const baseline = sin > LABEL_SIDE_COS ? at.y : sin < -LABEL_SIDE_COS ? at.y + LABEL_LINE_H * 0.7 : at.y + LABEL_LINE_H * 0.35;
    node.setAttribute('x', fmt(at.x));
    node.setAttribute('y', fmt(baseline));
    node.setAttribute('text-anchor', anchor);
    setText(node, text);
    const width = text.length * LABEL_CHAR_W;
    const left = anchor === 'start' ? at.x : anchor === 'end' ? at.x - width : at.x - width / 2;
    return { left, top: baseline - LABEL_LINE_H + 1.5, right: left + width, bottom: baseline + 1.5 };
  }

  function siteNodes(id: string): SiteNodes {
    let found = sites.get(id);
    if (!found) {
      found = { hit: svgEl('path', 'np-site-hit'), arc: svgEl('path', 'np-site'), label: svgEl('text', 'np-label np-site-label') };
      for (const node of [found.hit, found.arc, found.label]) node.dataset.site = id;
      sitesGroup.append(found.arc, found.hit);
      labels.appendChild(found.label);
      sites.set(id, found);
    }
    return found;
  }

  function lzNodes(lz: string): LzNodes {
    let found = lzs.get(lz);
    if (!found) {
      found = { outline: svgEl('path', 'np-survey-lz'), label: svgEl('text', 'np-label np-survey-lz-label'), glyph: svgEl('text', 'np-lz-glyph') };
      found.glyph.setAttribute('text-anchor', 'middle');
      found.glyph.setAttribute('dominant-baseline', 'central');
      lzGroup.append(found.outline, found.glyph);
      labels.appendChild(found.label);
      lzs.set(lz, found);
    }
    return found;
  }

  function prune<T>(map: Map<string, T>, live: ReadonlySet<string>, drop: (nodes: T) => void): void {
    for (const [key, nodes] of map) {
      if (live.has(key)) continue;
      drop(nodes);
      map.delete(key);
    }
  }
  const dropSite = (nodes: SiteNodes): void => { nodes.hit.remove(); nodes.arc.remove(); nodes.label.remove(); };
  const dropLz = (nodes: LzNodes): void => { nodes.outline.remove(); nodes.label.remove(); nodes.glyph.remove(); };

  function clear(): void {
    prune(sites, new Set(), dropSite);
    prune(lzs, new Set(), dropLz);
    show(root, false);
  }

  function paintSite(bracket: SurveyBracket, cx: number, cy: number, planetUnits: number, named: boolean, boxes: LabelBox[]): void {
    const nodes = siteNodes(bracket.site);
    const radius = planetUnits + BRACKET_GAP + BRACKET_WIDTH / 2;
    const d = rimArc(cx, cy, radius, bracket.centreRad, Math.max(bracket.halfWidthRad, 0.02));
    nodes.arc.setAttribute('d', d);
    nodes.arc.setAttribute('stroke-width', fmt(BRACKET_WIDTH));
    nodes.hit.setAttribute('d', d);
    nodes.hit.setAttribute('stroke-width', fmt(HIT_WIDTH));
    const picked = selectedSite() === bracket.site;
    setCls(nodes.arc, `np-site look-${bracket.look}${picked ? ' selected' : ''}`);
    setCls(nodes.label, `np-label np-site-label look-${bracket.look}${picked ? ' selected' : ''}`);
    if (!named) { show(nodes.label, false); return; }
    const box = placeLabel(nodes.label, bracket.label, cx, cy, planetUnits + BRACKET_WIDTH + LABEL_OUT, bracket.centreRad);
    // Two names that would meet: the later one (rim order) goes unnamed, its bracket still drawn and clickable.
    const clash = boxes.some((other) => overlaps(other, box));
    show(nodes.label, !clash);
    if (!clash) boxes.push(box);
  }

  function paintLz(mark: SurveyPlotLz, cx: number, cy: number, planetUnits: number, boxes: LabelBox[]): void {
    const nodes = lzNodes(mark.lz);
    // FLIGHT: the LZ's own thin outline and name (`LZ-B ?`), where the landing layer will draw its bracket at ORBIT LOCK.
    show(nodes.outline, mark.label !== null);
    show(nodes.label, mark.label !== null);
    if (mark.label !== null) {
      nodes.outline.setAttribute('d', rimArc(cx, cy, planetUnits + BRACKET_GAP + 2.3, mark.centreRad, mark.halfWidthRad));
      setCls(nodes.outline, `np-survey-lz${mark.bad ? ' bad' : ''}`);
      setCls(nodes.label, `np-label np-survey-lz-label${mark.bad ? ' bad' : ''}`);
      const box = placeLabel(nodes.label, mark.label, cx, cy, planetUnits + 4.6 + LABEL_OUT, mark.centreRad);
      boxes.push(box);
    }
    // The ground's glyph inside the planet under the LZ: `?` dim, `✕` red (survey.css flashes it once as it turns bad).
    show(nodes.glyph, mark.glyph !== null && planetUnits > GLYPH_IN + 3);
    if (mark.glyph !== null) {
      const at = polar(cx, cy, planetUnits - GLYPH_IN, mark.centreRad);
      nodes.glyph.setAttribute('x', fmt(at.x));
      nodes.glyph.setAttribute('y', fmt(at.y));
      setText(nodes.glyph, mark.glyph);
      setCls(nodes.glyph, `np-lz-glyph${mark.bad ? ' bad' : ''}`);
    }
  }

  function paint(model: SurveyPlotModel | null, proj: Projector, cx: number, cy: number, planetUnits: number): LabelBox[] {
    void proj;
    if (model === null) {
      if (sites.size > 0 || lzs.size > 0 || root.style.display !== 'none') clear();
      return [];
    }
    show(root, true);
    // The wedge from the centre to past the rim, and the footprint it maps on the rim.
    show(wedge, model.wedge !== null);
    show(footprint, model.wedge !== null);
    if (model.wedge !== null) {
      const { centreRad, halfRad } = model.wedge;
      const reach = planetUnits * (1 + SURVEY_WEDGE_REACH);
      const from = polar(cx, cy, reach, centreRad - halfRad);
      const to = polar(cx, cy, reach, centreRad + halfRad);
      wedge.setAttribute('d', `M${fmt(cx)},${fmt(cy)}L${fmt(from.x)},${fmt(from.y)}A${fmt(reach)},${fmt(reach)} 0 0,0 ${fmt(to.x)},${fmt(to.y)}Z`);
      footprint.setAttribute('d', rimArc(cx, cy, planetUnits + RIM_GAP, centreRad, halfRad));
    }
    unmappedPath.setAttribute('d', arcsPath(model.unmapped, cx, cy, planetUnits + RIM_GAP));
    mappedPath.setAttribute('d', arcsPath(model.mapped, cx, cy, planetUnits + RIM_GAP));

    const boxes: LabelBox[] = [];
    prune(lzs, new Set(model.lzs.map((mark) => mark.lz)), dropLz);
    for (const mark of model.lzs) paintLz(mark, cx, cy, planetUnits, boxes);
    prune(sites, new Set(model.brackets.map((bracket) => bracket.site)), dropSite);
    const named = planetUnits >= LABEL_MIN_PLANET;
    for (const bracket of model.brackets) paintSite(bracket, cx, cy, planetUnits, named, boxes);
    return boxes;
  }

  return { paint, clear };
}
