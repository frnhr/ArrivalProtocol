// Slice 5 review fix pass (m9): the BEAM and SHIP DONE saves on a resident ship of each kind, RESUMEd, with nothing left
// running (reset.ts resetReport() empty), and the run going on to the next ship. Seed 7 (the review's saves probe, one
// case a kind; GANNET's SHIP DONE saves are corrupted-flow's):
// • CURLEW (the sleeper): MOTH running the drops into the landing as the ship ends;
// • HERON (left): the note read; its PACKET's skill card picked, and installed at the next boot;
// • PROVIDENCE (the late surprise), reached via CORMORANT so HOLLOW is not new there (review m6): awake when the ship ends.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createHarness7 } from '../wp7/harness7';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk, storedSave, type StubStorage } from '../save/save-fixture';
import { giveTools } from '../map/repo-fixture';
import { setCourseFromDesk } from '../support/desk';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { resumeRun } from '@systems/run-save';
import { resetReport } from '@systems/reset';
import { reachableFrom } from '@systems/map-hop';
import { wakeSleeperNow, pickSleeperJob } from '@systems/resident-sleeper';
import { activeLandingController } from '@systems/landing-controller';
import { pickCard } from '@systems/draft';
import { transmitNext } from '@systems/run';
import { actionScan } from '@state/actions';
import { RESIDENT_SEG_IDS } from '@data/residents';
import { SKILL_TREE } from '@data/skills';
import { END_SLOTS } from '@data/arm';

const SEED = 7;
const h = createHarness7(SEED);
const s = (): Readonly<GameState> => h.store.getState();
const stepUntil = (done: () => boolean, maxWall = 300): boolean => { h.stepUntil(done, maxWall); return done(); };
let storage: StubStorage = stubStorage();

function arrive(route: readonly number[]): void {
  storage = stubStorage();
  pageOpen(h.store, storage, SEED);
  receiveToReport(h.store);
  route.forEach((slot, i) => {
    beamTo(h.store, slot);
    if (i < route.length - 1) toDesk(h.store);
  });
}

function point(): string {
  try { return storedSave(storage).save.point; } catch (error) { return String(error); }
}

// The page is opened again and RESUME taken: nothing may be left running from before (module state, timers, ops).
function resumes(): readonly unknown[] | null {
  pageOpen(h.store, storage, SEED + 100);
  if (s().save.resume === null) return null;
  resumeRun(h.store);
  return resetReport();
}

const cases: { route: number[]; label: string; act: () => string }[] = [
  {
    route: [2, 7], label: 'CURLEW, MOTH running the drops into the landing',
    act: () => {
      wakeSleeperNow(h.store);
      h.step();
      pickSleeperJob(h.store, 'drops');
      setLandingMode('manual');
      lockOn(h);
      stepUntil(() => s().landing.pods.some((record) => record.fate.kind !== 'aboard'), 60);
      const flying = activeLandingController(s())?.source === 'resident';
      setLandingMode('instant');
      return flying ? 'ok' : 'MOTH is not flying the landing';
    },
  },
  {
    route: [2, 4], label: 'HERON, its note read',
    act: () => {
      giveTools(h.store, []);
      actionScan(h.store, s().memory.find((seg) => seg.id === RESIDENT_SEG_IDS.note)!);
      return stepUntil(() => s().resident.left!.noteRead, 10) ? 'ok' : 'the note was not read';
    },
  },
  {
    route: [2, 5, 11, 15, 16], label: 'PROVIDENCE (via CORMORANT), the surprise awake',
    act: () => (stepUntil(() => s().resident.corrupted?.phase === 'awake', 120) ? 'ok' : 'the surprise never woke'),
  },
];

for (const c of cases) {
  arrive(c.route);
  const ship = s().level.shipName;
  const beam = point();
  const afterBeam = resumes();
  check(`${c.label}: the BEAM save into ${ship} decodes and RESUMEs to its boot with nothing left running`,
    beam === 'beam' && afterBeam !== null && afterBeam.length === 0, `${beam} ${JSON.stringify(afterBeam)}`);
  stepUntil(() => s().run.phase === 'flight', 60);
  h.step();
  const acted = c.act();
  check(`${c.label}: set up`, acted === 'ok', acted);
  toDesk(h.store);
  const done = point();
  const record = s().run.residents.met.at(-1);
  const afterDone = resumes();
  check(`${c.label}: SHIP DONE decodes and RESUMEs at the desk, nothing left running, its record kept (${record?.kind} · ${record?.fate})`,
    done === 'ship-done' && afterDone !== null && afterDone.length === 0 && s().run.phase === 'desk'
    && JSON.stringify(s().run.residents.met.at(-1)) === JSON.stringify(record), `${done} ${JSON.stringify(afterDone)}`);
  // On to the next ship: a departed resident's skill card is picked and installs at its boot.
  const from = s().run.map.route.at(-1)!.slot;
  const next = reachableFrom(s().run.map, from).find((slot) => !END_SLOTS.includes(slot)) ?? reachableFrom(s().run.map, from)[0]!;
  setCourseFromDesk(h.store, next);
  const skill = s().run.transit!.offer.find((card) => card.id === 'skill')?.leftover?.skill ?? null;
  pickCard(h.store, skill !== null ? 'skill' : s().run.transit!.offer[0]!.id);
  const logFrom = s().log.entries.length;
  transmitNext(h.store);
  stepUntil(() => s().run.phase === 'flight', 60);
  const trained = s().log.entries.slice(logFrom).some((entry) => skill !== null
    && entry.text === `> SKILL TRAINED: ${SKILL_TREE[skill].fileName} v1 · from the resident that left ${ship}`);
  check(`${c.label}: the run goes on to ${s().level.shipName}${skill !== null ? `, the skill card's ${skill} installed at its boot` : ''}`,
    s().run.phase === 'flight' && (skill === null || trained), skill ?? '');
  if (c.route.at(-1) === 4) check('HERON\'s PACKET deals the skill card', skill !== null);
}

finish();
