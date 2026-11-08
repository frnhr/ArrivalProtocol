// WP12 part 3, two WP10 verify minors (LEAD_NOTES `Into WP12 (WP10 verify minors)`), headless on VESPER (harness10):
// • After a COPY of the controller and a DELETE of the original, the DELETE confirm told the truth about neither file
//   and Thrust.alt was refused. Now a backup pairs with whichever file holds its role: the original's confirm says
//   the copy keeps the engine going; with the original gone, SWAP on Thrust.alt (or on the copy) hands the job over.
// • The strip asked for `SWAP in Thrust.alt` with the Swap file eaten. Now it asks for the Swap file's REPAIR first
//   while one is in memory, and with none says the engine can't fire.
import '../../support/classic-world';
import { check, finish } from '../../wp1/harness';
import { createHarness10 } from '../../wp10/harness10';
import { actionDelete, actionSwap, actionCopy } from '@state/actions';
import { deleteQuestion, swapPair, findBackup } from '@systems/tool-targets';
import { capabilitiesNow } from '@systems/capabilities';
import { getByRole, filesWithRole } from '@state/selectors';
import { getOps } from '@systems/ops-core';
import { flightObjective, buildFlightContext } from '@systems/guidance';
import { getSensedPrediction } from '@systems/predict';
import { setMode } from '@systems/mode';
import type { Segment, FreeSegment, ShipSegment } from '@/types/segment';

const h = createHarness10(3);
const state = () => h.store.getState();
const named = (name: string): Segment => {
  const seg = state().memory.find((candidate) => candidate.name === name);
  if (!seg) throw new Error(`no ${name}`);
  return seg;
};
const line = (): string => flightObjective(buildFlightContext(state(), getSensedPrediction()))?.text ?? '';
const biggestFree = (): FreeSegment =>
  state().memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]!;

// --- COPY the controller, DELETE the original, SWAP in Thrust.alt --------------------------------------------------
{
  h.vesper(21, { hollowAsleep: true });
  h.stepUntil(() => state().run.licences.includes('swap') && state().run.licences.includes('copy'), 120);
  const original = getByRole(state(), 'thrust-ctrl') as ShipSegment;
  check('setup: a COPY of the controller starts', actionCopy(h.store, original, { regionSegIds: [biggestFree().id], col: 0 }) === null);
  while (getOps().length > 0) h.step();
  const copy = named('Thrust Controller.cp') as ShipSegment;
  check('…two files do the job (the original links Thrust.alt, the copy does not)', filesWithRole(state(), 'thrust-ctrl').length === 2
    && original.backup !== undefined && copy.backup === undefined);
  const question = deleteQuestion(state(), original);
  check('the original\'s DELETE confirm says the copy keeps the engine going (not "the engine stops till you SWAP")',
    question?.detail.startsWith('Thrust Controller.cp keeps doing its job.') === true, question?.detail);
  check('DELETE the original starts', actionDelete(h.store, original) === null);
  while (getOps().length > 0) h.step();
  check('…the copy holds the job, and Thrust.alt now pairs with it', getByRole(state(), 'thrust-ctrl') === copy
    && findBackup(state(), copy)?.name === 'Thrust.alt' && swapPair(state(), named('Thrust.alt'))?.primary === copy);
  const copyQuestion = deleteQuestion(state(), copy);
  check('the copy\'s DELETE confirm names the SWAP that undoes it', copyQuestion?.detail.startsWith('The engine stops till you SWAP in Thrust.alt.') === true,
    copyQuestion?.detail);
  check('SWAP on Thrust.alt starts (it was refused: no backup)', actionSwap(h.store, named('Thrust.alt')) === null);
  while (getOps().length > 0) h.step();
  const doing = getByRole(state(), 'thrust-ctrl');
  check('…Thrust.alt does the job, named Thrust Controller; the copy is Thrust.old, switched off',
    doing?.type === 'ship-backup' && doing.name === 'Thrust Controller' && copy.name === 'Thrust.old' && copy.state === 'inactive' && copy.role === undefined,
    `${doing?.name} / ${copy.name} ${copy.state}`);
  check('…the controller is ok', capabilitiesNow(state()).thrustCtrl.band === 'ok');
}

// --- A lost controller with the Swap file hurt, then gone ------------------------------------------------------------
{
  h.vesper(22, { hollowAsleep: true });
  h.stepUntil(() => state().run.licences.includes('swap'), 120);
  check('DELETE Thrust Controller starts', actionDelete(h.store, getByRole(state(), 'thrust-ctrl')!) === null);
  while (getOps().length > 0) h.step();
  check('with a usable Swap file: `NO THRUST CONTROLLER — [TAB], SWAP in Thrust.alt`', line() === 'NO THRUST CONTROLLER — [TAB], SWAP in Thrust.alt', line());
  h.store.update((d) => {
    const swap = d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap');
    if (!swap || !('integrity' in swap)) throw new Error('no Swap');
    swap.integrity = 20;
    d.ui.memoryRev++;
  });
  h.step();
  check('the Swap file too damaged to pick up: `NO THRUST CONTROLLER — [TAB], REPAIR Swap first`', line() === 'NO THRUST CONTROLLER — [TAB], REPAIR Swap first', line());
  setMode(h.store, 'memory');
  h.step();
  check('…in the MIND: `NO THRUST CONTROLLER — REPAIR Swap, then SWAP in Thrust.alt`',
    line() === 'NO THRUST CONTROLLER — REPAIR Swap, then SWAP in Thrust.alt', line());
  setMode(h.store, 'tools');
  h.store.update((d) => {
    const index = d.memory.findIndex((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap');
    const swap = d.memory[index]!;
    d.memory[index] = { id: `free~swap${index}`, name: 'Free', type: 'free', size: swap.size };
    d.ui.memoryRev++;
  });
  h.step();
  check('no Swap file at all: `NO THRUST CONTROLLER — the engine can\'t fire`', line() === "NO THRUST CONTROLLER — the engine can't fire", line());
}

finish();
