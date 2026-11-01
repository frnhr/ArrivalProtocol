// Slice 3a F2 and its review follow-up (M1): the room for the unit (01-landing §3.16, the amendment of 02 §3.3;
// systems/map-hop.ts roomFit), pure, against the PACKET's own rules (systems/carry.ts packUnit's link, arrivalCharge's
// star credit, card and floor, layoutCarried's seeds before the charge), and the memory classes' numbers it reads
// (FULL / COMPACT / TIGHT: 384 / 320 / 256 blocks, room 152 / 152 / 88, floor 12 / 12 / 0).
import { check, finish } from '../landing/checks';
import { roomFit, hopBetween } from '@systems/map-hop';
import { arrivalCharge, BEAM_SEED_LAYOUT_BLOCKS } from '@systems/carry';
import { MEMORY_LAYOUTS, layoutForTotal, rackOf, rackStartOf } from '@data/memory';
import { run1Map } from './run1-fixture';

const files = (...sizes: number[]): { size: number }[] => sizes.map((size) => ({ size }));
const hop = (cls: 'FULL' | 'COMPACT' | 'TIGHT', linkBlocks = 123) => ({ linkBlocks, room: MEMORY_LAYOUTS[cls].roomForUnit, chargeFloor: MEMORY_LAYOUTS[cls].chargeFloor });
const json = (value: unknown): string => JSON.stringify(value);

const { FULL, COMPACT, TIGHT } = MEMORY_LAYOUTS;
check('classes: 384 / 320 / 256 blocks; racks ABCDEF / ABCEF / ABCE; the unit at 256 / 192 / 192',
  [FULL, COMPACT, TIGHT].map((l) => `${l.totalBlocks}:${l.racks.join('')}:${l.unitStart}`).join() === '384:ABCDEF:256,320:ABCEF:192,256:ABCE:192');
check('…receiver 128 / 128 / 64, room 152 / 152 / 88, floor 12 / 12 / 0, most pods 16 / 8 / 8',
  [FULL, COMPACT, TIGHT].map((l) => `${l.receiverBlocks}/${l.roomForUnit}/${l.chargeFloor}/${l.maxPods}`).join() === '128/152/12/16,128/152/12/8,64/88/0/8');
check('…a total names its class, rack E is always the unit\'s, rack names are not an alphabet',
  layoutForTotal(320) === COMPACT && rackStartOf('E', COMPACT) === 192 && rackOf(200, COMPACT) === 'E' && rackOf(130, TIGHT) === 'C');
let threw = false;
try { layoutForTotal(300); } catch { threw = true; }
check('…a total no class has throws', threw);

const fits = roomFit({ files: files(16, 8, 4, 8, 6, 6, 4, 3, 2, 8), charge: 40 }, hop('FULL'));
check('a 65-block unit with 40 charge fits a FULL ship: all 40 arrive', fits.word === 'fits' && fits.files === 65 && fits.chargeArrives === 40
  && fits.linkLost === 0 && fits.roomLost === 0, json(fits));
const low = roomFit({ files: files(65), charge: 5 }, hop('COMPACT'));
check('…5 charge arrives topped up to the floor of 12 (nothing lost)', low.word === 'fits' && low.chargeArrives === 12 && low.roomLost === 0, json(low));

// (a) The star credit and the +12 card arrive like arrivalCharge says.
const bonus = roomFit({ files: files(70), charge: 20, bonus: { starCredit: 18, card: 12 } }, hop('FULL'));
check('the star credit and the card arrive on top of what crossed (20 + 18 + 12 = 50), as arrivalCharge counts them',
  bonus.word === 'fits' && bonus.chargeArrives === 50 && bonus.chargeArrives === arrivalCharge(20, 18, 12).blocks, json(bonus));
