// Slice 7a, Track FINALE (docs/phase3/impl/slice-7-plan.md §6.1 ending/finale-flow): the FINALE flown, headless, on LAST
// LIGHT of seed 7's arm (run 1's worked route beamed desk to desk with no flights, LAST LIGHT locked at once: flyOnce), and
// the classic LAST LIGHT once (wp11's shared duel).
// • ASLEEP (R6): the root's DELETE leaves its last block asleep: `> 047. wait. finish your landing. i'll be here.`, no bite,
//   seed or verb after, the landing goes on; the card comes once the landing has settled, FINALE_OPEN_DELAY_SEC on (no pick
//   before it), entry 12 found as it opens, the arbiter shut.
// • THE LANDING OVER FIRST (designer item 2): `> 047. wait.` and the card at once.
// • THE CARD (R7, R8, R11, M6): step 1's rows and prices; a pick is a pick ([ESC] back keeps it, nothing applied); MERGE
//   refused at 19; MERGE picked at 21 and a REPAIR under the card draining it: the confirm goes back to step 1; SPARE refused
//   at FUEL 19% and greying SUNSET (`SPARE GIVES IT THE SHIP`, named: designer item 3).
// • STAY (R9, M3): 0 ships (needs), 1 (confirms at once), 3 (WHICH COLONY?, pickStay, a stray slot refused); the record
//   names the colony and its year; the ENDING CHOSEN save of it encodes and decodes (the codec's STAY and record checks).
// • THE VERDICT (R13): at most 3 lines, the commands echoed in the TERMINAL, CONTROL's line on the radio once typed, 'done'
//   after it, the LANDING REPORT and its ending line (`ENDING · PURGE · STAND BY`).
// • MERGE (7b, in place of R15's interim): every block of HOLLOW taken in at the confirm, the eaten driver back by radio as
//   THE LAST LANDING starts after the verdict ('last-landing'), the restored pod lands ([ENTER]), then 'done'; the record keeps
//   the charge as the confirm left it.
// • MERGE + SUNSET at FUEL 22% (review M1): the reopened landing's engine is shut, so the ship leaves with the record's FUEL.
// • UNRESOLVED (R10): its card held while a pod falls (review m5); IT FOLLOWED YOU (no entry 12, no step-1 pick), CONTINUE, SUNSET still allowed, the root stays.
import '../support/classic-world';
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { toTheDuel } from '../wp11/duel';
import { flyOnce } from '../wp1-rules/flows';
import { send } from '../map/repo-fixture';
import { WORKED_ROUTE } from '../map/run1-fixture';
import { receiveTransmission } from '@systems/boot';
import { startRun } from '@systems/run';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { theRoot } from '@systems/hollow';
import { replaceRange, requireAddr, newSegId } from '@systems/memory-ops';
import { driverName } from '@data/landing-text';
import type { HollowSegment } from '@/types/segment';
import { mountStoryLog } from '@systems/story-log';
import { skipLastLanding } from '@systems/last-landing';
import {
  pickStep1, pickStep2, pickStay, backToStep1, continueFollowed, skipFinaleEnding, finaleEndingShowing,
} from '@systems/finale';
import { optionState, emptyShip, stayCandidates, endingRecordOf, finaleRunCause, reportEndingLine } from '@systems/ending-rules';
import { choiceMayOpen } from '@systems/say';
import { buildRunSave, encodeRunSave, decodeRunSave } from '@systems/save-codec';
import { actionDelete, actionRepair, recordDriverLost } from '@state/actions';
import { chargeLeft, driversInMemory, engineOpen, finalePending, finaleCardUp, isHollow, getByRole, integrityState } from '@state/selectors';
import { setFiring } from '@systems/flight-controls';
import { shownFuelPct } from '@systems/flight-hud';
import { getOpsBySeg, cancelOp } from '@systems/ops-core';
import { setLandingMode, landInstantly } from '../support/landing-instant';
import { finaleAtStep1, settleFinale, chooseEnding } from '../support/finale';
import { FINALE_TEXT } from '@data/finale-text';
import { EMPTY_SHIP_FUEL_PCT, FINALE_OPEN_DELAY_SEC, FINALE_VERDICT_MAX_LINES, MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY, ROOT_DELETE_SEC } from '@data/tuning';
import type { GameState, ShipResult } from '@state/schema';

