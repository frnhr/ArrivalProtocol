// WP4 part 2, item 10 and acceptance 3 (re-run): the ship-1 ENGINE I/O FAULT beat on the strip.
// • ENGINE WEAK — press [TAB] cuts into the opening correction (KEEP HOLDING), never into a crash
//   course or a RELEASE; PICK UP REPAIR → CLICK ENGINE I/O lights the chip, then the file;
//   [TAB] BACK — hold [SPACE] once the engine is fixed. Each shows once, none is done by the boot.
// • The follower that obeys the strip LITERALLY (tutorial lines included: it presses the keys the
//   line names, clicks what it highlights, and TABs to the screen a line belongs to) gets the
//   scripted fault, repairs Engine I/O through the tutorial and still reaches ORBIT LOCKED, at two
//   reaction times and holding SPACE through the TAB or not.
// • A kid who ignores the tutorial (never TABs) still locks: the beat never stalls the flight.
import { check, finish, TICK } from '../wp1/harness';
import { followDirector, scriptOf, type Harness2 } from '../wp2/harness2';
import { createHarness4 } from './harness4';
import { getOps } from '@systems/ops-core';
import { pickUpTool, applyTool, type ToolDeps } from '@systems/fs-tools';
import { setPaused } from '@systems/clock';
import { sweetZone } from '@systems/predict';
import { STAR_FUEL_PCT, ENGINE_WEAK_MAX_SHOWN_SEC } from '@data/tuning';

const h = createHarness4(1);
const deps: ToolDeps = { ask: () => { throw new Error('no question expected'); } };
const TUTORIALS = ['tut-engine-weak', 'tut-repair-engine', 'tut-tab-back'];
const done = (): string[] => h.store.getState().director.done;
const shownId = (): string => h.shown()?.id ?? '';
// A new line that is not urgent waits out the strip's hysteresis (OBJECTIVE_HYSTERESIS_SEC) first.
const settle = (): void => { for (let i = 0; i < 8; i++) h.step(); };

// --- The boot completes none of them; the beat lines up ------------------------------------------------
{
  h.resetTo('boot');
  for (let i = 0; i < 400 && h.store.getState().run.phase !== 'flight'; i++) h.step();
  check('the boot ends in the flight with no tutorial done', h.store.getState().run.phase === 'flight'
    && TUTORIALS.every((id) => !done().includes(id)), JSON.stringify(done()));
}

// --- ENGINE WEAK preempts only the correction under way ----------------------------------------------------
{
  // Engine I/O failing from the start (fault disarmed): on the crash course the planet comes first.
  h.resetTo('flight');
  h.noFault();
  h.setIntegrity('engine-io', 38);
  h.keyDown('Space');
  let impactLines = new Set<string>();
  let weakAt: number | null = null;
  while (h.wall() < 30 && weakAt === null) {
    h.step();
    if (h.pred().outcome === 'impact') impactLines.add(shownId());
    else if (shownId() === 'tut-engine-weak') weakAt = h.wall();
  }
  check('on a crash course the strip keeps DON\'T HIT THE PLANET (F4), never ENGINE WEAK', [...impactLines].every((id) => id.startsWith('F4')),
    [...impactLines].join());
  const weak = h.shown();
  check('off the planet, while still holding the correction: ENGINE WEAK — press [TAB] (◇, now, TAB)', weakAt !== null
    && weak?.text === 'ENGINE WEAK — press [TAB] to look inside' && weak.layer === 'mind' && weak.urgency === 'now'
    && weak.keys.join() === 'TAB', JSON.stringify(weak));
  // Keep holding, ignoring it. WP4 fix round 1: after ENGINE_WEAK_MAX_SHOWN_SEC on the strip it
  // steps aside for KEEP HOLDING (it used to hide every flight line for the rest of a 40% flight);
  // when ▼ reaches the sweet zone, RELEASE wins (never an overshoot).
  const sweetLo = sweetZone(h.store.getState().level.ring).lo;
  let weakShownSec = 0;
  let afterWeak = '';
  while (h.rp() < sweetLo && h.wall() < 90) {
    h.step();
    if (shownId() === 'tut-engine-weak') weakShownSec += TICK;
    else if (afterWeak === '' && done().includes('tut-engine-weak')) afterWeak = shownId();
  }
  check(`ignored while holding: ENGINE WEAK steps aside after ${ENGINE_WEAK_MAX_SHOWN_SEC} s, KEEP HOLDING returns`,
    Math.abs(weakShownSec - ENGINE_WEAK_MAX_SHOWN_SEC) <= 2 * TICK && afterWeak === 'F6-keep', `${weakShownSec.toFixed(2)} s, then ${afterWeak}`);
  for (let i = 0; i < 4; i++) h.step();
  check('holding on past it: RELEASE [SPACE] is not preempted', shownId() === 'F6-release', shownId());
  h.keyUp('Space');
  for (let i = 0; i < 30; i++) h.step();
  check('let go on a quiet coast: the flight line (TURN AROUND), ENGINE WEAK never comes back', shownId() === 'F10-turn', shownId());
}

