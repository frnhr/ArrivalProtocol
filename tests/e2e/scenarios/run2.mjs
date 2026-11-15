// The e2e run 2 (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §3 steps 1–5 and 7, §6.3 item 7): the world update
// between runs as the next unit meets it. Seed 4; UNIT-047's run 1 on the worked route written through the real record and
// update (__ap.archiveAs('won-purge')), then a reload:
// • the title: `UNIT-048 · YEAR <y> · LAUNCHED <gap> YEARS AFTER UNIT-047`, rolled up before its stamp (`+<gap> YEARS`)
//   lands, the lineage line (playtest 1 cut `runs save between ships`), and on the faint chart 047's dashed trail and its marks;
// • run 2's HOLLOW is the relay stranger UNIT-031 (slice 7c, R34), and the won run 1 leaves no ghost line at the boot (R36);
// • ARES-VIII's boot says the INBOX's new messages; its LANDING REPORT `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-047 ·
//   <gap> YEARS AGO`;
// • the first DESK: 047's trail (RIVERSIDE's colony dot with its age, the TAKEN squares `HALCYON · TAKEN · UNIT-047 GETS THERE
//   FIRST`), the REPORTED HOME diamonds and the chart's key, the box of ships that moved on (`n SHIPS MOVED ON`, `HERON · IT
//   WILL COME IN ON ITS OWN`), each of them gone from the chart (its slot empty or a new ship's), CONTROL's `UNIT-047 got here
//   first. :)`; in the INBOX a letter `FOR UNIT-047`;
// • a corrupt save on run 2 (a reload): RUN SAVE CAN'T RESUME, ABANDON RUN; UNIT-049's first DESK then shows 048's trail
//   and 047's colony as an older dot (OLDER COLONIES in the key);
// • a fresh page, run 1 lost (__ap.archiveAs('flagship-lost')): the grey cross where UNIT-047 was lost, on the title's chart.
// No page errors except the corrupt save's own console line. About 2 minutes; shots under tests/.out/e2e/shots/run2-*.
// Usage: node tests/e2e/scenarios/run2.mjs   (env E2E_BASE_URL, SHOT_VIEWPORT; tests/e2e/run.mjs runs it)
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit, viewportFromEnv } from '../lib.mjs';
import { join } from 'node:path';

const SEED = 4;
const RUN_SAVE_KEY = 'arrival-protocol/run/v1';   // data/tuning.ts RUN_SAVE_KEY
// The console line the save writes on purpose for a corrupt save (systems/save-write.ts: the refusal's detail).
const EXPECTED_ERROR = /^\[run save\] can't resume/;

const viewport = viewportFromEnv();
const browser = await launch();
const { check, finish } = checker();
const log = (text) => console.log(`      ${text}`);
const years = (n) => `${n} ${n === 1 ? 'YEAR' : 'YEARS'}`;

async function openPage(name) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const kit = pageKit(page);
  const screens = runKit(page, kit);
  const shot = (what) => page.screenshot({ path: join(SHOTS, `run2-${name}-${what}.png`) });
  await page.goto(`${BASE_URL}?debug&seed=${SEED}`, { waitUntil: 'networkidle' });
  await kit.st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  return { page, kit, screens, shot };
}

// The title: the unit line, its stamp, the lineage, the note, the save block, and the faint chart's trail.
const titleLook = (kit) => kit.st(() => {
  const shown = (id) => !document.getElementById(id).hidden;
  const chart = document.querySelector('#titleCard .title-chart');
  return {
    phase: window.__ap.store.getState().run.phase, unit: document.getElementById('titleUnit').textContent,
    stamp: shown('titleStamp') ? document.getElementById('titleStamp').textContent : null,
    lineage: shown('titleLineage') ? document.getElementById('titleLineage').textContent : null,
    // Playtest 1 cut the `runs save between ships` note (OD 152): no element, so `note` reads null.
    note: document.getElementById('titleNote') !== null && shown('titleNote') ? document.getElementById('titleNote').textContent : null, receive: shown('titleReceive'),
    save: shown('titleSave') ? { kind: document.getElementById('titleSave').dataset.kind, line: document.getElementById('titleSaveLine').textContent } : null,
    abandon: shown('titleAbandon'), resume: shown('titleResume'),
    trailLine: chart?.querySelector('.trail-last') !== null,
    marks: [...(chart?.querySelectorAll('.chart-trail .tm:not(.older)') ?? [])].map((g) => ({ kind: [...g.classList].find((c) => c.startsWith('kind-'))?.slice(5) ?? '', tip: g.dataset.tip ?? '' })),
    cross: chart?.querySelector('.chart-trail .tm.kind-lost .tm-cross') !== null,
    beacon: chart?.querySelector('.beacon-label')?.textContent ?? null,
  };
});
const settledTitle = async (kit) => {
  await kit.waitFor(() => !document.getElementById('titleStamp').hidden, 6000);
  return titleLook(kit);
};

