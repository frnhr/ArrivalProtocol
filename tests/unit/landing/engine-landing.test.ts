// Slice 1b, Track ORBIT: the engine during LANDING (01-landing §3.7, §3.10–§3.12, slice-1b-plan §1.4, §4). From constructed
// locks (harness-landing lockOn): SPACE burns and ENGINE FIRING refuses [L]; a PARTIAL orbit's trim on L2, declined when
// ignored (no SKIP stop after); GO LOWER offered, its ◇ timed, TACTICAL before it and the SKIP's stop ahead of it, flown by
// a scripted kid who holds on HOLD [SPACE] NOW and lets go 0.3 s after RELEASE (risk 1's measurement: the sure window ≥ 4 s
// and ▼ in the band; a 1.2 s kid printed as INFO); HOLLOW's drain and its projection with a burn in an open window;
// AUTOBURN refused; a dry tank under the planet CRASHED with the pods aboard NOT LAUNCHED and the falling one scored; an
// orbit outside the drop solver's domain (no throw); a ghost burst during the landing (risk 5).
import '../support/classic-world';
import { check, finish } from './checks';
import { lockOn, ensureLandingKeys } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { requestLaunch } from '@systems/landing';
import { getDropSolution } from '@systems/drop-cache';
import { getPrediction, getSensedPrediction, secUntil } from '@systems/predict';
import { landingFlightOf } from '@systems/guidance';
import { landingBurnOffer, timeToAngle } from '@systems/landing-orbit';
import { landingResult, pendingTouchdowns, windowsAsOf } from '@systems/landing-rules';
import { drainConditions, drainRatePerSec, projectedDrainPerSec } from '@systems/hollow';
import { autoburnRefusal } from '@systems/autoburn';
import { skipTarget } from '@systems/pace';
import { lossPlan, shipLost } from '@systems/run';
import { on } from '@systems/events';
import { elementsFromState, stateFromElements } from '@/types/orbit';
import { DRIVER_RULES } from '@data/script';
import { AUTOBURN_REFUSAL } from '@data/skill-text';
import { LANDING_SURE_MIN_TAC, SKIP_END_LEAD_TAC, TACTICAL_LEAD_BURN_TAC } from '@data/tuning';
import type { GameState } from '@state/schema';

const ARES = 0;
const HALCYON = 1;
const KESTREL = 2;
const VESPER = 3;
const h = createHarness7(1);
const state = (): GameState => h.store.getState();
const mu = (): number => state().level.planet.mu;
const tacTo = (inSec: number): number => secUntil(getPrediction(), inSec, state().clock.tSec) / state().level.tacticalWarp;

// A ship alone, HOLLOW asleep, the driver lessons done; `healthy`: every file at 100 (the drop factors all 1, and no
// failing Thrust Ctrl firing by itself).
function board(index: number, healthy = true): void {
  if (index === 0) h.resetTo('flight', 1);
  else h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
    if (healthy) for (const seg of draft.memory) if ('integrity' in seg) (seg as { integrity: number }).integrity = 100;
  });
  ensureLandingKeys(h);
}

// --- SPACE burns in landing, and ENGINE FIRING refuses [L] ---------------------------------------------------------------
{
  board(KESTREL);
  lockOn(h);
  h.stepFor(0.2);
  const fuel0 = state().burn.fuelPct;
  const epoch0 = state().landing.orbitEpoch;
  h.press('KeyW');
  h.stepUntil(() => !state().burn.presetAligning, 20);
  h.keyDown('Space');
  h.stepFor(0.5);
  const delivering = state().burn.lastTickDvKmS > 0;
  const refused = requestLaunch(h.store, { source: 'player' });
  h.keyUp('Space');
  h.stepFor(0.2);
  check('SPACE burns during the landing: thrust delivered, FUEL spent', delivering && state().burn.fuelPct < fuel0,
    `${fuel0.toFixed(2)} → ${state().burn.fuelPct.toFixed(2)} %`);
  check('…[L] meanwhile is refused ENGINE FIRING', refused.kind === 'refused' && refused.reason === 'ENGINE FIRING', JSON.stringify(refused));
  check('…and the burn\'s end bumped orbitEpoch once (the drop cache re-solves)', state().landing.orbitEpoch === epoch0 + 1,
    `${epoch0} → ${state().landing.orbitEpoch}`);
  check('AUTOBURN refuses in landing (the seam for v3)', autoburnRefusal(state(), getPrediction()) === AUTOBURN_REFUSAL.over);
}

