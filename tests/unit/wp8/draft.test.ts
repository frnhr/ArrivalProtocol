// WP8 acceptance 2 (§6.9, §9 WP8 items 1–2): PICK ONE TO CARRY.
// The pure draft:
// • the same seed deals the same 3 cards, always distinct;
// • with driversLost ≥ 1, FIREWALL.sys is in at least 60% of 1,000 seeds (and says why: `you lost a driver
//   to ???`, the name the strip shows); every boost has its reason, a base card says `ARRIVAL CONTROL had a spare`;
// • WP8 fix round 1: every boost has a mild step with its own reason (a bite saved, two REPAIRs, one busy
//   THREADS refusal, REPAIR CHARGE under 30, half the FUEL burned), so a clean tutorial's draft is shaped by
//   that kid's play: no line says HOLLOW;
// • owned non-stackables never appear; when every non-stackable is owned the stackables fill the 3 slots;
//   a full FIREWALL stack, a REPAIR v2 with no Repair to bump, a file with no link room are never offered.
// The cards in the run (harness7, a crash's EMERGENCY TRANSMIT to reach TRANSMIT quickly):
// • the deal is seeded by the ship being left and fixed in the plan; the pick is mandatory;
// • FIREWALL.sys arrives as a 2-block file in rack F (it took link room), REPAIR v2 bumps every Repair copy
//   (heal ×2), THREAD+ makes three threads, +12 REPAIR CHARGE arrives with the star credit (the boot says
//   so), FUEL TRIM widens the Δv budget +15% on arrival (none below 50%; eaten mid-ship it keeps this ship's
//   budget and gives none on the next arrival);
// • a FIREWALL can be MOVEd next to HOLLOW's root and holds that side when HOLLOW wakes; it can't be copied.
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './../wp7/harness7';
import { draftCards, draftEntries, UPGRADES, BASE_WHY, type DraftContext, type UpgradeId, type DraftCardId } from '@data/upgrades';
import { dealDraft, draftContext, pickCard, ownedUpgrades, PREVIEW_ID } from '@systems/draft';
import { transmitNext } from '@systems/run';
import { continueAfterLoss } from '../support/classic-flow';
import { installTool } from '@systems/licences';
import { createRng } from '@systems/rng';
import { capabilitiesNow, flightModsOf, liveUpgrades } from '@systems/capabilities';
import { targetRefusal } from '@systems/tool-targets';
import { reachMarks } from '@systems/hollow-hud';
import { actionMove, setIntegrity } from '@state/actions';
import { chargeLeft, getAiCore, coreThreads, effectiveToolVersion, upgradeFiles, isFirewall } from '@state/selectors';
import { repairRatePerSec } from '@data/fs-tools';
import { assertMemoryInvariants, segmentStarts } from '@systems/memory-ops';
import { TOOL_REFUSAL } from '@data/tool-text';
import { classicShip, CLASSIC_HOPS } from '@data/classic-five';
import {
  MAX_LINE_CHARS, DRAFT_CARDS, FUEL_TRIM_DV_BONUS_FRAC, CHARGE_CARD_BLOCKS, FIREWALL_BLOCKS, REPAIR_V2_VERSION, CHARGE_ARRIVAL_FLOOR,
} from '@data/tuning';
import type { Segment, DriverSegment, FreeSegment, UpgradeSegment } from '@/types/segment';
import { plantHalcyonRoot } from '../support/hollow-world';
import { MEMORY_LAYOUTS, rackStartOf } from '@data/memory';

const none: Record<UpgradeId, number> = { firewall: 0, 'repair-v2': 0, 'thread-plus': 0, charge: 0, 'fuel-trim': 0, cycles: 0 };
// The base context has no sign of trouble at all (a fresh unit's 36 charge, most of the FUEL left): every card
// at its base weight.
const ctx = (over: Partial<DraftContext> = {}): DraftContext => ({
  stats: { manualCaptures: 0, demos: [], dropDemos: [], repairs: 0, moves: 0, deletes: 0, driversLost: 0, driversBitten: 0, capRefusals: 0, deal: null },
  chargeHeld: 36, lastShip: { name: 'ARES-VII', fuelLeftPct: 70 }, owned: none, hasRepair: true, linkRoom: 50, hollowLabel: '???', ...over,
});
const ids = (cards: readonly { id: DraftCardId }[]): string => cards.map((card) => card.id).join(',');
const share = (context: DraftContext, id: UpgradeId, seeds = 1000): number => {
  let hits = 0;
  for (let seed = 1; seed <= seeds; seed++) if (draftCards(context, createRng(seed)).some((card) => card.id === id)) hits++;
  return hits / seeds;
};
const ever = (context: DraftContext, id: UpgradeId, seeds = 1000): boolean => {
  for (let seed = 1; seed <= seeds; seed++) if (draftCards(context, createRng(seed)).some((card) => card.id === id)) return true;
  return false;
};

