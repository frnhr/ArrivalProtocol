// WP4 review fixes (round 1), headless. Each block is one finding's fix:
// • F1 and F2 on the MIND screen name the repair (no [TAB]) and light the REPAIR chip, then the
//   file; F1 has repairing / moving variants and asks for nothing when the plot file is missing.
// • Playtest 1 (C-UNROLL): the ENGINE I/O FAULT is arrival damage the SELF-CHECK finds, so the flight's first line is the
//   REPAIR lesson (ENGINE WEAK, then PICK UP REPAIR, then [TAB] BACK) against the IMPACT clock.
// • ENGINE WEAK steps aside after ENGINE_WEAK_MAX_SHOWN_SEC (a kid who lets go and never TABs gets
//   the flight back), never flips with ▼ TOO LOW, and never speaks with ▼ in the red.
// • A late opening burn on the found 38% engine still clears the planet (the fault no longer waits out the crash course: it
//   was there from the start).
// • The REPAIR licence waits out a pause and never comes after the flight ended.
import { check, finish, TICK } from '../wp1/harness';
import { stepUntil } from '../wp1-rules/flows';
import { createHarness4 } from './harness4';
import type { GameState } from '@state/schema';
import { pickUpTool, applyTool, type ToolDeps } from '@systems/fs-tools';
import { setPaused } from '@systems/clock';
import { setMode } from '@systems/mode';
import { getPrediction, secUntil } from '@systems/predict';
import { outlivedOneShots, type GuideRule } from '@systems/director';
import { getByRole } from '@state/selectors';
import { freeSegment } from '@systems/memory-ops';
import { ENGINE_FAULT_ID } from '@data/script';
import { ENGINE_WEAK_MAX_SHOWN_SEC, COUNTDOWN_RED_TAC, OBJECTIVE_HYSTERESIS_SEC } from '@data/tuning';

const h = createHarness4(1);
const deps: ToolDeps = { ask: () => { throw new Error('no question expected'); } };
const done = (): string[] => h.store.getState().director.done;
const shownId = (): string => h.shown()?.id ?? '';
// A new line that is not urgent waits out the strip's hysteresis first.
const settle = (): void => { for (let i = 0; i < 8; i++) h.step(); };

// Off the opening crash course with a healthy engine (the scripted fault disarmed).
function clearThePlanet(): void {
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  stepUntil(h, () => getPrediction().outcome !== 'impact', 15);
  h.keyUp('Space');
  settle();
}

function removeFile(role: Parameters<typeof getByRole>[1]): void {
  h.store.update((d: GameState) => {
    const seg = getByRole(d, role);
    if (!seg) throw new Error(`no ${role}`);
    d.memory[d.memory.indexOf(seg)] = freeSegment(seg.size);
    d.ui.memoryRev++;
  });
}

