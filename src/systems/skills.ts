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
import { autoburnSkill, skillFiles, isEngaged } from '@systems/autoburn';
import { AUTOBURN_SKILL_ROW } from '@data/skill-text';
import { REPAIR_V2_VERSION, CHARGE_CARD_BLOCKS, CORE_LOW_INTEGRITY, FUEL_TRIM_DV_BONUS_FRAC, BAND_DEGRADED_MIN } from '@data/tuning';

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

// A row is a card (its id) or the trained skill.
export type SkillRowId = UpgradeId | 'autoburn';

export interface SkillRow {
  id: SkillRowId;
  title: string;          // the card's name (FIREWALL.sys)
  count: string;          // ×2 for a stack, '' for one
  effect: string;         // what it does, in one line
  status: string;         // what it is doing right now
  tone: SkillTone;
  pips: SkillPip[];
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

// AUTOBURN.skl's row: shown once the run trained the skill (or the unit carries the file). Its numbers are read
// live from the kid's captures (autoburnSkill), like the boot line that installed it.
function autoburnRow(state: Readonly<GameState>): SkillRow | null {
  const files = skillFiles(state.memory);
  if (files.length === 0 && state.run.skillTrainedOn === null) return null;
  const skill = autoburnSkill(state.run.stats);
  const label = AUTOBURN_SKILL_ROW.title.toUpperCase();
  const pips: SkillPip[] = files.map((seg) => healthPip(seg, label, `${shownIntegrity(seg.integrity)}%`));
  const row = (status: string, tone: SkillTone): SkillRow => ({
    id: 'autoburn', title: AUTOBURN_SKILL_ROW.title, count: '', effect: AUTOBURN_SKILL_ROW.effect, status, tone,
    pips: pips.length > 0 ? pips : gonePips(1, AUTOBURN_SKILL_ROW.title),
  });
  if (files.length === 0) return row(AUTOBURN_SKILL_ROW.gone, 'warn');
  if (liveUpgrades(state.memory, 'autoburn') === 0) return row(AUTOBURN_SKILL_ROW.damaged(BAND_DEGRADED_MIN), 'warn');
  const phase = state.burn.auto.phase;
  if (isEngaged(phase)) return row(phase === 'armed' ? AUTOBURN_SKILL_ROW.armed : AUTOBURN_SKILL_ROW.flying, 'good');
  if (skill === null) throw new Error('skillsModel: AUTOBURN.skl is in memory but the run has no trained skill');
  return row(AUTOBURN_SKILL_ROW.trained(skill.accuracy, skill.demos), 'good');
}

export function skillsModel(state: Readonly<GameState>): SkillRow[] {
  const rows: SkillRow[] = [];
  const skillRow = autoburnRow(state);
  if (skillRow) rows.push(skillRow);
  for (const [id, count] of cardCounts(state)) {
    const def = getUpgrade(id);
    let body: Pick<SkillRow, 'status' | 'tone' | 'pips'>;
    switch (id) {
      case 'firewall': body = firewallRow(state, count); break;
      case 'fuel-trim': body = fuelTrimRow(state, count); break;
      case 'repair-v2': body = repairV2Row(state); break;
      case 'thread-plus': body = threadRow(state); break;
      case 'charge': body = { status: SKILLS_TEXT.status.charge(count * CHARGE_CARD_BLOCKS), tone: 'dim', pips: [] }; break;
    }
    rows.push({ id, title: def.title, count: count > 1 ? SKILLS_TEXT.count(count) : '', effect: def.effect, ...body });
  }
  return rows;
}
