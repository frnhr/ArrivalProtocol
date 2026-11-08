// Slice 5 Track WARDEN (docs/phase3/impl/slice-5-plan.md §7.1): the corrupted resident's pure model, on run 1's GANNET (seed
// 7, slot 9: WARDEN, `reported faulty`, 7 pods) built store-free (support/residents armShipSlices) with the kind raised:
// • the ghost source (residentGhostSpec) in every phase, in the landing (R4), deleting (an op on the ops core), angry; the
//   composite's choice and ghostBy against a healthy and a failing Thrust Ctrl, controllerGhost kept (review M5);
// • the pushes (R3, slice 8 §2.5): the resident's under the arm's failing controller (48%), DELETING over it, ANGRY over a degraded one;
// • the lock cap ceil(pods ÷ 4) ≤ 3; the lock's live text; the THRUST CTRL pip's override and jump (review B2);
// • the DEAL's file: hollow.ts rmTargets' first (imported since the review fix pass, M4), and its word;
// • the tool rules (R25): SCAN IT FIRST, MOVE and COPY refused, the tools' own rules after a SCAN; SCAN on the driver a lock
//   aims at (and on no other); DELETE 6.0 s with its own confirm; the cure's price, 12 charge in 3.6 s.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { ResidentSegment, Segment, DriverSegment } from '@/types/segment';
import { createInitialState } from '@state/initial';
import { withResidentsBuilt, armShipSlices } from '../support/residents';
import {
  residentGhostSpec, residentFile, lockCap, liveLockText, lockAimsAt, engineOverriddenBy, corruptedAwake, residentDealOnThisShip,
} from '@state/resident-selectors';
import { corruptedToolRule, corruptedDeleteQuestion } from '@systems/resident-corrupted';
import { residentToolRule, residentDeleteSec } from '@systems/residents';
import { capabilitiesNow, ghostPush, ghostWithoutSwap } from '@systems/capabilities';
import { targetRefusal, deleteQuestion } from '@systems/tool-targets';
import { rmTargets } from '@systems/hollow';
import { debrisDamagePlan, beltTarget } from '@systems/zones';
import { createRng } from '@systems/rng';
import { deleteSec, chargePerPoint, repairRatePerSec } from '@state/actions';
import { windowPip } from '@systems/flight-hud';
import { ghostCountShown } from '@systems/ghost-thrust';
import { TOOL_REFUSAL, type ToolRefusal } from '@data/tool-text';
import { WARDEN_TEXT } from '@data/warden-text';
import type { FsToolKind } from '@/types/fs-tool';
import {
  RESIDENT_GHOST, RESIDENT_GHOST_DELETING, RESIDENT_GHOST_ANGRY, ARM_GHOST_BY_BAND, INTEGRITY_MAX, RESIDENT_START_INTEGRITY,
} from '@data/tuning';

const SEED = 7;
const GANNET = 9;

// GANNET as the beam builds it, in flight, its resident in `phase`.
function gannet(edit: (state: GameState) => void = () => {}): GameState {
  const { run, slices } = withResidentsBuilt(['corrupted'], () => armShipSlices(SEED, GANNET));
  const state = { ...createInitialState({ seed: SEED }), ...slices, run: { ...run, phase: 'flight' } } as GameState;
  edit(state);
  return state;
}
const awake = (state: GameState): void => { state.resident.corrupted!.phase = 'awake'; };
const wardenOf = (state: Readonly<GameState>): ResidentSegment => residentFile(state)!;
const thrustOf = (state: GameState): Segment => state.memory.find((seg) => seg.role === 'thrust-ctrl')!;

