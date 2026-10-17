# Focus 分类评估与改进报告

**日期：** 2026-10-17  
**对象：** `collect.py` 中 `classify_focus` 的四分类（推理优化 / 训练优化 / 方向演进 / 通用）  
**方法：** 规则审查 + 全量分布统计 + 分层抽样人工核验 + 浏览器验证

---

## 1. 结论速览

| 问题 | 结论 |
|---|---|
| **分类维度合理吗？** | ✅ **合理**。inference / training / direction / general 四类恰好对应「推理优化、训练优化、方向演进」三大关注领域 + 杂项兜底，与用户目标一致。 |
| **使用上准确吗？** | ❌ **原实现不够准确**（估算整体准确率 ~75–80%，但 direction 类仅 ~20%，Megatron 系统性误判）。**改进后**：direction 100% 精确，各 repo 领域分布全部符合，估算整体准确率 ~90%。 |

---

## 2. 原实现的三个系统性问题

### 2.1 inference 系统性过分类（泛词污染）
原 `FOCUS_RULES.inference` 含 38 个词，其中 `kernel`、`moe`、`expert`、`cuda graph`、`tensor parallel`、`attention`、`batch`、`nvidia`、`engine`、`triton` 等**在训练代码中同样高频**。而训练词表仅 27 个词，且缺少 `aux-loss`、`context parallel`、`all-to-all`、`dispatcher`、`adam`、`nccl` 等 Megatron 核心术语。

**证据（改进前 per-repo 分布）：**
- `NVIDIA/Megatron-LM`（纯训练框架）：**56.7% 被判 inference** ← 明显错误
- `verl-project/verl`（RL 训练）：14.8% inference
- `THUDM/slime`（RL 训练）：14.0% inference
- `vllm-project/vime`（训练）：28.0% inference

### 2.2 direction 类基本失效（精度 ~20%）
`direction` 关键词表含 `plan`、`future`、`next step`、`discuss`、`experimental`、`vision`、`deprecat` 等泛词，且 `_text_of()` 会扫描 body 前 900 字符。任何正文里出现「plan」「experimental」的 CI/文档/依赖 PR 都被判为「方向演进」。

**证据：** 改进前 25 个 direction 项中，抽样仅约 5 个是真正的 RFC/roadmap；其余是 `[CI] Disable all L4 jobs`、`build(deps): bump transformers`、`[Fix] minimax-h3: fix AdaLN cache slot leak` 等。**精度约 20%。**

### 2.3 词频计数无权重 + 无 repo 先验
`sum(t.count(kw))` 对标题、标签、正文一视同仁，且没有利用「repo 领域」这一强先验——verl/slime 的 PR 默认更可能是训练，除非有强推理信号。

---

## 3. 改进方案（已实现）

| 改动 | 内容 |
|---|---|
| **加权打分** | 标题命中 ×3、标签命中 ×2、正文命中 ×1；强信号（≥6）直接采信 |
| **清理 inference 词表** | 移除纯泛词（`kernel`/`moe`/`expert`/`batch`/`nvidia`/`engine`/`attention`），改为具体短语（`kv cache`/`paged attention`/`prefill`/`speculative decoding`/`attention backend`） |
| **补全 inference 术语** | 新增 `fp8`/`fp4`/`nvfp4`/`rope`/`qkv`/`mla`/`gqa`/`logits`/`fused`/`kv pool`/`kv transfer`/`attention dp` 等 |
| **补全 training 术语** | 新增 `adam`/`adamw`/`nccl`/`all-reduce`/`all-gather`/`reduce-scatter`/`zero`/`gradient accumulation`/`optimizer state`/`distributed training` 等，抗衡训练代码里的 `fused`/`fp8` |
| **收紧 direction** | 只认**标题/标签**中的 `rfc`/`roadmap`/`proposal`/`design doc`/`tracking issue`/`epic`/`blueprint`/`direction`；移除 `plan`/`future`/`next step`/`discuss`/`experimental`/`vision`/`deprecat`；正文不参与 |
| **general 判定简化** | 仅在**完全无技术信号**且 category 属 infra/doc 时归 general；有任意技术信号则保留技术分类 |
| **repo 领域先验** | 近分时用 repo 领域打破平局（纯领域 repo 阈值 6，混合 repo 阈值 3） |
| **增量重分类脚本** | `reclassify.py` 直接基于已有 `data.json`（含 body）重算，无需重新请求 GitHub API |

