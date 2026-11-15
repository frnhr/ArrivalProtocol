// WP8 fix round 1: the review's findings, headless, with the archive on a stubbed storage.
// • A reload two seconds into run 1 (RECEIVE, then the page goes away) is UNIT-048 on wave 2 with its ghost (at
//   HALCYON's boot, never ship 1's: slice-2-plan's follow-up), and still the tutorial: the written ARES-VII (POD 02 hurt), no REPAIR at the boot (slice 1a: no archive line
//   either way), the simulation retry. The archive learns the tutorial at the first lock (or a second ship);
//   only then is the next run a returning unit.
// • A returning unit's boot: CONTROL says hello before the REPAIR licence that came with the boot; at the boot its ghost
//   speaks on (HALCYON's, the last unit having been left on ARES-VII), the strip does not offer the skip while the ghost
//   types (`someone is typing…`).
// • RUN END's own write failing: the status is OFFLINE by the time the phase is 'end' (RunEnd paints then).
// • A write failing mid-run: one TERMINAL line `ARCHIVE OFFLINE — this unit's memory will not be kept`.
// • A FIREWALL to place: the strip's line (`MOVE your FIREWALL (FW) into the GAP next to ???`, the MOVE chip,
//   then the FW chip), the MOVE preview's `SEALS THIS SIDE ✓` over the GAP, and the line done once it holds.
// Track RETIRE (phase 3): on the arm. Run 1 is the authored arm; every later page's run is a fresh roll of its own, so the
// desk sets course along that arm's shortest climbing route (support/desk climbingRoutes), and the ship after ship 1 is
// that roll's (on seed 15's run, a TIGHT ship: the FIREWALL lesson is checked on phase 2's HALCYON racks laid on it).
import { phase2Halcyon } from '../../support/hollow-world';
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../../wp7/harness7';
import { receiveTransmission, skipBoot, bootSkipWaits } from '@systems/boot';
import { startRun, lossPlan, transmitNext, continueAfterLoss as runContinueAfterLoss, type LossPlan } from '@systems/run';
import { setCourseFromDesk, climbingRoutes, leaveOrbit } from '../../support/desk';
import { endFlight } from '@systems/orbit-sim';
import { infectNow } from '@systems/hollow';
import { pickCard } from '@systems/draft';
import { installTool } from '@systems/licences';
import { movePreview } from '@systems/move-preview';
import { reachMarks } from '@systems/hollow-hud';
import { isTutorialShip } from '@systems/beam-out';
import { buildDirectorCtx, type DirectorCtx } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { setIntegrity, actionMove } from '@state/actions';
import {
  openRunArchive, closeArchive, archiveLineage, parseMeta, playsTutorial, abandonActiveRun, type MetaStorage,
} from '@systems/meta';
import { driversInMemory, getAiCore, isFirewall } from '@state/selectors';
import { ARES_RUN1_FAMILIES } from '@data/souls';
import { ARCHIVE_TEXT, FIREWALL_RULES, LICENCE_LINES, LINES, bootLicensesRepair } from '@data/script';
import { TOOL_HINT_TARGET, firewallHintTarget } from '@data/fs-tools';
import { META_STORAGE_KEY } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { FreeSegment } from '@/types/segment';

const data = new Map<string, string>();
let failWrites = false;
const storage: MetaStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { if (failWrites) throw new Error('QuotaExceededError'); data.set(key, value); },
  removeItem: (key) => { data.delete(key); },
};
const stored = () => parseMeta(data.get(META_STORAGE_KEY)!);

const h = createHarness7(41, { soulsFound: false });
const state = () => h.store.getState();
const log = (): GameState['log']['entries'] => state().log.entries;

// A page load: the archive opened again (a leftover run becomes 'abandoned': slice 3c's open sequence, with no run save
// here), and the title's run from it, with its route (the shortest climbing one on the run's arm).
let route: number[] = [];
function loadPage(seed: number): void {
  closeArchive();
  openRunArchive(() => storage);
  abandonActiveRun();
  h.newRun(seed);
  startRun(h.store, seed, archiveLineage());
  h.store.update((d) => { d.archive = { status: 'ok' }; });
  const routes = climbingRoutes(state().run.map);
  if (routes[0] === undefined) throw new Error(`loadPage: run ${state().run.map.run}'s arm has no route to a final ship`);
  route = routes[0];
}