// --- The ghost source (R4, R5, §2.7 step 3) --------------------------------------------------------------------------------
{
  const dormant = gannet();
  check('GANNET: WARDEN.sys in rack A at 40%, its health hidden, the machine dormant, no spec before its wake',
    wardenOf(dormant).integrity === RESIDENT_START_INTEGRITY && !wardenOf(dormant).scanned && dormant.resident.corrupted!.phase === 'dormant'
    && residentGhostSpec(dormant) === null && !corruptedAwake(dormant) && !residentDealOnThisShip(dormant));
  const up = gannet(awake);
  const ctrl = capabilitiesNow(up).thrustCtrl;
  check('awake in flight: it fires RESIDENT_GHOST, the composite\'s source (a healthy controller fires nothing)',
    residentGhostSpec(up) === RESIDENT_GHOST && ctrl.ghost === RESIDENT_GHOST && ctrl.ghostBy === 'resident' && ctrl.controllerGhost === null
    && !ghostWithoutSwap(up));
  const angry = gannet((state) => { awake(state); state.resident.corrupted!.angryUntilAi = state.clock.aiSec + 5; });
  const calmAgain = gannet((state) => { awake(state); state.resident.corrupted!.angryUntilAi = state.clock.aiSec - 0.1; });
  check('…angry (a REFUSE or a timeout): RESIDENT_GHOST_ANGRY until angryUntilAi, then RESIDENT_GHOST again',
    residentGhostSpec(angry) === RESIDENT_GHOST_ANGRY && residentGhostSpec(calmAgain) === RESIDENT_GHOST);
  const none = (['quiet', 'deleted', 'cured'] as const).map((phase) => gannet((state) => { state.resident.corrupted!.phase = phase; }));
  check('…quiet (an ACCEPT), deleted or cured: no spec', none.every((state) => residentGhostSpec(state) === null));
  const landing = gannet((state) => { awake(state); state.run.phase = 'landing'; });
  check('…never in the landing (R4: the arm\'s limp rule), though it is still awake', residentGhostSpec(landing) === null && corruptedAwake(landing)
    && capabilitiesNow(landing).thrustCtrl.ghost === null);
  const flat = gannet((state) => { awake(state); wardenOf(state).integrity = 0; });
  check('…nor from a file at 0%', residentGhostSpec(flat) === null);
  const failing = gannet((state) => { awake(state); (thrustOf(state) as { integrity: number }).integrity = 30; });
  // Slice 8 (§2.5): at amp 0.10 an angry resident (95% of a failing controller) no longer outpushes a failing one, so the
  // composite's resident branch is checked against a degraded controller (Thrust Ctrl 60%: 0.0075 per tac s).
  const failingAngry = gannet((state) => {
    awake(state);
    (thrustOf(state) as { integrity: number }).integrity = 60;
    state.resident.corrupted!.angryUntilAi = state.clock.aiSec + 5;
  });
  const f = capabilitiesNow(failing).thrustCtrl;
  const fa = capabilitiesNow(failingAngry).thrustCtrl;
  check('a failing Thrust Ctrl outpushes it (the composite fires the controller\'s); angry, the resident outpushes a degraded controller, '
    + 'and controllerGhost keeps the controller\'s for the SWAP-only readers (review M5)',
    f.ghostBy === 'controller' && f.ghost === ARM_GHOST_BY_BAND.failing && fa.ghostBy === 'resident' && fa.ghost === RESIDENT_GHOST_ANGRY
    && fa.controllerGhost === ARM_GHOST_BY_BAND.degraded && ghostWithoutSwap(failingAngry) === ghostWithoutSwap(failing),
    `${f.ghostBy} ${fa.ghostBy}`);
  const ratio = ghostPush(RESIDENT_GHOST) / ghostPush(ARM_GHOST_BY_BAND.failing!);
  check(`R3, slice 8 §2.5: its push is ${(ratio * 100).toFixed(0)}% of the arm's failing controller's (about half); DELETING pushes harder than it, ANGRY twice its own`,
    ratio < 1 && Math.abs(ratio - 0.476) < 0.01 && ghostPush(RESIDENT_GHOST_DELETING) > ghostPush(ARM_GHOST_BY_BAND.failing!)
    && ghostPush(RESIDENT_GHOST_ANGRY) > ghostPush(ARM_GHOST_BY_BAND.degraded!) && ghostPush(RESIDENT_GHOST_ANGRY) === 2 * ghostPush(RESIDENT_GHOST),
    `${ghostPush(RESIDENT_GHOST).toFixed(4)} / ${ghostPush(ARM_GHOST_BY_BAND.failing!).toFixed(4)}`);
}

