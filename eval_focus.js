const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');
const SHOTS = '/Users/ewalker/WorkBuddy AI/pr-tracker/eval-shots';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const out = {};

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.card');
  await page.waitForTimeout(1500);
  const rc = () => page.locator('.result-count').first().textContent().catch(()=>null);

  out.overviewCount = await rc();

  // focus filters
  for (const [label, key] of [['推理优化','inference'],['训练优化','training'],['方向演进','direction']]) {
    await page.locator(`.nav-link:has-text("${label}")`).first().click();
    await page.waitForTimeout(800);
    out[key] = await rc();
  }
  await page.locator('.nav-link:has-text("All areas")').first().click();
  await page.waitForTimeout(600);

  // digest focus legend + narrative
  out.narrative = (await page.locator('.digest-narrative').first().textContent().catch(()=>''))?.slice(0,120);
  await page.screenshot({ path: `${SHOTS}/f01-focus-overview.png` });

  // weekly digest
  await page.locator('.nav-link:has-text("Weekly")').first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/f02-focus-weekly.png` });

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => console.error('FATAL', e.message));
