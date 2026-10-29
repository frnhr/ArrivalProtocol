// @ts-nocheck: TODO(slice1a-TESTS): this suite still reads phase 2's souls / printer (cluster codes, print results) and is
// moved onto the landing per slice-1a-plan §5. F2 turned type-checking off here so tsc over tests stays green meanwhile.
// WP7 part 2, headless: the models behind the run's screens and HUD, on the real systems.
// • TRANSMIT (§6.9, item 4): the headline, the packet line, the chips safest-to-drop first with their
//   notes, the locks, drops offered only while charge is left behind (a tight link: +4 CHARGE for
//   Repair.bak, then Repair is the last copy), the arrival line's sum; the dropped file stays behind;
// • the arrival (item 3): the boot's ECC line emits 'arrival-hits', each naming a file now in memory;
// • BEAM OUT (item 6): what the Engine button, COMMS and the strip show (offered, offered-paused, beaming,
//   hidden on the tutorial ship), and the strip's two BEAM OUT lines (the hopeless offer, the race);
// • the amber BITE slot (WP6's TODO): HOLLOW awake with something to bite, quiet once it is walled off;
// • RUN END (item 7): the fleet's souls, the rank steps (scaled to the fleet, §4.4's exactly at 12,400),
//   the near misses in order, a whole model; an accepted ship's distance from a perfect lock;
// • every new line fits the strip (≤ 70) with worst-case values.
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import { continueAfterReport, continueAfterLoss, startBeamOut, cancelBeamOut, shipResultOf, ringMissOf } from '@systems/run';
import { pushModal, activeLayer } from '@systems/input';
import { transmitModel, toggleDrop } from '@systems/transmit';
import { runEndModel, rankSteps, rankOf, nearMisses, fleetSouls } from '@systems/run-end';
import { beamOutView, hopelessWhy } from '@systems/beam-out';
import { amberBite } from '@systems/hollow-hud';
import { exposedDrivers, cureNow, infectNow } from '@systems/hollow';
import { getPrediction } from '@systems/predict';
import { installTool } from '@systems/licences';
import { setPaused } from '@systems/clock';
import { on } from '@systems/events';
import { openArchive } from '@state/initial';
import { hasIntegrity, infectedSegments } from '@state/selectors';
import {
  TRANSMIT_TEXT, RUN_END_TEXT, RUN_END_TITLE, RUN_END_WHY, LINES, BEAM_OUT_TEXT, SHIP_OUTCOME_WORD, formatCount,
} from '@data/script';
import { MOVE_PREVIEW_TEXT, HOLLOW_HUD_TEXT } from '@data/hollow-text';
import { MAX_LINE_CHARS, NAME_MAX_CHARS } from '@data/tuning';
import type { ShipResult, TransitHit } from '@state/schema';

const h = createHarness7(21, { soulsFound: false });
const state = () => h.store.getState();

function plunge(altitudeKm: number, speed: number, sideways = 0.05): void {
  const r = state().level.planet.R + altitudeKm;
  h.store.mutate((d) => { d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = -speed; d.orbit.vy = sideways; });
}

// --- Ship 1 to TRANSMIT -------------------------------------------------------------------------------
h.newRun(21);
h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; openArchive(d); });
if (!state().run.licences.includes('repair')) {
  installTool(h.store, 'repair');
  h.store.update((d) => { d.run.licences.push('repair'); });
}
h.startPrinting(1, 'locked');
check('ship 1 prints its colonists and reaches the WAKE REPORT', h.untilPhase('report', 200), state().run.phase);
continueAfterReport(h.store);
check('CONTINUE → TRANSMIT', state().run.phase === 'transmit');

