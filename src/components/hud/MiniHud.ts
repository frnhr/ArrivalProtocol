import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { getPrediction, getSensedPrediction, type Prediction } from '@systems/predict';
import { capabilitiesNow } from '@systems/capabilities';
import { onOpsChange } from '@systems/ops-core';
import { setMode } from '@systems/mode';
import { onTargetTally } from '@systems/landing-rules';
import { LANDING_HUD_TEXT } from '@data/landing-text';
import {
  countdownChip, plotChip, fuelModel, thrustLimitModel, paceLabel, plotViewRadius, mindChipModel, overclockBadge, plotZones,
  formatCountdown,
} from '@systems/flight-hud';
import { autoburnArmedInTac, autoburnAvailable } from '@systems/autoburn';
import { AUTO_MINI_TEXT } from '@data/skill-text';
import { makeProjector } from '@/types/orbit';
import { requireById } from '@components/dom';
import { svgEl, fmt, setCircle, annulus, circlePath, pathsByColour, bandWidth } from './plot-draw';
import { MINI_PLOT_VIEWBOX, PLOT_FUZZ_MIN_UNITS, PLOT_PLANET_MIN_UNITS } from '@data/tuning';

// The two glances across the split (§3.2, §7.1, §9 WP4 item 11):
// • In blue, the mini-HUD card (bottom-right, under INSPECT): the ship's main countdown, a small
//   plot of the predicted path in its line colours, the line state, FUEL with the THRUST LIMIT the
//   mind is costing, and the pace (`OVERCLOCK ×¼` while the world slows for you). It is what you
//   watch while you hack: a countdown going red here means TAB back. A click goes back too.
// • In amber, the MIND chip above the screen toggle: busy threads and REPAIR CHARGE, the two
//   things a burn competes with. A click jacks in.
// The card reads what the instruments show (the sensed prediction): a blind sensor greys its plot
// too. AUTOBURN (WP9) has a line of its own in the skill's violet: READY when [B] would engage it (the MIND is
// where it pays off, and nothing else there says so), ARMED with its countdown, then FLYING with the card's
// border pulsing violet. Its plot carries the hazard zones in their verdict colours (WP9): a kid fighting in
// blue sees the debris cloud turn from red to green as AUTOBURN or their own correction flies the ship.
// Painted per tick only while its screen is up, patching what changed.

const MARGIN = 4;          // viewBox units kept clear around the plot radius
const SHIP_DOT = 2.4;      // viewBox units

interface PlotNodes {
  planet: SVGCircleElement;
  zones: SVGGElement;
  ring: SVGPathElement;
  band: SVGPathElement;
  flyby: SVGPathElement;
  green: SVGPathElement;
  impact: SVGPathElement;
  ship: SVGCircleElement;
  dark: SVGTextElement;
}

function buildPlot(svg: SVGSVGElement): PlotNodes {
  svg.setAttribute('viewBox', `0 0 ${MINI_PLOT_VIEWBOX} ${MINI_PLOT_VIEWBOX}`);
  const nodes: PlotNodes = {
    planet: svgEl('circle', 'mh-planet'),
    zones: svgEl('g', 'mh-zones'),
    ring: svgEl('path', 'mh-ring'),
    band: svgEl('path', 'mh-band'),
    flyby: svgEl('path', 'mh-path mh-path-flyby'),
    green: svgEl('path', 'mh-path mh-path-green'),
    impact: svgEl('path', 'mh-path mh-path-impact'),
    ship: svgEl('circle', 'mh-ship'),
    dark: svgEl('text', 'mh-dark'),
  };
  nodes.dark.textContent = 'NO SIGNAL';
  nodes.dark.setAttribute('x', fmt(MINI_PLOT_VIEWBOX / 2));
  nodes.dark.setAttribute('y', fmt(MINI_PLOT_VIEWBOX / 2));
  nodes.dark.setAttribute('text-anchor', 'middle');
  svg.append(nodes.planet, nodes.ring, nodes.zones, nodes.band, nodes.flyby, nodes.green, nodes.impact, nodes.ship, nodes.dark);
  return nodes;
}

