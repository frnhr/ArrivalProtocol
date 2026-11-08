// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.7, §5; built in full by the FOUNDATION).
// A POOR planet's sites (01-landing §3.13, §3.15; plan R2–R4, R9), pure: CONTROL's guesses (the LZs 3a rolled, one of them
// on bad ground), one guaranteed FLAT site per LZ, and SURVEY_EXTRA_SITES extras (one of them, sometimes, the story's
// wreck), placed round the rim. Drawn from the ship's own 'survey' stream (state/initial.ts createShipSlices:
// shipRng(run, slot, 'survey')), so a ship has the same sites whatever route led to it, on a resumed BEAM and next run;
// nothing is stored on the ArmShip. Imports only data, types and systems/rng (tests/unit/support/import-guard's rule).
import type { ShipLandingDef, LzWidth, LzGround, NoGoArcDef } from '@/types/landing';
import type { SurveySite, SiteKind, BadGround } from '@/types/survey';
import type { Rng } from '@systems/rng';
import {
  LZ_WIDTH_KM, LZ_MIN_GAP_DEG, NO_GO_EDGE_GAP_MIN_KM, POOR_BAD_GUESSES, POOR_EXTRA_BAD_GUESS_ODDS, BAD_GROUND_WET_SHARE,
  WET_WIDTH_FACTOR, SURVEY_EXTRA_SITES, GUARANTEED_SITE_ROOM_SPARE_PODS, GUARANTEED_SITE_WIDTHS, EXTRA_SITE_GROUND_ODDS,
  EXTRA_SITE_WIDTHS, EXTRA_SITE_ROOM_SPARE_PODS, WRECK_SITE_ODDS, SITE_PLACE_TRIES,
} from '@data/tuning';

const TAU = 2 * Math.PI;
const TO_RAD = Math.PI / 180;
// Placement and its check meet at the gap's edge: a hair of float slack, far under any width a kid can see.
const EDGE_SLACK_RAD = 1e-9;

// The letter of an LZ by its index (LZ-A is 0), as the landing roller labels them.
export const lzLetter = (index: number): string => String.fromCharCode(65 + index);
export const guessSiteId = (index: number): string => `guess-${lzLetter(index)}`;

// A site's half-width over the planet's radius: its class's, and a WET site's a third narrower (R4).
function widthKmOf(width: LzWidth, ground: LzGround): number {
  return ground === 'wet' ? LZ_WIDTH_KM[width] * WET_WIDTH_FACTOR : LZ_WIDTH_KM[width];
}
const classHalfRad = (width: LzWidth, planetR: number): number => LZ_WIDTH_KM[width] / 2 / planetR;
const wrapRad = (rad: number): number => ((rad % TAU) + TAU) % TAU;
// The unsigned angle between two angles, 0..π.
function apartRad(a: number, b: number): number {
  const apart = Math.abs(wrapRad(a) - wrapRad(b));
  return Math.min(apart, TAU - apart);
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new Error('survey-sites: picked from an empty list');
  return item;
}

function badGround(rng: Rng): BadGround {
  return rng() < BAD_GROUND_WET_SHARE ? 'wet' : 'rocky';
}

function extraGround(rng: Rng): LzGround {
  const roll = rng();
  if (roll < EXTRA_SITE_GROUND_ODDS.flat) return 'flat';
  return roll < EXTRA_SITE_GROUND_ODDS.flat + EXTRA_SITE_GROUND_ODDS.rocky ? 'rocky' : 'wet';
}

// One site as the roller makes it: everything but its place and its number, which placement and numbering give.
interface Draft {
  kind: SiteKind;
  width: LzWidth;
  roomPods: number;
  ground: LzGround;
}

function siteOf(draft: Readonly<Draft>, id: string, number: number, centreRad: number, planetR: number): SurveySite {
  const widthKm = widthKmOf(draft.width, draft.ground);
  return {
    id, kind: draft.kind, number, centreRad, halfWidthRad: widthKm / 2 / planetR, widthKm, width: draft.width,
    roomPods: draft.roomPods, ground: draft.ground, found: false, groundKnown: false,
  };
}

