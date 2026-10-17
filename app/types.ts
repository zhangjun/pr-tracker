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

export interface WeeklyDigest {
  week: string;
  range: string;
  total: number;
  prs: number;
  issues: number;
  by_focus: Record<FocusKey, number>;
  top_repos: { repo: string; count: number }[];
  top: DigestItem[];
  direction: DigestItem[];
  narrative: string;
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
