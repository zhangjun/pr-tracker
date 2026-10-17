# AI Infra PR Tracker

A GitHub **Pull Request & Issue tracker** for the leading AI-infrastructure repos,
inspired by the visual language of [synflux.org](https://synflux.org) (light, teal-primary
dashboard) and built on the architecture of
[pr-tracker-web](https://github.com/GeLee-Q/pr-tracker-web).

## Tracked repos
- `vllm-project/vllm` — inference / serving
- `sgl-project/sglang` — inference / serving
- `verl-project/verl` — RL training
- `vllm-project/vime` — post-training / RL scaling (built on slime)
- `THUDM/slime` — RL training framework
- `NVIDIA/Megatron-LM` — large-scale training
- `NVIDIA/TensorRT-LLM` — inference optimisation

## Focus areas (auto-classified)
- **推理优化 · Inference Optimization** (`inference`)
- **训练优化 · Training Optimization** (`training`)
- **方向演进 · Direction & Evolution** (`direction`)
- **通用 · General** (`general`)

## Features
- **Daily / Weekly / Monthly** views (sidebar) — each item is bucketed by day, ISO week, or month.
- **Time window** pills: 7d / 30d / 90d / All.
- **Filters**: repo, type (PR/Issue), focus, category (`perf`/`feature`/`bugfix`/`infra`/`refactor`/`doc`), state, and free-text search.
- **Stat cards**, per-repo activity cards with 8-week sparklines, and **Cards / Table** display modes.
- **Dark mode** toggle (persisted to localStorage).
- Built with Next.js 16 + React 19 + TypeScript, hand-crafted CSS (no UI framework).

## Data
Data is fetched live from GitHub via the `gh` CLI and written to `public/data/data.json`.
Classification is rule-based (no API key required).

```bash
# refresh the dataset (last 120 days by default)
python collect.py
python collect.py --days 30            # recent month
python collect.py --repos vllm-project/vllm sgl-project/sglang
```

## Optional: LLM enrichment (OpenAI-compatible API)
Every item gets a rule-based summary and classification. Passing `--llm` refines
it with any server that speaks `POST /v1/chat/completions` — OpenAI, Azure
OpenAI, DeepSeek, Moonshot, Qwen, OpenRouter, or a local vLLM / SGLang / Ollama /
LM Studio instance. No SDK is needed; it uses `urllib` from the stdlib.

**1. Configure the endpoint.** Copy `.env.example` to `.env` (git-ignored):

```bash
cp .env.example .env
```

```ini
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

`collect.py` reads `.env` itself (a minimal built-in loader), and real environment
variables take precedence over the file. Base URLs with or without the `/v1`
suffix — or a full `.../v1/chat/completions` path — are all accepted.

**2. Test connectivity**, which prints the resolved model and a one-word reply:

```bash
python collect.py --llm-check
# ✓ endpoint OK — model=gpt-4o-mini (chat) reply='pong' tokens=322
# ✓ endpoint OK — model=agnes-2.5-flash (reasoning) reply='pong' tokens=322
```

**3. Enrich.**

```bash
# full refresh, then LLM-refine the top 200 items by score
python collect.py --llm

# only the top 100
python collect.py --llm --llm-limit 100

# re-enrich the existing data.json without re-hitting GitHub
python llm_enrich.py --limit 50
python llm_enrich.py --repos vllm-project/vllm --focus inference
python llm_enrich.py --dry-run          # show what would be sent
```

The model returns strict JSON and overwrites `summary`, `category`, `focus`,
`score`, and `tags`. Items that were refined are marked `"summary_source": "llm"`
in `data.json` and carry a small **AI** badge in the UI, so LLM output stays
distinguishable from heuristic output. If no endpoint is configured, or a call
fails, the item silently keeps its rule-based values — the pipeline never breaks.

`focus: "direction"` is deterministic and outranks the model: an RFC / roadmap /
design-doc / tracking-issue title can never be reclassified as plain inference or
training work.

| Flag | Meaning |
| --- | --- |
| `--llm` | enable enrichment after collection |
| `--llm-limit N` | enrich only the top N by score (`0` = all, default `200`) |
| `--llm-check` | test the endpoint and exit |
| `--workers N` | parallel requests (`llm_enrich.py`, default `3`) |
| `--skip-done` | skip items already enriched (`llm_enrich.py`) |
| `--dry-run` | print the payloads, send nothing |

### Rate limits and reasoning models
Two things bite in practice, and both are handled automatically:

- **429s.** Retried with exponential backoff, honouring `Retry-After`, up to 4
  times. If your endpoint is strict, lower `--workers` to `1`; progress is
  checkpointed to `data.json` every 25 successes, so re-running with
  `--skip-done` resumes where it stopped.
- **Reasoning models** (`o*`, `*-thinking`, `*-flash`) spend part of `max_tokens`
  on hidden reasoning before emitting any content. The budget therefore starts at
  900 tokens and doubles once if the reply came back empty or truncated. A
  side-effect: a connectivity check with a tiny `max_tokens` looks like an empty
  reply — `--llm-check` uses 256 and reports whether the model is a reasoning one.

A rolling backup is written to `public/data/data.before-llm.json` before
`llm_enrich.py` overwrites the dataset, and the run aborts without writing if
every call failed.

## Run
```bash
npm install
npm run dev        # http://localhost:3000
# or
npm run build && npm run start
```

## Deploy
The app is a static-friendly Next.js App Router site; deploy to Vercel with
`vercel`, or run `npm run build && npm run start` anywhere.
A scheduled `collect.py` run (cron / GitHub Action) keeps `data.json` fresh.
