import type { Store } from '@state/store';
import type { GameState, LogEntry } from '@state/schema';
import { play } from '@systems/audio';
import { receivedText, lineTypeCps, lineLeadSec } from '@systems/say';
import { getPrediction } from '@systems/predict';
import { requireById } from '@components/dom';
import { createTypeQueue } from '@components/hud/typewriter';
import { lineVars, speakerTag, BEAM_OUT_TEXT } from '@data/script';
import { onGameTick } from '@systems/clock';
import { beamOutView } from '@systems/beam-out';
import { percentFloor } from '@systems/flight-hud';
import { askBeamOut } from '@components/hud/BeamOutAsk';
import { LOG_VIEW_KEEP_ROWS } from '@data/tuning';

// COMMS (§6.3, §7.1): the amber radio under Telemetry. ARRIVAL CONTROL and ship notices arrive
// here (say() routes them by speaker), each typed at COMMS_TYPE_CPS with a relay tick per
// letter; a CONTROL line opens with its C-E-G chime. Playtest 1 (B-VOICE): PAL, the companion, talks here too, with no
// chime; its row is `speaker-companion`, drawn bright (game.css) against CONTROL's plain official lines, so the two voices
// read apart. A click on the log finishes every line at
// once. Lines spoken while the kid is in blue wait (the ticker showed them); on the way back the
// older ones appear at once and the newest types itself, so the radio never chatters from a
// screen nobody is looking at, and never makes the kid wait through old news.
// The RX lamp in the title bar is lit while a line comes in.
// A CONTROL line received while the AI Comms file was failing or worse arrives with letters lost
// (▓, C6); the line is stored whole, the radio shows what came through (say.ts receivedText).
// The story beats time their silences by this queue (LEAD-1, say.ts radioTypedByAi models it with the
// same lineTypeCps / lineLeadSec), so HOLLOW's `> ...047?` never types while CONTROL is still talking;
// a garbled line keeps its length, so the model holds for it too.
// On a doomed ship it also offers ABANDON SHIP (BEAM OUT, WP7) under the log, and shows its bar.

