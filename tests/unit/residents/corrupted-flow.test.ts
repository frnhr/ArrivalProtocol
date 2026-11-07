// Slice 5 Track WARDEN (docs/phase3/impl/slice-5-plan.md §7.1): the corrupted resident flown by the real systems on run 1's
// arm (seed 7), the WP7 harness (every DOM-free system as main.ts mounts them), the unit beamed ARES-VII → HALCYON → GANNET
// (slot 9: WARDEN, `reported faulty`, 7 pods) by the save fixture's sends, so each scenario starts from GANNET's boot (about
// a tenth of a second: nothing here needs flyOnce). No kid flies; the tests act in the MIND by the state/actions calls.
// • the wake at the flight's first tick, its first line and CONTROL's; the first burst's alarm (its own word), the strip's
//   alarm line, the pip's override and jump; the counter; SWAP does not stop it; no ENGINE FAULT SKIP refusal;
// • the lock clock: the first telegraph 30 calm s after the wake, the next 40 after a telegraph's start, 3 s each, frozen at
//   TACTICAL, none without a free thread; a lock blocked by SCAN; one landed (`POD LOCKED`, the strip's line) and still
//   locked at END LANDING (parked, `podsParkedLocked`); the cap (GANNET: 2); review M3: with no remedy aboard a locked pod
//   can never launch (its strip line, the auto-end parks it), and a remedy given later makes it launchable again;
// • DELETE: SCAN IT FIRST, then 6 s with the DELETING bursts, every lock released, the event, the last line and CONTROL's
//   thanks; REPAIR: the cure for about 12 charge in about 3.6 s, its thank-you; the DEAL accepted (the named file deleted,
//   quiet for the ship), refused and timed out (angry: faster bursts and locks), and not offered while HOLLOW's deal holds
//   the ship (R8); each ship's SHIP DONE record (deleted, cured, paid, ignored) in a save that decodes;
// • the late surprise (GANNET's card made `unknown`): the 20 s grace, its health shown at the wake, no SCAN hunt, no CONTROL
//   line, the first lock at 45 s; and PROVIDENCE (slot 16, `unknown`), where HOLLOW boards: it waits for HOLLOW's first
//   fight there (threat-selectors hollowFirstFightDecided), but not on a later ship of HOLLOW's (review m6); HOLLOW's DEAL
//   standing holds its lock clock (review m5).
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { Reservations } from '@/types/map';
import type { DriverSegment, ResidentSegment, Segment } from '@/types/segment';
import { createHarness7 } from '../wp7/harness7';
import { withResidentsBuilt } from '../support/residents';
import { stubStorage, pageOpen, receiveToReport, beamTo, toDesk, storedSave, type StubStorage } from '../save/save-fixture';
import { giveTools } from '../map/repo-fixture';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { actionScan, actionDelete, actionRepair, actionSwap } from '@state/actions';
import { residentGhostSpec, residentFile, liveLockText, lockedDrivers } from '@state/resident-selectors';
import { lockNow, offerResidentDealNow, lockRemedy } from '@systems/resident-corrupted';
import { residentSegmentLook } from '@systems/resident-hud';
import { capabilitiesNow, ghostRefusesSkip, ghostWithoutSwap } from '@systems/capabilities';
import { windowPip } from '@systems/flight-hud';
import { getOpsBySeg, reserveThread, releaseThread } from '@systems/ops-core';
import { pickChoice, openChoiceEntry } from '@systems/say';
import { endLanding } from '@systems/landing';
import { isLaunchable, launchQueue, canEverLaunch, driversThatCanEverLaunch } from '@systems/landing-rules';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { hollowFirstFightDecided } from '@state/threat-selectors';
import { chargeLeft } from '@state/selectors';
import { GHOST_ALARM_ID, GHOST_WARN_ID } from '@systems/alerts';
import { WARDEN_TEXT } from '@data/warden-text';
import { GUIDE_RULES } from '@data/script';
import { buildDirectorCtx } from '@systems/director';
import { getPrediction } from '@systems/predict';
import {
  RESIDENT_GHOST, RESIDENT_GHOST_DELETING, RESIDENT_GHOST_ANGRY, RESIDENT_LOCK_FIRST_SEC, RESIDENT_LOCK_EVERY_SEC,
  RESIDENT_LOCK_TELEGRAPH_SEC, RESIDENT_ANGRY_LOCK_FACTOR, SURPRISE_WAKE_SEC, SURPRISE_FIRST_LOCK_SEC, DEAL_TIMEOUT_SEC, INTEGRITY_MAX,
} from '@data/tuning';

