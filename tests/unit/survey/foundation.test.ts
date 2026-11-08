// Slice 6 FOUNDATION (docs/phase3/impl/slice-6-plan.md §6.1, §7.1): SURVEY's state, data, seams and save, store level,
// about two seconds. Nothing here is the survey machine's behaviour (Track SWATH's suites own it) or a view's (Track SITES's);
// it checks the contract they build on:
// • what this build plays: one `built` check per gate, each on its own line (Track SWATH edits both);
// • ShipDef.site from the map's reservation (run 1, seed 7: plan §1.2's table); siteDataOf's gate;
// • the site roll (R2–R4, R9): 2,000 rolls over layers 5–7 and pods 4–16 on the landing roller's own landings, and every POOR
//   ship of run 1's arms on seeds 1–10, pass validateSurveySites; exactly one bad guess, ROCKY or WET about evenly, WET at
//   2/3 of its class, a wreck about 1 in 3; the same ShipKey gives the same sites; the roll draws its own stream;
// • the state build: a POOR CORMORANT's LZs stand on CONTROL's guesses (a FLAT guess exactly where the GOOD build puts its
//   LZ; the bad one hidden, a WET one narrower), nothing mapped; with the gate down every planet plays GOOD;
// • the touchdown ground rule (ROCKY and WET land hard), groundAt; sitesRev in the three memo keys; the yieldable thread (a
//   preempting claim takes it, nothing else does); the boot's SITE DATA POOR line and its place; the record;
// • the save: the v5 fixtures (tests/unit/save/fixtures/run-save-v5-*: SHIP DONE at VESPER's desk, the BEAM into CORMORANT on
//   seed 7) migrate to v6, decode and resume; with both gates raised the CORMORANT BEAM resumes into the LZs and sites a fresh
//   boot builds, and its SHIP DONE records the survey and decodes; the codec's v6 refusals;
// • the lead's words fit the strip.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { LaunchRecord, LzWidth, ShipLandingDef, LandingState } from '@/types/landing';
import type { SurveySite } from '@/types/survey';
import type { ShipKey } from '@/types/map';
import { createStore } from '@state/store';
import { createInitialState, createShipSlices, createSurveyState } from '@state/initial';
import { SURVEY_BUILT, siteDataOf } from '@data/survey';
import { SKILL_TREE } from '@data/skills';
import { rollSurveySites, validateSurveySites, guessSiteId } from '@data/survey-sites';
import { SURVEY_TEXT, siteLabel } from '@data/survey-text';
import { SWATH_TEXT } from '@data/swath-text';
import { SITES_TEXT } from '@data/sites-text';
import { FLIGHT_TEMPLATES } from '@data/flight-templates';
import { shipDefAt } from '@systems/map-run';
import { rollLanding } from '@systems/landing-roller';
import { createRng } from '@systems/rng';
import { touchAtTouchdown } from '@systems/landing-rules';
import { groundAt, groundKnownAt, lzSiteOf, surveyRecordOf, mappedPct, surveyVersion } from '@state/survey-selectors';
import { mapBootLines } from '@systems/map-boot';
import { bootLinePlan, bootLine, BOOT_LINE_MAX } from '@data/script';
import { mountOpsCore, reserveThread, releaseThread, holdsThread, canClaimThread, canStartOp, threadsTotal, threadsBusy } from '@systems/ops-core';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { run1Map } from '../map/run1-fixture';
import { armShipSlices } from '../support/residents';
import { withSurvey, withSurveyBuilt, NO_SURVEY } from '../support/survey';
import { stubStorage, pageOpen, storedSave, toDesk } from '../save/save-fixture';
import { siteStars, surveyRunning, swathHalfRad } from '@systems/survey-model';
import { splitRimArcs } from '@systems/landing-hud';
import { angleDelta } from '@systems/landing-solve';
import { openBranchesAt } from '@systems/skill-tree';
import { visitNow } from '@systems/skill-levels';
import { LANDING_ECHO } from '@data/landing-text';
import {
  RUN_SAVE_VERSION, RUN_SAVE_KEY, META_STORAGE_KEY, MAX_LINE_CHARS, LZ_WIDTH_KM, WET_WIDTH_FACTOR, SURVEY_CELLS, SURVEY_EXTRA_SITES,
  BOOT_LINE_AT_SEC,
} from '@data/tuning';

const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
const GATES_AT_LOAD = { poor: SURVEY_BUILT.poor, built: SKILL_TREE.survey.built };

// --- What this build plays (plan §5: one check per gate, so Track SWATH raises each line on its own) -----------------------
// POOR: Track SWATH raised it first.
check('built: POOR plays POOR (Track SWATH)', SURVEY_BUILT.poor === true);
// SURVEY: Track SWATH raised it last.
check('built: SURVEY v1–v3 (Track SWATH)', SKILL_TREE.survey.built === 3);
// (end of the built checks)

