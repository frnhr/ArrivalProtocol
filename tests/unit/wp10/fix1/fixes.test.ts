// WP10 review fixes, round 1: the fixes not already covered by the edited suites (deal-test: the hold, the seed clock,
// the ship's end; skip-through and lead2/ghost-warp: the strict SKIP; p2/views: the ticker's clock), headless on
// VESPER (harness10, every DOM-free system).
// • The orphaned backup: with Thrust Controller deleted (or eaten), the strip says `NO THRUST CONTROLLER — [TAB], SWAP in
//   Thrust.alt`, and SWAP on Thrust.alt puts it into service (the job, the name, the engine back; it keeps its own
//   health). The DELETE confirm for the controller says what a SWAP undoes. A copy of the backup is no spare.
// • A sticky FIRST burst (a controller dead before it ever fired) shows `THE ENGINE IS STUCK FIRING — tap [SPACE]…`,
//   not the first-burst alarm line.
// • A seed that hunts tools prefers a gap on its tool's own rack row, and its warning names the file it can bite
//   (`SEED NEXT TO …`).
// • ▼'s drift: after an uncommanded burst the plot's ▼ label and the LOWEST readout say how far it moved, in red
//   (`▼ DRIFT −60 km`, `(−60 km)`), for GHOST_DRIFT_SHOW_SEC; under a rough sensor only the way (`↓`); a run of bursts
//   adds up; a held burn is never blamed on the ghost.
import { check, finish } from '../../wp1/harness';
import { createHarness10 } from '../harness10';
import { actionDelete, actionSwap, actionCopy } from '@state/actions';
import { deleteQuestion, swapPair } from '@systems/tool-targets';
import { capabilitiesNow } from '@systems/capabilities';
import { getByRole, filesWithRole } from '@state/selectors';
import { setMode } from '@systems/mode';
import { getOps } from '@systems/ops-core';
import { flightObjective, buildFlightContext } from '@systems/guidance';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { plotMarkers, plotReadouts } from '@systems/flight-hud';
import { ghostDriftKm } from '@systems/ghost-thrust';
import { nearToolsSeedSpot, threateningSeeds } from '@systems/hollow';
import { segmentStarts, replaceRange } from '@systems/memory-ops';
import { SEED_ALERT_ID } from '@systems/alerts';
import { GHOST_TEXT } from '@data/ghost-text';
import { HOLLOW_ALERT_TEXT } from '@data/hollow-text';
import { GHOST_DRIFT_SHOW_SEC, RACK_BLOCKS, SWAP_SEC } from '@data/tuning';
import type { Segment, ShipBackupSegment, FreeSegment, FsToolSegment } from '@/types/segment';

const h = createHarness10(3);
const state = () => h.store.getState();

function named(name: string): Segment {
  const seg = state().memory.find((candidate) => candidate.name === name);
  if (!seg) throw new Error(`no ${name}`);
  return seg;
}

function line(): string {
  return flightObjective(buildFlightContext(state(), getSensedPrediction()))?.text ?? '';
}

