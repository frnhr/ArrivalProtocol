import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { capabilitiesNow } from '@systems/capabilities';
import { getDropSolution } from '@systems/drop-cache';
import { groundTrackModel, type GroundBracket, type GroundMark, type GroundTrackModel, type Span } from '@systems/landing-hud';
import { requireById, make } from '@components/dom';
import { createScrambler } from '@components/hud/scrambler';

// The GROUND TRACK (01-landing §4): a 56 px panel under the NAV PLOT, in LANDING only, drawn from landing-hud's
// groundTrackModel. On the whole plot a 400 km bracket is 8–10 px, so this is where the kid sees the dot in the bracket:
// • the header names the planet, and the colony once the first pod is down (`KEPLER-186F · RIVERSIDE`);
// • the top line is the whole planet unrolled: the LZ ticks, no-go arcs, the dot, the stretch the strip shows,
//   out-of-band stretches hatched and the pods down;
// • the main strip is GROUND_TRACK_SPAN_KM of surface scrolling right to left under a fixed central dot (like a
//   bombsight), in glyph rows of the planet's terrain; brackets `[ LZ-A · 1/3 ]` slide in, green while the whole dot
//   fits, bright dashed while only its centre is in; the next LZs wait at the right edge with their countdowns
//   (`LZ-B ▸ 2:10`); pods down leave marks.
// Telemetry below 60 garbles the counters, the drop width and the countdowns (C3, like the plot's readouts).
// While it shows (body.landing, PodBayWindow) the plot gives the panel its height, and on a phone the panel takes the
// readout row's place (landing.css).
// Painted per game tick while the panel shows; the glyph rows are rebuilt from the ground under the dot, so the
// terrain scrolls exactly with the world.

// The glyph rows: one cell this many px wide; a cell shows its glyph or a gap, by a fixed hash of its place on the
// ground, so the same stretch of ground always reads the same.
const CELL_PX = 9;
const GLYPH_ROWS = 2;
const GLYPH_DENSITY = [0.55, 0.3];