// --- F1 / F2 on the MIND screen (spec major; correctness and experience minors) ---------------------------
{
  clearThePlanet();
  h.setIntegrity('sensor', 40);
  settle();
  const amber = h.shown();
  check('F1 in amber: PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP (◇, TAB, nothing lit)', amber?.id === 'F1-uncertain'
    && amber.text === 'PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP' && amber.keys.join() === 'TAB' && amber.highlight === null,
    JSON.stringify(amber));
  setMode(h.store, 'memory');
  settle();
  const blue = h.shown();
  check('F1 in blue: PATH UNCERTAIN — REPAIR SENSOR INTERP, no TAB, the REPAIR chip lit', blue?.id === 'F1-uncertain'
    && blue.text === 'PATH UNCERTAIN — REPAIR SENSOR INTERP' && blue.keys.length === 0 && blue.layer === 'mind'
    && blue.highlight === 'chip-repair' && h.store.getState().run.licences.includes('repair'), JSON.stringify(blue));
  pickUpTool(h.store, 'repair');
  settle();
  check('F1 in blue, REPAIR in hand: the Sensor Interp file lit', h.shown()?.highlight === 'file-sensor', JSON.stringify(h.shown()));
  applyTool(h.store, h.file('sensor'), deps);
  settle();
  const repairing = h.shown();
  check('F1 while Sensor Interp repairs: PATH UNCERTAIN — SENSOR INTERP IS REPAIRING… (never asks again)',
    repairing?.id === 'F1-uncertain-repairing' && repairing.text === 'PATH UNCERTAIN — SENSOR INTERP IS REPAIRING…'
    && repairing.keys.length === 0 && repairing.highlight === null, JSON.stringify(repairing));
  h.runOps();
  settle();
  check('repaired: the path line is back', !shownId().startsWith('F1') && h.caps().plot.mode === 'exact', shownId());

  // The ship-1 case the reviewers hit: Sensor Interp at 78% (≈) repaired goes grey for the repair.
  clearThePlanet();
  setMode(h.store, 'memory');
  settle();
  pickUpTool(h.store, 'repair');
  applyTool(h.store, h.file('sensor'), deps);
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) { h.step(); seen.add(h.shown()?.text ?? ''); }
  check('a 78% Sensor Interp under repair never asks for its own repair', ![...seen].some((text) => /REPAIR SENSOR INTERP/.test(text)),
    [...seen].join(' | '));

  clearThePlanet();
  h.setIntegrity('navplot', 10);
  setMode(h.store, 'memory');
  settle();
  const navplot = h.shown();
  check('F1 no-signal in blue: NO SIGNAL — REPAIR NAV PLOTTER, chip lit', navplot?.id === 'F1-nosignal'
    && navplot.text === 'NO SIGNAL — REPAIR NAV PLOTTER' && navplot.keys.length === 0 && navplot.highlight === 'chip-repair',
    JSON.stringify(navplot));
  pickUpTool(h.store, 'repair');
  applyTool(h.store, h.file('navplot'), deps);
  settle();
  check('F1 while the Nav Plotter repairs: NO SIGNAL — NAV PLOTTER IS REPAIRING…', h.shown()?.text === 'NO SIGNAL — NAV PLOTTER IS REPAIRING…',
    h.shown()?.text);

  // A missing plot file has nothing to repair: the strip keeps flying the path.
  for (const role of ['sensor', 'navplot'] as const) {
    clearThePlanet();
    removeFile(role);
    settle();
    const line = h.shown();
    check(`a missing ${role} file: no F1 (nothing to repair), the flight line shows`, h.caps().plot.mode !== 'exact'
      && line?.source === 'flight' && !line.id.startsWith('F1') && !/REPAIR/.test(line.text), JSON.stringify(line));
  }

  // F2 with a dead engine: the same split.
  clearThePlanet();
  h.setIntegrity('engine-io', 10);
  settle();
  const deadAmber = h.shown();
  check('F2 dead in amber: ENGINE NOT RESPONDING — [TAB], fix ENGINE I/O', deadAmber?.id === 'F2-dead'
    && deadAmber.text === 'ENGINE NOT RESPONDING — [TAB], fix ENGINE I/O' && deadAmber.keys.join() === 'TAB', JSON.stringify(deadAmber));
  setMode(h.store, 'memory');
  settle();
  const deadBlue = h.shown();
  check('F2 dead in blue: ENGINE NOT RESPONDING — REPAIR ENGINE I/O, no TAB, chip then file', deadBlue?.id === 'F2-dead'
    && deadBlue.text === 'ENGINE NOT RESPONDING — REPAIR ENGINE I/O' && deadBlue.keys.length === 0
    && deadBlue.highlight === 'chip-repair', JSON.stringify(deadBlue));
  pickUpTool(h.store, 'repair');
  settle();
  check('F2 dead in blue, REPAIR in hand: the Engine I/O file lit', h.shown()?.highlight === 'file-engine-io', JSON.stringify(h.shown()));
}