// --- HOLLOW: a burn in an open window drains at the larger multiplier; the projection (the lead's M5) -------------------
{
  board(KESTREL);
  lockOn(h);
  h.stepFor(0.2);
  const cfg = state().hollow.cfg;
  const coast = projectedDrainPerSec(state());
  h.store.update((draft) => { draft.landing.window = { lz: 'LZ-A', sure: true }; });
  h.press('KeyW');
  h.stepUntil(() => !state().burn.presetAligning, 20);
  h.keyDown('Space');
  h.stepFor(0.5);
  h.store.update((draft) => { draft.landing.window = { lz: 'LZ-A', sure: true }; });
  const conditions = drainConditions(state());
  const drain = drainRatePerSec(cfg, conditions.thrustDelivered, conditions.landingActive);
  const projectedBurning = projectedDrainPerSec(state());
  h.keyUp('Space');
  check('a burn during an open window: both conditions, and the drain is the larger multiplier, never the product',
    conditions.thrustDelivered && conditions.landingActive && drain === cfg.drainPerSec * Math.max(cfg.burnMult, cfg.landMult),
    `${drain} (×${cfg.burnMult} / ×${cfg.landMult})`);
  check('M5: coasting with no burn offered projects the landing\'s rate; under thrust, the burn\'s', coast === drainRatePerSec(cfg, false, true)
    && projectedBurning === drainRatePerSec(cfg, true, true), `${coast} / ${projectedBurning}`);
}

// --- A PARTIAL orbit: L2's trim, declined when the kid lets it pass ------------------------------------------------------
{
  board(HALCYON);
  lockOn(h, { r: 5500, e: 0.4, argPeriDeg: 260, status: 'accepted' });
  const shown: string[] = [];
  const end = h.wall() + 60;
  while (h.wall() < end && state().landing.declined === null) {
    h.step();
    const id = h.shown()?.id ?? '';
    if (shown[shown.length - 1] !== id) shown.push(id);
  }
  const declined = state().landing.declined;
  check('PARTIAL (HALCYON e 0.4): the strip leads with the flight\'s trim (L2: F11)', shown.some((id) => id.startsWith('F11')), shown.join(' → '));
  check('…the kid lets it pass: declined, so it is offered no more (no TACTICAL, no SKIP stop on it)', declined !== null
    && declined.key.startsWith('ra-high') && landingBurnOffer(state(), getPrediction()) === null
    && skipTarget(state(), getPrediction())?.kind !== 'burn', JSON.stringify(declined));
}

// --- GO LOWER, flown by a scripted kid (risk 1's measurement) -------------------------------------------------------------
// ARES-VII (no drag) from a circular 8,950 km, its LZ-A widened to 330 km: at 8,950 km the healthy dot (±167 km) never
// fits it; lower down it does.
interface GoLowRun {
  sureTac: number;
  launchRadius: number;
  inBand: boolean;
  rows: string[];
  offered: boolean;
  diamondErrTac: number | null;
  paceOk: boolean;
  skipLeadTac: number | null;
}