// The centres a new site of class half-width `half` may take: the rim less, round every placed site, its half plus `half`
// plus LZ_MIN_GAP_DEG (edge to edge, by class width), and round every no-go arc its half plus `half` plus
// NO_GO_EDGE_GAP_MIN_KM. As [from, to] spans in [0, 2π), sorted.
function freeSpans(placed: readonly { centreRad: number; half: number }[], noGo: readonly NoGoArcDef[], half: number, planetR: number): [number, number][] {
  const gap = LZ_MIN_GAP_DEG * TO_RAD;
  const clear = NO_GO_EDGE_GAP_MIN_KM / planetR;
  const blocked: [number, number][] = [];
  const block = (centre: number, reach: number): void => {
    const from = wrapRad(centre - reach);
    const to = from + 2 * reach;
    if (to <= TAU) blocked.push([from, to]);
    else blocked.push([from, TAU], [0, to - TAU]);
  };
  for (const site of placed) block(site.centreRad, site.half + half + gap + EDGE_SLACK_RAD);
  for (const arc of noGo) block(arc.centreDeg * TO_RAD, (arc.widthDeg / 2) * TO_RAD + half + clear + EDGE_SLACK_RAD);
  blocked.sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let at = 0;
  for (const [from, to] of blocked) {
    if (from > at) free.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < TAU) free.push([at, TAU]);
  return free;
}

// A uniform centre in the free spans (one draw: the same law as rejection sampling over the rim, with no attempt limit), or
// null when the rim has no room left (no draw is made then).
function placeOn(free: readonly [number, number][], rng: Rng): number | null {
  const total = free.reduce((sum, [from, to]) => sum + (to - from), 0);
  if (!(total > 0)) return null;
  let left = rng() * total;
  for (const [from, to] of free) {
    // Review m1's nit: `from + left` may round up to `to` (2π on the last span); kept below it.
    if (left < to - from) return Math.min(from + left, to - (to - from) * Number.EPSILON);
    left -= to - from;
  }
  // Float slack in the running sum: the last span's start, which is free.
  return free.at(-1)![0];
}

// Step 5 once: every non-guess site placed in draw order round the guesses, or null when a site finds no room (greedy
// sequential placement can jam: about 1 roll in 100,000, on 4-LZ planets).
function placeAll(guesses: readonly SurveySite[], drafts: readonly Draft[], noGo: readonly NoGoArcDef[], planetR: number, rng: Rng): number[] | null {
  const placed = guesses.map((site) => ({ centreRad: site.centreRad, half: classHalfRad(site.width, planetR) }));
  const centres: number[] = [];
  for (const draft of drafts) {
    const half = classHalfRad(draft.width, planetR);
    const centreRad = placeOn(freeSpans(placed, noGo, half, planetR), rng);
    if (centreRad === null) return null;
    placed.push({ centreRad, half });
    centres.push(centreRad);
  }
  return centres;
}

