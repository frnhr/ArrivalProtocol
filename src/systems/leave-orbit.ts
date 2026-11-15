// Playtest 1 (Fran's note 5; docs/phase3/impl/playtest-1-plan.md §3.3): LEAVE ORBIT's model, pure and DOM-free. B-ORDER owns
// this file. The screen (components/run/LeaveOrbitScreen.ts) sits between a ship's end and the STAR CHART: the salvage dealt
// as the ship ended (run.leave.offer, systems/run.ts openLeaveOrbit), one card taken (draft.ts pickCard, [1]–[3] or a
// click), ENTER takes it and opens the chart (run.ts leaveOrbit). It reads:
// • the title: LEAVE ORBIT after a landing; LEAVING <SHIP> after a lost ship, where there was no orbit to leave
//   (OPEN-DECISIONS 129);
// • the why line of a lost ship's way out (an EMERGENCY's toll, BEAM OUT's extra hits; transmit.ts whyLine, the PACKET's
//   own), so the toll is said before the chart, where the hop is chosen;
// • the cards, each with its tag, key and whether it is the one taken; a departed resident's leftovers wear their look
//   (systems/resident-hud.ts leftoverDeckView, the screen's).
import type { GameState } from '@state/schema';
import type { DraftCard, DraftCardId } from '@data/upgrades';
import { getUpgrade } from '@data/upgrades';
import { getAiCore } from '@state/selectors';
import { crashCoreToll } from '@systems/carry';
import { leftWithoutOrbit } from '@systems/landing-rules';
import { whyLine } from '@systems/transmit';
import { DRAFT_TEXT } from '@data/script';
import { RESIDENT_UI_TEXT } from '@data/resident-ui-text';
import { LEAVE_TEXT } from '@data/leave-text';

// A salvage card as LEAVE ORBIT shows it (WP8 part 2's card): what it is, what it does, why it was offered, the key that
// picks it, and whether it is the one taken.
export interface SalvageCardView extends DraftCard {
  tag: string;        // FILE · 2 BLOCKS / UPGRADE / AI CORE / ON ARRIVAL
  key: string;        // '1', '2', '3'
  picked: boolean;
}

export interface LeaveModel {
  title: string;               // LEAVE ORBIT / LEAVING HALCYON
  lost: boolean;               // the ship was lost (no orbit to leave)
  sub: string;                 // HALCYON · WHAT IS LEFT ON BOARD
  why: string | null;          // how the ship was left (an emergency, BEAM OUT, a lost ship); null after a landing
  emergency: boolean;          // the why line is a warning (a crash, the Core eaten)
  heading: string;             // SALVAGE · TAKE ONE WITH YOU
  keys: string;                // click one, or press [1] [2] [3]
  cards: SalvageCardView[];
  pick: DraftCardId | null;
  nothing: string | null;      // no card dealt (a hand-built state)
  waiting: boolean;            // ENTER waits for a pick
  go: string;                  // TAKE IT ▸ [ENTER] / TAKE ONE FIRST / TO THE STAR CHART ▸ [ENTER]
}

export function leaveModel(state: Readonly<GameState>): LeaveModel {
  if (state.run.phase !== 'leave') throw new Error(`leaveModel: not on LEAVE ORBIT (phase ${state.run.phase})`);
  const last = state.run.ships.at(-1);
  if (last === undefined) throw new Error('leaveModel: no ship has ended');
  const core = getAiCore(state);
  if (!core) throw new Error('leaveModel: the unit has no AI Core');
  const extra = state.run.map.pendingExtra;
  const lost = leftWithoutOrbit(last.outcome);
  const { offer, pick } = state.run.leave;
  const cards = offer.map((card, i): SalvageCardView => {
    // Slice 5 (review B1): a departed resident's skill card has no pool form (its skill is granted, it takes no room).
    const def = card.id === 'skill' ? null : getUpgrade(card.id);
    const tag = def === null ? RESIDENT_UI_TEXT.deck.skillTag : DRAFT_TEXT.form(def.form, def.blocks);
    return { ...card, tag, key: String(i + 1), picked: card.id === pick };
  });
  const waiting = offer.length > 0 && pick === null;
  return {
    title: lost ? LEAVE_TEXT.titleLost(last.shipName) : LEAVE_TEXT.title,
    lost,
    sub: LEAVE_TEXT.sub(last.shipName),
    why: whyLine(last.outcome, last.shipName, crashCoreToll(core.integrity, extra?.coreHit ?? 0)),
    emergency: last.outcome === 'crashed' || last.outcome === 'emergency',
    heading: LEAVE_TEXT.heading,
    keys: LEAVE_TEXT.keys(offer.length),
    cards,
    pick,
    nothing: offer.length === 0 ? LEAVE_TEXT.nothing : null,
    waiting,
    go: waiting ? LEAVE_TEXT.goWaiting : offer.length === 0 ? LEAVE_TEXT.goNothing : LEAVE_TEXT.go,
  };
}
