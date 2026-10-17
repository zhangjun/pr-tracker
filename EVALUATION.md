# AI Infra PR Tracker — Browser-Based Evaluation Report

**Date:** 2026-10-17  
**Method:** Real Chromium (Playwright, `--no-sandbox`) at 1440×900, driven by Node scripts.  
**App under test:** http://localhost:3000  (Next.js 16 + React 19 dev server).  
**Data:** 1,474 PRs/Issues across 7 AI-infra repos (vllm, sglang, verl, vime, slime, Megatron-LM, TensorRT-LLM).

Raw evidence: `eval-report.json`, `eval-report2.json`, `eval-report3.json`.  
Screenshots: `eval-shots/01-…22-*.png`.

---

## 1. Summary verdict

| Dimension | Rating | Note |
|---|---|---|
| Visual design (synflux aesthetic) | ★★★★★ | Light & dark both polished, teal accents, consistent typography |
| Core navigation (sidebar) | ★★★★★ | Overview / Daily / Weekly / Monthly all render |
| Topbar controls (type / window / view / sort) | ★★★★★ | All 11 pills behave correctly |
| **Weekly illustrated digest (Phase 2)** | ★★★★★ | Narrative + focus bar + top-6 cards + direction section — flagship feature |
| **PR scoring & Top sort (Phase 2)** | ★★★★★ | Scores 30–76, Top sort verified non-increasing (76→52) |
| **Topic tags & summaries (Phase 2)** | ★★★★★ | Search "quantization" returns 40 highly relevant, richly tagged items |
| Filter system (focus/repo/category/state) | ★★★★☆ | All filter correctly; minor UX inconsistency (state is single-select) |
| Search | ★★★★★ | Instant filter, clears cleanly |
| Dark mode | ★★★★★ | Proper dark surfaces, accents preserved, icon flips |
| Information density & dashboard polish | ★★★★★ | 5 stat cards, 7 repo cards with sparklines, sidebar counts |
| **Stability** | ★★★★★ | **Zero console errors / page errors across all 33 interactions** |

**Overall: a high-quality, production-grade dashboard.** The three Phase 2 capabilities render exactly as intended and integrate cleanly. The issues below are refinement opportunities, not blockers.

---

## 2. Verified functional results

