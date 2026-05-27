const MOBILE_MAX = 768;
const NARROW_MAX = 400;

export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
}

// Row width tracks viewport: 20 blocks fits comfortably on a 390px phone
// (each block ~17px) while desktop keeps the original 64 for density.
export function getMemoryBlocksPerRow(): number {
  const w = window.innerWidth;
  if (w <= NARROW_MAX) return 20;
  if (w <= MOBILE_MAX) return 20;
  return 64;
}

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX}px)`;
