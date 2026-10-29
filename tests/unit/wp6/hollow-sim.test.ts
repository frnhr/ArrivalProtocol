// Slice 1a: POD 01 OKAFOR is HOLLOW's first bite (right after the root, so bitten from the left); the landing stands
// while the fight goes on ('manual' landing mode), and is landed instantly once the fight is decided; an eaten driver's
// pod is parked (eaten, restorable). PRINT FAST and the print-tug line are gone with the printer.
// TODO(phase2): Track SIM's director lines in LANDING (01-landing §3.11) decide what the strip says while a repair
// wins a tug-of-war; re-add that check after the merge.
// WP6 acceptance 3: ship 1 (ARES-VII), flown by the WP1 literal follower (the capture timings of the
// flight table, reaction 0.4 s), with HOLLOW mounted as on the page. The loop closes mid-capture and
// HOLLOW bites C12 (Ada's family); the capture burn doubles its drain (P1), and the fight comes after
// the lock.
// • full engine: C12 ≥ 55% at the lock; left alone it is eaten 30 ± 2 s after the lock; a repair
//   started 25 s after the lock still saves it (the tug-of-war always wins once started);
// • 40% engine (the ENGINE I/O FAULT never repaired): C12 is still alive (≥ 5%) at the lock;
// • one Core thread busy the whole flight (THRUST LIMIT 75%): C12 ≥ 45% at the lock.
// Plus: pause stops HOLLOW, the alerts (C12 INFECTED warns and holds SKIP; C12 WILL BE EATEN is an
// alarm ≤ 10 s out), the strip lines, the ship-1 script (dormant, `> ...047?`, CONTROL), the eaten
// driver in the results (CAN'T LAUNCH, then parked) and PRINT FAST's gate.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { actionRepair } from '@state/actions';
import { reserveThread, releaseThread, getOps } from '@systems/ops-core';
import { setPaused } from '@systems/clock';
import { colonistCounts } from '@state/selectors';
import { podRecord } from '@systems/landing-rules';
import { setLandingMode, landInstantly } from '../support/landing-instant';
import { HOLLOW_STORY } from '@data/hollow-text';
import { typingSec } from '@systems/say';
import { isReleaseRow } from '@systems/guidance';
import type { LogEntry } from '@state/schema';
import { EATEN_ALARM_SEC, HOLLOW_STORY_SILENCE_SEC, HOLLOW_CONTROL_AFTER_SEC, HOLLOW_STORY_READ_SEC } from '@data/tuning';

const h = createHarness6(1, { soulsFound: true });
setLandingMode('manual');

interface Flight {
  loopClosedAt: number | null;
  lockedAt: number;
  pod1AtLock: number;
  status: string;
}

// Flies ship 1 with the follower until the flight ends. `prepare` runs on the fresh state.
function fly(prepare: () => void): Flight {
  h.resetTo('flight');
  prepare();
  const start = h.events.length;
  followStrip(h, 0.4, 400, () => undefined);
  const loopClosed = h.events.slice(start).find((event) => event.name === 'loop-closed');
  const pod1 = h.maybeSoul('POD 01');
  return { loopClosedAt: loopClosed?.wall ?? null, lockedAt: h.wall(), pod1AtLock: pod1?.integrity ?? -1, status: h.status() };
}

const report = (flight: Flight): string =>
  `${flight.status} at ${flight.lockedAt.toFixed(1)} s (loop closed at ${flight.loopClosedAt?.toFixed(1)} s), POD 01 ${flight.pod1AtLock.toFixed(1)}%`;

