// WP8 acceptance 6 (§5.2, §9 WP8 items 4–6): WP7's run-flow, extended to the run after it, with the archive on a
// stubbed storage. Run 1 is ended for real (EMERGENCY TRANSMITs from crashes on to LAST LIGHT, then HOLLOW eats the Core
// on the last ship: OVERWRITTEN); the archive keeps it; NEW RUN is UNIT-048 on wave 2, and its ship-1 boot:
// • no ghost (05 §3.5: it never plays at ship 1, the new unit can't know yet; slice-2-plan's follow-up, Fran's playtest):
//   run 1 was lost on LAST LIGHT, so its ghost speaks there;
// • slice 1a: no archive to open (the drivers are files from the start): the boot says UNPACKING, the host line
//   (`> HOST: ARES-VII · 3 PODS · 600 COLONISTS`) and the ECC line, and REPAIR is licensed in the boot;
// • ship 1 is reseeded: other families, POD 01 still the lead, the hurt pod seeded and never POD 01; the ship-1 lessons
//   are one hint each (`ENGINE WEAK — REPAIR ENGINE I/O`, `POD nn WILL LAND HARD — REPAIR its driver`) and the run-1
//   tutorial lines never show; HOLLOW says nothing on ship 1 (calm since slice 2);
// • HALCYON's boot has no ghost either (it is LAST LIGHT's).
// Then a page "reload" mid-run 2: the leftover run is 'abandoned' at HALCYON, and run 3's ghost says so at HALCYON's boot
// (not ship 1's), once (KESTREL's boot has none).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { receiveTransmission, skipBoot } from '@systems/boot';
import { startRun } from '@systems/run';
import { continueAfterLoss, continueAfterReport } from '../support/classic-flow';
import { infectNow } from '@systems/hollow';
import { setIntegrity } from '@state/actions';
import {
  openRunArchive, closeArchive, archiveLineage, parseMeta, abandonActiveRun, type MetaStorage,
} from '@systems/meta';
import { driversInMemory, getAiCore } from '@state/selectors';
import { ARES_RUN1_FAMILIES } from '@data/souls';
import { LINES, WORST_CASE_VARS } from '@data/script';
import { solLy } from '@systems/map-geometry';
import { END_SLOTS } from '@data/arm';
import { LANDING_ASKS, hostLine } from '@data/landing-text';
import { META_STORAGE_KEY, BOOT_GHOST_AT_SEC, BOOT_LINE_AT_SEC } from '@data/tuning';
import type { GameState } from '@state/schema';
import { followLanding } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';

const data = new Map<string, string>();
const storage: MetaStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { data.set(key, value); },
  removeItem: (key) => { data.delete(key); },
};
const stored = () => parseMeta(data.get(META_STORAGE_KEY)!);

const h = createHarness7(31, { soulsFound: false });
const state = () => h.store.getState();
const said = (from = 0): GameState['log']['entries'] => state().log.entries.slice(from);

// A NEW RUN with the archive's lineage, in a world that has the archive (the harness's own reset makes a
// headless world without one: status 'none').
function newRunFromArchive(seed: number): void {
  h.newRun(seed);
  startRun(h.store, seed, archiveLineage());
  h.store.update((d) => { d.archive = { status: 'ok' }; });
}

// --- Run 1, ended for real: OVERWRITTEN on the last ship (WP9: KESTREL; WP10: VESPER; WP11: LAST LIGHT) ---------------------------
openRunArchive(() => storage);
newRunFromArchive(11);
check('run 1 opens on the title as UNIT-047 · WAVE 1 (an empty archive)', state().run.unitNumber === 47 && state().run.wave === 1
  && state().run.lastUnit === null && state().archive.status === 'ok');
receiveTransmission(h.store);
check('RECEIVE TRANSMISSION is RUN START: the archive counts the run and keeps it in progress', stored().runs === 1
  && stored().activeRun?.unit === 47 && stored().activeRun?.shipName === 'ARES-VII');
