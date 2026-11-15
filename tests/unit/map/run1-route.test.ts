// Track GEN: run 1 on the arm, headless, through the DESK (slice-3a-plan §6.1 map/run1-route; risk 6): the worked route
// [0, 2, 5, 11, 15, 19] (ARES-VII, HALCYON, KESTREL, VESPER, CORMORANT, LAST LIGHT) flown by wp11's strip-following kid
// with its defenders, every landing instant but the final ship's (flown by the strip through the duel to the choice, as
// wp11/full-run does). At each desk the kid sets course to the route's next ship. Checks: the desk between ships, the
// hop and its years (the galaxy year is the approach), the hits that land (round(d / 7) − ECC), the boot's sleep and ECC
// lines, the rings at each boot (02, 03, 04–06, 07–08, 09–11), HOLLOW's forced boarding at CORMORANT (M3), the run ending
// at the first final ship, and the route in run.ships. Prints the REPAIR CHARGE at the choice of a kid saving it for MERGE
// (risk 6: the MERGE margin moves to the route). Full depth (npm run balance) also flies the routes ending at PROVIDENCE,
// GOOD HOPE and WAYFARER, the kid following the tag at every desk.
// Slice 3b (Track REPO; slice-3b-plan §6.2): the tools come by request now (02 §3.14's table): Mv at ARES-VII, Rm at
// HALCYON, Swap at KESTREL, Cp at VESPER, nothing at CORMORANT (NEVER there). Checks: the tag at the first three desks
// (Mv, Rm, Swap), MOVE on HALCYON's boot, DELETE on KESTREL's, SWAP absent on VESPER and arriving on CORMORANT's (4 years
// late at VESPER, forwarded), COPY on LAST LIGHT's, each with its `> DELIVERY:` line, and `NEVER ARRIVED` empty. Prints
// VESPER's outcome flown without SWAP (plan risk 1: reported, not worked around).
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { receiveTransmission } from '@systems/boot';
import { shipLost, startRun, continueAfterReport, continueAfterLoss } from '@systems/run';
import { setCourseFromDesk, leaveOrbit as takeSalvage } from '../support/desk';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { followDirector } from '../wp2/harness2';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { chargeLeft } from '@state/selectors';

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
import { setRequest, recommendation, undeliveredFiles } from '@systems/repository';
import { REPO_TEXT } from '@data/repo-text';
import type { RepoFileId } from '@/types/repo';
import type { GameState } from '@state/schema';
import { actionRepair } from '@state/actions';
import { getByRole } from '@state/selectors';
import { getOpsBySeg } from '@systems/ops-core';
import { chooseEnding, finaleAtStep1 } from '../support/finale';

const WORKED: readonly number[] = [0, 2, 5, 11, 15, 19];
// 02 §3.14's requests, desk by desk along the worked route (CORMORANT's would never arrive: none).
const WORKED_REQUESTS: readonly (RepoFileId | null)[] = ['mv', 'rm', 'swap', 'cp', null];
const SEED = 3;
const h = createHarness11(1, { soulsFound: false });
mountStoryLog(h.store);
const state = (): Readonly<GameState> => h.store.getState();
// The kid plays for MERGE (wp11/full-run's even seeds): it heals the Core only back to its two threads, saving charge.
const SAVER = { coreHealBelow: 50, coreHealTo: 60 };
// The ships whose Thrust Ctrl the kid repaired when the strip asked (no Swap aboard).
const thrustRepairs: string[] = [];

interface Flown { route: readonly number[]; ended: string; ships: string; charge: number | null; failures: string[] }

function flyShip(): void {
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 1500,
    mistake: () => {
      h.defend11(SAVER);
      // The limping engine (slice 3b, Fran's decision): the strip says REPAIR THRUST CTRL, and the kid does.
      const shown = state().director.shown?.id ?? '';
      const thrust = getByRole(state(), 'thrust-ctrl');
      if ((shown === 'tut-ghost-noswap' || shown === 'tut-ghost-noswap-tab') && thrust !== null && getOpsBySeg(thrust.id).length === 0 && !state().clock.paused) {
        if (actionRepair(h.store, thrust) === null) thrustRepairs.push(state().level.shipName);
      }
      const deal = state().hollow.deal;
      if (deal.phase === 'offered' && deal.entryId !== null) pickChoice(deal.entryId, DEAL_REFUSE);
      if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
      return false;
    },
  });
}

