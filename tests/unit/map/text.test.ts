// Slice 3a F2: every galaxy-map line (data/map-text.ts, PLACEHOLDER(05)) rendered with the longest names and numbers the
// arm can give fits one row of the strip (MAX_LINE_CHARS, 70). The never-say words are tests/unit/support/words.test.ts's.
// Slice 3b (Track UI): every repo-text and inbox-text line too, message bodies at most INBOX_BODY_MAX_LINES lines, and the
// sleep line's years read back for the TERMINAL's year roll.
import { check, finish } from '../landing/checks';
import { MAP_TEXT, MODIFIER_LABEL, NOISE_WORD, sleepLineYears } from '@data/map-text';
import { REPO_TEXT, REPO_FILE_TEXT, RESTRICTED_WHY } from '@data/repo-text';
import { INBOX_TEXT, firstNameOf, familyOf } from '@data/inbox-text';
import { REPO_FILES, RESTRICTED_ROWS } from '@data/repository';
import { FAMILY_POOL, FIRST_NAME_POOL } from '@data/souls';
import { COLONY_NAMES, WRITTEN_COLONY_NAMES } from '@data/ship-names';
import { INBOX_BODY_MAX_LINES } from '@data/tuning';
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
  files: 199, room: 152, floor: 12, carried: 99, bonus: 99, wanted: 199, floorAdded: 0, seedsMin: 0, seedsMax: 3,
  chargeArrives: 199, chargeArrivesMin: 199, roomLost: 0, over: 0, word: 'fits',
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
  ['chart.sleep', MAP_TEXT.chart.sleep(SLACK)],
  ['chart.trail046', MAP_TEXT.chart.trail046],
  ['chart.ring', MAP_TEXT.chart.ring(6, 143)],
  ['chart.visited', MAP_TEXT.chart.visited('PARKED IN ORBIT')],
  ['card.top', MAP_TEXT.card.top(SHIP, WORLD, C, 16)],
  ['card.sub', MAP_TEXT.card.sub(WORLD, 16)],
  ['card.colonists', MAP_TEXT.card.colonists(C)],
  ['card.sleep', MAP_TEXT.card.sleep(SLACK, 99)],
  ['card.late', MAP_TEXT.card.late(SLACK)],
  ['card.cost', MAP_TEXT.card.cost(19, 19)],
  ['card.problems', MAP_TEXT.card.problems([MODIFIER_LABEL['too-wide'], MODIFIER_LABEL['sensor-damage'], MODIFIER_LABEL.debris])],
  ['card.memory', MAP_TEXT.card.memory(384, 'COMPACT', 152)],
  ['card.fit fits seeds', MAP_TEXT.card.fit({ ...FIT, chargeArrivesMin: 185 })],
  ['card.fit squeezed', MAP_TEXT.card.fit({ ...FIT, chargeArrives: 199, chargeArrivesMin: 185, roomLost: 99, word: 'squeezed' })],
  ['card.fit leave', MAP_TEXT.card.fit({ ...FIT, over: 199, word: 'leave' })],
  ['card.fit no-charge', MAP_TEXT.card.fit({ ...FIT, chargeArrives: 0, chargeArrivesMin: 0, word: 'no-charge' })],
  ['card.planet', MAP_TEXT.card.planet('GRASSLAND', 'off-site pods score a quarter')],
  ['card.noGo', MAP_TEXT.card.noGo(['LAVA', 'CLIFFS'])],
  ['card.lzs', MAP_TEXT.card.lzs(4, 'good')],
  ['card.beam', MAP_TEXT.card.beam(LY)],
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
  // The sum at its longest: 3 stars, the card, the most charge a unit carries.
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
// --- Slice 3b (Track UI): every repo-text and inbox-text line at its worst case -----------------------------------------
const FILE = longest(Object.values(REPO_FILES).map((file) => file.name));
const BOOT = longest(Object.values(REPO_FILE_TEXT).map((text) => text.boot));
const EFFECT = longest(Object.values(REPO_FILE_TEXT).map((text) => text.effect));
const FIRST = longest(FIRST_NAME_POOL);
const FAMILY = longest(FAMILY_POOL);
const COLONY = longest([...COLONY_NAMES, ...WRITTEN_COLONY_NAMES, `${FAMILY.toUpperCase()} LANDING`]);
const BIG = 999999;    // people in a colony at year 200 (3,200 landed × the growth, with room)
lines.push(
  ['repo.row', REPO_TEXT.row(FILE, 99, EFFECT)],
  ['repo.eta.inTime', REPO_TEXT.eta.inTime(YEAR, SHIP, YEAR)],
  ['repo.eta.late', REPO_TEXT.eta.late(SLACK, 8)],
  ['repo.eta.never', REPO_TEXT.eta.never],
  ['repo.transit.behind', REPO_TEXT.transit.behind(FILE, SLACK)],
  ['repo.transit.waiting', REPO_TEXT.transit.waiting(FILE, SHIP)],
  ['repo.transit.catchesUp', REPO_TEXT.transit.catchesUp(FILE, SHIP)],
  ['repo.card.late', REPO_TEXT.card.late(FILE, SLACK)],
  ['repo.card.never', REPO_TEXT.card.never(FILE)],
  ['repo.card.noSwapInTime', REPO_TEXT.card.noSwapInTime],
  ['repo.packet.arrivalOverWithDeliveries', REPO_TEXT.packet.arrivalOverWithDeliveries],
  ['repo.card.catchesUp', REPO_TEXT.card.catchesUp(FILE)],
  ['repo.card.inTime', REPO_TEXT.card.inTime(FILE)],
  ['repo.card.ridesWithYou', REPO_TEXT.card.ridesWithYou(FILE)],
  ['repo.card.mark', REPO_TEXT.card.mark(YEAR, FILE)],
  ['repo.desk.request', REPO_TEXT.desk.request(BOOT)],
  ['repo.desk.requestAny', REPO_TEXT.desk.requestAny],
  ['repo.desk.requested', REPO_TEXT.desk.requested(BOOT)],
  ['repo.packet.chip', REPO_TEXT.packet.chip(FILE, 99, YEAR)],
  ['repo.packet.lostAfter', REPO_TEXT.packet.lostAfter(SHIP)],
  ['repo.packet.sentOn', REPO_TEXT.packet.sentOn],
  ['repo.packet.inTransit', REPO_TEXT.packet.inTransit(FILE, SLACK)],
  ['repo.packet.inTransitMore', REPO_TEXT.packet.inTransitMore(99)],
  ['repo.packet.salvage', REPO_TEXT.packet.salvage],
  ['repo.packet.overWithDeliveries', REPO_TEXT.packet.overWithDeliveries(199)],
  ['repo.noSwap', REPO_TEXT.noSwap],
  ['repo.noSwapTab', REPO_TEXT.noSwapTab],
  ['repo.noSwapFly', REPO_TEXT.noSwapFly],
  ['repo.noRm', REPO_TEXT.noRm],
  ['repo.noMv', REPO_TEXT.noMv],
  ['repo.boot.delivery', REPO_TEXT.boot.delivery(BOOT, YEAR)],
  ['repo.boot.patch', REPO_TEXT.boot.patch(BOOT, YEAR)],
  ['repo.boot.patchBroken', REPO_TEXT.boot.patchBroken(BOOT, YEAR)],
  ['repo.boot.folded', REPO_TEXT.boot.folded([BOOT, BOOT, BOOT, BOOT, BOOT], YEAR, YEAR + 1)],
  ['repo.tally.neverArrived', REPO_TEXT.tally.neverArrived([FILE, FILE, FILE, FILE, FILE])],
  ...Object.entries(REPO_TEXT.window).map(([key, text]): [string, string] => [`repo.window.${key}`, text]),
  ...Object.entries(REPO_FILE_TEXT).flatMap(([id, text]): [string, string][] => [[`repo.file.${id}.effect`, text.effect]]),
  ...Object.values(RESTRICTED_WHY).map((why): [string, string] => ['repo.restricted.why', why]),
  ...RESTRICTED_ROWS.map((row): [string, string] => [`repo.restricted.${row.id}`, `${REPO_TEXT.window.locked} ${row.name} ${row.why}`]),
  ['inbox.badge', INBOX_TEXT.window.badge(99)],
  ['inbox.stamps', INBOX_TEXT.window.stamps(YEAR, YEAR)],
  ['inbox.stamps ????', INBOX_TEXT.window.stamps(null, YEAR)],
  ['inbox.forUnit', INBOX_TEXT.window.forUnit(999)],
  ['inbox.from.colony', INBOX_TEXT.from.colony(COLONY, WORLD)],
  ['inbox.boot.newMessages', INBOX_TEXT.boot.newMessages(99)],
  ['inbox.boot.reading', INBOX_TEXT.boot.reading],
  ['inbox.welcome.subject', INBOX_TEXT.welcome.subject(999)],
  ['inbox.reply.subject', INBOX_TEXT.reply.subject([SHIP])],
  ['inbox.reply.subject 2', INBOX_TEXT.reply.subject([SHIP, SHIP])],
  ['inbox.reply.subject 3', INBOX_TEXT.reply.subject([SHIP, SHIP, SHIP])],
  ['inbox.letter.subject', INBOX_TEXT.letter.subject(999)],
);
// A message body: at most INBOX_BODY_MAX_LINES lines, each one strip row.
const bodies: [string, string[]][] = [
  // The welcome recommends the first desk's tag (systems/repository.ts firstDeskRecommendation): mv on run 1.
  ['welcome', INBOX_TEXT.welcome.body(20, REPO_FILE_TEXT.mv.boot)],
  ...INBOX_TEXT.policy.map((policy, i): [string, string[]] => [`policy ${i}`, policy.body(999)]),
  ['armComplete', INBOX_TEXT.armComplete.body(999)],
  ['reply', INBOX_TEXT.reply.body(999, BIG, INBOX_TEXT.reply.performance.good)],
  ...INBOX_TEXT.policy.map((policy, i): [string, string[]] => [`reply + policy ${i}`, INBOX_TEXT.reply.body(999, BIG, INBOX_TEXT.reply.performance.good, 9, policy.postscript)]),
  ['postcard y1', INBOX_TEXT.postcard.year1.body(FIRST, FAMILY, 89)],
  ['postcard y50', INBOX_TEXT.postcard.year50.body(FIRST, 99)],
  ['postcard y50 old', INBOX_TEXT.postcard.year50.body(FIRST, null)],
  ['postcard y200', INBOX_TEXT.postcard.year200.body(COLONY, FIRST, BIG)],
  ['meridian', [...INBOX_TEXT.letter.meridian]],
  // Slice 3c: letters to the unit ahead, signed by a writer (at the oldest a featured colonist can be, plus the year) or the school.
  ['letter', INBOX_TEXT.letter.body(999, COLONY, FIRST, FAMILY, 99)],
  ['letter school', INBOX_TEXT.letter.bodySchool(999, COLONY)],
  ...INBOX_TEXT.noAddress.map((mail, i): [string, string[]] => [`noAddress ${i}`, [...mail.body]]),
];
for (const [key, body] of bodies) body.forEach((line, i) => lines.push([`inbox.body.${key}.${i}`, line]));
lines.push(...INBOX_TEXT.policy.map((policy, i): [string, string] => [`inbox.policy.${i}.subject`, policy.subject]));
lines.push(...INBOX_TEXT.noAddress.map((mail, i): [string, string] => [`inbox.noAddress.${i}.subject`, mail.subject]));
const tall = bodies.filter(([, body]) => body.length > INBOX_BODY_MAX_LINES);
check(`every message body has at most ${INBOX_BODY_MAX_LINES} lines`, tall.length === 0, tall.map(([key, body]) => `${key} ${body.length}`).join(' | '));
check('the three postcards joined still fit the reader (3 + 1 + 2 lines)',
  INBOX_TEXT.postcard.year1.body(FIRST, FAMILY, 89).length + INBOX_TEXT.postcard.year50.body(FIRST, 99).length
  + INBOX_TEXT.postcard.year200.body(COLONY, FIRST, BIG).length <= INBOX_BODY_MAX_LINES);