// --- ShipDef.site and the gate -------------------------------------------------------------------------------------------
const SEED = 7;
const map7 = run1Map(SEED);
const CORMORANT = 15;
{
  const poor = map7.arm.filter((ship) => shipDefAt(map7, ship.slot).site === 'poor').map((ship) => `${ship.slot} ${ship.name}`);
  check('ShipDef.site is the map\'s reservation (run 1, seed 7: plan §1.2, SHEARWATER, CORMORANT and GOOD HOPE)',
    isDeepStrictEqual(poor, ['13 SHEARWATER', '15 CORMORANT', '17 GOOD HOPE'])
    && map7.arm.every((ship) => shipDefAt(map7, ship.slot).site === ship.reserved.site), poor.join(' | '));
  const cormorant = shipDefAt(map7, CORMORANT);
  check('siteDataOf: GOOD while POOR is not built, the map\'s roll once it is', withSurvey(NO_SURVEY, () => siteDataOf(cormorant)) === 'good'
    && withSurvey({ poor: true }, () => siteDataOf(cormorant)) === 'poor' && withSurvey({ poor: true }, () => siteDataOf(shipDefAt(map7, 11))) === 'good');
}

// --- The site roll (R2–R4, R9) --------------------------------------------------------------------------------------------
const PLANET_R = FLIGHT_TEMPLATES.wide.flight.planet.R;
{
  const landings: { what: string; def: ShipLandingDef }[] = [];
  for (const layer of [5, 6, 7]) {
    for (let pods = 4; pods <= 16; pods++) {
      for (let n = 0; n < 51; n++) {
        const key: ShipKey = { armSeed: 1000 + n, reportedRun: 1, slot: 3 + (n % 15), attempt: layer };
        landings.push({ what: `layer ${layer}, ${pods} pods, key ${n}`, def: rollLanding(key, layer, pods, null) });
      }
    }
  }
  for (let seed = 1; seed <= 10; seed++) {
    const map = run1Map(seed);
    for (const ship of map.arm) if (ship.reserved.site === 'poor') landings.push({ what: `seed ${seed} ${ship.name}`, def: shipDefAt(map, ship.slot).landing });
  }
  const failures: string[] = [];
  let rolls = 0;
  let wrecks = 0;
  let wet = 0;
  let oneBad = 0;
  let wetWidths = true;
  let counts = true;
  landings.forEach(({ what, def }, i) => {
    try {
      const sites = rollSurveySites(def, PLANET_R, createRng(7919 * (i + 1)));
      rolls++;
      const guesses = sites.filter((site) => site.kind === 'guess');
      const bad = guesses.filter((site) => site.ground !== 'flat');
      if (bad.length === 1) oneBad++;
      if (bad[0]?.ground === 'wet') wet++;
      if (sites.some((site) => site.kind === 'wreck')) wrecks++;
      if (sites.length !== 2 * def.lzs.length + SURVEY_EXTRA_SITES) counts = false;
      for (const site of sites) {
        const want = LZ_WIDTH_KM[site.width] * (site.ground === 'wet' ? WET_WIDTH_FACTOR : 1);
        if (site.widthKm !== want) wetWidths = false;
      }
    } catch (error) {
      failures.push(`${what}: ${(error as Error).message}`);
    }
  });
  check(`${rolls} rolls (layers 5–7, pods 4–16 on the landing roller's own landings, and every POOR ship of run 1 on seeds 1–10) pass validateSurveySites`,
    failures.length === 0 && rolls >= 2000, failures.slice(0, 3).join(' | '));
  check('…each with the guesses, one guaranteed site per LZ and SURVEY_EXTRA_SITES extras', counts);
  check('…exactly one bad guess on every planet (R3: POOR_BAD_GUESSES 1, POOR_EXTRA_BAD_GUESS_ODDS 0)', oneBad === rolls);
  check(`…ROCKY or WET about evenly (WET ${(100 * wet / rolls).toFixed(0)}%), a wreck on about 1 planet in 3 (${(100 * wrecks / rolls).toFixed(0)}%)`,
    Math.abs(wet / rolls - 0.5) < 0.05 && Math.abs(wrecks / rolls - 1 / 3) < 0.05);
  check('…every site as wide as its class, a WET one 2/3 of it (R4: the true width, from the boot)', wetWidths);
  const def = shipDefAt(map7, CORMORANT).landing;
  const sites = rollSurveySites(def, PLANET_R, createRng(5));
  check('validateSurveySites refuses a broken list: a missing guess, a second LZ\'s matching taken away, two sites on top of each other, a second bad guess',
    throws(() => validateSurveySites(def, PLANET_R, sites.slice(1)))
    && throws(() => validateSurveySites(def, PLANET_R, sites.map((site) => (site.kind === 'candidate' ? { ...site, ground: 'rocky' as const, widthKm: LZ_WIDTH_KM[site.width] } : site))))
    && throws(() => validateSurveySites(def, PLANET_R, sites.map((site, i) => (i === def.lzs.length + 1 ? { ...site, centreRad: sites[def.lzs.length]!.centreRad } : site))))
    && throws(() => validateSurveySites(def, PLANET_R, sites.map((site) => (site.kind === 'guess' ? { ...site, ground: 'rocky' as const, widthKm: LZ_WIDTH_KM[site.width], halfWidthRad: LZ_WIDTH_KM[site.width] / 2 / PLANET_R } : site))))
    && !throws(() => validateSurveySites(def, PLANET_R, sites)));
  check('…and the labels read `LZ-A GUESS`, `SITE 1`, `SITE n · WRECKAGE`', siteLabel(sites[0]!) === 'LZ-A GUESS'
    && siteLabel(sites[def.lzs.length]!) === 'SITE 1' && siteLabel({ kind: 'wreck', number: 5 }) === 'SITE 5 · WRECKAGE');
}