const bonusSqueezed = roomFit({ files: files(120), charge: 3, bonus: { starCredit: 18, card: 12 } }, hop('FULL'));
check('…and the room can squeeze them (152 − 120 = 32 of 33)', bonusSqueezed.word === 'squeezed' && bonusSqueezed.chargeArrives === 32 && bonusSqueezed.roomLost === 1,
  json(bonusSqueezed));

// (b) The link's loss and the room's are apart; squeezed means the room.
const lapwing = roomFit({ files: files(79), charge: 30 }, hop('TIGHT', 117));
check('LAPWING (TIGHT, room 88, no floor): 79 blocks of files leave room for 9 of 30 (`CHARGE SQUEEZED: 9 ARRIVES`)',
  lapwing.word === 'squeezed' && lapwing.chargeArrives === 9 && lapwing.roomLost === 21 && lapwing.linkLost === 0 && lapwing.floor === 0, json(lapwing));
const linked = roomFit({ files: files(80), charge: 30 }, hop('FULL', 86));
check('a link-limited unit is not squeezed by the room: 6 cross, the floor tops up to 12, 24 left by the link',
  linked.word === 'fits' && linked.carried === 6 && linked.chargeArrives === 12 && linked.linkLost === 24 && linked.roomLost === 0, json(linked));

// (c) No charge arrives: no-charge, an empty unit included.
const none = roomFit({ files: files(88), charge: 20 }, hop('TIGHT'));
check('files filling a TIGHT room: no charge arrives', none.word === 'no-charge' && none.chargeArrives === 0 && none.over === 0, json(none));
const empty = roomFit({ files: files(60), charge: 0 }, hop('TIGHT'));
check('…a unit with no charge on a TIGHT ship (no floor) arrives with none: no-charge', empty.word === 'no-charge' && empty.chargeArrives === 0, json(empty));
const emptyFull = roomFit({ files: files(60), charge: 0 }, hop('FULL'));
check('…the same unit on a FULL ship gets the floor: fits with 12', emptyFull.word === 'fits' && emptyFull.chargeArrives === 12, json(emptyFull));

// (d) Seeds first (01 §3.16's fill order: files, floor, seeds, the rest).
const seeded = roomFit({ files: files(110), charge: 40, seedBlocksMax: 3 * BEAM_SEED_LAYOUT_BLOCKS }, hop('FULL', 200));
check('three seeds (21 blocks) come before the charge above the floor: 40 without them, 21 with them, never below the floor',
  seeded.chargeArrives === 40 && seeded.chargeArrivesMin === 21 && seeded.word === 'fits', json(seeded));
const seededTight = roomFit({ files: files(80), charge: 30, seedBlocksMax: 2 * BEAM_SEED_LAYOUT_BLOCKS }, hop('TIGHT'));
check('…on a TIGHT ship (no floor) seeds can leave the charge at 0', seededTight.chargeArrives === 8 && seededTight.chargeArrivesMin === 0, json(seededTight));
const floorHolds = roomFit({ files: files(135), charge: 30, seedBlocksMax: 21 }, hop('FULL', 200));
check('…the floor holds against them: 17 without seeds, 12 with', floorHolds.chargeArrives === 17 && floorHolds.chargeArrivesMin === 12, json(floorHolds));

// The room's own limit.
const leave = roomFit({ files: files(150), charge: 20 }, hop('FULL', 200));
check('files + the floor over the room: leave 10 behind', leave.word === 'leave' && leave.over === 10 && leave.chargeArrives === 0, json(leave));
const tightLeave = roomFit({ files: files(90), charge: 0 }, hop('TIGHT'));
check('…on a TIGHT ship the files alone must fit (90 of 88: leave 2)', tightLeave.word === 'leave' && tightLeave.over === 2, json(tightLeave));

// On run 1's hops (their room comes with the hop).
const toLapwing = hopBetween(run1Map(), 5, 8);
check('KESTREL → LAPWING: the hop names TIGHT, room 88, floor 0', toLapwing.memoryClass === 'TIGHT' && toLapwing.room === 88 && toLapwing.chargeFloor === 0, json(toLapwing));
finish();
