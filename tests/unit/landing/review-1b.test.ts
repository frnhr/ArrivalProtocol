// Slice 1b's review fixes (docs/phase3/impl/slice-1b-plan.md "Deviations (review fixes)"), each from a small state built
// here (and the two follow-up fixes: GO LOWER aimed at a window its ◇ precedes, the lift holding a needed low orbit): B1 (END LANDING and the auto-ends on a path into the planet; a crash after the landing ended, LAST LIGHT too), M1
// (no drop dot with no fuel: L12-nodrop and its auto-end), M2 (ghost thrust in landing: the SWAP row, the SKIP's stop on
// the landing's first burst, the bursts at LANDING_BURN_POWER), and the minors' checks (L9 with an empty tank, the decay
// chip and L10 at 0 orbits, a declined GO LOWER's lifetime, GO LOWER held by hand under MANUAL, L3b's WIDE DROP twin, the
// GROUND TRACK with NO BAY CTRL, GO LOWER under the DRAG line).
import { check, finish } from './checks';
import { lockOn, ensureLandingKeys } from './harness-landing';
import { createHarness7 } from '../wp7/harness7';
import { endLanding, requestLaunch } from '@systems/landing';
import { resetReport } from '@systems/reset';
import { getPrediction } from '@systems/predict';
import { getDropSolution } from '@systems/drop-cache';
import { bayWindowModel } from '@systems/landing-hud';
import { dropTooWide, landingMoment, landingResult, landingStuck, liftHold } from '@systems/landing-rules';
import { decayForecast, decayLiftAhead, dragLineKm, landingBurnOffer, offerInTac } from '@systems/landing-orbit';
import { lossPlan, shipLost } from '@systems/run';
import { elementsFromState, stateFromElements } from '@/types/orbit';
import { DRIVER_RULES } from '@data/script';
import { END_LANDING_REFUSAL_TEXT, LANDING_GHOST_LINES, LANDING_NODROP_LINES } from '@data/landing-text';
import { DECAY_WARN_ORBITS, GO_LOW_FLOOR_MARGIN_KM, LANDING_BURN_POWER, LANDING_NONE_LEFT_SEC } from '@data/tuning';
import { on } from '@systems/events';
import { capabilitiesNow } from '@systems/capabilities';
import { actionSwap } from '@state/actions';
import type { GameState } from '@state/schema';

const ARES = 0;
const KESTREL = 2;
const VESPER = 3;
const LAST_LIGHT = 4;
const h = createHarness7(1);
const state = (): GameState => h.store.getState();
const mu = (): number => state().level.planet.mu;
const shown = (): { id: string; text: string } | null => h.shown();
const fates = (): string => state().landing.pods.map((record) => record.fate.kind).join(',');

// A ship alone, HOLLOW asleep, the lessons done, every file at 100 (no ghost thrust, all drop factors 1).
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

// The ship put on a conic with ▼ `rpKm`, eccentricity `e`, at true anomaly `nu` from the ship's angle now.
function putOn(rpKm: number, e: number, nu: number): void {
  const here = Math.atan2(state().orbit.y, state().orbit.x);
  const at = stateFromElements(rpKm, e, here - nu, nu, mu());
  h.store.update((draft) => { draft.orbit = { x: at.x, y: at.y, vx: at.vx, vy: at.vy }; });
}

// --- B1: END LANDING and the auto-ends wait out a path into the planet --------------------------------------------------
{
  board(KESTREL);
  lockOn(h);
  h.stepFor(0.3);
  putOn(1000, 0.85, -2.6);
  h.stepFor(0.2);
  const impact = getPrediction().outcome === 'impact';
  const refused = endLanding(h.store);
  const bay = bayWindowModel(state(), getDropSolution(), getPrediction().outcome);
  check('B1: END LANDING on an impact course is refused (IMPACT), the landing goes on, no pod parked',
    impact && refused === 'IMPACT' && state().landing.ended === null && !fates().includes('parked'), `${refused} · ${fates()}`);
  check('…the POD BAY\'s END LANDING says DON\'T HIT THE PLANET first, disabled',
    bay.endLanding.label === END_LANDING_REFUSAL_TEXT && !bay.endLanding.enabled, JSON.stringify(bay.endLanding));
  // Every pod away (written directly: the all-launched auto-end is the hold under test): it waits for the impact.
  h.store.update((draft) => { for (const record of draft.landing.pods) record.fate = { kind: 'not-launched' }; });
  h.stepFor(0.3);
  check('…every pod away on an impact course: the all-launched auto-end waits', state().landing.ended === null && state().run.phase === 'landing',
    String(state().landing.ended));
  lockOn(h);
  h.stepFor(0.5);
  check('…back on a safe orbit, it ends on its own (all-launched)', state().landing.ended === 'all-launched', String(state().landing.ended));
}