// --- The pure draft --------------------------------------------------------------------------------------
{
  const a = draftCards(ctx(), createRng(42));
  const b = draftCards(ctx(), createRng(42));
  check('the same seed deals the same 3 cards', a.length === DRAFT_CARDS && ids(a) === ids(b), ids(a));
  let distinct = true;
  for (let seed = 1; seed <= 1000; seed++) {
    const cards = draftCards(ctx(), createRng(seed));
    if (cards.length !== DRAFT_CARDS || new Set(cards.map((card) => card.id)).size !== DRAFT_CARDS) distinct = false;
  }
  check('every deal over 1,000 seeds is 3 distinct cards', distinct);
  const lost = ctx({ stats: { ...ctx().stats, driversLost: 1 } });
  const firewallShare = share(lost, 'firewall');
  check('with driversLost ≥ 1, FIREWALL.sys is in ≥ 60% of 1,000 seeds', firewallShare >= 0.6, `${(firewallShare * 100).toFixed(1)}%`);
  check('…against about 60% with nothing lost (base weights)', Math.abs(share(ctx(), 'firewall') - 0.6) < 0.06, `${(share(ctx(), 'firewall') * 100).toFixed(1)}%`);
  const why = draftEntries(lost).find((entry) => entry.def.id === 'firewall');
  check('…and says why, naming it as the strip does: `you lost a driver to ???` (`3 drivers to UNIT-047` once named)',
    why?.why === 'you lost a driver to ???' && why.boosted
    && draftEntries(ctx({ stats: { ...ctx().stats, driversLost: 3 }, hollowLabel: 'UNIT-047' })).find((entry) => entry.def.id === 'firewall')?.why === 'you lost 3 drivers to UNIT-047');
  const boosted = draftEntries(ctx({
    stats: { ...ctx().stats, driversLost: 2, repairs: 7, capRefusals: 4 }, chargeHeld: 9, lastShip: { name: 'HALCYON', fuelLeftPct: 12.7 },
  }));
  check('every boost names the kid\'s own trouble', boosted.every((entry) => entry.boosted)
    && boosted.map((entry) => entry.why).join(' | ') === 'you lost 2 drivers to ??? | you ran 7 REPAIRs | your THREADS were all busy 4 times | you are down to 9 REPAIR CHARGE | HALCYON ended with FUEL 12%',
    boosted.map((entry) => entry.why).join(' | '));
  // The mild step: a taste of the same trouble, a smaller push, its own reason.
  const mild = draftEntries(ctx({
    stats: { ...ctx().stats, driversBitten: 1, repairs: 3, capRefusals: 1 }, chargeHeld: 22, lastShip: { name: 'ARES-VII', fuelLeftPct: 37.6 },
  }));
  check('the mild step: every card has a reason from play, at a smaller weight than the strong one', mild.every((entry) => entry.boosted)
    && mild.map((entry) => entry.why).join(' | ') === '??? bit a driver | you ran 3 REPAIRs | your THREADS were all busy once | you are down to 22 REPAIR CHARGE | ARES-VII burned 62% of your FUEL'
    && mild.every((entry) => entry.weight > 1 && entry.weight < Math.min(...boosted.map((strong) => strong.weight))),
    mild.map((entry) => `${entry.why} ×${entry.weight}`).join(' | '));
  check('…and the strong step still wins over the mild one on the same card', draftEntries(ctx({ stats: { ...ctx().stats, driversLost: 1, driversBitten: 4 } }))
    .find((entry) => entry.def.id === 'firewall')?.why === 'you lost a driver to ???');
  check('…several bites say how many', draftEntries(ctx({ stats: { ...ctx().stats, driversBitten: 3 } })).find((entry) => entry.def.id === 'firewall')?.why === '??? bit your drivers 3 times');
  // A clean tutorial (the review's strip-following kid: the ENGINE I/O repair and POD 01's, ship 1's scripted
  // bite saved, 35 charge, 37.6% FUEL left): two of five cards answer its play.
  const clean = draftEntries(ctx({ stats: { ...ctx().stats, driversBitten: 1, repairs: 2 }, chargeHeld: 35, lastShip: { name: 'ARES-VII', fuelLeftPct: 37.6 } }));
  check('a clean tutorial\'s draft still has reasons from play (FIREWALL, REPAIR v2, FUEL TRIM)', clean.filter((entry) => entry.boosted).map((entry) => entry.def.id).join(',') === 'firewall,repair-v2,fuel-trim');
  let personal = 0;
  for (let seed = 1; seed <= 1000; seed++) personal += draftCards(ctx({ stats: { ...ctx().stats, driversBitten: 1, repairs: 2 }, chargeHeld: 35, lastShip: { name: 'ARES-VII', fuelLeftPct: 37.6 } }), createRng(seed)).filter((card) => card.boosted).length;
  check('…and its 3 cards carry about 2 of them on average over 1,000 seeds', personal / 1000 >= 1.8, `${(personal / 1000).toFixed(2)} of 3`);
  check('no card line says HOLLOW (a kid never reads that name: the strip says ??? or the unit)',
    [...UPGRADES.flatMap((def) => [def.title, def.effect]), ...boosted.map((entry) => entry.why), ...mild.map((entry) => entry.why)].every((line) => !line.includes('HOLLOW')));
  check(`a card at its base weight says so: \`${BASE_WHY}\``, draftEntries(ctx()).every((entry) => !entry.boosted && entry.why === BASE_WHY));
  const worstWhy = [
    ...draftEntries(ctx({
      stats: { ...ctx().stats, driversLost: 99, repairs: 999, capRefusals: 999 }, chargeHeld: 14, lastShip: { name: 'W'.repeat(12), fuelLeftPct: 19.9 }, hollowLabel: 'UNIT-998·999',
    })),
    ...draftEntries(ctx({
      stats: { ...ctx().stats, driversBitten: 99, repairs: 4, capRefusals: 2 }, chargeHeld: 29, lastShip: { name: 'W'.repeat(12), fuelLeftPct: 20.1 }, hollowLabel: 'UNIT-998·999',
    })),
  ].map((entry) => entry.why);
  check(`every card line (title, effect, why) is ≤ ${MAX_LINE_CHARS} characters`, [...UPGRADES.flatMap((def) => [def.title, def.effect]), ...worstWhy]
    .every((line) => line.length <= MAX_LINE_CHARS));
  const ownedOnce = ctx({ owned: { ...none, 'repair-v2': 1, 'thread-plus': 1 } });
  check('owned non-stackables (REPAIR v2, THREAD+) never appear in 1,000 seeds', !ever(ownedOnce, 'repair-v2') && !ever(ownedOnce, 'thread-plus'));
  let filled = true;
  for (let seed = 1; seed <= 200; seed++) if (ids(draftCards(ownedOnce, createRng(seed)).sort((x, y) => x.id.localeCompare(y.id))) !== 'charge,firewall,fuel-trim') filled = false;
  check('every non-stackable owned: the stackables (FIREWALL, +12 CHARGE, FUEL TRIM) fill the 3 slots', filled, ids(draftCards(ownedOnce, createRng(1))));
  check('a full FIREWALL stack (2) is never offered', !ever(ctx({ owned: { ...none, firewall: 2 } }), 'firewall'));
  check('REPAIR v2 is never offered to a unit with no Repair to bump (a crash before the licence)', !ever(ctx({ hasRepair: false }), 'repair-v2'));
  const noRoom = ctx({ linkRoom: 1 });
  check('a file card is never offered when its file has no link room', !ever(noRoom, 'firewall') && !ever(noRoom, 'fuel-trim')
    && draftCards(noRoom, createRng(1)).length === DRAFT_CARDS);
  const tight = ctx({ linkRoom: 0, hasRepair: false, owned: { ...none, 'thread-plus': 1 } });
  check('a hand-built state with fewer cards left deals every card it can, never a duplicate (here: +12 CHARGE alone)',
    ids(draftCards(tight, createRng(3))) === 'charge');
}

