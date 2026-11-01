// Slice 1b, Track ORBIT: the DRAG line and decay (01-landing §3.7, slice-1b-plan §1.4, §4). From constructed locks
// (harness-landing lockOn): the kick's Δv; §3.7's worked example (a circular 5,250 km orbit on a 5,000–7,000 band: kicks of
// 15, 22 and 24 m/s take ▼ to 4,973 km), the sim and decayForecast agreeing; ARES-VII never kicks; a SKIP's exact jump over
// three orbits against the same span in sub-steps (▼ within 1 km, the same kicks); kicks at least the gap apart on a
// near-circular orbit; the drop cache re-solved on the epoch with validUntilTSec at the next kick; the stamp threshold;
// L10 within two orbits, then the 'lift' burn flown by a kid and its RELEASE at the line.
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { coastWithKicks } from '@systems/orbit-sim';
import { setDebugWarp } from '@systems/pace';
import { getDropSolution } from '@systems/drop-cache';
import { getSensedPrediction, getPrediction } from '@systems/predict';
import { landingFlightOf } from '@systems/guidance';
import { decayWarnOrbits } from '@systems/landing-rules';
import { decayForecast, dragDvKmS, dragKickAt, dragLineKm, nextDragKick } from '@systems/landing-orbit';
import { on } from '@systems/events';
import { elementsFromState, keplerConic, orbitalPeriod, type OrbitState } from '@/types/orbit';
import { DRIVER_RULES } from '@data/script';
import { DRAG_DV_MAX_KMS, DRAG_LIFT_MARGIN_KM, DRAG_STAMP_MIN_KM } from '@data/tuning';
import type { DragKick } from '@/types/landing';
import type { GameState } from '@state/schema';

const ARES = 0;
const KESTREL = 2;  // band 5,000–7,000, drag: the DRAG line at 5,500 km
const h = createHarness7(1);
const state = (): GameState => h.store.getState();
const near = (value: number, want: number, tol: number): boolean => Math.abs(value - want) <= tol;
const mu = (): number => state().level.planet.mu;
const rpOf = (orbit: OrbitState): number => elementsFromState(orbit, mu()).rp;
const periodOf = (orbit: OrbitState): number => orbitalPeriod(keplerConic(orbit, mu(), elementsFromState(orbit, mu())));

const kicks: DragKick[] = [];
on('drag-kick', (kick) => { kicks.push(kick); });

function board(index: number): void {
  if (index === 0) h.resetTo('flight', 1);
  else h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault');
  });
}

// --- The kick's Δv (pure) ------------------------------------------------------------------------------------------------
{
  const ring = { min: 5000, max: 7000 };
  check('the DRAG line sits at the sweet zone\'s lower edge: 5,500 km on a 5,000–7,000 band', dragLineKm(ring) === 5500);
  check('dragDvKmS: 0 at and above the line, 15 m/s at 5,250 km, DRAG_DV_MAX_KMS at the floor and capped below it',
    dragDvKmS(5500, ring) === 0 && dragDvKmS(6000, ring) === 0 && near(dragDvKmS(5250, ring), 0.015, 1e-12)
    && near(dragDvKmS(5000, ring), DRAG_DV_MAX_KMS, 1e-12) && dragDvKmS(4000, ring) === DRAG_DV_MAX_KMS);
}

// --- §3.7's worked example, the sim against the forecast -------------------------------------------------------------
{
  board(KESTREL);
  lockOn(h, { r: 5250 });
  const forecast = decayForecast(state().orbit, mu(), state().level.ring, true);
  const period0 = periodOf(state().orbit);
  const t0 = state().clock.tSec;
  kicks.length = 0;
  setDebugWarp(h.store, 2000);
  let leftAt: number | null = null;
  while (kicks.length < 3 && state().clock.tSec - t0 < 4 * period0) {
    h.step();
    if (leftAt === null && rpOf(state().orbit) < state().level.ring.min) leftAt = state().clock.tSec;
  }
  setDebugWarp(h.store, null);
  const dvs = kicks.map((kick) => Math.round(kick.dvKmS * 1000));
  check('circular 5,250 km on 5,000–7,000: kicks of 15, 22 and 24 m/s (±1)', kicks.length === 3
    && near(dvs[0]!, 15, 1) && near(dvs[1]!, 22, 1) && near(dvs[2]!, 24, 1), dvs.join(', '));
  const rpNow = rpOf(state().orbit);
  check('…and ▼ at 4,973 km (±10) after the third: out of the band', near(rpNow, 4973, 10) && rpNow < 5000, rpNow.toFixed(0));
  const simOrbits = leftAt === null ? null : (leftAt - t0) / period0;
  check('decayForecast agrees: the band is left at the third kick, at the same time (±0.05 orbit)',
    forecast.orbitsToLeave !== null && simOrbits !== null && near(forecast.orbitsToLeave, simOrbits, 0.05),
    `forecast ${forecast.orbitsToLeave?.toFixed(3)} · sim ${simOrbits?.toFixed(3)} orbits`);
  check('every kick bumped the epoch and wrote the decay in one go', state().landing.decay.kicks === 3
    && state().landing.decay.last?.atTSec === kicks[2]!.atTSec && state().landing.orbitEpoch >= 3);
}

