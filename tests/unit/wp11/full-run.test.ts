// BALANCE_ONLY: slice 3b review (the unit tier's budget): the whole run on 50 seeds; map/run1-route flies the arm end to
// end on one, and wp11/merge-test and wp11/fix1 keep both endings in the quick tier.
// Track RETIRE: on run 1's arm since the classic five's retirement (it flew them until then): the worked route (02 §3.14),
// at each desk the request ARRIVAL CONTROL tags and SET COURSE to the route's next ship (the first desk's required pick is
// AUTOBURN v1, support/desk). The per-ship checks below are the arm's own facts where the classic five's differed
// (map/run1-route pins them on seed 3): the tools come by request, not by licence; HOLLOW boards on the beam into
// CORMORANT (M3: one hop from New Haven), not VESPER; VESPER flies without SWAP (it is still on its way), the kid
// repairing Thrust Ctrl when the strip asks (the limping engine), so VESPER locks or is accepted.
// WP11 acceptance 4 (§9 WP11): the whole run, headless, on 50 seeds. Title → ARES-VII → HALCYON → KESTREL → VESPER →
// CORMORANT → LAST LIGHT → RUN END, flown by the strip-following kid with the defenders (WP7's REPAIR and MOVE, WP9's sensor and
// seeds, WP10's pip → SWAP, WP11's verb blocks and the root's DELETE), [B] when AUTOBURN is offered, THE DEAL refused, the
// first card at every TRANSMIT, and at the finale MERGE on even seeds (when the charge pays for it) and PURGE on odd
// ones. A lost ship goes on the way its card's button does (continueAfterLoss). The run must end in the victory RUN END
// (won-purge or won-merge, the victory tone) in at least 90% of the seeds. Every module is in its initial state after a
// NEW RUN. Prints each seed's line.
// WP11 fix round 1 (the lead's rulings of 20:55 and 21:30): also LAST LIGHT's verbs (telegraphed, landed, blocked, and
// the turns skipped: no fair target, or no thread free to block with), its drivers lost, and the REPAIR CHARGE at the
// choice; at least half of the runs that reach the choice must have the 20 MERGE costs (the lead's target until slice 8, now information: OPEN-DECISIONS 109; the lever is
// the guidance, `MOVE it behind a WALL` once a driver is bitten again in the same spot, and the defender now MOVEs onto
// a spot the MOVE preview calls SAFE: harness11.ts).
// Slice 1a: every landing lands at once (tests/unit/support/landing-instant.ts) except LAST LIGHT's, which the kid flies
// by the strip ([L] when the strip asks, followLanding) while the duel goes on, as boss-sim's C does. FINAL_LANDING=stand
// instead keeps phase 2's exposure: LAST LIGHT's landing stands FINAL_LANDING_SEC AI seconds (phase 2's 16 × 3.0 s of
// printing), then lands at once.
// Slice 2 (slice-2-plan §6.2): wp7/, wp9/ and wp10/run-flow are folded in here as per-ship checks, evaluated on every
// seed's run and reported once each with how often they were checked:
// • every hand-over: nothing running, memory valid, every reset module initial; the carried Engine I/O less the logged
//   hits; the charge that crossed (min(held, link − files)) plus 6 per ★, the card's, the floor, less any overflow; the
//   crossing's hits; a divider naming the ship on both screens; the boot's ECC and charge lines; 046.log's keys;
// • ARES-VII and HALCYON calm (HALCYON opens TOO WIDE with IN engaged; MOVE by its delivery);
// • KESTREL: its own sensor damage, the run-1 beam seed next to Telemetry and AUTOBURN.skl (bought at the first desk) at its
//   boot; blind at first; DELETE and MOVE by their deliveries; the seed rm'd, the sensor repaired, the debris dodged;
// • VESPER: Thrust Ctrl at 31% unscanned, no HOLLOW aboard; locked or accepted without SWAP;
// • CORMORANT: HOLLOW's forced boarding with its root, SWAP by its delivery; HOLLOW's fight after the capture, and its name;
// • LAST LIGHT: THE DEAL offered and refused; every ship but VESPER locked to its LANDING REPORT; RUN END's sums.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from './harness11';
import { receiveTransmission } from '@systems/boot';
import { shipLost, startRun, continueAfterReport, continueAfterLoss } from '@systems/run';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { setCourseFromDesk } from '../support/desk';
import { setRequest, recommendation } from '@systems/repository';
import { currentShip } from '@systems/map-run';
import { hitsLanding } from '@systems/map-hop';
import { WORKED_ROUTE } from '@systems/arm-fixture';
import { actionRepair } from '@state/actions';
import { getOpsBySeg } from '@systems/ops-core';
import { layoutOf } from '@data/memory';
import { runEndModel } from '@systems/run-end';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { followDirector } from '../wp2/harness2';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { resetReport } from '@systems/reset';
import { chargeLeft } from '@state/selectors';
import { MERGE_COST_CHARGE } from '@data/tuning';

