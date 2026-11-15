// WP4 part 1 systems beyond the numbered acceptance: the seed (roles, licences, visibility), the
// licence installs, the sensed prediction, guidance F1 and F2, the dead engine, SWAP moving the
// role, the quantized glitch level, and the delete questions that name a flight effect.
import { check, finish, TICK } from '../wp1/harness';
import { releaseAtCapture, idle, stepUntil } from '../wp1-rules/flows';
import { createHarness4 } from './harness4';
import { createInitialState } from '@state/initial';
import type { GameState } from '@state/schema';
import type { Segment, ShipSegment } from '@/types/segment';
import { installTool, isLicensed, licenceSchedule } from '@systems/licences';
import { unitInstallAddress, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { getPrediction, getSensedPrediction, sensePrediction } from '@systems/predict';
import { buildFlightContext, flightObjective, type FlightContext } from '@systems/guidance';
import { buildDirectorCtx, composeObjective } from '@systems/director';
import { isBurnHeld, engineAccel } from '@systems/orbit-sim';
import { burnButton } from '@systems/flight-hud';
import { capabilitiesNow } from '@systems/capabilities';
import { setMode } from '@systems/mode';
import { receiveTransmission, skipBoot } from '@systems/boot';
import { actionSwap } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { deleteQuestion } from '@systems/tool-targets';
import { selectCorruption, coreThreads, getByRole } from '@state/selectors';
import { GUIDE_RULES, LICENCE_LINES } from '@data/script';
import { TOOL_FILES } from '@data/fs-tools';
import { MAX_LINE_CHARS, PLOT_STALE_TAC, BOOT_SKIP_GRACE_SEC } from '@data/tuning';
import { layoutOf } from '@data/memory';

const h = createHarness4(1);
const memory = (): Segment[] => h.store.getState().memory;
const names = (): string[] => memory().map((seg) => seg.name);

// --- The seed --------------------------------------------------------------------------------------------
{
  const state = createInitialState({ seed: 1 });
  const seedNames = state.memory.map((seg) => seg.name);
  check('seed: Mission, Skills, Navigation and Ship Comms are gone', !['Mission', 'Skills', 'Navigation', 'Ship Comms'].some((name) => seedNames.includes(name)));
  check('seed: only SCAN among the filesystem tools', state.memory.filter((seg) => seg.type === 'fs-tool').map((seg) => seg.name).join() === 'Scan');
  check('seed: SCAN is the only licence', JSON.stringify(state.run.licences) === '["scan"]');
  const autopilot = getByRole(state, 'autopilot');
  check('seed: Autopilot, 4 blocks, an AI tool', autopilot?.type === 'tool' && autopilot.size === 4);
  const engine = getByRole(state, 'engine-io');
  const sensor = getByRole(state, 'sensor');
  const thrust = getByRole(state, 'thrust-ctrl');
  check('seed: Engine I/O 85, Sensor Interp 78, Thrust Controller 100 (not corrupt)',
    engine?.type === 'tool' && engine.integrity === 85 && sensor?.type === 'tool' && sensor.integrity === 78
    && thrust?.type === 'ship' && thrust.integrity === 100 && thrust.state !== 'corrupt');
  check('seed: the AI\'s own files are visible from the start (§3.2)', state.memory.every((seg) =>
    !(seg.type === 'core' || seg.type === 'tool' || seg.type === 'fs-tool') || seg.scanned));
  check('seed: ship files hide their health until scanned', state.memory.every((seg) => seg.type !== 'ship' || !seg.scanned));
  check('seed: still 274 blocks, invariants hold', (() => { assertMemoryInvariants(state.memory, layoutOf(state).totalBlocks); return true; })());
  // WP10 added SWAP (§8: SWAP becomes a 1-block tool file built from actionSwap).
  check('seed: no Activate / Deactivate tool kinds remain', Object.keys(TOOL_FILES).join() === 'scan,repair,move,copy,delete,swap');
}

// --- Licences ---------------------------------------------------------------------------------------------
{
  // The boot happens in blue: that is not the kid jacking in.
  h.resetTo('title');
  receiveTransmission(h.store);
  h.stepFor(BOOT_SKIP_GRACE_SEC + 0.1);
  check('licence: not during the boot (blue, but nobody jacked in)', !isLicensed(h.store.getState(), 'repair'));
  // Playtest 1 (C-UNROLL): a press hurries the SELF-CHECK, the next skips it, and the cut waits for what it showed.
  for (let i = 0; i < 20 && h.store.getState().run.phase === 'boot'; i++) {
    skipBoot(h.store);
    h.stepFor(0.2);
  }
  check('licence: not in amber at the start of the flight', !isLicensed(h.store.getState(), 'repair') && !names().includes('Repair'));

  h.events.length = 0;
  const logBefore = h.log().length;
  setMode(h.store, 'memory');
  h.step();
  const state = h.store.getState();
  const charge = memory().findIndex((seg) => seg.type === 'redundancy');
  check('licence: the first TAB into blue installs REPAIR', isLicensed(state, 'repair'));
  check('licence: Repair and Repair.bak land right after REPAIR CHARGE', memory()[charge + 1]?.name === 'Repair' && memory()[charge + 2]?.name === 'Repair.bak',
    names().slice(charge, charge + 4).join(' | '));
  check('licence: ARRIVAL CONTROL approves it', h.log().slice(logBefore).some((entry) => entry.speaker === 'control' && entry.text === LICENCE_LINES.repair));
  check('licence: announced once (transmitIn, chime, the chip)', h.events.filter((event) => event.name === 'licence').length === 1);
  setMode(h.store, 'tools');
  h.step();
  setMode(h.store, 'memory');
  h.step();
  check('licence: issued once', memory().filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair').length === 2
    && h.events.filter((event) => event.name === 'licence').length === 1);
  let threw = false;
  try { installTool(h.store, 'repair'); } catch { threw = true; }
  check('licence: a second install of the same licence is a bug (throws)', threw);
  check('licence: every licence line fits the strip', Object.values(LICENCE_LINES).every((line) => line.length <= MAX_LINE_CHARS));

  // A strip line that points at the REPAIR chip from amber is the other trigger (§9 item 9).
  const amber = createInitialState({ seed: 1 });
  // WP7: the schedule is built per ship (licenceSchedule); REPAIR's rule is the same on every ship.
  const rule = licenceSchedule().find((candidate) => candidate.kind === 'repair')!;
  const dueInAmber = rule.due(amber);
  amber.director.shown = { id: 'test', text: 'PICK UP REPAIR', keys: [], urgency: 'soon', layer: 'mind', highlight: 'chip-repair', source: 'tutorial' };
  check('licence: in amber it is not due, until a line highlights the REPAIR chip', !dueInAmber && rule.due(amber));
  const alerted = createInitialState({ seed: 1 });
  alerted.alerts.list.push({ id: 'test', layer: 'mind', severity: 'warn', text: 'C12 INFECTED', inhibitsSkip: true });
  check('licence: …or a mind alert needs it (an infection, WP6)', rule.due(alerted));

  // Placement skips space a running move reserved, and no room at all throws.
  const fake = createInitialState({ seed: 1 });
  const trailing = fake.memory[fake.memory.length - 1]!;
  if (trailing.type === 'free') trailing.reservedBy = 99;
  const addr = unitInstallAddress(fake.memory, 4);
  const addrSeg = (() => { let at = 0; for (const seg of fake.memory) { if (at === addr) return seg; at += seg.size; } return null; })();
  check('licence: never into space a running op reserved', addrSeg?.type === 'free' && addrSeg.reservedBy === undefined && addrSeg !== trailing);
  const full = createInitialState({ seed: 1 });
  full.memory = full.memory.map((seg) => (seg.type === 'free' ? { ...freeSegment(seg.size, 7) } : seg));
  let noRoom = false;
  try { unitInstallAddress(full.memory, 4); } catch { noRoom = true; }
  check('licence: no room at all throws (a layout bug, never a silent skip)', noRoom);
}

// --- The sensed prediction --------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  const truth = getPrediction();
  const sensed = getSensedPrediction();
  const R = h.store.getState().level.planet.R;
  const fuzz = capabilitiesNow(h.store.getState()).plot.fuzzKm;
  check('sensed: Sensor Interp 78 → approx with 330 km fuzz', fuzz === 330);
  check('sensed: ▼ altitude rounded to a multiple of the fuzz', Math.abs(((sensed.rp - R) / fuzz) - Math.round((sensed.rp - R) / fuzz)) < 1e-9
    && Math.abs(sensed.rp - truth.rp) <= fuzz / 2 + 1e-9, `${truth.rp.toFixed(0)} → ${sensed.rp.toFixed(0)}`);
  check('sensed: the fate stays the truth (outcome, ring fit, burn point, times)', sensed.outcome === truth.outcome
    && sensed.fit.inRing === truth.fit.inRing && sensed.fit.closed === truth.fit.closed && sensed.burnPoint === truth.burnPoint
    && sensed.impactInSec === truth.impactInSec && sensed.points === truth.points);
  check('sensed: cached per true prediction', getSensedPrediction() === sensed);

  h.setIntegrity('sensor', 100);
  h.step();
  check('sensed: a healthy sensor shows the truth itself', getSensedPrediction() === getPrediction());

  const exact = { mode: 'exact', fuzzKm: 0, band: 'ok', staleTac: 0, offline: null } as const;
  check('sensePrediction: exact is the identity', sensePrediction(truth, exact, R) === truth);

  // Failing: a snapshot, refreshed every PLOT_STALE_TAC tactical s.
  h.setIntegrity('sensor', 40);
  h.keyDown('Space');
  h.step();
  const first = getSensedPrediction();
  const warp = h.store.getState().level.tacticalWarp;
  let refreshedAt: number | null = null;
  const t0 = first.asOfTSec;
  for (let i = 0; i < 200 && refreshedAt === null; i++) {
    h.step();
    const now = getSensedPrediction();
    if (now !== first) refreshedAt = (now.asOfTSec - t0) / warp;
  }
  h.keyUp('Space');
  check('sensed: a failing sensor holds its snapshot for 3 tac s while the truth moves on', refreshedAt !== null
    && refreshedAt >= PLOT_STALE_TAC - 1e-9 && refreshedAt <= PLOT_STALE_TAC + 2 * TICK, String(refreshedAt));
}

