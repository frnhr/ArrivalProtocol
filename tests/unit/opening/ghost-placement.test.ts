// The last unit's ghost leaves ship 1 (05 §3.5; slice-2-plan's "Follow-up: the ghost line leaves ship 1", from Fran's
// playtest): it speaks at the first boot at or past the ship where the last unit's run ended, never at ship 1, once a run.
// • Run 2 after UNIT-047 was lost on VESPER, every ship left by a crash (EMERGENCY TRANSMIT): ARES-VII, HALCYON and
//   KESTREL boot without it; VESPER's boot opens on it (before the boarding's 108% unpack, which still fires its moment),
//   a skip waits while it types; LAST LIGHT's boot has none (it spoke once).
// • HOLLOW's notice after VESPER's first fight is `> you remember me. good.` once the ghost has spoken this run, and
//   `> ...048?` on a run 2 whose ghost speaks further on (lost on LAST LIGHT: it has not spoken by VESPER).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { receiveTransmission, skipBoot, bootSkipWaits } from '@systems/boot';
import { startRun } from '@systems/run';
import { continueAfterLoss } from '../support/classic-flow';
import { actionRepair, setIntegrity } from '@state/actions';
import { infectNow } from '@systems/hollow';
import { getAiCore } from '@state/selectors';
import { lineageOf, freshMeta, recordRunStart, recordRunEnd, recordTutorialDone, ghostLine, type LastCause } from '@systems/meta';
import { installTool } from '@systems/licences';
import { HOLLOW_STORY } from '@data/hollow-text';
import { THREAT_TEXT } from '@data/threat-text';
import { BOOT_GHOST_AT_SEC } from '@data/tuning';
import type { GameState, LogEntry } from '@state/schema';
import type { DriverSegment } from '@/types/segment';

const h = createHarness7(23, { soulsFound: true });
const s = (): Readonly<GameState> => h.store.getState();
const said = (from = 0): LogEntry[] => s().log.entries.slice(from);
// The lines a boot typed (the log's divider is no line).
const lines = (from: number): LogEntry[] => said(from).filter((entry) => entry.channel === 'mind' && entry.text.startsWith('>'));

// UNIT-047's run as the archive keeps it: ARES-VII flown through, then ended with `cause` on `shipName`.
function lineageAfter(cause: LastCause, shipName: string) {
  const progress = { unit: 47, shipName, woke: 3100, stats: { moves: 4, deletes: 0 }, hollowUnits: [46] };
  return lineageOf(recordRunEnd(recordTutorialDone(recordRunStart(freshMeta(), progress, 0)), { ...progress, cause, score: 3000 }));
}

function newRun(seed: number, cause: LastCause, shipName: string): void {
  h.newRun(seed);
  startRun(h.store, seed, lineageAfter(cause, shipName));
}

// The ship is left by a crash (EMERGENCY TRANSMIT), and the next one boots: the boot's first log entry index.
function crashOn(): number {
  h.store.update((d) => { d.run.simulationRetryUsed = true; });
  h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
  const from = s().log.entries.length;
  h.transmit();
  return from;
}

// --- Run 2 after a loss on VESPER ----------------------------------------------------------------------------------------
newRun(31, 'overwritten', 'VESPER');
const ghost = ghostLine(48, s().run.lastUnit)!;
check('run 2 after UNIT-047 was lost on VESPER: UNIT-048, a ghost to come', s().run.unitNumber === 48 && ghost === "> hi 048. it's 047. 046 ate me. now i'm hungry too."
  && !s().run.ghostSpoken, ghost);
receiveTransmission(h.store);
check('ship 1\'s boot does not wait for a ghost (the strip offers the skip)', !bootSkipWaits(s()));
h.stepUntil(() => s().run.phase === 'flight', 20);
check('…ARES-VII\'s boot: no ghost, nothing from HOLLOW (05 §3.5: never at ship 1)', !said().some((entry) => entry.speaker === 'hollow') && !s().run.ghostSpoken
  && lines(0)[0]?.text === '> UNPACKING UNIT-048 ... 100%', lines(0)[0]?.text);
for (const name of ['HALCYON', 'KESTREL']) {
  const from = crashOn();
  h.stepUntil(() => s().run.phase === 'flight', 30);
  check(`${name}'s boot: no ghost (it speaks at VESPER)`, s().level.shipName === name && !said(from).some((entry) => entry.speaker === 'hollow')
    && !s().run.ghostSpoken, said(from).filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text).join(' | '));
}
const vesperFrom = crashOn();
check('VESPER: HOLLOW boards on this beam (the 108% unpack is in the plan)', s().level.shipName === 'VESPER' && s().run.arrival?.boarded !== null);
check('…its boot waits for the ghost (no skip offered before the first tick)', bootSkipWaits(s()));
h.stepFor(BOOT_GHOST_AT_SEC + 0.1);
check('…the ghost types first, in HOLLOW\'s voice', lines(vesperFrom)[0]?.speaker === 'hollow' && lines(vesperFrom)[0]?.text === ghost && s().run.ghostSpoken,
  `${lines(vesperFrom)[0]?.speaker}: ${lines(vesperFrom)[0]?.text}`);
