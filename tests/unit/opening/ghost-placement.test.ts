// The last unit's ghost leaves ship 1 (05 §3.5; slice-2-plan's "Follow-up: the ghost line leaves ship 1", from Fran's
// playtest): it speaks at the first boot in or past the layer of the last unit's grey cross, never at ship 1, once a run.
// Track RETIRE (phase 3): on run 2's arm, a fresh roll. UNIT-047 was lost on run 1's worked route at CORMORANT (slot 15,
// where HOLLOW boarded it), and run 2 flies a route (routeThroughBoarding) whose stops climb a layer a hop, with HOLLOW's
// forced boarding on the beam into the stop in the cross's layer, one hop from the final ship.
// • Run 2 after UNIT-047 was overwritten at CORMORANT, every ship left by a crash (EMERGENCY TRANSMIT): ship 1 and every
//   ship before the boarding boot without it; the boarding ship's boot opens on it (before the boarding's 108% unpack,
//   which still fires its moment), a skip waits while it types; the final ship's boot has none (it spoke once).
// • HOLLOW's notice after the boarding ship's first fight is `> ...048?` both once the ghost has spoken this run (HOLLOW is
//   the relay stranger UNIT-031, slice 7c: it never met the ghost) and on a run 2 whose ghost speaks further on (lost on
//   LAST LIGHT, the cross at the final ship).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { receiveTransmission, skipBoot, bootSkipWaits } from '@systems/boot';
import { startRun, continueAfterLoss } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { reachableFrom } from '@systems/map-hop';
import { mapAlong, nominalAlong } from '@systems/arm-fixture';
import { layerOf } from '@systems/map-geometry';
import { END_SLOTS, FIRST_SLOT } from '@data/arm';
import { actionRepair, setIntegrity } from '@state/actions';
import { infectNow } from '@systems/hollow';
import { getAiCore } from '@state/selectors';
import { lineageOf, freshMeta, recordRunStart, recordRunEnd, recordTutorialDone, ghostLine, type LastCause } from '@systems/meta';
import { RUN1_TRAIL } from '../world/run2-fixture';
import { installTool } from '@systems/licences';
import { HOLLOW_STORY } from '@data/hollow-text';
import { THREAT_TEXT } from '@data/threat-text';
import { BOOT_GHOST_AT_SEC } from '@data/tuning';
import type { GameState, LogEntry } from '@state/schema';
import type { RunMapState } from '@/types/map';
import type { UnitTrail } from '@/types/lineage';
import type { DriverSegment } from '@/types/segment';

const h = createHarness7(23, { soulsFound: true });
const s = (): Readonly<GameState> => h.store.getState();
const said = (from = 0): LogEntry[] => s().log.entries.slice(from);
// The lines a boot typed (the log's divider is no line).
const lines = (from: number): LogEntry[] => said(from).filter((entry) => entry.channel === 'mind' && entry.text.startsWith('>'));

// UNIT-047's run 1 on the worked route as the archive keeps it, ended with `cause` aboard the stop in `lostSlot` (its grey
// cross there): ARES-VII flown through, the stops before the cross as run2-fixture has them.
const CORMORANT_SLOT = 15;
function lineageAfter(cause: LastCause, lostSlot: number) {
  const at = RUN1_TRAIL.stops.findIndex((stop) => stop.slot === lostSlot);
  if (at < 0) throw new Error(`lineageAfter: slot ${lostSlot} is not on run 1's worked route`);
  const lostStop = RUN1_TRAIL.stops[at]!;
  const trail: UnitTrail = {
    ...structuredClone(RUN1_TRAIL),
    stops: [...structuredClone(RUN1_TRAIL.stops.slice(0, at)), { ...lostStop, outcome: null, landed: 0, colony: null, writer: null }],
    lost: { slot: lostSlot, year: lostStop.year, pastLy: 0, cause },
  };
  const progress = { unit: 47, shipName: lostStop.shipName!, landed: 3100, stats: { moves: 4, deletes: 0 }, hollowUnits: [46], trail };
  return lineageOf(recordRunEnd(recordTutorialDone(recordRunStart(freshMeta(), progress, 0)), { ...progress, cause, score: 3000 }));
}