// CONTINUE after a lost ship (playtest 1: it opens LEAVE ORBIT, where a suite may still pick).
function continueAfterLoss(store: typeof h.store): LossPlan {
  return runContinueAfterLoss(store);
}

// The salvage taken (the card picked, else the first), course set to the route's next stop, then TRANSMIT ▸.
function transmit(): void {
  leaveOrbit(h.store);
  if (state().run.phase === 'desk') setCourseFromDesk(h.store, route[state().run.map.route.length]!);
  transmitNext(h.store);
}

function boot(): void {
  receiveTransmission(h.store);
  h.stepUntil(() => state().run.phase === 'flight', 30);
}

// --- A reload two seconds into run 1 ------------------------------------------------------------------------
loadPage(11);
check('run 1: UNIT-047 on wave 1, the tutorial', state().run.unitNumber === 47 && state().run.wave === 1 && playsTutorial(state().run));
receiveTransmission(h.store);
h.stepFor(2);
check('two seconds in, nothing is learned yet', stored().runs === 1 && stored().activeRun !== null && !stored().tutorialDone);
loadPage(12);
const reloaded = state().run;
check('the reload: UNIT-048 · WAVE 2, the last unit abandoned at ARES-VII (the wave counts it)',
  reloaded.unitNumber === 48 && reloaded.wave === 2 && reloaded.lastUnit?.cause === 'abandoned' && reloaded.lastUnit.shipName === 'ARES-VII');
check('…but it is still the tutorial: the written ARES-VII (run 1\'s families, POD 02 hurt), the simulation retry ahead',
  playsTutorial(reloaded) && driversInMemory(state()).every((soul) => ARES_RUN1_FAMILIES.includes(soul.family)) && JSON.stringify(state().landing.hurt) === '[2]'
    && isTutorialShip(state()) && !bootLicensesRepair(state()));
boot();
const ghost = log().find((entry) => entry.speaker === 'hollow');
check('its ship-1 boot: no ghost (left on ARES-VII, it speaks at HALCYON: never ship 1), and HOLLOW unnamed (slice 2, risk 11)',
  ghost === undefined && !state().run.ghostSpoken && !state().run.hollowNamed, ghost?.text);
check('…REPAIR is not licensed in the boot yet (the tutorial issues it later), no `you know what they are`',
  !state().run.licences.includes('repair')
    && !log().some((entry) => entry.text.includes('you know what they are')));
// The first crash on the tutorial ship is still "a simulation".
h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
h.stepUntil(() => h.status() !== 'approaching', 10);
check('…a crash on ARES-VII is still `That was a simulation. :) Again.`', lossPlan(state()).kind === 'simulation');
continueAfterLoss(h.store);
h.stepUntil(() => state().run.phase === 'flight', 30);
check('the simulation retry is not a second ship: nothing learned yet', !stored().tutorialDone && state().run.shipIndex === 0);

// --- The first lock teaches it; the next run is a returning unit ------------------------------------------------
endFlight(h.store, 'locked');
h.stepFor(0.2);
check('ARES-VII locked (its landing starts): the archive notes the tutorial is flown', stored().tutorialDone && state().run.phase === 'landing');
loadPage(13);
check('the next page: UNIT-049, a returning unit (the archive opens at the boot, ship 1 reseeded)', state().run.unitNumber === 49
  && !playsTutorial(state().run) && bootLicensesRepair(state()) && !isTutorialShip(state())
  && driversInMemory(state()).every((soul) => !ARES_RUN1_FAMILIES.includes(soul.family)));

// Ship 1's boot has no ghost beat: the strip offers the skip as on any boot.
receiveTransmission(h.store);
h.stepFor(0.3);
check('ship 1\'s boot: no ghost beat, the strip offers the skip ([SPACE])', !bootSkipWaits(state())
  && state().director.shown?.text === LINES.booting() && (state().director.shown?.keys.includes('SPACE') ?? false), JSON.stringify(state().director.shown));