check('a record `Okafor, Ada` signs as Ada Okafor', firstNameOf('Okafor, Ada') === 'Ada' && familyOf('Okafor, Ada') === 'Okafor');
check("05 §3.12's stamps and samples: `SENT 2522 · RECEIVED 2651`, `SENT ???? · RECEIVED 2481`, `> 3 NEW MESSAGES · INBOX`",
  INBOX_TEXT.window.stamps(2522, 2651) === 'SENT 2522 · RECEIVED 2651' && INBOX_TEXT.window.stamps(null, 2481) === 'SENT ???? · RECEIVED 2481'
  && INBOX_TEXT.boot.newMessages(3) === '> 3 NEW MESSAGES · INBOX' && INBOX_TEXT.boot.newMessages(1) === '> 1 NEW MESSAGE · INBOX');
check('02 §4\'s samples: `Swap ✗ 4 YRS LATE`, `> DELIVERY: mv (arrived 2337)`, `Mv · 2 BLOCKS · MOVE`',
  REPO_TEXT.card.late('Swap', 4) === 'Swap ✗ 4 YRS LATE' && REPO_TEXT.boot.delivery('mv', 2337) === '> DELIVERY: mv (arrived 2337)'
  && REPO_TEXT.row('Mv', 2, 'MOVE') === 'Mv · 2 BLOCKS · MOVE' && REPO_TEXT.packet.chip('Rm', 1, 2436) === 'Rm · 1 BLOCK · ARRIVED 2436');
