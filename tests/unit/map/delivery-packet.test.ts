// Track REPO (slice-3b-plan §6.1 map/delivery-packet): deliveries on the PACKET and across the beam, store-level, no flights.
// • chips for new, caught-up and sent-on requests; the link and room bars count them; the gate (TRANSMIT ▸ waits, the send
//   throws) and SEND ON freeing link for charge; SEND ON on a hop into a final ship loses the file (the view, the request,
//   the tally);
// • the send: the PACKET's preview equals the layout with the delivery seeds over 200 random mixes on fresh arms (the
//   send's own assert), and across them seeds never on a first of kind, into a calm ship or on the patch, beam seeds never
//   behind a delivered file, transit hits landing on deliveries;
// • licences and untried kinds; two chips of one new kind in one packet (one first of kind, one spare; SEND ON hands
//   "first" on); spare copies;
// • the REPAIR v2 patch at its boot line after REPAIR's renewal (no working Repair: renewed, then v2, the patch's blocks
//   freed), a broken patch, Repair.bak before REPAIR's first look (REPAIR still comes by its rule) and a delivered
//   Repair.bak never cancelling the renewal;
// • the boot's delivery lines in order, the patch first and never folded, folded past 3;
// • the classic world's boot plans byte-equal to the pre-3b tree's (classic-boot-plans.txt, from 28ddee8).
import { readFileSync } from 'node:fs';
import { check, finish } from '../landing/checks';
import type { Store } from '@state/store';
import type { GameState, ArrivalReport } from '@state/schema';
import type { DeliveryChip, RepoFileId } from '@/types/repo';
import { setCourse, goTransmit, transmitNext, arrivalDeliveries } from '@systems/run';
import { transmitModel, toggleSendOn } from '@systems/transmit';
import { pickCard } from '@systems/draft';
import { undeliveredFiles } from '@systems/repository';
import { receiveDeliveryAtBoot } from '@systems/delivery-boot';
import { deliveryBootLines, deliveryBootLineText } from '@systems/map-boot';
import { licenceSchedule, isLicensed } from '@systems/licences';
import { reachableFrom, hopBetween } from '@systems/map-hop';
import { currentSlot, isEndSlot } from '@systems/map-streams';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import { classicShip } from '@data/classic-five';
import { bootLinePlan, bootLine } from '@data/script';
import { layoutOf } from '@data/memory';
import { REPO_FILES } from '@data/repository';
import { REPO_TEXT, REPO_FILE_TEXT } from '@data/repo-text';
import { DELIVERY_SEED_CHANCE, REPAIR_V2_VERSION } from '@data/tuning';
import { createRng } from '@systems/rng';
import { byDepth } from '../depth';
import { armRun, toDesk, send, fitPacket, flyRoute, giveTools, dropTools, addRequest, throws } from './repo-fixture';

const at = (store: Store<GameState>): Readonly<GameState> => store.getState();
const chipsOf = (store: Store<GameState>): DeliveryChip[] => at(store).run.transit!.deliveries;
const unitFiles = (store: Store<GameState>): number => transmitModel(at(store)).chips.filter((chip) => !chip.dropped).reduce((sum, chip) => sum + chip.blocks, 0);
const repairs = (store: Store<GameState>) => at(store).memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair');

