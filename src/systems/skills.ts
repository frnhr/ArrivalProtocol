// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2): the general skill rows; Track FLIGHT owns
// its autoburnStatus export only.
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import { getUpgrade, UPGRADES, type UpgradeId } from '@data/upgrades';
import { currentShip } from '@systems/map-run';
import { isFirewall, upgradeFiles, integrityBand, getAiCore, coreThreads, shownIntegrity, type HealthSegment } from '@state/selectors';
import { liveUpgrades, offlineReason, type Band } from '@systems/capabilities';
import { reachMarks } from '@systems/hollow-hud';
import { ownedUpgrades } from '@systems/draft';
import { hollowLabel } from '@systems/say';
import { SKILLS_TEXT } from '@data/script';
import { autoburnStatus } from '@systems/autoburn';
import { AUTOBURN_SKILL_ROW } from '@data/skill-text';
import { REPAIR_V2_VERSION, CHARGE_CARD_BLOCKS, CORE_LOW_INTEGRITY, FUEL_TRIM_DV_BONUS_FRAC } from '@data/tuning';
import type { SkillFileSegment } from '@/types/segment';
import type { SkillId, SkillVersion, EffectiveVersion } from '@/types/skill';
import { skillFilesOf } from '@state/selectors';
import { skillLive, effectiveVersion, type OfflineReason } from '@systems/capabilities';
import { paid, fileLevel, lostLevels, restorePrice } from '@systems/skill-tree';
import { SKILL_TREE, SKILL_IDS } from '@data/skills';
import { TRAINING_TEXT } from '@data/training-text';
import {
  BAND_OK_MIN, BAND_DEGRADED_MIN, BAND_FAILING_MIN, INTEGRITY_MAX, LOCK_RANGE_TAC, REPAIR_CHARGE_PER_POINT_PER_BLOCK, FLOAT_SLACK,
} from '@data/tuning';

// The Skills window's model (§9 WP8 item 3), pure: the cards this unit carries, each with its one-line
// effect, what it is doing right now, and a health pip for every file it lives in (pillar 4: every
// capability is a file, so a card's pip is the file a kid can click, find and repair). Cards are listed in
// the order they were first picked; a file card's file that was deleted, eaten or left behind is a ✕ GONE
// pip, never a silent omission. Read every tick by SkillsWindow (a repair climbs without a store update).
// • FIREWALL.sys: each file HOLDING (it is what stops a bite on one side of HOLLOW: the strip's green shield,
//   hollow-hud.ts reachMarks, so the two never disagree) or IDLE (it holds nothing yet: MOVE it into a GAP
//   next to HOLLOW). The lines name HOLLOW as the strip does (`???`, or the unit it said it was).
// • FUEL TRIM: each file's health; THIS SHIP: +15% FUEL when it widened this ship's tank at the arrival
//   (the bonus is read once, on arrival: §9 WP8 edge case), else what the next arrival will get.
// • REPAIR v2: every Repair copy with its version; THREAD+: the AI Core and the THREADS it gives now (a Core
//   below 50 drops to one, §3.3 C5); +12 REPAIR CHARGE: what arrived.
// • WP9: AUTOBURN.skl, the skill the kid's own captures trained (not a card, so it comes first): its ACCURACY and
//   how many captures taught it, ARMED / FLYING THE SHIP NOW while it works, DAMAGED below the band it needs,
//   and a ✕ GONE pip once the file was eaten or deleted (a skill is a file: losing it is a real loss).

export type SkillPipLook = Band | 'offline' | 'holding' | 'idle';
export type SkillTone = 'good' | 'hint' | 'warn' | 'dim';

export interface SkillPip {
  segId: string | null;   // the file a click jumps to (null: the file is gone)
  look: SkillPipLook;
  glyph: string;
  label: string;          // FIREWALL.SYS, REPAIR.BAK, AI CORE
  reading: string;        // HOLDING, 84%, v2 100%, GONE
  title: string;          // the tooltip
}

// A row is a card (its id) or a skill (slice 4: one row per skill the run bought or the unit carries, SKILL_IDS order).
export type SkillRowId = UpgradeId | SkillId;

