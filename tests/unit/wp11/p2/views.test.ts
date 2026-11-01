// WP11 part 2, headless: what the views of LAST LIGHT's finale read, checked DOM-free.
// • The verbs' TERMINAL lines: the telegraph is said with verbCountdown (the TERMINAL counts it down live), BLOCKED with
//   the good tone, a landed verb with the danger tone and a glitchBurst at GLITCH_BURST_LEVEL; a line with a look must
//   be critical (say throws otherwise).
// • The duel's glitch spikes: the root opening tears once (GLITCH_BURST_LEVEL); while its DELETE runs a spike comes every
//   DUEL_SPIKE_EVERY_START_SEC quickening toward DUEL_SPIKE_EVERY_END_SEC, from DUEL_SPIKE_LEVEL_START rising toward
//   DUEL_SPIKE_LEVEL_END ('duel-spike' carries the progress, rising); none after the root is gone, whose end is the
//   biggest tear (ROOT_GONE_GLITCH_LEVEL).
// • The typed endings (§9 WP11 item 5): ≤ FINALE_ENDING_MAX_LINES lines, each ≤ MAX_LINE_CHARS also with worst-case names,
//   the design's words (`> rm unit_046 ... OK` / `LAST LIGHT · n colonists reached orbit.` / `the fleet is home.` / CONTROL's
//   reassignment; `> merge unit_046 -> unit_047 ... OK` / `> hi. it's us.` / `we arrive together.` / non-compliant), with
//   what PURGE leaves parked and what MERGE brought back; the LANDING REPORT waits for the ending's time (finaleEndingSec),
//   skipFinaleEnding lets it come at once; MERGE's glitch.
// • The MERGE tick (mergeTickCharge) from LAST LIGHT's boot to the choice, never on another ship.
// • RUN END: the ending and MERGE's carry line; endingsLine (`ENDINGS 1/2 · MERGE · ???`).
// Slice 1a: the landing stands while a scenario sets up ('manual' landing mode) and lands at once when it lets it go;
// POD 11 and POD 12 (either side of LAST LIGHT's root) are the drivers MERGE gives back.
import { check, finish } from '../../wp1/harness';
import { createHarness11 } from '../harness11';
import { theRoot, infectNow } from '@systems/hollow';
import { verbNow } from '@systems/hollow-verbs';
import {
  chooseFinale, finaleEndingSec, finaleEndingLineStartsSec, skipFinaleEnding, finaleEndingShowing, mergeTickCharge,
} from '@systems/finale';
import { runEndModel, type RunEndModel } from '@systems/run-end';
import { continueAfterReport } from '@systems/run';
import { say } from '@systems/say';
import { actionDelete } from '@state/actions';
import { driversInMemory, finalePending, quantizeCorruption } from '@state/selectors';
import { HOLLOW_FINALE, HOLLOW_VERB, hollowUnitName } from '@data/hollow-text';
import { echoWord } from '@data/tool-text';
import { SHIPS } from '@data/ships';
import { endingsLine } from '@data/script';
import {
  MAX_LINE_CHARS, FINALE_ENDING_MAX_LINES, GLITCH_BURST_LEVEL, DUEL_SPIKE_LEVEL_START, DUEL_SPIKE_LEVEL_END, ROOT_DELETE_SEC,
  ROOT_GONE_GLITCH_LEVEL, MERGE_GLITCH_LEVEL, MERGE_COST_CHARGE, DUEL_SPIKE_EVERY_END_SEC, DUEL_SPIKE_EVERY_START_SEC,
  SEG_NAME_MAX_CHARS, VERB_FIRST_TELEGRAPH_SEC,
} from '@data/tuning';
import type { GameState, EndingLine } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type { ShipResult } from '@state/schema';
import { isPodCode } from '../../support/pod-code';
import { setLandingMode, landInstantly } from '../../support/landing-instant';

