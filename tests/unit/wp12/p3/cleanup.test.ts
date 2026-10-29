// WP12 part 3, acceptance 6 (spec item 4, cleanup): no dead telemetry readouts, no dead schema fields, no unused
// component scaffold, no static corner stamp, and (slice 1a) no `SOULS IN STASIS` left anywhere: the sealed archive and
// the briefing's lie it told are gone; the footer counts pods from the start.
// Also: the browser tab's title and the header crumb read the run's unit (mission.unitId) and ship.
// Static greps over src/ and index.html, plus the header crumbs on a fresh state (DOM-free).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { check, finish } from '../../wp1/harness';
import { createHarness5 } from '../../wp5/harness5';
import { headerCrumbs } from '@systems/flight-hud';
import { getPrediction } from '@systems/predict';
import { podsLabel } from '@components/footer/Footer';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|css|html)$/.test(name)) out.push(path);
  }
  return out;
}

const files = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'index.html')];
const texts = files.map((path) => ({ path: path.slice(ROOT.length + 1), text: readFileSync(path, 'utf8') }));
const hits = (needle: RegExp): string[] => texts.filter((file) => needle.test(file.text)).map((file) => file.path);

// Acceptance 6, word for word.
for (const [label, needle] of [
  ['MASS EST', /MASS EST/i],
  ['SENSOR CONF', /SENSOR CONF/i],
  ['ai.coreIntegrity', /ai\.coreIntegrity/],
  ['a component.ts import', /components\/component['"]/],
] as const) {
  const found = hits(needle);
  check(`no ${label} in src/ or index.html`, found.length === 0, found.join(', '));
}
check('src/components/component.ts is deleted', !existsSync(join(ROOT, 'src/components/component.ts')));

// The rest of item 4: the static corner stamp is gone (it sat under the Engine window, never seen), and so are the
// unreachable dock click handler and the dead `sector` field.
check('no corner stamp in the markup or the styles', hits(/corner-stamp/).length === 0, hits(/corner-stamp/).join(', '));
check('src/components/dock/Dock.ts is deleted (every dock item is a ToolsTabs tab or a SidebarFilters filter)',
  !existsSync(join(ROOT, 'src/components/dock/Dock.ts')) && hits(/mountDockItems/).length === 0);
check('MissionMeta has no dead sector field', hits(/\bsector\s*:/).length === 0, hits(/\bsector\s*:/).join(', '));

// Slice 1a: `SOULS IN STASIS` (phase 2's briefing lie while the archive was sealed, §7.1) and archiveSealed are gone.
const stasisCode = texts.flatMap((file) => file.text.split('\n')
  .map((line, index) => ({ where: `${file.path}:${index + 1}`, line }))
  .filter(({ line }) => /SOULS IN STASIS|archiveSealed/.test(line) && !/^\s*(\/\/|\/\*|\*|<!--)/.test(line.trim())));
check('no `SOULS IN STASIS` and no archiveSealed in code any more (the sealed archive is gone)', stasisCode.length === 0,
  stasisCode.map((hit) => hit.where).join(', '));
check('the footer has no static souls text in index.html', !/id="footSouls"[^>]*>[^<]+</.test(texts.find((file) => file.path === 'index.html')?.text ?? ''));

// The live title: TimeControls writes document.title from the crumbs; index.html's static title names no unit or ship.
const timeControls = texts.find((file) => file.path === 'src/components/header/TimeControls.ts')?.text ?? '';
check('TimeControls writes document.title from the crumbs (unit · ship)', /document\.title = `\$\{crumbs\.unit\} · \$\{crumbs\.ship\}`/.test(timeControls));
const staticTitle = /<title>([^<]*)<\/title>/.exec(texts.find((file) => file.path === 'index.html')?.text ?? '')?.[1] ?? '';
check('index.html\'s static title names no unit or ship (it would lie on run 2)', !/UNIT|ARES/.test(staticTitle), staticTitle);

// The crumbs (and so the title) read the run's unit: UNIT-047 · ARES-VII on run 1.
const h = createHarness5(1);
h.resetTo('flight');
const crumbs = headerCrumbs(h.store.getState(), getPrediction());
check('run 1: the crumbs read UNIT-047 and ARES-VII (the title becomes `UNIT-047 · ARES-VII`)',
  crumbs.unit === 'UNIT-047' && crumbs.ship === 'ARES-VII' && `${crumbs.unit} · ${crumbs.ship}` === 'UNIT-047 · ARES-VII', `${crumbs.unit} · ${crumbs.ship}`);
// TODO(phase2): the footer's final words are Track UI's (`PODS: 8 ABOARD · 3 LANDED · 1 CAN'T LAUNCH`); only the count here.
check('run 1 at the start: the footer counts the 3 pods aboard (no stasis line)', /\bPODS\b/.test(podsLabel(h.store.getState()))
  && /3 ABOARD/.test(podsLabel(h.store.getState())) && !/STASIS/.test(podsLabel(h.store.getState())), podsLabel(h.store.getState()));

finish();