{
  const model = transmitModel(state());
  check('TRANSMIT: NEXT: HALCYON · 2,000 SOULS · 22 LY', model.headline === 'NEXT: HALCYON · 2,000 SOULS · 22 LY', model.headline);
  check('…no why line after a ship that printed', model.why === null);
  check('…the packet line: LINK 120 · FILES n · CHARGE n → FITS', /^LINK 120 · FILES \d+ · CHARGE \d+ → FITS$/.test(model.packetLine), model.packetLine);
  const names = model.chips.map((chip) => chip.name);
  check('…the chips, safest to drop first: the spare REPAIRs, Telemetry, Autopilot, Sensor Interp, AI Comms, then the locked',
    names.join(',') === 'Repair,Repair.bak,Telemetry,Autopilot,Sensor Interp,AI Comms,AI Core,Engine I/O,Nav Plotter,Scan', names.join(','));
  const locked = model.chips.filter((chip) => chip.lock !== null);
  check('…locked: the Core (THIS IS YOU), Engine I/O, Nav Plotter and the only SCAN, each saying why',
    locked.map((chip) => chip.note).join(' | ') === [TRANSMIT_TEXT.locked.core, TRANSMIT_TEXT.locked.engine, TRANSMIT_TEXT.locked.navplot,
      TRANSMIT_TEXT.locked.lastCopy('SCAN')].join(' | '), locked.map((chip) => chip.note).join(' | '));
  check('…an AI tool says what leaving it does (Autopilot: no W/A/S/D presets)',
    model.chips.find((chip) => chip.name === 'Autopilot')?.note === TRANSMIT_TEXT.without.autopilot, model.chips.find((chip) => chip.name === 'Autopilot')?.note);
  check('…everything fits: nothing can be dropped, and the screen says so', model.chips.every((chip) => !chip.toggleable) && model.dropLine === TRANSMIT_TEXT.fits);
  const telemetry = model.chips.find((chip) => chip.name === 'Telemetry')!;
  const core = model.chips.find((chip) => chip.name === 'AI Core')!;
  check('…a click on a chip refuses: nothing to gain, or locked', toggleDrop(h.store, telemetry.segId) === 'nothing-to-gain'
    && toggleDrop(h.store, core.segId) === 'locked' && state().run.transit?.dropped.length === 0);
  const credit = state().run.pendingStarCredit;
  const total = Math.max(12, model.chargeCarried + credit);
  check('…the arrival line adds the stars\' charge', model.arrivalLine === TRANSMIT_TEXT.arrival(model.chargeCarried, credit, state().run.pendingStars, total - (model.chargeCarried + credit), total)
    && model.arrivalCharge === total, model.arrivalLine);
  check('…the hits line: 3 on the way to HALCYON', model.hitsLine === TRANSMIT_TEXT.hits(3), model.hitsLine);
  // An infected file travels infected (§6.9): its chip and the screen warn.
  h.store.update((d) => {
    const telemetryFile = d.memory.find((seg) => seg.name === 'Telemetry');
    if (telemetryFile && hasIntegrity(telemetryFile)) telemetryFile.infected = { side: 'left' };
  });
  const infected = transmitModel(state());
  check('…an infected file: ⚠ WILL ARRIVE INFECTED on its chip, and the count on the screen',
    infected.chips.find((chip) => chip.name === 'Telemetry')?.infected === true && infected.infectedLine === TRANSMIT_TEXT.infected(1), infected.infectedLine ?? '');
  h.store.update((d) => {
    const telemetryFile = d.memory.find((seg) => seg.name === 'Telemetry');
    if (telemetryFile && hasIntegrity(telemetryFile)) delete telemetryFile.infected;
  });
}

// --- A tight link: dropping a spare carries more charge --------------------------------------------
{
  const files = transmitModel(state()).files;
  const held = transmitModel(state()).chargeHeld;
  h.store.update((d) => { d.run.transit!.linkBlocks = files + held - 10; });
  let model = transmitModel(state());
  check('a tight link leaves charge behind: the line says how much', model.packetLine.endsWith('→ 10 LEFT BEHIND') && model.dropLine === TRANSMIT_TEXT.tight, model.packetLine);
  const bak = model.chips.find((chip) => chip.name === 'Repair.bak')!;
  check('…Repair.bak can be left behind for +4 CHARGE', bak.toggleable && bak.chargeGain === 4, JSON.stringify(bak));
  const carriedBefore = model.chargeCarried;
  check('…a click leaves it behind', toggleDrop(h.store, bak.segId) === null && state().run.transit!.dropped.includes(bak.segId));
  model = transmitModel(state());
  check('…the charge carried grows by 4, and the plan\'s numbers follow', model.chargeCarried === carriedBefore + 4
    && state().run.transit!.chargeCarried === model.chargeCarried && state().run.transit!.filesBlocks === model.files);
  const repair = model.chips.find((chip) => chip.name === 'Repair')!;
  check('…now Repair is the only REPAIR: locked, and says so', repair.lock === 'last-copy' && repair.note === TRANSMIT_TEXT.locked.lastCopy('REPAIR')
    && toggleDrop(h.store, repair.segId) === 'locked');
  check('…the dropped chip is listed first, as LEFT BEHIND, and can be taken back',
    model.chips[0]?.segId === bak.segId && model.chips[0]?.dropped === true && model.chips[0]?.toggleable === true);
  toggleDrop(h.store, bak.segId);
  check('…taking it back restores the packet', transmitModel(state()).chargeCarried === carriedBefore && state().run.transit!.dropped.length === 0);
  toggleDrop(h.store, bak.segId);
}

