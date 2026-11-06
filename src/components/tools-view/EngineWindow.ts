// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2). Others ask by message.
import type { Store } from '@state/store';
import type { GameState, PresetMode, SasMode } from '@state/schema';
import { onGameTick, onAiTick } from '@systems/clock';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import {
  holdThrottle, holdRotation, selectPreset, selectManual, setPower, acceptOrbit, registerFlightKeys,
} from '@systems/flight-controls';
import {
  burnButton, presetHint, fuelModel, acceptModel, acceptLabel, thrustLimitModel, reactorModel, windowPip, percentFloor,
  autoButton, autoburnPip, PRESET_KEY, PRESET_NAME, PRESET_TIP, type BurnLook,
} from '@systems/flight-hud';
import { pressAutoburn } from '@systems/autoburn';
import { setMode } from '@systems/mode';
import { capabilitiesNow, presetsAvailable } from '@systems/capabilities';
import { landingBurnOffer } from '@systems/landing-orbit';
import { onOpsChange } from '@systems/ops-core';
import { renderKeyCaps } from '@components/hud/keycaps';
import { askBeamOut } from '@components/hud/BeamOutAsk';
import { beamOutView } from '@systems/beam-out';
import { cancelBeamOut } from '@systems/run';
import { arrivalFuelTrimPct } from '@systems/skills';
import { BEAM_OUT_TEXT, FUEL_TRIM_TAG } from '@data/script';
import { requireById } from '@components/dom';
import { ACCEPT_CONFIRM_SEC, STAR_FUEL_PCT, POWER_MIN_PCT } from '@data/tuning';

// Engine window (§7.1), top to bottom:
// • the big BURN button: hold it (or SPACE) to fire along the selected preset;
// • AUTO (WP9): once the unit carries the trained AUTOBURN.skl, [B] or a click hands the capture to it; the
//   button says what it is doing (ARMED with its countdown, BRAKING) or why [B] would be refused now;
// • the presets W PRO / S RETRO / A IN / D OUT (select-only) and one line saying what the
//   selected one does to the path;
// • FUEL with the NEEDED tick (what the next planned burn costs), the ★ notch, and the hatched
//   THRUST LIMIT the files hold back (Engine I/O, the Reactor's busy threads: C1, C4); `TRIM +15%` beside
//   FUEL when a carried FUEL TRIM widened this ship's tank at the arrival (WP8: why 100% goes further);
// • the REACTOR row: its power in cells, a busy Core thread THINKing in one, the rest BURNing;
// • ACCEPT ORBIT, only when it is on offer, confirmed by a second click;
// • BEAM OUT, only on a doomed ship (not run 1's first), with the inline confirm; then the TRANSMITTING
//   bar racing the impact, with CANCEL (WP7);
// • the MANUAL fold: heading and spin, Q/E thrusters, the MANUAL button and POWER. A failing
//   Autopilot file kills the presets (C3): they grey out, say why, and the fold opens by itself.
// Every input goes through systems/flight-controls; the words come from systems/flight-hud.

const RAD2DEG = 180 / Math.PI;
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

const SAS_LABEL: Record<SasMode, string> = { ...PRESET_NAME, off: 'MANUAL' };