// --- Guidance F1 and F2 -------------------------------------------------------------------------------------
function objectiveWith(mutate: (draft: GameState) => void): ReturnType<typeof flightObjective> {
  h.store.update(mutate);
  h.step();
  return flightObjective(buildFlightContext(h.store.getState(), getSensedPrediction()));
}
function role(draft: GameState, which: Parameters<typeof getByRole>[1]): Segment {
  const seg = getByRole(draft, which);
  if (!seg) throw new Error(`no ${which}`);
  return seg;
}
{
  h.resetTo('flight');
  h.noFault();
  let line = objectiveWith((d) => { const seg = role(d, 'sensor'); if ('integrity' in seg) seg.integrity = 40; });
  check('F1 yields to an impact course: DON\'T HIT THE PLANET first', line?.id.startsWith('F4') === true, line?.text);
  // Clear of the planet (the opening burn), then blind.
  h.setIntegrity('sensor', 100);
  h.keyDown('Space');
  stepUntil(h, () => getPrediction().outcome !== 'impact', 10);
  h.keyUp('Space');
  line = objectiveWith((d) => { const seg = role(d, 'sensor'); if ('integrity' in seg) seg.integrity = 40; });
  check('F1: PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP (now, MIND)', line?.id === 'F1-uncertain'
    && line.text === 'PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP' && line.urgency === 'now' && line.layer === 'mind', line?.text);
  line = objectiveWith((d) => {
    const sensor = role(d, 'sensor'); if ('integrity' in sensor) sensor.integrity = 78;
    const nav = role(d, 'navplot'); if ('integrity' in nav) nav.integrity = 10;
  });
  check('F1: NO SIGNAL — [TAB], REPAIR NAV PLOTTER', line?.id === 'F1-nosignal' && line.text === 'NO SIGNAL — [TAB], REPAIR NAV PLOTTER', line?.text);

  // The director shows it as a MIND line, so the TAB toggle glows in amber.
  const director = buildDirectorCtx(h.store.getState(), getPrediction(),
    { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null }, getSensedPrediction());
  const composed = composeObjective(director, GUIDE_RULES);
  check('F1: the strip carries it as ◇ MIND with the TAB key', composed?.layer === 'mind' && composed.keys.includes('TAB'));

  h.resetTo('flight');
  h.noFault();
  line = objectiveWith((d) => { const seg = role(d, 'engine-io'); if ('integrity' in seg) seg.integrity = 10; });
  check('F2: impact course + dead Engine I/O → ENGINE NOT RESPONDING — [TAB], fix ENGINE I/O', line?.id === 'F2-dead'
    && line.urgency === 'now' && line.layer === 'mind', line?.text);
  line = objectiveWith((d) => { const seg = role(d, 'engine-io'); if ('integrity' in seg) { seg.integrity = 38; seg.state = 'repairing'; } });
  check('F2: Engine I/O under repair → ENGINE OFFLINE — ENGINE I/O IS REPAIRING…', line?.id === 'F2-repairing', line?.text);
  line = objectiveWith((d) => { const seg = role(d, 'engine-io'); if ('state' in seg) seg.state = 'transferring'; });
  check('F2: Engine I/O moving → ENGINE OFFLINE — ENGINE I/O IS MOVING…', line?.id === 'F2-moving', line?.text);
  line = objectiveWith((d) => {
    const seg = role(d, 'engine-io');
    d.memory[d.memory.indexOf(seg)] = freeSegment(seg.size);
  });
  check('F2: no Engine I/O → NO ENGINE DRIVER', line?.id === 'F2-nodriver', line?.text);
  h.resetTo('flight');
  h.noFault();
  line = objectiveWith((d) => {
    const seg = role(d, 'thrust-ctrl');
    d.memory[d.memory.indexOf(seg)] = freeSegment(seg.size);
  });
  check('F2: no Thrust Controller → NO THRUST CONTROLLER', line?.id === 'F2-nocontroller', line?.text);

  // F2 only replaces a line that asks for a burn now or soon: a WAIT stays a WAIT.
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  stepUntil(h, () => /^RELEASE/.test(h.objective()?.text ?? ''), 30);
  h.keyUp('Space');
  h.press('KeyS');
  stepUntil(h, () => /^WAIT/.test(h.objective()?.text ?? ''), 10);
  line = objectiveWith((d) => { const seg = role(d, 'engine-io'); if ('integrity' in seg) seg.integrity = 10; });
  check('F2: ahead of a WAIT too (fix it before the burn), at soon', line?.id === 'F2-dead' && line.urgency === 'soon', `${line?.text} ${line?.urgency}`);
  line = objectiveWith((d) => { const seg = role(d, 'engine-io'); if ('integrity' in seg) { seg.integrity = 38; seg.state = 'repairing'; } });
  check('F2: a repair during a WAIT stays calm (wait)', line?.id === 'F2-repairing' && line.urgency === 'wait', `${line?.text} ${line?.urgency}`);

  // Q/E hints once the Autopilot is failing.
  h.resetTo('flight');
  h.noFault();
  line = objectiveWith((d) => {
    const seg = role(d, 'autopilot'); if ('integrity' in seg) seg.integrity = 30;
    d.burn.sasMode = 'prograde';
  });
  check('presets: a failing Autopilot turns key hints into Q/E', /turn to OUT with \[Q\]\/\[E\]/.test(line?.text ?? ''), line?.text);

  // Every F1/F2 line fits the strip.
  const lines = ['PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP', 'NO SIGNAL — [TAB], REPAIR NAV PLOTTER',
    'ENGINE NOT RESPONDING — [TAB], fix ENGINE I/O', 'ENGINE OFFLINE — ENGINE I/O IS REPAIRING…',
    "NO ENGINE DRIVER — the engine can't fire", "NO THRUST CONTROLLER — the engine can't fire"];
  check('F1/F2 lines fit the strip', lines.every((text) => text.length <= MAX_LINE_CHARS));
}

