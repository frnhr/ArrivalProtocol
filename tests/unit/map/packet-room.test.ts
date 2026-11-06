// Slice 3a DESK: the PACKET's new rows on run 1's arm (systems/transmit.ts transmitModel, toggleDrop; 02-map §4,
// 01-landing §3.16), with the transit plan built directly (goTransmit needs the arm's shipDefOf, Track GEN's): the years
// headline, the ECC line, the room bar and its words (`ROOM 88 · FILES n · NO FLOOR`, `CHARGE 40 → 31 ON ARRIVAL · 9 WON'T
// FIT`), the arrival line on the destination's own floor, TIGHT's `→ 0 ON ARRIVAL` (TRANSMIT ▸ asks first), files over
// the room (TRANSMIT ▸ waits; a drop is offered even when it buys no charge), and a drop's charge on arrival.
// Slice 3b (Track UI): the DELIVERIES chips' words and SEND ON labels (sent on; lost into a final ship), the IN TRANSIT
// line and the SALVAGE heading.
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState, TransitPlan } from '@state/schema';
import type { RouteStop } from '@/types/map';
import { createInitialState } from '@state/initial';
import { transmitModel, toggleDrop, packetFit } from '@systems/transmit';
import { hopBetween, hitsLanding } from '@systems/map-hop';
import { packUnit } from '@systems/carry';
import { mapFacts } from '@systems/map-facts';
import { planThreat, threatInputFor } from '@systems/threat-plan';
import { MAP_TEXT } from '@data/map-text';
import { REPO_TEXT } from '@data/repo-text';
import type { DeliveryChip, RepoRequest } from '@/types/repo';
import { run1Map } from './run1-fixture';

// The unit on run 1's arm at the end of `route`, its ship ended, on the PACKET to `to`.
function packetTo(
  route: readonly number[], to: number,
  opts: { charge?: number; starCredit?: number; room?: number; deliveries?: DeliveryChip[]; requests?: RepoRequest[] } = {},
): Store<GameState> {
  const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 0, phase: 'desk' }));
  const map = run1Map(4);
  map.route = route.map((slot, i): RouteStop => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, route[i - 1]!, slot) }));
  map.galaxyYear = map.arm[route[route.length - 1]!]!.approachYear;
  store.update((draft) => {
    draft.run.map = map;
    draft.run.shipIndex = route.length - 1;
    if (opts.charge !== undefined) {
      const charge = draft.memory.find((seg) => seg.type === 'redundancy');
      if (charge?.type === 'redundancy') charge.used = opts.charge;
    }
  });
  const state = store.getState();
  const from = route[route.length - 1]!;
  const real = hopBetween(state.run.map, from, to);
  const hop = opts.room === undefined ? real : { ...real, room: opts.room };
  const packet = packUnit(state.memory, hop.linkBlocks, []);
  const threat = planThreat(threatInputFor(state.run.threat, mapFacts(state.run.map, from, to, route.length + 1), false));
  const plan: TransitPlan = {
    toShipIndex: route.length, toSlot: to, hop, linkBlocks: hop.linkBlocks, filesBlocks: packet.filesBlocks,
    chargeHeld: packet.chargeHeld, chargeCarried: packet.chargeCarried, extraHits: 0, coreHit: 0, coreReset: false,
    dropped: [], offer: [], pick: null, threat, deliveries: opts.deliveries ?? [], packAs: {},
  };
  store.update((draft) => {
    draft.run.ships.push({
      shipId: draft.level.shipId, shipName: 'KESTREL', slot: from, depth: route.length, outcome: 'locked', stars: 2, fuelLeftPct: 40,
      ringMiss: null, colonistsAboard: 1200, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedInLz: 1200,
      points: 1200, colony: null, pods: [],
    });
    draft.run.pendingStarCredit = opts.starCredit ?? 0;
    draft.run.pendingStars = (opts.starCredit ?? 0) / 6;
    draft.run.transit = plan;
    draft.run.repo.requests = opts.requests ?? [];
    draft.run.phase = 'transmit';
  });
  return store;
}