// --- Chips: new, caught up, sent on -------------------------------------------------------------------------------------
{
  const store = armRun();
  flyRoute(store, [0, 2, 5], ['mv', 'rm']);
  toDesk(store);
  const lateness = (hopBetween(at(store).run.map, 5, 11).slackYears) - 10;
  addRequest(store, { file: 'cp', status: 'in-transit', lateness });
  addRequest(store, { file: 'scan-bak', status: 'in-transit', lateness: 500 });
  setCourse(store, 11);
  check('a request in transit whose lateness reaches 0 at the hop rides it as a caught-up chip; one still behind does not',
    chipsOf(store).map((chip) => `${chip.file}:${chip.source}`).join() === 'cp:caught-up'
    && transmitModel(at(store)).inTransit === REPO_TEXT.packet.inTransit('Scan.bak', 500 - hopBetween(at(store).run.map, 5, 11).slackYears),
    `${JSON.stringify(chipsOf(store))} · ${transmitModel(at(store)).inTransit}`);
  const files = transmitModel(at(store)).files;
  check('…the link bar counts it: FILES = the unit\'s files + its 3 blocks, as the plan and the room bar say',
    files === unitFiles(store) + 3 && at(store).run.transit!.filesBlocks === files && transmitModel(at(store)).room.fit.files === files,
    `${files} vs ${unitFiles(store)}`);
  check('…its chip reads `Cp · 3 BLOCKS · ARRIVED y · [SEND ON]`', transmitModel(at(store)).deliveries[0]?.text === REPO_TEXT.packet.chip('Cp', 3, chipsOf(store)[0]!.arrivedYear)
    && transmitModel(at(store)).deliveries[0]?.sendOnLabel === REPO_TEXT.packet.sendOn);
  check('…a key that is no chip is refused', toggleSendOn(store, 'rq99') === 'no-chip');
  toggleSendOn(store, chipsOf(store)[0]!.key);
  check('SEND ON: the chip stays behind (SENT ON · RIDES YOUR NEXT HOP), its 3 blocks leave the link bar',
    transmitModel(at(store)).files === files - 3 && transmitModel(at(store)).deliveries[0]?.sendOnLabel === REPO_TEXT.packet.sentOn
    && at(store).run.transit!.filesBlocks === files - 3);
  const cpKey = chipsOf(store)[0]!.key;
  fitPacket(store);
  const offer = at(store).run.transit!.offer;
  if (offer.length > 0) pickCard(store, offer.some((card) => card.id === 'charge') ? 'charge' : offer[0]!.id);
  transmitNext(store);
  const cp = at(store).run.repo.requests.find((request) => request.id === cpKey)!;
  check('…after the send it waits in VESPER\'s receiver; nothing of it was laid out', cp.status === 'waiting' && cp.at === 11
    && !at(store).run.arrival!.deliveries.some((delivery) => delivery.key === cpKey));
  toDesk(store);
  setCourse(store, 15);
  check('…and rides the next hop as a sent-on chip (into CORMORANT)', chipsOf(store).map((chip) => `${chip.key}:${chip.source}`).includes(`${cpKey}:sent-on`), JSON.stringify(chipsOf(store)));
}

// --- The gate, and SEND ON freeing link for charge ---------------------------------------------------------------------
{
  const store = armRun();
  flyRoute(store, [0, 2, 5], ['mv', 'rm']);
  toDesk(store);
  const slack = hopBetween(at(store).run.map, 5, 11).slackYears;
  for (const file of ['repair-bak', 'repair-bak', 'repair-bak', 'repair-bak', 'cp', 'cp', 'cp', 'cp', 'scan-bak', 'scan-bak'] as RepoFileId[]) addRequest(store, { file, status: 'in-transit', lateness: slack - 1 });
  setCourse(store, 11);
  const model = transmitModel(at(store));
  check(`the deliveries push the packet over KESTREL → VESPER's link (${model.link}): TRANSMIT ▸ waits, the send throws`,
    model.room.tooMany !== null && model.room.fit.overLink > 0 && throws(() => transmitNext(at(store).run.transit!.offer.length > 0
      ? (pickCard(store, at(store).run.transit!.offer[0]!.id), store) : store)), `${model.files} files, link ${model.link}`);
  check('…the gate and arrival lines say SEND ON helps too: `n BLOCKS TOO MANY · LEAVE FILES OR SEND ON` (review m3)',
    model.room.tooMany === REPO_TEXT.packet.overWithDeliveries(Math.max(model.room.fit.overLink, model.room.fit.over))
    && model.dropLine === model.room.tooMany && model.arrivalLine === REPO_TEXT.packet.arrivalOverWithDeliveries,
    `${model.room.tooMany} | ${model.arrivalLine}`);
  const before = transmitModel(at(store));
  for (const chip of [...chipsOf(store)].reverse()) {
    if (transmitModel(at(store)).room.fit.overLink === 0 && transmitModel(at(store)).chargeCarried > before.chargeCarried) break;
    toggleSendOn(store, chip.key);
  }
  const after = transmitModel(at(store));
  check('…SEND ON clears the gate and frees link for charge (the charge that crosses rises)', after.room.fit.overLink === 0
    && after.chargeCarried > before.chargeCarried && after.chargeCarried === Math.min(after.chargeHeld, after.link - after.files),
    `${before.chargeCarried} → ${after.chargeCarried}`);
}

