// Slice 4e, Track ORBIT (slice-4cde-plan §5.1, §8.1): AUTOBURN v3's aim, headless, on constructed classic ships (no flight
// flown, so under a second).
// • The grid (R12): one step under the band's top, then down by V3_STEP_KM; the aim is a grid point where every LZ fits
//   (LANDING_SURE_MIN_TAC at LANDING_TACTICAL_WARP), above the DRAG line the nearest such one (review M5), below it the highest.
// • The most-LZs fallback with its REPAIR (VESPER's narrow LZ-C never fits; with Sensor Interp degraded the label names it).
// • The fuel line: the transfer by vis-viva above the DRAG line; the holds under it; v2's rule when nothing leaves 20%.
// • Warp 20 in FLIGHT (R12): the level's own tactical warp (30 on VESPER) would aim elsewhere.
// • The memo (R18): the same object while nothing it reads changes, a new key when FUEL moves a whole percent; a fresh aim and
//   a memo hit on the 16-pod ark, and roundAim's memo (review 4 m13), each under 1 ms.
// • Words (foundation review m6): every new AUTOBURN v3 line at its worst case is ≤ 70 characters.
import { check, finish } from '../wp1/harness';
import { createHarness9 } from '../wp9/harness9';
import { lockOn, ensureLandingKeys } from '../landing/harness-landing';
import { giveSkillFile } from '../support/skills';
import { setLandingMode } from '../support/landing-instant';
import {
  landingOrbitAim, landingOrbitGrid, landingOrbitAimKey, clearLandingOrbitMemo, circleTransferDvKmS, v3GhostLabel, v3NoAimLine,
} from '@systems/autoburn-v3';
import { autoModeFor, autoburnStatus, roundAim } from '@systems/autoburn';
import { autoGhost } from '@systems/flight-hud';
import { getPrediction } from '@systems/predict';
import { skillLive, capabilitiesNow } from '@systems/capabilities';
import { sureTacAt, dragLineKm } from '@systems/landing-orbit';
import { dropFactors, launchQueue } from '@systems/landing-rules';
import { DRIVER_RULES } from '@data/script';
import { AUTOBURN_TEXT, AUTO_BUTTON_TEXT, AUTOBURN_SKILL_ROW, AUTO_MINI_TEXT, V3_TEXT } from '@data/skill-text';
import { V3_STEP_KM, LANDING_SURE_MIN_TAC, LANDING_TACTICAL_WARP, AUTO_FUEL_RESERVE_PCT, BAY_SLOTS, V3_AIM_ABOVE_DRAG } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import { stateFromElements } from '@/types/orbit';

const VESPER = 3;
const KESTREL = 2;
const LAST_LIGHT = 4;
const h = createHarness9(5);
setLandingMode('manual');
const state = (): GameState => h.store.getState();
const LANDING_DONE = [...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks'];

// A classic ship alone, every file at 100% except the sensor and the drivers (`sensor`, `driver` integrity), v3 aboard, and
// in LANDING locked on a near-circle at 0.6 of the band unless `flight`.
// `repair`: a Repair tool in the first free gap (a miss names a REPAIR only when one can run: landing-rules
// bestRepairForDrop). `flight`: an ellipse with ▲ over the band in FLIGHT instead of a lock.
function shipAt(index: number, opts: { sensor?: number; driver?: number; flight?: boolean; repair?: boolean } = {}): void {
  h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...LANDING_DONE);
    for (const seg of draft.memory) {
      if (!('integrity' in seg)) continue;
      const hp = seg.role === 'sensor' ? opts.sensor ?? 100 : seg.type === 'driver' ? opts.driver ?? 100 : 100;
      (seg as { integrity: number }).integrity = hp;
    }
    if (opts.repair) {
      const at = draft.memory.findIndex((seg) => seg.type === 'free' && seg.size >= 4);
      const gap = draft.memory[at]!;
      const repair = { id: 'repair', name: 'Repair', type: 'fs-tool', size: 4, integrity: 100, scanned: true, fsTool: 'repair', version: 1 } as Segment;
      draft.memory.splice(at, 1, repair, ...(gap.size > 4 ? [{ ...gap, id: `${gap.id}-rest`, size: gap.size - 4 }] : []));
    }
    if (opts.flight) {
      const ring = draft.level.ring;
      const orbit = stateFromElements(ring.min + 0.6 * (ring.max - ring.min), 0.15, 0, 0, draft.level.planet.mu);
      draft.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
    }
  });
  giveSkillFile(h.store, 'autoburn', 3, 2);
  ensureLandingKeys(h);
  if (!opts.flight) {
    const ring = state().level.ring;
    lockOn(h, { r: ring.min + 0.6 * (ring.max - ring.min), e: 0.02, argPeriDeg: 30 });
  }
  h.stepFor(0.2);
  clearLandingOrbitMemo();
}