// --- B1: a crash after the landing ended (the linger) is a crash: LOST card, pods NOT LAUNCHED --------------------------
function crashAfterEnd(index: number, label: string): void {
  board(index);
  lockOn(h);
  h.stepFor(0.3);
  const ended = endLanding(h.store);
  const parkedAtEnd = fates().split(',').every((fate) => fate === 'parked');
  // ▼ under the surface, the ship a couple of hundred km up and falling: the ground comes inside the linger.
  putOn(1000, 0.85, -2.18);
  h.stepUntil(() => state().burn.status !== 'locked' || state().run.phase !== 'landing', 5);
  const s = state();
  const tally = landingResult(s, 'crashed');
  check(`B1 ${label}: END LANDING on a safe orbit parks the pods`, ended === null && parkedAtEnd, `${ended} · ${fates()}`);
  check(`…then the coasting ship hits the ground before the report: CRASHED, paused, the LOST card (shipLost)`,
    s.burn.status === 'crashed' && s.run.phase === 'landing' && s.clock.paused && shipLost(s), `${s.burn.status} · ${s.run.phase}`);
  check('…the parked pods rode the ship: NOT LAUNCHED in the state and in the result, none parked',
    fates().split(',').every((fate) => fate === 'not-launched') && tally.parked.length === 0 && tally.notLaunched === tally.colonistsAboard,
    `${fates()} · parked ${tally.parked.length} · not launched ${tally.notLaunched}/${tally.colonistsAboard}`);
  h.stepFor(2);
  check('…and the LANDING REPORT never opens under the card', state().run.phase === 'landing', state().run.phase);
}
crashAfterEnd(KESTREL, 'KESTREL');
check('…KESTREL\'s card transmits on (a crash, not the flagship)', lossPlan(state()).kind === 'transmit', JSON.stringify(lossPlan(state())));
crashAfterEnd(LAST_LIGHT, 'LAST LIGHT');
{
  const plan = lossPlan(state());
  check('…LAST LIGHT\'s card ends the run: flagship-lost', plan.kind === 'end' && plan.cause === 'flagship-lost', JSON.stringify(plan));
}

// --- M1: no drop dot with no fuel: L12-nodrop, then the landing ends by itself ('no-drop') -------------------------------
{
  board(ARES);
  lockOn(h);
  // An e 0.7 loop is outside the drop solver's domain (no dot), and the tank is dry: nothing brings a window back.
  putOn(5600, 0.7, 0.3);
  h.store.update((draft) => { draft.burn.fuelPct = 0; });
  h.stepFor(0.5);
  const row = shown();
  check('M1: no dot, no fuel: the strip says NO DROP DOT ON THIS ORBIT — END LANDING (L12-nodrop)',
    row?.id === 'landing-L12-nodrop' && row.text === LANDING_NODROP_LINES.L12noDrop, `${row?.id} '${row?.text}'`);
  check('…landingStuck names it', landingStuck(state(), getDropSolution()) === 'no-drop');
  h.stepUntil(() => state().landing.ended !== null, LANDING_NONE_LEFT_SEC + 3);
  check(`…and after ${LANDING_NONE_LEFT_SEC} s the landing ends by itself ('no-drop'), the pods parked in orbit`,
    state().landing.ended === 'no-drop' && fates().split(',').every((fate) => fate === 'parked'), `${state().landing.ended} · ${fates()}`);
  board(ARES);
  lockOn(h);
  putOn(5600, 0.7, 0.3);
  h.stepFor(0.5);
  check('…with FUEL left the landing does not end itself (a burn can still bring a dot back)',
    landingStuck(state(), getDropSolution()) === null && shown()?.id !== 'landing-L12-nodrop', `${shown()?.id}`);
}

