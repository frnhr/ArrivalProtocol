// WP9 part 2: what the screens show of KESTREL, as data (the DOM only patches what these models return).
// • The NAV PLOT's zone glyph and label (flight-hud plotZones), read from the sensed path: blind → grey
//   `DEBRIS · RACK C · HIT?` counted to the nearest pass; the sensor repaired → red `DEBRIS · HITS RACK C` / `IN m:ss`
//   counted to the entry, with a hazard span on the path; an early IN correction → green `DEBRIS · CLEAR`, no span;
//   never corrected → `HIT · RACK C` after contact; NO SIGNAL → nothing.
// • The MIND's rack tag (rackZoneTags) agrees at every step: `DEBRIS?` / `DEBRIS m:ss` / none / `HIT −25%`.
// • A belt (LAST LIGHT's kind, built here, flown in WP11): `BELT · m:ss INSIDE` / `≈n HITS ON RACKS A–B`, both racks
//   tagged, the geiger's depth 0 at the edges and 1 midway.
// • The AUTO button (autoButton): hidden with no skill; refused far from ▼ (`TOO FAR FROM ▼`); ready in the window
//   (`BRAKES AT ▼ FOR YOU`); armed with its countdown; flying; a short reason when the threads are busy; still shown,
//   refused, once the trained skill's file is gone.
// • The Skills row for AUTOBURN.skl (skillsModel): first, its ACCURACY and captures, ARMED / FLYING THE SHIP NOW,
//   DAMAGED, GONE.
// • The zone-forecast moment fires once (hit → clear) for the early correction, and the stamps' words.
// • Every new line fits its place (≤ 70 characters on the strip; the plot's labels fit the plot's width).
import { check, finish } from '../../wp1/harness';
import { createHarness9 } from '../harness9';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { plotZones, rackZoneTags, autoButton } from '@systems/flight-hud';
import { capabilitiesNow } from '@systems/capabilities';
import { beltDepth } from '@systems/zones';
import { skillsModel } from '@systems/skills';
import { autoburnRefusal, skillFiles } from '@systems/autoburn';
import { reserveThread, releaseThread, threadsTotal } from '@systems/ops-core';
import { racksText, zoneVerdict } from '@/types/zone';
import { ZONE_PLOT_TEXT, ZONE_STAMP_TEXT, RACK_TAG_TEXT } from '@data/zone-text';
import { AUTO_BUTTON_TEXT, AUTOBURN_SKILL_ROW, AUTOBURN_REFUSAL } from '@data/skill-text';
import { SKILLS_TEXT } from '@data/script';
import { MAX_LINE_CHARS, DEBRIS_HIT_DAMAGE, BAND_DEGRADED_MIN } from '@data/tuning';

const h = createHarness9(3);
const state = () => h.store.getState();
const tacNow = (): number => state().clock.tSec / state().level.tacticalWarp;
const sensed = () => getSensedPrediction();
const plot = () => plotZones(state(), sensed())[0];
const tagC = () => rackZoneTags(state(), sensed()).find((tag) => tag.rack === 'C');
const TIME = /^IN \d\d:\d\d$/;

