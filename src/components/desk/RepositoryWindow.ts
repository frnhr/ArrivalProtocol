// Playtest 1: Track B-DESK owns this file (docs/phase3/impl/playtest-1-plan.md §3.6, §4 Batch B). Others ask by message.
import type { RepoModel, RepoRow } from '@systems/repository';
import { make } from '@components/dom';
import { REPO_TEXT } from '@data/repo-text';

// The REPOSITORY's upper half, FROM EARTH (02-map §3.8, §4; slice-3b-plan §1.1 items 1–5, §3 steps 2, 5–8), drawn from
// systems/repository.ts repoModel only (Track REPO owns the rule; this view never works out an ETA). Playtest 1 (B-DESK,
// §3.6): the desk's [R] tab holds two halves, this one and COMPILE HERE under it (TrainingWindow.ts); DeskScreen mounts
// both in one scrolling host. Top to bottom:
// • the head: `FROM EARTH [R]` and the rule `ONE REQUEST PER BEAM` (it was the window's foot);
// • the last-rm warning when the desk opened for it (04 §3.3, round 3), ARRIVAL CONTROL's line when it recommends nothing;
// • the ETA for the selected ship, once above the list (`ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME` in green,
//   `4 YRS LATE → …` in amber, NEVER in red: the years are every file's); nothing until a ship is selected (A-WORDS: the
//   `PICK A SHIP TO SEE …` line talked about the screen);
// • each file with its number key ([1]–[7]), size and effect, what the unit already has of it (`YOU HAVE 1`, note 12),
//   ARRIVAL CONTROL's one `:) RECOMMENDED FOR YOU` tag, and its REQUEST toggle (one request per beam; a second click
//   clears it);
// • IN TRANSIT, only while something is: the requests behind the unit (`Swap · 4 YRS BEHIND YOU`), green when they catch
//   up at the selected ship;
// • RESTRICTED: the system files CONTROL keeps, and why. The skills' rows are gone: they are compiled below.
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

// A half's head: its name, its key, and what the right side says (FROM EARTH: the beam's rule; COMPILE HERE: the bank).
export function halfHead(name: string, key: string): HTMLElement {
  const title = make('span', 'rp-half-name', name);
  title.appendChild(make('kbd', 'keycap rp-half-key', key));
  return title;
}

export function renderRepository(host: HTMLElement, model: Readonly<RepoModel>): void {
  const parts: HTMLElement[] = [];
  const head = make('div', 'rp-half-head');
  head.append(halfHead(REPO_TEXT.window.fromEarth, REPO_TEXT.window.key), make('span', 'rp-rule', REPO_TEXT.window.oneRequest));
  parts.push(head);
  if (model.available.some((row) => row.focus)) parts.push(make('div', 'rp-warn', REPO_TEXT.window.lastRm));
  if (model.recommended === null && model.recommendLine !== null) parts.push(make('div', 'rp-control', model.recommendLine));

  if (model.eta !== null) parts.push(make('div', `rp-eta eta-${etaTone(model)}`, model.eta));
  const available = make('div', 'rp-list');
  model.available.forEach((row, index) => available.appendChild(availableNode(row, index)));
  parts.push(available);

  if (model.inTransit.length > 0) {
    parts.push(make('div', 'rp-section', REPO_TEXT.window.inTransit));
    const transit = make('div', 'rp-list rp-transit');
    for (const row of model.inTransit) {
      const node = make('div', `rp-transit-row status-${row.status}`, row.text);
      node.classList.toggle('catches-up', row.catchesUp);
      node.dataset.request = row.requestId;
      transit.appendChild(node);
    }
    parts.push(transit);
  }

  if (model.restricted.length > 0) {
    parts.push(make('div', 'rp-section', REPO_TEXT.window.restricted));
    const restricted = make('div', 'rp-list rp-restricted');
    for (const row of model.restricted) {
      const node = make('div', 'rp-locked');
      node.dataset.id = row.id;
      node.append(make('span', 'rp-lock', REPO_TEXT.window.locked), make('span', 'rp-text', row.name), make('span', 'rp-why', row.why));
      restricted.appendChild(node);
    }
    parts.push(restricted);
  }
  host.replaceChildren(...parts);
}
