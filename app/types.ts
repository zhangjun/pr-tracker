export type FocusKey = "inference" | "training" | "direction" | "general";
export type CatKey =
  | "perf" | "bugfix" | "feature" | "infra" | "doc" | "refactor" | "unknown";
export type ItemType = "pr" | "issue";
export type ItemState = "open" | "closed" | "merged";

export interface RepoMeta {
  name: string;
  org: string;
  short: string;
  desc: string;
  lang: string;
  stars: number;
  html_url: string;
  domain: "inference" | "training" | "general";
}

export interface FeedItem {
  id: string;
  repo: string;
  number: number;
  type: ItemType;
  title: string;
  state: ItemState;
  author: string;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
  merged_at: string | null;
  url: string;
  labels: string[];
  category: CatKey;
  focus: FocusKey;
  focus_label: string;
  cat_label: string;
  summary: string;
  summary_source?: "llm" | "heuristic";
  body: string;
  discussion?: string[];
  comments: number;
  reactions: number;
  additions: number;
  deletions: number;
  changed_files: number;
  value: number;
  score: number;
  tags: string[];
  subsystems: string[];
  diff_preview: null;
}

export interface DigestItem {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  score: number;
  focus: FocusKey;
  summary: string;
}

export interface DigestRepoCount {
  repo: string;
  count: number;
  /** days of data actually observed for this repo in the snapshot */
  days?: number;
  /** items per observed day — the only fair cross-repo comparison */
  per_day?: number;
}

export interface DigestModule {
  name: string;
  count: number;
  /** repos contributing to this module, busiest first */
  repos: string[];
  trend: "up" | "flat" | "down" | "new";
  note: string;
}

export interface DigestKeyPr {
  repo: string;
  number: number;
  /** why this one is worth reading — present only for LLM-written digests */
  why?: string;
}

export interface DigestInsight {
  source: "llm" | "heuristic";
  /** 本周重点 — 3–4 sentences of editorial judgement */
  focus: string[];
  /** 功能模块与开发趋势 */
  modules: DigestModule[];
  /** 重点 PR */
  key_prs: DigestKeyPr[];
}

export interface WeeklyDigest {
  week: string;
  range: string;
  total: number;
  prs: number;
  issues: number;
  by_focus: Record<FocusKey, number>;
  top_repos: DigestRepoCount[];
  top: DigestItem[];
  direction: DigestItem[];
  narrative: string;

  /* ── completeness: a week in progress must not be read as a finished one ── */
  /** false while the ISO week is still running */
  complete?: boolean;
  /** 1–7 days elapsed in the week */
  days_elapsed?: number;
  /** ISO timestamp the digest was computed at */
  as_of?: string;
  /** total / days_elapsed */
  per_day?: number;

  /* ── outcome side (created-only digests hide delivery) ── */
  merged?: number;
  closed?: number;

  /* ── how many direction items exist vs how many are shown ── */
  direction_total?: number;

  /* ── snapshot coverage: per-repo caps make raw totals incomparable ── */
  coverage_partial?: boolean;
  coverage_note?: string;

  /* ── editorial layer: prose, not statistics ── */
  insight?: DigestInsight;
}

export interface FeedData {
  last_updated: string;
  window_days: number;
  repos: RepoMeta[];
  focus_labels: Record<FocusKey, string>;
  cat_labels: Record<CatKey, string>;
  weekly_digest?: WeeklyDigest;
  items: FeedItem[];
}