// --- TRANSMIT ▸: the dropped file stays behind; the ECC line flashes the hit files --------------------
{
  const bakId = state().run.transit!.dropped[0]!;
  const flashed: TransitHit[][] = [];
  const off = on('arrival-hits', ({ hits }) => { flashed.push([...hits]); });
  // WP8: PICK ONE TO CARRY is mandatory before the send (harness7.transmit picks the first card the same way).
  h.transmit();
  check('HALCYON boots without the dropped Repair.bak', state().run.phase === 'boot' && !state().memory.some((seg) => seg.id === bakId));
  h.stepUntil(() => state().run.phase === 'flight', 15);
  off();
  const arrival = state().run.arrival!;
  check('the boot\'s ECC line emits the crossing\'s hits once, in order', flashed.length === 1
    && JSON.stringify(flashed[0]) === JSON.stringify([...arrival.hits, ...arrival.scripted]), `${flashed.length} × ${flashed[0]?.length}`);
  const lastTo = new Map<string, number>();
  for (const hit of flashed[0] ?? []) lastTo.set(hit.segId, hit.to);
  const consistent = [...lastTo].every(([segId, to]) => {
    const seg = state().memory.find((candidate) => candidate.id === segId);
    return seg !== undefined && hasIntegrity(seg) && seg.integrity === to;
  });
  check('…each hit names a file now in memory, at the integrity the hit left it', consistent && lastTo.size > 0, JSON.stringify([...lastTo]));
}

// --- BEAM OUT on HALCYON --------------------------------------------------------------------------------
{
  check('BEAM OUT: hidden on HALCYON\'s opening flyby (not doomed)', beamOutView(state(), getPrediction()).look === 'hidden');
  // A doomed ship a burn can still save: the impact within 20 tactical s, but the tank lifts ▼ out.
  // (Found by tests/unit/wp7/p2/probes/savable.ts: 200 km up, falling slowly at 0.8 of the circular speed, with a
  // healthy engine and a full tank.)
  h.setIntegrity('engine-io', 100);
  const r = state().level.planet.R + 200;
  h.store.mutate((d) => { d.burn.fuelPct = 100; d.orbit.x = r; d.orbit.y = 0; d.orbit.vx = -0.2; d.orbit.vy = 0.8 * Math.sqrt(d.level.planet.mu / r); });
  h.step();
  h.step();
  const savableView = beamOutView(state(), getPrediction());
  // WP7 fix round 1: `hopeless` is the reason (null: a burn can still save it).
  const savable = savableView.look === 'offered' && savableView.hopeless === null;
  check('…offered on a doomed ship that a burn could still save, without the hopeless glow', savable, JSON.stringify(savableView));
  if (savable) {
    h.stepFor(0.5);
    check('…and the strip keeps the flight\'s own line (burning is the better answer)',
      !/BEAM OUT/.test(state().director.shown?.text ?? '') && state().director.shown?.source === 'flight', state().director.shown?.text);
  }
  h.store.mutate((d) => { d.burn.fuelPct = 0; });
  plunge(1000, 3);
  h.stepFor(0.5);
  const hopeless = beamOutView(state(), getPrediction());
  check('…with an empty tank: offered, hopeless for FUEL', hopeless.look === 'offered' && hopeless.hopeless === 'fuel' && hopelessWhy(state(), getPrediction()) === 'fuel');
  check('…the strip says to press it, and lights the button', state().director.shown?.id === 'beam-out-offer'
    && state().director.shown?.text === LINES.beamOutOffer('fuel') && state().director.shown?.highlight === 'beam-out', state().director.shown?.text);
  setPaused(h.store, true);
  h.step();
  check('…paused: the button rests (offered-paused)', beamOutView(state(), getPrediction()).look === 'offered-paused');
  setPaused(h.store, false);
  h.step();
  check('…started: the bar', startBeamOut(h.store) === null && beamOutView(state(), getPrediction()).look === 'beaming');
  h.stepFor(1.2);
  const racing = state().director.shown?.text ?? '';
  check('…the strip races it: BEAMING OUT — TRANSMITTING n% · IMPACT m:ss', /^BEAMING OUT — TRANSMITTING \d+% · IMPACT \d+:\d\d$/.test(racing), racing);
  const view = beamOutView(state(), getPrediction());
  check('…its progress is the bar\'s', view.look === 'beaming' && view.progress > 0.1 && view.progress < 0.5, JSON.stringify(view));
  cancelBeamOut(h.store);
  h.step();
  check('…cancelled: offered again', beamOutView(state(), getPrediction()).look === 'offered');
}