h.stepUntil(() => state().run.phase === 'flight', 30);
h.stepFor(0.3);
// Playtest 1 (B-VOICE): the hello is PAL's (in this run's preset: every preset names the unit), the licence CONTROL's.
const control = log().filter((entry) => entry.speaker === 'control' || entry.speaker === 'companion').map((entry) => entry.text);
const hello = control.findIndex((text) => text.includes('Unit 49'));
const licence = control.indexOf(LICENCE_LINES.repair);
check('REPAIR came with the boot, and PAL says hello first, then CONTROL the licence', state().run.licences.includes('repair')
  && hello >= 0 && licence > hello, control.join(' | '));

// The ghost's beat, at ship 2's boot (HALCYON on the classic five; the last unit was left on ARES-VII): the strip does not
// offer a skip while it types.
h.store.update((d) => { d.run.simulationRetryUsed = true; });
h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
h.stepUntil(() => h.status() !== 'approaching', 10);
continueAfterLoss(h.store);
transmit();
h.stepFor(0.3);
check('ship 2: while the ghost types, a skip waits, and the strip says so (no [SPACE] skip offered)', state().run.shipIndex === 1
  && bootSkipWaits(state()) && state().director.shown?.text === LINES.bootingGhost() && state().director.shown?.keys.length === 0,
  JSON.stringify(state().director.shown));
h.stepFor(1);
check('…a press then is refused (the buzz, in the browser)', !skipBoot(h.store) && state().run.phase === 'boot');
h.stepUntil(() => !bootSkipWaits(state()), 12);
h.stepFor(0.1);
check('…once it has had its say, the strip offers the skip again (at once)', state().director.shown?.text === LINES.booting() && (state().director.shown?.keys.includes('SPACE') ?? false),
  JSON.stringify(state().director.shown));
h.stepUntil(() => state().run.phase === 'flight', 30);

// --- RUN END's own write fails: OFFLINE before RUN END paints ---------------------------------------------------
// To ship 2 by EMERGENCY, then on by another each ship, to the route's final ship, where the Core eaten ends the run:
// OVERWRITTEN on the final ship.
h.store.update((d) => { d.run.simulationRetryUsed = true; });
while (state().run.map.route.length < route.length) {
  h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
  transmit();
  h.stepUntil(() => state().run.phase === 'flight', 30);
}
failWrites = true;
let statusAtEnd: string | null = null;
const offPhase = h.store.subscribe((s) => s.run.phase, (phase) => { if (phase === 'end') statusAtEnd = h.store.getState().archive.status; });
infectNow(h.store, getAiCore(state())!);
h.store.update((d) => { const theCore = d.memory.find((seg) => seg.type === 'core')!; if (theCore.type === 'core') setIntegrity(theCore, 1); });
h.stepUntil(() => state().run.coreLost, 10);
continueAfterLoss(h.store);
offPhase();
check('RUN END\'s write fails: the status is already OFFLINE when the phase turns \'end\' (RUN END paints its line then)',
  state().landing.finalShip && state().run.phase === 'end' && statusAtEnd === 'offline', `${state().level.shipName} · ${String(statusAtEnd)}`);

// --- A write fails mid-run: one TERMINAL line -------------------------------------------------------------------
failWrites = false;
loadPage(14);
boot();
h.store.update((d) => { d.run.simulationRetryUsed = true; });
h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
h.stepUntil(() => h.status() !== 'approaching', 10);
continueAfterLoss(h.store);
failWrites = true;
transmit();
h.stepFor(0.3);
const offline = log().filter((entry) => entry.text === ARCHIVE_TEXT.offline);
check('a ship start whose write fails: OFFLINE, and the TERMINAL says `ARCHIVE OFFLINE — this unit\'s memory will not be kept` once',
  state().archive.status === 'offline' && offline.length === 1 && offline[0]!.speaker === 'mind-sys', `${state().archive.status} ×${offline.length}`);
failWrites = false;