// The planet's sites (R2–R4, R9), in the plan's draw order, so a later change to one step moves no earlier draw:
// 1. the bad guess: its LZ (uniform), ROCKY or WET; then each other guess's extra-bad draw (POOR_EXTRA_BAD_GUESS_ODDS and a
//    ground, both always drawn, so raising the odds moves no other roll);
// 2. the guesses: one per LZ at its centre, ROOM its count, its class (narrowed if WET);
// 3. one guaranteed FLAT site per LZ in label order: a width from GUARANTEED_SITE_WIDTHS, ROOM its count + 0..2;
// 4. SURVEY_EXTRA_SITES extras (ground, width, ROOM each), then the wreck's draw: the last extra becomes the wreck (ROOM 0,
//    ROCKY, STANDARD);
// 5. placement, per non-guess site in draw order (data/survey-sites freeSpans: LZ_MIN_GAP_DEG from every placed site,
//    NO_GO_EDGE_GAP_MIN_KM from every arc); a placement that jams starts over on the continuing stream, up to `tries`
//    (SITE_PLACE_TRIES) placements in all (review m1: the draws before it never move), and then it throws;
// 6. numbering: the candidates and the wreck `site-1` … in rim order from 0 rad.
// Returns the guesses in LZ order, then the sites by number. validateSurveySites checks the answer before it is returned.
export function rollSurveySites(def: Readonly<ShipLandingDef>, planetR: number, rng: Rng, tries = SITE_PLACE_TRIES): SurveySite[] {
  const lzs = def.lzs;
  if (lzs.length === 0) throw new Error('rollSurveySites: a landing with no LZ');
  // 1.
  const grounds: LzGround[] = lzs.map(() => 'flat');
  const bad = Math.floor(rng() * lzs.length);
  grounds[bad] = badGround(rng);
  lzs.forEach((_, index) => {
    if (index === bad) return;
    const extraBad = rng() < POOR_EXTRA_BAD_GUESS_ODDS;
    const ground = badGround(rng);
    if (extraBad) grounds[index] = ground;
  });
  // 2.
  const guesses = lzs.map((lz, index) => siteOf(
    { kind: 'guess', width: lz.width, roomPods: lz.pods, ground: grounds[index]! }, guessSiteId(index), index, lz.centreDeg * TO_RAD, planetR,
  ));
  // 3.
  const drafts: Draft[] = lzs.map((lz) => ({
    kind: 'candidate', width: pick(rng, GUARANTEED_SITE_WIDTHS), roomPods: lz.pods + Math.floor(rng() * (GUARANTEED_SITE_ROOM_SPARE_PODS + 1)),
    ground: 'flat',
  }));
  // 4.
  const largest = Math.max(...lzs.map((lz) => lz.pods));
  for (let i = 0; i < SURVEY_EXTRA_SITES; i++) {
    const ground = extraGround(rng);
    const width = pick(rng, EXTRA_SITE_WIDTHS);
    const roomPods = 1 + Math.floor(rng() * (largest + EXTRA_SITE_ROOM_SPARE_PODS));
    drafts.push({ kind: 'candidate', width, roomPods, ground });
  }
  if (SURVEY_EXTRA_SITES > 0 && rng() < WRECK_SITE_ODDS) drafts[drafts.length - 1] = { kind: 'wreck', width: 'standard', roomPods: 0, ground: 'rocky' };
  // 5.
  let centres: number[] | null = null;
  for (let attempt = 0; attempt < tries && centres === null; attempt++) centres = placeAll(guesses, drafts, def.noGo, planetR, rng);
  if (centres === null) throw new Error(`rollSurveySites: no room on the rim for ${drafts.length} sites after ${tries} placements`);
  // 6.
  const placedAt = centres;
  const order = drafts.map((_, i) => i).sort((a, b) => placedAt[a]! - placedAt[b]!);
  const sites = order.map((i, rank) => siteOf(drafts[i]!, `site-${rank + 1}`, rank + 1, placedAt[i]!, planetR));
  const all = [...guesses, ...sites];
  validateSurveySites(def, planetR, all);
  return all;
}

