// BALANCE_ONLY: a corrupted resident ignored, deleted, cured, paid or blocked, flown by the strip on run 1's GANNET (information until slice 8)
// Slice 5 Track WARDEN (docs/phase3/impl/slice-5-plan.md §7.2): GANNET (seed 7, slot 9, WARDEN `reported faulty`, 7 pods) and
// the ship with no resident, and with a failing Thrust Ctrl and no resident (the arm's unfixed limp), each approach flown by
// the strip (wp2 followDirector with the WP7 defender), the kid answering the resident by one policy, then the instant
// landing. It reports FUEL at the end of the flight, the outcome, the bursts (the resident's own), the locks landed and
// blocked, the DEAL and the pods down and parked; and R3's ratio measured: the resident's bursts per AI s against the
// failing controller's, and the fuel each costs the flight against the ship with no resident. The checks are information
// (OPEN-DECISIONS 13's numbers), except that every flight reaches its LANDING REPORT.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createHarness7 } from '../wp7/harness7';
import { followDirector } from '../wp2/harness2';
import { withResidents } from '../support/residents';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk } from '../save/save-fixture';
import { giveTools } from '../map/repo-fixture';
import { actionScan, actionDelete, actionRepair } from '@state/actions';
import { residentFile } from '@state/resident-selectors';
import { pickChoice, openChoiceEntry } from '@systems/say';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { podCounts } from '@systems/landing-rules';

const SEED = 7;
const ROUTE = [2, 9];
const h = createHarness7(SEED);
const s = (): Readonly<GameState> => h.store.getState();
type Policy = 'none' | 'failing' | 'ignore' | 'accept' | 'refuse' | 'block' | 'delete' | 'cure';
interface Row { policy: Policy; status: string; fuel: number; bursts: number; aiSec: number; locks: number; blocked: number; deal: string; down: number; parked: number; report: boolean }

function fly(policy: Policy): Row {
  return withResidents({ corrupted: policy !== 'none' && policy !== 'failing' }, () => {
    pageOpen(h.store, stubStorage(), SEED);
    receiveToReport(h.store);
    ROUTE.forEach((slot, i) => { beamTo(h.store, slot); if (i < ROUTE.length - 1) toDesk(h.store); });
    h.stepUntil(() => s().run.phase === 'flight', 60);
    if (policy === 'failing') {
      h.store.update((draft) => {
        const thrust = draft.memory.find((seg) => seg.role === 'thrust-ctrl');
        if (thrust?.type === 'ship') thrust.integrity = 30;
      });
    }
    if (policy === 'delete') giveTools(h.store, ['delete']);
    const kid = (): boolean => {
      const state = s();
      const corrupted = state.resident.corrupted;
      const file = residentFile(state);
      if (corrupted === null || state.clock.aiSec < 3) return false;
      if ((policy === 'delete' || policy === 'cure') && file !== null && canStartOp() && getOpsBySeg(file.id).length === 0) {
        if (!file.scanned) actionScan(h.store, file);
        else if (policy === 'delete') actionDelete(h.store, file);
        else if (file.integrity < 100) actionRepair(h.store, file);
      }
      const entry = openChoiceEntry(state);
      if (entry !== null && corrupted.deal.phase === 'offered' && (policy === 'accept' || policy === 'refuse')) pickChoice(entry.id, policy === 'accept' ? 'ACCEPT' : 'REFUSE');
      const lock = corrupted.lock;
      if (lock !== null && policy === 'block' && canStartOp() && getOpsBySeg(lock.segId).length === 0) {
        const driver = state.memory.find((seg) => seg.id === lock.segId);
        if (driver !== undefined) actionScan(h.store, driver);
      }
      return false;
    };
    followDirector(h, { reactionSec: 0.4, maxWall: 900, mistake: () => { h.defend(); return kid(); } });
    const corrupted = s().resident.corrupted;
    const row: Row = {
      policy, status: s().burn.status, fuel: s().burn.fuelPct, bursts: s().burn.ghostBursts, aiSec: s().clock.aiSec,
      locks: corrupted?.locksLanded ?? 0, blocked: corrupted?.locksBlocked ?? 0, deal: corrupted?.deal.outcome ?? '-', down: 0, parked: 0, report: false,
    };
    h.stepUntil(() => s().run.phase !== 'landing', 120);
    const counts = podCounts(s());
    return { ...row, down: counts.down, parked: counts.parked, report: s().run.phase === 'report' };
  });
}

const rows = (['none', 'failing', 'ignore', 'accept', 'refuse', 'block', 'delete', 'cure'] as const).map(fly);
for (const row of rows) {
  check(`GANNET ${row.policy.padEnd(7)}: ${row.status}, FUEL ${row.fuel.toFixed(1)}%, ${row.bursts} bursts in ${row.aiSec.toFixed(0)} AI s, `
    + `locks ${row.locks} landed / ${row.blocked} blocked, DEAL ${row.deal}, pods ${row.down} down / ${row.parked} parked`, row.report);
}
const by = (policy: Policy): Row => rows.find((row) => row.policy === policy)!;
const rate = (row: Row): number => row.bursts / row.aiSec;
const none = by('none');
check(`R3 measured: the resident ignored fires ${rate(by('ignore')).toFixed(3)} bursts per AI s against the failing controller's `
  + `${rate(by('failing')).toFixed(3)} (×${(rate(by('ignore')) / rate(by('failing'))).toFixed(2)}; the specs' push 0.71, its 30 s of anger after the DEAL's timeout included); `
  + `FUEL at the end of the flight ${by('ignore').fuel.toFixed(1)}% and ${by('failing').fuel.toFixed(1)}% against ${none.fuel.toFixed(1)}% with neither`, true);
finish();