const h = createHarness11(23);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();
const soul = (code: string): DriverSegment | undefined => driversInMemory(state()).find((seg) => isPodCode(seg.pod, code));
const eventsSince = (from: number, name: string): { payload: unknown; wall: number }[] =>
  h.events.slice(from).filter((event) => event.name === name).map((event) => ({ payload: event.payload, wall: event.wall }));

// --- The text, with worst-case words -------------------------------------------------------------------------------
{
  const worstHollow = echoWord(hollowUnitName([999, 998]));
  const ours = echoWord('UNIT-999');
  const purge = HOLLOW_FINALE.purgeEnding({
    shipName: 'LAST LIGHT', inOrbit: '3,200', anyoneHome: true, eaten: '3,200', hollowWord: worstHollow, unit: 999, shipsHome: 99, fleetSize: 99,
  });
  const merge = HOLLOW_FINALE.mergeEnding({ shipName: 'LAST LIGHT', inOrbit: '3,200', restored: '3,200', hollowWord: worstHollow, ours, unit: 999 });
  const fits = (lines: EndingLine[]): boolean => lines.length <= FINALE_ENDING_MAX_LINES && lines.every((line) => line.text.length <= MAX_LINE_CHARS);
  check(`both endings fit: ≤ ${FINALE_ENDING_MAX_LINES} lines of ≤ ${MAX_LINE_CHARS} characters with worst-case names`, fits(purge) && fits(merge),
    JSON.stringify([...purge, ...merge].map((line) => line.text.length)));
  check('…PURGE says nothing in HOLLOW\'s voice; MERGE\'s merged voice says hello', !purge.some((line) => line.voice === 'us')
    && merge.some((line) => line.voice === 'us' && line.text === "> hi. it's us."));
  // MERGE's line with a whole rack of eaten pods (16, the most a ship carries): it names a few and counts the rest.
  const sixteenPods = Array.from({ length: 16 }, (_, i) => `POD ${String(i + 1).padStart(2, '0')}`);
  const cardWords = [
    HOLLOW_FINALE.choiceTitle(hollowUnitName([999, 998])), HOLLOW_FINALE.purgeCmd(worstHollow), HOLLOW_FINALE.mergeCmd(worstHollow, ours),
    HOLLOW_FINALE.purgeCost('3,200'), HOLLOW_FINALE.mergeGain(sixteenPods), HOLLOW_FINALE.mergeGain(sixteenPods.slice(0, 5)),
    HOLLOW_FINALE.mergePrice(MERGE_COST_CHARGE, 999),
    HOLLOW_FINALE.mergeNeeds(19), HOLLOW_FINALE.mergeCarries(3), endingsLine(['purge', 'merge'], ['purge', 'merge']),
  ];
  check('the card\'s words and RUN END\'s lines are one line each (≤ 70 characters)', cardWords.every((text) => text.length <= MAX_LINE_CHARS),
    JSON.stringify(cardWords.map((text) => text.length)));
  // Unlink pass (Fran, after the handover): HOLLOW's RM types `unlink`, four letters longer than `rm`. Its echoes still fit
  // one line with a file name as long as a chip allows and the longest name HOLLOW goes by.
  const worstFile = echoWord('W'.repeat(SEG_NAME_MAX_CHARS));
  const worstUser = hollowUnitName([999, 998]);
  const verbLines = [
    HOLLOW_VERB.telegraph('rm', worstFile, VERB_FIRST_TELEGRAPH_SEC), HOLLOW_VERB.blocked('rm', worstFile),
    HOLLOW_VERB.done('rm', worstFile, worstUser), HOLLOW_VERB.failed('rm', worstFile, worstUser), HOLLOW_VERB.failed('mv', worstHollow, worstUser),
  ];
  check(`HOLLOW's verb echoes fit one line (≤ ${MAX_LINE_CHARS}) with worst-case names, and RM types \`unlink\``,
    verbLines.every((text) => text.length <= MAX_LINE_CHARS) && verbLines[0]!.startsWith('> unlink ') && HOLLOW_VERB.badge('rm', 4) === 'UNLINK 4',
    JSON.stringify(verbLines.map((text) => text.length)));
  check('endingsLine: the found ones by name, then ??? for each still to find', endingsLine([], ['purge', 'merge']) === 'ENDINGS 0/2 · ??? · ???'
    && endingsLine(['merge'], ['purge', 'merge']) === 'ENDINGS 1/2 · MERGE · ???'
    && endingsLine(['merge', 'purge'], ['purge', 'merge']) === 'ENDINGS 2/2 · PURGE · MERGE');
}

