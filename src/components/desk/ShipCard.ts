// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { CardModel, CardTimeline } from '@systems/desk';
import { make } from '@components/dom';

// The SHIP CARD (02-map §4), docked right of the chart on a desktop and a bottom sheet on a phone: a large top block (the
// tags, the name, the world and its pods, then the lead: the colonists, the years early in green or late in red, and what
// the trip costs), the fit line, then the other Uplink rows, lighter
// (label left, value right; a continuation row has no label, so the fit line sits under MEMORY and the noise under BEAM;
// a warning row in red), then the TIMELINE strip: you leave, you get there, ▲ approach, green between the last two when
// early, red when the approach comes first; since slice 3b the deliveries' marks on it (`2629 Swap`, green before ▲ and
// red after) and their words under it. Built from systems/desk.ts cardModel only.

function timelineNode(line: Readonly<CardTimeline>): HTMLElement {
  const wrap = make('div', `dc-timeline${line.late ? ' late' : ''}`);
  const bar = make('div', 'dc-tl-bar');
  const years = line.marks.map((mark) => mark.year);
  const lo = Math.min(line.leave, ...years);
  const hi = Math.max(line.arrive, line.approach, ...years);
  const at = (year: number): string => `${(100 * (year - lo)) / Math.max(1, hi - lo)}%`;
  const span = make('span', 'dc-tl-span');
  span.style.left = at(Math.min(line.arrive, line.approach));
  span.style.width = `calc(${at(Math.max(line.arrive, line.approach))} - ${at(Math.min(line.arrive, line.approach))})`;
  const leave = make('span', 'dc-tl-mark leave');
  leave.style.left = at(line.leave);
  const arrive = make('span', 'dc-tl-mark arrive');
  arrive.style.left = at(line.arrive);
  const approach = make('span', 'dc-tl-mark approach', '▲');
  approach.style.left = at(line.approach);
  bar.append(span, leave, arrive, approach);
  // 3b: each delivery where it is in this ship's receiver, green before ▲ and red after (02 §4).
  for (const mark of line.marks) {
    const file = make('span', `dc-tl-file${mark.late ? ' late' : ''}`);
    file.style.left = at(mark.year);
    file.title = mark.text;
    bar.appendChild(file);
  }
  wrap.append(bar, make('div', 'dc-tl-text', line.text));
  if (line.marks.length > 0) {
    const files = make('div', 'dc-tl-files');
    for (const mark of line.marks) files.appendChild(make('span', `dc-tl-filetext${mark.late ? ' late' : ''}`, mark.text));
    wrap.appendChild(files);
  }
  return wrap;
}

export function renderShipCard(host: HTMLElement, card: Readonly<CardModel> | null, emptyText: string): void {
  if (card === null) {
    host.replaceChildren(make('div', 'dc-empty', emptyText));
    host.dataset.slot = '';
    return;
  }
  host.dataset.slot = String(card.slot);
  host.dataset.state = card.state;
  const top = make('div', 'dc-top');
  const tags = make('div', 'dc-tags');
  for (const tag of card.tags) tags.appendChild(make('span', `dc-tag${tag === card.tags.find((t) => /FINAL/.test(t)) ? ' final' : ''}`, tag));
  if (!card.reachable && card.state !== 'current') tags.appendChild(make('span', 'dc-tag dim', card.state.replace(/-/g, ' ').toUpperCase()));
  if (tags.childElementCount > 0) top.appendChild(tags);
  top.appendChild(make('div', 'dc-name', card.name));
  top.appendChild(make('div', 'dc-sub', card.sub));
  // The lead (the lead's call after the review): the colonists, the years early or late, what the trip costs.
  const lead = make('div', 'dc-lead');
  lead.appendChild(make('div', 'dc-colonists', card.colonists));
  if (card.schedule !== null) lead.appendChild(make('div', `dc-sched tone-${card.scheduleTone}`, card.schedule));
  if (card.cost !== null) lead.appendChild(make('div', 'dc-cost', card.cost));
  top.appendChild(lead);
  const rowNode = (row: CardModel['rows'][number]): HTMLElement => {
    const node = make('div', `dc-row key-${row.key} tone-${row.tone}${row.label === '' ? ' cont' : ''}`);
    node.append(make('span', 'dc-k', row.label), make('span', 'dc-v', row.value));
    return node;
  };
  const parts: HTMLElement[] = [top];
  // Then the fit line, then the rest, lighter.
  const fit = card.rows.find((row) => row.key === 'fit');
  if (fit !== undefined) {
    const fitNode = make('div', 'dc-rows dc-fit');
    fitNode.appendChild(rowNode(fit));
    parts.push(fitNode);
  }
  const rows = make('div', 'dc-rows dc-rest');
  for (const row of card.rows) if (row.key !== 'fit') rows.appendChild(rowNode(row));
  parts.push(rows);
  if (card.timeline !== null) parts.push(timelineNode(card.timeline));
  host.replaceChildren(...parts);
}