export function mountMiniHud(store: Store<GameState>): () => void {
  const card = requireById('miniHud');
  const paceEl = requireById('mhPace');
  const cdEl = requireById('mhCountdown');
  const cdLabel = requireById('mhCdLabel');
  const cdTime = requireById('mhCdTime');
  const cdBadge = requireById('mhCdBadge');
  const stateEl = requireById('mhState');
  const fuelFill = requireById('mhFuelFill');
  const fuelLimit = requireById('mhFuelLimit');
  const fuelVal = requireById('mhFuelVal');
  const limitEl = requireById('mhLimit');
  const autoEl = requireById('mhAuto');
  const printRow = requireById('mhPrint');
  const printText = requireById('mhPrintText');
  const printFast = requireById<HTMLButtonElement>('mhPrintFast');
  const intactEl = requireById('mhIntact');
  const nodes = buildPlot(requireById<SVGSVGElement>('mhPlot'));
  const chip = requireById<HTMLButtonElement>('mindChip');
  const chipDots = requireById('mindChipDots');
  const chipThreads = requireById('mindChipThreads');
  const chipCharge = requireById('mindChipCharge');

  const patch = (element: HTMLElement, text: string): void => {
    if (element.textContent !== text) element.textContent = text;
  };

  // --- The blue card ---
  let lastPred: Prediction | null = null;
  let lastPlotKey = '';
  function paintPlot(state: Readonly<GameState>, pred: Prediction): void {
    const plot = capabilitiesNow(state).plot;
    const viewR = plotViewRadius(state);
    const proj = makeProjector(viewR, MINI_PLOT_VIEWBOX, MARGIN);
    const half = MINI_PLOT_VIEWBOX / 2;
    const plotKey = `${plot.mode}|${plot.fuzzKm}|${viewR}`;
    if (pred !== lastPred || plotKey !== lastPlotKey) {
      lastPred = pred;
      lastPlotKey = plotKey;
      const { planet, ring } = state.level;
      // Never under a few units, so a long SKIP's far zoom still shows what the loop goes around (PLOT_PLANET_MIN_UNITS).
      setCircle(nodes.planet, half, half, Math.max(planet.R * proj.scale, PLOT_PLANET_MIN_UNITS));
      nodes.ring.setAttribute('d', annulus(half, half, ring.max * proj.scale, ring.min * proj.scale));
      const dark = plot.mode === 'no-signal';
      const blind = plot.mode === 'uncertain';
      const paths = pathsByColour(pred, proj);
      const colours = !dark && !blind;
      nodes.flyby.setAttribute('d', colours ? paths.flyby : '');
      nodes.green.setAttribute('d', colours ? paths.green : '');
      nodes.impact.setAttribute('d', colours ? paths.impact : '');
      nodes.band.setAttribute('d', blind ? paths.whole : '');
      // The NAV PLOT's minimum band is for its 320-unit plot; at this size the ≈ minimum reads.
      if (blind) nodes.band.setAttribute('stroke-width', fmt(bandWidth(plot.fuzzKm, proj, PLOT_FUZZ_MIN_UNITS)));
      nodes.dark.style.display = dark ? '' : 'none';
      nodes.ring.classList.toggle('hot', colours && pred.fit.inRing);
      const zones = plotZones(state, pred, plot);
      while (nodes.zones.children.length > zones.length) nodes.zones.lastChild?.remove();
      zones.forEach((model, i) => {
        let glyph = nodes.zones.children[i] as SVGPathElement | undefined;
        if (!glyph) { glyph = svgEl('path', ''); nodes.zones.appendChild(glyph); }
        glyph.setAttribute('class', `mh-zone verdict-${model.verdict}`);
        const zone = model.zone;
        if (zone.kind === 'debris') {
          const spot = proj.project(zone.centre);
          glyph.setAttribute('d', circlePath(spot.x, spot.y, zone.r * proj.scale));
        } else {
          glyph.setAttribute('d', annulus(half, half, zone.rOut * proj.scale, zone.rIn * proj.scale));
        }
      });
    }
    const ship = proj.project({ x: state.orbit.x, y: state.orbit.y });
    setCircle(nodes.ship, ship.x, ship.y, SHIP_DOT);
  }

  let lastCdClass = '';
  let lastBars = '';
  function paintCard(): void {
    const state = store.getState();
    const pred = getSensedPrediction();
    patch(paceEl, paceLabel(state));

    // While printing nothing is burning or counting down: the card trades the countdown row and the
    // THRUST LIMIT line for the printing rows below, and keeps its height (at 1280×720 a taller card
    // squeezes the strip and INSPECT).
    const landing = state.run.phase === 'landing';

    // The header's countdown, with its ▸▸ (fast-forwarding) or ×¼ (OVERCLOCK) badge.
    const countdown = countdownChip(state, pred);
    cdEl.hidden = landing && !countdown;
    const badge = countdown?.fastForward ? '▸▸' : countdown?.slow ? overclockBadge() : '';
    patch(cdLabel, countdown ? countdown.label : '—');
    patch(cdTime, countdown ? countdown.time : '');
    patch(cdBadge, badge);
    const cdClass = `mh-countdown${countdown?.urgent ? ' urgent' : ''}`;
    if (cdClass !== lastCdClass) { cdEl.className = cdClass; lastCdClass = cdClass; }

    const line = plotChip(state, pred, capabilitiesNow(state).plot);
    patch(stateEl, line.text);
    if (stateEl.dataset.tone !== line.tone) stateEl.dataset.tone = line.tone;

    // FUEL and its NEEDED as the Engine window shows them: from the sensed prediction, as the strip reads it (§6.2:
    // every player-facing number), so its USE IT ALL and the strip's WAIT come from one snapshot even while a failing
    // Sensor Interp holds the plot stale (LEAD-2 review round 2).
    const fuel = fuelModel(state, pred);
    const engineLimit = thrustLimitModel(state);
    const limit = landing ? { ...engineLimit, limited: false } : engineLimit;
    const barsKey = `${fuel.pct.toFixed(1)}|${fuel.short}|${limit.limited ? limit.capPct : ''}`;
    if (barsKey !== lastBars) {
      lastBars = barsKey;
      fuelFill.style.width = `${fuel.pct}%`;
      fuelFill.classList.toggle('low', fuel.short);
      fuelLimit.hidden = !limit.limited;
      if (limit.limited) fuelLimit.style.width = `${100 - limit.capPct}%`;
    }
    patch(fuelVal, fuel.text);
    limitEl.hidden = !limit.limited;
    patch(limitEl, limit.limited ? limit.text : '');

    // WP9: AUTOBURN ready, armed or at work, in the skill's violet: the kid fighting in blue sees that [B] would
    // help, and then their skill fly the ship.
    const autoPhase = state.burn.auto.phase;
    const flying = autoPhase === 'pointing' || autoPhase === 'burning';
    let autoText = '';
    if (autoPhase === 'armed') autoText = AUTO_MINI_TEXT.armed(formatCountdown(autoburnArmedInTac(state, getPrediction())));
    else if (flying) autoText = AUTO_MINI_TEXT.flying;
    else if (autoburnAvailable(state, getPrediction())) autoText = AUTO_MINI_TEXT.ready;
    autoEl.hidden = autoText === '';
    patch(autoEl, autoText);
    card.classList.toggle('auto-flying', flying);

    // While landing: the pods down, and under it the ON TARGET star as it stands (`★ ON TARGET 5/6`).
    // TODO(slice1a-UI): miniHudLanding (landing-hud.ts): the next window and the bay.
    printRow.hidden = !landing;
    intactEl.hidden = !landing;
    printFast.hidden = true;
    if (landing) {
      const down = state.landing.pods.filter((record) => record.fate.kind === 'down').length;
      patch(printText, LANDING_HUD_TEXT.crumbLanding(down, state.landing.pods.length));
      const tally = onTargetTally(state);
      const tone = tally.earned ? 'good' : tally.possible ? 'risk' : 'lost';
      patch(intactEl, `${tone === 'lost' ? '☆' : '★'} ${LANDING_HUD_TEXT.onTarget(tally.onTargetPods, tally.pods)}`);
      if (intactEl.dataset.tone !== tone) intactEl.dataset.tone = tone;
    }

    paintPlot(state, pred);
  }

  // --- The amber MIND chip ---
  let lastChip = '';
  function paintChip(): void {
    const model = mindChipModel(store.getState());
    const key = `${model.busy}|${model.total}|${model.charge}`;
    if (key === lastChip) return;
    lastChip = key;
    while (chipDots.children.length !== model.total) {
      if (chipDots.children.length < model.total) chipDots.appendChild(document.createElement('span'));
      else chipDots.lastElementChild?.remove();
    }
    Array.from(chipDots.children).forEach((dot, i) => { dot.className = `mind-chip-dot${i < model.busy ? ' lit' : ''}`; });
    chipThreads.textContent = `${model.busy}/${model.total}`;
    chipCharge.textContent = String(model.charge);
  }

  const onCardClick = (): void => setMode(store, 'tools');
  const onChipClick = (): void => setMode(store, 'memory');
  card.addEventListener('click', onCardClick);
  chip.addEventListener('click', onChipClick);

  const paintVisible = (): void => {
    if (store.getState().ui.mode === 'memory') paintCard();
    else paintChip();
  };
  paintCard();
  paintChip();
  const offTick = onPostTick(paintVisible);
  // Threads and charge change on AI time, also while the world is paused (no game ticks needed).
  const offOps = onOpsChange(() => paintChip());
  const unsub = store.subscribe((s) => `${s.ui.memoryRev}|${s.ui.mode}|${s.run.phase}`, paintVisible);

  return () => {
    card.removeEventListener('click', onCardClick);
    chip.removeEventListener('click', onChipClick);
    offTick();
    offOps();
    unsub();
  };
}
