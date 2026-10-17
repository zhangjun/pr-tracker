# WEEKLY DIGEST 评估报告

**日期:** 2026-10-17
**对象:** `WeeklyDigestPanel`（`app/PRTrackerClient.tsx:226`）+ `build_weekly_digest()`（`collect.py:785`）
**方法:** 代码审阅 + 对 `public/data/data.json` 的量化分析 + Playwright 真实渲染检查（1440×900）
**当前 digest:** `2026-W42` / Oct 12 – Oct 18 / 927 items

---

## 结论

**需要优化，且有一个 P0 级的数据可信度问题。**

视觉和信息架构做得不错——版面层次、focus 配色、堆叠分布条、卡片化 Top 榜单都是加分项。但作为一份「周报」，它当前**陈述的数字不成立**：它把「本次抓取到的条目数」当成了「本周发生的活动量」。这是会误导读者的硬伤，优先级高于任何视觉打磨。

一句话总结：**排版是 8 分，数据是 4 分。**

---

## 一、P0：数据可信度（必须先修）

### 1.1 「本周 927 条」不是本周的活动量，而是抓取上限的产物 ⚠️ 最严重

`collect.py` 对每个 repo 用固定上限抓取（`--pr 200` / `--issue N`），**按时间倒序**取满即停。结果每个 repo 覆盖的时间跨度差异巨大：

| repo | 条目数 | 最旧条目 | 实际覆盖跨度 |
| --- | --- | --- | --- |
| vllm | 227 | 2026-10-16 | **≈1 天** |
| sglang | 213 | 2026-10-16 | **≈1 天** |
| TensorRT-LLM | 208 | 2026-10-14 | ≈3 天 |
| Megatron-LM | 203 | 2026-10-10 | ≈7 天 |
| verl | 216 | 2026-09-29 | ≈18 天 |
| slime | 214 | 2026-08-03 | ≈75 天 |
| vime | 193 | 2026-06-18 | ≈121 天 |

后果：

- **vllm 的 227 条全部集中在最近 1 天**，却整批计入 W42。上周同样跑一次，它们就会被计入 W41。**「本周 vs 上周」的差异只是抓取时点的差异。**
- 上周 125 条 vs 本周 927 条，`+641.6%` —— 这不是「社区爆发」，是**高流量 repo 把配额吃满了**。
- 「最活跃仓库 vllm (227) / sglang (213) / TensorRT-LLM (208)」= **谁先撞到 200 上限**，不是谁最活跃。Megatron 179 vs verl 73 更无意义：两者覆盖窗口差 11 天。
- focus 分布同样被污染：vllm + sglang（推理系）合计 440 条占据样本，直接把 `inference` 推到 542 条。

**修复方向（三选一或组合）：**

1. **按日期下限抓取**：翻页直到 `created_at` 早于窗口起点为止，不再用条目数上限。这是唯一能让周对比成立的做法。
2. **按覆盖率归一**：若必须保留上限，则记录每个 repo 的 `observed_from`，digest 里改报「日均速率」而非「总量」，并对覆盖不足 7 天的 repo 显式标注。
3. **诚实降级**：至少在 digest 上标注「基于 7 个 repo、每 repo 最近 N 条」，不要把快照数当周活动量。

### 1.2 当前周尚未结束，却按完整周呈现

今天 2026-10-17（周六），W42 是 Oct 12–18：**7 天里只过完 6 天**，`range` 却写着截止到 **Oct 18（未来日期）**。

按天分布也印证了这一点：

```
Mon 10-12   74
Tue 10-13   31
Wed 10-14  140
Thu 10-15  129
Fri 10-16  383   ← 41% 集中在一天
Sat 10-17  170   ← 当天还没过完
Sun 10-18    0   ← 未来
```

- 周日的 0 条会被读者理解为「周日没有活动」，实际是**还没到**。
- 927 这个数字每小时都在变，昨天截图与今天截图不一致。

**修复：** 默认展示**上一个完整周**（W41），当前周单独作为「本周进行中 · 6/7 天」区块，并给出「按已过天数折算」的日均值。

### 1.3 digest 完全无视筛选器

实测：在 Weekly 视图下筛选 `sglang`，digest 依旧显示 `927 items`，Top 榜单依旧 5 个 vllm：