// --- The state build (R2, R4) -----------------------------------------------------------------------------------------------
{
  const good = withSurvey(NO_SURVEY, () => armShipSlices(SEED, CORMORANT).slices.landing);
  check('with POOR not built, CORMORANT plays GOOD: no sites, its LZs on no site, every ground FLAT, sitesRev 0',
    isDeepStrictEqual(good.survey, createSurveyState('good', [])) && good.lzs.every((lz) => lz.site === null && lz.ground === 'flat') && good.sitesRev === 0);
  const poor = withSurveyBuilt(() => armShipSlices(SEED, CORMORANT).slices.landing);
  const again = withSurveyBuilt(() => armShipSlices(SEED, CORMORANT).slices.landing);
  const guesses = poor.survey.sites.filter((site) => site.kind === 'guess');
  const bad = guesses.find((site) => site.ground !== 'flat')!;
  check(`with POOR built, CORMORANT is POOR: ${poor.survey.sites.length} sites on its own stream, the same on every build of the same ShipKey`,
    poor.survey.site === 'poor' && poor.survey.sites.length === 2 * poor.lzs.length + SURVEY_EXTRA_SITES && isDeepStrictEqual(poor.survey.sites, again.survey.sites));
  check('…each LZ stands on its guess (`guess-A` …), with its centre, width and the hidden ground; nothing found, rated or mapped',
    poor.lzs.every((lz, i) => {
      const site = lzSiteOf(poor, lz.label)!;
      return lz.site === guessSiteId(i) && site.centreRad === lz.centreRad && site.halfWidthRad === lz.halfWidthRad && site.widthKm === lz.widthKm
        && site.ground === lz.ground && !groundKnownAt(poor, lz.label);
    })
    && poor.survey.sites.every((site) => !site.found && !site.groundKnown) && poor.survey.mapped.length === SURVEY_CELLS && mappedPct(poor.survey) === 0);
  const goodTwin = (label: string) => good.lzs.find((lz) => lz.label === label)!;
  check(`…a FLAT guess exactly where the GOOD build puts its LZ; the bad one (${bad.id}, ${bad.ground.toUpperCase()}) at its centre, ${bad.ground === 'wet' ? 'a third narrower' : 'as wide'}`,
    poor.lzs.every((lz) => {
      const twin = goodTwin(lz.label);
      if (lz.ground === 'flat') return lz.centreRad === twin.centreRad && lz.halfWidthRad === twin.halfWidthRad && lz.widthKm === twin.widthKm;
      return lz.centreRad === twin.centreRad && lz.widthKm === twin.widthKm * (lz.ground === 'wet' ? WET_WIDTH_FACTOR : 1);
    }));
  check('…the record says POOR, nothing run, the bad LZ kept unknown; a GOOD planet keeps none (ShipResult.survey null)',
    isDeepStrictEqual(surveyRecordOf(poor), {
      ranAt: 0, mappedPct: 0, found: 0, moves: [],
      badKept: [{ lz: poor.lzs.find((lz) => lz.site === bad.id)!.label, ground: bad.ground, known: null }], movedOff: [],
    }) && surveyRecordOf(good) === null);
  // The other slices are the GOOD build's: the survey draws its own stream (the families, the hurt drivers, the zones, the
  // flight and the memory are unchanged).
  const slicesGood = withSurvey(NO_SURVEY, () => armShipSlices(SEED, CORMORANT).slices);
  const slicesPoor = withSurveyBuilt(() => armShipSlices(SEED, CORMORANT).slices);
  const strip = (slices: typeof slicesGood) => JSON.stringify({ ...slices, landing: { ...slices.landing, lzs: [], survey: null }, memory: slices.memory.map((seg) => seg.type === 'free' ? 'free' : seg) });
  check('…and every other part of the ship is the GOOD build\'s (the roll draws its own stream)', strip(slicesGood) === strip(slicesPoor));
  check('surveyVersion: 0 with no SURVEY.skl aboard, and 0 while SURVEY is not built', surveyVersion({ memory: [] }) === 0);
}

