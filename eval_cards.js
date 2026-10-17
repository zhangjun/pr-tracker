const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.card');
  await page.waitForTimeout(1200);

  // Scroll to item cards
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/s02-item-cards.png` });

  // Click Top sort to see high-score cards with discussion
  await page.locator('button.pill:has-text("Top")').first().click();
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/s03-top-cards.png` });

  // Extract summary text from cards
  const cards = await page.$$eval('a.card', els => els.slice(0, 5).map(c => {
    const title = c.querySelector('.card-title')?.textContent?.trim() || '';
    // summary might be in different element
    const allText = c.innerText;
    const lines = allText.split('\n').filter(l => l.trim());
    return { title: title.slice(0, 60), lines: lines.slice(0, 6) };
  }));
  console.log(JSON.stringify(cards, null, 2));

  await browser.close();
})().catch(e => console.error('FATAL', e.message));
