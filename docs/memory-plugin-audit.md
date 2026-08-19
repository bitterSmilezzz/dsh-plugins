# DSH 记忆插件市场候选审计（对照伞目录契约）

> 2026-08-19 · 审计人：agent（本会话）· 对象：市面 13 个 DSH 记忆类插件（来自上次市场调研）
> 目的：判断哪些候选符合本仓库（dsh-plugins meta-repo）的项目约束与契约，可作为
> `dsh-memory` 的替代/补充，或列入 README「社区推荐（不收编）」。
> 判定依据：AGENTS.md（Pi 契约红线 + DSH 官方规则）、THIRD-PARTY.md（第三方治理）、
> `scripts/check-consistency.mjs`（manifest 契约）、dsh-plugin-development skill（bundle 包契约）。
> 证据为各仓库 GitHub 默认分支 + npm registry 实时抓取（2026-08-19）。

## 0. 契约清单（审计用的五组约束）

| 组 | 契约 | 内容 |
| --- | --- | --- |
| M1 manifest | plugins.json schema | `id` 唯一；`type ∈ bundle\|skills`；`source ∈ github\|local`；github 源 `repo/ref/path` 格式；fork 必声明 `upstream`（check-consistency.mjs 硬校验） |
| M2 bundle 包 | dsh-plugin-development §3 | `package.json` 有 `dsh.bundle.patch` → `cordis.patch.yml` 存在且为顶层数组；`dsh.client.platform: web` 时必须有真实 `exports["./client"]`；`files`/exports 与实际产物一致；Node 引擎兼容（本机 node v22.22.3） |
| M3 安装通道 | AGENTS §7 / 伞目录实践 | 伞目录习惯 GitHub 直装（`dsh plugin add github:<repo>#<ref>`）：**lib/ 构建产物必须入库**，或提供 `prepare`（pnpm ≥10 需 allowBuilds）；npm 发布包可走 `dsh plugin add <pkg>`；**包名/行 id 不得与伞目录已有插件冲突** |
| P1 Pi 红线 | AGENTS「Pi 契约约束」 | ①代码即真相：禁止**默认**引入持久化记忆/向量库/RAG 到核心；②工具数 ≤3 默认、>5 专项评审、>10 必须拆分；③不内置重功能：不默认 MCP/子代理/计划模式/内置 todo；④Context 最贵：零多余上下文注入（按需而非全量）；⑤复杂系统是负债：新增依赖/工具须有不可替代性论证 |
| G1 治理 | THIRD-PARTY.md | 各子项目 License 为 MIT；改过的第三方必须 fork 上游 + 单 commit 本地修改 + `upstream` 登记；不收编的进 README「社区推荐」 |

## 1. 候选总览