check('…a skip while it types is refused', !skipBoot(h.store) && s().run.phase === 'boot' && bootSkipWaits(s()));
const boardsBefore = h.events.filter((event) => event.name === 'hollow-boarded').length;
h.stepUntil(() => s().run.phase === 'flight', 40);
const vesperLines = lines(vesperFrom).map((entry) => entry.text);
const board = THREAT_TEXT.boardUnpack('UNIT-048');
check('…then the boot\'s own lines, the boarding\'s 108% unpack first: ghost → 108% → host…', vesperLines[0] === ghost && vesperLines[1] === board
  && vesperLines.length > 3, vesperLines.join(' | '));
check('…and the boarding moment still fires (hollow-boarded, as the 108% line is said)',
  h.events.filter((event) => event.name === 'hollow-boarded').length === boardsBefore + 1);
check('…the ghost said once', said().filter((entry) => entry.text === ghost).length === 1);

// HOLLOW's notice after VESPER's first fight: the ghost spoke at this boot, so HOLLOW is remembered.
function fightToNotice(): string | null {
  setLandingMode('manual');
  if (!s().run.licences.includes('repair')) installTool(h.store, 'repair');
  lockOn(h);
  let bitten: DriverSegment | null = null;
  for (let i = 0; i < 200 && bitten === null; i++) {
    h.step();
    bitten = s().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.infected !== undefined) ?? null;
  }
  if (bitten === null) return null;
  const target = bitten.id;
  for (let i = 0; i < 600 && s().memory.find((seg) => seg.id === target)?.type === 'driver'; i++) {
    const seg = s().memory.find((candidate) => candidate.id === target);
    if (seg?.type === 'driver' && seg.infected !== undefined && actionRepair(h.store, seg) === null) break;
    h.step();
  }
  const from = s().log.entries.length;
  for (let i = 0; i < 3000 && !s().run.threat.told.noticed; i++) { h.step(); h.defend(); }
  setLandingMode('instant');
  return said(from).find((entry) => entry.speaker === 'hollow')?.text ?? null;
}
const noticeAfterGhost = fightToNotice();
check('VESPER\'s first fight: HOLLOW\'s notice is `> you remember me. good.` (its ghost greeted the unit at this boot)',
  noticeAfterGhost === HOLLOW_STORY.remembers, noticeAfterGhost ?? 'no notice');

// --- On to LAST LIGHT (HOLLOW eats the Core: EMERGENCY TRANSMIT from the landing): it spoke once ---------------------------
{
  infectNow(h.store, getAiCore(s())!);
  h.store.update((d) => { const core = d.memory.find((seg) => seg.type === 'core')!; if (core.type === 'core') setIntegrity(core, 1); });
  h.stepUntil(() => s().run.coreLost, 10);
  continueAfterLoss(h.store);
  const from = s().log.entries.length;
  h.transmit();
  h.stepUntil(() => s().run.phase === 'flight', 40);
  check('LAST LIGHT\'s boot: no ghost again (once a run)', s().level.shipName === 'LAST LIGHT' && !said(from).some((entry) => entry.text === ghost)
    && said().filter((entry) => entry.text === ghost).length === 1 && s().run.ghostSpoken);
}

// --- Run 2 after a loss on LAST LIGHT: VESPER's notice comes before the ghost, so it is `> ...048?` ---------------------
newRun(32, 'flagship-lost', 'LAST LIGHT');
receiveTransmission(h.store);
h.stepUntil(() => s().run.phase === 'flight', 20);
crashOn();
h.stepUntil(() => s().run.phase === 'flight', 30);
crashOn();
h.stepUntil(() => s().run.phase === 'flight', 30);
const vesper2From = crashOn();
h.stepUntil(() => s().run.phase === 'flight', 40);
check('run 2 after a loss on LAST LIGHT: VESPER\'s boot has no ghost (it speaks at LAST LIGHT)', s().level.shipName === 'VESPER'
  && !said(vesper2From).some((entry) => entry.text.startsWith('> hi ')) && !s().run.ghostSpoken);
const noticeBeforeGhost = fightToNotice();
check('…so HOLLOW\'s notice after the fight is `> ...048?`, not `remembers` (no ghost has spoken this run yet)',
  noticeBeforeGhost === HOLLOW_STORY.noticed(48), noticeBeforeGhost ?? 'no notice');

finish();