// --- SEND ON into a final ship: lost ----------------------------------------------------------------------------------------
{
  const store = armRun();
  flyRoute(store, [0, 2, 5, 11, 15], ['mv', 'rm', 'swap', 'cp']);
  toDesk(store);
  goTransmit(store, 19);
  const cp = chipsOf(store).find((chip) => chip.file === 'cp')!;
  check('CORMORANT → LAST LIGHT: Cp catches up (2915) and rides', cp !== undefined && cp.source === 'caught-up' && cp.arrivedYear === 2915, JSON.stringify(chipsOf(store)));
  toggleSendOn(store, cp.key);
  const view = transmitModel(at(store)).deliveries.find((chip) => chip.key === cp.key)!;
  check('…SEND ON into the final ship says `NO SHIP AFTER LAST LIGHT · IT IS LOST`', view.lost && view.sendOnLabel === REPO_TEXT.packet.lostAfter('LAST LIGHT'));
  fitPacket(store);
  const offer = at(store).run.transit!.offer;
  if (offer.length > 0) pickCard(store, offer[0]!.id);
  transmitNext(store);
  const request = at(store).run.repo.requests.find((entry) => entry.id === cp.key)!;
  check('…the send writes it lost at LAST LIGHT, and the tally lists it (NEVER ARRIVED: Cp)', request.status === 'lost' && request.at === 19
    && undeliveredFiles(at(store).run).map((entry) => entry.file).join() === 'cp' && isEndSlot(at(store).run.map, 19));
}

// --- Licences, untried kinds, two chips of one kind, spares ---------------------------------------------------------------
{
  const store = armRun();
  flyRoute(store, [0, 2, 5]);
  toDesk(store);
  const slack = hopBetween(at(store).run.map, 5, 11).slackYears;
  addRequest(store, { file: 'mv', status: 'in-transit', lateness: slack - 5 });
  addRequest(store, { file: 'mv', status: 'in-transit', lateness: slack - 2 });
  setCourse(store, 11);
  const noise = at(store).run.transit!.hop.noise;
  const [first, second] = chipsOf(store);
  check(`two Mv chips on one hop (noise ${noise}, into VESPER): the first is MOVE's first (no seed), the second a spare (${DELIVERY_SEED_CHANCE[noise]})`,
    first!.firstOfKind && first!.seedChance === 0 && !second!.firstOfKind && second!.seedChance === DELIVERY_SEED_CHANCE[noise] && noise > 0);
  toggleSendOn(store, first!.key);
  check('…SEND ON on the first hands "first" to the second', !chipsOf(store)[0]!.firstOfKind && chipsOf(store)[1]!.firstOfKind && chipsOf(store)[1]!.seedChance === 0);
  toggleSendOn(store, first!.key);
  check('…and back', chipsOf(store)[0]!.firstOfKind && !chipsOf(store)[1]!.firstOfKind);
  fitPacket(store);
  const offer = at(store).run.transit!.offer;
  if (offer.length > 0) pickCard(store, offer[0]!.id);
  transmitNext(store);
  const state = at(store);
  check('…after the send: MOVE licensed once, untried once, two Mv files laid out', state.run.licences.filter((kind) => kind === 'move').length === 1
    && state.hollow.untriedTools.filter((kind) => kind === 'move').length === 1
    && state.memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move').length === 2
    && state.run.arrival!.deliveries.map((delivery) => `${delivery.file}:${delivery.firstOfKind}`).join() === 'mv:true,mv:false',
    JSON.stringify(state.run.arrival!.deliveries));
  toDesk(store);
  const vesperSlack = hopBetween(at(store).run.map, 11, 15).slackYears;
  addRequest(store, { file: 'mv', status: 'in-transit', lateness: vesperSlack - 1 });
  setCourse(store, 15);
  check('a delivery of a kind already here is a spare: not first of kind, not untried', !chipsOf(store)[0]!.firstOfKind);
  fitPacket(store);
  if (at(store).run.transit!.offer.length > 0) pickCard(store, at(store).run.transit!.offer[0]!.id);
  transmitNext(store);
  check('…and the boot leaves untriedTools without it', !at(store).hollow.untriedTools.includes('move') && at(store).run.licences.filter((kind) => kind === 'move').length === 1);
}

