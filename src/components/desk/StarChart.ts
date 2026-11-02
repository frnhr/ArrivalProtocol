// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { ChartModel, ChartNode } from '@systems/desk';
import { drawChart, PORTRAIT_ROTATE_DEG, LANDSCAPE_ROTATE_DEG, type ChartDrawOpts, type ChartGeometry } from '@components/desk/chart-draw';
import { make } from '@components/dom';

// The DESK's STAR CHART window body (02-map §4): the SVG (components/desk/chart-draw.ts), redrawn when the model or the
// host's size changes, a hover tag with the node's label and reason (`TOO LATE BY 18 YRS`), and the node clicks handed
// to the desk. On a phone (portrait host) the arm stands upright and the chart scrolls along it, opening on the ship
// being left. The view owns no state: the desk passes the model in and decides what a click means.
// Slice 3c: the tag also names a node's history (`2ND RUN ON THE CHART`, `REPORTED HOME`) and the last unit's claim on its
// world (`UNIT-047 GETS THERE FIRST`), and a trail mark, the beacon or an older colony shows its own words (data-tip). The
// opening beat paints the last unit's newly passed colonies as TAKEN first and turns them green one by one (green()).

export interface StarChartHandle {
  paint: (model: Readonly<ChartModel>, beatPending: readonly number[], greenPending?: readonly number[]) => void;
  ungrey: (slot: number) => void;
  green: (slot: number) => void;
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
  const tipHistory = make('div', 'chart-tip-history');
  const tipTaken = make('div', 'chart-tip-taken');
  tip.append(tipLabel, tipReason, tipHistory, tipTaken);
  host.append(svg, tip);

  let model: ChartModel | null = null;
  let pending: number[] = [];
  let greening: number[] = [];
  let geo: ChartGeometry | null = null;
  let lastKey = '';
  let scrolledFor = -1;

  const colonyMarks = (slot: number): NodeListOf<Element> => svg.querySelectorAll(`.tm.kind-colony[data-trail-slot="${slot}"]`);

  function draw(): void {
    if (!model) return;
    const width = Math.floor(host.clientWidth);
    const height = Math.floor(host.clientHeight);
    if (width < 40 || height < 40) return;
    const portrait = opts.portrait();
    const drawOpts: ChartDrawOpts = {
      width, height: portrait ? null : height, rotateDeg: portrait ? PORTRAIT_ROTATE_DEG : LANDSCAPE_ROTATE_DEG, labels: 'all', beams: true,
      clouds: true, rings: true, trail: true, route: true, stars: true, idPrefix: 'desk',
    };
    geo = drawChart(svg, model, drawOpts);
    svg.setAttribute('aria-label', model.nodes.filter((node) => node.state === 'reachable' || node.state === 'urgent').map((node) => node.label).join(', '));
    for (const slot of pending) svg.querySelector(`[data-slot="${slot}"]`)?.classList.add('beat-pending');
    for (const slot of greening) colonyMarks(slot).forEach((g) => g.classList.add('beat-taken'));
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

  function paint(next: Readonly<ChartModel>, beatPending: readonly number[], greenPending: readonly number[] = []): void {
    const key = `${JSON.stringify(next)}${beatPending.join(',')}|${greenPending.join(',')}`;
    model = structuredClone(next) as ChartModel;
    pending = [...beatPending];
    greening = [...greenPending];
    if (key === lastKey) return;
    lastKey = key;
    draw();
  }

  function ungrey(slot: number): void {
    pending = pending.filter((s) => s !== slot);
    svg.querySelector(`[data-slot="${slot}"]`)?.classList.remove('beat-pending');
  }

  function green(slot: number): void {
    greening = greening.filter((s) => s !== slot);
    colonyMarks(slot).forEach((g) => g.classList.remove('beat-taken'));
  }

  const nodeOf = (target: EventTarget | null): ChartNode | null => {
    const g = (target as Element | null)?.closest?.('[data-slot]');
    if (!g || !model) return null;
    const slot = Number(g.getAttribute('data-slot'));
    return model.nodes.find((node) => node.slot === slot) ?? null;
  };
  // A trail mark, the beacon or an older colony (chart-draw's data-tip): its words, and the element to put the tag by.
  const markOf = (target: EventTarget | null): { el: Element; words: string; more: string | null } | null => {
    const g = (target as Element | null)?.closest?.('[data-tip]');
    const words = g?.getAttribute('data-tip') ?? null;
    if (!g || words === null) return null;
    return { el: g, words, more: g.getAttribute('data-tip2') };
  };
  let hovered = '';
  const place = (px: number, py: number): void => {
    tip.hidden = false;
    const left = Math.min(Math.max(4, px + 14), host.clientWidth + host.scrollLeft - tip.offsetWidth - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(4, py - tip.offsetHeight - 10)}px`;
  };
  const hide = (): void => {
    if (hovered === '') return;
    hovered = '';
    tip.hidden = true;
    opts.onHover(null);
  };
  const onMove = (event: PointerEvent): void => {
    const mark = markOf(event.target);
    if (mark !== null && geo !== null) {
      const key = `m:${mark.words}`;
      if (key === hovered) return;
      hovered = key;
      tipLabel.textContent = mark.words;
      tipReason.textContent = mark.more ?? '';
      tipReason.hidden = mark.more === null;
      tipHistory.hidden = true;
      tipTaken.hidden = true;
      tip.dataset.state = 'mark';
      const box = mark.el.getBoundingClientRect();
      const at = host.getBoundingClientRect();
      place(box.left - at.left + box.width / 2 + host.scrollLeft, box.top - at.top + box.height / 2 + host.scrollTop);
      return;
    }
    const node = nodeOf(event.target);
    if (!node || !geo) { hide(); return; }
    const key = `n:${node.slot}`;
    if (key === hovered) return;
    hovered = key;
    tipLabel.textContent = node.label;
    tipReason.textContent = node.reason ?? '';
    tipReason.hidden = node.reason === null;
    tipHistory.textContent = node.history ?? '';
    tipHistory.hidden = node.history === null;
    tipTaken.textContent = node.taken ?? '';
    tipTaken.hidden = node.taken === null;
    tip.dataset.state = node.state;
    const p = geo.at(node.x, node.y);
    place(p.px, p.py);
    opts.onHover(node);
  };
  const onClick = (event: MouseEvent): void => {
    const node = nodeOf(event.target);
    if (!node) return;
    event.stopPropagation();
    opts.onPick(node.slot);
  };
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('click', onClick);
  const resize = new ResizeObserver(() => { lastKey = ''; draw(); });
  resize.observe(host);

  return {
    paint,
    ungrey,
    green,
    destroy: () => {
      resize.disconnect();
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerleave', hide);
      svg.removeEventListener('click', onClick);
      svg.remove();
      tip.remove();
    },
  };
}
