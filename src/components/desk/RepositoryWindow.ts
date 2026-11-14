// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { RepoModel, RepoRow } from '@systems/repository';
import { make } from '@components/dom';
import { REPO_TEXT } from '@data/repo-text';

// The REPOSITORY (02-map §3.8, §4; slice-3b-plan §1.1 items 1–5, §3 steps 2, 5–8): the desk's [R] tab, drawn from
// systems/repository.ts repoModel only (Track REPO owns the rule; this view never works out an ETA). Three lists:
// • AVAILABLE: the ETA for the selected ship once above the list (`ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME` in green,
//   `4 YRS LATE → …` in amber, NEVER in red: the years are every file's), then each file with its number key ([1]–[7]),
//   size and effect, what the unit already has of it (`YOU HAVE 1`, playtest 1), ARRIVAL CONTROL's one `:) RECOMMENDED FOR
//   YOU` tag, and its REQUEST toggle (one request per transmit; a second click clears it);
// • IN TRANSIT: the requests behind the unit (`Swap · 4 YRS BEHIND YOU`), green when they catch up at the selected ship;
// • RESTRICTED: the locked rows and why (`Train it yourself :)`).
// After the last rm was lost the desk opens here with Rm lit and the warning on top (04 §3.3, round 3).
// DeskScreen owns the clicks (data-file) and the keys.

function etaTone(model: Readonly<RepoModel>): string {
  return model.forecast === null ? 'none' : model.forecast.kind;
}

function availableNode(row: Readonly<RepoRow>, index: number): HTMLButtonElement {
  const node = make('button', 'rp-row');
  node.tabIndex = -1;
  node.dataset.file = row.id;
  node.classList.toggle('recommended', row.recommended);
  node.classList.toggle('requested', row.requested);
  node.classList.toggle('focus', row.focus);
  const key = make('kbd', 'keycap rp-key', String(index + 1));
  const main = make('span', 'rp-main');
  main.appendChild(make('span', 'rp-text', row.text));
  // Playtest 1 (note 12): the copies already owned, dim (`YOU HAVE 1`); none owned and none coming stands out.
  const have = make('span', 'rp-have', row.have);
  have.classList.toggle('none', row.owned === 0 && row.coming === 0);
  main.appendChild(have);
  if (row.recommended) main.appendChild(make('span', 'rp-tag', REPO_TEXT.window.recommended));
  const toggle = make('span', 'rp-req', row.requested ? REPO_TEXT.window.requested : REPO_TEXT.window.request);
  node.append(key, main, toggle);
  return node;
}

export function renderRepository(host: HTMLElement, model: Readonly<RepoModel>): void {
  const parts: HTMLElement[] = [];
  if (model.available.some((row) => row.focus)) parts.push(make('div', 'rp-warn', REPO_TEXT.window.lastRm));
  if (model.recommended === null && model.recommendLine !== null) parts.push(make('div', 'rp-control', model.recommendLine));

  parts.push(make('div', 'rp-section', REPO_TEXT.window.available));
  const eta = model.eta ?? (model.selected === null ? REPO_TEXT.window.noShip : null);
  if (eta !== null) parts.push(make('div', `rp-eta eta-${etaTone(model)}`, eta));
  const available = make('div', 'rp-list');
  model.available.forEach((row, index) => available.appendChild(availableNode(row, index)));
  parts.push(available);

  parts.push(make('div', 'rp-section', REPO_TEXT.window.inTransit));
  const transit = make('div', 'rp-list rp-transit');
  if (model.inTransit.length === 0) transit.appendChild(make('div', 'rp-none', REPO_TEXT.window.nothingInTransit));
  for (const row of model.inTransit) {
    const node = make('div', `rp-transit-row status-${row.status}`, row.text);
    node.classList.toggle('catches-up', row.catchesUp);
    node.dataset.request = row.requestId;
    transit.appendChild(node);
  }
  parts.push(transit);

  parts.push(make('div', 'rp-section', REPO_TEXT.window.restricted));
  const restricted = make('div', 'rp-list rp-restricted');
  for (const row of model.restricted) {
    const node = make('div', 'rp-locked');
    node.dataset.id = row.id;
    node.append(make('span', 'rp-lock', REPO_TEXT.window.locked), make('span', 'rp-text', row.name), make('span', 'rp-why', row.why));
    restricted.appendChild(node);
  }
  parts.push(restricted);
  parts.push(make('div', 'rp-foot', REPO_TEXT.window.oneRequest));
  host.replaceChildren(...parts);
}
