// WP12 fix round 1: the review findings fixed in the DOM-free systems.
// • The lesson lead-in is one clock per lesson (correctness 2; the lead's ruling of 17:45): its amber `-tab` wording and
//   its blue one share LESSON_LEAD_IN_SEC.
// • The strip filter holds an alarm back against a shown RELEASE row (correctness 3): RELEASE ⇄ ALARM no longer flickers.
// • Ship lines asking for a burn, a preset or a countdown to one say [TAB] first in the MIND (experience 1; the lead's
//   ruling): the row's id kept, TAB the first key, every line within the strip, mind lines and firing rows untouched.
// • The director's reset snapshot reports the lead-in clock (quality 1).
// • One selector for a usable tool (quality 2): an infected copy counts for HOLLOW and the hints, not for the renewal.
// • The two TODOs part 3 dropped (spec 5): the run-2 hurt-cluster hint shows once; AUTOBURN's READY lesson takes GET
//   READY's place when the coast was SKIPped. (Slice 1a: the hurt-cluster hint is the hurt-driver one.)
// • The phone header's next hazard (experience 2): KESTREL's debris cloud by its rack and countdown.
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../../wp7/harness7';
import { buildDirectorCtx, composeObjective, type DirectorCtx } from '@systems/director';
import {
  createObjectiveFilter, releaseHolds, dodgeCountdownEnds, buildFlightContext, flightObjective, PRESET_KEY,
} from '@systems/guidance';
import { computePrediction, getPrediction } from '@systems/predict';
import { createRng } from '@systems/rng';
import { stateFromElements } from '@/types/orbit';
import { GUIDE_RULES } from '@data/script';
import { GHOST_TEXT } from '@data/ghost-text';
import { LESSON_LEAD_IN_SEC, MAX_LINE_CHARS, OBJECTIVE_HYSTERESIS_SEC } from '@data/tuning';
import { installTool, isLicensed, hasWorkingTool } from '@systems/licences';
import { infectNow } from '@systems/hollow';
import { phase2HollowOf } from '../../support/hollow-world';
import { setMode } from '@systems/mode';
import { requireAddr } from '@systems/memory-ops';
import { resetReport, resetWorld } from '@systems/reset';
import { hasUsableTool, toolFilesOf } from '@state/selectors';
import { nextHazard } from '@systems/flight-hud';
import type { ObjectiveLine, SasMode } from '@state/schema';

const h = createHarness7(1);
const state = (): ReturnType<typeof h.store.getState> => h.store.getState();

// --- The lead-in, one clock per lesson ---------------------------------------------------------------------------
h.shipAlone(3, 1);  // VESPER: its seeds hunt the tools (the COPY lesson's ship)
for (let i = 0; i < 20; i++) h.step();
if (!isLicensed(state(), 'copy')) installTool(h.store, 'copy');
const free = state().memory.find((seg) => seg.type === 'free' && seg.size >= 2);
if (!free) throw new Error('fixes.test: no free run on VESPER');
h.store.update((d) => {
  // Phase 3 slice 2: VESPER plays ARRIVAL + WALLS now; tool-hunting seeds are the HUNT stage's (phase 2's VESPER).
  d.hollow.cfg = phase2HollowOf(3);
  d.hollow.phase = 'awake';
  const freeSeg = d.memory.find((seg) => seg.id === free.id);
  if (!freeSeg) throw new Error('fixes.test: the free run went');
  d.hollow.seedTelegraph = { startAddr: requireAddr(d.memory, freeSeg), size: 2, leftSec: 5, preempted: false };
});
const soul = state().memory.find((seg) => seg.type === 'driver');
if (!soul) throw new Error('fixes.test: no driver on VESPER');
infectNow(h.store, soul);

const composedId = (mode: 'tools' | 'memory', lessonSec: number): string => {
  setMode(h.store, mode);
  const ctx = buildDirectorCtx(state(), getPrediction(), {
    events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null, leadShownSec: new Map([['copy-repair', lessonSec]]),
  });
  return composeObjective(ctx, GUIDE_RULES)?.id ?? 'none';
};
// Final fix pass: the lesson key moved from `leadIn.lesson` to GuideRule.lesson (it also keys maxShownSec and the one-shot
// completion now); the lead-in's length is `leadInSec`.
check('the COPY lesson\'s two wordings share one lead-in (its lesson key)', ['tut-copy-repair', 'tut-copy-repair-tab']
  .every((id) => { const rule = GUIDE_RULES.find((candidate) => candidate.id === id); return rule?.lesson === 'copy-repair' && rule.leadInSec === LESSON_LEAD_IN_SEC; }));
