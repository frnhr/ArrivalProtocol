import type { Store } from '@state/store';
import type { GameState, BurnStatus } from '@state/schema';
import { onGameTick } from '@systems/clock';
import {
  dispatch, suggestNext, bootLines, resetTerminalWatchers,
  allCommandNames, type TermLine,
} from '@systems/terminal/engine';
import { routeLines, setLogSink, setTyper } from '@systems/terminal/bus';
import { terminalIntegrity, HEALTHY_INTEGRITY } from '@systems/terminal/errors';

// The flight terminal UI: an append-only scrollback plus a single input line. The
// assistant's recommended next command shows as ghost placeholder text — Tab/→ fills it in
// to edit, and Enter on an empty line runs it outright (the one-keypress ease lever). ↑/↓
// recall history; Enter on empty with no suggestion repeats the last command. The Assistant
// panel can also VISIBLY type a command here (setTyper) — you watch it enter the command
// character by character. All game logic lives in systems/terminal/engine.ts; DOM + keyboard
// only. Lines are routed through the bus so 'aux'-voice output goes to the Assistant panel.

const MAX_LINES = 300;

const RESULT_LINE: Partial<Record<BurnStatus, TermLine>> = {
  inserted: { voice: 'good', text: '  ✔ INSERTION CONFIRMED — orbit stable inside the target band.' },
  captured: { voice: 'warn', text: '  ~ CAPTURED, off target — closed orbit but outside the band.' },
  escaped: { voice: 'warn', text: '  ✗ ESCAPE TRAJECTORY — never captured.' },
  crashed: { voice: 'warn', text: '  ✗ SURFACE IMPACT — the trajectory dropped into the planet.' },
};

