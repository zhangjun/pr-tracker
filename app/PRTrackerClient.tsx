"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FeedData, FeedItem, FocusKey, CatKey, WeeklyDigest } from "./types";

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
function isoWeekRange(label: string): string {
  const m = label.match(/W(\d+)/i);
  if (!m) return "";
  const w = parseInt(m[1]);
  const y = new Date().getFullYear();
  const jan1 = new Date(y, 0, 1);
  const dow = jan1.getDay() || 7;
  const mon1 = new Date(y, 0, 1 - (dow - 1));
  const start = new Date(mon1); start.setDate(mon1.getDate() + (w - 1) * 7);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return `${FMT.format(start)} – ${FMT.format(end)}`;
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
          {it.discussion && it.discussion.length > 0 && (
            <span className="discuss-badge" title={`${it.discussion.length} discussion comment${it.discussion.length > 1 ? 's' : ''}`}>
              <Ico d={IC.comment} size={10} /> {it.discussion.length}
            </span>
          )}
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

/* ── weekly illustrated digest ────────────────────────────────────────────────── */
const DIGEST_FOCUS: FocusKey[] = ["inference", "training", "direction", "general"];
const DIGEST_COLOR: Record<FocusKey, string> = {
  inference: "var(--c-inference)", training: "var(--c-training)",
  direction: "var(--c-direction)", general: "var(--c-general)",
};

function WeeklyDigestPanel({ d, compact }: { d: WeeklyDigest; compact?: boolean }) {
  const total = Math.max(1, d.total);
  return (
    <div className="digest">
      <div className="digest-head">
        <div>
          <div className="digest-kicker">WEEKLY DIGEST · {d.week}</div>
          <div className="digest-range">
            {d.range} · {d.total} items · PR {d.prs} · Issue {d.issues}
          </div>
        </div>
        <div className="legend">
          {DIGEST_FOCUS.map(f => (
            <span key={f} className="legend-item">
              <span className="legend-dot" style={{ background: DIGEST_COLOR[f] }} />{f}
            </span>
          ))}
        </div>
      </div>

      <p className="digest-narrative">{d.narrative}</p>

      <div className="digest-bar">
        {DIGEST_FOCUS.map(f => {
          const pct = (d.by_focus[f] / total) * 100;
          return (
            <span key={f} title={`${f}: ${d.by_focus[f]}`}
              style={{ width: `${pct}%`, background: DIGEST_COLOR[f] }} />
          );
        })}
      </div>

      {d.top_repos.length > 0 && (
        <div className="digest-repos">
          {d.top_repos.map(r => (
            <span key={r.repo} className="digest-repo">
              {r.repo.split("/")[1]} <b>{r.count}</b>
            </span>
          ))}
        </div>
      )}

      {!compact && (
        <>
          <div className="digest-section-title">Top PRs this week</div>
          <div className="digest-top">
            {d.top.map(t => (
              <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                className="digest-top-card" data-focus={t.focus}>
                <div className="dt-top">
                  <span className="dt-score" style={{ color: scoreColor(t.score) }}>{t.score}</span>
                  <span className="dt-repo">{t.repo.split("/")[1]} #{t.number}</span>
                  <span className="dt-focus" style={{ background: DIGEST_COLOR[t.focus], color: "#fff" }}>{t.focus}</span>
                </div>
                <div className="dt-title">{t.title}</div>
                <div className="dt-summary">{t.summary}</div>
                <div className="dt-author">@{t.author}</div>
              </a>
            ))}
          </div>

          {d.direction.length > 0 && (
            <>
              <div className="digest-section-title">Direction &amp; Evolution</div>
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
    fetch("/data/data.json", { cache: "no-cache" })
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
      const d = new Date(it.created_at);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((+d - +jan1) / 86400000 + jan1.getDay()) / 7);
      const key = `${d.getFullYear()}-W${week}`;
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
          {data?.weekly_digest && view === "weekly" && <WeeklyDigestPanel d={data.weekly_digest} />}
          {data?.weekly_digest && view === "overview" && <WeeklyDigestPanel d={data.weekly_digest} compact />}

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
