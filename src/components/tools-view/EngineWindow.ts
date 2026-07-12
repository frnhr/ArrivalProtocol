import type { Store } from '@state/store';
import type { GameState, SasMode } from '@state/schema';
import { selectEngineEffectiveness } from '@state/selectors';
import { onGameTick } from '@systems/clock';
import { evaluateInsertion } from '@systems/orbit-sim';

// Engine window. A single main-thrust slider fires along the ship's HEADING. Attitude is
// flown either manually (momentum-carrying rotation thrusters: rotate CCW / CW held, plus a
// stop button that nulls the spin) or with the SAS-style autopilot helpers (hold current /
// prograde / retrograde / radial in / out) — engaging a helper locks out manual rotation.
// Heading is read out relative to prograde (and drawn as an arrow on the NAV PLOT); the spin
// rate and active autopilot mode are shown live. thrustPct / rotInput / sasMode are player
// inputs (store.update); heading / omega are sim-owned, painted live each game tick.
const RAD2DEG = 180 / Math.PI;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function mountEngineWindow(store: Store<GameState>): () => void {
  const thrust = document.getElementById('thrust') as HTMLInputElement | null;
  const thrustVal = document.getElementById('thrustVal');
  const headingVal = document.getElementById('headingVal');
  const spinVal = document.getElementById('spinVal');
  const rotCCW = document.getElementById('rotCCW') as HTMLButtonElement | null;
  const rotCW = document.getElementById('rotCW') as HTMLButtonElement | null;
  const rotStop = document.getElementById('rotStop');
  if (!thrust) return () => {};

  // --- main thrust slider (magnitude along the heading) ---
  function paintThrust(pct: number): void {
    if (thrustVal) thrustVal.textContent = `${pct}%`;
    thrust!.style.setProperty('--p', `${pct}%`);
  }
  const onThrust = (): void => {
    const pct = Number(thrust.value);
    paintThrust(pct);
    store.update((d) => { d.burn.thrustPct = pct; });
  };
  thrust.addEventListener('input', onThrust);
  const unsubThrust = store.subscribe((s) => s.burn.thrustPct, (pct) => { thrust.value = String(pct); paintThrust(pct); });
  paintThrust(store.getState().burn.thrustPct);

  // --- delivered-thrust readout: what the damaged drivetrain actually gives ---
  // memoryRev alone is the repaint trigger: EVERY mutation the effectiveness
  // selector reads (integrity, segment state, swaps, op start/end — including
  // repairs completing under time-warp) is followed by a memoryRev bump, so a
  // per-tick repaint would only recompute an unchanged value 20×/sec.
  const engEffVal = document.getElementById('engEffVal');
  function paintEngEff(): void {
    if (!engEffVal) return;
    const eff = selectEngineEffectiveness(store.getState());
    engEffVal.textContent = `${Math.round(eff * 100)}%`;
    engEffVal.classList.toggle('warn', eff < 0.6);
    engEffVal.classList.toggle('good', eff >= 0.95);
  }
  const unsubEngEff = store.subscribe((s) => s.ui.memoryRev, paintEngEff);
  paintEngEff();

  // --- rotation thrusters: hold to apply torque; momentum persists; stop nulls it ---
  const setRot = (input: -1 | 0 | 1): void => store.update((d) => { d.burn.rotInput = input; });
  const onCCWDown = (): void => setRot(1);
  const onCWDown = (): void => setRot(-1);
  const onPointerUp = (): void => { if (store.getState().burn.rotInput !== 0) setRot(0); };
  rotCCW?.addEventListener('pointerdown', onCCWDown);
  rotCW?.addEventListener('pointerdown', onCWDown);
  document.addEventListener('pointerup', onPointerUp);

  // Stop = drop to manual and halt the spin (a panic reset, even with an autopilot engaged).
  const onStop = (): void => { store.update((d) => { d.burn.omega = 0; d.burn.rotInput = 0; d.burn.sasMode = 'off'; }); paintAttitude(); };
  rotStop?.addEventListener('click', onStop);

  // --- attitude autopilot (SAS-style helpers); availability gated per level ---
  const sasVal = document.getElementById('sasVal');
  const SAS_BUTTONS: { id: string; mode: SasMode }[] = [
    { id: 'sasHold', mode: 'hold' },
    { id: 'sasPro', mode: 'prograde' },
    { id: 'sasRetro', mode: 'retrograde' },
    { id: 'sasRadIn', mode: 'radial-in' },
    { id: 'sasRadOut', mode: 'radial-out' },
  ];
  const SAS_LABEL: Record<SasMode, string> = {
    off: 'MANUAL', hold: 'HOLD', prograde: 'PROGRADE', retrograde: 'RETROGRADE',
    'radial-in': 'RADIAL IN', 'radial-out': 'RADIAL OUT',
  };
  const available = new Set(store.getState().level.sasModes);
  const sasEls = SAS_BUTTONS.map((b) => ({
    mode: b.mode,
    el: document.getElementById(b.id) as HTMLButtonElement | null,
  }));
  // Hide helpers not unlocked this level (engine-version gating).
  for (const b of sasEls) { if (b.el && !available.has(b.mode)) b.el.style.display = 'none'; }

  // Toggle a mode on; clicking the active one returns to manual. 'hold' captures the
  // current heading as its setpoint.
  const setSas = (mode: SasMode): void => store.update((d) => {
    if (d.burn.sasMode === mode) { d.burn.sasMode = 'off'; return; }
    d.burn.sasMode = mode;
    if (mode === 'hold') d.burn.holdTarget = d.burn.heading;
  });
  const sasHandlers = sasEls.map((b) => {
    const handler = (): void => setSas(b.mode);
    b.el?.addEventListener('click', handler);
    return { el: b.el, handler };
  });

  function paintSas(mode: SasMode): void {
    for (const b of sasEls) b.el?.classList.toggle('active', b.mode === mode);
    if (sasVal) sasVal.textContent = SAS_LABEL[mode];
    // An engaged autopilot owns rotation — lock out the manual thrusters while it holds.
    const auto = mode !== 'off';
    if (rotCCW) rotCCW.disabled = auto;
    if (rotCW) rotCW.disabled = auto;
  }
  const unsubSas = store.subscribe((s) => s.burn.sasMode, paintSas);
  paintSas(store.getState().burn.sasMode);

  // --- heading + spin readout (sim-owned; painted live each game tick) ---
  function paintAttitude(): void {
    const s = store.getState();
    const prograde = Math.atan2(s.orbit.vy, s.orbit.vx);
    const offPro = wrap(s.burn.heading - prograde);
    const offRetro = wrap(s.burn.heading - prograde - Math.PI);
    if (headingVal) {
      if (Math.abs(offPro) <= Math.abs(offRetro)) {
        const d = Math.round(offPro * RAD2DEG);
        headingVal.textContent = `PRO ${d >= 0 ? '+' : ''}${d}°`;
      } else {
        const d = Math.round(offRetro * RAD2DEG);
        headingVal.textContent = `RETRO ${d >= 0 ? '+' : ''}${d}°`;
      }
    }
    if (spinVal) {
      const dps = s.burn.omega * RAD2DEG;
      spinVal.textContent = Math.abs(dps) < 0.05 ? '0°/s' : `${dps > 0 ? '+' : ''}${dps.toFixed(1)}°/s`;
    }
  }
  const offTick = onGameTick(() => paintAttitude());
  paintAttitude();

  // --- END INSERTION: the manual end. Always commits the current orbit and stops, grading
  // it inserted / captured / escaped. With no automatic escape-backstop, this is the only
  // way to end a flyby that would otherwise coast off forever. ---
  const endBtn = document.getElementById('endInsertion');
  const onEnd = (): void => {
    const st = store.getState();
    if (st.burn.status !== 'approaching') return;
    const outcome = evaluateInsertion(st.orbit, st.level.planet);
    store.update((d) => { d.burn.status = outcome; d.clock.speed = 0; d.clock.speedTarget = 0; });
  };
  endBtn?.addEventListener('click', onEnd);

  return () => {
    thrust.removeEventListener('input', onThrust);
    unsubThrust();
    unsubEngEff();
    rotCCW?.removeEventListener('pointerdown', onCCWDown);
    rotCW?.removeEventListener('pointerdown', onCWDown);
    document.removeEventListener('pointerup', onPointerUp);
    rotStop?.removeEventListener('click', onStop);
    for (const h of sasHandlers) h.el?.removeEventListener('click', h.handler);
    unsubSas();
    offTick();
    endBtn?.removeEventListener('click', onEnd);
  };
}
