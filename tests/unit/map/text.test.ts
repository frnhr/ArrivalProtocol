// Slice 3a F2: every galaxy-map line (data/map-text.ts, PLACEHOLDER(05)) rendered with the longest names and numbers the
// arm can give fits one row of the strip (MAX_LINE_CHARS, 70). The never-say words are tests/unit/support/words.test.ts's.
import { check, finish } from '../landing/checks';
import { MAP_TEXT, MODIFIER_LABEL, NOISE_WORD } from '@data/map-text';
import { GENERATED_SHIP_NAMES, AUTHORED_SHIP_NAMES, FINAL_SHIP_NAMES } from '@data/ship-names';
import { WORLDS } from '@data/arm';
import { MAX_LINE_CHARS } from '@data/tuning';
import type { RoomFit } from '@/types/map';

const longest = (names: readonly string[]): string => names.reduce((a, b) => (b.length > a.length ? b : a));
const SHIP = longest([...GENERATED_SHIP_NAMES, ...AUTHORED_SHIP_NAMES, ...FINAL_SHIP_NAMES]);
const WORLD = longest(WORLDS.map((w) => w.name));
const UNIT = 'UNIT-999';
const YEAR = 3999;
const SLACK = 199;   // years: the arm's slack is at most 162 on run 1; a fresh roll's at most LAYER_SLACK + jitter
const LY = 58;
const C = 3200;      // colonists: 16 pods
const FIT: RoomFit = {
  files: 199, link: 123, room: 152, floor: 12, carried: 99, bonus: 99, wanted: 199, floorAdded: 0, seedsMin: 0, seedsMax: 3,
  chargeArrives: 199, chargeArrivesMin: 199, linkLost: 199, roomLost: 0, over: 0, overLink: 0, word: 'fits',
};