// --- Minor 1: L9 says `fly lower` only when the tank pays for the burn; the aim is L9's own fit ------------------------
{
  // ARES-VII from a circular 8,950 km with LZ-A widened to 330 km: no sure window up there, GO LOWER's target ≈ 7,100 km.
  const widen = (): void => {
    board(ARES);
    h.store.update((draft) => { const lz = draft.landing.lzs[0]!; lz.widthKm = 330; lz.halfWidthRad = 165 / draft.level.planet.R; });
    lockOn(h, { r: 8950 });
  };
  const wide = (): ReturnType<typeof dropTooWide> => dropTooWide(state(), getDropSolution()!, capabilitiesNow(state()));
  widen();
  h.stepFor(1);
  const full = wide();
  const aim = state().landing.goLow;
  const offer = landingBurnOffer(state(), getPrediction());
  // (The aim is rewritten when it moves over 1 km or 5e-5 rad: landing.ts aimMoved.)
  check('minor 1: a full tank: L9 offers GO LOWER, and the aim is its very fit', full?.goLower !== null && full?.goLower !== undefined
    && aim !== null && Math.abs(aim.targetRadiusKm - full.goLower.targetRadiusKm) <= 1 && Math.abs(aim.launchRad - full.launchRad) <= 5e-5
    && h.shown()?.id === 'landing-L9'
    && /fly lower/.test(h.shown()?.text ?? ''), `${JSON.stringify(full)} · aim ${aim?.targetRadiusKm}`);
  const needKmS = offer?.reason === 'go-low' ? offer.dvKmS : null;
  widen();
  h.store.update((draft) => { draft.burn.fuelPct = 0; });
  h.stepFor(1);
  check('…an empty tank: no `fly lower` (no L9 with neither fix), no aim, no offer', wide() === null && state().landing.goLow === null
    && !/fly lower/.test(h.shown()?.text ?? '') && landingBurnOffer(state(), getPrediction()) === null, `${h.shown()?.id} '${h.shown()?.text}'`);
  widen();
  if (needKmS !== null) h.store.update((draft) => { draft.burn.fuelPct = (0.9 * needKmS / draft.level.dvBudgetKmS) * 100; });
  h.stepFor(1);
  check('…a tank 10 % short of the go-low burn: no `fly lower` either', needKmS !== null && wide() === null && state().landing.goLow === null,
    `need ${needKmS?.toFixed(4)} km/s · ${h.shown()?.text}`);
}

// --- Minor 5: the burn watched for a decline is forgotten when the landing ends (MERGE's reopen starts afresh) ----------
{
  board(ARES);
  h.store.update((draft) => { const lz = draft.landing.lzs[0]!; lz.widthKm = 330; lz.halfWidthRad = 165 / draft.level.planet.R; });
  lockOn(h, { r: 8950 });
  h.stepFor(1);
  const due = (): unknown => {
    const drift = resetReport().find((entry) => entry.name === 'landing');
    return drift === undefined ? null : (JSON.parse(drift.now) as { due: unknown }).due;
  };
  const watched = due();
  endLanding(h.store);
  check('minor 5: GO LOWER\'s offer is watched for a decline, and END LANDING forgets it', watched === 'go-low|point|LZ-A' && due() === null,
    `${String(watched)} → ${String(due())}`);
}