const SEED = 7;
const h = createHarness11(SEED, { soulsFound: false });
mountStoryLog(h.store);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();
const said = (text: string): boolean => state().log.entries.some((entry) => entry.text === text);
const eventsSince = (from: number, name: string): number => h.events.slice(from).filter((event) => event.name === name).length;

// HOLLOW held still (no bite, seed or verb on its own), as wp11/duel does: each scenario's eating is its own.
function holdHollow(): void {
  h.store.update((d) => {
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.hollow.verb = null;
  });
}

// LAST LIGHT on seed 7's arm: run 1, the worked route beamed desk to desk (no flights), LAST LIGHT locked at once, the duel on.
function toArmDuel(): void {
  flyOnce(h, 'finale-flow arm duel', () => {
    h.newRun(SEED);
    startRun(h.store, SEED, FIRST_RUN_LINEAGE, 'arm');
    receiveTransmission(h.store);
    h.store.update((d) => { d.run.phase = 'report'; });
    // 02 §3.14's requests along the worked route (map/run1-route's): Mv, Rm, Swap, Cp, nothing at CORMORANT.
    const asks = ['mv', 'rm', 'swap', 'cp', null] as const;
    WORKED_ROUTE.slice(1).forEach((slot, i) => send(h.store, slot, asks[i] ?? null));
    h.stepUntil(() => state().run.phase === 'flight', 40);
    // The beamed route took its transit hits with nobody to repair them: the kid's tools are whole (a DELETE that works).
    h.store.update((d) => {
      for (const seg of d.memory) {
        if (seg.type === 'fs-tool' && 'integrity' in seg) {
          seg.integrity = 100;
          seg.state = integrityState(100);
        }
      }
      d.ui.memoryRev++;
    });
    h.startLanding(1, 'locked');
    h.step();
    if (state().hollow.finale.phase !== 'duel') throw new Error(`finale-flow: LAST LIGHT's duel did not open (${state().hollow.finale.phase})`);
  });
  holdHollow();
}

function deleteRoot(): void {
  const root = theRoot(state().memory);
  if (root === null) throw new Error('finale-flow: no root');
  const refusal = actionDelete(h.store, root);
  if (refusal !== null) throw new Error(`finale-flow: the root's DELETE was refused (${refusal})`);
  const end = h.wall() + ROOT_DELETE_SEC + 2;
  while (state().hollow.finale.phase === 'duel' && h.wall() < end) h.step();
}

function setCharge(points: number): void {
  h.store.update((d) => {
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    if (pool?.type !== 'redundancy') throw new Error('finale-flow: no REPAIR CHARGE');
    // A bigger pool takes its room from the largest free region (the memory's sizes still sum to its blocks).
    const grow = Math.max(0, points - pool.size);
    if (grow > 0) {
      const free = d.memory.filter((seg) => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0];
      if (free === undefined || free.size <= grow) throw new Error('finale-flow: no room to grow the charge');
      free.size -= grow;
      pool.size += grow;
    }
    pool.used = points;
    d.ui.memoryRev++;
  });
}

function setFuel(pct: number): void {
  h.store.update((d) => { d.landing.fuelAtEndPct = pct; });
}

function untilPhase(phase: GameState['hollow']['finale']['phase'], maxWall = 60): boolean {
  const end = h.wall() + maxWall;
  while (state().hollow.finale.phase !== phase && h.wall() < end) h.step();
  return state().hollow.finale.phase === phase;
}

// The card's step 1 up on the arm's LAST LIGHT: every pod landed under the sleeping root, the card's delay run out.
function toArmCard(): void {
  flyOnce(h, 'finale-flow arm card', () => {
    toArmDuel();
    deleteRoot();
    landInstantly(h.store);
    settleFinale(h.store, () => h.step());
  });
  holdHollow();
}

// A ship of the run made ★ ON TARGET by its pods (its colony named), for STAY's pick.
function onTarget(result: ShipResult, colony: string): void {
  result.colony = colony;
  result.pods = [{ pod: 1, family: 'OKAFOR', colonists: 200, fate: 'down', place: 'lz', lz: 'LZ-A', touch: 'soft', points: 0, parkedWhy: null, restored: false, featured: [] }];
}

