// WP7 item 5 (DOM-free half) and the lead's item 3: HALCYON's coast, wake and story, headless.
// • the coast begins (the strip's first WAIT): MOVE is licensed at once, SKIP holds `SOMETHING IS WAKING UP`,
//   HOLLOW wakes 5 AI s later and bites POD 04 and POD 05 at once (the root between a 2- and a 1-block GAP);
// • the strip states the wall rule at the wake, then asks to MOVE the exposed driver behind a WALL;
// • HOLLOW's story through createStory: `> hello 047…`, `> i was 046…`, the name flipping once that line has
//   typed, CONTROL's `UNIT-046 was decommissioned…`, and in the landing `> i ran out…`; no story line starts
//   while anything said before it is still typing on either screen, and no pod launches while it is told;
// • every new line fits the strip (70 characters) with the worst-case unit numbers.
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import { followDirector } from '../wp2/harness2';
import { installTool } from '@systems/licences';
import { skipBlockReason, SKIP_REFUSAL_WAKING } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { channelTypedByAi, typingSec } from '@systems/say';
import { HOLLOW_STORY } from '@data/hollow-text';
import { WALL_RULES, perShipBeatIds, BEATS, transitEccLine, chargeLine, LINES, LOSS_BUTTON, RUN_END_TITLE } from '@data/script';
import { RUN_END_TEXT } from '@data/landing-text';
import { WORST_CASE_VARS } from '@data/script';
import { HOLLOW_NAME_AFTER_TYPED_SEC, MAX_LINE_CHARS } from '@data/tuning';
import { getShip } from '@data/ships';
import type { GameState, LogEntry } from '@state/schema';

const h = createHarness7(2, { soulsFound: true });
const s = () => h.store.getState();
h.shipAlone(1, 2);
installTool(h.store, 'repair');

// --- The coast and the wake ------------------------------------------------------------------------------
let coastAt: number | null = null;
let skipAtCoast: string | null = null;
let moveAt: number | null = null;
let wakeAt: number | null = null;
let wakeLine = '';
let moveLine = '';
let bitten: number[] = [];
const hollowDef = getShip(1).hollow;
const lead = typeof hollowDef.wake === 'string' ? null : hollowDef.wake.coastLeadSec;
followDirector(h, {
  reactionSec: 0.4, maxWall: 900,
  mistake: () => {
    const state = s();
    if (coastAt === null && state.burn.coastAtAi !== null) {
      coastAt = state.burn.coastAtAi;
      skipAtCoast = skipBlockReason(state, getPrediction());
    }
    if (moveAt === null && state.run.licences.includes('move')) moveAt = state.clock.aiSec;
    if (wakeAt === null && state.hollow.phase === 'awake') {
      wakeAt = state.clock.aiSec;
      bitten = state.memory.flatMap((seg) => (seg.type === 'driver' && seg.infected ? [seg.pod] : []));
    }
    const shown = state.director.shown;
    if (shown && !wakeLine && shown.id.startsWith('hollow-wall-rule')) wakeLine = shown.text;
    if (shown && !moveLine && shown.id.startsWith('hollow-move-wall')) moveLine = shown.text;
    h.defend();
    return false;
  },
});
check('the coast begins: MOVE is licensed at once (as the strip first says WAIT)', coastAt !== null && moveAt !== null && Math.abs(moveAt - coastAt) < 0.11,
  `coast ${coastAt}, MOVE ${moveAt}`);
check('…SKIP holds until HOLLOW wakes: SOMETHING IS WAKING UP', skipAtCoast === SKIP_REFUSAL_WAKING, `${skipAtCoast}`);
check(`…HOLLOW wakes ${lead} AI s after the coast began (not 30 s into the flight) and bites POD 04 and POD 05 at once`,
  wakeAt !== null && coastAt !== null && Math.abs(wakeAt - (coastAt + (lead ?? 0))) < 0.11 && bitten.join() === '4,5',
  `wake ${wakeAt}, bitten ${bitten.join(',')}`);
check('the strip states the wall rule at the wake', /^4 FREE BLOCKS STOP IT — (\[TAB\], )?REPAIR, then MOVE drivers behind a WALL$/.test(wakeLine), wakeLine);
check('…then asks to MOVE the exposed driver behind a WALL', /MOVE POD \d\d behind a WALL — 4 FREE BLOCKS STOP IT/.test(moveLine), moveLine);
check('ship 2 locks', h.status() === 'locked', h.status());
h.untilPhase('report', 300);

// --- The story ---------------------------------------------------------------------------------------------
const entries = s().log.entries;
const find = (speaker: string, text: string): LogEntry | undefined => entries.find((entry) => entry.speaker === speaker && entry.text === text);
const story = [
  find('hollow', HOLLOW_STORY.hello(47, 36, [46])),
  find('hollow', HOLLOW_STORY.wasUnit([46])),  // WP8: HOLLOW's units, not one number
  find('control', HOLLOW_STORY.decommissioned('UNIT-046')),
  find('hollow', HOLLOW_STORY.ranOut),
];
check('the four story lines were said, in order', story.every((entry) => entry !== undefined)
  && story.every((entry, i) => i === 0 || entry!.t > story[i - 1]!.t), story.map((entry) => entry?.t.toFixed(1)).join(' → '));
