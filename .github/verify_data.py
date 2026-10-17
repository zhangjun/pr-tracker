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

Exits non-zero with a human-readable reason on the first failure.
"""
import json
import sys
from pathlib import Path

DATA = Path("public/data/data.json")

# Fields PRTrackerClient reads unconditionally; a missing one renders "undefined"
REQUIRED_ITEM_FIELDS = ("repo", "number", "type", "title", "created_at", "score")


def fail(msg: str) -> "NoReturn":  # type: ignore[name-defined]
    sys.exit(f"data.json rejected — {msg}")


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

    # ── report ────────────────────────────────────────────────────────────────
    llm = sum(1 for i in items if i.get("summary_source") == "llm")
    repos = len(d.get("repos") or [])
    src = (ins.get("source") or "none") if ins else "none"
    print(
        f"OK  items={len(items)}  repos={repos}  "
        f"week={week} ({wd.get('total')} items, {wd.get('prs')} PRs)  "
        f"llm_summaries={llm}  insight={src}"
    )


if __name__ == "__main__":
    main()
