// WP7: HollowDef gained `story` and the timed wake `coastLeadSec` (HALCYON's coast-tied wake); the
// fixtures below spell them out (no story, no coast lead: the WP6 behaviour they test).
// WP6 edge cases (§9 WP6 "Edge cases", items 4, 5, 7, 8 and the WP3 TODO on a consumed clone), on
// the live systems through the harness:
// • consume mid-repair: the repair is aborted, the charge it spent stays spent, the cluster did not wake;
// • a MOVE's clone eaten where it was being written: the jump's source comes back online (the cluster
//   is NOT lost), the slide's file is gone (lost), the reserved space is handed back, memory stays
//   valid; a jump's source eaten: the half-written clone goes, the cluster is lost;
// • a COPY eaten mid-write: the original keeps running; a bite on a moving file travels with it;
// • a print and a bite in the same tick: the printer ticks first, the print wins;
// • refusals: MOVE on an infected file, REPAIR on an infected ship file, DELETE on the root (LOCKED)
//   and on an eaten block (allowed, 1.0 + 0.5 s per block, the gap comes back);
// • the eaten alarm's hysteresis (raise ≤ 10 s, clear only past 21 s or when won);
// • the Core: CORE INFECTED is an alarm; at 0 the ship is lost (CORE LOST card), no resume;
// • a ship file being eaten asks for SWAP or DELETE, not REPAIR;
// • HOLLOW names itself (WP7's beat): every block and the TERMINAL tag read UNIT-046;
// • a world reset in the middle of a fight leaves nothing behind;
// • (review round 1) a copy eaten while it was written echoes COPY GONE and is no lost soul; HOLLOW's
//   alerts go when the ship ends (a crash, CORE LOST); the eaten countdown never jumps on SPACE.
import { check, finish } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { infectNow, nameHollow, coreInfected, secondsToEaten } from '@systems/hollow';
import { endFlight, isThrustOn } from '@systems/orbit-sim';
import { isHollowAlert } from '@systems/alerts';
import { actionRepair, actionMove, actionCopy, actionDelete, actionRefusal, deleteSec } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { installTool } from '@systems/licences';
import { setPrintNext } from '@systems/printer';
import { setPaused, isLivePhase } from '@systems/clock';
import { lineVars, speakerTag } from '@data/script';
import { getPrediction } from '@systems/predict';
import { getRedundancy, getByRole, getAiCore, soulsInMemory } from '@state/selectors';
import { segmentStarts } from '@systems/memory-ops';
import { TOOL_REFUSAL } from '@data/tool-text';
import type { HollowDef } from '@data/ships';
import type { Segment, FreeSegment, HollowSegment } from '@/types/segment';
import { DELETE_HOLLOW_BASE_SEC, DELETE_HOLLOW_PER_BLOCK_SEC } from '@data/tuning';

const h = createHarness6(1, { soulsFound: true });
const state = () => h.store.getState();
const mem = (): Segment[] => state().memory;

// A hungry HOLLOW for the structural cases: no spread, a drain no repair can beat (tests only:
// validateHollowDef would refuse it on a ship), so an infected file is eaten within a second.
const HUNGRY: HollowDef = { wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: null, drainPerSec: 200, burnMult: 1, printMult: 1, seed: null, verbs: null, deal: false, story: 'none' };

function fresh(cfg?: HollowDef): void {
  h.resetTo('flight');
  h.noFault();
  for (const kind of ['repair', 'move', 'copy', 'delete'] as const) installTool(h.store, kind);
  // Dormant: no scripted bite at the loop closing; only what a test infects.
  h.store.update((d) => {
    if (cfg) d.hollow.cfg = cfg;
    d.hollow.phase = 'dormant';
  });
}

const freeAfter = (seg: Segment): FreeSegment => {
  const index = mem().indexOf(seg);
  const next = mem()[index + 1];
  if (!next || next.type !== 'free') throw new Error(`no free space after ${seg.name}`);
  return next;
};
const lostClusters = (): string[] => state().souls.results.filter((result) => result.outcome === 'lost').map((result) => result.cluster);
// HOLLOW's echoes since `fromId`, and the soul flag of the hollow-consume events since `fromEvent`.
const hollowLines = (fromId: number): string[] => h.log().filter((entry) => entry.id > fromId && entry.speaker === 'hollow').map((entry) => entry.text);
const consumeSouls = (fromEvent: number): boolean[] => h.events.slice(fromEvent).filter((event) => event.name === 'hollow-consume')
  .map((event) => (event.payload as { soul: boolean }).soul);