// The DESK's chart as the kid sees it: the trail's marks and the older dots (their words), the REPORTED HOME diamonds by
// node, the key, the box of ships that moved on, CONTROL's line, the nodes by slot.
const chartLook = (kit) => kit.st(() => {
  const root = document.getElementById('deskScreen');
  const s = window.__ap.store.getState();
  const leave = root.querySelector('.desk-leave');
  const legend = root.querySelector('.desk-legend');
  return {
    marks: [...root.querySelectorAll('.desk-chart .chart-trail .tm:not(.older)')].map((g) => ({ kind: [...g.classList].find((c) => c.startsWith('kind-'))?.slice(5) ?? '',
      tip: g.dataset.tip ?? '', slot: Number(g.dataset.trailSlot), taken: g.querySelector('.tm-taken') !== null, dot: g.querySelector('.tm-colony') !== null,
      beacon: g.dataset.tip2 ?? null })),
    older: [...root.querySelectorAll('.desk-chart .chart-trail .tm.older')].map((g) => g.dataset.tip ?? ''),
    trailLine: root.querySelector('.desk-chart .trail-last') !== null,
    newNodes: [...root.querySelectorAll('.desk-chart [data-slot]')].filter((g) => g.querySelector('.cn-new') !== null).map((g) => Number(g.dataset.slot)),
    nodes: [...root.querySelectorAll('.desk-chart [data-slot]')].map((g) => Number(g.dataset.slot)),
    legend: legend && !legend.hidden ? [...legend.querySelectorAll('.desk-legend-item')].map((item) => `${[...item.classList].find((c) => c.startsWith('kind-'))?.slice(5)}=${item.textContent}`) : null,
    leave: leave && !leave.hidden ? { title: leave.querySelector('.desk-leave-title')?.textContent ?? '', lines: [...leave.querySelectorAll('.desk-leave-line')].map((el) => el.textContent),
      more: leave.querySelector('.desk-leave-more')?.textContent ?? null } : null,
    control: root.querySelector('.desk-control')?.hidden === false ? root.querySelector('.desk-control-text')?.textContent ?? '' : null,
    arm: s.run.map.arm.map((ship) => ({ slot: ship.slot, id: ship.id, name: ship.name, runsOnChart: ship.runsOnChart })),
    year: s.run.map.galaxyYear, unit: s.run.unitNumber,
  };
});

// RECEIVE → the boot (its lines kept) → ship 1 flown at once → its LANDING REPORT (the beacon row read) → the first DESK.
async function firstShip({ page, kit, screens }) {
  const from = await kit.st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));
  await page.locator('#titleReceive').click();
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'boot', 6000);
  await kit.waitFor(() => window.__ap.log().some((entry) => /NEW MESSAGES? · INBOX/.test(entry.text)), 20000, 200);
  const boot = await kit.st((after) => window.__ap.log().filter((entry) => entry.id > after && entry.channel === 'mind' && entry.text.startsWith('>')).map((entry) => entry.text), from);
  await kit.st(() => window.__ap.skipBoot());
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'flight', 30000);
  await screens.lockInRing();
  const landed = await screens.landToReport();
  await kit.waitFor(() => !document.getElementById('lrContinue').hidden, 30000, 200);
  const report = await kit.st(() => ({ beacon: document.getElementById('lrBeacon').hidden ? null : document.getElementById('lrBeacon').textContent,
    ship: window.__ap.store.getState().level.shipName }));
  await screens.finishReport();
  // Playtest 1 (note 5): LEAVE ORBIT first, its first card taken, then the DESK.
  await screens.leaveOrbit(0);
  const desk = await kit.waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 8000);
  // The opening beat: the greying, the green turn, CONTROL's line typed.
  await page.waitForTimeout(3500);
  return { boot, report, ok: landed && desk };
}