const SEED = 7;
const GANNET = 9;
const PROVIDENCE = 16;
const h = createHarness7(SEED);
const s = (): Readonly<GameState> => h.store.getState();
const machine = (): NonNullable<GameState['resident']['corrupted']> => s().resident.corrupted!;
const warden = (): ResidentSegment => residentFile(s())!;
const driver = (pod: number): DriverSegment => s().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === pod)!;
const said = (speaker: string, text: string): boolean => s().log.entries.some((entry) => entry.speaker === speaker && entry.text === text);
const events = (name: string, from: number): unknown[] => h.events.slice(from).filter((event) => event.name === name).map((event) => event.payload);
const shownId = (): string => s().director.shown?.id ?? 'none';
// A strip rule's line now, when it is live (whatever outranks it on the strip: here a seed eating Telemetry), else null.
const ruleLine = (id: string): string | null => {
  const ctx = buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
  const rule = GUIDE_RULES.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`no strip rule ${id}`);
  return rule.activeWhen(ctx) ? rule.text(ctx) : null;
};
const stepFor = (aiSec: number): void => { const until = s().clock.aiSec + aiSec; h.stepUntil(() => s().clock.aiSec >= until, aiSec * 4 + 10); };
const stepUntil = (done: () => boolean, maxWall = 300): boolean => { h.stepUntil(done, maxWall); return done(); };

let storage: StubStorage = stubStorage();

// The unit beamed into `slot` along `route` (from ARES-VII's report), the reservation edited first, then the boot played to
// the flight's first tick.
function arrive(route: readonly number[], edit: ((reserved: Reservations) => void) | null = null): void {
  storage = stubStorage();
  pageOpen(h.store, storage, SEED);
  receiveToReport(h.store);
  route.forEach((slot, i) => {
    if (i === route.length - 1 && edit !== null) h.store.update((draft) => { edit(draft.run.map.arm[slot]!.reserved); });
    beamTo(h.store, slot);
    if (i < route.length - 1) toDesk(h.store);
  });
  stepUntil(() => s().run.phase === 'flight', 60);
  h.step();
}
const toGannet = (edit: ((reserved: Reservations) => void) | null = null): void => arrive([2, GANNET], edit);

// A lock telegraphed now (on the next pod) and left to land.
function landALock(): number {
  lockNow(h.store);
  const pod = machine().lock!.pod;
  stepUntil(() => machine().lock === null, 30);
  return pod;
}

// The ship ends (its report CONTINUE: endShip, then the desk and SHIP DONE's save) and its record.
function shipDone(): { fate: string | undefined; parked: number | undefined; decodes: boolean } {
  const met = s().run.residents.met.length;
  toDesk(h.store);
  const record = s().run.residents.met[met];
  let decodes = true;
  try { decodes = storedSave(storage).save.point === 'ship-done'; } catch { decodes = false; }
  return { fate: record?.fate, parked: record?.podsParkedLocked, decodes };
}