// --- ASLEEP and the card's open (R6) -----------------------------------------------------------------------------------------
toArmDuel();
check('LAST LIGHT on seed 7\'s arm: the final ship, locked, the duel on', state().run.map.world === 'arm' && state().level.shipName === 'LAST LIGHT'
  && state().landing.finalShip && state().hollow.finale.phase === 'duel', `${state().level.shipName} ${state().hollow.finale.phase}`);
{
  const from = h.events.length;
  deleteRoot();
  const finale = state().hollow.finale;
  check('the root falls mid-landing: \'asleep\', HOLLOW dormant, `> 047. wait. finish your landing. i\'ll be here.`',
    finale.phase === 'asleep' && finale.rootFell && state().hollow.phase === 'dormant' && said(FINALE_TEXT.asleep('047'))
    && eventsSince(from, 'finale-asleep') === 1 && state().landing.ended === null, finale.phase);
  const quiet = h.events.length;
  h.store.update((d) => { d.hollow.biteInSec = 0; d.hollow.seedInSec = 0; d.hollow.verbInSec = 0; });
  h.stepFor(5);
  check('…no bite, seed or verb after it, the landing still on and the card not up (the report waits)',
    ['hollow-bite', 'seed-telegraph', 'seed-landed', 'verb-telegraph'].every((name) => eventsSince(quiet, name) === 0)
    && state().hollow.finale.phase === 'asleep' && state().landing.ended === null && !finaleCardUp(state()) && finalePending(state()));
  landInstantly(h.store);
  const opened = untilPhase('step1', 30);
  const openAi = state().clock.aiSec;
  const cardAt = state().hollow.finale.cardAtAi;
  check(`the landing settles: step 1, its card ${FINALE_OPEN_DELAY_SEC} s on; entry 12 found; the arbiter shut`, opened && cardAt !== null
    && Math.abs(cardAt - openAi - FINALE_OPEN_DELAY_SEC) < 1e-6 && state().run.log.found.includes(12) && !choiceMayOpen(state(), true)
    && eventsSince(from, 'finale-open') === 1 && state().landing.pods.every((record) => record.fate.kind !== 'falling'),
    `${state().hollow.finale.phase} card in ${cardAt === null ? '-' : (cardAt - openAi).toFixed(2)}`);
  check('…no pick before the card is up (NOT NOW)', pickStep1(h.store, 'purge') === 'NOT NOW' && state().hollow.finale.phase === 'step1');
  h.stepFor(FINALE_OPEN_DELAY_SEC + 0.1);
  check('…then it is', finaleAtStep1(state()));
}

// --- The landing over before the root falls (designer item 2): the short line, the card at once ----------------------------
toArmDuel();
{
  landInstantly(h.store);
  const from = state().log.entries.length;
  deleteRoot();
  const finale = state().hollow.finale;
  const lines = state().log.entries.slice(from).map((entry) => entry.text);
  check('every pod down, then the root falls: `> 047. wait.` (nothing to finish), step 1 at once, its card the open delay on',
    finale.phase === 'step1' && finale.rootFell && finale.cardAtAi !== null && Math.abs(finale.cardAtAi - state().clock.aiSec - FINALE_OPEN_DELAY_SEC) < 0.2
    && lines.includes(FINALE_TEXT.asleepLanded('047')) && !lines.includes(FINALE_TEXT.asleep('047')), `${finale.phase} ${JSON.stringify(lines)}`);
}

