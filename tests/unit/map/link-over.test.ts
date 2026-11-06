// Slice 3a review fixes (B1, M1, M2, m1): a unit whose files outgrow a short arm hop's link, and the one arrival preview.
// • B1: a 90-block unit at VESPER on run 1's arm sets course to WAYFARER (58 LY, link 82, TIGHT): the card says LEAVE 8
//   BLOCKS BEHIND · TOO BIG FOR THE LINK before SET COURSE, SET COURSE reaches the PACKET (it threw in packUnit), the PACKET
//   says `8 TOO MANY FOR THE LINK · LEAVE FILES BEHIND`, deals no file card, offers drops that buy no charge, holds
//   TRANSMIT ▸ (transmitNext throws while over), and after the drops the unit crosses and boots on WAYFARER.
// • M1: roomFit's preview is layoutCarried's layout, for every files / charge / seeds mix on a FULL and a TIGHT ship (one
//   room and one fill rule: data/memory.ts roomForUnitOn and fillRoom).
// • M2 / m1: a TIGHT hop whose seeds could take the last of the charge asks the confirm; the tutorial run's depth-3 card
//   reads SEEDS 1 and keeps room for it.
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import { createInitialState } from '@state/initial';
import { createRunMap, mapAtShip, shipDefAt } from '@systems/map-run';
import { hopBetween, roomFit } from '@systems/map-hop';
import { endShip, openDesk, transmitNext } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { cardModel } from '@systems/desk';
import { transmitModel, toggleDrop } from '@systems/transmit';
import { pickCard } from '@systems/draft';
import { unitFilesIn, packUnit, layoutCarried, BEAM_SEED_LAYOUT_BLOCKS } from '@systems/carry';
import { arrivalPreview } from '@systems/arrival-preview';
import { createToolFiles } from '@data/fs-tools';
import { getUpgrade } from '@data/upgrades';
import { classicShip } from '@data/classic-five';
import { nominalShipThreat } from '@systems/threat-plan';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { MAP_TEXT } from '@data/map-text';
import { createRng } from '@systems/rng';

const VESPER = 11;
const WAYFARER = 18;

// Run 1's arm with the unit's route at `route`'s last ship, its ship ended on the LANDING REPORT, and `extra` files laid
// into the largest free run of its memory.
function unitAt(route: readonly number[], extra: readonly Segment[]): Store<GameState> {
  let map = createRunMap({ wave: 1 }, 3);
  for (let i = 1; i < route.length; i++) map = mapAtShip(map, route[i]!, hopBetween(map, route[i - 1]!, route[i]!));
  const store = createStore<GameState>(createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE }));
  store.update((draft) => {
    draft.run.map = structuredClone(map);
    draft.run.shipIndex = map.route.length - 1;
    draft.run.phase = 'report';
    const at = draft.memory.reduce((best, seg, i) => (seg.type === 'free' && seg.size > (draft.memory[best]!.type === 'free' ? draft.memory[best]!.size : 0) ? i : best), 0);
    const free = draft.memory[at]!;
    const blocks = extra.reduce((sum, seg) => sum + seg.size, 0);
    if (free.type !== 'free' || free.size < blocks) throw new Error(`unitAt: no free run of ${blocks} blocks`);
    draft.memory.splice(at, 1, ...structuredClone(extra), { ...free, size: free.size - blocks });
  });
  return store;
}

const filesOf = (state: Readonly<GameState>): number =>
  unitFilesIn(state.memory).filter((seg) => seg.type !== 'redundancy').reduce((sum, seg) => sum + seg.size, 0);