// --- A FIREWALL to place --------------------------------------------------------------------------------------------
// Back to a fresh page, ship 1 crashed into an EMERGENCY with FIREWALL.sys picked, onto ship 2.
loadPage(15);
boot();
h.store.update((d) => { d.run.simulationRetryUsed = true; });
h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
h.stepUntil(() => h.status() !== 'approaching', 10);
continueAfterLoss(h.store);
h.store.update((d) => { d.run.leave.offer = [{ id: 'firewall', title: 'FIREWALL.sys', effect: '', why: '', boosted: false }]; });
pickCard(h.store, 'firewall');
transmit();
// The arm's later boots say more (the receiver's sleep, the ghost's beat, the INBOX): up to 40 s.
h.stepUntil(() => state().run.phase === 'flight', 40);
// Phase 3 slice 2: HALCYON is calm now; the lesson is checked on its phase-2 racks and HOLLOW (support/hollow-world.ts), laid
// on this run's ship 2.
phase2Halcyon(h.store);
const firewallRule = FIREWALL_RULES.find((rule) => rule.id === 'firewall-place')!;
const tabRule = FIREWALL_RULES.find((rule) => rule.id === 'firewall-place-tab')!;
const ctxNow = (): DirectorCtx => buildDirectorCtx(state(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
check('ship 2 before MOVE: no FIREWALL line yet (nothing to place it with)', !firewallRule.activeWhen(ctxNow()) && !tabRule.activeWhen(ctxNow()));
installTool(h.store, 'move');
h.store.update((d) => { d.ui.mode = 'tools'; });
// Slice 2 (risk 11): the ghost no longer names HOLLOW at ship 1, and this run's HOLLOW has not named itself yet: `???`.
check('MOVE in hand, a FIREWALL in rack F and a red GAP next to HOLLOW: in amber, `[TAB], MOVE your FIREWALL (FW) next to ???`',
  tabRule.activeWhen(ctxNow()) && tabRule.text(ctxNow()) === '[TAB], MOVE your FIREWALL (FW) next to ???', tabRule.text(ctxNow()));
h.store.update((d) => { d.ui.mode = 'memory'; });
const highlight = (): string | null => {
  const rule = firewallRule.highlight;
  return typeof rule === 'function' ? rule(ctxNow()) : rule ?? null;
};
check('…in blue, `MOVE your FIREWALL (FW) into the GAP next to ???`, lighting the MOVE chip',
  firewallRule.activeWhen(ctxNow()) && firewallRule.text(ctxNow()) === 'MOVE your FIREWALL (FW) into the GAP next to ???'
    && highlight() === TOOL_HINT_TARGET.move, `${firewallRule.text(ctxNow())} → ${highlight()}`);
h.store.update((d) => { d.ui.activeTool = { kind: 'move', toolSegId: d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move')!.id }; });
// WP12 p3: each FIREWALL chip has its own target, and the line lights the one still to place.
const toPlace = state().memory.find(isFirewall)!;
check('…then, with MOVE held, the FW chip', highlight() === firewallHintTarget(toPlace.id), String(highlight()));
h.store.update((d) => { d.ui.activeTool = null; });
const memory = state().memory;
const rootIndex = memory.findIndex((seg) => seg.type === 'hollow' && seg.root);
const gap = memory[rootIndex - 1] as FreeSegment;
const firewall = memory.find(isFirewall)!;
const farFree = memory.filter((seg): seg is FreeSegment => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
check('the MOVE preview over the GAP against the root says the FIREWALL seals that side; anywhere else it does not',
  // Final fix pass: the preview takes the racks a hazard zone is known to hit; none here (phase 2's HALCYON had none).
  movePreview(state(), firewall, { regionSegIds: [gap.id], col: 0 }, [])?.seals === true
    && movePreview(state(), firewall, { regionSegIds: [farFree.id], col: 0 }, [])?.seals === false);
actionMove(h.store, firewall, { regionSegIds: [gap.id], col: 0 });
h.stepUntil(() => !state().memory.some((seg) => seg.operating), 10);
check('MOVEd there, it holds (the strip\'s shield), the line is done and gone', reachMarks(state()).shields.length === 1
  && firewallRule.doneWhen!(ctxNow()) && !firewallRule.activeWhen(ctxNow()));

closeArchive();
finish();
