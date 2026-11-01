import type { GameState } from '@state/schema';

// The galaxy map's boot lines (02-map §4's order, steps 2 and 5; slice-3a-plan §1.1 items 7, 12, risk 13): the sleep line
// `> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS` (from ship 2), the receiver line `> RECEIVER: 1 RACK · ROOM 88`
// (a TIGHT ship), and the words they type (data/map-text.ts MAP_TEXT.boot). data/script.ts bootLinePlan places them:
// the sleep line first, the receiver line after the host line. Track GEN owns this file after the foundation.

export type MapBootLineKind = 'sleep' | 'receiver';

// Which map lines this boot types. The classic world types none (its hops have no years, so nothing on its boots moves).
// TODO(3a-GEN): on the arm, 'sleep' on every ship a beam reached (the route's stop has a hop) and 'receiver' on a TIGHT
// ship; the ECC block (`> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP`) joins the 'ecc' line.
export function mapBootLines(state: Readonly<GameState>): MapBootLineKind[] {
  void state;
  return [];
}

// The words of a map boot line. TODO(3a-GEN): rendered from the route's stop (MAP_TEXT.boot.sleep, .receiver).
export function mapBootLineText(kind: MapBootLineKind, state: Readonly<GameState>): string {
  void state;
  throw new Error(`TODO(3a-GEN): the '${kind}' boot line`);
}