// --- The patch, Repair.bak and REPAIR's renewal -------------------------------------------------------------------------------
{
  const store = armRun();
  giveTools(store, ['repair']);
  dropTools(store, 'repair');
  send(store, 2, 'repair-v2');
  const patch = at(store).run.arrival!.deliveries[0]!;
  check('a patch into HALCYON with no working Repair aboard: laid out as a 2-block repair-patch file, its line `· EVERY REPAIR → v2`',
    patch.file === 'repair-v2' && at(store).memory.some((seg) => seg.id === patch.segIds[0] && seg.type === 'upgrade' && seg.upgrade === 'repair-patch' && seg.size === 2)
    && deliveryBootLineText(at(store), 0) === REPO_TEXT.boot.patch(REPO_FILE_TEXT['repair-v2'].boot, patch.arrivedYear) && repairs(store).length === 0,
    deliveryBootLineText(at(store), 0));
  receiveDeliveryAtBoot(store, 0);
  check('…at its line: REPAIR renewed first, then every copy at v2, the patch gone (its blocks free), REPAIR v2 recorded',
    repairs(store).length === 2 && repairs(store).every((seg) => seg.type === 'fs-tool' && seg.version === REPAIR_V2_VERSION)
    && !at(store).memory.some((seg) => seg.type === 'upgrade' && seg.upgrade === 'repair-patch') && at(store).run.upgrades.includes('repair-v2')
    && at(store).run.repairRenewedOn === at(store).run.shipIndex && !throws(() => assertMemoryInvariants(at(store).memory, layoutOf(at(store)).totalBlocks)));

  const broken = armRun();
  giveTools(broken, ['repair']);
  send(broken, 2, 'repair-v2');
  const brokenPatch = at(broken).run.arrival!.deliveries[0]!;
  broken.update((draft) => {
    draft.run.arrival!.hits.push({ segId: brokenPatch.segIds[0]!, fileName: 'REPAIR v2 patch', role: null, from: 50, to: 20 });
  });
  check('a patch hit below the usable band: its line makes no v2 claim (`· DAMAGED · NOT INSTALLED`)',
    deliveryBootLineText(at(broken), 0) === REPO_TEXT.boot.patchBroken(REPO_FILE_TEXT['repair-v2'].boot, brokenPatch.arrivedYear));
  receiveDeliveryAtBoot(broken, 0);
  check('…used up all the same, and nothing upgrades', !at(broken).memory.some((seg) => seg.type === 'upgrade') && repairs(broken).every((seg) => seg.type === 'fs-tool' && seg.version === 1)
    && !at(broken).run.upgrades.includes('repair-v2'));

  const early = armRun();
  send(early, 2, 'repair-bak');
  const bak = at(early).run.arrival!.deliveries[0]!;
  check('Repair.bak before REPAIR\'s first look: delivered as a spare (not first of kind), REPAIR still unlicensed',
    bak.file === 'repair-bak' && !bak.firstOfKind && !isLicensed(at(early), 'repair') && !at(early).hollow.untriedTools.includes('repair'));
  const schedule = licenceSchedule(at(early).run.shipIndex, 'arm');
  check('…the arm\'s schedule is REPAIR\'s rule alone, and it is due: REPAIR still comes', schedule.length === 1 && schedule[0]!.kind === 'repair' && schedule[0]!.due(at(early)));

  const renew = armRun();
  giveTools(renew, ['repair']);
  dropTools(renew, 'repair');
  send(renew, 2, 'repair-bak');
  receiveDeliveryAtBoot(renew, 0);
  check('a delivered Repair.bak never cancels the free renewal (no working Repair of its own: renewed at the first delivery line)',
    at(renew).run.repairRenewedOn === at(renew).run.shipIndex && repairs(renew).length === 3, String(repairs(renew).map((seg) => seg.name)));
}

