import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { suggestNext } from '@systems/terminal/engine';
import { setAuxSink, assistantType } from '@systems/terminal/bus';
import { assistantIntegrity, mangleCommand, SAFE_MODE_INTEGRITY, HEALTHY_INTEGRITY } from '@systems/terminal/errors';

// The Assistant panel — the aux persona's own interface, distinct from the Terminal it types
// into. Two modes, driven by the Assistant file's health:
//   • GUI (integrity ≥ 60): a chat history of the assistant's guidance plus action buttons.
//     Clicking an action makes the assistant VISIBLY type that command into the terminal —
//     and its typing gets clumsy (typo → wrong value → wrong direction) as it corrupts.
//   • SAFE MODE (< 60): the chat GUI collapses to a bare arrow-key menu with no history —
//     the persona degrading in front of you. ↑/↓ select, Enter runs.
// Aux-voice lines from the engine are routed here (the bus) as chat; in SAFE MODE they're
// dropped (no conversation).

const CHAT_CAP = 40;

interface Action { label: string; cmd: string }

export function mountAssistant(store: Store<GameState>): () => void {
  const panel = document.getElementById('assistant');
  const header = document.getElementById('asstHeader');
  const body = document.getElementById('asstBody');
  if (!panel || !header || !body) return () => {};

  const chatLog: string[] = [];
  let mode: 'gui' | 'safe' | null = null;
  let menuIdx = 0;

  // The actions the assistant offers: its recommended next move (if any) + always-available
  // Status and Abort.
  function actions(): Action[] {
    const out: Action[] = [];
    const next = suggestNext(store);
    if (next) out.push({ label: next, cmd: next });
    out.push({ label: 'status', cmd: 'status' });
    out.push({ label: 'abort', cmd: 'abort' });
    return out;
  }

  // The assistant acts: it types the command for you, with mistakes proportional to its own
  // corruption (a typo bounces off the parser; a wrong value/direction actually fires — the
  // burn auto-cut and `stop`/`abort` keep it recoverable).
  function act(cmd: string): void {
    const { text } = mangleCommand(cmd, assistantIntegrity(store.getState()));
    assistantType(text);
  }

  function addChat(text: string): void {
    chatLog.push(text);
    while (chatLog.length > CHAT_CAP) chatLog.shift();
    if (mode !== 'gui') return;   // SAFE MODE keeps no history
    const chat = body!.querySelector('.asst-chat');
    if (!chat) return;
    const el = document.createElement('div');
    el.className = 'asst-bubble';
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }
  setAuxSink((texts) => texts.forEach(addChat));

  // ── rendering ──
  function paintHeader(integ: number): void {
    if (mode === 'safe') {
      header!.textContent = `⚠ AUX — SAFE MODE · ${Math.round(integ)}%`;
      header!.className = 'asst-header safe';
    } else {
      const tag = integ > HEALTHY_INTEGRITY ? 'online' : 'degraded';
      header!.textContent = `✦ AUX ASSISTANT · ${tag} · ${Math.round(integ)}%`;
      header!.className = `asst-header ${integ > HEALTHY_INTEGRITY ? '' : 'warn'}`;
    }
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
      '<div class="asst-menu" tabindex="0"></div>';
    menuIdx = 0;
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

  const onMenuKey = (e: KeyboardEvent): void => {
    if (mode !== 'safe') return;
    const opts = actions();
    if (e.key === 'ArrowDown') { e.preventDefault(); menuIdx = (menuIdx + 1) % opts.length; paintMenu(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); menuIdx = (menuIdx - 1 + opts.length) % opts.length; paintMenu(); }
    else if (e.key === 'Enter') { e.preventDefault(); act(opts[menuIdx]?.cmd ?? 'status'); }
  };
  body.addEventListener('keydown', onMenuKey);

  function render(): void {
    const integ = assistantIntegrity(store.getState());
    const nextMode: 'gui' | 'safe' = integ < SAFE_MODE_INTEGRITY ? 'safe' : 'gui';
    if (nextMode !== mode) {
      mode = nextMode;
      if (mode === 'gui') buildGui(); else buildSafe();
    } else if (mode === 'gui') {
      paintActions();   // keep the recommended action fresh
    } else {
      paintMenu();
    }
    paintHeader(integ);
  }

  // Re-render on memory changes (repair flips the mode / refreshes actions) and per tick
  // (the recommended next action changes as the orbit evolves).
  const unsubMem = store.subscribe((s) => s.ui.memoryRev, render);
  const offTick = onGameTick(render);
  render();

  return () => {
    setAuxSink(null);
    body.removeEventListener('keydown', onMenuKey);
    unsubMem();
    offTick();
  };
}
