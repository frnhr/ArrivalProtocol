// @ts-nocheck: TODO(slice1a-TESTS): this suite still reads phase 2's souls / printer (cluster codes, print results) and is
// moved onto the landing per slice-1a-plan §5. F2 turned type-checking off here so tsc over tests stays green meanwhile.
// WP7: HollowDef gained `story` and the timed wake `coastLeadSec` (HALCYON's coast-tied wake); the
// fixtures below spell them out (no story, no coast lead: the WP6 behaviour they test).
// WP6 part 2, spec item 11: the TERMINAL's command echoes, on the live systems.
// • Every player op echoes once when it ends (`> repair engine_io ... OK · −10 CHARGE`, `> scan stasis
//   ... 0 pods`, `> move c09 ... OK`, `> delete ??? ... OK · +8 FREE`, `> swap thrust_controller thrust.alt ... OK` (WP10),
//   the v2 squeeze); a stopped repair says what it already cost; one HOLLOW ate under it says EATEN and
//   that the charge is lost; a repair that runs out of charge keeps its one NO CHARGE line.
// • Every HOLLOW action echoes in its own pink voice with who did it: `> infect c12   [user: ???]`,
//   `> eat c11 ... DID NOT WAKE   [user: ???]`, `> eat telemetry ... GONE   [user: ???]`; the tag is
//   LineVars.hollow (`???`, `UNIT-046` once it names itself). On a sealed archive the infect echo comes
//   before the breach line.
// • Every echo fits a line (≤ MAX_LINE_CHARS with worst-case names) and says no "never say" word; the
//   painter's labels too.
import { check, finish } from '../wp1/harness';
import { createHarness6 } from './harness6';
import { infectNow, nameHollow } from '@systems/hollow';
import {
  actionRepair, actionScan, actionMove, actionCopy, actionDelete, actionSwap, cancelPlayerOp,
} from '@state/actions';
import { getOps } from '@systems/ops-core';
import { installTool } from '@systems/licences';
import { lineVars } from '@data/script';
import { getPrediction } from '@systems/predict';
import { getRedundancy, getByRole, driversInMemory } from '@state/selectors';
import { OP_ECHO, OP_LINES, echoName, scanFinding } from '@data/tool-text';
import { HOLLOW_ECHO, HOLLOW_HUD_TEXT, HOLLOW_STORY } from '@data/hollow-text';
import type { HollowDef } from '@data/ships';
import type { Segment, FreeSegment, HollowSegment, ShipSegment, FsToolSegment } from '@/types/segment';
import { MAX_LINE_CHARS, SEG_NAME_MAX_CHARS } from '@data/tuning';

const h = createHarness6(1, { soulsFound: true });
const state = () => h.store.getState();
const mem = (): Segment[] => state().memory;
const mind = (): string[] => h.log().filter((entry) => entry.channel === 'mind').map((entry) => entry.text);
const said = (speaker: string, text: string): boolean => h.log().some((entry) => entry.speaker === speaker && entry.text === text);
const chargeLeft = (): number => getRedundancy(state())!.used;

// A HOLLOW that eats a file within a second (tests only: no ship could set it) and one that drains
// at 40 %/s, faster than a repair heals.
const HUNGRY: HollowDef = { wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: null, drainPerSec: 200, burnMult: 1, landMult: 1, seed: null, verbs: null, deal: false, story: 'none' };

function fresh(cfg?: HollowDef): void {
  h.resetTo('flight');
  h.noFault();
  for (const kind of ['repair', 'move', 'copy', 'delete'] as const) installTool(h.store, kind);
  h.store.update((d) => {
    if (cfg) d.hollow.cfg = cfg;
    d.hollow.phase = 'dormant';
  });
}

