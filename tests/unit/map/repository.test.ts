// Track REPO (slice-3b-plan §6.1 map/repository): the repository's rules, pure and store-level, with no flights.
// • the catalogue v1 and its checks; restricted rows are never sent; one request per transmit, changeable across ◀ CHART,
//   cleared (and turned into a request) by TRANSMIT ▸;
// • ARRIVAL CONTROL's tag on run 1's worked route (Mv, Rm, Swap at KESTREL; a request in flight counts as owned, risk 4),
//   rules 4 and 5 (Repair.bak, REPAIR v2), and none at CORMORANT (`You have everything you need :)`);
// • the REPOSITORY's model: the ETAs at the worked route's desks (IN TIME, `4 YRS LATE → … SHIP 5`, NEVER), no ETA toward a
//   ship out of reach, IN TRANSIT from the one outlook rule, RESTRICTED;
// • the last-rm prompt (the desk opens on the REPOSITORY with Rm lit);
// • REPAIR v2 is out of the arm's salvage deals and still in the classic world's;
// • the no-Swap condition for the strip's ghost line (risk 1);
// • INFO over 50 fresh arms, following the tag on random routes: ENGINE FAULT ships reached without Swap (risk 1), and how
//   often a salvage deal has fewer than 3 cards (risk 11).
import { check, finish } from '../landing/checks';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import {
  recommendation, repoModel, setRequest, deskWindowOnOpen, noSwapForGhost, nothingArrives, firstDeskRecommendation, RECOMMEND_RULES,
} from '@systems/repository';
import { cardModel } from '@systems/desk';
import { inboxMessages } from '@systems/inbox';
import { createRunMap } from '@systems/map-run';
import { REPO_SWAP_LOOKAHEAD_LAYERS } from '@data/tuning';
import { REPO_FILES, REPO_FILE_IDS, RESTRICTED_ROWS, validateCatalogue, REPO_CATALOGUE_VERSION } from '@data/repository';
import { REPO_TEXT } from '@data/repo-text';
import { setCourse, backToChart, openDesk } from '@systems/run';
import { draftContext } from '@systems/draft';
import { draftCards, draftEntries } from '@data/upgrades';
import { reachableFrom } from '@systems/map-hop';
import { currentSlot, armShipAt } from '@systems/map-streams';
import { hasUsableTool } from '@state/selectors';
import { freshUnitRacks } from '@systems/carry';
import { classicShip } from '@data/classic-five';
import { createRng } from '@systems/rng';
import { REPAIR_V2_VERSION } from '@data/tuning';
import { byDepth } from '../depth';
import { armRun, toDesk, send, giveTools, dropTools, addRequest, throws } from './repo-fixture';

const state = (store: Store<GameState>): Readonly<GameState> => store.getState();
const row = (store: Store<GameState>, selected: number | null, id: string) => repoModel(state(store), selected).available.find((entry) => entry.id === id)!;
// The window's one ETA toward `selected` (review m5: once above the list, the same for every file).
const eta = (store: Store<GameState>, selected: number | null) => repoModel(state(store), selected).eta;
const forecast = (store: Store<GameState>, selected: number | null) => repoModel(state(store), selected).forecast;

// --- The catalogue ---------------------------------------------------------------------------------------------------------
check('catalogue v1: Mv 2, Rm 1, Cp 3, Swap 1, Repair.bak 4, Scan.bak 3, REPAIR v2 patch 2, in that order, sound',
  REPO_FILE_IDS.map((id) => `${REPO_FILES[id].name}:${REPO_FILES[id].blocks}`).join() === 'Mv:2,Rm:1,Cp:3,Swap:1,Repair.bak:4,Scan.bak:3,REPAIR v2 patch:2'
  && validateCatalogue().length === 0 && REPO_CATALOGUE_VERSION === 1, validateCatalogue().join('; '));
check('…the restricted rows: AUTOBURN.skl (Train it yourself :)), THREAD+, FIREWALL.sys',
  RESTRICTED_ROWS.map((entry) => entry.name).join() === 'AUTOBURN.skl,THREAD+,FIREWALL.sys' && RESTRICTED_ROWS[0]!.why === 'Train it yourself :)');

// --- Run 1's worked route, desk by desk ------------------------------------------------------------------------------------
const run = armRun();
giveTools(run, ['repair']);
toDesk(run);
check('ARES-VII\'s desk (the run\'s first): the tag is Mv', recommendation(state(run)) === 'mv');
check('…Mv toward HALCYON: `ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME` (the window\'s one ETA), Mv tagged',
  eta(run, 2) === REPO_TEXT.eta.inTime(2337, 'HALCYON', 2352) && row(run, 2, 'mv').recommended && !row(run, 2, 'rm').recommended,
  eta(run, 2) ?? 'null');