// Throws on a site list that breaks the roll's rules (01 §3.15's check among them):
// • the count: one guess per LZ, in LZ order at its LZ's centre, class and count, and lzs + SURVEY_EXTRA_SITES other sites,
//   numbered `site-1` … in rim order;
// • every site's width is its class's (a WET one WET_WIDTH_FACTOR of it), a wreck ROOM 0 ROCKY STANDARD, nothing found or
//   rated yet;
// • each LZ has a FLAT candidate of its own (distinct) with ROOM ≥ its count (01 §3.15);
// • POOR_BAD_GUESSES bad guesses (and with POOR_EXTRA_BAD_GUESS_ODDS raised, no more than one per LZ);
// • spacing: every two sites LZ_MIN_GAP_DEG apart edge to edge by class width, and every non-guess site
//   NO_GO_EDGE_GAP_MIN_KM from every no-go arc's edge.
export function validateSurveySites(def: Readonly<ShipLandingDef>, planetR: number, sites: readonly SurveySite[]): void {
  const fail: (why: string) => never = (why) => { throw new Error(`validateSurveySites: ${why}`); };
  const lzs = def.lzs;
  const guesses = sites.filter((site) => site.kind === 'guess');
  const others = sites.filter((site) => site.kind !== 'guess');
  if (guesses.length !== lzs.length) fail(`${guesses.length} guesses for ${lzs.length} LZs`);
  if (others.length !== lzs.length + SURVEY_EXTRA_SITES) fail(`${others.length} sites besides the guesses (want ${lzs.length + SURVEY_EXTRA_SITES})`);
  if (others.filter((site) => site.kind === 'wreck').length > 1) fail('more than one wreck');
  if (new Set(sites.map((site) => site.id)).size !== sites.length) fail('two sites share an id');
  lzs.forEach((lz, index) => {
    const guess = sites[index];
    if (guess === undefined || guess.kind !== 'guess' || guess.id !== guessSiteId(index) || guess.number !== index) fail(`site ${index} is not ${lz.label}'s guess`);
    if (guess.centreRad !== lz.centreDeg * TO_RAD || guess.width !== lz.width || guess.roomPods !== lz.pods) fail(`${guess.id} is not where ${lz.label} is, or not its class or count`);
  });
  const rim = sites.slice(lzs.length);
  rim.forEach((site, rank) => {
    if (site.kind === 'guess' || site.id !== `site-${rank + 1}` || site.number !== rank + 1) fail(`${site.id} is out of rim order (rank ${rank + 1})`);
    const previous = rim[rank - 1];
    if (previous !== undefined && !(site.centreRad > previous.centreRad)) fail(`${site.id} is not after ${previous.id} round the rim`);
  });
  for (const site of sites) {
    if (!(site.centreRad >= 0 && site.centreRad < TAU)) fail(`${site.id}'s centre ${site.centreRad} is outside [0, 2π)`);
    const widthKm = widthKmOf(site.width, site.ground);
    if (site.widthKm !== widthKm || site.halfWidthRad !== widthKm / 2 / planetR) fail(`${site.id} is ${site.widthKm} km wide, not its class's ${widthKm}`);
    if (site.found || site.groundKnown) fail(`${site.id} is found or rated before SURVEY ran`);
    if (site.kind === 'wreck' && (site.roomPods !== 0 || site.ground !== 'rocky' || site.width !== 'standard')) fail(`the wreck ${site.id} is not ROOM 0, ROCKY, STANDARD`);
    if (site.kind !== 'wreck' && !(Number.isInteger(site.roomPods) && site.roomPods >= 1)) fail(`${site.id} has ROOM ${site.roomPods}`);
  }
  // Each LZ its own FLAT candidate with ROOM for its count (a matching: an augmenting path per LZ).
  const fits = lzs.map((lz) => others.flatMap((site, i) => (site.kind === 'candidate' && site.ground === 'flat' && site.roomPods >= lz.pods ? [i] : [])));
  const owner = new Map<number, number>();
  const assign = (lz: number, seen: Set<number>): boolean => fits[lz]!.some((site) => {
    if (seen.has(site)) return false;
    seen.add(site);
    const held = owner.get(site);
    if (held === undefined || assign(held, seen)) { owner.set(site, lz); return true; }
    return false;
  });
  lzs.forEach((lz, index) => { if (!assign(index, new Set())) fail(`${lz.label} has no FLAT candidate of its own with ROOM for ${lz.pods} pods`); });
  const badGuesses = guesses.filter((site) => site.ground !== 'flat').length;
  const most = POOR_EXTRA_BAD_GUESS_ODDS > 0 ? lzs.length : POOR_BAD_GUESSES;
  if (badGuesses < POOR_BAD_GUESSES || badGuesses > most) fail(`${badGuesses} bad guesses (want ${POOR_BAD_GUESSES}${most > POOR_BAD_GUESSES ? `–${most}` : ''})`);
  const gap = LZ_MIN_GAP_DEG * TO_RAD;
  sites.forEach((site, i) => {
    for (const other of sites.slice(i + 1)) {
      const edge = apartRad(site.centreRad, other.centreRad) - classHalfRad(site.width, planetR) - classHalfRad(other.width, planetR);
      if (edge < gap - 2 * EDGE_SLACK_RAD) fail(`${site.id} and ${other.id} are ${(edge / TO_RAD).toFixed(2)}° apart edge to edge (at least ${LZ_MIN_GAP_DEG}°)`);
    }
  });
  const clear = NO_GO_EDGE_GAP_MIN_KM / planetR;
  for (const site of others) {
    for (const arc of def.noGo) {
      const edge = apartRad(site.centreRad, arc.centreDeg * TO_RAD) - (arc.widthDeg / 2) * TO_RAD - classHalfRad(site.width, planetR);
      if (edge < clear - 2 * EDGE_SLACK_RAD) fail(`${site.id} is ${(edge * planetR).toFixed(0)} km from the ${arc.word} arc (at least ${NO_GO_EDGE_GAP_MIN_KM} km)`);
    }
  }
}
