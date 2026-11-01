import type { ChartModel, ChartNode } from '@systems/desk';
import { drawChart, PORTRAIT_ROTATE_DEG, LANDSCAPE_ROTATE_DEG, type ChartDrawOpts, type ChartGeometry } from '@components/desk/chart-draw';
import { make } from '@components/dom';

// The DESK's STAR CHART window body (02-map §4): the SVG (components/desk/chart-draw.ts), redrawn when the model or the
// host's size changes, a hover tag with the node's label and reason (`TOO LATE BY 18 YRS`), and the node clicks handed
// to the desk. On a phone (portrait host) the arm stands upright and the chart scrolls along it, opening on the ship
// being left. The view owns no state: the desk passes the model in and decides what a click means.

export interface StarChartHandle {
  paint: (model: Readonly<ChartModel>, beatPending: readonly number[]) => void;
  ungrey: (slot: number) => void;
  destroy: () => void;
}

export interface StarChartOpts {
  onPick: (slot: number) => void;
  onHover: (node: Readonly<ChartNode> | null) => void;
  portrait: () => boolean;
}

export function mountStarChart(host: HTMLElement, opts: StarChartOpts): StarChartHandle {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'star-chart');
  svg.setAttribute('role', 'img');
  const tip = make('div', 'chart-tip');
  tip.hidden = true;
  const tipLabel = make('div', 'chart-tip-label');
  const tipReason = make('div', 'chart-tip-reason');
  tip.append(tipLabel, tipReason);
  host.append(svg, tip);

  let model: ChartModel | null = null;
  let pending: number[] = [];
  let geo: ChartGeometry | null = null;
  let lastKey = '';
  let scrolledFor = -1;

  function draw(): void {
    if (!model) return;
    const width = Math.floor(host.clientWidth);
    const height = Math.floor(host.clientHeight);
    if (width < 40 || height < 40) return;
    const portrait = opts.portrait();
    const drawOpts: ChartDrawOpts = {
      width, height: portrait ? null : height, rotateDeg: portrait ? PORTRAIT_ROTATE_DEG : LANDSCAPE_ROTATE_DEG, labels: 'all', beams: true,
      clouds: true, rings: true, trail046: true, route: true, stars: true, idPrefix: 'desk',
    };
    geo = drawChart(svg, model, drawOpts);
    svg.setAttribute('aria-label', model.nodes.filter((node) => node.state === 'reachable' || node.state === 'urgent').map((node) => node.label).join(', '));
    for (const slot of pending) svg.querySelector(`[data-slot="${slot}"]`)?.classList.add('beat-pending');
    // A phone opens on the ship being left (the arm is taller than the screen).
    if (portrait && scrolledFor !== model.current) {
      const here = model.nodes.find((node) => node.slot === model!.current);
      if (here) {
        const p = geo.at(here.x, here.y);
        host.scrollTop = Math.max(0, p.py - host.clientHeight * 0.65);
        scrolledFor = model.current;
      }
    }
  }

  function paint(next: Readonly<ChartModel>, beatPending: readonly number[]): void {
    const key = JSON.stringify(next) + beatPending.join(',');
    model = structuredClone(next) as ChartModel;
    pending = [...beatPending];
    if (key === lastKey) return;
    lastKey = key;
    draw();
  }

  function ungrey(slot: number): void {
    pending = pending.filter((s) => s !== slot);
    svg.querySelector(`[data-slot="${slot}"]`)?.classList.remove('beat-pending');
  }

  const nodeOf = (target: EventTarget | null): ChartNode | null => {
    const g = (target as Element | null)?.closest?.('[data-slot]');
    if (!g || !model) return null;
    const slot = Number(g.getAttribute('data-slot'));
    return model.nodes.find((node) => node.slot === slot) ?? null;
  };
  let hovered = -1;
  const onMove = (event: PointerEvent): void => {
    const node = nodeOf(event.target);
    if (!node || !geo) {
      if (hovered !== -1) { hovered = -1; tip.hidden = true; opts.onHover(null); }
      return;
    }
    if (node.slot === hovered) return;
    hovered = node.slot;
    tipLabel.textContent = node.label;
    tipReason.textContent = node.reason ?? '';
    tipReason.hidden = node.reason === null;
    tip.dataset.state = node.state;
    const p = geo.at(node.x, node.y);
    tip.hidden = false;
    const left = Math.min(Math.max(4, p.px + 14), host.clientWidth + host.scrollLeft - tip.offsetWidth - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(4, p.py - tip.offsetHeight - 10)}px`;
    opts.onHover(node);
  };
  const onLeave = (): void => { hovered = -1; tip.hidden = true; opts.onHover(null); };
  const onClick = (event: MouseEvent): void => {
    const node = nodeOf(event.target);
    if (!node) return;
    event.stopPropagation();
    opts.onPick(node.slot);
  };
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);
  svg.addEventListener('click', onClick);
  const resize = new ResizeObserver(() => { lastKey = ''; draw(); });
  resize.observe(host);

  return {
    paint,
    ungrey,
    destroy: () => {
      resize.disconnect();
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerleave', onLeave);
      svg.removeEventListener('click', onClick);
      svg.remove();
      tip.remove();
    },
  };
}