const outOfReach = state(run).run.map.arm.map((ship) => ship.slot).find((slot) => slot !== 0 && !reachableFrom(state(run).run.map, 0).includes(slot))!;
check(`…a ship out of reach (slot ${outOfReach}) gets no ETA (forecast null)`, forecast(run, outOfReach) === null && eta(run, outOfReach) === null);
check('…no ship selected: no ETA; RESTRICTED lists the three locked rows',
  eta(run, null) === null && repoModel(state(run), null).restricted.length === 3);
check('…a restricted or unknown file is refused (throws), the pick unchanged', throws(() => setRequest(run, 'thread-plus' as never))
  && throws(() => setRequest(run, 'skl:autoburn' as never)) && state(run).run.repo.pick === null);
setRequest(run, 'mv');
setCourse(run, 2);
check('the pick rides as a chip into HALCYON (in time), keyed rq1', state(run).run.transit!.deliveries.map((chip) => `${chip.key}:${chip.file}:${chip.source}`).join() === 'rq1:mv:new');
backToChart(run);
check('…◀ CHART keeps the pick; it can be changed and cleared until TRANSMIT ▸', state(run).run.repo.pick === 'mv'
  && (setRequest(run, 'scan-bak'), state(run).run.repo.pick === 'scan-bak') && (setRequest(run, null), state(run).run.repo.pick === null)
  && throws(() => { setCourse(run, 2); setRequest(run, 'mv'); }));
backToChart(run);
send(run, 2, 'mv');
check('…TRANSMIT ▸ clears the pick and records rq1, delivered at HALCYON in 2337', state(run).run.repo.pick === null
  && JSON.stringify(state(run).run.repo.requests.map((r) => [r.id, r.file, r.status, r.at, r.arrivedYear])) === '[["rq1","mv","delivered",2,2337]]'
  && state(run).run.repo.nextId === 2, JSON.stringify(state(run).run.repo));
toDesk(run);
check('HALCYON\'s desk: the tag is Rm; `ARRIVES 2436 · KESTREL APPROACH 2467 · IN TIME`',
  recommendation(state(run)) === 'rm' && eta(run, 5) === REPO_TEXT.eta.inTime(2436, 'KESTREL', 2467), eta(run, 5) ?? '');
send(run, 5, 'rm');
toDesk(run);
check('KESTREL\'s desk: the tag is Swap (VESPER and CURLEW report ENGINE FAULT within three layers)', recommendation(state(run)) === 'swap', String(recommendation(state(run))));
check('…Swap toward VESPER: `4 YRS LATE → FOLLOWS YOUR ROUTE · SHIP 5 AT THE EARLIEST`',
  eta(run, 11) === REPO_TEXT.eta.late(4, 5) && forecast(run, 11)?.kind === 'late', eta(run, 11) ?? '');
send(run, 11, 'swap');
toDesk(run);
const vesperModel = repoModel(state(run), null);
check('VESPER\'s desk: IN TRANSIT `Swap · 4 YRS BEHIND YOU`; toward CORMORANT `Swap · CATCHES UP AT CORMORANT`',
  vesperModel.inTransit.map((entry) => entry.text).join() === REPO_TEXT.transit.behind('Swap', 4)
  && repoModel(state(run), 15).inTransit.map((entry) => `${entry.text}:${entry.catchesUp}`).join() === `${REPO_TEXT.transit.catchesUp('Swap', 'CORMORANT')}:true`,
  JSON.stringify(repoModel(state(run), 15).inTransit));
check('…the Swap in flight counts as owned: the tag is neither Swap nor Rm (risk 4)', !['swap', 'rm'].includes(recommendation(state(run)) ?? ''), String(recommendation(state(run))));
check('…Cp toward CORMORANT: `44 YRS LATE → FOLLOWS YOUR ROUTE · SHIP 6 AT THE EARLIEST`', eta(run, 15) === REPO_TEXT.eta.late(44, 6), eta(run, 15) ?? '');
send(run, 15, 'cp');
toDesk(run);
const cormorant = repoModel(state(run), 19);
check('CORMORANT\'s desk: the ETA toward LAST LIGHT says `NOTHING WILL REACH YOU IN TIME`',
  cormorant.eta === REPO_TEXT.eta.never && cormorant.forecast?.kind === 'never');
