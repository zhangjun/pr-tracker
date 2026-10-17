#!/usr/bin/env python3
"""
AI Infra PR/Issue Tracker — data collector
=========================================
Pulls real Pull Requests and Issues from the tracked AI-infra repos via the
GitHub CLI (`gh`, which handles auth + token), heuristically tags each item by
FOCUS (inference / training / direction / general) and CATEGORY, then writes
`public/data/data.json`.

Usage:
    python collect.py                 # incremental-ish full refresh of last 120d
    python collect.py --days 30       # only last 30 days
    python collect.py --pr 120 --issue 80
    python collect.py --repos vllm-project/vllm sgl-project/sglang   # subset

    python collect.py --llm           # + LLM summaries/classification
    python collect.py --llm --llm-limit 100   # only the top-100 by score
    python collect.py --llm-check     # test the endpoint, then exit

Classification is rule-based and needs no API key. Passing `--llm` additionally
refines summary / category / focus / score / tags through any
OpenAI-compatible `POST /v1/chat/completions` endpoint, configured via
OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL (or a `.env` file).
Without `--llm` the run is fully offline except for the GitHub API.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode

# ── minimal .env loader (no external dependency) ───────────────────────────────
_DOTENV_LOADED = False


def _load_dotenv() -> None:
    """Load KEY=VALUE pairs from <project>/.env into os.environ (once)."""
    global _DOTENV_LOADED
    if _DOTENV_LOADED:
        return
    _DOTENV_LOADED = True
    p = Path(__file__).parent / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


# ── tracked repos ──────────────────────────────────────────────────────────────
DEFAULT_REPOS = [
    "vllm-project/vllm",        # inference / serving
    "sgl-project/sglang",       # inference / serving
    "verl-project/verl",        # RL training
    "vllm-project/vime",        # post-training / RL scaling (built on slime)
    "THUDM/slime",              # RL training framework
    "NVIDIA/Megatron-LM",       # large-scale training
    "NVIDIA/TensorRT-LLM",      # inference optimisation
]

# repo → primary domain (for display only; items carry their own focus)
REPO_DOMAIN = {
    "vllm-project/vllm": "inference",
    "sgl-project/sglang": "inference",
    "verl-project/verl": "training",
    "vllm-project/vime": "training",
    "THUDM/slime": "training",
    "NVIDIA/Megatron-LM": "training",
    "NVIDIA/TensorRT-LLM": "inference",
}

# ── keyword vocabularies ────────────────────────────────────────────────────────
# Weighted keyword dicts. Higher weight = stronger, more unambiguous signal.
# Deliberately EXCLUDES generic terms (kernel, moe, expert, attention, batch,
# nvidia, engine) that appear in both training and inference code and used to
# bias every Megatron PR toward "inference".
FOCUS_RULES = {
    "inference": {
        # serving / batching
        "serving": 2, "inference": 2, "throughput": 2, "latency": 2,
        "continuous batching": 3, "scheduler": 1, "router": 1,
        # prefill / decode / kv
        "prefill": 3, "decode": 2, "kv cache": 3, "kv-cache": 3, "kv pool": 3,
        "kv transfer": 3, "prefix cache": 3, "paged attention": 3, "pagedatten": 3,
        "chunked prefill": 3, "radix": 2,
        # speculative
        "speculative": 2, "speculative decoding": 3, "eagle": 2, "medusa": 2,
        "ngram": 1, "verification": 1,
        # attention / model internals
        "attention backend": 3, "flash attention": 3, "flash attn": 3,
        "attention dp": 3, "dp attention": 3, "mla": 2, "gqa": 2, "qkv": 1,
        "rope": 1, "rotary": 1, "rmsnorm": 1, "logits": 1, "sampling": 1,
        # precision / quantization
        "quantiz": 1, "fp8": 2, "fp4": 2, "int8": 2, "int4": 2, "nvfp4": 2,
        "awq": 2, "gptq": 2,
        # engines / kernels / parallelism at serve time
        "tensorrt": 3, "trt-llm": 3, "cuda graph": 2, "fused": 1, "fuse": 1,
        "disaggregat": 2, "disagg": 2,
    },
    "training": {
        "training": 2, "trainer": 2, "optimizer": 3, "backward": 3, "gradient": 3,
        "dpo": 3, "ppo": 3, "rlhf": 3, "sft": 3, "grpo": 3, "reinforce": 2,
        "reward model": 3, "actor": 2, "critic": 2, "rollout": 2,
        "fsdp": 3, "deepspeed": 3, "megatron": 2, "pipeline parallel": 3,
        "tensor parallel": 2, "context parallel": 3, "sequence parallel": 3,
        "expert parallel": 3, "data parallel": 2, "model parallel": 2,
        "checkpoint": 2, "reshard": 3, "offload": 2, "lora": 2, "distill": 2,
        "colocate": 2, "aux-loss": 3, "aux loss": 3, "compute graph": 3,
        "all-to-all": 3, "all to all": 3, "dispatcher": 2,
        "post-train": 3, "posttrain": 3, "reinforcement learning": 3,
        "verl": 2,
        # training-only systems terms (counter-balance generic "fused"/"fp8")
        "adam": 3, "adamw": 3, "nccl": 3, "all-reduce": 3, "all-gather": 3,
        "reduce-scatter": 3, "zero": 2, "mixed precision": 2,
        "gradient accumulation": 3, "optimizer state": 3, "distributed training": 3,
        "learning rate": 2, "warmup": 1, "batch size": 1,
    },
}

# direction is title/label-only — body prose ("plan", "future", "experimental")
# is far too noisy and used to misfire on ordinary CI/doc PRs.
# NOTE: "vision" (multimodal context) and "deprecat" (maintenance) are excluded —
# they caused false positives on vision-tower and deprecation PRs.
DIRECTION_RE = re.compile(
    r"(?i)\b(rfc|roadmap|proposal|design[- ]doc|tracking[- ]issue|epic|blueprint|direction)\b"
)
DIRECTION_LABELS = {"rfc", "proposal", "roadmap", "design-doc", "tracking-issue", "epic", "direction"}

# repo-domain prior, used ONLY to break near-ties (score gap <= 3)
REPO_FOCUS_PRIOR = {
    "vllm-project/vllm": "inference",
    "sgl-project/sglang": "inference",
    "NVIDIA/TensorRT-LLM": "inference",
    "verl-project/verl": "training",
    "vllm-project/vime": "training",
    "THUDM/slime": "training",
    "NVIDIA/Megatron-LM": "training",
}

CAT_RULES = {
    "perf": ["perf", "performance", "speed", "optimi", "faster", "latency",
             "throughput", "bottleneck", "accelerat", "efficient", "speedup",
             "speed-up", "speed up", "reduce", "improved", "boost"],
    "bugfix": ["bug", "fix", "error", "crash", "exception", "hotfix", "broken",
               "incorrect", "regression", "fail", "panic", "segfault", "undefined"],
    "feature": ["feature", "add ", "support", "implement", "introduce", "new ",
                "enable", "allow", "expose", "add support", "feat:"],
    "infra": ["ci", "build", "docker", "dependency", "dependabot", "test",
              "packaging", "release", "workflow", "github action", "makefile",
              "setup", "pyproject", "pre-commit"],
    "doc": ["doc", "readme", "comment", "typo", "docs", "documentation"],
    "refactor": ["refactor", "cleanup", "clean up", "simplif", "restructure",
                 "rename", "reorgani", "migrate", "moderni"],
}

FOCUS_LABELS = {
    "inference": "Inference Optimization (推理优化)",
    "training": "Training Optimization (训练优化)",
    "direction": "Direction & Evolution (方向演进)",
    "general": "General (通用)",
}
CAT_LABELS = {
    "perf": "Performance", "bugfix": "Bugfix", "feature": "Feature",
    "infra": "Infra/CI", "doc": "Docs", "refactor": "Refactor",
    "unknown": "Other",
}


# ── gh helpers ──────────────────────────────────────────────────────────────────
def gh(endpoint: str, params: dict | None = None, jq: str = ".[]") -> list[dict]:
    """Fetch one page of a GitHub REST endpoint via `gh api` (GET).

    `params` are appended as a URL query string (gh switches to POST when
    given -f form fields, which breaks GET list endpoints).
    `jq` selects what to emit per line (default ".[]" for list endpoints).
    Use jq="." to fetch a single JSON object.
    """
    url = endpoint
    if params:
        sep = "&" if "?" in url else "?"
        url = url + sep + urlencode(params)
    cmd = ["gh", "api", url, "--jq", jq]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"gh error on {url}: {out.stderr.strip()[:200]}")
    items = []
    for line in out.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return items


def fetch_pages(endpoint: str, per_page: int, max_items: int, since: datetime,
                sleep: float = 0.25) -> list[dict]:
    """Paginate an endpoint (newest first) until `since` or `max_items`."""
    results: list[dict] = []
    page = 1
    while len(results) < max_items:
        try:
            batch = gh(endpoint, {"per_page": per_page, "page": page,
                                  "sort": "created", "direction": "desc",
                                  "state": "all"})
        except RuntimeError as e:
            print(f"   ! {e}")
            break
        if not batch:
            break
        for it in batch:
            results.append(it)
            ca = it.get("created_at")
            if ca:
                try:
                    ct = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                    if ct < since:
                        return results[:max_items]
                except ValueError:
                    pass
        if len(batch) < per_page:
            break
        if len(results) >= max_items:
            break
        page += 1
        time.sleep(sleep)
    return results[:max_items]


def fetch_comments(repo: str, number: int, max_comments: int = 3) -> list[str]:
    """Fetch the top N comment bodies for a PR/issue."""
    try:
        comments = gh(f"repos/{repo}/issues/{number}/comments",
                      {"per_page": max_comments, "sort": "created", "direction": "desc"})
        bodies = []
        for c in comments:
            b = c.get("body", "")
            if isinstance(b, str) and len(b.strip()) > 10:
                bodies.append(b.strip())
        return bodies[:max_comments]
    except RuntimeError:
        return []


# ── categorisation ──────────────────────────────────────────────────────────────
def label_names(item: dict) -> list[str]:
    out = []
    for l in (item.get("labels") or []):
        if isinstance(l, dict):
            out.append(l.get("name", "") or "")
        else:
            out.append(str(l))
    return [x for x in out if x]


def body_text(item: dict) -> str:
    b = item.get("body")
    return b if isinstance(b, str) else ""


def _text_of(item: dict) -> str:
    parts = [item.get("title") or "", " ".join(label_names(item)), body_text(item)[:900]]
    return " ".join(parts).lower()


def classify_focus(item: dict, repo: str | None = None) -> str:
    """Weighted focus classification.

    - direction: title / label only (RFC, roadmap, proposal, …)
    - inference vs training: weighted keyword scoring
        title hit  × 3, label hit × 2, body hit × 1
    - strong signal (>= 6) wins outright (repo prior only breaks near-ties)
    - weak signal: non-technical work (CI / docs) → general,
      otherwise fall back to the repo's domain
    """
    title = (item.get("title") or "").strip()
    labels = " ".join(label_names(item)).lower()

    # direction — explicit, unambiguous signals only
    if DIRECTION_RE.search(title):
        return "direction"
    if any(w in labels for w in DIRECTION_LABELS):
        return "direction"

    title_l = title.lower()
    body_l = body_text(item)[:1200].lower()
    scores = {"inference": 0, "training": 0}
    for focus, kws in FOCUS_RULES.items():
        for kw, w in kws.items():
            if kw in title_l:
                scores[focus] += w * 3
            if kw in labels:
                scores[focus] += w * 2
            if kw in body_l:
                scores[focus] += w

    best = max(scores, key=scores.get)
    other = "training" if best == "inference" else "inference"
    prior = REPO_FOCUS_PRIOR.get(repo) if repo else None

    # strong keyword evidence → trust it (prior only flips a close call)
    if scores[best] >= 6:
        if prior == other and scores[best] - scores[other] <= 3:
            return other
        return best

    # no technical signal at all → CI / docs / deps / chore are "general"
    if scores[best] == 0:
        if classify_cat(item) in ("infra", "doc"):
            return "general"
        return prior or "general"

    # weak but real signal → keep the technical focus (prior breaks near-ties)
    if prior == other and scores[best] - scores[other] <= 1:
        return other
    return best


def classify_cat(item: dict) -> str:
    labels = " ".join(label_names(item)).lower()
    t = _text_of(item)
    if any(w in labels for w in ["bug", "fix", "regression"]):
        return "bugfix"
    if any(w in labels for w in ["perf", "performance", "optimization",
                                 "optimisation", "speedup", "speed-up"]):
        return "perf"
    if any(w in labels for w in ["doc", "documentation"]):
        return "doc"
    if any(w in labels for w in ["ci", "build", "infra", "dependencies", "dependency"]):
        return "infra"
    scores = {k: sum(t.count(kw) for kw in kws) for k, kws in CAT_RULES.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "unknown"


# ── explainable importance score (0-100) ────────────────────────────────────────
LABEL_WEIGHT = {
    "priority": 16, "high priority": 16, "high-priority": 16, "critical": 16,
    "urgent": 14, "p0": 16, "p1": 12, "rfc": 18, "proposal": 16, "design": 14,
    "roadmap": 15, "perf": 12, "performance": 12, "optimize": 12, "optimization": 12,
    "speed": 10, "feature": 10, "enhancement": 10, "feat": 10, "bug": 8, "fix": 8,
    "ci": 4, "build": 4, "infra": 4, "test": 4, "docs": 0, "doc": 0, "chore": 0,
}
FOCUS_WEIGHT = {"direction": 14, "inference": 8, "training": 8, "general": 0}
PRIORITY_HINTS = ["priority", "high", "critical", "urgent", "p0", "p1", "rfc",
                  "proposal", "roadmap", "important", "blocker"]


def compute_score(item: dict, focus: str) -> int:
    # base — structural signals dominate because PR comments/reactions are often 0
    s = 30
    s += min(_reaction_count(item) * 2, 10)
    s += min((item.get("comments", 0) or 0) * 0.4, 10)
    # label weight (strongest match wins)
    lw = 0
    for lab in label_names(item):
        ll = lab.lower()
        if ll in LABEL_WEIGHT:
            lw = max(lw, LABEL_WEIGHT[ll])
        else:
            for key, w in LABEL_WEIGHT.items():
                if key in ll:
                    lw = max(lw, w)
    s += lw
    s += FOCUS_WEIGHT.get(focus, 0)
    # recency
    try:
        age_d = (datetime.now(timezone.utc) - datetime.fromisoformat(
            (item.get("created_at") or "").replace("Z", "+00:00"))).days
    except (ValueError, TypeError):
        age_d = 999
    if age_d <= 7:
        s += 14
    elif age_d <= 30:
        s += 7
    # diff size as an impact proxy
    add = item.get("additions", 0) or 0
    if add >= 5000:
        s += 6
    elif add >= 1000:
        s += 12
    elif add >= 50:
        s += 8
    if add > 25000:
        s -= 6
    return max(1, min(100, int(s)))


def compute_value(item: dict, focus: str) -> int:
    return max(1, min(5, round(compute_score(item, focus) / 20)))


def _tidy_summary(s: str) -> str:
    """Collapse the whitespace/empty-bracket debris left by link stripping."""
    s = s or ""
    s = re.sub(r"\(\s*[,;:]?\s*\)", "", s)      # "( )", "()", "(,)"
    s = re.sub(r"\[\s*\]", "", s)               # "[ ]"
    s = re.sub(r"\s+([,.;:])", r"\1", s)        # space before punctuation
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def extract_summary(body: str, title: str, comment_bodies: list[str] | None = None) -> str:
    """Best-effort summary combining body + discussion comments.

    Strategy:
      1. Try to find key sections (Summary, Description, Motivation, What, Why, Changes)
      2. If found, extract 1-2 substantive sentences from that section
      3. Otherwise, extract first 2-3 substantive sentences from the full body
      4. If comments exist and add insight, incorporate a concise note
      5. Fallback to title
    """
    title = title.strip()
    body = (body or "").strip()

    # ── 1. Try key markdown sections ──────────────────────────────────────────
    section_patterns = [
        r"(?i)(?:^|\n)#{1,3}\s*summary\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
        r"(?i)(?:^|\n)#{1,3}\s*description\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
        r"(?i)(?:^|\n)#{1,3}\s*motivation\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
        r"(?i)(?:^|\n)#{1,3}\s*what\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
        r"(?i)(?:^|\n)#{1,3}\s*why\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
        r"(?i)(?:^|\n)#{1,3}\s*changes\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
        r"(?i)(?:^|\n)#{1,3}\s*overview\s*\n+(.+?)(?:\n+#{1,3}\s|\Z)",
    ]
    section_text = ""
    for pat in section_patterns:
        m = re.search(pat, body, re.S)
        if m:
            section_text = m.group(1).strip()
            break

    # ── helper: pull real sentences out of markdown ───────────────────────────
    def _sentences(text: str, min_len: int = 25, max_count: int = 3) -> list[str]:
        """Extract sentences that look like real prose (not code / checklists / links)."""
        # strip code blocks, inline code, images, tables
        text = re.sub(r"```[\s\S]*?```", " ", text)
        text = re.sub(r"`[^`]+`", " ", text)
        text = re.sub(r"!?\[[^\]]*\]\([^)]+\)", " ", text)
        text = re.sub(r"\|[^\n]*\|", " ", text)          # tables
        text = re.sub(r"\s+", " ", text).strip()
        parts = re.split(r"(?<=[.!?])\s+", text)
        out = []
        for p in parts:
            p = p.strip()
            if len(p) < min_len:
                continue
            # skip markdown artifacts / checklist lines / bare URLs
            if p.startswith((">", "- [", "[", "#", "!", "|", "*", "-", "1.", "2.")):
                continue
            if p.count("http") > 1:
                continue
            if len(re.sub(r"[^a-zA-Z]", "", p)) < 12:
                continue
            out.append(p)
            if len(out) >= max_count:
                break
        return out

    # ── 2. Build summary from body ────────────────────────────────────────────
    sents: list[str] = []
    if section_text:
        sents = _sentences(section_text, min_len=20, max_count=2)
    if not sents:
        sents = _sentences(body, min_len=30, max_count=2)

    summary = " ".join(sents)

    # ── 3. Incorporate comment insight (if it adds something new) ─────────────
    if comment_bodies and summary:
        for cb in comment_bodies:
            cs = _sentences(cb, min_len=20, max_count=1)
            if cs and cs[0].lower() not in summary.lower():
                # append a short "[Discussion: …]" note
                note = cs[0][:100]
                if len(summary) + len(note) < 250:
                    summary += f" [Discussion: {note}]"
                break
    elif comment_bodies and not summary:
        for cb in comment_bodies:
            cs = _sentences(cb, min_len=20, max_count=1)
            if cs:
                summary = cs[0]
                break

    # ── 4. Fallback ───────────────────────────────────────────────────────────
    if not summary:
        summary = title

    # ── 5. Clean & trim ───────────────────────────────────────────────────────
    summary = re.sub(r"\*\*|\*|__|_|`", "", summary)
    summary = _tidy_summary(summary)
    return (summary[:260] + "…") if len(summary) > 260 else summary


TOPIC_TAGS = [
    ("MoE", ["moe", "mixture of experts", "expert parallel"]),
    ("Speculative", ["speculative", "eagle", "medusa"]),
    ("Quantization", ["quantiz", "awq", "gptq", "fp8", "int8", "int4", "nvfp4"]),
    ("KV-Cache", ["kv cache", "kv-cache", "pagedatten", "prefix cache"]),
    ("Attention", ["flash attn", "flashatten", "attention", "varlen"]),
    ("CUDA/Kernel", ["cuda", "triton", "kernel", "cutlass"]),
    ("Scheduler", ["scheduler", "continuous batch", "chunked"]),
    ("Disaggregation", ["disaggregat", "prefill-decode", "pd disag"]),
    ("Router", ["router", "routing"]),
    ("FSDP", ["fsdp", "fully sharded"]),
    ("Pipeline", ["pipeline parallel", " pp ", "stage"]),
    ("TensorParallel", ["tensor parallel", " tp "]),
    ("Checkpoint", ["checkpoint", "reshard"]),
    ("Rollout", ["rollout"]),
    ("GRPO/PPO", ["grpo", "ppo", "reinforce", "rlhf", "reward"]),
    ("LoRA", ["lora", "qlora", "peft"]),
    ("Distillation", ["distill"]),
    ("Multimodal", ["multimodal", "vision", "mllm", "vl "]),
]


def extract_tags(item: dict) -> list[str]:
    t = _text_of(item)
    tags: list[str] = []
    for name, kws in TOPIC_TAGS:
        if any(k in t for k in kws):
            tags.append(name)
    for lab in label_names(item):
        if any(p in lab.lower() for p in PRIORITY_HINTS) and lab not in tags:
            tags.append(lab)
    seen = set()
    out = []
    for x in tags:
        if x.lower() not in seen:
            seen.add(x.lower())
            out.append(x)
    return out[:6]


# ── LLM enrichment via OpenAI-compatible /v1/chat/completions ────────────────────
_PLACEHOLDER_HINTS = ("your-key", "your_key", "sk-your", "changeme", "xxx", "<", "todo")


def llm_config() -> dict | None:
    """Resolve an OpenAI-compatible endpoint from the environment.

    Accepted variables (first hit wins):
      base : OPENAI_BASE_URL | OPENAI_API_BASE | AIT_LLM_BASE_URL
      key  : OPENAI_API_KEY  | AIT_LLM_KEY
      model: OPENAI_MODEL    | AIT_LLM_MODEL

    Returns None when unset *or* still holding the `.env.example` placeholders,
    so an un-edited `.env` never triggers a doomed request.
    """
    _load_dotenv()
    base = (os.environ.get("OPENAI_BASE_URL")
            or os.environ.get("OPENAI_API_BASE")
            or os.environ.get("AIT_LLM_BASE_URL"))
    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("AIT_LLM_KEY")
    model = os.environ.get("OPENAI_MODEL") or os.environ.get("AIT_LLM_MODEL")
    if not (base and key and model):
        return None
    if any(h in key.lower() for h in _PLACEHOLDER_HINTS):
        return None
    return {"base": base.rstrip("/"), "key": key, "model": model}


def _chat_url(base: str) -> str:
    """Normalise a base URL to the chat-completions endpoint.

    Handles: https://api.openai.com, .../v1, .../v1/, .../v1/chat/completions
    """
    b = base.rstrip("/")
    if b.endswith("/chat/completions"):
        return b
    if not b.endswith("/v1"):
        b += "/v1"
    return b + "/chat/completions"


LLM_SYSTEM = (
    "You are a senior AI-infrastructure engineer analysing GitHub pull requests "
    "and issues. You always answer with a single strict JSON object and no prose."
)

LLM_INSTRUCTION = (
    "Given one GitHub PR/issue (title, labels, description, discussion), return a "
    "strict JSON object with exactly these keys:\n"
    '  "summary": one concise technical sentence (<= 30 words) that captures the '
    "actual change or problem, not a restatement of the title.\n"
    '  "category": one of perf|bugfix|feature|infra|doc|refactor|unknown\n'
    '  "focus": one of inference|training|direction|general\n'
    '  "score": integer 0-100 = importance to the AI-infra community\n'
    '  "tags": array of <= 4 short topic tags (e.g. "KV-Cache", "MoE", "FP8")\n'
    "Rules:\n"
    "- focus MUST be \"direction\" when the title marks the item as an RFC, "
    "proposal, roadmap, design doc, tracking issue, epic, or blueprint. "
    "\"direction\" outranks inference/training for those items.\n"
    "- Otherwise focus is \"inference\" for serving/inference work, \"training\" "
    "for training/RL/fine-tuning work, and \"general\" only when neither applies.\n"
    "Output JSON only."
)


def _build_user_prompt(item: dict) -> str:
    title = (item.get("title") or "").strip()
    labels = ", ".join(label_names(item)) or "none"
    body = body_text(item)[:1800]
    disc = item.get("discussion") or []
    disc_txt = "\n".join(f"- {d[:300]}" for d in disc[:3]) if disc else "none"
    return (f"TITLE: {title}\nLABELS: {labels}\n\n"
            f"DESCRIPTION:\n{body or '(empty)'}\n\n"
            f"DISCUSSION (top comments):\n{disc_txt}")


def _post_chat(cfg: dict, messages: list[dict], max_tokens: int,
               timeout: int = 45, retries: int = 4) -> dict:
    """POST to the chat-completions endpoint and return the raw JSON response.

    Retries transient failures (429 rate limits, 5xx, timeouts) with exponential
    backoff, honouring `Retry-After` when the server sends it. Non-retryable
    4xx responses (bad key, bad model) are raised immediately.
    """
    payload = {"model": cfg["model"], "messages": messages,
               "max_tokens": max_tokens, "temperature": 0.2}
    delay = 2.0
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                _chat_url(cfg["base"]),
                data=json.dumps(payload).encode(),
                headers={"Authorization": f"Bearer {cfg['key']}",
                         "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (408, 409, 425, 429, 500, 502, 503, 504):
                raise
            ra = (e.headers.get("Retry-After") if e.headers else "") or ""
            wait = float(ra) if ra.strip().replace(".", "", 1).isdigit() else delay
            time.sleep(min(wait, 45))
            delay = min(delay * 2, 45)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(min(delay, 45))
            delay = min(delay * 2, 45)
    raise last if last else RuntimeError("chat request failed")


def _extract_json(text: str) -> dict | None:
    """Pull the first {...} object out of a reply that may be fenced or padded."""
    if not text:
        return None
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e < s:
        return None
    try:
        return json.loads(text[s:e + 1])
    except json.JSONDecodeError:
        return None


_LLM_LAST_ERR = ""


def llm_enrich(item: dict, cfg: dict, timeout: int = 45) -> dict | None:
    """Call an OpenAI-compatible /v1/chat/completions endpoint for one item.

    Reasoning models (e.g. `*-flash`, o-series) spend part of `max_tokens` on
    hidden reasoning before emitting content, so the budget starts generous and
    is doubled once if the reply came back empty or truncated.
    """
    global _LLM_LAST_ERR
    messages = [
        {"role": "system", "content": LLM_SYSTEM},
        {"role": "user", "content": LLM_INSTRUCTION + "\n\n" + _build_user_prompt(item)},
    ]
    for budget in (900, 1800):
        try:
            resp = _post_chat(cfg, messages, budget, timeout)
        except Exception as e:
            _LLM_LAST_ERR = f"{type(e).__name__}: {str(e)[:120]}"
            return None
        choice = (resp.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content") or ""
        parsed = _extract_json(text)
        if parsed:
            return parsed
        # truncated mid-JSON, or the whole budget went to reasoning → retry bigger
        if choice.get("finish_reason") != "length" and text.strip():
            _LLM_LAST_ERR = f"unparsable reply: {text[:100]!r}"
            return None
    _LLM_LAST_ERR = "empty or truncated reply after retry"
    return None


def enrich_with_llm(items: list[dict], cfg: dict, max_workers: int = 3,
                    limit: int = 0, checkpoint=None) -> list[dict]:
    """Enrich items in place. limit>0 → only the top-N items by current score.

    `checkpoint`, when given, is called with the item list every 25 successes so
    a long run over a rate-limited endpoint is not lost if it dies midway.
    """
    targets = (sorted(items, key=lambda x: -x.get("score", 0))[:limit]
               if limit and limit > 0 else items)
    total = len(targets)
    ok = 0

    def worker(it: dict) -> bool:
        r = llm_enrich(it, cfg)
        if not r:
            return False
        if r.get("focus") in FOCUS_LABELS:
            it["focus"] = r["focus"]; it["focus_label"] = FOCUS_LABELS[r["focus"]]
        if r.get("category") in CAT_LABELS:
            it["category"] = r["category"]; it["cat_label"] = CAT_LABELS[r["category"]]
        # `direction` is a deterministic signal — never let the model erode it
        # by re-reading an RFC as plain inference/training work.
        if (DIRECTION_RE.search(it.get("title") or "")
                or any(w in " ".join(label_names(it)).lower() for w in DIRECTION_LABELS)):
            it["focus"] = "direction"
            it["focus_label"] = FOCUS_LABELS["direction"]
        if isinstance(r.get("summary"), str) and r["summary"].strip():
            it["summary"] = _tidy_summary(r["summary"])[:280]
            it["summary_source"] = "llm"
        if isinstance(r.get("score"), (int, float)):
            it["score"] = max(1, min(100, int(r["score"])))
            it["value"] = max(1, min(5, round(it["score"] / 20)))
        if isinstance(r.get("tags"), list):
            it["tags"] = [str(t) for t in r["tags"]][:6]
        return True

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        for i, good in enumerate(ex.map(worker, targets), 1):
            ok += 1 if good else 0
            if i % 10 == 0 or i == total:
                print(f"   llm {i}/{total}  (ok {ok})", flush=True)
            if checkpoint and good and ok % 25 == 0:
                checkpoint(items)
    if ok < total and _LLM_LAST_ERR:
        print(f"   ! {total - ok} call(s) failed — last error: {_LLM_LAST_ERR}")
    return items


def llm_check(cfg: dict) -> bool:
    """One-shot connectivity test: send a tiny prompt, print the reply.

    `max_tokens` is deliberately not tiny — reasoning models burn the budget on
    hidden reasoning first and would otherwise answer with an empty string.
    """
    try:
        resp = _post_chat(cfg,
                          [{"role": "user", "content": "Reply with the single word: pong"}],
                          max_tokens=256, timeout=30)
        choice = (resp.get("choices") or [{}])[0]
        text = ((choice.get("message") or {}).get("content") or "").strip()
        reasoning = (choice.get("message") or {}).get("reasoning_content")
        usage = resp.get("usage") or {}
        kind = "reasoning" if reasoning else "chat"
        print(f"✓ endpoint OK — model={cfg['model']} ({kind}) "
              f"reply={text[:40]!r} tokens={usage.get('total_tokens', '?')}")
        return True
    except Exception as e:
        print(f"✗ endpoint check failed: {type(e).__name__}: {str(e)[:200]}")
        return False



# ── weekly digest ────────────────────────────────────────────────────────────────
def build_weekly_digest(items: list[dict]) -> dict | None:
    if not items:
        return None
    weeks: dict[tuple[int, int], list[dict]] = {}
    for it in items:
        try:
            d = datetime.fromisoformat((it.get("created_at") or "").replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        y, w, _ = d.isocalendar()
        weeks.setdefault((y, w), []).append(it)
    if not weeks:
        return None
    (y, w) = max(weeks.keys())
    wk = weeks[(y, w)]
    start = datetime.strptime(f"{y}-W{w}-1", "%G-W%V-%u")
    end = start + timedelta(days=6)
    rng = f"{start.strftime('%b %d')} – {end.strftime('%b %d')}"

    by_focus = {k: 0 for k in FOCUS_LABELS}
    for it in wk:
        by_focus[it["focus"]] = by_focus.get(it["focus"], 0) + 1
    repo_counts: dict[str, int] = {}
    for it in wk:
        repo_counts[it["repo"]] = repo_counts.get(it["repo"], 0) + 1
    top_repos = sorted(repo_counts.items(), key=lambda x: -x[1])[:5]

    def to_digest(it: dict) -> dict:
        return {"id": it["id"], "repo": it["repo"], "number": it["number"],
                "title": it["title"], "author": it["author"], "url": it["url"],
                "score": it["score"], "focus": it["focus"], "summary": it["summary"]}

    top = [to_digest(i) for i in sorted(wk, key=lambda x: -x["score"])[:6]]
    direction = [to_digest(i) for i in sorted(
        [i for i in wk if i["focus"] == "direction"], key=lambda x: -x["score"])[:4]]

    top_repo_str = ", ".join(f"{r.split('/')[1]} ({c})" for r, c in top_repos[:3])
    narrative = (
        f"本周（{rng}）共 {len(wk)} 条动态 —— "
        f"PR {sum(1 for i in wk if i['type'] == 'pr')} "
        f"· Issue {sum(1 for i in wk if i['type'] == 'issue')}。"
        f"推理优化 {by_focus['inference']} 条、训练优化 {by_focus['training']} 条、"
        f"方向演进 {by_focus['direction']} 条。"
        + (f"最活跃仓库：{top_repo_str}。" if top_repo_str else "")
        + (f"重点关注：{top[0]['title']}（{top[0]['repo'].split('/')[1]}）。" if top else "")
    )
    return {
        "week": f"{y}-W{w:02d}", "range": rng, "total": len(wk),
        "prs": sum(1 for i in wk if i["type"] == "pr"),
        "issues": sum(1 for i in wk if i["type"] == "issue"),
        "by_focus": by_focus,
        "top_repos": [{"repo": r, "count": c} for r, c in top_repos],
        "top": top, "direction": direction, "narrative": narrative,
    }


# ── main ────────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--pr", type=int, default=200, dest="pr_cap")
    ap.add_argument("--issue", type=int, default=120, dest="issue_cap")
    ap.add_argument("--repos", nargs="*", default=None)
    ap.add_argument("--llm", action="store_true",
                    help="enrich via an OpenAI-compatible endpoint "
                         "(OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL, or .env)")
    ap.add_argument("--llm-limit", type=int, default=200, dest="llm_limit",
                    help="with --llm, enrich only the top-N items by score (0 = all)")
    ap.add_argument("--llm-check", action="store_true", dest="llm_check",
                    help="test the OpenAI-compatible endpoint and exit")
    ap.add_argument("--no-digest", action="store_true", help="skip weekly digest")
    args = ap.parse_args()

    # one-shot endpoint connectivity test
    if args.llm_check:
        cfg = llm_config()
        if not cfg:
            print("✗ no LLM endpoint configured. Set OPENAI_BASE_URL / OPENAI_API_KEY "
                  "/ OPENAI_MODEL (or put them in .env).")
            sys.exit(1)
        print(f"→ checking {_chat_url(cfg['base'])}  model={cfg['model']}")
        sys.exit(0 if llm_check(cfg) else 1)

    repos = args.repos or DEFAULT_REPOS
    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    root = Path(__file__).parent
    out_dir = root / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    repo_meta: list[dict] = []
    items: list[dict] = []

    for repo in repos:
        print(f"\n▶ {repo}")
        # metadata
        try:
            meta = gh(f"repos/{repo}", jq=".")[0]
            repo_meta.append({
                "name": repo,
                "org": repo.split("/")[0],
                "short": repo.split("/")[1],
                "desc": (meta.get("description") or "")[:160],
                "lang": meta.get("language") or "",
                "stars": meta.get("stargazers_count", 0),
                "html_url": meta.get("html_url", f"https://github.com/{repo}"),
                "domain": REPO_DOMAIN.get(repo, "general"),
            })
        except RuntimeError as e:
            print(f"   ! skip meta: {e}")
            repo_meta.append({"name": repo, "org": repo.split("/")[0],
                              "short": repo.split("/")[1], "desc": "", "lang": "",
                              "stars": 0, "html_url": f"https://github.com/{repo}",
                              "domain": REPO_DOMAIN.get(repo, "general")})
            continue

        # PRs
        try:
            prs = fetch_pages(f"repos/{repo}/pulls", 100, args.pr_cap, since)
        except RuntimeError as e:
            prs = []
            print(f"   ! PR fetch failed: {e}")
        # Issues (excludes PRs)
        try:
            raw_issues = fetch_pages(f"repos/{repo}/issues", 100, args.issue_cap, since)
            iss = [i for i in raw_issues if "pull_request" not in i]
        except RuntimeError as e:
            iss = []
            print(f"   ! issue fetch failed: {e}")

        print(f"   PRs={len(prs)}  Issues={len(iss)}")

        for pr in prs:
            focus = classify_focus(pr, repo)
            items.append(_normalise(pr, repo, "pr", focus))
        for it in iss:
            focus = classify_focus(it, repo)
            items.append(_normalise(it, repo, "issue", focus))

    # sort newest first
    items.sort(key=lambda x: x["created_at"], reverse=True)

    # ── fetch discussion comments and regenerate summaries ─────────────────────
    print(f"\n▶ fetching comments for {len(items)} items …")
    def _fetch_one(it: dict) -> tuple[str, list[str]]:
        return it["id"], fetch_comments(it["repo"], it["number"])

    comment_map: dict[str, list[str]] = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for item_id, cmt_bodies in ex.map(_fetch_one, items):
            if cmt_bodies:
                comment_map[item_id] = cmt_bodies

    for it in items:
        cmt = comment_map.get(it["id"], [])
        if cmt:
            it["discussion"] = cmt
            # regenerate summary with discussion insight
            it["summary"] = extract_summary(it["body"], it["title"], cmt)
    print(f"   {len(comment_map)} items have discussion comments")

    # optional LLM enrichment (gracefully skips if no reachable endpoint)
    if args.llm:
        cfg = llm_config()
        if cfg:
            scope = "all" if args.llm_limit == 0 else f"top {args.llm_limit}"
            print(f"\n▶ enriching with LLM ({scope}) → {_chat_url(cfg['base'])}  model={cfg['model']}")
            items = enrich_with_llm(items, cfg, limit=args.llm_limit)
        else:
            print("\n! --llm set but no endpoint configured. Set OPENAI_BASE_URL / "
                  "OPENAI_API_KEY / OPENAI_MODEL (or add them to .env). "
                  "Tip: `python collect.py --llm-check` to test.")

    # weekly digest
    digest = None
    if not args.no_digest:
        digest = build_weekly_digest(items)

    data = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "window_days": args.days,
        "repos": repo_meta,
        "focus_labels": FOCUS_LABELS,
        "cat_labels": CAT_LABELS,
        "weekly_digest": digest,
        "items": items,
    }
    out = out_dir / "data.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n✓ wrote {out}  ({len(items)} items across {len(repo_meta)} repos)"
          + (f"  | digest {digest['week']} ({digest['total']} items)" if digest else ""))


def _normalise(raw: dict, repo: str, kind: str, focus: str) -> dict:
    num = raw.get("number")
    labels = [l["name"] if isinstance(l, dict) else str(l)
              for l in (raw.get("labels") or [])]
    cat = classify_cat(raw)
    score = compute_score(raw, focus)
    val = max(1, min(5, round(score / 20)))
    state = raw.get("state", "open")
    if kind == "pr" and raw.get("merged_at"):
        state = "merged"
    btxt = body_text(raw)
    return {
        "id": f"{repo}#{num}",
        "repo": repo,
        "number": num,
        "type": kind,
        "title": (raw.get("title") or "").strip(),
        "state": state,
        "author": (raw.get("user") or {}).get("login", "unknown"),
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "closed_at": raw.get("closed_at"),
        "merged_at": raw.get("merged_at"),
        "url": raw.get("html_url") or raw.get("url"),
        "labels": labels,
        "category": cat,
        "focus": focus,
        "focus_label": FOCUS_LABELS[focus],
        "cat_label": CAT_LABELS[cat],
        "summary": extract_summary(btxt, (raw.get("title") or "").strip()),
        "body": btxt,
        "comments": raw.get("comments", 0) or 0,
        "reactions": _reaction_count(raw),
        "additions": raw.get("additions", 0) or 0,
        "deletions": raw.get("deletions", 0) or 0,
        "changed_files": raw.get("changed_files", 0) or 0,
        "value": val,
        "score": score,
        "tags": extract_tags(raw),
        "subsystems": [],
        "diff_preview": None,
    }


def _reaction_count(raw: dict) -> int:
    r = raw.get("reactions")
    if isinstance(r, dict):
        return sum(v for k, v in r.items() if isinstance(v, int))
    if isinstance(r, int):
        return r
    return 0


if __name__ == "__main__":
    main()