const lastLogId = (): number => h.log().at(-1)?.id ?? 0;

// --- Consume mid-repair -----------------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 40 });
  const c11 = h.soul('C11');
  infectNow(h.store, c11);
  h.step();
  const chargeBefore = getRedundancy(state())!.used;
  const started = actionRepair(h.store, c11) === null;
  // Net loss 40 − 18.5 = 21.5 points/s: eaten about 4.6 s into the repair.
  h.stepFor(6);
  const spent = chargeBefore - getRedundancy(state())!.used;
  check('consume mid-repair (a drain the heal can\'t beat): the repair is aborted, the cluster is hollow, C11 did not wake',
    started && getOps().length === 0 && h.maybeSoul('C11') === null && lostClusters().includes('C11'), `lost: ${lostClusters()}`);
  check('…the charge it spent stays spent', spent > 0, `${spent} spent`);
  h.checkMemory();
}

// --- REPAIR on a file bitten this very tick (still 100%) ------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2 });
  const c11 = h.soul('C11');
  infectNow(h.store, c11);
  const refusal = actionRefusal(state(), 'repair', c11);
  const started = actionRepair(h.store, c11) === null;
  h.step();
  check('a file bitten this very tick (still 100%) can be repaired, and the repair wins at once (cured, recoiling)',
    refusal === null && started && !c11.infected && c11.recoilUntilAi !== undefined && c11.integrity === 100);
}

// --- MOVE: the clone eaten where it is written (jump) ---------------------------------------------------
{
  fresh(HUNGRY);
  const c01 = h.soul('C01');
  const root = mem().find((seg): seg is HollowSegment => seg.type === 'hollow' && seg.root)!;
  const gap = freeAfter(root);
  const startsBefore = segmentStarts(mem())[mem().indexOf(c01)];
  const moved = actionMove(h.store, c01, { regionSegIds: [gap.id], col: 0 }) === null;
  const clone = mem().find((seg) => seg.type === 'soul' && seg.cluster === 'C01' && seg !== c01)!;
  const logFrom = lastLogId();
  const eventFrom = h.events.length;
  infectNow(h.store, clone);
  h.stepFor(1);
  const after = h.maybeSoul('C01');
  check('jump MOVE, clone eaten mid-write: the move is aborted, C01 is back online where it was, NOT lost',
    moved && getOps().length === 0 && after === c01 && after.state !== 'transferring' && !after.operating
      && segmentStarts(mem())[mem().indexOf(c01)] === startsBefore && !lostClusters().includes('C01'), `lost: ${lostClusters()}`);
  const block = mem()[mem().indexOf(root) + 1]!;
  check('…the clone\'s blocks are HOLLOW\'s now (next to the root), the reserved space is free again (no reservation left)',
    block.type === 'hollow' && !block.root && mem().every((seg) => seg.type !== 'free' || seg.reservedBy === undefined));
  check('…HOLLOW echoes `> eat c01 ... COPY GONE` (C01 lives on), and the eaten event is no lost soul (no soulLost sweep)',
    hollowLines(logFrom).includes('> eat c01 ... COPY GONE   [user: ???]') && consumeSouls(eventFrom).join() === 'false',
    `${hollowLines(logFrom).join(' | ')}; soul ${consumeSouls(eventFrom).join()}`);
  h.checkMemory();
}

