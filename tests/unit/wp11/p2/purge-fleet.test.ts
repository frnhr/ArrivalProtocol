// WP11 part 2, the lead's note (2026-10-20 18:45): PURGE says the whole fleet is home only when it is. A whole run,
// headless, through the run's own machinery (no ship jumped): ARES-VII and HALCYON locked; KESTREL crashes (EMERGENCY
// TRANSMIT onward, `lossPlan`); VESPER locked; LAST LIGHT locked, its root DELETEd, PURGE. Then:
// • the typed ending's fleet line names how many ships made it (`4 of 5 ships made it home.`), not `the fleet is home.`;
// • RUN END's title and line say the same in PURGE's voice (`LAST LIGHT · 4 OF 5 HOME`, `You deleted it. 4 of 5
//   ships made it home.`), still the victory tone (the flagship's colonists landed); (WP11 fix round 1: the title once named the
//   whole fixed fleet, which broke onto two lines; and the title's lineage after it never claims the fleet);
// • the words fit one line with the worst numbers; a fleet that all made it keeps the full claim (the model alone).
// Slice 7a (R6, R13): PURGE is taken on the two-step card once the landing has settled, and its typed ending is the short
// verdict: it makes no fleet claim at all (the count is RUN END's, below, and the epilogue's).
import { check, finish } from '../../wp1/harness';
import { createHarness11 } from '../harness11';
import { receiveTransmission } from '@systems/boot';
import { lossPlan } from '@systems/run';
import { continueAfterReport, continueAfterLoss } from '../../support/desk';
import { fleetHome } from '@systems/run-score';
import { endFlight } from '@systems/orbit-sim';
import { runEndModel } from '@systems/run-end';
import { theRoot } from '@systems/hollow';

import { actionDelete } from '@state/actions';
import { RUN_END_PURGE_SHORT, RUN_END_TITLE, RUN_END_WHY, lineageLine } from '@data/script';
import { FINALE_TEXT } from '@data/finale-text';
import { ROOT_DELETE_SEC, MAX_LINE_CHARS } from '@data/tuning';
import { fixtureShip } from '../../support/arm-ship';
import { giveTools } from '../../map/repo-fixture';
// fleetHome's pure checks on a fleet of five, the flagship run 1's LAST LIGHT.
const FLEET = 5;
const FLAGSHIP_ID = fixtureShip(4).id;
import type { GameState, ShipResult } from '@state/schema';
import { chooseEnding, decidedAs } from '../../support/finale';

const SEED = 19;
const h = createHarness11(SEED, { soulsFound: false });
const state = (): Readonly<GameState> => h.store.getState();

// A ship result with only its outcome mattering (fleetHome reads the outcome and the ship).
function result(index: number, outcome: ShipResult['outcome']): ShipResult {
  const ship = fixtureShip(index);
  return {
    shipId: ship.id, shipName: ship.name, slot: index, depth: index + 1, outcome, colonistsAboard: 0, lzs: [], offSite: 0, noGo: 0,
    restored: 0, parked: [], notLaunched: 0, landedInLz: 0, points: 0, stars: 0, fuelLeftPct: 0, ringMiss: null, survey: null, colony: null, pods: [],
  };
}

// --- The words ------------------------------------------------------------------------------------------------------
{
  const worst = [
    RUN_END_PURGE_SHORT.title(99, 99), RUN_END_PURGE_SHORT.why(99, 99),
    FINALE_TEXT.echo(FINALE_TEXT.command.purge('unit_999998')), FINALE_TEXT.echo(FINALE_TEXT.command.reassignment), FINALE_TEXT.verdict.compliant(999),
  ];
  check(`PURGE's short-fleet words fit one line (≤ ${MAX_LINE_CHARS})`, worst.every((text) => text.length <= MAX_LINE_CHARS), worst.map((text) => text.length).join(' '));
  const home = (outcomes: ShipResult['outcome'][]): ReturnType<typeof fleetHome> => fleetHome(outcomes.map((outcome, i) => result(i, outcome)), FLEET);
  const all = home(['locked', 'partial', 'locked', 'locked', 'locked']);
  const lost = home(['locked', 'locked', 'crashed', 'locked', 'locked']);
  const stranded = home(['escaped', 'stranded', 'abandoned', 'emergency', 'locked']);
  check('fleetHome: STABLE ORBIT and ACCEPTED count as home; CRASHED, FLEW AWAY, STRANDED, BEAMED OUT, CORE LOST do not',
    all.all && all.home === 5 && !lost.all && lost.home === 4 && !stranded.all && stranded.home === 1, JSON.stringify({ all, lost, stranded }));
  check('…the flagship still landing counts once (its result is not recorded yet)', fleetHome([], FLEET, FLAGSHIP_ID).home === 1
    && fleetHome(Array.from({ length: FLEET }, (_ship, i) => result(i, 'locked')), FLEET, FLAGSHIP_ID).home === 5);
}