// KESTREL → VESPER (FULL, 55 LY, 103 years early).
let model = transmitModel(packetTo([0, 2, 5], 11).getState());
check('the years headline: NEXT: VESPER · 3,200 COLONISTS · 55 LY · 103 YRS EARLY', model.headline === 'NEXT: VESPER · 3,200 COLONISTS · 55 LY · 103 YRS EARLY', model.headline);
check('…the ECC line takes the hits line\'s place: 8 HITS · 4 FIXED WHILE YOU SLEEP (103 YRS) → 4 LAND',
  model.arm && model.onTheWay === MAP_TEXT.packet.onTheWay(8, 4, 103, 4) && model.onTheWay === 'ON THE WAY: 8 HITS · 4 FIXED WHILE YOU SLEEP (103 YRS) → 4 LAND',
  model.onTheWay ?? '');
check('…a FULL room fits everything: ROOM 152 · FILES n + FLOOR 12, no charge line, TRANSMIT ▸ free',
  model.room.line === MAP_TEXT.packet.room(152, model.room.fit.files, 12) && model.room.charge === null && model.room.tone === 'quiet'
  && model.room.tooMany === null && model.room.confirm === null, JSON.stringify(model.room));

// KESTREL → LAPWING (TIGHT, room 88, no floor) with 40 charge held.
let store = packetTo([0, 2, 5], 8, { charge: 40 });
model = transmitModel(store.getState());
const fit = model.room.fit;
check('TIGHT: ROOM 88 · FILES n · NO FLOOR, and the squeeze named before it happens',
  model.room.line === MAP_TEXT.packet.roomNoFloor(88, fit.files) && model.room.tone === 'squeezed'
  && model.room.charge === MAP_TEXT.packet.squeeze(fit.wanted, fit.chargeArrives, fit.roomLost) && fit.chargeArrives === 88 - fit.files,
  `${model.room.line} | ${model.room.charge}`);
// The review's M1: one arrival number. The arrival line adds up the same sum (no floor on a TIGHT ship) and names the room
// it meets; the number that arrives is the room line's.
check('…the arrival line is the room line\'s number: `ON ARRIVAL: n CARRIED = n · ROOM FOR m` (one preview, M1)',
  model.arrivalCharge === fit.chargeArrives && fit.chargeArrives < fit.wanted
  && model.arrivalLine === MAP_TEXT.packet.roomFor(`${fit.carried} CARRIED`, fit.wanted, fit.chargeArrives)
  && !model.arrivalLine.includes('REPAIR CHARGE') && model.packetLine.endsWith('→ CROSSES'), `${model.arrivalLine} | ${model.packetLine}`);
const telemetry = model.chips.find((chip) => chip.name === 'Telemetry')!;
check('…leaving Telemetry behind lets its blocks of charge arrive (room-bound, the link is not): arriveGain 6, chargeGain 0',
  telemetry.arriveGain === telemetry.blocks && telemetry.chargeGain === 0 && telemetry.toggleable, JSON.stringify(telemetry));
check('…and toggleDrop takes it', toggleDrop(store, telemetry.segId) === null
  && transmitModel(store.getState()).room.fit.chargeArrives === fit.chargeArrives + telemetry.blocks);

// TIGHT with nothing to carry: → 0 ON ARRIVAL, TRANSMIT ▸ asks first.
model = transmitModel(packetTo([0, 2, 5], 8, { charge: 0 }).getState());
check('TIGHT with no charge: `→ 0 ON ARRIVAL` in red, the inline confirm is due',
  model.room.confirm === MAP_TEXT.packet.zeroConfirm && model.room.tone === 'zero' && model.room.charge === MAP_TEXT.packet.zeroCharge
  && model.room.fit.word === 'no-charge');

