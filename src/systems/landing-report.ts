// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { GameState } from '@state/schema';
import type { Colonist } from '@/types/segment';
import type { LandingTally, Place, PodSummary, Touch } from '@/types/landing';
import { landingOutcome, landingResult } from '@systems/landing-rules';
import { angleDelta } from '@systems/landing-solve';
import { shipStars, starCharge, type ShipStar } from '@systems/stars';
import { beaconOnFirstShip } from '@systems/lineage';
import { unitName } from '@systems/say';
import { MAP_TEXT } from '@data/map-text';
import { LANDING_REPORT_TEXT, LANDING_REPORT_UI_TEXT, PARK_REASON_TEXT, podCode } from '@data/landing-text';
import { HARD_WORDS_POOL } from '@data/souls';
import { COLONISTS_PER_POD, STAR_CHARGE_BONUS } from '@data/tuning';
import { residentReportRows, type ResidentReportRow } from '@systems/resident-hud';

// The LANDING REPORT's view model (01-landing §4, plan §1.4), pure: everything the screen shows, from landingResult and
// the stars, so the screen (components/run/LandingReport.ts) only lays it out and times it. It plays in three stages:
// the rows (route, colony, one row per LZ counting up with a pod icon per pod, then OFF-SITE / NO-GO / PARKED / NOT
// LAUNCHED / RESTORED rows), the credits (lead colonist first, each with site and first words; no line for pods that
// scored 0 or never launched), then the headline, the stars, the charge and up to two near misses, and CONTINUE.
//
// The `string` fields are the phase-1 stub's (kept: __ap.landingReport() and the tests read them); the `…Rows` and
// credit details are what the screen draws.

export interface LandingReportCredit {
  pod: number;
  family: string;
  names: string[];      // the pod's featured colonists ('Okafor, Ada')
  place: Place;
  touch: Touch;
  points: number;
  lead: boolean;        // the story pod (LandingState.lead): first, and held in the middle of the screen
  lz: string | null;
  colonist: { name: string; age: number; about: string; words: string };  // the one the credit names
  line: string;         // `OKAFOR, ADA (11) · LZ-A · "Is it morning?"`
  where: string;        // `LZ-A`, `LZ-B FULL · HARD`, `OFF-SITE`
}

// One pod icon in a row (§4 "pod icons by outcome"): landed soft / hard in the LZ, mislanded (soft / hard), an empty
// slot the LZ still had room for, off-site, in a no-go arc, parked in orbit (the beacon), not launched.
export type PodIcon = 'soft' | 'hard' | 'mislanded' | 'mislanded-hard' | 'empty' | 'off-site' | 'no-go' | 'parked' | 'not-launched';

export interface ReportRow {
  kind: 'lz' | 'off-site' | 'no-go' | 'parked' | 'not-launched' | 'restored';
  label: string;        // `LZ-A`, `OFF-SITE`, `POD 07`
  text: string;         // `600 / 600 ✓`, `200 / 400 · 200 SHORT`, `PARKED IN ORBIT · fate unknown`
  icons: PodIcon[];
  tone: 'good' | 'short' | 'plain' | 'muted';
  line: string;         // the whole row as one line (the stub's lzRows / otherRows entry)
  why: string | null;   // a parked pod's reason
  locked?: true;        // slice 5: a pod its resident still held (drawn in the resident's amber)
}

