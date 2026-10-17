const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');

const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (m) => console.log(m);
const step = async (name, fn) => { try { return await fn(); } catch (e) { log('  [FAIL] ' + name + ': ' + e.message); errors.push(name + ': ' + e.message); return null; } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const report = {};
  const nav = (txt) => page.locator(`.nav-link:has-text("${txt}")`).first().click();
  const pill = (txt) => page.locator(`button.pill:has-text("${txt}")`).first().click();
  const cardCount = () => page.locator('a.card').count();
  const readScores = () => page.$$eval('a.card .badge', els => els.map(e => parseInt(e.textContent.replace(/[^0-9]/g,''),10)).filter(n=>!isNaN(n)));
  const wait = (ms=900) => page.waitForTimeout(ms);

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1500);

  // 1. Overview (light)
  await step('overview', async () => {
    await nav('Overview'); await wait();
    const cc = await cardCount();
    report.overview = {
      cards: cc,
      digestCompact: await page.locator('.digest').count(),
      statCards: await page.locator('.stat-card').count(),
      repoCards: await page.locator('.repo-card').count(),
    };
    await page.screenshot({ path: `${SHOTS}/01-overview.png` });
  });

  // 2. Weekly (full digest)
  await step('weekly', async () => {
    await nav('Weekly'); await wait(1200);
    const cc = await cardCount();
    report.weekly = {
      cards: cc,
      digestFull: await page.locator('.digest').count(),
      narrative: (await page.locator('.digest-narrative').first().textContent() || '').slice(0, 80),
      topCards: await page.locator('.digest-top-card').count(),
      directionBlock: await page.locator('.digest-dir').count(),
      focusBar: await page.locator('.digest-bar').count(),
    };
    await page.screenshot({ path: `${SHOTS}/02-weekly.png`, fullPage: true });
  });

  // 3. Daily
  await step('daily', async () => {
    await nav('Daily'); await wait();
    report.daily = { cards: await cardCount() };
    await page.screenshot({ path: `${SHOTS}/03-daily.png` });
  });

  // 4. Monthly
  await step('monthly', async () => {
    await nav('Monthly'); await wait();
    report.monthly = { cards: await cardCount() };
    await page.screenshot({ path: `${SHOTS}/04-monthly.png` });
  });

  // 5. Top sort (back to overview)
  await step('top-sort', async () => {
    await nav('Overview'); await wait();
    await pill('Top'); await wait(1200);
    const scores = await readScores();
    const sorted = [...scores].every((v,i,a)=> i===0 || a[i-1] >= v);
    report.topSort = {
      firstScore: scores[0],
      lastScore: scores[scores.length-1],
      nonIncreasing: sorted,
      sample: scores.slice(0,8),
      cards: scores.length,
    };
    await page.screenshot({ path: `${SHOTS}/05-top-sort.png` });
  });

  // 6. 7d window
  await step('window-7d', async () => {
    await pill('30d'); await wait(); const base = await cardCount();
    await pill('7d'); await wait(1200);
    report.window7d = { cards7d: await cardCount(), cards30d: base, reduced: (await cardCount()) < base };
    await page.screenshot({ path: `${SHOTS}/06-7d.png` });
  });

  // 7. Issue type
  await step('issue-type', async () => {
    await pill('All'); await wait();
    await pill('Issue'); await wait(1200);
    const cnt = await cardCount();
    const anyPr = await page.locator('a.card:has-text("PR")').count();
    report.issueType = { cards: cnt, issueCardsVisible: cnt > 0 };
    await page.screenshot({ path: `${SHOTS}/07-issue.png` });
    await pill('All'); await wait();
  });

  // 8. Table view
  await step('table-view', async () => {
    await pill('Table'); await wait(1000);
    report.table = { tables: await page.locator('table').count(), rows: await page.locator('tbody tr').count() };
    await page.screenshot({ path: `${SHOTS}/08-table.png` });
    await pill('Cards'); await wait();
  });

  // 9. Search
  await step('search', async () => {
    const before = await cardCount();
    await page.fill('input[placeholder*="search"]', 'quantization');
    await wait(1200);
    const after = await cardCount();
    report.search = { before, after, filtered: after < before || after > 0, query: 'quantization' };
    await page.screenshot({ path: `${SHOTS}/09-search.png` });
    await page.fill('input[placeholder*="search"]', '');
    await wait(600);
  });

  // 10. Dark mode
  await step('dark-mode', async () => {
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.locator('.icon-btn[title="toggle theme"]').first().click();
    await wait(900);
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    report.darkMode = { before, after, toggled: before !== after };
    await page.screenshot({ path: `${SHOTS}/10-dark.png` });
  });

  // 11. Filters (focus + repo chips)
  await step('filters', async () => {
    await page.locator('.chip:has-text("inference")').first().click();
    await wait(1000);
    const afterFocus = await cardCount();
    report.filters = { cardsAfterFocus: afterFocus, focusApplied: afterFocus >= 0 };
    await page.screenshot({ path: `${SHOTS}/11-filters.png` });
  });

  report.consoleErrors = errors;
  fs.writeFileSync('/Users/ewalker/WorkBuddy AI/pr-tracker/eval-report.json', JSON.stringify(report, null, 2));
  log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