import type { GameState } from '@state/schema';
import { byDepth } from '../depth';
import { setLandingMode } from '../support/landing-instant';
import { followLanding } from '../landing/harness-landing';
import { mountStoryLog } from '@systems/story-log';
import { logEntriesAtBoot } from '@state/log-selectors';
import { pickCard } from '@systems/draft';
import { getOps } from '@systems/ops-core';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { capabilitiesNow } from '@systems/capabilities';
import { theRoot } from '@systems/hollow';
import { runScore, runLanded } from '@systems/run-score';
import { beamSeedsInMemory } from '@state/threat-selectors';
import { getByRole, hasIntegrity } from '@state/selectors';
import { LINES, transitEccLine, scriptedDamageLine } from '@data/script';
import { LOG_TEXT } from '@data/log-text';
import { eccSeedsLine } from '@data/threat-text';
import { STAR_CHARGE_BONUS, BAND_OK_MIN } from '@data/tuning';
import { solLy } from '@systems/map-geometry';
import { chooseEnding, finaleAtStep1 } from '../support/finale';
import { writeMetrics } from '../support/balance-out';

const FINAL_LANDING_SEC = Number(process.env.FINAL_LANDING_SEC ?? 48);
// FINAL_LANDING: 'strip' (default: LAST LIGHT's landing by the strip) or 'stand' (FINAL_LANDING_SEC, then instant).
const FINAL_LANDING = process.env.FINAL_LANDING ?? 'strip';
if (FINAL_LANDING !== 'strip' && FINAL_LANDING !== 'stand') throw new Error(`FINAL_LANDING=${FINAL_LANDING} is neither strip nor stand`);
const FINAL_STRIP = FINAL_LANDING === 'strip';

// Quick depth (tests/unit/depth.ts): seed 6, a MERGE run whose charge at the choice pays for it (19 on the arm against
// MERGE's 16; slice 8 ENDINGS moved it from seed 4, which reaches the choice with 13: the lowest even seed that affords the
// new price, plan §2.10), the longer of the two endings (THE DEAL's choice, MERGE's typed ending, the drivers given back). Slice 3a's
// review fixes (the unit tier's budget): seed 3's PURGE run left the quick depth; PURGE is flown to its RUN END by
// wp11/merge-test's PURGE scenario and wp11/fix1's, and both endings in one sweep by RUN_SEEDS=4 or `npm run balance`.
// Full: 1–50. RUN_SEEDS=n flies seeds 1–n.
const SEED_LIST: readonly number[] = process.env.RUN_SEEDS !== undefined
  ? Array.from({ length: Number(process.env.RUN_SEEDS) }, (_, i) => i + 1)
  : byDepth([6], Array.from({ length: 50 }, (_, i) => i + 1));