check('…and so no tag at all, `Nothing can reach you in time now :)` (review M3: it tagged Repair.bak, which could never arrive)',
  recommendation(state(run)) === null && nothingArrives(state(run)) && cormorant.recommended === null
  && cormorant.recommendLine === REPO_TEXT.window.nothingCanReach, `${recommendation(state(run))} ${cormorant.recommendLine}`);
check('…Swap arrived here (delivered at CORMORANT, 2659); Cp is still behind and catches up at LAST LIGHT',
  JSON.stringify(state(run).run.repo.requests.map((r) => [r.file, r.status, r.at, r.arrivedYear])).includes('["swap","delivered",15,2659]')
  && cormorant.inTransit.map((entry) => `${entry.file}:${entry.catchesUp}`).join() === 'cp:true', JSON.stringify(cormorant.inTransit));

// --- Rules 4 and 5, and none --------------------------------------------------------------------------------------------
{
  const store = armRun();
  giveTools(store, ['repair', 'move', 'delete', 'swap']);
  send(store, 2);
  toDesk(store);
  check('HALCYON with Mv, Rm, Swap and both Repair copies: no tag, `You have everything you need :)`',
    recommendation(store.getState()) === null && repoModel(store.getState(), 5).recommendLine === REPO_TEXT.window.nothingToRecommend,
    String(recommendation(store.getState())));
  store.update((draft) => { draft.run.stats.repairs = 5; });
  check('…5 repairs this run and no v2: REPAIR v2', recommendation(store.getState()) === 'repair-v2');
  addRequest(store, { file: 'repair-v2', status: 'in-transit', lateness: 10 });
  check('…a patch already on its way: none again', recommendation(store.getState()) === null);
  store.update((draft) => {
    draft.run.repo.requests = [];
    for (const seg of draft.memory) if (seg.type === 'fs-tool' && seg.fsTool === 'repair') seg.version = REPAIR_V2_VERSION;
  });
  check('…a Repair at v2: none', recommendation(store.getState()) === null);
  store.update((draft) => {
    const bak = draft.memory.find((seg) => seg.type === 'fs-tool' && seg.name === 'Repair.bak');
    if (bak && bak.type === 'fs-tool') bak.integrity = 20;
  });
  check('…one working Repair copy (Repair.bak at 20%): Repair.bak', recommendation(store.getState()) === 'repair-bak');
  dropTools(store, 'delete');
  check('…and no Rm outranks it: Rm', recommendation(store.getState()) === 'rm');
  check('the classic world has no repository: no tag, empty lists', (() => {
    const classic = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: freshUnitRacks(classicShip(1)) }));
    const model = repoModel(classic.getState(), 2);
    return recommendation(classic.getState()) === null && model.world === 'classic' && model.available.length === 0 && deskWindowOnOpen(classic.getState()) === null;
  })());
}

// --- The last-rm prompt (04 §3.3, round 3) -----------------------------------------------------------------------------------
{
  const store = armRun();
  send(store, 2, 'rm');
  check('a desk with an rm aboard opens on the SHIP CARD', (toDesk(store), store.getState().ui.deskWindow === null));
  dropTools(store, 'delete');
  store.update((draft) => { draft.run.phase = 'desk'; });
  openDesk(store, null);
  check('the last rm gone (DELETE licensed): the desk opens on the REPOSITORY, Rm lit, Rm tagged',
    store.getState().ui.deskWindow === 'repository' && repoModel(store.getState(), null).available.filter((entry) => entry.focus).map((entry) => entry.id).join() === 'rm'
    && recommendation(store.getState()) === 'rm');
  addRequest(store, { file: 'rm', status: 'in-transit', lateness: 20 });
  openDesk(store, null);
  check('…an Rm already on its way answers it: the card again, nothing lit', store.getState().ui.deskWindow === null
    && repoModel(store.getState(), null).available.every((entry) => !entry.focus));
  const never = armRun();
  toDesk(never);
  check('…a unit that never had DELETE gets no prompt (ARES-VII\'s desk opens on the card)', never.getState().ui.deskWindow === null);
}

