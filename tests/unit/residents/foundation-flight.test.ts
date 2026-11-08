// Slice 5 FOUNDATION (docs/phase3/impl/slice-5-plan.md §6.1 item 4): every resident kind built (withResidentsBuilt), flown on
// the WP7 harness (every DOM-free system mounted as main.ts mounts them, mountResidents among them) on run 1's arm, seed 7,
// walked by the save fixture's beams: the hot paths a resident file meets (the boot, the flight's ticks, HOLLOW's spread
// and THE DEAL, the strip, the tools' rules, the ship's end and SHIP DONE's save) run with the FOUNDATION's stubs, and
// later with the tracks' bodies, without a throw. Its checks hold whatever the tracks build (no kid acts here):
// • ARES-VII → HALCYON → GANNET (the corrupted WARDEN) → PLOVER (the departed BOSUN, the gone-resident `?` ship); a second
//   run ARES-VII → PETREL → CURLEW (the sleeper BARNABY);
// • each resident ship's boot says the amber RECEIVER CLOSED line, its files stand in rack A after Cargo Ctrl, memory stays
//   whole through 30 AI s of flight, and its SHIP DONE records it (WARDEN ignored, BOSUN left, BARNABY slept) in a save
//   that decodes; a ship with no resident (HALCYON, ARES-VII) says no such line and records nothing.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createHarness7 } from '../wp7/harness7';
import { withResidentsBuilt } from '../support/residents';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk, storedSave } from '../save/save-fixture';
import { RESIDENT_TEXT } from '@data/resident-text';
import { isResidentFile } from '@state/selectors';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { currentSlot } from '@systems/map-streams';

const SEED = 7;
const FLY_AI_SEC = 30;
const h = createHarness7(SEED);
const state = (): Readonly<GameState> => h.store.getState();

// The ship's boot played out, then FLY_AI_SEC of its flight (no kid: nothing acts), memory checked whole as it goes.
function bootAndFly(): { lines: string[]; whole: boolean; flew: boolean } {
  const from = state().log.entries.length;
  h.stepUntil(() => state().run.phase === 'flight', 60);
  const lines = state().log.entries.slice(from).filter((entry) => entry.tone === 'resident').map((entry) => entry.text);
  let whole = true;
  const flying = state().run.phase === 'flight';
  const until = state().clock.aiSec + FLY_AI_SEC;
  h.stepUntil(() => {
    try { assertMemoryInvariants(state().memory, layoutOf(state()).totalBlocks); } catch { whole = false; }
    return state().clock.aiSec >= until || state().run.phase !== 'flight';
  }, 120);
  return { lines, whole, flew: flying && state().clock.aiSec >= until };
}

withResidentsBuilt(['corrupted', 'left', 'sleeping'], () => {
  for (const [label, route, fates] of [
    ['run A', [2, 9, 10], [null, 'WARDEN:ignored', 'BOSUN:left']],
    ['run B', [1, 7], ['STEWARD:left', 'BARNABY:slept']],
  ] as const) {
    const storage = stubStorage();
    pageOpen(h.store, storage, SEED);
    receiveToReport(h.store);
    route.forEach((slot, i) => {
      beamTo(h.store, slot);
      const name = state().level.shipName;
      const def = state().resident.def;
      const rackA = state().memory.slice(0, 12).filter(isResidentFile);
      const flight = bootAndFly();
      const want = fates[i] ?? null;
      check(`${label}, ${name} (slot ${currentSlot(state().run)}): ${def === null ? 'no resident, no RECEIVER CLOSED line' : `${def.name}'s files in rack A, the amber RECEIVER CLOSED line`}; ${FLY_AI_SEC} AI s of flight, memory whole`,
        (def === null ? flight.lines.length === 0 && rackA.length === 0
          : flight.lines.length === 1 && flight.lines[0] === RESIDENT_TEXT.receiverClosed && rackA.length > 0 && rackA.every((seg) => 'owner' in seg && seg.owner === def.name))
        && flight.whole && flight.flew && (def === null) === (want === null), JSON.stringify({ def, ...flight }));
      const met = state().run.residents.met.length;
      toDesk(h.store);
      const record = state().run.residents.met[met];
      const saved = storedSave(storage).save;
      check(`…its SHIP DONE ${want === null ? 'records no resident' : `records ${want}`}, and the save decodes`,
        saved.point === 'ship-done' && (want === null ? state().run.residents.met.length === met : `${record?.name}:${record?.fate}` === want
          && record?.slot === slot && record.depth === i + 2),
        JSON.stringify(state().run.residents.met));
    });
  }
});

finish();
