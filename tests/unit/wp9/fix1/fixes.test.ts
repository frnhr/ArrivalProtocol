// WP9 review fixes, round 1: one check (or a few) per finding fixed, headless, on the real systems.
// • TRANSMIT ▸ to KESTREL with no Sensor Interp (left behind on the TRANSMIT screen, or eaten): no throw; KESTREL
//   flies blind (the missing file is its own state) and its arrival damage names nothing.
// • The debris dodge: TOO WIDE counts its deadline down (urgent), SKIP waits for it (DODGE THE DEBRIS FIRST, or
//   PATH UNCERTAIN while blind; since round 2 a SKIP runs up to the deadline's lead first), it lapses with a
//   `dodge-lapsed` moment and `· too late to dodge DEBRIS C` (none while blind). (HOLLOW's wake after it: round 2's
//   explicit hold, checked in tests/unit/wp9/fix2.)
// • The first seed: SKIP waits for it (SOMETHING IS COMING); a seed moment with nowhere to land counts too.
// • The debris hit: a rack the kid emptied tags `HIT` / `NOTHING` (the TERMINAL says NOTHING THERE), a real hit
//   `HIT` / `−25%`; a driver at 10% being moved into the rack (its clone hit) does not throw and is not lost; a
//   picked-up MOVE source that the hit takes out leaves no stale pickedSourceId (nor does a launch: slice 1a).
// • AUTOBURN flies the capture through while the kid fights HOLLOW in blue; a refused [B] says why on the strip.
// • The quality items: isCorrectionRow knows every F6–F8 row the table makes; debrisRack throws on anything but a
//   one-rack cloud; AUTOBURN.skl's chip breaks at its dot; AUTOBURN.skl goes to rack D's tail when racks E–F are full;
//   every new line fits the strip.
import { check, finish } from '../../wp1/harness';
import { createHarness9, KESTREL } from '../harness9';
import { continueAfterReport } from '@systems/run';
import { toggleDrop, transmitModel } from '@systems/transmit';
import { arrivalDamage } from '@systems/carry';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { requestSkip, SKIP_REFUSAL_DODGE, SKIP_REFUSAL_BLIND_DODGE, SKIP_REFUSAL_SEED_COMING } from '@systems/pace';
import { rackZoneTags } from '@systems/flight-hud';
import { flightObjective, isCorrectionRow, type FlightContext } from '@systems/guidance';
import { engageAutoburn, trainSkillAtBoot, skillFiles } from '@systems/autoburn';
import { podRecord } from '@systems/landing-rules';
import { setMode } from '@systems/mode';
import { installTool } from '@systems/licences';
import { actionMove, actionRepair, actionDelete } from '@state/actions';
import { segmentStarts, mergeAdjacentFree, freeSegment } from '@systems/memory-ops';
import { driversInMemory, isInfected } from '@state/selectors';
import { getOpsBySeg, canStartOp } from '@systems/ops-core';
import { seedsInMemory } from '@systems/hollow';
import { stripName } from '@data/type-labels';
import { debrisRack, type ZoneHit } from '@/types/zone';
import { getShip } from '@data/ships';
import { AUTOBURN_TEXT, AUTO_REFUSAL_LINES, AUTOBURN_REFUSAL, AUTO_MINI_TEXT } from '@data/skill-text';
import { RACK_TAG_TEXT } from '@data/zone-text';
import { UNIT_RACKS_START } from '@data/memory';
import { MAX_LINE_CHARS, RACK_BLOCKS, WAKE_AFTER_DODGE_SEC } from '@data/tuning';
import type { Segment } from '@/types/segment';

