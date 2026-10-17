// Renders the deployed site and reports what the weekly digest actually paints.
// Verifies the three editorial blocks survived the payload slimming and that
// the discussion badge shows the true count rather than the truncated length.
const { chromium } = require("playwright");

const URL = process.argv[2];
if (!URL) {
  console.error("usage: node check_live.js <url>");
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });

  // wait for the client-side fetch of data.json to finish and cards to appear
  await page.waitForSelector(".digest-focus li, .digest-mod, .card", { timeout: 180000 });
  const loadMs = Date.now() - t0;

  // Overview renders the compact digest; the full three-block panel lives in
  // the Weekly view, so switch there and let it paint.
  const view = process.argv[3] || "overview";
  if (view !== "overview") {
    await page.click(`.nav-link:has-text("${view}")`);
    await page.waitForSelector(".digest-mods .digest-mod", { timeout: 30000 });
    await page.waitForTimeout(400);
  }

  const report = await page.evaluate(() => {
    const txt = (s) => (s ? s.textContent.trim() : null);
    const all = (s) => Array.from(document.querySelectorAll(s)).map((e) => e.textContent.trim());
    return {
      title: document.title,
      focus: all(".digest-focus li"),
      modules: Array.from(document.querySelectorAll(".digest-mod")).map((e) => ({
        name: txt(e.querySelector(".mod-name")) || txt(e.querySelector("strong")),
        trend: txt(e.querySelector(".mod-trend")),
        note: txt(e.querySelector(".mod-note")) || txt(e.querySelector("p")),
      })),
      keyPrs: Array.from(document.querySelectorAll(".digest-top-card")).map((e) => ({
        title: txt(e.querySelector(".dt-title")) || txt(e.querySelector("a")),
        why: txt(e.querySelector(".dt-why")),
      })),
      sectionTitles: all(".digest-block-title, .digest-h"),
      cardCount: document.querySelectorAll(".card").length,
      discussBadges: Array.from(document.querySelectorAll(".discuss-badge")).slice(0, 6).map((e) => e.textContent.trim()),
      badges: all(".digest-live, .digest-scope"),
    };
  });

  console.log(JSON.stringify({ loadMs, errors, ...report }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
