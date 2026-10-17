#!/usr/bin/env python3
"""Enrich an existing data.json with an OpenAI-compatible LLM — no GitHub calls.

Reads public/data/data.json, asks the LLM for a better summary / category /
focus / score / tags (using title + labels + description + discussion), writes
the file back and rebuilds the weekly digest.

Usage:
    python llm_enrich.py                    # top 200 items by score
    python llm_enrich.py --limit 0          # every item
    python llm_enrich.py --limit 50 --repos vllm-project/vllm sgl-project/sglang
    python llm_enrich.py --focus direction  # only RFC / roadmap items
    python llm_enrich.py --check            # endpoint connectivity test
    python llm_enrich.py --dry-run          # show the prompt, make no calls
"""
import argparse
import json
import sys
from pathlib import Path

from collect import (llm_config, llm_check, enrich_with_llm, build_weekly_digest,
                     attach_digest_insight, _chat_url, _build_user_prompt, LLM_INSTRUCTION)

ROOT = Path(__file__).parent
PATH = ROOT / "public" / "data" / "data.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200,
                    help="enrich only the top-N items by score (0 = all)")
    ap.add_argument("--repos", nargs="*", default=None, help="restrict to these repos")
    ap.add_argument("--focus", default=None, help="restrict to this focus")
    ap.add_argument("--check", action="store_true", help="test endpoint and exit")
    ap.add_argument("--dry-run", action="store_true", help="show prompt, make no calls")
    ap.add_argument("--workers", type=int, default=3,
                    help="parallel requests (lower this if the endpoint rate-limits)")
    ap.add_argument("--skip-done", action="store_true",
                    help="skip items already enriched by the LLM")
    ap.add_argument("--no-insight", action="store_true",
                    help="skip the editorial digest prose (本周重点 / 模块与趋势 / 重点 PR)")
    args = ap.parse_args()

    cfg = llm_config()
    if not cfg:
        print("✗ no LLM endpoint configured.\n"
              "  Set OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL,\n"
              "  or copy .env.example to .env and fill it in.")
        sys.exit(1)
    print(f"→ {_chat_url(cfg['base'])}  model={cfg['model']}")

    if args.check:
        sys.exit(0 if llm_check(cfg) else 1)

    d = json.loads(PATH.read_text(encoding="utf-8"))
    items = d["items"]

    pool = items
    if args.repos:
        pool = [x for x in pool if x["repo"] in args.repos]
    if args.focus:
        pool = [x for x in pool if x["focus"] == args.focus]
    if args.skip_done:
        pool = [x for x in pool if x.get("summary_source") != "llm"]
    if args.limit and args.limit > 0:
        pool = sorted(pool, key=lambda x: -x.get("score", 0))[:args.limit]

    if not pool:
        print("! no items matched the selection")
        return

    print(f"→ selected {len(pool)} items (limit={args.limit}, workers={args.workers})")

    if args.dry_run:
        print("\n--- prompt preview (first item) ---")
        print(LLM_INSTRUCTION + "\n\n" + _build_user_prompt(pool[0])[:1000])
        return

    def save(data: dict, keep_insight: bool = True) -> None:
        wd = build_weekly_digest(items)
        if wd and keep_insight:
            prev = (data.get("weekly_digest") or {}).get("insight")
            if prev:
                wd["insight"] = prev      # checkpoints must not wipe the prose
        data["weekly_digest"] = wd
        PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    before = {x["id"]: (x.get("summary") or "") for x in pool}
    # pool is already selected; mutate in place. Checkpoint every 25 successes.
    enrich_with_llm(pool, cfg, max_workers=args.workers, limit=0,
                    checkpoint=lambda _items: save(d))

    touched = sum(1 for x in pool if x.get("summary_source") == "llm")
    if touched == 0:
        print("\n✗ every call failed — data.json left untouched.\n"
              "  Re-check with: python llm_enrich.py --check")
        sys.exit(1)

    # keep one rolling backup so a bad model run is always recoverable
    backup = PATH.with_suffix(".before-llm.json")
    backup.write_text(PATH.read_text(encoding="utf-8"), encoding="utf-8")

    # rewrite the digest against the enriched summaries, then ask the model for
    # the editorial layer (本周重点 / 模块与趋势 / 重点 PR)
    wd = build_weekly_digest(items)
    if not args.no_insight:
        print("\n▶ writing digest insight …")
        wd = attach_digest_insight(items, wd, cfg)
    d["weekly_digest"] = wd
    PATH.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\n=== before → after (sample) ===")
    for x in pool[:6]:
        print(f"\n[{x['score']}] {x['title'][:72]}")
        print(f"  before: {before[x['id']][:110]}")
        print(f"  after : {(x.get('summary') or '')[:110]}")
    print(f"\n✓ rewrote {PATH}  ({len(pool)} items enriched)")


if __name__ == "__main__":
    main()