// --- Minor 4: a declined GO LOWER outlives its LZ's window; a launch into that LZ ends it -------------------------------
{
  board(KESTREL);
  lockOn(h);
  h.stepFor(0.3);
  // A GO LOWER declined for the LZ whose window comes second (crafted: the decline's lifetime is under test, not how it
  // came about).
  const first = landingMoment(state(), getDropSolution(), state().clock.tSec, false).target?.lz;
  const other = state().landing.lzs.find((lz) => lz.label !== first)!.label;
  h.store.update((draft) => { draft.landing.declined = { key: `go-low|point|${other}`, untilLz: other }; });
  const closed: string[] = [];
  const off = on('window-closed', ({ lz }) => { closed.push(lz); });
  let launched: string | null = null;
  const end = h.wall() + 120;
  while (h.wall() < end && launched === null) {
    h.step();
    const open = state().landing.window;
    if (open !== null && open.sure && state().landing.bay.cadenceLeftTac <= 0) {
      const result = requestLaunch(h.store, { source: 'player' });
      if (result.kind === 'launched') launched = open.lz;
    }
    if (state().clock.skipWarp === null && h.shown()?.keys.includes('F')) h.press('KeyF');
  }
  const afterOther = state().landing.declined;
  check('minor 4: a launch into another LZ keeps its LZ\'s declined GO LOWER', launched !== null && launched !== other && afterOther?.untilLz === other,
    `launched into ${launched} · ${JSON.stringify(afterOther)}`);
  while (h.wall() < end + 240 && !closed.includes(other)) {
    h.step();
    if (state().clock.skipWarp === null && h.shown()?.keys.includes('F')) h.press('KeyF');
  }
  check('…its LZ\'s window closing keeps it too (it came back every orbit)', closed.includes(other) && state().landing.declined?.untilLz === other,
    `closed ${closed.join(',')} · ${JSON.stringify(state().landing.declined)}`);
  let intoB = false;
  while (h.wall() < end + 600 && !intoB) {
    h.step();
    const open = state().landing.window;
    if (open?.lz === other && open.sure && state().landing.bay.cadenceLeftTac <= 0) intoB = requestLaunch(h.store, { source: 'player' }).kind === 'launched';
    if (state().clock.skipWarp === null && h.shown()?.keys.includes('F')) h.press('KeyF');
  }
  off();
  check('…a launch into its LZ ends it', intoB && state().landing.declined === null, JSON.stringify(state().landing.declined));
  // A declined trim (no LZ) still ends on any launch (risk 2).
  h.store.update((draft) => { draft.landing.declined = { key: 'rp-low|peri', untilLz: null }; });
  let any = false;
  while (h.wall() < end + 900 && !any && state().landing.ended === null) {
    h.step();
    const open = state().landing.window;
    if (open !== null && open.sure && state().landing.bay.cadenceLeftTac <= 0) any = requestLaunch(h.store, { source: 'player' }).kind === 'launched';
    if (state().clock.skipWarp === null && h.shown()?.keys.includes('F')) h.press('KeyF');
  }
  check('…a declined trim still ends on any launch', any && state().landing.declined === null, JSON.stringify(state().landing.declined));
}

// --- Minor 7: GO LOWER held by hand under MANUAL (a failing Autopilot) ---------------------------------------------------
{
  board(ARES);
  h.store.update((draft) => {
    const lz = draft.landing.lzs[0]!;
    lz.widthKm = 330;
    lz.halfWidthRad = 165 / draft.level.planet.R;
    for (const seg of draft.memory) if (seg.role === 'autopilot' && 'integrity' in seg) seg.integrity = 20;
  });
  lockOn(h, { r: 8950 });
  // A perfect hand on Q/E: the heading kept RETRO, no preset.
  const pointRetro = (): void => h.store.update((draft) => {
    draft.burn.heading = Math.atan2(-draft.orbit.vy, -draft.orbit.vx);
    draft.burn.omega = 0;
  });
  let held = false;
  let keep = false;
  let releaseRow = false;
  let holding = false;
  const rows: string[] = [];
  const end = h.wall() + 200;
  while (h.wall() < end) {
    pointRetro();
    h.step();
    const line = h.shown();
    if (rows[rows.length - 1] !== line?.id) rows.push(line?.id ?? '');
    if (state().landing.goLow?.held === true) held = true;
    if (line?.id === 'GO-LOW-keep') keep = true;
    if (holding && line?.id === 'GO-LOW-release') { releaseRow = true; h.keyUp('Space'); holding = false; break; }
    if (holding) continue;
    if ((line?.text ?? '').includes('HOLD [SPACE] NOW')) { h.keyDown('Space'); holding = true; }
    else if (line?.keys.includes('F') && state().clock.skipWarp === null) h.press('KeyF');
  }
  if (holding) h.keyUp('Space');
  h.stepFor(1);
  check('minor 7: under MANUAL (Autopilot failing), pointed RETRO by hand, GO LOWER is held: KEEP HOLDING, then RELEASE',
    state().burn.sasMode === 'off' && held && keep && releaseRow && state().landing.goLow?.held !== true, rows.join(' > '));
}