export interface LandingReportModel {
  title: string;              // LANDING REPORT
  route: string;              // ARES-VII → KEPLER-186F · PLAINS · GENTLE
  headline: string;           // LANDED 1,000 / 1,200
  landed: number;             // colonists in an LZ with room (soft or hard)
  aboard: number;             // colonists the ship arrived with
  lzRows: string[];           // `LZ-A 600 / 600 ✓`, `LZ-B 400 / 600 · 200 SHORT`, one per LZ in label order
  otherRows: string[];        // OFF-SITE, NO-GO, each parked / not-launched pod, RESTORED BY MERGE
  colonyLine: string | null;  // `they are calling it RIVERSIDE`
  // Slice 3c (05 §3.5, §3.8): ship 1's beacon row, `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 1 YEAR AGO` (the
  // last unit's from run 2, by the launch gap; `THIS YEAR` for 0), null past ship 1, on the classic world, and when the last
  // unit's first ship never reached orbit (systems/lineage.ts beaconOnFirstShip).
  beaconLine: string | null;
  nearMisses: string[];       // `POD 04 landed 23 km outside LZ-B`, closest first (the screen shows two)
  credits: LandingReportCredit[];  // pods that came down and scored (none for 0 points or never launched), lead first
  points: number;
  pointsText: string;
  stars: ShipStar[];
  continueText: string;       // CONTINUE ▸ [SPACE], or RUN END ▸ [SPACE] on the last ship
  finalShip: boolean;
  tally: LandingTally;        // the raw fold, for anything the lines above don't carry
  // The screen's own:
  rows: ReportRow[];          // the LZ rows, then the others, in the order the screen counts them up
  breakdown: string;          // `2,000 soft · 200 hard · 200 mislanded · 0 off-site`
  charge: number;             // REPAIR CHARGE the stars carry
  chargeLine: string;         // `+18 REPAIR CHARGE ON NEXT SHIP`, or the last ship's line
  lastShip: boolean;
  // Slice 5 (plan §2.11): the sleeper's gift (after the cycles line), WARDEN's goodnight (under the colony, 05's story line)
  // and the pods a resident still held when the landing ended (drawn in their PARKED rows: `POD 07 · LOCKED BY WARDEN ·
  // PARKED IN ORBIT`). systems/resident-hud.ts residentReportRows.
  resident: ResidentReportRow[];
}

function podIcon(pod: PodSummary): PodIcon {
  switch (pod.fate) {
    case 'parked': return 'parked';
    case 'not-launched': return 'not-launched';
    case 'down':
      if (pod.place === 'lz') return pod.touch === 'hard' ? 'hard' : 'soft';
      if (pod.place === 'mislanded') return pod.touch === 'hard' ? 'mislanded-hard' : 'mislanded';
      if (pod.place === 'off-site') return 'off-site';
      if (pod.place === 'no-go') return 'no-go';
      throw new Error(`podIcon: pod ${pod.pod} is down with no place`);
    default:
      throw new Error(`podIcon: pod ${pod.pod} has no final fate (${pod.fate})`);
  }
}

// `locked`: the resident's report rows for pods parked with a lock still on their driver (slice 5), by pod.
function reportRows(tally: LandingTally, locked: ReadonlyMap<number, ResidentReportRow>): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const row of tally.lzs) {
    const inLz = tally.pods.filter((pod) => pod.fate === 'down' && pod.lz === row.lz && pod.place === 'lz');
    const mislanded = tally.pods.filter((pod) => pod.fate === 'down' && pod.lz === row.lz && pod.place === 'mislanded');
    const slots = Math.round(row.count / COLONISTS_PER_POD);
    const icons: PodIcon[] = [...inLz.map(podIcon), ...Array.from({ length: Math.max(0, slots - inLz.length) }, (): PodIcon => 'empty'), ...mislanded.map(podIcon)];
    const line = LANDING_REPORT_TEXT.lzRow(row.lz, row.landed, row.count);
    rows.push({
      kind: 'lz', label: row.lz, text: line.slice(row.lz.length + 1), icons, tone: row.landed >= row.count ? 'good' : 'short', line, why: null,
    });
  }
  const offSite = tally.pods.filter((pod) => pod.fate === 'down' && pod.place === 'off-site');
  if (tally.offSite > 0) {
    const line = LANDING_REPORT_TEXT.offSite(tally.offSite);
    rows.push({ kind: 'off-site', label: 'OFF-SITE', text: line.slice('OFF-SITE '.length), icons: offSite.map(podIcon), tone: 'plain', line, why: null });
  }
  const noGo = tally.pods.filter((pod) => pod.fate === 'down' && pod.place === 'no-go');
  if (tally.noGo > 0) {
    const line = LANDING_REPORT_TEXT.noGo(tally.noGo);
    rows.push({ kind: 'no-go', label: 'NO-GO', text: line.slice('NO-GO '.length), icons: noGo.map(podIcon), tone: 'muted', line, why: null });
  }
  for (const parked of tally.parked) {
    // A pod its resident still held (slice 5, plan R7): the lock is why it never launched, so the row says that and no other
    // reason (`no time` would blame the kid's pace).
    const lock = locked.get(parked.pod);
    if (lock !== undefined) {
      const label = podCode(parked.pod);
      rows.push({
        kind: 'parked', label, text: lock.text.slice(label.length + 3), icons: ['parked'], tone: 'muted', line: lock.text, why: null, locked: true,
      });
      continue;
    }
    const line = LANDING_REPORT_TEXT.parked(parked.pod);
    rows.push({
      kind: 'parked', label: podCode(parked.pod), text: line.slice(podCode(parked.pod).length + 3), icons: ['parked'], tone: 'muted', line,
      why: PARK_REASON_TEXT[parked.why],
    });
  }
  for (const pod of tally.pods) {
    if (pod.fate !== 'not-launched') continue;
    const line = LANDING_REPORT_TEXT.notLaunched(pod.pod);
    rows.push({ kind: 'not-launched', label: podCode(pod.pod), text: line.slice(podCode(pod.pod).length + 3), icons: ['not-launched'], tone: 'muted', line, why: null });
  }
  if (tally.restored > 0) {
    rows.push({ kind: 'restored', label: LANDING_REPORT_TEXT.restored, text: '', icons: [], tone: 'good', line: LANDING_REPORT_TEXT.restored, why: null });
  }
  return rows;
}