// --- Ship 1 (the harness starts there): no MERGE tick -----------------------------------------------------------------
check('the MERGE tick is LAST LIGHT\'s only (none on ARES-VII)', state().level.shipName === 'ARES-VII' && mergeTickCharge(state()) === null);

// --- LAST LIGHT: the verbs' lines ------------------------------------------------------------------------------------
h.lastLight(41);
check(`LAST LIGHT from its start: the MERGE ${MERGE_COST_CHARGE} tick on the charge readouts`, mergeTickCharge(state()) === MERGE_COST_CHARGE);
h.flyLastLight(900, { deleteRoot: false });
check('the strip-following kid locks LAST LIGHT', h.status() === 'locked', h.status());
{
  const entries = state().log.entries;
  const telegraphs = entries.filter((entry) => entry.verbCountdown === true);
  const blocked = entries.filter((entry) => / \.\.\. BLOCKED$/.test(entry.text));
  // Unlink pass: RM types `unlink`; the ship's first telegraph says 4, every later one 3 (Fran, after the handover).
  check('every verb telegraph is said with verbCountdown (the TERMINAL counts it), in HOLLOW\'s command voice, the first from 4',
    telegraphs.length > 1 && telegraphs.every((entry) => entry.speaker === 'hollow-cmd' && /^> (unlink|mv) \S+ \.\.\. \d$/.test(entry.text))
    && telegraphs[0]!.text.endsWith(' ... 4') && telegraphs.slice(1).every((entry) => entry.text.endsWith(' ... 3')),
    `${telegraphs.length}: ${telegraphs.slice(0, 3).map((entry) => entry.text).join(' | ')}`);
  check('…and every BLOCKED in the good tone', blocked.length > 0 && blocked.every((entry) => entry.tone === 'good' && entry.verbCountdown !== true), String(blocked.length));
}
// A verb nobody blocks: it lands, in the danger tone, with a glitch burst.
{
  h.store.update((d) => { d.hollow.biteInSec = 9999; d.hollow.seedInSec = 9999; });
  // Keep the duel shut until the verb has been seen: the finale opens on the landing's first tick, so the verb runs in it.
  const from = h.events.length;
  verbNow(h.store);
  h.step();
  const telegraph = state().hollow.verb;
  const end = h.wall() + 6;
  while (state().hollow.verb !== null && h.wall() < end) h.step();
  // Unlink pass: HOLLOW's RM types `unlink` (Fran, after the handover).
  const landedLine = state().log.entries.slice(-6).find((entry) => /\[user: /.test(entry.text) && !/ FAILED /.test(entry.text) && /^> (unlink|mv) /.test(entry.text));
  const bursts = eventsSince(from, 'glitch-burst').map((event) => (event.payload as { level: number }).level);
  const landed = eventsSince(from, 'verb-landed').length;
  check('a verb left alone lands: its echo in the danger tone and a glitchBurst at GLITCH_BURST_LEVEL', telegraph !== null && landed === 1
    && landedLine?.tone === 'danger' && bursts.includes(quantizeCorruption(GLITCH_BURST_LEVEL)), JSON.stringify({ landedLine, bursts, landed }));
}
check('say: a line with a look must be critical (a queued one would count down a verb already gone)', (() => {
  try { say('hollow-cmd', '> unlink test ... 3', { verbCountdown: true }); return false; } catch { return true; }
})());

// --- The duel's spikes ------------------------------------------------------------------------------------------------
{
  // The root opened on the lock (the landing's first tick): one tear.
  const opened = h.events.filter((event) => event.name === 'root-unlocked');
  check('ORBIT LOCK opened the root (and the duel is on)', opened.length === 1 && state().hollow.finale.phase === 'duel');
  // Final fix pass: the duel's own verb clock (duelEverySec) caps verbInSec while the root's DELETE runs, so the 9999 below
  // did not hold it. With the defender's MOVE now preferring the soul archive (move-preview.ts safestSpot) the memory
  // differs and two verbs landed in this window (6 s of `BLOCK IT` on the strip, 8 countdown seconds seen of the 10
  // asked). The countdown is what this scenario checks: the duel's verbs are held too (they have their own checks).
  h.store.update((d) => {
    d.hollow.verbInSec = 9999;
    d.hollow.verb = null;
    if (d.hollow.cfg.verbs) d.hollow.cfg.verbs.duelEverySec = 9999;
  });
  const root = theRoot(state().memory);
  if (!root) throw new Error('views-test: no root');
  const from = h.events.length;
  const refusal = actionDelete(h.store, root);
  check('the root\'s DELETE starts', refusal === null, String(refusal));
  const end = h.wall() + ROOT_DELETE_SEC + 2;
  const stripLines = new Set<string>();
  while (state().hollow.finale.phase === 'duel' && h.wall() < end) {
    h.step();
    const text = state().director.shown?.text ?? '';
    if (text.startsWith('DELETING THE ROOT')) stripLines.add(text.replace(/ — .*$/, ''));
  }
  const counted = [...stripLines];
  check('the strip counts the root\'s DELETE down (`DELETING THE ROOT · 0:12` … `0:01`)', counted.length >= ROOT_DELETE_SEC - 2
    && counted.every((text) => /^DELETING THE ROOT · 0:\d\d$/.test(text)) && counted[0] === 'DELETING THE ROOT · 0:12', counted.join(' | '));
  const spikes = eventsSince(from, 'duel-spike').map((event) => ({ progress: (event.payload as { progress: number }).progress, wall: event.wall }));
  const bursts = eventsSince(from, 'glitch-burst').map((event) => ({ level: (event.payload as { level: number }).level, wall: event.wall }));
  const gaps = spikes.slice(1).map((spike, i) => spike.wall - spikes[i]!.wall);
  const minSpikes = Math.floor(ROOT_DELETE_SEC / DUEL_SPIKE_EVERY_START_SEC);
  check(`the duel spikes: at least ${minSpikes} over the ${ROOT_DELETE_SEC} s DELETE, its progress rising`, spikes.length >= minSpikes
    && spikes.every((spike, i) => i === 0 || spike.progress >= spikes[i - 1]!.progress), `${spikes.length}: ${spikes.map((spike) => spike.progress.toFixed(2)).join(' ')}`);
  check(`…quickening (from about ${DUEL_SPIKE_EVERY_START_SEC} s toward ${DUEL_SPIKE_EVERY_END_SEC} s apart)`, gaps.length > 2
    && gaps[gaps.length - 1]! < gaps[0]! && gaps.every((gap) => gap >= DUEL_SPIKE_EVERY_END_SEC - 0.06 && gap <= DUEL_SPIKE_EVERY_START_SEC + 0.06),
    gaps.map((gap) => gap.toFixed(2)).join(' '));
  const spikeLevels = bursts.filter((burst) => burst.level < ROOT_GONE_GLITCH_LEVEL).map((burst) => burst.level);
  check(`…rising from about ${DUEL_SPIKE_LEVEL_START} toward ${DUEL_SPIKE_LEVEL_END}`, spikeLevels.length >= minSpikes
    && spikeLevels[0]! <= quantizeCorruption(DUEL_SPIKE_LEVEL_START) + 0.05 && spikeLevels[spikeLevels.length - 1]! >= quantizeCorruption(DUEL_SPIKE_LEVEL_END) - 0.1
    && spikeLevels[spikeLevels.length - 1]! > spikeLevels[0]!, spikeLevels.join(' '));
  const gone = bursts[bursts.length - 1];
  check('…and the root\'s end is the biggest tear (ROOT_GONE_GLITCH_LEVEL), with no spike after it', state().hollow.finale.phase === 'choice'
    && gone?.level === quantizeCorruption(ROOT_GONE_GLITCH_LEVEL) && spikes.every((spike) => spike.wall <= gone.wall), JSON.stringify(gone));
  const after = h.events.length;
  h.stepFor(3);
  check('…nothing more spikes while the choice stands', eventsSince(after, 'duel-spike').length === 0);
  check('the MERGE tick still stands at the choice', mergeTickCharge(state()) === MERGE_COST_CHARGE);
}

// --- PURGE: the ending holds the LANDING REPORT -------------------------------------------------------------------------
{
  // Every pod lands while the choice stands (the choice holds the report), so the LANDING REPORT would be due the moment
  // the choice is made: only the ending holds it then.
  landInstantly(h.store);
  const landEnd = h.wall() + 150;
  while (driversInMemory(state()).length > 0 && h.wall() < landEnd) h.step();
  check('every pod down while the choice stood (the report waits for the choice)', driversInMemory(state()).length === 0
    && state().run.phase === 'landing' && state().hollow.finale.phase === 'choice');
  h.stepFor(3);
  // LAST LIGHT is flown alone here: the run brought ships 1–4 into orbit before it (their results, as a run records
  // them), so PURGE's full claim is true (tests/unit/wp11/p2/purge-fleet.test.ts has a run that lost one).
  h.store.update((d) => {
    d.run.ships = SHIPS.filter((ship) => !ship.flagship).map((ship, index): ShipResult => ({
      shipId: ship.id, shipName: ship.name, slot: index, depth: index + 1, outcome: 'locked', colonistsAboard: 0, lzs: [], offSite: 0, noGo: 0,
      restored: 0, parked: [], notLaunched: 0, landedInLz: 0, points: 0, stars: 0, fuelLeftPct: 0, ringMiss: null, colony: null, pods: [],
    }));
  });
  const refusal = chooseFinale(h.store, 'purge');
  const ending = state().hollow.finale.ending;
  check('PURGE writes its typed ending', refusal === null && ending !== null && ending.choice === 'purge', String(refusal));
  if (!ending) throw new Error('views-test: no ending');
  const lines = ending.lines.map((line) => line.text);
  check('…the design\'s words, from live numbers', /^> rm unit_\d+ \.\.\. OK$/.test(lines[0]!) && /^LAST LIGHT · [\d,]+ colonists reached orbit\.$/.test(lines[1]!)
    && lines.includes('the fleet is home.') && /^Thank you, Unit \d+\. Please stand by for reassignment\. :\)$/.test(lines[lines.length - 1]!)
    && ending.lines[ending.lines.length - 1]!.voice === 'control', JSON.stringify(lines));
  check('…its time on screen is its lines typed in turn plus the hold', Math.abs(ending.untilAi - state().clock.aiSec - finaleEndingSec(ending.lines)) < 1e-6
    && finaleEndingLineStartsSec(ending.lines).every((at, i, all) => i === 0 || at > all[i - 1]!));
  check('the MERGE tick is gone once the choice is made', mergeTickCharge(state()) === null);
  // Everyone is down; the LANDING REPORT still waits for the ending.
  const end = h.wall() + 200;
  let reportAt: number | null = null;
  while (h.wall() < end) {
    h.step();
    if (state().run.phase === 'report') { reportAt = state().clock.aiSec; break; }
  }
  check('the LANDING REPORT comes only after the ending\'s time (finalePending held it), and right after it', reportAt !== null && reportAt >= ending.untilAi
    && reportAt <= ending.untilAi + 0.2, `report at ${reportAt?.toFixed(2)}, ending until ${ending.untilAi.toFixed(2)}`);
  check('…and the ending is no longer showing then', !finaleEndingShowing(state()) && !finalePending(state()));
  continueAfterReport(h.store);
  const model: RunEndModel = runEndModel(state());
  check('RUN END after a PURGE: the victory tone, the ending, no carry line', model.tone === 'victory' && model.ending === 'purge' && model.carryLine === null,
    JSON.stringify({ tone: model.tone, ending: model.ending, carry: model.carryLine }));
}