function goLower(reactionSec: number): GoLowRun {
  board(ARES);
  h.store.update((draft) => {
    const lz = draft.landing.lzs[0]!;
    lz.widthKm = 330;
    lz.halfWidthRad = 165 / draft.level.planet.R;
  });
  lockOn(h, { r: 8950 });
  const run: GoLowRun = { sureTac: 0, launchRadius: 0, inBand: false, rows: [], offered: false, diamondErrTac: null, paceOk: true, skipLeadTac: null };
  let holding = false;
  let releaseAt: number | null = null;
  let skippingTo: string | null = null;
  const end = h.wall() + 200;
  while (h.wall() < end) {
    h.step();
    const aim = state().landing.goLow;
    if (aim !== null) run.offered = true;
    const pred = getPrediction();
    const offer = landingBurnOffer(state(), pred);
    if (offer?.reason === 'go-low' && aim !== null && run.diamondErrTac === null && offer.eventInSec > 0) {
      const toDiamond = timeToAngle(state().orbit, mu(), aim.burnRad) - (state().clock.tSec - pred.asOfTSec);
      run.diamondErrTac = Math.abs(secUntil(pred, offer.eventInSec, state().clock.tSec) - toDiamond) / state().level.tacticalWarp;
    }
    const skipping = state().clock.skipWarp !== null;
    if (skippingTo === 'burn' && !skipping && offer?.reason === 'go-low' && run.skipLeadTac === null) run.skipLeadTac = tacTo(offer.inSec);
    skippingTo = skipping ? skipTarget(state(), pred)?.kind ?? null : null;
    if (offer?.reason === 'go-low' && !holding) {
      const inTac = tacTo(offer.inSec);
      if (inTac <= TACTICAL_LEAD_BURN_TAC - 0.2 && inTac > 0 && state().clock.pace !== 'tactical') run.paceOk = false;
    }
    const line = h.shown();
    const text = line?.text ?? '';
    if (run.rows[run.rows.length - 1] !== line?.id) run.rows.push(line?.id ?? '');
    if (releaseAt !== null && h.wall() >= releaseAt - 1e-9) { h.keyUp('Space'); holding = false; break; }
    if (holding && /^RELEASE/.test(text) && releaseAt === null) releaseAt = h.wall() + reactionSec;
    if (holding) continue;
    if (text.includes('press [S]')) h.press('KeyS');
    if (text.includes('HOLD [SPACE] NOW') || text.includes('hold [SPACE]')) { h.keyDown('Space'); holding = true; }
    else if (line?.keys.includes('F') && !skipping) h.press('KeyF');
  }
  h.stepFor(1.5);
  const sol = getDropSolution()!;
  const w = windowsAsOf(sol, state().clock.tSec).find((candidate) => candidate.lz === 'LZ-A')!;
  run.sureTac = w.sureOpenInSec === null || w.sureCloseInSec === null ? 0 : (w.sureCloseInSec - w.sureOpenInSec) / state().level.tacticalWarp;
  run.launchRadius = w.launchRadius;
  const rp = elementsFromState(state().orbit, mu()).rp;
  run.inBand = w.inBand && rp >= state().level.ring.min;
  return run;
}

{
  const quick = goLower(0.3);
  check('GO LOWER is offered when the awaited LZ\'s dot never fits and a lower launch point would give it', quick.offered
    && quick.rows.includes('GO-LOW') && quick.rows.includes('GO-LOW-keep') && quick.rows.includes('GO-LOW-release'), quick.rows.join(' → '));
  check('…its ◇ is timed to the aim\'s burn angle (within 0.5 tac s)', quick.diamondErrTac !== null && quick.diamondErrTac <= 0.5,
    `${quick.diamondErrTac?.toFixed(3)} tac s`);
  check('…TACTICAL from TACTICAL_LEAD_BURN_TAC before its START BURN', quick.paceOk);
  check('…a SKIP to it stops SKIP_END_LEAD_TAC before its START BURN', quick.skipLeadTac !== null
    && Math.abs(quick.skipLeadTac - SKIP_END_LEAD_TAC) <= 1, `${quick.skipLeadTac?.toFixed(2)} tac s`);
  check(`risk 1: a kid letting go 0.3 s after RELEASE ends with a sure window ≥ ${LANDING_SURE_MIN_TAC} s and ▼ in the band`,
    quick.sureTac >= LANDING_SURE_MIN_TAC && quick.inBand, `${quick.sureTac.toFixed(2)} tac s at ${quick.launchRadius.toFixed(0)} km`);
  const slow = goLower(1.2);
  console.log(`INFO  GO LOWER, a 1.2 s kid: ${slow.sureTac.toFixed(2)} tac s at ${slow.launchRadius.toFixed(0)} km, in band: ${slow.inBand}`);
  check('…and a slow kid (1.2 s) keeps the band too', slow.inBand);
}