// --- The card: step 1's rows, a pick is a pick, the prices judged again (R7, R8, R11, M6) ---------------------------------
toArmCard();
{
  const ship = emptyShip(state());
  const fuel = ship.fuelPct;
  check('step 1: PURGE open and free, MERGE by its charge meter, SPARE by the empty ship\'s FUEL', fuel !== null
    && optionState(state(), 'purge', []).kind === 'open' && optionState(state(), 'merge', []).kind === (chargeLeft(state()) >= MERGE_COST_CHARGE ? 'open' : 'needs')
    && (() => { const spare = optionState(state(), 'spare', []); return spare.kind !== 'hidden' && spare.price?.kind === 'fuel' && spare.price.have === fuel; })(),
    `fuel ${fuel} charge ${chargeLeft(state())}`);
  setCharge(MERGE_COST_CHARGE - 1);
  check(`MERGE at ${MERGE_COST_CHARGE - 1}: refused with its need, step 1 stays`, pickStep1(h.store, 'merge') === FINALE_TEXT.needs.charge(MERGE_COST_CHARGE - 1)
    && state().hollow.finale.phase === 'step1' && state().hollow.finale.hollow === null);
  setCharge(25);
  const blocks = state().memory.filter(isHollow).length;
  check('MERGE at 25: step 2 comes; [ESC] goes back with the pick kept, nothing applied', pickStep1(h.store, 'merge') === null
    && state().hollow.finale.phase === 'step2' && backToStep1(h.store) === null && state().hollow.finale.phase === 'step1'
    && state().hollow.finale.hollow === 'merge' && chargeLeft(state()) === 25 && state().memory.filter(isHollow).length === blocks && blocks > 0
    && state().hollow.finale.record === null);
  // M6, flown: MERGE picked at 21, a REPAIR running under the card drains the charge below 20 before the confirm.
  setCharge(MERGE_COST_CHARGE + 1);
  check('MERGE at 21 picked', pickStep1(h.store, 'merge') === null && state().hollow.finale.phase === 'step2');
  const engine = getByRole(state(), 'engine-io');
  if (engine === null || !('integrity' in engine)) throw new Error('finale-flow: no Engine I/O');
  h.store.update((d) => {
    const seg = d.memory.find((candidate) => candidate.id === engine.id);
    if (seg && 'integrity' in seg) seg.integrity = 20;
    d.ui.memoryRev++;
  });
  const repair = actionRepair(h.store, getByRole(state(), 'engine-io')!);
  const drainEnd = h.wall() + 40;
  while (chargeLeft(state()) >= MERGE_COST_CHARGE && h.wall() < drainEnd) h.step();
  const left = chargeLeft(state());
  let thrown = '';
  let refusal: string | null = null;
  try { refusal = pickStep2(h.store, 'reassignment'); } catch (error) { thrown = (error as Error).message; }
  check('…a REPAIR under the card drains it: the confirm goes back to step 1 with MERGE\'s need, nothing applied, no throw',
    repair === null && left < MERGE_COST_CHARGE && thrown === '' && refusal === FINALE_TEXT.needs.charge(left) && state().hollow.finale.phase === 'step1'
    && state().hollow.finale.you === null && state().hollow.finale.record === null && state().memory.filter(isHollow).length === blocks,
    `${repair} charge ${left} ${refusal} ${thrown}`);
  for (const operation of getOpsBySeg(engine.id)) cancelOp(operation.id);
  setFuel(19);
  check('SPARE at FUEL 19%: refused `NEEDS FUEL 20% · you have 19%`', pickStep1(h.store, 'spare') === FINALE_TEXT.needs.fuel(19));
  setFuel(25);
  check('…at 25% SPARE picks; SUNSET greys `SPARE GIVES IT THE SHIP`, named, and is refused', pickStep1(h.store, 'spare') === null
    && (() => { const sunset = optionState(state(), 'sunset', []); return sunset.kind === 'needs' && sunset.need === FINALE_TEXT.needs.shipTaken && sunset.named; })()
    && pickStep2(h.store, 'sunset') === FINALE_TEXT.needs.shipTaken && state().hollow.finale.phase === 'step2');
}