// A skill row's version line (03 §4): the pips of the versions it owns (`▮▮▯`), and what it works as now
// (`v2 · LOCK 270 · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`, `LOST v2 · RESTORE 3 AT THE NEXT DESK`).
export interface SkillRowVersion {
  pips: string;
  text: string;
  tone: SkillTone;
}

export interface SkillRow {
  id: SkillRowId;
  title: string;          // the card's name (FIREWALL.sys)
  count: string;          // ×2 for a stack, '' for one
  effect: string;         // what it does, in one line
  status: string;         // what it is doing right now
  tone: SkillTone;
  pips: SkillPip[];
  version: SkillRowVersion | null;   // a skill's (null on a card)
}

const PIP_GLYPH: Readonly<Record<SkillPipLook, string>> = {
  ok: '●', degraded: '●', failing: '●', dead: '●', missing: '✕', offline: '↻', holding: '■', idle: '■',
};

// The extra FUEL this ship's tank got at its arrival from the unit's working FUEL TRIMs (createFlight's
// mods), in whole percent: the flight's budget against the ship's stock one.
export function arrivalFuelTrimPct(state: Readonly<GameState>): number {
  const stock = currentShip(state).flight.dvBudgetKmS;
  return Math.round((state.level.dvBudgetKmS / stock - 1) * 100);
}

function pip(segId: string | null, look: SkillPipLook, label: string, reading: string, title: string): SkillPip {
  return { segId, look, glyph: PIP_GLYPH[look], label, reading, title };
}

// A file with health: its band (or ↻ while it is offline) and its integrity.
function healthPip(seg: HealthSegment, label: string, reading: string): SkillPip {
  const look: SkillPipLook = offlineReason(seg) !== null ? 'offline' : integrityBand(seg.integrity);
  return pip(seg.id, look, label, reading, SKILLS_TEXT.pipTitle.file(seg.name));
}

function gonePips(count: number, name: string): SkillPip[] {
  return Array.from({ length: Math.max(0, count) }, () => pip(null, 'missing', name.toUpperCase(), SKILLS_TEXT.pip.gone, SKILLS_TEXT.pipTitle.gone(name)));
}

// How many of each card this unit has: the picks, or what it really carries when that is more (a ?debug gift).
function cardCounts(state: Readonly<GameState>): Map<UpgradeId, number> {
  const counts = new Map<UpgradeId, number>();
  for (const id of state.run.upgrades) counts.set(id, (counts.get(id) ?? 0) + 1);
  const owned = ownedUpgrades(state);
  for (const def of UPGRADES) {
    const have = owned[def.id];
    if (have > (counts.get(def.id) ?? 0)) counts.set(def.id, have);
  }
  return counts;
}

function firewallRow(state: Readonly<GameState>, count: number): Pick<SkillRow, 'status' | 'tone' | 'pips'> {
  const files = state.memory.filter(isFirewall);
  // A FIREWALL holds a side when the strip draws its shield there (HOLLOW's look that way ends on it, and
  // HOLLOW is not dormant: a plain ARRIVAL after its one bite has stopped looking).
  const holdingIds = new Set(reachMarks(state).shields.map((shield) => shield.firewallId));
  const pips = files.map((seg) => (holdingIds.has(seg.id)
    ? pip(seg.id, 'holding', seg.name.toUpperCase(), SKILLS_TEXT.pip.holding, SKILLS_TEXT.pipTitle.file(seg.name))
    : pip(seg.id, 'idle', seg.name.toUpperCase(), SKILLS_TEXT.pip.idle, SKILLS_TEXT.pipTitle.file(seg.name))));
  const holding = pips.filter((candidate) => candidate.look === 'holding').length;
  pips.push(...gonePips(count - files.length, getUpgrade('firewall').title));
  const hollow = hollowLabel(state.run);
  if (holding > 0) return { status: SKILLS_TEXT.status.holding(holding, hollow), tone: 'good', pips };
  if (files.length > 0) return { status: SKILLS_TEXT.status.idle(hollow), tone: 'hint', pips };
  return { status: SKILLS_TEXT.status.gone, tone: 'warn', pips };
}

