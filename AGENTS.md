# AGENTS.md

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件仓库的 agent 契约。
本仓库是**所有新增插件的共同遵循仓库（伞仓库）**：承载全部插件契约，并承担新插件的校验与
测试；经验档案见 [doc/experience/](doc/experience/)（按主题分类）。本文件**只承载契约**
（`CLAUDE.md` 是其软链）。**本契约版本无关**：不绑定任何 DSH 版本号，
随官方契约演进另行评估，不因版本变更自动失效。

> **⚑ 硬性约束（必须执行）**：每个对话 / agent 任务在**结束前**，必须把本次任务的经验落档到
> [doc/experience/](doc/experience/) 对应主题文件（踩过的坑、契约细节、决策理由、失败原因；
> 无新增经验也须明确说明「本次无新增经验」）。格式：短标题 + **问题 → 原因 → 解法 → 可复现?**，
> 追加在对应主题文件最上方（新→旧）。未落档视为任务未完成。

## Pi 契约约束（⚑ 强制，源自 pi-agent 作者实践）

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

## DSH 官方规则契约（⚑ 强制）

- **⚑ 不改动 DSH 源码**：所有修复只走插件 / settings / 预设层，**禁止修改 harness 内部包源码**。
- **⚑ 契约先查 Inspect Provider**：写码前用 `cordis_inspect_list` / `cordis_inspect_query` 拿确切
  Service / Event / Builtin / Slot / Tool 签名，**禁止猜字段**。
- **⚑ 遵循 DSH 官方插件开发规范**：
  - 硬依赖 `inject: ['serviceName']`，可选服务 `ctx.get('serviceName')` 处理 undefined
  - 副作用全部挂在当前 fiber 上（`ctx.effect()` / `ctx.on()` / 返回 disposer），stop/update/undefine 时全部回收
  - Host ↔ Client 只走 package 私有 JSON 方法，只传无损 JSON
  - 数据只读叶子字段，不序列化活对象
- **⚑ 不破坏官方行为**：插件 patch 只追加/覆盖配置，不绕过官方安全门禁（api-proxy 准入、
  sandbox policy、capability ACL）。不 hack 官方 client.js 内部逻辑。

## 新插件校验与测试契约（⚑ 强制，伞仓库职责）

> 本仓库是所有新增插件的共同遵循仓库，**承担新插件的校验与测试**：新插件登记发布前，须在
> 本仓库通过校验设施（`scripts/validate-plugin.mjs` 按契约逐条静态检查，GitHub Actions 自动
> 校验 `scripts/manifest.json` 中全部插件，失败开 Issue），并对照本文全部契约逐条自检；
> 未通过不得发布。

## DSH-Store 准入契约（⚑ 强制，第三方商城上架门禁）