export function mountTerminal(store: Store<GameState>): () => void {
  const log = document.getElementById('termLog');
  const input = document.getElementById('termInput') as HTMLInputElement | null;
  if (!log || !input) return () => {};

  const history: string[] = [];
  let histIdx = -1;          // -1 = live input; 0..n-1 index into history (newest last)
  let lastCmd = '';
  let typing = false;        // true while the assistant is visibly typing a command
  let typeTimer: number | null = null;

  function print(lines: TermLine[]): void {
    if (lines.length === 0) return;
    const atBottom = log!.scrollTop + log!.clientHeight >= log!.scrollHeight - 4;
    for (const line of lines) {
      const el = document.createElement('div');
      el.className = `term-line tl-${line.voice}`;
      el.textContent = line.text;
      log!.appendChild(el);
    }
    while (log!.childElementCount > MAX_LINES) log!.firstElementChild?.remove();
    if (atBottom) log!.scrollTop = log!.scrollHeight;
  }
  setLogSink(print);

  // Ghost suggestion → input placeholder. Only refresh when the field is empty (and not
  // being typed into by the assistant) so it never fights visible input.
  let lastGhost = '';
  function refreshGhost(): void {
    if (input!.value !== '' || typing) return;
    const g = suggestNext(store) ?? '';
    if (g !== lastGhost) { input!.placeholder = g; lastGhost = g; }
  }

  function run(raw: string): void {
    routeLines(dispatch(store, raw));
    if (raw.trim()) { history.push(raw.trim()); lastCmd = raw.trim(); }
    histIdx = -1;
    input!.value = '';
    lastGhost = ' ';   // force a ghost refresh next tick
    refreshGhost();
  }

  // Visible typing: the assistant enters a command character by character, then submits it.
  // Wall-clock paced (UI feedback, not game time). While typing, keyboard input is ignored.
  // Declines if already typing, if the player has a half-typed command in the field (don't
  // clobber their input), or if the run isn't live.
  function typeAndRun(cmd: string): void {
    if (typing || input!.value.trim() !== '' || store.getState().burn.status !== 'approaching') return;
    typing = true;
    input!.value = '';
    input!.placeholder = '';
    input!.focus();
    let i = 0;
    const step = (): void => {
      if (i <= cmd.length) {
        input!.value = cmd.slice(0, i);
        i += 1;
        typeTimer = window.setTimeout(step, 30);
      } else {
        typing = false;
        typeTimer = null;
        run(cmd);
      }
    };
    step();
  }
  // Abort any in-progress visible typing (e.g. the run ended mid-type) so a stale command
  // can't dispatch against a finished run.
  function cancelTyping(): void {
    if (typeTimer !== null) { window.clearTimeout(typeTimer); typeTimer = null; }
    if (typing) { typing = false; input!.value = ''; }
  }
  setTyper(typeAndRun);

  const onKey = (e: KeyboardEvent): void => {
    if (typing) { e.preventDefault(); return; }   // assistant is typing — ignore player keys
    if (e.key === 'Enter') {
      e.preventDefault();
      const typed = input.value.trim();
      if (typed) { run(typed); return; }
      // Empty line: run the ghost suggestion, else repeat the last command.
      const ghost = suggestNext(store);
      if (ghost) run(ghost);
      else if (lastCmd) run(lastCmd);
      return;
    }
    if ((e.key === 'Tab' || e.key === 'ArrowRight') && input.value === '') {
      const ghost = suggestNext(store);
      if (ghost) { e.preventDefault(); input.value = ghost; input.setSelectionRange(ghost.length, ghost.length); }
      return;
    }
    if (e.key === 'Tab') {
      // Complete the current command word against the command table.
      e.preventDefault();
      const frag = input.value.trim().toLowerCase();
      if (frag && !frag.includes(' ')) {
        const match = allCommandNames().find((n) => n.startsWith(frag) && n !== frag);
        if (match) input.value = match + ' ';
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      histIdx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      input.value = history[histIdx] ?? '';
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx === -1) return;
      histIdx = histIdx + 1;
      if (histIdx >= history.length) { histIdx = -1; input.value = ''; }
      else input.value = history[histIdx] ?? '';
      return;
    }
  };
  input.addEventListener('keydown', onKey);
  const onInput = (): void => { if (input.value === '') refreshGhost(); };
  input.addEventListener('input', onInput);

  // Clicking anywhere in the terminal focuses the input.
  const root = log.closest('.terminal') as HTMLElement | null;
  const onClick = (): void => { if (!typing) input.focus(); };
  root?.addEventListener('click', onClick);

  // Boot the terminal when the run goes live (briefing → approaching), and print the
  // outcome when it ends. Keep watchers clean across run boundaries.
  let printedBoot = false;
  function boot(): void {
    if (printedBoot) return;
    printedBoot = true;
    routeLines(bootLines(store));
    refreshGhost();
    input!.focus();
  }
  const unsubStatus = store.subscribe((s) => s.burn.status, (status) => {
    if (status === 'approaching') boot();
    const result = RESULT_LINE[status];
    if (result) { cancelTyping(); print([result]); resetTerminalWatchers(); }
  });
  if (store.getState().burn.status === 'approaching') boot();

  // Keep the ghost fresh as the orbit evolves (fires only while time is running).
  const offTick = onGameTick(refreshGhost);
  refreshGhost();

  // Terminal status dot reflects the TERMINAL parser file's health (repaint on memory
  // changes — a repair steadies it live). online / degraded / critical.
  const dot = document.getElementById('termDot');
  function paintDot(): void {
    if (!dot) return;
    const h = terminalIntegrity(store.getState());
    if (h > HEALTHY_INTEGRITY) { dot.textContent = '● online'; dot.style.color = 'var(--good)'; }
    else if (h >= 45) { dot.textContent = '◐ degraded'; dot.style.color = 'var(--accent)'; }
    else { dot.textContent = '◌ critical'; dot.style.color = 'var(--warn)'; }
  }
  const unsubDot = store.subscribe((s) => s.ui.memoryRev, paintDot);
  paintDot();

  return () => {
    setLogSink(null);
    setTyper(null);
    if (typeTimer !== null) window.clearTimeout(typeTimer);
    resetTerminalWatchers();
    input.removeEventListener('keydown', onKey);
    input.removeEventListener('input', onInput);
    root?.removeEventListener('click', onClick);
    unsubStatus();
    offTick();
    unsubDot();
  };
}