| 状态 | digest 头部 | Top 卡片 repo |
| --- | --- | --- |
| 无筛选 | 927 items · PR 862 · Issue 65 | vllm, vllm, vllm, sglang, vllm, vllm |
| 筛选 sglang | **927 items · PR 862 · Issue 65**（未变） | **vllm, vllm, vllm, sglang, vllm, vllm**（未变） |

原因：`weekly_digest` 在采集时预计算一次，UI 直接渲染，不参与任何 filter。

**修复：** 要么让 digest 随筛选重算（纯前端聚合即可），要么在面板上加「全局」标记并在筛选时隐藏/降级，避免读者以为这是 sglang 的周报。

---

## 二、P1：选品质量（决定这份周报有没有「编辑感」）

### 2.1 Top 6 里 5 个来自同一仓库

```
vllm #62155  [Bugfix] Reject shape mismatches in ShardedStateLoader
vllm #62137  [Bugfix] Keep the Triton attention tiling fixed under batch invariance
vllm #62169  [Bugfix][Attention] Chunk sparse indexer decode logits by request
sglang #44786 [RFC / Feature] SPICY-KV: 28.6x–50x Pre-RoPE ...
vllm #62068  [Bugfix][MoE] Keep per-expert gate/up halves separate
vllm #62049  [Bugfix][LoRA] Map lm_head LoRA to batch tokens
```

标题叫「WEEKLY DIGEST」、覆盖 7 个 repo，实际读起来是**一份 vllm bugfix 列表**。没有跨仓库配额，也没有类别多样性约束。

### 2.2 6 个名额是从 9 个同分项里随手取的

| 分数 | 条目数 |
| --- | --- |
| 82 | 2 |
| 78 | **7** |
| 75 | 6 |
| 72 | **47** |

- 第 6 名的截断线是 **78 分**，`≥78` 的一共有 **9 条**，digest 只取 6 条 → **67%**，同一分数段内谁入选纯属排序稳定性的偶然。
- 更关键的是**分数分辨率太粗**：72 分有 47 条、56 分有 98 条。`compute_score` 是「基础 30 + 若干 0/7/14、0/8/12 的整数档位」相加，输出只有几十个离散值。**它本质是个分桶器，不是排序器**，撑不起「Top N」这种精细挑选。

### 2.3 「Top PRs this week」里混进了一个 Issue

第 4 张卡片 `sglang #44786` 的 `type` 是 **issue**，却出现在「Top **PRs**」标题下。`build_weekly_digest` 的 `top` 只按分数排序，**没有按 type 过滤**。

### 2.4 5/6 是 bugfix，因为打分偏爱 label

9 个候选里 7 个 bugfix、1 个 feature、1 个 perf。`compute_score` 的 `LABEL_WEIGHT` 对 bugfix/attention 类标签给分最高，导致**修 bug 天然压过新特性**。对「周报」而言，读者更想看到「方向性变化 / 大特性 / 性能突破」，而不是六条 bugfix。

**修复（2.1–2.4 一起做）：**

- 按 repo 轮转取 Top（round-robin），保证至少 4–5 个 repo 露面；
- 同分时用确定性次序打破（评论数 → reactions → 时间），并把排序键写进数据，便于解释；
- 「Top」按 type 过滤或把标题改成「Top items」；
- 引入 digest 专用权重：`direction` / `feature` / `perf` 加权，bugfix 降权，让榜单有编辑视角。

---

## 三、P2：信息价值（周报该说什么）

### 3.1 缺「产出侧」——只有 created，没有 merged / closed

数据里现成就有：**本周 merged 176 条、closed 255 条**，digest 一条都没提。一份周报只报「新增了多少」，不报「合了多少、关了多少」，等于只报开工不报交付。

建议补一行：`本周合并 176 · 关闭 255 · 合并率 20.4%`。

### 3.2 缺趋势对比（但需先修 1.1）

`by_focus`、repo 分布、总量都没有环比。这是周报最该有的东西——但**在 1.1 修好之前，任何环比都是假的**，所以顺序不能反。

### 3.3 叙述段是数字复读机

```
header : Oct 12 – Oct 18 · 927 items · PR 862 · Issue 65
narrative: 本周（Oct 12 – Oct 18）共 927 条动态 —— PR 862 · Issue 65。
           推理优化 542 条、训练优化 296 条、方向演进 8 条。
           最活跃仓库：vllm (227), sglang (213), TensorRT-LLM (208)。
           重点关注：[Bugfix] Reject shape mismatches ...
```

