import type { RepoModel, RepoRow } from '@systems/repository';
import { make } from '@components/dom';
import { REPO_TEXT } from '@data/repo-text';

// The REPOSITORY (02-map §3.8, §4; slice-3b-plan §1.1 items 1–5, §3 steps 2, 5–8): the desk's [R] tab, drawn from
// systems/repository.ts repoModel only (Track REPO owns the rule; this view never works out an ETA). Three lists:
// • AVAILABLE: each file with its number key ([1]–[7]), size and effect, its ETA for the selected ship (`ARRIVES 2337 ·
//   HALCYON APPROACH 2352 · IN TIME` in green, `4 YRS LATE → …` in amber, NEVER in red), ARRIVAL CONTROL's one
//   `:) RECOMMENDED FOR YOU` tag, and its REQUEST toggle (one request per transmit; a second click clears it);
// • IN TRANSIT: the requests behind the unit (`Swap · 4 YRS BEHIND YOU`), green when they catch up at the selected ship;
// • RESTRICTED: the locked rows and why (`Train it yourself :)`).
// After the last rm was lost the desk opens here with Rm lit and the warning on top (04 §3.3, round 3). The classic world
// has no repository: one line says so. DeskScreen owns the clicks (data-file) and the keys.

function etaTone(row: Readonly<RepoRow>): string {
  return row.forecast === null ? 'none' : row.forecast.kind;
}

function availableNode(row: Readonly<RepoRow>, index: number, noShip: boolean): HTMLButtonElement {
  const node = make('button', 'rp-row');
  node.tabIndex = -1;
  node.dataset.file = row.id;
  node.classList.toggle('recommended', row.recommended);
  node.classList.toggle('requested', row.requested);
  node.classList.toggle('focus', row.focus);
  const key = make('kbd', 'keycap rp-key', String(index + 1));
  const main = make('span', 'rp-main');
  main.appendChild(make('span', 'rp-text', row.text));
  const eta = make('span', `rp-eta eta-${etaTone(row)}`, row.eta ?? (noShip ? REPO_TEXT.window.noShip : ''));
  if (eta.textContent !== '') main.appendChild(eta);
  if (row.recommended) main.appendChild(make('span', 'rp-tag', REPO_TEXT.window.recommended));
  const toggle = make('span', 'rp-req', row.requested ? REPO_TEXT.window.requested : REPO_TEXT.window.request);
  node.append(key, main, toggle);
  return node;
}

export function renderRepository(host: HTMLElement, model: Readonly<RepoModel>): void {
  host.dataset.world = model.world;
  if (model.world !== 'arm') {
    host.replaceChildren(make('div', 'rp-classic', REPO_TEXT.window.classic));
    return;
  }
  const parts: HTMLElement[] = [];
  if (model.available.some((row) => row.focus)) parts.push(make('div', 'rp-warn', REPO_TEXT.window.lastRm));
  if (model.recommended === null && model.recommendLine !== null) parts.push(make('div', 'rp-control', model.recommendLine));

  parts.push(make('div', 'rp-section', REPO_TEXT.window.available));
  const available = make('div', 'rp-list');
  model.available.forEach((row, index) => available.appendChild(availableNode(row, index, model.selected === null)));
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
