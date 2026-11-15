// Playtest 1 (Fran's note 5, docs/phase3/impl/playtest-1-plan.md §3.3; OPEN-DECISIONS 129): the words of LEAVE ORBIT, the
// screen between a ship's end and the STAR CHART where the unit takes one piece of salvage with it (the old TRANSMIT's
// draft). B-ORDER owns this file. The cards' own words stay data/upgrades.ts's and script.ts DRAFT_TEXT's.

export const LEAVE_TEXT = {
  // After a landing the unit leaves an orbit; after a lost ship there was no orbit, so the screen names the ship.
  title: 'LEAVE ORBIT',
  titleLost: (ship: string): string => `LEAVING ${ship}`,
  // Under the title: where the salvage comes from.
  sub: (ship: string): string => `${ship} · WHAT IS LEFT ON BOARD`,
  heading: 'SALVAGE · TAKE ONE WITH YOU',
  // The keys, as many as there are cards.
  keys: (count: number): string => `click one, or press ${Array.from({ length: count }, (_, i) => `[${i + 1}]`).join(' ')}`,
  // Nothing dealt (a hand-built state; the pool never runs dry on the arm): the screen goes on to the chart.
  nothing: 'NOTHING ON BOARD WORTH TAKING',
  // The bar: ENTER takes the pick and opens the STAR CHART.
  go: 'TAKE IT ▸ [ENTER]',
  goNothing: 'TO THE STAR CHART ▸ [ENTER]',
  goWaiting: 'TAKE ONE FIRST',
  // The PACKET's line under its headline: what was taken at LEAVE ORBIT.
  packetSalvage: (title: string): string => `SALVAGE · ${title}`,
  // The header crumb and the strip while it is up.
  crumb: 'LEAVE ORBIT',
  strip: 'TAKE ONE WITH YOU — click one or press [1] [2] [3], then [ENTER]',
} as const;