// --- A fuzz: F1/F2 over a whole flight never throw and never hide a release ------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  const faults: Array<FlightContext['engineFault']> = [null, 'dead', 'repairing', 'moving', 'no-driver', 'no-controller'];
  // WP4 fix round 1: the plot's state is the file that blinds it and how (plotFault), and the
  // screen the kid looks at changes F1/F2's words (inMind).
  const plotFaults: Array<FlightContext['plotFault']> = [null];
  for (const role of ['sensor', 'navplot'] as const) {
    for (const cause of ['hurt', 'repairing', 'moving', 'missing'] as const) plotFaults.push({ role, cause });
  }
  let evaluated = 0;
  let bad = '';
  let holding = false;
  for (let i = 0; i < 2400 && h.status() === 'approaching'; i++) {
    h.step();
    const base = buildFlightContext(h.store.getState(), getSensedPrediction());
    const plain = flightObjective({ ...base, engineFault: null, plotFault: null });
    for (const engineFault of faults) {
      for (const plotFault of plotFaults) {
        for (const presets of [true, false]) {
          for (const inMind of [false, true]) {
            const line = flightObjective({ ...base, engineFault, plotFault, presetsAvailable: presets, inMind });
            evaluated++;
            if (!line) continue;
            if (line.text.length > MAX_LINE_CHARS) bad = line.text;
            // A MIND line never asks for TAB on the MIND screen, and always does from the ship
            // when it has something to repair.
            if (line.layer === 'mind' && inMind && (line.keys.includes('TAB') || line.text.includes('[TAB]'))) bad = `${line.id} asks for TAB in blue`;
            if (line.layer === 'mind' && !inMind && line.repairs) bad = `${line.id} lights a repair in amber`;
            if (line.layer === 'mind' && inMind && /^F[12]-(uncertain|nosignal|dead)$/.test(line.id) && !line.repairs) bad = `${line.id} names no file in blue`;
            if (plotFault && plotFault.cause !== 'missing') {
              // Blind: F1, unless the path hits the planet or sits in the ring (F4, F3), and an
              // engine that can't fire still names itself over F4.
              // LEAD-1: while the kid's own repair or move of the file runs, the path's NOW lines go
              // first too (HOLD [SPACE] NOW at the capture, a release, a due trim or shrink), except
              // the OUT/IN correction (F6), which steers by the stale reading itself.
              const waitingOut = plotFault.cause === 'repairing' || plotFault.cause === 'moving';
              const pathNow = waitingOut && line.urgency === 'now' && !/^F[16]/.test(line.id);
              if (!/^F[1-4]/.test(line.id) && !pathNow) bad = `${line.id} under ${JSON.stringify(plotFault)}`;
              // A repair or a move under way is never asked for again.
              if (plotFault.cause !== 'hurt' && /REPAIR (SENSOR|NAV)/.test(line.text)) bad = `${line.text} while ${plotFault.cause}`;
              continue;
            }
            // A missing plot file has nothing to repair: never a line that asks for it.
            if (plotFault?.cause === 'missing' && /^F1-/.test(line.id)) bad = `${line.id} for a missing ${plotFault.role}`;
            if (engineFault && plain && /^RELEASE|HOLD STEADY/.test(plain.text) && line.id.startsWith('F2')) bad = `F2 over ${plain.text}`;
          }
        }
      }
    }
    // A loose pilot so the flight visits many rows: burns now and then.
    const text = h.objective()?.text ?? '';
    const want = /hold \[SPACE\]|KEEP HOLDING|NOW/.test(text) && i % 7 !== 0;
    if (want && !holding) { h.keyDown('Space'); holding = true; }
    if (!want && holding) { h.keyUp('Space'); holding = false; }
    const press = text.match(/press \[([WASD])\]/);
    if (press) h.press(`Key${press[1]}`);
    if (text.includes('[F]')) h.press('KeyF');
  }
  if (holding) h.keyUp('Space');
  check('fuzz: every capability mix over a flight gives a valid line', bad === '' && evaluated > 10000, bad || `${evaluated} lines`);
}