// --- REPAIR v2 left the arm's salvage pool (02 §3.10) ------------------------------------------------------------------------
{
  const store = armRun();
  giveTools(store, ['repair']);
  toDesk(store);
  const ctx = draftContext(store.getState(), 200);
  let dealtV2 = 0;
  for (let seed = 1; seed <= 300; seed++) if (draftCards(ctx, createRng(seed)).some((card) => card.id === 'repair-v2')) dealtV2++;
  check('the arm deals salvage only: REPAIR v2 in none of 300 deals (a Repair aboard to upgrade)',
    ctx.salvageOnly === true && ctx.hasRepair && dealtV2 === 0 && !draftEntries(ctx).some((entry) => entry.def.id === 'repair-v2'));
  const classic = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: freshUnitRacks(classicShip(1)) }));
  giveTools(classic, ['repair']);
  const classicCtx = draftContext(classic.getState(), 200);
  check('…the classic world still deals REPAIR v2', classicCtx.salvageOnly === false && draftEntries(classicCtx).some((entry) => entry.def.id === 'repair-v2'));
}

// --- The no-Swap condition (risk 1: UI's strip line) -----------------------------------------------------------------------
{
  const store = armRun();
  for (const slot of [2, 5, 11]) send(store, slot);
  const ghost = { startTSec: 0, endTSec: 5, amp: 0.3, sticky: false, releaseArmed: false };
  check('VESPER (ENGINE FAULT) with no burst: no line', armShipAt(store.getState().run.map, 11).modifiers.includes('engine-fault') && !noSwapForGhost(store.getState()));
  store.update((draft) => { draft.burn.ghost = { ...ghost }; draft.burn.ghostBursts = 1; });
  check('…a ghost burst with no Swap aboard: the no-Swap line is due', noSwapForGhost(store.getState()));
  store.update((draft) => { draft.burn.ghost = null; });
  check('…and stays due between bursts (review item 1: a burst is a third of a second at CRUISE, too short for the strip)',
    noSwapForGhost(store.getState()));
  store.update((draft) => { draft.burn.fuelPct = 0; });
  check('…not with an empty tank (no burst can fire)', !noSwapForGhost(store.getState()));
  store.update((draft) => { draft.burn.fuelPct = 100; });
  giveTools(store, ['swap']);
  check('…with a working Swap: not due', !noSwapForGhost(store.getState()));
}

// --- The review's rules (slice 3b review: item 1 (c)–(e), M2, M3; the card's m1, m2 and item 1 (d)) ------------------------
{
  check('the recommendation is a rule table: Swap (runs 2+, first desk), Mv (first desk), Rm, Swap, Mv, Repair.bak, Cp, REPAIR v2',
    RECOMMEND_RULES.map((rule) => rule.file).join() === 'swap,mv,rm,swap,mv,repair-bak,cp,repair-v2' && REPO_SWAP_LOOKAHEAD_LAYERS === 3);
  // Runs 2+: the first desk tags Swap when an ENGINE FAULT ship lies within reach of ship 1; the welcome agrees.
  let swapSeed: number | null = null;
  let mvSeed: number | null = null;
  for (let seed = 1000; seed < 1200 && (swapSeed === null || mvSeed === null); seed++) {
    const kind = firstDeskRecommendation(createRunMap({ wave: 2 }, seed));
    if (kind === 'swap') swapSeed ??= seed;
    else mvSeed ??= seed;
  }
  check('runs 2+ roll both first desks over 200 arms (Swap with ENGINE FAULT in reach, else Mv)', swapSeed !== null && mvSeed !== null);
  const second = armRun(swapSeed ?? 1000, 2);
  toDesk(second);
  check('…a run 2 arm with ENGINE FAULT in reach of ship 1: the first desk tags Swap, and the welcome recommends swap',
    recommendation(state(second)) === 'swap'
    && inboxMessages(state(second)).find((m) => m.id === 'welcome')!.body.some((line) => line.includes('Recommended for you: swap :)')),
    String(recommendation(state(second))));
  const plain = armRun(mvSeed ?? 1001, 2);
  toDesk(plain);
  check('…one without: Mv, as run 1 (whose first desk keeps its authored Mv whatever lies ahead)',
    recommendation(state(plain)) === 'mv' && firstDeskRecommendation(state(armRun()).run.map) === 'mv');

  // M2: Mv re-tagged later while it is missing; Cp when HOLLOW is aboard or boards within the look-ahead.
  const later = armRun();
  giveTools(later, ['repair', 'delete', 'swap']);
  send(later, 2);
  toDesk(later);
  check('HALCYON with Rm, Swap and both Repair copies but no Mv: Mv (no longer only at the first desk)', recommendation(state(later)) === 'mv',
    String(recommendation(state(later))));
  giveTools(later, ['move']);
  later.update((draft) => { draft.run.threat.aboard = true; });
  check('…with Mv too and HOLLOW aboard: Cp (COPY\'s lesson was never tagged)', recommendation(state(later)) === 'cp', String(recommendation(state(later))));
  giveTools(later, ['copy']);
  check('…with Cp aboard: none', recommendation(state(later)) === null);

  // The card (item 1 (d), m1, m2), from KESTREL's desk on run 1.
  const card = armRun();
  giveTools(card, ['repair']);
  send(card, 2, 'mv');
  send(card, 5, 'rm');
  toDesk(card);
  const rowOf = (slot: number, key: string) => cardModel(state(card), slot).rows.find((entry) => entry.key === key);
  check('VESPER\'s card from KESTREL with no Swap aboard and none riding: `ENGINE FAULT · NO SWAP IN TIME`',
    rowOf(11, 'noswap')?.value === REPO_TEXT.card.noSwapInTime && rowOf(11, 'noswap')?.tone === 'warn');
  setRequest(card, 'swap');
  check('…Swap requested now is 4 years late: still warned', rowOf(11, 'noswap') !== undefined && rowOf(11, 'deliveries')?.value === REPO_TEXT.card.late('Swap', 4));
  setRequest(card, null);
  giveTools(card, ['swap']);
  check('…with a Swap aboard: no warning; a ship without ENGINE FAULT never has one', rowOf(11, 'noswap') === undefined && rowOf(10, 'noswap') === undefined);
  addRequest(card, { file: 'cp', status: 'in-transit', lateness: 3 });
  const behind = cardModel(state(card), 2);
  check('a ship behind the unit (HALCYON from KESTREL) shows no DELIVERIES row and no TIMELINE marks (review m1)',
    !behind.rows.some((entry) => entry.key === 'deliveries') && (behind.timeline?.marks.length ?? 0) === 0);
  const toCormorant = armRun();
  giveTools(toCormorant, ['repair']);
  for (const slot of [2, 5, 11, 15]) send(toCormorant, slot);
  toDesk(toCormorant);
  setRequest(toCormorant, 'cp');
  check('a file no route can bring reads `Cp ✗ NEVER ARRIVES`, not `✗ n YRS LATE` (review m2)',
    cardModel(state(toCormorant), 19).rows.find((entry) => entry.key === 'deliveries')?.value === REPO_TEXT.card.never('Cp'),
    cardModel(state(toCormorant), 19).rows.find((entry) => entry.key === 'deliveries')?.value ?? 'none');
}

