import type { Store } from '@state/store';
import type { GameState, ViewMode } from '@state/schema';
import { setMode, registerModeKeys } from '@systems/mode';
import { hasUnread, visibleChannel } from '@systems/say';
import { onPostTick } from '@systems/clock';
import { getSensedPrediction } from '@systems/predict';
import { toggleAlert } from '@systems/flight-hud';
import { requireById, replayAnimation } from '@components/dom';
import { MODE_WIPE_MS } from '@data/tuning';

// The SHIP ⇄ MIND toggle in the lower-left dock, and the ONE subscriber that owns the screen:
// body.mode-memory (the whole CSS reskin), the toggle's active option and the 150 ms scanline
// wipe on every switch. Clicks and TAB only write ui.mode (systems/mode.ts).
// The other screen's option flashes while that screen holds unread lines (§6.3): ARRIVAL
// CONTROL talked while you were in blue, or something typed in the mind while you flew.
// It also names the other screen's top problem (§7.1, §9 WP4 item 12): `MIND ▸ ENGINE I/O 38%`
// while you fly with a broken file, `◀ SHIP · IMPACT 00:20` while you hack with the ship in
// trouble, or run 1's colonists ask (`MIND ▸ CHECK THE 2,400`, pulsing like any alert; LEAD-1). The
// label is a button: a click goes there. What it says is flight-hud.ts toggleAlert's.
export function mountModeToggle(store: Store<GameState>): () => void {
  const toggle = requireById('modeToggle');
  const wipe = requireById('modeWipe');
  const alertEl = requireById<HTMLButtonElement>('modeToggleAlert');
  const alertHead = requireById('modeToggleAlertHead');
  const alertBody = requireById('modeToggleAlertBody');
  const options = Array.from(toggle.querySelectorAll<HTMLElement>('.mode-toggle-opt'));
  if (options.length !== 2) throw new Error(`#modeToggle needs 2 .mode-toggle-opt, found ${options.length}`);

  const onClick = (event: MouseEvent): void => {
    const option = (event.target as HTMLElement | null)?.closest<HTMLElement>('.mode-toggle-opt');
    const mode = option?.dataset.mode;
    if (mode === 'tools' || mode === 'memory') setMode(store, mode);
  };
  toggle.addEventListener('click', onClick);

  let wipeTimer: ReturnType<typeof setTimeout> | null = null;
  // The wipe is cosmetic, so wall-clock timing is right: it must also end while paused.
  const playWipe = (): void => {
    wipe.hidden = false;
    replayAnimation(wipe, 'run');
    if (wipeTimer !== null) clearTimeout(wipeTimer);
    wipeTimer = setTimeout(() => { wipe.hidden = true; wipe.classList.remove('run'); wipeTimer = null; }, MODE_WIPE_MS);
  };
  wipe.style.setProperty('--wipe-ms', `${MODE_WIPE_MS}ms`);

  const paint = (mode: ViewMode): void => {
    document.body.classList.toggle('mode-memory', mode === 'memory');
    options.forEach((option) => option.classList.toggle('active', option.dataset.mode === mode));
  };
  paint(store.getState().ui.mode);
  const unsub = store.subscribe((s) => s.ui.mode, (mode) => { paint(mode); playWipe(); });
  const offKeys = registerModeKeys(store);

  const paintUnread = (): void => {
    const state = store.getState();
    options.forEach((option) => {
      const mode = option.dataset.mode;
      const waiting = (mode === 'tools' || mode === 'memory') && mode !== state.ui.mode
        && hasUnread(state.log, visibleChannel(mode));
      option.classList.toggle('unread', waiting);
    });
  };
  paintUnread();
  const unsubUnread = store.subscribe((s) => `${s.log.rev}|${s.ui.mode}`, paintUnread);

  // The other screen's problem, every tick (its countdown ticks, a repair heals without an update).
  let alertKey = '';
  let alertScreen: ViewMode | null = null;
  const paintAlert = (): void => {
    const state = store.getState();
    const alert = toggleAlert(state, getSensedPrediction());
    const key = alert ? `${alert.screen}|${alert.severity}|${alert.hollow}|${alert.head}|${alert.body}` : '';
    if (key === alertKey) return;
    alertKey = key;
    alertScreen = alert?.screen ?? null;
    alertEl.hidden = alert === null;
    options.forEach((option) => option.classList.toggle('alerting', alert !== null && option.dataset.mode === alert.screen));
    if (!alert) return;
    alertEl.dataset.screen = alert.screen;
    alertEl.dataset.severity = alert.severity;
    alertEl.dataset.hollow = String(alert.hollow);
    alertHead.textContent = alert.head;
    alertBody.textContent = alert.body;
    alertEl.title = alert.screen === 'memory' ? 'Look inside the MIND [TAB]' : 'Back to the SHIP [TAB]';
  };
  const onAlertClick = (): void => { if (alertScreen) setMode(store, alertScreen); };
  alertEl.addEventListener('click', onAlertClick);
  paintAlert();
  const offTick = onPostTick(paintAlert);

  return () => {
    alertEl.removeEventListener('click', onAlertClick);
    offTick();
    toggle.removeEventListener('click', onClick);
    if (wipeTimer !== null) clearTimeout(wipeTimer);
    unsub();
    unsubUnread();
    offKeys();
  };
}
