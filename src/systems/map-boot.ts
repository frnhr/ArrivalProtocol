import type { GameState } from '@state/schema';
import type { ArrivalDelivery } from '@/types/repo';
import { MAP_TEXT } from '@data/map-text';
import { REPO_TEXT, REPO_FILE_TEXT } from '@data/repo-text';
import { DELIVERY_BOOT_LINES_MAX } from '@data/tuning';
import { layoutFor } from '@data/memory';
import { currentStop } from '@systems/map-streams';
import { patchInstalls } from '@systems/repository';

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

// --- Phase 3 slice 3b: the deliveries' boot lines (02 §4 step 6; slice-3b-plan §1.1 item 12, §2.3 step 5) ----------------
// One `> DELIVERY: mv (arrived 2337)` line per delivery, oldest first (the arrival report's order); a patch says what it
// upgraded; beyond DELIVERY_BOOT_LINES_MAX files the last line folds the rest (`> DELIVERY: 3 MORE · cp, swap, rm …`).
// data/script.ts bootLinePlan places one 'delivery' line per group, after the ship's own arrival damage and before the
// charge; bootLine renders group `ordinal`; systems/delivery-boot.ts receiveDeliveryAtBoot unpacks the same group as it is
// said. Track REPO owns these after the foundation (the words are repo-text's, Track UI's).

// The arrival's deliveries grouped by the boot line that says them (empty off the arm and on a fresh unit's boot), in the
// arrival's order (systems/run.ts: the REPAIR v2 patch first, then oldest first). A patch always has a line of its own,
// never the folded one (it says what it upgraded, and it installs right after REPAIR's renewal at the first line): the
// singles are every patch, then the oldest other files while lines are left, and the rest fold into the last line.
export function deliveryBootLines(state: Readonly<GameState>): ArrivalDelivery[][] {
  const deliveries = state.run.map.world === 'arm' ? state.run.arrival?.deliveries ?? [] : [];
  if (deliveries.length <= DELIVERY_BOOT_LINES_MAX) return deliveries.map((delivery) => [delivery]);
  const patches = deliveries.filter((delivery) => delivery.file === 'repair-v2');
  const others = deliveries.filter((delivery) => delivery.file !== 'repair-v2');
  const singles = Math.max(0, DELIVERY_BOOT_LINES_MAX - 1 - patches.length);
  const folded = others.slice(singles);
  return [...patches.map((delivery) => [delivery]), ...others.slice(0, singles).map((delivery) => [delivery]), ...(folded.length > 0 ? [folded] : [])];
}

// The words of delivery line `ordinal`.
export function deliveryBootLineText(state: Readonly<GameState>, ordinal: number): string {
  const group = deliveryBootLines(state)[ordinal];
  if (group === undefined || group.length === 0) throw new Error(`deliveryBootLineText: no delivery line ${ordinal} at this boot`);
  if (group.length === 1) {
    const delivery = group[0]!;
    const word = REPO_FILE_TEXT[delivery.file].boot;
    // A broken patch installs nothing, so its line makes no claim (UI's words for it are requested: REPO_TEXT.boot.patch's
    // `· EVERY REPAIR → v2` is only for a patch that installs).
    const installs = delivery.file === 'repair-v2' && state.run.arrival !== null && patchInstalls(state.run.arrival, delivery);
    return installs ? REPO_TEXT.boot.patch(word, delivery.arrivedYear) : REPO_TEXT.boot.delivery(word, delivery.arrivedYear);
  }
  const years = group.map((delivery) => delivery.arrivedYear);
  return REPO_TEXT.boot.folded(group.map((delivery) => REPO_FILE_TEXT[delivery.file].boot), Math.min(...years), Math.max(...years));
}