// --- The fault found at the start: the run's first lines are the REPAIR lesson (playtest 1, C-UNROLL) ---------------
{
  h.resetTo('flight');
  settle();
  check('the flight starts with Engine I/O at 38 (found) on the crash course, and the strip\'s first line is ENGINE WEAK — press [TAB]',
    h.file('engine-io').integrity === 38 && done().includes(ENGINE_FAULT_ID) && getPrediction().outcome === 'impact'
    && shownId() === 'tut-engine-weak' && h.shown()?.text === 'ENGINE WEAK — press [TAB] to look inside', `${shownId()}: ${h.shown()?.text}`);
  h.press('Tab');
  settle();
  check('…in blue: PICK UP REPAIR → CLICK ENGINE I/O with the chip lit', shownId() === 'tut-repair-engine' && h.shown()?.highlight === 'chip-repair',
    JSON.stringify(h.shown()));
  pickUpTool(h.store, 'repair');
  applyTool(h.store, h.file('engine-io'), deps);
  h.runOps();
  settle();
  check('…and [TAB] BACK — hold [SPACE] after the repair', shownId() === 'tut-tab-back' && h.file('engine-io').integrity === 100, shownId());
  h.press('Tab');
  h.keyDown('Space');
  stepUntil(h, () => getPrediction().outcome !== 'impact', 15);
  h.keyUp('Space');
  check('…the repaired engine clears the planet', getPrediction().outcome !== 'impact' && h.status() === 'approaching', h.status());
}

// --- ENGINE WEAK never stalls the flight (experience major) -----------------------------------------------
// The hesitant kid: lets go of SPACE on any line that does not ask for it (ENGINE WEAK does not),
// presses the keys a line names, SKIPs a WAIT, and never TABs.
{
  h.resetTo('flight');
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) h.keyDown('Space');
    if (!on && holding) h.keyUp('Space');
    holding = on;
  };
  let weakSec = 0;
  let weakEntries = 0;
  let lastId = '';
  let skipWaitAfterFault = false;
  let reactAt: number | null = null;
  while (h.status() === 'approaching' && h.wall() < 400) {
    h.step();
    const line = h.shown();
    const id = line?.id ?? '';
    if (id === 'tut-engine-weak') { weakSec += TICK; if (lastId !== id) weakEntries++; }
    if (done().includes(ENGINE_FAULT_ID) && /^WAIT .*hold \[F\]/.test(line?.text ?? '')) skipWaitAfterFault = true;
    if (id !== lastId) { lastId = id; reactAt = h.wall() + 0.4; }
    if (reactAt !== null && h.wall() >= reactAt - 1e-9 && line) {
      reactAt = null;
      const press = line.text.match(/press \[([WASD])\]/);
      if (press) h.press(`Key${press[1]}`);
      if (/^WAIT/.test(line.text) && line.text.includes('[F]')) h.press('KeyF');
      setHolding(/hold \[SPACE\]|KEEP HOLDING|NOW/.test(line.text) && !/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(line.text));
    }
  }
  setHolding(false);
  const status = h.status();
  check(`hesitant kid: ENGINE WEAK on the strip at most ${ENGINE_WEAK_MAX_SHOWN_SEC} s (it was 178 s)`,
    weakSec > 0 && weakSec <= ENGINE_WEAK_MAX_SHOWN_SEC + OBJECTIVE_HYSTERESIS_SEC + TICK, `${weakSec.toFixed(2)} s`);
  check('hesitant kid: ENGINE WEAK comes up once, never flipping with ▼ TOO LOW', weakEntries === 1, String(weakEntries));
  check('hesitant kid: the coast shows WAIT … hold [F] again', skipWaitAfterFault);
  check('hesitant kid: still STABLE ORBIT with the engine at 40%', status === 'locked' && h.file('engine-io').integrity === 38,
    `${status} at ${h.wall().toFixed(1)} s`);
}