// --- GO LOWER under the DRAG line on a drag ship: when does the lift come? ----------------------------------------------
{
  // KESTREL (band 5,000–7,000, the DRAG line at 5,500) from a circular 6,800 km, one LZ 190 km wide: GO LOWER's target is
  // the floor (5,100 km), under the line. One LZ, so the go-low's ◇ comes before the window it is for.
  board(KESTREL);
  h.store.update((draft) => {
    draft.landing.lzs = [{ ...draft.landing.lzs[0]!, pods: draft.landing.pods.length, widthKm: 190, halfWidthRad: 95 / draft.level.planet.R }];
  });
  lockOn(h, { r: 6800 });
  const events: string[] = [];
  const offEvents = [
    on('go-low', ({ phase }) => { if (phase === 'released') events.push('released'); }),
    on('window-closed', () => { events.push('closed'); }),
  ];
  let holding = false;
  let releaseAt: number | null = null;
  let lift: { orbits: number | null; closedBefore: number; windowAtBurn: boolean | null; burnAt: number } | null = null;
  const end = h.wall() + 400;
  while (h.wall() < end && state().run.phase === 'landing') {
    h.step();
    const pred = getPrediction();
    if (lift === null && landingBurnOffer(state(), pred)?.reason === 'lift') {
      const released = events.indexOf('released');
      lift = {
        orbits: decayForecast(state().orbit, mu(), state().level.ring, true).orbitsToLeave,
        closedBefore: released < 0 ? -1 : events.slice(released).filter((event) => event === 'closed').length,
        windowAtBurn: null,
        burnAt: state().clock.tSec + offerInTac(state(), pred)! * state().level.tacticalWarp,
      };
    }
    if (lift !== null && lift.windowAtBurn === null && state().clock.tSec >= lift.burnAt) { lift.windowAtBurn = state().landing.window !== null; break; }
    const line = h.shown();
    const text = line?.text ?? '';
    if (releaseAt !== null && h.wall() >= releaseAt - 1e-9) { h.keyUp('Space'); holding = false; releaseAt = null; continue; }
    if (holding && /^RELEASE/.test(text) && releaseAt === null) releaseAt = h.wall() + 0.3;
    if (holding) continue;
    const goLowRow = (line?.id ?? '').startsWith('GO-LOW');
    if (goLowRow && text.includes('press [S]')) h.press('KeyS');
    if (goLowRow && (text.includes('HOLD [SPACE] NOW') || text.includes('hold [SPACE]'))) { h.keyDown('Space'); holding = true; }
    else if (line?.keys.includes('L')) h.press('KeyL');
    else if (line?.keys.includes('F') && state().clock.skipWarp === null) h.press('KeyF');
  }
  for (const off of offEvents) off();
  const rp = elementsFromState(state().orbit, mu()).rp;
  check('GO LOWER under the DRAG line: flown and released (▼ under the line, in the band)', events.includes('released')
    && rp < dragLineKm(state().level.ring), `▼ ${rp.toFixed(0)} km · ${events.slice(0, 4).join(',')}`);
  check('…the lift is offered while ▼ is still in the band, from twice the warning (not before decay matters)',
    lift !== null && lift.orbits !== null && lift.orbits > DECAY_WARN_ORBITS && decayLiftAhead(lift.orbits), JSON.stringify(lift));
  check('…not before the window the GO LOWER was for has had its pods, and its START BURN falls between windows',
    lift !== null && lift.closedBefore >= 1 && lift.windowAtBurn === false, JSON.stringify(lift));
}