- 前两句和 header 完全重复，第三句和下面的 repo chips 完全重复，第四句就是 `top[0]`。
- **四个 focus 里只提了三个**，`general` 81 条（8.7%）在正文里凭空消失，但堆叠条和 legend 里有它 —— 图文不一致。
- 真正该写的是「发生了什么变化、哪个子系统、为什么重要」，现在一个都没有。

建议：要么删掉叙述段（信息已由数字+chips 承载），要么改写为 2–3 句真正的编辑判断（如「vllm 本周集中在 attention 后端的 batch-invariance 修复，涉及 3 个 PR」——这类结论可由 `subsystems` + label 聚合自动生成）。

### 3.4 无法回看历史周

digest 只渲染 `weekly_digest`（最新周），没有周选择器。Weekly 视图下方虽有按周分桶的列表，但**摘要面板永远只有当前周**。既然要做「周刊」，至少要能翻上一期。

---

## 四、P3：视觉细节

| # | 问题 | 证据 |
| --- | --- | --- |
| 4.1 | `direction` 堆叠条宽 **0.86%**，几乎不可见，读者会以为没有方向类内容 | 实测 bar 宽度：58.47% / 31.93% / **0.86%** / 8.74% |
| 4.2 | 堆叠条无数字标签，只有 hover tooltip | 4 段均无内联百分比 |
| 4.3 | 卡片高度不齐，长标题/长摘要撑高行 | sglang #44786 卡明显高于同排三张，导致首行留白 |
| 4.4 | Direction 区块 8 条只取 4 条，无「查看全部」 | `direction[:4]` |
| 4.5 | 侧栏 `all repos 1200` 与 digest `927 items` 并存，口径不同易混淆 | 前者是全窗口计数，后者是本周 |

---

## 五、修复优先级

| 优先级 | 事项 | 影响 | 工作量 |
| --- | --- | --- | --- |
| **P0-1** | 抓取改为「按日期下限翻页」，去掉 per-repo 条数上限 | 让「周活动量」成立 | 中（改 `collect.py` 分页逻辑） |
| **P0-2** | 当前周标注「进行中 6/7 天」，或默认展示上一个完整周 | 消除未来日期与假 0 值 | 小 |
| **P0-3** | digest 响应筛选器，或明确标注「全局」 | 消除图文矛盾 | 小–中 |
| **P1-1** | Top 按 repo 轮转 + 确定性 tiebreak + type 过滤/改名 | 榜单具备代表性 | 小 |
| **P1-2** | digest 专用权重（direction/feature/perf 加权） | 榜单有编辑视角 | 小 |
| **P2-1** | 增加 merged / closed / 合并率 | 补齐产出侧 | 小 |
| **P2-2** | 重写叙述段（或删除），补齐 `general` | 去掉复读、图文一致 | 小 |
| **P2-3** | 周选择器 / 上一期 | 让「周刊」成立 | 中 |
| **P3** | 堆叠条最小宽度+数字、卡片等高、Direction 查看全部 | 观感 | 小 |

**建议路径：** 先做 P0-2 + P0-3 + P1-1 + P2-1（半天内可完成，收益立竿见影），再单独安排 P0-1（需要重新抓数，耗时取决于 GitHub 速率）。P0-1 未做之前，**不要在 digest 上加环比数字**。

---

## 附：实测数据

```
week            : 2026-W42 (Oct 12 – Oct 18, 今天 Oct 17 → 6/7 天)
total           : 927   (PR 862 · Issue 65)
by_focus        : inference 542 · training 296 · direction 8 · general 81
top_repos       : vllm 227 · sglang 213 · TensorRT-LLM 208 · Megatron-LM 179 · verl 73
top6 repos      : vllm ×5, sglang ×1
top6 categories : bugfix ×5, feature ×1
top6 types      : pr ×5, issue ×1   (标题写的是 "Top PRs")
cut-off score   : 78  (≥78 共 9 条，展示 6 条)
prev week (W41) : 125 条  → 名义 +641.6%（抓取伪影）
merged this week: 176
closed this week: 255
bar widths      : 58.47% / 31.93% / 0.86% / 8.74%
filter test     : 筛选 sglang 后 digest 与 Top 卡片完全不变
console errors  : 0
```