function fuelTrimRow(state: Readonly<GameState>, count: number): Pick<SkillRow, 'status' | 'tone' | 'pips'> {
  const files = upgradeFiles(state.memory, 'fuel-trim');
  const pips: SkillPip[] = files.map((seg) => healthPip(seg, seg.name.toUpperCase(), `${shownIntegrity(seg.integrity)}%`));
  pips.push(...gonePips(count - files.length, getUpgrade('fuel-trim').title));
  const thisShip = arrivalFuelTrimPct(state);
  const live = liveUpgrades(state.memory, 'fuel-trim');
  if (thisShip > 0) return { status: SKILLS_TEXT.status.trimThisShip(thisShip), tone: 'good', pips };
  if (live > 0) return { status: SKILLS_TEXT.status.trimNextShip(Math.round(live * FUEL_TRIM_DV_BONUS_FRAC * 100)), tone: 'hint', pips };
  if (files.length > 0) return { status: SKILLS_TEXT.status.trimNoEffect, tone: 'warn', pips };
  return { status: SKILLS_TEXT.status.gone, tone: 'warn', pips };
}

function isRepairCopy(seg: Segment): seg is Extract<Segment, { type: 'fs-tool' }> {
  return seg.type === 'fs-tool' && seg.fsTool === 'repair';
}

function repairV2Row(state: Readonly<GameState>): Pick<SkillRow, 'status' | 'tone' | 'pips'> {
  const copies = state.memory.filter(isRepairCopy);
  const pips = copies.map((seg) => healthPip(seg, seg.name.toUpperCase(), SKILLS_TEXT.pip.version(seg.version, shownIntegrity(seg.integrity))));
  return copies.some((seg) => seg.version >= REPAIR_V2_VERSION)
    ? { status: SKILLS_TEXT.status.repairV2, tone: 'good', pips }
    : { status: SKILLS_TEXT.status.noRepairV2, tone: 'warn', pips };
}

function threadRow(state: Readonly<GameState>): Pick<SkillRow, 'status' | 'tone' | 'pips'> {
  const core = getAiCore(state);
  if (!core) throw new Error('skillsModel: THREAD+ with no AI Core in memory');
  const threads = coreThreads(state);
  const pips = [healthPip(core, core.name.toUpperCase(), `${shownIntegrity(core.integrity)}%`)];
  return core.integrity < CORE_LOW_INTEGRITY
    ? { status: SKILLS_TEXT.status.threadsLow(threads), tone: 'warn', pips }
    : { status: SKILLS_TEXT.status.threads(threads), tone: 'good', pips };
}

// --- Skills (phase 3 slice 4; 03 §3.5, §4) ------------------------------------------------------------------------------

// One skill file as its chip, its INSPECT and its row read it (03 §3.5's graded damage, per file): the version it is, what
// it works as now (offline first: a copy being repaired or moved is off, not dead), and what REPAIR brings back.
export interface SkillFileView {
  nominal: SkillVersion;
  works: EffectiveVersion;
  offline: OfflineReason | null;
  damaged: boolean;                // it works below its version (not offline)
  badge: string;                   // v2, v2▸v1, v2▸off
  zones: SkillTickZone[];          // the health bar's labelled ticks, low to high
  ticks: string;                   // `v2 | v1 | off`
  worksText: string;               // WORKS AS v1 / OFF — TOO DAMAGED TO WORK / OFF WHILE IT IS REPAIRED
  repair: string | null;           // REPAIR TO 80% FOR v2 (≈ 3 CHARGE): below the band its version needs
  inspect: string;                 // v2 · 64% · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)
}

// One span of the health bar (03 §4: ticks at 80, 50 and 25), from `from`% to `to`%, and the version a file keeps there.
export interface SkillTickZone {
  from: number;
  to: number;
  works: EffectiveVersion;
  label: string;
}

const BAND_EDGES: readonly { from: number; band: Band }[] = [
  { from: 0, band: 'dead' }, { from: BAND_FAILING_MIN, band: 'failing' }, { from: BAND_DEGRADED_MIN, band: 'degraded' }, { from: BAND_OK_MIN, band: 'ok' },
];