// --- A dry tank with ▼ under the planet: CRASHED, the pods aboard NOT LAUNCHED, the falling one scored --------------------
{
  board(ARES);
  lockOn(h);
  const end = h.wall() + 120;
  let launched = false;
  while (h.wall() < end && !launched) {
    h.step();
    const line = h.shown();
    if (line?.text.includes('[L]')) launched = requestLaunch(h.store, { source: 'player', confirmed: 'off-site' }).kind === 'launched';
    else if (line?.keys.includes('F') && state().clock.skipWarp === null) h.press('KeyF');
  }
  const here = Math.atan2(state().orbit.y, state().orbit.x);
  // Just above the surface on a steep fall (▼ at 1,000 km): the crash comes while the pod just launched is still falling.
  const impact = stateFromElements(1000, 0.7, here + 2.38, -2.38, mu());
  h.store.update((draft) => {
    draft.burn.fuelPct = 0;
    draft.orbit = { x: impact.x, y: impact.y, vx: impact.vx, vy: impact.vy };
  });
  const crashed: string[] = [];
  const off = on('crashed', () => { crashed.push('crashed'); });
  h.stepUntil(() => state().burn.status !== 'locked', 120);
  off();
  const fates = state().landing.pods.map((record) => record.fate.kind);
  const falling = state().landing.pods.filter((record) => record.fate.kind === 'falling');
  const pending = pendingTouchdowns(state());
  const tally = landingResult(state(), 'crashed');
  check('a dry tank under decay\'s planet: CRASHED during the landing, the landing ended ship-lost', launched && crashed.length === 1
    && state().burn.status === 'crashed' && state().landing.ended === 'ship-lost' && state().clock.paused, `${state().burn.status} · ${state().landing.ended}`);
  check('…the pods aboard NOT LAUNCHED, the one falling still scored', fates.filter((kind) => kind === 'aboard').length === 0
    && fates.includes('not-launched') && falling.length === 1 && pending.has(falling[0]!.pod) && tally.notLaunched > 0, fates.join(','));
  check('…the LOST card (shipLost), with no simulation retry: that is the flight\'s (ship 1 here)', shipLost(state())
    && lossPlan(state()).kind !== 'simulation' && h.shown()?.id === 'over-crashed', `${lossPlan(state()).kind} · ${h.shown()?.id}`);
}

// --- Outside the drop solver's domain: no dot, and a row (no throw) --------------------------------------------------------
{
  board(KESTREL);
  lockOn(h);
  const wild = stateFromElements(5600, 0.7, 0, 0.3, mu());
  h.store.update((draft) => { draft.orbit = { x: wild.x, y: wild.y, vx: wild.vx, vy: wild.vy }; });
  h.stepFor(0.3);
  const sol = getDropSolution()!;
  const row = landingFlightOf(state(), getSensedPrediction()).row;
  check('e 0.7: outside dropSolvable, the empty solution and a strip line (L2\'s trim, or NO DROP DOT), never a throw',
    sol.dot === null && sol.windows.length === 0 && h.shown() !== null && (row !== null || h.shown()?.id === 'landing-L13-nodrop'),
    `${h.shown()?.id} '${h.shown()?.text}'`);
}

// --- Ghost thrust during the landing (risk 5): VESPER's failing Thrust Ctrl fires there too -------------------------------
{
  board(VESPER, false);
  lockOn(h);
  let burst = false;
  let delivering = false;
  let refusal = '';
  const off = on('ghost-start', () => { burst = true; });
  const end = h.wall() + 90;
  while (h.wall() < end && !burst) h.step();
  // A tick that delivered the burst's thrust (review nit: the check passed vacuously on a tick with none).
  const until = h.wall() + 2;
  while (burst && h.wall() < until && !delivering) {
    h.step();
    delivering = state().burn.lastTickDvKmS > 0;
  }
  if (delivering) {
    const result = requestLaunch(h.store, { source: 'player' });
    refusal = result.kind === 'refused' ? result.reason : result.kind;
  }
  off();
  check('VESPER (Thrust Ctrl failing): the engine fires by itself during the landing, still in orbit, [L] refused ENGINE FIRING while it fires',
    burst && delivering && state().burn.status === 'locked' && refusal === 'ENGINE FIRING', `burst ${burst} · delivering ${delivering} · ${refusal}`);
}

finish();