// --- ARES-VII (layer 1) never decays -------------------------------------------------------------------------------------
{
  board(ARES);
  lockOn(h, { r: 5200 });
  kicks.length = 0;
  setDebugWarp(h.store, 2000);
  h.stepFor(4);
  setDebugWarp(h.store, null);
  check('ARES-VII: ▼ far under its DRAG line, and no kick ever (drag false)', kicks.length === 0 && state().landing.decay.kicks === 0
    && rpOf(state().orbit) < dragLineKm(state().level.ring) && decayForecast(state().orbit, mu(), state().level.ring, false).orbitsToLeave === null);
}

// --- A SKIP's exact jump over three orbits equals the same span in sub-steps ----------------------------------------------
{
  board(KESTREL);
  lockOn(h, { r: 5420, e: 0.01 });
  const start: OrbitState = { ...state().orbit };
  const from = state().clock.tSec;
  const span = 3 * periodOf(start);
  const exact = coastWithKicks(start, mu(), state().level.ring, from, span, state().landing.decay, true);
  kicks.length = 0;
  setDebugWarp(h.store, 400);
  while (state().clock.tSec - from < span - 1e-6) {
    // The last tick lands exactly on the span's end (the debug ladder's warp, cut to fit).
    const left = from + span - state().clock.tSec;
    if (left < 400 * 0.05) setDebugWarp(h.store, Math.max(1, left / 0.05));
    h.step();
  }
  setDebugWarp(h.store, null);
  const over = state().clock.tSec - (from + span);
  const rpStepped = rpOf(state().orbit);
  const rpExact = rpOf(exact.end);
  check('a 3-orbit SKIP jump (coastWithKicks) and sub-steps over the same span: ▼ within 1 km, the same kicks',
    near(rpStepped, rpExact, 1) && kicks.length === exact.kicks.length && exact.kicks.length >= 3 && Math.abs(over) < 1,
    `▼ ${rpStepped.toFixed(1)} / ${rpExact.toFixed(1)} km · kicks ${kicks.length} / ${exact.kicks.length} · over ${over.toFixed(2)} s`);
  const gaps = kicks.slice(1).map((kick, i) => kick.atTSec - kicks[i]!.atTSec);
  check('…near-circular, no ▼ kicked twice: every kick at least 0.4 of a period after the last', gaps.every((gap) => gap >= 0.4 * periodOf(start)),
    gaps.map((gap) => (gap / periodOf(start)).toFixed(2)).join(', '));
}

// --- The drop cache: re-solved on the epoch, validUntilTSec at the next kick ---------------------------------------------
{
  board(KESTREL);
  lockOn(h, { r: 5300 });
  h.step();
  const sol = getDropSolution()!;
  const next = nextDragKick(state().orbit, mu(), state().level.ring, state().clock.tSec, state().clock.tSec + periodOf(state().orbit), state().landing.decay);
  check('validUntilTSec is the next kick (within a tick)', sol.validUntilTSec !== null && next !== null && near(sol.validUntilTSec, next.atTSec, 5),
    `${sol.validUntilTSec?.toFixed(0)} / ${next?.atTSec.toFixed(0)}`);
  const epoch = state().landing.orbitEpoch;
  kicks.length = 0;
  setDebugWarp(h.store, 2000);
  while (kicks.length === 0) h.step();
  setDebugWarp(h.store, null);
  const after = getDropSolution()!;
  check('a kick bumps orbitEpoch, and the drop cache serves a solution solved after it', state().landing.orbitEpoch === epoch + 1
    && after.asOfTSec >= kicks[0]!.atTSec && after !== sol);
}