// --- The amber BITE slot ----------------------------------------------------------------------------------
{
  h.shipAlone(1, 33);
  h.store.update((d) => { d.ui.mode = 'tools'; });
  check('BITE: nothing while HOLLOW sleeps', amberBite(state()) === null);
  h.stepUntil(() => state().hollow.phase === 'awake', 60);
  check('…awake, with both its neighbours already bitten: quiet (the eaten alarms say what matters)', amberBite(state()) === null,
    JSON.stringify(amberBite(state())));
  // Both cures won: the clusters are clean (recoiling) and right next to it again.
  for (const seg of infectedSegments(state())) cureNow(h.store, seg);
  h.step();
  const bite = amberBite(state());
  check('…cured but still within a GAP of it: BITE m:ss', bite !== null && /^BITE \d:\d\d$/.test(bite.text), JSON.stringify(bite));
  // The defender repairs and walls (the strip's own lesson), then nothing is in reach.
  const end = h.wall() + 90;
  while (h.wall() < end && (infectedSegments(state()).length > 0 || exposedDrivers(state()).length > 0)) { h.defend(0.5); h.step(); }
  h.stepFor(1);
  check('…walled off, the slot goes quiet (the next bite only fizzles)', exposedDrivers(state()).length === 0 && amberBite(state()) === null,
    `${exposedDrivers(state()).join()} infected ${infectedSegments(state()).length} → ${JSON.stringify(amberBite(state()))}`);
}

// --- An accepted ship's distance from a perfect lock --------------------------------------------------------
{
  h.newRun(4);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; openArchive(d); });
  h.startPrinting(0.6, 'accepted');
  const miss = ringMissOf(state());
  const result = shipResultOf(state(), 'partial', 0);
  check('an ACCEPTED loop records how far its far end is from the ring', miss !== null && miss.apsis === '▲' && miss.km > 0
    && JSON.stringify(result.ringMiss) === JSON.stringify(miss), JSON.stringify(miss));
  check('…a locked ship records none', shipResultOf(state(), 'locked', 3).ringMiss === null);
}