const SEEDS = SEED_LIST.length;
// The MERGE-charge share is information since slice 8 (below: the target is the playthrough's). The per-ship checks, the
// victory rate and both endings hold on any count that flies an even seed with the charge for MERGE and an odd one.
const h = createHarness11(1, { soulsFound: false });
mountStoryLog(h.store);
const state = (): Readonly<GameState> => h.store.getState();

// --- The per-ship checks (wp7, wp9 and wp10's run-flow, folded in) ------------------------------------------------------
// Each is evaluated wherever its moment comes on every seed; the suite reports each once, with how often it was checked
// and the first seeds that broke it.
let seedNow = 0;
const perShip = new Map<string, { runs: number; fails: string[] }>();
function expect(name: string, ok: boolean, detail = ''): void {
  const entry = perShip.get(name) ?? { runs: 0, fails: [] };
  entry.runs++;
  if (!ok) entry.fails.push(`seed ${seedNow}: ${detail}`);
  perShip.set(name, entry);
}
// By entry id, not index: the log keeps its last LOG_MAX_ENTRIES (six ships' boots outgrow it).
const said = (afterId: number): string[] => state().log.entries.filter((entry) => entry.id > afterId).map((entry) => entry.text);
const integrityOf = (role: 'engine-io' | 'sensor' | 'thrust-ctrl'): number => {
  const file = getByRole(state(), role);
  return file !== null && hasIntegrity(file) ? file.integrity : -1;
};
// Where this ship's events and lines start (its boot).
let eventsAtBoot = 0;
let logAtBoot = -1;

// TRANSMIT ▸ with the hand-over's checks: the first card picked (as the harness would), the packet read, then the arrival.
function transmitChecked(): void {
  const before = state().run.transit;
  if (before && before.pick === null && before.offer.length > 0) pickCard(h.store, before.offer[0]!.id);
  const plan = state().run.transit!;
  const engineBefore = integrityOf('engine-io');
  const stars = state().run.pendingStars;
  const credit = state().run.pendingStarCredit;
  eventsAtBoot = h.events.length;
  logAtBoot = state().log.entries.at(-1)?.id ?? -1;
  h.transmit();
  const arrival = state().run.arrival!;
  const ship = currentShip(state());
  const hop = state().run.map.route.at(-1)!.hop!;
  let memoryOk = true;
  try { assertMemoryInvariants(state().memory, layoutOf(state()).totalBlocks); } catch { memoryOk = false; }
  expect('every hand-over: no op running, memory its class\'s size and valid, every reset module in its initial state',
    getOps().length === 0 && memoryOk && resetReport().length === 0, `${ship.name}: ${JSON.stringify(resetReport())}`);
  const engineHits = arrival.hits.filter((hit) => hit.role === 'engine-io').reduce((sum, hit) => sum + (hit.from - hit.to), 0);
  expect('every hand-over: the carried Engine I/O = its integrity before the beam minus the hits the log names',
    Math.abs(integrityOf('engine-io') - (engineBefore - engineHits)) < 1e-9, `${ship.name}: ${engineBefore} − ${engineHits} → ${integrityOf('engine-io')}`);
  const crossed = Math.min(plan.chargeHeld, plan.linkBlocks - plan.filesBlocks);
  const total = arrival.chargeCarried + arrival.starCredit + arrival.cardCharge + arrival.chargeFloorAdded - arrival.chargeOverflowLost;
  expect('every hand-over: min(charge held, link − files) crosses, then +6 per ★, the card\'s, the floor, less any overflow',
    arrival.chargeCarried === crossed && arrival.starCredit === credit && credit === STAR_CHARGE_BONUS * stars && chargeLeft(state()) === total,
    `${ship.name}: held ${plan.chargeHeld}, link ${plan.linkBlocks} − files ${plan.filesBlocks} → ${arrival.chargeCarried}; ★ ${stars} → ${arrival.starCredit}; total ${total} vs ${chargeLeft(state())}`);
  if (plan.extraHits === 0 && plan.coreHit === 0 && !plan.coreReset) {
    expect('every hand-over (no emergency): the crossing dealt the hop\'s hits less what ECC corrected (round(d / 7) − ECC)',
      arrival.hits.length === hitsLanding(hop, 0), `${ship.name}: ${arrival.hits.length} of ${hitsLanding(hop, 0)}`);
  }
  const dividers = state().log.entries.filter((entry) => entry.divider && entry.text === LINES.logDivider(ship.name));
  expect('every hand-over: the log keeps its history, with a divider naming the ship on both screens', dividers.length === 2
    && new Set(dividers.map((entry) => entry.channel)).size === 2, `${ship.name}: ${dividers.length}`);
}