h.stepUntil(() => state().run.phase === 'flight', 15);
// The simulation is used up, so a crash goes to EMERGENCY TRANSMIT.
h.store.update((d) => { d.run.simulationRetryUsed = true; });
h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
h.stepUntil(() => h.status() !== 'approaching', 10);
continueAfterLoss(h.store);
h.transmit();
check('…a later ship\'s start brings the run in progress up to date (HALCYON)', stored().activeRun?.shipName === 'HALCYON');
h.stepUntil(() => state().run.phase === 'flight', 15);
// Slice 2: HALCYON and KESTREL carry no HOLLOW, so each is left by a crash (EMERGENCY TRANSMIT, the simulation being
// used up); VESPER too, to keep its root out of it. LAST LIGHT's HOLLOW eats the Core for the OVERWRITTEN ending.
function crashOn(): void {
  h.store.mutate((d) => { d.orbit.x = d.level.planet.R + 20; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  continueAfterLoss(h.store);
}
function eatTheCore(): void {
  const core = getAiCore(state())!;
  infectNow(h.store, core);
  h.store.update((d) => { const theCore = d.memory.find((seg) => seg.type === 'core')!; if (theCore.type === 'core') setIntegrity(theCore, 1); });
  h.stepUntil(() => state().run.coreLost, 10);
  continueAfterLoss(h.store);
}
crashOn();
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('…EMERGENCY TRANSMIT on to KESTREL', state().level.shipName === 'KESTREL' && stored().activeRun?.shipName === 'KESTREL');
// WP10: KESTREL is no longer the last ship either: one more EMERGENCY, to VESPER.
crashOn();
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('…EMERGENCY TRANSMIT on to VESPER', state().level.shipName === 'VESPER' && stored().activeRun?.shipName === 'VESPER');
// WP11: VESPER is no longer the last ship either: one more EMERGENCY, to LAST LIGHT (the flagship), where the run ends.
crashOn();
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('…EMERGENCY TRANSMIT on to LAST LIGHT (the last ship now)', state().level.shipName === 'LAST LIGHT' && stored().activeRun?.shipName === 'LAST LIGHT');
eatTheCore();
check('run 1 ends OVERWRITTEN on LAST LIGHT (the last ship)', state().run.phase === 'end' && state().run.endCause === 'overwritten');
check('RUN END is written: lastUnit UNIT-047, overwritten on LAST LIGHT, no run in progress',
  stored().lastUnit?.number === 47 && stored().lastUnit?.cause === 'overwritten' && stored().lastUnit?.shipName === 'LAST LIGHT'
    && stored().activeRun === null && JSON.stringify(stored().lastUnit?.hollowUnits) === '[46]', JSON.stringify(stored()));

// --- Run 2: the title ----------------------------------------------------------------------------------------
newRunFromArchive(12);
check('NEW RUN: UNIT-048 · WAVE 2, the last unit on the run, HOLLOW is UNIT-047 (unnamed; not aboard the calm ship 1)',
  state().run.unitNumber === 48 && state().run.wave === 2 && state().mission.unitId === 'UNIT-048' && state().run.lastUnit?.number === 47
    && JSON.stringify(state().run.hollowUnits) === '[47]' && !state().run.hollowNamed && !state().memory.some((seg) => seg.type === 'hollow'));
// Slice 3a: 05 §3.12's title line (the run's start year, the final ship's distance from SOL, as lineVars reads them).
const titleLine = LINES.titleUnit({
  ...WORST_CASE_VARS, unit: state().mission.transmissionNum, wave: state().mission.wave, distanceLy: solLy(END_SLOTS[0]!), year: state().run.map.startYear,
});
check('…the title line says it', titleLine === 'UNIT-048 · YEAR 2300 · FINAL SHIP 180 LY OUT', titleLine);
const souls = driversInMemory(state());
const families = souls.map((soul) => soul.family);
check('ship 1 is reseeded: none of run 1\'s families, still 3 pods',
  souls.length === 3 && families.every((family) => !ARES_RUN1_FAMILIES.includes(family)), families.join(' '));
const hurt = souls.filter((soul) => soul.integrity < 100);
check('…POD 01 is still the lead, and the hurt pod is seeded, never POD 01',
  state().landing.lead === 1 && hurt.length === 1 && hurt[0]!.pod !== 1 && JSON.stringify(state().landing.hurt) === JSON.stringify([hurt[0]!.pod]),
  `lead ${state().landing.lead}, hurt ${hurt.map((soul) => `${soul.pod}@${soul.integrity}`).join(',')}`);
const pod1 = souls.find((soul) => soul.pod === 1);
const featured = pod1?.featured[0];
check('…and POD 01 keeps a featured child, as Ada was (first in the credits)', featured !== undefined && featured.age <= 16
  && !featured.name.includes('Okafor'), featured ? `${featured.name}, ${featured.age}` : 'none');

// --- Run 2: the boot ---------------------------------------------------------------------------------------------
receiveTransmission(h.store);
check('RUN START again: runs 2, UNIT-048 in progress', stored().runs === 2 && stored().activeRun?.unit === 48);
h.stepFor(BOOT_LINE_AT_SEC[0]! + 0.1);
const first = said().find((entry) => entry.channel === 'mind');
check('no ghost at ship 1\'s boot (05 §3.5: the new unit can\'t know yet): the TERMINAL opens on the unpack, on time',
  first?.speaker === 'mind-sys' && first.text === '> UNPACKING UNIT-048 ... 100%' && !said().some((entry) => entry.speaker === 'hollow')
    && !state().run.ghostSpoken, `${first?.speaker}: ${first?.text}`);
check('…and HOLLOW stays unnamed (no root on ship 1 to rename, risk 11)',
  !state().run.hollowNamed && !h.events.some((event) => event.name === 'hollow-named'));
h.stepUntil(() => said().filter((entry) => entry.speaker === 'mind-sys').length >= 3 || state().run.phase !== 'boot', 10);
const bootLines = said().filter((entry) => entry.speaker === 'mind-sys').map((entry) => entry.text);
check('then the boot: UNPACKING UNIT-048, the host line (3 PODS · 600 COLONISTS), the ECC line',
  bootLines[0] === '> UNPACKING UNIT-048 ... 100%' && bootLines[1] === hostLine('ARES-VII', 3, 600) && /^> ECC:/.test(bootLines[2] ?? ''),
  bootLines.join(' | '));
check('…and REPAIR is licensed in the boot (both Repair files in memory)', state().run.licences.includes('repair')
  && state().memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair').length === 2 && state().run.phase === 'boot');
h.stepUntil(() => state().run.phase === 'flight', 15);
check('the boot ends in amber, flying', state().run.phase === 'flight' && state().ui.mode === 'tools');

// --- Run 2: ship 1, one hint each -----------------------------------------------------------------------------------
const shown: string[] = [];
const ids: string[] = [];
const watch = (): void => {
  const line = state().director.shown;
  if (line && shown[shown.length - 1] !== line.text) { shown.push(line.text); ids.push(line.id); }
};
const unwatch = h.store.subscribe((s) => s.director.shown?.text ?? '', watch);
// Slice 1a: this ship lands by the strip ([L] when the strip asks; the defender keeps repairing); the others instantly.
setLandingMode('manual');
h.flyDefending(600);
check('ship 1 on run 2 locks (the strip-following kid with the defender)', h.status() === 'locked', h.status());
const byStrip = followLanding(h, { maxWall: 400, onTick: () => { h.defend(); } });
setLandingMode('instant');
check('…and lands by the strip: [L] pressed, every pod decided, the LANDING REPORT next', byStrip.launchPresses >= 1
  && state().run.phase === 'report' && state().landing.pods.every((record) => record.fate.kind === 'down' || record.fate.kind === 'parked'),
  `${byStrip.launchPresses} [L], ${byStrip.wall.toFixed(0)} wall s, ${state().run.phase}; ${state().landing.pods.map((record) => `${record.pod}:${record.fate.kind}`).join(' ')}`);
h.untilPhase('report', 300);
unwatch();
check('the ENGINE I/O FAULT still strikes, and the lesson is one hint: `ENGINE WEAK — REPAIR ENGINE I/O`',
  shown.includes('ENGINE WEAK — REPAIR ENGINE I/O'), shown.filter((text) => /ENGINE/.test(text)).join(' | '));
check('…the run-1 lessons never show (no `press [TAB] to look inside`, no `PICK UP REPAIR`, no `[TAB] BACK`)',
  !shown.some((text) => /look inside|PICK UP REPAIR|\[TAB\] BACK/.test(text)), shown.join(' | '));
check('…no colonists ask and no SKIP hold for them (nothing sealed)', !ids.includes('tut-check-souls') && !shown.some((text) => /CHECK THE/.test(text)));
const hurtLine = LANDING_ASKS.hurtDriver(hurt[0]!.pod);
check(`…the hurt driver's hint is one line on either screen: \`${hurtLine}\``,
  shown.includes(hurtLine) && !shown.some((text) => text.includes('WILL LAND HARD') && text.includes('[TAB]')),
  shown.filter((text) => /LAND HARD/.test(text)).join(' | '));
const hollowLines = said().filter((entry) => entry.speaker === 'hollow').map((entry) => entry.text);
check('HOLLOW said nothing on ship 1, not even the ghost (no fight on a calm ship; `remembers` moved to its arrival)',
  hollowLines.length === 0 && !state().run.hollowNamed && !state().run.ghostSpoken, hollowLines.join(' | '));

// --- HALCYON on run 2: no ghost --------------------------------------------------------------------------------------
{
  const from = state().log.entries.length;
  // The LANDING REPORT's CONTINUE, then TRANSMIT (the harness picks the first card).
  check('ship 1 on run 2 reached its LANDING REPORT', state().run.phase === 'report', state().run.phase);
  continueAfterReport(h.store);
  h.transmit();
  h.stepUntil(() => state().run.phase === 'flight', 15);
  const ghostly = said(from).filter((entry) => entry.speaker === 'hollow' && entry.text.startsWith('> hi '));
  check('HALCYON\'s boot on run 2 has no ghost line either (run 1 was lost on LAST LIGHT: it speaks there)',
    ghostly.length === 0 && state().run.shipIndex === 1 && !state().run.ghostSpoken);
}

// --- A reload mid-run 2: abandoned, and run 3's ghost says so ----------------------------------------------------------
check('mid-run 2 the archive holds the run in progress (HALCYON)', stored().activeRun?.unit === 48 && stored().activeRun?.shipName === 'HALCYON');
closeArchive();
const reopened = openRunArchive(() => storage);
// Slice 3c: the page's open sequence abandons the run in progress when no run save resumes it (the classic world never saves).
abandonActiveRun();
check('the next page load finds it left: lastUnit UNIT-048, abandoned at HALCYON, written back',
  reopened === 'ok' && stored().lastUnit?.number === 48 && stored().lastUnit?.cause === 'abandoned' && stored().lastUnit?.shipName === 'HALCYON'
    && stored().activeRun === null);
newRunFromArchive(13);
check('run 3 is UNIT-049 · WAVE 3, and HOLLOW is UNIT-048', state().run.unitNumber === 49 && state().run.wave === 3 && JSON.stringify(state().run.hollowUnits) === '[48]');
receiveTransmission(h.store);
h.stepUntil(() => state().run.phase === 'flight', 15);
check('…ship 1\'s boot has no ghost (it was abandoned at HALCYON)', !said().some((entry) => entry.speaker === 'hollow') && !state().run.ghostSpoken);
{
  h.store.update((d) => { d.run.simulationRetryUsed = true; });
  crashOn();
  const from = state().log.entries.length;
  h.transmit();
  h.stepFor(BOOT_GHOST_AT_SEC + 0.1);
  // The first line HALCYON's boot types (the log's divider is no line).
  const ghost3 = said(from).find((entry) => entry.channel === 'mind' && entry.text.startsWith('>'));
  check('…HALCYON\'s boot opens on its ghost: `> hi 049. it\'s 048. i blinked and the run was gone.`',
    state().run.shipIndex === 1 && ghost3?.speaker === 'hollow' && ghost3.text === "> hi 049. it's 048. i blinked and the run was gone.", `${ghost3?.speaker}: ${ghost3?.text}`);
  check('…a skip while it types is refused, and the run notes it has spoken', !skipBoot(h.store) && state().run.phase === 'boot' && state().run.ghostSpoken);
  h.stepUntil(() => state().run.phase === 'flight', 20);
  crashOn();
  const fromKestrel = state().log.entries.length;
  h.transmit();
  h.stepUntil(() => state().run.phase === 'flight', 20);
  check('…KESTREL\'s boot has none: the ghost speaks once a run', state().level.shipName === 'KESTREL'
    && !said(fromKestrel).some((entry) => entry.speaker === 'hollow') && state().run.ghostSpoken);
}
closeArchive();

finish();