// --- The stamp threshold (risk 15) -----------------------------------------------------------------------------------------
{
  board(KESTREL);
  lockOn(h, { r: 5495 });
  const ring = state().level.ring;
  const shallow = dragKickAt(state().orbit, mu(), ring, 0);
  lockOn(h, { r: 5250 });
  const deep = dragKickAt(state().orbit, mu(), ring, 0);
  check('a ▼ 5 km under the line kicks under DRAG_STAMP_MIN_KM (no stamp, no lesson); 250 km under, well over it',
    shallow !== null && shallow.dropKm > 0 && shallow.dropKm < DRAG_STAMP_MIN_KM && deep !== null && deep.dropKm >= 100,
    `${shallow?.dropKm.toFixed(1)} / ${deep?.dropKm.toFixed(0)} km`);
}

// --- L10 within two orbits, then the 'lift' burn and its RELEASE at the line ---------------------------------------------
{
  board(KESTREL);
  lockOn(h, { r: 5300 });
  h.step();
  const warned = decayWarnOrbits(state());
  const pred = getPrediction();
  // A near-circle under the line: ▲ is under the target too, so the lift comes in two (PRO at ▼ first, then at ▲).
  check('decay out of the band within DECAY_WARN_ORBITS: L10\'s warning, and the \'lift\' burn, PRO (a near-circle: at ▼ first)',
    warned !== null && pred.burnPoint?.reason === 'lift' && pred.burnPoint.preset === 'prograde' && pred.burnPoint.event === 'peri'
    && pred.burnPoint.firstOfTwo, `${warned?.toFixed(2)} orbits · ${pred.burnPoint?.reason} ${pred.burnPoint?.preset} ${pred.burnPoint?.event}`);
  // The lift as it is meant to be flown: a sinking loop whose ▲ is already over the target, one PRO at ▲.
  board(KESTREL);
  lockOn(h, { r: 5150, e: (5900 - 5150) / (5900 + 5150), argPeriDeg: 0 });
  let holding = false;
  let releaseAt: number | null = null;
  let releases = 0;
  const seen: string[] = [];
  const end = h.wall() + 400;
  const sinking = (): boolean => decayForecast(state().orbit, mu(), state().level.ring, true).orbitsToLeave !== null;
  while (h.wall() < end && (holding || sinking())) {
    h.step();
    const row = landingFlightOf(state(), getSensedPrediction()).row;
    const id = row?.id ?? '';
    if (seen[seen.length - 1] !== id) { seen.push(id); if (process.env.DBG) { const el = elementsFromState(state().orbit, mu()); console.log(h.wall().toFixed(2), id, row?.text, 'rp', el.rp.toFixed(0), 'ra', (el.rp * (1 + el.e) / (1 - el.e)).toFixed(0), 'kicks', state().landing.decay.kicks, state().clock.pace); } }
    if (releaseAt !== null && h.wall() >= releaseAt - 1e-9) { h.keyUp('Space'); holding = false; releaseAt = null; releases++; continue; }
    if (holding && (id === 'LIFT-release' || id.startsWith('F5') || id === 'F3') && releaseAt === null) releaseAt = h.wall() + 0.3;
    if (holding) continue;
    if (row?.text.includes('press [W]')) h.press('KeyW');
    if (id === 'LIFT-now' || id === 'LIFT-hold') { h.keyDown('Space'); holding = true; }
    // Between the halves the decay can slow out of the warning (▲ is higher): the kid SKIPs on as the strip offers.
    else if ((row?.keys.includes('F') || h.shown()?.keys.includes('F')) && state().clock.skipWarp === null) h.press('KeyF');
  }
  h.stepFor(0.5);
  const line = dragLineKm(state().level.ring);
  const rp = rpOf(state().orbit);
  check('…a sinking loop with ▲ over the target: the kid flies one PRO at ▲, letting go 0.3 s after RELEASE: ▼ over the line, decay stopped',
    seen.includes('LIFT-keep') && seen.includes('LIFT-release') && releases >= 1 && rp > line && rp < state().level.ring.max
    && !sinking(), `▼ ${rp.toFixed(0)} km (line ${line}, target +${DRAG_LIFT_MARGIN_KM}) · ${releases} releases · ${seen.filter(Boolean).join(' → ')}`);
}

finish();