> 契约**单一来源在本节**：所有伞下插件仓库的 AGENTS.md 只放指向本文件的指针，不复制内容。
> 本伞下插件若面向第三方商城 [DSH-Store](https://github.com/AI-Scarlett/dsh-safe-plugin-manager)
> （AI-Scarlett/dsh-safe-plugin-manager：第三方 DSH 插件商城 + 安全生命周期管理器）上架，
> 须满足其[目录准入规则](https://github.com/AI-Scarlett/dsh-safe-plugin-manager/blob/main/registry/README.md)；
> 违反任一条即被自动拒绝（blocked），并触发 GitHub 作者整改通知。开发与发布前逐条自检。

- **⚑ 固定源发布**：只以公开 GitHub 仓库分发，`commit` 固定 40 位不可变 commit；不发布浮动
  分支引用（`#main` 等）、npm-only、本地路径或任意下载 URL 作为分发入口。
- **⚑ manifest 一致**：`package.json` 声明 `dsh.bundle.patch`，`version` 与固定 commit 的
  manifest 一致；monorepo 以 `installPath` 唯一定位插件目录。
- **⚑ 入口唯一，不动官方组件**：`entryIds` 与 Bundle Patch 插入的 DSH ID 一致且全局唯一；
  **禁止禁用、替换、遮蔽或重复安装任何 `@deepseek-ai/*` 官方组件**（含 `disabled: true`
  禁用官方 entry——这是 DSH-Store 拒绝的高频原因）。增强官方 UI 一律用 slot 注入叠加，
  不靠禁用官方 entry。
- **⚑ 命名空间合规**：不以 `@deepseek-ai/*` 命名空间发布自有包。
- **⚑ 生命周期脚本透明**：`preinstall/install/postinstall/prepare` 等脚本显式列出；
  没有则明示「无」。
- **⚑ 权限保守披露**：manifest 与 README 声明文件/网络/命令/凭据访问及权限等级——
  `low`（完全无访问）/ `medium`（有限范围只读、插件私有状态、指定服务或受限命令）/
  `high`（Profile/会话/敏感持久状态、任意网络、任意 Shell、凭据、插件生命周期管理）；
  无证据写 `unknown`，禁止写成 `none`。
- **⚑ README 完整**：写明用途、安装/启用方式、外部依赖、权限与已知风险；名称用
  「中文名（English Name）」，description 含中文用途，提供 searchTerms 中文搜索词。
- **⚑ 可验证**：`npm run validate:registry` 通过；高权限、原生构建或外部服务依赖附
  一次性 Profile 的安装与功能验收证据。
- **被拒即整改**：收到 blocked / 候选拒绝（`statusReason`）后，定位违规点修复并重新提交；
  不得绕过门禁直接分发（手动安装入口只作临时通道，不受商城事务保护）。

## DSH Standard（dsh-std）协议契约（⚑ 强制，生态互操作标准）

> 本伞下插件若实现、扩展或贡献 [DSH Standard](https://github.com/Yan-Zero/dsh-std)
> （`@dsh-std/*` 生态通用互操作协议）相关协议，须遵守其 [AGENTS.md 契约](https://github.com/Yan-Zero/dsh-std/blob/main/AGENTS.md)，
> 核心规则如下（权威原文见上链接，此处为单源摘要）。

- **⚑ 边界**：dsh-std 只定义实现无关的协议，不是产品运行时，也不规定 DSH / 插件内部架构；
  `@dsh-std/core` 是 meta-protocol（关于协议的协议），不得因为多个领域包共用就吸收领域行为；
  产品集成一律走 adapter（如 `@dsh-std/adapter-dsh`），可移植协议包不得 import adapter 或产品运行时。
- **⚑ 协议变更成文**：每个公开协议包或实质协议变更必须有 `docs/proposals/` 对应提案；提案、
  导出类型、校验器、schema、一致性夹具与测试保持一致。
- **⚑ 权威归属**：协议的权威由规范与坐标（apiVersion/kind）决定，不由当前实现仓库决定；
  私有协议用自有命名空间 apiVersion，走同一套声明与协商机制。
- **⚑ 依赖克制**：不使一个协议依赖无关协议，除非规范语义要求；不把实现便利、仓库布局或
  单一产品限制写成规范要求。
- **⚑ RFC 式提案**：提案按 RFC 规范书写——范围/术语/数据模型/必需行为/协商规则/生命周期/
  错误/安全/兼容性；用 MUST / MUST NOT / SHOULD / SHOULD NOT / MAY（中文文档给中文对应）；
  只描述可观察行为与互操作要求，示例与理由不得替代规范；不写实现路线图、任务清单、进度报告、
  重构计划、自我批评或回顾叙述；不指定参考实现项目；不把未解决的实现工作写成协议要求；
  替换重复材料时保持稳定文档路径。
- **⚑ 验证**：改动代码/schema/包元数据/一致性行为后跑 `pnpm check`；交接前 `git diff --check`；
  保留工作树中与本任务无关的用户改动。

## License

各子项目均为 **MIT**（见各自 LICENSE）。本仓库以 MIT 对外分发。
