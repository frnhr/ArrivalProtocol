// Slice 4e, Track ORBIT (slice-4cde-plan §5, §8.1; 03 §3.6): AUTOBURN v3 LANDING ORBIT flown headless on classic ships.
// • FLIGHT (flyOnce): KESTREL from the flyby, one [B]: the capture brakes on into the transfer, the circle at R*, HOLD STEADY
//   locks it, and it holds R* into LANDING with every LZ fitting there (measured: time and FUEL).
// • From a lock: the tail `· [B] MOVE TO LANDING ORBIT`, the AUTO head, the ghost and its label, the lesson once.
// • A bitten driver → GOES LOWER (the radio, the event, L9's slot while it flies down); never up when the driver heals; the
//   kid's GO LOWER gated off while it is engaged (R16).
// • Decay (R13, measured): VESPER with a ×2.25 drop holds under the DRAG line with top-ups, each window-free, re-aimed
//   lower, or naming the window it costs; L10's slot is v3's words.
// • The reserve, v3 → v2 into ROUND (R14), v3 → v1 in LANDING, the kid's RETRO a takeover, the landing's end, the Skills row.
import { check, finish } from '../wp1/harness';
import { createHarness9 } from '../wp9/harness9';
import { flyOnce } from '../wp1-rules/flows';
import { byDepth } from '../depth';
import { lockOn, ensureLandingKeys } from '../landing/harness-landing';
import { giveSkillFile } from '../support/skills';
import { setLandingMode } from '../support/landing-instant';
import { autoburnRefusal, autoModeFor, autoburnFireInTac, autoburnStatus } from '@systems/autoburn';
import { landingOrbitAim, v3LowerLine, v3DecayLine, clearLandingOrbitMemo } from '@systems/autoburn-v3';
import { getPrediction, atCircle } from '@systems/predict';
import { skillLive, capabilitiesNow } from '@systems/capabilities';
import { threadsBusy } from '@systems/ops-core';
import { landingFlightOf } from '@systems/guidance';
import { autoGhost, autoButton } from '@systems/flight-hud';
import { goLowerChoice } from '@systems/landing-rules';
import { getDropSolution } from '@systems/drop-cache';
import { sureTacAt, dragLineKm } from '@systems/landing-orbit';
import { endLanding } from '@systems/landing';
import { ringFit, elementsFromState } from '@/types/orbit';
import { on } from '@systems/events';
import { AUTOBURN_TEXT, AUTOBURN_SKILL_ROW, AUTO_BUTTON_TEXT, V3_TEXT } from '@data/skill-text';
import { DRIVER_RULES } from '@data/script';
import { AUTO_FUEL_RESERVE_PCT, LANDING_SURE_MIN_TAC, LANDING_TACTICAL_WARP } from '@data/tuning';
import { formatCount } from '@data/format';
import type { GameState } from '@state/schema';
import type { LockLevel } from '@/types/skill';