// --- A dead engine ----------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  h.setIntegrity('engine-io', 10);
  h.step();
  h.events.length = 0;
  h.keyDown('Space');
  h.step();
  const state = h.store.getState();
  check('dead engine: SPACE coughs (engineCough)', h.events.some((event) => event.name === 'engine-cough'));
  check('dead engine: the throttle is held but no thrust, so it is not a held burn', state.burn.firing && !isBurnHeld(state)
    && engineAccel(state) === 0 && state.burn.lastTickDvKmS === 0);
  check('dead engine: the BURN button says ENGINE NOT RESPONDING (and can still be pressed)',
    burnButton(state).text === 'ENGINE NOT RESPONDING' && !burnButton(state).disabled);
  h.setIntegrity('engine-io', 100);
  h.step();
  h.step();
  check('dead engine: healed while SPACE is held, it burns at once', h.store.getState().burn.lastTickDvKmS > 0);
  h.keyUp('Space');
  const repairing = (() => { h.setIntegrity('engine-io', 38); h.store.update(() => { h.file('engine-io').state = 'repairing'; }); return burnButton(h.store.getState()).text; })();
  check('dead engine: while Engine I/O repairs the button says so', repairing === 'ENGINE OFFLINE · REPAIRING', repairing);

  // WP1-rules TODO: a dead engine plans no shrink, and F2 comes first.
  releaseAtCapture(h);
  idle(h, 50);
  const shrinkPlanned = getPrediction().burnPoint?.reason === 'shrink';
  h.setIntegrity('engine-io', 10);
  for (let i = 0; i < 3; i++) h.step();
  const after = getPrediction().burnPoint?.reason;
  const line = flightObjective(buildFlightContext(h.store.getState(), getSensedPrediction()));
  check('dead engine: no shrink is planned without thrust, and F2 names the engine', shrinkPlanned && after !== 'shrink' && line?.id === 'F2-dead',
    `before: shrink=${shrinkPlanned}, after: ${after}, line: ${line?.text}`);
}