// The TERMINAL reads the sleep line's years back from MAP_TEXT.boot.sleep's words (the year roll): the two agree.
const sleep = MAP_TEXT.boot.sleep(SHIP, 2378, 2467);
const years = sleepLineYears(sleep);
check('the sleep line\'s years read back for the roll (the approach year where it sits)', years !== null && years.arrive === 2378
  && years.approach === 2467 && sleep.slice(years.at, years.at + 4) === '2467' && sleepLineYears('> ECC: 3 TRANSIT HITS') === null,
  JSON.stringify(years));

// --- Slice 3c (foundation): the save, the trail, the beacon and the bridge at their worst case (Track UI extends) -----------
lines.push(
  ['title.launched', MAP_TEXT.title.launched(UNIT, YEAR, 46, UNIT)],
  ['title.launched same year', MAP_TEXT.title.launched(UNIT, YEAR, 0, UNIT)],
  ['chart.taken', MAP_TEXT.chart.taken(SHIP, UNIT)],
  ['chart.noColony', MAP_TEXT.chart.noColony(UNIT)],
  ['chart.colony 3c', MAP_TEXT.chart.colony(COLONY, 999, UNIT)],
  ['chart.lostCross', MAP_TEXT.chart.lostCross(UNIT)],
  ...Object.values(MAP_TEXT.chart.leave).map((words): [string, string] => ['chart.leaveLine', MAP_TEXT.chart.leaveLine(SHIP, words)]),
  ['chart.leaveMore', MAP_TEXT.chart.leaveMore(14)],
  ['chart.passedOver', MAP_TEXT.chart.passedOver(3, 3)],
  ['chart.passedOver many', MAP_TEXT.chart.passedOver(99, 99)],
  ['chart.controlFirst', MAP_TEXT.chart.controlFirst(UNIT)],
  ['card.history', MAP_TEXT.card.history(3, 3)],
  ['report.beacon', MAP_TEXT.report.beacon('LZ-D', UNIT, 46)],
  ['runEnd.bridge', MAP_TEXT.runEnd.bridge(UNIT, 46, YEAR)],
  ['runEnd.bridge same year', MAP_TEXT.runEnd.bridge(UNIT, 0, YEAR)],
  ['runEnd.bridgeTail', MAP_TEXT.runEnd.bridgeTail],
  ['save.resumeBoot', MAP_TEXT.save.resumeBoot(UNIT, 8, SHIP, YEAR)],
  ['save.resumeDesk', MAP_TEXT.save.resumeDesk(UNIT, 8, YEAR)],
  ['save.resumeReport', MAP_TEXT.save.resumeReport(UNIT, SHIP, YEAR)],
  ['save.abandonConfirm', MAP_TEXT.save.abandonConfirm(UNIT)],
  ...Object.values(MAP_TEXT.save.reason).map((reason): [string, string] => ['save.cantResume', MAP_TEXT.save.cantResume(reason)]),
  ['save.offline', MAP_TEXT.save.offline],
  ['save.olderArchive', MAP_TEXT.save.olderArchive],
  ['save.armReset', MAP_TEXT.save.armReset],
  // Track UI's 3c lines.
  ['chart.leaveTitle', MAP_TEXT.chart.leaveTitle(18)],
  ['chart.beacon', MAP_TEXT.chart.beacon(UNIT, 46)],
  ['chart.olderMore', MAP_TEXT.chart.olderMore(MAP_TEXT.chart.colony(COLONY, 999, UNIT), 9)],
  ['card.trailLabel + taken', `${MAP_TEXT.card.trailLabel} ${MAP_TEXT.chart.taken(SHIP, UNIT)}`],
  ['title.stamp', MAP_TEXT.title.stamp(46)],
  ['title.stampValve', MAP_TEXT.title.stampValve(46)],
  ['save.resumeKey', MAP_TEXT.save.resumeKey],
  ['save.abandonKey', MAP_TEXT.save.abandonKey],
  ['save.keepKey', MAP_TEXT.save.keepKey],
  ['tally.next', MAP_TEXT.tally.next(UNIT, YEAR)],
  ['tally.update', MAP_TEXT.tally.update(19, 19, 19)],
  ['tally.valve', MAP_TEXT.tally.valve(99)],
  ['chart.legendTaken', MAP_TEXT.chart.legendTaken(UNIT)],
  ['chart.legendColony', MAP_TEXT.chart.legendColony(UNIT)],
  ['chart.legendLost', MAP_TEXT.chart.legendLost(UNIT)],
  ['chart.legendOlder', MAP_TEXT.chart.legendOlder],
);
check('3c\'s sample lines: the launch line, the beacon, the bridge, the history row, the RESUME line',
  MAP_TEXT.title.launched('UNIT-048', 2303, 3, 'UNIT-047') === 'UNIT-048 · YEAR 2303 · LAUNCHED 3 YEARS AFTER UNIT-047'
  && MAP_TEXT.report.beacon('LZ-A', 'UNIT-046', 1) === 'LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 1 YEAR AGO'
  && MAP_TEXT.report.beacon('LZ-A', 'UNIT-047', 0) === 'LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-047 · THIS YEAR'
  && MAP_TEXT.runEnd.bridge('UNIT-048', 3, 2303) === 'UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303.'
  && MAP_TEXT.card.history(1, 3) === 'REPORTED HOME' && MAP_TEXT.card.history(2, 3) === 'PASSED OVER ONCE'
  && MAP_TEXT.card.history(3, 3) === "PASSED OVER TWICE · IT WON'T WAIT AGAIN"
  && MAP_TEXT.chart.taken('HALCYON', 'UNIT-047') === 'HALCYON · TAKEN · UNIT-047 GETS THERE FIRST'
  && MAP_TEXT.save.resumeBoot('UNIT-047', 4, 'VESPER', 2625) === 'RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625');