const KESTREL = 2;
const VESPER = 3;
const h = createHarness9(5);
setLandingMode('manual');
const state = (): GameState => h.store.getState();
const phase = () => state().burn.auto.phase;
const engaged = (): boolean => phase() === 'armed' || phase() === 'pointing' || phase() === 'burning';
const fitNow = () => ringFit(elementsFromState(state().orbit, state().level.planet.mu), state().level.ring);
const said = (text: string): boolean => state().log.entries.some((entry) => entry.text === text);
const altKm = (radius: number): number => radius - state().level.planet.R;
const LANDING_DONE = [...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks'];
const fileOf = () => skillLive(state().memory, 'autoburn').file!;
const setFile = (integrity: number): void => {
  const id = fileOf().id;
  h.store.update((draft) => { const seg = draft.memory.find((candidate) => candidate.id === id); if (seg && 'integrity' in seg) seg.integrity = integrity; });
};

// Steps while engaged, pressing [F] while it waits with its burn far off (one SKIP per coast, as the strip offers), until
// `until` or maxWall. Counts the burns it starts, and calls `each` after every tick.
function fly(maxWall: number, until: () => boolean, each?: () => void): { burns: number } {
  let burns = 0;
  const end = h.wall() + maxWall;
  while (h.wall() < end && engaged() && !until()) {
    const before = phase();
    const fireIn = autoburnFireInTac(state(), getPrediction());
    if (before === 'armed' && state().clock.skipWarp === null && (h.shown()?.keys ?? []).includes('F') && (fireIn === null || fireIn > 30)) h.press('KeyF');
    h.step();
    if (before === 'armed' && (phase() === 'pointing' || phase() === 'burning')) burns++;
    each?.();
  }
  return { burns };
}

// Every LZ in `labels` gets its sure window on the circle of radius R (at the landing's warp), with the aim's factors.
function allFit(labels: readonly string[], R: number): boolean {
  const { planet } = state().level;
  const caps = capabilitiesNow(state());
  const worst = Math.max(1, ...state().memory.filter((seg) => seg.type === 'driver').map((seg) => ('integrity' in seg && seg.integrity < 50 ? 2 : 'integrity' in seg && seg.integrity < 80 ? 1.5 : 1)));
  const factors = { sensor: caps.drop.sensorFactor, plotter: caps.drop.plotterFactor, driver: worst };
  return state().landing.lzs.filter((lz) => labels.includes(lz.label))
    .every((lz) => sureTacAt(R, Math.sqrt(planet.mu / R), lz, factors, planet.R, LANDING_TACTICAL_WARP) >= LANDING_SURE_MIN_TAC);
}

// A classic ship alone in LANDING, locked on (r, e, ▼'s direction), every file at 100% but the sensor and the drivers.
function lockedOn(index: number, lock: { r: number; e: number; argPeriDeg?: number }, opts: { sensor?: number; driver?: number; lockLevel?: LockLevel } = {}): void {
  h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...LANDING_DONE);
    for (const seg of draft.memory) {
      if (!('integrity' in seg)) continue;
      (seg as { integrity: number }).integrity = seg.role === 'sensor' ? opts.sensor ?? 100 : seg.type === 'driver' ? opts.driver ?? 100 : 100;
    }
  });
  giveSkillFile(h.store, 'autoburn', 3, opts.lockLevel ?? 2);
  ensureLandingKeys(h);
  lockOn(h, { r: lock.r, e: lock.e, argPeriDeg: lock.argPeriDeg ?? 30 });
  h.stepFor(0.2);
  clearLandingOrbitMemo();
}

// --- FLIGHT: KESTREL from the flyby (▼ corrected by hand), one [B], to the landing orbit and into LANDING --------------------
{
  flyOnce(h, 'v3 KESTREL to the landing orbit', () => {
    h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
    h.store.update((d) => { d.run.stats.demos.push({ offsetTac: 0 }, { offsetTac: 0 }); });
    giveSkillFile(h.store, 'autoburn', 3, 2);
    h.keyDown('Space');
    h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
    h.keyUp('Space');
    h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 300);
    const aim = landingOrbitAim(state(), getPrediction());
    const mode = autoModeFor(state(), getPrediction(), skillLive(state().memory, 'autoburn'));
    const fuel0 = state().burn.fuelPct;
    const wall0 = h.wall();
    h.press('KeyB');
    h.step();
    let lockedAt: number | null = null;
    const flown = fly(900, () => state().run.phase === 'landing' && state().burn.auto.holding, () => {
      if (lockedAt === null && state().run.phase === 'landing') {
        lockedAt = h.wall();
        h.store.update((draft) => { draft.director.done.push(...LANDING_DONE); });
        ensureLandingKeys(h);
      }
    });
    console.log(`INFO FLIGHT (KESTREL, ▼ corrected, one [B] in the flyby's ${mode}): aim R* ${aim?.targetKm} (${aim ? altKm(aim.targetKm) : '?'} km up, `
      + `FUEL after ${aim?.fuelAfterPct.toFixed(1)}% expected); ${flown.burns} burns; at the circle and holding after ${(h.wall() - wall0).toFixed(0)} wall s `
      + `(locked at ${lockedAt === null ? '?' : (lockedAt - wall0).toFixed(0)}); FUEL ${fuel0.toFixed(1)} → ${state().burn.fuelPct.toFixed(1)}%`);
  });
  const auto = state().burn.auto;
  const aim = landingOrbitAim(state(), getPrediction());
  check('FLIGHT: one [B] from the flyby flew the capture and the transfer, the lock came, and in LANDING it holds R*',
    state().run.phase === 'landing' && phase() === 'armed' && auto.mode === 'landing-orbit' && auto.holding && auto.targetKm !== null
    && atCircle(fitNow(), auto.targetKm) && said(V3_TEXT.holds), `${state().run.phase} ${phase()} ${auto.mode} hold ${auto.holding} ${auto.targetKm}`);
  check('…every LZ fits at R* (the aim has no misses), above the DRAG line, FUEL over the reserve, no thread held while it holds',
    aim !== null && aim.misses.length === 0 && aim.targetKm === auto.targetKm && allFit(aim.fits, auto.targetKm!)
    && auto.targetKm! >= dragLineKm(state().level.ring) && state().burn.fuelPct >= AUTO_FUEL_RESERVE_PCT && threadsBusy() === 0,
    `${JSON.stringify(aim)} fuel ${state().burn.fuelPct.toFixed(1)}`);
  check('…the Skills row says HOLDS THE LANDING ORBIT at its altitude', autoburnStatus(state()).text === AUTOBURN_SKILL_ROW.holding(formatCount(altKm(auto.targetKm!))),
    autoburnStatus(state()).text);
  // The landing ends under it: the engine closes and it lets go, with its own words.
  endLanding(h.store);
  h.step();
  check('…the landing\'s end lets go of it (`LANDING OVER — it lets go of the orbit`)', phase() === 'idle' && state().burn.auto.end === 'flight-over'
    && !state().burn.auto.holding && said(V3_TEXT.landingOver), `${phase()} ${state().burn.auto.end}`);
}

