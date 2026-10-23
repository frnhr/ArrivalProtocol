// WP5 part 2: the WAKE REPORT's model and the stars (§4.4, §9 WP5 items 8–9), headless.
// • the stars: ★ ORBIT LOCKED (an ACCEPT is not a lock), ★ INTACT (≥ 95% of the souls woke intact),
//   ★ FUEL (≥ 20% at the lock, judged on the number the FUEL bar shows), +6 REPAIR CHARGE each;
//   every missed star names its reason (C09 REYES printed at 71% — repair before printing);
// • the credits: the lead (Ada Okafor, 11, "Is it morning?") first, then one colonist per cluster in
//   the order they woke; a cluster with gaps says a missing-memories line, not its own words;
// • the totals: SOULS WOKE as §4.4 scores it (2,400 / 2,400 WOKE; missing memories count half) and
//   the breakdown;
// • the MiniHud's live tally (★ INTACT 11/12 while C09 is hurt, 12/12 once healed);
// • every report line fits 70 characters and avoids the glossary's "never say" words.
import { check, finish } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { wakeReportModel, creditsOf } from '@systems/wake-report';
import { shipStars, starCharge, intactTally } from '@systems/stars';
import { REPORT_TEXT, CREDIT_STATUS, STAR_TEXT, STAR_MISSED } from '@data/script';
import { GAPS_WORDS_POOL, FAMILY_POOL, ARES_RUN1_FAMILIES } from '@data/souls';
import { integrityState } from '@state/selectors';
import { MAX_LINE_CHARS, STAR_CHARGE_BONUS } from '@data/tuning';
import { byDepth } from '../depth';

const h = createHarness5(1, { soulsFound: true });
const s = () => h.store.getState();

// A fresh ship 1 with the colonists found; C09 healed unless `hurt`, FUEL set to `fuelPct`.
function fresh(opts: { hurt?: boolean; fuelPct?: number; seed?: number } = {}): void {
  h.resetTo('flight', opts.seed ?? 1);
  h.noFault();
  if (!opts.hurt) {
    const c09 = h.soul('C09');
    c09.integrity = 100;
    c09.state = integrityState(100);
  }
  if (opts.fuelPct !== undefined) h.store.mutate((d) => { d.burn.fuelPct = opts.fuelPct!; });
}

function printToReport(range: number, status: 'locked' | 'accepted' = 'locked'): void {
  h.startPrinting(range, status);
  h.stepUntil(() => s().run.phase === 'report', 400);
}

const starLine = (): string => shipStars(s()).map((star) => `${star.earned ? '★' : '☆'} ${star.label}${star.reason ? ` (${star.reason})` : ''}`).join(' | ');

// --- Three stars ---------------------------------------------------------------------------------------
{
  fresh({ fuelPct: 34.2 });
  check('the live tally while printing: ★ INTACT 12/12 with C09 healed', intactTally(s()).intact === 12 && intactTally(s()).clusters === 12 && intactTally(s()).onTrack);
  printToReport(1);
  const model = wakeReportModel(s());
  check('a clean lock with 34% FUEL: ★★★', model.stars.every((star) => star.earned) && model.stars.map((star) => star.label).join() === 'ORBIT LOCKED,INTACT 12/12,FUEL 35%', starLine());
  check('★★★ is +18 REPAIR CHARGE ON NEXT SHIP', model.charge === 3 * STAR_CHARGE_BONUS && model.chargeLine === '+18 REPAIR CHARGE ON NEXT SHIP', model.chargeLine);
  check('totals: 2,400 / 2,400 WOKE', model.totalsLine === '2,400 / 2,400 WOKE' && model.woke === 2400 && model.total === 2400
    && model.missingLine === null, model.totalsLine);
  check('breakdown: 2,400 intact · 0 missing memories · 0 did not wake', model.breakdown === '2,400 intact · 0 missing memories · 0 did not wake', model.breakdown);
  check('route: ARES-VII → KEPLER-186F', model.route === 'ARES-VII → KEPLER-186F', model.route);

  const credits = model.credits;
  const lead = credits[0]!;
  check('the credits lead with Ada Okafor, 11, of C12', lead.lead && lead.cluster === 'C12' && lead.name === 'Ada Okafor' && lead.age === 11, JSON.stringify(lead));
  check('Ada woke and asked "Is it morning?"', lead.words === 'Is it morning?' && lead.status === 'WOKE' && lead.about === 'wants to name the first tree.');
  check('then one colonist per cluster, in the order they woke (C01 … C11)', credits.length === 12
    && credits.slice(1).map((entry) => entry.cluster).join() === 'C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11'
    && credits.slice(1).every((entry) => !entry.lead && entry.about === null), credits.map((entry) => entry.cluster).join());
  check('every credit is a person: a first name before the family, an age, their own first words', credits.every((entry) =>
    entry.name.endsWith(` ${entry.family}`) && entry.age > 0 && typeof entry.words === 'string' && entry.words.length > 0),
  credits.slice(1, 4).map((entry) => `${entry.name}, ${entry.age}: "${entry.words}"`).join(' | '));
}