check('…and so do the belt lesson\'s', ['belt-move', 'belt-move-tab'].every((id) => {
  const rule = GUIDE_RULES.find((candidate) => candidate.id === id);
  return rule?.lesson === 'belt-move' && rule.leadInSec === LESSON_LEAD_IN_SEC;
}));
check('amber, a fresh lesson: its [TAB] wording leads (the lead-in)', composedId('tools', 0) === 'tut-copy-repair-tab', composedId('tools', 0));
const blueAfter = composedId('memory', LESSON_LEAD_IN_SEC);
check(`blue after the amber wording had its ${LESSON_LEAD_IN_SEC} s: no second lead-in (HOLLOW's line comes first)`,
  blueAfter !== 'tut-copy-repair', blueAfter);
check('blue, a fresh lesson: the blue wording leads', composedId('memory', 0) === 'tut-copy-repair', composedId('memory', 0));

// The live director counts it per lesson, and its reset snapshot says so (quality 1).
setMode(h.store, 'tools');
for (let i = 0; i < 10; i++) h.step();
const directorDrift = resetReport().find((drift) => drift.name === 'director');
check('the director\'s reset snapshot reports the lead-in clock (leadShown)', directorDrift !== undefined && /"leadShown":1/.test(directorDrift.now),
  directorDrift?.now ?? 'no drift');
resetWorld();
check('…and the world reset clears it', !(resetReport().find((drift) => drift.name === 'director')?.now ?? '').includes('"leadShown":1'));

// --- RELEASE ⇄ ALARM -------------------------------------------------------------------------------------------
const filter = createObjectiveFilter<ObjectiveLine>({ holdsAgainst: releaseHolds, passesAt: dodgeCountdownEnds });
const line = (id: string, keys: string[], source: ObjectiveLine['source']): ObjectiveLine =>
  ({ id, text: id, keys, urgency: 'now', layer: 'ship', highlight: null, source });
const release = line('F5-next', ['SPACE'], 'flight');
const alarm = line('alarm-eaten-tab', ['TAB'], 'alarm');
const flips: string[] = [];
filter.reset();
for (let tick = 0; tick < 10; tick++) flips.push(filter.next(tick % 2 === 0 ? release : alarm, 0.05)?.id ?? '');
check('RELEASE ⇄ ALARM every tick (an alarm yields to RELEASE by design): the strip stays on RELEASE', flips.every((id) => id === 'F5-next'), flips.join(' '));
filter.reset();
filter.next(release, 0.05);
let ticks = 0;
let shown = '';
while (shown !== 'alarm-eaten-tab' && ticks < 40) { shown = filter.next(alarm, 0.05)?.id ?? ''; ticks++; }
check(`…a lasting alarm still takes over after the hysteresis (${OBJECTIVE_HYSTERESIS_SEC} s)`, shown === 'alarm-eaten-tab'
  && Math.abs(ticks * 0.05 - OBJECTIVE_HYSTERESIS_SEC) <= 0.05 + 1e-9, `${(ticks * 0.05).toFixed(2)} s`);
filter.reset();
filter.next(line('F10-wait', ['F'], 'flight'), 0.05);
check('…and an alarm over any other line still shows at once', filter.next(alarm, 0.05)?.id === 'alarm-eaten-tab');

// --- Ship lines seen from the MIND ---------------------------------------------------------------------------------
// The flight table on random states, not firing (in blue the kid's own burn is always let go), from both screens.
h.resetTo('flight', 1);  // ship 1 (shipAlone is for the ships a unit transmits to)
const rng = createRng(4711);
const modes: SasMode[] = ['off', 'prograde', 'retrograde', 'radial-in', 'radial-out'];
const shipKeys = new Set(['SPACE', ...Object.values(PRESET_KEY), 'Q', 'E']);
let compared = 0;
let tabbed = 0;
const bad: string[] = [];
for (let i = 0; i < 1500; i++) {
  const mu = state().level.planet.mu;
  const ecc = rng() * 1.5;
  const nuMax = ecc < 1 ? Math.PI : Math.acos(-1 / ecc) * 0.95;
  const orbit = stateFromElements(2000 + rng() * 14000, ecc, rng() * 6.28, (rng() * 2 - 1) * nuMax, mu);
  if (Math.hypot(orbit.x, orbit.y) <= state().level.planet.R + 1) continue;
  h.store.mutate((d) => {
    d.orbit.x = orbit.x; d.orbit.y = orbit.y; d.orbit.vx = orbit.vx; d.orbit.vy = orbit.vy;
    d.burn.firing = false; d.burn.firingSource = null; d.burn.firingFor = null;
    d.burn.sasMode = modes[Math.floor(rng() * modes.length)] ?? 'off';
    d.burn.fuelPct = rng() < 0.1 ? 0 : rng() * 100;
    d.clock.tSec = rng() * 50;
  });
  const context = buildFlightContext(state(), computePrediction(state()));
  for (const presetsAvailable of [true, false]) {
    const amber = flightObjective({ ...context, inMind: false, presetsAvailable });
    const blue = flightObjective({ ...context, inMind: true, presetsAvailable });
    if (!amber || !blue) continue;
    compared++;
    const asks = amber.layer !== 'mind' && (amber.keys.some((key) => shipKeys.has(key)) || amber.id.endsWith('-ready'));
    if (blue.id !== amber.id) bad.push(`id ${amber.id} → ${blue.id}`);
    if (blue.text.length > MAX_LINE_CHARS) bad.push(`too long: ${blue.text}`);
    if (asks) {
      tabbed++;
      if (!blue.text.includes('[TAB]') || blue.keys[0] !== 'TAB') bad.push(`no [TAB]: ${amber.text} → ${blue.text}`);
    } else if (amber.layer !== 'mind' && blue.text !== amber.text) {
      bad.push(`changed a line that asks nothing of the ship: ${amber.text} → ${blue.text}`);
    }
  }
}
check(`in the MIND every ship line asking for a burn or a preset says [TAB] first, id kept, ≤ ${MAX_LINE_CHARS} characters`
  + ` (${tabbed} of ${compared} lines)`, bad.length === 0 && tabbed > 100, bad.slice(0, 4).join(' | '));

