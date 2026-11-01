// Slice 3a F2: the room for the unit (01-landing §3.16, 02-map §3.3; systems/map-hop.ts roomFit), pure, and the memory
// classes' numbers it reads (FULL / COMPACT / TIGHT: 384 / 320 / 256 blocks, room 152 / 152 / 88, floor 12 / 12 / 0).
import { check, finish } from '../landing/checks';
import { roomFit, hopBetween } from '@systems/map-hop';
import { MEMORY_LAYOUTS, layoutForTotal, rackOf, rackStartOf } from '@data/memory';
import { run1Map } from './run1-fixture';

const files = (...sizes: number[]): { size: number }[] => sizes.map((size) => ({ size }));
const hop = (cls: 'FULL' | 'COMPACT' | 'TIGHT', linkBlocks = 123) => ({ linkBlocks, room: MEMORY_LAYOUTS[cls].roomForUnit, chargeFloor: MEMORY_LAYOUTS[cls].chargeFloor });

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
check('a 65-block unit with 40 charge fits a FULL ship: all 40 arrive', fits.word === 'fits' && fits.files === 65 && fits.chargeArrives === 40 && fits.chargeLost === 0, JSON.stringify(fits));
const low = roomFit({ files: files(65), charge: 5 }, hop('COMPACT'));
check('…5 charge arrives topped up to the floor of 12 (nothing lost)', low.word === 'fits' && low.chargeArrives === 12 && low.chargeLost === 0, JSON.stringify(low));
const lapwing = roomFit({ files: files(79), charge: 30 }, hop('TIGHT', 117));
check('LAPWING (TIGHT, room 88, no floor): 79 blocks of files leave 9 of 30 charge (`CHARGE SQUEEZED: 9 ARRIVES`)',
  lapwing.word === 'squeezed' && lapwing.chargeArrives === 9 && lapwing.chargeLost === 21 && lapwing.floor === 0, JSON.stringify(lapwing));
const none = roomFit({ files: files(88), charge: 20 }, hop('TIGHT'));
check('…files filling the room on a TIGHT ship: no charge arrives', none.word === 'no-charge' && none.chargeArrives === 0 && none.over === 0, JSON.stringify(none));
const leave = roomFit({ files: files(150), charge: 20 }, hop('FULL', 200));
check('files + the floor over the room: leave 10 behind', leave.word === 'leave' && leave.over === 10 && leave.chargeArrives === 0, JSON.stringify(leave));
const tightLeave = roomFit({ files: files(90), charge: 0 }, hop('TIGHT'));
check('…on a TIGHT ship the files alone must fit (90 of 88: leave 2)', tightLeave.word === 'leave' && tightLeave.over === 2, JSON.stringify(tightLeave));
const linked = roomFit({ files: files(80), charge: 30 }, hop('FULL', 86));
check('the link limits what crosses (86 − 80 = 6), the floor tops it up to 12: 18 lost', linked.word === 'squeezed' && linked.chargeArrives === 12 && linked.chargeLost === 18,
  JSON.stringify(linked));
const noLink = roomFit({ files: files(90), charge: 30 }, hop('FULL', 88));
check('…files over the link carry no charge, and the floor still arrives (the link bar is the PACKET\'s)',
  noLink.word === 'squeezed' && noLink.chargeArrives === 12 && noLink.over === 0, JSON.stringify(noLink));

// On run 1's hops (their room comes with the hop).
const map = run1Map();
const toLapwing = hopBetween(map, 5, 8);
check('KESTREL → LAPWING: the hop names TIGHT, room 88, floor 0', toLapwing.memoryClass === 'TIGHT' && toLapwing.room === 88 && toLapwing.chargeFloor === 0, JSON.stringify(toLapwing));
finish();
