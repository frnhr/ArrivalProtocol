// Shared readout formatting. One home for the km formatter so the briefing,
// NAV PLOT, and debrief can never disagree about the same altitude.
export function fmtKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