// Who a credit names and what they say (§4: their first words). A soft landing: the first of the pod's featured
// colonists whose first words nobody above has said (the roster deals words from a deck that reshuffles). A hard one:
// the first colonist, with a line from HARD_WORDS_POOL (by pod number, so a report always reads the same, and never one
// already said above), so a hard landing is heard and not just counted.
function creditedSay(featured: readonly Colonist[], touch: Touch, pod: number, said: ReadonlySet<string>): { colonist: Colonist; words: string } {
  const first = featured[0];
  if (!first) throw new Error(`landing-report: pod ${pod} has nobody to credit`);
  if (touch === 'soft') {
    const colonist = featured.find((candidate) => !said.has(candidate.firstWords)) ?? first;
    return { colonist, words: colonist.firstWords };
  }
  for (let i = 0; i < HARD_WORDS_POOL.length; i++) {
    const words = HARD_WORDS_POOL[(pod - 1 + i) % HARD_WORDS_POOL.length]!;
    if (!said.has(words)) return { colonist: first, words };
  }
  throw new Error(`landing-report: every hard-landing line is taken before pod ${pod}`);
}

function credits(state: Readonly<GameState>, tally: LandingTally): LandingReportCredit[] {
  const { landing } = state;
  const scored = tally.pods.filter((pod) => pod.fate === 'down' && pod.points > 0 && pod.place !== null && pod.touch !== null);
  const touchdownAt = (pod: number): number => {
    const fate = landing.pods.find((record) => record.pod === pod)?.fate;
    return fate?.kind === 'down' ? fate.touchdown.atAi : fate?.kind === 'falling' ? fate.launch.atAi + fate.launch.descentSec : Infinity;
  };
  // The lead pod first (the story's: Ada on run 1), then the order they came down in.
  scored.sort((a, b) => (a.pod === landing.lead ? -1 : b.pod === landing.lead ? 1 : touchdownAt(a.pod) - touchdownAt(b.pod)));
  const said = new Set<string>();
  return scored.map((pod) => {
    const record = landing.pods.find((candidate) => candidate.pod === pod.pod);
    if (!record) throw new Error(`landing-report: no pod ${pod.pod} on this ship`);
    const touch = pod.touch!;
    const { colonist, words } = creditedSay(record.featured, touch, pod.pod, said);
    said.add(words);
    const where = LANDING_REPORT_UI_TEXT.creditWhere(pod.place!, pod.lz, touch);
    return {
      pod: pod.pod, family: pod.family, names: pod.featured.map((colonist) => colonist.name), place: pod.place!, touch, points: pod.points, lead: pod.pod === landing.lead,
      lz: pod.lz, colonist: { name: colonist.name, age: colonist.age, about: colonist.line, words }, where,
      line: LANDING_REPORT_UI_TEXT.credit(colonist.name, colonist.age, where, words),
    };
  });
}