// --- The ground at touchdown (plan §2.4, §2.9) -------------------------------------------------------------------------------
{
  const launch = { driverIntegrity: 100 } as LaunchRecord;
  const worn = { driverIntegrity: 10 } as LaunchRecord;
  check('touchAtTouchdown: a healthy driver lands soft on FLAT and hard on ROCKY or WET; a failing driver hard anywhere',
    touchAtTouchdown(launch, 'flat') === 'soft' && touchAtTouchdown(launch, 'rocky') === 'hard' && touchAtTouchdown(launch, 'wet') === 'hard'
    && touchAtTouchdown(worn, 'flat') === 'hard');
  const landing = withSurveyBuilt(() => armShipSlices(SEED, CORMORANT).slices.landing);
  const bad = landing.lzs.find((lz) => lz.ground !== 'flat')!;
  check('groundAt: the LZ\'s ground (a mislanded pod stands on it too), FLAT off-site and in a no-go arc; an unknown LZ throws',
    groundAt(landing, bad.label) === bad.ground && groundAt(landing, null) === 'flat' && throws(() => groundAt(landing, 'LZ-Z')));
}

// --- sitesRev in the three memo keys (R13): each key reads it ----------------------------------------------------------------
{
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src', 'systems');
  const body = (file: string, fn: string): string => {
    const text = readFileSync(join(SRC, file), 'utf8');
    const at = text.indexOf(`function ${fn}(`);
    return at < 0 ? '' : text.slice(at, text.indexOf('\n}\n', at));
  };
  const keys = [['drop-cache.ts', 'fresh'], ['autoburn-v3.ts', 'aimKey'], ['autodrop-plan.ts', 'planKey']].filter(([file, fn]) => !body(file!, fn!).includes('landing.sitesRev'));
  check('sitesRev joins drop-cache fresh(), autoburn-v3 aimKey and autodrop-plan planKey (an LZ move re-solves, re-aims and re-plans)',
    keys.length === 0, keys.map(([file, fn]) => `${file} ${fn}`).join(', '));
}

// --- The yieldable thread (R8; ops-core) -------------------------------------------------------------------------------------
{
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  const unmount = mountOpsCore(store);
  const total = threadsTotal();
  for (let i = 0; i < total - 1; i++) reserveThread(`kid-${i}`);
  const surveyHeld = reserveThread('survey', { yieldable: true });
  const full = !canStartOp() && threadsBusy() === total;
  check(`a ${total}-thread Core: the kid's ops and SURVEY's yieldable thread fill it; canStartOp is false, canClaimThread true (a thread to take)`,
    surveyHeld && full && canClaimThread() && holdsThread('survey'));
  check('…a claim without `preempt` (the kid\'s, SENTRY\'s pre-empt) does not take it', !reserveThread('sentry-preempt') && holdsThread('survey'));
  const took = reserveThread('autoburn', { preempt: true });
  check('…AUTOBURN\'s preempting claim takes it: SURVEY no longer holds a thread, AUTOBURN does, the Core stays full',
    took && !holdsThread('survey') && holdsThread('autoburn') && threadsBusy() === total);
  check('…with nothing yieldable left, a preempting claim is refused, and canClaimThread is false', !canClaimThread() && !reserveThread('autodrop', { preempt: true }));
  releaseThread('autoburn');
  check('…released, a thread is free again (SURVEY claims again when one frees)', canStartOp() && reserveThread('survey', { yieldable: true }) && holdsThread('survey'));
  unmount();
}

// --- The boot line (plan §2.4) -----------------------------------------------------------------------------------------------
{
  const boot = (gates: typeof NO_SURVEY) => withSurvey(gates, () => {
    const { run, slices } = armShipSlices(SEED, CORMORANT);
    const state = { ...createInitialState({ seed: SEED }), run: { ...run, arrival: null }, ...slices } as GameState;
    return { state, map: mapBootLines(state), plan: bootLinePlan(state, 0) };
  });
  const off = boot(NO_SURVEY);
  const on = boot({ poor: true, built: 3 });
  check('the boot says `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs` on a planet that plays POOR, and nothing while POOR is not built',
    !off.map.includes('site-data') && !off.plan.includes('site-data') && on.map.includes('site-data')
    && bootLine('site-data', on.state, {} as never) === '> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs', on.plan.join(' '));
  check(`…BOOT_LINE_MAX ${BOOT_LINE_MAX} lines, each with its time`, BOOT_LINE_MAX >= 24 && BOOT_LINE_AT_SEC.length >= BOOT_LINE_MAX && BOOT_LINE_AT_SEC[23] === 30.4);
}

// --- The save: the v5 fixtures, the CORMORANT BEAM, the codec's v6 refusals ------------------------------------------------------
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
const fixture = (file: string): { save: Record<string, unknown>; meta: unknown } => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));