// ======================================================================================================================
// The title of run 2.
// ======================================================================================================================
const tab = await openPage('a');
const { page, kit, shot } = tab;
const { st, waitFor, errors } = kit;
const arm1 = await st(() => window.__ap.arm().arm.map((ship) => ({ slot: ship.slot, id: ship.id, name: ship.name })));
await st(() => window.__ap.archiveAs('won-purge'));
await page.reload({ waitUntil: 'networkidle' });
const early = await titleLook(kit);
const title = await settledTitle(kit);
const history = await st(() => { const s = window.__ap.store.getState(); return { ...s.run.map.history, colonies: undefined, routes: undefined, run: s.run.map.run, startYear: s.run.map.startYear,
  unit: s.run.unitNumber, final: s.run.map.arm.at(-1)?.name, finalYear: s.run.map.arm.at(-1)?.approachYear }; });
const gap = history.gap + history.valveYears;
log(`run 2 on seed ${SEED}: gap ${history.gap} + valve ${history.valveYears}, start ${history.startYear}, ${history.departures.length} departures (${history.departures.map((d) => `${d.name}:${d.words}`).join(', ')})`);
const launchLine = gap === 0 ? `UNIT-048 · YEAR ${history.startYear} · LAUNCHED IN THE SAME YEAR AS UNIT-047` : `UNIT-048 · YEAR ${history.startYear} · LAUNCHED ${years(gap)} AFTER UNIT-047`;
const stamp = history.valveYears > 0 ? `+${years(gap)} · THE ARM MOVED ON` : gap === 0 ? 'SAME YEAR' : `+${years(gap)}`;
check(`run 2's title: \`${launchLine}\` (the archive's next arm: run 2, UNIT-048, the gap the update rolled)`, title.unit === launchLine && history.run === 2 && history.unit === 48
  && history.lastUnitNumber === 47 && history.startYear === 2300 + gap && gap >= 0 && gap <= 35, JSON.stringify({ title: title.unit, history: { ...history, departures: undefined } }));
check(`…its stamp \`${stamp}\` lands once the year has rolled up (hidden at first)`, title.stamp === stamp && early.stamp === null, JSON.stringify({ early: [early.unit, early.stamp], settled: title.stamp }));
check('…the lineage line `last: UNIT-047 · 11,000 landed · …`, no meta note (playtest 1 cut `runs save between ships`), RECEIVE TRANSMISSION, no RESUME block', /^last: UNIT-047 · 11,000 landed · /.test(title.lineage ?? '')
  && title.note === null && title.receive && title.save === null, JSON.stringify(title));
const titleTaken = title.marks.filter((mark) => mark.kind === 'taken');
check('…the faint chart: 047\'s dashed trail, a mark per stop (RIVERSIDE\'s colony, the TAKEN ones), the new final ship\'s beacon', title.trailLine && title.marks.length === 6
  && title.marks[0]?.kind === 'colony' && /^\S.* · \d+ YEARS? OLD · UNIT-047$/.test(title.marks[0].tip) && titleTaken.length === 5
  && titleTaken.every((mark) => / · TAKEN · UNIT-047 GETS THERE FIRST$/.test(mark.tip)) && title.beacon === `FINAL SHIP · ${history.final} · ${history.finalYear}` && !title.cross,
  JSON.stringify({ marks: title.marks, beacon: title.beacon }));
await shot('1-title');