// --- The orphaned backup ------------------------------------------------------------------------------------------
{
  h.vesper(21, { hollowAsleep: true });
  h.stepUntil(() => state().run.licences.includes('swap'), 120);
  const primary = getByRole(state(), 'thrust-ctrl')!;
  const question = deleteQuestion(state(), primary);
  check('the DELETE confirm for the controller says a SWAP undoes it', question?.detail.startsWith('The engine stops till you SWAP in Thrust.alt.') === true
    && question.detail.length <= 70, question?.detail);
  check('DELETE Thrust Controller starts', actionDelete(h.store, primary) === null);
  while (getOps().length > 0) h.step();
  check('…the controller is gone: NO THRUST CONTROLLER', capabilitiesNow(state()).thrustCtrl.band === 'missing' && filesWithRole(state(), 'thrust-ctrl').length === 0);
  check('…and the strip names the way back: `NO THRUST CONTROLLER — [TAB], SWAP in Thrust.alt`',
    line() === 'NO THRUST CONTROLLER — [TAB], SWAP in Thrust.alt', line());
  const backup = named('Thrust.alt') as ShipBackupSegment;
  check('…SWAP on the orphaned Thrust.alt is a pair of its own (no primary)', swapPair(state(), backup)?.primary === null);
  check('…and starts (no `NO BACKUP TO SWAP TO`)', actionSwap(h.store, backup) === null);
  const startAi = state().clock.aiSec;
  while (getOps().length > 0) h.step();
  const taking = getByRole(state(), 'thrust-ctrl');
  check(`…in ${SWAP_SEC} s Thrust.alt does the job, named Thrust Controller, scanned, at its own 100: the engine works, no ghost`,
    taking === backup && backup.name === 'Thrust Controller' && backup.scanned && backup.integrity === 100 && backup.backs === undefined
    && capabilitiesNow(state()).thrustCtrl.band === 'ok' && capabilitiesNow(state()).thrustCtrl.ghost === null
    && Math.abs(state().clock.aiSec - startAi - SWAP_SEC) < 0.11, `${backup.name} ${capabilitiesNow(state()).thrustCtrl.band}`);
  check('…the echo names the backup: `> swap thrust.alt ... OK`', state().log.entries.some((entry) => entry.text === '> swap thrust.alt ... OK'));
  check('…and the strip has moved on', !line().startsWith('NO THRUST CONTROLLER'), line());
}

{
  // A COPY of Thrust.alt is no backup the ship knows of: with the primary gone, only the original is a spare.
  h.vesper(22, { hollowAsleep: true });
  h.stepUntil(() => state().run.licences.includes('swap'), 120);
  const free = state().memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]!;
  check('a COPY of Thrust.alt starts', actionCopy(h.store, named('Thrust.alt'), { regionSegIds: [free.id], col: 0 }) === null);
  while (getOps().length > 0) h.step();
  const copy = named('Thrust.alt.cp') as ShipBackupSegment;
  actionDelete(h.store, getByRole(state(), 'thrust-ctrl')!);
  while (getOps().length > 0) h.step();
  check('…the copy backs no job and is no pair, the original still is', copy.backs === undefined && swapPair(state(), copy) === null
    && swapPair(state(), named('Thrust.alt'))?.primary === null);
}

// --- The ghost lesson survives a TAB for something else (found in the browser run from TRANSMIT) --------------------
{
  h.vesper(27, { hollowAsleep: true });
  h.stepUntil(() => state().burn.ghostBursts >= 2 && state().director.shown?.id === 'tut-ghost-pip', 200);
  check('after the second burst the pip lesson stands in amber', state().director.shown?.id === 'tut-ghost-pip', state().director.shown?.id);
  // A TAB to the MIND for something else (no file selected), and back.
  setMode(h.store, 'memory');
  h.stepFor(1);
  const inMind = state().director.shown?.id;
  setMode(h.store, 'tools');
  h.stepFor(0.5);
  check('…a TAB to the MIND (the SWAP step there) and back leaves it standing: the way to the cause is shown again',
    inMind === 'tut-ghost-swap' && state().director.shown?.id === 'tut-ghost-pip' && !state().director.done.includes('tut-ghost-pip'),
    `${inMind} → ${state().director.shown?.id}`);
  // The pip's jump (the file selected in the MIND) is what marks it done.
  setMode(h.store, 'memory');
  h.store.update((d) => { d.ui.selectedId = getByRole(state(), 'thrust-ctrl')!.id; });
  h.stepFor(0.5);
  check('…at the file (the pip\'s jump) it is done', state().director.done.includes('tut-ghost-pip'));
  // With the Swap file eaten, the MIND step does not ask for a SWAP nobody can pick up.
  h.store.update((d) => {
    const swap = d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap');
    if (!swap || !('integrity' in swap)) throw new Error('no Swap');
    swap.integrity = 0;
    d.ui.memoryRev++;
  });
  h.stepFor(0.5);
  check('…and with no live Swap file the MIND step does not ask for a SWAP', state().director.shown?.id !== 'tut-ghost-swap', state().director.shown?.id);
}