// One run along `route`; `record` collects per-ship observations for the worked route's checks.
// `requests[i]`: what the kid requests at desk i (null: nothing; 'tag': whatever ARRIVAL CONTROL recommends there).
function flyRoute(route: readonly number[], record: (event: string, at: Readonly<GameState>) => void, requests: readonly (RepoFileId | null | 'tag')[] = []): Flown {
  h.newRun(SEED);
  startRun(h.store, SEED, FIRST_RUN_LINEAGE);
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
            if (picked || !finaleAtStep1(state())) return;
            picked = true;
            charge = chargeLeft(state());
            chooseEnding(h.store, charge >= MERGE_COST_CHARGE ? 'merge' : 'purge');
          },
        });
      }
      const end = h.wall() + 600;
      while (state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) { h.defend11(SAVER); h.step(); }
      if (state().run.phase === 'report') continueAfterReport(h.store);
      else if (shipLost(state())) continueAfterLoss(h.store);
    } else if (state().run.phase === 'report') continueAfterReport(h.store);
    // Playtest 1 (note 5): LEAVE ORBIT first, its first card taken.
  if (state().run.phase === 'leave') takeSalvage(h.store);
  if (state().run.phase === 'desk') {
      record('desk', state());
      const next = route[state().run.shipIndex + 1];
      if (next === undefined) { failures.push('the route ran out before the final ship'); break; }
      const wanted = requests[state().run.shipIndex] ?? null;
      const ask = wanted === 'tag' ? recommendation(state()) : wanted;
      if (ask !== null) setRequest(h.store, ask);
      setCourseFromDesk(h.store, next);
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
const toolsAt: Record<string, string[]> = {};
const tags: (RepoFileId | null)[] = [];
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
  if (event === 'flown') {
    licencesAt[at.level.shipName] = [...at.run.licences];
    toolsAt[at.level.shipName] = at.memory.filter((seg) => seg.type === 'fs-tool').map((seg) => seg.type === 'fs-tool' ? seg.fsTool : '');
  }
  if (event === 'desk') {
    desks.push({ slot: currentSlot(at.run), paused: at.clock.paused, offered: at.ui.deskSelected === null || typeof at.ui.deskSelected === 'number' });
    tags.push(recommendation(at));
  }
}, WORKED_REQUESTS);
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
check('…ARRIVAL CONTROL tags Mv at the first desk, Rm at HALCYON\'s, Swap at KESTREL\'s (VESPER: ENGINE FAULT two layers out)',
  tags.slice(0, 3).join() === 'mv,rm,swap', tags.join());
console.log(`INFO  the tag at each desk of the worked route: ${tags.map((tag) => tag ?? 'none').join(', ')}`);
const delivered = (slot: number, line: string): boolean => bootAt(slot)!.lines.includes(line);
check('…MOVE arrives on HALCYON\'s boot (`> DELIVERY: mv (arrived 2337)`), not before',
  delivered(2, REPO_TEXT.boot.delivery('mv', 2337)) && licencesAt.HALCYON?.includes('move') === true && licencesAt['ARES-VII']?.includes('move') === false,
  bootAt(2)!.lines.filter((line) => line.includes('DELIVERY')).join(' | '));
check('…DELETE on KESTREL\'s (`> DELIVERY: rm (arrived 2436)`), not on HALCYON',
  delivered(5, REPO_TEXT.boot.delivery('rm', 2436)) && licencesAt.KESTREL?.includes('delete') === true && !licencesAt.HALCYON?.includes('delete'),
  bootAt(5)!.lines.filter((line) => line.includes('DELIVERY')).join(' | '));