| # | 包名（安装 id） | 仓库 | ★ | License | npm | GitHub 直装 | patch 行 id | 模型工具数 | 判定档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | dsh-memory-vault | [flymysql/dsh-memory](https://github.com/flymysql/dsh-memory) | 3 | MIT | ✓ 0.1.5 | ✓ lib 入库 | **dsh-memory** ⚠️ | 3 ✓ | 🟡 |
| 2 | @towzai/dsh-memory | [Towzai/dsh-memory](https://github.com/Towzai/dsh-memory) | 3 | MIT | ✗ 未发 | ✓ lib 入库 | **dsh-memory** ⚠️ | 6 | 🟡 |
| 3 | dsh-mnemon | [omdsh-dev/dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) | 122 | MIT | ✓ 0.2.11 | ✗ lib 未入库 | mnemon | 13+ | 🔴 |
| 4 | meow-memory | [Phant0Meow/dsh-meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) | 15 | MIT | ✓ 0.10.0 | ✗ lib 未入库 | meow-memory | 7 | 🟠 |
| 5 | @dsh-memory/bundle | [Jesse-njx/dsh-memory](https://github.com/Jesse-njx/dsh-memory) | 2 | MIT | ✗ 未发 | ✗ lib 未入库+无 prepare | **dsh-memory** ⚠️ | 2 ✓ | 🟡 |
| 6 | dsh-memento | [PerryLink/dsh-memento](https://github.com/PerryLink/dsh-memento) | 59 | **Apache-2.0** ⚠️ | ✓ 0.4.2 | ✓ lib 入库 | memento | 2 ✓ | 🟡 |
| 7 | dsh-memory (ben7am1n) | [ben7am1n/dsh-memory](https://github.com/ben7am1n/dsh-memory) | 1 | MIT | ✓ 0.1.0 | ✗ lib 未入库（prepare=tsdown） | memory | 3 ✓ | 🟡 |
| 8 | dsh-plugin-meta-memory | [YYTbit/dsh-plugin-meta-memory](https://github.com/YYTbit/dsh-plugin-meta-memory) | 3 | MIT | ✓ 0.1.1 | ✗ lib 未入库（prepare=tsc） | meta-memory | 0 ✓ | ✅ |
| 9 | dsh-nocturne-memory | [RealAlexandreAI/dsh-nocturne-memory](https://github.com/RealAlexandreAI/dsh-nocturne-memory) | 1 | MIT | ✓ 0.1.4 | ✗ | nocturne-memory | 5 | 🔴 |
| 10 | dsh-tdai-memory | [Scorp1o117/dsh-tdai-memory](https://github.com/Scorp1o117/dsh-tdai-memory) | 6 | MIT | ✓ 0.2.10 | ✓（根文件入库） | tdai-memory | 2 ✓ | 🟠 |
| 11 | @chenhw7/dsh-memory | [chenhw7/dsh-memory](https://github.com/chenhw7/dsh-memory) | 1 | MIT | ✓ 0.1.1（scoped） | ✗ lib 未入库（prepare=build） | memory-store / tool-memory | 6 | 🟠 |
| 12 | dsh-plugin-claude-bridge | [YYTbit/dsh-plugin-claude-bridge](https://github.com/YYTbit/dsh-plugin-claude-bridge) | 9 | MIT | ✓ 0.1.1 | ✗ lib 未入库（prepare=tsc） | claude-bridge | 0 ✓ | ✅ |
| 13 | dsh-claude-move | [PerryLink/dsh-claude-move](https://github.com/PerryLink/dsh-claude-move) | 6 | **Apache-2.0** ⚠️ | ✓ 0.2.4 | ✓ lib 入库 | claude-move | ~5 | 🟠 |

判定档：✅ 完全合规（可直接试用/列社区推荐）· 🟡 形态合规但存在冲突或待办 · 🟠 超红线需专项评审 · 🔴 不符合。

## 2. 致命契约冲突（必须先解决的事项）

### 2.1 行 id = `dsh-memory` 冲突（3 个候选）

`cordis.patch.yml` 的 `- insert: - id: dsh-memory` 是配置树行身份，**后层按 id 覆盖前层**。
伞目录自有 [dsh-memory](https://github.com/bitterSmilezzz/dsh-memory) 的 patch 行 id 就是 `dsh-memory`，
以下三个候选若与它同装，**必有一方配置被整体覆盖**（后装者赢，先装者静默失效）：

- `dsh-memory-vault`（`- id: dsh-memory, name: 'dsh-memory-vault'`）
- `@towzai/dsh-memory`（`- id: dsh-memory, name: '@towzai/dsh-memory'`）
- `@dsh-memory/bundle`（`- id: dsh-memory, name: '@dsh-memory/bundle'`）

→ 收编/推荐任何一者前，必须 fork 并把 patch id 改为自有 id（如 `dsh-memory-vault`），
仿 aqua 先例（上游 patch id 对齐本地名）。

### 2.2 包名 = `dsh-memory` 冲突（ben7am1n）

ben7am1n/dsh-memory 的 **npm 包名就叫 `dsh-memory`**（npm 已发 0.1.0）——与伞目录自有插件的
安装 id 同名，**npm 层无法同装**，plugins.json 登记也会撞 id。要采用必须 fork 改名
（如 `dsh-memory-lite` / `memory-facts`）再重新发布或走 GitHub 源。

### 2.3 安装通道断裂（@dsh-memory/bundle）

Jesse-njx 的 `@dsh-memory/bundle`：npm 未发布（E404）、GitHub 无 `lib/`（只提交 `src/`）、
无 `prepare` 脚本 —— **当前没有任何可用的 `dsh plugin add` 通道**。设计（引证记忆）最契合
本仓库理念，但落地需要：作者发 npm，或本地 `pnpm install && pnpm build` 后走本地路径安装。

### 2.4 仅 npm 可装（GitHub 直装缺 lib）

`mnemon / meow-memory / ben7am1n / meta-memory / nocturne / @chenhw7 / claude-bridge` 的
`lib/` 均未入库（.gitignore 忽略构建产物），GitHub 直装会缺 `lib/index.js`（伞目录已踩过
market/better-sidebar 同款坑）；走 npm 通道安装，或按伞目录惯例 fork 后「lib 入库 + 去 prepare」。

## 3. Pi 契约逐项判定

### 3.1 工具数红线（≤3 默认 / >5 评审 / >10 拆分）

| 候选 | 工具数 | 判定 |
| --- | --- | --- |
| meta-memory / claude-bridge | 0（纯 prompt section） | ✅ 最轻，零工具 schema 开销 |
| memento / jenjx / tdai / ben7am1n / vault | 2–3 | ✅ 合规 |
| nocturne | 5 | 🟠 压线，评审边缘 |
| claude-move / towzai | 5–6 | 🟠 需专项评审 |
| meow-memory / @chenhw7 | 6–7 | 🟠 需专项评审（meow 达 7，接近拆分线） |
| dsh-mnemon | 13+（mnemon_\* 系列） | 🔴 **违反「>10 必须拆分」** |

### 3.2 注入策略 ×「Context 是最贵资源」（零多余注入）

| 候选 | 注入策略 | 每轮固定开销 |
| --- | --- | --- |
| **jenjx** | 会话后蒸馏成索引行（name—description），正文 `memory_read` 按需展开 | 低 ✓ |
| **ben7am1n** | pinned 优先 + 最近更新，字符预算内注入（promptMaxChars） | 低（有界）✓ |
| **meta-memory** | brief 自动注入，≤4KB 预算 | 低（有界）✓ |
| **towzai** | 首轮标题注入 + `view` 按需展开，KV 缓存友好（正文不进历史） | 低 ✓ |
| **memento** | ctx.memory seam + 审批门控，注入克制 | 低 ✓ |
| meow-memory | 首轮长期记忆块 + 每消息关键词命中（top-2，含衰减/去重） | 中（每消息检索）⚠️ |
| vault | **每轮 system-prompt 注入**最近条目（injectLimit=8） | 高 ✗ |
| mnemon | Runtime 记忆每轮 + Spaces 按需；三层结构 | 中高（依 provider）⚠️ |
| tdai | L0-L3 自动提取 + 自动召回注入 | 中 ⚠️ |
| nocturne | boot 协议注入 core memories + 工具检索 | 中 ⚠️ |

### 3.3 「不内置重功能 / 复杂系统是负债 / 供应链纪律」

- 🔴 **dsh-nocturne-memory**：硬依赖**自建 Nocturne MCP server** —— 直接违反「不默认引入 MCP」。
- 🔴 **dsh-mnemon**：9 个可插拔外部 provider（Mem0 / Honcho / Hindsight / Holographic / RetainDB /
  ByteRover / Supermemory / OpenViking / 原生 Mnemon）—— 外部记忆服务依赖面过大。
- 🟠 **dsh-tdai-memory**：`sqlite-vec`（原生 alpha）+ `@tencentdb-agent-memory/tcvdb-text` +
  `@node-rs/jieba`（原生）—— 原生模块供应链负担；复用 `~/.memory-tencentdb` 外部数据。
- 🟠 **meow-memory**：七层记忆 + BM25 + 艾宾浩斯衰减 + 夜间 dream + 反思 —— 复杂度最高的设计。
- 🟠 **towzai**：embedding 语义检索走本地 `/api/embed`，依赖 harness 侧 embedding 供应商配置
  （未配置则检索静默降级）。
- ✅ **ben7am1n**：零运行时依赖（SQLite FTS5，node:sqlite 内建）；**jenjx**：零新依赖，复用
  `ctx.llm`/会话日志；**meta-memory / claude-bridge / memento / vault / meow**：依赖面干净。

### 3.4 License 契约

伞目录约定各子项目 MIT；**memento（Apache-2.0）与 claude-move（Apache-2.0）不符**——如收编/推荐
需用户确认接受 Apache-2.0（或 fork 改许可需上游同意，一般不建议）。

## 4. 逐候选结论摘要

- ✅ **dsh-plugin-meta-memory**（YYTbit）：0 工具 + brief 注入，纯 prompt/skill 方案，最轻。
  小坑：`exports` 缺 `./cordis.patch.yml`（官方模板含该项）。**完全合规候选。**
- ✅ **dsh-plugin-claude-bridge**（YYTbit）：0 工具，迁移 Claude Code 记忆/技能/全局指令进
  system prompt（`claude-bridge:memory/skills/global` sections）。非记忆运行时，是迁移工具。
  同样 exports 小坑。**合规候选（迁移场景）。**
- 🟡 **ben7am1n/dsh-memory**：形态最贴合伞目录理念（3 工具 / 零依赖 / 有界注入 / 极简）。
  唯一硬伤是**包名 = dsh-memory 与自有插件冲突** —— fork 改名后是理想替代。⭐ 首选替代候选。
- 🟡 **@dsh-memory/bundle**（Jesse-njx）：引证记忆设计（citation 指回原始日志、人类可审计 md 文件、
  蒸馏索引+按需展开）最契合「代码即真相」；**安装通道断裂**是唯一阻塞。⭐ 设计最佳候选。
- 🟡 **dsh-memory-vault**：3 工具合规、lib 入库可 GitHub 直装、带浏览器管理页；但**每轮全量注入**
  与「零多余注入」相悖 + patch id 冲突。改 id 后可作轻量替代。
- 🟡 **dsh-memento**：工程化最规范（审批门控 + 日志重建审计 + typed seam）、lib 入库双通道；
  License 与 `immediately:true` 两处需确认。
- 🟡 **@towzai/dsh-memory**：注入理念最贴合（首轮标题 + 按需展开 + KV 缓存友好）；6 工具超红线、
  embedding 依赖 harness 配置、patch id 冲突。评审后可考虑。
- 🟠 **meow-memory**：功能最全（七层 + dream），依赖干净、无外部服务；7 工具 + 七层复杂度超纲，
  工程量大。适合「想要完整分层记忆」的专项场景。
- 🟠 **@chenhw7/dsh-memory**：结构正规、scoped 包名无冲突、复用 storage-domain；6 工具超红线。
- 🟠 **dsh-tdai-memory**：2 工具合规但原生依赖（sqlite-vec/tcvdb/jieba）与 TencentDB 外部数据耦合。
- 🟠 **dsh-claude-move**：迁移工具，5+ 工具压线 + Apache-2.0。
- 🔴 **dsh-mnemon**：>10 工具违反拆分红线 + 9 个外部 provider，功能再强也不符合伞目录 Pi 契约。
- 🔴 **dsh-nocturne-memory**：MCP 硬依赖，直接违反「不内置重功能」铁律。

## 5. 落地建议（替换 dsh-memory 的路径）

1. **首选（极简替代）**：fork `ben7am1n/dsh-memory` → 改名（如 `dsh-memory-lite`）→
   改 patch 行 id → lib 入库或保留 prepare（走 npm 装）→ 登记 `plugins.json`
   （`origin: third-party-fork` + `upstream`）→ THIRD-PARTY.md 记录 → 试用对比。
2. **设计优先（可审计）**：盯 Jesse-njx 发 npm；或本地 `pnpm install && pnpm build` 后
   用本地路径安装验证，评估后决定是否 fork。
3. **轻量检索**：towzai 评审 6 工具后可替代；vault 改 id 后可作带 UI 的轻量方案。
4. **迁移 Claude Code 记忆**：claude-bridge（0 工具，纯 section）直接可用，走 npm 装。
5. **不收编路线**：把 ✅/🟡 中合规项（meta-memory、claude-bridge、ben7am1n 改名版、
   jenjx 发版后）列入 README「社区推荐（不收编，各自维护）」表，附 ⚠️ 注意项。
6. 所有列入动作都需：`check-consistency.mjs` 全过 → README/AGENTS/THIRD-PARTY 同步 →
   NOTES.md 落档 → commit+push。

## 附：证据来源

- 各仓库 GitHub 默认分支 `package.json` / `cordis.patch.yml` / 目录树（2026-08-19 抓取）
- npm registry：`npm view <pkg> version`（vault/memento/tdai/memoria/mnemon/meow-memory/
  nocturne/meta-memory/dsh-memory(mnemon 版)/claude-bridge/claude-move 已发布；
  @towzai/dsh-memory 与 @dsh-memory/bundle 未发布）
- 工具数：各包 `lib/index.js`（或 `index.mjs`/`dist/index.js`）grep `defineTool`/`name:` +
  README 工具表交叉核对；meow 工具数以 README 为准