// --- MOVE: the source eaten mid-move (jump) -----------------------------------------------------------
{
  fresh(HUNGRY);
  const c01 = h.soul('C01');
  const biggest = mem().filter((seg): seg is FreeSegment => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
  actionMove(h.store, c01, { regionSegIds: [biggest.id], col: biggest.size - c01.size });
  const logFrom = lastLogId();
  const eventFrom = h.events.length;
  infectNow(h.store, c01);
  h.stepFor(1);
  check('jump MOVE, source eaten mid-move: the half-written clone goes, C01 is lost (no copy left)',
    getOps().length === 0 && h.maybeSoul('C01') === null && lostClusters().includes('C01')
      && soulsInMemory(state()).length === 11, `${soulsInMemory(state()).length} clusters`);
  check('…HOLLOW echoes `> eat c01 ... DID NOT WAKE`, and the eaten event is a lost soul',
    hollowLines(logFrom).includes('> eat c01 ... DID NOT WAKE   [user: ???]') && consumeSouls(eventFrom).join() === 'true',
    `${hollowLines(logFrom).join(' | ')}; soul ${consumeSouls(eventFrom).join()}`);
  h.checkMemory();
}

// --- MOVE: the only copy eaten mid-slide ---------------------------------------------------------------
{
  fresh(HUNGRY);
  const c06 = h.soul('C06');  // rack B's last cluster: 16 free blocks to its right
  const gap = freeAfter(c06);
  actionMove(h.store, c06, { regionSegIds: [c06.id, gap.id], col: 4 });
  const slid = mem().find((seg) => seg.type === 'soul' && seg.cluster === 'C06')!;
  infectNow(h.store, slid);
  h.stepFor(1);
  check('slide MOVE, the file eaten mid-slide: it was the only copy, so C06 is gone (lost), reservations released',
    getOps().length === 0 && h.maybeSoul('C06') === null && lostClusters().includes('C06')
      && mem().every((seg) => seg.type !== 'free' || seg.reservedBy === undefined));
  h.checkMemory();
}

// --- COPY eaten mid-write ------------------------------------------------------------------------------------
{
  fresh(HUNGRY);
  const telemetry = getByRole(state(), 'telemetry')!;
  const biggest = mem().filter((seg): seg is FreeSegment => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
  actionCopy(h.store, telemetry, { regionSegIds: [biggest.id], col: 0 });
  const copy = mem().find((seg) => seg.name === 'Telemetry.cp')!;
  const logFrom = lastLogId();
  infectNow(h.store, copy);
  h.stepFor(1);
  check('COPY eaten mid-write: the op is aborted, the original Telemetry runs on (not operating), the copy is hollow',
    getOps().length === 0 && !telemetry.operating && mem().includes(telemetry)
      && mem().some((seg) => seg.type === 'hollow' && seg.ate === 'Telemetry.cp'));
  check('…HOLLOW echoes `> eat telemetry.cp ... COPY GONE`', hollowLines(logFrom).includes('> eat telemetry.cp ... COPY GONE   [user: ???]'),
    hollowLines(logFrom).join(' | '));
  h.checkMemory();
}

// --- A bite on a moving file travels with it ---------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2 });
  const c01 = h.soul('C01');
  const biggest = mem().filter((seg): seg is FreeSegment => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
  actionMove(h.store, c01, { regionSegIds: [biggest.id], col: biggest.size - c01.size });
  h.stepFor(0.5);
  infectNow(h.store, c01);
  h.runOps();
  const landed = h.soul('C01');
  check('a jump MOVE whose source is bitten on the way lands infected, with the bite\'s damage (a move never heals)',
    landed !== c01 && landed.infected !== undefined && landed.integrity < 100, `${landed.integrity.toFixed(1)}%`);
  h.checkMemory();
}

// --- A print and a bite in the same tick ---------------------------------------------------------------------------
{
  fresh({ wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: 25, drainPerSec: 2, burnMult: 2, printMult: 1, seed: null, verbs: null, deal: false, story: 'none' });
  h.startPrinting(1);
  h.step();
  setPrintNext(h.store, 'C12');
  h.store.update((d) => {
    d.hollow.phase = 'awake';
    d.hollow.biteInSec = 0.01;
    d.printer.progress = 0.999;
    d.printer.waitAiSec = 0;
  });
  h.step();
  const printed = state().souls.results.find((result) => result.cluster === 'C12');
  check('a print and a bite in the same tick: the printer ticks first, C12 prints (woke) and is never bitten',
    printed?.outcome === 'woke' && !h.events.some((event) => event.name === 'hollow-infect'
      && (event.payload as { segId: string }).segId === 'soul_c12'), printed?.outcome);
}

// --- Refusals ---------------------------------------------------------------------------------------------------------------
{
  fresh(HUNGRY);
  const c11 = h.soul('C11');
  infectNow(h.store, c11);
  check('MOVE on an infected cluster: STILL INFECTED — REPAIR FIRST', actionRefusal(state(), 'move', c11) === TOOL_REFUSAL.infected);
  const cargo = getByRole(state(), 'cargo')!;
  infectNow(h.store, cargo);
  check('REPAIR on an infected ship file: SHIP FILES CAN\'T BE HEALED — SWAP OR DELETE IT', actionRefusal(state(), 'repair', cargo) === TOOL_REFUSAL.shipFile);
  const root = mem().find((seg): seg is HollowSegment => seg.type === 'hollow' && seg.root)!;
  check('DELETE on the root: LOCKED; REPAIR on it: LOCKED', actionRefusal(state(), 'delete', root) === TOOL_REFUSAL.locked
    && actionRefusal(state(), 'repair', root) === TOOL_REFUSAL.locked);
  h.stepFor(1);
  const eaten = mem().find((seg): seg is HollowSegment => seg.type === 'hollow' && seg.ate === 'C11 · FONTAINE')!;
  check('an eaten block: REPAIR / MOVE refused (THIS FILE WAS EATEN — ONLY DELETE WORKS), DELETE allowed',
    actionRefusal(state(), 'repair', eaten) === TOOL_REFUSAL.eaten && actionRefusal(state(), 'move', eaten) === TOOL_REFUSAL.eaten
      && actionRefusal(state(), 'delete', eaten) === null);
  const expected = DELETE_HOLLOW_BASE_SEC + DELETE_HOLLOW_PER_BLOCK_SEC * eaten.size;
  const deleted = actionDelete(h.store, eaten) === null;
  const took = h.runOps();
  check(`DELETE on an eaten 8-block block takes ${expected} s and gives the gap back`, deleted && deleteSec(eaten) === expected
    && Math.abs(took - expected) < 0.1 && !mem().includes(eaten), `${took.toFixed(2)} s`);
  h.checkMemory();
}

// --- The eaten alarm's hysteresis -----------------------------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2 });
  h.startPrinting(1);
  h.step();
  const c12 = h.soul('C12');
  infectNow(h.store, c12);
  const up = (): boolean => state().alerts.list.some((alert) => alert.id === 'eaten:C12');
  h.store.update(() => { c12.integrity = 30; });   // 15 s out at 2/s: no alarm yet
  h.step();
  const before = up();
  h.store.update(() => { c12.integrity = 18; });   // 9 s out: alarm
  h.step();
  const raised = up();
  h.store.update(() => { c12.integrity = 36; });   // 18 s out: stays up (≤ 21)
  h.step();
  const held = up();
  h.store.update(() => { c12.integrity = 46; });   // 23 s out: cleared
  h.step();
  check('the eaten alarm: not at 15 s out, up at 9 s, still up at 18 s (hysteresis), cleared at 23 s',
    !before && raised && held && !up(), `${before} ${raised} ${held} ${up()}`);
  h.store.update(() => { c12.integrity = 10; });
  h.step();
  const again = up();
  actionRepair(h.store, c12);
  h.step();
  check('…and a repair that is winning clears it at once (the projection is infinite)', again && !up());
}

// --- The Core -----------------------------------------------------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2 });
  const core = getAiCore(state())!;
  infectNow(h.store, core);
  h.stepFor(0.5);
  check('CORE INFECTED on the opening crash course: an alarm that holds SKIP, but the strip keeps DON\'T HIT THE PLANET',
    coreInfected(state()) && state().alerts.list.some((alert) => alert.id === 'core-infected' && alert.severity === 'alarm' && alert.inhibitsSkip)
      && h.shown()?.source === 'flight' && /^DON'T HIT THE PLANET/.test(h.shown()?.text ?? ''), h.shown()?.text);
  h.startPrinting(1);
  h.stepFor(0.5);
  check('…off the crash course (printing), from amber: CORE INFECTED — [TAB], REPAIR THE CORE', h.shown()?.id === 'alarm-core-tab', h.shown()?.text);
  h.store.update(() => { core.integrity = 0.04; });
  h.stepFor(0.5);
  check('the Core eaten to 0 (while printing): the ship is lost (CORE LOST), the clock stops, no resume, the Core is still the Core',
    state().run.coreLost && state().clock.paused && !isLivePhase(state()) && !setPaused(h.store, false)
      && getAiCore(state()) === core && core.integrity === 0 && h.events.some((event) => event.name === 'core-lost'));
  check('…the strip says CORE LOST', h.shown()?.id === 'over-core-lost' && h.shown()?.text === 'CORE LOST', h.shown()?.text);
  check('…and HOLLOW\'s alarms are gone with the ship (no red vignette under the CORE LOST card)',
    !state().alerts.list.some(isHollowAlert), state().alerts.list.map((alert) => alert.id).join());
}

// --- A ship that crashes with HOLLOW's alarm up ----------------------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2 });
  const c12 = h.soul('C12');
  infectNow(h.store, c12);
  h.store.update(() => { c12.integrity = 12; });   // 6 s out at the burn's drain: the alarm
  h.step();
  const before = state().alerts.list.filter(isHollowAlert).map((alert) => alert.id).join();
  endFlight(h.store, 'crashed');
  h.stepFor(1);
  check('a crash with C12\'s alarm up: HOLLOW\'s alerts go with the flight (paused under the LOST card, no vignette)',
    before === 'hollow-infected,eaten:C12' && state().clock.paused && !state().alerts.list.some(isHollowAlert),
    `before: ${before}; after: ${state().alerts.list.map((alert) => alert.id).join()}`);
}