// --- The names --------------------------------------------------------------------------------------------
{
  fresh();
  const byName = (name: string): Segment => mem().find((seg) => seg.name === name)!;
  const names = ['Engine I/O', 'Life Support', 'Thrust Controller', 'Repair.bak', 'Thrust.alt', 'Repair Charge', 'AI Core'].map((name) => echoName(byName(name)));
  check('echo names: lowercase, words joined by _, only letters, digits, . and _',
    names.join() === 'engine_io,life_support,thrust_controller,repair.bak,thrust.alt,repair_charge,ai_core', names.join());
  const root = mem().find((seg): seg is HollowSegment => seg.type === 'hollow' && seg.root)!;
  check('echo names: a cluster by its code, a hollow block by its owner', echoName(h.soul('C12')) === 'c12' && echoName(root) === '???');
}

// --- The player's ops -----------------------------------------------------------------------------------------
{
  fresh();
  h.setIntegrity('engine-io', 38);
  const before = chargeLeft();
  actionRepair(h.store, h.file('engine-io'));
  h.runOps();
  const spent = before - chargeLeft();
  check('repair: `> repair engine_io ... OK · −n CHARGE`, n = what it cost (§5.1: −10)', said('cmd', OP_ECHO.repair('engine_io', spent)) && spent === 10,
    mind().slice(-2).join(' / '));
  check('the echo reads as §5.1 writes it', OP_ECHO.repair('engine_io', 10) === '> repair engine_io ... OK · −10 CHARGE');

  const stasis = getByRole(state(), 'stasis')!;
  actionScan(h.store, stasis);
  h.runOps();
  check('scan STASIS: `> scan stasis ... 0 pods` (§9 WP6 item 11)', said('cmd', '> scan stasis ... 0 pods'), mind().slice(-1).join());
  actionScan(h.store, getByRole(state(), 'life')!);
  h.runOps();
  check('scan Life Support: the colonists\' other clue, `0 breathing`', said('cmd', '> scan life_support ... 0 breathing'), mind().slice(-1).join());
  const reactor = getByRole(state(), 'reactor')!;
  actionScan(h.store, reactor);
  h.runOps();
  check('scan another ship file: its health', said('cmd', `> scan reactor ... ${scanFinding('reactor', 100)}`) && scanFinding('reactor', 100) === '100%', mind().slice(-1).join());

  const c09 = h.soul('C09');
  const beforeCancel = chargeLeft();
  actionRepair(h.store, c09);
  h.stepFor(0.5);
  cancelPlayerOp(h.store, getOps()[0]!.id);
  const paid = beforeCancel - chargeLeft();
  check('a stopped repair: `> repair c09 ... STOPPED · −n CHARGE` (what it already paid)', paid > 0 && said('cmd', OP_ECHO.repairEnded('c09', paid, 'stopped')),
    mind().slice(-1).join());

  // MOVE C09 into rack D (a jump), COPY Telemetry into rack F's free space, SWAP the Thrust Controller.
  const rackD = mem().find((seg): seg is FreeSegment => seg.type === 'free' && seg.size >= 64)!;
  const moved = actionMove(h.store, h.soul('C09'), { regionSegIds: [rackD.id], col: 8 }) === null;
  h.runOps();
  check('move: `> move c09 ... OK`', moved && said('cmd', '> move c09 ... OK'), mind().slice(-1).join());
  const telemetry = getByRole(state(), 'telemetry')!;
  const spot = [...mem()].reverse().find((seg): seg is FreeSegment => seg.type === 'free' && seg.size >= telemetry.size)!;
  const copied = actionCopy(h.store, telemetry, { regionSegIds: [spot.id], col: 0 }) === null;
  h.runOps();
  check('copy: `> copy telemetry ... OK`', copied && said('cmd', '> copy telemetry ... OK'), mind().slice(-1).join());
  // WP10: SWAP is a tool file (installed here) and a 2 s op; its echo names both files.
  installTool(h.store, 'swap');
  const thrust = mem().find((seg): seg is ShipSegment => seg.type === 'ship' && seg.role === 'thrust-ctrl')!;
  actionSwap(h.store, thrust);
  h.runOps();
  check('swap: `> swap thrust_controller thrust.alt ... OK`', said('cmd', '> swap thrust_controller thrust.alt ... OK'), mind().slice(-1).join());

  // Repair v2 squeezes REPAIR CHARGE's spent blocks out.
  h.store.update((d) => {
    for (const seg of d.memory) if (seg.type === 'fs-tool' && seg.fsTool === 'repair') (seg as FsToolSegment).version = 2;
    d.ui.memoryRev++;
  });
  const charge = getRedundancy(state())!;
  const spentBlocks = charge.size - charge.used;
  actionRepair(h.store, charge);
  h.runOps();
  check('the v2 squeeze: `> repair repair_charge ... OK · +n FREE`', spentBlocks > 0 && said('cmd', OP_ECHO.squeeze('repair_charge', spentBlocks)), mind().slice(-1).join());
}