check('…SWAP absent on VESPER (4 years late), arriving on CORMORANT\'s (`> DELIVERY: swap (arrived 2659)`)',
  !licencesAt.VESPER?.includes('swap') && !toolsAt.VESPER?.includes('swap') && delivered(15, REPO_TEXT.boot.delivery('swap', 2659))
  && licencesAt.CORMORANT?.includes('swap') === true && !bootAt(11)!.lines.some((line) => line.includes('DELIVERY')),
  `${JSON.stringify(licencesAt)} | ${bootAt(15)!.lines.filter((line) => line.includes('DELIVERY')).join(' | ')}`);
check('…COPY on LAST LIGHT\'s (`> DELIVERY: cp (arrived 2915)`: 44 late at CORMORANT, forwarded), not on CORMORANT',
  delivered(19, REPO_TEXT.boot.delivery('cp', 2915)) && !licencesAt.CORMORANT?.includes('copy'),
  bootAt(19)!.lines.filter((line) => line.includes('DELIVERY')).join(' | '));
check('…NEVER ARRIVED is empty: every request reached the unit', undeliveredFiles(state().run).length === 0 && state().run.repo.requests.length === 4,
  JSON.stringify(state().run.repo.requests));
const vesper = state().run.ships.find((ship) => ship.shipName === 'VESPER');
console.log(`INFO  risk 1, VESPER flown without SWAP (ENGINE FAULT, 16 pods): ${vesper?.outcome ?? 'not reached'} · ${vesper?.landedInLz ?? '-'} of ${vesper?.colonistsAboard ?? '-'} colonists in an LZ · stars ${vesper?.stars ?? '-'} · fuel left ${vesper ? Math.round(vesper.fuelLeftPct) : '-'}%`);
// Slice 3b review (item 1): VESPER flown without Swap is a trade, never a dead end: it must not regress to stranded,
// crashed or escaped (it ends with the orbit locked or accepted; the instant landing then lands its pods).
check('…VESPER flown without SWAP (the kid repairing Thrust Ctrl when the strip asks) locks or is accepted and lands at least half its colonists in an LZ (review item 1, the limping engine)',
  vesper !== undefined && (vesper.outcome === 'locked' || vesper.outcome === 'partial') && vesper.landedInLz >= vesper.colonistsAboard / 2
  && thrustRepairs.includes('VESPER'), `${vesper?.outcome ?? 'not reached'} · ${vesper?.landedInLz} of ${vesper?.colonistsAboard} · repaired on ${thrustRepairs.join(', ') || 'none'}`);
console.log(`INFO  charge at the choice on the worked route (ends at CORMORANT → LAST LIGHT): ${worked.charge ?? 'not reached'}`);

// --- Risk 6 at full depth: the other last ships before the final one -------------------------------------------------------
const lastBefore = [16, 17, 18];
const others = byDepth<number[]>([], lastBefore);
const all = routes(state().run.map);
for (const last of others) {
  const route = all.filter((candidate) => candidate[candidate.length - 2] === last).sort((a, b) => b.length - a.length)[0];
  if (!route) { console.log(`INFO  no route ends through slot ${last}`); continue; }
  const flown = flyRoute(route, () => {}, route.slice(1).map(() => 'tag' as const));
  console.log(`INFO  charge at the choice, route [${route.join(', ')}], following the tag: ${flown.charge ?? 'not reached'} | ${flown.ended} | ${flown.ships}`
    + ` | requested ${state().run.repo.requests.map((request) => `${request.file}:${request.status}`).join(' ') || 'nothing'}`
    + ` | CURLEW ${state().run.ships.filter((ship) => ship.shipName === 'CURLEW').map((ship) => `${ship.outcome} fuel ${Math.round(ship.fuelLeftPct)}% ${ship.landedInLz}/${ship.colonistsAboard}`).join('') || '-'}`
    + ` | Thrust Ctrl repaired on ${thrustRepairs.splice(0).join(', ') || 'none'}`);
}
finish();
