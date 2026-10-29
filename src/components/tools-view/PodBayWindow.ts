import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { on } from '@systems/events';
import { play } from '@systems/audio';
import { capabilitiesNow } from '@systems/capabilities';
import { getDropSolution } from '@systems/drop-cache';
import { endLanding } from '@systems/landing';
import { playerLaunch, type LaunchConfirm } from '@systems/landing-controls';
import { bayWindowModel, type BayWindowModel } from '@systems/landing-hud';
import { askInline } from '@components/hud/InlineConfirm';
import { createScrambler } from '@components/hud/scrambler';
import { requireById, make } from '@components/dom';
import { POD_BAY_STATUS_TEXT } from '@data/landing-text';
import { POD_BAY_OPEN_DELAY_MS } from '@data/tuning';

// The POD BAY window (01-landing §4), under ENGINE in the right column, in LANDING only, drawn from landing-hud's
// bayWindowModel: `[ L · LAUNCH POD ]` (green while [L] would launch into an open window, amber while it would ask first,
// dim with the refusal's words otherwise), the bay `BAY ▮▮▮▯ 3/4 · RELOAD 0:12`, the next pod `NEXT POD 01 · OKAFOR ·
// SOFT · ±78 km`, the LZ counters, the pods that can't launch, and END LANDING with its inline confirm (`2 PODS WILL BE
// PARKED IN ORBIT · NOT COUNTED`). The BAY CTRL pip under the title is WindowGrip's (data-roles="bay").
// The launch button goes through landing-controls playerLaunch, exactly as [L] does (the confirm loop lives there); on
// a phone it rides in the flight bar (PhoneFlightBar). It opens at ORBIT LOCK: the window slides in a moment after the
// lock's stamp with the modem handshake (transmitIn). This module also marks the page as landing (body.landing), which
// the landing-only furniture keys on (the GROUND TRACK, the dock's POD BAY item, the phone bar, the Engine's inert
// controls). Telemetry below 60 garbles the counters, the drop width and the reload countdown (C3).

export interface PodBayDeps {
  confirm: LaunchConfirm;
}

export function mountPodBayWindow(store: Store<GameState>, deps: PodBayDeps): () => void {
  const win = requireById('podBayWin');
  const launchBtn = requireById<HTMLButtonElement>('podLaunchBtn');
  const launchLabel = requireById('pbLaunchLabel');
  const launchStatus = requireById('pbLaunchStatus');
  const bayEl = requireById('pbBay');
  const nextEl = requireById('pbNext');
  const lzsEl = requireById('pbLzs');
  const cantEl = requireById('pbCant');
  const endBtn = requireById<HTMLButtonElement>('pbEnd');
  const scramblers = { bay: createScrambler(), next: createScrambler(), lzs: new Map<string, ReturnType<typeof createScrambler>>() };

  const patch = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

  function paintLzs(model: BayWindowModel, scramble: number): void {
    while (lzsEl.children.length > model.lzs.length) lzsEl.lastElementChild?.remove();
    model.lzs.forEach((counter, i) => {
      let node = lzsEl.children[i] as HTMLElement | undefined;
      if (!node) { node = make('span', 'pb-lz'); lzsEl.appendChild(node); }
      let scrambler = scramblers.lzs.get(counter.lz);
      if (!scrambler) { scrambler = createScrambler(); scramblers.lzs.set(counter.lz, scrambler); }
      patch(node, scrambler.apply(counter.text, scramble));
      node.className = `pb-lz${counter.down >= counter.count ? ' done' : counter.full ? ' full' : ''}`;
      const pips = Array.from({ length: counter.count }, (_, slot) => (slot < counter.down ? 'down' : slot < counter.projected ? 'falling' : 'open'));
      node.dataset.pips = pips.join(' ');
    });
  }

  function paint(): void {
    const state = store.getState();
    const landing = state.run.phase === 'landing';
    document.body.classList.toggle('landing', landing);
    if (!landing) return;
    const model = bayWindowModel(state, getDropSolution());
    const scramble = capabilitiesNow(state).telemetryScramble;
    patch(launchLabel, model.launch.label);
    patch(launchStatus, model.launch.status);
    if (launchBtn.dataset.look !== model.launch.look) launchBtn.dataset.look = model.launch.look;
    launchBtn.disabled = model.launch.look === 'blocked';
    patch(bayEl, scramblers.bay.apply(model.bay.text, scramble));
    bayEl.dataset.full = String(model.bay.reloadTac === null);
    patch(nextEl, scramblers.next.apply(model.nextText, scramble));
    nextEl.classList.toggle('hard', model.next?.touch === 'hard');
    nextEl.classList.toggle('none', model.next === null);
    paintLzs(model, scramble);
    cantEl.hidden = model.cantLaunch === 0;
    patch(cantEl, POD_BAY_STATUS_TEXT.cantLaunch(model.cantLaunch));
    patch(endBtn, model.endLanding.label);
    endBtn.disabled = !model.endLanding.enabled;
  }

  // The launch: the one path (playerLaunch → requestLaunch), the confirm through the inline pill.
  const onLaunch = (event: MouseEvent): void => {
    event.stopPropagation();
    playerLaunch(store, deps.confirm);
  };
  launchBtn.addEventListener('click', onLaunch);

  // END LANDING asks first: the pods still aboard are parked in orbit and not counted (§3.10).
  const onEnd = (event: MouseEvent): void => {
    event.stopPropagation();
    const model = bayWindowModel(store.getState(), getDropSolution());
    if (!model.endLanding.enabled) return;
    askInline({
      text: { question: model.endLanding.confirm, detail: '' },
      answers: { yes: POD_BAY_STATUS_TEXT.endConfirmYes, no: POD_BAY_STATUS_TEXT.endConfirmNo },
      onYes: () => { endLanding(store); },
    });
  };
  endBtn.addEventListener('click', onEnd);

  // Opened at ORBIT LOCK (or ACCEPT): after the lock's stamp, the window slides in with the modem handshake.
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  const offStart = on('landing-start', () => {
    win.classList.add('pb-waiting');
    if (openTimer !== null) clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      openTimer = null;
      win.classList.remove('pb-waiting');
      win.classList.remove('pb-arrive');
      void win.offsetWidth;
      win.classList.add('pb-arrive');
      if (store.getState().run.phase === 'landing') play('transmitIn');
    }, POD_BAY_OPEN_DELAY_MS);
  });

  const offTick = onGameTick(() => { if (store.getState().ui.mode === 'tools') paint(); });
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.memoryRev}|${s.landing.ended}|${s.landing.window?.lz ?? ''}|${s.clock.paused}|${s.ui.mode}`, paint);
  paint();

  return () => {
    launchBtn.removeEventListener('click', onLaunch);
    endBtn.removeEventListener('click', onEnd);
    offStart();
    offTick();
    unsub();
    if (openTimer !== null) clearTimeout(openTimer);
    document.body.classList.remove('landing');
  };
}
