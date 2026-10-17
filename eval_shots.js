const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.card');
  await page.waitForTimeout(1200);

  await page.locator('.nav-link:has-text("Weekly")').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/15-weekly-viewport.png` });

  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/16-weekly-bucket.png` });

  await page.locator('.nav-link:has-text("Overview")').first().click();
  await page.waitForTimeout(500);
  await page.locator('.icon-btn[title="toggle theme"]').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/17-dark-overview.png` });
  await page.locator('.nav-link:has-text("Weekly")').first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/18-dark-weekly.png` });

  await page.locator('.icon-btn[title="toggle theme"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('.nav-link:has-text("Overview")').first().click();
  await page.waitForTimeout(500);
  await page.locator('button.pill:has-text("Table")').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/19-table.png` });

  await page.locator('button.pill:has-text("Cards")').first().click();
  await page.fill('input[placeholder*="search"]', 'quantization');
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/20-search-cards.png` });

  await page.fill('input[placeholder*="search"]', '');
  await page.locator('.nav-link:has-text("Monthly")').first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/21-monthly.png` });
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/22-monthly-scroll.png` });

  await browser.close();
})().catch(e => console.error('FATAL', e.message));