// --- Flying blind, then the sensor repaired, then the early correction ---------------------------------------------
{
  h.kestrel(3, { arrivalDamage: true, hollowAsleep: true });
  h.step();
  const blind = plot();
  check('KESTREL arrives blind: the cloud is grey, `DEBRIS · RACK C · HIT?`, counted to its nearest pass',
    capabilitiesNow(state()).plot.mode === 'uncertain' && blind?.verdict === 'unknown' && blind.tone === 'unknown'
    && blind.lines[0] === 'DEBRIS · RACK C · HIT?' && TIME.test(blind.lines[1] ?? ''), JSON.stringify(blind));
  const blindTag = tagC();
  check('…rack C\'s tag in the MIND: `DEBRIS?` over the same countdown, grey', blindTag?.verdict === 'unknown'
    && blindTag.lines[0] === RACK_TAG_TEXT.debrisUnknown && blindTag.lines[1] === blind?.lines[1]?.replace('IN ', '') && blindTag.tone === 'unknown',
  JSON.stringify(blindTag));
  check('…no other rack is tagged', rackZoneTags(state(), sensed()).length === 1);

  h.store.update((d) => {
    const sensor = d.memory.find((seg) => seg.role === 'sensor');
    if (sensor && 'integrity' in sensor) sensor.integrity = 100;
  });
  h.step();
  const hit = plot();
  const enterTac = ((getPrediction().zoneHits[0]!.enterInSec ?? 0) - (state().clock.tSec - getPrediction().asOfTSec)) / state().level.tacticalWarp;
  check('the sensor repaired: red `DEBRIS · HITS RACK C` / `IN m:ss` counted to the entry, a hazard span on the drawn path',
    hit?.verdict === 'hit' && hit.tone === 'danger' && hit.lines[0] === 'DEBRIS · HITS RACK C' && TIME.test(hit.lines[1] ?? '')
    && Math.abs(Number(hit.lines[1]!.slice(3, 5)) * 60 + Number(hit.lines[1]!.slice(6, 8)) - enterTac) <= 1
    && sensed().hazardSpans.length === 1, `${JSON.stringify(hit?.lines)} entry ${enterTac.toFixed(1)} tac s`);
  check('…rack C\'s tag: `DEBRIS` over the countdown, red', tagC()?.verdict === 'hit' && tagC()?.lines[0] === RACK_TAG_TEXT.debris && tagC()?.tone === 'danger');

  // The early correction: IN held until the strip says RELEASE.
  h.events.length = 0;
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.step();
  const clear = plot();
  check('the early IN correction: green `DEBRIS · CLEAR`, no hazard span left', clear?.verdict === 'clear' && clear.tone === 'good'
    && clear.lines.join() === ZONE_PLOT_TEXT.debrisClear && sensed().hazardSpans.length === 0, JSON.stringify(clear));
  check('…rack C\'s tag is gone (the rack is safe)', tagC() === undefined);
  const flips = h.events.filter((event) => event.name === 'zone-forecast').map((event) => event.payload as { from: string; to: string });
  check('…the forecast moment fired once: hit → clear (the CLEAR OF THE DEBRIS stamp and chime)', flips.length === 1 && flips[0]!.from === 'hit' && flips[0]!.to === 'clear',
    JSON.stringify(flips));

  // NO SIGNAL: the plot shows nothing; the MIND knows as little as PATH UNCERTAIN.
  h.store.update((d) => {
    const navplot = d.memory.find((seg) => seg.role === 'navplot');
    if (navplot && 'integrity' in navplot) navplot.integrity = 10;
  });
  h.step();
  check('NO SIGNAL: no zone on the plot (the veil covers it), the rack tag blind', plotZones(state(), sensed()).length === 0
    && tagC()?.verdict === 'unknown', JSON.stringify(tagC()));
}

// --- Never corrected: the hit, then `HIT · RACK C` -------------------------------------------------------------------
{
  h.kestrel(3, { hollowAsleep: true, sensorHealed: true });
  h.stepUntil(() => state().hazards.hitIds.length > 0, 200);
  // The predictor refreshes at most PREDICT_HZ: the label follows within a tenth of a second.
  for (let i = 0; i < 4; i++) h.step();
  const spent = plot();
  check('never corrected: after contact the plot says `HIT · RACK C` (red)', spent?.verdict === 'spent' && spent.lines.join() === 'HIT · RACK C'
    && spent.tone === 'danger', JSON.stringify(spent));
  const spentTag = tagC();
  check(`…rack C's tag: \`HIT\` over \`−${DEBRIS_HIT_DAMAGE}%\`, red, for the rest of the ship`, spentTag?.verdict === 'spent'
    && spentTag.lines.join(' ') === `HIT −${DEBRIS_HIT_DAMAGE}%` && spentTag.tone === 'danger', JSON.stringify(spentTag));
  const hitEvent = h.events.find((event) => event.name === 'zone-hit')?.payload as { racks: string[]; hits: { rack: string }[] } | undefined;
  check('…the zone-hit event names the rack of every file it hit (the view flashes those rows)', hitEvent !== undefined
    && hitEvent.hits.length > 0 && hitEvent.hits.every((item) => item.rack === 'C') && hitEvent.racks.join() === 'C');
  check('…the stamp\'s words: `HIT · RACK C`', ZONE_STAMP_TEXT.hit(racksText(['C'])) === 'HIT · RACK C' && ZONE_STAMP_TEXT.clear === 'CLEAR OF THE DEBRIS');
  h.store.update((d) => { d.run.phase = 'report'; });
  check('once the ship is over, no rack is tagged', rackZoneTags(state(), sensed()).length === 0);
}