// --- The eaten countdown never jumps on SPACE (§2 pillar 5) ----------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2, burnMult: 2 });
  const c12 = h.soul('C12');
  infectNow(h.store, c12);
  h.store.update(() => { c12.integrity = 30; });
  h.step();
  const coasting = secondsToEaten(state(), c12);
  h.keyDown('Space');
  h.stepFor(0.5);
  const firing = isThrustOn(state());
  const burning = secondsToEaten(state(), c12);
  h.keyUp('Space');
  h.stepFor(0.5);
  const after = secondsToEaten(state(), c12);
  // Falling by at most the time that passed (+ a tick) is a countdown; anything else is a jump.
  const fell = (from: number, to: number): boolean => to <= from + 1e-9 && from - to <= 0.5 + 0.06;
  check('in flight WILL BE EATEN projects the burn\'s drain: coasting 30% reads 0:07, and SPACE only changes how fast it falls',
    firing && Math.abs(coasting - 29.9 / 4) < 0.05 && fell(coasting, burning) && fell(burning, after) && burning - after < coasting - burning,
    `coasting ${coasting.toFixed(2)}, after 0.5 s burning ${burning.toFixed(2)}, after 0.5 s coasting ${after.toFixed(2)}, firing ${firing}`);
}

// --- A ship file being eaten -----------------------------------------------------------------------------------------------------
{
  fresh({ ...HUNGRY, drainPerSec: 2 });
  h.startPrinting(1);
  h.step();
  infectNow(h.store, getByRole(state(), 'cargo')!);
  h.stepFor(0.5);
  // Final fix pass (final review): the line names the one move that works. Cargo Ctrl has no backup, so not SWAP: DELETE
  // (licensed here) cuts it out of the chain. SWAP is named only for a ship file with a clean backup and SWAP in hand.
  check('a ship file being eaten (after the lock, in amber): SOMETHING IS EATING CARGO CTRL — [TAB], DELETE IT',
    h.shown()?.text === 'SOMETHING IS EATING CARGO CTRL — [TAB], DELETE IT', h.shown()?.text);
}

// --- HOLLOW names itself ----------------------------------------------------------------------------------------------------------
{
  fresh();
  const vars = (): ReturnType<typeof lineVars> => lineVars(state(), getPrediction());
  const before = vars().hollow;
  nameHollow(h.store);
  const blocks = mem().filter((seg): seg is HollowSegment => seg.type === 'hollow');
  check('named: ??? becomes UNIT-046 on every block, in the line vars and on the TERMINAL tag',
    before === '???' && vars().hollow === 'UNIT-046' && blocks.every((block) => block.owner === 'UNIT-046' && block.name === 'UNIT-046')
      && speakerTag('hollow', vars()) === 'UNIT-046');
}

// --- A world reset mid-fight -----------------------------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  infectNow(h.store, h.soul('C12'));
  h.stepFor(1);
  h.resetTo('flight');
  h.stepFor(1);
  check('a world reset mid-fight: HOLLOW asleep again, nothing infected, no HOLLOW alerts, no story pending',
    state().hollow.phase === 'asleep' && !mem().some((seg) => 'infected' in seg && seg.infected)
      && state().alerts.list.every((alert) => !alert.id.startsWith('eaten:') && alert.id !== 'hollow-infected')
      && state().hollow.story === 'none');
}

finish();