// --- Boot lines: in order, the patch first and never folded, folded past 3 --------------------------------------------------
{
  const store = armRun();
  send(store, 2);
  const chip = (key: string, file: RepoFileId, year: number): DeliveryChip => ({ key, file, blocks: REPO_FILES[file].blocks, source: 'caught-up', arrivedYear: year, sendOn: false, firstOfKind: false, seedChance: 0 });
  const chips = [chip('rq1', 'mv', 2330), chip('rq2', 'rm', 2331), chip('rq3', 'cp', 2332), chip('rq4', 'swap', 2333), chip('rq5', 'repair-v2', 2334)];
  const deliveries = arrivalDeliveries(chips, chips.map((entry) => ({ key: entry.key, segIds: [`seg-${entry.key}`] })), []);
  store.update((draft) => { draft.run.arrival!.deliveries = deliveries; });
  const groups = deliveryBootLines(at(store));
  check('five deliveries: the patch first on a line of its own, then mv, then rm · cp · swap folded into the third line',
    deliveries.map((entry) => entry.file).join() === 'repair-v2,mv,rm,cp,swap'
    && groups.map((group) => group.map((entry) => entry.file).join('+')).join(' | ') === 'repair-v2 | mv | rm+cp+swap'
    && deliveryBootLineText(at(store), 2) === REPO_TEXT.boot.folded(['rm', 'cp', 'swap'], 2331, 2333)
    && bootLinePlan(at(store), false).filter((kind) => kind === 'delivery').length === 3,
    groups.map((group) => group.map((entry) => entry.file).join('+')).join(' | '));
  // Review nit: three patches and a file made four lines (every patch had one of its own).
  const many = [chip('rq6', 'repair-v2', 2330), chip('rq7', 'repair-v2', 2331), chip('rq8', 'repair-v2', 2332), chip('rq9', 'mv', 2333)];
  store.update((draft) => { draft.run.arrival!.deliveries = arrivalDeliveries(many, many.map((entry) => ({ key: entry.key, segIds: [`seg-${entry.key}`] })), []); });
  const manyGroups = deliveryBootLines(at(store)).map((group) => group.map((entry) => entry.file).join('+')).join(' | ');
  check('three patches and a file: still three lines (the first patch alone, then mv, the other two patches folded)',
    manyGroups === 'repair-v2 | mv | repair-v2+repair-v2' && bootLinePlan(at(store), false).filter((kind) => kind === 'delivery').length === 3, manyGroups);
  store.update((draft) => { draft.run.arrival!.deliveries = deliveries; });
  const plan = bootLinePlan(at(store), false);
  check('…the delivery lines come after the ship\'s own damage and before the charge (02 §4 steps 5–7)',
    plan.indexOf('delivery') > plan.indexOf('ecc') && plan.lastIndexOf('delivery') < plan.indexOf('charge'), plan.join(' '));
}