截图：`eval-shots/digest-01-weekly.png`　原始指标：`eval-digest.json`

---

## 六、修复记录（2026-10-17 已实施）

本轮处理 **P0-2 / P0-3 / P1-1 / P2-1 / P2-2**，并顺带修了 P3 的可见性问题。
**P0-1（抓取改为按日期下限翻页）未做** —— 它需要重新采集数据，会触发一次全量 GitHub 抓取。

### 6.1 digest 改为前端按「当前筛选结果」实时计算

`buildDigest()` 新增于 `app/PRTrackerClient.tsx`，digest 的每一个数字都从 `filtered`
重算，因此面板与下方列表不可能再互相矛盾。实测：

| 筛选状态 | digest 总量 | Top 卡片 repo |
| --- | --- | --- |
| 无筛选 | 927 | vllm ×2, sglang ×2, Megatron-LM ×2 |
| 领域 = 推理优化 | 542 | 6 个 repo 分布 |
| 仓库 = sglang | 213 | sglang ×6 |

筛选时标题右侧出现 `FILTERED` 徽章，避免读者误以为是全局周报。

### 6.2 未完成的周不再冒充完整周

- 新增 `complete` / `days_elapsed` / `as_of` / `per_day`。
- 标题旁出现琥珀色 `IN PROGRESS · 6/7 d` 徽章。
- 叙述首句改为「本周尚未结束（6/7 天）日均 155 条」，并给出日均值而非只给总量。
- 日期区间仍显示 `Oct 12 – Oct 18`，但已明确标注为进行中，不再暗示周日无活动。

### 6.3 选品：跨仓库配额 + 确定性 tiebreak + 只取 PR

- `Top PRs this week` 现在**只取 `type === "pr"`**，不再把 Issue 放在「PRs」标题下。
- 排序键改为 `score → comments → reactions → created_at`，同分不再随机。
- 每个 repo 最多占 2 席，再按分数降序展示。结果：

| 方案 | 分数序列 | 覆盖 repo 数 |
| --- | --- | --- |
| 修复前 | 82, 82, 78, 78, 78, 78 | **1**（全 vllm） |
| **修复后（cap=2）** | 82, 82, 75, 75, 72, 72 | **3** |

（对比过 cap=1：分数掉到 52–56，代表性过差；cap=3：退回 2 个 repo。cap=2 是平衡点。）

### 6.4 补齐产出侧

头部与叙述都加入 `merged` / `closed`：本周 **合并 175 条、关闭 250 条**。

### 6.5 叙述重写

修复前三重复读（header / chips / top[0]），且漏掉 `general`。现在：

> 本周尚未结束（6/7 天）日均 155 条。合并 175 条、关闭 250 条。领域分布：推理 542、训练 296、方向 8、通用 81。热点主题：CUDA/Kernel (240)、Quantization (149)、GRPO/PPO (136)。

四个领域齐全、不再复读、并用 tags 给出真正的主题线索（`subsystems` 字段实测全为空，故改用 tags）。

### 6.6 数据可信度显式化（P0-1 的缓解措施）

每个 repo 的抓取跨度写入 `top_repos[].days`，chip 上直接显示 `vllm 227 ·2d`；
当任一 repo 覆盖不足 7 天时显示警示行：

> ⚠ 快照覆盖不均：vllm、sglang、TensorRT-LLM 不足 7 天，总量与仓库排名仅供趋势参考

这是把「数字不可比」这件事**说出来**，而不是修掉它 —— 真正的修复仍是 P0-1。

### 6.7 其他

- Direction 区块标题显示 `showing 4 of 8`，不再无提示地截断。
- Direction 与 Top 去重，同一个 RFC 不会在一页出现两次。
- 堆叠条 `min-width: 3px`，0.86% 的 direction 不再消失；legend 直接标注各领域计数。
- `groupByWeek` 改用标准 ISO-8601 周（原来用的是 `ceil(dayOfYear/7)` 近似公式，会与
  digest 的 `isocalendar()` 周号错位）；所有周计算统一在 UTC 下进行，避免本地时区把
  午夜附近条目挪到相邻周。
- 服务端 `build_weekly_digest()` 同步为同一套逻辑，`data.json` 已重建（未重新采集）。

### 6.8 仍未处理

