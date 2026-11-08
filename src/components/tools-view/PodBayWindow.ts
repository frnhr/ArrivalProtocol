// Slice 7b: Track VIEW makes one marked edit here (slice-7-plan.md §4.2: the RESTORED row, in paint).
// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { on } from '@systems/events';
import { play } from '@systems/audio';
import { capabilitiesNow } from '@systems/capabilities';
import { getDropSolution } from '@systems/drop-cache';
import { getPrediction } from '@systems/predict';
import { endLanding } from '@systems/landing';
import { launchDown, launchUp, playerLaunch, type LaunchConfirm } from '@systems/landing-controls';
import { bayWindowModel, type AutodropBayModel, type BayWindowModel } from '@systems/landing-hud';
import { pressAutodrop, setPassCount } from '@systems/autodrop';
import { setMode } from '@systems/mode';
import { askInline } from '@components/hud/InlineConfirm';
import { createScrambler } from '@components/hud/scrambler';
import { requireById, make } from '@components/dom';
import { POD_BAY_STATUS_TEXT } from '@data/landing-text';
import { AUTODROP_TEXT, lzLetter } from '@data/autodrop-text';
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
// Slice 1b: beside the bay, Bay Ctrl's pip in its band (BAND_COPY.bay's words: `BAY CTRL DAMAGED`), and with the file
// missing `NO BAY CTRL` in red with LAUNCH disabled (never "offline" next to pods, §3.10); under the counters the class
// line (`PLAINS · off-site pods score half`) and the no-go arcs' words (`NO-GO: LAVA`).
// Slice 4c (plan §3.8): AUTODROP. Its pip joins the title's pips (a click jumps to AUTODROP.skl in the MIND, as the Engine
// window's AUTOBURN pip does); under the counters its key line (`HOLD [L] · AUTODROP CENTRES EVERY POD`, `AUTODROP ▸ PASS
// [G]`) with the [G] button (v2 and v3; it rides in the phone bar on a phone), v2's rows (`A [−] 2 [+]` and their
// `BAY HAS 1 BY THEN`), and v3's plan table with its check line (`PLAN · 2 PASSES · A 1,000 · B 800 ✓`), forecast rows dim.
// The LAUNCH button is a hold for AUTODROP v1 (pointer down / up through landing-controls launchDown / launchUp, as [L]);
// a click with no pointer before it (a script, an assistive tool) is the manual launch.

export interface PodBayDeps {
  confirm: LaunchConfirm;
}