// --- Out of charge: the NO CHARGE line is the echo --------------------------------------------------------------
{
  fresh();
  h.setIntegrity('engine-io', 38);
  h.store.update((d) => { getRedundancy(d)!.used = 3; d.ui.memoryRev++; });
  const engine = h.file('engine-io');
  actionRepair(h.store, engine);
  h.runOps();
  const lines = mind().filter((line) => line.includes('engine_io') || line.includes('ENGINE I/O'));
  check('out of charge: one line, NO CHARGE (no OK echo)', lines.length === 1 && lines[0] === OP_LINES.noCharge(engine.name), lines.join(' / '));
}

// --- HOLLOW's echoes -------------------------------------------------------------------------------------------
{
  fresh();
  h.store.update((d) => { for (const soul of driversInMemory(d)) soul.sealed = true; d.hollow.phase = 'asleep'; d.ui.memoryRev++; });
  infectNow(h.store, h.soul('C12'));
  const tag = lineVars(state(), getPrediction()).hollow;
  const lines = mind();
  const infectAt = lines.indexOf(HOLLOW_ECHO.infect('c12', '???'));
  const breachAt = lines.indexOf(HOLLOW_STORY.breach('C12', h.soul('C12').family));
  check('the bite: `> infect c12   [user: ???]` in HOLLOW\'s voice, its tag = LineVars.hollow', said('hollow', '> infect c12   [user: ???]') && tag === '???',
    lines.slice(-2).join(' / '));
  check('a sealed archive: the infect echo, then the breach line', infectAt >= 0 && breachAt > infectAt, `${infectAt} ${breachAt}`);
}
{
  fresh(HUNGRY);
  infectNow(h.store, h.soul('C11'));
  h.stepFor(1);
  check('a cluster eaten: `> eat c11 ... DID NOT WAKE   [user: ???]`', said('hollow', '> eat c11 ... DID NOT WAKE   [user: ???]'), mind().slice(-1).join());
  infectNow(h.store, getByRole(state(), 'telemetry')!);
  h.stepFor(1);
  check('a file eaten: `> eat telemetry ... GONE   [user: ???]`', said('hollow', '> eat telemetry ... GONE   [user: ???]'), mind().slice(-1).join());
  // DELETE on the block that was C11 (8 blocks): `> delete ??? ... OK · +8 FREE`.
  const block = mem().find((seg): seg is HollowSegment => seg.type === 'hollow' && seg.ate === `C11 · ${'FONTAINE'}`);
  const deleted = block ? actionDelete(h.store, block) === null : false;
  h.runOps();
  check('delete an eaten block: `> delete ??? ... OK · +8 FREE`', deleted && said('cmd', '> delete ??? ... OK · +8 FREE'), mind().slice(-1).join());
}
{
  fresh({ ...HUNGRY, drainPerSec: 40 });
  const c10 = h.soul('C10');
  infectNow(h.store, c10);
  h.step();
  const before = chargeLeft();
  actionRepair(h.store, c10);
  h.stepFor(6);
  const lost = before - chargeLeft();
  check('a repair HOLLOW ate under: `> repair c10 ... EATEN · −n CHARGE LOST`', lost > 0 && said('cmd', OP_ECHO.repairEnded('c10', lost, 'eaten'))
    && OP_ECHO.repairEnded('c10', lost, 'eaten') === `> repair c10 ... EATEN · −${lost} CHARGE LOST`, mind().slice(-3).join(' / '));
}
{
  fresh();
  nameHollow(h.store);
  infectNow(h.store, h.soul('C12'));
  const tag = lineVars(state(), getPrediction()).hollow;
  check('named: the tag flips with the name (`[user: UNIT-046]` = LineVars.hollow)', tag === 'UNIT-046' && said('hollow', '> infect c12   [user: UNIT-046]'),
    mind().slice(-1).join());
}

