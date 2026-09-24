// Smoke test: node e2e/run.mjs (needs `npm run build && npx vite preview --port 4173` running)
import { chromium } from 'playwright';
import fs from 'node:fs';
const S = process.env.SHOTS || 'e2e/shots';
fs.mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const shot = (n, o = {}) => page.screenshot({ path: `${S}/${n}.png`, ...o });

// bundled pack + art: no imports needed
await page.goto('http://localhost:4173/');
await page.waitForTimeout(1500);
await shot('s1-home');
await page.getByRole('link', { name: /Burrows/ }).first().click();
await page.waitForURL(/#\/game\//, { timeout: 20000 });
await page.waitForTimeout(800);
await shot('s2-game');
await page.getByRole('button', { name: /Freebeasts/ }).click();
await page.fill('#rn', 'The Thornwood Irregulars');
await page.getByRole('button', { name: 'Create band' }).click();
await page.waitForURL(/#\/roster\//);
await page.waitForTimeout(600);
await shot('s3-empty');

// add units
await page.getByRole('button', { name: 'Add unit' }).first().click();
await page.waitForTimeout(400);
for (const n of ['Add Hedgehog', 'Add Fox', 'Add Badger', 'Add Mole']) { await page.getByLabel(n, { exact: true }).click(); await page.waitForTimeout(150); }
await shot('s4-add');
await page.keyboard.press('Escape');
// den upgrade
await page.getByRole('button', { name: 'Add upgrade' }).first().click();
await page.waitForTimeout(300); await shot('s4b-upgrades'); await page.getByLabel('Add Library', { exact: true }).click({ timeout: 2000 }).catch(() => {});
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await shot('s5-roster', { fullPage: true });

// view a member, then edit
await page.locator('article', { hasText: 'Hedgehog' }).first().locator('h3').click();
await page.waitForTimeout(400);
await shot('s6-view');
await page.getByRole('button', { name: /^Edit$/ }).first().click();
await page.getByRole('button', { name: 'Magic User' }).click();
await page.getByRole('button', { name: 'Magical Archetypes' }).click().catch(() => {});
await page.waitForTimeout(300);
await shot('s7-edit');
await page.getByRole('button', { name: /Done/ }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Validation' }).click();
await page.waitForTimeout(300);
await shot('s8-errors');
await page.keyboard.press('Escape');
await page.goto(page.url() + '/cards'); await page.waitForTimeout(800);
await shot('s9-cards', { fullPage: true });
await page.goBack(); await page.waitForTimeout(600);

// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await shot('m1-roster');
await shot('m1b-roster-full', { fullPage: true });
await page.getByRole('button', { name: 'Add unit' }).last().click();
await page.waitForTimeout(300);
await shot('m2-add');
await page.keyboard.press('Escape');
await page.locator('article', { hasText: 'Fox' }).first().locator('h3').click(); await page.waitForTimeout(300);
await shot('m3-member');
await page.keyboard.press('Escape');
// offline reload
await ctx.setOffline(true);
await page.reload(); await page.waitForTimeout(1500);
await shot('m4-offline');
await page.evaluate(() => document.documentElement.classList.add('dark'));
await shot('m5-dark');
console.log('errors', errs.slice(0, 10));
await browser.close();