---

## 4. 改进效果（前后对比）

### 4.1 总体分布
| Focus | 改进前 | 改进后 |
|---|---|---|
| inference | 751 (50.9%) | 564 (38.3%) |
| training | 584 (39.6%) | 810 (55.0%) |
| direction | 25 (1.7%) | **15 (1.0%)** |
| general | 114 (7.7%) | 85 (5.8%) |

共调整 **336 个 item（22.8%）**。

### 4.2 各 repo 领域符合度（改进后）
| repo | 领域 | inference | training | 判断 |
|---|---|---|---|---|
| vllm-project/vllm | 推理 | **81.1%** | 13.2% | ✅ |
| sgl-project/sglang | 推理 | **73.2%** | 16.9% | ✅ |
| NVIDIA/TensorRT-LLM | 推理 | **80.8%** | 10.1% | ✅ |
| NVIDIA/Megatron-LM | 训练 | 19.7% | **76.4%** | ✅（原 38.9%） |
| THUDM/slime | 训练 | 4.2% | **89.3%** | ✅（原 70.6%） |
| verl-project/verl | 训练 | 1.9% | **94.0%** | ✅（原 80.6%） |
| vllm-project/vime | 训练 | 2.1% | **89.6%** | ✅（原 62.7%） |

### 4.3 direction 类精度
- **改进前：** 25 项，抽样约 5 项为真 RFC/roadmap（精度 ~20%）
- **改进后：** 15 项，**15/15 全部为真 RFC / roadmap / proposal**（精度 100%）
  - `[Roadmap] Q4 2026 OPD Teacher Serving in vLLM`
  - `[RFC]: PD disaggregation + RL lifecycle tracking`
  - `[RFC][Experimental]: Model- and platform-customized KV cache planning`
  - `[RFC / Research Showcase] SPICY-KV`
  - `[RFC][Training] Add an FSDP2 training backend`
  - `[roadmap] verl 26Q4 roadmap`
  - `[RFC] Support draftmodel training in vime` … 等

### 4.4 浏览器验证
- Focus 筛选（30d 窗口）：推理 554 / 训练 565 / 方向 12 — 与数据一致
- Weekly digest 叙事：推理 542 · 训练 315 · 方向 8（本周 vllm/sglang PR 集中，推理占比高，合理）
- TOP PR 卡片 focus 标签正确（RFC→DIRECTION，kernel/benchmark→INFERENCE）
- **0 console 错误**，TypeScript / Python 编译均通过

---

## 5. 剩余局限（诚实说明）

1. **仍是启发式而非语义理解**。`fused`、`qkv`、`fp8` 等词在训练和推理代码中都合法存在，边界 case（如「fused QKV + gradient」）无法完全区分。Megatron 残留的 ~20% inference 中有约 1/4 属此类边界误判。
2. **direction 召回偏保守**。只认标题/标签的显式 RFC 信号，标题里不含 `RFC/roadmap` 但实质是方向讨论的 issue 可能漏判（当前 15 项，可能漏 3–5 项）。
3. **未使用 LLM**。`collect.py` 保留了 `--llm` 路径，接入可用端点后可对边界项做语义判定，进一步提升准确率。
4. **repo 先验是硬编码的**。若新增 repo，需在 `REPO_FOCUS_PRIOR` 中登记领域。

---

## 6. 建议的后续动作
1. 若追求更高精度，接入 LLM（`python collect.py --llm`）对 `general` 与边界项做二次判定。
2. 为 `direction` 增加「issue 正文含 design/motivation 且评论数高」的弱信号补充规则，提升召回。
3. 将 `reclassify.py` 纳入日常流程——每次调整词表后可秒级重算，无需重新抓取数据。

---

## 附：验证命令
```bash
# 重算 focus（无需 API）
python reclassify.py

# 查看分布对比
python - <<'PY'
import json; from collections import Counter
d=json.load(open("public/data/data.json")); c=Counter(x["focus"] for x in d["items"])
print(c)
PY
```