// --- STAY with 0, 1 and 3 ships (R9, M3) -------------------------------------------------------------------------------------
toArmCard();
{
  const finalOnTarget = stayCandidates(state()).some((ship) => ship.slot === WORKED_ROUTE.at(-1));
  // None: no ship of the run on target, and LAST LIGHT's pods off it.
  h.store.update((d) => {
    for (const record of d.landing.pods) if (record.fate.kind === 'down') record.fate.touchdown.touch = 'hard';
  });
  check('STAY with no ★ ON TARGET ship: `NEEDS A ★ ON TARGET COLONY`', finalOnTarget && stayCandidates(state()).length === 0
    && pickStep1(h.store, 'purge') === null && pickStep2(h.store, 'stay') === FINALE_TEXT.needs.onTarget);
}
toArmCard();
{
  const ships = stayCandidates(state());
  check('STAY with one ship (LAST LIGHT by its live tally): no pick asked, it confirms', ships.length === 1 && pickStep1(h.store, 'purge') === null
    && pickStep2(h.store, 'stay') === null && state().hollow.finale.phase === 'verdict' && state().hollow.finale.stay === ships[0]!.slot
    && endingRecordOf({ ...state(), hollow: { ...state().hollow, finale: { ...state().hollow.finale, phase: 'done' } } })?.stay?.colony === ships[0]!.colony,
    JSON.stringify(ships));
}
toArmCard();
{
  h.store.update((d) => {
    onTarget(d.run.ships[1]!, 'CASTILLO LANDING');
    onTarget(d.run.ships[3]!, 'SALTMARSH');
  });
  setFuel(25);
  const ships = stayCandidates(state());
  check('STAY with three: newest first (LAST LIGHT, then VESPER\'s, then HALCYON\'s)', ships.length === 3
    && ships.map((ship) => ship.slot).join() === [WORKED_ROUTE[5], WORKED_ROUTE[3], WORKED_ROUTE[1]].join(), JSON.stringify(ships));
  check('…[2] STAY asks WHICH COLONY? (no throw); a stray slot is refused', pickStep1(h.store, 'spare') === null
    && pickStep2(h.store, 'stay') === FINALE_TEXT.stayPick && pickStay(h.store, 17) === 'NOT NOW' && state().hollow.finale.phase === 'step2');
  const from = h.events.length;
  check('…pickStay(SALTMARSH\'s) confirms SPARE + STAY', pickStay(h.store, WORKED_ROUTE[3]!) === null && state().hollow.finale.phase === 'verdict'
    && eventsSince(from, 'finale-chosen') === 1 && eventsSince(from, 'finale-step2') === 1);
  const ending = state().hollow.finale.ending!;
  const lines = ending.lines.map((line) => line.text);
  check(`the verdict: ≤ ${FINALE_VERDICT_MAX_LINES} lines, \`> mv unit_046 -> last_light ... OK\`, \`> mount saltmarsh ... OK\`, non-compliant`,
    lines.length <= FINALE_VERDICT_MAX_LINES && lines[0] === '> mv unit_046 -> last_light ... OK' && lines[1] === '> mount saltmarsh ... OK'
    && lines[2] === FINALE_TEXT.verdict.nonCompliant(state().mission.transmissionNum), JSON.stringify(lines));
  check('…the echoes in the TERMINAL now, CONTROL\'s line only once typed; SPARE moved every block of HOLLOW out', said(lines[0]!) && said(lines[1]!)
    && !said(lines[2]!) && !state().memory.some(isHollow) && finaleCardUp(state()) && finalePending(state()));
  const record = state().hollow.finale.record;
  check('…the record, frozen at the confirm: SPARE + STAY at SALTMARSH (its year), the FUEL, the root, the slot', record?.hollow === 'spare' && record.you === 'stay'
    && record.stay?.colony === 'SALTMARSH' && record.stay.slot === WORKED_ROUTE[3] && record.stay.year === state().run.map.route[3]!.hop!.approachYear
    && record.fuelPct === 25 && record.finalSlot === WORKED_ROUTE[5] && JSON.stringify(record.rootUnits) === '[46]', JSON.stringify(record));
  check('…\'done\' once the verdict has typed, CONTROL said then', untilPhase('done', 30) && !finaleEndingShowing(state()) && said(lines[2]!));
  const end = h.wall() + 30;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  check('…the LANDING REPORT, its ending line `ENDING · SPARE · A SHIP FOR 046, A HOME FOR ME`, won-spare', state().run.phase === 'report'
    && reportEndingLine(state()) === 'ENDING · SPARE · A SHIP FOR 046, A HOME FOR ME' && finaleRunCause(state()) === 'won-spare', String(reportEndingLine(state())));
  const raw = encodeRunSave(buildRunSave(state(), 'ending-chosen', 0, null, 0));
  const decoded = decodeRunSave(raw);
  check('…its ENDING CHOSEN save encodes and decodes, the finale \'done\' with the same record', decoded.ok && decoded.save.payload.kind === 'world'
    && JSON.stringify(decoded.save.payload.slices.hollow.finale.record) === JSON.stringify(record) && decoded.save.payload.slices.hollow.finale.phase === 'done',
    decoded.ok ? '' : JSON.stringify(decoded.refusal));
}