// The aim's own drop factors (Sensor Interp, Nav Plotter, the worst of the next BAY_SLOTS drivers).
function factorsNow(): { sensor: number; plotter: number; driver: number } {
  const caps = capabilitiesNow(state());
  const driver = Math.max(1, ...launchQueue(state()).slice(0, BAY_SLOTS).map((pod) => dropFactors(caps, pod).driver));
  return { ...dropFactors(caps, null), driver };
}

// Of `Rs`, the circle the transfer from the loop now costs least (review M5's rule), or null.
function nearestOf(Rs: readonly number[]): number | null {
  const pred = getPrediction();
  const dv = (R: number): number => circleTransferDvKmS(state().level.planet.mu, pred.fit.rp, pred.fit.ra, R);
  return Rs.reduce<number | null>((best, R) => (best === null || dv(R) < dv(best) ? R : best), null);
}

function fitsAt(R: number, labels: readonly string[], warp = LANDING_TACTICAL_WARP): boolean {
  const { planet } = state().level;
  return state().landing.lzs.filter((lz) => labels.includes(lz.label))
    .every((lz) => sureTacAt(R, Math.sqrt(planet.mu / R), lz, factorsNow(), planet.R, warp) >= LANDING_SURE_MIN_TAC);
}

// --- The grid, and every LZ fitting at the highest grid point that fits them all (KESTREL, healthy) ------------------------
{
  shipAt(KESTREL);
  const ring = state().level.ring;
  const grid = landingOrbitGrid(ring);
  const aim = landingOrbitAim(state(), getPrediction());
  check('the grid: one step under the band\'s top, then down by V3_STEP_KM to the floor', grid[0] === ring.max - V3_STEP_KM
    && grid.every((R, i) => i === 0 || grid[i - 1]! - R === V3_STEP_KM) && grid[grid.length - 1]! >= ring.min + V3_STEP_KM, grid.join(' '));
  const labels = state().landing.lzs.map((lz) => lz.label);
  // Review M5 (V3_AIM_ABOVE_DRAG 'nearest'): above the DRAG line, of the grid points where every LZ fits, the one the transfer
  // from the loop costs least; the highest only below the line.
  const highest = grid.find((R) => fitsAt(R, labels)) ?? null;
  check('KESTREL healthy (M5): every LZ fits, on the grid, above the DRAG line, and no grid point that fits them all above the '
    + 'line costs a smaller transfer', V3_AIM_ABOVE_DRAG === 'nearest' && aim !== null && aim.misses.length === 0
    && aim.fits.length === labels.length && grid.includes(aim.targetKm) && fitsAt(aim.targetKm, labels) && !aim.belowDrag
    && nearestOf(grid.filter((R) => fitsAt(R, labels) && R >= dragLineKm(ring))) === aim.targetKm, `${JSON.stringify(aim)} highest ${highest}`);
  console.log(`INFO M5 KESTREL healthy from a lock at 0.6 of the band: the nearest R* ${aim?.targetKm}, the highest that fits every LZ ${highest}`);
  console.log(`INFO KESTREL healthy: R* ${aim?.targetKm} (${(aim?.targetKm ?? 0) - state().level.planet.R} km up), drop ±${aim?.dropKm.toFixed(0)} km, `
    + `FUEL after ${aim?.fuelAfterPct.toFixed(1)}%, label "${aim ? v3GhostLabel(state(), aim) : ''}"`);
  check('…[B] on a locked orbit offers LANDING ORBIT, not ROUND', autoModeFor(state(), getPrediction(), skillLive(state().memory, 'autoburn')) === 'landing-orbit');
  // The fuel line above the DRAG line: the transfer alone, two apsis burns by vis-viva.
  const pred = getPrediction();
  const transferPct = (circleTransferDvKmS(state().level.planet.mu, pred.fit.rp, pred.fit.ra, aim!.targetKm) / state().level.dvBudgetKmS) * 100;
  check('…its fuel line above the DRAG line is FUEL − the transfer (no holds)', !aim!.belowDrag && aim!.targetKm >= dragLineKm(ring)
    && Math.abs(aim!.fuelAfterPct - (state().burn.fuelPct - transferPct)) < 1e-9, `${aim!.fuelAfterPct} vs ${state().burn.fuelPct - transferPct}`);
  check('…the label: `LANDING ORBIT · EVERY LZ FITS · DROP ±n km · FUEL −n%`', /^LANDING ORBIT · EVERY LZ FITS · DROP ±\d+ km · FUEL −\d+%$/.test(v3GhostLabel(state(), aim!)));
}