// --- The three steps, each done by doing it ---------------------------------------------------------------
{
  h.resetTo('flight');
  h.keyDown('Space');
  while (!done().includes('engine-io-fault') && h.wall() < 10) h.step();
  for (let i = 0; i < 3; i++) h.step();
  check('the fault strikes mid-correction and the strip says ENGINE WEAK at once', shownId() === 'tut-engine-weak', shownId());

  // Paused: the line is PAUSED, the tutorial waits (look-only pause).
  setPaused(h.store, true);
  h.step();
  check('paused: PAUSED on the strip, the tutorial not done', shownId() === 'paused' && !done().includes('tut-engine-weak'));
  setPaused(h.store, false);

  h.press('Tab');
  h.keyUp('Space');
  settle();
  const pick = h.shown();
  check('TAB: ENGINE WEAK is done, the licence arrived, PICK UP REPAIR → CLICK ENGINE I/O lights the chip',
    done().includes('tut-engine-weak') && h.store.getState().run.licences.includes('repair')
    && pick?.id === 'tut-repair-engine' && pick.highlight === 'chip-repair' && pick.layer === 'mind', JSON.stringify(pick));
  pickUpTool(h.store, 'repair');
  settle();
  check('REPAIR in hand: the highlight moves to the Engine I/O file', h.shown()?.highlight === 'file-engine-io' && shownId() === 'tut-repair-engine',
    JSON.stringify(h.shown()));
  applyTool(h.store, h.file('engine-io'), deps);
  settle();
  check('clicked: the repair runs, the step is done, the strip says the engine is offline', done().includes('tut-repair-engine')
    && shownId() === 'F2-repairing', shownId());
  h.runOps();
  settle();
  const back = h.shown();
  check('repaired: [TAB] BACK — hold [SPACE] (◆ ship, TAB and SPACE)', back?.id === 'tut-tab-back' && back.layer === 'ship'
    && back.keys.join() === 'TAB,SPACE', JSON.stringify(back));
  // WP4 fix round 1: the kid TABs back with REPAIR still in hand (nothing told them to put it
  // down); leaving blue puts it down.
  check('repaired: REPAIR is still in hand before the TAB back', h.store.getState().ui.activeTool?.kind === 'repair');
  h.press('Tab');
  settle();
  check('TAB back: done; the flight line returns (▼ TOO LOW — hold [SPACE])', done().includes('tut-tab-back')
    && h.shown()?.source === 'flight' && h.shown()?.layer === 'ship', JSON.stringify(h.shown()));
  check('TAB back: the tool is put down, Engine I/O selected for INSPECT', h.store.getState().ui.activeTool === null
    && h.store.getState().ui.selectedId === h.file('engine-io').id);

  // Each tutorial shows once: a second weak engine on this run gets no ENGINE WEAK (the toggle and
  // the pip still say it).
  h.setIntegrity('engine-io', 38);
  for (let i = 0; i < 10; i++) h.step();
  check('once: a second weak engine does not bring ENGINE WEAK back', shownId() !== 'tut-engine-weak', shownId());
}

// --- Acceptance 3 re-run: the literal follower, the scripted fault, the repair through the tutorial ---------
type Click = { at: number; run: () => void };

