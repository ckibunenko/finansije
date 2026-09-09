// Rasterises public/icon.svg into the PNG sizes iOS and Android need.
// Run only when the icon changes: `node scripts/icons.mjs`. The PNGs are committed,
// so neither the build nor the deploy depends on a browser being installed.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const sizes = [180, 192, 512];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const shot = await page.screenshot({ omitBackground: true });
    const target = new URL(`../public/icon-${size}.png`, import.meta.url);
    writeFileSync(target, shot);
    console.log(`icon-${size}.png  ${shot.length} B`);
    await page.close();
  }
} finally { await browser.close(); }