// --- The run --------------------------------------------------------------------------------------------------------
h.newRun(SEED);
receiveTransmission(h.store);
h.stepUntil(() => state().run.phase === 'flight', 30);
const lockAtOnce = (name: string): void => {
  check(`${name} flies`, state().run.phase === 'flight' && state().level.shipName === name, state().level.shipName);
  h.store.update((d) => { d.hollow.phase = 'dormant'; });
  h.startLanding(1, 'locked');
  check(`${name} (locked at once) reaches its LANDING REPORT`, h.untilPhase('report', 400), state().run.phase);
  continueAfterReport(h.store);
};
lockAtOnce('ARES-VII');
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 30);
lockAtOnce('HALCYON');
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 30);
check('KESTREL flies', state().level.shipName === 'KESTREL' && state().run.phase === 'flight', state().level.shipName);
endFlight(h.store, 'crashed');
h.step();
const plan = lossPlan(state());
check('KESTREL crashes: EMERGENCY TRANSMIT onward (not the end of the run)', plan.kind === 'transmit' && plan.outcome === 'crashed'
  && plan.coreHit > 0, JSON.stringify(plan));
continueAfterLoss(h.store);
check('…to TRANSMIT for VESPER', state().run.phase === 'transmit', state().run.phase);
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 30);
lockAtOnce('VESPER');
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 30);
// Track RETIRE: run 1's worked route has CORMORANT before LAST LIGHT (six ships, the classic route's five).
lockAtOnce('CORMORANT');
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 30);
check('LAST LIGHT flies', state().level.shipName === 'LAST LIGHT', state().level.shipName);
h.store.update((d) => { d.hollow.phase = 'dormant'; });
h.startLanding(1, 'locked');
h.step();
const root = theRoot(state().memory);
check('…its ORBIT LOCK opens the root', root !== null && !root.locked && state().hollow.finale.phase === 'duel');
// Track RETIRE: DELETE as the worked route's requests deliver it (Rm at KESTREL, map/run1-route); the classic schedule licensed it.
if (!state().run.licences.includes('delete')) giveTools(h.store, ['delete']);
if (root) actionDelete(h.store, root);
h.stepFor(ROOT_DELETE_SEC + 0.5);
// Designer item 2 (7a fix pass): over a landing already over the root's fall opens step 1 at once ('asleep' otherwise).
check('…its DELETE puts HOLLOW to sleep; once the landing settles the choice is up, PURGE is taken', state().hollow.finale.rootFell
  && ['asleep', 'step1'].includes(state().hollow.finale.phase) && chooseEnding(h.store, 'purge', 'reassignment', { step: () => h.step() }) === null && decidedAs(state()) === 'purge');
{
  const lines = state().hollow.finale.ending?.lines.map((line) => line.text) ?? [];
  check('the typed verdict claims nothing of the fleet (never `the fleet is home.`, R13)', lines.length === 3
    && !lines.some((text) => /fleet|ships made it/.test(text)), JSON.stringify(lines));
}
check('LAST LIGHT reaches its LANDING REPORT', h.untilPhase('report', 400), state().run.phase);
continueAfterReport(h.store);
{
  const model = runEndModel(state());
  const outcomes = state().run.ships.map((ship) => `${ship.shipName}:${ship.outcome}`).join(' ');
  check('RUN END after a PURGE with KESTREL lost: `LAST LIGHT · 5 OF 6 HOME`, `You deleted it. 5 of 6 ships made it home.`',
    model.title === RUN_END_PURGE_SHORT.title(5, 6) && model.why === RUN_END_PURGE_SHORT.why(5, 6)
    && model.title !== RUN_END_TITLE['won-purge']('UNIT-047', 'LAST LIGHT') && model.why !== RUN_END_WHY['won-purge']('LAST LIGHT'),
    `${model.title} | ${model.why} | ${outcomes}`);
  check('…still the victory tone (the flagship landed), the PURGE ending', model.tone === 'victory' && model.ending === 'purge', model.tone);
  // WP11 fix round 1 (the experience review): the next title's lineage line said `brought the fleet home` after this run.
  const lineage = lineageLine({
    number: state().run.unitNumber, landed: model.landed, shipName: 'LAST LIGHT', cause: 'won-purge', stats: { moves: 0, deletes: 0 }, hollowUnits: [46],
    trail: null, skills: null, ending: null,
  });
  check('…and the next title\'s lineage names what the unit did, never the fleet (`deleted it at LAST LIGHT`)',
    lineage !== null && lineage.endsWith('· deleted it at LAST LIGHT') && !/fleet/.test(lineage), String(lineage));
}

finish();
