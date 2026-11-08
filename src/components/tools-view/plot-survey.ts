// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.14, §6.2): SURVEY's layer on the NAV PLOT, in
// flight and landing on POOR planets, under the landing layer (plot-landing.ts): the swath's translucent wedge from the
// planet's centre under the ship (±swath; twice as wide at v3; no pulse under reduced motion), the mapped rim as a brighter
// stroke over the unmapped rim, the found candidates as dashed brackets with `SITE 4`, the guesses' `?` until known and a
// red `✕` once bad. A click on a bracket selects it in SITES. It paints systems/survey-hud.ts surveyPlotModel.
import type { Projector } from '@/types/orbit';
import type { SurveyPlotModel } from '@systems/survey-hud';

export interface PlotSurveyLayer {
  // `cx`, `cy`: the planet's centre in viewBox units; `planetUnits`: its radius there (as plot-landing's paint).
  paint(model: SurveyPlotModel | null, proj: Projector, cx: number, cy: number, planetUnits: number): void;
  clear(): void;
}

// NavPlotWindow creates it once, right before the landing layer, with the plot's svg and the surface line it goes over.
// FOUNDATION stub: a layer that draws nothing (no nodes are made).
export function createPlotSurveyLayer(svg: SVGSVGElement, below: SVGElement): PlotSurveyLayer {
  void svg;
  void below;
  return {
    paint(model, proj, cx, cy, planetUnits) {
      void model;
      void proj;
      void cx;
      void cy;
      void planetUnits;
    },
    clear() {},
  };
}