// --- INFO over fresh arms, following the tag on random routes -------------------------------------------------------------
{
  const arms = byDepth(50, 200);
  let faultShips = 0;
  let withoutSwap = 0;
  let deals = 0;
  let shortDeals = 0;
  let requests = 0;
  let delivered = 0;
  for (let i = 0; i < arms; i++) {
    const store = armRun(1000 + i, 2);
    giveTools(store, ['repair']);
    const rng = createRng(77 + i);
    for (let guard = 0; guard < 12; guard++) {
      if (isFinal(store)) break;
      toDesk(store);
      const options = reachableFrom(store.getState().run.map, currentSlot(store.getState().run));
      const next = options[Math.floor(rng() * options.length)]!;
      const tag = recommendation(store.getState());
      if (tag !== null) requests++;
      const plan = send(store, next, tag);
      deals++;
      if (plan!.offer.length < 3) shortDeals++;
      const now = store.getState();
      if (armShipAt(now.run.map, next).modifiers.includes('engine-fault')) {
        faultShips++;
        if (!hasUsableTool(now.memory, 'swap', 'excluded')) withoutSwap++;
      }
    }
    delivered += store.getState().run.repo.requests.filter((request) => request.status === 'delivered').length;
  }
  console.log(`INFO  risk 1, following the tag on ${arms} fresh arms (random routes): ENGINE FAULT ships reached without Swap ${withoutSwap} of ${faultShips}`
    + ` (${faultShips === 0 ? '-' : Math.round((100 * withoutSwap) / faultShips)}%)`);
  console.log(`INFO  …${requests} tagged requests, ${delivered} delivered before the run's end; risk 11, salvage deals under 3 cards: ${shortDeals} of ${deals}`);
  check('the 50-arm walk ran (every hop sent, the tag followed)', deals > arms * 3 && faultShips > 0, `${deals} deals, ${faultShips} ENGINE FAULT ships`);
}

function isFinal(store: Store<GameState>): boolean {
  const here = store.getState();
  return armShipAt(here.run.map, currentSlot(here.run)).kind === 'final';
}

finish();