// Steps to the LANDING REPORT and checks ship 1's story after the fight landed in order, each line with
// room of its own (§6.6): the fight's own echo typed out, HOLLOW_STORY_SILENCE_SEC of silence, then
// `> ...047?`; CONTROL HOLLOW_CONTROL_AFTER_SEC later; and the full-screen report only once CONTROL's
// line has typed and been read (HOLLOW_STORY_READ_SEC). `fightEcho` is the line that decided it.
function checkStory(label: string, fightEcho: RegExp): void {
  const firstId = h.log().at(-1)?.id ?? 0;
  h.stepUntil(() => {
    // The fight is decided: the pods left go down at once (the landing by the strip is tests/unit/landing/).
    if (h.store.getState().hollow.phase === 'dormant') landInstantly(h.store);
    return h.store.getState().run.phase === 'report';
  }, 90);
  const reportAt = h.store.getState().clock.aiSec;
  const lines = h.log().filter((entry) => entry.id > firstId || fightEcho.test(entry.text));
  const find = (match: (entry: LogEntry) => boolean): LogEntry | undefined => lines.find(match);
  const fight = [...lines].reverse().find((entry) => fightEcho.test(entry.text));
  const noticed = find((entry) => entry.speaker === 'hollow' && entry.text === HOLLOW_STORY.noticed(47));
  const control = find((entry) => entry.speaker === 'control' && entry.text === HOLLOW_STORY.control);
  const fightTyped = fight ? fight.t + typingSec(fight.speaker, fight.text) : NaN;
  const detail = `fight echo ${fight?.t.toFixed(2)} (typed by ${fightTyped.toFixed(2)}), ...047? ${noticed?.t.toFixed(2)}, CONTROL ${control?.t.toFixed(2)}, report ${reportAt.toFixed(2)}`;
  check(`${label}: dormant, and \`> ...047?\` comes ${HOLLOW_STORY_SILENCE_SEC} s after the fight's echo has typed out (silence, not typing)`,
    h.store.getState().hollow.phase === 'dormant' && fight !== undefined && noticed !== undefined
      && noticed.t >= fightTyped + HOLLOW_STORY_SILENCE_SEC - 0.05, detail);
  // LEAD-1: CONTROL also never types over another line (createStory): when a line came in between
  // (a print's echo while printing), CONTROL waits until it has typed plus the same silence, so it is
  // HOLLOW_CONTROL_AFTER_SEC after `> ...047?` or that silence after the last line, whichever is later.
  const between = control && noticed ? lines.filter((entry) => entry.t > noticed.t && entry.t < control.t) : [];
  // Each screen types its lines one after another (say.ts channelTypedByAi), so a line said while
  // `> ...047?` still types waits for it: replay both queues up to CONTROL.
  const typedBy = { mind: -Infinity, radio: -Infinity };
  for (const entry of h.log()) {
    if (!control || entry.t >= control.t) break;
    typedBy[entry.channel] = Math.max(entry.t, typedBy[entry.channel]) + typingSec(entry.speaker, entry.text);
  }
  const quietBy = Math.max(typedBy.mind, typedBy.radio);
  const controlDue = noticed ? Math.max(noticed.t + HOLLOW_CONTROL_AFTER_SEC, quietBy + HOLLOW_STORY_SILENCE_SEC) : NaN;
  check(`${label}: CONTROL's line ${HOLLOW_CONTROL_AFTER_SEC} s after it, or that silence after a line in between`,
    noticed !== undefined && control !== undefined && Math.abs(control.t - controlDue) < 0.1,
    `${detail}; in between: ${between.map((entry) => `${entry.t.toFixed(2)} '${entry.text}'`).join(', ') || 'nothing'}`);
  check(`${label}: the LANDING REPORT waits until CONTROL's line has typed and been read (${HOLLOW_STORY_READ_SEC} s)`,
    control !== undefined && h.store.getState().hollow.story === 'told'
      && reportAt >= control.t + typingSec('control', HOLLOW_STORY.control) + HOLLOW_STORY_READ_SEC - 0.05, detail);
}

