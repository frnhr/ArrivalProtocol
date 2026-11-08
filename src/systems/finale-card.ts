// Slice 7a: Track CARD owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.10; review B2): the FINALE
// card's hooks into screens CARD does not own, pure. fuelStarTitle is the FUEL bar's ★ notch's tooltip on the final ship
// (05 §3.7: the notch at 20% also reads SUNSET; the notch's place is STAR_FUEL_PCT, which EMPTY_SHIP_FUEL_PCT equals), or
// null for the notch's own title (components/tools-view/EngineWindow.ts reads it on every paint). The words are FINALE's
// (data/finale-text.ts; CARD asks).
// The FOUNDATION's stub is neutral: null (today's title everywhere).
import type { GameState } from '@state/schema';

export function fuelStarTitle(state: Readonly<GameState>): string | null {
  void state;
  return null;
}