// ======================================================================================================================
// ARES-VIII: its boot, its report's beacon row; the first DESK.
// ======================================================================================================================
const first = await firstShip(tab);
const inboxLine = first.boot.find((line) => /NEW MESSAGES? · INBOX$/.test(line)) ?? null;
check('ARES-VIII\'s boot types the INBOX\'s new messages (the welcome and the letters)', /^> \d+ NEW MESSAGES · INBOX$/.test(inboxLine ?? '') && Number(/\d+/.exec(inboxLine)[0]) >= 2,
  JSON.stringify(first.boot));
// Slice 7c (R34, R36; the 7c review): run 2's HOLLOW is the relay stranger UNIT-031, never the last unit, and a won last
// unit (PURGE) leaves no ghost: ship 1's boot says no `> hi 048. it's 047.`.
const lineage2 = await st(() => ({ hollow: window.__ap.store.getState().run.hollowUnits, ghostSpoken: window.__ap.store.getState().run.ghostSpoken, ghost: window.__ap.ghost() }));
check('run 2: HOLLOW is UNIT-031 (the relay stranger, R34); a won last run leaves no ghost line at the boot (R36)',
  JSON.stringify(lineage2.hollow) === '[31]' && lineage2.ghost === null && !lineage2.ghostSpoken && !first.boot.some((line) => /^> hi 048\./.test(line)),
  JSON.stringify(lineage2));
const beaconWords = `A BEACON WAS ALREADY THERE · SET BY UNIT-047 · ${gap === 0 ? 'THIS YEAR' : `${years(gap)} AGO`}`;
check(`ship 1's LANDING REPORT: \`LZ-? · ${beaconWords}\``, first.ok && first.report.ship === 'ARES-VIII' && new RegExp(`^LZ-[A-Z] · ${beaconWords}$`).test(first.report.beacon ?? ''),
  JSON.stringify(first.report));
const chart = await chartLook(kit);
await shot('2-first-desk');
const taken = chart.marks.filter((mark) => mark.kind === 'taken');
const colonies = chart.marks.filter((mark) => mark.kind === 'colony');
check('the first DESK: 047\'s dashed trail with a mark per stop: TAKEN squares (`HALCYON · TAKEN · UNIT-047 GETS THERE FIRST`) where it gets there first',
  chart.trailLine && chart.marks.length === 6 && taken.length >= 1 && taken.every((mark) => mark.taken && / · TAKEN · UNIT-047 GETS THERE FIRST$/.test(mark.tip))
  && taken.some((mark) => mark.tip === 'HALCYON · TAKEN · UNIT-047 GETS THERE FIRST'), JSON.stringify(chart.marks));
check('…colony dots with their age (`RIVERSIDE · n YEARS OLD · UNIT-047`), the first one ringed by its beacon', colonies.length >= 1
  && colonies.every((mark) => mark.dot && /^\S.* · \d+ YEARS? OLD · UNIT-047$/.test(mark.tip)) && chart.marks[0]?.kind === 'colony'
  && chart.marks[0].beacon === `BEACON · SET BY UNIT-047 · ${gap === 0 ? 'THIS YEAR' : `${years(gap)} AGO`}`, JSON.stringify(colonies.concat(chart.marks[0] ?? [])));
const reported = chart.arm.filter((ship) => ship.runsOnChart === 1 && chart.nodes.includes(ship.slot)).map((ship) => ship.slot);
check('…REPORTED HOME: a diamond on the new ships\' nodes, and none on the ships waiting from run 1', chart.newNodes.length > 0
  && chart.newNodes.every((slot) => reported.includes(slot)) && chart.arm.filter((ship) => ship.runsOnChart > 1).every((ship) => !chart.newNodes.includes(ship.slot)),
  JSON.stringify({ diamonds: chart.newNodes, newShips: reported }));
check('…the chart\'s key: `UNIT-047 GETS THERE FIRST`, `UNIT-047\'S COLONY`, `REPORTED HOME`', chart.legend !== null
  && chart.legend.includes('taken=UNIT-047 GETS THERE FIRST') && chart.legend.includes('colony=UNIT-047\'S COLONY') && chart.legend.includes('new=REPORTED HOME'),
  JSON.stringify(chart.legend));