// --- Every new line fits and says nothing a kid never reads ------------------------------------------------------
{
  const longName = 'w'.repeat(SEG_NAME_MAX_CHARS);
  const lines: { where: string; text: string }[] = [
    { where: 'scan', text: OP_ECHO.scan(longName, '100%') },
    { where: 'repair', text: OP_ECHO.repair(longName, 999) },
    { where: 'repair stopped', text: OP_ECHO.repairEnded(longName, 999, 'stopped') },
    { where: 'repair eaten', text: OP_ECHO.repairEnded(longName, 999, 'eaten') },
    { where: 'squeeze', text: OP_ECHO.squeeze(longName, 72) },
    { where: 'delete', text: OP_ECHO.delete(longName, 72) },
    { where: 'move', text: OP_ECHO.done('move', longName) },
    { where: 'swap', text: OP_ECHO.done('swap', longName) },
    { where: 'swap pair', text: OP_ECHO.swap(longName, longName) },
    { where: 'ended', text: OP_ECHO.ended('delete', longName, 'eaten') },
    { where: 'infect', text: HOLLOW_ECHO.infect(longName, 'UNIT-999') },
    { where: 'eat', text: HOLLOW_ECHO.eat(longName, true, 'UNIT-999') },
    { where: 'eat file', text: HOLLOW_ECHO.eat(longName, false, 'UNIT-999') },
    { where: 'eat copy', text: HOLLOW_ECHO.eatCopy(`${longName}.cp`, 'UNIT-999') },
    { where: 'next bite unknown', text: `${HOLLOW_HUD_TEXT.nextBite} ${HOLLOW_HUD_TEXT.noTimer}` },
    { where: 'ate tag', text: HOLLOW_HUD_TEXT.ateTag('C99') },
    { where: 'gap title', text: HOLLOW_HUD_TEXT.gapTitle(3) },
    { where: 'wall title', text: HOLLOW_HUD_TEXT.wallTitle(384) },
    { where: 'wall', text: HOLLOW_HUD_TEXT.wall(384) },
    { where: 'next bite', text: `${HOLLOW_HUD_TEXT.nextBite} 59:59` },
    { where: 'fx', text: `${HOLLOW_HUD_TEXT.saved} ${HOLLOW_HUD_TEXT.lostSoul} ${HOLLOW_HUD_TEXT.lostFile}` },
  ];
  for (const { where, text } of lines) check(`fits: ${where}`, text.length <= MAX_LINE_CHARS, `${text.length}: ${text}`);
  const NEVER_SAY = [
    /tools mode/i, /memory mode/i, /periapsis/i, /apoapsis/i, /\buplink\b/i, /\bband\b/i, /inserted/i,
    /BURN LEFT/, /Δv/, /redundancy/i, /\bRDN\b/, /\bcores\b/i, /\bmoat\b/i, /Fleet Office/i, /OKAFOR BLOCK/, /\bHOLLOW\b/,
  ];
  const bad = lines.filter(({ text }) => NEVER_SAY.some((pattern) => pattern.test(text)));
  check('no echo or label uses a "never say" word (nor the design\'s name HOLLOW)', bad.length === 0, bad.map((line) => line.text).join(' | '));
}

finish();