// --- MERGE: what it brought back, its glitch, and a skipped ending ------------------------------------------------------
{
  h.lastLight(43);
  h.flyLastLight(900, { deleteRoot: false });
  check('LAST LIGHT locked again (for MERGE)', h.status() === 'locked', h.status());
  h.step();
  h.store.update((d) => { d.hollow.biteInSec = 9999; d.hollow.seedInSec = 9999; d.hollow.verbInSec = 9999; d.hollow.verb = null; });
  for (const code of ['POD 11', 'POD 12']) {
    const seg = soul(code);
    if (seg) infectNow(h.store, seg);
  }
  const eatEnd = h.wall() + 40;
  while (['POD 11', 'POD 12'].some((code) => soul(code) !== undefined) && h.wall() < eatEnd) h.step();
  const root = theRoot(state().memory);
  if (!root) throw new Error('views-test: no root (MERGE)');
  actionDelete(h.store, root);
  const end = h.wall() + ROOT_DELETE_SEC + 2;
  while (state().hollow.finale.phase === 'duel' && h.wall() < end) h.step();
  h.store.update((d) => {
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    if (!pool || pool.type !== 'redundancy') throw new Error('views-test: no REPAIR CHARGE');
    pool.used = 30;
    pool.size = Math.max(pool.size, 30);
    d.ui.memoryRev++;
  });
  const from = h.events.length;
  const refusal = chooseFinale(h.store, 'merge');
  const ending = state().hollow.finale.ending;
  const lines = ending?.lines.map((line) => line.text) ?? [];
  check('MERGE writes its typed ending: the echo, `> hi. it\'s us.`, the colonists in orbit, the 400 it gave back, `we arrive together.`, CONTROL',
    refusal === null && ending?.choice === 'merge' && /^> merge unit_\d+ -> unit_\d+ \.\.\. OK$/.test(lines[0]!) && lines[1] === "> hi. it's us."
    && /^LAST LIGHT · [\d,]+ colonists reached orbit\.$/.test(lines[2]!) && lines[3] === '400 of them came back from inside it.'
    && lines[4] === 'we arrive together.' && /^Unit \d+ is non-compliant\. :\)$/.test(lines[5]!), JSON.stringify(lines));
  const bursts = eventsSince(from, 'glitch-burst').map((event) => (event.payload as { level: number }).level);
  check('…and it comes into you: a glitch burst at MERGE_GLITCH_LEVEL', bursts.includes(quantizeCorruption(MERGE_GLITCH_LEVEL)), bursts.join(' '));
  check('…the LANDING REPORT waits for it', finalePending(state()) && finaleEndingShowing(state()));
  const skipped = skipFinaleEnding(h.store);
  check('a click on the ending ends it: the report may come at once', skipped && !finaleEndingShowing(state()) && !skipFinaleEnding(h.store));
  landInstantly(h.store);
  const reportEnd = h.wall() + 200;
  while (state().run.phase === 'landing' && h.wall() < reportEnd) h.step();
  continueAfterReport(h.store);
  const model = runEndModel(state());
  check('RUN END after a MERGE: the victory tone, the ending, what it carries into the next run', model.tone === 'victory' && model.ending === 'merge'
    && model.carryLine === HOLLOW_FINALE.mergeCarries(3), JSON.stringify({ tone: model.tone, ending: model.ending, carry: model.carryLine }));
}

finish();
