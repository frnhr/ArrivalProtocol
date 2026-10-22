// Hazard zones (§6.8, §9 WP9): places in space where the physical layer reaches into the mind. A ship's
// data names them (ShipDef.zones, ZoneDef); at the ship's start they are resolved into the world frame for
// this run (systems/zones.ts resolveZones: the debris cloud's centre on the arrival path, its rack) and
// live in LevelState.zones, immutable for the flight.
//
// • Debris: a circle in the plane. The first time the TRUE path enters it, every file with blocks in its
//   rack is hit once (25 × its share of blocks in the rack). The NAV PLOT names the rack long before.
// • Belt: an annulus around the planet. While the ship is inside it, the files in its racks take random
//   hits (−8, about one every 200 game seconds); a locked orbit that clips it keeps taking them.

import type { Vec2 } from '@/types/orbit';

// Where a debris cloud's centre is, as ship data says it: on the UNPERTURBED arrival path (the hyperbola
// the ship arrives on, before any burn) at this distance from the planet's centre, on the way in. A kid
// who never touches the throttle flies straight through it; a correction moves the path off it.
interface InboundCentre {
  onInboundAtR: number;
}

interface DebrisZoneDef {
  kind: 'debris';
  id: string;
  centre: InboundCentre;
  r: number;                     // km
  // The rack it hits on the written (tutorial) run, and the racks a later run draws it from (seeded).
  rack: string;
  laterRacks: readonly string[];
}

interface BeltZoneDef {
  kind: 'belt';
  id: string;
  rIn: number;                   // km from the planet's centre
  rOut: number;
  racks: readonly string[];
}

export type ZoneDef = DebrisZoneDef | BeltZoneDef;

// Resolved for one flight (LevelState.zones).
export interface DebrisZone {
  kind: 'debris';
  id: string;
  centre: Vec2;                  // world km
  r: number;
  rack: string;
}

export interface BeltZone {
  kind: 'belt';
  id: string;
  rIn: number;
  rOut: number;
  racks: readonly string[];
}

export type Zone = DebrisZone | BeltZone;

// The racks a zone's effect lands on.
export function zoneRacks(zone: Zone): readonly string[] {
  return zone.kind === 'debris' ? [zone.rack] : zone.racks;
}

// What the predicted path does with one zone (predict.ts Prediction.zoneHits): the NAV PLOT's label, the
// strip's upcoming event, pace and SKIP read it. Times are game seconds after the prediction was made.
export interface ZoneHit {
  zoneId: string;
  kind: Zone['kind'];
  racks: readonly string[];
  // A debris cloud that has already hit (it is one-shot): no more entry ahead, nothing to warn about.
  spent: boolean;
  insideNow: boolean;
  enterInSec: number | null;    // the first entry along the drawn path; null when it never enters
  exitInSec: number | null;     // the first exit after that entry (or from inside now); null: still inside at the end
  insideSec: number;            // game seconds inside along the whole drawn path
  closestInSec: number | null;  // debris: where the path passes nearest the centre (HIT?'s countdown)
  missKm: number;               // debris: the nearest pass's distance minus the radius (≤ 0: it enters); belt 0
  expectedHits: number;         // debris 1 when it enters, else 0; belt: insideSec / BELT_HIT_MEAN_SEC
  // Debris the path runs into: would the strip's ▼ correction (IN on a path too wide), started now, take the
  // path off it, with a margin (predict.ts debrisDodge)? null when no correction applies (no thrust, ▼ in the
  // ring, past ▼) or the path misses anyway.
  correctionClears: boolean | null;
  // While it does: game seconds (from the prediction) until the last moment a correction started then still
  // dodges it (the strip counts it down: `· 0:40 to dodge DEBRIS C`); null otherwise.
  dodgeInSec: number | null;
}

// The one rack a debris cloud hits (a debris zone names exactly one: DebrisZoneDef.rack). The strip's lines put it in
// `DEBRIS HITS RACK C` and count its blocks, so anything else (a belt, a cloud with no rack or two) throws here
// rather than reading as `RACK BC`.
export function debrisRack(hit: ZoneHit): string {
  const rack = hit.racks[0];
  if (hit.kind !== 'debris' || hit.racks.length !== 1 || rack === undefined) {
    throw new Error(`debrisRack: ${hit.zoneId} is a ${hit.kind} with racks [${hit.racks.join(', ')}], not a debris cloud on one rack`);
  }
  return rack;
}

// What the kid's instruments say a zone will do (WP9 part 2): the NAV PLOT's glyph and label, the MIND's rack
// tag and the forecast moments (flight-events) all read this one verdict, so they can never disagree.
// • hit: the drawn path enters it (or is inside it now);
// • clear: the drawn path misses it;
// • unknown: PATH UNCERTAIN (a blind sensor can't tell; the cloud is mapped, the path is not);
// • spent: a debris cloud that already hit (one-shot).
export type ZoneVerdict = 'hit' | 'clear' | 'unknown' | 'spent';

export function zoneVerdict(hit: ZoneHit, blind: boolean): ZoneVerdict {
  if (hit.spent) return 'spent';
  if (blind) return 'unknown';
  return hit.enterInSec !== null || hit.insideNow ? 'hit' : 'clear';
}

// A rack a hazard zone is known to hit: the MIND's red rack tag (systems/flight-hud.ts knownHitRacks, a 'hit' verdict).
// The MOVE preview says so over a spot there instead of SAFE (final review: on LAST LIGHT it called rack A SAFE with the
// belt coming for racks A–B).
export interface RackHazard {
  rack: string;
  kind: Zone['kind'];
}

// The racks a zone names, as a kid reads them: `RACK C`, `RACKS A–B` (neighbours), `RACKS B, D`.
export function racksText(racks: readonly string[]): string {
  if (racks.length === 0) throw new Error('racksText: a zone with no racks');
  if (racks.length === 1) return `RACK ${racks[0]}`;
  const sorted = [...racks].sort();
  const neighbours = sorted.every((rack, i) => i === 0 || rack.charCodeAt(0) === sorted[i - 1]!.charCodeAt(0) + 1);
  return neighbours ? `RACKS ${sorted[0]}–${sorted[sorted.length - 1]}` : `RACKS ${sorted.join(', ')}`;
}

// One run of the drawn path inside a zone (predict.ts Prediction.hazardSpans): indices into its points,
// both ends included, overlaid on the path's colour spans (the NAV PLOT hatches it red).
export interface HazardSpan {
  zoneId: string;
  from: number;
  to: number;
}
