// Slice 3a foundation F1 (slice-3a-plan §6.1 `map/memory-refactor`): the memory and ship-shape refactor changed nothing
// on the classic world. Each classic ship's built world (its memory, flight, landing slice, mission line, burn, orbit,
// the run's threat and HOLLOW's config), on two seeds, hashes to the digest it had before the refactor (HEAD 82928df's
// data/ships.ts and the 384 constants), with the one new field (level.memoryClass) left out. A digest that moves is a
// visible change on the classic world: find it, never re-record it here.
import { createHash } from 'node:crypto';
import { check, finish } from '../wp1/harness';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import { classicShip, CLASSIC_FIVE } from '@data/classic-five';
import { MEMORY_LAYOUTS, layoutOf } from '@data/memory';

const BEFORE = [
  'e60d9463450d056c', '1839e56b75e31c1b', '6e7ce24c7d66671c', '8e5cf73386e5ccec', '9affd0281847a1dc',
  '14a7fcf2862ce8e6', 'e80c9908aee234cc', '668146a4ebf013aa', '1c97cad1bc10a111', '4e5d532e2300a5f4',
];

const now: string[] = [];
for (const seed of [1, 7]) {
  for (let index = 0; index < CLASSIC_FIVE.length; index++) {
    const state = createInitialState({ seed, shipIndex: index, carried: index === 0 ? null : freshUnitRacks(classicShip(index)) });
    const { memoryClass, ...level } = state.level;
    // Slice 3a's removal of MissionMeta.distanceLy (the old title's 581 LY, FLEET_ROUTE_LY) is written back in its old
    // place, so the rest of the mission line is still checked byte for byte.
    const { unitId, shipId, destination, ...missionRest } = state.mission;
    const mission = { unitId, shipId, destination, distanceLy: 581, ...missionRest };
    check(`seed ${seed}, ${classicShip(index).name}: FULL, 384 blocks`, memoryClass === 'FULL' && layoutOf(state) === MEMORY_LAYOUTS.FULL
      && state.memory.reduce((sum, seg) => sum + seg.size, 0) === 384);
    // Slice 4's AUTOBURN mode fields (burn.auto.mode, targetKm, claimed, waitingSinceTSec) are left out the same way: the
    // rest of the flight is still checked byte for byte.
    const { mode, targetKm, claimed, waitingSinceTSec, ...auto } = state.burn.auto;
    void mode; void targetKm; void claimed; void waitingSinceTSec;
    const burn = { ...state.burn, auto };
    const dump = JSON.stringify({
      memory: state.memory, level, landing: state.landing, mission, burn, orbit: state.orbit,
      threat: state.run.threat, hollow: state.hollow,
    });
    // Generated ids (`free~12`) count from module load, so they are left out: the order of imports must not move a digest.
    // F2's one intended change to a built world: the colonist first name Sol is Suvi (05-story §3.11's name rule), read
    // back here so the rest of the world is still checked byte for byte.
    const before = dump.replace(/~\d+/g, '~#').replace(/, Suvi"/g, ', Sol"');
    now.push(createHash('sha256').update(before).digest('hex').slice(0, 16));
  }
}
now.forEach((digest, i) => {
  check(`classic world ${i < 5 ? 'seed 1' : 'seed 7'} · ${classicShip(i % 5).name}: built exactly as before the refactor`, digest === BEFORE[i], `${digest} ≠ ${BEFORE[i]}`);
});
const full = MEMORY_LAYOUTS.FULL;
check('FULL: racks A–F, 384 blocks, unit at 256, receiver 128, room 152, floor 12, 16 pods',
  full.racks.join('') === 'ABCDEF' && full.totalBlocks === 384 && full.unitStart === 256 && full.receiverBlocks === 128
  && full.roomForUnit === 152 && full.chargeFloor === 12 && full.maxPods === 16, JSON.stringify(full));
finish();
