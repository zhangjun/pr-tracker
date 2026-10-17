// Verify the LLM "AI" badge renders and that summaries come from the model.
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const out = { steps: [], errors: [] };
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") out.errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => out.errors.push("pageerror: " + String(e).slice(0, 200)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".card", { timeout: 30000 });

  // count badges in the default (Overview) view
  const overview = await page.evaluate(() => ({
    cards: document.querySelectorAll(".card").length,
    aiBadges: document.querySelectorAll(".ai-badge").length,
    discussBadges: document.querySelectorAll(".discuss-badge").length,
    firstAiCard: (() => {
      const b = document.querySelector(".ai-badge");
      if (!b) return null;
      const card = b.closest(".card");
      return {
        title: card?.querySelector(".card-title")?.textContent?.slice(0, 90) || null,
        summary: card?.querySelector(".card-summary")?.textContent?.slice(0, 160) || null,
      };
    })(),
  }));
  out.steps.push({ step: "overview", ...overview });

  // switch to table view and check tbl-summary badges
  const tableBtn = page.locator('button:has-text("Table"), .pill:has-text("Table")').first();
  if (await tableBtn.count()) {
    await tableBtn.click();
    await page.waitForTimeout(1200);
    out.steps.push({
      step: "table",
      rows: await page.locator(".tbl-summary").count(),
      aiBadges: await page.locator(".ai-badge").count(),
    });
  }

  // back to cards, screenshot
  const cardsBtn = page.locator('button:has-text("Cards"), .pill:has-text("Cards")').first();
  if (await cardsBtn.count()) { await cardsBtn.click(); await page.waitForTimeout(1000); }

  await page.screenshot({ path: "eval-shots/llm-01-overview.png", fullPage: false });

  // scroll the first AI-badged card into view for a readable close-up
  const badge = page.locator(".ai-badge").first();
  if (await badge.count()) {
    await badge.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: "eval-shots/llm-02-badge-closeup.png", fullPage: false });
    out.steps.push({ step: "badge-title", title: await badge.getAttribute("title") });
  }

  fs.writeFileSync("eval-llm-badge.json", JSON.stringify(out, null, 2));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  fs.writeFileSync("eval-llm-badge.json", JSON.stringify({ fatal: String(e) }, null, 2));
  console.log("FATAL", String(e).slice(0, 400));
  process.exit(1);
});
