import type { Store } from '@state/store';
import type { GameState, Alert } from '@state/schema';

// Alerts are the standing problems the game knows about (an impact under 30 s, later an
// infected cluster or Core). Pace, SKIP, the klaxon, the vignette and the mode toggle read
// them. Systems raise and clear them here; each change is one update that bumps alerts.rev,
// and nothing changes when the alert is already in that state, so calling these every tick
// costs nothing.

// Something in the mind is at warn or worse: CONTROL keeps its jokes to itself (say.ts), and the
// mind is not "quiet" for the SKIP hint (director.ts).
export function mindAlertActive(state: Readonly<GameState>): boolean {
  return state.alerts.list.some((alert) => alert.layer === 'mind' && alert.severity !== 'info');
}

// HOLLOW's alerts (systems/hollow.ts raises them, §6.6): anything infected; a cluster about to be
// eaten (one per cluster, `eaten:C12`); the Core infected. The mode toggle paints them in HOLLOW's
// pink, so a kid in amber knows at a glance it is the thing in the memory, not a broken file.
export const INFECTED_ALERT_ID = 'hollow-infected';
export const CORE_ALERT_ID = 'core-infected';
export const EATEN_ALERT_PREFIX = 'eaten:';
// WP9: a seed telegraphed, or one that can bite a file (a warning that holds SKIP, like an infection).
export const SEED_ALERT_ID = 'hollow-seed';
// WP11: one of HOLLOW's verbs counting down (a warning that holds SKIP: the world never skips past it).
export const VERB_ALERT_ID = 'hollow-verb';
// WP10 (systems/ghost-thrust.ts): the ship's first uncommanded burst (an alarm: the klaxon, TACTICAL), and the counter of
// the later ones (a warning: no klaxon, SKIP flies through them).
export const GHOST_ALARM_ID = 'ghost-alarm';
export const GHOST_WARN_ID = 'ghost-thrust';

export function isHollowAlert(alert: Readonly<Alert>): boolean {
  return alert.id === INFECTED_ALERT_ID || alert.id === CORE_ALERT_ID || alert.id === SEED_ALERT_ID || alert.id === VERB_ALERT_ID
    || alert.id.startsWith(EATEN_ALERT_PREFIX);
}

// A ship that is no longer being played (crashed, escaped, stranded, its Core eaten, or printed) has
// nothing left for HOLLOW to eat: its alerts go at once, as the flight's IMPACT alarm does, so no red
// vignette or pink toggle outlives the ship under its card. One update, only when there is one.
export function clearHollowAlerts(store: Store<GameState>): void {
  if (!store.getState().alerts.list.some(isHollowAlert)) return;
  store.update((draft) => {
    draft.alerts.list = draft.alerts.list.filter((alert) => !isHollowAlert(alert));
    draft.alerts.rev++;
  });
}

function sameAlert(a: Alert, b: Alert): boolean {
  return a.layer === b.layer && a.severity === b.severity && a.text === b.text && a.inhibitsSkip === b.inhibitsSkip;
}

export function raiseAlert(store: Store<GameState>, alert: Alert): void {
  const existing = store.getState().alerts.list.find((candidate) => candidate.id === alert.id);
  if (existing && sameAlert(existing, alert)) return;
  store.update((draft) => {
    const index = draft.alerts.list.findIndex((candidate) => candidate.id === alert.id);
    if (index >= 0) draft.alerts.list[index] = { ...alert };
    else draft.alerts.list.push({ ...alert });
    draft.alerts.rev++;
  });
}

export function clearAlert(store: Store<GameState>, id: string): void {
  if (!store.getState().alerts.list.some((candidate) => candidate.id === id)) return;
  store.update((draft) => {
    draft.alerts.list = draft.alerts.list.filter((candidate) => candidate.id !== id);
    draft.alerts.rev++;
  });
}