// Run 2's route for the scenario: from ship 1, a hop at a time, each stop one layer further out, to a final ship; HOLLOW's
// forced boarding (the nominal route's verdict) on the beam into the stop before the final one, in the layer of `crossSlot`.
// The shortest such route, the first by slot order (the arm is a fresh roll of the run seed).
function routeThroughBoarding(map: Readonly<RunMapState>, crossSlot: number): number[] {
  const found: number[][] = [];
  const walk = (path: number[]): void => {
    const here = path.at(-1)!;
    if (END_SLOTS.includes(here)) { found.push(path); return; }
    for (const next of reachableFrom(map, here)) if (layerOf(next) > layerOf(here)) walk([...path, next]);
  };
  walk([FIRST_SLOT]);
  const fits = found.filter((route) => {
    const boarding = route.length - 2;
    if (layerOf(route[boarding]!) !== layerOf(crossSlot)) return false;
    const along = mapAlong(map, route);
    return route.every((_, i) => i === 0 || (nominalAlong(along, route.slice(0, i + 1)).verdict.boards !== null) === (i === boarding));
  }).sort((a, b) => a.length - b.length);
  const route = fits[0];
  if (route === undefined) throw new Error(`routeThroughBoarding: run ${map.run}'s arm has no route boarding in layer ${layerOf(crossSlot)}`);
  return route;
}

let route: number[] = [];
function newRun(seed: number, cause: LastCause, lostSlot: number, crossSlot: number): void {
  h.newRun(seed);
  startRun(h.store, seed, lineageAfter(cause, lostSlot));
  route = routeThroughBoarding(s().run.map, crossSlot);
}

// The ship is left by a crash (EMERGENCY TRANSMIT), the desk sets course to the route's next stop, and it boots: the boot's
// first log entry index.
function crashOn(): number {
  h.store.update((d) => { d.run.simulationRetryUsed = true; });
  h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
  const next = route[s().run.map.route.length];
  if (next === undefined) throw new Error('crashOn: the route has no next stop');
  setCourseFromDesk(h.store, next);
  const from = s().log.entries.length;
  h.transmit();
  return from;
}

// --- Run 2 after a loss at CORMORANT -------------------------------------------------------------------------------------
newRun(31, 'overwritten', CORMORANT_SLOT, CORMORANT_SLOT);
const ghost = ghostLine(48, s().run.lastUnit)!;
const boardingName = (): string => s().run.map.arm[route.at(-2)!]!.name;
check('run 2 after UNIT-047 was lost at CORMORANT: UNIT-048, a ghost to come, a route boarding in the cross\'s layer',
  s().run.unitNumber === 48 && ghost === "> hi 048. it's 047. 046 ate me. now i'm hungry too." && !s().run.ghostSpoken
  && route.length >= 5 && layerOf(route.at(-2)!) === layerOf(CORMORANT_SLOT), `${ghost} · ${route.join('-')}`);
receiveTransmission(h.store);
check('ship 1\'s boot does not wait for a ghost (the strip offers the skip)', !bootSkipWaits(s()));
h.stepUntil(() => s().run.phase === 'flight', 20);
check('…ARES-VIII\'s boot: no ghost, nothing from HOLLOW (05 §3.5: never at ship 1)', !said().some((entry) => entry.speaker === 'hollow') && !s().run.ghostSpoken
  && lines(0)[0]?.text === '> UNPACKING UNIT-048 ... 100%', lines(0)[0]?.text);
// Every ship between ship 1 and the boarding one (HALCYON and KESTREL on the classic five; one check each).
for (let depth = 2; depth < route.length - 1; depth++) {
  const from = crashOn();
  h.stepUntil(() => s().run.phase === 'flight', 30);
  check(`${s().level.shipName}'s boot (depth ${depth}): no ghost (it speaks in the cross's layer)`, s().run.map.route.length === depth
    && s().run.map.route.at(-1)!.slot === route[depth - 1] && !said(from).some((entry) => entry.speaker === 'hollow') && !s().run.ghostSpoken,
    said(from).filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text).join(' | '));
}
const vesperFrom = crashOn();
check('the boarding ship: HOLLOW boards on this beam (the 108% unpack is in the plan)', s().level.shipName === boardingName()
  && s().run.arrival?.boarded !== null && s().run.arrival?.boarded !== undefined, `${s().level.shipName} · ${JSON.stringify(s().run.arrival?.boarded)}`);
check('…its boot waits for the ghost (no skip offered before the first tick)', bootSkipWaits(s()));
h.stepFor(BOOT_GHOST_AT_SEC + 0.1);
check('…the ghost types first, in HOLLOW\'s voice', lines(vesperFrom)[0]?.speaker === 'hollow' && lines(vesperFrom)[0]?.text === ghost && s().run.ghostSpoken,
  `${lines(vesperFrom)[0]?.speaker}: ${lines(vesperFrom)[0]?.text}`);