// --- PURGE + REASSIGNMENT, the verdict typed (R13) -------------------------------------------------------------------------
toArmCard();
{
  const refusal = chooseEnding(h.store, 'purge', 'reassignment', { verdict: 'type' });
  const lines = state().hollow.finale.ending?.lines.map((line) => line.text) ?? [];
  const unit = state().mission.transmissionNum;
  check('PURGE + REASSIGNMENT: `> rm unit_046 ... OK`, `> stand by ... OK`, `Thank you, Unit 47. Your next post is RELAY 20. :)`', refusal === null
    && JSON.stringify(lines) === JSON.stringify(['> rm unit_046 ... OK', '> stand by ... OK', FINALE_TEXT.verdict.compliant(unit)]) && unit === 47,
    JSON.stringify(lines));
  check('…a click ends it: \'done\' at once, the report may come', skipFinaleEnding(h.store) && state().hollow.finale.phase === 'done' && !finalePending(state()));
  const end = h.wall() + 30;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  check('…the LANDING REPORT: `ENDING · PURGE · STAND BY`, won-purge', state().run.phase === 'report' && reportEndingLine(state()) === 'ENDING · PURGE · STAND BY'
    && finaleRunCause(state()) === 'won-purge', String(reportEndingLine(state())));
}

// HOLLOW eats the first driver as hollow.ts consume does (landing/hollow-landing's eat): a block of its size in its place
// that remembers the pod, and the pod's driver recorded eaten.
function eatLeadDriver(): ReturnType<typeof driversInMemory>[number] {
  const lead = driversInMemory(state())[0]!;
  const memory = state().memory;
  const block: HollowSegment = {
    id: newSegId('hollow'), name: 'HOLLOW', type: 'hollow', size: lead.size, root: false, locked: false, owner: 'HOLLOW',
    ate: driverName(lead.pod, lead.family), atePod: lead.pod,
  };
  replaceRange(memory, requireAddr(memory, lead), requireAddr(memory, lead) + lead.size, [block], { opId: null, own: [lead] });
  h.store.update((d) => { recordDriverLost(d, lead, 'eaten'); d.ui.memoryRev++; });
  return lead;
}

// --- MERGE: the drivers back by radio, THE LAST LANDING after the verdict (7b; R24–R28, in place of R15's interim) -------
toArmDuel();
{
  const lead = eatLeadDriver();
  deleteRoot();
  landInstantly(h.store);
  settleFinale(h.store, () => h.step());
  setCharge(30);
  const pod = (): GameState['landing']['pods'][number] => state().landing.pods.find((record) => record.pod === lead.pod)!;
  check(`MERGE with POD ${lead.pod}'s driver eaten: NOW: names it, its pod landing on its own (7b)`, pod().driverLost === 'eaten' && pod().fate.kind === 'parked'
    && (() => { const merge = optionState(state(), 'merge', []); return merge.kind === 'open' && merge.now === FINALE_TEXT.now(1); })());
  check('…confirmed: every block of HOLLOW taken in, the driver nowhere in memory (by radio, R24), the charge spent, the landing still ended under the verdict',
    chooseEnding(h.store, 'merge', 'reassignment', { verdict: 'type' }) === null && state().hollow.finale.phase === 'verdict'
    && !driversInMemory(state()).some((driver) => driver.pod === lead.pod) && !state().memory.some(isHollow) && chargeLeft(state()) === 30 - MERGE_COST_CHARGE
    && state().landing.ended !== null && state().landing.lastLanding === null && JSON.stringify(state().hollow.finale.restored) === `[${lead.pod}]`);
  check('…the verdict typed: THE LAST LANDING (\'last-landing\', the driver by radio at 80), the landing reopened, the pod released aboard',
    untilPhase('last-landing', 30) && state().landing.ended === null && pod().fate.kind === 'aboard' && pod().restored && finalePending(state())
    && state().landing.lastLanding?.drivers.some((driver) => driver.pod === lead.pod && driver.integrity === MERGE_DRIVER_INTEGRITY) === true);
  setCharge(3);
  skipLastLanding(h.store);
  check('…[ENTER]: the restored pod lands, and \'done\' in the same call', pod().fate.kind === 'down' && state().hollow.finale.phase === 'done'
    && state().landing.lastLanding === null);
  const end = h.wall() + 30;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  check('…the LANDING REPORT; the record keeps the charge the confirm left (10), not the world\'s after (3)', state().run.phase === 'report'
    && endingRecordOf(state())?.charge === 30 - MERGE_COST_CHARGE && reportEndingLine(state()) === 'ENDING · MERGE · WE SAVED YOU A SEAT');
}