const LEAVE = { 'core-coming': 'ANOTHER CORE IS ON ITS WAY', 'own-way': 'IT WILL COME IN ON ITS OWN' };
const movedOn = history.departures.filter((d) => d.words in LEAVE);
const leaveLines = movedOn.map((d) => `${d.name} · ${LEAVE[d.words]}`);
check(`…the box of ships that moved on: \`${movedOn.length} ${movedOn.length === 1 ? 'SHIP' : 'SHIPS'} MOVED ON\` and their reasons`, movedOn.length > 0 && chart.leave !== null
  && chart.leave.title === `${movedOn.length} ${movedOn.length === 1 ? 'SHIP' : 'SHIPS'} MOVED ON` && chart.leave.lines.length >= 1
  && chart.leave.lines.every((line, i) => line === leaveLines[i]) && (chart.leave.more === null ? chart.leave.lines.length === leaveLines.length
    : chart.leave.more === `+${leaveLines.length - chart.leave.lines.length} MORE`), JSON.stringify({ shown: chart.leave, expected: leaveLines }));
const gone = movedOn.map((d) => {
  const was = arm1.find((ship) => ship.slot === d.slot);
  const now = chart.arm.find((ship) => ship.slot === d.slot);
  return { name: d.name, slot: d.slot, wasId: was?.id ?? null, stillOnArm: chart.arm.some((ship) => ship.id === was?.id),
    nowAtSlot: now === undefined ? null : `${now.name}:${now.runsOnChart}`, nodeNew: chart.newNodes.includes(d.slot), node: chart.nodes.includes(d.slot) };
});
check('…each ship that moved on is gone from the chart (its slot empty, or a new ship there with its REPORTED HOME diamond)', gone.length > 0
  && gone.every((g) => g.wasId !== null && !g.stillOnArm && (!g.node || g.nodeNew)), JSON.stringify(gone));
check('…CONTROL: `UNIT-047 got here first. :)`', chart.control === 'UNIT-047 got here first. :)', JSON.stringify(chart.control));
// The INBOX: a letter from one of 047's colonies.
await page.keyboard.press('KeyI');
await page.waitForTimeout(500);
const tabs = await tab.screens.deskTabs();
const colonyMail = tabs.mail.filter((mail) => mail.tone === 'tone-colony');
check('the INBOX: a colony\'s letter (`for unit 47`) beside the welcome', tabs.inboxShown && colonyMail.length >= 1 && colonyMail.some((mail) => /unit 47/i.test(mail.subject)),
  JSON.stringify(tabs.mail));
const letterTags = [];
for (const mail of colonyMail) {
  await page.locator(`#deskScreen .ib-row[data-id="${mail.id}"]`).click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  letterTags.push(await st(() => {
    const reader = document.querySelector('#deskScreen .ib-reader');
    return { id: reader?.dataset.id ?? null, tag: reader?.querySelector('.ib-reader-subject .ib-tag')?.textContent ?? null,
      stamps: reader?.querySelector('.ib-stamps')?.textContent ?? '', lines: reader?.querySelectorAll('.ib-line').length ?? 0 };
  }));
}
check('…opened, the letter is tagged `FOR UNIT-047` (no run-1 `FOR UNIT-046`), with its stamps `SENT <y> · RECEIVED <y>` and a body', letterTags.length >= 1
  && letterTags.every((letter) => letter.tag === 'FOR UNIT-047' && /SENT \d{4} · RECEIVED \d{4}/.test(letter.stamps) && letter.lines >= 1), JSON.stringify(letterTags));
await shot('3-inbox-letter');