// --- The most-LZs fallback with its REPAIR (VESPER: LZ-C, 250 km, never fits a 4 s window) ---------------------------------
{
  shipAt(VESPER, { sensor: 70, repair: true });
  const aim = landingOrbitAim(state(), getPrediction());
  console.log(`INFO VESPER, Sensor Interp 70%: R* ${aim?.targetKm}, fits ${aim?.fits.join(',')}, misses ${JSON.stringify(aim?.misses)}, `
    + `label "${aim ? v3GhostLabel(state(), aim) : ''}"`);
  const grid = landingOrbitGrid(state().level.ring);
  check('VESPER, Sensor Interp degraded: no orbit fits LZ-C, so the orbit fitting the most (LZ-A and LZ-B), nearest above the line (M5)',
    aim !== null && aim.fits.join() === 'LZ-A,LZ-B' && aim.misses.length === 1 && aim.misses[0]!.lz === 'LZ-C'
    && nearestOf(grid.filter((R) => fitsAt(R, aim.fits) && R >= dragLineKm(state().level.ring))) === aim.targetKm, JSON.stringify(aim));
  check('…the miss names the REPAIR that narrows its dot (L9\'s rule: Sensor Interp), and the label says it',
    aim?.misses[0]?.repair?.file === 'sensor' && v3GhostLabel(state(), aim) === 'LANDING ORBIT · LZ-A, LZ-B FIT · REPAIR SENSOR INTERP FOR LZ-C',
    aim ? v3GhostLabel(state(), aim) : '');
}

