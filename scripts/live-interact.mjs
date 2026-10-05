#!/usr/bin/env node
/**
 * scripts/live-interact.mjs
 * Live Interaction & Visual Inspection bridge for Antigravity & Foqz.
 *
 * Can connect to:
 * 1. Live Electron running with --remote-debugging-port=9222
 * 2. Or fallback to Vite dev server at http://127.0.0.1:5173
 *
 * Usage:
 *   node scripts/live-interact.mjs screenshot [filename]
 *   node scripts/live-interact.mjs click <selector>
 *   node scripts/live-interact.mjs type <selector> <text>
 *   node scripts/live-interact.mjs hover <selector>
 *   node scripts/live-interact.mjs drag <fromX> <fromY> <toX> <toY>
 *   node scripts/live-interact.mjs eval <code>
 *   node scripts/live-interact.mjs inspect
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../.screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function getPage() {
  const cdpUrl = process.env.CDP_URL || 'http://127.0.0.1:9222';
  try {
    const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 3000 });
    const contexts = browser.contexts();
    const context = contexts[0] || (await browser.newContext());
    const pages = context.pages();
    const page = pages.find((p) => !p.url().startsWith('devtools://')) || pages[0];
    if (page) {
      return { browser, page, isCDP: true };
    }
  } catch (err) {
    // CDP not available; fallback to headless browser against Vite
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const targetUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  return { browser, page, isCDP: false };
}

async function main() {
  const command = process.argv[2] || 'inspect';

  const { browser, page, isCDP } = await getPage();

  try {
    switch (command) {
      case 'screenshot': {
        const name = process.argv[3] || `snapshot-${Date.now()}`;
        const cleanName = name.replace(/\.png$/, '') + '.png';
        const outPath = path.join(SCREENSHOT_DIR, cleanName);
        await page.screenshot({ path: outPath, fullPage: true });
        console.log(JSON.stringify({
          status: 'ok',
          action: 'screenshot',
          path: outPath,
          url: page.url(),
          isCDP,
        }));
        break;
      }

      case 'click': {
        const selector = process.argv[3];
        if (!selector) throw new Error('Missing selector: node live-interact.mjs click <selector>');
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        // auto-capture state after click
        const outPath = path.join(SCREENSHOT_DIR, `after-click-${Date.now()}.png`);
        await page.screenshot({ path: outPath });
        console.log(JSON.stringify({ status: 'ok', action: 'click', selector, screenshot: outPath }));
        break;
      }

      case 'type': {
        const selector = process.argv[3];
        const text = process.argv[4];
        if (!selector || text === undefined) {
          throw new Error('Usage: node live-interact.mjs type <selector> <text>');
        }
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.fill(selector, text);
        const outPath = path.join(SCREENSHOT_DIR, `after-type-${Date.now()}.png`);
        await page.screenshot({ path: outPath });
        console.log(JSON.stringify({ status: 'ok', action: 'type', selector, text, screenshot: outPath }));
        break;
      }

      case 'hover': {
        const selector = process.argv[3];
        if (!selector) throw new Error('Missing selector');
        await page.hover(selector);
        const outPath = path.join(SCREENSHOT_DIR, `after-hover-${Date.now()}.png`);
        await page.screenshot({ path: outPath });
        console.log(JSON.stringify({ status: 'ok', action: 'hover', selector, screenshot: outPath }));
        break;
      }

      case 'drag': {
        const fromX = Number(process.argv[3]);
        const fromY = Number(process.argv[4]);
        const toX = Number(process.argv[5]);
        const toY = Number(process.argv[6]);
        if ([fromX, fromY, toX, toY].some(isNaN)) {
          throw new Error('Usage: node live-interact.mjs drag <fromX> <fromY> <toX> <toY>');
        }
        await page.mouse.move(fromX, fromY);
        await page.mouse.down();
        await page.mouse.move(toX, toY, { steps: 10 });
        await page.mouse.up();
        const outPath = path.join(SCREENSHOT_DIR, `after-drag-${Date.now()}.png`);
        await page.screenshot({ path: outPath });
        console.log(JSON.stringify({ status: 'ok', action: 'drag', from: { fromX, fromY }, to: { toX, toY }, screenshot: outPath }));
        break;
      }

      case 'eval': {
        const expr = process.argv.slice(3).join(' ');
        if (!expr) throw new Error('Missing code expression');
        const result = await page.evaluate((code) => {
          return window.eval(code);
        }, expr);
        console.log(JSON.stringify({ status: 'ok', action: 'eval', result }));
        break;
      }

      case 'inspect':
      default: {
        const title = await page.title();
        const url = page.url();
        const bodyText = (await page.innerText('body')).slice(0, 300);
        console.log(JSON.stringify({
          status: 'ok',
          action: 'inspect',
          title,
          url,
          mode: isCDP ? 'Electron (CDP)' : 'Headless Web',
          preview: bodyText.replace(/\n+/g, ' '),
        }));
        break;
      }
    }
  } finally {
    if (!isCDP) {
      await browser.close();
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
