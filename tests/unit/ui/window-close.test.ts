// Playtest 1 note 14 (plan §3.9): every amber window's × closes its window. Before, the title bars carried two dead
// `.ctl` glyphs (`−` and `×`) that no code listened to. DOM-free: the markup is read as text (every `.window` in the
// tools view, its title bar and its one close button), and the close model (ToolsTabs `closeInDesk`, the one the ×'s
// delegated click calls) is driven for every window on the desk and on a phone. tests/e2e/scenarios/run-flow.mjs clicks
// each × in Chromium. The dock section that lists the unit's own windows reads `Mind` (OPEN-DECISIONS 144).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../landing/checks';
import { TOOL_WINDOWS, DEFAULT_TAB, toolIdOfWindow, closeInDesk, openInDesk, toggleInDesk, type ToolDesk } from '@components/tools-view/ToolsTabs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

// The tools view's markup: from its opening tag to the memory view's.
const toolsStart = html.indexOf('<div class="tools-view" data-active-tool');
const toolsEnd = html.indexOf('<!-- MEMORY VIEW', toolsStart);
check('index.html has the tools view', toolsStart > 0, `${toolsStart}`);
const tools = html.slice(toolsStart, toolsEnd > toolsStart ? toolsEnd : undefined);

// Each window: its class list and the markup of its title bar (`.window-title` up to `.window-body`).
const windows = [...tools.matchAll(/<div class="(window [^"]*)"[^>]*>\s*<div class="window-title">([\s\S]*?)<div class="window-body/g)]
  .map((match) => ({ classes: (match[1] ?? '').split(/\s+/), title: match[2] ?? '' }));

const ids = windows.map((win) => toolIdOfWindow(win.classes));
check('the tools view has a window for every dock tool, and no other',
  windows.length === Object.keys(TOOL_WINDOWS).length && Object.keys(TOOL_WINDOWS).every((id) => ids.includes(id)),
  `${windows.length} windows: ${ids.join(', ')}`);

for (const win of windows) {
  const id = toolIdOfWindow(win.classes) ?? `?${win.classes.join('.')}`;
  const closes = [...win.title.matchAll(/<button class="ctl win-close"[^>]*>×<\/button>/g)];
  const ctls = [...win.title.matchAll(/class="ctl\b/g)];
  check(`${id}: the title bar has exactly one × button, and it is the bar's only control`,
    closes.length === 1 && ctls.length === 1, `${closes.length} close, ${ctls.length} ctl`);
  check(`${id}: the dead − is gone`, !win.title.includes('−'));
  check(`${id}: the × is labelled for a screen reader and off the tab order`,
    /aria-label="close"/.test(closes[0]?.[0] ?? '') && /tabindex="-1"/.test(closes[0]?.[0] ?? ''));
}
check('no .ctl is left anywhere outside a window title bar', (html.match(/class="ctl\b/g) ?? []).length === windows.length);

// The model: every × shuts exactly its own window and leaves the rest as the kid had them.
const all = Object.keys(TOOL_WINDOWS);
const fullDesk: ToolDesk = { open: new Set(all), activeTab: DEFAULT_TAB };
for (const id of all) {
  const after = closeInDesk(fullDesk, id);
  check(`desk: ${id}'s × closes ${id} and only ${id}`,
    !after.open.has(id) && all.filter((other) => other !== id).every((other) => after.open.has(other)),
    [...after.open].join(','));
  const reopened = toggleInDesk(after, id);
  check(`desk: ${id}'s dock item opens it again`, reopened.open.has(id) && reopened.open.size === all.length);
  // On a phone the window is a tab: its × goes back to the NAV PLOT.
  const phone = closeInDesk(openInDesk(fullDesk, id, true), id);
  check(`phone: ${id}'s × goes back to the ${DEFAULT_TAB} tab`, phone.activeTab === DEFAULT_TAB, phone.activeTab);
}
const closedTwice = closeInDesk(closeInDesk(fullDesk, 'inbox'), 'inbox');
check('a × on a window already shut is harmless', !closedTwice.open.has('inbox') && closedTwice.open.size === all.length - 1);
let threw = false;
try { closeInDesk(fullDesk, 'nope'); } catch { threw = true; }
check('closing a window that does not exist throws (fail loudly)', threw);
check('toolIdOfWindow: a non-window reads null', toolIdOfWindow(['dock-item', 'open']) === null);

// The dock: the section over Skills, Inbox and Sites is the unit's own, `Mind` (Fran's word), not `System`.
check('dock: the section is `Mind`', /<div class="dock-section">Mind<\/div>/.test(html) && !/<div class="dock-section">System<\/div>/.test(html));

finish();