// --- The cards in the run ------------------------------------------------------------------------------------
const h = createHarness7(21, { soulsFound: true });
const state = () => h.store.getState();
const halcyon = classicShip(1);
const memoryValid = (): boolean => { try { assertMemoryInvariants(state().memory, MEMORY_LAYOUTS.FULL.totalBlocks); return true; } catch { return false; } };

// Ship 1, run 1, the simulation already used: a crash goes to EMERGENCY TRANSMIT (TRANSMIT in a few ticks).
// `prepare` runs on ship 1 before the crash (licences, damage).
function toTransmit(seed: number, prepare: () => void = () => {}): void {
  h.newRun(seed);
  h.store.update((d) => { d.run.phase = 'flight'; d.run.simulationRetryUsed = true; d.ui.mode = 'tools'; });
  prepare();
  const radius = state().level.planet.R + 20;
  h.store.mutate((d) => { d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
  if (state().run.phase !== 'transmit') throw new Error(`toTransmit: phase ${state().run.phase}`);
}

// Deals `id` on this TRANSMIT (test scaffolding: the offer is data) and picks it.
function pick(id: UpgradeId): void {
  h.store.update((d) => { d.run.transit!.offer = [{ id, title: id, effect: '', why: BASE_WHY, boosted: false }]; });
  const refusal = pickCard(h.store, id);
  if (refusal !== null) throw new Error(`pick ${id}: ${refusal}`);
}

{
  toTransmit(5);
  const offer = state().run.transit!.offer;
  check('TRANSMIT deals 3 cards, seeded by the ship being left (the same state deals the same)', offer.length === DRAFT_CARDS
    && ids(dealDraft(state(), CLASSIC_HOPS[halcyon.slot]!.linkBlocks)) === ids(offer), ids(offer));
  check('…with no REPAIR licensed yet (a crash before the first look inside), REPAIR v2 is not among them',
    !offer.some((card) => card.id === 'repair-v2') && !draftContext(state(), CLASSIC_HOPS[halcyon.slot]!.linkBlocks).hasRepair);
  let threw = '';
  try { transmitNext(h.store); } catch (error) { threw = (error as Error).message; }
  check('the pick is mandatory: TRANSMIT ▸ with no card picked throws, and the unit stays', /no card picked/.test(threw) && state().run.phase === 'transmit', threw);
  const notOffered = (['firewall', 'repair-v2', 'thread-plus', 'charge', 'fuel-trim'] as UpgradeId[]).find((id) => !offer.some((card) => card.id === id))!;
  check('a card that was not dealt can\'t be picked', pickCard(h.store, notOffered) === 'not-offered' && state().run.transit!.pick === null);
}

// FIREWALL.sys: a 2-block file in rack F, link room taken; then MOVEd next to HALCYON's root, it holds that side.
{
  toTransmit(5);
  const filesBefore = state().run.transit!.filesBlocks;
  pick('firewall');
  check('picking FIREWALL.sys puts its 2 blocks in the packet (the link carries it like the unit\'s files)',
    state().run.transit!.filesBlocks === filesBefore + FIREWALL_BLOCKS && state().run.transit!.pick === 'firewall');
  h.transmit();
  const starts = segmentStarts(state().memory);
  const index = state().memory.findIndex(isFirewall);
  // Slice 1a's pooled receiver: rack F's list follows rack E's with no gap, so the card sits after the fs-tools (in rack E
  // on a unit this small), then REPAIR CHARGE.
  const mem = state().memory;
  // Slice 2: 046.log packs after the FIREWALLs and before the charge (slice-2-plan Deviations (foundation) 10).
  check('HALCYON boots with Firewall.sys at the end of rack F\'s list (after the fs-tools, then 046.log and the charge), memory valid, the card in run.upgrades',
    index >= 0 && mem[index - 1]?.type === 'fs-tool' && mem[index + 1]?.type === 'log' && mem[index + 2]?.type === 'redundancy' && memoryValid()
      && state().run.upgrades.join() === 'firewall'
      && !state().memory[index]!.id.includes(PREVIEW_ID('x').split('~')[1]!), `${index} @ ${starts[index]}`);
  check('the next draft counts it as owned (1 of 2)', ownedUpgrades(state()).firewall === 1);
  const firewall = state().memory[index]!;
  check('a FIREWALL can\'t be copied, healed or scanned', targetRefusal(firewall, { state: state(), activeKind: 'copy', pickedSource: null }) === TOOL_REFUSAL.cardCopy
    && targetRefusal(firewall, { state: state(), activeKind: 'repair', pickedSource: null }) === TOOL_REFUSAL.firewallHealth
    && targetRefusal(firewall, { state: state(), activeKind: 'scan', pickedSource: null }) === TOOL_REFUSAL.firewallHealth);
  // Into the GAP of 2 between POD 04 and the root. Slice 2: HALCYON is calm (no root slot), so phase 2's geometry is planted
  // in rack B, `P P P P _2 R _1 P _13` (POD 05 moves behind the root), with phase 2's HALCYON HOLLOW (the WALLS stage).
  h.stepUntil(() => state().run.phase === 'flight', 15);
  h.store.update(plantHalcyonRoot);
  installTool(h.store, 'move');
  const memory = state().memory;
  const rootIndex = memory.findIndex((seg) => seg.type === 'hollow' && seg.root);
  const gap = memory[rootIndex - 1] as FreeSegment;
  check('HALCYON: a 2-block GAP left of the root (POD 04 behind it)', gap.type === 'free' && gap.size === 2 && memory[rootIndex - 2]?.type === 'driver');
  const refusal = actionMove(h.store, firewall, { regionSegIds: [gap.id], col: 0 });
  h.stepUntil(() => state().memory[state().memory.findIndex((seg) => seg.type === 'hollow' && seg.root) - 1]?.type === 'firewall'
    && !state().memory.some((seg) => seg.operating), 10);
  const after = state().memory;
  const rootAfter = after.findIndex((seg) => seg.type === 'hollow' && seg.root);
  check('MOVE carries the FIREWALL into the GAP right against the root', refusal === null && after[rootAfter - 1]?.type === 'firewall' && memoryValid(),
    String(refusal));
  const shields = reachMarks(state()).shields;
  check('…the reach model marks it as a shield on the root\'s left (the painter draws it; no GAP label in front of it)',
    shields.length === 1 && shields[0]!.firewallId === after[rootAfter - 1]!.id && shields[0]!.hollowEdge === 'right'
      && !reachMarks(state()).gaps.some((gap) => gap.hollowEdge === 'right' && gap.segIds.length > 0 && gap.kind === 'gap' && gap.blocks === 2),
    JSON.stringify(shields));
  // HOLLOW wakes now (the coast-tied wake, brought forward): it bites at once.
  h.store.update((d) => { d.hollow.cfg.wake = { afterAiSec: d.clock.aiSec + 1, coastLeadSec: null }; });
  h.stepUntil(() => state().hollow.phase === 'awake', 5);
  h.stepFor(1);
  const c08 = after[rootAfter - 2] as DriverSegment;
  const c09 = state().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 5);
  check('HOLLOW wakes and bites: the FIREWALL side holds (POD 04 clean), the open side is bitten (POD 05 across GAP 1)',
    state().hollow.phase === 'awake' && !state().memory.find((seg) => seg.id === c08.id && seg.type === 'driver' && seg.infected)
      && c09?.infected !== undefined, `POD ${c08.pod} infected=${String((state().memory.find((seg) => seg.id === c08.id) as DriverSegment | undefined)?.infected)}`);
}

// REPAIR v2: every Repair copy bumped; the held tool heals twice as fast.
{
  toTransmit(5, () => { installTool(h.store, 'repair'); });
  check('with REPAIR licensed, REPAIR v2 can be offered (the draft sees a Repair to bump)', draftContext(state(), CLASSIC_HOPS[halcyon.slot]!.linkBlocks).hasRepair);
  pick('repair-v2');
  h.transmit();
  const repairs = state().memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair');
  check('REPAIR v2: both Repair copies arrive at v2', repairs.length === 2 && repairs.every((seg) => seg.type === 'fs-tool' && seg.version === REPAIR_V2_VERSION));
  check('…the REPAIR in hand heals twice as fast (8 blocks: 37 %/s)', effectiveToolVersion(state(), 'repair') === REPAIR_V2_VERSION
    && Math.abs(repairRatePerSec(8, effectiveToolVersion(state(), 'repair')) - 2 * repairRatePerSec(8, 1)) < 1e-9);
  check('…and it is owned (never dealt again)', ownedUpgrades(state())['repair-v2'] === 1);
}

// THREAD+: three threads.
{
  toTransmit(5);
  pick('thread-plus');
  h.transmit();
  // An EMERGENCY TRANSMIT costs the Core (−25 and the hits): below 50 it thinks one thing at a time whatever
  // its capacity (§3.3 C5), so the capacity is checked, then the threads once it is healed.
  const capacity = getAiCore(state())?.capacity;
  h.store.update((d) => { const core = d.memory.find((seg) => seg.type === 'core')!; if (core.type === 'core') setIntegrity(core, 100); });
  check('THREAD+: the Core arrives with capacity 3, and a healthy mind runs three ops at once', capacity === 3 && coreThreads(state()) === 3
    && capabilitiesNow(state()).threads === 3, `capacity ${capacity}`);
}

// +12 REPAIR CHARGE: with the stars, before the floor; the boot's charge line says it.
{
  toTransmit(5);
  pick('charge');
  const carried = state().run.transit!.chargeCarried;
  h.transmit();
  const expected = Math.max(CHARGE_ARRIVAL_FLOOR, carried + CHARGE_CARD_BLOCKS);
  check('+12 REPAIR CHARGE arrives on top of what was carried', chargeLeft(state()) === expected && state().run.arrival?.cardCharge === CHARGE_CARD_BLOCKS,
    `${chargeLeft(state())} vs ${expected}`);
  h.stepUntil(() => state().run.phase === 'flight', 15);
  check('…and the boot\'s charge line says `+12 CHARGE (CARD)`', state().log.entries.some((entry) => entry.text.includes(`+${CHARGE_CARD_BLOCKS} CHARGE (CARD)`)),
    state().log.entries.filter((entry) => entry.speaker === 'mind-sys').map((entry) => entry.text).join(' | '));
}

// FUEL TRIM: +15% Δv on arrival while ≥ 50%; eaten mid-ship it keeps this ship's budget.
{
  toTransmit(5);
  pick('fuel-trim');
  h.transmit();
  const trims = upgradeFiles(state().memory, 'fuel-trim');
  check('FUEL TRIM arrives as a 2-block upgrade file in rack E, and works (caps.upgrades)', trims.length === 1
    && segmentStarts(state().memory)[state().memory.indexOf(trims[0]!)]! < rackStartOf('F', MEMORY_LAYOUTS.FULL) && capabilitiesNow(state()).upgrades['fuel-trim'] === 1);
  check('…HALCYON\'s Δv budget is +15% (FUEL 100% is worth more)', Math.abs(state().level.dvBudgetKmS - halcyon.flight.dvBudgetKmS * (1 + FUEL_TRIM_DV_BONUS_FRAC)) < 1e-9,
    `${state().level.dvBudgetKmS} km/s`);
  const trim = trims[0]! as UpgradeSegment;
  h.store.update((d) => { const file = d.memory.find((seg) => seg.id === trim.id) as UpgradeSegment; setIntegrity(file, 45); d.ui.memoryRev++; });
  check('a FUEL TRIM below 50% gives no effect (the next arrival would get no bonus)', liveUpgrades(state().memory, 'fuel-trim') === 0
    && flightModsOf(state().memory).dvBonusFrac === 0);
  const budget = state().level.dvBudgetKmS;
  // Eaten mid-ship: it becomes HOLLOW in place.
  h.store.update((d) => {
    const at = d.memory.findIndex((seg) => seg.id === trim.id);
    d.memory[at] = { id: 'hollow~test', name: '???', type: 'hollow', size: trim.size, root: false, locked: false, owner: '???' } as Segment;
    d.ui.memoryRev++;
  });
  check('FUEL TRIM eaten mid-ship: this ship keeps its budget; from the next arrival there is none', state().level.dvBudgetKmS === budget
    && flightModsOf(state().memory).dvBonusFrac === 0 && ownedUpgrades(state())['fuel-trim'] === 0);
  const two: Segment[] = [
    { id: 'a', name: 'Fuel Trim', type: 'upgrade', upgrade: 'fuel-trim', size: 2, integrity: 100, scanned: true },
    { id: 'b', name: 'Fuel Trim', type: 'upgrade', upgrade: 'fuel-trim', size: 2, integrity: 60, scanned: true, state: 'partial' },
  ];
  check('two working FUEL TRIMs stack: +30%', Math.abs(flightModsOf(two).dvBonusFrac - 2 * FUEL_TRIM_DV_BONUS_FRAC) < 1e-9);
}

finish();
