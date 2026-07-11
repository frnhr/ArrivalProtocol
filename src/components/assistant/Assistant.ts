import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { suggestNext, beginWarpToPeri, assistantGreeting } from '@systems/terminal/engine';
import { setAuxSink, assistantType } from '@systems/terminal/bus';
import { assistantIntegrity, mangleCommand, SAFE_MODE_INTEGRITY, HEALTHY_INTEGRITY } from '@systems/terminal/errors';

// The Assistant panel — the aux persona's own interface, distinct from the Terminal it types
// into. Two modes, driven by the Assistant file's health:
//   • GUI (integrity ≥ 60): a chat history of the assistant's guidance plus action buttons.
//     Clicking an action makes the assistant VISIBLY type that command into the terminal —
//     and its typing gets clumsy (typo → wrong value → wrong direction) as it corrupts.
//   • SAFE MODE (< 60): the chat GUI collapses to a bare arrow-key menu with no history —
//     the persona degrading in front of you. ↑/↓ select, Enter runs.
// Aux-voice lines route here (the bus): chat bubbles in GUI, forwarded to the terminal log
// in SAFE MODE (so guidance is never silently lost).

const CHAT_CAP = 40;

// Commands the assistant must NEVER mangle when it types them: the emergency recovery net
// has to work even when the assistant is badly corrupted.
const SAFE_CMDS = new Set(['abort', 'stop', 'cut', 'cutoff', 'panic', 'reset']);

interface Action { label: string; cmd: string }

