const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: (b.innerText || '').trim().slice(0, 40),
      cls: (b.className || '').toString().slice(0, 60),
    }));
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map(h => (h.innerText||'').trim().slice(0,50));
    return {
      title: document.title,
      bodyTextLen: document.body.innerText.length,
      buttonCount: buttons.length,
      buttons: buttons.slice(0, 60),
      headings: headings.slice(0, 30),
      hasDigest: !!document.querySelector('.digest, [class*="digest"]'),
      cardCount: document.querySelectorAll('[class*="card"]').length,
    };
  });

  console.log(JSON.stringify({ info, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