| 事项 | 原因 |
| --- | --- |
| **P0-1 按日期下限翻页抓取** | 需重新采集全量数据，耗时取决于 GitHub 速率 |
| P2-3 周选择器 / 回看上一期 | 中等工作量，本轮未纳入 |
| 趋势对比（环比） | **必须等 P0-1**，否则是假数字 |

### 6.9 验证

- `tsc --noEmit`、`npm run build`、`py_compile` 全部通过。
- 浏览器（1440×900）三态实测：无筛选 / 领域筛选 / 仓库筛选，digest 均正确联动，**0 console 错误**。
- 截图：`eval-shots/digest-02-weekly-fixed.png`；指标：`eval-digest.json`。

---

## 七、编辑层：从「报数字」改为「讲重点」（2026-10-17 追加）

用户反馈：周报应该给出**每周重点描述**，而不是一堆数字。据此把 digest 正文重构为三个描述性区块。

### 7.1 新结构

| 区块 | 内容 | 来源 |
| --- | --- | --- |
| **本周重点** | 3–4 句编辑判断，点明仓库、模块、PR 编号，说明在做什么、为什么重要 | LLM（无端点时用确定性模板） |
| **功能模块与开发趋势** | 6 个模块卡：名称 / 趋势徽章 / 条目数 / 一句话说明 / 参与仓库 | 模块统计确定性计算，说明文字由 LLM 写 |
| **重点 PR** | 3–4 张卡，每张带一句「为什么值得看」，替代原来的技术摘要 | LLM 选品+写理由，候选来自已去重的 Top 列表 |

原来的数字叙述段（「本周共 927 条…推理 542 条…」）**已从正文移除** —— 这些信息保留在头部一行元数据里。

### 7.2 数据来源与降级

- 服务端 `llm_digest_insight()` 生成 `weekly_digest.insight`，写入 `data.json`；每次采集/富化只需 **1 次 LLM 调用**。
- 没有 LLM 端点时，前端 `buildInsight()` 用确定性模板生成同结构内容（`source: "heuristic"`，UI 标注 `auto`）。
- **筛选时自动降级为确定性版本** —— LLM 写的是整周编辑视角，无法按筛选重算；确定性版本读取的正是筛选后的条目。
- 趋势徽章**始终由数据计算**，只让模型写说明文字：避免模型自行编造「上升/下降」。

### 7.3 趋势计算的两个陷阱（已规避）

1. **不能用绝对量比较**。快照按 repo 截断，本周条目多只是因为抓得多。改为比较**模块占比**（share），而非计数。
2. **基线过薄时不下结论**。上周样本 < 20 条时统一标记「平稳」，而不是让每个模块都显示「升温」。实测上周仅 125 条（截断所致），若用绝对量会得出「全线飙升」的假象。

### 7.4 实测输出（2026-W42）

**本周重点**
> • vLLM 本周聚焦 RFC 推进，#62150 提出 PD 分离与 RL 生命周期协同方案，#62100 探索模型与平台定制化的 KV cache 规划
> • SGLang #44786 发布 SPICY-KV 提案，基于预 RoPE 代数多重网格压缩 RadixAttention，宣称 28.6x–50x 压缩比
> • CUDA/Kernel 模块在多框架同步推进，重点修复 Triton attention tiling 在 batch-invariant 模式下随 batch 组成变化导致确定性失效
> • Quantization 模块修复 NVFP4 MoE 后处理对 expert 权重 rename/repack 时 CPU offload 丢失 resident 的问题

**模块趋势**：CUDA/Kernel 240 升温 · Quantization 149 升温 · GRPO/PPO 136 降温 · Attention 133 升温 · MoE 120 升温 · Checkpoint 94 平稳

**重点 PR**（带理由）：
> vllm #62137 — 修复 Triton attention tiling 在 batch-invariant 模式下随 batch 组成变化而漂移，直接影响确定性推理与可复现性保证。
> vllm #62155 — 在 ShardedStateLoader 中拒绝 tensor-parallel 布局不匹配的 checkpoint，避免静默加载产生错误输出。

### 7.5 验证

- `tsc --noEmit` / `npm run build` / `py_compile` 通过。
- 浏览器：无筛选显示 LLM 版（`Modules & trends · AI`），筛选 sglang 后自动切 `auto` 且内容随筛选变化，0 console 错误。
- 截图：`eval-shots/digest-03-editorial.png`、`digest-05-overview.png`（Overview 紧凑版只保留 2 条本周重点）。