// --- C09 never repaired --------------------------------------------------------------------------------
{
  fresh({ hurt: true, fuelPct: 50 });
  const live = intactTally(s());
  check('the live tally while printing: ★ INTACT 11/12, off track', live.intact === 11 && live.clusters === 12 && !live.onTrack, JSON.stringify(live));
  printToReport(1);
  const model = wakeReportModel(s());
  const intact = model.stars.find((star) => star.id === 'intact')!;
  check('C09 woke with gaps: ☆ INTACT 11/12', !intact.earned && intact.label === 'INTACT 11/12', starLine());
  check('the reason is §4.4\'s: C09 REYES printed at 71% — repair before printing', intact.reason === 'C09 REYES printed at 71% — repair before printing', intact.reason ?? '');
  check('two stars: +12 REPAIR CHARGE ON NEXT SHIP', model.charge === 12 && model.chargeLine === '+12 REPAIR CHARGE ON NEXT SHIP', model.chargeLine);
  const c09 = model.credits.find((entry) => entry.cluster === 'C09')!;
  check('C09\'s colonist woke with missing memories, and says so', c09.outcome === 'gaps' && c09.status === 'WOKE · MISSING MEMORIES'
    && GAPS_WORDS_POOL.includes(c09.words ?? ''), `${c09.name}: "${c09.words}"`);
  check('breakdown: 2,200 intact · 200 missing memories · 0 did not wake', model.breakdown === '2,200 intact · 200 missing memories · 0 did not wake', model.breakdown);
  // WP7 (the lead's decision on WP5 question 2): WOKE counts heads everywhere; the cost stands on the line
  // under it. §4.4's half credit is only the run's SCORE on RUN END.
  check('the headline counts heads: 2,400 / 2,400 WOKE, with 200 WITH MISSING MEMORIES under it', model.totalsLine === '2,400 / 2,400 WOKE'
    && model.woke === 2400 && model.wokeWithGaps === 200 && model.missingLine === '200 WITH MISSING MEMORIES', `${model.totalsLine} / ${model.missingLine}`);
}

// --- An accepted orbit -----------------------------------------------------------------------------------
{
  fresh({ fuelPct: 60 });
  printToReport(0.62, 'accepted');
  const stars = shipStars(s());
  const [locked, intact, fuel] = stars;
  check('ACCEPT is not a lock: ☆ ORBIT LOCKED with its reason', !locked!.earned && locked!.reason === STAR_MISSED.accepted, starLine());
  check('…and no FUEL ★ without the lock, whatever is left', !fuel!.earned && fuel!.reason === STAR_MISSED.fuelNoLock && fuel!.label === 'FUEL 60%', starLine());
  check('the colonists still woke intact at 62% range: ★ INTACT', intact!.earned, starLine());
  check('one star: +6', starCharge(stars) === 6);
}

