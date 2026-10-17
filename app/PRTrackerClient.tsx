"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  DigestInsight, DigestItem, DigestKeyPr, DigestModule,
  FeedData, FeedItem, FocusKey, CatKey, WeeklyDigest,
} from "./types";

/* ── design tokens (mirror globals.css) ───────────────────────────────────────── */
const FOCUS_COLOR: Record<FocusKey, string> = {
  inference: "var(--c-inference)",
  training: "var(--c-training)",
  direction: "var(--c-direction)",
  general: "var(--c-general)",
};
const CAT_COLOR: Record<CatKey, string> = {
  perf: "var(--cat-perf)", bugfix: "var(--cat-bugfix)", feature: "var(--cat-feature)",
  infra: "var(--cat-infra)", doc: "var(--cat-doc)", refactor: "var(--cat-refactor)",
  unknown: "var(--cat-unknown)",
};

function scoreColor(s: number) {
  if (s >= 80) return "var(--cat-perf)";
  if (s >= 60) return "var(--cat-feature)";
  if (s >= 40) return "var(--c-direction)";
  return "var(--ink-mute)";
}

const FOCUS_ORDER: FocusKey[] = ["inference", "training", "direction", "general"];
const RENDER_CAP = 500;
const FOCUS_LABEL: Record<FocusKey, string> = {
  inference: "推理优化 · Inference",
  training: "训练优化 · Training",
  direction: "方向演进 · Direction",
  general: "通用 · General",
};
const CAT_ORDER: CatKey[] = ["perf", "feature", "bugfix", "infra", "refactor", "doc", "unknown"];

const TIME_OPTS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: null as number | null },
];

const TYPE_OPTS = [
  { label: "All", v: "all" },
  { label: "PR", v: "pr" },
  { label: "Issue", v: "issue" },
];

/* ── icons ───────────────────────────────────────────────────────────────────── */
function Ico({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg className="nav-ico" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const IC = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  daily: "M3 9h18M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 2v4M16 2v4",
  weekly: "M8 2v4M16 2v4M3 10h18M3 10v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9M3 14h18",
  monthly: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 9h16M9 5v4M15 5v4",
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  star: "M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z",
  comment: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
};

/* ── helpers ─────────────────────────────────────────────────────────────────── */
const FMT = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const FMT_DAY = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });
const FMT_MONTH = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
function toDate(s: string) { return new Date(s); }
function relTime(s: string) {
  const diff = Date.now() - +new Date(s);
  const d = Math.floor(diff / 86400000);
  if (d <= 0) { const h = Math.floor(diff / 3600000); return h <= 0 ? "just now" : `${h}h ago`; }
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
function weeklyBars(items: FeedItem[], n = 8): number[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const s = now - (n - i) * 7 * 86400000;
    const e = now - (n - i - 1) * 7 * 86400000;
    return items.filter(p => { const t = +toDate(p.created_at); return t >= s && t < e; }).length;
  });
}
/* ── ISO-8601 week helpers ─────────────────────────────────────────────────────
   The server buckets with Python's `isocalendar()`, so the client must use the
   same definition — otherwise a digest labelled W42 can sit above buckets
   labelled W41/W43 for the very same items. All maths is done in UTC and only
   formatted at the end, so a negative local offset cannot shift a day.        */
const FMT_UTC = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

