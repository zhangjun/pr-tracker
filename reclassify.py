#!/usr/bin/env python3
"""Re-classify focus on an existing data.json (no GitHub API calls needed).

Reads public/data/data.json, recomputes focus/score/value with the improved
weighted classifier, rebuilds the weekly digest, and writes it back.
Also prints a before/after distribution + migration matrix.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

from collect import (classify_focus, compute_score, build_weekly_digest,
                     FOCUS_LABELS)

ROOT = Path(__file__).parent
PATH = ROOT / "public" / "data" / "data.json"


def raw_of(it: dict) -> dict:
    return {
        "title": it.get("title", ""),
        "labels": [{"name": l} for l in (it.get("labels") or [])],
        "body": it.get("body", ""),
        "comments": it.get("comments", 0),
        "reactions": it.get("reactions", 0),
        "additions": it.get("additions", 0),
        "deletions": it.get("deletions", 0),
        "created_at": it.get("created_at"),
    }


def main() -> None:
    d = json.loads(PATH.read_text(encoding="utf-8"))
    items = d["items"]

    before = Counter(x["focus"] for x in items)
    migration = Counter()
    changed = 0

    for it in items:
        old = it["focus"]
        new = classify_focus(raw_of(it), it["repo"])
        migration[(old, new)] += 1
        if new != old:
            changed += 1
            it["focus"] = new
            it["focus_label"] = FOCUS_LABELS[new]
            raw = raw_of(it)
            it["score"] = compute_score(raw, new)
            it["value"] = max(1, min(5, round(it["score"] / 20)))

    after = Counter(x["focus"] for x in items)

    print(f"changed focus: {changed} / {len(items)}  ({changed/len(items)*100:.1f}%)")
    print("\n=== overall before → after ===")
    for k in ["inference", "training", "direction", "general"]:
        print(f"  {k:10s} {before[k]:5d} → {after[k]:5d}  ({before[k]/len(items)*100:4.1f}% → {after[k]/len(items)*100:4.1f}%)")

    print("\n=== per-repo after ===")
    by = defaultdict(Counter)
    for x in items:
        by[x["repo"]][x["focus"]] += 1
    domain = {"vllm-project/vllm": "inference", "sgl-project/sglang": "inference",
              "verl-project/verl": "training", "vllm-project/vime": "training",
              "THUDM/slime": "training", "NVIDIA/Megatron-LM": "training",
              "NVIDIA/TensorRT-LLM": "inference"}
    print(f"{'repo':26s} {'infer':>7s} {'train':>7s} {'dir':>6s} {'gen':>6s}   domain")
    for repo, cc in by.items():
        t = sum(cc.values())
        print(f"{repo:26s} {cc['inference']/t*100:6.1f}% {cc['training']/t*100:6.1f}% "
              f"{cc['direction']/t*100:5.1f}% {cc['general']/t*100:5.1f}%   {domain.get(repo,'?')}")

    print("\n=== migration (top moves) ===")
    for (a, b), n in migration.most_common():
        if a != b and n >= 3:
            print(f"  {a:10s} → {b:10s} {n:4d}")

    # rebuild digest
    d["weekly_digest"] = build_weekly_digest(items)
    PATH.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n✓ rewrote {PATH}  | digest {d['weekly_digest']['week']} "
          f"({d['weekly_digest']['total']} items)")


if __name__ == "__main__":
    main()
