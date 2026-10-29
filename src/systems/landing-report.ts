import type { GameState, ShipOutcome } from '@state/schema';
import type { LandingTally, Place, Touch } from '@/types/landing';
import { landingResult } from '@systems/landing-rules';
import { angleDelta } from '@systems/landing-solve';
import { shipStars, type ShipStar } from '@systems/stars';
import { LANDING_REPORT_TEXT } from '@data/landing-text';
import { getShip, isLastShip } from '@data/ships';

// The LANDING REPORT's view model (01-landing §3.11, plan §1.4), pure: everything the screen shows, from landingResult
// and the stars, so the screen (components/run/LandingReport.ts) only lays it out. OWNED BY TRACK UI from the
// foundation follow-up on: this stub returns real data in the final shape so UI can render against it; UI may add
// fields (the count-up's steps, the credits' timing) but keeps these.

export interface LandingReportCredit {
  pod: number;
  family: string;
  names: string[];      // the pod's featured colonists ('Okafor, Ada')
  place: Place;
  touch: Touch;
  points: number;
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
  nearMisses: string[];       // `POD 04 landed 23 km outside LZ-B`, closest first (UI picks how many)
  credits: LandingReportCredit[];  // pods that came down and scored (none for 0 points or never launched)
  points: number;
  pointsText: string;
  stars: ShipStar[];
  continueText: string;       // CONTINUE ▸ [SPACE], or RUN END ▸ [SPACE] on the last ship
  finalShip: boolean;
  tally: LandingTally;        // the raw fold, for anything the lines above don't carry
}

// The report opens only for a ship that ended its landing in orbit: locked, or accepted.
function reportOutcome(state: Readonly<GameState>): ShipOutcome {
  return state.burn.status === 'locked' ? 'locked' : 'partial';
}

export function landingReportModel(state: Readonly<GameState>): LandingReportModel {
  const ship = getShip(state.run.shipIndex);
  const { landing } = state;
  const tally = landingResult(state, reportOutcome(state));
  const otherRows: string[] = [];
  if (tally.offSite > 0) otherRows.push(LANDING_REPORT_TEXT.offSite(tally.offSite));
  if (tally.noGo > 0) otherRows.push(LANDING_REPORT_TEXT.noGo(tally.noGo));
  for (const parked of tally.parked) otherRows.push(LANDING_REPORT_TEXT.parked(parked.pod));
  for (const pod of tally.pods) if (pod.fate === 'not-launched') otherRows.push(LANDING_REPORT_TEXT.notLaunched(pod.pod));
  if (tally.restored > 0) otherRows.push(LANDING_REPORT_TEXT.restored);
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
  const credits: LandingReportCredit[] = tally.pods
    .filter((pod) => pod.fate === 'down' && pod.points > 0 && pod.place !== null && pod.touch !== null)
    .map((pod) => ({ pod: pod.pod, family: pod.family, names: pod.featured, place: pod.place!, touch: pod.touch!, points: pod.points }));
  return {
    title: LANDING_REPORT_TEXT.title,
    route: LANDING_REPORT_TEXT.route(ship.name, ship.world, landing.terrain, landing.forgiveness),
    headline: LANDING_REPORT_TEXT.headline(tally.landedInLz, tally.colonistsAboard),
    landed: tally.landedInLz,
    aboard: tally.colonistsAboard,
    lzRows: tally.lzs.map((row) => LANDING_REPORT_TEXT.lzRow(row.lz, row.landed, row.count)),
    otherRows,
    colonyLine: tally.colony === null ? null : LANDING_REPORT_TEXT.colony(tally.colony),
    nearMisses: misses.map((miss) => miss.text),
    credits,
    points: tally.points,
    pointsText: LANDING_REPORT_TEXT.points(tally.points),
    stars: shipStars(state),
    continueText: isLastShip(state.run.shipIndex) ? LANDING_REPORT_TEXT.runEnd : LANDING_REPORT_TEXT.continue,
    finalShip: landing.finalShip,
    tally,
  };
}
