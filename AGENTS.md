# AGENTS.md

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件仓库的 agent 根约定。
面向访客的说明与安装见 [README.md](README.md)；本文件（`CLAUDE.md` 是其软链）供编码 agent
打开仓库即见。**改动任何子项目前必读本文与 NOTES 索引**。

> **⚑ 硬性约束（必须执行）**：每个对话 / agent 任务在**结束前**，必须把本次任务的经验落档到
> [NOTES.md](NOTES.md)（踩过的坑、契约细节、决策理由、失败原因；无新增经验也须明确说明
> 「本次无新增经验」）。格式：短标题 + **问题 → 原因 → 解法 → 可复现?**，追加在最上方（新→旧）。
> 未落档视为任务未完成。

## 仓库概况

- **DSH 场景化插件 meta-repo（纯汇总仓库）**：自研 bundle 插件为 5 个独立仓库（essentials
  已并入 ui-tweaks，dsh-core 已内联清理删除，dsh-usage-plugin 同日脱钩内化改自研），
  技能包保持 dsh-skills 合并仓，第三方 fork
  保持独立（2026-08-19
  定型）；本仓库只维护 `plugins.json`（来源真相，见 [README.md](README.md#目录)）、
  安装脚本与文档。
  所有插件由 `install.sh` 按清单 GitHub 直装；纯技能包由 `install.sh` clone 后
  复制到 `~/.agents/skills`。
- **插件清单**（均在 `bitterSmilezzz/` 下，见 `plugins.json`）：
  - **自研 bundle（独立仓库）**：`dsh-memory`、`dsh-visualize`、
    `dsh-ui-tweaks`、`dsh-work`、`dsh-usage-plugin`（2026-08-19 从合并仓拆回独立仓库；
    同日 essentials 并入 dsh-ui-tweaks，直接 `github:<repo>#<ref>` 安装；dsh-core 因无多消费者
    同日内联清理删除；dsh-usage-plugin 同日脱钩内化改自研）
  - **技能合并仓**：`dsh-skills`（子包 dsh-dev/writing/design，经 `&path:/<子包>` 安装）
  - **第三方 fork（独立）**：`dsh-better-sidebar`、`dsh-market`、
    `DSH-Transparent-UI-Plugin`（aqua）
  - **自研独立**：`dsh-desktop-shell`（原生代码）
- **依赖引用**：bundle 插件均为独立仓库，直接 `github:<repo>#<ref>` 安装；仅 dsh-skills
  技能包子包用 `&path:/<subdir>` 语法。dsh-core 已于 2026-08-19 内联清理删除
  （mergeConfig/dedupeBy 内联进 ui-tweaks/work，hashString/sanitizeSettings 无消费者废弃）。
- **插件形态**：真 bundle 是 **bundle 补丁**（`dsh.bundle.patch` → `cordis.patch.yml` 插入 host
  插件 + `dsh.client` 可选浏览器半区）；纯技能包不是 bundle，不走 `dsh plugin add`。

## 参照项目与文档

官方资料链接见 [README.md](README.md#依赖的参照项目与文档)。写码前先查 **Inspect Provider**
（`cordis_inspect_list` / `cordis_inspect_query`）拿确切 Service / Event / Builtin / Slot / Tool
契约，别猜字段。**本机以 npm 版 dsh（rc.7，`/opt/homebrew/bin/dsh`）为准，不存/不改 harness
源码**；契约不确定时读 npm 包产物（`/opt/homebrew/lib/node_modules/@deepseek-ai/`）或官方
GitHub。

## 目录结构

```
AGENTS.md（本文件） · CLAUDE.md（→AGENTS.md） · README.md（访客清单） · NOTES.md（经验）
plugins.json（来源真相清单） · scripts/（install.sh 一键装 + 一致性守护脚本 + 拆分工具）
```

新增插件：自研 bundle 创建**独立仓库**，技能加入 `dsh-skills` 子包 →
登记 `plugins.json`（source=github + repo + ref + path + type）→ 根 README 与 NOTES 各补一行清单。

## 本地仓库组织约定

所有 GitHub 上的 dsh 插件仓库统一放在一个**伞目录**下（跨平台约定；Windows 当前为
`D:\workspace\deepseek-harness`，macOS 参照同一约定自行设定伞目录路径）。伞目录内含各插件
独立 git 仓库（如 `dsh-ui-tweaks`、`dsh-ui-aqua`、`dsh-desktop-shell`）、`deepseek-harness`
源码 checkout（仅参照用）、`doc/` 本地修复/迁移记录。

**meta-repo 保持干净**：本仓库只存 `plugins.json` + 脚本 + 文档；编译产物（如 `target/`）、
运行时数据（如 `dsh-usage/usage-records.json`）、个人待尝试清单（`plugin-list.txt`）
一律 gitignore 不入库。

## 第三方插件维护（fork / 收编治理）

多个组件来自社区。改动前必读 [THIRD-PARTY.md](THIRD-PARTY.md)（来源 / 本地修改 / 升级流程）：

- **改过的第三方 → fork 上游仓库**：本地改动以单 commit 提交在 fork 上（如
  `bitterSmilezzz/DSH-Transparent-UI-Plugin`），升级 = `git fetch upstream && git merge
  upstream/main` 后对照 THIRD-PARTY.md 复查修改点；不再 `subtree` 收编进汇总仓库。
- **已脱离上游**：`dsh-at-file`（filter-repo 重写历史单作者化）、`dsh-paste-input`
  （用户决定脱钩，未重写历史——差异刻意）、`dsh-memory`（已拆独立仓库）；源码在
  `dsh-ui-tweaks/lib/{at-file,paste-input}/` 或各自独立仓库，不再 `subtree pull`。
- **原样收编**：`dsh-router-standard`（可直接跟随上游）。
- **改第三方插件改完立即提交**（并行会话 git checkout 会清未提交工作）。

## 插件设计规范与准则

- **遵循 DSH 插件规范，支持当前最新版本**：bundle 补丁 / client-host 契约 / inject 声明，不绕开官方扩展点；升级基线、及时适配契约变化（如 rc.7 keyed slot）。
- **核心最小化（Pi 理念）**：默认只给模型最少必要工具；能力按需通过 skill / 脚本 / 扩展 / 插件包添加，不把重功能塞进核心。
- **不内置重功能（Pi 理念）**：不默认引入 MCP、子代理、计划模式、内置 todo、后台 bash、权限弹窗；用 CLI 工具 + README（skill）、TODO.md、tmux、容器/沙箱、显式确认流实现同等能力。
- **可扩展优先（Pi 理念）**：插件适配用户工作流，而不是让用户适配插件；保持核心小，把选择权交给 skill / 扩展 / 脚本。
- **开箱即用，配置全面**：默认配置自动初始化，交互上减少用户配置；高级用户仍可通过配置调整全部行为，不牺牲可定制性。
- **设计简单，减少理解成本**：界面、交互、配置保持简单直接，降低用户理解成本；不为炫技增加概念。
- **代码即真相**：不依赖记忆系统 / RAG；模型擅长读代码结构，真相放在代码与 git 历史里。
- **Bash 足够用**：Bash 像编程语言可任意组合；大部分场景 skill + 脚本即可，不优先引入 MCP / 专用工具。
- **复杂系统是负债**：额外的记忆系统、MCP、专用工具只会浪费 token、增加失败调用、制造复杂性；用代码 + Bash + git 历史更可靠、更快。
- **Context 是最贵资源**：上下文窗口有限且昂贵；工具越少、越精准，Agent 越高效。
- **依赖与供应链纪律（Pi 理念）**：lockfile 即真相、依赖精确锁定、install 脚本按需审查；不静默引入生命周期脚本或不可控依赖。

## 写 DSH 插件的注意事项 / 最佳实践

- **先查契约再写码**：Inspect Provider 拿确切签名；运行时调真实 Service / 听真实 Event，
  别把 inspect 结果当业务数据缓存。
- **服务依赖要声明**：硬依赖 `inject: ['serviceName']` 后访问 `ctx.serviceName`；可选服务用
  `ctx.get('serviceName')` 处理 undefined。
- **数据别序列化活对象**：Service / Session / Slot 是内部活数据，只读叶子字段，别整对象 dump。
- **每个副作用都可逆**：挂在当前 fiber 上（`ctx.effect()` / `ctx.on()` / 返回 disposer 的官方
  API），stop / update / undefine 时全部回收。
- **Host ↔ Client 通信**：只走 package 私有 JSON 方法（Client `host.call` ↔ Host `harness.handle`），
  只传无损 JSON；重活放 Host。
- **版权 / 合规**：涉及第三方数据注意 UA / Referer / Cookie、防盗链、登录态隔离；隐私操作
  （如把登录 URL 交给第三方）在 README 写清楚。
- **保持子项目自成一体**：能力/安装/依赖/限制/License 放各自 README，根目录只罗列与链接。

## 项目设计理念与约束（⚑ 强制）

> 以下理念与约束源于对 [pi-agent](https://github.com/Ashutosh0428/pi-agent) 设计哲学的
> 借鉴，结合本仓库 DSH 插件定位落地。**所有子项目的设计、开发、评审均须遵循。**

### 设计理念（pi-agent 启发）

- **极简主义 —「Bash is all you need」**：工具/模块/预设的数量与每请求 token 固定开销正相关。
  每增加一个工具就增加 schema 开销，每增加一个预设就增加 system prompt 长度。**新增能力前先看能否用现有机制组合出来**，不做重复功。
- **用户决定需要什么，而非工具替用户决定**：不堆预设/路由/模式切换。提供最基础的能力层，
  让 LLM 推理决定怎么用。**智能来自 LLM 的思考，而非工具的编排**。
- **成本控制从架构根源做起**：tool schema 精简（低频 demote/移除）、零多余上下文注入
  （按需加载而非全量预载）、无复杂调度层（减少中间件 token 烧耗）。
- **输出精炼、状态可见、操作可逆**：UI/UX 追求简洁，信息密度高但不杂乱，副作用全部可回收。

### Pi 契约约束（⚑ 强制，源自 pi-agent 作者实践）

> 以下约束源于 [pi-agent](https://github.com/Ashutosh0428/pi-agent) 两位作者的实战经验，
> 作为**硬性审计标准**写入本仓库。每个插件的设计、评审、安装决策均须对照检验。

- **⚑ 代码即真相**：不依赖记忆系统 / RAG；模型擅长理解代码结构，真相放在代码与 git 历史里。
  禁止引入任何形式的持久化记忆、向量数据库、RAG 检索作为默认能力。
- **⚑ Bash 足够用**：Bash 像编程语言可任意组合；大部分场景 skill + 脚本即可，不优先引入 MCP / 专用工具。
  新增能力前先问「bash + 现有工具能不能组合出来？」—— 能就不造新轮子。
- **⚑ 复杂系统是负债**：额外的记忆系统、MCP、专用工具只会浪费 token、增加失败调用、制造复杂性；
  用代码 + Bash + git 历史反而更可靠、更快。每增加一个依赖/工具须有明确的不可替代性论证。
- **⚑ Context 是最贵资源**：LLM 上下文窗口有限且昂贵；工具越少、越精准，Agent 越高效。
  单个插件工具数默认不超过 3 个；超过 5 个需专项评审；超过 10 个必须拆分。
- **⚑ 核心最小化**：默认只给最少必要工具；能力按需通过 skill / 脚本 / 扩展 / 插件包添加，
  不把重功能塞进核心。核心插件（ui-tweaks）宿主工具 ≤ 2，客户端工具 ≤ 3。
- **⚑ 不内置重功能**：不默认引入 MCP、子代理、计划模式、内置 todo、后台 bash、权限弹窗；
  用 CLI 工具 + README（skill）、TODO.md、tmux、容器/沙箱、显式确认流实现同等能力。
- **⚑ 用户决定需要什么**：插件适配用户工作流，而不是让用户适配插件；保持核心小，
  把选择权交给 skill / 扩展 / 脚本。不替用户做路由/模式/工具编排决策。

### DSH 官方规则契约

- **⚑ 不改动 DSH 源码**：本机 dsh 以 npm 安装版（rc.6）为准，harness 源码目录已删（零残留）。
  所有修复只走插件/settings/预设层，**禁止修改 harness 内部包源码**。
- **⚑ 契约先查 Inspect Provider**：写码前用 `cordis_inspect_list` / `cordis_inspect_query` 拿确切
  Service / Event / Builtin / Slot / Tool 签名，**禁止猜字段**。不确定时读 npm 包产物
  （`/opt/homebrew/lib/node_modules/@deepseek-ai/`）或官方 GitHub。
- **⚑ 遵循 DSH 官方插件开发规范**：
  - 硬依赖 `inject: ['serviceName']`，可选服务 `ctx.get('serviceName')` 处理 undefined
  - 副作用全部挂在当前 fiber 上（`ctx.effect()` / `ctx.on()` / 返回 disposer），stop/update/undefine 时全部回收
  - Host ↔ Client 只走 package 私有 JSON 方法，只传无损 JSON
  - 数据只读叶子字段，不序列化活对象
- **⚑ 不破坏官方行为**：插件 patch 只追加/覆盖配置，不绕过官方安全门禁（api-proxy 准入、
  sandbox policy、capability ACL）。不 hack 官方 client.js 内部逻辑。

## 踩坑 / 项目经验（NOTES.md）

**⚑ 强制落档**（呼应顶部）：每个任务结束前写入 NOTES.md，格式见顶部硬性约束。
NOTES.md 是完整档案库（~4664 行），**禁止整读**（按需读+索引+标题 grep）。

> **精简原则**：AGENTS.md 是 AI 注入文档（64KB 预算截断风险），只保留「操作规则+契约约束」。
> 详细经验见 NOTES.md，不在此逐条镜像。以下仅保留**仍具现实指导意义**的长期有效条目。

### 仍具现实意义的长期规则

- **DSH 技能斜杠调用契约**：user-only 技能斜杠必须 `/技能名`（kebab-case 无空格）；
  `/grill me` 带空格不是 token；直接说「grill me」走 grilling（model-invocable）更顺。
- **grill-me / grilling 交互契约**：使用 grill-me / grilling 这类面试型 skill 时，每个问题必须用弹窗选择（`ask_user_question` 工具）逐个发起，让用户点选回答，**不要**让用户逐条打字回复；一轮可发多个问题，但每个问题都要是可选交互。
- **inject 服务名坑**：inject 是 Cordis 服务名非 entry id；dsh-agent 服务名是 `agents`
  （`ctx.agent` 恒 undefined）；合并包 inject 并集须逐子模块核对真实服务名；无默认参数的 apply
  要 `config ?? {}` 兜底。
- **settings.yaml 别用 PyYAML 重写**：YAML 1.1 把裸 `off` 写成布尔 `false:` 键 → harness
  assertServiceable 拒 llm-pi-ai 整节 → 模型选不了；修复用带引号 `'off': null`，改完重启。
- **LLM 请求重试默认 2 次**：`llm-pi-ai`/`llm-deepseek` 无全局 retryPolicy，按供应商配
  `{mode: normal/always, maxRetries: N}`；改 settings.yaml 热重载不保证生效需重启。
- **非多模态模型发图报「不支持图片」**：api-proxy 按当前模型 `inputModalities` 准入；解法=切
  视觉模型或自定义路由声明 `input: [text, image]`；会话含图后切不回文本模型（/compact 或新会话）。
- **判断模型能否思考先查官网**：确认 thinking 开关式（`thinking:{type:enabled/disabled}`）再配
  `compat.thinkingFormat` + `reasoningEfforts`。
- **同名模型跨供应商「点击不切换」= 显示混淆**：触发器始终显示供应商名 `.dms-triggerProvider`。
- **dsh-memory 自动记忆（已脱离上游）**：`write_memory` 工具 + `memory:auto` 系统提示 +
  `turn-stopping` 兜底，所有会话自动记录有价值信息，不依赖预设。
- **router-standard 收编**：纯 JS 零依赖预设；**上游=源仓库（套装仓库 dsh-routing-suite 已弃用）**。
- **router-standard 预设**：任务感知路由（RL 接口还原 / spec 深度思考可通过 `routerMode` 配置）；
  **preset.yml 描述含 `: ` 需加引号**（YAML 解析失败→设置页无描述）。
- **插件 peerDeps 缺陷坑**：插件把 harness 内部包只声明 peerDeps 且 dependencies 为空 →
  npm 版解析不到；修法=补 dependencies + 仓库根 pnpm install。
- **npm 版本 ≠ git master**：npm 已发 rc.6 但 git master 仍是 rc.5；默认分支是 **master 不是 main**。
- **agent 会话资源画像**：工具 schema ~55 个 ≈12K tokens/请求；优化=工具描述压缩/低频 demote/长会话/compact。
- **战役方法论**：跨指标口径一致性检查；子 agent 只读审查在共享工作区并发修改时易挂起，
  改用自查 + 单测矩阵。
- **改完自动提交 + 推送**：每次改动（文档/代码/配置）完成后立即 `git add + commit`，不攒变更；对话结束后执行 `git push` 推送到远端。
  并行会话 git checkout 会清未提交工作，改完即交避免丢失；推送到远端防止本地丢失。
- **dsh-client-ui-aqua（第三方，2026-08-18 收编）**：Aqua 玻璃质感主题（毛玻璃）client-only bundle；上游 WYH66666666/DSH-Transparent-UI-Plugin；本地修改=package.json name 去 scope 对齐 npm/patch。
- **文件编码铁律**：仓库文件多为 UTF-8 + CRLF。**禁止用 PowerShell `Set-Content` 改含中文的文件**（按 GBK 解释 UTF-8 → U+FFFD mojibake，且已 push 会污染远端历史）。改 UTF-8 文件用 Node `readFileSync(...,'utf8')` + `writeFileSync(...,'utf8')`，或用 `str_replace_editor`（匹配须含 CRLF）。改坏后用 `git show` 找最后正常 commit 恢复再重放。

### 脚本与治理

- **清单一致性守护脚本**：`scripts/check-consistency.mjs`（验证 plugins.json id/type/source/repo/ref/path/fork-upstream）
- **插件清单查询**：`scripts/plugin-manifest.mjs`（list/get/skills-src，install 双脚本共用）
- **一键/批量安装脚本**：`scripts/install-plugins.mjs`（--only/--skip/--dry-run；走 GitHub 直装）
- **第三方插件治理**：THIRD-PARTY.md 追踪来源/本地修改/升级流程
- **本地开发**：插件仓库 clone 到伞目录（见「本地仓库组织约定」），profile/install 优先本地副本（link/复制），改完刷新 GUI 即生效，稳定后 push。

## License

各子项目均为 **MIT**（见各自 LICENSE）。本仓库以 MIT 对外分发。