// The bar's zones for a file of `version`, merged where neighbours keep the same version (a v2 reads `v2 | v1 | off`, a v1
// `v1 | off`, a v3 `v3 | v2 | v1 | off`).
export function skillTickZones(version: SkillVersion): SkillTickZone[] {
  const zones: SkillTickZone[] = [];
  BAND_EDGES.forEach((edge, i) => {
    const to = BAND_EDGES[i + 1]?.from ?? INTEGRITY_MAX;
    const works = effectiveVersion(version, edge.band);
    const last = zones.at(-1);
    if (last !== undefined && last.works === works) last.to = to;
    else zones.push({ from: edge.from, to, works, label: SKILLS_TEXT.skill.tick(works) });
  });
  return zones;
}

// What healing a file to `to`% costs in REPAIR CHARGE (state/actions.ts repairChargeEstimate's rule, to a band's edge).
function chargeTo(integrity: number, size: number, to: number): number {
  return Math.max(0, Math.ceil((to - integrity) * size * REPAIR_CHARGE_PER_POINT_PER_BLOCK - FLOAT_SLACK));
}

export function skillFileView(seg: Readonly<SkillFileSegment>): SkillFileView {
  const offline = offlineReason(seg);
  const works = offline !== null ? 0 : effectiveVersion(seg.version, integrityBand(seg.integrity));
  const damaged = offline === null && works < seg.version;
  const text = SKILLS_TEXT.skill;
  const zones = skillTickZones(seg.version);
  const worksText = offline !== null ? text.offline[offline] : works === 0 ? text.off : text.works(works);
  const repair = seg.integrity < BAND_OK_MIN ? text.repairFor(BAND_OK_MIN, seg.version, chargeTo(seg.integrity, seg.size, BAND_OK_MIN)) : null;
  return {
    nominal: seg.version, works, offline, damaged,
    badge: offline !== null ? text.version(seg.version) : text.badge(seg.version, works),
    zones, ticks: text.ticksRow([...zones].reverse().map((zone) => zone.label)),
    worksText, repair,
    inspect: text.inspect([text.version(seg.version), `${shownIntegrity(seg.integrity)}%`, worksText, ...(repair === null ? [] : [repair])]),
  };
}

// The pips of the versions a level owns: ▮ per version held, ▯ for the rest of the three.
function versionPips(version: number): string {
  return SKILLS_TEXT.skill.pipOwned.repeat(version) + SKILLS_TEXT.skill.pipEmpty.repeat(3 - version);
}

// A skill's version line: the counting file (skillLive's) and its lock, what it works as, and what the run paid for and
// lost (RESTORE at the next desk, half price; none past the final ship's).
// `status`: what the row already says (AUTOBURN's status names WORKS AS v1 itself: Track FLIGHT's autoburnStatus), not repeated.
function skillVersionLine(state: Readonly<GameState>, id: SkillId, status: string): SkillRowVersion {
  const live = skillLive(state.memory, id);
  const paidLevel = paid(state.run.skills, id);
  const text = SKILLS_TEXT.skill;
  const lost = lostLevels(id, fileLevel(state.memory, id), paidLevel);
  const lostLine = (): string | null => {
    if (lost.length === 0 || paidLevel === null) return null;
    const cost = restorePrice(lost);
    return currentShip(state).final ? text.restoreNever(paidLevel.version) : text.restoreAt(paidLevel.version, cost);
  };
  if (live.file === null) {
    return { pips: versionPips(0), text: lostLine() ?? text.lost(paidLevel?.version ?? 1), tone: 'warn' };
  }
  const view = skillFileView(live.file);
  const parts = [text.version(view.nominal)];
  if (live.file.lock > 0) parts.push(text.lock(LOCK_RANGE_TAC[live.file.lock]));
  if ((view.offline !== null || view.damaged || view.works === 0) && !status.includes(view.worksText)) parts.push(view.worksText);
  if (view.repair !== null && (view.damaged || view.works === 0)) parts.push(view.repair);
  const lostPart = lostLine();
  if (lostPart !== null) parts.push(lostPart);
  const warn = view.offline !== null || view.damaged || view.works === 0 || lostPart !== null;
  return { pips: versionPips(view.nominal), text: parts.join(' · '), tone: warn ? 'warn' : 'good' };
}