// --- A belt (WP11's kind) ------------------------------------------------------------------------------------------
{
  h.kestrel(3, { hollowAsleep: true, sensorHealed: true });
  // A belt across the arrival path (KESTREL's start is at r 25,000; ▼ at 9,000): the path will cross 12,000–16,000.
  h.store.update((d) => {
    d.level.zones = [{ kind: 'belt', id: 'test-belt', rIn: 12000, rOut: 16000, racks: ['A', 'B'] }];
    d.run.rev++;
  });
  h.step();
  const belt = plot();
  check('a belt the path crosses: `BELT · m:ss INSIDE` / `≈n HITS ON RACKS A–B`, red', belt?.verdict === 'hit' && /^BELT · \d+:\d\d INSIDE$/.test(belt.lines[0] ?? '')
    && /^≈\d+ HITS ON RACKS A–B$/.test(belt.lines[1] ?? '') && belt.tone === 'danger', JSON.stringify(belt));
  const tags = rackZoneTags(state(), sensed());
  check('…both its racks are tagged `BELT` over the countdown to the entry', tags.length === 2 && tags.map((tag) => tag.rack).join() === 'A,B'
    && tags.every((tag) => tag.lines[0] === RACK_TAG_TEXT.belt && /^\d\d:\d\d$/.test(tag.lines[1] ?? '')), JSON.stringify(tags));
  check('…the geiger is silent outside it', beltDepth(state()) === null);
  h.store.mutate((d) => { d.orbit.x = 14000; d.orbit.y = 0; });
  check('…inside, its depth is 1 midway', Math.abs((beltDepth(state()) ?? -1) - 1) < 1e-9);
  h.store.mutate((d) => { d.orbit.x = 12500; });
  check('…and a quarter of the way in, 0.25', Math.abs((beltDepth(state()) ?? -1) - 0.25) < 1e-9);
  h.store.update((d) => { d.run.phase = 'report'; });
  check('…and nothing when the world stands (no geiger between ships)', beltDepth(state()) === null);
  check('racksText: `RACK C`, `RACKS A–B`, `RACKS B, D`', racksText(['C']) === 'RACK C' && racksText(['B', 'A']) === 'RACKS A–B' && racksText(['B', 'D']) === 'RACKS B, D');
}