// --- ENGINE WEAK never speaks with ▼ in the red ---------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  stepUntil(h, () => /^RELEASE/.test(h.shown()?.text ?? ''), 30);
  h.keyUp('Space');
  stepUntil(h, () => /TURN AROUND/.test(h.shown()?.text ?? ''), 5);
  h.press('KeyS');
  stepUntil(h, () => /^WAIT/.test(h.shown()?.text ?? ''), 10);
  h.press('KeyF');
  const periTac = (): number => {
    const pred = getPrediction();
    return pred.periInSec === null ? Infinity : secUntil(pred, pred.periInSec, h.store.getState().clock.tSec) / h.store.getState().level.tacticalWarp;
  };
  stepUntil(h, () => periTac() < COUNTDOWN_RED_TAC, 200);
  h.setIntegrity('engine-io', 38);
  const lines = new Set<string>();
  for (let i = 0; i < 40; i++) { h.step(); lines.add(shownId()); }
  check('▼ in the red when the engine weakens: no ENGINE WEAK, the capture line stays', periTac() < COUNTDOWN_RED_TAC
    && !lines.has('tut-engine-weak'), [...lines].join());
}

// --- The pure retirement helper ---------------------------------------------------------------------------------
{
  const rule: GuideRule = {
    id: 'tut-test', layer: 'mind', priority: 'tutorial', once: true, maxShownSec: 1, activeWhen: () => true, text: () => 'TEST',
  };
  const shown = new Map<string, number>();
  const early = outlivedOneShots([rule], 'tut-test', 0.6, shown);
  const late = outlivedOneShots([rule], 'tut-test', 0.6, shown);
  const other = outlivedOneShots([rule], 'F7-hold', 5, shown);
  check('outlivedOneShots: done once its time on the strip reaches maxShownSec, not while off it', early.length === 0
    && late.join() === 'tut-test' && other.length === 0);
}

// --- A late opening burn on the found engine still clears (correctness minor) ------------------------------------------
// Since C-UNROLL the fault no longer waits out the crash course: the engine is at 38% from the start. ARES-VII falls for
// 163 s; a burn at 38% that starts by about 140 s still clears it (a healthy engine: by about 151 s).
{
  for (const startWall of [120, 140]) {
    h.resetTo('flight');
    while (h.wall() < startWall && h.status() === 'approaching') h.step();
    h.press('KeyD');
    h.keyDown('Space');
    while (h.status() === 'approaching' && getPrediction().outcome === 'impact' && h.wall() < startWall + 30) h.step();
    for (let i = 0; i < 20; i++) h.step();
    h.keyUp('Space');
    check(`a late opening burn (from ${startWall} s) at 38%: clears the planet`, h.status() === 'approaching'
      && done().includes(ENGINE_FAULT_ID) && getPrediction().outcome !== 'impact' && h.file('engine-io').integrity === 38, h.status());
  }
}

// --- The licence: not while paused, not after the flight (correctness and spec minors) -------------------------
{
  h.resetTo('flight');
  setPaused(h.store, true);
  setMode(h.store, 'memory');
  for (let i = 0; i < 10; i++) h.step();
  check('paused, TAB into blue: no licence yet (pause is look-only)', !h.store.getState().run.licences.includes('repair')
    && !h.events.some((event) => event.name === 'licence'));
  setPaused(h.store, false);
  h.step();
  check('…unpaused, still in blue: REPAIR on the first tick', h.store.getState().run.licences.includes('repair'));

  h.resetTo('flight');
  stepUntil(h, () => h.status() !== 'approaching', 400);
  const status = h.status();
  setMode(h.store, 'memory');
  for (let i = 0; i < 10; i++) h.step();
  check('after a crash, TAB into blue: no licence, no approval line', status === 'crashed'
    && !h.store.getState().run.licences.includes('repair') && !h.log().some((entry) => entry.text.includes('licence')), status);
}

finish();
