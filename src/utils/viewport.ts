// The phone layout's breakpoint (§9 WP12 item 3): at or below MOBILE_MAX_PX the desk turns into tabs, the strip into
// rows of 32 blocks, and the amber screen gets its touch flight bar. CSS cannot import this number, so every width
// media query in src/styles must use it too (`max-width: 768px` / `min-width: 769px`); tests/unit/wp12/p2/breakpoints.test.ts
// checks that, so the two never drift apart.
export const MOBILE_MAX_PX = 768;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_PX}px)`;

// The same test the stylesheets apply (a media query, not innerWidth), so JS and CSS agree at every width.
export function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

// Row width tracks the layout. 32 (0x20) on a phone keeps rows on hex address boundaries, and two of them make a
// 64-block rack; the desktop's 64 (0x40) is one rack per row.
const PHONE_BLOCKS_PER_ROW = 32;
const DESKTOP_BLOCKS_PER_ROW = 64;

export function getMemoryBlocksPerRow(): number {
  return isMobileViewport() ? PHONE_BLOCKS_PER_ROW : DESKTOP_BLOCKS_PER_ROW;
}