export function mountEngineWindow(store: Store<GameState>): () => void {
  const burnBtn = requireById<HTMLButtonElement>('burnBtn');
  const sasVal = requireById('sasVal');
  const hintEl = requireById('presetHint');
  const fuelVal = requireById('fuelVal');
  const fuelFill = requireById('fuelFill');
  const fuelStar = requireById('fuelStar');
  const fuelNeed = requireById('fuelNeed');
  const fuelNeedLabel = requireById('fuelNeedLabel');
  const fuelStarLabel = requireById('fuelStarLabel');
  const fuelTrim = requireById('fuelTrim');
  const acceptBtn = requireById<HTMLButtonElement>('acceptBtn');
  const manualToggle = requireById<HTMLButtonElement>('manualToggle');
  const manualFold = requireById('manualFold');
  const headingVal = requireById('headingVal');
  const spinVal = requireById('spinVal');
  const rotCCW = requireById<HTMLButtonElement>('rotCCW');
  const rotCW = requireById<HTMLButtonElement>('rotCW');
  const rotStop = requireById<HTMLButtonElement>('rotStop');
  const power = requireById<HTMLInputElement>('thrust');
  const powerVal = requireById('thrustVal');
  const fuelLimit = requireById('fuelLimit');
  const fuelLimitLabel = requireById('fuelLimitLabel');
  const reactorPip = requireById('reactorPip');
  const reactorVal = requireById('reactorVal');
  const reactorCells = requireById('reactorCells');
  const beamBtn = requireById<HTMLButtonElement>('beamBtn');
  const beamBar = requireById('beamBar');
  const beamFill = requireById('beamFill');
  const beamLabel = requireById('beamLabel');
  const beamCancel = requireById<HTMLButtonElement>('beamCancel');
  const autoBtn = requireById<HTMLButtonElement>('autoBtn');
  const autoHead = requireById('autoHead');
  const autoNote = requireById('autoNote');

  const teardown: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, handler: (event: Event) => void): void => {
    target.addEventListener(type, handler);
    teardown.push(() => target.removeEventListener(type, handler));
  };

  // --- BURN (hold) ---
  // The button is its own hold next to SPACE (flight-controls holdThrottle): letting go of
  // one, or the cursor merely leaving the button, never cuts a burn the other still holds.
  // Dragging off the button, or the window losing focus, ends the button's own hold.
  listen(burnBtn, 'pointerdown', () => { holdThrottle(store, 'pointer', true); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    listen(burnBtn, type, () => { holdThrottle(store, 'pointer', false); });
  }
  listen(window, 'blur', () => {
    holdThrottle(store, 'pointer', false);
    holdRotation(store, 'pointer', 0);
  });
  let lastBurnText = '';
  let lastBurnLook: BurnLook | '' = '';
  function paintBurn(): void {
    const model = burnButton(store.getState());
    if (model.text !== lastBurnText) { renderKeyCaps(burnBtn, model.text, { own: 'SPACE' }); lastBurnText = model.text; }
    if (model.look !== lastBurnLook) { burnBtn.dataset.look = model.look; lastBurnLook = model.look; }
    if (burnBtn.disabled !== model.disabled) burnBtn.disabled = model.disabled;
  }

  // --- AUTO (WP9): the same toggle as [B] (systems/autoburn.ts); a refusal buzzes with its reason ---
  listen(autoBtn, 'click', () => { pressAutoburn(store); paintAuto(); });
  let lastAuto = '';
  function paintAuto(): void {
    const model = autoButton(store.getState(), getPrediction());
    const key = `${model.shown}|${model.head}|${model.note}|${model.look}|${model.title}`;
    if (key === lastAuto) return;
    lastAuto = key;
    autoBtn.hidden = !model.shown;
    if (!model.shown) return;
    renderKeyCaps(autoHead, model.head, { own: 'B' });
    renderKeyCaps(autoNote, model.note, { own: 'B' });
    autoBtn.dataset.look = model.look;
    autoBtn.title = model.title;
  }

  // --- the AUTOBURN pip (slice 4, 03 §4): beside the window's file pips (WindowGrip builds that row), the skill's band,
  // its version and what it works as (`AUTOBURN v2▸v1`); a click jumps to the file in the MIND, as every pip does. Built
  // here, not by WindowGrip: a skill is no CapabilityRole. Attached on the first paint that finds the row.
  const autoPip = document.createElement('button');
  autoPip.className = 'pip';
  autoPip.tabIndex = -1;
  autoPip.dataset.skill = 'autoburn';
  const autoPipGlyph = document.createElement('span');
  autoPipGlyph.className = 'pip-glyph';
  const autoPipLabel = document.createElement('span');
  autoPipLabel.className = 'pip-label';
  const autoPipReading = document.createElement('span');
  autoPipReading.className = 'pip-reading';
  autoPip.append(autoPipGlyph, autoPipLabel, autoPipReading);
  autoPip.hidden = true;
  listen(autoPip, 'click', () => {
    const model = autoburnPip(store.getState());
    setMode(store, 'memory');
    if (model?.segId) { const segId = model.segId; store.update((draft) => { draft.ui.selectedId = segId; }); }
  });
  let lastAutoPip = '';
  function paintAutoPip(): void {
    if (!autoPip.isConnected) document.querySelector('.engine-win .window-pips')?.appendChild(autoPip);
    const model = autoburnPip(store.getState());
    const key = model === null ? '' : `${model.look}|${model.label}|${model.reading}|${model.title}`;
    if (key === lastAutoPip) return;
    lastAutoPip = key;
    autoPip.hidden = model === null;
    if (model === null) return;
    autoPip.dataset.look = model.look;
    autoPipGlyph.textContent = model.glyph;
    autoPipLabel.textContent = model.label;
    autoPipReading.textContent = model.reading;
    autoPipReading.hidden = model.reading === '';
    autoPip.title = model.title;
  }

  // --- presets ---
  const presetEls = Array.from(document.querySelectorAll<HTMLButtonElement>('.engine-win .preset-btn[data-preset]'))
    .map((button) => {
      const mode = button.dataset.preset as PresetMode;
      if (!(mode in PRESET_KEY)) throw new Error(`preset button #${button.id} has an unknown data-preset '${mode}'`);
      // Key cap + kid word; the one-line tip doubles as the tooltip.
      // On a phone the cap goes (keycaps.ts own): the button is its word.
      renderKeyCaps(button, `[${PRESET_KEY[mode]}] ${PRESET_NAME[mode]}`, { own: PRESET_KEY[mode] });
      button.title = `${PRESET_KEY[mode]} · ${PRESET_TIP[mode]}`;
      button.dataset.hintKey = PRESET_KEY[mode];
      listen(button, 'click', () => { selectPreset(store, mode); });
      return { mode, button };
    });
  if (presetEls.length !== 4) throw new Error(`expected 4 preset buttons in .engine-win, found ${presetEls.length}`);

  let lastHint = '';
  // null until the first paint, so a game that starts with a dead Autopilot also opens the fold.
  let presetsWere: boolean | null = null;
  function paintPresets(): void {
    const { sasMode, presetAligning } = store.getState().burn;
    const available = presetsAvailable(capabilitiesNow(store.getState()));
    for (const preset of presetEls) {
      const active = preset.mode === sasMode;
      preset.button.classList.toggle('active', active);
      preset.button.classList.toggle('aligning', active && presetAligning);
      preset.button.disabled = !available;
    }
    sasVal.textContent = presetAligning ? `${SAS_LABEL[sasMode]} · ALIGNING…` : SAS_LABEL[sasMode];
    const hint = presetHint(store.getState());
    if (hint !== lastHint) { renderKeyCaps(hintEl, hint); lastHint = hint; }
    hintEl.classList.toggle('dead', !available);
    // The presets just died: the hand controls are the way to turn now, so they open themselves.
    // Coming back, the fold stays as the kid left it.
    if (presetsWere !== false && !available) setFoldOpen(true);
    presetsWere = available;
    const manual = sasMode === 'off';
    rotCCW.disabled = !manual;
    rotCW.disabled = !manual;
    rotStop.classList.toggle('active', manual);
  }

  // --- THRUST LIMIT (on FUEL) and the REACTOR row ---
  let lastLimit = '';
  function paintLimit(): void {
    const model = thrustLimitModel(store.getState());
    const key = model.limited ? String(model.capPct) : '';
    if (key === lastLimit) return;
    lastLimit = key;
    fuelLimit.hidden = !model.limited;
    fuelLimitLabel.hidden = !model.limited;
    if (model.limited) {
      fuelLimit.style.width = `${100 - model.capPct}%`;
      fuelLimitLabel.textContent = `THRUST LIMIT ${model.capPct}%`;
      fuelLimit.title = model.text;
    }
  }

  let lastReactor = '';
  function paintReactor(): void {
    const state = store.getState();
    const model = reactorModel(state);
    const pip = windowPip(state, 'reactor');
    const key = `${model.cells.join()}|${model.text}|${pip.look}`;
    if (key === lastReactor) return;
    lastReactor = key;
    reactorVal.textContent = model.text;
    reactorPip.textContent = pip.glyph;
    reactorPip.dataset.look = pip.look;
    reactorPip.title = pip.title;
    // The grid gets one column per cell: the count derives from REACTOR_THREAD_SHARE in tuning.
    reactorCells.style.setProperty('--cells', String(model.cells.length));
    while (reactorCells.children.length < model.cells.length) reactorCells.appendChild(document.createElement('span'));
    model.cells.forEach((cell, i) => {
      const element = reactorCells.children[i] as HTMLElement;
      element.className = `reactor-cell ${cell}`;
      element.textContent = cell === 'think' ? 'THINK' : 'BURN';
    });
  }

  // --- FUEL ---
  fuelStar.style.left = `${STAR_FUEL_PCT}%`;
  fuelStar.title = `★ Lock the orbit with at least ${STAR_FUEL_PCT}% FUEL left`;
  fuelStarLabel.textContent = `★ ${STAR_FUEL_PCT}%`;
  let lastFuel = '';
  function paintFuel(): void {
    // The sensed prediction, as the strip reads it (§6.2: every player-facing number), so `short` is the strip's own
    // verdict even while a failing Sensor Interp holds the plot stale (LEAD-2 review round 2).
    // While landing the NEEDED tick prices the burn the landing offers (slice 1b), none while nothing is offered.
    const state = store.getState();
    const pred = getSensedPrediction();
    const model = fuelModel(state, pred, state.run.phase === 'landing' ? landingBurnOffer(state, pred) : null);
    const key = `${model.pct.toFixed(1)}|${model.neededPct?.toFixed(1)}|${model.short}`;
    if (key === lastFuel) return;
    lastFuel = key;
    fuelVal.textContent = model.text;
    fuelFill.style.width = `${model.pct}%`;
    fuelFill.classList.toggle('low', model.pct < STAR_FUEL_PCT);
    fuelNeed.hidden = model.neededPct === null;
    if (model.neededPct !== null) {
      fuelNeed.style.left = `${Math.min(100, model.neededPct)}%`;
      fuelNeed.classList.toggle('short', model.short);
    }
    fuelNeedLabel.textContent = model.needText;
    fuelNeedLabel.classList.toggle('short', model.short);
  }

  // FUEL TRIM's share of this ship's tank is fixed at the arrival (createFlight): painted once per ship.
  function paintTrim(): void {
    const pct = arrivalFuelTrimPct(store.getState());
    fuelTrim.hidden = pct <= 0;
    fuelTrim.textContent = pct > 0 ? FUEL_TRIM_TAG(pct) : '';
  }

  // --- ACCEPT ORBIT (offered only on a closed, not-green loop; a second click confirms) ---
  // The confirm window runs on AI time: it is a UI ritual, and a paused game must not let it
  // silently expire.
  let armedAiSec: number | null = null;
  let lastAccept = '';
  function paintAccept(): void {
    const state = store.getState();
    const model = acceptModel(state, getPrediction());
    // Pause is look-only: a half-made confirm is dropped and the button rests.
    if (!model.offered || state.clock.paused) armedAiSec = null;
    const text = model.offered ? acceptLabel(model, armedAiSec !== null) : '';
    const key = `${model.offered}|${text}|${state.clock.paused}|${model.strands}`;
    if (key === lastAccept) return;
    lastAccept = key;
    acceptBtn.hidden = !model.offered;
    acceptBtn.disabled = state.clock.paused;
    acceptBtn.textContent = text;
    acceptBtn.classList.toggle('armed', armedAiSec !== null);
    // Accepting a loop below the strand floor loses the ship: say so in the danger tone.
    acceptBtn.classList.toggle('strands', model.strands);
  }
  listen(acceptBtn, 'click', () => {
    if (armedAiSec === null) {
      armedAiSec = 0;
      paintAccept();
      return;
    }
    armedAiSec = null;
    acceptOrbit(store);
    paintAccept();
  });
  const offAi = onAiTick((dtAi) => {
    if (armedAiSec === null) return;
    armedAiSec += dtAi;
    if (armedAiSec >= ACCEPT_CONFIRM_SEC) {
      armedAiSec = null;
      paintAccept();
    }
  });

  // --- BEAM OUT (WP7, §4.3): offered on a doomed ship, asked with the inline confirm; then its
  // TRANSMITTING bar races the impact, with CANCEL until it is full. The button glows while no burn can
  // save the ship (the strip then says to press it, and why).
  beamBtn.textContent = BEAM_OUT_TEXT.button;
  beamCancel.textContent = BEAM_OUT_TEXT.cancel;
  let lastBeam = '';
  function paintBeam(): void {
    const view = beamOutView(store.getState(), getPrediction());
    const pct = view.look === 'beaming' ? percentFloor(view.progress) : null;
    const hopeless = view.look !== 'beaming' && view.hopeless !== null;
    const key = `${view.look}|${pct}|${hopeless}`;
    if (key === lastBeam) return;
    lastBeam = key;
    beamBtn.hidden = view.look !== 'offered' && view.look !== 'offered-paused';
    beamBtn.disabled = view.look === 'offered-paused';
    beamBtn.classList.toggle('hopeless', hopeless);
    beamBar.hidden = view.look !== 'beaming';
    if (pct !== null) {
      beamFill.style.width = `${pct}%`;
      beamLabel.textContent = BEAM_OUT_TEXT.bar(pct);
    }
  }
  listen(beamBtn, 'click', () => askBeamOut(store));
  listen(beamCancel, 'click', () => { cancelBeamOut(store); });

  // --- MANUAL fold ---
  function setFoldOpen(open: boolean): void {
    manualFold.hidden = !open;
    manualToggle.setAttribute('aria-expanded', String(open));
    manualToggle.textContent = `${open ? '▾' : '▸'} manual controls`;
    if (open) paintAttitude();
  }
  listen(manualToggle, 'click', () => setFoldOpen(manualFold.hidden));
  // The ↺/↻ buttons are one pointer hold; releasing it anywhere ends only that hold, never
  // a Q/E turn on the keyboard.
  listen(rotCCW, 'pointerdown', () => { holdRotation(store, 'pointer', 1); });
  listen(rotCW, 'pointerdown', () => { holdRotation(store, 'pointer', -1); });
  listen(document, 'pointerup', () => { holdRotation(store, 'pointer', 0); });
  listen(document, 'pointercancel', () => { holdRotation(store, 'pointer', 0); });
  listen(rotStop, 'click', () => { selectManual(store); paintAttitude(); });

  function paintPower(pct: number): void {
    powerVal.textContent = `${pct}%`;
    power.value = String(pct);
    power.style.setProperty('--p', `${pct}%`);
  }
  power.min = String(POWER_MIN_PCT);
  listen(power, 'input', () => setPower(store, Number(power.value)));

  // Heading relative to PRO or RETRO (whichever is nearer) and the spin, for MANUAL flying.
  function paintAttitude(): void {
    if (manualFold.hidden) return;
    const state = store.getState();
    const prograde = Math.atan2(state.orbit.vy, state.orbit.vx);
    const offPro = wrap(state.burn.heading - prograde);
    const offRetro = wrap(state.burn.heading - prograde - Math.PI);
    const usePro = Math.abs(offPro) <= Math.abs(offRetro);
    const degrees = Math.round((usePro ? offPro : offRetro) * RAD2DEG);
    headingVal.textContent = `${usePro ? 'PRO' : 'RETRO'} ${degrees >= 0 ? '+' : ''}${degrees}°`;
    const degPerSec = state.burn.omega * RAD2DEG;
    spinVal.textContent = Math.abs(degPerSec) < 0.05 ? '0°/s' : `${degPerSec > 0 ? '+' : ''}${degPerSec.toFixed(1)}°/s`;
  }

  // --- painting ---
  function paintLive(): void {
    paintBurn();
    paintAuto();
    paintAutoPip();
    paintFuel();
    paintLimit();
    paintReactor();
    paintAccept();
    paintBeam();
    paintAttitude();
    // The Autopilot's health changes without a burn update (a repair, a bite, a debug poke).
    if (presetsAvailable(capabilitiesNow(store.getState())) !== presetsWere) paintPresets();
  }
  const unsubControls = store.subscribe(
    (s) => `${s.burn.sasMode}|${s.burn.presetAligning}|${s.burn.firing}|${s.burn.status}|${s.clock.paused}`,
    () => { paintPresets(); paintLive(); },
  );
  const unsubPower = store.subscribe((s) => s.burn.thrustPct, paintPower);
  const offTick = onGameTick(() => paintLive());
  // Threads are taken and given back on AI time, also while the world is paused (no game ticks):
  // the cells and the hatch follow an op starting or ending at once.
  const offOps = onOpsChange((change) => { if (change.type !== 'progress') paintLive(); });
  const unsubMemory = store.subscribe((s) => s.ui.memoryRev, () => paintLive());
  // BEAM OUT starting, cancelling or ending (and a reset) is an update; its bar is mutated per game tick.
  const unsubBeam = store.subscribe((s) => `${s.run.beamOut === null}|${s.run.phase}|${s.run.rev}`, () => paintBeam());
  const unsubTrim = store.subscribe((s) => s.run.rev, paintTrim);

  // POWER always starts at 100 (the state's value), whatever the browser restored in the form.
  paintPower(store.getState().burn.thrustPct);
  // Closed at the start, unless the Autopilot is already dead (paintPresets opens it then).
  setFoldOpen(false);
  paintPresets();
  paintLive();
  paintTrim();

  const offKeys = registerFlightKeys(store);

  return () => {
    teardown.forEach((undo) => undo());
    unsubControls();
    unsubPower();
    offTick();
    offOps();
    unsubMemory();
    unsubBeam();
    unsubTrim();
    offAi();
    offKeys();
  };
}
