const { chromium } = require('/Users/ewalker/.workbuddy-ai/binaries/node/workspace/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    // all elements that look like nav/clickable with text
    const clickable = Array.from(document.querySelectorAll('a, [role="button"], .nav-item, .sidebar a, div[onclick], li')).map(e => ({
      tag: e.tagName.toLowerCase(),
      text: (e.innerText || '').trim().slice(0, 30),
      cls: (e.className || '').toString().slice(0, 50),
    })).filter(x => x.text && /overview|daily|weekly|monthly|dark|theme|repo|focus|category|state|search|filter/i.test(x.text + ' ' + x.cls));
    // inputs
    const inputs = Array.from(document.querySelectorAll('input, select')).map(i => ({
      type: i.tagName.toLowerCase(),
      placeholder: i.placeholder || '',
      cls: (i.className||'').toString().slice(0,40),
    }));
    // sidebar structure: find the left nav
    const sidebar = document.querySelector('aside, nav, [class*="sidebar"], [class*="nav"]');
    return {
      clickableMatches: clickable,
      inputs,
      sidebarHTML: sidebar ? sidebar.outerHTML.slice(0, 1200) : 'NO SIDEBAR FOUND',
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
