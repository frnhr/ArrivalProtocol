/**
 * Capture desktop/mobile UI screenshots for PRs.
 * Requires dev server: npm run dev
 * Run: npm run screenshots
 * Output: SCREENSHOT_DIR or /opt/cursor/artifacts/screenshots
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.SCREENSHOT_BASE ?? 'http://127.0.0.1:5173/';
const outDir =
  process.env.SCREENSHOT_DIR ?? '/opt/cursor/artifacts/screenshots';

await mkdir(outDir, { recursive: true });

// The page opens on the title card: RECEIVE TRANSMISSION starts the run, and the card hides once the boot has played
// (components/title/TitleCard.ts). Without this every shot was of the title card.
async function startRun(page) {
  await page.locator('#titleReceive').click();
  await page.locator('#titleCard').waitFor({ state: 'hidden', timeout: 30_000 });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await desktop.goto(base, { waitUntil: 'networkidle' });
await startRun(desktop);
await desktop.screenshot({ path: `${outDir}/desktop-tools.png` });

await desktop.locator('.mode-toggle-opt[data-mode="memory"]').click({ force: true });
await desktop.waitForTimeout(400);
await desktop.screenshot({ path: `${outDir}/desktop-memory.png` });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(base, { waitUntil: 'networkidle' });
await startRun(mobile);
await mobile.screenshot({ path: `${outDir}/mobile-tools.png` });

await mobile.locator('.mode-toggle-opt[data-mode="memory"]').click({ force: true });
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: `${outDir}/mobile-memory.png` });

await browser.close();
console.log('Screenshots written to', outDir);