withResidentsBuilt(['corrupted'], () => {
  // --- GANNET, faulty, nobody acting: the wake, the bursts, the lock clock, the DEAL timing out, the landing -----------------
  {
    const from = h.events.length;
    toGannet();
    check('GANNET wakes WARDEN at the flight\'s first tick: `THIS SHIP DID NOT ASK FOR A CARETAKER.`, then CONTROL on the radio',
      machine().phase === 'awake' && machine().wokeAtAi !== null && machine().wokeAtAi! < 0.2
      && said('resident', 'WARDEN: THIS SHIP DID NOT ASK FOR A CARETAKER.') && said('control', 'GANNET\'s onboard AI is reported faulty. Please delete it. :)')
      && JSON.stringify(events('resident-wake', from)) === JSON.stringify([{ kind: 'corrupted', name: 'WARDEN', surprise: false }]),
      JSON.stringify(machine()));
    check('…its file stays hidden (`?`) until a SCAN, and it fires RESIDENT_GHOST (the composite\'s source; no ENGINE FAULT refusal)',
      !warden().scanned && residentGhostSpec(s()) === RESIDENT_GHOST && capabilitiesNow(s()).thrustCtrl.ghostBy === 'resident'
      && !ghostRefusesSkip(s()) && !ghostWithoutSwap(s()));
    // The first burst: its own alarm, and the strip's line (the mode toggle starts in amber).
    let alarmText: string | null = null;
    let alarmLine = false;
    let calmFrozen = true;
    let tacticalTicks = 0;
    const seen: { telegraphAtCalm: number | null } = { telegraphAtCalm: null };
    const liveTexts = new Set<string>();
    stepUntil(() => {
      const pace = s().clock.pace;
      const calm = machine().calmAiSec;
      const lockIn = machine().lockInSec;
      h.step();
      if (pace === 'tactical' && s().clock.pace === 'tactical' && machine().lock === null) {
        tacticalTicks++;
        if (machine().calmAiSec !== calm || machine().lockInSec !== lockIn) calmFrozen = false;
      }
      const alarm = s().alerts.list.find((alert) => alert.id === GHOST_ALARM_ID);
      if (alarm && alarmText === null) alarmText = alarm.text;
      if (shownId() === 'alarm-resident-tab' || shownId() === 'alarm-resident') alarmLine = true;
      if (machine().lock !== null && seen.telegraphAtCalm === null) seen.telegraphAtCalm = machine().calmAiSec;
      if (machine().lock !== null) liveTexts.add(liveLockText(s()) ?? '');
      return machine().lock === null && seen.telegraphAtCalm !== null;
    }, 200);
    check('its first burst is an alarm of its own (`THE SHIP\'S AI IS FIRING THE ENGINE`), and the strip says where: '
      + '`… — [TAB], find it in RACK A`', alarmText === WARDEN_TEXT.alarm && alarmLine && machine().bursts >= 1, `${alarmText} ${alarmLine}`);
    const pip = windowPip(s(), 'thrust-ctrl');
    check('…the THRUST CTRL pip reads OVERRIDDEN · WARDEN.sys and a click jumps to WARDEN.sys', pip.override === 'OVERRIDDEN · WARDEN.sys'
      && pip.jumpId === warden().id, JSON.stringify(pip));
    const counter = s().alerts.list.find((alert) => alert.id === GHOST_WARN_ID)?.text ?? '';
    check('…later bursts are counted by name (`WARDEN FIRED THE ENGINE ×n`)', machine().bursts < 2 || counter === `WARDEN FIRED THE ENGINE ×${machine().bursts}`,
      `${counter} (${machine().bursts} bursts)`);
    check(`the first lock telegraphs ${RESIDENT_LOCK_FIRST_SEC} calm s after the wake, for ${RESIDENT_LOCK_TELEGRAPH_SEC} s (\`> LOCK POD 01 ... 3\`, live 3 → 2 → 1)`,
      seen.telegraphAtCalm !== null && Math.abs(seen.telegraphAtCalm - RESIDENT_LOCK_FIRST_SEC) < 0.25 && said('resident', '> LOCK POD 01 ... 3')
      && ['> LOCK POD 01 ... 3', '> LOCK POD 01 ... 2', '> LOCK POD 01 ... 1'].every((text) => liveTexts.has(text)),
      `at calm ${seen.telegraphAtCalm?.toFixed(2)} · ${[...liveTexts].join(' | ')}`);
    check(`…its clocks stand still at TACTICAL (${tacticalTicks} ticks there)`, calmFrozen);
    check('…nobody blocked it: POD 01 is locked (`WARDEN: POD 01 STAYS.`), not launchable, out of the queue',
      driver(1).lockedBy === 'WARDEN' && !isLaunchable(driver(1)) && !launchQueue(s()).some((d) => d.pod === 1) && machine().locksLanded === 1
      && said('resident', 'WARDEN: POD 01 STAYS.') && JSON.stringify(events('resident-lock', from).map((p) => (p as { phase: string }).phase)) === '["telegraph","landed"]');
    // The DEAL comes at once (a locked pod, HOLLOW's deal idle): it names the fair tier's file, with THE DEAL's 15 s.
    const deal = openChoiceEntry(s());
    check('…and its DEAL comes at once: `WARDEN: GIVE ME YOUR SPARE REPAIR. …`, ACCEPT [Y] / REFUSE [N]',
      machine().deal.phase === 'offered' && deal?.speaker === 'resident' && deal.text === 'WARDEN: GIVE ME YOUR SPARE REPAIR. THEN I LET THE PODS GO.'
      && deal.choice?.keys?.join() === 'Y,N' && deal.choice.timeoutAiSec === DEAL_TIMEOUT_SEC && machine().deal.fileName === 'Repair.bak', deal?.text);
    for (let i = 0; i < 3; i++) h.step();
    const locked = ruleLine('resident-locked-tab');
    check('…and the strip has its line for the lock: `POD 01 LOCKED — [TAB], DELETE or REPAIR WARDEN.sys`',
      locked === 'POD 01 LOCKED — [TAB], DELETE or REPAIR WARDEN.sys' && ruleLine('resident-locked') === null, `${locked} (shown: ${shownId()})`);
    const lockInBefore = machine().lockInSec!;
    stepUntil(() => machine().deal.phase === 'done', 60);
    check('the DEAL timed out: `WARDEN: THEN THEY STAY. THEY ALL STAY.`, angry (RESIDENT_GHOST_ANGRY), its lock clock × 0.6 at once',
      machine().deal.outcome === 'timeout' && said('resident', 'WARDEN: THEN THEY STAY. THEY ALL STAY.') && residentGhostSpec(s()) === RESIDENT_GHOST_ANGRY
      && machine().lockInSec! < lockInBefore * RESIDENT_ANGRY_LOCK_FACTOR + 0.6 && machine().lockInSec! < lockInBefore,
      `${lockInBefore.toFixed(1)} → ${machine().lockInSec?.toFixed(1)}`);
    stepUntil(() => machine().locksLanded >= 2, 200);
    check('the cap: GANNET\'s 7 pods take 2 locks, then no more', machine().locksLanded === 2 && machine().lockInSec === null
      && lockedDrivers(s()).length === 2);
    setLandingMode('manual');
    lockOn(h);
    check('in the landing it fires nothing (R4), and its locked pods stay out of the queue', s().run.phase === 'landing' && residentGhostSpec(s()) === null
      && capabilitiesNow(s()).thrustCtrl.ghost === null && launchQueue(s()).every((d) => d.lockedBy === undefined));
    stepFor(2);
    const refusal = endLanding(h.store);
    check('END LANDING ends it with the two pods still locked aboard', refusal === null && s().landing.ended !== null
      && lockedDrivers(s()).length === 2, `${refusal} ${s().landing.ended} ${s().clock.paused}`);
    stepUntil(() => s().run.phase !== 'landing', 120);
    setLandingMode('instant');
    const done = shipDone();
    check('SHIP DONE: WARDEN ignored, 2 pods parked locked, in a save that decodes', done.fate === 'ignored' && done.parked === 2 && done.decodes,
      JSON.stringify(done));
  }

  // --- Review M3: a locked pod nothing aboard can free parks by itself; a remedy makes it launchable again ---------------------
  {
    toGannet();
    h.store.update((draft) => {
      draft.hollow.phase = 'dormant';
      draft.memory = draft.memory.map((block) => (block.type === 'hollow' ? freeSegment(block.size) : block));
      mergeAdjacentFree(draft.memory);
    });
    const setCharge = (used: number): void => {
      h.store.update((draft) => {
        const charge = draft.memory.find((seg) => seg.type === 'redundancy');
        if (charge === undefined || charge.type !== 'redundancy') throw new Error('M3: no REPAIR CHARGE aboard');
        charge.used = used;
      });
    };
    // Every pod locked (lockNow passes the cap), the DEAL refused: SCAN and REPAIR aboard, no DELETE (seed 7's route).
    const pods = s().landing.pods.length;
    for (let i = 0; i < pods; i++) {
      landALock();
      const choice = openChoiceEntry(s());
      if (choice !== null && choice.speaker === 'resident') pickChoice(choice.id, 'REFUSE');
      h.step();
    }
    const allLocked = lockedDrivers(s()).length === pods && machine().deal.phase === 'done';
    check(`with every pod locked and the DEAL refused, ${chargeLeft(s())} charge (the cure costs 12) and no DELETE are a remedy: the cure`,
      allLocked && lockRemedy(s()) === 'cure' && canEverLaunch(s(), 1) && ruleLine('resident-stuck') === null, `${lockRemedy(s())}`);
    setCharge(5);
    for (let i = 0; i < 3; i++) h.step();
    check('…at 5 charge nothing aboard can free them: no remedy, and a locked pod can never launch (as a dead driver with no REPAIR)',
      lockRemedy(s()) === null && !canEverLaunch(s(), 1) && driversThatCanEverLaunch(s()).length === 0);
    check('…the strip says so in one line, and no longer asks for DELETE or REPAIR: `POD 01 STAYS LOCKED — nothing aboard can free it`',
      ruleLine('resident-stuck') === 'POD 01 STAYS LOCKED — nothing aboard can free it' && ruleLine('resident-locked-tab') === null
      && ruleLine('resident-locked') === null && WARDEN_TEXT.stripStuck(16).length <= 70, ruleLine('resident-stuck') ?? 'none');
    // The other direction: a remedy that comes later (a DELETE in hand, or the charge back) makes the pod launchable again.
    giveTools(h.store, ['delete']);
    const withDelete = lockRemedy(s());
    const launchable = canEverLaunch(s(), 1);
    h.store.update((draft) => {
      draft.memory = draft.memory.map((block) => (block.type === 'fs-tool' && block.fsTool === 'delete' ? freeSegment(block.size) : block));
      mergeAdjacentFree(draft.memory);
    });
    check('…a DELETE given makes them launchable again (remedy delete); taken away, stuck again',
      withDelete === 'delete' && launchable && lockRemedy(s()) === null && !canEverLaunch(s(), 1), `${withDelete} ${launchable}`);
    setCharge(24);
    check('…and so does the charge for the cure', lockRemedy(s()) === 'cure' && canEverLaunch(s(), 1) && ruleLine('resident-locked-tab') !== null);
    // Review m9: a landing with only locked pods, a remedy aboard: it waits (no auto-end), and the strip names the lock, not L11.
    setLandingMode('manual');
    lockOn(h);
    const shownIds = new Set<string>();
    stepFor(12);
    for (let i = 0; i < 5; i++) { h.step(); shownIds.add(shownId()); }
    check('a landing with only locked pods and the cure aboard waits past the auto-end\'s grace, the strip on the lock (not L11)',
      s().landing.ended === null && [...shownIds].some((id) => id === 'resident-locked-tab' || id === 'resident-locked') && !shownIds.has('landing-L11'),
      [...shownIds].join(', '));
    setCharge(5);
    stepUntil(() => s().landing.ended !== null, 120);
    const parked = s().landing.pods.filter((record) => record.fate.kind === 'parked').length;
    check(`…the charge gone, the auto-end fires by itself (no END LANDING): all ${pods} pods parked, locked`, s().landing.ended === 'no-driver-left'
      && parked === pods && lockedDrivers(s()).length === pods, `${s().landing.ended} · ${parked} parked`);
    stepUntil(() => s().run.phase !== 'landing', 120);
    setLandingMode('instant');
    const done = shipDone();
    check('SHIP DONE: WARDEN ignored, every pod parked locked, in a save that decodes', done.fate === 'ignored' && done.parked === pods && done.decodes,
      JSON.stringify(done));
  }

  // --- A lock blocked by SCAN; the next 40 s after its start; none without a free thread -------------------------------------
  {
    const from = h.events.length;
    toGannet();
    stepUntil(() => machine().lock !== null, 200);
    const firstAtCalm = machine().calmAiSec;
    check('the strip\'s lock line while it counts: `BLOCK THE LOCK — [TAB], SCAN POD 01 (3…)`, before a lesson\'s lead-in',
      ruleLine('resident-lock-tab') === 'BLOCK THE LOCK — [TAB], SCAN POD 01 (3…)' && shownId() === 'resident-lock-tab', `${ruleLine('resident-lock-tab')} (shown: ${shownId()})`);
    check('SCAN takes the locked-at driver (the cheap block)', actionScan(h.store, driver(1)) === null);
    for (let i = 0; i < 2; i++) h.step();
    check('…and blocks it: `> LOCK POD 01 ... BLOCKED` in the good tone, the pod free',
      machine().lock === null && machine().locksBlocked === 1 && driver(1).lockedBy === undefined
      && s().log.entries.some((entry) => entry.text === '> LOCK POD 01 ... BLOCKED' && entry.tone === 'good')
      && events('resident-lock', from).some((p) => (p as { phase: string }).phase === 'blocked'));
    stepUntil(() => machine().lock !== null, 300);
    const gap = machine().calmAiSec - firstAtCalm;
    check(`the next lock telegraphs ${RESIDENT_LOCK_EVERY_SEC} calm s after the last one's start`, Math.abs(gap - RESIDENT_LOCK_EVERY_SEC) < 0.25, gap.toFixed(2));
    actionScan(h.store, driver(machine().lock!.pod));
    for (let i = 0; i < 2; i++) h.step();
    // Every thread taken when the next lock is due: it waits at 0 (a kid with no thread can't block it), and comes once one is free.
    stepUntil(() => (machine().lockInSec ?? 99) < 0.5 && getOpsBySeg(driver(1).id).length === 0, 300);
    const held = [reserveThread('test-a'), reserveThread('test-b')];
    stepFor(3);
    const waited = machine().lock === null && machine().lockInSec === 0;
    for (const [i, owner] of ['test-a', 'test-b'].entries()) if (held[i]) releaseThread(owner);
    for (let i = 0; i < 2; i++) h.step();
    check('…with no Core thread free it waits at 0, and telegraphs as soon as one is', held.every(Boolean) && waited && machine().lock !== null,
      `${held} ${waited} ${JSON.stringify(machine().lock)}`);
  }

  // --- DELETE (R25): SCAN IT FIRST, 6 s with the DELETING bursts, every lock released ---------------------------------------
  {
    const from = h.events.length;
    toGannet();
    giveTools(h.store, ['delete']);
    check('DELETE before a SCAN: SCAN IT FIRST', actionDelete(h.store, warden()) === 'SCAN IT FIRST');
    actionScan(h.store, warden());
    stepUntil(() => warden().scanned, 10);
    check('…the SCAN shows 40% and the desc says what it is', warden().scanned && warden().desc === WARDEN_TEXT.desc.awake, warden().desc);
    const pod = landALock();
    const burstsBefore = machine().bursts;
    check('DELETE starts on WARDEN.sys once scanned', actionDelete(h.store, warden()) === null);
    let deleting = 0;
    let ticks = 0;
    const startedAt = s().clock.aiSec;
    stepUntil(() => {
      if (residentFile(s()) === null) return true;
      ticks++;
      if (residentGhostSpec(s()) === RESIDENT_GHOST_DELETING) deleting++;
      return false;
    }, 30);
    const tookSec = s().clock.aiSec - startedAt;
    h.step();
    check(`…it takes about 6.0 s, firing RESIDENT_GHOST_DELETING meanwhile (${machine().bursts - burstsBefore} bursts in it)`,
      Math.abs(tookSec - 6) < 0.3 && deleting >= ticks - 2, `${tookSec.toFixed(2)} s, ${deleting}/${ticks} ticks deleting`);
    check('…then RESIDENT DELETED: every lock released, its last line, CONTROL\'s thanks, no more bursts or locks',
      machine().phase === 'deleted' && driver(pod).lockedBy === undefined && residentGhostSpec(s()) === null && machine().lockInSec === null
      && capabilitiesNow(s()).thrustCtrl.ghostBy === null && said('resident', 'WARDEN: TELL THEM I KEPT THEM SAFE.') && said('control', 'Thank you. :)')
      && JSON.stringify(events('resident-deleted', from)) === '[{"name":"WARDEN"}]'
      && events('resident-lock', from).some((p) => JSON.stringify(p) === JSON.stringify({ pod, phase: 'released' })));
    stepFor(45);
    check('…nothing more from it for 45 s', machine().locksLanded === 1 && lockedDrivers(s()).length === 0);
    const done = shipDone();
    check('SHIP DONE: WARDEN deleted', done.fate === 'deleted' && done.parked === 0 && done.decodes, JSON.stringify(done));
  }

  // --- REPAIR (part b): the cure ---------------------------------------------------------------------------------------------
  {
    const from = h.events.length;
    toGannet();
    check('REPAIR before a SCAN: SCAN IT FIRST', actionRepair(h.store, warden()) === 'SCAN IT FIRST');
    actionScan(h.store, warden());
    stepUntil(() => warden().scanned, 10);
    const pod = landALock();
    const charge = chargeLeft(s());
    const startedAt = s().clock.aiSec;
    check('REPAIR starts on WARDEN.sys once scanned', actionRepair(h.store, warden()) === null);
    stepUntil(() => machine().phase === 'cured', 30);
    const tookSec = s().clock.aiSec - startedAt;
    const spent = charge - chargeLeft(s());
    check(`…the cure: ${spent} charge in ${tookSec.toFixed(2)} s (04: about 12 in about 3.6)`, Math.abs(spent - 12) <= 1 && Math.abs(tookSec - 3.6) < 0.3);
    check('…`WARDEN: ...OH. THANK YOU. THE PODS ARE YOURS.`, every lock released, RESIDENT CURED; it stays in rack A and fires nothing',
      said('resident', 'WARDEN: ...OH. THANK YOU. THE PODS ARE YOURS.') && driver(pod).lockedBy === undefined && warden()?.integrity === INTEGRITY_MAX
      && residentGhostSpec(s()) === null && JSON.stringify(events('resident-cured', from)) === '[{"name":"WARDEN"}]');
    stepFor(45);
    check('…and neither bursts nor locks after it', machine().locksLanded === 1 && machine().lock === null && capabilitiesNow(s()).thrustCtrl.ghost === null);
    const done = shipDone();
    check('SHIP DONE: WARDEN cured', done.fate === 'cured' && done.decodes, JSON.stringify(done));
  }

  // --- The DEAL accepted, refused; not while HOLLOW's deal holds the ship (R8) -----------------------------------------------
  {
    const from = h.events.length;
    toGannet();
    const pod = landALock();
    const entry = openChoiceEntry(s());
    check('ACCEPT [Y]', entry !== null && machine().deal.phase === 'offered' && pickChoice(entry.id, 'ACCEPT'));
    h.step();
    check('…the named file (Repair.bak) is deleted at once, every lock released, `WARDEN: THE PODS ARE YOURS. GO AWAY.`; it goes quiet',
      !s().memory.some((seg) => seg.name === 'Repair.bak') && driver(pod).lockedBy === undefined && machine().phase === 'quiet'
      && machine().deal.outcome === 'accepted' && residentGhostSpec(s()) === null && said('resident', 'WARDEN: THE PODS ARE YOURS. GO AWAY.')
      && JSON.stringify(events('resident-deal', from)) === '[{"outcome":"accepted","fileName":"Repair.bak"}]');
    stepFor(60);
    check('…quiet for the ship: no bursts, no locks in 60 s', machine().locksLanded === 1 && machine().lock === null && capabilitiesNow(s()).thrustCtrl.ghost === null);
    check('…and HOLLOW\'s deal waits for a later ship (one deal per ship)', s().hollow.deal.phase === 'none');
    const done = shipDone();
    check('SHIP DONE: WARDEN paid', done.fate === 'paid' && done.decodes, JSON.stringify(done));
  }
  {
    toGannet();
    landALock();
    const lockIn = machine().lockInSec!;
    pickChoice(openChoiceEntry(s())!.id, 'REFUSE');
    h.step();
    check('REFUSE [N]: `WARDEN: THEN THEY STAY. THEY ALL STAY.`, angry: twice the bursts, the lock clock × 0.6',
      machine().deal.outcome === 'refused' && residentGhostSpec(s()) === RESIDENT_GHOST_ANGRY
      && Math.abs(machine().lockInSec! - lockIn * RESIDENT_ANGRY_LOCK_FACTOR) < 0.2, `${lockIn.toFixed(1)} → ${machine().lockInSec?.toFixed(1)}`);
  }
  {
    toGannet();
    h.store.update((draft) => { draft.hollow.deal.phase = 'done'; });
    landALock();
    stepFor(2);
    let threw = false;
    try { offerResidentDealNow(h.store); } catch { threw = true; }
    check('with HOLLOW\'s deal already this ship\'s, a locked pod brings no resident DEAL (R8)', machine().deal.phase === 'none' && openChoiceEntry(s()) === null && threw);
  }

  // --- SWAP does not stop it ----------------------------------------------------------------------------------------------------
  {
    toGannet();
    giveTools(h.store, ['swap']);
    const thrust = s().memory.find((seg) => seg.role === 'thrust-ctrl')!;
    const swapped = actionSwap(h.store, thrust);
    const holder = (): Segment | undefined => s().memory.find((seg: Segment) => seg.role === 'thrust-ctrl');
    stepUntil(() => holder()?.id !== thrust.id, 30);
    check('SWAP THRUST CTRL to Thrust.alt does not stop it: it still fires (ghostBy resident)', swapped === null && holder()?.id !== thrust.id
      && capabilitiesNow(s()).thrustCtrl.ghostBy === 'resident' && residentGhostSpec(s()) === RESIDENT_GHOST, `${swapped} ${holder()?.id}`);
  }

  // --- The late surprise: GANNET's card made `unknown` --------------------------------------------------------------------------
  {
    const from = h.events.length;
    toGannet((reserved) => { reserved.resident = { kind: 'corrupted', shown: 'unknown', name: 'WARDEN' }; });
    check('a surprise is dormant at the flight\'s start (04\'s grace), its file plain `The ship\'s own AI.`',
      machine().surprise && machine().phase === 'dormant' && warden().desc === 'The ship\'s own AI.' && residentGhostSpec(s()) === null);
    check('…and drawn as a plain ship file until it wakes (review M2: `hidden`, no amber edge)', warden().hidden === true
      && residentSegmentLook(warden())?.className.includes('res-corrupted') === false);
    stepUntil(() => machine().phase === 'awake', 300);
    check('…its wake clears `hidden`: amber from then on', warden().hidden === undefined && residentSegmentLook(warden())?.className.includes('res-corrupted') === true);
    check(`…it wakes at ${SURPRISE_WAKE_SEC} calm s: \`WARDEN: NOBODY REPORTED ME. GOOD.\`, no CONTROL line, its health shown at once (no SCAN hunt)`,
      Math.abs(machine().calmAiSec - SURPRISE_WAKE_SEC) < 0.25 && said('resident', 'WARDEN: NOBODY REPORTED ME. GOOD.')
      && !said('control', 'GANNET\'s onboard AI is reported faulty. Please delete it. :)') && warden().scanned
      && JSON.stringify(events('resident-wake', from)) === '[{"kind":"corrupted","name":"WARDEN","surprise":true}]', machine().calmAiSec.toFixed(2));
    giveTools(h.store, ['delete']);
    check('…DELETE needs no SCAN first', actionDelete(h.store, warden()) === null);
    stepUntil(() => machine().phase === 'deleted', 30);
    toGannet((reserved) => { reserved.resident = { kind: 'corrupted', shown: 'unknown', name: 'WARDEN' }; });
    stepUntil(() => machine().lock !== null, 300);
    check(`…its first lock comes at ${SURPRISE_FIRST_LOCK_SEC} calm s into the flight`, Math.abs(machine().calmAiSec - SURPRISE_FIRST_LOCK_SEC) < 0.25,
      machine().calmAiSec.toFixed(2));
  }

  // --- PROVIDENCE (slot 16, `unknown`): HOLLOW boards there, and it waits for HOLLOW's first fight -----------------------------
  {
    setLandingMode('manual');
    arrive([2, 5, 11, PROVIDENCE]);
    check('PROVIDENCE: PILOT, a surprise, on the ship HOLLOW boards', s().resident.def?.name === 'PILOT' && machine().surprise && s().run.threat.aboard,
      JSON.stringify(s().run.threat.current));
    stepFor(SURPRISE_WAKE_SEC + 10);
    check(`…past its ${SURPRISE_WAKE_SEC} s of grace it still sleeps while HOLLOW does (the loop has not closed)`,
      machine().phase === 'dormant' && !hollowFirstFightDecided(s()) && machine().calmAiSec > SURPRISE_WAKE_SEC);
    lockOn(h);
    let early = false;
    stepUntil(() => {
      if (machine().phase === 'awake' && !hollowFirstFightDecided(s())) early = true;
      return machine().phase === 'awake' || s().run.phase !== 'landing';
    }, 300);
    check('…it wakes once HOLLOW\'s first fight there is decided (here after ORBIT LOCK: in the landing, locking but never firing)',
      !early && machine().phase === 'awake' && hollowFirstFightDecided(s()) && said('resident', 'PILOT: NOBODY REPORTED ME. GOOD.')
      && residentGhostSpec(s()) === null, `woke at ${machine().wokeAtAi?.toFixed(1)}, phase ${s().run.phase}, hollow ${s().hollow.phase}`);
    setLandingMode('instant');
  }
  // Review m6: on a later ship HOLLOW is aboard (PROVIDENCE via CORMORANT: HOLLOW boarded there), it is not new, so the surprise
  // wakes at its grace with no wait for HOLLOW's fight.
  {
    arrive([2, 5, 11, 15, PROVIDENCE]);
    const boarded = s().run.threat.aboard && s().run.threat.age === 2;
    stepUntil(() => machine().phase === 'awake', 300);
    check(`m6: PROVIDENCE after CORMORANT (HOLLOW aboard since there, age 2): the surprise wakes at its ${SURPRISE_WAKE_SEC} s in flight`,
      boarded && s().run.phase === 'flight' && Math.abs(machine().calmAiSec - SURPRISE_WAKE_SEC) < 0.25,
      `age ${s().run.threat.age} · calm ${machine().calmAiSec.toFixed(2)} · ${s().run.phase}`);
  }
  // Review m5: HOLLOW's DEAL standing holds the lock clock, as its own DEAL does (Deviation 10).
  {
    toGannet();
    stepFor(2);
    h.store.update((draft) => { draft.hollow.deal.phase = 'offered'; });
    const before = { lockIn: machine().lockInSec, calm: machine().calmAiSec };
    stepFor(4);
    const held = machine().lockInSec === before.lockIn && machine().calmAiSec === before.calm;
    h.store.update((draft) => { draft.hollow.deal.phase = 'none'; });
    stepUntil(() => machine().calmAiSec > before.calm, 30);
    check('m5: while HOLLOW\'s DEAL stands, WARDEN\'s calm and lock clocks stand still; they run again once it is gone',
      held && machine().calmAiSec > before.calm && (machine().lockInSec ?? 0) < (before.lockIn ?? 0), JSON.stringify(before));
  }
});

finish();