const h = createHarness9(5);
const state = () => h.store.getState();
const warp = () => state().level.tacticalWarp;
const fits = (line: string): boolean => line.length <= MAX_LINE_CHARS;
const debrisHit = (): ZoneHit => getPrediction().zoneHits.find((hit) => hit.kind === 'debris')!;
// A licence the run may already hold (licences persist for the run; h.kestrel keeps them).
const ensureTool = (kind: 'repair' | 'move'): void => {
  if (!state().run.licences.includes(kind)) installTool(h.store, kind);
};
const correctIn = (): void => {
  h.keyDown('Space');
  h.stepUntil(() => /^RELEASE/.test(h.objective()?.text ?? ''), 60);
  h.keyUp('Space');
  h.step();
};

// --- TRANSMIT ▸ to KESTREL with no Sensor Interp ------------------------------------------------------------
{
  const ship = getShip(KESTREL);
  const noSensor: Segment[] = [{ id: 'core', name: 'AI Core', type: 'core', role: 'core', size: 16, integrity: 100, state: 'intact' } as Segment];
  check('arrivalDamage: a unit with no file of the role is not damaged by that rule (no throw)', arrivalDamage(noSensor, ship.arrival!.damage).length === 0);

  // HALCYON to its LANDING REPORT with more charge than the link carries beside the files, so leaving a file behind
  // carries more charge and the chip can be dropped (the review's repro).
  const toTransmit = (): void => {
    h.newRun(3);
    h.shipAlone(1, 3);
    state().hollow.phase = 'dormant';
    h.startLanding(1, 'locked');
    if (!h.untilPhase('report', 300)) throw new Error('fixes: HALCYON never reached its LANDING REPORT');
    h.store.update((d) => {
      const charge = d.memory.find((seg) => seg.type === 'redundancy');
      const free = d.memory.filter((seg) => seg.type === 'free').sort((a, b) => b.size - a.size)[0];
      if (!charge || charge.type !== 'redundancy' || !free) throw new Error('fixes: no charge or free space');
      const grow = Math.min(free.size - 1, 40);
      charge.size += grow; charge.used += grow; free.size -= grow;
    });
    continueAfterReport(h.store);
  };
  const fliesBlind = (label: string): void => {
    let threw: string | null = null;
    try { h.transmit(); } catch (error) { threw = (error as Error).message; }
    check(`${label}: TRANSMIT ▸ goes through`, threw === null, String(threw));
    if (threw !== null) return;
    h.untilPhase('flight', 30);
    const scriptedLine = state().log.entries.some((entry) => entry.text.includes('SENSOR INTERP 45%'));
    let flewThrew: string | null = null;
    try { h.stepFor(20); } catch (error) { flewThrew = (error as Error).message; }
    check(`${label}: KESTREL flies blind with no Sensor Interp (plot uncertain, no 45% ECC line, no throw)`, flewThrew === null
      && h.caps().plot.mode === 'uncertain' && h.caps().plot.band === 'missing' && !scriptedLine && state().run.shipIndex === KESTREL,
    `${flewThrew} ${h.caps().plot.mode}/${h.caps().plot.band}`);
  };

  toTransmit();
  const chip = transmitModel(state()).chips.find((candidate) => state().memory.find((seg) => seg.id === candidate.segId)?.role === 'sensor');
  check('setup: the Sensor Interp chip can be left behind', chip !== undefined && chip.toggleable && toggleDrop(h.store, chip.segId) === null);
  fliesBlind('left behind on the TRANSMIT screen');

  toTransmit();
  // HOLLOW ate it on HALCYON: an eaten file is a hollow block of its size, and hollow does not carry.
  h.store.update((d) => {
    const index = d.memory.findIndex((seg) => seg.role === 'sensor');
    const sensor = d.memory[index]!;
    d.memory[index] = { id: 'eaten-sensor', name: '???', type: 'hollow', size: sensor.size, root: false, locked: false, owner: '???', ate: sensor.name };
    d.ui.memoryRev++;
  });
  fliesBlind('eaten by HOLLOW');
}

