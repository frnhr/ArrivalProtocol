// Slice 3a (the galaxy map), in the page (slice-3a-plan §3, §6.3): the DESK between ships on run 1's arm.
// • The title: `ARRIVAL PROTOCOL // OUTWARD BOUND`, `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`, the faint chart with
//   SOL and the final ship's amber beacon `FINAL SHIP · LAST LIGHT · 3020`.
// • The first DESK (after ARES-VII's report, both clocks stopped): STAR CHART, the guidance step and CONTROL's typed line,
//   six ships in reach; a click on HALCYON shows its SHIP CARD (the top line, the schedule, MEMORY 320 · COMPACT, YOU FIT,
//   the BEAM row, the TIMELINE) and moves SET COURSE to `SET COURSE ▸ HALCYON [ENTER]`; ENTER opens the PACKET (the years
//   headline, the room bar, `◀ CHART [ESC]`); the LOG READER opens on top first and takes SPACE; ESC goes back to the chart
//   with HALCYON still picked, the ◀ CHART button too; ENTER again and TRANSMIT ▸ (the OUTWARD BOUND stamp, the white-out)
//   boots HALCYON.
// • HALCYON's DESK: `1 SHIP NOW OUT OF YOUR REACH` (OSPREY greys); a click on ALBATROSS (TOO LATE BY 18 YRS) shows its
//   card in red and buzzes, and the selection (none) and the phase stay: no course.
// • TIGHT's 0-charge confirm: the unit's REPAIR CHARGE forced to 0 (and no star credit) by __ap's store, LAPWING (TIGHT,
//   room 88, no floor) picked: its card says NO CHARGE ARRIVES, the PACKET `→ 0 ON ARRIVAL`; TRANSMIT ▸ asks
//   `ARRIVE WITH NO REPAIR CHARGE?` inline, ESC answers no (still packing), ENTER twice sends; LAPWING boots with
//   `> REPAIR CHARGE 0 · NO ROOM ON LAPWING` and a four-rack MIND (A B C E).
// • The phone (390×844, touch): the title's beacon on the upright chart, the DESK whole on the screen, a tap on a ship opens
//   its card as a bottom sheet, SET COURSE pinned at the bottom, ✕ closes the sheet, a tap on SET COURSE opens the PACKET.
// Slice 3b (the repository, deliveries, the INBOX; slice-3b-plan §6.3):
// • The tabs CARD / REPOSITORY [R] / INBOX [I] on the first DESK, their badges (`:)` while CONTROL recommends a file, the
//   unread count); [R] shows the catalogue (no ship picked: no ETA; Mv tagged `:) RECOMMENDED FOR YOU`; six RESTRICTED
//   rows since slice 4: the four .skl, THREAD+, FIREWALL.sys), [I] the welcome, opened by a click (its stamps; the badge goes).
// • Request toggling on ALBATROSS (1 YR LATE from ARES-VII): a click REQUESTs Mv (the badge names it, the card's DELIVERIES
//   row `Mv ✗ 1 YR LATE` and its TIMELINE mark in red), a second click clears it, the number key [1] requests it again;
//   on HALCYON it is IN TIME (`Mv ✓ WAITING HERE`, a green mark); the PACKET's chip; `> DELIVERY: mv (arrived 2337)`.
// • The flight INBOX window on HALCYON: the dock reads `INBOX 2`, the window lists the mail, the reply opened by a click.
// • SEND ON forced by __ap: Repair.bak requested for LAPWING (__ap.request) and the unit filled with spare files
//   (__ap.give) until files + the delivery are over LAPWING's TIGHT room: TRANSMIT ▸ waits; a click on the chip sends it on
//   (it waits in LAPWING's receiver) and the packet fits.
// • The last-rm prompt: on LAPWING an rm given (__ap.give: DELETE licensed) and then taken out of memory by __ap's store;
//   LAPWING's DESK opens on the REPOSITORY with Rm lit and the warning.
// • The phone: the tab bar peeks at the bottom; a tap on a tab opens the sheet on it (REPOSITORY, a tap REQUESTs; INBOX).
// Slices 4c–4e: the first pick has two cards, [1] AUTOBURN v1 and [2] AUTODROP v1, each with its mini-demo; [2] arms
// AUTODROP, [1] then AUTOBURN, and the kid keeps AUTOBURN (the run stays the same). On the phone both cards fit the width.
// Slice 4 (the skill tree; its review's M3): the first DESK opens on TRAINING [T] (four tabs: CARD / REPOSITORY [R] /
// TRAINING [T] / INBOX [I]) with the required first pick: the steps `1 A SKILL · 2 A SHIP · 3 A FILE · 4 SET COURSE`, the bar
// `CHOOSE YOUR FIRST SKILL`, SPACE refused with a buzz; [1] arms the card (the bar reads `TRAIN ▸ 3 CYCLES [ENTER]`), ENTER
// fills the 1.5 s bar and trains AUTOBURN v1 (A SKILL ✓), ESC goes back to the card. On the phone the sheet opens on
// TRAINING: a tap on the card, a tap on the bar (it reads TRAIN), then the CARD tab.
// Slice 6: HALCYON's card has `SITE DATA · GOOD`; from VESPER's DESK (__ap.route along the worked route) KITTIWAKE's card says
// `SITE DATA · POOR · ARRIVAL CONTROL GUESSED` (warn) and `LZ: 2 · SURVEY NEEDED`, and TRAINING's AHEAD row its second line.
// Usage: node tests/e2e/scenarios/map-desk.mjs   (env E2E_BASE_URL; tests/e2e/run.mjs runs it). Shots: tests/.out/e2e/shots/map-desk-*.
import { launch, BASE_URL, SHOTS, checker, pageKit, runKit } from '../lib.mjs';
import { join } from 'node:path';

const HALCYON = 2;
const OSPREY = 3;
const ALBATROSS = 6;
const LAPWING = 8;

const browser = await launch();
const { check, finish } = checker();