// Files over the room (a room shrunk to 50 for the check): TRANSMIT ▸ waits, a drop is offered even with nothing to gain.
store = packetTo([0, 2, 5], 8, { charge: 0, room: 50 });
model = transmitModel(store.getState());
const over = model.room.fit.over;
check('files over the room: `n TOO MANY FOR THE ROOM · LEAVE FILES BEHIND`, the drop line says it',
  over > 0 && model.room.tooMany === MAP_TEXT.packet.overRoom(over) && model.dropLine === model.room.tooMany && model.room.tone === 'over');
const spare = model.chips.find((chip) => chip.lock === null && !chip.dropped)!;
check('…a file can be left behind though it buys no charge (01 §3.16: TRANSMIT ▸ waits)',
  spare.chargeGain === 0 && spare.toggleable && toggleDrop(store, spare.segId) === null);
check('…and the room count follows', packetFit(store.getState(), store.getState().run.transit!).over === Math.max(0, over - spare.blocks));
check('hitsLanding is the ECC line\'s count', hitsLanding(hopBetween(run1Map(4), 5, 11), 0) === 4);
// --- 3b: the DELIVERIES chips, IN TRANSIT and SALVAGE ------------------------------------------------------------------
const chip = (key: string, file: DeliveryChip['file'], blocks: number, arrivedYear: number, sendOn = false): DeliveryChip => ({
  key, file, blocks, source: 'caught-up', arrivedYear, sendOn, firstOfKind: false, seedChance: 0,
});
model = transmitModel(packetTo([0, 2, 5], 11, { deliveries: [chip('rq2', 'rm', 1, 2436)] }).getState());
check('a delivery chip: `Rm · 1 BLOCK · ARRIVED 2436 · [SEND ON]`', model.deliveries.length === 1
  && model.deliveries[0]!.text === 'Rm · 1 BLOCK · ARRIVED 2436' && model.deliveries[0]!.sendOnLabel === REPO_TEXT.packet.sendOn
  && !model.deliveries[0]!.lost, JSON.stringify(model.deliveries));
check('…the arm\'s draft is headed SALVAGE', model.salvageTitle === 'SALVAGE · PICK ONE TO CARRY');
model = transmitModel(packetTo([0, 2, 5], 11, { deliveries: [chip('rq2', 'rm', 1, 2436, true)] }).getState());
check('…sent on: `SENT ON · RIDES YOUR NEXT HOP`', model.deliveries[0]!.sendOn && model.deliveries[0]!.sendOnLabel === REPO_TEXT.packet.sentOn);
model = transmitModel(packetTo([0, 2, 5, 11, 15], 19, { deliveries: [chip('rq4', 'cp', 3, 2861, true)] }).getState());
check('…sent on into the final ship: `NO SHIP AFTER LAST LIGHT · IT IS LOST`', model.deliveries[0]!.lost
  && model.deliveries[0]!.sendOnLabel === 'NO SHIP AFTER LAST LIGHT · IT IS LOST', model.deliveries[0]!.sendOnLabel);
const behind: RepoRequest = {
  id: 'rq1', file: 'swap', fromSlot: 2, toSlot: 5, requestedYear: 2352, lateness: 200, status: 'in-transit', at: null, arrivedYear: null,
};
model = transmitModel(packetTo([0, 2, 5], 11, { requests: [behind] }).getState());
check('IN TRANSIT: a request still behind after this hop (200 − 103 = 97): `IN TRANSIT: Swap · 97 YRS BEHIND YOU`',
  model.inTransit === 'IN TRANSIT: Swap · 97 YRS BEHIND YOU', model.inTransit ?? 'null');
check('…none: no IN TRANSIT line, no chips', transmitModel(packetTo([0, 2, 5], 11).getState()).inTransit === null
  && transmitModel(packetTo([0, 2, 5], 11).getState()).deliveries.length === 0);

finish();
