const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const errors = [];
const step = async (n, fn) => { try { return await fn(); } catch (e) { errors.push(n+': '+e.message.split('\n')[0]); } };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const report = {};
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.card');
  await page.waitForTimeout(1000);
  const rc = () => page.locator('.result-count').first().textContent().catch(()=>null);
  const timeAll = () => page.locator('.pills').nth(1).locator('button', { hasText: 'All' });
  const typeAll = () => page.locator('.pills').nth(0).locator('button', { hasText: 'All' });

  // chip toggle-off: set Merged, read, re-click, read
  await step('merged-on', async () => { await page.locator('.chip:has-text("Merged")').first().click(); await page.waitForTimeout(700); report.mergedOn = await rc(); });
  await step('merged-off', async () => { await page.locator('.chip:has-text("Merged")').first().click(); await page.waitForTimeout(700); report.mergedOff = await rc(); });
  // time All pill specifically (not type All)
  await step('time-all', async () => { await timeAll().click(); await page.waitForTimeout(700); report.timeAll = await rc(); });
  // verify type All still 1200 baseline under time All
  await step('type-all', async () => { await typeAll().click(); await page.waitForTimeout(500); report.typeAll = await rc(); });

  report.consoleErrors = errors;
  fs.writeFileSync('/Users/ewalker/WorkBuddy AI/pr-tracker/eval-report3.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); });
