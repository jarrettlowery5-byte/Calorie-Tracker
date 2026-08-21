/**
 * Rasterise scripts/icon.svg into the PNG sizes iOS and Android need.
 *
 * This is an occasional maintenance script, not part of `npm run build` -- the
 * generated PNGs are committed. Playwright is therefore not a project
 * dependency; run this with Playwright available on NODE_PATH, or install it
 * temporarily:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/make-icons.mjs
 *
 * Set CHROMIUM_PATH if you want a specific browser binary.
 */
const { chromium } = await import('playwright');
import { readFileSync, writeFileSync } from 'node:fs';

const EXEC = process.env.CHROMIUM_PATH || undefined;
const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');

// `padded` insets the artwork so Android's maskable crop cannot clip it.
const TARGETS = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/icon-maskable-512.png', size: 512, padded: true },
  { file: 'public/apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
for (const { file, size, padded } of TARGETS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inset = padded ? size * 0.1 : 0;
  await page.setContent(
    `<body style="margin:0;background:#16405f">
       <div style="position:absolute;inset:${inset}px">${svg.replace(/width="512" height="512"/, 'width="100%" height="100%"')}</div>
     </body>`,
  );
  writeFileSync(file, await page.screenshot({ omitBackground: false }));
  await page.close();
  console.log(`wrote ${file} (${size}x${size}${padded ? ', maskable safe zone' : ''})`);
}
await browser.close();