// --- Under the DRAG line the holds count; nothing over the reserve is v2's rule -------------------------------------------
{
  shipAt(VESPER, { sensor: 70, driver: 70 });
  const aim = landingOrbitAim(state(), getPrediction());
  const pred = getPrediction();
  const transferPct = aim === null ? 0 : (circleTransferDvKmS(state().level.planet.mu, pred.fit.rp, pred.fit.ra, aim.targetKm) / state().level.dvBudgetKmS) * 100;
  const holdsPct = aim === null ? 0 : state().burn.fuelPct - transferPct - aim.fuelAfterPct;
  console.log(`INFO VESPER, Sensor Interp and drivers degraded (×2.25): R* ${aim?.targetKm} (DRAG line ${dragLineKm(state().level.ring)}), `
    + `transfer ${transferPct.toFixed(1)}%, expected holds ${holdsPct.toFixed(1)}%, FUEL after ${aim?.fuelAfterPct.toFixed(1)}%`);
  check('a wider drop goes under the DRAG line, and its fuel line counts the expected holds', aim !== null && aim.belowDrag
    && aim.targetKm < dragLineKm(state().level.ring) && holdsPct > 0.5, `${aim?.targetKm} holds ${holdsPct}`);
  h.store.update((draft) => { draft.burn.fuelPct = AUTO_FUEL_RESERVE_PCT + 1; });
  clearLandingOrbitMemo();
  const none = landingOrbitAim(state(), getPrediction());
  const mode = autoModeFor(state(), getPrediction(), skillLive(state().memory, 'autoburn'));
  check('…with no orbit leaving 20% FUEL the aim is null and v3 flies v2\'s rule (ROUND on a locked ellipse)', none === null && mode === 'round',
    `${JSON.stringify(none)} ${mode}`);
  // Review m12: v3 flying v2's ROUND says why, on the ghost and the Skills row.
  const short = getPrediction();
  check('…and the Skills row says why (m12): `NO LANDING ORBIT LEAVES 20% FUEL`',
    v3NoAimLine(state(), short) === V3_TEXT.noOrbitFuel(AUTO_FUEL_RESERVE_PCT) && autoburnStatus(state()).text === V3_TEXT.noOrbitFuel(AUTO_FUEL_RESERVE_PCT),
    `${v3NoAimLine(state(), short)} · ${autoburnStatus(state()).text}`);
  shipAt(VESPER, { sensor: 10, driver: 100, repair: true });
  const blind = getPrediction();
  const ghost = autoGhost(state(), blind);
  check('…no orbit on the grid fits any LZ: [B] offers ROUND, whose ghost names the REPAIR (`NO LANDING ORBIT FITS — REPAIR SENSOR INTERP`)',
    landingOrbitAim(state(), blind) === null && v3NoAimLine(state(), blind) === V3_TEXT.noOrbit('SENSOR INTERP') && ghost?.mode === 'round'
      && ghost.label === V3_TEXT.noOrbit('SENSOR INTERP'), `${v3NoAimLine(state(), blind)} · ${JSON.stringify(ghost)}`);
}

// --- R12: judged at the landing's warp in FLIGHT too -------------------------------------------------------------------------
{
  shipAt(VESPER, { sensor: 70, flight: true });
  const warp = state().level.tacticalWarp;
  const aim = landingOrbitAim(state(), getPrediction());
  const grid = landingOrbitGrid(state().level.ring);
  const atLevelWarp = aim === null ? null : grid.find((R) => fitsAt(R, aim.fits, warp)) ?? null;
  console.log(`INFO VESPER in FLIGHT (tactical warp ${warp}): R* ${aim?.targetKm} at warp ${LANDING_TACTICAL_WARP}; at warp ${warp} it would be ${atLevelWarp}`);
  check(`R12: in FLIGHT (warp ${warp}) the fit is judged at ${LANDING_TACTICAL_WARP}: a higher R* than the level's warp would give`,
    state().run.phase === 'flight' && getPrediction().outcome === 'closed' && warp !== LANDING_TACTICAL_WARP && aim !== null
    && fitsAt(aim.targetKm, aim.fits) && atLevelWarp !== null && atLevelWarp < aim.targetKm, `${aim?.targetKm} vs ${atLevelWarp}`);
}

