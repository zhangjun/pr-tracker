// Verify the editorial digest: 本周重点 / 功能模块与开发趋势 / 重点 PR,
// and that a filter falls back to the deterministic builder.
const { chromium } = require("playwright");
const fs = require("fs");

const snap = async (page) => ({
  focus: await page.locator(".digest-focus li").allTextContents(),
  modules: await page.locator(".digest-mod").evaluateAll(els => els.map(e => ({
    name: e.querySelector(".mod-name")?.textContent,
    trend: e.querySelector(".mod-trend")?.textContent,
    count: e.querySelector(".mod-count")?.textContent,
    repos: e.querySelector(".mod-repos")?.textContent,
  }))),
  keyPrs: await page.locator(".digest-top-card").evaluateAll(els => els.map(e => ({
    repo: e.querySelector(".dt-repo")?.textContent,
    why: e.querySelector(".dt-why")?.textContent || null,
    summary: e.querySelector(".dt-summary")?.textContent?.slice(0, 60) || null,
  }))),
  sectionTitles: await page.locator(".digest-section-title").allTextContents(),
  sourceNote: (await page.locator(".digest-section-note").allTextContents()).join(" | "),
});

(async () => {
  const out = { steps: [], errors: [] };
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (m) => { if (m.type() === "error") out.errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => out.errors.push("pageerror: " + String(e).slice(0, 200)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".digest", { timeout: 30000 });

  await page.locator('.nav-link:has-text("Weekly")').click();
  await page.waitForTimeout(1500);
  out.steps.push({ step: "weekly-unfiltered", ...(await snap(page)) });
  await page.screenshot({ path: "eval-shots/digest-03-editorial.png", fullPage: false });

  // scroll to modules + key PRs
  await page.locator(".digest-mods").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "eval-shots/digest-04-modules.png", fullPage: false });

  // filter → deterministic fallback
  await page.locator('.repo-mini:has-text("sglang")').first().click();
  await page.waitForTimeout(1200);
  out.steps.push({ step: "weekly-repo-sglang", ...(await snap(page)) });

  fs.writeFileSync("eval-digest.json", JSON.stringify(out, null, 2));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  fs.writeFileSync("eval-digest.json", JSON.stringify({ fatal: String(e) }, null, 2));
  console.log("FATAL", String(e).slice(0, 500));
  process.exit(1);
});