// The opener itself, live: DON'T HIT THE PLANET from blue.
h.resetTo('flight', 1);  // ship 1 (shipAlone is for the ships a unit transmits to)
for (let i = 0; i < 5; i++) h.step();
setMode(h.store, 'memory');
for (let i = 0; i < 3; i++) h.step();
const opener = state().director.shown;
check('ship 1\'s opener, in blue: `DON\'T HIT THE PLANET — [TAB], …hold [SPACE]` on the strip', opener !== null
  && /^DON'T HIT THE PLANET — \[TAB\], .*hold \[SPACE\]$/.test(opener.text) && opener.keys[0] === 'TAB', opener?.text ?? 'none');
setMode(h.store, 'tools');
for (let i = 0; i < 3; i++) h.step();
check('…and back in amber its own words again', /^DON'T HIT THE PLANET — (press|hold)/.test(state().director.shown?.text ?? ''), state().director.shown?.text ?? '');

// A sticky burst's line, seen from blue (SPACE is refused there).
const stuckTab = GUIDE_RULES.find((rule) => rule.id === 'alarm-ghost-stuck-tab');
check('THE ENGINE IS STUCK FIRING has a [TAB] wording for the MIND, right after the amber one', stuckTab !== undefined
  && stuckTab.text({ vars: {} as DirectorCtx['vars'] }) === GHOST_TEXT.stuckLineTab && stuckTab.keys?.[0] === 'TAB'
  && GUIDE_RULES.indexOf(stuckTab) === GUIDE_RULES.findIndex((rule) => rule.id === 'alarm-ghost-stuck') + 1);

// --- One selector for a usable tool -------------------------------------------------------------------------------
const repairs = toolFilesOf(state().memory, 'repair');
check('setup: ship 1 starts with its Repair files (one usable)', repairs.length >= 1 && hasUsableTool(state().memory, 'repair', 'counts'));
for (const repairFile of repairs) infectNow(h.store, repairFile);
check('an infected Repair still counts for HOLLOW and the hints (`counts`)', hasUsableTool(state().memory, 'repair', 'counts'));
check('…not for the REPAIR renewal (`excluded`, licences.hasWorkingTool)', !hasUsableTool(state().memory, 'repair', 'excluded')
  && !hasWorkingTool(state(), 'repair'));

// --- The two TODOs part 3 dropped ---------------------------------------------------------------------------------
const known = GUIDE_RULES.find((rule) => rule.id === 'tut-hurt-driver-known');
check('the run-2 hurt-driver hint is one showing (done once shown and stepped aside: no doneWhen)', known !== undefined
  && known.once === true && known.doneWhen === undefined);
const ready = GUIDE_RULES.find((rule) => rule.id === 'tut-autoburn-ready');
const flightAt = (id: string): DirectorCtx => ({ flight: { id } } as unknown as DirectorCtx);
check('AUTOBURN\'s READY lesson takes GET READY\'s place (a coast SKIPped to the capture never showed it)',
  ready?.preempts?.(flightAt('F10-ready')) === true && ready.preempts(flightAt('F10-now')) === false);

// --- The phone's next hazard --------------------------------------------------------------------------------------
h.shipAlone(2, 4);  // KESTREL: the debris cloud on the path
for (let i = 0; i < 20; i++) h.step();
const hazard = nextHazard(state(), getPrediction());
check('KESTREL: the phone header names the debris cloud and its countdown (`DEBRIS C? 03:41` style)', /^DEBRIS [A-F]\?? \d\d:\d\d$/.test(hazard), hazard);
h.resetTo('flight', 1);  // ship 1 (shipAlone is for the ships a unit transmits to)
for (let i = 0; i < 5; i++) h.step();
check('ARES-VII: no hazard, no chip', nextHazard(state(), getPrediction()) === '');

finish();