// --- RUN END -------------------------------------------------------------------------------------------
{
  // WP9: the fleet that exists grew by KESTREL (2,400); WP10 by VESPER (2,400); WP11 by LAST LIGHT (3,200): §4.2's whole
  // 12,400. The rank arithmetic below keeps its explicit 4,400.
  check('RUN END: the fleet has 12,400 souls (ARES-VII 2,400 + HALCYON 2,000 + KESTREL 2,400 + VESPER 2,400 + LAST LIGHT 3,200)', fleetSouls() === 12400, String(fleetSouls()));
  check('…§4.4\'s rank steps at 12,400 souls exactly', JSON.stringify(rankSteps(12400).map((step) => step.minScore)) === '[0,3000,6800,10700]');
  check('…scaled to the 4,400 the fleet has (rounded to 100)', JSON.stringify(rankSteps(4400).map((step) => step.minScore)) === '[0,1100,2400,3800]',
    JSON.stringify(rankSteps(4400)));
  check('…rankOf: 2,000 is SHEPHERD with CARETAKER next; 4,100 is ARK ANGEL, the top', rankOf(2000, 4400).rank.name === 'SHEPHERD'
    && rankOf(2000, 4400).next?.name === 'CARETAKER' && rankOf(4100, 4400).rank.name === 'ARK ANGEL' && rankOf(4100, 4400).next === null);
  const ares: ShipResult = { shipId: 'ares-vii', shipName: 'ARES-VII', outcome: 'locked', woke: 2400, half: 200, lost: 0, stars: 2, fuelLeftPct: 17.4, ringMiss: null };
  const halcyon: ShipResult = { shipId: 'halcyon', shipName: 'HALCYON', outcome: 'partial', woke: 1800, half: 0, lost: 200, stars: 1, fuelLeftPct: 3, ringMiss: { apsis: '▼', km: 140.4 } };
  check('…near misses: the next rank first, then a nearly locked loop, then a FUEL ★ just missed (two at most)',
    JSON.stringify(nearMisses([ares, halcyon], 2000, 4400)) === JSON.stringify([RUN_END_TEXT.rankGap(400, 'CARETAKER'), RUN_END_TEXT.lockMiss('▼', 140, 'HALCYON')]),
    JSON.stringify(nearMisses([ares, halcyon], 2000, 4400)));
  check('…at the top rank: the lock, then the FUEL', JSON.stringify(nearMisses([ares, halcyon], 4100, 4400))
    === JSON.stringify([RUN_END_TEXT.lockMiss('▼', 140, 'HALCYON'), RUN_END_TEXT.fuelMiss(18, 'ARES-VII')]), JSON.stringify(nearMisses([ares, halcyon], 4100, 4400)));
  // WP11: WP7's interim END OF THE FLEET is gone (the fleet ends with the flagship): the run here ends FLAGSHIP LOST.
  h.store.update((d) => { d.run.ships = [ares, halcyon]; d.run.phase = 'end'; d.run.endCause = 'flagship-lost'; });
  const model = runEndModel(state());
  check('…the whole model: FLAGSHIP LOST, 4,200 / 12,400 WOKE (heads), 200 with missing memories, sombre',
    model.title === 'FLAGSHIP LOST' && model.totalLine === '4,200 / 12,400 WOKE' && model.missingLine === '200 WITH MISSING MEMORIES' && model.tone === 'sombre',
    `${model.title} | ${model.totalLine} | ${model.missingLine} | ${model.tone}`);
  // WP11: of 12,400 souls, 4,100 is SHEPHERD (CARETAKER starts at 6,800).
  check('…the SCORE counts missing memories half (4,100), and the rank is by it (SHEPHERD of 12,400)', model.score === 4100 && model.scoreLine === 'SCORE 4,100'
    && model.rank === rankOf(4100, 12400).rank.name && model.rank === 'SHEPHERD', `${model.scoreLine} ${model.rank}`);
  check('…every ship of the fleet, with its outcome word and souls (KESTREL not reached)', model.ships.map((row) => `${row.shipName}:${row.outcomeWord}:${row.wokeLine}`).join(' | ')
    .startsWith(`ARES-VII:${SHIP_OUTCOME_WORD.locked}:2,400 / 2,400 WOKE | HALCYON:${SHIP_OUTCOME_WORD.partial}:1,800 / 2,000 WOKE | KESTREL:${RUN_END_TEXT.notReached}`),
    model.ships.map((row) => `${row.shipName}:${row.outcomeWord}:${row.wokeLine}`).join(' | '));
  h.store.update((d) => { d.run.ships = [{ ...ares, outcome: 'crashed', woke: 0, half: 0, lost: 2400, stars: 0 }]; d.run.endCause = 'stayed'; });
  const stayed = runEndModel(state());
  check('…a run that STAYED on ship 1: its title and why, HALCYON NOT REACHED, DRIFTER, no missing line',
    stayed.title === 'YOU STAYED WITH THEM' && /ARES-VII/.test(stayed.why) && stayed.ships[1]?.outcomeWord === RUN_END_TEXT.notReached
    && stayed.rank === 'DRIFTER' && stayed.missingLine === null && stayed.tone === 'sombre', `${stayed.why} | ${stayed.ships[1]?.outcomeWord}`);
  check('…the seed in hex', /^SEED [0-9A-F]{8}$/.test(model.seedLine), model.seedLine);
}

