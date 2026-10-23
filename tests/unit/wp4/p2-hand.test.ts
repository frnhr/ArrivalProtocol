// WP4 part 2: the lead's WP3 leftovers that live in the tool hand (DOM-free halves; the browser
// halves are in tests/unit/wp4/p2-ui-checks.mjs).
// (2) FsStatusBar finds chips by tool kind, never by a seed id (a source scan: the chips are DOM).
// (3) The hand's module state (the file the held tool last worked on) is dropped with the world.
// (4) A delete question opening makes its file the one INSPECT shows (fs-tools remembers it before
//     asking; DetailPanel repaints on the question).
import { readFileSync } from 'node:fs';
import { check, finish } from '../wp1/harness';
import { createHarness4 } from './harness4';
import { listResets } from '@systems/reset';
import { installTool } from '@systems/licences';
import {
  pickUpTool, applyTool, cancelTool, getLastAppliedTargetId, type ToolDeps, type ConfirmRequest,
} from '@systems/fs-tools';
import { setMode } from '@systems/mode';
import { FS_TOOL_KINDS, toolChipId, TOOL_HINT_TARGET } from '@data/fs-tools';

const h = createHarness4(1);

// --- (2) chips by kind ---------------------------------------------------------------------------------
{
  const source = readFileSync('src/components/memory-view/FsStatusBar.ts', 'utf8');
  check('(2) FsStatusBar never names a seed id (t_repair…, chip-repair-b)', !/t_repair|chip-repair-b|t_scan|t_move|t_copy|t_delete/.test(source));
  // WP4 fix round 1: the chip id is built by one helper in data/fs-tools (toolChipId), shared with
  // the hint targets, from the one FS_TOOL_KINDS list.
  check('(2) …it finds each chip by its kind (toolChipId(kind) = chip-${kind}, over FS_TOOL_KINDS)',
    source.includes('requireById(toolChipId(kind))') && source.includes('FS_TOOL_KINDS')
    && FS_TOOL_KINDS.every((kind) => toolChipId(kind) === `chip-${kind}` && TOOL_HINT_TARGET[kind] === `chip-${kind}`));
}

// --- (3) the hand's state goes with the world ------------------------------------------------------------
{
  h.resetTo('flight');
  check('(3) the hand registers a world reset (fs-tools-hand)', listResets().includes('fs-tools-hand'), listResets().join());
  pickUpTool(h.store, 'scan');
  const cargo = h.seg('Cargo Ctrl');
  applyTool(h.store, cargo, { ask: () => { throw new Error('no question expected'); } });
  check('(3) a scan click remembers its file', getLastAppliedTargetId() === cargo.id);
  h.resetTo('flight');
  check('(3) a new world forgets it (no stale file from the old ship\'s memory)', getLastAppliedTargetId() === null);
}

// --- (4) the delete question names its file at once ---------------------------------------------------------
{
  h.resetTo('flight');
  installTool(h.store, 'delete');
  let asked: ConfirmRequest | null = null;
  let workedOnWhenAsked: string | null = null;
  const deps: ToolDeps = {
    ask: (request) => { asked = request; workedOnWhenAsked = getLastAppliedTargetId(); },
  };
  pickUpTool(h.store, 'delete');
  const cargo = h.seg('Cargo Ctrl');
  applyTool(h.store, cargo, deps);
  check('(4) DELETE on Cargo Ctrl asks first', asked !== null && (asked as ConfirmRequest).text.question === 'DELETE CARGO CTRL?',
    JSON.stringify((asked as ConfirmRequest | null)?.text));
  check('(4) …and the file is already the one INSPECT shows when the question opens', workedOnWhenAsked === cargo.id, String(workedOnWhenAsked));
  cancelTool(h.store);
  check('(4) putting the tool down (answer no) selects it', h.store.getState().ui.selectedId === cargo.id);
}

// --- (5) WP4 fix round 1: leaving blue puts the tool down ---------------------------------------------------
// A tool works on the strip, which only blue shows: TAB back with REPAIR in hand (the tutorial's
// last step) drops it like Esc, so no follower card or crosshair rides over the NAV PLOT, and the
// file it was used on stays selected for INSPECT.
{
  h.resetTo('flight');
  h.noFault();
  setMode(h.store, 'memory');
  for (let i = 0; i < 3; i++) h.step();
  pickUpTool(h.store, 'repair');
  const engine = h.file('engine-io');
  applyTool(h.store, engine, { ask: () => { throw new Error('no question expected'); } });
  check('(5) REPAIR in hand after the click (tools stay in hand in blue)', h.store.getState().ui.activeTool?.kind === 'repair');
  h.press('Tab');
  const ui = h.store.getState().ui;
  check('(5) TAB to amber: no tool in hand, the repaired file selected', ui.mode === 'tools' && ui.activeTool === null
    && ui.pickedSourceId === null && ui.selectedId === engine.id, JSON.stringify({ mode: ui.mode, tool: ui.activeTool, selected: ui.selectedId }));
  h.press('Tab');
  check('(5) back in blue the hand is still empty (no tool comes back by itself)', h.store.getState().ui.activeTool === null);
}

finish();