// --- The locks: the cap, the live text, the SCAN on its driver ------------------------------------------------------------
{
  const withPods = (n: number): GameState => gannet((state) => { state.landing.pods = state.landing.pods.slice(0, 1).concat(Array.from({ length: n - 1 }, () => state.landing.pods[0]!)); });
  check('the cap: ceil(pods ÷ 4), never more than 3 (GANNET\'s 7 pods: 2; a TIGHT ship\'s 8: 2; 9: 3; 16: 3; 4: 1)',
    lockCap(gannet()) === 2 && lockCap(withPods(8)) === 2 && lockCap(withPods(9)) === 3 && lockCap(withPods(16)) === 3 && lockCap(withPods(4)) === 1);
  const driver = (state: Readonly<GameState>, pod: number): DriverSegment => state.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === pod)!;
  const aiming = gannet((state) => {
    awake(state);
    state.resident.corrupted!.lock = { pod: 1, segId: driver(state, 1).id, leftSec: 2.3, totalSec: 3, entryId: 1 };
  });
  check('a lock\'s live text counts its own clock (`> LOCK POD 01 ... 3` at 2.3 s), null with none counting',
    liveLockText(aiming) === '> LOCK POD 01 ... 3' && liveLockText(gannet(awake)) === null, `${liveLockText(aiming)}`);
  const scan = (state: GameState, pod: number): ToolRefusal | null => targetRefusal(driver(state, pod), { state, activeKind: 'scan', pickedSource: null });
  check('SCAN takes the driver a lock counts down on (the cheap block, 04 §3.12), and still refuses every other driver',
    lockAimsAt(aiming, driver(aiming, 1).id) && scan(aiming, 1) === null && scan(aiming, 2) === TOOL_REFUSAL.driverScan
    && scan(gannet(awake), 1) === TOOL_REFUSAL.driverScan);
}

// --- The THRUST CTRL pip (review B2) and the counter ----------------------------------------------------------------------
{
  const fired = gannet((state) => { awake(state); state.resident.corrupted!.bursts = 3; state.burn.ghostBursts = 3; });
  const pip = windowPip(fired, 'thrust-ctrl');
  check('the THRUST CTRL pip, once it has fired: OVERRIDDEN · WARDEN.sys, a click jumps to WARDEN.sys, FIRED ×3 (its own bursts)',
    pip.override === WARDEN_TEXT.pipOverride('WARDEN') && pip.override === 'OVERRIDDEN · WARDEN.sys' && pip.jumpId === wardenOf(fired).id
    && pip.count === 'FIRED ×3' && ghostCountShown(fired) === 3 && engineOverriddenBy(fired)?.name === 'WARDEN', JSON.stringify(pip));
  const healthyPip = windowPip(gannet((state) => {
    awake(state);
    state.resident.corrupted!.bursts = 1;
    state.burn.ghostBursts = 1;
    const thrust = thrustOf(state);
    if (thrust.type === 'ship') thrust.scanned = true;
  }), 'thrust-ctrl');
  check('…a scanned, healthy controller still reads 100% beside the override (a mind, not a fault)', healthyPip.reading === '100%' && healthyPip.look === 'ok',
    JSON.stringify(healthyPip));
  const quiet = [gannet(awake), gannet((state) => { state.resident.corrupted!.phase = 'deleted'; state.resident.corrupted!.bursts = 4; })];
  check('…no override before its first burst, nor once it stops; other pips never carry one',
    quiet.every((state) => windowPip(state, 'thrust-ctrl').override === null && windowPip(state, 'thrust-ctrl').jumpId === null)
    && windowPip(fired, 'engine-io').override === null);
  const mixed = gannet((state) => { awake(state); state.resident.corrupted!.bursts = 2; state.burn.ghostBursts = 5; });
  const ctrlFires = gannet((state) => {
    state.resident.corrupted!.phase = 'deleted';
    state.resident.corrupted!.bursts = 2;
    state.burn.ghostBursts = 5;
    (thrustOf(state) as { integrity: number }).integrity = 30;
  });
  check('the counter counts the source firing now: the resident\'s own while it fires, the controller\'s (the rest) after',
    ghostCountShown(mixed) === 2 && ghostCountShown(ctrlFires) === 3);
}