// --- The dodge: countdown, SKIP, the lapse, HOLLOW's wake -----------------------------------------------------
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.step();
  const line = h.objective();
  check('TOO WIDE counts the dodge down, urgent: `TOO WIDE — hold [SPACE] · m:ss to dodge DEBRIS C`',
    /^TOO WIDE — hold \[SPACE\] · \d:\d\d to dodge DEBRIS C$/.test(line?.text ?? '') && line?.urgency === 'now', `${line?.text} (${line?.urgency})`);
  // Round 2 (the lead's ruling): SKIP is no longer refused for the whole window; the deadline is its next event and it
  // ends ahead of it, then F says DODGE THE DEBRIS FIRST (tests/unit/wp9/zones-sim and tests/unit/wp9/fix2 check the stop).
  const skip = requestSkip(h.store);
  h.stepUntil(() => state().clock.skipWarp === null, 60);
  const nearSkip = requestSkip(h.store);
  check('SKIP runs up to the dodge, then waits for it: DODGE THE DEBRIS FIRST', skip.ok && !nearSkip.ok && nearSkip.reason === SKIP_REFUSAL_DODGE,
    `${JSON.stringify(skip)} → ${JSON.stringify(nearSkip)}`);
  const deadlineTac = (getPrediction().asOfTSec + debrisHit().dodgeInSec!) / warp();
  let deadlines = new Set<string>();
  let lapses = 0;
  let lapseAi: number | null = null;
  h.stepUntil(() => {
    const hit = debrisHit();
    if (hit.dodgeInSec !== null) deadlines.add(((getPrediction().asOfTSec + hit.dodgeInSec) / warp()).toFixed(2));
    const now = h.events.filter((event) => event.name === 'dodge-lapsed').length;
    if (now > lapses) { lapses = now; lapseAi = state().clock.aiSec; }
    return hit.correctionClears === false && h.wall() > (lapseAi ?? Infinity) + 1;
  }, 200);
  check('the deadline stands still while the ship coasts (one absolute time), about 154 tac s in', deadlines.size === 1
    && Math.abs(deadlineTac - 154) < 4, `${[...deadlines].join(', ')}`);
  check('it lapses once, with the dodge-lapsed moment (the sag), at the deadline', lapses === 1 && lapseAi !== null,
    `${lapses} lapses at ai ${lapseAi}`);
  check('…then TOO WIDE says it is too late: `· too late to dodge DEBRIS C`', h.objective()?.text === 'TOO WIDE — hold [SPACE] · too late to dodge DEBRIS C',
    h.objective()?.text);
  const after = requestSkip(h.store);
  check('…and SKIP is free again', after.ok, JSON.stringify(after));
  // (Round 1 pinned KESTREL's 60 s wake cap against the lapse at CRUISE here. Round 2 made the rule explicit, a timed
  // wake waits while the dodge is open: tests/unit/wp9/fix2/fixes2.test.ts checks it at every pace.)

  // Blind (as it arrives): SKIP waits too (the dodge is there to save), the strip says PATH UNCERTAIN, and the lapse is silent.
  h.kestrel(5, { hollowAsleep: true, arrivalDamage: true });
  h.step();
  const blindSkip = requestSkip(h.store);
  h.stepUntil(() => state().clock.skipWarp === null, 60);
  const blindNear = requestSkip(h.store);
  check('blind: SKIP stops for the dodge too (it is there to save), then says PATH UNCERTAIN', blindSkip.ok && !blindNear.ok
    && blindNear.reason === SKIP_REFUSAL_BLIND_DODGE, `${JSON.stringify(blindSkip)} → ${JSON.stringify(blindNear)}`);
  const lapsedBefore = h.events.filter((event) => event.name === 'dodge-lapsed').length;
  h.stepUntil(() => debrisHit().correctionClears === false, 200);
  h.stepFor(1);
  check('…a dodge that runs out while the kid is blind makes no lapse moment (they never saw it)',
    h.events.filter((event) => event.name === 'dodge-lapsed').length === lapsedBefore);
  deadlines = new Set();
}