export function mountAssistant(store: Store<GameState>): () => void {
  const panel = document.getElementById('assistant');
  const header = document.getElementById('asstHeader');
  const body = document.getElementById('asstBody');
  if (!panel || !header || !body) return () => {};

  const chatLog: string[] = [];
  let mode: 'gui' | 'safe' | null = null;
  let menuIdx = 0;
  let lastSig = '';        // action-list signature; repaint actions only when it changes
  let lastHeader = '';

  // The actions the assistant offers: its recommended next move (if any) + always-available
  // Status and Abort. `warp peri` is shown with a friendlier label since the assistant
  // performs it directly (time is its concern, not a terminal command).
  function actions(): Action[] {
    const out: Action[] = [];
    const next = suggestNext(store);
    if (next) out.push({ label: next.startsWith('warp') ? 'warp to periapsis' : next, cmd: next });
    out.push({ label: 'status', cmd: 'status' });
    out.push({ label: 'abort', cmd: 'abort' });
    return out;
  }
  const sigOf = (opts: Action[]): string => opts.map((a) => a.cmd).join('|');

  // The assistant acts. Time-warp it does DIRECTLY (not a terminal command). Everything else
  // it TYPES into the terminal, with mistakes proportional to its own corruption — EXCEPT
  // safety commands (stop/abort), always typed verbatim so the recovery net can't corrupt.
  function act(cmd: string): void {
    const c = cmd.trim().toLowerCase();
    if (c.startsWith('warp')) { beginWarpToPeri(store); return; }
    const text = SAFE_CMDS.has(c) ? cmd : mangleCommand(cmd, assistantIntegrity(store.getState())).text;
    assistantType(text);
  }

  let lastAux = '';
  function addChat(text: string): void {
    chatLog.push(text);
    while (chatLog.length > CHAT_CAP) chatLog.shift();
    lastAux = text;
    if (mode === 'gui') {
      const chat = body!.querySelector('.asst-chat');
      if (chat) {
        const el = document.createElement('div');
        el.className = 'asst-bubble';
        el.textContent = text;
        chat.appendChild(el);
        chat.scrollTop = chat.scrollHeight;
      }
    } else {
      // SAFE MODE keeps only the latest line (limited history — a visible degradation),
      // shown above the menu rather than a scrolling chat.
      const last = body!.querySelector('.asst-last');
      if (last) last.textContent = lastAux;
    }
  }
  setAuxSink((texts) => texts.forEach(addChat));

  // ── rendering ──
  function paintHeader(integ: number): void {
    let txt: string; let cls: string;
    if (mode === 'safe') { txt = `⚠ AUX — SAFE MODE · ${Math.round(integ)}%`; cls = 'asst-header safe'; }
    else {
      const tag = integ > HEALTHY_INTEGRITY ? 'online' : 'degraded';
      txt = `✦ AUX ASSISTANT · ${tag} · ${Math.round(integ)}%`;
      cls = `asst-header ${integ > HEALTHY_INTEGRITY ? '' : 'warn'}`;
    }
    if (txt === lastHeader) return;   // avoid needless per-tick reflow
    lastHeader = txt;
    header!.textContent = txt;
    header!.className = cls;
  }

  function buildGui(): void {
    body!.innerHTML = '<div class="asst-chat"></div><div class="asst-actions"></div>';
    const chat = body!.querySelector('.asst-chat')!;
    for (const line of chatLog) {
      const el = document.createElement('div');
      el.className = 'asst-bubble';
      el.textContent = line;
      chat.appendChild(el);
    }
    chat.scrollTop = chat.scrollHeight;
    lastSig = '';
    paintActions();
  }

  function paintActions(): void {
    const row = body!.querySelector('.asst-actions');
    if (!row) return;
    row.innerHTML = '';
    for (const a of actions()) {
      const btn = document.createElement('button');
      btn.className = 'asst-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', () => act(a.cmd));
      row.appendChild(btn);
    }
  }

  function buildSafe(): void {
    body!.innerHTML =
      '<div class="asst-safe-note">chat unavailable · select with ↑ ↓ · Enter to run</div>' +
      '<div class="asst-last"></div>' +
      '<div class="asst-menu" tabindex="0"></div>';
    const last = body!.querySelector('.asst-last');
    if (last) last.textContent = lastAux;   // keep the most recent guidance visible
    menuIdx = 0;
    lastSig = '';
    paintMenu();
    (body!.querySelector('.asst-menu') as HTMLElement | null)?.focus();
  }

  function paintMenu(): void {
    const menu = body!.querySelector('.asst-menu');
    if (!menu) return;
    const opts = actions();
    if (menuIdx >= opts.length) menuIdx = Math.max(0, opts.length - 1);
    menu.innerHTML = '';
    opts.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'asst-menu-item' + (i === menuIdx ? ' sel' : '');
      el.textContent = `${i === menuIdx ? '▸ ' : '  '}${a.label}`;
      el.addEventListener('click', () => { menuIdx = i; paintMenu(); act(a.cmd); });
      menu.appendChild(el);
    });
  }

  // Repaint the actions/menu ONLY when the option list actually changes — the panel is
  // re-evaluated at 20Hz, and rebuilding the buttons every tick would destroy the element
  // under the cursor between mousedown and mouseup (the documented click-interruption
  // hazard). Selection changes (arrow keys) call paintMenu directly.
  function refreshActions(): void {
    const sig = sigOf(actions());
    if (sig === lastSig) return;
    lastSig = sig;
    if (mode === 'gui') paintActions(); else paintMenu();
  }

  const onMenuKey = (e: KeyboardEvent): void => {
    if (mode !== 'safe') return;
    const opts = actions();
    if (opts.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); menuIdx = (menuIdx + 1) % opts.length; paintMenu(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); menuIdx = (menuIdx - 1 + opts.length) % opts.length; paintMenu(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = ((menuIdx % opts.length) + opts.length) % opts.length;   // clamp, never fall back
      act(opts[idx]!.cmd);
    }
  };
  body.addEventListener('keydown', onMenuKey);

  function render(): void {
    const integ = assistantIntegrity(store.getState());
    const nextMode: 'gui' | 'safe' = integ < SAFE_MODE_INTEGRITY ? 'safe' : 'gui';
    if (nextMode !== mode) {
      mode = nextMode;
      if (mode === 'gui') buildGui(); else buildSafe();
    } else {
      refreshActions();
    }
    paintHeader(integ);
  }

  // The assistant speaks its own opening on run start (greeting + read +, if damaged, its
  // "I took damage" tell) — this is the persona, so it lives here, not in the terminal boot.
  let greeted = false;
  function greet(): void {
    if (greeted || store.getState().burn.status !== 'approaching') return;
    greeted = true;
    for (const line of assistantGreeting(store)) addChat(line);
  }
  const unsubStatus = store.subscribe((s) => s.burn.status, greet);

  // Re-render on memory changes (repair flips the mode) and per tick (the recommended next
  // action changes as the orbit evolves). refreshActions() makes the per-tick path a no-op
  // unless the option list actually changed.
  const unsubMem = store.subscribe((s) => s.ui.memoryRev, render);
  const offTick = onGameTick(render);
  render();
  greet();   // in case the run is already live at mount

  return () => {
    setAuxSink(null);
    body.removeEventListener('keydown', onMenuKey);
    unsubStatus();
    unsubMem();
    offTick();
  };
}