// The boot just ended: its lines, then the ship's opening state.
function bootChecked(): void {
  const index = state().run.shipIndex;
  const ship = currentShip(state());
  const route = state().run.map.route;
  const arrival = state().run.arrival;
  const lines = said(logAtBoot);
  if (arrival !== null) {
    expect('every boot after a beam: the ECC line from the actual hits, then the charge line',
      lines.includes(transitEccLine(arrival.hits)) && lines.some((text) => text.startsWith('> +')),
      `${ship.name} (${state().run.phase}): ${lines.join(' | ')}`);
  }
  // Slice 3a: the rings (05 §3.2): this boot finds the rings between the last ship's world and this one's, and on the final
  // ship 10–11.
  const solOf = (i: number): number => solLy(route[i]!.slot);
  const before = index === 0 ? [] : logEntriesAtBoot(solOf(index - 1), false);
  const keys = logEntriesAtBoot(solOf(index), ship.final).filter((entry) => !before.includes(entry));
  if (keys.length > 0) {
    expect('every boot past ship 1: `> 046.log · KEY FOUND`, and the run finds its entries (02, 03, 04–06, 07–08, 09–11)',
      lines.includes(LOG_TEXT.keyFound(keys)) && keys.every((entry) => state().run.log.found.includes(entry)),
      `${ship.name}: ${JSON.stringify(state().run.log.found)}`);
  }
  if (ship.name === 'HALCYON') {
    expect('HALCYON opens TOO WIDE with IN engaged', /^TOO WIDE/.test(h.objective()?.text ?? '') && state().burn.sasMode === 'radial-in',
      h.objective()?.text ?? '');
  }
  if (ship.name === 'KESTREL' && arrival !== null) {
    expect('KESTREL\'s boot: its own damage line (SENSOR INTERP 45% — PATH UNCERTAIN), Sensor Interp at 45',
      lines.includes(scriptedDamageLine(arrival.scripted)) && integrityOf('sensor') <= 45, `${integrityOf('sensor')} | ${lines.join(' | ')}`);
    expect('KESTREL\'s boot (run 1): one beam seed, next to Telemetry, named on the ECC seeds line',
      arrival.seeds.length === 1 && arrival.seeds[0]!.targetName === 'Telemetry' && lines.includes(eccSeedsLine(['Telemetry']))
        && beamSeedsInMemory(state().memory).length === 1, JSON.stringify(arrival.seeds));
    expect('KESTREL\'s boot: AUTOBURN.skl v1 in memory (the first desk\'s pick, carried in the packet)',
      state().memory.some((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn'), `${state().run.stats.demos.length} captures`);
    expect('KESTREL flies blind at first (PATH UNCERTAIN)', capabilitiesNow(state()).plot.mode === 'uncertain', capabilitiesNow(state()).plot.mode);
  }
  if (ship.name === 'VESPER') {
    const thrust = getByRole(state(), 'thrust-ctrl');
    expect('VESPER\'s boot: no HOLLOW aboard (CORMORANT is one hop from New Haven, not VESPER); Thrust Ctrl at 31%, unscanned',
      !h.events.slice(eventsAtBoot).some((event) => event.name === 'hollow-boarded') && theRoot(state().memory) === null
        && thrust !== null && hasIntegrity(thrust) && thrust.integrity === 31 && 'scanned' in thrust && !thrust.scanned,
      `root ${theRoot(state().memory)?.size}, thrust ${integrityOf('thrust-ctrl')}`);
  }
  if (ship.name === 'CORMORANT') {
    expect('CORMORANT\'s boot: HOLLOW boards, forced (M3: New Haven is one hop away), with its root in the slot',
      h.events.slice(eventsAtBoot).some((event) => event.name === 'hollow-boarded') && state().run.arrival?.boarded?.cause === 'forced'
        && (theRoot(state().memory)?.size ?? 0) > 0, `${state().run.arrival?.boarded?.cause ?? 'not boarded'}, root ${theRoot(state().memory)?.size}`);
  }
}

// The ship's landing is over (its LANDING REPORT is up, or it was lost): what its flight did.
function shipChecked(): void {
  const ship = currentShip(state());
  const events = h.events.slice(eventsAtBoot);
  const licences = state().run.licences;
  if (ship.name === 'VESPER') {
    expect('VESPER (ENGINE FAULT, no SWAP aboard yet) locks or is accepted and reaches its LANDING REPORT',
      state().run.phase === 'report' && (state().burn.status === 'locked' || state().burn.status === 'accepted'),
      `${ship.name}: ${state().run.phase} ${state().burn.status}`);
  } else {
    expect('every ship but VESPER locks and reaches its LANDING REPORT', state().run.phase === 'report' && state().burn.status === 'locked',
      `${ship.name}: ${state().run.phase} ${state().burn.status}`);
  }
  if (ship.name === 'ARES-VII' || ship.name === 'HALCYON') {
    expect('ARES-VII and HALCYON are calm: no HOLLOW block, no bite', !state().memory.some((seg) => seg.type === 'hollow')
      && !events.some((event) => event.name === 'hollow-infect'), ship.name);
  }
  if (ship.name === 'HALCYON') {
    expect('HALCYON: MOVE by its delivery (requested at the first desk), no DELETE yet', licences.includes('move') && !licences.includes('delete'),
      licences.join(','));
  }
  if (ship.name === 'KESTREL') {
    expect('KESTREL: DELETE and MOVE by their deliveries', licences.includes('delete') && licences.includes('move'), licences.join(','));
    expect('KESTREL: the beam seed rm\'d before the ship ends', beamSeedsInMemory(state().memory).length === 0
      && events.some((event) => event.name === 'seed-deleted'), String(beamSeedsInMemory(state().memory).length));
    expect('KESTREL: Sensor Interp repaired', integrityOf('sensor') >= BAND_OK_MIN, String(integrityOf('sensor')));
    expect('KESTREL: the early IN correction cleared the debris (0 hits)', !events.some((event) => event.name === 'zone-hit'));
  }
  if (ship.name === 'VESPER') {
    expect('VESPER: no SWAP yet (it is on its way: 4 years late), the kid repaired Thrust Ctrl when the strip asked', !licences.includes('swap')
      && thrustRepairedOn.includes('VESPER'), `${licences.join(',')} | repaired on ${thrustRepairedOn.join(',') || 'none'}`);
  }
  if (ship.name === 'CORMORANT') {
    expect('CORMORANT: SWAP by its delivery', licences.includes('swap'), licences.join(','));
    expect('CORMORANT: HOLLOW fought after the capture (it bit) and named itself', events.some((event) => event.name === 'hollow-infect')
      && state().run.hollowNamed, `named ${state().run.hollowNamed}`);
  }
  if (ship.final) {
    expect('LAST LIGHT: THE DEAL offered and refused', state().run.stats.deal?.outcome === 'refused', JSON.stringify(state().run.stats.deal));
  }
}

// A kid playing for MERGE saves REPAIR CHARGE (VESPER's boot: `> keep 16 charge for me`): it heals the Core only back to
// its two threads.
let defendOpts: { coreHealBelow?: number; coreHealTo?: number } = {};

// The ships whose Thrust Ctrl the kid repaired when the strip asked (no Swap aboard: the limping engine, map/run1-route's).
const thrustRepairedOn: string[] = [];

function flyShip(): void {
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 1500,
    mistake: () => {
      h.defend11(defendOpts);
      const shown = state().director.shown?.id ?? '';
      const thrust = getByRole(state(), 'thrust-ctrl');
      if ((shown === 'tut-ghost-noswap' || shown === 'tut-ghost-noswap-tab') && thrust !== null && getOpsBySeg(thrust.id).length === 0 && !state().clock.paused) {
        if (actionRepair(h.store, thrust) === null) thrustRepairedOn.push(state().level.shipName);
      }
      const deal = state().hollow.deal;
      if (deal.phase === 'offered' && deal.entryId !== null) pickChoice(deal.entryId, DEAL_REFUSE);
      if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
      return false;
    },
  });
}

// Defends through the landing to the LANDING REPORT (on the flagship: through the duel and the choice).
function toReport(choice: 'purge' | 'merge'): boolean {
  if (currentShip(state()).final && FINAL_STRIP) {
    let picked = false;
    followLanding(h, {
      maxWall: 900,
      onTick: () => {
        h.defend11(defendOpts);
        if (picked || !finaleAtStep1(state())) return;
        picked = true;
        chargeAtChoice = chargeLeft(state());
        const hollow = state().hollow;
        verbsAtChoice = { moments: hollow.verbMoments, telegraphed: hollow.verbsLanded + hollow.verbsBlocked, landed: hollow.verbsLanded, blocked: hollow.verbsBlocked };
        chooseEnding(h.store, choice === 'merge' && chargeLeft(state()) >= MERGE_COST_CHARGE ? 'merge' : 'purge');
      },
    });
  } else if (currentShip(state()).final) {
    const end = h.wall() + 600;
    while (!finaleAtStep1(state()) && state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) {
      h.defend11(defendOpts);
      h.step();
    }
    if (finaleAtStep1(state())) {
      chargeAtChoice = chargeLeft(state());
      const hollow = state().hollow;
      verbsAtChoice = { moments: hollow.verbMoments, telegraphed: hollow.verbsLanded + hollow.verbsBlocked, landed: hollow.verbsLanded, blocked: hollow.verbsBlocked };
      const pick = choice === 'merge' && chargeLeft(state()) >= MERGE_COST_CHARGE ? 'merge' : 'purge';
      h.finishFinale(pick, 600, defendOpts);
    }
  }
  const end = h.wall() + 600;
  while (state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) { h.defend11(defendOpts); h.step(); }
  if (currentShip(state()).final) lostOnLastLight = state().landing.pods.filter((record) => record.driverLost !== null).length;
  return state().run.phase === 'report';
}

interface VerbCounts { moments: number; telegraphed: number; landed: number; blocked: number }
interface SeedResult {
  seed: number; cause: string; tone: string; landed: number; ships: string; wall: number; charge: number | null; verbs: VerbCounts | null; lost: number | null;
}
let chargeAtChoice: number | null = null;
let verbsAtChoice: VerbCounts | null = null;
let lostOnLastLight: number | null = null;
const results: SeedResult[] = [];
const started = Date.now();
for (const seed of SEED_LIST) {
  h.newRun(seed);
  startRun(h.store, seed, FIRST_RUN_LINEAGE);
  thrustRepairedOn.length = 0;
  seedNow = seed;
  eventsAtBoot = h.events.length;
  logAtBoot = state().log.entries.at(-1)?.id ?? -1;
  receiveTransmission(h.store);
  h.stepUntil(() => state().run.phase === 'flight', 15);
  bootChecked();
  const choice = seed % 2 === 0 ? 'merge' : 'purge';
  defendOpts = choice === 'merge' ? { coreHealBelow: 50, coreHealTo: 60 } : {};
  chargeAtChoice = null;
  verbsAtChoice = null;
  lostOnLastLight = null;
  let guard = 0;
  // Fail fast (slice 2 foundation): a pass of the loop that moves the run on nowhere (same ship, phase and flight status)
  // would only repeat its long maxWall waits up to the guard (a stuck flight spun this suite for minutes); stop the seed.
  let progress = '';
  while (state().run.phase !== 'end' && guard++ < 12) {
    const here = `${state().run.shipIndex}:${state().run.phase}:${state().burn.status}:${state().hollow.finale.phase}`;
    if (here === progress) break;
    progress = here;
    if (state().run.phase === 'boot') h.stepUntil(() => state().run.phase !== 'boot', 25);
    setLandingMode(!currentShip(state()).final ? 'instant' : FINAL_STRIP ? 'manual' : FINAL_LANDING_SEC > 0 ? { after: FINAL_LANDING_SEC } : 'instant');
    if (state().run.phase === 'flight' && state().burn.status === 'approaching' && !state().run.coreLost) flyShip();
    if (shipLost(state())) {
      // The LOST card's button.
      shipChecked();
      continueAfterLoss(h.store);
    } else if (state().run.phase === 'landing') {
      if (!toReport(choice) && !shipLost(state())) break;
      shipChecked();
      if (state().run.phase === 'report') continueAfterReport(h.store);
    } else if (state().run.phase === 'report') {
      shipChecked();
      continueAfterReport(h.store);
    }
    if (state().run.phase === 'desk') {
      const next = WORKED_ROUTE[state().run.map.route.length];
      if (next === undefined) break;
      const ask = recommendation(state());
      if (ask !== null) setRequest(h.store, ask);
      setCourseFromDesk(h.store, next);
    }
    if (state().run.phase === 'transmit') {
      transmitChecked();
      h.stepUntil(() => state().run.phase === 'flight', 60);
      bootChecked();
    }
  }
  const ended = state().run.phase === 'end';
  const model = ended ? runEndModel(state()) : null;
  if (ended) {
    const ships = state().run.ships;
    expect('RUN END: a result for each of the route\'s six ships; LANDED is the colonists down in an LZ, SCORE the landing points', ships.length === WORKED_ROUTE.length
      && runLanded(ships) === ships.reduce((sum, ship) => sum + ship.landedInLz, 0) && runScore(ships) === ships.reduce((sum, ship) => sum + ship.points, 0)
      && runScore(ships) > 0, `${ships.length} ships, landed ${runLanded(ships)}, score ${runScore(ships)}`);
  }
  const line: SeedResult = {
    seed,
    cause: state().run.endCause ?? `(${state().run.phase} on ${state().level.shipName})`,
    tone: model?.tone ?? '-',
    landed: model?.landed ?? 0,
    ships: state().run.ships.map((ship) => `${ship.shipName}:${ship.outcome}`).join(' '),
    wall: h.wall(),
    charge: chargeAtChoice,
    verbs: verbsAtChoice,
    lost: lostOnLastLight,
  };
  results.push(line);
  const verbText = line.verbs ? `verbs ${line.verbs.telegraphed} (${line.verbs.landed} landed, ${line.verbs.blocked} blocked, ${line.verbs.moments - line.verbs.telegraphed} skipped)` : 'verbs -';
  console.log(`seed ${String(seed).padStart(2)}: ${line.cause.padEnd(12)} ${line.tone.padEnd(7)} landed ${String(line.landed).padStart(5)} charge at the choice ${String(line.charge ?? '-').padStart(3)} | LAST LIGHT lost ${line.lost ?? '-'} | ${verbText} | ${line.ships}`);
}
const victories = results.filter((result) => (result.cause === 'won-purge' || result.cause === 'won-merge') && result.tone === 'victory').length;
const merges = results.filter((result) => result.cause === 'won-merge').length;
console.log(`${SEEDS} runs in ${((Date.now() - started) / 1000).toFixed(0)} s: ${victories} victories (${merges} MERGE)`);
const atChoice = results.filter((result) => result.charge !== null);
const charges = atChoice.map((result) => result.charge!).sort((a, b) => a - b);
const affordable = charges.filter((charge) => charge >= MERGE_COST_CHARGE).length;
const sum = (pick: (verbs: VerbCounts) => number): number => atChoice.reduce((total, result) => total + (result.verbs ? pick(result.verbs) : 0), 0);
const lostRuns = results.filter((result) => result.lost !== null);
console.log(`LAST LIGHT over the ${atChoice.length} runs that reached the choice: REPAIR CHARGE median ${charges[Math.floor(charges.length / 2)]}, `
  + `range ${charges[0]}–${charges[charges.length - 1]}, ≥ ${MERGE_COST_CHARGE} in ${affordable}; verbs per ship ${(sum((verbs) => verbs.telegraphed) / atChoice.length).toFixed(1)} `
  + `(landed ${(sum((verbs) => verbs.landed) / atChoice.length).toFixed(2)}, blocked ${(sum((verbs) => verbs.blocked) / atChoice.length).toFixed(1)}, `
  + `skipped turns ${(sum((verbs) => verbs.moments - verbs.telegraphed) / atChoice.length).toFixed(1)}); drivers lost `
  + `${(lostRuns.reduce((total, result) => total + result.lost!, 0) / Math.max(1, lostRuns.length)).toFixed(2)} on average (worst ${Math.max(...lostRuns.map((result) => result.lost!))})`);
for (const [name, { runs, fails }] of perShip) check(`${name} (checked ${runs}×)`, fails.length === 0, fails.slice(0, 3).join(' | '));
// Slice 8 ENDINGS (plan §2.10, OPEN-DECISIONS 109): information, no longer a check. This kid trains nothing past the first
// pick and takes the first card dealt, so it reaches the choice with less charge than any kid the target names (on the
// arm: median 13, range 0–25 on seeds 1–10, played for MERGE or not alike). The target is G6b's, the playthrough's
// COMPETENT and LITERAL (npm run balance:report, merge.afford.*).
console.log(`INFO  …runs reaching the choice with the ${MERGE_COST_CHARGE} MERGE costs: ${affordable}/${atChoice.length} (the WP11 kid; the target is the playthrough's, G6b)`);
check(`the route's six ships end in the victory RUN END in ≥ 90% of ${SEEDS} seeds`, victories >= Math.ceil(0.9 * SEEDS), `${victories}/${SEEDS}`);
if (SEEDS >= 2) check('…both endings were reached', merges > 0 && victories - merges > 0, `${merges} MERGE, ${victories - merges} PURGE`);
else check('…the quick seed reached its MERGE (PURGE: merge-test and fix1)', merges === SEEDS, `${merges} MERGE, ${victories - merges} PURGE`);
setLandingMode('instant');
h.newRun(Math.max(...SEED_LIST) + 1);
check('NEW RUN: every reset module in its initial state', resetReport().length === 0, JSON.stringify(resetReport()));
// Slice 8 Step 0 (slice-8-plan §2.10): MERGE's margin for the balance report (BALANCE_JSON; nothing without it).
const quantile = (q: number): number | null => (charges.length === 0 ? null : charges[Math.min(charges.length - 1, Math.floor(q * charges.length))]!);
writeMetrics('full-run', {
  'merge.afford.fullrun': atChoice.length === 0 ? null : (100 * affordable) / atChoice.length,
  'merge.charge.p25': quantile(0.25), 'merge.charge.median': quantile(0.5), 'merge.charge.p75': quantile(0.75),
  'win.fullrun': (100 * victories) / SEEDS,
}, { seeds: SEEDS, mergeCost: MERGE_COST_CHARGE });
finish();
