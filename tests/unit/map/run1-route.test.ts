// Track GEN: run 1 on the arm, headless, through the DESK (slice-3a-plan §6.1 map/run1-route; risk 6): the worked route
// [0, 2, 5, 11, 15, 19] (ARES-VII, HALCYON, KESTREL, VESPER, CORMORANT, LAST LIGHT) flown by wp11's strip-following kid
// with its defenders, every landing instant but the final ship's (flown by the strip through the duel to the choice, as
// wp11/full-run does). At each desk the kid sets course to the route's next ship. Checks: the desk between ships, the
// hop and its years (the galaxy year is the approach), the hits that land (round(d / 7) − ECC), the boot's sleep and ECC
// lines, the rings at each boot (02, 03, 04–06, 07–08, 09–11), HOLLOW's forced boarding at CORMORANT (M3), the interim
// licences by act, the run ending at the first final ship, and the route in run.ships. Prints the REPAIR CHARGE at the
// choice of a kid saving it for MERGE (risk 6: the MERGE margin moves to the route). Full depth (npm run balance) also flies the routes ending at
// PROVIDENCE, GOOD HOPE and WAYFARER.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { receiveTransmission } from '@systems/boot';
import { shipLost, startRun, continueAfterReport, continueAfterLoss, setCourse } from '@systems/run';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { followDirector } from '../wp2/harness2';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { chargeLeft } from '@state/selectors';
import { chooseFinale } from '@systems/finale';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { setLandingMode } from '../support/landing-instant';
import { followLanding } from '../landing/harness-landing';
import { mountStoryLog } from '@systems/story-log';
import { currentSlot } from '@systems/map-run';
import { hitsLanding } from '@systems/map-hop';
import { routes } from '@systems/map-route';
import { MAP_TEXT } from '@data/map-text';
import { LOG_TEXT } from '@data/log-text';
import { MERGE_COST_CHARGE } from '@data/tuning';
import { byDepth } from '../depth';
import type { GameState } from '@state/schema';

const WORKED: readonly number[] = [0, 2, 5, 11, 15, 19];
const SEED = 3;
const h = createHarness11(1, { soulsFound: false });
mountStoryLog(h.store);
const state = (): Readonly<GameState> => h.store.getState();
// The kid plays for MERGE (wp11/full-run's even seeds): it heals the Core only back to its two threads, saving charge.
const SAVER = { coreHealBelow: 50, coreHealTo: 60 };

interface Flown { route: readonly number[]; ended: string; ships: string; charge: number | null; failures: string[] }

function flyShip(): void {
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 1500,
    mistake: () => {
      h.defend11(SAVER);
      const deal = state().hollow.deal;
      if (deal.phase === 'offered' && deal.entryId !== null) pickChoice(deal.entryId, DEAL_REFUSE);
      if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
      return false;
    },
  });
}

// One run along `route`; `record` collects per-ship observations for the worked route's checks.
function flyRoute(route: readonly number[], record: (event: string, at: Readonly<GameState>) => void): Flown {
  h.newRun(SEED);
  startRun(h.store, SEED, FIRST_RUN_LINEAGE, 'arm');
  const failures: string[] = [];
  let charge: number | null = null;
  receiveTransmission(h.store);
  h.stepUntil(() => state().run.phase === 'flight', 15);
  record('boot', state());
  let guard = 0;
  let progress = '';
  while (state().run.phase !== 'end' && guard++ < 16) {
    const here = `${state().run.shipIndex}:${state().run.phase}:${state().burn.status}:${state().hollow.finale.phase}`;
    if (here === progress) { failures.push(`stuck at ${here} on ${state().level.shipName}`); break; }
    progress = here;
    if (state().run.phase === 'boot') { h.stepUntil(() => state().run.phase !== 'boot', 25); record('boot', state()); }
    const final = state().run.map.route.at(-1)!.slot === route[route.length - 1];
    setLandingMode(final ? 'manual' : 'instant');
    if (state().run.phase === 'flight' && state().burn.status === 'approaching' && !state().run.coreLost) flyShip();
    record('flown', state());
    if (shipLost(state())) continueAfterLoss(h.store);
    else if (state().run.phase === 'landing') {
      if (final) {
        let picked = false;
        followLanding(h, {
          maxWall: 900,
          onTick: () => {
            h.defend11(SAVER);
            if (picked || state().hollow.finale.phase !== 'choice') return;
            picked = true;
            charge = chargeLeft(state());
            chooseFinale(h.store, charge >= MERGE_COST_CHARGE ? 'merge' : 'purge');
          },
        });
      }
      const end = h.wall() + 600;
      while (state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) { h.defend11(SAVER); h.step(); }
      if (state().run.phase === 'report') continueAfterReport(h.store);
      else if (shipLost(state())) continueAfterLoss(h.store);
    } else if (state().run.phase === 'report') continueAfterReport(h.store);
    if (state().run.phase === 'desk') {
      record('desk', state());
      const next = route[state().run.shipIndex + 1];
      if (next === undefined) { failures.push('the route ran out before the final ship'); break; }
      setCourse(h.store, next);
      record('packet', state());
      h.transmit();
      h.stepUntil(() => state().run.phase === 'flight', 25);
      record('boot', state());
    }
  }
  return {
    route, ended: state().run.endCause ?? `(${state().run.phase} on ${state().level.shipName})`,
    ships: state().run.ships.map((ship) => `${ship.shipName}:${ship.outcome}`).join(' '), charge, failures,
  };
}

