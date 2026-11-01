import type { GameState } from '@state/schema';
import { MAP_TEXT } from '@data/map-text';

// The galaxy map's boot lines (02-map §4's order, steps 2 and 5; slice-3a-plan §1.1 items 7, 12, risk 13): the sleep line
// `> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS` (from ship 2), the receiver line `> RECEIVER: 1 RACK · ROOM 88`
// (a TIGHT ship), the ECC block `> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP` (the arrival's eccCorrected), and the
// words they type (data/map-text.ts MAP_TEXT.boot). data/script.ts bootLinePlan places them: the sleep line first, the
// receiver line after the host line, the ECC block before the hits line. Track GEN owns this file (its conditions and
// words) after the foundation.

export type MapBootLineKind = 'sleep' | 'receiver' | 'ecc-sleep';

// Which map lines this boot types. The classic world's hops have no years, so ECC corrects nothing and nothing here
// shows on its boots. TODO(3a-GEN): on the arm, 'sleep' on every ship a beam reached (the route's stop has a hop) and
// 'receiver' on a TIGHT ship.
export function mapBootLines(state: Readonly<GameState>): MapBootLineKind[] {
  const corrected = state.run.arrival?.eccCorrected ?? 0;
  return corrected > 0 ? ['ecc-sleep'] : [];
}

// The words of a map boot line. TODO(3a-GEN): 'sleep' and 'receiver' from the route's stop (MAP_TEXT.boot.sleep,
// .receiver).
export function mapBootLineText(kind: MapBootLineKind, state: Readonly<GameState>): string {
  if (kind === 'ecc-sleep') {
    const corrected = state.run.arrival?.eccCorrected ?? 0;
    if (corrected <= 0) throw new Error('mapBootLineText: an ECC block with nothing corrected');
    return MAP_TEXT.boot.ecc(corrected);
  }
  throw new Error(`TODO(3a-GEN): the '${kind}' boot line`);
}