// --- R18: the memo, and the cost of each aim on the 16-pod ark -------------------------------------------------------------
{
  shipAt(LAST_LIGHT, { sensor: 70 });
  const pred = getPrediction();
  const first = landingOrbitAim(state(), pred);
  const key = landingOrbitAimKey();
  const again = landingOrbitAim(state(), pred);
  check('the memo: the same aim object while nothing it reads changes', first !== null && again === first && landingOrbitAimKey() === key);
  h.store.update((draft) => { draft.burn.fuelPct -= 1.2; });
  landingOrbitAim(state(), pred);
  check('…a new key when FUEL moves a whole percent', landingOrbitAimKey() !== key, `${key} → ${landingOrbitAimKey()}`);
  const runs = 200;
  let t0 = performance.now();
  for (let i = 0; i < runs; i++) { clearLandingOrbitMemo(); landingOrbitAim(state(), pred); }
  const freshMs = (performance.now() - t0) / runs;
  t0 = performance.now();
  for (let i = 0; i < runs; i++) landingOrbitAim(state(), pred);
  const hitMs = (performance.now() - t0) / runs;
  t0 = performance.now();
  for (let i = 0; i < runs; i++) roundAim(state(), pred);
  const roundMs = (performance.now() - t0) / runs;
  console.log(`INFO the 16-pod ark (LAST LIGHT, ${state().landing.pods.length} pods): landingOrbitAim ${freshMs.toFixed(3)} ms fresh, `
    + `${hitMs.toFixed(4)} ms memoised; roundAim ${roundMs.toFixed(4)} ms memoised`);
  check('R18: on the 16-pod ark a fresh aim, a memo hit and roundAim\'s memo (m13) each take under 1 ms', state().landing.pods.length === 16
    && freshMs < 1 && hitMs < 1 && roundMs < 1, `${freshMs.toFixed(3)} ${hitMs.toFixed(4)} ${roundMs.toFixed(4)}`);
}

// --- m6: AUTOBURN v3's words at their worst cases ----------------------------------------------------------------------------
{
  const lz = 'LZ-D';
  const time = '59:59';
  const lines = [
    V3_TEXT.holds, V3_TEXT.lower(lz), V3_TEXT.lowerKeeps(lz), V3_TEXT.lowerAlt('9,999'), V3_TEXT.topUpCosts(lz), V3_TEXT.toV2,
    V3_TEXT.landingOver, V3_TEXT.decayTopUp('▲', time), V3_TEXT.decayHolds, V3_TEXT.ghostEvery(999, 100),
    V3_TEXT.ghostSome(['LZ-A', 'LZ-B', 'LZ-C'], 'NAV PLOTTER', lz), V3_TEXT.ghostSome(['LZ-A', 'LZ-B', 'LZ-C'], null, lz),
    V3_TEXT.noOrbit('SENSOR INTERP'), V3_TEXT.noOrbit('NAV PLOTTER'), V3_TEXT.noOrbit(null), V3_TEXT.noOrbitFuel(AUTO_FUEL_RESERVE_PCT),
    AUTOBURN_TEXT.armedOrbit('▲', time), AUTOBURN_TEXT.armedHold, AUTOBURN_TEXT.armedTopUp('▲', time) + ' · [F] SKIP',
    AUTOBURN_TEXT.orbiting, AUTOBURN_TEXT.orbitingMind, AUTOBURN_TEXT.toppingUp, AUTOBURN_TEXT.toppingUpMind, AUTOBURN_TEXT.reserveOrbit,
    AUTOBURN_TEXT.downgradedOrbit, AUTOBURN_TEXT.readyV3, AUTOBURN_SKILL_ROW.holding('9,999'), AUTO_MINI_TEXT.armed(time, 'orbit'),
    AUTO_MINI_TEXT.armed(time, 'top-up'), AUTO_MINI_TEXT.armed(time, 'hold'), AUTO_BUTTON_TEXT.armedOrbit(time), AUTO_BUTTON_TEXT.armedHold,
    AUTO_BUTTON_TEXT.readyOrbit, AUTO_BUTTON_TEXT.modeHead('landing-orbit'),
  ];
  const long = lines.filter((text) => text.length > 70);
  check('m6: every AUTOBURN v3 line at its worst case is ≤ 70 characters', long.length === 0, long.map((text) => `${text.length}: ${text}`).join(' | '));
}

finish();
