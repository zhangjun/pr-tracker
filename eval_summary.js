const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.card');
  await page.waitForTimeout(1500);

  // Check summary quality on top-scored items
  const summaries = await page.$$eval('a.card', cards => cards.slice(0, 6).map(c => {
    const title = c.querySelector('.card-title')?.textContent?.slice(0, 50);
    const summary = c.querySelector('.card-summary, .card-desc')?.textContent?.slice(0, 120);
    return { title, summary };
  }));
  console.log(JSON.stringify({ summaries, errors }, null, 2));

  await page.screenshot({ path: `${SHOTS}/s01-body-summary.png` });
  await browser.close();
})().catch(e => console.error('FATAL', e.message));