function cellHash(index: number, row: number): number {
  let h = (index * 374761393 + row * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

function placeSpan(node: HTMLElement, span: Span): void {
  const from = Math.max(0, span.from);
  const to = Math.min(1, span.to);
  node.style.left = pct(from);
  node.style.width = pct(Math.max(0, to - from));
  node.classList.toggle('cut-left', span.from < 0);
  node.classList.toggle('cut-right', span.to > 1);
}

function patchText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function mountGroundTrack(store: Store<GameState>): () => void {
  const root = requireById('groundTrack');
  const worldEl = requireById('gtWorld');
  const planetEl = requireById('gtPlanet');
  const stripEl = requireById('gtStrip');
  const glyphsEl = requireById('gtGlyphs');
  const itemsEl = requireById('gtItems');
  const dotEl = requireById('gtDot');
  const dotLabel = requireById('gtDotLabel');
  const aheadEl = requireById('gtAhead');
  const blockedEl = requireById('gtBlocked');

  const glyphRows = Array.from({ length: GLYPH_ROWS }, (_, row) => {
    const line = make('div', `gt-glyph-row row-${row}`);
    glyphsEl.appendChild(line);
    return line;
  });
  const scramblers = new Map<string, ReturnType<typeof createScrambler>>();
  const garble = (key: string, text: string, fraction: number): string => {
    let scrambler = scramblers.get(key);
    if (!scrambler) { scrambler = createScrambler(); scramblers.set(key, scrambler); }
    return scrambler.apply(text, fraction);
  };

  // Keyed nodes: brackets by LZ, marks by pod, on both lines.
  const stripBrackets = new Map<string, { box: HTMLElement; label: HTMLElement }>();
  const planetBrackets = new Map<string, HTMLElement>();
  const stripMarks = new Map<number, HTMLElement>();
  const planetMarks = new Map<number, HTMLElement>();
  const planetDot = make('span', 'gt-p-dot');
  const planetView = make('span', 'gt-p-view');
  planetEl.append(planetView, planetDot);
  const spanPool = { noGoStrip: [] as HTMLElement[], noGoPlanet: [] as HTMLElement[], oobPlanet: [] as HTMLElement[] };

  function pool(list: HTMLElement[], count: number, parent: HTMLElement, cls: string): HTMLElement[] {
    while (list.length < count) { const node = make('span', cls); parent.appendChild(node); list.push(node); }
    list.forEach((node, i) => { node.hidden = i >= count; });
    return list;
  }

  function paintBrackets(brackets: readonly GroundBracket[], scramble: number): void {
    const live = new Set(brackets.map((bracket) => bracket.lz));
    for (const [lz, nodes] of stripBrackets) {
      if (live.has(lz)) continue;
      nodes.box.remove();
      stripBrackets.delete(lz);
    }
    for (const bracket of brackets) {
      let nodes = stripBrackets.get(bracket.lz);
      if (!nodes) {
        const box = make('div', 'gt-bracket');
        const label = make('span', 'gt-b-label');
        box.appendChild(label);
        itemsEl.appendChild(box);
        nodes = { box, label };
        stripBrackets.set(bracket.lz, nodes);
      }
      nodes.box.className = `gt-bracket look-${bracket.look}${bracket.outOfBand ? ' out-of-band' : ''}`;
      placeSpan(nodes.box, bracket);
      patchText(nodes.label, garble(`b-${bracket.lz}`, bracket.label, scramble));
    }
  }

  function paintMarks(map: Map<number, HTMLElement>, marks: readonly GroundMark[], parent: HTMLElement, cls: string): void {
    const live = new Set(marks.map((mark) => mark.pod));
    for (const [pod, node] of map) {
      if (live.has(pod)) continue;
      node.remove();
      map.delete(pod);
    }
    for (const mark of marks) {
      let node = map.get(mark.pod);
      if (!node) {
        node = make('span', cls, cls === 'gt-mark' ? '◘' : '');
        parent.appendChild(node);
        map.set(mark.pod, node);
      }
      node.style.left = pct(mark.at);
      node.dataset.place = mark.place;
      node.dataset.touch = mark.touch;
    }
  }

  function paintPlanet(model: GroundTrackModel): void {
    const { planet } = model;
    const live = new Set(planet.brackets.map((bracket) => bracket.lz));
    for (const [lz, node] of planetBrackets) {
      if (live.has(lz)) continue;
      node.remove();
      planetBrackets.delete(lz);
    }
    for (const bracket of planet.brackets) {
      let node = planetBrackets.get(bracket.lz);
      if (!node) { node = make('span', 'gt-p-lz'); planetEl.appendChild(node); planetBrackets.set(bracket.lz, node); }
      // On the unrolled line a span may wrap past 1 (or before 0): drawn from its middle, which is always inside.
      const mid = (((bracket.from + bracket.to) / 2) % 1 + 1) % 1;
      const half = (bracket.to - bracket.from) / 2;
      node.style.left = pct(mid - half);
      node.style.width = pct(2 * half);
      node.className = `gt-p-lz look-${bracket.look}`;
    }
    const wrap = (span: Span): Span => {
      const mid = (((span.from + span.to) / 2) % 1 + 1) % 1;
      const half = (span.to - span.from) / 2;
      return { from: mid - half, to: mid + half };
    };
    pool(spanPool.noGoPlanet, planet.noGo.length, planetEl, 'gt-p-nogo').forEach((node, i) => { const span = planet.noGo[i]; if (span) placeSpan(node, wrap(span)); });
    pool(spanPool.oobPlanet, planet.outOfBand.length, planetEl, 'gt-p-oob').forEach((node, i) => { const span = planet.outOfBand[i]; if (span) placeSpan(node, wrap(span)); });
    paintMarks(planetMarks, planet.marks, planetEl, 'gt-p-mark');
    planetDot.hidden = planet.dot === null;
    if (planet.dot !== null) planetDot.style.left = pct(planet.dot);
    placeSpan(planetView, wrap(planet.view));
  }

  // The terrain rows, scrolled by the ground under the dot: a cell's place on the ground is fixed, so as the dot
  // moves forward the glyphs slide left.
  function paintGlyphs(model: GroundTrackModel, width: number): void {
    const glyph = model.strip.terrain[0]?.glyph ?? '·';
    const pxPerKm = width / model.strip.spanKm;
    const groundPx = model.strip.groundKm * pxPerKm;
    const firstCell = Math.floor((groundPx - width / 2) / CELL_PX);
    const offset = firstCell * CELL_PX - (groundPx - width / 2);
    const cells = Math.ceil(width / CELL_PX) + 2;
    glyphRows.forEach((line, row) => {
      let text = '';
      for (let i = 0; i < cells; i++) text += cellHash(firstCell + i, row) < GLYPH_DENSITY[row]! ? glyph : ' ';
      patchText(line, text);
      line.style.transform = `translateX(${offset.toFixed(1)}px)`;
    });
  }

  let stripWidth = 0;
  const resizeObserver = new ResizeObserver(() => { stripWidth = stripEl.clientWidth; });
  resizeObserver.observe(stripEl);

  function paint(): void {
    const state = store.getState();
    const landing = state.run.phase === 'landing';
    root.hidden = !landing;
    if (!landing || state.ui.mode !== 'tools') return;
    const model = groundTrackModel(state, getDropSolution());
    const scramble = capabilitiesNow(state).telemetryScramble;
    patchText(worldEl, model.header);
    paintPlanet(model);
    if (stripWidth <= 0) stripWidth = stripEl.clientWidth;
    paintGlyphs(model, stripWidth);
    paintBrackets(model.strip.brackets, scramble);
    pool(spanPool.noGoStrip, model.strip.noGo.length, itemsEl, 'gt-nogo').forEach((node, i) => {
      const span = model.strip.noGo[i];
      if (span) { placeSpan(node, span); patchText(node, span.word); }
    });
    paintMarks(stripMarks, model.strip.marks, itemsEl, 'gt-mark');
    const dot = model.strip.dot;
    dotEl.hidden = dot === null;
    if (dot !== null) {
      dotEl.style.setProperty('--gt-dot-half', pct(dot.half));
      dotEl.className = `gt-dot fits-${dot.inBand ? dot.fits : 'out-of-band'}`;
    }
    patchText(dotLabel, dot === null ? '' : garble('drop', dot.text, scramble));
    blockedEl.hidden = model.blocked === null;
    patchText(blockedEl, model.blocked ?? '');
    while (aheadEl.children.length > model.strip.ahead.length) aheadEl.lastElementChild?.remove();
    model.strip.ahead.forEach((entry, i) => {
      let node = aheadEl.children[i] as HTMLElement | undefined;
      if (!node) { node = make('span', 'gt-ahead-item'); aheadEl.appendChild(node); }
      patchText(node, garble(`ahead-${i}`, entry.text, scramble));
      node.className = `gt-ahead-item${entry.open ? ' open' : ''}${entry.full ? ' full' : ''}`;
    });
    root.classList.toggle('out-of-band', model.outOfBand);
  }

  const offTick = onGameTick(() => paint());
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.mode}|${s.ui.memoryRev}|${s.clock.paused}`, paint);
  paint();

  return () => {
    offTick();
    unsub();
    resizeObserver.disconnect();
  };
}