// Ship 1's beacon row (05 §3.5): at the ship's first LZ in label order (the beacon marks where the last unit's pods came
// down first; 05's sample is LZ-A).
function beaconLine(state: Readonly<GameState>): string | null {
  const beacon = beaconOnFirstShip(state);
  if (beacon === null) return null;
  const lz = [...state.landing.lzs].map((zone) => zone.label).sort()[0];
  if (lz === undefined) throw new Error('landing-report: ship 1 has a beacon but no LZ to put it in');
  return MAP_TEXT.report.beacon(lz, unitName(beacon.unit), beacon.yearsAgo);
}

// Read from the state alone (the ship's name and world, the final ship), never from a ShipDef: a generator-made ship (§1.7)
// needs nothing new here. The report opens for a ship whose landing ran in orbit (locked or accepted); a ship lost during
// the landing (1b's 'ship-lost') gets the LOST card, but its outcome still reads (landingOutcome) rather than throws.
export function landingReportModel(state: Readonly<GameState>): LandingReportModel {
  const { landing } = state;
  const tally = landingResult(state, landingOutcome(state.burn.status));
  const resident = residentReportRows(state);
  const locked = new Map(resident.flatMap((row) => (row.kind === 'locked' && row.pod !== null ? [[row.pod, row] as const] : [])));
  const rows = reportRows(tally, locked);
  // Near misses: pods down off-site or in a no-go arc, by their km to the nearest bracket edge, naming that LZ.
  const misses: { km: number; text: string }[] = [];
  for (const record of landing.pods) {
    if (record.fate.kind !== 'down' || record.fate.touchdown.missKm === null) continue;
    const rad = record.fate.launch.landingRad;
    const nearest = [...landing.lzs].sort((a, b) =>
      (Math.abs(angleDelta(a.centreRad, rad)) - a.halfWidthRad) - (Math.abs(angleDelta(b.centreRad, rad)) - b.halfWidthRad))[0];
    if (!nearest) continue;
    const km = record.fate.touchdown.missKm;
    misses.push({ km, text: LANDING_REPORT_TEXT.nearMiss(record.pod, km, nearest.label) });
  }
  misses.sort((a, b) => a.km - b.km);
  // `soft · hard · mislanded · off-site`: each colonist down counted once (review: a mislanded pod was counted in soft or
  // hard too). Soft and hard are the pods down in an LZ with room; MISLANDED says nothing of the touch.
  let soft = 0;
  let hard = 0;
  let mislanded = 0;
  for (const pod of tally.pods) {
    if (pod.fate !== 'down') continue;
    if (pod.place === 'mislanded') mislanded += pod.colonists;
    else if (pod.place === 'lz') {
      if (pod.touch === 'hard') hard += pod.colonists;
      else soft += pod.colonists;
    }
  }
  const stars = shipStars(state);
  const charge = starCharge(stars);
  // The final ship's report ends the run (RUN END ▸): LandingState.finalShip, copied from the def when the ship was built.
  const lastShip = landing.finalShip;
  return {
    title: LANDING_REPORT_TEXT.title,
    route: LANDING_REPORT_TEXT.route(state.level.shipName, state.mission.destination, landing.terrain, landing.forgiveness),
    headline: LANDING_REPORT_TEXT.headline(tally.landedInLz, tally.colonistsAboard),
    landed: tally.landedInLz,
    aboard: tally.colonistsAboard,
    lzRows: rows.filter((row) => row.kind === 'lz').map((row) => row.line),
    otherRows: rows.filter((row) => row.kind !== 'lz').map((row) => row.line),
    colonyLine: tally.colony === null ? null : LANDING_REPORT_TEXT.colony(tally.colony),
    beaconLine: beaconLine(state),
    nearMisses: misses.map((miss) => miss.text),
    credits: credits(state, tally),
    points: tally.points,
    pointsText: LANDING_REPORT_TEXT.points(tally.points),
    stars,
    continueText: lastShip ? LANDING_REPORT_TEXT.runEnd : LANDING_REPORT_TEXT.continue,
    finalShip: landing.finalShip,
    tally,
    rows,
    breakdown: LANDING_REPORT_UI_TEXT.breakdown(soft, hard, mislanded, tally.offSite),
    charge,
    chargeLine: lastShip ? LANDING_REPORT_UI_TEXT.lastShip : LANDING_REPORT_UI_TEXT.charge(charge, STAR_CHARGE_BONUS),
    lastShip,
    resident,
  };
}