function isoWeekOf(d: Date): { year: number; week: number } {
  // read the UTC calendar day: GitHub timestamps are UTC and Python's
  // isocalendar() is applied to them directly, so a local-time read would
  // shift items near midnight into a different week than the server.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);              // move to the week's Thursday
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

function isoWeekKey(d: Date): string {
  const { year, week } = isoWeekOf(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** UTC midnight of the Monday that opens the given ISO week. */
function isoWeekStart(label: string): Date {
  const m = label.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return new Date();
  const year = +m[1], week = +m[2];
  const jan4 = new Date(Date.UTC(year, 0, 4));          // Jan 4 is always in W01
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1) + (week - 1) * 7);
  return monday;
}

function isoWeekRange(label: string): string {
  const start = isoWeekStart(label);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${FMT_UTC.format(start)} – ${FMT_UTC.format(end)}`;
}

/* ── activity sparkline for repo cards ────────────────────────────────────────── */
function Bars({ values, color = "var(--teal-500)" }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bars">
      {values.map((v, i) => (
        <span key={i} className={v > 0 ? "" : "zero"}
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: v > 0 ? color : undefined }} />
      ))}
    </div>
  );
}

/* ── item card ───────────────────────────────────────────────────────────────── */
function ItemCard({ it }: { it: FeedItem }) {
  const fc = FOCUS_COLOR[it.focus];
  return (
    <a href={it.url} target="_blank" rel="noopener noreferrer" className="card"
      data-focus={it.focus} data-featured={it.value >= 4 ? "true" : "false"}>
      <div className="card-top">
        <span className={`badge ${it.type === "pr" ? "badge-type-pr" : "badge-type-issue"}`}>
          {it.type === "pr" ? "PR" : "ISSUE"}
        </span>
        <span className="badge badge-focus" style={{ background: fc }}>{it.focus}</span>
        <span className="badge badge-cat">#{it.category}</span>
        <span className="repo-chip"><b>{it.repo.split("/")[1]}</b> #{it.number}</span>
        <span className="card-state">
          <span className={`state-dot ${it.state}`} />{it.state}
        </span>
      </div>
      <span className="card-title">{it.title}</span>
      {it.summary && (
        <div className="card-summary">
          {it.summary}
          {it.summary_source === "llm" && (
            <span className="ai-badge" title="Summary refined by the configured LLM">AI</span>
          )}
          {/* `discussion` is truncated to a couple of previews in the served
              payload, so the real total comes from `discussion_count`. */}
          {(() => {
            const n = it.discussion_count ?? it.discussion?.length ?? 0;
            if (n <= 0) return null;
            return (
              <span className="discuss-badge" title={`${n} discussion comment${n > 1 ? 's' : ''}`}>
                <Ico d={IC.comment} size={10} /> {n}
              </span>
            );
          })()}
        </div>
      )}
      <div className="pill-row">
        <span className="badge" style={{ background: scoreColor(it.score), color: "#fff" }}>
          {it.score >= 80 ? "★ " : ""}{it.score}
        </span>
        {it.tags.slice(0, 4).map(l => (
          <span key={l} className="tag">{l}</span>
        ))}
        {it.value >= 4 && <span className="tag tag-label">featured</span>}
      </div>
      <div className="card-foot">
        <span>@{it.author}</span>
        <span className="sep">·</span>
        <span>{relTime(it.created_at)}</span>
        {it.comments > 0 && (
          <span className="metric" style={{ marginLeft: "auto" }}>
            <Ico d={IC.comment} size={11} /> {it.comments}
          </span>
        )}
        {it.reactions > 0 && (
          <span className="metric"><Ico d={IC.star} size={11} /> {it.reactions}</span>
        )}
        {(it.additions > 0 || it.deletions > 0) && (
          <span className="metric">
            <span style={{ color: "var(--cat-perf)" }}>+{fmtNum(it.additions)}</span>
            <span style={{ color: "var(--cat-bugfix)" }}>−{fmtNum(it.deletions)}</span>
          </span>
        )}
      </div>
    </a>
  );
}

/* ── table row ────────────────────────────────────────────────────────────────── */
function ItemRow({ it }: { it: FeedItem }) {
  return (
    <tr>
      <td>
        <span className="badge" style={{ background: FOCUS_COLOR[it.focus], color: "#fff" }}>
          {it.type === "pr" ? "PR" : "IS"}
        </span>
      </td>
      <td>
        <a className="tbl-title" href={it.url} target="_blank" rel="noopener noreferrer">{it.title}</a>
        {it.summary && (
          <div className="tbl-summary">
            {it.summary}
            {it.summary_source === "llm" && (
              <span className="ai-badge" title="Summary refined by the configured LLM">AI</span>
            )}
          </div>
        )}
        <div className="pill-row" style={{ marginTop: 4 }}>
          {it.labels.slice(0, 3).map(l => <span key={l} className="tag">{l}</span>)}
        </div>
      </td>
      <td className="tbl-num"><b>{it.repo.split("/")[1]}</b> #{it.number}</td>
      <td><span className="badge badge-cat">#{it.category}</span></td>
      <td><span style={{ color: FOCUS_COLOR[it.focus], fontWeight: 600 }}>{it.focus}</span></td>
      <td><span className="card-state"><span className={`state-dot ${it.state}`} />{it.state}</span></td>
      <td className="tbl-num">@{it.author}</td>
      <td className="tbl-num">{relTime(it.created_at)}</td>
    </tr>
  );
}

/* ── digest builder (client side) ────────────────────────────────────────────────
   The digest is derived from the *filtered* items, so what the panel claims and
   what the list below shows can never disagree. `allItems` is only used for
   snapshot-coverage reporting, which is a property of the dataset itself.     */
const DIGEST_TOP_N = 6;
const DIGEST_DIR_N = 4;
const DIGEST_REPO_CAP = 2;      // max top slots per repo, for cross-repo breadth

function toDigestItem(it: FeedItem): DigestItem {
  return {
    id: it.id, repo: it.repo, number: it.number, title: it.title,
    author: it.author, url: it.url, score: it.score, focus: it.focus,
    summary: it.summary,
  };
}

/** Per-repo span of the snapshot — reveals the per-repo fetch caps. */
function repoCoverage(allItems: FeedItem[]): Map<string, { days: number; count: number }> {
  const span = new Map<string, { min: number; max: number; count: number }>();
  for (const it of allItems) {
    const t = +toDate(it.created_at);
    if (!isFinite(t)) continue;
    const cur = span.get(it.repo);
    if (!cur) span.set(it.repo, { min: t, max: t, count: 1 });
    else { cur.min = Math.min(cur.min, t); cur.max = Math.max(cur.max, t); cur.count += 1; }
  }
  const out = new Map<string, { days: number; count: number }>();
  for (const [repo, v] of span) {
    out.set(repo, { days: Math.max(1, Math.round((v.max - v.min) / 86400000) + 1), count: v.count });
  }
  return out;
}

function buildDigest(week: string, items: FeedItem[], allItems: FeedItem[]): WeeklyDigest {
  const inWeek = items.filter(it => isoWeekKey(new Date(it.created_at)) === week);
  const total = inWeek.length;
  const prs = inWeek.filter(i => i.type === "pr").length;
  const issues = total - prs;

  const by_focus: Record<FocusKey, number> = { inference: 0, training: 0, direction: 0, general: 0 };
  for (const it of inWeek) by_focus[it.focus] += 1;

  const start = isoWeekStart(week);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const now = new Date();
  const complete = now.getTime() >= end.getTime();
  const days_elapsed = Math.max(1, Math.min(7, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1));

  // outcome side — merged/closed are timestamps, not creation dates
  const inWeekTs = (s?: string | null) => !!s && isoWeekKey(new Date(s)) === week;
  const merged = items.filter(i => inWeekTs(i.merged_at)).length;
  const closed = items.filter(i => inWeekTs(i.closed_at)).length;

  // repo breadth, with a per-repo cap so one busy repo cannot own the list
  const repoCount = new Map<string, number>();
  for (const it of inWeek) repoCount.set(it.repo, (repoCount.get(it.repo) ?? 0) + 1);
  const cov = repoCoverage(allItems);
  const top_repos = [...repoCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([repo, count]) => {
      const c = cov.get(repo);
      return { repo, count, days: c?.days, per_day: c ? +(count / c.days).toFixed(1) : undefined };
    });

  // Top PRs: score first, then a deterministic tiebreak (comments → reactions →
  // recency) so equal scores stop being an arbitrary coin flip.
  const ranked = inWeek
    .filter(i => i.type === "pr")
    .sort((a, b) =>
      b.score - a.score ||
      (b.comments ?? 0) - (a.comments ?? 0) ||
      (b.reactions ?? 0) - (a.reactions ?? 0) ||
      +toDate(b.created_at) - +toDate(a.created_at));

  const picked: FeedItem[] = [];
  const perRepo = new Map<string, number>();
  for (const it of ranked) {
    if (picked.length >= DIGEST_TOP_N) break;
    const n = perRepo.get(it.repo) ?? 0;
    if (n >= DIGEST_REPO_CAP) continue;
    perRepo.set(it.repo, n + 1);
    picked.push(it);
  }
  for (const it of ranked) {                       // fill any slots diversity left empty
    if (picked.length >= DIGEST_TOP_N) break;
    if (!picked.includes(it)) picked.push(it);
  }
  // selection is diverse, presentation stays score-ordered
  const top = picked.sort((a, b) => b.score - a.score).map(toDigestItem);

  const dirAll = inWeek.filter(i => i.focus === "direction").sort((a, b) => b.score - a.score);
  const topIds = new Set(top.map(t => t.id));
  const direction = dirAll.filter(i => !topIds.has(i.id)).slice(0, DIGEST_DIR_N).map(toDigestItem);

  // themes come from tags — `subsystems` is empty in this dataset
  const tagCount = new Map<string, number>();
  for (const it of inWeek) for (const t of it.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const per_day = total / days_elapsed;
  const parts: string[] = [];
  parts.push(`${complete ? "本周" : "本周尚未结束（" + days_elapsed + "/7 天）"}日均 ${per_day.toFixed(0)} 条`);
  parts.push(`合并 ${merged} 条、关闭 ${closed} 条`);
  parts.push(`领域分布：推理 ${by_focus.inference}、训练 ${by_focus.training}、方向 ${by_focus.direction}、通用 ${by_focus.general}`);
  if (topTags.length) {
    parts.push(`热点主题：${topTags.map(([t, c]) => `${t} (${c})`).join("、")}`);
  }
  const narrative = parts.join("。") + "。";

  const thin = [...cov.entries()].filter(([, v]) => v.days < 7).map(([r]) => r.split("/")[1]);
  const coverage_partial = thin.length > 0;
  const coverage_note = coverage_partial
    ? `快照覆盖不均：${thin.join("、")} 不足 7 天，总量与仓库排名仅供趋势参考`
    : undefined;

  return {
    week,
    range: isoWeekRange(week),
    total, prs, issues, merged, closed, by_focus, top_repos, top, direction,
    direction_total: dirAll.length,
    narrative,
    complete, days_elapsed, as_of: now.toISOString(), per_day: +per_day.toFixed(1),
    coverage_partial, coverage_note,
  };
}

const TREND_LABEL: Record<DigestModule["trend"], string> = {
  up: "升温", flat: "平稳", down: "降温", new: "新出现",
};

function prevWeekLabel(label: string): string {
  const m = label.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return "";
  let year = +m[1], week = +m[2] - 1;
  if (week === 0) { year -= 1; week = 52; }
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Deterministic editorial layer — used when the server has no LLM-written one,
 *  and whenever a filter narrows the view (the LLM prose describes the whole week). */
function buildInsight(week: string, weekItems: FeedItem[], allItems: FeedItem[]): DigestInsight {
  const prevItems = allItems.filter(it => isoWeekKey(new Date(it.created_at)) === prevWeekLabel(week));

  const index = (arr: FeedItem[]) => {
    const m = new Map<string, { count: number; repos: Map<string, number>; items: FeedItem[] }>();
    for (const it of arr) {
      for (const t of it.tags) {
        const e = m.get(t) ?? { count: 0, repos: new Map<string, number>(), items: [] };
        e.count += 1;
        e.repos.set(it.repo, (e.repos.get(it.repo) ?? 0) + 1);
        e.items.push(it);
        m.set(t, e);
      }
    }
    return m;
  };

  const cur = index(weekItems);
  const prev = index(prevItems);
  const total = Math.max(1, weekItems.length);
  const prevTotal = Math.max(1, prevItems.length);

  const modules: DigestModule[] = [...cur.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, e]) => {
      const share = e.count / total;
      const prevCount = prev.get(name)?.count ?? 0;
      // A thin previous week cannot support a trend claim: the snapshot is
      // truncated per repo, so "everything is up" would just mean "we fetched
      // more this week". Report 平稳 instead of inventing a direction.
      const hasBaseline = prevItems.length >= 20;
      const pshare = prevCount / prevTotal;
      const trend: DigestModule["trend"] =
        !hasBaseline ? "flat"
        : prevCount === 0 ? "new"
        : share > pshare * 1.15 ? "up"
        : share < pshare * 0.85 ? "down"
        : "flat";
      const rep = [...e.items].sort((a, b) => b.score - a.score)[0];
      const repos = [...e.repos.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r.split("/")[1]);
      return { name, count: e.count, repos, trend, note: rep.summary || rep.title };
    });

  const focus: string[] = [];
  for (const m of modules.slice(0, 2)) {
    focus.push(`${m.repos.slice(0, 3).join("、")} 本周在 ${m.name} 方向共 ${m.count} 条，代表性工作：${m.note.slice(0, 58)}`);
  }
  const broad = modules.find(m => m.repos.length >= 3);
  if (broad) {
    focus.push(`${broad.name} 在 ${broad.repos.length} 个仓库同步推进，已从单点优化转为跨仓库共识方向。`);
  }
  const dirItems = weekItems.filter(i => i.focus === "direction");
  if (dirItems.length) {
    const rs = [...new Set(dirItems.map(i => i.repo.split("/")[1]))].slice(0, 3).join("、");
    focus.push(`方向性讨论 ${dirItems.length} 条，来自 ${rs}，以 RFC 与设计文档为主。`);
  }
  if (!focus.length) focus.push("本周没有足够数据生成重点摘要。");

  const key_prs: DigestKeyPr[] = weekItems
    .filter(i => i.type === "pr")
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(i => ({ repo: i.repo, number: i.number }));

  return { source: "heuristic", focus: focus.slice(0, 4), modules, key_prs };
}


const DIGEST_FOCUS: FocusKey[] = ["inference", "training", "direction", "general"];
const DIGEST_COLOR: Record<FocusKey, string> = {
  inference: "var(--c-inference)", training: "var(--c-training)",
  direction: "var(--c-direction)", general: "var(--c-general)",
};

function WeeklyDigestPanel({ d, insight, compact, filtered }: {
  d: WeeklyDigest; insight: DigestInsight | null; compact?: boolean; filtered?: boolean;
}) {
  const total = Math.max(1, d.total);

  // Key PRs: prefer the editorial picks (which carry a "why"), fall back to the
  // score-ranked cards when the digest has no LLM-written layer.
  const keyPrs = (() => {
    const picked = (insight?.key_prs ?? [])
      .map(k => ({
        item: d.top.find(t => t.repo === k.repo && t.number === k.number),
        why: k.why,
      }))
      .filter((x): x is { item: DigestItem; why: string | undefined } => !!x.item);
    return picked.length ? picked : d.top.map(t => ({ item: t, why: undefined as string | undefined }));
  })();

  return (
    <div className="digest">
      <div className="digest-head">
        <div>
          <div className="digest-kicker">
            WEEKLY DIGEST · {d.week}
            {d.complete === false && (
              <span className="digest-live" title="The ISO week has not finished yet — counts will keep changing">
                IN PROGRESS · {d.days_elapsed}/7 d
              </span>
            )}
            {filtered && <span className="digest-scope">FILTERED</span>}
          </div>
          <div className="digest-range">
            {d.range} · {d.total} items · PR {d.prs} · Issue {d.issues}
            {typeof d.merged === "number" && <> · merged {d.merged} · closed {d.closed}</>}
          </div>
        </div>
        <div className="legend">
          {DIGEST_FOCUS.map(f => (
            <span key={f} className="legend-item">
              <span className="legend-dot" style={{ background: DIGEST_COLOR[f] }} />
              {f} <b>{d.by_focus[f]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="digest-bar">
        {DIGEST_FOCUS.map(f => {
          const pct = (d.by_focus[f] / total) * 100;
          return (
            <span key={f} title={`${f}: ${d.by_focus[f]} (${pct.toFixed(1)}%)`}
              style={{ width: `${pct}%`, background: DIGEST_COLOR[f] }} />
          );
        })}
      </div>

      {d.coverage_note && (
        <div className="digest-warn">
          <span className="warn-dot" />{d.coverage_note}
        </div>
      )}

      {/* ── 本周重点 ─────────────────────────────────────────────────────────── */}
      {insight && insight.focus.length > 0 && (
        <>
          <div className="digest-section-title">
            本周重点
            <span className="digest-section-note">This week&apos;s focus</span>
          </div>
          <ul className="digest-focus">
            {insight.focus.slice(0, compact ? 2 : 4).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {!compact && (
        <>
          {/* ── 功能模块与开发趋势 ─────────────────────────────────────────────── */}
          {insight && insight.modules.length > 0 && (
            <>
              <div className="digest-section-title">
                功能模块与开发趋势
                <span className="digest-section-note">Modules &amp; trends · {insight.source === "llm" ? "AI" : "auto"}</span>
              </div>
              <div className="digest-mods">
                {insight.modules.map(m => (
                  <div key={m.name} className="digest-mod" data-trend={m.trend}>
                    <div className="mod-head">
                      <span className="mod-name">{m.name}</span>
                      <span className="mod-trend" data-trend={m.trend}>{TREND_LABEL[m.trend]}</span>
                      <span className="mod-count">{m.count}</span>
                    </div>
                    <div className="mod-note">{m.note}</div>
                    <div className="mod-repos">
                      {m.repos.slice(0, 4).join(" · ")}
                      {m.repos.length > 4 && ` · +${m.repos.length - 4}`}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 重点 PR ──────────────────────────────────────────────────────── */}
          <div className="digest-section-title">
            重点 PR
            <span className="digest-section-note">
              key changes · ranked by score · max {DIGEST_REPO_CAP} per repo
            </span>
          </div>
          {keyPrs.length === 0 ? (
            <div className="digest-empty">No pull requests match the current filters in this week.</div>
          ) : (
            <div className="digest-top">
              {keyPrs.map(({ item: t, why }) => (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                  className="digest-top-card" data-focus={t.focus}>
                  <div className="dt-top">
                    <span className="dt-score" style={{ color: scoreColor(t.score) }}>{t.score}</span>
                    <span className="dt-repo">{t.repo.split("/")[1]} #{t.number}</span>
                    <span className="dt-focus" style={{ background: DIGEST_COLOR[t.focus], color: "#fff" }}>{t.focus}</span>
                  </div>
                  <div className="dt-title">{t.title}</div>
                  {why
                    ? <div className="dt-why">{why}</div>
                    : <div className="dt-summary">{t.summary}</div>}
                  <div className="dt-author">@{t.author}</div>
                </a>
              ))}
            </div>
          )}

          {/* ── Direction & Evolution ─────────────────────────────────────────── */}
          {d.direction.length > 0 && (
            <>
              <div className="digest-section-title">
                Direction &amp; Evolution
                <span className="digest-section-note">
                  showing {d.direction.length} of {d.direction_total ?? d.direction.length}
                </span>
              </div>
              <div className="digest-dir">
                {d.direction.map(t => (
                  <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                    className="digest-dir-item" data-focus={t.focus}>
                    <span className="dt-score" style={{ color: scoreColor(t.score) }}>{t.score}</span>
                    <span className="dt-title">{t.title}</span>
                    <span className="dt-repo">{t.repo.split("/")[1]}</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── main app ─────────────────────────────────────────────────────────────────── */
type View = "overview" | "daily" | "weekly" | "monthly";

export default function PRTrackerClient() {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("overview");
  const [typeFilter, setTypeFilter] = useState<"all" | "pr" | "issue">("all");
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [focusFilter, setFocusFilter] = useState<"all" | FocusKey>("all");
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<"all" | "open" | "merged" | "closed">("all");
  const [timeDays, setTimeDays] = useState<number | null>(30);
  const [search, setSearch] = useState("");
  const [display, setDisplay] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [visible, setVisible] = useState<number>(RENDER_CAP);

  // theme
  useEffect(() => {
    const saved = (localStorage.getItem("ait-theme") as "light" | "dark") || "light";
    setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ait-theme", theme);
  }, [theme]);

  // data
  useEffect(() => {
    // Must be prefixed: on a GitHub Pages project site the app is served from
    // /<repo>/ and a root-absolute "/data/data.json" resolves outside the site.
    // Inlined at build time, so this is a constant by the time it ships.
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/data/data.json`, { cache: "no-cache" })
      .then(r => r.json())
      .then((d: FeedData) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const repos = data?.repos ?? [];

  const toggleCat = (c: string) => {
    setCatFilter(prev => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  };

  // structural filter (time / type / repo / focus)
  const baseFiltered = useMemo(() => {
    if (!data) return [];
    const cut = timeDays == null ? 0 : Date.now() - timeDays * 86400000;
    return data.items.filter(it => {
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (repoFilter !== "all" && it.repo !== repoFilter) return false;
      if (focusFilter !== "all" && it.focus !== focusFilter) return false;
      if (timeDays != null && +toDate(it.created_at) < cut) return false;
      return true;
    });
  }, [data, typeFilter, repoFilter, focusFilter, timeDays]);

  // full filter (+ state / cat / search)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseFiltered.filter(it => {
      if (stateFilter !== "all" && it.state !== stateFilter) return false;
      if (catFilter.size > 0 && !catFilter.has(it.category)) return false;
      if (q) {
        const hay = `${it.title} ${it.summary} ${it.author} ${it.repo} ${it.labels.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baseFiltered, stateFilter, catFilter, search]);

  // reset the rendered-item budget whenever the result set or view changes
  useEffect(() => { setVisible(RENDER_CAP); }, [filtered, view]);

  // The digest is rebuilt from the filtered items so the panel can never claim a
  // number the list below contradicts. `week` still comes from the server payload
  // so the panel and the weekly buckets agree on which week is being summarised.
  const digest = useMemo<WeeklyDigest | null>(() => {
    if (!data?.weekly_digest?.week) return null;
    return buildDigest(data.weekly_digest.week, filtered, data.items);
  }, [data, filtered]);

  // true when the user narrowed the dataset explicitly (the time window is left
  // out on purpose: a 7/30/90-day window still covers the whole digest week)
  const digestFiltered =
    typeFilter !== "all" || repoFilter !== "all" || focusFilter !== "all" ||
    stateFilter !== "all" || catFilter.size > 0 || search.trim() !== "";

  // Editorial layer. The server's LLM-written prose describes the whole week, so
  // it is only valid unfiltered; otherwise fall back to the deterministic builder,
  // which reads the same filtered items as the digest itself.
  const insight = useMemo<DigestInsight | null>(() => {
    const week = data?.weekly_digest?.week;
    if (!data || !week) return null;
    const weekItems = filtered.filter(it => isoWeekKey(new Date(it.created_at)) === week);
    const llm = data.weekly_digest?.insight;
    if (llm && llm.focus?.length && !digestFiltered) return llm;
    return buildInsight(week, weekItems, filtered);
  }, [data, filtered, digestFiltered]);

  // stats
  const stats = useMemo(() => {
    const prs = filtered.filter(i => i.type === "pr").length;
    const issues = filtered.filter(i => i.type === "issue").length;
    const open = filtered.filter(i => i.state === "open").length;
    const merged = filtered.filter(i => i.state === "merged").length;
    const closed = filtered.filter(i => i.state === "closed").length;
    const feat = filtered.filter(i => i.value >= 4).length;
    return { total: filtered.length, prs, issues, open, merged, closed, feat };
  }, [filtered]);

  const focusDist = useMemo(() => {
    const c: Record<FocusKey, number> = { inference: 0, training: 0, direction: 0, general: 0 };
    filtered.forEach(i => { c[i.focus]++; });
    return c;
  }, [filtered]);

  // repo stats (from base)
  const repoStats = useMemo(() => repos.map(r => {
    const items = baseFiltered.filter(i => i.repo === r.name);
    const thisWk = Date.now() - 7 * 86400000;
    return {
      ...r,
      count: items.length,
      authors: new Set(items.map(i => i.author)).size,
      thisWeek: items.filter(i => +toDate(i.created_at) >= thisWk).length,
      bars: weeklyBars(items),
      color: r.domain === "inference" ? "var(--c-inference)" : "var(--c-training)",
    };
  }), [repos, baseFiltered]);

  /* ── time buckets ───────────────────────────────────────────────────────────── */
  function groupByDay(items: FeedItem[]) {
    const map = new Map<string, FeedItem[]>();
    for (const it of items) {
      const d = new Date(it.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()]
      .sort((a, b) => +new Date(b[0]) - +new Date(a[0]))
      .map(([k, v]) => ({ key: k, date: new Date(k), items: v }));
  }
  function groupByWeek(items: FeedItem[]) {
    const map = new Map<string, FeedItem[]>();
    for (const it of items) {
      const key = isoWeekKey(new Date(it.created_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, v]) => ({ key: k, items: v }));
  }
  function groupByMonth(items: FeedItem[]) {
    const map = new Map<string, FeedItem[]>();
    for (const it of items) {
      const d = new Date(it.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, v]) => ({ key: k, date: new Date(`${k}-01`), items: v }));
  }

  const shown = useMemo(() => {
    const arr = [...filtered];
    if (sort === "score") arr.sort((a, b) => b.score - a.score);
    else arr.sort((a, b) => +toDate(b.created_at) - +toDate(a.created_at));
    return arr.slice(0, visible);
  }, [filtered, sort, visible]);

  // Renders bucketed views (Daily/Weekly/Monthly) while respecting the `visible`
  // item budget, so long lists are capped and extended via the "Load more" button.
  type Bucket = { key: string; date?: Date; items: FeedItem[] };
  const bucketNodes = (
    groups: Bucket[],
    renderHead: (b: Bucket, shown: number, total: number) => ReactNode,
  ) => {
    let remaining = visible;
    return groups.map(b => {
      const toShow = remaining > 0 ? b.items.slice(0, remaining) : [];
      remaining -= toShow.length;
      if (toShow.length === 0) return null;
      return (
        <div key={b.key} className="bucket">
          {renderHead(b, toShow.length, b.items.length)}
          {display === "cards"
            ? <div className="cards">{toShow.map(it => <ItemCard key={it.id} it={it} />)}</div>
            : <div className="tbl-wrap"><table className="tbl"><tbody>{toShow.map(it => <ItemRow key={it.id} it={it} />)}</tbody></table></div>}
        </div>
      );
    });
  };

  const VIEW_META: Record<View, { title: string; sub: string }> = {
    overview: { title: "Overview", sub: "all activity across tracked AI-infra repos" },
    daily: { title: "Daily", sub: "grouped by day · newest first" },
    weekly: { title: "Weekly", sub: "grouped by ISO week" },
    monthly: { title: "Monthly", sub: "grouped by month" },
  };

  if (loading) return <div className="loading"><span className="spinner" /> loading feed…</div>;
  if (error) return <div className="empty">failed to load data: {error}</div>;

  /* ── render ──────────────────────────────────────────────────────────────────── */
  return (
    <div className="app">
      {/* ── sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1 0 8 4 4 0 0 1-8 0 4 4 0 0 1 0-8 4 4 0 0 1 4-4zM12 22v-6" />
            </svg>
          </div>
          <div>
            <div className="brand-name">AI Infra Tracker</div>
            <div className="brand-sub">PR · Issue · Evolution</div>
          </div>
        </div>

        <div className="nav-group-label">Views</div>
        {([
          { v: "overview", label: "Overview", d: IC.overview },
          { v: "daily", label: "Daily", d: IC.daily },
          { v: "weekly", label: "Weekly", d: IC.weekly },
          { v: "monthly", label: "Monthly", d: IC.monthly },
        ] as const).map(n => (
          <div key={n.v} className={`nav-link ${view === n.v ? "active" : ""}`} onClick={() => setView(n.v)}>
            <Ico d={n.d} /> {n.label}
          </div>
        ))}

        <div className="nav-group-label">Focus</div>
        {([
          { v: "all", label: "All areas", c: "var(--teal-500)" },
          { v: "inference", label: "推理优化", c: FOCUS_COLOR.inference },
          { v: "training", label: "训练优化", c: FOCUS_COLOR.training },
          { v: "direction", label: "方向演进", c: FOCUS_COLOR.direction },
        ] as const).map(n => (
          <div key={n.v} className={`nav-link ${focusFilter === n.v ? "active" : ""}`}
            onClick={() => setFocusFilter(n.v as "all" | FocusKey)}>
            <span className="repo-dot" style={{ background: n.c }} /> {n.label}
          </div>
        ))}

        <div className="nav-group-label">Repos</div>
        <div className={`repo-mini ${repoFilter === "all" ? "active" : ""}`} onClick={() => setRepoFilter("all")}>
          <span className="repo-dot" style={{ background: "var(--teal-500)" }} />
          <span className="repo-mini-name">all repos</span>
          <span className="repo-mini-count">{baseFiltered.length}</span>
        </div>
        {repoStats.map(r => (
          <div key={r.name} className={`repo-mini ${repoFilter === r.name ? "active" : ""}`}
            onClick={() => setRepoFilter(r.name)}>
            <span className="repo-dot" style={{ background: r.color }} />
            <span className="repo-mini-name">{r.short}</span>
            <span className="repo-mini-count">{r.count}</span>
          </div>
        ))}

        <div className="sidebar-foot">
          <div>updated {data?.last_updated ? relTime(data.last_updated) : "—"}</div>
          <div>{repos.length} repos · {data?.window_days ?? 0}d window</div>
        </div>
      </aside>

      {/* ── main ────────────────────────────────────────────────────────────── */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-titles">
            <div className="topbar-title">{VIEW_META[view].title}</div>
            <div className="topbar-sub">{VIEW_META[view].sub}</div>
          </div>
          <div className="topbar-spacer" />

          <div className="search">
            <Ico d={IC.search} size={14} />
            <input placeholder="search title, author, label…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="pills">
            {TYPE_OPTS.map(o => (
              <button key={o.v} className={`pill ${typeFilter === o.v ? "active" : ""}`}
                onClick={() => setTypeFilter(o.v as typeof typeFilter)}>{o.label}</button>
            ))}
          </div>

          <div className="pills">
            {TIME_OPTS.map(o => (
              <button key={String(o.days)} className={`pill ${timeDays === o.days ? "active" : ""}`}
                onClick={() => setTimeDays(o.days)}>{o.label}</button>
            ))}
          </div>

          <div className="pills">
            <button className={`pill ${display === "cards" ? "active" : ""}`} onClick={() => setDisplay("cards")}>Cards</button>
            <button className={`pill ${display === "table" ? "active" : ""}`} onClick={() => setDisplay("table")}>Table</button>
          </div>

          <div className="pills">
            <button className={`pill ${sort === "recent" ? "active" : ""}`} onClick={() => setSort("recent")}>Latest</button>
            <button className={`pill ${sort === "score" ? "active" : ""}`} onClick={() => setSort("score")}>Top</button>
          </div>

          <div className="icon-btn" title="toggle theme" onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>
            <Ico d={theme === "light" ? IC.moon : IC.sun} size={16} />
          </div>
        </header>

        <div className="content">
          {digest && view === "weekly" && (
            <WeeklyDigestPanel d={digest} insight={insight} filtered={digestFiltered} />
          )}
          {digest && view === "overview" && (
            <WeeklyDigestPanel d={digest} insight={insight} compact filtered={digestFiltered} />
          )}

          {/* stat cards */}
          <div className="stat-grid">
            <div className="stat-card" style={{ ["--accent" as any]: "var(--teal-500)" }}>
              <div className="stat-label">Tracked</div>
              <div className="stat-num">{fmtNum(stats.total)}</div>
              <div className="stat-foot">PRs + Issues</div>
            </div>
            <div className="stat-card" style={{ ["--accent" as any]: "var(--c-inference)" }}>
              <div className="stat-label">Pull Requests</div>
              <div className="stat-num">{fmtNum(stats.prs)}</div>
              <div className="stat-foot">{stats.open} open · {stats.merged} merged</div>
            </div>
            <div className="stat-card" style={{ ["--accent" as any]: "var(--c-feature)" }}>
              <div className="stat-label">Issues</div>
              <div className="stat-num">{fmtNum(stats.issues)}</div>
              <div className="stat-foot">{stats.closed} closed</div>
            </div>
            <div className="stat-card" style={{ ["--accent" as any]: "var(--c-direction)" }}>
              <div className="stat-label">Standout</div>
              <div className="stat-num">{fmtNum(stats.feat)}</div>
              <div className="stat-foot">score ≥ 70</div>
            </div>
            <div className="stat-card" style={{ ["--accent" as any]: "var(--c-training)" }}>
              <div className="stat-label">By Focus</div>
              <div className="focus-bars">
                {FOCUS_ORDER.map(f => (
                  <span key={f} title={f}
                    style={{ background: FOCUS_COLOR[f], width: `${(focusDist[f] / Math.max(1, stats.total)) * 100}%`, minWidth: 6 }} />
                ))}
              </div>
              <div className="stat-foot">{focusDist.inference}·{focusDist.training}·{focusDist.direction}</div>
            </div>
          </div>

          {/* repo cards */}
          <div className="repo-cards">
            {repoStats.map(r => (
              <div key={r.name} className={`repo-card ${repoFilter === r.name ? "active" : ""}`}
                onClick={() => setRepoFilter(r.name === repoFilter ? "all" : r.name)}>
                <div className="rc-top">
                  <span className="rc-dot" style={{ background: r.color }} />
                  <span className="rc-org">{r.org} /</span>
                </div>
                <div className="rc-name">{r.short}</div>
                <div className="rc-desc">{r.desc}</div>
                <div className="rc-stats">
                  <div><b>{r.count}</b><small>items</small></div>
                  <div><b>{r.thisWeek}</b><small>this wk</small></div>
                  <div><b>{r.authors}</b><small>authors</small></div>
                </div>
                <Bars values={r.bars} color={r.color} />
                <div className="rc-stars"><Ico d={IC.star} size={10} /> {fmtNum(r.stars)} · {r.lang}</div>
              </div>
            ))}
          </div>

          {/* filter panel */}
          <div className="panel">
            <div className="panel-row">
              <span className="panel-label">Category</span>
              <div className="chips">
                {CAT_ORDER.map(c => (
                  <span key={c} className={`chip ${catFilter.has(c) ? "active" : ""}`} onClick={() => toggleCat(c)}>
                    <span className="chip-dot" style={{ background: CAT_COLOR[c] }} />#{c}
                  </span>
                ))}
              </div>
            </div>
            <div className="panel-row">
              <span className="panel-label">State</span>
              <div className="chips">
                {([["all", "Any"], ["open", "Open"], ["merged", "Merged"], ["closed", "Closed"]] as const).map(([v, l]) => (
                  <span key={v} className={`chip ${stateFilter === v ? "active" : ""}`} onClick={() => setStateFilter(v)}>{l}</span>
                ))}
              </div>
            </div>
          </div>

          {/* content by view */}
          {view !== "weekly" && (
            <>
              <div className="section-head">
                <div className="section-title">
                  {view === "overview" && <>Latest <span className="accent">activity</span></>}
                  {view === "daily" && <>Daily <span className="accent">digest</span></>}
                  {view === "monthly" && <>Monthly <span className="accent">digest</span></>}
                </div>
                <span className="result-count">
                  {filtered.length > visible
                    ? `showing ${visible} of ${filtered.length}`
                    : `${filtered.length} items`}
                </span>
              </div>
              <hr className="glow-divider" />
            </>
          )}

          {filtered.length === 0 && (
            <div className="empty">No items match the current filters.</div>
          )}

          {/* OVERVIEW */}
          {view === "overview" && filtered.length > 0 && (
            display === "cards"
              ? <div className="cards">
                  {shown.map(it => <ItemCard key={it.id} it={it} />)}
                </div>
              : <div className="tbl-wrap"><table className="tbl">
                  <thead><tr>
                    <th></th><th>Title</th><th>Repo</th><th>Cat</th><th>Focus</th><th>State</th><th>Author</th><th>Created</th>
                  </tr></thead>
                  <tbody>{shown.map(it => <ItemRow key={it.id} it={it} />)}</tbody>
                </table></div>
          )}

          {/* DAILY */}
          {view === "daily" && bucketNodes(groupByDay(filtered), (b, shown, total) => (
            <div className="bucket-head">
              <span className="bucket-date">{FMT_DAY.format(b.date!)}</span>
              {new Date().toDateString() === b.date!.toDateString() && <span className="bucket-today">today</span>}
              <span className="bucket-meta">{total > shown ? `${shown} / ${total} shown` : `${total} items`}</span>
              <div className="bucket-bars">
                {hourlyBars(b.items).map((v, i) => <span key={i} style={{ height: `${Math.max(10, v * 100)}%` }} />)}
              </div>
            </div>
          ))}

          {/* WEEKLY */}
          {view === "weekly" && bucketNodes(groupByWeek(filtered), (b, shown, total) => (
            <div className="bucket-head">
              <span className="bucket-date">{b.key}</span>
              <span className="bucket-meta">{total > shown ? `${shown} / ${total} shown` : `${isoWeekRange(b.key)} · ${total} items`}</span>
            </div>
          ))}

          {/* MONTHLY */}
          {view === "monthly" && bucketNodes(groupByMonth(filtered), (b, shown, total) => (
            <div className="bucket-head">
              <span className="bucket-date">{FMT_MONTH.format(b.date!)}</span>
              <span className="bucket-meta">{total > shown ? `${shown} / ${total} shown` : `${total} items`}</span>
            </div>
          ))}

          {/* Load more — extends the rendered-item budget for any view */}
          {visible < filtered.length && (
            <div className="load-more-wrap">
              <button className="pill load-more" onClick={() => setVisible(v => v + RENDER_CAP)}>
                Load more ({filtered.length - visible} more)
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* tiny per-day hour distribution for the daily bucket bars */
function hourlyBars(items: FeedItem[]) {
  const buckets = new Array(6).fill(0);
  items.forEach(it => {
    const h = new Date(it.created_at).getHours();
    buckets[Math.min(5, Math.floor(h / 4))]++;
  });
  const max = Math.max(...buckets, 1);
  return buckets.map(b => b / max);
}