// A kid who follows the strip through GO LOWER, its release (0.3 s after RELEASE), the lift and the launches, pressing
// [F] when offered; `onTick` sees every tick. Returns the GO LOWER holds per LZ, the lifts flown and the lowest ▼.
function followThroughGoLower(maxWall: number, onTick: () => void = () => {}): { held: Record<string, number>; lifts: number; minRp: number } {
  const held: Record<string, number> = {};
  const off = on('go-low', ({ lz, phase }) => { if (phase === 'held') held[lz] = (held[lz] ?? 0) + 1; });
  let holding = false;
  let releaseAt: number | null = null;
  let lifts = 0;
  let minRp = Infinity;
  const end = h.wall() + maxWall;
  while (h.wall() < end && state().run.phase === 'landing') {
    h.step();
    onTick();
    minRp = Math.min(minRp, elementsFromState(state().orbit, mu()).rp);
    const line = h.shown();
    const text = line?.text ?? '';
    if (releaseAt !== null && h.wall() >= releaseAt - 1e-9) { h.keyUp('Space'); holding = false; releaseAt = null; continue; }
    if (holding && /^RELEASE/.test(text) && releaseAt === null) releaseAt = h.wall() + 0.3;
    if (holding) continue;
    const preset = text.match(/press \[([WASD])\]/);
    if (preset) h.press(`Key${preset[1]}`);
    if (/HOLD \[SPACE\] NOW|hold \[SPACE\]/.test(text)) {
      h.keyDown('Space');
      holding = true;
      if ((line?.id ?? '').startsWith('LIFT')) lifts++;
    } else if (line?.keys.includes('L')) h.press('KeyL');
    else if (line?.keys.includes('F') && state().clock.skipWarp === null) h.press('KeyF');
  }
  if (holding) h.keyUp('Space');
  off();
  return { held, lifts, minRp };
}

// --- Review fix 1: GO LOWER aims at a window its ◇ comes before (KESTREL: three LZs less than half an orbit apart) ----
{
  // From 6,800 km every LZ's dot is too wide; the ◇ of the next window (half an orbit before its launch point) always
  // came after that window, so GO LOWER was never flown. Now it aims at the soonest window its ◇ still precedes.
  board(KESTREL);
  h.store.update((draft) => { for (const lz of draft.landing.lzs) { lz.widthKm = 190; lz.halfWidthRad = 95 / draft.level.planet.R; } });
  lockOn(h, { r: 6800 });
  let flyLowerElsewhere = '';
  let heldFor: { lz: string; windowInSec: number } | null = null;
  let sureAfter = false;
  const offSure = on('window-sure', ({ lz }) => { if (heldFor !== null && lz === heldFor.lz) sureAfter = true; });
  const offHeld = on('go-low', ({ lz, phase }) => {
    if (phase !== 'held' || heldFor !== null) return;
    const w = landingMoment(state(), getDropSolution(), state().clock.tSec, false).upcoming.find((candidate) => candidate.lz === lz);
    heldFor = { lz, windowInSec: w?.launchInSec ?? -1 };
  });
  followThroughGoLower(400, () => {
    // The rule: `or fly lower` only for the LZ GO LOWER is aimed at (whose ◇ comes before its window).
    const text = h.shown()?.text ?? '';
    const named = /^DROP TOO WIDE FOR (LZ-[A-Z])\b.*fly lower/.exec(text)?.[1];
    if (named !== undefined && state().landing.goLow?.lz !== named) flyLowerElsewhere ||= `${text} (aim ${state().landing.goLow?.lz})`;
  });
  offSure();
  offHeld();
  const fixed = heldFor as { lz: string; windowInSec: number } | null;
  check('fix 1: KESTREL, three LZs: GO LOWER is flown, its ◇ before the window it is for', fixed !== null && fixed.windowInSec > 0,
    JSON.stringify(fixed));
  check('…and flying it gives that window a sure fit (WINDOW SURE)', sureAfter, String(sureAfter));
  check('…L9 never says `fly lower` for a window GO LOWER is not aimed at', flyLowerElsewhere === '', flyLowerElsewhere);
  check('…every pod down', state().landing.pods.every((record) => record.fate.kind === 'down'), fates());
}