// --- The send over 200 random mixes on fresh arms -------------------------------------------------------------------------
{
  const mixes = byDepth(200, 600);
  const files: RepoFileId[] = ['mv', 'rm', 'cp', 'swap', 'repair-bak', 'scan-bak', 'repair-v2'];
  let sent = 0;
  let deliveredFiles = 0;
  let seeded = 0;
  let hitOnDelivery = 0;
  const bad: string[] = [];
  for (let i = 0; i < mixes; i++) {
    const rng = createRng(500 + i);
    const store = armRun(2000 + i, 2);
    if (rng() < 0.5) giveTools(store, ['repair']);
    // Two random hops out, then a mix of requests catching up on the third (some sent on).
    for (let hop = 0; hop < 2; hop++) {
      toDesk(store);
      const options = reachableFrom(at(store).run.map, currentSlot(at(store).run));
      send(store, options[Math.floor(rng() * options.length)]!);
    }
    toDesk(store);
    const here = currentSlot(at(store).run);
    const options = reachableFrom(at(store).run.map, here);
    const to = options[Math.floor(rng() * options.length)]!;
    const slack = hopBetween(at(store).run.map, here, to).slackYears;
    const count = 1 + Math.floor(rng() * 4);
    for (let n = 0; n < count; n++) addRequest(store, { file: files[Math.floor(rng() * files.length)]!, status: 'in-transit', lateness: slack - Math.floor(rng() * 20) });
    setCourse(store, to);
    for (const entry of chipsOf(store)) if (rng() < 0.2) toggleSendOn(store, entry.key);
    fitPacket(store);
    const offer = at(store).run.transit!.offer;
    if (offer.length > 0) pickCard(store, offer[Math.floor(rng() * offer.length)]!.id);
    const plan = structuredClone(at(store).run.transit!);
    try {
      transmitNext(store);
    } catch (error) {
      bad.push(`mix ${i}: ${(error as Error).message}`);
      continue;
    }
    sent++;
    const arrival: ArrivalReport = at(store).run.arrival!;
    const deliveredIds = new Set(arrival.deliveries.flatMap((entry) => entry.segIds));
    deliveredFiles += arrival.deliveries.length;
    for (const entry of arrival.deliveries) {
      const chipOf = plan.deliveries.find((candidate) => candidate.key === entry.key)!;
      if (entry.seeded) {
        seeded++;
        if (chipOf.firstOfKind || entry.file === 'repair-v2' || plan.threat.act === 'calm') bad.push(`mix ${i}: a seed on ${entry.file} (first ${chipOf.firstOfKind}, ${plan.threat.act})`);
      }
    }
    // Every seed behind a delivered file is that delivery's own (one per delivery that rolled one): beam seeds never are.
    const seedsOnDelivered = arrival.deliveries.filter((entry) => entry.seeded).length;
    const layoutSeedsBehind = at(store).memory.reduce((sum, seg, index, memory) => {
      if (seg.type !== 'hollow' || !seg.beam) return sum;
      for (let cursor = index - 1; cursor >= 0; cursor--) {
        const left = memory[cursor]!;
        if (left.type !== 'free') return sum + (deliveredIds.has(left.id) ? 1 : 0);
      }
      return sum;
    }, 0);
    if (layoutSeedsBehind > seedsOnDelivered) bad.push(`mix ${i}: ${layoutSeedsBehind} seeds behind delivered files, ${seedsOnDelivered} rolled by deliveries`);
    if (arrival.hits.some((hit) => deliveredIds.has(hit.segId))) hitOnDelivery++;
  }
  console.log(`INFO  ${sent} of ${mixes} random sends: ${deliveredFiles} files delivered, ${seeded} carried a seed, ${hitOnDelivery} sends with a transit hit on a delivery`);
  check(`the preview equals the layout over ${mixes} random mixes (the send's own assert, delivery seeds included), and every rule held`,
    bad.length === 0 && sent === mixes, bad.slice(0, 5).join(' | '));
  check('…the mixes exercised seeds on deliveries and transit hits on them', seeded > 0 && hitOnDelivery > 0, `${seeded} seeded, ${hitOnDelivery} hit`);
}

// --- The classic world's boot plans, byte-equal to the pre-3b tree's --------------------------------------------------------
{
  const pinned = readFileSync(new URL('./classic-boot-plans.txt', import.meta.url), 'utf8').trimEnd();
  const out: string[] = [];
  for (let index = 0; index <= 4; index++) {
    for (const variant of ['bare', 'hits'] as const) {
      const base = createInitialState({ seed: 4, shipIndex: index, carried: index === 0 ? null : freshUnitRacks(classicShip(index)), phase: 'boot' });
      // A classic arrival that somehow carried a delivery still boots as phase 2's (the classic world has no repository).
      const arrival: ArrivalReport | null = index === 0 ? null : {
        hits: variant === 'hits' ? [{ segId: 'x', fileName: 'Telemetry', role: 'telemetry', from: 100, to: 70 }] : [],
        chargeCarried: 30, starCredit: variant === 'hits' ? 12 : 0, stars: variant === 'hits' ? 2 : 0, card: null, cardCharge: 0,
        chargeFloorAdded: 0, chargeOverflowLost: 0, scripted: [], eccCorrected: 0, seeds: [], boarded: null,
        deliveries: variant === 'hits' ? [{ key: 'rq1', file: 'mv', segIds: ['x'], arrivedYear: 2400, firstOfKind: true, seeded: false }] : [],
      };
      const state = { ...base, run: { ...base.run, arrival } } as GameState;
      for (const skill of [false, true]) {
        const lines = bootLinePlan(state, skill).map((kind) => (kind === 'skill' ? 'skill' : `${kind}: ${bootLine(kind, state, {} as never)}`));
        out.push(`${index} ${variant} ${skill} ${lines.join(' | ')}`);
      }
    }
  }
  check('the classic five\'s boot plans and lines are byte-equal to the pre-3b tree\'s (20 plans)', out.join('\n') === pinned,
    out.find((line, i) => line !== pinned.split('\n')[i]) ?? '');
}

finish();