const long = lines.filter(([, text]) => text.length > MAX_LINE_CHARS);
check(`every map line fits ${MAX_LINE_CHARS} characters with the longest names (${SHIP}, ${WORLD})`, long.length === 0,
  long.map(([key, text]) => `${key} (${text.length}): ${text}`).join(' | '));
check('the spec\'s sample lines', `${MAP_TEXT.card.beam(55)} · ${MAP_TEXT.card.noise(1, MAP_TEXT.card.seeds({ min: 0, max: 2 }))}` === '55 LY · NOISE LOW · 1 · SEEDS 0–2'
  && MAP_TEXT.card.cost(4, 1) === '4 HITS ON THE WAY → 1 LANDS'
  && MAP_TEXT.card.sleep(89, 3) === 'YOU SLEEP 89 YRS IN ITS RECEIVER · ECC FIXES 3' && MAP_TEXT.chart.sleep(89) === 'SLEEP 89 YRS'
  && MAP_TEXT.card.shipOfRun(3, 2, 2) === 'YOUR 3RD SHIP · 2 MORE TO THE FINAL SHIP' && MAP_TEXT.card.lastOfRun(5) === 'YOUR 5TH SHIP · THE LAST'
  && MAP_TEXT.packet.onTheWay(4, 3, 89, 1) === 'ON THE WAY: 4 HITS · 3 FIXED WHILE YOU SLEEP (89 YRS) → 1 LANDS'
  && MAP_TEXT.packet.headline('KESTREL', 1200, 26, 89) === 'NEXT: KESTREL · 1,200 COLONISTS · 26 LY · SLEEP 89 YRS'
  && MAP_TEXT.desk.greyed(2) === '2 SHIPS NOW OUT OF YOUR REACH' && MAP_TEXT.crumb('UNIT-047', 'KESTREL', 2467, 'FLYBY') === 'UNIT-047 / KESTREL · 2467 / FLYBY'
  && MAP_TEXT.boot.sleep('KESTREL', 2378, 2467) === "> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS"
  && MAP_TEXT.card.memory(320, 'COMPACT', 152) === 'MEMORY 320 · COMPACT · ROOM FOR YOU 152',
  MAP_TEXT.card.beam(55));
check('noise words: CLEAN, LOW, NOISY, SEVERE', [0, 1, 2, 3].map((n) => NOISE_WORD[n as 0 | 1 | 2 | 3]).join() === 'CLEAN,LOW,NOISY,SEVERE');
finish();