// --- From a lock: `[B] · MOVE TO LANDING ORBIT`, the head, the ghost and its label, the lesson ---------------------------------
{
  lockedOn(KESTREL, { r: 5600, e: 0.03 });
  const lessons = new Set<string>();
  h.stepUntil(() => {
    for (const id of [h.shown()?.id, h.objective()?.id]) if (id?.startsWith('tut-autoburn')) lessons.add(id);
    return autoburnRefusal(state(), getPrediction()) === null && lessons.size > 0;
  }, 300);
  const pred = getPrediction();
  const tail = landingFlightOf(state(), pred).autoTail;
  const ghost = autoGhost(state(), pred);
  const button = autoButton(state(), pred);
  const aim = landingOrbitAim(state(), pred);
  console.log(`INFO from a lock (KESTREL, ▼ ${altKm(5600)} km, e 0.03): aim ${aim?.targetKm}; tail "${tail?.text}"; head "${button.head}"; ghost "${ghost?.label}"`);
  check('LANDING, a locked orbit: [B] offers LANDING ORBIT (not ROUND): the tail `· [B] MOVE TO LANDING ORBIT`, the head `AUTO · LANDING ORBIT [B]`',
    autoModeFor(state(), pred, skillLive(state().memory, 'autoburn')) === 'landing-orbit' && tail?.text === AUTOBURN_TEXT.offerLanding('landing-orbit')
    && tail.key === 'B' && button.head === AUTO_BUTTON_TEXT.modeHead('landing-orbit') && button.look === 'ready', `${tail?.text} ${button.head}`);
  check('…the ghost is the circle at R* with its label', ghost?.mode === 'landing-orbit' && ghost.rpKm === aim?.targetKm && ghost.raKm === aim.targetKm
    && ghost.label !== null && ghost.label.startsWith('LANDING ORBIT · EVERY LZ FITS · DROP ±'), JSON.stringify(ghost));
  check('…the first moment v3 can act the strip says its lesson, once (`AUTOBURN v3 — [B] flies to the orbit where every drop fits`)',
    [...lessons].join() === 'tut-autoburn-v3', [...lessons].join());
  h.press('KeyB');
  h.step();
  check('…one press arms it at R*, not holding yet, no thread', phase() === 'armed' && state().burn.auto.mode === 'landing-orbit'
    && state().burn.auto.targetKm === aim?.targetKm && !state().burn.auto.holding && threadsBusy() === 0, `${phase()} ${state().burn.auto.targetKm}`);

  // R14: v3 → v2 (64%) while engaged: ROUND at the same circle, without the hold.
  const target = state().burn.auto.targetKm;
  setFile(64);
  h.step();
  check('R14: v3 → v2 while engaged goes on as ROUND at the same circle, without holding (`it rounds, but won\'t hold the orbit`)',
    phase() === 'armed' && state().burn.auto.mode === 'round' && state().burn.auto.targetKm === target && !state().burn.auto.holding
    && said(V3_TEXT.toV2), `${phase()} ${state().burn.auto.mode} ${state().burn.auto.targetKm}`);
  const flown = fly(600, () => false);
  check('…and rounds the orbit there: ROUND ORBIT at R*', state().burn.auto.end === 'round' && atCircle(fitNow(), target!), `${state().burn.auto.end} ${flown.burns} burns`);
}

