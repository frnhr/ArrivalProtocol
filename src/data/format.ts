// Number formatting shared by the script and the systems that write lines without pulling in the director's script
// (systems/finale.ts is imported by data/script.ts: it cannot import the script back).

// 2400 → "2,400". Written out rather than toLocaleString so a line never depends on the
// browser's locale.
export function formatCount(count: number): string {
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