// Obeys the strip as a kid would: reads the newest line after `reactionSec`; presses the keys it
// names; holds SPACE on hold/KEEP HOLDING/NOW and lets go on RELEASE/WAIT/TURN AROUND; presses F on
// a WAIT; TABs when the line is for the other screen; picks up the chip and clicks the file a
// tutorial highlights. `holdThroughTab`: keeps SPACE down while it TABs (the burn resumes on return).
function followLiterally(harness: Harness2, reactionSec: number, holdThroughTab: boolean): { texts: string[]; status: string; fuel: number; wall: number } {
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) harness.keyDown('Space');
    if (!on && holding) harness.keyUp('Space');
    holding = on;
  };
  const clicks: Click[] = [];
  const react = (): void => {
    const line = harness.shown();
    if (!line) return;
    const text = line.text;
    const mode = harness.store.getState().ui.mode;
    const lineScreen = line.layer === 'mind' ? 'memory' : 'tools';
    if (line.id === 'tut-repair-engine') {
      if (!harness.store.getState().ui.activeTool) pickUpTool(harness.store, 'repair');
      clicks.push({ at: harness.wall() + reactionSec, run: () => applyTool(harness.store, h.file('engine-io'), deps) });
      return;
    }
    // A line for the other screen with something to press: the TAB toggle glows, so go there.
    // WP4 fix round 1: it TABs back with the tool still in hand, as a kid does (the game puts it
    // down); the end of the run checks that no tool is left in hand.
    if (lineScreen !== mode && line.keys.length > 0) {
      if (!holdThroughTab) setHolding(false);
      harness.press('Tab');
    }
    const keyMatch = text.match(/press \[([WASD])\]/);
    if (/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(text)) {
      setHolding(false);
      if (keyMatch) harness.press(`Key${keyMatch[1]}`);
      if (/^WAIT/.test(text) && text.includes('[F]')) harness.press('KeyF');
      return;
    }
    if (keyMatch) harness.press(`Key${keyMatch[1]}`);
    if (/hold \[SPACE\]|KEEP HOLDING|NOW/.test(text)) setHolding(true);
  };
  const texts: string[] = [];
  let lastKey = '';
  let reactAt: number | null = null;
  const end = harness.wall() + 400;
  while (harness.status() === 'approaching' && harness.wall() < end) {
    harness.step();
    const line = harness.shown();
    const key = `${line?.id}|${line?.text.replace(/\d+:\d\d/g, 'm:ss')}|${harness.store.getState().ui.mode}`;
    if (key !== lastKey) {
      lastKey = key;
      reactAt = harness.wall() + reactionSec;
      if (line && texts[texts.length - 1] !== line.text) texts.push(line.text);
    }
    if (reactAt !== null && harness.wall() >= reactAt - 1e-9) { reactAt = null; react(); }
    while (clicks.length > 0 && clicks[0]!.at <= harness.wall() + 1e-9) clicks.shift()!.run();
  }
  setHolding(false);
  const burn = harness.store.getState().burn;
  return { texts, status: burn.status, fuel: burn.fuelPct, wall: harness.wall() };
}

for (const [reactionSec, holdThroughTab] of [[0.4, false], [0.4, true], [1.0, false]] as const) {
  h.resetTo('flight');
  const run = followLiterally(h, reactionSec, holdThroughTab);
  const script = scriptOf(run.texts);
  const order = ['ENGINE WEAK — press [TAB] to look inside', 'PICK UP REPAIR → CLICK ENGINE I/O',
    'ENGINE OFFLINE — ENGINE I/O IS REPAIRING…', '[TAB] BACK — hold [SPACE]'];
  const indices = order.map((text) => run.texts.indexOf(text));
  const label = `reaction ${reactionSec} s${holdThroughTab ? ', SPACE held through the TAB' : ''}`;
  if (reactionSec === 0.4 && !holdThroughTab) console.log(`      script:\n      ${script}`);
  check(`(${label}) the strip walks the beat in order: ENGINE WEAK → PICK UP REPAIR → REPAIRING → [TAB] BACK`,
    indices.every((index) => index >= 0) && indices.every((index, i) => i === 0 || index > indices[i - 1]!), JSON.stringify(indices));
  check(`(${label}) Engine I/O healed, and ORBIT LOCKED`, h.file('engine-io').integrity === 100 && run.status === 'locked',
    `status=${run.status} wall=${run.wall.toFixed(1)}s fuel=${run.fuel.toFixed(1)}%`);
  check(`(${label}) …with the ★ FUEL (≥ ${STAR_FUEL_PCT}%)`, run.fuel >= STAR_FUEL_PCT, `${run.fuel.toFixed(1)}%`);
  check(`(${label}) no op left running, no tool in hand`, getOps().length === 0 && h.store.getState().ui.activeTool === null);
}

// --- The kid who ignores the tutorial (never TABs) still locks ------------------------------------------------
{
  h.resetTo('flight');
  const texts = followDirector(h, { reactionSec: 0.4, maxWall: 400 });
  const burn = h.store.getState().burn;
  check('ignoring ENGINE WEAK (never TAB, engine at 40%): still ORBIT LOCKED', burn.status === 'locked' && h.file('engine-io').integrity === 38
    && texts.includes('ENGINE WEAK — press [TAB] to look inside'),
    `status=${burn.status} wall=${h.wall().toFixed(1)}s fuel=${burn.fuelPct.toFixed(1)}%`);
}

finish();