// --- SWAP moves the role; glitch level; delete questions ----------------------------------------------------
{
  h.resetTo('flight');
  const thrust = getByRole(h.store.getState(), 'thrust-ctrl') as ShipSegment;
  thrust.scanned = true;
  thrust.integrity = 20;
  thrust.state = 'corrupt';
  check('swap: the damaged primary drives the ghost before the swap', capabilitiesNow(h.store.getState()).thrustCtrl.ghost !== null);
  // WP10: SWAP is a tool file (installed here) and a 2 s op; the backup takes the job's name, the primary is Thrust.old.
  installTool(h.store, 'swap');
  check('swap: works', actionSwap(h.store, thrust) === null);
  while (getOps().length > 0) h.step();
  const now = getByRole(h.store.getState(), 'thrust-ctrl');
  check('swap: the backup takes the role, the .old primary drops it', now?.name === 'Thrust Controller' && now.type === 'ship-backup'
    && thrust.role === undefined && thrust.name === 'Thrust.old');
  check('swap: the ship reads the healthy backup (no ghost)', capabilitiesNow(h.store.getState()).thrustCtrl.ghost === null
    && capabilitiesNow(h.store.getState()).thrustCtrl.band === 'ok');

  const core = getByRole(h.store.getState(), 'core');
  if (core?.type !== 'core') throw new Error('no core');
  const levels = [100, 98, 97, 83, 50, 49, 0].map((integrity) => { core.integrity = integrity; return selectCorruption(h.store.getState()); });
  check('glitch: the Core\'s damage in 5% steps', JSON.stringify(levels) === JSON.stringify([0, 0, 0.05, 0.15, 0.5, 0.5, 1]), JSON.stringify(levels));
  core.integrity = 49;
  check('Core below 50: one thread', coreThreads(h.store.getState()) === 1);
  core.integrity = 100;

  const engine = getByRole(h.store.getState(), 'engine-io')!;
  check('delete Engine I/O asks, naming the flight effect', deleteQuestion(h.store.getState(), engine)?.detail === 'The engine stops. Leaves an 8-block gap.',
    deleteQuestion(h.store.getState(), engine)?.detail);
  const reactor = getByRole(h.store.getState(), 'reactor')!;
  check('delete the Reactor asks: thrust drops to 30%', deleteQuestion(h.store.getState(), reactor)?.detail.startsWith('Thrust drops to 30%.') === true);
}

finish();