// --- TRANSMIT after a lost ship: the why line -----------------------------------------------------------
{
  // A crash with AI Comms usable, past the tutorial (run 2: WP8 counts the runs): EMERGENCY TRANSMIT. (WP8 fix
  // round 1: the tutorial is its own flag, the archive's tutorialDone, not the wave: a returning unit has both.)
  h.newRun(6);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; d.run.wave = 2; d.run.tutorial = false; });
  plunge(20, 3);
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
  const crashed = transmitModel(state());
  // WP7 fix round 1: the why line names the Core's real toll (a Core at 100 loses the whole 25).
  check('TRANSMIT after a crash: EMERGENCY TRANSMIT · AI CORE −25 · +3, in the warning colour; 6 hits on the way',
    crashed.why === TRANSMIT_TEXT.why.crashed(25) && crashed.why === 'EMERGENCY TRANSMIT · AI CORE −25 · +3 TRANSIT HITS'
    && crashed.emergency && crashed.hitsLine === TRANSMIT_TEXT.hits(6), `${crashed.why} | ${crashed.hitsLine}`);
  // HOLLOW eats the Core to 0 on ship 1: EMERGENCY, the Core restored to 25.
  h.newRun(7);
  h.store.update((d) => { d.run.phase = 'flight'; d.ui.mode = 'tools'; d.run.wave = 2; d.run.tutorial = false; });
  const core = state().memory.find((seg) => seg.type === 'core')!;
  infectNow(h.store, core);
  h.store.update((d) => { const live = d.memory.find((seg) => seg.type === 'core'); if (live && hasIntegrity(live)) live.integrity = 0.5; d.ui.memoryRev++; });
  h.stepUntil(() => state().run.coreLost, 5);
  continueAfterLoss(h.store);
  const eaten = transmitModel(state());
  check('…after the Core was eaten: EMERGENCY TRANSMIT · AI CORE BACK AT 25%', eaten.why === TRANSMIT_TEXT.why.emergency && eaten.emergency, eaten.why ?? '');
  check('…the screens hold the keys on their own layers', (() => { const close = pushModal('transmit'); const layer = activeLayer(); close(); return layer === 'transmit'; })());
}

// --- Words ---------------------------------------------------------------------------------------------
{
  const ship = 'W'.repeat(NAME_MAX_CHARS);
  const lines = [
    TRANSMIT_TEXT.next(ship, 99_999, 999), TRANSMIT_TEXT.packet(999, 999, 999, 99), TRANSMIT_TEXT.why.crashed(99), TRANSMIT_TEXT.why.crashed(0), TRANSMIT_TEXT.why.emergency,
    TRANSMIT_TEXT.why.abandoned(ship), TRANSMIT_TEXT.why.escaped(ship), TRANSMIT_TEXT.why.stranded(ship), TRANSMIT_TEXT.hits(99),
    TRANSMIT_TEXT.arrival(999, 99, 3, 99, 999), TRANSMIT_TEXT.infected(99), TRANSMIT_TEXT.fits, TRANSMIT_TEXT.tight,
    TRANSMIT_TEXT.sending('UNIT-999', ship), TRANSMIT_TEXT.go, ...Object.values(TRANSMIT_TEXT.without), ...Object.values(TRANSMIT_TEXT.locked).map((value) => (typeof value === 'string' ? value : value('DELETE'))),
    RUN_END_TEXT.kicker('UNIT-999', 99), RUN_END_TEXT.total(99_999, 99_999), RUN_END_TEXT.missing(99_999), RUN_END_TEXT.rankGap(99_999, 'ARK ANGEL'),
    RUN_END_TEXT.lockMiss('▲', 99_999, ship), RUN_END_TEXT.fuelMiss(19, ship), RUN_END_TEXT.seed(0xffffffff),
    ...Object.values(RUN_END_TITLE).map((title) => title('UNIT-999', ship)), ...Object.values(RUN_END_WHY).map((why) => why(ship)),
    LINES.beamOutOffer('fuel'), LINES.beamOutOffer('too-late'), LINES.beamOutOffer('no-engine'), LINES.beaming(100, 599),
    BEAM_OUT_TEXT.detail(ship, 99_999, false), BEAM_OUT_TEXT.detail(ship, 99_999, true), BEAM_OUT_TEXT.abandon,
    // WP12 p3: the bridge warning names HOLLOW by its label (the longest a unit name gets).
    MOVE_PREVIEW_TEXT.bridges('UNIT-999'), MOVE_PREVIEW_TEXT.infected, MOVE_PREVIEW_TEXT.repairFirst, HOLLOW_HUD_TEXT.amberBite('9:59'), `${formatCount(99_999)}`,
  ];
  const long = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check('every WP7 part 2 line fits the strip (≤ 70) with worst-case names', long.length === 0, long.join(' | '));
}

finish();