// ======================================================================================================================
// A corrupt save on run 2: CAN'T RESUME, ABANDON RUN; UNIT-049's first DESK: 048's trail, 047's colony an older dot.
// ======================================================================================================================
await st(() => window.__ap.saveCorrupt());
const errorsBefore = errors.length;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const corrupt = await page.evaluate(() => ({
  ap: typeof window.__ap === 'object', card: !document.getElementById('titleCard').hidden,
  save: document.getElementById('titleSave').hidden ? null : document.getElementById('titleSaveLine').textContent,
  abandon: !document.getElementById('titleAbandon').hidden, resume: !document.getElementById('titleResume').hidden,
}));
const openErrors = errors.slice(errorsBefore).filter((text) => !EXPECTED_ERROR.test(text));
const errorsAfterOpen = errors.length;
check('run 2\'s save corrupted, a reload: `RUN SAVE CAN\'T RESUME · THE SAVE IS DAMAGED` with ABANDON RUN, and the page opens without an error', corrupt.ap && corrupt.card
  && corrupt.save === 'RUN SAVE CAN\'T RESUME · THE SAVE IS DAMAGED' && corrupt.abandon && !corrupt.resume && openErrors.length === 0,
  JSON.stringify({ corrupt, openErrors: openErrors.slice(0, 3) }));
await shot('4-run2-cant-resume');
if (corrupt.ap && corrupt.abandon) {
  await page.locator('#titleAbandon').click();
} else {
  // The page did not open (a src bug at the time of writing: createRunMap refuses the stored arm for a lineage whose wave
  // counts the run in progress): logged, the save forgotten by hand and a reload, which abandons the run on open.
  log('FALLBACK: the page did not open on the corrupt save; the run save removed from localStorage by hand, a reload');
  await page.evaluate((key) => localStorage.removeItem(key), RUN_SAVE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
}
const t49 = await settledTitle(kit);
check('…ABANDON RUN: UNIT-049\'s title, launched after UNIT-048', /^UNIT-049 · YEAR \d{4} · LAUNCHED .*UNIT-048$/.test(t49.unit) && t49.receive && t49.save === null, JSON.stringify(t49));
const third = await firstShip(tab);
const chart3 = await chartLook(kit);
await shot('5-unit-049-desk');
check('UNIT-049\'s first DESK: 048\'s trail (abandoned at ARES-VIII: its stop is the grey cross), not 047\'s', third.ok && chart3.unit === 49 && chart3.marks.length >= 1
  && chart3.marks.every((mark) => / · UNIT-048$| UNIT-048 GETS THERE FIRST$|^NO COLONY · UNIT-048$|^UNIT-048 WAS LOST HERE$/.test(mark.tip)), JSON.stringify(chart3.marks));
check('…047\'s colony an older dot (`… · n YEARS OLD · UNIT-047`), OLDER COLONIES in the key', chart3.older.length >= 1 && chart3.older.some((tip) => / · \d+ YEARS? OLD · UNIT-047( · \+\d+)?$/.test(tip))
  && chart3.legend?.includes('older=OLDER COLONIES') === true, JSON.stringify({ older: chart3.older, legend: chart3.legend }));
// The page's open on the corrupt save is judged above (its errors there are that check's).
const errorsA = [...errors.slice(0, errorsBefore), ...errors.slice(errorsAfterOpen)].filter((text) => !EXPECTED_ERROR.test(text));
check('no page errors through run 2 and 3 (besides the corrupt save\'s open, above)', errorsA.length === 0, errorsA.slice(0, 4).join(' | '));
await page.context().close();

// ======================================================================================================================
// Run 1 lost: the grey cross on the title's chart.
// ======================================================================================================================
const tabX = await openPage('x');
await tabX.kit.st(() => window.__ap.archiveAs('flagship-lost'));
await tabX.page.reload({ waitUntil: 'networkidle' });
const lost = await settledTitle(tabX.kit);
const lostMark = lost.marks.find((mark) => mark.kind === 'lost');
check('run 1 lost on LAST LIGHT (flagship-lost): the title\'s chart ends 047\'s trail in the grey cross `UNIT-047 WAS LOST HERE`', lost.cross && lostMark?.tip === 'UNIT-047 WAS LOST HERE'
  && /^UNIT-048 · YEAR \d{4} · LAUNCHED .*UNIT-047$/.test(lost.unit), JSON.stringify({ marks: lost.marks, unit: lost.unit }));
await tabX.shot('1-lost-cross');
check('no page errors on the lost run\'s title', tabX.kit.errors.length === 0, tabX.kit.errors.slice(0, 3).join(' | '));
await finish(browser);
