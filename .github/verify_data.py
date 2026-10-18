#!/usr/bin/env python3
"""
Guard for the scheduled collector.

Runs after `collect.py` and refuses to let a broken or empty dataset be
committed back to the repository — a bad commit here would replace the live
site's data with nothing, and the site would stay empty until the next run.

Checks, in order of how badly each would break the deployed page:
  1. the file parses and `items` is a non-empty list
  2. every item has the fields the UI actually reads
  3. `weekly_digest` points at a week that the items really cover
  4. the editorial `insight`, when present, does not reference PRs that are
     absent from the digest (the anti-hallucination contract from collect.py)
  5. the payload stays within its transport budget — the browser downloads
     this file before it can draw anything, so a silent size regression is a
     visible outage, not a cosmetic issue
  6. LLM coverage did not silently collapse — checked twice, because the two
     checks catch different failures. Absolutely: a fully configured endpoint
     that produced no summaries means enrichment errored out. Relatively: a
     run without credentials must not overwrite a committed LLM-enriched
     dataset. The relative check alone is not enough, since it goes blind the
     moment one bad run makes HEAD heuristic-only. The digest *insight* is
     checked relatively too, but only as a warning: it is one call, and the UI
     has a rule-based fallback for it, so a miss degrades prose rather than
     breaking the page.

Exits non-zero with a human-readable reason on the first failure.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

DATA = Path("public/data/data.json")

# Full PR bodies and comment threads used to make this file 10.6MB, of which
# the UI rendered none. slim_for_web() trims them; this ceiling keeps that
# from being undone. Gzipped it is ~0.6MB, which is what actually crosses the
# wire.
MAX_BYTES = 4_500_000

# Fields PRTrackerClient reads unconditionally; a missing one renders "undefined"
REQUIRED_ITEM_FIELDS = ("repo", "number", "type", "title", "created_at", "score")

# collect.py's llm_config() requires all three together; any one alone means
# the collector falls back to heuristic text.
LLM_ENV_VARS = ("OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL")


def fail(msg: str) -> "NoReturn":  # type: ignore[name-defined]
    sys.exit(f"data.json rejected — {msg}")


def warn(msg: str) -> None:
    """Non-fatal: the page still renders, but a human should know.

    Emitted as a GitHub annotation when running in Actions so the warning shows
    on the run summary instead of scrolling past in a 25-minute log.
    """
    print(f"WARNING: {msg}")
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::warning::{msg}")


def llm_summaries(d: dict) -> int:
    return sum(1 for i in (d.get("items") or []) if i.get("summary_source") == "llm")


def committed_version() -> dict | None:
    """The data.json at HEAD, i.e. what the live site is serving now."""
    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/data/data.json"],
            capture_output=True, text=True, timeout=60,
        )
        if raw.returncode != 0 or not raw.stdout:
            return None
        return json.loads(raw.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        # Not a git checkout, or no previous version — nothing to compare to.
        return None


def main() -> None:
    if not DATA.exists():
        fail(f"{DATA} does not exist (collect.py did not write output)")

    try:
        d = json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail(f"invalid JSON: {e}")

    items = d.get("items")
    if not isinstance(items, list) or not items:
        fail("`items` is missing or empty")

    # ── 1. shape of every item ────────────────────────────────────────────────
    for i, it in enumerate(items):
        missing = [k for k in REQUIRED_ITEM_FIELDS if it.get(k) in (None, "")]
        if missing:
            fail(f"item[{i}] ({it.get('repo')}#{it.get('number')}) missing {missing}")

    # ── 2. digest must describe a week the dataset actually covers ────────────
    wd = d.get("weekly_digest") or {}
    week = wd.get("week")
    if not week:
        fail("`weekly_digest.week` is missing")
    if not wd.get("total"):
        fail(f"weekly_digest for {week} has total=0 (no items bucketed into the week)")

    # ── 3. insight must not invent PRs ────────────────────────────────────────
    ins = wd.get("insight") or {}
    key_prs = ins.get("key_prs") or []
    if key_prs:
        candidates = {(t.get("repo"), t.get("number")) for t in (wd.get("top") or [])}
        unknown = [
            f"{k.get('repo')}#{k.get('number')}"
            for k in key_prs
            if (k.get("repo"), k.get("number")) not in candidates
        ]
        if unknown:
            fail(f"insight.key_prs references PRs outside the digest: {unknown}")

    # ── 4. transport budget ───────────────────────────────────────────────────
    size = DATA.stat().st_size
    if size > MAX_BYTES:
        biggest = sorted(items, key=lambda i: len(i.get("body") or ""), reverse=True)[:3]
        detail = ", ".join(
            f"{i.get('repo')}#{i.get('number')} body={len(i.get('body') or ''):,}ch"
            for i in biggest
        )
        fail(
            f"data.json is {size/1e6:.2f}MB, over the {MAX_BYTES/1e6:.1f}MB budget. "
            f"Large bodies: {detail}. Did slim_for_web() stop being applied?"
        )

    # ── 5. LLM coverage must not silently collapse ────────────────────────────
    # Deliberately dropping the LLM is fine — that is what the env var is for.
    allowed = os.environ.get("ALLOW_LLM_REGRESSION") == "1"

    # 5a. Absolute floor. The comparison below is relative to HEAD, so once one
    # bad run has committed heuristic-only data, HEAD *is* heuristic-only and
    # "no worse than HEAD" is vacuously true forever. If the endpoint is fully
    # configured, output must contain LLM summaries; zero means enrichment ran
    # and failed (bad model name, 429s, timeout), which no relative check sees.
    if not allowed and all(os.environ.get(v) for v in LLM_ENV_VARS):
        if llm_summaries(d) == 0:
            fail(
                "all three OPENAI_* variables are set but this run produced 0 "
                "LLM summaries — enrichment failed silently (wrong model name, "
                "rate limiting, or an unreachable endpoint). Refusing to publish "
                "rule-based text. Check the Collect step log for the reason."
            )

    # 5b. Relative to the committed version.
    prev = committed_version()
    if prev is not None and not allowed:
        prev_llm = llm_summaries(prev)
        new_llm = llm_summaries(d)
        if prev_llm > 0 and new_llm == 0:
            fail(
                f"this run produced 0 LLM summaries but the committed data has "
                f"{prev_llm}. Either the run had no LLM configured (llm_limit=off, "
                f"or a missing/renamed OPENAI_* secret), or every enrichment call "
                f"failed. Publishing this would replace every refined summary with "
                f"rule-based text. Re-run with ALLOW_LLM_REGRESSION=1 if a "
                f"heuristic-only dataset is what you want."
            )
        # The editorial layer is a single call, and the Weekly view has a
        # deterministic fallback for it (buildInsight() in PRTrackerClient), so a
        # miss here degrades prose, not the page. Refusing the whole refresh over
        # one flaky call left the site a full day stale — strictly worse.
        prev_ins = (prev.get("weekly_digest") or {}).get("insight") or {}
        if prev_ins.get("source") == "llm" and ins.get("source") != "llm":
            warn(
                f"no LLM digest insight this run, but the committed data has one. "
                f"{new_llm} item summaries are LLM-written, so the endpoint works — "
                f"the single editorial call failed. See the 'digest insight' lines "
                f"in the Collect step. Publishing anyway; the Weekly view falls back "
                f"to rule-based prose."
            )

    # ── report ────────────────────────────────────────────────────────────────
    llm = sum(1 for i in items if i.get("summary_source") == "llm")
    repos = len(d.get("repos") or [])
    src = (ins.get("source") or "none") if ins else "none"
    print(
        f"OK  items={len(items)}  repos={repos}  size={size/1e6:.2f}MB  "
        f"week={week} ({wd.get('total')} items, {wd.get('prs')} PRs)  "
        f"llm_summaries={llm}  insight={src}"
    )


if __name__ == "__main__":
    main()