// --- v3 → v1 in LANDING ends it; the kid's RETRO is a takeover --------------------------------------------------------------
{
  lockedOn(KESTREL, { r: 5600, e: 0.03 });
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 300);
  h.press('KeyB');
  h.step();
  setFile(40);
  h.step();
  check('v3 → v1 (40%) in LANDING ends it \'downgraded\' (v1 does not fly in LANDING): `DAMAGED TO v1 — the landing orbit is yours`',
    phase() === 'done' && state().burn.auto.end === 'downgraded' && said(AUTOBURN_TEXT.downgradedOrbit) && threadsBusy() === 0, `${phase()} ${state().burn.auto.end}`);
  lockedOn(KESTREL, { r: 5600, e: 0.03 });
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 300);
  h.press('KeyB');
  h.step();
  h.press('KeyS');
  h.stepUntil(() => !state().burn.presetAligning, 10);
  h.keyDown('Space');
  h.step();
  h.keyUp('Space');
  h.step();
  check('R16: the kid\'s RETRO burn by hand while it is armed is a takeover', phase() === 'idle' && state().burn.auto.end === 'takeover',
    `${phase()} ${state().burn.auto.end}`);
}

// --- A bitten driver: GOES LOWER, L9's slot, GO LOWER gated; never up again -------------------------------------------------
{
  lockedOn(VESPER, { r: 6500, e: 0.02 }, { sensor: 70 });
  h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 300);
  h.press('KeyB');
  h.step();
  const before = state().burn.auto.targetKm!;
  const lowers: { fromKm: number; toKm: number; lz: string }[] = [];
  const off = on('autoburn-v3-lower', (payload) => { lowers.push(payload); });
  // The next pods' drivers bitten to 60% (degraded: ×1.5 each).
  h.store.update((draft) => { for (const seg of draft.memory) if (seg.type === 'driver' && 'integrity' in seg) (seg as { integrity: number }).integrity = 60; });
  h.step();
  h.step();
  const after = state().burn.auto.targetKm!;
  const pred = getPrediction();
  const slot = landingFlightOf(state(), pred).v3Lower ?? null;
  const sol = getDropSolution();
  console.log(`INFO a bite (VESPER, Sensor Interp 70%, drivers to 60%): R* ${before} → ${after}; radio "${lowers[0] ? V3_TEXT.lower(lowers[0].lz) : ''}"; L9 slot "${slot}"`);
  check('a bite that widens the drop: GOES LOWER a step or more, lets go of any hold, and says which LZ\'s dot will fit',
    after <= before - 100 && !state().burn.auto.holding && lowers.length === 1 && lowers[0]!.fromKm === before && lowers[0]!.toKm === after
    && said(V3_TEXT.lower(lowers[0]!.lz)), `${before} → ${after} ${JSON.stringify(lowers)}`);
  check('…while it flies down L9\'s slot is v3\'s line, and the kid\'s GO LOWER is gated off (R16)', slot === V3_TEXT.lower(lowers[0]?.lz ?? '?')
    && v3LowerLine(state(), pred) === slot && sol !== null && goLowerChoice(state(), sol, capabilitiesNow(state())) === null, `${slot}`);
  // Healed, the aim rises again; the circle does not (03: "It never climbs back up during a landing").
  h.store.update((draft) => { for (const seg of draft.memory) if (seg.type === 'driver' && 'integrity' in seg) (seg as { integrity: number }).integrity = 100; });
  clearLandingOrbitMemo();
  h.stepFor(1);
  off();
  const risen = landingOrbitAim(state(), getPrediction())?.targetKm ?? null;
  check('…healed, the aim is higher again but the held circle never climbs', risen !== null && risen > after && state().burn.auto.targetKm === after
    && lowers.length === 1, `aim ${risen} held ${state().burn.auto.targetKm}`);
}