check('…a skip while it types is refused', !skipBoot(h.store) && s().run.phase === 'boot' && bootSkipWaits(s()));
const boardsBefore = h.events.filter((event) => event.name === 'hollow-boarded').length;
h.stepUntil(() => s().run.phase === 'flight', 40);
const vesperLines = lines(vesperFrom).map((entry) => entry.text);
const board = THREAT_TEXT.boardUnpack('UNIT-048');
// On the arm the boot says how long the unit slept in the receiver before it unpacks (slice 3b: `> ASLEEP IN …'S RECEIVER`).
const unpackAt = vesperLines.indexOf(board);
check('…then the boot\'s own lines, the boarding\'s 108% unpack first: ghost → (the receiver) → 108% → host…', vesperLines[0] === ghost
  && unpackAt >= 1 && vesperLines.slice(1, unpackAt).every((text) => text.startsWith('> ASLEEP IN ')) && vesperLines[unpackAt + 1]?.startsWith('> HOST: ') === true
  && vesperLines.length > unpackAt + 2, vesperLines.join(' | '));
check('…and the boarding moment still fires (hollow-boarded, as the 108% line is said)',
  h.events.filter((event) => event.name === 'hollow-boarded').length === boardsBefore + 1);
check('…the ghost said once', said().filter((entry) => entry.text === ghost).length === 1);

// HOLLOW's notice after the boarding ship's first fight, after the ghost spoke at this boot.
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
  // HOLLOW's lines in the tick its notice is told (on the arm its verbs speak in HOLLOW's voice too: `> infect pod08`).
  let tick = s().log.entries.length;
  for (let i = 0; i < 3000 && !s().run.threat.told.noticed; i++) { tick = s().log.entries.length; h.step(); h.defend(); }
  setLandingMode('instant');
  if (!s().run.threat.told.noticed) return null;
  return said(tick).filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text).join(' | ');
}
const noticeAfterGhost = fightToNotice();
// Slice 7c (R34; the 7c review): HOLLOW on run 2 is the relay stranger UNIT-031, not the lost unit whose ghost spoke, so it
// does not say it is remembered (hollow.ts noticedLine; a last-unit HOLLOW still does: traces/lineage).
check('the boarding ship\'s first fight: the ghost spoke at this boot, but HOLLOW is the stranger UNIT-031: its notice is `> ...048?`, not `remembers`',
  s().run.ghostSpoken && JSON.stringify(s().run.hollowUnits) === '[31]' && noticeAfterGhost === HOLLOW_STORY.noticed(48), noticeAfterGhost ?? 'no notice');

// --- On to the final ship (HOLLOW eats the Core: EMERGENCY TRANSMIT from the landing): it spoke once ------------------------
{
  infectNow(h.store, getAiCore(s())!);
  h.store.update((d) => { const core = d.memory.find((seg) => seg.type === 'core')!; if (core.type === 'core') setIntegrity(core, 1); });
  h.stepUntil(() => s().run.coreLost, 10);
  continueAfterLoss(h.store);
  setCourseFromDesk(h.store, route.at(-1)!);
  const from = s().log.entries.length;
  h.transmit();
  h.stepUntil(() => s().run.phase === 'flight', 40);
  check('the final ship\'s boot: no ghost again (once a run)', s().landing.finalShip && !said(from).some((entry) => entry.text === ghost)
    && said().filter((entry) => entry.text === ghost).length === 1 && s().run.ghostSpoken, s().level.shipName);
}

// --- Run 2 after a loss on LAST LIGHT: the boarding ship's notice comes before the ghost, so it is `> ...048?` -------------
newRun(32, 'flagship-lost', 19, CORMORANT_SLOT);
receiveTransmission(h.store);
h.stepUntil(() => s().run.phase === 'flight', 20);
for (let depth = 2; depth < route.length - 1; depth++) {
  crashOn();
  h.stepUntil(() => s().run.phase === 'flight', 30);
}
const vesper2From = crashOn();
h.stepUntil(() => s().run.phase === 'flight', 40);
check('run 2 after a loss on LAST LIGHT: the boarding ship\'s boot has no ghost (it speaks at the final ship)', s().level.shipName === boardingName()
  && s().run.arrival?.boarded !== null && !said(vesper2From).some((entry) => entry.text.startsWith('> hi ')) && !s().run.ghostSpoken);
const noticeBeforeGhost = fightToNotice();
check('…so HOLLOW\'s notice after the fight is `> ...048?`, not `remembers` (no ghost has spoken this run yet)',
  noticeBeforeGhost === HOLLOW_STORY.noticed(48), noticeBeforeGhost ?? 'no notice');

finish();