// --- Review fix 2: after GO LOWER under the DRAG line the lift holds the low orbit (no GO LOWER ↔ lift turns) -----------
{
  // KESTREL from a circular 6,000 km, one LZ 125 km wide holding three pods: its dot only fits under the DRAG line (from
  // the normal lift's 5,550 km it has no sure part), so the lift must hold ▼ low; before, it took ▼ back over the line
  // and L9 sent the kid down again (GO LOWER held three times).
  board(KESTREL);
  h.store.update((draft) => {
    draft.landing.lzs = [{ ...draft.landing.lzs[0]!, pods: 3, widthKm: 125, halfWidthRad: 62.5 / draft.level.planet.R }];
    draft.landing.pods.forEach((record, i) => { if (i >= 3) record.fate = { kind: 'not-launched' }; });
  });
  lockOn(h, { r: 6000 });
  const hold = liftHold(state());
  const run = followThroughGoLower(400);
  const placed = state().landing.pods.slice(0, 3).map((record) => (record.fate.kind === 'down' ? record.fate.touchdown.place : record.fate.kind));
  check('fix 2: with an LZ that needs the low orbit, the lift holds it (▼ ≥ floor + margin, ▲ mid-band), not the DRAG line',
    hold !== null && hold.rpKm === state().level.ring.min + GO_LOW_FLOOR_MARGIN_KM && hold.raKm === 6000, JSON.stringify(hold));
  check('…a kid following the strip flies GO LOWER once, the lift at least once, and never sees GO LOWER again',
    run.held['LZ-A'] === 1 && Object.keys(run.held).length === 1 && run.lifts >= 1, JSON.stringify(run));
  check('…every pod lands in the LZ, ▼ in the band throughout', placed.every((place) => place === 'lz') && run.minRp >= state().level.ring.min,
    `${placed.join(',')} · ▼ ≥ ${run.minRp.toFixed(0)} km`);
  check('…and the landing over, the normal lift is back (no LZ with room needs the low orbit)', liftHold(state()) === null);
}

// --- M2: ghost thrust in the landing ---------------------------------------------------------------------------------
{
  // The landing's first burst is a SKIP's stop and a TACTICAL moment, though the flight had its bursts (keyed per phase).
  board(VESPER, false);
  h.store.update((draft) => { draft.burn.ghostBursts = 5; });
  lockOn(h);
  h.stepFor(0.3);
  const starts: { inSkip: boolean; count: number }[] = [];
  const off = on('ghost-start', (payload) => { starts.push({ inSkip: payload.inSkip, count: payload.count }); });
  let skipped = false;
  let paceAtBurst: string | null = null;
  let accelRatio: number | null = null;
  const end = h.wall() + 60;
  while (h.wall() < end && state().landing.ghostBursts === 0) {
    if (state().clock.skipWarp === null && !skipped && h.shown()?.keys.includes('F')) { h.press('KeyF'); skipped = state().clock.skipWarp !== null; }
    h.step();
  }
  if (state().landing.ghostBursts > 0) {
    h.step();
    paceAtBurst = state().clock.pace;
    // A tick wholly inside the burst: the Δv it delivered against the burst's own push at the landing's power.
    const t0 = state().clock.tSec;
    h.step();
    const ghost = state().burn.ghost;
    const dt = state().clock.tSec - t0;
    if (ghost !== null && ghost.startTSec <= t0 && ghost.endTSec >= state().clock.tSec && dt > 0) {
      accelRatio = state().burn.lastTickDvKmS / dt / (state().level.aNominalKmS2 * ghost.amp);
    }
  }
  off();
  const first = starts[0];
  check('M2: a SKIP during the landing stops on the landing\'s FIRST burst (not flown through), though the flight had 5',
    skipped && first !== undefined && !first.inSkip && first.count === 6 && state().landing.ghostBursts >= 1, JSON.stringify(starts.slice(0, 2)));
  check('…and that burst runs at TACTICAL', paceAtBurst === 'tactical', String(paceAtBurst));
  check(`…at LANDING_BURN_POWER (${LANDING_BURN_POWER}) of its push`, accelRatio !== null && Math.abs(accelRatio - LANDING_BURN_POWER) < 0.02,
    String(accelRatio?.toFixed(3)));
  // From the first burst on, the strip names the cause and its fix.
  h.stepFor(4);
  const row = h.shown();
  check('M2: …then the strip says THE ENGINE FIRES BY ITSELF — [TAB], SWAP THRUST CTRL (L7b)',
    row?.id === 'landing-L7b' && row.text.startsWith(LANDING_GHOST_LINES.swap) && row.keys.includes('TAB'), `${row?.id} '${row?.text}'`);
  const controller = state().memory.find((seg) => seg.role === 'thrust-ctrl');
  const refusal = controller === undefined ? 'no controller' : actionSwap(h.store, controller);
  h.stepUntil(() => capabilitiesNow(state()).thrustCtrl.ghost === null, 20);
  h.stepFor(3);
  check('…a SWAP to Thrust.alt silences it, and the row goes', refusal === null && capabilitiesNow(state()).thrustCtrl.ghost === null
    && !(h.shown()?.id ?? '').startsWith('landing-L7b'), `${refusal} · ${h.shown()?.id}`);
}

finish();