// --- Low range: intact clusters roll into gaps --------------------------------------------------------
{
  fresh({ fuelPct: 60 });
  printToReport(0.3, 'accepted');
  const intact = shipStars(s())[1]!;
  const gaps = s().souls.results.filter((result) => result.outcome === 'gaps');
  check('at 30% range some intact clusters woke with gaps (the low-range roll)', gaps.length > 0 && gaps.every((result) => result.integrity >= 95), `${gaps.length} with gaps`);
  check('the reason names the printer range: n clusters at PRINTER RANGE 30% — lock it', !intact.earned
    && (gaps.length === 1
      ? /^C\d\d [A-Z' -]+ printed at PRINTER RANGE 30% — lock it$/.test(intact.reason ?? '')
      : intact.reason === `${gaps.length} clusters at PRINTER RANGE 30% — lock it`), intact.reason ?? '');
  check('the recorded range is the printer range at the print', s().souls.results.every((result) => Math.abs(result.range - 0.3) < 0.01));
}
{
  // Fix round 1: a low-range ACCEPT with C09 unrepaired lost most clusters to the range, so the
  // reason leads with the range (lock it), not with the repair, and names C09 after it.
  fresh({ hurt: true, fuelPct: 60 });
  printToReport(0.3, 'accepted');
  const intact = shipStars(s())[1]!;
  const rolled = s().souls.results.filter((result) => result.outcome === 'gaps' && result.integrity >= 95).length;
  check('low range and C09 hurt: the range leads, C09 follows (n clusters at PRINTER RANGE 30% — lock it · C09 hurt (71%))',
    rolled > 1 && intact.reason === `${rolled} clusters at PRINTER RANGE 30% — lock it · C09 hurt (71%)`, `${rolled} rolled: ${intact.reason}`);
}
{
  // Fix round 1: no two credits say the same words, missing-memories lines included (Ada and C04
  // both said "What was I going to do here?" on most low-range seeds).
  let repeated = '';
  const seeds = byDepth(12, 40);
  for (let seed = 1; seed <= seeds && !repeated; seed++) {
    fresh({ seed, hurt: true, fuelPct: 60 });
    printToReport(0.3, 'accepted');
    const words = wakeReportModel(s()).credits.map((entry) => entry.words).filter((words): words is string => words !== null);
    if (new Set(words).size !== words.length) repeated = `seed ${seed}: ${words.join(' | ')}`;
  }
  check(`${seeds} low-range seeds: no two credits say the same words (gaps lines included)`, repeated === '', repeated);
}

// --- The FUEL ★ follows the FUEL bar -----------------------------------------------------------------------
{
  fresh({ fuelPct: 19.2 });
  printToReport(1);
  const fuel = shipStars(s())[2]!;
  check('19.2% reads 20% on the bar, and earns the ★', fuel.earned && fuel.label === 'FUEL 20%', starLine());
  fresh({ fuelPct: 12 });
  printToReport(1);
  const low = shipStars(s())[2]!;
  check('12%: ☆ FUEL with "FUEL 12% at the lock — the ★ notch is at 20%"', !low.earned && low.reason === 'FUEL 12% at the lock — the ★ notch is at 20%', low.reason ?? '');
  check('no stars at all would say what one is worth', REPORT_TEXT.charge(0) === '+0 REPAIR CHARGE ON NEXT SHIP · each ★ is worth +6');
}

// --- Seeds: every report holds together ----------------------------------------------------------------
{
  let broken = '';
  for (let seed = 1; seed <= 6 && !broken; seed++) {
    fresh({ seed, hurt: seed % 2 === 0, fuelPct: 10 + seed * 5 });
    printToReport(seed % 3 === 0 ? 0.4 : 1);
    const model = wakeReportModel(s());
    const clusters = new Set(model.credits.map((entry) => entry.cluster));
    if (model.credits.length !== 12 || clusters.size !== 12) broken = `seed ${seed}: ${model.credits.length} credits`;
    else if (model.credits[0]!.cluster !== s().souls.lead) broken = `seed ${seed}: led by ${model.credits[0]!.cluster}`;
    else if (creditsOf(s()).some((entry) => entry.words === null)) broken = `seed ${seed}: someone who woke said nothing`;
    else {
      const intactWords = model.credits.filter((entry) => entry.outcome === 'woke').map((entry) => entry.words);
      if (new Set(intactWords).size !== intactWords.length) broken = `seed ${seed}: two credits say the same words: ${intactWords.join(' | ')}`;
    }
  }
  check('six seeds: 12 credits each, the lead first, everyone who woke says something, nobody repeats', broken === '', broken);
}

// --- Words: ≤ 70 characters, no "never say" words -------------------------------------------------------
{
  const NEVER_SAY = [
    /tools mode/i, /memory mode/i, /periapsis/i, /apoapsis/i, /\buplink\b/i, /\bband\b/i, /inserted/i,
    /BURN LEFT/, /Δv/, /redundancy/i, /\bRDN\b/, /\bcores\b/i, /\bmoat\b/i, /Fleet Office/i,
  ];
  const longFamily = [...FAMILY_POOL, ...ARES_RUN1_FAMILIES].reduce((a, b) => (b.length > a.length ? b : a), '');
  const lines: string[] = [
    REPORT_TEXT.title, REPORT_TEXT.route('W'.repeat(12), 'W'.repeat(14)), REPORT_TEXT.totals(99_999, 99_999),
    REPORT_TEXT.breakdown(99_999, 99_999, 99_999), REPORT_TEXT.missing(99_999), REPORT_TEXT.charge(18), REPORT_TEXT.charge(0), REPORT_TEXT.skip, REPORT_TEXT.continue,
    ...Object.values(CREDIT_STATUS), STAR_TEXT.locked, STAR_TEXT.intact(16, 16), STAR_TEXT.fuel(100),
    STAR_MISSED.accepted, STAR_MISSED.fuelNoLock, STAR_MISSED.fuelLow(19),
    STAR_MISSED.lost('C16', longFamily) + STAR_MISSED.more(15),
    STAR_MISSED.hurt('C16', longFamily, 94) + STAR_MISSED.more(15),
    STAR_MISSED.range('C16', longFamily, 49) + STAR_MISSED.more(15),
    STAR_MISSED.rangeMany(15, 49) + STAR_MISSED.alsoHurt('C16', 94) + STAR_MISSED.more(15),
    ...GAPS_WORDS_POOL,
  ];
  const tooLong = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check(`every report line fits ${MAX_LINE_CHARS} characters (worst cases)`, tooLong.length === 0, tooLong.map((line) => `${line.length}: ${line}`).join(' | '));
  const banned = lines.filter((line) => NEVER_SAY.some((pattern) => pattern.test(line)));
  check('no report line uses a "never say" word', banned.length === 0, banned.join(' | '));
}

finish();