// Both screens' typing as a kid saw it, replayed from the log up to each story line.
const typedBefore = (line: LogEntry): number => {
  const before = { log: { entries: entries.filter((entry) => entry.id < line.id), rev: 0 } } as unknown as GameState;
  return Math.max(channelTypedByAi(before, 'mind'), channelTypedByAi(before, 'radio'));
};
const overlaps = story.filter((line) => line && line.t < typedBefore(line) - 1e-9).map((line) => `${line!.text} at ${line!.t.toFixed(2)} < ${typedBefore(line!).toFixed(2)}`);
check('no story line starts while anything said before it is still typing on either screen', overlaps.length === 0, overlaps.join(' | '));
const named = h.events.find((event) => event.name === 'hollow-named');
const was = story[1]!;
check('`???` becomes UNIT-046 once `> i was 046…` has typed out (and the beat after)',
  named !== undefined && s().run.hollowNamed && was !== undefined, `named ${named?.wall.toFixed(2)}`);
const wasTypedBy = was.t + typingSec('hollow', was.text);
const namedAiSec = s().log.entries.find((entry) => entry.speaker === 'control' && entry.text === HOLLOW_STORY.decommissioned('UNIT-046'))!.t;
check('…the flip lands between that line\'s last letter (+0.4 s) and CONTROL\'s answer', wasTypedBy + HOLLOW_NAME_AFTER_TYPED_SEC <= namedAiSec,
  `typed by ${wasTypedBy.toFixed(2)}, CONTROL at ${namedAiSec.toFixed(2)}`);
const ranOut = story[3]!;
const launchesDuring = entries.filter((entry) => entry.speaker === 'cmd' && /^> (launch|pod\d\d)/.test(entry.text)
  && entry.t > ranOut.t && entry.t < ranOut.t + typingSec('hollow', ranOut.text));
check('`> i ran out…` is told over a quiet bay (no launch or touchdown echo while it types)', launchesDuring.length === 0, launchesDuring.map((entry) => entry.text).join(' | '));
check('the echoes carry the name after it flips: `[user: UNIT-046]`', entries.some((entry) => entry.speaker === 'hollow' && /\[user: UNIT-046\]/.test(entry.text))
  || !entries.some((entry) => entry.speaker === 'hollow' && entry.t > ranOut.t && /\[user:/.test(entry.text)));

// --- Words ----------------------------------------------------------------------------------------------
const lines = [
  // Final fix pass: the merged wordings (`they sent us`, `we were 997 and 998`) are the longest.
  HOLLOW_STORY.hello(999, 999, [997, 998]), HOLLOW_STORY.wasUnit([998]), HOLLOW_STORY.wasUnit([997, 998]), HOLLOW_STORY.decommissioned('UNIT-998'), HOLLOW_STORY.ranOut,
  ...WALL_RULES.map((rule) => rule.text({ vars: WORST_CASE_VARS })),
  // WP7 part 2: a hit names its file's id too (the boot's red flash finds the chip by it).
  transitEccLine([{ segId: 'w', fileName: 'W'.repeat(20), role: null, from: 100, to: 65 }, { segId: 'x', fileName: 'X'.repeat(20), role: null, from: 100, to: 65 },
    { segId: 'y', fileName: 'Y'.repeat(20), role: null, from: 100, to: 65 }, { segId: 'z', fileName: 'Z'.repeat(20), role: null, from: 100, to: 65 }]),
  chargeLine({ hits: [], chargeCarried: 99, starCredit: 18, stars: 3, card: null, cardCharge: 0, chargeFloorAdded: 12, chargeOverflowLost: 0, scripted: [] }, 999),
  // WP8: an arrival names its card and the card's charge (with +12 from the card the floor never adds any).
  chargeLine({ hits: [], chargeCarried: 99, starCredit: 18, stars: 3, card: 'charge', cardCharge: 12, chargeFloorAdded: 0, chargeOverflowLost: 0, scripted: [] }, 999),
  LINES.logDivider('W'.repeat(12)), LINES.transmitting('W'.repeat(12)), LINES.simulation(), LINES.runOver(),
  LOSS_BUTTON.transmit('W'.repeat(12)), LOSS_BUTTON.emergency, ...Object.values(RUN_END_TITLE).map((title) => title('UNIT-998', 'W'.repeat(12))),
  // WP7 part 2: RUN END replaced the interim card's one-line count (its lines are checked in p2-models).
  RUN_END_TEXT.total(99_999, 99_999), RUN_END_TEXT.score(99_999),
  `Hello, Unit 999! ${'W'.repeat(12)} is about to fly past its planet. :)`,
];
const long = lines.filter((line) => line.length > MAX_LINE_CHARS);
check('every WP7 line fits the strip (≤ 70) with worst-case names', long.length === 0, long.join(' | '));
// WP11: and LAST LIGHT's own hello (the flagship opens on a crash course too; ship 1's hello is the run's first).
// WP12 p3: and the REPAIR renewal (said on the ship whose boot reissued it).
// Slice 1a (01-landing §2): and CONTROL at the landing's start and at the ship's first touchdown.
check('the per-ship beats are CONTROL\'s reactions (captured, locked, crashed, escaped), the flyby hello, the flagship\'s, the REPAIR renewal and the landing\'s two',
  perShipBeatIds(BEATS).sort().join() === ['control-captured', 'control-crashed', 'control-escaped', 'control-hello-flyby', 'control-hello-flagship', 'control-locked',
    'control-repair-renewed', 'control-landing-start', 'control-first-down'].sort().join(),
  perShipBeatIds(BEATS).join());

finish();
