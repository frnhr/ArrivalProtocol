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
  files: 199, room: 152, floor: 12, carried: 99, wanted: 99, chargeArrives: 0, chargeArrivesMin: 0, linkLost: 99, roomLost: 0, over: 0, word: 'fits',
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
  ['chart.past', MAP_TEXT.chart.past],
  ['chart.urgent', MAP_TEXT.chart.urgent(9)],
  ['chart.trail046', MAP_TEXT.chart.trail046],
  ['chart.ring', MAP_TEXT.chart.ring(6, 143)],
  ['chart.visited', MAP_TEXT.chart.visited('PARKED IN ORBIT')],
  ['card.top', MAP_TEXT.card.top(SHIP, WORLD, C, 16)],
  ['card.early', MAP_TEXT.card.early(YEAR, YEAR, SLACK)],
  ['card.late', MAP_TEXT.card.late(YEAR, YEAR, SLACK)],
  ['card.problems', MAP_TEXT.card.problems([MODIFIER_LABEL['too-wide'], MODIFIER_LABEL['sensor-damage'], MODIFIER_LABEL.debris])],
  ['card.memory', MAP_TEXT.card.memory(384, 'COMPACT', 152)],
  ['card.fit squeezed', MAP_TEXT.card.fit({ ...FIT, chargeArrives: 99, roomLost: 99, word: 'squeezed' })],
  ['card.fit leave', MAP_TEXT.card.fit({ ...FIT, over: 199, word: 'leave' })],
  ['card.planet', MAP_TEXT.card.planet('GRASSLAND', 'off-site pods score a quarter')],
  ['card.noGo', MAP_TEXT.card.noGo(['LAVA', 'CLIFFS'])],
  ['card.lzs', MAP_TEXT.card.lzs(4)],
  ['card.beam', MAP_TEXT.card.beam(LY, 123, 9, 9)],
  ['card.noise', MAP_TEXT.card.noise(3, MAP_TEXT.card.seeds({ min: 0, max: 3 }))],
  ['card.noise none', MAP_TEXT.card.noise(3, MAP_TEXT.card.seeds(null))],
  ['card.shipOfRun', MAP_TEXT.card.shipOfRun(7, 1, 6)],
  ['card.lastOfRun', MAP_TEXT.card.lastOfRun(8)],
  ['card.timeline', MAP_TEXT.card.timeline(YEAR, YEAR, YEAR)],
  ['packet.headline', MAP_TEXT.packet.headline(SHIP, C, LY, SLACK)],
  ['packet.room', MAP_TEXT.packet.room(152, 199, 12)],
  ['packet.roomNoFloor', MAP_TEXT.packet.roomNoFloor(88, 199)],
  ['packet.squeeze', MAP_TEXT.packet.squeeze(199, 99, 199)],
  ['packet.zeroConfirm', MAP_TEXT.packet.zeroConfirm],
  ['packet.overRoom', MAP_TEXT.packet.overRoom(199)],
  ['packet.onTheWay', MAP_TEXT.packet.onTheWay(11, 9, SLACK, 11)],
  ['packet.backToChart', MAP_TEXT.packet.backToChart],
  ['boot.sleep', MAP_TEXT.boot.sleep(SHIP, YEAR - SLACK, YEAR)],
  ['boot.ecc', MAP_TEXT.boot.ecc(9)],
  ['boot.receiver', MAP_TEXT.boot.receiver(2, 152)],
  ['boot.overflow', MAP_TEXT.boot.overflow(199, SHIP)],
  ['lossToChart', MAP_TEXT.lossToChart],
  ['tally.row', MAP_TEXT.tally.row(8, SHIP, YEAR, C, C)],
  ['tally.colonies', MAP_TEXT.tally.colonies(8)],
];
const long = lines.filter(([, text]) => text.length > MAX_LINE_CHARS);
check(`every map line fits ${MAX_LINE_CHARS} characters with the longest names (${SHIP}, ${WORLD})`, long.length === 0,
  long.map(([key, text]) => `${key} (${text.length}): ${text}`).join(' | '));
check('the spec\'s sample lines', `${MAP_TEXT.card.beam(55, 86, 8, 4)} · ${MAP_TEXT.card.noise(1, MAP_TEXT.card.seeds({ min: 0, max: 2 }))}` === '55 LY · LINK 86 · 8 HITS (ECC fixes 4) · NOISE LOW · 1 · SEEDS 0–2'
  && MAP_TEXT.packet.headline('KESTREL', 1200, 26, 89) === 'NEXT: KESTREL · 1,200 COLONISTS · 26 LY · 89 YRS EARLY'
  && MAP_TEXT.desk.greyed(2) === '2 SHIPS NOW OUT OF YOUR REACH' && MAP_TEXT.crumb('UNIT-047', 'KESTREL', 2467, 'FLYBY') === 'UNIT-047 / KESTREL · 2467 / FLYBY'
  && MAP_TEXT.boot.sleep('KESTREL', 2378, 2467) === "> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS"
  && MAP_TEXT.card.memory(320, 'COMPACT', 152) === 'MEMORY 320 · COMPACT · ROOM FOR YOU 152',
  MAP_TEXT.card.beam(55, 86, 8, 4));
check('noise words: CLEAN, LOW, NOISY, SEVERE', [0, 1, 2, 3].map((n) => NOISE_WORD[n as 0 | 1 | 2 | 3]).join() === 'CLEAN,LOW,NOISY,SEVERE');
finish();