const lines: [string, string][] = [
  ['title.logo', MAP_TEXT.title.logo],
  ['title.line', MAP_TEXT.title.line(UNIT, YEAR, 199)],
  ['title.beacon', MAP_TEXT.title.beacon(SHIP, YEAR)],
  ['crumb', MAP_TEXT.crumb(UNIT, SHIP, YEAR, 'FLYBY, TOO WIDE')],
  ['desk.pickShip', MAP_TEXT.desk.pickShip],
  ['desk.setCourse', MAP_TEXT.desk.setCourse(SHIP)],
  ['desk.controlPick', MAP_TEXT.desk.controlPick(999)],
  ['desk.greyed', MAP_TEXT.desk.greyed(18)],
  ['chart.node', MAP_TEXT.chart.node(SHIP, C)],
  ['chart.tooLate', MAP_TEXT.chart.tooLate(SLACK)],
  ['chart.outOfRange', MAP_TEXT.chart.outOfRange(199)],
  ['chart.past', MAP_TEXT.chart.past(YEAR)],
  ['chart.urgent', MAP_TEXT.chart.urgent(9)],
  ['chart.trail046', MAP_TEXT.chart.trail046],
  ['chart.ring', MAP_TEXT.chart.ring(6, 143)],
  ['chart.visited', MAP_TEXT.chart.visited('PARKED IN ORBIT')],
  ['card.top', MAP_TEXT.card.top(SHIP, WORLD, C, 16)],
  ['card.sub', MAP_TEXT.card.sub(WORLD, 16)],
  ['card.colonists', MAP_TEXT.card.colonists(C)],
  ['card.early', MAP_TEXT.card.early(SLACK)],
  ['card.late', MAP_TEXT.card.late(SLACK)],
  ['card.cost', MAP_TEXT.card.cost(19, 9, 19)],
  ['card.problems', MAP_TEXT.card.problems([MODIFIER_LABEL['too-wide'], MODIFIER_LABEL['sensor-damage'], MODIFIER_LABEL.debris])],
  ['card.memory', MAP_TEXT.card.memory(384, 'COMPACT', 152)],
  ['card.fit fits seeds link', MAP_TEXT.card.fit({ ...FIT, chargeArrivesMin: 185 })],
  ['card.fit squeezed', MAP_TEXT.card.fit({ ...FIT, chargeArrives: 199, chargeArrivesMin: 185, roomLost: 99, word: 'squeezed' })],
  ['card.fit leave', MAP_TEXT.card.fit({ ...FIT, over: 199, word: 'leave' })],
  ['card.fit leave link', MAP_TEXT.card.fit({ ...FIT, overLink: 199, word: 'leave' })],
  ['card.fit no-charge', MAP_TEXT.card.fit({ ...FIT, chargeArrives: 0, chargeArrivesMin: 0, word: 'no-charge' })],
  ['card.planet', MAP_TEXT.card.planet('GRASSLAND', 'off-site pods score a quarter')],
  ['card.noGo', MAP_TEXT.card.noGo(['LAVA', 'CLIFFS'])],
  ['card.lzs', MAP_TEXT.card.lzs(4)],
  ['card.beam', MAP_TEXT.card.beam(LY, 123)],
  ['card.noise', MAP_TEXT.card.noise(3, MAP_TEXT.card.seeds({ min: 0, max: 3 }))],
  ['card.noise none', MAP_TEXT.card.noise(3, MAP_TEXT.card.seeds(null))],
  ['card.shipOfRun', MAP_TEXT.card.shipOfRun(7, 1, 6)],
  ['card.lastOfRun', MAP_TEXT.card.lastOfRun(8)],
  ['card.timeline', MAP_TEXT.card.timeline(YEAR, YEAR, YEAR)],
  ['packet.headline', MAP_TEXT.packet.headline(SHIP, C, LY, SLACK)],
  ['packet.room', MAP_TEXT.packet.room(152, 199, 12)],
  ['packet.roomNoFloor', MAP_TEXT.packet.roomNoFloor(88, 199)],
  ['packet.squeeze', MAP_TEXT.packet.squeeze(199, 99, 199)],
  ['packet.squeezeSeeds', MAP_TEXT.packet.squeezeSeeds(199, 199, 185, 199)],
  ['packet.seedsMay', MAP_TEXT.packet.seedsMay(199, 185)],
  ['packet.zeroConfirm', MAP_TEXT.packet.zeroConfirm],
  ['packet.zeroIfSeedsConfirm', MAP_TEXT.packet.zeroIfSeedsConfirm],
  ['packet.overRoom', MAP_TEXT.packet.overRoom(199)],
  ['packet.overLink', MAP_TEXT.packet.overLink(199)],
  // The sum at its longest: 3 stars, the card, the most a link carries (123 − the fewest files).
  ['packet.roomFor', MAP_TEXT.packet.roomFor('199 CARRIED + 18 (★★★) + 12 (CARD)', 229, 140)],
  ['packet.arrivalLeave', MAP_TEXT.packet.arrivalLeave],
  ['packet.onTheWay', MAP_TEXT.packet.onTheWay(11, 9, SLACK, 11)],
  ['packet.backToChart', MAP_TEXT.packet.backToChart],
  ['boot.sleep', MAP_TEXT.boot.sleep(SHIP, YEAR - SLACK, YEAR)],
  ['boot.ecc', MAP_TEXT.boot.ecc(9)],
  ['boot.receiver', MAP_TEXT.boot.receiver(2, 152)],
  ['boot.overflow', MAP_TEXT.boot.overflow(199, SHIP)],
  ['boot.zeroCharge', MAP_TEXT.boot.zeroCharge(SHIP, 199)],
  ['lossToChart', MAP_TEXT.lossToChart],
  ['tally.row', MAP_TEXT.tally.row(8, SHIP, YEAR, C, C)],
  ['tally.colonies', MAP_TEXT.tally.colonies(8)],
];
const long = lines.filter(([, text]) => text.length > MAX_LINE_CHARS);
check(`every map line fits ${MAX_LINE_CHARS} characters with the longest names (${SHIP}, ${WORLD})`, long.length === 0,
  long.map(([key, text]) => `${key} (${text.length}): ${text}`).join(' | '));
check('the spec\'s sample lines', `${MAP_TEXT.card.beam(55, 86)} · ${MAP_TEXT.card.noise(1, MAP_TEXT.card.seeds({ min: 0, max: 2 }))}` === '55 LY · LINK 86 · NOISE LOW · 1 · SEEDS 0–2'
  && MAP_TEXT.card.cost(4, 3, 1) === '4 HITS · 3 FIXED WHILE YOU SLEEP → 1 LANDS'
  && MAP_TEXT.packet.onTheWay(4, 3, 89, 1) === 'ON THE WAY: 4 HITS · 3 FIXED WHILE YOU SLEEP (89 YRS) → 1 LANDS'
  && MAP_TEXT.packet.headline('KESTREL', 1200, 26, 89) === 'NEXT: KESTREL · 1,200 COLONISTS · 26 LY · 89 YRS EARLY'
  && MAP_TEXT.desk.greyed(2) === '2 SHIPS NOW OUT OF YOUR REACH' && MAP_TEXT.crumb('UNIT-047', 'KESTREL', 2467, 'FLYBY') === 'UNIT-047 / KESTREL · 2467 / FLYBY'
  && MAP_TEXT.boot.sleep('KESTREL', 2378, 2467) === "> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS"
  && MAP_TEXT.card.memory(320, 'COMPACT', 152) === 'MEMORY 320 · COMPACT · ROOM FOR YOU 152',
  MAP_TEXT.card.beam(55, 86));
check('noise words: CLEAN, LOW, NOISY, SEVERE', [0, 1, 2, 3].map((n) => NOISE_WORD[n as 0 | 1 | 2 | 3]).join() === 'CLEAN,LOW,NOISY,SEVERE');
finish();