// A skill's row: shown once the run bought it (or the unit carries its file). AUTOBURN's numbers are read live from the
// kid's captures (skill-tree.ts autoburnDemoSkill), like the boot line that trained it; what it is doing now is Track
// FLIGHT's (autoburn.ts autoburnStatus). The skills later sub-slices build say only that they are ready.
function skillRow(state: Readonly<GameState>, id: SkillId): SkillRow | null {
  const files = skillFilesOf(state.memory, id);
  if (files.length === 0 && paid(state.run.skills, id) === null) return null;
  const title = id === 'autoburn' ? AUTOBURN_SKILL_ROW.title : SKILL_TREE[id].fileName;
  const pips: SkillPip[] = files.map((seg) => healthPip(seg, title.toUpperCase(), `${shownIntegrity(seg.integrity)}%`));
  const live = skillLive(state.memory, id);
  const status = id === 'autoburn' ? autoburnStatus(state)
    : live.file === null ? { text: SKILLS_TEXT.status.gone, tone: 'warn' as const }
      : { text: live.version === 0 ? SKILLS_TEXT.skill.off : SKILLS_TEXT.skill.ready(live.version), tone: live.version === 0 ? 'warn' as const : 'good' as const };
  return {
    id, title, count: '', effect: id === 'autoburn' ? AUTOBURN_SKILL_ROW.effect : TRAINING_TEXT.skills[id].pitch,
    status: status.text, tone: status.tone, pips: pips.length > 0 ? pips : gonePips(1, title), version: skillVersionLine(state, id, status.text),
  };
}

// The stamp a skill's effective version moving earns (03 §3.5; plan §2.7: TREE's mountSkillWatch emits 'skill-version'),
// or null: a fall to OFF because the counting copy went offline (the kid's own repair or move) is said by the chip, not
// stamped. Back to its full version: `AUTOBURN v2 RESTORED`; any other step: `AUTOBURN v2 → v1` (danger down, plain up).
export interface SkillStamp {
  text: string;
  tone: 'good' | 'danger' | 'plain';
  sound: 'down' | 'restored' | null;   // audio-cues: the lost version's falling sweep, the repair-won sparkle
}

export function skillVersionStamp(state: Readonly<GameState>, skill: SkillId, from: EffectiveVersion, to: EffectiveVersion): SkillStamp | null {
  const name = TRAINING_TEXT.skills[skill].name;
  const live = skillLive(state.memory, skill);
  if (to < from) {
    if (to === 0 && live.offline !== null) return null;
    return { text: SKILLS_TEXT.skill.stampDown(name, from, to), tone: 'danger', sound: 'down' };
  }
  if (to > from) {
    const full = live.nominal?.version ?? to;
    if (to >= full) return { text: SKILLS_TEXT.skill.stampRestored(name, to), tone: 'good', sound: 'restored' };
    return { text: SKILLS_TEXT.skill.stampDown(name, from, to), tone: 'plain', sound: null };
  }
  return null;
}

export function skillsModel(state: Readonly<GameState>): SkillRow[] {
  const rows: SkillRow[] = [];
  for (const id of SKILL_IDS) {
    const row = skillRow(state, id);
    if (row) rows.push(row);
  }
  for (const [id, count] of cardCounts(state)) {
    const def = getUpgrade(id);
    let body: Pick<SkillRow, 'status' | 'tone' | 'pips'>;
    switch (id) {
      case 'firewall': body = firewallRow(state, count); break;
      case 'fuel-trim': body = fuelTrimRow(state, count); break;
      case 'repair-v2': body = repairV2Row(state); break;
      case 'thread-plus': body = threadRow(state); break;
      case 'charge': body = { status: SKILLS_TEXT.status.charge(count * CHARGE_CARD_BLOCKS), tone: 'dim', pips: [] }; break;
      // Slice 4 (Track TREE): +2 CYCLES is spent at the desk, never carried (run.upgrades never lists it).
      case 'cycles': continue;
    }
    rows.push({ id, title: def.title, count: count > 1 ? SKILLS_TEXT.count(count) : '', effect: def.effect, ...body, version: null });
  }
  return rows;
}