// --- A sticky FIRST burst says how to stop it ------------------------------------------------------------------------
{
  let shown = '';
  let found = false;
  for (let seed = 30; seed < 90 && !found; seed++) {
    h.vesper(seed, { hollowAsleep: true });
    h.store.update((d) => {
      const file = d.memory.find((seg) => seg.role === 'thrust-ctrl');
      if (!file || !('integrity' in file)) throw new Error('no Thrust Ctrl');
      file.integrity = 10;
      d.ui.memoryRev++;
    });
    h.stepUntil(() => state().burn.ghostBursts > 0, 120);
    if (state().burn.ghostBursts === 1 && state().burn.ghost?.sticky === true) {
      found = true;
      h.stepFor(1);
      shown = state().director.shown?.text ?? '';
    }
  }
  check('a sticky first burst (dead controller): the strip says `THE ENGINE IS STUCK FIRING — tap [SPACE] to stop it`, not the alarm line',
    found && shown === GHOST_TEXT.stuckLine, found ? shown : 'no sticky first burst in 60 seeds');
}

// --- Seeds that hunt tools ------------------------------------------------------------------------------------------
{
  h.vesper(23, { hollowAsleep: true });
  h.step();
  // Rack F's free tail made smaller than rack E's (12 blocks, next to Scan across the row): before the fix the larger
  // gap won and the seed sat at the far end of rack E, a row away from the tool it hunted.
  const memory = state().memory;
  const starts = segmentStarts(memory);
  const tailIndex = memory.findIndex((seg, index) => seg.type === 'free' && starts[index]! >= 5 * RACK_BLOCKS);
  const tail = memory[tailIndex]!;
  const filler: FsToolSegment = {
    id: 'filler', name: 'Filler', type: 'fs-tool', size: tail.size - 6, integrity: 100, scanned: true, fsTool: 'scan', version: 1,
  };
  replaceRange(memory, starts[tailIndex]!, starts[tailIndex]! + filler.size, [filler], { opId: null, own: [] });
  const freeE = memory.find((seg, index) => seg.type === 'free' && segmentStarts(memory)[index]! < 5 * RACK_BLOCKS && segmentStarts(memory)[index]! >= 4 * RACK_BLOCKS)!;
  const freeF = memory.find((seg, index) => seg.type === 'free' && segmentStarts(memory)[index]! >= 5 * RACK_BLOCKS)!;
  // WP11: every tool tried (nearToolsSeedSpot's `untried`; the copy-test checks the spared ones).
  const spot = nearToolsSeedSpot(memory, [])!;
  check('a seed that hunts tools takes the gap on its tool\'s own rack row over a larger one across the row',
    freeE.size > freeF.size && Math.floor(spot.startAddr / RACK_BLOCKS) === 5 && spot.gapId === freeF.id,
    `E ${freeE.size}, F ${freeF.size}, spot ${spot.startAddr.toString(16)}`);
}

{
  h.vesper(24);
  h.stepUntil(() => state().hollow.seedsLanded > 0, 200);
  h.stepFor(0.2);
  const alert = state().alerts.list.find((candidate) => candidate.id === SEED_ALERT_ID);
  const threat = threateningSeeds(state().memory, state().clock.aiSec).length > 0;
  check('a seed next to a tool: its warning names what it can bite (`SEED NEXT TO …`), not `SEED IN YOUR WALL`',
    threat && alert !== undefined && alert.text.startsWith('SEED NEXT TO ') && alert.text !== HOLLOW_ALERT_TEXT.seedThreat, alert?.text);
}