// --- B1: 90 blocks of files to an 82-block link -------------------------------------------------------------------------
{
  const base = createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE });
  const telemetry = base.memory.find((seg) => seg.role === 'telemetry')!;
  const sensor = base.memory.find((seg) => seg.role === 'sensor')!;
  // Every filesystem tool but SCAN (already aboard), spare Telemetry and Sensor copies, two FIREWALLs.
  const tools = (['repair', 'move', 'copy', 'delete', 'swap'] as const).flatMap((kind) => createToolFiles(kind));
  const spares: Segment[] = [
    ...tools,
    { ...structuredClone(telemetry), id: 'telem-copy', name: 'Telemetry.cp' } as Segment,
    { ...structuredClone(sensor), id: 'sens-copy', name: 'Sensor Interp.cp' } as Segment,
    { id: 'fw-1', name: 'FIREWALL.sys', type: 'firewall', size: 2, desc: '' } as Segment,
    { id: 'fw-2', name: 'FIREWALL.sys', type: 'firewall', size: 2, desc: '' } as Segment,
  ];
  const store = unitAt([0, 2, 5, VESPER], spares);
  check('the unit carries 90 blocks of files at VESPER', filesOf(store.getState()) === 90, String(filesOf(store.getState())));
  const hop = hopBetween(store.getState().run.map, VESPER, WAYFARER);
  check('…VESPER → WAYFARER is 58 LY, link 82, a TIGHT ship (room 88)', hop.distanceLy === 58 && hop.linkBlocks === 82 && hop.room === 88, JSON.stringify(hop));

  endShip(store, 'locked');
  openDesk(store, null);
  const card = cardModel(store.getState(), WAYFARER);
  check('the card says it before SET COURSE: LEAVE 8 BLOCKS BEHIND · TOO BIG FOR THE LINK (warn)',
    card.fit?.word === 'leave' && card.fit.overLink === 8
    && card.rows.find((row) => row.key === 'fit')?.value === 'LEAVE 8 BLOCKS BEHIND · TOO BIG FOR THE LINK'
    && card.rows.find((row) => row.key === 'fit')?.tone === 'warn', JSON.stringify(card.rows[0]));

  let threw: string | null = null;
  try { setCourseFromDesk(store, WAYFARER); } catch (error) { threw = (error as Error).message; }
  check('SET COURSE reaches the PACKET (packUnit no longer throws)', threw === null && store.getState().run.phase === 'transmit', threw ?? '');
  const plan = store.getState().run.transit!;
  check('…the draft deals no file card (no link room)', plan.offer.every((offer) => getUpgrade(offer.id).blocks === 0) && plan.offer.length > 0,
    plan.offer.map((offer) => offer.id).join());
  let model = transmitModel(store.getState());
  check('…the PACKET: `8 TOO MANY FOR THE LINK · LEAVE FILES BEHIND`, TRANSMIT ▸ held, the drop line says it',
    model.room.tooMany === MAP_TEXT.packet.overLink(8) && model.room.tone === 'over' && model.dropLine === model.room.tooMany
    && model.packetLine === 'LINK 82 · FILES 90 · 8 TOO MANY FOR THE LINK' && model.arrivalLine === MAP_TEXT.packet.arrivalLeave,
    `${model.room.tooMany} | ${model.packetLine}`);
  const spare = model.chips.find((chip) => chip.segId === 'sens-copy')!;
  check('…the spare Sensor Interp is offered though it buys no charge', spare.toggleable && spare.chargeGain === 0 && spare.lock === null, JSON.stringify(spare));
  pickCard(store, plan.offer[0]!.id);
  threw = null;
  try { transmitNext(store); } catch (error) { threw = (error as Error).message; }
  check('…a send while over the link throws (TRANSMIT ▸ waits for the drops)', threw !== null && /over the link/.test(threw) && store.getState().run.phase === 'transmit', threw ?? '');

  check('…leaving the spare Sensor Interp (8 blocks) behind clears the link', toggleDrop(store, 'sens-copy') === null);
  model = transmitModel(store.getState());
  check('…then nothing is held: files 82 on link 82, files fit the room 88', model.room.tooMany === null && model.room.fit.files === 82
    && model.room.fit.overLink === 0 && model.room.fit.over === 0, JSON.stringify(model.room.fit));
  threw = null;
  try { transmitNext(store); } catch (error) { threw = (error as Error).message; }
  const after = store.getState();
  check('…and the unit crosses: WAYFARER boots, a TIGHT ship, with the 82 blocks of files', threw === null && after.run.phase === 'boot'
    && after.level.shipName === 'WAYFARER' && after.level.memoryClass === 'TIGHT' && filesOf(after) === 82, threw ?? after.level.shipName);
}