// --- R13: under the DRAG line it holds with top-ups (measured); L10's slot; the reserve -------------------------------------
{
  let topUps = 0;
  let costs = 0;
  let keeps = 0;
  let kicks = 0;
  let fuelUsed = 0;
  let decayLines = 0;
  // Quick depth: one orientation, three kicks (about 5 s); full: two, four kicks each.
  for (const argPeriDeg of byDepth([30], [30, 120])) {
    lockedOn(VESPER, { r: 5240, e: 0.002, argPeriDeg }, { sensor: 70, driver: 70 });
    const aim = landingOrbitAim(state(), getPrediction());
    h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 300);
    h.press('KeyB');
    h.step();
    const held0 = state().burn.auto.holding;
    const fuel0 = state().burn.fuelPct;
    const kicks0 = state().landing.decay.kicks;
    const lowerBefore = state().log.entries.length;
    const flown = fly(1200, () => state().landing.decay.kicks - kicks0 >= byDepth(3, 4), () => {
      if (v3DecayLine(state(), getPrediction()) !== null && h.shown()?.id === 'landing-L10-v3') decayLines++;
    });
    const lines = state().log.entries.slice(lowerBefore).map((entry) => entry.text);
    topUps += flown.burns;
    costs += lines.filter((text) => text.startsWith('AUTOBURN v3: TOP-UP COSTS')).length;
    keeps += lines.filter((text) => text.startsWith('AUTOBURN v3 GOES LOWER — it keeps')).length;
    kicks += state().landing.decay.kicks - kicks0;
    fuelUsed += fuel0 - state().burn.fuelPct;
    console.log(`INFO R13 (VESPER ×2.25, ▼ at ${argPeriDeg}°): R* ${aim?.targetKm} (DRAG line ${dragLineKm(state().level.ring)}), holding at once ${held0}; `
      + `${state().landing.decay.kicks - kicks0} kicks, ${flown.burns} top-ups, FUEL ${fuel0.toFixed(1)} → ${state().burn.fuelPct.toFixed(1)}%; still `
      + `${phase()} ${state().burn.auto.mode} at ${state().burn.auto.targetKm}; ${lines.filter((text) => text.startsWith('AUTOBURN v3')).join(' | ')}`);
    check(`R13 (▼ at ${argPeriDeg}°): under the DRAG line it holds through the kicks with top-ups, ▼ never out of the band`,
      aim !== null && aim.belowDrag && held0 && engaged() && state().burn.auto.mode === 'landing-orbit' && flown.burns >= 1
      && fitNow().rp > state().level.ring.min && state().burn.fuelPct >= AUTO_FUEL_RESERVE_PCT, `${phase()} ${flown.burns} rp ${fitNow().rp.toFixed(0)}`);
  }
  console.log(`INFO R13 measured: ${kicks} kicks, ${topUps} top-ups (FUEL ${(fuelUsed / Math.max(1, kicks)).toFixed(2)}% a kick), `
    + `${costs} cost a window, ${keeps} re-aimed lower to keep one`);
  check('…L10\'s slot says v3\'s words while it holds under the line', decayLines > 0, String(decayLines));
  // The reserve: the next top-up would leave under 20%.
  const fuelNow = state().burn.fuelPct;
  h.store.update((draft) => { draft.burn.fuelPct = AUTO_FUEL_RESERVE_PCT + 0.05; });
  fly(900, () => phase() === 'done');
  check('the reserve: a top-up that would leave under 20% ends it (`AUTOBURN v3 KEEPS 20% FUEL — the orbit is yours`)', phase() === 'done'
    && state().burn.auto.end === 'reserve' && said(AUTOBURN_TEXT.reserveOrbit) && threadsBusy() === 0, `${phase()} ${state().burn.auto.end} (FUEL was ${fuelNow.toFixed(1)})`);
}

finish();