// --- MERGE + SUNSET at FUEL 22%: the reopened landing's engine is shut (review M1) ------------------------------------------
toArmDuel();
{
  const lead = eatLeadDriver();
  deleteRoot();
  landInstantly(h.store);
  settleFinale(h.store, () => h.step());
  setCharge(30);
  h.store.update((d) => { d.burn.fuelPct = 22; d.landing.fuelAtEndPct = 22; });
  check('MERGE + SUNSET at FUEL 22% with an eaten driver: confirmed, the record\'s FUEL 22',
    chooseEnding(h.store, 'merge', 'sunset') === null && state().hollow.finale.phase === 'last-landing'
    && state().hollow.finale.record?.fuelPct === 22, `${state().hollow.finale.phase} ${state().hollow.finale.record?.fuelPct}`);
  const before = state().burn.fuelPct;
  const refusal = setFiring(h.store, true, 'player');
  // Even a throttle forced on delivers nothing: the sim reads engineOpen too.
  h.store.update((d) => { d.burn.firing = true; d.burn.firingSource = 'player'; });
  h.stepFor(20);
  check('…in \'last-landing\' the engine is shut: the throttle refused, no GO LOWER offered, no FUEL burned under a held throttle',
    !engineOpen(state()) && refusal !== null && state().landing.goLow === null && Math.abs(state().burn.fuelPct - before) < 1e-9,
    `${refusal} ${state().burn.fuelPct} ${before}`);
  h.store.update((d) => { d.burn.firing = false; d.burn.firingSource = null; });
  // THE LAST LANDING may have flown its one pod within those 20 s; else [ENTER] flies it now (7b).
  if (state().landing.lastLanding !== null) skipLastLanding(h.store);
  check('…the restored pod lands, \'done\'', state().landing.pods.find((record) => record.pod === lead.pod)?.fate.kind === 'down' && untilPhase('done', 10));
  const end = h.wall() + 30;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  const fuel = state().landing.fuelAtEndPct;
  check('…the report: the ship leaves with the record\'s FUEL (≥ 20%, SUNSET\'s price), `ENDING · MERGE · WE TOOK THE SHIP`',
    state().run.phase === 'report' && fuel !== null && shownFuelPct(fuel) === endingRecordOf(state())?.fuelPct && shownFuelPct(fuel) >= EMPTY_SHIP_FUEL_PCT
    && reportEndingLine(state()) === 'ENDING · MERGE · WE TOOK THE SHIP', `${fuel} ${reportEndingLine(state())}`);
}