// --- The AUTO button and the Skills row ------------------------------------------------------------------------------
{
  h.kestrel(3, { hollowAsleep: true, sensorHealed: true });
  check('no trained skill: no AUTO button, no skill row', !autoButton(state(), getPrediction()).shown && skillsModel(state()).every((row) => row.id !== 'autoburn'));
  h.giveSkill([4, 4]);
  const far = autoButton(state(), getPrediction());
  check('the skill installed: AUTO · [B], refused far from ▼ (`TOO FAR FROM ▼`), its tooltip names its accuracy',
    far.shown && far.head === AUTO_BUTTON_TEXT.head && far.note === AUTOBURN_REFUSAL.tooFar && far.look === 'blocked' && far.title === AUTO_BUTTON_TEXT.title(84),
    JSON.stringify(far));
  const row = skillsModel(state())[0];
  check('the Skills window lists AUTOBURN.skl first: `ACCURACY 84% · FROM YOUR 2 CAPTURES`, its file\'s pip',
    row?.id === 'autoburn' && row.title === AUTOBURN_SKILL_ROW.title && row.status === AUTOBURN_SKILL_ROW.trained(84, 2) && row.tone === 'good'
    && row.pips.length === 1 && row.pips[0]!.segId === skillFiles(state().memory)[0]!.id && row.pips[0]!.reading === '100%', JSON.stringify(row));

  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 300);
  const ready = autoButton(state(), getPrediction());
  check('within 90 tac s of the capture: ready, `BRAKES AT ▼ FOR YOU`', ready.look === 'ready' && ready.note === AUTO_BUTTON_TEXT.ready && ready.head === AUTO_BUTTON_TEXT.head,
    JSON.stringify(ready));
  // Every free thread taken: the short reason fits the button's corner.
  const owners: string[] = [];
  for (let i = 0; i < threadsTotal(); i++) { const owner = `test-${i}`; if (reserveThread(owner)) owners.push(owner); }
  const busy = autoButton(state(), getPrediction());
  check('…with every thread busy: refused, `THREADS BUSY`', busy.look === 'blocked' && busy.note === 'THREADS BUSY', JSON.stringify(busy));
  owners.forEach((owner) => releaseThread(owner));
  h.press('KeyB');
  h.step();
  const armed = autoButton(state(), getPrediction());
  check('[B]: `AUTO ARMED` / `BRAKES IN 00:mm · [B] OFF`', armed.look === 'armed' && armed.head === AUTO_BUTTON_TEXT.armedHead
    && /^BRAKES IN \d\d:\d\d · \[B\] OFF$/.test(armed.note), JSON.stringify(armed));
  check('…the Skills row: `ARMED — IT BRAKES AT ▼`', skillsModel(state())[0]?.status === AUTOBURN_SKILL_ROW.armed);
  h.stepUntil(() => state().burn.auto.phase === 'burning', 120);
  const flying = autoButton(state(), getPrediction());
  check('…burning: `AUTO BRAKING` / `[SPACE] TAKES OVER`, the row `FLYING THE SHIP NOW`', flying.look === 'flying' && flying.head === AUTO_BUTTON_TEXT.burningHead
    && flying.note === AUTO_BUTTON_TEXT.burning && skillsModel(state())[0]?.status === AUTOBURN_SKILL_ROW.flying, JSON.stringify(flying));
  h.stepUntil(() => state().burn.auto.phase === 'done', 120);
  for (let i = 0; i < 4; i++) h.step();
  check('…done at loop-closed: the button rests (`NOTHING TO CAPTURE`), the row back to its accuracy', autoButton(state(), getPrediction()).note === AUTOBURN_REFUSAL.noCapture
    && skillsModel(state())[0]?.status === AUTOBURN_SKILL_ROW.trained(84, 2), JSON.stringify(autoButton(state(), getPrediction())));

  h.store.update((d) => {
    const skill = d.memory.find((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn');
    if (skill && 'integrity' in skill) skill.integrity = BAND_DEGRADED_MIN - 10;
  });
  check(`the file hurt below ${BAND_DEGRADED_MIN}: the row says DAMAGED`, skillsModel(state())[0]?.status === AUTOBURN_SKILL_ROW.damaged(BAND_DEGRADED_MIN)
    && skillsModel(state())[0]?.tone === 'warn');
  h.store.update((d) => {
    d.memory = d.memory.map((seg) => (seg.type === 'upgrade' && seg.upgrade === 'autoburn' ? { id: 'gone-skill', name: 'Free', type: 'free', size: seg.size } : seg));
    d.ui.memoryRev++;
  });
  const goneRow = skillsModel(state())[0];
  const goneButton = autoButton(state(), getPrediction());
  check('the file gone: the row says how to get it back, with a ✕ GONE pip; AUTO stays shown, refused (`NO AUTOBURN.skl`)',
    goneRow?.status === AUTOBURN_SKILL_ROW.gone && goneRow.pips[0]?.look === 'missing' && goneButton.shown && goneButton.note === AUTOBURN_REFUSAL.noFile
    && goneButton.title === AUTO_BUTTON_TEXT.titleNoSkill, JSON.stringify({ goneRow, goneButton }));
}

// --- The verdict helper, and the words fit -----------------------------------------------------------------------
{
  const base = { zoneId: 'z', kind: 'debris' as const, racks: ['C'], spent: false, insideNow: false, enterInSec: 100, exitInSec: 120, insideSec: 20,
    closestInSec: 110, missKm: -300, expectedHits: 1, correctionClears: true, dodgeInSec: 50 };
  check('zoneVerdict: spent beats blind, blind beats the path, inside counts as a hit', zoneVerdict({ ...base, spent: true }, true) === 'spent'
    && zoneVerdict(base, true) === 'unknown' && zoneVerdict(base, false) === 'hit' && zoneVerdict({ ...base, enterInSec: null }, false) === 'clear'
    && zoneVerdict({ ...base, enterInSec: null, insideNow: true }, false) === 'hit');
  // The plot is 320 units wide; a label line is about 4.6 units a character (NavPlotWindow CHAR_W) and must leave
  // room for the cloud beside it: 40 characters at most.
  const PLOT_LINE_MAX = 40;
  const worstRacks = racksText(['A', 'B', 'C', 'D', 'E', 'F']);
  const plotLines = [ZONE_PLOT_TEXT.debrisHits(worstRacks), ZONE_PLOT_TEXT.debrisUnknown(worstRacks), ZONE_PLOT_TEXT.debrisSpent(worstRacks),
    ZONE_PLOT_TEXT.debrisClear, ZONE_PLOT_TEXT.beltInside('99:59'), ZONE_PLOT_TEXT.beltHits(99, worstRacks), ZONE_PLOT_TEXT.beltClear,
    ZONE_PLOT_TEXT.beltUnknown(worstRacks), ZONE_PLOT_TEXT.countdown('99:59')];
  check(`every plot label line fits the plot (≤ ${PLOT_LINE_MAX} characters, worst case six racks)`, plotLines.every((text) => text.length <= PLOT_LINE_MAX),
    plotLines.filter((text) => text.length > PLOT_LINE_MAX).join(' | '));
  const rackLines: string[] = [...Object.values(RACK_TAG_TEXT), `−${DEBRIS_HIT_DAMAGE}%`, '−100%', '99:59'];
  check('every rack tag line fits the 48 px label column (≤ 7 characters)', rackLines.every((text) => text.length <= 7), rackLines.join(' | '));
  const stripLines = [ZONE_STAMP_TEXT.clear, ZONE_STAMP_TEXT.hit(worstRacks), AUTO_BUTTON_TEXT.title(99), AUTO_BUTTON_TEXT.titleNoSkill, AUTOBURN_SKILL_ROW.effect,
    AUTOBURN_SKILL_ROW.trained(99, 99), AUTOBURN_SKILL_ROW.gone, AUTOBURN_SKILL_ROW.damaged(BAND_DEGRADED_MIN), SKILLS_TEXT.empty, SKILLS_TEXT.emptyHint];
  // The tooltip may be longer (it is a tooltip); everything a kid reads in a line fits the strip's 70.
  check(`every new line fits ≤ ${MAX_LINE_CHARS} characters (tooltips excepted)`, stripLines.filter((text) => !text.startsWith('AUTOBURN.skl flies') && !text.startsWith('AUTOBURN.skl is gone'))
    .every((text) => text.length <= MAX_LINE_CHARS), stripLines.filter((text) => text.length > MAX_LINE_CHARS).join(' | '));
  // The AUTO button's corner: its notes in 9 px type on a ~270 px button beside `AUTO · B`: 24 characters at most.
  const AUTO_NOTE_MAX = 24;
  const notes = [AUTO_BUTTON_TEXT.ready, AUTO_BUTTON_TEXT.armed('01:30'), AUTO_BUTTON_TEXT.burning,
    ...Object.values(AUTOBURN_REFUSAL).map((reason) => (reason === AUTOBURN_REFUSAL.threads ? 'THREADS BUSY' : reason))];
  // A key cap draws its key in a box about two characters wide, not its brackets. The armed countdown is at most
  // the offer window (90 tac s: 01:30).
  const shown = (text: string): number => text.replace(/\[([A-Z]+)\]/g, (_match, key: string) => `${key} `).length;
  check(`every AUTO note fits its corner (≤ ${AUTO_NOTE_MAX} characters, the threads reason in its short form)`, notes.every((text) => shown(text) <= AUTO_NOTE_MAX),
    notes.filter((text) => shown(text) > AUTO_NOTE_MAX).join(' | '));
}

void tacNow;
finish();
