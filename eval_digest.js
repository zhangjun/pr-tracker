// Verify the reworked Weekly Digest: status chips, coverage note, repo breadth,
// and — most importantly — that the digest now follows the active filters.
const { chromium } = require("playwright");
const fs = require("fs");

const snap = async (page) => ({
  kicker: (await page.locator(".digest-kicker").first().innerText()).replace(/\s+/g, " ").trim(),
  range: (await page.locator(".digest-range").first().innerText()).replace(/\s+/g, " ").trim(),
  narrative: (await page.locator(".digest-narrative").first().innerText()).replace(/\s+/g, " ").trim(),
  legend: (await page.locator(".legend").first().innerText()).replace(/\s+/g, " ").trim(),
  live: await page.locator(".digest-live").count(),
  scope: await page.locator(".digest-scope").count(),
  warn: (await page.locator(".digest-warn").count())
    ? (await page.locator(".digest-warn").first().innerText()).replace(/\s+/g, " ").trim() : null,
  topRepos: await page.locator(".digest-top-card .dt-repo").allTextContents(),
  topScores: await page.locator(".digest-top-card .dt-score").allTextContents(),
  dirNote: (await page.locator(".digest-section-note").allTextContents()).join(" | "),
});

(async () => {
  const out = { steps: [], errors: [] };
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") out.errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => out.errors.push("pageerror: " + String(e).slice(0, 200)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".digest", { timeout: 30000 });

  await page.locator('.nav-link:has-text("Weekly")').click();
  await page.waitForTimeout(1500);
  out.steps.push({ step: "weekly-unfiltered", ...(await snap(page)) });
  await page.screenshot({ path: "eval-shots/digest-02-weekly-fixed.png", fullPage: false });

  // focus filter → digest must change
  await page.locator('.nav-link:has-text("推理优化")').click();
  await page.waitForTimeout(1200);
  out.steps.push({ step: "weekly-focus-inference", ...(await snap(page)) });

  // back to all, then repo filter
  await page.locator('.nav-link:has-text("All areas")').click();
  await page.waitForTimeout(800);
  const repoChip = page.locator('.repo-mini:has-text("sglang")').first();
  if (await repoChip.count()) {
    await repoChip.click();
    await page.waitForTimeout(1200);
    out.steps.push({ step: "weekly-repo-sglang", ...(await snap(page)) });
  } else {
    out.steps.push({ step: "weekly-repo-sglang", note: "repo selector not found" });
  }

  fs.writeFileSync("eval-digest.json", JSON.stringify(out, null, 2));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  fs.writeFileSync("eval-digest.json", JSON.stringify({ fatal: String(e) }, null, 2));
  console.log("FATAL", String(e).slice(0, 500));
  process.exit(1);
});
