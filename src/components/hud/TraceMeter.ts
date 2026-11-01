import type { TraceMeter } from '@systems/hollow-hud';
import { make } from '@components/dom';

// The TRACE meter (04 §4: three pink cells, `TRACE ■■□`) drawn into a host element from systems/hollow-hud.ts traceMeter,
// the one model the MIND header, the mini-HUD and the amber MIND chip share. The cells are boxes (sharper than ■ □ in a
// small font), the whole line is the host's aria-label and title. Once HOLLOW is aboard, `IT RIDES WITH YOU · 10 BLOCKS`
// stands in the meter's place. `compact` (the narrow hosts) drops the note and shortens the aboard line. The host keeps
// the last drawn key, so a per-tick paint touches the DOM only when the meter changes.

export interface TraceMeterOpts {
  compact?: boolean;
}

export function paintTraceMeter(host: HTMLElement, meter: TraceMeter, opts: TraceMeterOpts = {}): void {
  const compact = opts.compact === true;
  const key = `${meter.visible}|${meter.text}|${meter.note ?? ''}|${meter.tone}|${compact}`;
  if (host.dataset.traceKey === key) return;
  host.dataset.traceKey = key;
  host.hidden = !meter.visible;
  host.dataset.tone = meter.tone;
  const label = meter.note === null ? meter.text : `${meter.text} · ${meter.note}`;
  host.setAttribute('aria-label', label);
  host.title = `${label}\n${meter.title}`;
  if (!meter.visible) { host.replaceChildren(); return; }
  if (meter.aboard) {
    host.replaceChildren(make('span', 'tr-aboard', compact ? meter.short : meter.text));
    return;
  }
  const cells = make('span', 'tr-cells');
  cells.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < meter.total; i++) cells.appendChild(make('span', `tr-cell${i < meter.filled ? ' on' : ''}`));
  const parts: HTMLElement[] = [];
  if (!compact) parts.push(make('span', 'tr-key', meter.key));
  parts.push(cells);
  if (meter.over > 0) parts.push(make('span', 'tr-over', `+${meter.over}`));
  if (!compact && meter.note !== null) parts.push(make('span', 'tr-note', meter.note));
  host.replaceChildren(...parts);
}