// --- M1: the preview is the layout (one room, one fill rule) -------------------------------------------------------------
{
  const full = classicShip(4);
  const tight = shipDefAt(createRunMap({ wave: 1 }, 3), WAYFARER);
  const fresh = createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE }).memory;
  const rng = createRng(11);
  let compared = 0;
  const misses: string[] = [];
  for (const ship of [full, tight]) {
    const room = ship.memoryClass === 'TIGHT' ? 88 : 152;
    const floor = ship.memoryClass === 'TIGHT' ? 0 : 12;
    for (let i = 0; i < 120; i++) {
      const packet = packUnit(fresh, 300, []);
      const filler = Math.floor(rng() * (room - floor - packet.filesBlocks + 1));
      packet.rackE.push({ id: `filler-${i}`, name: 'Filler', type: 'skill', size: Math.max(1, filler), integrity: 100 } as unknown as Segment);
      packet.filesBlocks += Math.max(1, filler);
      if (packet.filesBlocks + floor > room) continue;
      const seeds = Math.floor(rng() * 4);
      packet.seeds = packet.rackE.slice(0, seeds).map((seg) => ({ targetId: seg.id, targetName: seg.name, words: 'x' }));
      const wanted = floor + Math.floor(rng() * 60);
      const layout = layoutCarried(packet, wanted, ship, nominalShipThreat(4), '???');
      const fit = roomFit({
        files: [...packet.rackE, ...packet.rackF], charge: 0, bonus: { starCredit: wanted, card: 0 },
        seedBlocksMin: seeds * BEAM_SEED_LAYOUT_BLOCKS, seedBlocksMax: seeds * BEAM_SEED_LAYOUT_BLOCKS,
      }, { linkBlocks: 300, room, chargeFloor: floor });
      compared++;
      if (fit.chargeArrives !== layout.chargeBlocks || fit.roomLost !== layout.overflowLost) {
        misses.push(`${ship.name} files ${packet.filesBlocks} seeds ${seeds} want ${wanted}: preview ${fit.chargeArrives}, layout ${layout.chargeBlocks}`);
      }
    }
  }
  check(`roomFit's charge is layoutCarried's on FULL and TIGHT ships (${compared} mixes, seeds 0–3)`, compared > 150 && misses.length === 0, misses.slice(0, 3).join(' | '));
}

// --- M2: seeds that could take the last of the charge ask the confirm; the preview's numbers agree -----------------------
{
  const fit = roomFit({ files: [{ size: 68 }], charge: 36, bonus: { starCredit: 18, card: 0 }, seedBlocksMax: 2 * BEAM_SEED_LAYOUT_BLOCKS },
    { linkBlocks: 110, room: 88, chargeFloor: 0 });
  const preview = arrivalPreview(fit, { starCredit: 18, stars: 3, card: 0 });
  check('the reviewer\'s fit probe: 54 wanted, ROOM FOR 20, 6 IF SEEDS RIDE, on every line (card, room line, arrival line)',
    preview.sum === 'ON ARRIVAL: 36 CARRIED + 18 (★★★) = 54 · ROOM FOR 20' && preview.card === 'CHARGE SQUEEZED: 20 ARRIVES (6 IF SEEDS RIDE)'
    && preview.charge === "CHARGE 54 → 20 ON ARRIVAL (6 IF SEEDS RIDE) · 34 WON'T FIT" && preview.confirm === null, JSON.stringify(preview));
  const zeroIfSeeds = arrivalPreview(roomFit({ files: [{ size: 74 }], charge: 30, seedBlocksMax: 2 * BEAM_SEED_LAYOUT_BLOCKS },
    { linkBlocks: 110, room: 88, chargeFloor: 0 }), { starCredit: 0, stars: 0, card: 0 });
  check('…14 arrive but two seeds would leave 0: the confirm opens (chargeArrivesMin 0)', zeroIfSeeds.fit.chargeArrives === 14
    && zeroIfSeeds.confirm === MAP_TEXT.packet.zeroIfSeedsConfirm && zeroIfSeeds.tone === 'zero', JSON.stringify(zeroIfSeeds));
}

// --- m1: the tutorial run's scripted seed on the depth-3 card --------------------------------------------------------------
{
  const store = unitAt([0, 2], []);
  endShip(store, 'locked');
  openDesk(store, null);
  const kestrel = cardModel(store.getState(), 5);
  check('run 1, HALCYON → KESTREL (depth 3): the card reads SEEDS 1 (the scripted Telemetry seed) and keeps its room',
    /SEEDS 1$/.test(kestrel.rows.find((row) => row.key === 'noise')?.value ?? '') && kestrel.fit?.seedsMin === 1 && kestrel.fit.seedsMax === 1,
    `${kestrel.rows.find((row) => row.key === 'noise')?.value} ${JSON.stringify(kestrel.fit)}`);
}
finish();