| # | Interaction | Result | Evidence |
|---|---|---|---|
| 1 | Initial load | 200 OK, 500 cards (capped), digest compact present, 5 stat cards, 7 repo cards | eval1.overview |
| 2 | Weekly view (full digest) | digest panel renders, narrative "本周(Oct 12 – Oct 18)共 927 条动态…", 6 top cards, direction block + focus bar present | eval1.weekly + shot 15 |
| 3 | Daily / Monthly | Render, no console errors | eval1.daily/monthly + shot 21 |
| 4 | **Top sort** | First score **76**, last **52**, **non-increasing verified**, sample [76,76,76,68,68,66,64,64] | eval1.topSort |
| 5 | Window 7d / 30d / 90d / All | filtered count 959 / 1200 / 1401 / 1401 — **filter works** | eval2 |
| 6 | Type = Issue | 65 cards (matches digest week's 65 issues) | eval1.issueType |
| 7 | Table view | 1 table, 500 rows | eval1.table |
| 8 | **Search "quantization"** | 500 → **40 items**, all relevant (Mamba2/ComfyUI INT8/NVFP4) | eval1.search + shot 20 |
| 9 | Dark mode toggle | data-theme: light → dark | eval1.darkMode + shot 17 |
| 10 | Focus = 推理优化 (inference) | 687 items (subset of 1200) | eval2.focusInference + shot 12 |
| 11 | Focus = 训练优化 (training) | 411 items | eval2.focusTraining |
| 12 | Repo = vllm | 227 items | eval2.repoVllm + shot 13 |
| 13 | Category = perf | 128 items | eval2.catPerf + shot 14 |
| 14 | State = Merged | 247 items (single-select) | eval2.stateMerged |
| 15 | Console / page errors | **0** across 33 interactions | all reports |

---

## 3. What works well (qualitative)

### 3.1 Visual design — synflux aesthetic faithfully reproduced
- **Light theme**: cream/off-white background, teal primary (`#14b8a6`), serif italic accents (e.g. "activity" in the section header), Instrument Serif + Inter + JetBrains Mono — matches synflux.org.
- **Dark theme**: dark teal/charcoal surfaces, light text, accents preserved. Every component (cards, chips, pills, sidebar, digest) is properly themed. Theme toggle icon flips (moon ↔ sun).
- **Typography hierarchy**: topbar title vs sub, digest kicker vs narrative, card title vs summary, stat label vs num — all clear.
- **Color semantics**: focus colors (inference teal, training purple, direction orange, general gray) used consistently in the digest bar, stat "By Focus" mini-bars, focus tags on cards, and direction section.

### 3.2 Weekly illustrated digest (Phase 2 flagship)
The `WeeklyDigestPanel` is the standout deliverable. Top to bottom:
1. **Kicker** "WEEKLY DIGEST · 2026-W42" + date range "Oct 12 – Oct 18".
2. **Meta**: "927 items · PR 862 · Issue 65" with focus legend.
3. **Chinese narrative** (one paragraph): "本周（Oct 12 – Oct 18）共 927 条动态 —— PR 862 · Issue 65。推理优化 540 条、训练优化 312 条、方向演进 8 条。最活跃仓库：vllm (227), sglang (213), TensorRT-LLM (208)。重点关注：[Bugfix][Attention] Chunk sparse indexer decode logits by request（vllm）。" *(counts reflect the post-reclassification + LLM-enriched dataset; see §9)*
4. **Stacked focus distribution bar** (proportional).
5. **Top-repo chips** (vllm 227, sglang 213, TensorRT-LLM 208, Megatron-LM 179, verl 73).
6. **"TOP PRS THIS WEEK"** — 6 cards (2×3) with score badge, focus tag, repo, title, AI summary, author.
7. **"DIRECTION & EVOLUTION"** section for direction-focused items.

The top-PR cards (e.g. score 76 vllm RFC "PD disaggregation + RL lifecycle", score 76 sglang "muse spark", score 66 vllm "Ignore AMD CI webhook") demonstrate that scoring + topic tags + summaries are working together to surface the most important items.

### 3.3 PR scoring (0–100) + Top sort
- Scores are realistic (30–76, avg 49) and color-coded (green ≥80, indigo ≥60, amber ≥40).
- "Top" sort pill correctly sorts descending (`b.score - a.score`), verified programmatically with first-score 76, last 52, non-increasing.
- Score ≥ 80 gets a ★ prefix in the badge — nice signal for "exceptional" items.

### 3.4 Precise classification (Phase 2)
- **Topic tags** on every card (Quantization, CUDA/Kernel, MoE, KV-Cache, GRPO/PPO, Speculative, etc.) — visible in search results.
- **Focus tags** (INFERENCE / DIRECTION) color-coded.
- **Category** chips (#perf, #feature, #bugfix, #infra, #refactor, #doc) with colored dots.
- **Summaries** are extracted (PR body "## Summary" preferred), concise, and accurate.

### 3.5 Search
- Instant, case-insensitive substring match across title/author/label.
- "quantization" → 40 results, all genuinely about quantization/precision (Mamba2 block_size, ComfyUI INT8, NVFP4, FP8, etc.) — the topic-tagging makes search very effective.
- Focus ring on the input is clear; clearing works.

### 3.6 Dashboard polish
- 5 stat cards (Tracked / PRs / Issues / Featured / By Focus) with accent left-borders.
- 7 repo cards with org/name, description, items/this-week/authors, **8-week activity sparklines**, stars, language.
- Sidebar shows live counts per repo, last-updated timestamp, window days.
- Teal glow dividers between sections.

### 3.7 Stability
- **Zero JavaScript console errors and zero page errors** across 33+ interactions in 3 evaluation runs. No crashes, no warnings, no broken images.

---

## 4. Issues & improvement recommendations

### 4.1 [Medium] Daily / Monthly views are uncapped and the "showing 500 of N" message is misleading
- **What**: Overview caps its list at 500 with the helpful message "showing 500 of 1200 — refine filters". But the same message appears on **Daily** and **Monthly** views (line 638–651: `view !== "weekly"`), while those views actually render **all** filtered items per bucket (no `RENDER_CAP` applied — line 686/701/716 use `b.items.map(...)` directly).  
  Evidence: Monthly header says "Monthly digest · showing 500 of 1200", but the September bucket alone has **1109 items** that all render below. Weekly avoids this because its header is hidden.
- **Impact**: Users are told "showing 500" but see (and must scroll through) 1200+. The full-page Weekly screenshot was **10.7 MB** because it rendered 1200 item cards. Performance and UX both suffer.
- **Fix options**:
  - **(A)** Hide the cap message for Daily/Monthly, or only show it for Overview. Simplest.
  - **(B)** Apply the same `RENDER_CAP` to Daily/Monthly buckets (cap the total rendered, or per-bucket), and add a "Load more" / pagination button. This restores the message's accuracy and bounds page length.
  - **(C)** Make the Weekly view's full item list optional (default to digest only, with a "Show all this week" toggle), since the digest already covers the curated highlights.

### 4.2 [Low] Focus filter labels are in Chinese, while category/state labels are in English
- **What**: Sidebar Focus group uses Chinese ("推理优化" / "训练优化" / "方向演进"); the data and the rest of the UI are mostly English. The Chinese labels were chosen to match the digest narrative, but in the sidebar they may surprise an English-only reader.
- **Fix**: Either keep Chinese for the digest narrative but use bilingual sidebar labels ("推理优化 Inference"), or make the focus labels user-toggleable. Low priority.

### 4.3 [Low] State filter is single-select (no toggle-off on re-click)
- **What**: Category chips (perf/feature/bugfix/…) are multi-select toggles (re-click deselects). State chips (Any/Open/Merged/Closed) are single-select (re-clicking "Merged" keeps it "Merged"; you must click "Any" to clear). This was confirmed by the 247/247 result on a re-click test.
- **Impact**: Inconsistent mental model. Some users will expect a re-click to deselect.
- **Fix**: Either document "click Any to clear", or make state also a toggle with a visual "off" state. Low priority.

### 4.4 [Low] Weekly digest narrative mixes Chinese and English
- **What**: "本周（Oct 12 – Oct 18）共 927 条动态 — PR 862 · Issue 65。推理优化 638 条…" The "— PR 862 · Issue 65" segment is English mid-Chinese-sentence. Functional, but a bit jarring.
- **Fix**: Either fully Chinese ("PR 862 个 · Issue 65 个") or fully English narrative. Pick one voice.

### 4.5 [Low] "Featured" stat card is very low (3)
- **What**: Stat card "Featured · value ≥ 4" shows only **3** items in the 30d window. The "value" field seems to be set rarely.
- **Fix**: If "value" is not reliably populated from GitHub (it isn't a standard field), either remove this stat, rename it ("High-value" with a different signal), or recompute value from score/labels. Low priority.

### 4.6 [Low] Topbar pill density at 1440px
- **What**: At 1440px the topbar fits 4 pill groups (type / window / display / sort) + search + theme toggle comfortably, but there is no breathing room. On narrower screens (<1280px) pills will wrap or overflow.
- **Fix**: Consider a `flex-wrap` on the topbar pills container, or collapse the window/sort groups into a dropdown on narrow viewports. Not urgent for desktop.

### 4.7 [Minor] Section header is hidden on Weekly (intentional), but the bucketed list below has no count
- **What**: Weekly hides "section head" + "result-count" (the digest replaces them). Good. But the bucketed list beneath renders all items with **no bucket count summary** beyond the per-bucket "N items" label. With 1200 items across many weeks, a small "X weeks · 1200 items total" line above the buckets would help orient the user.
- **Fix**: Add a one-line summary above the Weekly bucketed list (and similarly above Daily/Monthly). Trivial.

---

## 5. What was *not* testable / out of scope
- **Live LLM enrichment** — *now covered*, see §9. At the time of the original pass no endpoint was configured, so summaries were heuristic-only.
- **Mobile / responsive** — evaluation was desktop-only (1440×900).
- **Real-time GitHub data refresh** — data is static (`public/data/data.json`); no auto-refresh.
- **Accessibility audit** — not performed (keyboard nav, ARIA, contrast ratios).

---

## 8. Post-evaluation optimizations applied (2026-10-17)

The following optimizations were implemented and re-verified in the browser after the initial evaluation.

### 8.1 Capped lists + "Load more" for all views
- **What changed:** Introduced `visible` state (default 500), a `bucketNodes` helper, and a "Load more" button. Overview/Daily/Weekly/Monthly all now cap their rendered items to `visible`, with a button that increases by another 500.
- **Before:** Daily/Monthly/Weekly rendered all items uncapped (Monthly September bucket = 1,109 items, Weekly full page = 10.7 MB). The result-count message "showing 500 of 1200" was misleading on Daily/Monthly because 500 was only the Overview cap.
- **After:**
  - Overview: **"showing 500 of 1200"** + **"Load more (700 more)"** button. Clicking → **"showing 1000 of 1200"** + button remains. Verified by browser automation.
  - Monthly: **"showing 500 of 1200"** + Load more. Previously uncapped; now capped.
  - Search "quantization": resets budget to 500, shows **"40 items"** + no Load more (correct: all results visible).
  - Bucket headers show `X / N shown` when sliced (e.g. "500 / 927 shown").

### 8.2 Fixed "Featured" stat label
- **Before:** Label "Featured", foot text "value ≥ 4" — cryptic because `value = round(score/20)`.
- **After:** Label **"Standout"**, foot text **"score ≥ 70"** — transparent and meaningful.

### 8.3 Re-verification results (same browser method)
- **Console/page errors:** 0
- **TypeScript:** `tsc --noEmit` passes cleanly.
- **Screenshots:** `eval-shots/v01-overview.png`, `v02-after-loadmore.png`, `v03-monthly.png`, `v04-search.png`.

### 8.4 Body + Discussion summaries (additional enhancement)
- **What changed:** `collect.py` now saves the raw `body` (description) and fetches top-3 discussion comments per item. A smarter `extract_summary` combines body sections + comment insight to generate richer, contextual summaries. The UI renders these summaries on every card and table row.
- **Data:** 1,431 items have body (97%), 938 have discussion comments (64%). File grew from 1.4 MB → 10.4 MB.
- **Summary strategy:**
  1. Tries key markdown sections (Summary, Description, Motivation, What, Why, Changes, Overview)
  2. Extracts 1-2 substantive sentences (filters code blocks, checklists, links, tables)
  3. If comments add new insight, appends `[Discussion: …]` note
  4. Cleans markdown artifacts, caps at 260 chars
- **UI:** `card-summary` below title on cards; `discuss-badge` shows comment count; `tbl-summary` on table rows.
- **Examples:**
  - vllm gemma4 softcap: "The fused greedy-verification logits reduction still computes FP32 softcap for every vocabulary element…"
  - vllm CUTLASS FP8: "…[Discussion: Thank you for contributing to the VLLM project.]"
  - AMD CI: "…[Discussion: ✅ No earlier CI build exists for this PR.]"
- **Verified:** `tsc --noEmit` passes, 0 console errors, browser screenshots confirm cards show summaries with discussion badges.

---

## 7. Artifacts
- `eval-report.json`, `eval-report2.json`, `eval-report3.json` — raw metrics.
- `eval-shots/` — 22 screenshots covering every view, filter, sort, theme, and search state.
- `eval-shots/llm-01-overview.png`, `llm-02-badge-closeup.png` — LLM badge rendering.
- `eval-llm-badge.json` — badge/fetch metrics from the browser run.
- This document: `EVALUATION.md`.

---

## 9. OpenAI-compatible LLM integration (2026-10-17)

**What changed.** The enrichment path previously spoke the Anthropic `/v1/messages`
shape. It now targets the de-facto **OpenAI contract**, so any compatible server
works: OpenAI, Azure OpenAI, DeepSeek, Moonshot, Qwen, OpenRouter, or a local
vLLM / SGLang / Ollama / LM Studio instance. No SDK — `urllib` only.

### 9.1 Request contract
```
POST {base}/v1/chat/completions
Authorization: Bearer <OPENAI_API_KEY>
Content-Type: application/json
{ "model": "...", "messages": [ {system}, {user} ], "max_tokens": 900, "temperature": 0.2 }
→ choices[0].message.content  (strict JSON: summary, category, focus, score, tags)
```
`_chat_url()` normalises the base URL, accepting `https://host`, `.../v1`,
`.../v1/` or a full `.../v1/chat/completions` path — the most common
configuration mistake with these endpoints.

### 9.2 Four real bugs found only by testing against a live endpoint
| # | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| 1 | `--llm-check` reported **`reply=''`** yet exit 0 | `agnes-2.5-flash` is a **reasoning model**: `max_tokens: 8` was consumed entirely by `reasoning_tokens` (16), leaving `content` empty | budget raised to 256; check now reports `(reasoning)` vs `(chat)` and token usage |
| 2 | enrichment produced **15 / 1,474** successes, finishing in 38 s | every failure was silently swallowed (`except Exception: return None`), hiding **HTTP 429** rate limiting | retry with exponential backoff (2→4→8→16 s), honour `Retry-After`, `_LLM_LAST_ERR` surfaces the reason |
| 3 | long runs lost everything if they died | `data.json` written only once, at the very end | checkpoint every 25 successes + `data.before-llm.json` rolling backup + abort-without-write if zero succeeded |
| 4 | `.env` copied from `.env.example` sent a **real request with `sk-your-key-here`** | config only checked presence, not placeholder-ness | placeholder detection (`your-key`, `sk-your`, `changeme`, `<`, `todo`) → treated as unconfigured |

### 9.3 `direction` is protected from the model
Left unguarded, the model re-read RFCs as ordinary engineering work — e.g. the
`[RFC][Experimental]: Model- and platform-customized KV cache planning` item was
reclassified `direction → inference`. Since `direction` is the roadmap signal the
Focus dimension exists for, it is now **deterministic and outranks the model**:
any title matching `RFC|roadmap|proposal|design-doc|tracking-issue|epic|blueprint`
(or carrying such a label) stays `direction` regardless of the model's answer.
Verified: all 8 direction items in the current week are guard-protected, and the
4 LLM-tagged direction items kept their focus.

### 9.4 Quality: heuristic → LLM
Representative before/after (same item, same input):

| Item | Heuristic | LLM |
| --- | --- | --- |
| `[Feat] PD: Add opt-in first-chunk decode KV allocation` | "waits until the final prefill result is accepted. This PR adds an opt-in intermediate policy: Set the same pol…" | "Adds opt-in `first_chunk` KV allocation policy for disaggregated LLM serving, allowing decode to reserve KV de…" |
| `fix(moe): report reason for CUTLASS FP8 backend rejection` | "Currently, requesting with online FP8 raises a bare without stating the reason or alternatives…" | "Routes CUTLASS FP8 MoE backend rejections through the existing `_make_log_unsupported` helper to surface the spe…" |
| `[Bugfix][Rust Frontend] Fix macOS build` | "socket2 only provides that method on Linux, Android, FreeBSD and Fuchsia, so doesn't compile on macOS…" | "Fixes vllm-rs macOS arm64 build failure by replacing Linux-only `socket2::Socket::domain` with cross-platform `So…" |

The heuristic sentences are frequently mid-thought fragments ("raises a bare
without stating…") because sentence extraction cannot see across the markdown it
stripped. The LLM rewrites them into a self-contained statement of the change —
the single biggest quality jump in the project.

### 9.5 Rate limits are the real constraint
The endpoint allows roughly **1 request / 3–4 s**. An unpaced 1,474-item burst
triggered a 429 wall that took minutes to clear. Practical guidance, now in the
README: `--workers 1`–`2`, `--skip-done` to resume, and `--limit N` to bound a
run. At the observed rate, enriching all 1,474 items takes ~90 min; the UI's
default "Top" view and the weekly digest are covered by the first few hundred.

### 9.6 Verification
- `python collect.py --llm-check` → `✓ endpoint OK — model=agnes-2.5-flash (reasoning) reply='pong' tokens=322`
- Live run (`--limit 150 --workers 2 --skip-done`): **139 / 150 succeeded** in 16m40s; the 11 failures were 429s and correctly retained their heuristic values. **156 items** now carry `summary_source: "llm"` (10.6% of 1,474).
- Dataset integrity after enrichment: 0 direction-guard violations, 0 `focus_label` mismatches, 0 out-of-range scores, 0 empty summaries, 0 remaining `( )` artifacts (477 cleaned retroactively).
- Browser (Playwright, 1440×900): **0 console/page errors**; AI badges counted identically in Cards and Table views (**133 / 133** in the default 30-day view); `title` tooltip = "Summary refined by the configured LLM".
- `npx tsc --noEmit` and `npm run build` both pass; `py_compile` clean on all four scripts.

### 9.7 Remaining work
Only **10.6%** of items are LLM-enriched — the quota, not the code, is the limit.
To finish the dataset against a higher-quota endpoint:

```bash
python llm_enrich.py --limit 0 --workers 1 --skip-done   # resumes, ~90 min at 1 req/3s
```

Everything else (heuristic summary, focus, category, score, tags) is already
populated, so the UI is never in a half-broken state.