function resumeFixture(file: string): ReturnType<typeof createStore<GameState>> & { storage: ReturnType<typeof stubStorage> } {
  const { save, meta } = fixture(file);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  if (store.getState().save.status !== 'ok' || pendingRunSave() === null) throw new Error(`resumeFixture: ${file} is not offered (${JSON.stringify(store.getState().save)})`);
  resumeRun(store);
  return Object.assign(store, { storage });
}

type Payload = { run: GameState['run']; slices?: { landing: LandingState } };
withSurvey(NO_SURVEY, () => {
  for (const [file, point] of [['run-save-v5-ship-done-desk4.json', 'ship-done'], ['run-save-v5-beam-cormorant.json', 'beam']] as const) {
    const { save } = fixture(file);
    const migrated = migrateRunSave(save) as { saveVersion: number; payload: Payload };
    const decoded = decodeRunSave(JSON.stringify(save));
    check(`${file}: a v5 ${point} save migrates to v${RUN_SAVE_VERSION} and decodes`, save.saveVersion === 5 && migrated.saveVersion === RUN_SAVE_VERSION
      && decoded.ok, decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
    const landing = migrated.payload.slices?.landing;
    check('…every ended ship records no survey; a world payload\'s landing is GOOD at rest (no site, no move)',
      migrated.payload.run.ships.length > 0 && migrated.payload.run.ships.every((ship) => ship.survey === null)
      && (landing === undefined || (isDeepStrictEqual(landing.survey, createSurveyState('good', [])) && landing.sitesRev === 0
        && landing.lzs.every((lz) => lz.site === null))));
    const store = resumeFixture(file);
    check(`…and resumes (${point === 'beam' ? 'CORMORANT\'s boot' : 'VESPER\'s desk'}) playing GOOD`,
      store.getState().run.phase === (point === 'beam' ? 'boot' : 'desk') && store.getState().landing.survey.site === 'good');
  }
});

// The CORMORANT BEAM with both gates raised: the v5 save resumes into the LZs and sites a fresh boot of the same ship builds
// (plan R2: a v5 BEAM into a POOR ship plays POOR from its boot, intended), then its SHIP DONE records the survey and decodes.
withSurveyBuilt(() => {
  const { save } = fixture('run-save-v5-beam-cormorant.json');
  const payload = (migrateRunSave(save) as { payload: { run: GameState['run']; carried: Parameters<typeof createShipSlices>[1]; threat: Parameters<typeof createShipSlices>[2] } }).payload;
  const fresh = createShipSlices(payload.run, payload.carried, payload.threat);
  const store = resumeFixture('run-save-v5-beam-cormorant.json');
  const state = store.getState();
  check('the CORMORANT BEAM resumes POOR, its LZs and sites exactly as a fresh boot of the same ship builds them',
    state.landing.survey.site === 'poor' && isDeepStrictEqual(state.landing.survey, fresh.landing.survey) && isDeepStrictEqual(state.landing.lzs, fresh.landing.lzs));
  const plan = bootLinePlan(state, 0);
  const at = plan.indexOf('site-data');
  const after = ['ecc', 'seeds', 'sentry-seed', 'scripted'].map((kind) => plan.lastIndexOf(kind as never));
  const before = ['delivery', 'charge'].map((kind) => plan.indexOf(kind as never)).filter((index) => index >= 0);
  check('…its boot types SITE DATA POOR after the arrival\'s ECC and damage lines, before the deliveries and the charge (02 §4)',
    at > Math.max(...after) && before.length > 0 && before.every((index) => index > at), plan.join(' '));
  toDesk(store);
  const done = storedSave(store.storage);
  const result = store.getState().run.ships.at(-1)!;
  check('…its SHIP DONE records the survey (POOR, nothing run, the bad LZ kept, unknown) and decodes with the slice at rest',
    done.save.point === 'ship-done' && result.slot === CORMORANT && result.survey !== null && result.survey.ranAt === 0 && result.survey.badKept.length === 1
    && result.survey.badKept[0]!.known === null && done.save.payload.kind === 'world', JSON.stringify(result.survey));

  type Raw = { payload: { run: GameState['run']; slices: { landing: LandingState } } };
  const edit = (change: (raw: Raw) => void): string => {
    const raw = JSON.parse(done.raw) as Raw;
    change(raw);
    return JSON.stringify(raw);
  };
  const kind = (raw: string): string => {
    const decoded = decodeRunSave(raw);
    return decoded.ok ? 'ok' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`;
  };
  const candidate = (raw: Raw): SurveySite => raw.payload.slices.landing.survey.sites.find((site) => site.kind === 'candidate')!;
  const moveTo = (raw: Raw, lzIndex: number, site: SurveySite): void => {
    const lz = raw.payload.slices.landing.lzs[lzIndex]!;
    Object.assign(lz, { centreRad: site.centreRad, halfWidthRad: site.halfWidthRad, widthKm: site.widthKm, ground: site.ground, site: site.id });
  };
  const cases: [string, string, boolean][] = [
    ['the save as written', done.raw, true],
    ['an LZ moved to a candidate, with its move and sitesRev', edit((raw) => {
      const site = candidate(raw);
      if (site.roomPods < raw.payload.slices.landing.lzs[0]!.pods) site.roomPods = raw.payload.slices.landing.lzs[0]!.pods;
      const from = raw.payload.slices.landing.lzs[0]!.site!;
      moveTo(raw, 0, site);
      raw.payload.slices.landing.survey.moves.push({ lz: raw.payload.slices.landing.lzs[0]!.label, from, site: site.id });
      raw.payload.slices.landing.sitesRev = 1;
    }), true],
    ['…the move made, sitesRev left at 0', edit((raw) => {
      const site = candidate(raw);
      const from = raw.payload.slices.landing.lzs[0]!.site!;
      moveTo(raw, 0, site);
      raw.payload.slices.landing.survey.moves.push({ lz: raw.payload.slices.landing.lzs[0]!.label, from, site: site.id });
    }), false],
    ['a move with no `from` (review M7)', edit((raw) => {
      const site = candidate(raw);
      moveTo(raw, 0, site);
      raw.payload.slices.landing.survey.moves.push({ lz: raw.payload.slices.landing.lzs[0]!.label, site: site.id } as never);
      raw.payload.slices.landing.sitesRev = 1;
    }), false],
    ['…a move off a site the survey does not have', edit((raw) => {
      const site = candidate(raw);
      moveTo(raw, 0, site);
      raw.payload.slices.landing.survey.moves.push({ lz: raw.payload.slices.landing.lzs[0]!.label, from: 'site-99', site: site.id });
      raw.payload.slices.landing.sitesRev = 1;
    }), false],
    ['SURVEY holding its thread at a save point', edit((raw) => { raw.payload.slices.landing.survey.claimed = true; }), false],
    ['…its last angle kept', edit((raw) => { raw.payload.slices.landing.survey.lastRad = 1.2; }), false],
    ['an LZ on a site the survey does not have', edit((raw) => { raw.payload.slices.landing.lzs[0]!.site = 'site-99'; }), false],
    ['two LZs on one site', edit((raw) => { moveTo(raw, 1, raw.payload.slices.landing.survey.sites[0]!); }), false],
    ['an LZ whose geometry is not its site\'s', edit((raw) => { raw.payload.slices.landing.lzs[0]!.centreRad += 0.01; }), false],
    ['…whose ground is not its site\'s', edit((raw) => {
      const landing = raw.payload.slices.landing;
      const lz = landing.lzs.find((zone) => zone.ground === 'flat')!;
      lz.ground = 'wet';
    }), false],
    ['an LZ on the wreck', edit((raw) => {
      const wreck = raw.payload.slices.landing.survey.sites.find((site) => site.kind === 'wreck');
      if (wreck === undefined) { raw.payload.slices.landing.lzs[0]!.site = 'no-wreck-here'; return; }
      moveTo(raw, 0, wreck);
    }), false],
    ['71 mapped cells', edit((raw) => { raw.payload.slices.landing.survey.mapped.pop(); }), false],
    ['a move naming no LZ', edit((raw) => { raw.payload.slices.landing.survey.moves.push({ lz: 'LZ-Z', from: 'guess-A', site: 'site-1' }); raw.payload.slices.landing.sitesRev = 1; }), false],
    ['a reveal naming no site', edit((raw) => { raw.payload.slices.landing.survey.reveals.push({ site: 'site-99', by: 'survey' }); }), false],
    ['two sites with one id', edit((raw) => { raw.payload.slices.landing.survey.sites.push(structuredClone(raw.payload.slices.landing.survey.sites.at(-1)!)); }), false],
    ['a POOR planet\'s LZ on no site', edit((raw) => { raw.payload.slices.landing.lzs[0]!.site = null; }), false],
    ['sites on a GOOD planet', edit((raw) => { raw.payload.slices.landing.survey.site = 'good'; }), false],
    ['a ship\'s record mapping 101%', edit((raw) => { raw.payload.run.ships.at(-1)!.survey!.mappedPct = 101; }), false],
    ['…with no survey field', edit((raw) => { delete (raw.payload.run.ships.at(-1) as unknown as Record<string, unknown>).survey; }), false],
    ['…with no movedOff (review M7)', edit((raw) => { delete (raw.payload.run.ships.at(-1)!.survey as unknown as Record<string, unknown>).movedOff; }), false],
    ['a GOOD planet\'s LZ on ROCKY ground (review m9)', edit((raw) => {
      const landing = raw.payload.slices.landing;
      landing.survey = createSurveyState('good', []);
      for (const lz of landing.lzs) Object.assign(lz, { site: null, ground: 'flat' });
      landing.lzs[0]!.ground = 'rocky';
    }), false],
    ['…the same planet with every LZ FLAT', edit((raw) => {
      const landing = raw.payload.slices.landing;
      landing.survey = createSurveyState('good', []);
      for (const lz of landing.lzs) Object.assign(lz, { site: null, ground: 'flat' });
    }), true],
  ];
  const wrong = cases.filter(([, raw, ok]) => (kind(raw) === 'ok') !== ok);
  check('the codec reads the survey at rest: a held thread, a kept angle, an LZ off its site or on another\'s, the wrong cell count, moves and reveals naming nothing, a short sitesRev and a bad record are refused',
    wrong.length === 0, wrong.map(([name, raw]) => `${name} → ${kind(raw)}`).join(' | '));
});
check('…withSurvey puts the gates back', SURVEY_BUILT.poor === GATES_AT_LOAD.poor && SKILL_TREE.survey.built === GATES_AT_LOAD.built);

// --- The review's follow-up (slice-6-foundation-review.md) ---------------------------------------------------------------
{
  // M8: siteStars is R11's, built now.
  const site = (kind: SurveySite['kind'], ground: SurveySite['ground'], width: LzWidth) => ({ kind, ground, width });
  check('siteStars (R11): ★★★ FLAT and not NARROW, ★★ FLAT NARROW, ★ ROCKY or WET, none on a wreck',
    siteStars(site('candidate', 'flat', 'wide')) === 3 && siteStars(site('guess', 'flat', 'standard')) === 3
    && siteStars(site('candidate', 'flat', 'narrow')) === 2 && siteStars(site('candidate', 'rocky', 'wide')) === 1
    && siteStars(site('guess', 'wet', 'narrow')) === 1 && siteStars(site('wreck', 'rocky', 'standard')) === 0);
  // M2: the run rule and the swath width (Track SWATH built them: a GOOD planet is 'off', ±20° at v1–v2, ±40° at v3).
  check('surveyRunning is \'off\' on a GOOD planet; swathHalfRad is 0 at v0, ±20° at v1–v2, ±40° at v3 (Track SWATH)',
    surveyRunning(createInitialState({ seed: 1 })) === 'off' && swathHalfRad(0) === 0
    && Math.abs(swathHalfRad(2) - Math.PI / 9) < 1e-12 && Math.abs(swathHalfRad(3) - 2 * Math.PI / 9) < 1e-12);
  // M4: a long unmapped arc is cut so the strip lays it out on the right side of the dot, and the overview line never wraps.
  const arc = { fromRad: 0.1, toRad: 6.2 };
  const pieces = splitRimArcs([arc]);
  const covered = pieces.reduce((sum, piece) => sum + (piece.toRad - piece.fromRad), 0);
  // The strip's rule (landing-hud stripSpan): a stretch sits at its middle's wrapped angle from the dot, ± its half.
  const placedAt = (dot: number, point: number): number | null => {
    const piece = pieces.find((p) => {
      const at = ((point % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return at >= p.fromRad && at < p.toRad;
    });
    if (piece === undefined) return null;
    const mid = (piece.fromRad + piece.toRad) / 2;
    return angleDelta(dot, mid) + (point - mid);
  };
  const near = [0.12, 0.3, 6.15, 6.0, 1.0].every((point) => {
    const at = placedAt(0, point);
    return at !== null && Math.abs(at - angleDelta(0, point)) < 1e-9;
  });
  check(`splitRimArcs: the boot's whole-rim arc (0.1 to 6.2 rad) is ${pieces.length} pieces ≤ π inside one turn, the ground just ahead of the dot lands ahead of it`,
    pieces.every((p) => p.toRad - p.fromRad <= Math.PI + 1e-12 && p.fromRad >= 0 && p.toRad <= 2 * Math.PI + 1e-12)
    && Math.abs(covered - (arc.toRad - arc.fromRad)) < 1e-9 && near);
  const wrapped = splitRimArcs([{ fromRad: 6.0, toRad: 6.6 }, { fromRad: -1, toRad: 9 }]);
  check('…an arc across angle 0 is cut there, a whole turn or more is the whole rim once',
    Math.abs(wrapped[0]!.toRad - 2 * Math.PI) < 1e-12 && wrapped[1]!.fromRad === 0
    && Math.abs(wrapped.slice(2).reduce((sum, p) => sum + (p.toRad - p.fromRad), 0) - 2 * Math.PI) < 1e-9);
  // m1: a jammed placement starts over on the same stream, up to SITE_PLACE_TRIES, then throws. A rim with room for one site
  // only: every try places one site (one draw) and jams on the second.
  const jam: ShipLandingDef = {
    lzs: [{ label: 'LZ-A', centreDeg: 0, width: 'wide', pods: 4 }], forgiveness: 'gentle', terrain: 'PLAINS', colonyFirstRun: null, drag: true,
    noGo: Array.from({ length: 44 }, (_, i) => ({ centreDeg: (119 + 8 * i) % 360, widthDeg: 8, word: 'LAKE' })),
  };
  const counted = (tries: number): { calls: number; threw: boolean } => {
    const inner = createRng(11);
    let calls = 0;
    const rng = (): number => { calls++; return inner(); };
    const threw = throws(() => rollSurveySites(jam, PLANET_R, rng, tries));
    return { calls, threw };
  };
  const once = counted(1);
  const eight = counted(8);
  check('the site roll retries a jammed placement on the same stream (review m1): 8 tries draw 7 more placements than 1, then it throws',
    once.threw && eight.threw && eight.calls - once.calls === 7 && throws(() => rollSurveySites(jam, PLANET_R, createRng(3))), `${once.calls} → ${eight.calls} draws`);
  // M7: the record keeps the bad ground an LZ moved off.
  const landing = withSurveyBuilt(() => armShipSlices(SEED, CORMORANT).slices.landing);
  const bad = landing.lzs.find((lz) => lz.ground !== 'flat')!;
  const to = landing.survey.sites.find((s) => s.kind === 'candidate' && s.ground === 'flat' && s.roomPods >= bad.pods)!;
  const moved = structuredClone(landing);
  const lz = moved.lzs.find((zone) => zone.label === bad.label)!;
  const from = lz.site!;
  Object.assign(lz, { centreRad: to.centreRad, halfWidthRad: to.halfWidthRad, widthKm: to.widthKm, ground: to.ground, site: to.id });
  moved.survey.moves.push({ lz: lz.label, from, site: to.id });
  moved.sitesRev = 1;
  const record = surveyRecordOf(moved)!;
  check(`the record of ${bad.label} moved off its ${bad.ground.toUpperCase()} guess to ${to.id}: the move with its \`from\`, nothing bad kept, the ground it left in movedOff (review M7)`,
    record.badKept.length === 0 && isDeepStrictEqual(record.moves, [{ lz: bad.label, from, site: to.id }])
    && isDeepStrictEqual(record.movedOff, [{ lz: bad.label, ground: bad.ground, known: null }]), JSON.stringify(record));
  // M1: the echo takes the reveal as a sixth argument; left out (and null) the words are as before.
  check('LANDING_ECHO.touchdown takes `revealing` sixth; without it the words are as before (the tail is SWATH\'s)',
    LANDING_ECHO.touchdown(3, 'lz', 'LZ-B', 'hard') === '> pod03 ... LANDED · HARD'
    && LANDING_ECHO.touchdown(3, 'lz', 'LZ-B', 'hard', false, null) === '> pod03 ... LANDED · HARD');
}
// m2: SURVEY's branch opens only for a planet that plays POOR: at VESPER's desk (CORMORANT in reach), not with POOR down.
{
  const desk = (gates: typeof NO_SURVEY): boolean => withSurvey(gates, () => {
    const state = resumeFixture('run-save-v5-ship-done-desk4.json').getState();
    return openBranchesAt(state, visitNow(state.run)).includes('survey');
  });
  check('poorAhead goes through the POOR gate (review m2): SURVEY opens at VESPER\'s desk with both gates up, not with POOR down',
    desk({ poor: true, built: 3 }) && !desk({ poor: false, built: 3 }));
}

// --- Words (every lead line ≤ MAX_LINE_CHARS at its worst case; SWATH's and SITES's by shape only: theirs to reword) ----------
{
  const words = { site: 'SITE 12 · WRECKAGE', lz: 'LZ-D', holds: 3200, needs: 3200 };
  const lines = [SURVEY_TEXT.boot(4), ...Object.values(SURVEY_TEXT.refusal).map((refusal) => refusal(words)), SURVEY_TEXT.room(16)];
  check(`the lead's survey lines are ≤ ${MAX_LINE_CHARS} characters at their worst case`, lines.every((line) => line.length <= MAX_LINE_CHARS),
    lines.filter((line) => line.length > MAX_LINE_CHARS).join(' | '));
  check('…SWATH_TEXT and SITES_TEXT are seeded (their tracks\' to reword: support/words checks each in its own block)',
    Object.keys(SWATH_TEXT).length > 0 && Object.keys(SITES_TEXT).length > 0);
}

// The widths a WET site may have stay over a healthy dot (plan §2.6: a WET NARROW site is 167 km, over 2 × 70).
check('a WET NARROW site is 167 km: hard, but a healthy low-orbit dot fits', Math.round(LZ_WIDTH_KM.narrow * WET_WIDTH_FACTOR) === 167
  && (['wide', 'standard', 'narrow'] as LzWidth[]).every((width) => LZ_WIDTH_KM[width] * WET_WIDTH_FACTOR > 140));

finish();
