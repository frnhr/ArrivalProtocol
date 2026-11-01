// WP12 part 3, the lead's ruling 2 (2026-10-21 06:20): a unit that reaches a new ship with no working REPAIR gets the
// licence back at the boot, loudly (the files arrive as a licence does, CONTROL says `Your REPAIR licence is renewed.
// :)` once the flight starts). A unit with a working Repair, and ship 1 (no transmission), get nothing.
// The crossing is the debug jump's (pack, lay out, the ship's own damage, startShip): the same calls TRANSMIT makes.
import { check, finish } from '../../wp1/harness';
import { createHarness7, type Harness7 } from '../../wp7/harness7';
import { startShip } from '@systems/run';
import { packUnit, layoutCarried, arrivalDamage } from '@systems/carry';
import { installTool, isLicensed, hasWorkingTool } from '@systems/licences';
import { replaceRange, freeSegment, requireAddr, mergeAdjacentFree } from '@systems/memory-ops';
import { infectNow } from '@systems/hollow';
import { getFsTool } from '@state/selectors';
import { LICENCE_RENEWED_REPAIR } from '@data/script';
import { classicShip, CLASSIC_HOPS } from '@data/classic-five';
import type { FsToolSegment } from '@/types/segment';
import { nominalShipThreat } from '@systems/threat-plan';

const h = createHarness7(1);
const state = () => h.store.getState();
const repairFiles = (): FsToolSegment[] => state().memory.filter((seg): seg is FsToolSegment => seg.type === 'fs-tool' && seg.fsTool === 'repair');

// Ship 1 in flight with REPAIR licensed (the kid jacked in).
function shipOneWithRepair(seed: number): void {
  h.newRun(seed);
  h.resetTo('flight', seed);
  if (!isLicensed(state(), 'repair')) installTool(h.store, 'repair');
}

function dropFiles(files: readonly FsToolSegment[]): void {
  h.store.update((d) => {
    for (const file of files) {
      const seg = d.memory.find((candidate) => candidate.id === file.id);
      if (!seg) throw new Error(`no ${file.name} to drop`);
      const start = requireAddr(d.memory, seg);
      replaceRange(d.memory, start, start + seg.size, [freeSegment(seg.size)], { opId: null, own: [seg] });
    }
    mergeAdjacentFree(d.memory);
    d.ui.memoryRev++;
  });
}

// The crossing to ship `index` with the unit as it is now, then the boot until the flight starts.
function crossTo(harness: Harness7, index: number): void {
  const ship = classicShip(index);
  if (!CLASSIC_HOPS[ship.slot]) throw new Error(`${ship.name} has no link`);
  const packet = packUnit(harness.store.getState().memory, CLASSIC_HOPS[ship.slot]!.linkBlocks, []);
  const layout = layoutCarried(packet, packet.chargeCarried, ship, nominalShipThreat(index));
  const scripted = arrivalDamage(layout.racks.segs, ship.arrivalDamage);
  startShip(harness.store, index, layout.racks, {
    hits: [], chargeCarried: packet.chargeCarried, starCredit: 0, stars: 0, card: null, cardCharge: 0, chargeFloorAdded: 0,
    chargeOverflowLost: 0, scripted, seeds: [], boarded: null,
  }, nominalShipThreat(index));
  for (let i = 0; i < 400 && harness.store.getState().run.phase !== 'flight'; i++) harness.step();
  for (let i = 0; i < 40; i++) harness.step();
}

const renewedSaid = (): number => state().log.entries.filter((entry) => entry.speaker === 'control' && entry.text === LICENCE_RENEWED_REPAIR).length;
const licenceEvents = (): number => h.events.filter((event) => event.name === 'licence').length;

// 1. Every Repair lost on ship 1 → HALCYON's boot reissues it.
{
  shipOneWithRepair(1);
  dropFiles(repairFiles());
  check('setup: ship 1 with REPAIR licensed and no Repair file left', isLicensed(state(), 'repair') && repairFiles().length === 0 && !hasWorkingTool(state(), 'repair'));
  const eventsBefore = licenceEvents();
  crossTo(h, 1);
  const files = repairFiles();
  check('HALCYON: the boot reissued REPAIR (a usable copy, the chip back)', hasWorkingTool(state(), 'repair') && getFsTool(state(), 'repair') !== undefined,
    files.map((file) => `${file.name} ${file.integrity}`).join(', '));
  check('…with fresh ids (an eaten old copy may hold the licence\'s own)', files.length > 0 && files.every((file) => /~\d+$/.test(file.id)), files.map((file) => file.id).join(', '));
  check('…the licence\'s sound and chip (a `licence` event)', licenceEvents() === eventsBefore + 1, `${licenceEvents() - eventsBefore}`);
  check('…recorded for this ship', state().run.repairRenewedOn === 1 && state().run.licences.filter((kind) => kind === 'repair').length === 1);
  check('…and CONTROL says `Your REPAIR licence is renewed. :)` once the flight starts', state().run.phase === 'flight' && renewedSaid() === 1, `${renewedSaid()}`);
}

// 2. The only copy left is infected (it is eaten on arrival, §6.9) → reissued too.
{
  shipOneWithRepair(2);
  const [main, ...rest] = repairFiles();
  if (!main) throw new Error('no Repair file');
  dropFiles(rest);
  infectNow(h.store, state().memory.find((seg) => seg.id === main.id)!);
  check('setup: one Repair left, infected', repairFiles().length === 1 && repairFiles()[0]?.infected !== undefined && !hasWorkingTool(state(), 'repair'));
  crossTo(h, 1);
  check('an infected last copy counts as lost: HALCYON reissues REPAIR', state().run.repairRenewedOn === 1 && renewedSaid() === 1
    && repairFiles().some((file) => !file.infected && file.integrity === 100));
}

// 3. A working Repair crosses → nothing reissued, nothing said.
{
  shipOneWithRepair(3);
  const before = repairFiles().length;
  crossTo(h, 1);
  check('a unit that kept its Repair gets no renewal', state().run.repairRenewedOn === null && renewedSaid() === 0 && repairFiles().length === before,
    `${state().run.repairRenewedOn} ${renewedSaid()} ${repairFiles().length}/${before}`);
}

// 4. Never licensed (a kid who never jacked in on ship 1) → the normal REPAIR rule licenses it later, no renewal.
{
  h.newRun(4);
  h.resetTo('flight', 4);
  check('setup: REPAIR not licensed yet', !isLicensed(state(), 'repair'));
  crossTo(h, 1);
  check('a unit never licensed for REPAIR gets no renewal at the boot', state().run.repairRenewedOn === null && renewedSaid() === 0);
}

finish();
