import type { GameState } from '@state/schema';
import { MAP_TEXT } from '@data/map-text';
import { layoutFor } from '@data/memory';
import { currentStop } from '@systems/map-streams';

// The galaxy map's boot lines (02-map §4's order, steps 2 and 5; slice-3a-plan §1.1 items 7, 12, risk 13): the sleep line
// `> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS` (from ship 2), the receiver line `> RECEIVER: 1 RACK · ROOM 88`
// (a TIGHT ship), the ECC block `> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP` (the arrival's eccCorrected), and the
// words they type (data/map-text.ts MAP_TEXT.boot). data/script.ts bootLinePlan places them: the sleep line first, the
// receiver line after the host line, the ECC block before the hits line. Track GEN owns this file (its conditions and
// words) after the foundation.

export type MapBootLineKind = 'sleep' | 'receiver' | 'ecc-sleep';

// The hop that brought the unit to this ship, on the arm (null on a first ship and on the classic world, whose hops are
// fixtures with no years: always switch on `world` before currentStop).
function arrivalHop(state: Readonly<GameState>) {
  if (state.run.map.world !== 'arm') return null;
  return currentStop(state.run).hop;
}

// Which map lines this boot types. The classic world's hops have no years, so ECC corrects nothing and nothing here shows
// on its boots. On the arm: 'sleep' on every ship a beam reached (the route's stop has a hop; the unit slept from arrival
// to approach), 'receiver' on a TIGHT ship (a small ship has a small receiver: the room is the first thing it says), and
// 'ecc-sleep' when ECC corrected anything.
export function mapBootLines(state: Readonly<GameState>): MapBootLineKind[] {
  const lines: MapBootLineKind[] = [];
  const hop = arrivalHop(state);
  if (hop !== null && state.run.arrival !== null) lines.push('sleep');
  if (state.run.map.world === 'arm' && state.level.memoryClass === 'TIGHT') lines.push('receiver');
  const corrected = state.run.arrival?.eccCorrected ?? 0;
  if (corrected > 0) lines.push('ecc-sleep');
  return lines;
}

// The words of a map boot line.
export function mapBootLineText(kind: MapBootLineKind, state: Readonly<GameState>): string {
  switch (kind) {
    case 'ecc-sleep': {
      const corrected = state.run.arrival?.eccCorrected ?? 0;
      if (corrected <= 0) throw new Error('mapBootLineText: an ECC block with nothing corrected');
      return MAP_TEXT.boot.ecc(corrected);
    }
    case 'sleep': {
      const hop = arrivalHop(state);
      if (hop === null) throw new Error('mapBootLineText: a sleep line on a ship no beam reached');
      return MAP_TEXT.boot.sleep(state.level.shipName, hop.arriveYear, hop.approachYear);
    }
    case 'receiver': {
      const layout = layoutFor(state.level.memoryClass);
      return MAP_TEXT.boot.receiver(layout.racks.filter((rack) => rack === 'E' || rack === 'F').length, layout.roomForUnit);
    }
  }
}

// The overflow line on the arm (01 §3.16: `> CHARGE OVERFLOW · 26 LOST · NO ROOM ON WAYFARER`): phase 2's line names the
// ship whose room it was. data/script.ts's 'overflow' line reads it on the arm (Track DESK's patch; the classic world keeps
// phase 2's words).
export function mapOverflowLineText(state: Readonly<GameState>): string {
  const lost = state.run.arrival?.chargeOverflowLost ?? 0;
  if (lost <= 0) throw new Error('mapOverflowLineText: no charge overflowed');
  return MAP_TEXT.boot.overflow(lost, state.level.shipName);
}