export function mountPodBayWindow(store: Store<GameState>, deps: PodBayDeps): () => void {
  const win = requireById('podBayWin');
  const launchBtn = requireById<HTMLButtonElement>('podLaunchBtn');
  const launchLabel = requireById('pbLaunchLabel');
  const launchStatus = requireById('pbLaunchStatus');
  const bayEl = requireById('pbBay');
  const ctrlEl = requireById('pbCtrl');
  const classEl = requireById('pbClass');
  const noGoEl = requireById('pbNoGo');
  const nextEl = requireById('pbNext');
  const lzsEl = requireById('pbLzs');
  const cantEl = requireById('pbCant');
  const endBtn = requireById<HTMLButtonElement>('pbEnd');
  const adEl = requireById('pbAutodrop');
  const adKeyEl = requireById('pbAdKey');
  const goBtn = requireById<HTMLButtonElement>('pbGoBtn');
  const passEl = requireById('pbPass');
  const planEl = requireById('pbPlan');
  const planRowsEl = requireById('pbPlanRows');
  const planCheckEl = requireById('pbPlanCheck');
  const planNotesEl = requireById('pbPlanNotes');
  // The AUTODROP pip, beside the window's file pips (WindowGrip builds that row): attached on the first paint that finds it.
  const adPip = make('button', 'pip');
  adPip.tabIndex = -1;
  adPip.dataset.skill = 'autodrop';
  const adPipGlyph = make('span', 'pip-glyph');
  const adPipLabel = make('span', 'pip-label');
  const adPipReading = make('span', 'pip-reading');
  adPip.append(adPipGlyph, adPipLabel, adPipReading);
  adPip.hidden = true;
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
    const model = bayWindowModel(state, getDropSolution(), getPrediction().outcome);
    const scramble = capabilitiesNow(state).telemetryScramble;
    patch(launchLabel, model.launch.label);
    patch(launchStatus, model.launch.status);
    if (launchBtn.dataset.look !== model.launch.look) launchBtn.dataset.look = model.launch.look;
    launchBtn.disabled = model.launch.look === 'blocked';
    patch(bayEl, scramblers.bay.apply(model.bay.text, scramble));
    bayEl.dataset.full = String(model.bay.reloadTac === null);
    bayEl.classList.toggle('offline', model.ctrl.offline);
    patch(ctrlEl, model.ctrl.text);
    if (ctrlEl.dataset.band !== model.ctrl.band) ctrlEl.dataset.band = model.ctrl.band;
    patch(classEl, model.cls.text);
    noGoEl.hidden = model.cls.noGo === null;
    patch(noGoEl, model.cls.noGo ?? '');
    patch(nextEl, scramblers.next.apply(model.nextText, scramble));
    nextEl.classList.toggle('hard', model.next?.touch === 'hard');
    nextEl.classList.toggle('none', model.next === null);
    paintLzs(model, scramble);
    cantEl.hidden = model.cantLaunch === 0;
    patch(cantEl, POD_BAY_STATUS_TEXT.cantLaunch(model.cantLaunch));
    patch(endBtn, model.endLanding.label);
    endBtn.disabled = !model.endLanding.enabled;
    paintAutodrop(model.autodrop);
    // (Slice 7b, Track VIEW's marked edit: the `RESTORED 4` row from systems/last-landing-hud.ts podBayRestoredRow goes here.)
  }

  let lastPip = '';
  let lastPass = '';
  let lastPlan = '';
  function paintAutodrop(model: AutodropBayModel | null): void {
    if (!adPip.isConnected) win.querySelector('.window-pips')?.appendChild(adPip);
    const pipKey = model === null ? '' : `${model.pip.look}|${model.pip.label}|${model.pip.reading}|${model.pip.title}`;
    if (pipKey !== lastPip) {
      lastPip = pipKey;
      adPip.hidden = model === null;
      if (model !== null) {
        adPip.dataset.look = model.pip.look;
        adPipGlyph.textContent = model.pip.glyph;
        adPipLabel.textContent = model.pip.label;
        adPipReading.textContent = model.pip.reading;
        adPipReading.hidden = model.pip.reading === '';
        adPip.title = model.pip.title;
      }
    }
    adEl.hidden = model === null;
    goBtn.hidden = model === null || !model.go.shown;
    if (model === null) {
      passEl.hidden = true;
      planEl.hidden = true;
      return;
    }
    patch(adKeyEl, model.key.text);
    if (adKeyEl.dataset.look !== model.key.look) adKeyEl.dataset.look = model.key.look;
    patch(goBtn, model.go.label);
    goBtn.classList.toggle('armed', model.go.armed);
    // v2's rows: rebuilt only when what they say changes (the buttons keep their nodes between ticks otherwise).
    passEl.hidden = model.pass === null;
    const passKey = model.pass === null ? '' : `${JSON.stringify(model.pass)}|${model.go.armed}`;
    if (passKey !== lastPass) {
      lastPass = passKey;
      passEl.replaceChildren();
      if (model.pass !== null) {
        passEl.appendChild(make('div', 'pb-pass-head', AUTODROP_TEXT.bay.passHead));
        for (const row of model.pass) {
          const line = make('div', 'pb-pass-row');
          const minus = make('button', 'pb-pass-step', '−');
          minus.tabIndex = -1;
          minus.dataset.lz = row.lz;
          minus.dataset.step = '-1';
          minus.disabled = row.n <= 0 || model.go.armed;
          const plus = make('button', 'pb-pass-step', '+');
          plus.tabIndex = -1;
          plus.dataset.lz = row.lz;
          plus.dataset.step = '1';
          plus.disabled = row.n >= row.max || model.go.armed;
          line.append(make('span', 'pb-pass-lz', lzLetter(row.lz)), minus, make('span', 'pb-pass-n', String(row.n)), plus);
          if (row.warn !== null) line.appendChild(make('span', 'pb-pass-warn', row.warn));
          passEl.appendChild(line);
        }
      }
    }
    planEl.hidden = model.plan === null;
    const planKey = model.plan === null ? '' : JSON.stringify(model.plan);
    if (planKey !== lastPlan && model.plan !== null) {
      lastPlan = planKey;
      planRowsEl.replaceChildren(...model.plan.rows.map((row) => {
        const node = make('div', 'pb-plan-row', row.text);
        node.classList.toggle('forecast', row.forecast);
        node.classList.toggle('mislanded', row.mislanded);
        node.classList.toggle('now', row.now);
        return node;
      }));
      patch(planCheckEl, model.plan.check);
      planCheckEl.classList.toggle('complete', model.plan.complete);
      planNotesEl.replaceChildren(...model.plan.notes.map((note) => make('div', 'pb-plan-note', note)));
    }
  }

  // The launch: the one path (landing-controls launchDown: AUTODROP's hold, or playerLaunch → requestLaunch), the confirm
  // through the inline pill. The button is pressed on pointer down, as [L] is on keydown, so AUTODROP v1 can take the
  // hold; pointer up (anywhere: the finger may slide off) and a lost pointer let go. The click that follows is swallowed.
  let pointerPressed = false;
  let holding = false;
  const letGo = (): void => {
    if (!holding) return;
    holding = false;
    launchUp(store);
  };
  const onLaunchDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    pointerPressed = true;
    holding = launchDown(store, deps.confirm) === 'held';
  };
  const onLaunch = (event: MouseEvent): void => {
    event.stopPropagation();
    if (pointerPressed) { pointerPressed = false; return; }
    playerLaunch(store, deps.confirm);
  };
  launchBtn.addEventListener('pointerdown', onLaunchDown);
  launchBtn.addEventListener('click', onLaunch);
  window.addEventListener('pointerup', letGo);
  window.addEventListener('pointercancel', letGo);
  window.addEventListener('blur', letGo);

  // AUTODROP's [G], its pass rows' [−] / [+], and its pip (a jump to the file in the MIND).
  const onGo = (event: MouseEvent): void => {
    event.stopPropagation();
    pressAutodrop(store);
  };
  goBtn.addEventListener('click', onGo);
  const onPassClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.pb-pass-step');
    const lz = button?.dataset.lz;
    if (!button || lz === undefined || button.disabled) return;
    event.stopPropagation();
    const model = bayWindowModel(store.getState(), getDropSolution(), getPrediction().outcome).autodrop;
    const row = model?.pass?.find((candidate) => candidate.lz === lz);
    if (row) setPassCount(store, lz, row.n + Number(button.dataset.step));
    paint();
  };
  passEl.addEventListener('click', onPassClick);
  const onPip = (event: MouseEvent): void => {
    event.stopPropagation();
    const segId = bayWindowModel(store.getState(), getDropSolution(), getPrediction().outcome).autodrop?.pip.segId ?? null;
    setMode(store, 'memory');
    if (segId !== null) store.update((draft) => { draft.ui.selectedId = segId; });
  };
  adPip.addEventListener('click', onPip);

  // END LANDING asks first: the pods still aboard are parked in orbit and not counted (§3.10).
  const onEnd = (event: MouseEvent): void => {
    event.stopPropagation();
    const model = bayWindowModel(store.getState(), getDropSolution(), getPrediction().outcome);
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
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.memoryRev}|${s.landing.ended}|${s.landing.window?.lz ?? ''}|${s.clock.paused}|${s.ui.mode}|${s.landing.autodrop.armed}|${JSON.stringify(s.landing.autodrop.pass)}`, paint);
  paint();

  return () => {
    launchBtn.removeEventListener('pointerdown', onLaunchDown);
    launchBtn.removeEventListener('click', onLaunch);
    window.removeEventListener('pointerup', letGo);
    window.removeEventListener('pointercancel', letGo);
    window.removeEventListener('blur', letGo);
    goBtn.removeEventListener('click', onGo);
    passEl.removeEventListener('click', onPassClick);
    adPip.removeEventListener('click', onPip);
    adPip.remove();
    endBtn.removeEventListener('click', onEnd);
    offStart();
    offTick();
    unsub();
    if (openTimer !== null) clearTimeout(openTimer);
    document.body.classList.remove('landing');
  };
}