// --- The DEAL's file: hollow.ts rmTargets' first (plan R8; review M4: the copy is gone) --------------------------------------
{
  const g = gannet();
  const named = rmTargets(g.memory, [])[0];
  check('…a fresh unit on GANNET (its Scan only) has no spare and no card: it names the ship\'s backup, Thrust.alt; a spare tool is named by '
    + 'its chip (`WARDEN: GIVE ME YOUR SPARE REPAIR. THEN I LET THE PODS GO.`)',
    named?.name === 'Thrust.alt' && WARDEN_TEXT.deal('WARDEN', WARDEN_TEXT.dealSpare('repair')) === 'WARDEN: GIVE ME YOUR SPARE REPAIR. THEN I LET THE PODS GO.',
    named?.name ?? 'none');
}

// --- Review m7: no zone lowers WARDEN.sys (rack A, which the radiation belt peppers) ----------------------------------------
{
  const g = gannet(awake);
  const id = wardenOf(g).id;
  const debris = debrisDamagePlan(g.memory, 'A');
  let picks = 0;
  let wardenPicked = false;
  for (let seed = 1; seed <= 200; seed++) {
    const pick = beltTarget(g.memory, ['A', 'B'], createRng(seed));
    if (pick !== null) picks++;
    if (pick?.id === id) wardenPicked = true;
  }
  check('m7: a debris hit on rack A and the belt\'s picks in racks A–B never touch WARDEN.sys (its health is the cure\'s price only)',
    debris.length > 0 && !debris.some((hit) => hit.segId === id) && picks > 0 && !wardenPicked, `${debris.length} debris hits, ${picks} belt picks`);
}

// --- The tools (R25) ---------------------------------------------------------------------------------------------------------
{
  const state = gannet(awake);
  const warden = wardenOf(state);
  const rule = (seg: ResidentSegment, kind: FsToolKind, at: GameState = state): ToolRefusal | null => corruptedToolRule(seg, { state: at, activeKind: kind, pickedSource: null });
  const full = (seg: Segment, kind: FsToolKind, at: GameState = state): ToolRefusal | null => targetRefusal(seg, { state: at, activeKind: kind, pickedSource: null });
  check('before a SCAN: SCAN IT FIRST for DELETE and REPAIR; SCAN works; MOVE and COPY refused (IT WON\'T BE MOVED, ONE OF IT IS ENOUGH)',
    full(warden, 'delete') === TOOL_REFUSAL.scanFirst && full(warden, 'repair') === TOOL_REFUSAL.scanFirst && full(warden, 'scan') === null
    && full(warden, 'move') === TOOL_REFUSAL.residentMove && full(warden, 'copy') === TOOL_REFUSAL.residentCopy
    && rule(warden, 'scan') === null && residentToolRule(warden, { state, activeKind: 'delete', pickedSource: null }) === TOOL_REFUSAL.scanFirst);
  const seen = gannet((at) => { awake(at); wardenOf(at).scanned = true; });
  const cured = gannet((at) => { wardenOf(at).scanned = true; wardenOf(at).integrity = INTEGRITY_MAX; });
  check('…once scanned: DELETE and REPAIR are the tools\' own (REPAIR\'s charge, ALREADY 100% once mended)',
    full(wardenOf(seen), 'delete', seen) === null && full(wardenOf(seen), 'repair', seen) === null
    && full(wardenOf(cured), 'repair', cured) === TOOL_REFUSAL.healthy && full(wardenOf(seen), 'move', seen) === TOOL_REFUSAL.residentMove);
  const question = deleteQuestion(state, warden);
  check('DELETE takes 6.0 s (1.0 + 0.5 × 10) and asks `DELETE WARDEN.sys? It is the ship\'s own mind.` (its case kept)',
    deleteSec(warden) === 6 && residentDeleteSec(warden) === 6 && question?.question === 'DELETE WARDEN.sys?'
    && question.detail === 'It is the ship\'s own mind.' && corruptedDeleteQuestion(state, warden).question === question.question, JSON.stringify(question));
  const points = INTEGRITY_MAX - RESIDENT_START_INTEGRITY;
  const charge = points * chargePerPoint(warden.size);
  const sec = points / repairRatePerSec(warden.size, 1);
  check(`the cure: REPAIR v1 from 40% costs ${charge.toFixed(1)} charge in ${sec.toFixed(2)} s (04: about 12, against a 6 s DELETE)`,
    Math.abs(charge - 12) < 1e-9 && Math.abs(sec - 3.6) < 1e-9);
}

finish();