// --- The worked route, with its checks ------------------------------------------------------------------------------------
const boots: { slot: number; year: number; found: number[]; lines: string[]; boarded: string | null; landed: number | null; hits: number }[] = [];
const desks: { slot: number; paused: boolean; offered: boolean }[] = [];
const licencesAt: Record<string, string[]> = {};
let logFrom = 0;
const worked = flyRoute(WORKED, (event, at) => {
  if (event === 'boot' && at.run.phase === 'flight') {
    const stop = at.run.map.route.at(-1)!;
    const plan = stop.hop;
    boots.push({
      slot: stop.slot, year: at.run.map.galaxyYear, found: [...at.run.log.found], lines: at.log.entries.slice(logFrom).map((entry) => entry.text),
      boarded: at.run.arrival?.boarded?.cause ?? null, landed: plan ? hitsLanding(plan, 0) : null, hits: at.run.arrival?.hits.length ?? 0,
    });
    logFrom = at.log.entries.length;
  }
  if (event === 'flown') licencesAt[at.level.shipName] = [...at.run.licences];
  if (event === 'desk') desks.push({ slot: currentSlot(at.run), paused: at.clock.paused, offered: at.ui.deskSelected === null || typeof at.ui.deskSelected === 'number' });
});
console.log(`worked route [${WORKED.join(', ')}]: ${worked.ended} | ${worked.ships} | charge at the choice ${worked.charge ?? '-'}`);
check('run 1 flies the worked route to its end: six ships, the run ending at LAST LIGHT (the first final ship landed on)',
  worked.failures.length === 0 && state().run.ships.map((ship) => ship.slot).join() === WORKED.join() && state().run.phase === 'end'
  && state().run.ships.at(-1)?.shipName === 'LAST LIGHT', `${worked.failures.join(' | ')} ${worked.ships}`);
check('…a DESK after every ship but the last, both clocks stopped', desks.map((desk) => desk.slot).join() === WORKED.slice(0, -1).join()
  && desks.every((desk) => desk.paused), JSON.stringify(desks));
const bootAt = (slot: number) => boots.find((boot) => boot.slot === slot);
check('…the galaxy year is each ship\'s approach: 2300, 2352, 2467, 2625, 2817, 3020',
  WORKED.map((slot) => bootAt(slot)?.year).join() === '2300,2352,2467,2625,2817,3020', boots.map((b) => `${b.slot}:${b.year}`).join());
check('…the hits that land are round(d / 7) − ECC: 2, 1, 4, 0, 3 (no extras on a clean run)',
  WORKED.slice(1).map((slot) => bootAt(slot)?.landed).join() === '2,1,4,0,3' && WORKED.slice(1).every((slot) => bootAt(slot)!.hits === bootAt(slot)!.landed));
check('…every boot after a beam opens with the sleep line (HALCYON: `ASLEEP IN HALCYON\'S RECEIVER · 2321 → 2352 · 31 YEARS`)',
  bootAt(2)!.lines.includes(MAP_TEXT.boot.sleep('HALCYON', 2321, 2352)) && WORKED.slice(1).every((slot) => bootAt(slot)!.lines.some((line) => line.startsWith('> ASLEEP IN'))),
  bootAt(2)!.lines.join(' | '));
check('…and names what ECC corrected (KESTREL: 3 HITS CORRECTED WHILE ASLEEP)', bootAt(5)!.lines.includes(MAP_TEXT.boot.ecc(3)), bootAt(5)!.lines.join(' | '));
const ringsAt = (slot: number, entries: number[]): boolean => bootAt(slot)!.lines.includes(LOG_TEXT.keyFound(entries)) && entries.every((entry) => bootAt(slot)!.found.includes(entry));
check('…the rings at each boot: HALCYON 02, KESTREL 03, VESPER 04–06, CORMORANT 07–08, LAST LIGHT 09–11',
  ringsAt(2, [2]) && ringsAt(5, [3]) && ringsAt(11, [4, 5, 6]) && ringsAt(15, [7, 8]) && ringsAt(19, [9, 10, 11]), JSON.stringify(boots.map((b) => b.found)));
check('…HOLLOW boards on the beam into CORMORANT, forced (M3: New Haven is one hop away), and not into VESPER',
  bootAt(15)!.boarded === 'forced' && bootAt(11)!.boarded === null, `${bootAt(11)!.boarded} / ${bootAt(15)!.boarded}`);
check('…the interim licences by act: DELETE and MOVE on KESTREL (depth 3, DEBRIS), SWAP on VESPER (ENGINE FAULT), COPY on CORMORANT (HOLLOW\'s first ship)',
  ['delete', 'move'].every((kind) => licencesAt.KESTREL?.includes(kind)) && !licencesAt.HALCYON?.includes('delete')
  && licencesAt.VESPER?.includes('swap') === true && licencesAt.CORMORANT?.includes('copy') === true && !licencesAt.VESPER?.includes('copy'),
  JSON.stringify(licencesAt));
console.log(`INFO  charge at the choice on the worked route (ends at CORMORANT → LAST LIGHT): ${worked.charge ?? 'not reached'}`);

// --- Risk 6 at full depth: the other last ships before the final one -------------------------------------------------------
const lastBefore = [16, 17, 18];
const others = byDepth<number[]>([], lastBefore);
const all = routes(state().run.map);
for (const last of others) {
  const route = all.filter((candidate) => candidate[candidate.length - 2] === last).sort((a, b) => b.length - a.length)[0];
  if (!route) { console.log(`INFO  no route ends through slot ${last}`); continue; }
  const flown = flyRoute(route, () => {});
  console.log(`INFO  charge at the choice, route [${route.join(', ')}]: ${flown.charge ?? 'not reached'} | ${flown.ended} | ${flown.ships}`);
}
finish();