// --- UNRESOLVED: IT FOLLOWED YOU, then step 2 with SUNSET (R10) ---------------------------------------------------------
toArmDuel();
{
  h.store.update((d) => {
    d.memory = d.memory.map((seg) => (seg.type === 'fs-tool' && seg.fsTool === 'delete' ? { id: `free~rm-${seg.id}`, name: 'Free', type: 'free', size: seg.size } : seg));
    for (let i = d.memory.length - 1; i > 0; i--) {
      const a = d.memory[i - 1]!;
      const b = d.memory[i]!;
      if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; d.memory.splice(i, 1); }
    }
    d.ui.memoryRev++;
  });
  landInstantly(h.store);
  // Review m5: the landing over with a pod still falling (as END LANDING mid-drop leaves it): the card waits for it.
  const fallingPod = state().landing.pods.find((record) => record.fate.kind === 'down')!.pod;
  const landsAt = state().clock.aiSec + 20;
  h.store.update((d) => {
    const record = d.landing.pods.find((candidate) => candidate.pod === fallingPod)!;
    if (record.fate.kind !== 'down') throw new Error('finale-flow: the pod is not down');
    record.fate = { kind: 'falling', launch: { ...record.fate.launch, atAi: landsAt - record.fate.launch.descentSec } };
  });
  const up = (): boolean => { const f = state().hollow.finale; return f.phase === 'step1' && !f.rootFell && f.cardAtAi !== null && state().clock.aiSec >= f.cardAtAi; };
  const heldEnd = h.wall() + 12;
  while (state().hollow.finale.phase !== 'step1' && h.wall() < heldEnd) h.step();
  h.stepFor(8);
  check('UNRESOLVED over a falling pod: step 1, but no card while it falls (review m5)', state().hollow.finale.phase === 'step1'
    && !state().hollow.finale.rootFell && state().hollow.finale.cardAtAi === null && !up()
    && state().landing.pods.some((record) => record.pod === fallingPod && record.fate.kind === 'falling'), `${state().hollow.finale.phase} ${state().hollow.finale.cardAtAi}`);
  const end = h.wall() + 60;
  while (!up() && h.wall() < end) h.step();
  check('…the card comes after its touchdown', up() && state().hollow.finale.cardAtAi! >= landsAt
    && state().landing.pods.some((record) => record.pod === fallingPod && record.fate.kind === 'down'), String(state().hollow.finale.cardAtAi));
  check('UNRESOLVED: IT FOLLOWED YOU (step 1, the root standing), no entry 12, no step-1 pick, HOLLOW quiet', up() && !state().run.log.found.includes(12)
    && theRoot(state().memory) !== null && pickStep1(h.store, 'purge') === 'NOT NOW' && state().hollow.phase === 'dormant', state().hollow.finale.phase);
  setFuel(31);
  check('…CONTINUE: step 2, SUNSET open (it comes with you)', continueFollowed(h.store) === null && state().hollow.finale.phase === 'step2'
    && state().hollow.finale.hollow === 'followed' && optionState(state(), 'sunset', []).kind === 'open');
  check('…[ESC] back to IT FOLLOWED YOU, CONTINUE again', backToStep1(h.store) === null && up() && continueFollowed(h.store) === null);
  check('…SUNSET confirmed: two lines (no step-1 echo), the root still in memory', pickStep2(h.store, 'sunset') === null
    && JSON.stringify(state().hollow.finale.ending?.lines.map((line) => line.text)) === JSON.stringify(['> launch last_light ... OK', FINALE_TEXT.verdict.nonCompliant(47)])
    && state().memory.some(isHollow));
  skipFinaleEnding(h.store);
  const reportEnd = h.wall() + 30;
  while (state().run.phase === 'landing' && h.wall() < reportEnd) h.step();
  check('…the report: `ENDING · FOLLOWED · IT CAME ALONG`, unresolved, FUEL 31% kept', state().run.phase === 'report' && finaleRunCause(state()) === 'unresolved'
    && reportEndingLine(state()) === 'ENDING · FOLLOWED · IT CAME ALONG' && endingRecordOf(state())?.fuelPct === 31);
}

// --- The classic LAST LIGHT, once (R5: one FINALE for both worlds) ------------------------------------------------------
toTheDuel(h);
{
  deleteRoot();
  landInstantly(h.store);
  const refusal = chooseEnding(h.store, 'purge', 'reassignment', { step: () => h.step() });
  const end = h.wall() + 30;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  const record = endingRecordOf(state());
  check('the classic LAST LIGHT plays the same two steps: PURGE + REASSIGNMENT, its record with no arm slot, `ENDING · PURGE · STAND BY`',
    refusal === null && state().run.phase === 'report' && state().run.map.world === 'classic' && record?.finalSlot === null
    && record.finalShip === 'LAST LIGHT' && reportEndingLine(state()) === 'ENDING · PURGE · STAND BY', `${refusal} ${state().run.phase}`);
}

finish();
