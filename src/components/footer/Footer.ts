import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { chargeLeft, driversInMemory } from '@state/selectors';
import { isLaunchable } from '@systems/landing-rules';
import { LANDING_HUD_TEXT } from '@data/landing-text';
import { ARCHIVE_TEXT } from '@data/script';
import { onOpsChange, threadsBusy, threadsTotal } from '@systems/ops-core';
import { onPostTick } from '@systems/clock';
import { TERMINAL, thrustLimitModel, type Tone } from '@systems/flight-hud';
import { requireById, replayAnimation } from '@components/dom';
import { shownThreadsTotal } from '@components/memory-view/SegmentBlock';

// The footer's live counters (§7.1): the flight's state, THREADS busy / total (each running op
// holds one), REPAIR CHARGE left, and THRUST LIMIT n% · its cause while the files cap the engine
// (C1, C4: `THRUST LIMIT 50% · 2 THREADS BUSY`). Discrete changes come through the store; a repair
// spends charge point by point without a store update, so the op progress reports repaint it too.
// The limit is patched every tick (a repair's file comes back online mid-tick, without an update).
// WP8: while the archive is not keeping this unit (§4.5: OFFLINE, or PLAY WITHOUT ARCHIVE) the footer says
// so; a write that failed mid-run makes the tag flash in (the game goes on, loudly unsaved).

// The flight's state in the shared terminal words, with a mark for a good or a lost ship.
const TONE_MARK: Record<Tone, string> = { good: ' ✓', danger: ' ✗', plain: '', flyby: '', ghost: '', unknown: '' };

function flightLabel(status: GameState['burn']['status']): string {
  if (status === 'approaching') return 'FLYING';
  return `${TERMINAL[status].word}${TONE_MARK[TERMINAL[status].tone]}`;
}

// 01-landing §4: `PODS: 8 ABOARD · 3 LANDED · 1 CAN'T LAUNCH`, in pods. CAN'T LAUNCH counts the pods aboard whose
// driver is gone or can't launch right now (dead, infected, busy). TODO(slice1a-UI): the final footer model.
export function podsLabel(state: Readonly<GameState>): string {
  const launchable = new Set(driversInMemory(state).filter(isLaunchable).map((driver) => driver.pod));
  let aboard = 0;
  let landed = 0;
  let cantLaunch = 0;
  for (const record of state.landing.pods) {
    if (record.fate.kind === 'down') landed++;
    if (record.fate.kind !== 'aboard') continue;
    aboard++;
    if (!launchable.has(record.pod)) cantLaunch++;
  }
  return LANDING_HUD_TEXT.footer(aboard, landed, cantLaunch);
}

export function mountFooter(store: Store<GameState>): () => void {
  const soulsEl = requireById('footSouls');
  const chargeEl = requireById('footRedund');
  const coresEl = requireById('footCores');
  const burnEl = requireById('footBurn');
  const limitEl = requireById('footLimit');
  const archiveEl = requireById('footArchive');
  archiveEl.title = ARCHIVE_TEXT.footerTitle;

  const last = { souls: '', charge: '', threads: '', burn: '', limit: '' };
  const patch = (element: HTMLElement, key: keyof typeof last, text: string): void => {
    if (last[key] === text) return;
    last[key] = text;
    element.textContent = text;
  };

  function paintCharge(): void {
    patch(chargeEl, 'charge', `REPAIR CHARGE ${chargeLeft(store.getState())}`);
  }

  function paintThreads(): void {
    const busy = threadsBusy();
    const total = threadsTotal();
    patch(coresEl, 'threads', `THREADS ${busy}/${shownThreadsTotal(total, busy)}`);
    coresEl.classList.toggle('warn', busy >= total);
  }

  function paintBurn(): void {
    patch(burnEl, 'burn', `FLIGHT · ${flightLabel(store.getState().burn.status)}`);
  }

  function paintLimit(): void {
    const state = store.getState();
    const live = state.run.phase === 'flight' && state.burn.status === 'approaching';
    const model = live ? thrustLimitModel(state) : null;
    const text = model?.limited ? model.text : '';
    if (last.limit === text) return;
    last.limit = text;
    limitEl.textContent = text;
    limitEl.hidden = text === '';
  }

  function paintSouls(): void {
    patch(soulsEl, 'souls', podsLabel(store.getState()));
    soulsEl.classList.add('revealed');
  }

  const paintAll = (): void => { paintSouls(); paintCharge(); paintThreads(); paintBurn(); paintLimit(); };
  paintAll();

  const unsubStore = store.subscribe((s) => `${s.ui.memoryRev}|${s.burn.status}|${s.run.phase}`, paintAll);

  function paintArchive(status: GameState['archive']['status'], prev: GameState['archive']['status'] | null): void {
    const text = status === 'ok' || status === 'none' ? '' : ARCHIVE_TEXT.footer[status];
    archiveEl.hidden = text === '';
    archiveEl.textContent = text;
    archiveEl.classList.toggle('warn', status === 'offline' || status === 'corrupt');
    if (prev === 'ok' && status === 'offline') replayAnimation(archiveEl, 'archive-lost');
  }
  paintArchive(store.getState().archive.status, null);
  const unsubArchive = store.subscribe((s) => s.archive.status, paintArchive);
  const offOps = onOpsChange((change) => {
    if (change.type === 'progress') paintCharge();
    else paintAll();
  });
  const offTick = onPostTick(paintLimit);

  return () => { unsubStore(); unsubArchive(); offOps(); offTick(); };
}