// --- ▼'s drift ----------------------------------------------------------------------------------------------------------
{
  h.vesper(25, { hollowAsleep: true });
  const rpBefore = getPrediction().rp;
  h.stepUntil(() => state().burn.ghostBursts >= 1 && state().burn.ghost === null, 120);
  const drift = ghostDriftKm(state());
  const marker = plotMarkers(state(), getSensedPrediction(), { ...capabilitiesNow(state()).plot, mode: 'exact', fuzzKm: 0 }).peri;
  const readouts = plotReadouts(state(), getSensedPrediction(), { ...capabilitiesNow(state()).plot, mode: 'exact', fuzzKm: 0 });
  const readout = readouts.lowest;
  const driftLine = marker?.lines.find((text) => text.startsWith('▼ DRIFT')) ?? '';
  check('after an uncommanded burst with RETRO pointed, ▼ drifted down, and the drift is the true change in ▼',
    drift !== null && drift < 0 && Math.abs(getPrediction().rp - rpBefore - drift) < 1e-3, `${drift?.toFixed(1)} km`);
  check('…the plot\'s ▼ label says it, in red (`▼ DRIFT −60 km`)', /^▼ DRIFT −\d+ km$/.test(driftLine) && marker?.tone === 'danger', `${driftLine} ${marker?.tone}`);
  // WP12 p3: the amount moved to the LOWEST caption (`▼ LOWEST −60`), so the reading fits its column at 1280×720.
  check('…and the LOWEST readout too: red, its caption says `−60`', /^−[\d,]+$/.test(readouts.lowestDrift ?? '') && /km$/.test(readout.text)
    && readout.tone === 'danger', `${readouts.lowestDrift} · ${readout.text}`);
  const rough = plotMarkers(state(), getSensedPrediction(), { ...capabilitiesNow(state()).plot, mode: 'approx', fuzzKm: 330 }).peri;
  check('…under a rough sensor only the way it went (`▼ DRIFT ↓`)', rough?.lines.includes(GHOST_TEXT.drift(GHOST_TEXT.driftDown)) === true,
    rough?.lines.join(' / '));
  // A second burst inside the show time adds to the same drift.
  const firstDrift = drift ?? 0;
  const secondBurstIn = state().clock.aiSec;
  h.stepUntil(() => state().burn.ghostBursts >= 2 && state().burn.ghost === null, 120);
  const within = state().clock.aiSec - secondBurstIn <= GHOST_DRIFT_SHOW_SEC;
  if (within) {
    check('…a burst within the show time adds up', (ghostDriftKm(state()) ?? 0) < firstDrift, `${ghostDriftKm(state())?.toFixed(1)}`);
  }
  h.stepFor(GHOST_DRIFT_SHOW_SEC + 0.2);
  const quietAgain = state().burn.ghost === null && ghostDriftKm(state()) === null;
  const after = plotMarkers(state(), getSensedPrediction(), { ...capabilitiesNow(state()).plot, mode: 'exact', fuzzKm: 0 }).peri;
  check(`…gone ${GHOST_DRIFT_SHOW_SEC} s after the burst (unless another came)`,
    (quietAgain && !after?.lines.some((text) => text.startsWith('▼ DRIFT'))) || state().burn.ghost !== null || ghostDriftKm(state()) !== null && state().burn.ghostBursts > 2);
}

{
  // A held burn (TOO EARLY) during a burst: no drift is shown (the kid's own burn moves ▼ too).
  h.vesper(26, { hollowAsleep: true });
  h.stepUntil(() => state().burn.ghostBursts >= 1 && state().burn.ghost === null, 120);
  h.stepFor(GHOST_DRIFT_SHOW_SEC + 0.5);
  h.keyDown('Space');
  h.stepUntil(() => state().burn.ghost !== null, 120);
  const during = ghostDriftKm(state());
  h.keyUp('Space');
  check('a burst under the kid\'s own held burn shows no drift (the burn is not the ghost\'s)', during === null, `${during}`);
}

finish();
