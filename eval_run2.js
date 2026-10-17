const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
const step = async (name, fn) => { try { return await fn(); } catch (e) { errors.push(name + ': ' + e.message.split('\n')[0]); return null; } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const report = {};

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a.card', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const resultCount = () => page.locator('.result-count').first().textContent().catch(() => null);

  // Window filter via result-count text
  await step('win-30d', async () => { await page.locator('button.pill:has-text("30d")').first().click(); await page.waitForTimeout(800); report.win30 = await resultCount(); });
  await step('win-7d', async () => { await page.locator('button.pill:has-text("7d")').first().click(); await page.waitForTimeout(800); report.win7 = await resultCount(); });
  await step('win-90d', async () => { await page.locator('button.pill:has-text("90d")').first().click(); await page.waitForTimeout(800); report.win90 = await resultCount(); });
  await step('win-all', async () => { await page.locator('button.pill:has-text("All")').first().click(); await page.waitForTimeout(800); report.winAll = await resultCount(); });
  await step('win-back-30', async () => { await page.locator('button.pill:has-text("30d")').first().click(); await page.waitForTimeout(600); });

  // Focus filter (sidebar, Chinese labels)
  await step('focus-inference', async () => {
    await page.locator('.nav-link:has-text("推理优化")').first().click();
    await page.waitForTimeout(900);
    report.focusInference = await resultCount();
    await page.screenshot({ path: `${SHOTS}/12-focus-inference.png` });
  });
  await step('focus-training', async () => {
    await page.locator('.nav-link:has-text("训练优化")').first().click();
    await page.waitForTimeout(900);
    report.focusTraining = await resultCount();
  });
  await step('focus-all', async () => {
    await page.locator('.nav-link:has-text("All areas")').first().click();
    await page.waitForTimeout(700);
    report.focusAll = await resultCount();
  });

  // Repo filter (sidebar)
  await step('repo-vllm', async () => {
    await page.locator('.repo-mini:has-text("vllm")').first().click();
    await page.waitForTimeout(900);
    report.repoVllm = await resultCount();
    await page.screenshot({ path: `${SHOTS}/13-repo-vllm.png` });
    await page.locator('.repo-mini:has-text("all repos")').first().click();
    await page.waitForTimeout(500);
  });

  // Category chip + State chip
  await step('cat-perf', async () => {
    await page.locator('.chip:has-text("perf")').first().click();
    await page.waitForTimeout(900);
    report.catPerf = await resultCount();
    await page.screenshot({ path: `${SHOTS}/14-cat-perf.png` });
    await page.locator('.chip:has-text("perf")').first().click(); // toggle off
    await page.waitForTimeout(400);
  });
  await step('state-merged', async () => {
    await page.locator('.chip:has-text("Merged")').first().click();
    await page.waitForTimeout(900);
    report.stateMerged = await resultCount();
    await page.locator('.chip:has-text("Merged")').first().click();
    await page.waitForTimeout(400);
  });

  // Cap message check (overview, all, no filters) -> should show "showing 500 of N"
  await step('cap-msg', async () => {
    await page.locator('.nav-link:has-text("Overview")').first().click();
    await page.locator('button.pill:has-text("All")').first().click();
    await page.waitForTimeout(900);
    report.capMsg = await resultCount();
  });

  report.consoleErrors = errors;
  fs.writeFileSync('/Users/ewalker/WorkBuddy AI/pr-tracker/eval-report2.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