// --- Full engine: ≥ 55% at the lock, eaten 30 ± 2 s later if nobody helps ---------------------------------
{
  const flight = fly(() => h.noFault());
  check('full engine: the follower locks', flight.status === 'locked', report(flight));
  check('full engine: the loop closed mid-capture and HOLLOW bit POD 01 from the left (Ada\'s family, right after the root)',
    flight.loopClosedAt !== null && h.events.some((event) => event.name === 'hollow-infect'
      && (event.payload as { segId: string }).segId === 'driver_pod01' && (event.payload as { side: string }).side === 'left'));
  check('full engine: POD 01 ≥ 55% at the lock', flight.pod1AtLock >= 55, report(flight));
  const state = h.store.getState();
  check('POD 01 INFECTED: a mind warning that holds SKIP (no klaxon yet)', state.alerts.list.some((alert) => alert.id === 'hollow-infected'
    && alert.text === 'POD 01 INFECTED' && alert.severity === 'warn' && alert.inhibitsSkip));
  check('REPAIR was licensed by the infection (the only cure is a repair)', state.run.licences.includes('repair'));
  h.step();
  check('after the lock, from amber: SOMETHING IS EATING POD 01 — [TAB], REPAIR IT!',
    h.shown()?.id === 'hollow-eating-tab' && h.shown()?.text === 'SOMETHING IS EATING POD 01 — [TAB], REPAIR IT!', h.shown()?.text);

  // Pause stops HOLLOW: no drain while frozen.
  const before = h.soul('POD 01').integrity;
  setPaused(h.store, true);
  h.stepFor(3);
  check('pause stops HOLLOW (no drain in 3 s paused)', h.soul('POD 01').integrity === before);
  setPaused(h.store, false);
  const lockedAt = h.wall() - 3;

  let alarmAt: number | null = null;
  let alarmLine: string | undefined;
  h.stepUntil(() => {
    if (alarmAt === null && h.store.getState().alerts.list.some((alert) => alert.id === 'eaten:1')) {
      alarmAt = h.wall();
    }
    if (alarmAt !== null && alarmLine === undefined && h.wall() - alarmAt > 0.5) alarmLine = h.shown()?.text;
    return h.maybeSoul('POD 01') === null;
  }, 80);
  const eatenAfter = h.wall() - lockedAt - 3;
  check('idle: POD 01 is eaten 30 ± 2 s after the lock', Math.abs(eatenAfter - 30) <= 2, `${eatenAfter.toFixed(1)} s after the lock`);
  check(`the alarm came ${EATEN_ALARM_SEC} s before it: POD 01 WILL BE EATEN IN 0:10 … — [TAB], REPAIR IT`,
    alarmAt !== null && Math.abs(h.wall() - alarmAt - EATEN_ALARM_SEC) < 0.2
      && /^POD 01 WILL BE EATEN IN 0:(10|0\d) — \[TAB\], REPAIR IT$/.test(alarmLine ?? ''), `${alarmLine}, ${alarmAt === null ? '' : (h.wall() - alarmAt).toFixed(2)} s before`);
  const after = h.store.getState();
  check('POD 01\'s driver was eaten: recorded on its pod, and its 8 blocks are hollow now (ATE POD 01 · OKAFOR)',
    podRecord(after, 1).driverLost === 'eaten' && h.hollowBlocks().some((seg) => seg.type === 'hollow' && seg.ate === 'POD 01 · OKAFOR' && seg.atePod === 1));
  check('the alarms cleared with it', !after.alerts.list.some((alert) => alert.id.startsWith('eaten:') || alert.id === 'hollow-infected'));
  checkStory('lost', /^> eat pod01 \.\.\. CAN'T LAUNCH/);
  const pod1 = podRecord(h.store.getState(), 1).fate;
  check('the landing ends in the LANDING REPORT: the two others landed (400), POD 01 parked (eaten, restorable)', h.store.getState().run.phase === 'report'
    && colonistCounts(h.store.getState()).landedInLz === 400 && pod1.kind === 'parked' && pod1.why === 'eaten' && pod1.restorable,
    `${JSON.stringify(colonistCounts(h.store.getState()))} ${JSON.stringify(pod1)}`);
  h.checkMemory();
}

// --- A repair started 25 s after the lock saves it ------------------------------------------------------------
{
  const flight = fly(() => h.noFault());
  h.stepFor(25);
  const pod1 = h.soul('POD 01');
  const at = pod1.integrity;
  const started = actionRepair(h.store, pod1) === null;
  let lowest = pod1.integrity;
  const repairFrom = h.wall();
  let alarmWhileWinning = false;
  h.stepUntil(() => {
    lowest = Math.min(lowest, h.maybeSoul('POD 01')?.integrity ?? 0);
    // Past the strip's hysteresis: the alarm cleared at once (the repair wins).
    if (getOps().length > 0 && h.wall() - repairFrom > 0.5 && h.store.getState().alerts.list.some((alert) => alert.id === 'eaten:1')) alarmWhileWinning = true;
    return getOps().length === 0;
  }, 20);
  const after = h.maybeSoul('POD 01');
  check('a repair started 25 s after the lock wins the tug-of-war: POD 01 back to 100, infection cleared, recoiling',
    started && after !== null && after.integrity === 100 && !after.infected && after.recoilUntilAi !== undefined,
    `${report(flight)}; repair from ${at.toFixed(1)}%, lowest ${lowest.toFixed(1)}%`);
  check('…the green pushed the red back from the first tick (never lower than where it started)', lowest >= at - 0.2);
  check('while it fought, no WILL BE EATEN alarm (the repair is winning)', !alarmWhileWinning);
  check('the cure is heard (hollow-cure)', h.events.some((event) => event.name === 'hollow-cure'));
  checkStory('saved late', /^> repair pod01 \.\.\. OK/);
  const result = podRecord(h.store.getState(), 1).fate;
  check('POD 01 · OKAFOR landed (Ada is saved)', result.kind === 'down' && result.touchdown.place === 'lz', result.kind);
}

// --- 40% engine: the fault never repaired ---------------------------------------------------------------------------
{
  const flight = fly(() => undefined);
  check('40% engine (ENGINE I/O FAULT never repaired): the follower still locks', flight.status === 'locked', report(flight));
  check('40% engine: POD 01 is alive (≥ 5%) at the lock', flight.pod1AtLock >= 5, report(flight));
}

// --- 40% engine, flown by the strip (what a kid reads, not guidance's objective) ---------------------------------
// The kid who chose to burn rather than hack: does what the strip says about SPACE and the presets, and
// never TABs. HOLLOW's alarm may replace KEEP HOLDING (the hack-or-burn choice), but never a RELEASE.
{
  h.resetTo('flight');
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) h.keyDown('Space');
    if (!on && holding) h.keyUp('Space');
    holding = on;
  };
  // The WP1 follower's reactions (wp1/harness followStrip), on the strip's text.
  const react = (text: string): void => {
    const keyMatch = text.match(/press \[([WASD])\]/);
    if (/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(text)) {
      setHolding(false);
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
    } else {
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
      if (/hold \[SPACE\]|KEEP HOLDING|NOW/.test(text)) setHolding(true);
    }
    if (text.includes('[F]')) h.press('KeyF');
  };
  const queue: { at: number; text: string }[] = [];
  let lastText = '';
  let releaseHiddenSec = 0;
  let alarmShown = false;
  const end = h.wall() + 400;
  while (h.status() === 'approaching' && h.wall() < end) {
    h.step();
    const shown = h.shown();
    const flight = h.shownObjective();
    if (shown?.id.startsWith('alarm-')) alarmShown = true;
    if (flight && isReleaseRow(flight.id) && shown?.id.startsWith('alarm-')) releaseHiddenSec += 0.05;
    const text = shown?.text ?? '';
    if (text !== lastText) { lastText = text; queue.push({ at: h.wall() + 0.4, text }); }
    while (queue.length > 0 && queue[0]!.at <= h.wall() + 1e-9) react(queue.shift()!.text);
  }
  setHolding(false);
  const pod1 = h.maybeSoul('POD 01');
  check('40% engine, flown by the strip: HOLLOW\'s alarm came mid-capture, but no RELEASE was ever hidden under it',
    alarmShown && releaseHiddenSec === 0, `alarm on the strip: ${alarmShown}, RELEASE hidden ${releaseHiddenSec.toFixed(2)} s`);
  check('40% engine, flown by the strip: locks with POD 01 alive (≥ 5%)', h.status() === 'locked' && (pod1?.integrity ?? 0) >= 5,
    `${h.status()}, POD 01 ${pod1?.integrity.toFixed(1) ?? 'eaten'}%`);
}

// --- One busy thread the whole flight -------------------------------------------------------------------------------
{
  const flight = fly(() => { h.noFault(); reserveThread('wp6-busy'); });
  releaseThread('wp6-busy');
  check('1 busy thread (THRUST LIMIT 75%): the follower locks', flight.status === 'locked', report(flight));
  check('1 busy thread: POD 01 ≥ 45% at the lock', flight.pod1AtLock >= 45, report(flight));
}

finish();