// Opens the page on a fresh run 1 (no archive, no run save), on the title.
async function openPage(context) {
  const page = await context.newPage();
  const kit = pageKit(page);
  await page.goto(`${BASE_URL}?debug&seed=4`, { waitUntil: 'networkidle' });
  await kit.st(() => { window.__ap.archiveClear(); window.__ap.saveClear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { page, kit, run: runKit(page, kit) };
}

// The title card's words and its faint chart.
const titleLook = (st) => st(() => {
  const chart = document.querySelector('#titleCard .title-chart');
  const beacon = chart?.querySelector('.beacon-label');
  const box = beacon?.getBoundingClientRect();
  return {
    logo: `${document.querySelector('#titleCard .title-name')?.textContent ?? ''} ${document.querySelector('#titleCard .title-sub')?.textContent ?? ''}`,
    unit: document.getElementById('titleUnit').innerText,
    beacon: beacon?.textContent ?? null,
    beaconOnScreen: box ? box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight : false,
    finalNode: chart?.querySelector('[data-slot].final .cn-beacon') !== null && chart?.querySelector('[data-slot].final') !== null,
    sol: chart?.querySelector('.sol-name')?.textContent ?? null,
    nodes: chart?.querySelectorAll('[data-slot]').length ?? 0,
  };
});

const badgeOf = (look, id) => look.tabs.find((tab) => tab.id === id)?.badge ?? null;

// The first desk's cards (slices 4c–4e: AUTOBURN v1 and AUTODROP v1): their key, name, the mini-demo's kind, picked, and box.
const firstCards = (st) => st(() => [...document.querySelectorAll('#deskScreen .tr-card')].map((card) => {
  const box = card.getBoundingClientRect();
  return {
    key: card.dataset.card, name: card.querySelector('.tr-card-name')?.textContent ?? '', selected: card.classList.contains('selected'),
    demo: [...(card.querySelector('svg.tr-demo')?.classList ?? [])].find((name) => name !== 'tr-demo') ?? '',
    left: Math.round(box.left), right: Math.round(box.right),
  };
}));

// RECEIVE, the boot skipped, ARES-VII locked at once and landed (__ap.landAll), its report through to the DESK.
async function toFirstDesk({ page, kit, run }, tap = false) {
  if (tap) await page.tap('#titleReceive');
  else await page.locator('#titleReceive').click();
  await kit.waitFor(() => ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 8000);
  await kit.st(() => window.__ap.skipBoot());
  await kit.waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  await run.lockInRing();
  const report = await run.landToReport();
  if (tap) {
    await kit.waitFor(() => !document.getElementById('lrContinue').hidden, 30000, 200);
    for (let i = 0; i < 4 && (await kit.st(() => window.__ap.store.getState().run.phase)) === 'report'; i++) {
      await page.tap('#lrContinue').catch(() => {});
      await page.waitForTimeout(1300);
    }
  } else await run.finishReport();
  const desk = await kit.waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 5000);
  return report && desk;
}

// =========================================================================================================================
// Desktop, 1440×900
// =========================================================================================================================
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tab = await openPage(context);
  const { page, kit, run } = tab;
  const { st, waitFor, errors } = kit;
  const shot = (name) => page.screenshot({ path: join(SHOTS, `map-desk-${name}.png`) });
  const cues = () => st(() => window.__ap.audio.cues().length);
  const cuesSince = (from) => st((n) => window.__ap.audio.cues().slice(n), from);

  // --- The title -------------------------------------------------------------------------------------------------------
  const title = await titleLook(st);
  check('title: ARRIVAL PROTOCOL // OUTWARD BOUND, UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', title.logo === 'ARRIVAL PROTOCOL // OUTWARD BOUND'
    && title.unit === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', JSON.stringify(title));
  check('title: the faint chart behind the logo: SOL, the arm\'s 20 ships, the final ship\'s beacon `FINAL SHIP · LAST LIGHT · 3020` on screen',
    title.sol === 'SOL' && title.nodes === 20 && title.finalNode && title.beacon === 'FINAL SHIP · LAST LIGHT · 3020' && title.beaconOnScreen, JSON.stringify(title));
  await shot('01-title');

  // --- The first DESK ---------------------------------------------------------------------------------------------------
  const reached = await toFirstDesk(tab);
  await page.waitForTimeout(1500);
  let view = await run.desk();
  const clocks = await st(() => ({ paused: window.__ap.store.getState().clock.paused, reader: !document.getElementById('logReader').hidden }));
  check('ARES-VII\'s report → the DESK: STAR CHART, UNIT-047 · YEAR 2300 · ARES-VII, both clocks stopped, no LOG READER yet', reached && view.shown
    && view.phase === 'desk' && view.title === 'STAR CHART' && view.where === 'UNIT-047 · YEAR 2300 · ARES-VII' && clocks.paused && !clocks.reader,
    JSON.stringify({ reached, ...view, nodes: undefined, names: undefined, clocks }));
  // --- Slice 4: the required first pick, by the desk's keys ([1], then ENTER) -----------------------------------------------
  let tabs = await run.deskTabs();
  check('slice 4: the first desk opens on TRAINING: four tabs, `1 A SKILL ◀ | 2 A SHIP | 3 A FILE | 4 SET COURSE`, the bar `CHOOSE YOUR FIRST SKILL`',
    tabs.tab === 'training' && tabs.tabs.map((tab) => tab.label).join(' / ') === 'CARD / REPOSITORY [R] / TRAINING [T] / INBOX [I]'
    && tabs.steps.join(' | ') === '1 A SKILL ◀ | 2 A SHIP | 3 A FILE | 4 SET COURSE' && view.step === 'CHOOSE YOUR FIRST SKILL — [1], then [ENTER]'
    && view.go === 'CHOOSE YOUR FIRST SKILL', JSON.stringify({ tab: tabs.tab, labels: tabs.tabs.map((tab) => tab.label), steps: tabs.steps, step: view.step, go: view.go }));
  let from = await cues();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  check('…SPACE before the pick is refused (a buzz), still the DESK', (await st(() => window.__ap.store.getState().run.phase)) === 'desk'
    && (await cuesSince(from)).includes('buzz'));
  // Slices 4c–4e: two cards, AUTOBURN v1 and AUTODROP v1, each with its own mini-demo, neither picked; [2] arms AUTODROP,
  // [1] then AUTOBURN (the kid's pick stays [1], so the run is the same as before).
  let cards = await firstCards(st);
  check('4c: the first pick shows two cards, [1] AUTOBURN v1 (the capture demo) and [2] AUTODROP v1 (the centre demo), neither picked',
    cards.map((card) => `${card.key}:${card.name}:${card.demo}`).join(' | ') === '1:AUTOBURN v1:tr-demo-capture | 2:AUTODROP v1:tr-demo-centre'
    && cards.every((card) => !card.selected), JSON.stringify(cards));
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(300);
  view = await run.desk();
  cards = await firstCards(st);
  check('…[2] arms AUTODROP v1: its card lit, the bar `TRAIN ▸ 3 CYCLES [ENTER]`', view.go === 'TRAIN ▸ 3 CYCLES [ENTER]'
    && cards.map((card) => card.selected).join(',') === 'false,true', `${view.go} ${JSON.stringify(cards)}`);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  view = await run.desk();
  cards = await firstCards(st);
  check('…[1] arms AUTOBURN v1 instead: the bar reads `TRAIN ▸ 3 CYCLES [ENTER]`', view.go === 'TRAIN ▸ 3 CYCLES [ENTER]'
    && cards.map((card) => card.selected).join(',') === 'true,false', `${view.go} ${JSON.stringify(cards)}`);
  await page.keyboard.press('Enter');
  const trained = await waitFor(() => window.__ap.store.getState().run.skills.pending.length === 1, 4000, 100)
    && (await st(() => window.__ap.store.getState().run.skills.pending[0]?.skill)) === 'autoburn';
  await page.waitForTimeout(300);
  view = await run.desk();
  tabs = await run.deskTabs();
  check('…ENTER fills the bar and trains it: A SKILL ✓, the ship next, the bar back to SET COURSE', trained && tabs.steps.join(' | ') === '1 A SKILL ✓ | 2 A SHIP ◀ | 3 A FILE | 4 SET COURSE'
    && view.go === 'SET COURSE ▸ … [ENTER]', JSON.stringify({ trained, steps: tabs.steps, go: view.go }));
  await shot('02a-first-pick');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  view = await run.desk();
  check('…the strip says PICK YOUR NEXT SHIP — click a ship or ← →, CONTROL types `Lovely work, Unit 47! :) Pick your next ship.`, nothing picked',
    view.step === 'PICK YOUR NEXT SHIP — click a ship or ← →' && view.control === 'Lovely work, Unit 47! :) Pick your next ship.' && view.selected === null
    && view.card === null && view.go === 'SET COURSE ▸ … [ENTER]', JSON.stringify({ step: view.step, control: view.control, go: view.go }));
  const inReach = view.nodes.filter((node) => node.state === 'reachable' || node.state === 'urgent').map((node) => node.slot);
  check('…six ships in reach from ARES-VII (PETREL, HALCYON, OSPREY, HERON, KESTREL, ALBATROSS), the rest out of range',
    inReach.join(',') === '1,2,3,4,5,6' && view.nodes.find((node) => node.slot === 0)?.state === 'current'
    && view.nodes.filter((node) => node.state === 'out-of-range').length === 13, view.nodes.map((node) => `${node.slot}:${node.state}`).join(' '));
  await shot('02-first-desk');

  // --- Slice 3b: the tabs, the REPOSITORY with no ship picked, the welcome in the INBOX tab ----------------------------------
  tabs = await run.deskTabs();
  check('3b: ESC → the right window\'s tabs CARD / REPOSITORY [R] / TRAINING [T] / INBOX [I], the card lit; badges `:)` (CONTROL recommends a file) and 1 (the welcome unread)',
    tabs.tab === 'card' && tabs.tabs.map((tab) => tab.label).join(' / ') === 'CARD / REPOSITORY [R] / TRAINING [T] / INBOX [I]' && tabs.tabs.find((tab) => tab.id === 'card')?.on
    && badgeOf(tabs, 'repository') === ':)' && badgeOf(tabs, 'inbox') === '1' && badgeOf(tabs, 'card') === null, JSON.stringify(tabs.tabs));
  check('…the first desk\'s guidance has four steps (A SKILL · A SHIP · A FILE · SET COURSE), the ship next', tabs.steps.join(' | ') === '1 A SKILL ✓ | 2 A SHIP ◀ | 3 A FILE | 4 SET COURSE',
    tabs.steps.join(' | '));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(400);
  tabs = await run.deskTabs();
  const noShip = 'PICK A SHIP TO SEE WHEN A FILE GETS THERE';
  check('[R] opens the REPOSITORY: seven files in catalogue order with their keys, no ETA until a ship is picked, nothing requested',
    tabs.tab === 'repository' && tabs.repoShown && !tabs.cardShown && tabs.rows.map((row) => row.file).join(',') === 'mv,rm,cp,swap,repair-bak,scan-bak,repair-v2'
    && tabs.rows[0].text === 'Mv · 2 BLOCKS · MOVE' && tabs.rows.every((row) => row.eta === noShip && row.req === 'REQUEST' && !row.requested) && tabs.pick === null,
    JSON.stringify(tabs.rows));
  check('…ARRIVAL CONTROL tags Mv, and only Mv, `:) RECOMMENDED FOR YOU`', tabs.rows.filter((row) => row.tag !== null).map((row) => `${row.file}:${row.tag}`).join() === 'mv::) RECOMMENDED FOR YOU',
    JSON.stringify(tabs.rows.map((row) => row.tag)));
  // Slice 4 (03 §3.11; TREE deviation 21): every skill of the tree is restricted, a `.skl` row each in the tree's order
  // (built yet or not), before the two system rows.
  const RESTRICTED = ['LOCKED AUTOBURN.skl Train it yourself :)', 'LOCKED AUTODROP.skl Train it yourself :)', 'LOCKED SURVEY.skl Train it yourself :)',
    'LOCKED SENTRY.skl Train it yourself :)', 'LOCKED THREAD+ Not available to caretakers :)', 'LOCKED FIREWALL.sys Not available to caretakers :)'];
  check('…RESTRICTED: the four skills AUTOBURN/AUTODROP/SURVEY/SENTRY.skl (Train it yourself :)), THREAD+ and FIREWALL.sys (Not available to caretakers :)), in that order, locked; IN TRANSIT: nothing; ONE REQUEST PER TRANSMIT',
    tabs.locked.join(' | ') === RESTRICTED.join(' | ')
    && tabs.transit.length === 0 && tabs.transitNone === 'NOTHING ON THE WAY' && /^ONE REQUEST PER TRANSMIT/.test(tabs.foot ?? ''), JSON.stringify({ locked: tabs.locked, transit: tabs.transit, none: tabs.transitNone, foot: tabs.foot }));
  // Playtest 1 (A-LAND, note 12): each row says what the unit already has of it, under its name.
  const have = await st(() => [...document.querySelectorAll('#deskScreen .rp-row')].map((row) => `${row.dataset.file}:${row.querySelector('.rp-have')?.textContent ?? ''}`));
  check('…each row says what the unit already has (`YOU HAVE n`; the patch `YOU RUN REPAIR v1`)', have.length === 7
    && have.slice(0, 6).every((row) => /:YOU HAVE \d+( · \d+ ON THE WAY)?$/.test(row)) && /^repair-v2:YOU RUN REPAIR v\d/.test(have[6] ?? ''), JSON.stringify(have));
  await shot('02b-repository');
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(400);
  tabs = await run.deskTabs();
  check('[I] opens the INBOX: the welcome from ARRIVAL CONTROL · EARTH, unread, RECEIVED 2288', tabs.tab === 'inbox' && tabs.inboxShown && !tabs.repoShown
    && tabs.mail.length === 1 && tabs.mail[0].id === 'welcome' && tabs.mail[0].from === 'ARRIVAL CONTROL · EARTH' && tabs.mail[0].subject === 'Welcome, Unit 47! :)'
    && tabs.mail[0].received === '2288' && tabs.mail[0].unread && tabs.reader === null, JSON.stringify(tabs.mail));
  await page.locator('#deskScreen .desk-inbox .ib-row[data-id="welcome"]').click();
  await page.waitForTimeout(400);
  tabs = await run.deskTabs();
  check('…a click opens it: SENT 2280 · RECEIVED 2288, `Recommended for you: mv :)`; read, the INBOX badge gone', tabs.reader?.stamps === 'SENT 2280 · RECEIVED 2288'
    && tabs.reader.lines.includes('Need software? Ask our repository. Recommended for you: mv :)') && !tabs.mail[0].unread && badgeOf(tabs, 'inbox') === null
    && (await st(() => window.__ap.inbox().read.includes('welcome'))), JSON.stringify({ reader: tabs.reader, badge: badgeOf(tabs, 'inbox') }));
  await shot('02c-inbox');
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(300);
  check('…[I] again goes back to the card', (await run.deskTabs()).tab === 'card');

  // A click on HALCYON: picked (chime), its card, SET COURSE names it.
  from = await cues();
  const clicked = await run.clickNode(HALCYON);
  await page.waitForTimeout(400);
  view = await run.desk();
  check('a click on HALCYON\'s node picks it (a chime) and SET COURSE reads `SET COURSE ▸ HALCYON [ENTER]`', clicked === true && view.selected === HALCYON
    && view.nodes.find((node) => node.slot === HALCYON)?.selected && view.go === 'SET COURSE ▸ HALCYON [ENTER]' && (await cuesSince(from)).includes('chime'),
    `${clicked} ${view.selected} ${view.go}`);
  const card = view.card;
  check('…HALCYON\'s card leads: Tessaly · 5 PODS, 1,000 COLONISTS, 31 YRS EARLY, 3 HITS · 1 FIXED WHILE YOU SLEEP → 2 LAND',
    card?.slot === HALCYON && card.name === 'HALCYON' && card.sub === 'Tessaly · 5 PODS' && card.colonists === '1,000 COLONISTS'
    && card.sched === '31 YRS EARLY' && card.cost === '3 HITS · 1 FIXED WHILE YOU SLEEP → 2 LAND', JSON.stringify(card));
  check('…its rows: YOU FIT first, then FLYBY, TOO WIDE · MEMORY 320 · COMPACT · ROOM FOR YOU 152 · LZ: 2 · 21 LY · LINK 123 · NOISE CLEAN · RESIDENT none · SITE DATA GOOD',
    card?.rows[0] === 'fit=YOU FIT' && ['problems=FLYBY, TOO WIDE', 'memory=MEMORY 320 · COMPACT · ROOM FOR YOU 152', 'lzs=LZ: 2 · SET BY ARRIVAL CONTROL',
      'beam=21 LY · LINK 123', 'noise=NOISE CLEAN · SEEDS: none', 'resident=none', 'site=GOOD'].every((row) => card?.rows.includes(row))
    && card?.rows.some((row) => /^run=SHIP 2 OF YOUR RUN · \d(–\d)? MORE TO THE FINAL SHIP$/.test(row)), JSON.stringify(card?.rows));
  check('…and the TIMELINE `2300 you leave · 2321 you get there · 2352 ▲ approach`', card?.timeline === '2300 you leave · 2321 you get there · 2352 ▲ approach', card?.timeline);
  check('3b: …the guidance moves to the file: `REQUEST mv · RECOMMENDED [R]` (the ship\'s step done)', view.step === 'REQUEST mv · RECOMMENDED [R]'
    && (await run.deskTabs()).steps.join(' | ') === '1 A SKILL ✓ | 2 A SHIP ✓ | 3 A FILE ◀ | 4 SET COURSE', `${view.step} / ${(await run.deskTabs()).steps.join(' | ')}`);
  // ALBATROSS, the ark at the end of a long line: ONLY FROM HERE (read by hovering is the tag; its card by a click).
  await run.clickNode(ALBATROSS);
  await page.waitForTimeout(300);
  const albatross = (await run.desk()).card;
  check('…ALBATROSS\'s card: ARK, 51 LY · LINK 90 · 7 HITS, 14 YRS EARLY and ONLY FROM HERE in red', albatross?.name === 'ALBATROSS' && albatross.tags.includes('ARK')
    && albatross.rows.some((row) => /^beam=51 LY · LINK 90$/.test(row)) && /^7 HITS/.test(albatross.cost ?? '') && albatross.sched === '14 YRS EARLY'
    && albatross.rows.some((row) => /^only=ONLY FROM HERE/.test(row)), JSON.stringify(albatross));
  // Slice 5: ALBATROSS's resident left (BOSUN), which its card never says before the ship: `unknown`, as for a sleeper or a surprise.
  check('…and its RESIDENT row reads `unknown` (a departed resident is not named before the ship)', albatross?.rows.includes('resident=unknown') === true,
    JSON.stringify(albatross?.rows));
  // Slice 3b: ALBATROSS is in reach but a request from ARES-VII gets there a year late. Request toggling and the red mark.
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  tabs = await run.deskTabs();
  const lateEta = '1 YR LATE → FOLLOWS YOUR ROUTE · SHIP 3 AT THE EARLIEST';
  check('3b: the REPOSITORY for ALBATROSS: every file `1 YR LATE → FOLLOWS YOUR ROUTE · SHIP 3 AT THE EARLIEST` (amber)', tabs.tab === 'repository'
    && tabs.rows.every((row) => row.eta === lateEta && row.tone === 'eta-late'), JSON.stringify(tabs.rows.map((row) => `${row.file}:${row.eta}:${row.tone}`)));
  await page.locator('#deskScreen .rp-row[data-file="mv"]').click();
  await page.waitForTimeout(300);
  tabs = await run.deskTabs();
  check('…a click on Mv REQUESTs it: the row says REQUESTED, the REPOSITORY badge names it (Mv)', tabs.pick === 'mv' && tabs.rows[0].requested
    && tabs.rows[0].req === 'REQUESTED' && tabs.rows.filter((row) => row.requested).length === 1 && badgeOf(tabs, 'repository') === 'Mv', JSON.stringify({ pick: tabs.pick, badge: badgeOf(tabs, 'repository') }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const albatrossAsked = (await run.desk()).card;
  const albatrossMarks = await run.deskMarks();
  const approach = Number(/(\d{4}) ▲ approach/.exec(albatrossAsked?.timeline ?? '')?.[1]);
  check('…ESC: ALBATROSS\'s card says DELIVERIES `Mv ✗ 1 YR LATE`, and its TIMELINE marks Mv in red after ▲', (await run.deskTabs()).tab === 'card'
    && albatrossAsked?.rows.includes('deliveries=Mv ✗ 1 YR LATE') && albatrossMarks.length === 1 && albatrossMarks[0].late
    && new RegExp(`^${approach + 1} Mv$`).test(albatrossMarks[0].text), JSON.stringify({ rows: albatrossAsked?.rows, timeline: albatrossAsked?.timeline, marks: albatrossMarks }));
  await shot('03a-albatross-late-mark');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  await page.locator('#deskScreen .rp-row[data-file="mv"]').click();
  await page.waitForTimeout(300);
  tabs = await run.deskTabs();
  check('…a second click clears it (REQUEST again, the badge back to `:)`)', tabs.pick === null && !tabs.rows[0].requested && tabs.rows[0].req === 'REQUEST'
    && badgeOf(tabs, 'repository') === ':)', JSON.stringify({ pick: tabs.pick, badge: badgeOf(tabs, 'repository') }));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  tabs = await run.deskTabs();
  check('…and its number key [1] requests it again', tabs.pick === 'mv' && tabs.rows[0].requested && badgeOf(tabs, 'repository') === 'Mv', JSON.stringify({ pick: tabs.pick }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await run.clickNode(HALCYON);
  await page.waitForTimeout(300);
  view = await run.desk();
  const halcyonMarks = await run.deskMarks();
  check('…on HALCYON Mv is in time: `Mv ✓ WAITING HERE` and a green mark `2337 Mv`; the guidance is on SET COURSE', view.selected === HALCYON
    && view.card?.rows.includes('deliveries=Mv ✓ WAITING HERE') && halcyonMarks.length === 1 && !halcyonMarks[0].late && halcyonMarks[0].text === '2337 Mv'
    && (await run.deskTabs()).steps.join(' | ') === '1 A SKILL ✓ | 2 A SHIP ✓ | 3 A FILE ✓ | 4 SET COURSE ◀', JSON.stringify({ rows: view.card?.rows, marks: halcyonMarks, steps: (await run.deskTabs()).steps }));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  tabs = await run.deskTabs();
  check('…and its REPOSITORY row reads `ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME`, tagged', tabs.rows[0].eta === 'ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME'
    && tabs.rows[0].tone === 'eta-in-time' && tabs.rows[0].tag === ':) RECOMMENDED FOR YOU', JSON.stringify(tabs.rows[0]));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // Slice 5: GANNET (slot 9, WARDEN) and CURLEW (slot 7, a sleeper): `reported faulty` in the warning tone, and `unknown`.
  const residentCard = async (slot) => {
    await run.clickNode(slot);
    await page.waitForTimeout(300);
    const seen = await run.desk();
    const tone = await st(() => [...(document.querySelector('#deskScreen .desk-card .dc-row.key-resident')?.classList ?? [])].join(' '));
    return { name: seen.card?.name ?? null, row: seen.card?.rows.find((row) => row.startsWith('resident=')) ?? null, tone };
  };
  const gannet = await residentCard(9);
  const curlew = await residentCard(7);
  check('slice 5: GANNET\'s card says `RESIDENT reported faulty` in the warning tone; CURLEW\'s (a sleeper) `unknown`',
    gannet.name === 'GANNET' && gannet.row === 'resident=reported faulty' && /warn/.test(gannet.tone) && curlew.name === 'CURLEW' && curlew.row === 'resident=unknown',
    JSON.stringify({ gannet, curlew }));
  await run.clickNode(HALCYON);
  await page.waitForTimeout(300);
  check('…a click back on HALCYON picks it again', (await run.desk()).selected === HALCYON);
  await shot('03-halcyon-card');

  // ENTER: the PACKET for HALCYON. On run 1 the LOG READER opens over it first (entry 01) and takes SPACE.
  await page.keyboard.press('Enter');
  const packetUp = await waitFor(() => window.__ap.store.getState().run.phase === 'transmit' && !document.getElementById('transmitScreen').hidden, 5000);
  const readerUp = await waitFor(() => !document.getElementById('logReader').hidden, 4000, 50);
  check('ENTER sets course: the PACKET for HALCYON, with the LOG READER over it on entry 01', packetUp && readerUp
    && await st(() => window.__ap.store.getState().run.transit?.toSlot === 2 && document.querySelector('#lgRows .lg-row.open')?.dataset.entry === '1'));
  for (let i = 0; i < 4 && (await st(() => !document.getElementById('logReader').hidden)); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
  const packet = await st(() => ({
    reader: !document.getElementById('logReader').hidden, phase: window.__ap.store.getState().run.phase,
    next: document.getElementById('txNext').innerText, back: document.querySelector('#transmitScreen .tx-back')?.textContent ?? null,
    backShown: !(document.querySelector('#transmitScreen .tx-back')?.hidden ?? true),
    room: document.querySelector('#transmitScreen .tx-room-line')?.textContent ?? [...document.querySelectorAll('#transmitScreen [class*="room"]')].map((el) => el.textContent).join(' | '),
    sent: document.querySelectorAll('#txChips .tx-chip.sent').length,
  }));
  check('…SPACE closes the reader and sends nothing; the PACKET: NEXT: HALCYON · 1,000 COLONISTS · 21 LY · 31 YRS EARLY, ◀ CHART [ESC], the room bar',
    !packet.reader && packet.phase === 'transmit' && packet.sent === 0 && packet.next === 'NEXT: HALCYON · 1,000 COLONISTS · 21 LY · 31 YRS EARLY'
    && packet.back === '◀ CHART [ESC]' && packet.backShown && /ROOM 152 · FILES \d+ \+ FLOOR 12/.test(packet.room), JSON.stringify(packet));
  const deliveryChips = () => st(() => ({
    label: document.querySelector('#transmitScreen .tx-deliveries')?.hidden === false ? document.querySelector('#transmitScreen .tx-deliveries-label')?.textContent ?? null : null,
    chips: [...document.querySelectorAll('#transmitScreen .tx-delivery')].map((chip) => ({ key: chip.dataset.key, label: chip.getAttribute('aria-label'),
      name: chip.querySelector('.tx-chip-name')?.textContent ?? '', sentOn: chip.classList.contains('sent-on'), lost: chip.classList.contains('lost') })),
    files: Number(/FILES (\d+)/.exec(document.getElementById('txPacketLine').innerText)?.[1]), room: window.__ap.transmitModel().room.line,
    tooMany: window.__ap.transmitModel().room.tooMany, go: document.getElementById('txGo').innerText.replace(/\s+/g, ' ').trim(),
    salvage: document.querySelector('#transmitScreen .tx-draft-title')?.textContent ?? null,
  }));
  const toHalcyon = await deliveryChips();
  check('3b: …the PACKET\'s DELIVERIES row: `Mv · 2 BLOCKS · ARRIVED 2337 · [SEND ON]`; the draft is headed SALVAGE', toHalcyon.label === 'DELIVERIES'
    && toHalcyon.chips.length === 1 && toHalcyon.chips[0].name === 'MV' && toHalcyon.chips[0].label === 'Mv · 2 BLOCKS · ARRIVED 2337 · [SEND ON]' && !toHalcyon.chips[0].sentOn
    && toHalcyon.salvage === 'SALVAGE · PICK ONE TO CARRY', JSON.stringify(toHalcyon));
  await shot('04-packet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  view = await run.desk();
  check('ESC: back to the chart, HALCYON still picked, nothing sent', view.shown && view.phase === 'desk' && view.selected === HALCYON
    && view.go === 'SET COURSE ▸ HALCYON [ENTER]' && await st(() => window.__ap.store.getState().run.transit === null), JSON.stringify({ phase: view.phase, selected: view.selected }));
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  await page.waitForTimeout(500);
  check('…ENTER again: the PACKET, and the LOG READER stays shut (it opened by itself once)', await st(() => window.__ap.store.getState().run.phase === 'transmit'
    && document.getElementById('logReader').hidden));
  await page.locator('#transmitScreen .tx-back').click();
  await page.waitForTimeout(500);
  check('a click on ◀ CHART goes back too', await st(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden));
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  check('…the first card picked ([1])', (await run.pickCard(0)) !== null);
  await page.locator('#txGo').click();
  await page.waitForTimeout(600);
  const stamp = await st(() => {
    const el = document.querySelector('#transmitScreen .tx-stamp');
    return { shown: el !== null && !el.hidden, text: el?.textContent ?? null };
  });
  check('TRANSMIT ▸ stamps OUTWARD BOUND over the PACKET', stamp.shown && stamp.text === 'OUTWARD BOUND', JSON.stringify(stamp));
  await shot('05-outward-bound');
  const white = await waitFor(() => { const el = document.getElementById('whiteOut'); return !el.hidden && Number(getComputedStyle(el).opacity) > 0.5; }, 15000, 50);
  const halcyonBoot = await waitFor(() => window.__ap.store.getState().run.phase === 'boot' && window.__ap.store.getState().level.shipName === 'HALCYON', 15000, 50);
  check('…the white-out, then HALCYON\'s boot, the galaxy year 2352 in the header crumb', white && halcyonBoot
    && await st(() => window.__ap.store.getState().run.map.galaxyYear === 2352 && /2352/.test(document.querySelector('.header')?.innerText ?? '')),
    await st(() => document.getElementById('crumbShip')?.parentElement?.innerText ?? ''));

  // --- HALCYON's DESK: the greying, a TOO LATE click -------------------------------------------------------------------
  await st(() => window.__ap.skipBoot());
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  await page.waitForTimeout(600);
  // Slice 3b: the Mv requested at ARES-VII's desk arrived; the mail came; the flight INBOX window from the dock.
  const halcyonArrived = await st(() => ({
    lines: window.__ap.log().filter((entry) => /^> (DELIVERY|\d+ NEW MESSAGE)/.test(entry.text)).map((entry) => entry.text),
    move: window.__ap.store.getState().run.licences.includes('move'), mv: window.__ap.store.getState().memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move'),
    dock: document.getElementById('inboxDockLabel').innerText, fresh: document.querySelector('.dock-item[data-tool="inbox"]').classList.contains('fresh-mail'),
    win: !document.getElementById('inboxWin').hidden,
  }));
  check('3b: HALCYON\'s boot said `> DELIVERY: mv (arrived 2337)` and `> 2 NEW MESSAGES · INBOX`; MOVE reached the unit', halcyonArrived.lines.includes('> DELIVERY: mv (arrived 2337)')
    && halcyonArrived.lines.at(-1) === '> 2 NEW MESSAGES · INBOX' && halcyonArrived.move && halcyonArrived.mv, JSON.stringify(halcyonArrived));
  check('…the dock reads `INBOX 2` and pulses; the INBOX window is closed', halcyonArrived.dock === 'INBOX 2' && halcyonArrived.fresh && !halcyonArrived.win, JSON.stringify(halcyonArrived));
  await page.locator('.dock-item[data-tool="inbox"]').click();
  await page.waitForTimeout(400);
  const flightInbox = () => st(() => {
    const win = document.getElementById('inboxWin');
    const box = win.getBoundingClientRect();
    return {
      shown: !win.hidden && box.width > 0 && box.height > 0, inView: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      rows: [...win.querySelectorAll('.ib-row')].map((row) => `${row.dataset.id}${row.classList.contains('unread') ? '*' : ''}`),
      reader: win.querySelector('.ib-reader') ? { stamps: win.querySelector('.ib-stamps')?.textContent ?? '', subject: win.querySelector('.ib-reader-subject .ib-v')?.textContent ?? '' } : null,
      dock: document.getElementById('inboxDockLabel').innerText, fresh: document.querySelector('.dock-item[data-tool="inbox"]').classList.contains('fresh-mail'),
      phase: window.__ap.store.getState().run.phase,
    };
  });
  let mail = await flightInbox();
  check('…a click on it opens the INBOX window in flight: the reply and RIVERSIDE\'s postcard unread on top, the welcome read; the pulse stops', mail.shown && mail.inView
    && mail.rows.length === 3 && mail.rows.includes('reply:0*') && mail.rows.includes('postcard:0:1*') && mail.rows.at(-1) === 'welcome' && !mail.fresh && mail.phase === 'flight',
    JSON.stringify(mail));
  await page.locator('#inboxWin .ib-row[data-id="reply:0"]').click();
  await page.waitForTimeout(400);
  mail = await flightInbox();
  check('…a click opens CONTROL\'s reply to ARES-VII: SENT 2308 · RECEIVED 2337; the dock reads `INBOX 1`', mail.reader?.stamps === 'SENT 2308 · RECEIVED 2337'
    && /ARES-VII/.test(mail.reader.subject) && mail.dock === 'INBOX 1' && mail.rows.includes('reply:0'), JSON.stringify(mail));
  await shot('05b-flight-inbox');
  await page.locator('.dock-item[data-tool="inbox"]').click();
  await page.waitForTimeout(300);
  check('…the dock item closes it again', await st(() => document.getElementById('inboxWin').hidden));
  await run.lockInRing();
  await run.landToReport();
  await run.finishReport();
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk', 5000);
  await page.waitForTimeout(2500);
  view = await run.desk();
  check('HALCYON\'s DESK: YEAR 2352, `1 SHIP NOW OUT OF YOUR REACH` (OSPREY greys), no CONTROL line, nothing picked', view.shown
    && view.where === 'UNIT-047 · YEAR 2352 · HALCYON' && view.beat === '1 SHIP NOW OUT OF YOUR REACH' && view.control === null && view.selected === null
    && view.nodes.find((node) => node.slot === OSPREY)?.state === 'past', JSON.stringify({ where: view.where, beat: view.beat, control: view.control, osprey: view.nodes.find((node) => node.slot === OSPREY) }));
  from = await cues();
  const late = await run.clickNode(ALBATROSS);
  await page.waitForTimeout(400);
  view = await run.desk();
  check('a click on ALBATROSS (TOO LATE BY 18 YRS): its card in red, a buzz, no pick and no course', late === true && view.phase === 'desk' && view.selected === null
    && view.card?.name === 'ALBATROSS' && view.card.state === 'too-late' && /TOO LATE BY 18 YRS$/.test(view.card.sched ?? '')
    && (await cuesSince(from)).includes('buzz') && view.go === 'SET COURSE ▸ … [ENTER]', JSON.stringify({ late, selected: view.selected, card: view.card, go: view.go }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check('…ENTER with nothing picked stays on the chart', await st(() => window.__ap.store.getState().run.phase === 'desk'));
  await shot('06-too-late');

  // --- TIGHT's 0-charge confirm (a forced unit: no REPAIR CHARGE, no star credit) -----------------------------------------
  // Slice 3b: with a big delivery for LAPWING, Repair.bak (4 blocks), requested by __ap.
  await st(() => window.__ap.store.update((d) => {
    for (const seg of d.memory) if (seg.type === 'redundancy') seg.used = 0;
    d.run.pendingStarCredit = 0;
    d.run.pendingStars = 0;
    d.ui.memoryRev++;
  }));
  await st(() => window.__ap.request('repair-bak'));
  await run.clickNode(LAPWING);
  await page.waitForTimeout(400);
  view = await run.desk();
  check('LAPWING (TIGHT) with no charge aboard: MEMORY 256 · TIGHT · ROOM FOR YOU 88, NO CHARGE ARRIVES', view.selected === LAPWING
    && view.card?.rows.includes('memory=MEMORY 256 · TIGHT · ROOM FOR YOU 88') && view.card.rows.includes('fit=NO CHARGE ARRIVES'), JSON.stringify(view.card?.rows));
  check('3b: …and Repair.bak (requested by __ap) waits there: `Repair.bak ✓ WAITING HERE`', view.card?.rows.includes('deliveries=Repair.bak ✓ WAITING HERE'), JSON.stringify(view.card?.rows));
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  await page.waitForTimeout(800);
  const zero = await st(() => ({
    model: window.__ap.transmitModel().room, text: document.getElementById('transmitScreen').innerText,
    offer: window.__ap.draft()?.offer.map((card) => card.id) ?? [],
  }));
  check('…the PACKET: ROOM 88 · FILES n · NO FLOOR and `→ 0 ON ARRIVAL`', zero.model.confirm !== null && /ROOM 88 · FILES \d+ · NO FLOOR/.test(zero.text) && /→ 0 ON ARRIVAL/.test(zero.text),
    JSON.stringify({ room: zero.model.line, charge: zero.model.charge }));
  const bigChip = await deliveryChips();
  check('3b: …its chip `Repair.bak · 4 BLOCKS · ARRIVED 2459 · [SEND ON]`, counted in FILES; it all fits', bigChip.chips.length === 1
    && bigChip.chips[0].label === 'Repair.bak · 4 BLOCKS · ARRIVED 2459 · [SEND ON]' && bigChip.tooMany === null && bigChip.files === zero.model.fit.files, JSON.stringify(bigChip));
  // SEND ON forced: ◀ CHART, the unit filled with spare files by __ap.give until its files fit LAPWING's room but not with the
  // delivery beside them, ENTER again.
  await page.keyboard.press('Escape');
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk', 4000);
  const ownFiles = bigChip.files - 4;
  const room = zero.model.fit.room;
  const gifts = [];
  let added = 0;
  while (ownFiles + added + 3 <= room && ownFiles + added + 4 <= room) { gifts.push('cp'); added += 3; }
  while (ownFiles + added + 4 <= room) { gifts.push('swap'); added += 1; }
  const given = await st((files) => files.flatMap((file) => window.__ap.give(file)).map((seg) => seg.name), gifts);
  await page.keyboard.press('Enter');
  await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 4000);
  await page.waitForTimeout(800);
  const pickOffer = await st(() => window.__ap.draft()?.offer.map((card) => card.id) ?? []);
  // A card that is not the +12 charge (it would bring charge across).
  const pickIndex = pickOffer.findIndex((id) => id !== 'charge');
  check(`…a card that brings no charge picked ([${pickIndex + 1}])`, pickIndex >= 0 && (await run.pickCard(pickIndex)) === pickOffer[pickIndex], pickOffer.join(','));
  await page.waitForTimeout(300);
  const over = await deliveryChips();
  check(`3b: SEND ON forced: ${added} blocks of spare files given (${given.join(', ')}), files + the delivery are over the room: TRANSMIT ▸ waits`,
    over.files === ownFiles + added + 4 && over.files > room && ownFiles + added <= room && over.tooMany !== null && /TOO MANY/.test(over.tooMany)
    && over.go === 'LEAVE FILES BEHIND FIRST', JSON.stringify(over));
  await shot('06b-send-on-over');
  await page.locator('#transmitScreen .tx-delivery').first().click();
  await page.waitForTimeout(400);
  const sentOn = await deliveryChips();
  check('…a click on the chip sends it on (`SENT ON · RIDES YOUR NEXT HOP`): FILES drops by 4 and the packet fits', sentOn.chips[0]?.sentOn && !sentOn.chips[0].lost
    && sentOn.chips[0].label === 'Repair.bak · 4 BLOCKS · ARRIVED 2459 · SENT ON · RIDES YOUR NEXT HOP' && sentOn.files === over.files - 4 && sentOn.tooMany === null
    && (await st(() => window.__ap.repo().deliveries?.[0]?.sendOn === true)), JSON.stringify(sentOn));
  await shot('06c-send-on');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const ask = await st(() => {
    const el = document.querySelector('#transmitScreen .tx-confirm');
    return { shown: el !== null && !el.hidden, q: el?.querySelector('.tx-confirm-q')?.textContent ?? null, keys: el?.querySelector('.tx-confirm-keys')?.textContent ?? null,
      go: !document.getElementById('txGo').hidden, phase: window.__ap.store.getState().run.phase };
  });
  check('TRANSMIT ▸ asks first, inline: ARRIVE WITH NO REPAIR CHARGE? [ENTER] yes · [ESC] no', ask.shown && ask.q === 'ARRIVE WITH NO REPAIR CHARGE?'
    && ask.keys === '[ENTER] yes · [ESC] no' && !ask.go && ask.phase === 'transmit', JSON.stringify(ask));
  await shot('07-zero-confirm');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('…ESC answers no: still packing (the confirm gone, TRANSMIT ▸ back, the PACKET still up)', await st(() => document.querySelector('#transmitScreen .tx-confirm').hidden
    && !document.getElementById('txGo').hidden && window.__ap.store.getState().run.phase === 'transmit'));
  const logFrom = await st(() => Math.max(-1, ...window.__ap.log().map((entry) => entry.id)));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  const lapwing = await waitFor(() => window.__ap.store.getState().level.shipName === 'LAPWING' && ['boot', 'flight'].includes(window.__ap.store.getState().run.phase), 20000, 100);
  // The boot types its lines in time (up to 13 of them): wait for it to reach the charge line, or the flight.
  await waitFor(() => window.__ap.log().some((entry) => /NO ROOM ON LAPWING/.test(entry.text)) || window.__ap.store.getState().run.phase === 'flight', 30000, 200);
  await page.waitForTimeout(500);
  const tight = await st((n) => ({
    line: window.__ap.log().filter((entry) => /REPAIR CHARGE/.test(entry.text)).map((entry) => entry.text),
    boot: window.__ap.log().filter((entry) => entry.text.startsWith('>')).map((entry) => entry.text).slice(-14),
    racks: [...new Set([...document.querySelectorAll('#memWrap .addr-row[data-rack]')].map((row) => row.dataset.rack))].join(''),
    cls: window.__ap.store.getState().level.memoryClass, total: window.__ap.store.getState().memory.reduce((sum, seg) => sum + seg.size, 0),
  }), logFrom);
  check('ENTER, ENTER: sent; LAPWING boots `> REPAIR CHARGE 0 · NO ROOM ON LAPWING` on a TIGHT ship (racks A B C E, 256 blocks)', lapwing
    && tight.line.includes('> REPAIR CHARGE 0 · NO ROOM ON LAPWING') && tight.cls === 'TIGHT' && tight.racks === 'ABCE' && tight.total === 256, JSON.stringify(tight));
  await shot('08-lapwing-boot');
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight' || window.__ap.store.getState().run.phase === 'boot', 5000);
  await st(() => window.__ap.skipBoot());
  await waitFor(() => window.__ap.store.getState().run.phase === 'flight', 20000);
  const waiting = await st((n) => ({
    delivery: window.__ap.log().filter((entry) => entry.id > n && /^> DELIVERY:/.test(entry.text)).map((entry) => entry.text),
    requests: window.__ap.repo().state.requests.map((request) => ({ file: request.file, status: request.status, at: request.at })),
  }), logFrom);
  check('3b: …the sent-on Repair.bak did not arrive (no `> DELIVERY:` line); it waits in LAPWING\'s receiver for the next hop', waiting.delivery.length === 0
    && waiting.requests.some((request) => request.file === 'repair-bak' && request.status === 'waiting' && request.at === LAPWING), JSON.stringify(waiting));

  // --- Slice 3b: the last-rm prompt. An rm given (DELETE reaches the unit), then taken out of memory by __ap's store. ------
  const rmGone = await st(() => {
    const ap = window.__ap;
    ap.give('rm');
    ap.store.update((d) => {
      const at = d.memory.findIndex((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete');
      const rm = d.memory[at];
      let lo = at;
      let hi = at;
      let size = rm.size;
      if (d.memory[at - 1]?.type === 'free' && d.memory[at - 1].reservedBy === undefined) { lo--; size += d.memory[lo].size; }
      if (d.memory[at + 1]?.type === 'free' && d.memory[at + 1].reservedBy === undefined) { hi++; size += d.memory[hi].size; }
      d.memory.splice(lo, hi - lo + 1, { type: 'free', id: 'free_e2e_rm_gone', name: 'FREE', size });
      d.ui.memoryRev++;
    });
    const s = ap.store.getState();
    return { delete: s.run.licences.includes('delete'), rms: s.memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete').length, memory: ap.checkMemory() };
  });
  check('…on LAPWING an rm is given (DELETE licensed) and deleted by __ap: no rm left, memory whole', rmGone.delete && rmGone.rms === 0 && rmGone.memory === true, JSON.stringify(rmGone));
  await run.lockInRing({ sleep: true });
  await run.landToReport();
  await run.finishReport();
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 6000);
  await page.waitForTimeout(1500);
  tabs = await run.deskTabs();
  const rmRow = tabs.rows.find((row) => row.file === 'rm');
  check('LAPWING\'s DESK opens on the REPOSITORY with Rm lit and tagged, under `YOUR LAST RM IS GONE · NO RM, NO WAY TO DELETE THE ROOT`', tabs.tab === 'repository'
    && tabs.repoShown && rmRow?.focus === true && rmRow.tag === ':) RECOMMENDED FOR YOU' && tabs.rows.filter((row) => row.focus).length === 1
    && tabs.warn === 'YOUR LAST RM IS GONE · NO RM, NO WAY TO DELETE THE ROOT', JSON.stringify({ tab: tabs.tab, warn: tabs.warn, rows: tabs.rows.map((row) => `${row.file}${row.focus ? '!' : ''}${row.tag ? ':)' : ''}`) }));
  check('…IN TRANSIT names the sent-on Repair.bak waiting in LAPWING\'s receiver', tabs.transit.includes('Repair.bak · WAITING IN LAPWING\'S RECEIVER'), JSON.stringify(tabs.transit));
  await shot('09-last-rm');

  // --- Slice 6: a POOR card. VESPER's DESK (visit 4, by __ap.route along the worked route) has KITTIWAKE in reach, POOR on
  // this seed: its SITE DATA row in the warning tone, `LZ: 2 · SURVEY NEEDED`; TRAINING's AHEAD line's second line. (Slice 7d:
  // CORMORANT, POOR too, is this seed's gone-resident `?` ship: its card reads `??? · NO TRANSPONDER` for its site data.)
  await st(() => window.__ap.route([0, 2, 5, 11]));
  await waitFor(() => { const s = window.__ap.store.getState(); if (s.run.phase === 'boot') window.__ap.skipBoot(); return s.run.phase === 'flight'; }, 30000);
  await run.lockInRing({ sleep: true });
  await run.landToReport();
  await run.finishReport();
  await waitFor(() => window.__ap.store.getState().run.phase === 'desk' && !document.getElementById('deskScreen').hidden, 6000);
  await page.waitForTimeout(1500);
  await page.locator('#deskScreen .desk-tab[data-tab="card"]').click();
  await page.waitForTimeout(300);
  await run.clickNode(14);
  await page.waitForTimeout(400);
  view = await run.desk();
  const poorTone = await st(() => [...(document.querySelector('#deskScreen .desk-card .dc-row.key-site')?.classList ?? [])].join(' '));
  check('slice 6: from VESPER\'s DESK, KITTIWAKE\'s card: `SITE DATA · POOR · ARRIVAL CONTROL GUESSED` in the warning tone, `LZ: 2 · SURVEY NEEDED`',
    view.card?.name === 'KITTIWAKE' && view.card.rows.includes('site=POOR · ARRIVAL CONTROL GUESSED') && /warn/.test(poorTone)
    && view.card.rows.includes('lzs=LZ: 2 · SURVEY NEEDED'), JSON.stringify({ rows: view.card?.rows, poorTone }));
  await shot('10-poor-card');
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(500);
  const aheadSite = await st(() => document.querySelector('#deskScreen .tr-ahead-site')?.textContent ?? null);
  check('…TRAINING\'s AHEAD row says `SITE DATA POOR · SURVEY FINDS BETTER SITES` (SURVEY\'s branch opens at visit 4)',
    aheadSite === 'SITE DATA POOR · SURVEY FINDS BETTER SITES', String(aheadSite));
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await context.close();
}

// =========================================================================================================================
// Phone, 390×844 (touch): the beacon, the DESK, the bottom sheet, SET COURSE pinned
// =========================================================================================================================
{
  const vw = 390;
  const vh = 844;
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const tab = await openPage(context);
  const { page, kit, run } = tab;
  const { st, waitFor, errors } = kit;
  const shot = (name) => page.screenshot({ path: join(SHOTS, `map-desk-phone-${name}.png`) });
  const rect = (selector) => st((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  }, selector);
  const overflow = () => st(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.documentElement.clientWidth);

  const title = await titleLook(st);
  check('phone title: the upright chart with SOL and the beacon `FINAL SHIP · LAST LIGHT · 3020` on screen, no sideways scroll',
    title.beacon === 'FINAL SHIP · LAST LIGHT · 3020' && title.beaconOnScreen && title.sol === 'SOL' && !(await overflow()), JSON.stringify(title));
  await shot('01-title');
  const reached = await toFirstDesk(tab, true);
  await page.waitForTimeout(1500);
  const deskBox = await rect('#deskScreen');
  const goBox = await rect('#deskGo');
  check('phone: the report\'s CONTINUE (tapped) brings the DESK, the whole screen, no sideways scroll', reached && deskBox !== null
    && deskBox.left <= 0 && deskBox.right >= vw - 1 && !(await overflow()), JSON.stringify(deskBox));
  check('…SET COURSE pinned at the bottom of the screen', goBox !== null && goBox.bottom <= vh + 1 && goBox.bottom >= vh - 80 && goBox.left >= 0 && goBox.right <= vw,
    JSON.stringify(goBox));
  await shot('02-desk');
  // Slice 4: the sheet opens on TRAINING for the required first pick: a tap on the card arms it, a tap on the bar trains it.
  const firstTab = await run.deskTabs();
  check('slice 4 phone: the sheet is up on TRAINING, the bar `CHOOSE YOUR FIRST SKILL`', firstTab.tab === 'training'
    && (await run.capsText('#deskGo')) === 'CHOOSE YOUR FIRST SKILL', `${firstTab.tab} ${await run.capsText('#deskGo')}`);
  // Slices 4c–4e: both cards, side by side or stacked, inside the screen's width.
  const phoneCards = await firstCards(st);
  check('4c phone: the two cards (AUTOBURN v1, AUTODROP v1) fit the width', phoneCards.map((card) => card.name).join(' | ') === 'AUTOBURN v1 | AUTODROP v1'
    && phoneCards.every((card) => card.left >= 0 && card.right <= vw + 1) && !(await overflow()), JSON.stringify(phoneCards));
  await page.tap('#deskScreen .tr-card[data-card="1"]');
  await page.waitForTimeout(400);
  const armedGo = await run.capsText('#deskGo');
  await page.tap('#deskGo');
  const phoneTrained = await waitFor(() => window.__ap.store.getState().run.skills.pending.length === 1, 4000, 100)
    && (await st(() => window.__ap.store.getState().run.skills.pending[0]?.skill)) === 'autoburn';
  check('…a tap on card 1 arms AUTOBURN (the bar reads `TRAIN ▸ 3 CYCLES [ENTER]`), a tap on the bar trains it', armedGo === 'TRAIN ▸ 3 CYCLES [ENTER]' && phoneTrained,
    `${armedGo} ${phoneTrained}`);
  await page.tap('#deskScreen .desk-tab[data-tab="card"]');
  await page.waitForTimeout(500);
  if (await st(() => document.getElementById('deskScreen').classList.contains('sheet-open'))) {
    await page.tap('#deskScreen .desk-sheet-close');
    await page.waitForTimeout(500);
  }
  // Slice 3b: the sheet's tab bar peeks at the bottom on the arm; a tap on a tab opens the sheet on it.
  const sheetLook = () => st(() => {
    const root = document.getElementById('deskScreen');
    const win = root.querySelector('.desk-card-win').getBoundingClientRect();
    const bar = root.querySelector('.desk-tabs').getBoundingClientRect();
    return { open: root.classList.contains('sheet-open'), tabs: root.classList.contains('has-tabs'),
      win: { top: Math.round(win.top), bottom: Math.round(win.bottom), left: Math.round(win.left), right: Math.round(win.right) },
      bar: { top: Math.round(bar.top), bottom: Math.round(bar.bottom), height: Math.round(bar.height) } };
  });
  const peek = await sheetLook();
  const goPeek = await rect('#deskGo');
  check('3b phone: the sheet\'s tab bar (CARD / REPOSITORY / INBOX) peeks at the bottom, just over SET COURSE, before a ship is picked', peek.tabs && !peek.open
    && peek.bar.height > 0 && peek.bar.top >= vh * 0.75 && goPeek !== null && peek.bar.bottom <= goPeek.top + 1, JSON.stringify({ peek, go: goPeek }));
  await page.tap('#deskScreen .desk-tab[data-tab="repository"]');
  await page.waitForTimeout(600);
  let phoneTabs = await run.deskTabs();
  let sheetNow = await sheetLook();
  check('…a tap on REPOSITORY opens the sheet on it, full width, the rows on screen', sheetNow.open && phoneTabs.tab === 'repository' && phoneTabs.repoShown
    && phoneTabs.rows.length === 7 && sheetNow.win.left <= 1 && sheetNow.win.right >= vw - 1 && sheetNow.win.top > 40 && !(await overflow()), JSON.stringify({ sheetNow, tab: phoneTabs.tab }));
  await page.tap('#deskScreen .rp-row[data-file="mv"]');
  await page.waitForTimeout(400);
  phoneTabs = await run.deskTabs();
  check('…a tap on Mv REQUESTs it (the badge names it)', phoneTabs.pick === 'mv' && phoneTabs.rows[0].requested && badgeOf(phoneTabs, 'repository') === 'Mv', JSON.stringify({ pick: phoneTabs.pick }));
  await shot('02b-sheet-repository');
  await page.tap('#deskScreen .desk-tab[data-tab="inbox"]');
  await page.waitForTimeout(500);
  phoneTabs = await run.deskTabs();
  check('…a tap on INBOX shows the welcome in the sheet', (await sheetLook()).open && phoneTabs.tab === 'inbox' && phoneTabs.inboxShown
    && phoneTabs.mail.map((row) => row.id).join() === 'welcome' && badgeOf(phoneTabs, 'inbox') === '1', JSON.stringify(phoneTabs.mail));
  await shot('02c-sheet-inbox');
  await page.tap('#deskScreen .desk-tab[data-tab="card"]');
  await page.waitForTimeout(400);
  phoneTabs = await run.deskTabs();
  // With no ship picked the card has nothing to show: the sheet may already be back down to its tab bar; else ✕ closes it.
  const cardSheet = await sheetLook();
  check('…a tap on CARD goes back to the card', phoneTabs.tab === 'card', JSON.stringify({ tab: phoneTabs.tab, open: cardSheet.open }));
  if (cardSheet.open) {
    await page.tap('#deskScreen .desk-sheet-close');
    await page.waitForTimeout(500);
  }
  check(`…the sheet is down again, its tab bar peeking (${cardSheet.open ? 'closed by ✕' : 'by itself: no ship picked'})`, !(await sheetLook()).open && (await sheetLook()).bar.top >= vh * 0.75,
    JSON.stringify(await sheetLook()));
  const tapped = await run.clickNode(HALCYON, { tap: true });
  await page.waitForTimeout(700);
  const sheet = await st(() => {
    const root = document.getElementById('deskScreen');
    const r = root.querySelector('.desk-card-win').getBoundingClientRect();
    return { open: root.classList.contains('sheet-open'), selected: window.__ap.store.getState().ui.deskSelected,
      name: root.querySelector('.desk-card .dc-name')?.textContent ?? null,
      box: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } };
  });
  const goAfter = await rect('#deskGo');
  check('a tap on HALCYON opens its card as a bottom sheet (full width, at the bottom, over the chart)', tapped === true && sheet.open && sheet.selected === HALCYON
    && sheet.name === 'HALCYON' && sheet.box.left <= 1 && sheet.box.right >= vw - 1 && sheet.box.bottom >= vh - 120 && sheet.box.top > 80,
    JSON.stringify({ tapped, ...sheet }));
  check('…SET COURSE ▸ HALCYON still pinned on screen at the bottom', goAfter !== null && goAfter.bottom <= vh + 1 && goAfter.bottom >= vh - 80
    && (await run.capsText('#deskGo')) === 'SET COURSE ▸ HALCYON [ENTER]', `${JSON.stringify(goAfter)} ${await run.capsText('#deskGo')}`);
  check('…nothing spills sideways', !(await overflow()));
  await shot('03-sheet');
  await page.tap('#deskScreen .desk-sheet-close');
  await page.waitForTimeout(500);
  check('✕ closes the sheet; HALCYON stays picked', await st(() => !document.getElementById('deskScreen').classList.contains('sheet-open')
    && window.__ap.store.getState().ui.deskSelected === 2));
  await page.tap('#deskGo');
  check('a tap on SET COURSE opens the PACKET', await waitFor(() => window.__ap.store.getState().run.phase === 'transmit', 5000));
  check('phone: no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await context.close();
}

await finish(browser);
