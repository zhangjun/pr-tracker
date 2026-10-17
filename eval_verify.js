const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
const errors = [];
const step = async (n, fn) => { try { return await fn(); } catch (e) { errors.push(n + ': ' + e.message.split('\n')[0]); } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const report = {};
  const rc = () => page.locator('.result-count').first().textContent().catch(() => null);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.card');
  await page.waitForTimeout(1200);

  // 1. Overview message
  await step('overview-msg', async () => {
    report.overviewMsg = await rc();
    const hasLoadMore = await page.locator('.load-more-wrap').count();
    report.overviewLoadMore = hasLoadMore;
    report.overviewCards = await page.locator('a.card').count();
    await page.screenshot({ path: `${SHOTS}/v01-overview.png` });
  });

  // 2. Load more → increase
  await step('load-more', async () => {
    await page.locator('.load-more-wrap button').first().click();
    await page.waitForTimeout(1000);
    report.afterLoadMore = await rc();
    report.afterCards = await page.locator('a.card').count();
    report.afterLoadMoreExists = await page.locator('.load-more-wrap').count();
    await page.screenshot({ path: `${SHOTS}/v02-after-loadmore.png` });
  });

  // 3. Monthly cap
  await step('monthly', async () => {
    await page.locator('.nav-link:has-text("Monthly")').first().click();
    await page.waitForTimeout(1000);
    report.monthlyMsg = await rc();
    report.monthlyLoadMore = await page.locator('.load-more-wrap').count();
    report.monthlyCards = await page.locator('a.card').count();
    await page.screenshot({ path: `${SHOTS}/v03-monthly.png` });
  });

  // 4. Search resets cap
  await step('search-resets', async () => {
    await page.fill('input[placeholder*="search"]', 'quantization');
    await page.waitForTimeout(1000);
    report.searchMsg = await rc();
    report.searchCards = await page.locator('a.card').count();
    report.searchLoadMore = await page.locator('.load-more-wrap').count();
    await page.screenshot({ path: `${SHOTS}/v04-search.png` });
    await page.fill('input[placeholder*="search"]', '');
    await page.waitForTimeout(500);
  });

  // 5. Standout label
  await step('standout-label', async () => {
    const text = await page.evaluate(() => document.querySelector('.stat-card:nth-child(4) .stat-label')?.textContent);
    const foot = await page.evaluate(() => document.querySelector('.stat-card:nth-child(4) .stat-foot')?.textContent);
    report.standoutLabel = text;
    report.standoutFoot = foot;
  });

  report.consoleErrors = errors;
  fs.writeFileSync('/Users/ewalker/WorkBuddy AI/pr-tracker/eval-verify.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); });