// --- The first seed: SKIP waits for it ------------------------------------------------------------------------
{
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  ensureTool('move');
  correctIn();
  // Walls first (the kid's MOVEs: POD 09 and POD 10 out of reach), then HOLLOW wakes now.
  h.store.update((d) => {
    const starts = segmentStarts(d.memory);
    d.memory = d.memory.map((seg, i) => (seg.type === 'driver' && (seg.pod === 9 || seg.pod === 10) && starts[i]! < 192 ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(d.memory);
    d.hollow.cfg = { ...d.hollow.cfg, wake: { afterAiSec: 0, coastLeadSec: null } };
    d.ui.memoryRev++;
  });
  // Round 2: a timed wake also waits WAKE_AFTER_DODGE_SEC after the dodge closed (the correction cleared the cloud).
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 3);
  h.press('KeyS');
  h.stepUntil(() => h.objective()?.id === 'F10-wait', 20);
  const held = requestSkip(h.store);
  check('HOLLOW awake, nothing infected, on the coast: SKIP waits for the first seed (SOMETHING IS COMING)',
    !held.ok && held.reason === SKIP_REFUSAL_SEED_COMING && !driversInMemory(state()).some(isInfected), JSON.stringify(held));
  h.stepUntil(() => state().hollow.seedTelegraph !== null, 40);
  h.stepFor(2.5);
  for (const seed of seedsInMemory(state().memory)) if (getOpsBySeg(seed.id).length === 0 && canStartOp()) actionDelete(h.store, seed);
  h.runOps(5);
  h.stepFor(0.5);
  const free = requestSkip(h.store);
  check('…the seed landed on the coast and was DELETEd: SKIP works again', state().hollow.seedMoments === 1 && free.ok, JSON.stringify(free));

  // A seed moment with nowhere to land (every free block reserved by an op) still counts: SKIP is not held for good.
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  ensureTool('move');
  correctIn();
  // Round 2: POD 09 and POD 10 walled off too (as above). Bitten, they would raise the eaten-soon alarm, whose TACTICAL pace
  // holds the first seed's clock (it waits for a calm flight).
  h.store.update((d) => {
    const starts = segmentStarts(d.memory);
    d.memory = d.memory.map((seg, i) => (seg.type === 'driver' && (seg.pod === 9 || seg.pod === 10) && starts[i]! < 192 ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(d.memory);
    for (const seg of d.memory) if (seg.type === 'free') seg.reservedBy = -1;  // an op id no real op has
    d.hollow.cfg = { ...d.hollow.cfg, wake: { afterAiSec: 0, coastLeadSec: null } };
    d.ui.memoryRev++;
  });
  // Round 2: a timed wake also waits WAKE_AFTER_DODGE_SEC after the dodge closed (the correction cleared the cloud).
  h.stepUntil(() => state().hollow.phase === 'awake', WAKE_AFTER_DODGE_SEC + 3);
  const firstAfter = getShip(KESTREL).hollow.seed!.firstAfterSec;
  h.stepFor(firstAfter + 1);
  check('a seed moment with nowhere to land counts (no telegraph, seedMoments 1)', state().hollow.seedMoments === 1
    && state().hollow.seedTelegraph === null && state().hollow.seedsLanded === 0, `${state().hollow.seedMoments}`);
}

// --- The debris hit: what the rack tag says, a clone in the rack, a picked MOVE source ---------------------------
{
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.store.update((d) => {
    const starts = segmentStarts(d.memory);
    d.memory = d.memory.map((seg, i) => (seg.type === 'driver' && starts[i]! >= 2 * RACK_BLOCKS && starts[i]! < 3 * RACK_BLOCKS ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(d.memory);
    d.ui.memoryRev++;
  });
  const before = state().log.entries.length;
  h.stepUntil(() => state().hazards.hitIds.length > 0, 400);
  h.stepFor(0.3);
  const terminal = state().log.entries.slice(before).map((entry) => entry.text).filter((text) => text.includes('DEBRIS HIT'));
  const tag = rackZoneTags(state(), getSensedPrediction()).find((candidate) => candidate.rack === 'C');
  check('the kid emptied rack C in time: the TERMINAL says NOTHING THERE and rack C\'s tag `HIT` / `NOTHING`',
    terminal[0] === '> DEBRIS HIT RACK C: NOTHING THERE' && JSON.stringify(tag?.lines) === JSON.stringify([RACK_TAG_TEXT.debrisHit, RACK_TAG_TEXT.debrisHitNothing]),
    `${terminal.join(' | ')} | ${JSON.stringify(tag?.lines)}`);

  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  h.stepUntil(() => state().hazards.hitIds.length > 0, 400);
  h.stepFor(0.3);
  const hitTag = rackZoneTags(state(), getSensedPrediction()).find((candidate) => candidate.rack === 'C');
  check('…a real hit tags `HIT` / `−25%`', JSON.stringify(hitTag?.lines) === JSON.stringify(['HIT', '−25%']), JSON.stringify(hitTag?.lines));

  // The review's forced case: POD 01 at 10% being MOVEd from rack B into rack C's tail when the cloud hits.
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  const toEntryTac = (): number => {
    const hit = debrisHit();
    return hit.enterInSec === null ? Infinity : (hit.enterInSec - (state().clock.tSec - getPrediction().asOfTSec)) / warp();
  };
  h.stepUntil(() => toEntryTac() <= 1.5, 400);
  const c01 = driversInMemory(state()).find((soul) => soul.pod === 1)!;
  h.store.update((d) => { const seg = d.memory.find((candidate) => candidate.id === c01.id); if (seg && seg.type === 'driver') seg.integrity = 10; });
  const starts = segmentStarts(state().memory);
  const destIndex = state().memory.findIndex((seg, i) => seg.type === 'free' && starts[i]! >= 2 * RACK_BLOCKS && starts[i]! < 3 * RACK_BLOCKS && seg.size >= 8);
  ensureTool('move');
  const refusal = actionMove(h.store, c01, { regionSegIds: [state().memory[destIndex]!.id], col: 0 });
  let threw: string | null = null;
  try { h.stepUntil(() => state().hazards.hitIds.length > 0, 10); } catch (error) { threw = (error as Error).message; }
  const c01After = driversInMemory(state()).find((soul) => soul.pod === 1);
  check('a driver at 10% moved into the rack as the cloud hits: no throw; its move aborted, it lives on in rack B (not lost)',
    refusal === null && threw === null && c01After !== undefined && podRecord(state(), 1).driverLost === null
    && segmentStarts(state().memory)[state().memory.indexOf(c01After)]! < 2 * RACK_BLOCKS, `${refusal} ${threw}`);

  // A picked-up MOVE source the hit takes out (the strip's `MOVE drivers out of it`, HOLLOW had chewed it to 20%).
  h.kestrel(5, { hollowAsleep: true, sensorHealed: true });
  ensureTool('move');
  const moveTool = state().memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move')!;
  const c08 = driversInMemory(state()).find((soul) => soul.pod === 8)!;
  h.store.update((d) => {
    const soul = d.memory.find((seg) => seg.id === c08.id);
    if (soul && soul.type === 'driver') soul.integrity = 20;
    d.ui.activeTool = { kind: 'move', toolSegId: moveTool.id };
    d.ui.pickedSourceId = c08.id;
  });
  h.stepUntil(() => state().hazards.hitIds.length > 0, 400);
  check('a picked-up MOVE source the hit takes out leaves no stale pickedSourceId (its driver is lost, dead)',
    !state().memory.some((seg) => seg.id === c08.id) && state().ui.pickedSourceId === null
    && podRecord(state(), 8).driverLost === 'dead', String(state().ui.pickedSourceId));
  // ...nor a launch (the shared forgetDriver): the pods land at once as the landing begins (forceLandAll's real launch).
  const c02 = driversInMemory(state()).find((soul) => soul.pod === 2)!;
  h.store.update((d) => { d.ui.pickedSourceId = c02.id; });
  h.startLanding(1, 'locked');
  h.step();
  check('…nor a picked-up driver whose pod launches', podRecord(state(), 2).fate.kind !== 'aboard' && state().ui.pickedSourceId === null,
    `${podRecord(state(), 2).fate.kind} ${String(state().ui.pickedSourceId)}`);
}

// --- AUTOBURN: it flies the capture through while the kid fights HOLLOW in blue; a refused [B] says why --------------
{
  h.kestrel(5, { sensorHealed: true });
  ensureTool('repair');
  h.giveSkill([0, 0]);
  correctIn();
  setMode(h.store, 'memory');
  h.step();
  engageAutoburn(h.store);
  h.stepFor(0.4);
  check('a refused [B] in the MIND says why on the strip (no AUTO button there to read)',
    h.shown()?.text === AUTO_REFUSAL_LINES[AUTOBURN_REFUSAL.tooFar]!.text, h.shown()?.text);
  h.stepUntil(() => engageAutoburn(h.store) === null, 300);
  // HOLLOW wakes as AUTOBURN arms: the kid fights in blue (repairs each bite) while it brakes.
  h.store.update((d) => { d.hollow.cfg = { ...d.hollow.cfg, wake: { afterAiSec: 0, coastLeadSec: null } }; });
  let foughtWhileFlying = false;
  h.stepUntil(() => {
    for (const soul of driversInMemory(state())) {
      if (isInfected(soul) && getOpsBySeg(soul.id).length === 0 && canStartOp() && actionRepair(h.store, soul) === null
        && state().burn.auto.phase === 'burning') foughtWhileFlying = true;
    }
    return state().burn.auto.phase === 'done' || state().burn.auto.phase === 'dropped';
  }, 400);
  check('AUTOBURN flew the capture through, into the ring, while the kid repaired bites in the MIND', foughtWhileFlying
    && state().burn.auto.phase === 'done' && state().burn.auto.end === 'in-ring' && state().ui.mode === 'memory',
  `${state().burn.auto.phase} ${state().burn.auto.end} fought ${foughtWhileFlying}`);
  h.stepUntil(() => h.status() !== 'approaching', 30);
  check('…and the orbit locked with nothing more flown by hand', h.status() === 'locked' && state().log.entries.some((entry) => entry.text === AUTOBURN_TEXT.inRing),
    h.status());
}

// --- Quality: the correction rows, debrisRack, the chip name, the skill's placement, the new lines -------------------
{
  const ring = { min: 5000, max: 7000 };
  const base: FlightContext = {
    status: 'approaching', landing: false, offer: null, goLow: null, outcome: 'open', rp: 9000, inRing: false, outbound: false, ring,
    // WP12 p3 (strict test tsc): the fields added after this test (F4's lift preset, WP10's spare controller), none here.
    liftPreset: null, spareController: null,
    // WP12 p3: ▼'s rate under thrust (F6's early RELEASE); 0 keeps this test's rows as written.
    rpRateTac: 0,
    sweetLo: 5500, sweetHi: 6500, sasMode: 'retrograde', firing: false, firingFor: null, thrustOn: false,
    outOfFuel: false, fuelShort: false, acceptOnly: false, strandedAnyway: false, cannotClose: false, presetsAvailable: true,
    plotFault: null, engineFault: null, inMind: false, skipAvailable: true,
    burnPoint: {
      reason: 'capture', preset: 'retrograde', event: 'peri', eventInSec: 9000, inSec: 8000, dvKmS: 1.2, estBurnSec: 240,
      // LEAD-2: BurnPoint no longer has lastFuel / emptiesTank (the last FUEL is gone).
      approaching: true, firstOfTwo: false, inTac: 320, burnTac: 9.6,
    },
    periTac: 330, showAccept: false, debris: null, autoburn: { phase: 'idle', sinceSec: 0, armedInTac: 0, end: null }, autoAvailable: false,
  };
  const ids = new Set<string>();
  const debrisOptions: FlightContext['debris'][] = [null, { rack: 'C', dodgeInTac: 40 }, { rack: 'C', dodgeInTac: null }];
  for (const rp of [4000, 5800, 6000, 6200, 9000, 5300, 6700]) {
    for (const sasMode of ['radial-in', 'radial-out', 'retrograde'] as const) {
      for (const firing of [false, true]) {
        for (const presetsAvailable of [true, false]) {
          for (const debris of debrisOptions) {
            const objective = flightObjective({ ...base, rp, sasMode, firing, thrustOn: firing, presetsAvailable, debris });
            if (objective && /^F[678]/.test(objective.id)) ids.add(objective.id);
          }
        }
      }
    }
  }
  const missing = [...ids].filter((id) => !isCorrectionRow(id));
  check('isCorrectionRow knows every F6–F8 row the table makes (no regex on row ids)', missing.length === 0 && ids.has('F6-dodge') && ids.size >= 10,
    `missing ${missing.join(', ')} of ${[...ids].join(', ')}`);

  const hit: ZoneHit = { zoneId: 'z', kind: 'debris', racks: ['C'], spent: false, insideNow: false, enterInSec: 1, exitInSec: 2, insideSec: 1,
    closestInSec: 1, missKm: -1, expectedHits: 1, correctionClears: true, dodgeInSec: 1 };
  const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
  check('debrisRack: the one rack of a debris cloud; a two-rack zone or a belt throws', debrisRack(hit) === 'C'
    && throws(() => debrisRack({ ...hit, racks: ['B', 'C'] })) && throws(() => debrisRack({ ...hit, kind: 'belt' })));

  h.kestrel(5, { hollowAsleep: true });
  h.giveSkill([0, 0]);
  const skill = skillFiles(state().memory)[0]!;
  check('AUTOBURN.skl\'s chip name breaks at its dot or as AUTO- / BURN, never mid-word', stripName(skill, 6) === 'AUTO\u00ADBURN\u200B.skl');

  // Racks E–F full (the charge filled past the link): the skill goes to the end of rack D's free tail, beside the unit.
  h.kestrel(5, { hollowAsleep: true });
  h.store.update((d) => {
    const starts = segmentStarts(d.memory);
    const charge = d.memory.find((seg) => seg.type === 'redundancy');
    if (!charge || charge.type !== 'redundancy') throw new Error('fixes: no charge');
    let grow = 0;
    d.memory = d.memory.filter((seg, i) => {
      if (seg.type !== 'free' || starts[i]! < UNIT_RACKS_START) return true;
      grow += seg.size;
      return false;
    });
    charge.size += grow; charge.used += grow; charge.capacity = Math.max(charge.capacity, charge.used);
    d.run.stats.demos.push({ offsetTac: 0 }, { offsetTac: 0 });
    d.ui.memoryRev++;
  });
  trainSkillAtBoot(h.store);
  const placed = skillFiles(state().memory)[0]!;
  const at = segmentStarts(state().memory)[state().memory.indexOf(placed)]!;
  check('racks E–F full: AUTOBURN.skl goes to the end of rack D\'s free tail, beside the unit', at + placed.size === UNIT_RACKS_START, String(at));

  const lines = [
    'KEEP HOLDING — dodge DEBRIS C', SKIP_REFUSAL_DODGE, SKIP_REFUSAL_BLIND_DODGE, SKIP_REFUSAL_SEED_COMING, AUTO_MINI_TEXT.ready,
    AUTOBURN_TEXT.braked, AUTOBURN_TEXT.brakedTab, AUTOBURN_TEXT.inRing, ...Object.values(AUTO_REFUSAL_LINES).map((line) => line!.text),
  ];
  check('every new line fits the strip (≤ 70)', lines.every(fits), lines.filter((line) => !fits(line)).join(' | '));
}

finish();