export function mountCommsWindow(store: Store<GameState>): () => void {
  const win = requireById('commsWin');
  const body = requireById('commsBody');
  const logEl = requireById('commsLog');
  const lamp = requireById('commsLamp');

  // Types while the amber screen is up. (Not tied to the window's own visibility: on mobile it is
  // a tab, and a line must not wait unseen behind a tab the kid has not opened.)
  const queue = createTypeQueue(() => store.getState().ui.mode === 'tools');
  let lastId = 0;

  const scrollToEnd = (): void => { logEl.scrollTop = logEl.scrollHeight; };

  // A divider between two ships (WP7): drawn whole, in its turn after the lines before it.
  function addDivider(entry: LogEntry): void {
    const row = document.createElement('div');
    row.className = 'comms-line log-divider';
    row.textContent = entry.text;
    row.hidden = true;
    logEl.appendChild(row);
    while (logEl.childElementCount > LOG_VIEW_KEEP_ROWS) logEl.firstElementChild?.remove();
    queue.push({ length: 0, cps: 1, paint: () => { row.hidden = false; scrollToEnd(); } });
  }

  function addLine(entry: LogEntry): void {
    if (entry.divider) { addDivider(entry); return; }
    const row = document.createElement('div');
    row.className = `comms-line speaker-${entry.speaker}`;
    row.hidden = true;  // shown when its turn to type comes (or a click finishes it)
    const tag = document.createElement('span');
    tag.className = 'comms-tag';
    tag.textContent = speakerTag(entry.speaker, lineVars(store.getState(), getPrediction()));
    const text = document.createElement('span');
    text.className = 'comms-text';
    row.append(tag, text);
    logEl.appendChild(row);
    while (logEl.childElementCount > LOG_VIEW_KEEP_ROWS) logEl.firstElementChild?.remove();

    const isControl = entry.speaker === 'control';
    // What arrived: a damaged AI Comms file loses CONTROL's letters on the way in (C6).
    const received = receivedText(entry);
    queue.push({
      length: received.length,
      cps: lineTypeCps(entry.speaker),
      leadSec: lineLeadSec(entry.speaker),
      onStart: () => {
        row.hidden = false;
        lamp.classList.add('on');
        if (isControl) play('typeTick', { voice: 'control' });
        scrollToEnd();
      },
      onUnit: (index) => {
        // Spaces are silent: the ticks fall into words, like a real teleprinter.
        if (received[index] !== ' ') play('typeTick', { voice: 'sys' });
      },
      paint: (count, done) => {
        row.hidden = false;
        text.textContent = received.slice(0, count);
        row.classList.toggle('typing', !done);
        // Checked after the queue has moved on to the next line (if any).
        if (done) queueMicrotask(() => { if (!queue.busy()) lamp.classList.remove('on'); });
        scrollToEnd();
      },
    });
  }

  function sync(): void {
    const entries = store.getState().log.entries;
    // A fresh log (a new run) starts the radio over.
    if (entries.length === 0 && lastId > 0) {
      queue.clear();
      logEl.replaceChildren();
      lamp.classList.remove('on');
      lastId = 0;
      return;
    }
    for (const entry of entries) {
      if (entry.id <= lastId) continue;
      lastId = entry.id;
      if (entry.channel === 'radio') addLine(entry);
    }
  }

  const onClick = (): void => {
    queue.finishAll();
    lamp.classList.remove('on');
  };
  body.addEventListener('click', onClick);

  // ABANDON SHIP (WP7, §9 item 6): BEAM OUT from the radio, the link it travels on, with the same confirm
  // as the Engine window's button; while it transmits, the bar takes its place.
  const abandonEl = requireById('commsAbandon');
  const abandonBtn = requireById<HTMLButtonElement>('commsAbandonBtn');
  const beamEl = requireById('commsBeam');
  const beamFill = requireById('commsBeamFill');
  const beamLabel = requireById('commsBeamLabel');
  abandonBtn.textContent = BEAM_OUT_TEXT.abandon;
  let lastBeam = '';
  function paintAbandon(): void {
    const view = beamOutView(store.getState(), getPrediction());
    const pct = view.look === 'beaming' ? percentFloor(view.progress) : null;
    const key = `${view.look}|${pct}`;
    if (key === lastBeam) return;
    lastBeam = key;
    abandonEl.hidden = view.look === 'hidden';
    abandonBtn.hidden = view.look === 'beaming';
    abandonBtn.disabled = view.look === 'offered-paused';
    beamEl.hidden = view.look !== 'beaming';
    if (pct !== null) {
      beamFill.style.width = `${pct}%`;
      beamLabel.textContent = BEAM_OUT_TEXT.bar(pct);
    }
    if (!abandonEl.hidden) scrollToEnd();
  }
  // The button sits inside the log's body: its click must not also finish the radio's lines.
  const onAbandon = (event: MouseEvent): void => {
    event.stopPropagation();
    askBeamOut(store);
  };
  abandonBtn.addEventListener('click', onAbandon);
  paintAbandon();
  const offBeamTick = onGameTick(() => paintAbandon());
  const unsubBeam = store.subscribe((s) => `${s.run.beamOut === null}|${s.run.phase}|${s.run.rev}|${s.clock.paused}|${s.burn.status}`, () => paintAbandon());

  sync();
  const unsubLog = store.subscribe((s) => s.log.rev, sync);
  // Back in amber: catch up on what arrived meanwhile.
  const unsubMode = store.subscribe((s) => s.ui.mode, (mode) => {
    if (mode !== 'tools') return;
    queue.catchUp();
    queue.kick();
  });

  // COMMS sits right under Telemetry (game.css, --comms-top), so it follows Telemetry's real
  // height: WP4's title pips and garbled rows, or a fallback font before VT323 loads, change it.
  const toolsView = win.parentElement;
  const telemetry = toolsView?.querySelector<HTMLElement>('.telemetry-win');
  if (!toolsView || !telemetry) throw new Error('.telemetry-win missing beside #commsWin in index.html');
  const syncTelemetryHeight = (): void => {
    // 0 while the amber screen is hidden (blue, a mobile tab): keep the height it had.
    const height = telemetry.offsetHeight;
    if (height > 0) toolsView.style.setProperty('--telemetry-h', `${height}px`);
  };
  syncTelemetryHeight();
  const telemetryObserver = new ResizeObserver(syncTelemetryHeight);
  telemetryObserver.observe(telemetry);

  return () => {
    body.removeEventListener('click', onClick);
    abandonBtn.removeEventListener('click', onAbandon);
    offBeamTick();
    unsubBeam();
    unsubLog();
    unsubMode();
    telemetryObserver.disconnect();
    queue.clear();
  };
}
