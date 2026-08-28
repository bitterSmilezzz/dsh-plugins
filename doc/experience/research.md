# 调研 / 分析 / 审计（75 条）

- **五插件 Alpha 1 标准优化轮（2026-08-28，调研/修复/审计）**：问题=用户要求对 dsh-model-selector/notify/shortcuts/retry-settings/asr-voice 五个插件做一轮"标准优化"（对齐 0.1.2-alpha.1 + 性能 + 规范）。解法=①**摸底（关键事实）**：alpha.1 破坏面 = `dsh-client-runtime` 包删除、拆成 `dsh-client-store`（SnapshotStore）与 `dsh-session`；npm 上**没有任何 0.1.2-alpha.1 的 client 包**（发布停在 0.1.1-rc.2，`dsh-client-store` 404、`@deepseek-ai/dsh-api-session-controller` 404）——外部独立插件无法通过 npm 升级依赖线，alpha.1 类型只能 file: 链接本地 DSH workspace（dsh-upgrade）或等待 npm 发布；`ctx.slots` merge 在 alpha.1 归 `dsh-client-ui-renderer`（npm 有 rc.2）、`ctx.sessions` 归 `dsh-api-session-controller`（npm 无）。②**model-selector 修复**：client typecheck 真失败（源码 import 了 alpha.1 才存在的新包 `dsh-session/types`+`dsh-client-store`，但 package.json 锁 rc.2 装不出）→ devDependencies 加 `file:../../dsh-upgrade/packages/core/session` 与 `packages/client/store` 链接 alpha.1 源码（type-only 使用，运行时宿主注入）→ typecheck/build/validate 全绿。③**retry-settings 契约修复**：默认值写死 2（core `DEFAULT_MAX_RETRIES=5`）、上限硬截 100（core schema 允许 `MAX_SAFE_INTEGER`）、README/文档 key `retrySettings` 驼峰与实现 `retry-settings` 不一致、缺 searchTerms → 全修正并补中文搜索词。④**notify 修复**：sound.ts 模块级 document 监听永不移除+AudioContext 无 close（update/HMR 泄漏）→ 改 `mountSoundWarmup()` 返回 disposer 经 ctx.effect 挂载；lastErrorAt Map 无界增长 → 写入时顺带清理 ≥30s 过期项；agent 事件 handler 类型收窄 `{agent:{id}}` → 改由 Events 合并推断。⑤**asr-voice 修复（审计驱动的 4 处边界 bug）**：cloud start() await getUserMedia 后无 cancelled 复检 → 幽灵录音（授权弹窗挂起时取消、恢复仍录音、迟到文本写入新会话草稿）；runBackgroundOptimize finally 无条件 setPhase('idle') → cancel 后立即 begin 旧 promise 把新录音打回 idle（引入会话代际 `generationRef`，begin 递增、异步回调捕获 myGen 比对）；MediaRecorder.onerror 不停 tracks（麦克风常亮）；静音停止分支漏 close 分析 audioCtx；卸载 effect 漏 abort optimizeControllerRef。⑥**规范统一**：四拆分插件缺 scripts/build.sh（判定可选项——pnpm 本地安装与 asr-voice 的 junction-link 脚本模式冲突、契约未强制，放弃）；补 searchTerms（全部五插件）、生命周期脚本"无"声明（notify/model-selector）；manifest.json 登记 asr-voice。**坑**=①npm prerelease semver：`^0.1.1-rc.2` caret 使 `0.1.2-alpha.1` 不被接受（元组 0.1.2 > 0.1.1），但 npm 又没有 alpha.1 包可装——两难下保持 rc.2 依赖线 + 代码对齐，仅 model-selector 因用到新包必须 file: 链接；②审计子代理建议"升依赖线"需甄别——多数基于"npm 有 alpha.1"的错误前提，外部插件受 npm 无包硬约束，采纳前先验 dist-tags；③type-only import（import type）在 tsdown 打包时被擦除，lib 能构建但 tsc 需要类型——"编译过"要分别看 build 与 typecheck；④`import type {} from '@deepseek-ai/dsh-settings'` 的 Context merge（declare module）是 host 侧 settings 类型的正确来源，自造 `Context & { settings: {...} }` 交集是绕过真实提供者的坏味道（shortcuts 已改）。**验证**=五插件 typecheck + build + 伞仓库 validate 19/19 PASS，全部 bump+tag+push（四拆分 → v0.1.1，asr-voice → v0.1.2）。可复现?是（npm dist-tags 查询 + 各插件 typecheck + 伞仓库 validate）。

- **失败重连/重试开源项目盘点（async-retry / axios-retry / cockatiel / exponential-backoff / reconnecting-websocket ×2）+ DSH 核心 retryPolicy 上限澄清（2026-08-28，调研）**：问题=用户重试插件（dsh-retry-settings）「只支持重试 10 次」，想把 GitHub 上支持失败重连的开源插件项目拉下来学习。解法=①核实「10 次」来源：插件自身代码上限是 0–100（`src/index.ts` POST 校验 + client card `max={100}`），**10 只是用户 `~/.dsh/settings.yaml` 里各 llm-* provider 实际配置的 maxRetries 值**——不是插件硬限制；②DSH 核心 `packages/llm/llm/src/retry-policy.ts` 早已内置完整能力：normal 模式 maxRetries 上限 `Number.MAX_SAFE_INTEGER`（schema `z.number().step(1).min(0).max(MAX_SAFE_INTEGER)`）、**always 模式=无限重试直到成功/取消/销毁**（真正的「重连」语义）、backoff（initialDelayMs 默认 500 / maxDelayMs 10000 / jitterRatio 0.1）、retryableCodes 白名单；`packages/llm/llm-retry` 是可插拔执行器（agent loop 的 request recovery 扩展点，localDelay=min(initialDelay*2^min(retry-1,1024), maxDelay) * 对称抖动）。**结论=用户要的「失败重连」DSH 核心已支持，插件 UI 目前只暴露 normal+maxRetries 数字，没暴露 always/backoff/retryableCodes**——真正缺的是 UI 扩展不是核心能力。**决策（2026-08-28）**：用户拍板**不做**——官方已做好的东西不重复实现，dsh-retry-settings 保持现状（仅 normal+maxRetries），克隆的 6 个研究仓库保留在 `retry-research/` 作参考、不引入任何代码。③克隆 6 个开源项目到 `~/workspace/collection/retry-research/`（浅克隆 `--depth 1`）：vercel/async-retry（基于 node-retry，默认 randomize 抖动 + err.bail 中止协议）、softonic/axios-retry（axios 拦截器插件、exponentialDelay/linearDelay/noDelay，`['axios-retry']` 请求级覆盖）、connor4312/cockatiel（完整韧性库：Retry/CircuitBreaker/Timeout/Bulkhead/Fallback + 多种 Backoff）、coveooss/exponential-backoff（DelayFactory 接口化，可插自定义退避实现）、joewalnes/reconnecting-websocket（装饰 WebSocket 自动重连）+ pladaria/reconnecting-websocket（npm 常用版，支持换 server URL 与缓冲）。坑=①animal 名相同仓库（joewalnes 与 pladaria 的 reconnecting-websocket）克隆到同一目录必须改名防覆盖；②verify 时先确认各库实际源码路径（async-retry 是 lib/index.js、cockatiel/axios-retry 无 dist 源码时 grep 落空），别凭 package.json 主字段瞎猜。可复现?是（settings.yaml grep maxRetries: 10 + retry-policy.ts schema 均实体可查）。

- **dsh-trae 模型元数据 INVALID_CATALOG：桥上游 get_detail_param 返回重复 config_name，adapter 必须去重（2026-08-26，修复）**：问题=模型选择器报 `TRAE（SOLO 订阅） (modlens vision) 加载失败：adapter returned invalid or duplicate model metadata for provider "trae"`。原因=登录后桥动态拉取 SOLO 模型表（get_detail_param）返回 **44 个配置，其中 `mimo-v2.5-pro`/`mimo-v2.5`/`deepseek-v4-pro`/`deepseek-v4-flash` 各重复一次**（上游配置表自带，桥 modelList() 不去重就原样下发）；插件 adapter 原样透传 → dsh-llm `listModels` 校验（lib/index.js:1376，provider 必须匹配、id/name 非空、**id 全局唯一**，违者 LlmError INVALID_CATALOG）。解法=插件 `refreshModels()` 先按 id 去重（保留首个、跳过空 id）再映射 pi-ai models；`dev_reload_package` 热重载 host 后 modelCount 44→40、选择器恢复。坑=①上游桥可能提供重复或脏模型列表，adapter 层必须自净化（去重/非空），别假设上游干净；②`INVALID_CATALOG` 报错出现在"model picker / 别的插件（modlens vision）枚举 provider 模型"时，不一定是你自己的注册逻辑错，先抓 provider 实际 listModels 结果做唯一性校验（node 拉桥 /v1/models 数重复即可复现）；③面板日志显示"已登录 1 账号=动态模型"是一个信号：任何"之前 32 条静态→之后 44 条"的变化都来自桥的账号态。可复现?是（登录账号后枚举 /v1/models 必现重复 id）。

- **dsh-trae client 槽位修正：conversation.view 是"整页视图 Tab"槽，挂小卡片会顶掉聊天视图（2026-08-26，修复）**：问题=面板挂 `conversation.view` 后用户看到"卡片在，点开是空白"——实际是**整个会话视图被我们的 entry 替换成了标签页**（views.ts：`One conversation view tab, projected from a 'conversation.view' slot`，apply.ts 还把它登记进 tab ring）。原因=把"provider 管理小卡片"挂错了槽位语义。解法=改挂 **`conversation.composer.dock`**（kind list、scope session、owner InputZone，输入框上方环境坞），保留同 id/label；tsdown 重建 client.js（profile node_modules 是 junction→工作区，即时生效），页面硬刷新即见。坑=client 槽位先读 `packages/client/ui-conversation/src/client/contract/slots.ts` 的 SlotMap 语义（view=整页、input.dock/composer.dock=区域坞、chat.node=消息节点），别凭名字猜；SKILL.md §5.2 的接缝清单只给名字不给语义，必须回源码确认 kind/scope/owner；**另有致命签名坑：`slots.register(options, component)` —— 组件是第二参数**（官方 ui-conversation apply.ts:431 `register({name:'conversation.composer.dock', id:'stats', ...}, StatsLine)` 同款；脚手架模板把 `component` 塞进 options 是错的，运行时渲染 undefined 组件 → React #130 `args[]=undefined`），且 client 组件必须是真 React 组件（react/jsx-runtime 外部化由平台提供，DOM 组件/`{render}` 对象均不行）。验证=composer.dock 生效后聊天视图不再被替换、卡片出现在输入框上方。可复现?是（挂 conversation.view 必然占整页，composer.dock 只占坞区）。

- **dsh-trae 自建插件（M3）：桥伴随子进程 + pi-ai provider + 登录闭环，热装即用（2026-08-26，构建/装配）**：问题=Trae/WorkBuddy 无 DSH 轮子，按方案 A（伴随 traework2api 桥子进程）自建 `@dsh-external/dsh-trae`。解法=①宿主无 Go 也无桥 release → 下载便携 go1.27.0 zip（78.9MB，go.dev/dl/?mode=json 取 URL）→ `go build -o dsh-trae/bin/traework2api.exe ./cmd/server`（必须 cd 桥源码目录，模块在 go.mod 所在目录）；②host 实现照 `@arcships/dsh-dim-oauth` 骨架：`LlmAdapter` 子类 + `PiAiAdapter` 委托（profiles 快照 Map + `createProvider({auth:{apiKey:{resolve}}})` + openAICompletionsApi.lazy + headers Authorization 桥 key）+ `ctx.llm.registerAdapter([PROVIDER_ID], adapter)` + `webServer.register({kind:'prefix',path,handler})` + 回环守卫（`x-dsh-trae:1` + host/origin，照抄 dim-oauth U()）；③登录闭环（协议速查表 §1.6/1.7）：登录链接（machineId/deviceId 每次生成）→ 粘贴回调 → ExchangeToken（TokenExpireAt 毫秒 /1e12 归一）/GetUserInfo → 落盘 auths/trae-{uid}.json（0600 原子 tmp+rename）→ **重启桥子进程加载新账号**（桥只在启动时读 auths 目录，login.sh 同款 restart 行为）；④client 面板挂 `conversation.view` slot（tsdown 打包 ModuleLoader.load，zero React，纯 DOM）。坑=①**dev_build_plugin 探测不到本机 checkout**（报"未找到 DSH checkout"，其探测路径不含 D:\workspace\deepseek-harness\deepseek-harness）→ 手改构建流程：junction 链接 + `node $co/node_modules/typescript/bin/tsc` + `node $co/node_modules/tsdown/dist/run.mjs`；②**bash 不在 PATH**（build.sh 依赖 bash）→ 同上 PowerShell 等价流程；③typecheck 坑：schemastery **无 `.int()`**；@types/node RequestInit **无 `cache` 字段**（用 headers Cache-Control）；PiAiAuthInjection.authContext **必须给 env/fileExists**；client 类型用 `@deepseek-ai/dsh-client-runtime/client` 的 `ClientContext`（`dsh-client-ui-slots` 的 SlotsService **不存在**，且 runtime node_modules **没有 ui-slots 包**，需从 checkout packages/client/ui-slots 链接）；tsconfig lib 需加 DOM/DOM.Iterable 才能编译 client 文件；④Context.webServer 类型需 `import type {} from '@deepseek-ai/dsh-host-webserver'` 拉 declaration merge。验证=热装（dev_install_package）后 loader active；桥 healthz 200 / 管理 API 200（32 模型） / 无守卫头 403 / bridge-key.json 0600 落盘；待真实账号登录联调。可复现?是（重跑手动构建 + 热装可复现）。

- **订阅中转轮子盘点与装配：多订阅插件确实存在，Trae/WorkBuddy 是唯一无轮子项（2026-08-26，调研/装配）**：问题=用户要「DSH 插件形式的本地自用中转」，坚持已有轮子上补充不重复造轮子，并断言存在「一个插件包装好几个订阅套餐」的开源插件，要求再查。解法=①npm registry search（`text=`）+ GitHub README 取证：**多订阅轮子确实存在**——`dsh-plugin-subscriptions@0.5.2`（V1ki，**274★**，Codex/Claude/Grok/Copilot，Claude 可直导本机 Claude Code 登录态，Settings→Subscriptions 登录）、`dsh-coding-subscription-oauth@0.6.2`（lninghaha，**15★**，Grok Build/Codex/Kimi/Claude/Antigravity 五合一，**自带 127.0.0.1:18080 本地 OpenAI/Anthropic 兼容网关** `/v1`+`/v1/messages`+`/v1/responses`，Bearer key 0600）；②单轮子比星数（用户规则：星数多者优先、相同比更新频率）：Codex 系 dsh-codex 48★ ＞ coding-oauth 15★ ＞ llm-local-token 2★；③资产账本：DimAgent=`@arcships/dsh-dim-oauth`（本机已激活，零开发）；OpenCode Go=`triss-dsh-provider-bundle`（opencode/opencode-go/zai 路由）+`dsh-opencode-go-usage-dock`；**Trae/WorkBuddy 无任何 DSH 轮子**（协议已实证见 doc/subscription-upstream-protocols.md，用户拍板方案 A=伴随 traework2api/workbuddy2api 子进程自建）；④装配执行（主推组合一次装齐）：`dsh plugin --profile web add dsh-coding-subscription-oauth@0.6.2` / `triss-dsh-provider-bundle` / `dsh-opencode-go-usage-dock` 三条全部成功（pnpm 4.7s/1s/3.5s，profile deps 与 node_modules/*/cordis.patch.yml 均就位）。坑=①npm `/-/v1/search` 的 `scope:` 查询对 @archships/@arcships 都返回 0，必须改用 `text=` 全文搜索或直连 registry 包名探测（HEAD 200 即存在）；②jsdelivr `data.jsdelivr.com` 对**无 tag 仓库**不返回目录树（versions:[]），列目录要 GitHub contents API，抓单文件用 `cdn.jsdelivr.net/gh/{repo}@{branch}/{path}`（本环境 raw.githubusercontent 必超时）；③`dsh plugin add` 装的 prebuilt npm 包写 profile，**需重启 dsh web 才生效**（host 侧 require 缓存，与 2026-08-19「host 改动需重启」同款坑）；④两个多订阅插件可在 Codex/Claude/Grok 重叠并存（路由名不同、credential 文件独立：coding-oauth=`$DSH_HOME/*-oauth-auth.json`，plugin-subscriptions=`~/.dsh/plugins/subscriptions/auth.json`），但并存兼容性需实测，不默认双装。验证=profile package.json dependencies 出现三包（dsh-coding-subscription-oauth / triss-dsh-provider-bundle / dsh-opencode-go-usage-dock）+ 各包 cordis.patch.yml 落位。可复现?是（registry search + dsh plugin add 可复现）。

- **ui-tweaks 省 token 移除 + model-selector/paste-input 增强验证（2026-08-21，审计/优化）**：问题=用户对 ui-tweaks 逐功能质疑「真能增强吗」，并拍板省 token 去掉。解法=①model-selector 验证：官方 dsh-client-ui-model-selection client.js 36KB 零 search（chevron 仅 trigger effort 指示）；conversation.input.model 是 single 座（ui-conversation slots.ts:271，slot-catalog replaceRisk=shadows-shipped-ui），后注册者接管（ui-conversation 测试 seatOwners.at(-1)?.owner），ui-tweaks 1053 行注释明确「Replaces the shipped seat」→ **接管合法、搜索+折叠是真增量**；②paste-input 验证：官方 createDraftImages 走 imageMediaType MIME 校验=**官方仅图片**（drop 文案也是 images），paste-input=任意文件+chip 队列+独立协议 /dsh-paste-input/v1，挂 conversation.input.left/dock 非接管 → **真增量**；③省 token 从 ui-tweaks 移除：lib/index.js 删 ToolResultPruner import/组合、cordis.patch.yml 删 4 段官方行配置、package.json 删 pruner peer、README/注释同步（官方能力预设，profile 侧 patch 保留继续生效）。坑=①按行删 patch 块时先删 - id: 行会留孤儿 config: 块——块删除必须以完整块为单位或二次清理；②node --check 过但运行受影响面=重装才生效（profile 装的是旧 0.2.0）。验证=git diff -45 行、残留 grep 仅剩移除说明注释。可复现?是。

- **0.1.1-rc.1 兼容性/重叠审计（2026-08-21，审计/兼容性）**：问题=用户要求拉取最新项目、对照官方 0.1.1-rc.1（口语「0.1.0 rc1」=安装版 0.1.1-rc.1，npm next 线）查插件兼容性与功能重叠。解法=①全伞 13 仓拉取+治理：deepseek-harness 至 release/dsh-0.1.1-rc.1 合并（528c682e）；better-sidebar/dsh-work/dsh-trace-compare 的 bitterSmilezzz 源已 404（前两者删库、后者 fork 删库）→ better-sidebar 换源 omdsh-dev/DSH-better-sidebar、trace-compare 换源 lamost423；②官方能力基准=安装包 @deepseek-ai/* 清单 + master diff rc.8..rc.1（111 非合并提交）+ profile bundles（base/web-app/market/memory/model-fix/ui-tweaks/usage-plugin/visualize + oil-sticky-prompt insert）；③官方 usage-stats 只在本地 backup/usage-stats-76b72b3 分支（76b72b3，2026-08-18），master 与 npm 发布线均无（workspace 的 .patch 与 packages/session-query/usage-stats 编译残留是本地实验痕迹）→ 与 dsh-usage-plugin 的重叠=「官方合入即发生」，usage-plugin 差异点=费用/峰谷/余额/usage_stats 工具。结论=在役插件中 ui-tweaks 与官方界面面重叠最大（model-selector/paste-input/plugin-inventory/retry-settings 均有官方对应物，但全是增强版；at-file 与 auto-hide/immersive 已按同样理由删掉）；dsh-work 与官方 Agent Teams 重叠已退役；model-fix 治理已归档但 profile 仍装着（提示卸载）；memory/visualize/oil/market/desktop-shell/skills 无官方重叠。坑=①dsh-plugins rebase 撞 4 个本地提交 vs origin 治理提交（aqua 删除/desktop-shell 笔记），除 NOTES 合并外一律 checkout --ours 取 origin（origin 更彻底）；NOTES.md 冲突合并必须 Node 按 CRLF 拼接；②git fetch 超 300s 超时/连接重置=GitHub 当天网络差，操作全部转后台+重试；③profile 包版本=peer ^0.1.0-rc.7 对 0.1.1-rc.1 semver 命中。验证=dsh-plugins check-consistency 全过（9 插件）；审计报告 doc/plugin-overlap-audit-0.1.1-rc1.md。可复现?是（官方 usage-stats 分支存在性、404 源、peer 命中均可复现）。

- **DSH 记忆插件市场契约审计：13 候选对照伞目录契约全量校验，3 个 patch id=dsh-memory 与自有插件冲突（2026-08-19，审计/决策）**：问题=用户先调研市面记忆插件（上轮），本轮要求对这些插件做项目约束和契约校验，决定替代 dsh-memory 的合规路径。原因=不能只看功能，要对照仓库硬约束（AGENTS Pi 红线/THIRD-PARTY 治理/check-consistency manifest/bundle 包契约/安装通道）。解法=①建五组契约（M1 manifest schema / M2 bundle 包契约 / M3 安装通道 / P1 Pi 红线 / G1 治理）逐候选取证：GitHub 默认分支 package.json/cordis.patch.yml/目录树 + npm registry + lib 源码 grep defineTool 数工具；②产出审计报告 docs/memory-plugin-audit.md；③分级：✅ meta-memory（0 工具纯 brief 注入）/ claude-bridge（0 工具迁移）；🟡 ben7am1n dsh-memory（3 工具零依赖 SQLite FTS5 最贴 Pi，但包名=dsh-memory 冲突，fork 改名后是首选极简替代）/ jenjx @dsh-memory/bundle（引证记忆设计最佳但安装通道断裂）/ vault（3 工具合规但每轮全量注入+id 冲突）/ memento（工程最规范但 Apache-2.0+immediately:true）/ towzai（注入理念最贴但 6 工具+embedding 依赖 /api/embed）；🟠 meow（7 工具+七层+dream 复杂度超标）/ chenhw7（6 工具）/ claudemove（5+工具+Apache-2.0）/ tdai（sqlite-vec/tcvdb/jieba 原生重依赖）；🔴 mnemon（13+ 工具违反 >10 拆分红线+9 个外部 provider）/ nocturne（硬依赖自建 Nocturne MCP server 违反不内置重功能）。坑=①**3 个候选（vault/towzai/jenjx）的 cordis.patch.yml 都 insert id=dsh-memory，与伞目录自有 dsh-memory 行 id 冲突**——Cordis 后层按 id 覆盖前层，同装必一方静默失效，收编前必须 fork 改 patch id（仿 aqua 先例）；②ben7am1n 的 npm 包名就叫 dsh-memory（已发 0.1.0），npm 层与自有插件无法同装；③多数第三方仓库 lib/ 未入库（.gitignore 忽略构建产物）——GitHub 直装缺 lib/index.js，market/better-sidebar 同款坑，mnemon/meow/ben7am1n/meta-memory/nocturne/chenhw7/claude-bridge 只能走 npm（或 fork 后 lib 入库）；④jenjx @dsh-memory/bundle npm 未发+无 lib+无 prepare，当前零安装通道，要等作者发版或本地构建；⑤raw.githubusercontent.com 批量抓取中途持续超时（连续两次整批失败），unpkg/jsdelivr CDN 兜底成功——批量取证脚本要带 CDN fallback；⑥bash 内联 node -e 引号/$ 转义易碎（NOTES 此前只记了 PowerShell，bash 同理）——复杂检测一律写 .mjs 文件再跑。验证=13 候选全部取证（包结构/工具数/安装通道/★/license/patch id），审计报告落盘，未动 plugins.json（并行会话有未提交改动，只提交 docs/ 与 NOTES.md）。可复现?是（重跑抓取脚本可复现全部证据与冲突判定）。

- **深度 2 子代理运行 AgentTeams 端到端被拒：maxDepth 1 硬限制 + 真名实调验证 3 项修复生效（2026-08-19，实测）**：问题=按修复清单（成员派生挂官方/pending 恢复边/archive 保留名/中文 sanitize/activity 词汇）执行 AgentTeams 完整端到端实测。**关键发现（阻塞）**：`agent_teams_add_member` 返回 `Error: subagent depth 2 exceeds maxDepth 1`——**我是被委托的子代理（深度 2），AgentTeams 拒绝在深度 >1 处派生成员**。由此所有依赖成员的下游步骤（claim_task 需要 assignee=活跃成员、任务状态机 pending→claimed→in_progress 需先 claim、send_message/status 的 activity 实时字段需有真实成员）全部不可达。**真实实调结果**：①中文团队名 create 成功且 id 可读（`端到端实测团队2`，非乱码非 `team` 兜底），但**同名首次 create 报 `team id is taken by another captain`**（该名字已被之前会话占用，非本测试失败）；②`name=archive` create **被拒** `team name "archive" folds to reserved id "archive"`——archive 保留名校验真名实调生效（修复 2 生效）；③`update_task` 状态机守卫生效：`pending→failed`/`pending→in_progress` 均报 `cannot move`（须先 claim），即 pending 恢复边 + 转移校验真实存在（修复 3 生效）；④`status` 返回任务 `[pending]`、成员 0，词汇正常。**判断**=不能实测 add_member spawn/activity 实时字段/pending reopen（被 maxDepth 挡在成员派生前），这三项修复本次**无法端到端验证**，需在深度 0/1 会话跑。**坑**=①子代理实测 AgentTeams 端到端有硬上限：add_member 要求调用者深度 ≤1，必须由父/根会话跑完整流程；②任务无法被无成员时 claim（unassigned 任务 claim 需 assignee=活跃成员，captain 不是成员不可作 assignee）——任务 DAG 全流程必须有真实成员；③误用第一个已被占用的中文名字导致了首个 create 失败，换名即成功，这不反映插件缺陷；④验证「修复是否生效」应只信真名实调结果（本报告第 ②③ 项），依赖成员的项如实标注「未测」。可复现?是（任何深度 2 子代理调 add_member 必现 maxDepth 拒绝；archive 保留名/状态机守卫可复现生效）。

- **端到端实测揭示：dsh web 进程加载旧 host 代码，host 侧修复需重启才生效（2026-08-19，关键发现）**：问题=端到端实测（子代理调用 agent_teams_update_task）发现运行时 schema 枚举**不含 pending**，而伞目录 lib/tools.js 新构建**含 pending**——运行进程与磁盘产物不一致。原因=**dsh web 进程启动时间早于构建时间**：进程 PID 30080 于 12:54:46 启动，lib/tools.js 新构建在 15:40:54（修复后）。host 侧产物是**进程启动时 require 缓存**（旧代码），client.js 是**按需读盘**（新代码）——所以前几轮的 host 侧修复在运行实例从未生效，只有 client 侧生效。前几轮验证全是静态的（tsc/verify.mjs/node --check），没覆盖「运行进程加载的 host 代码版本」。解法=**重启 dsh web**（GUI 会话内不能自杀 harness，需用户外部重启）——重启后 host 侧修复全部生效（pending 恢复边/archive 保留名/activity 词汇统一/成员派生挂官方）。**坑**=①验证运行实例是否加载新 host 代码：比较进程启动时间 vs lib 产物修改时间，或实测工具 schema 是否含新枚举（本次就是靠子代理实测 schema 发现的）；②client.js 新 ≠ host 新——两者更新机制不同（读盘 vs require 缓存）；③子代理端到端实测是有效的验证手段（它的工具面含 agent_teams_activate 可调用，与父会话不同——NOTES 旧记录「工具不可调用」是父会话预设面视角）。**验证**=磁盘 lib/tools.js 含 pending 枚举/archive 保留名/working 映射（True×3）；进程启动 12:54 < 构建 15:40 确认旧 host。可复现?是（任何 host 侧改动后不重启 dsh web，运行时 schema 仍旧）。

- **实证：agent_teams_activate 在本会话真实可调用——「动态注册不进模型工具表」的旧记录在本会话不成立（2026-08-19，实证）**：问题=验证「listTools 注册可见 ≠ 会话模型可调用」这一已知疑点。**实测（只读+一次激活调用，未建队/未 spawn 成员）**：①`cordis_inspect_query(host/Tool/listTools,{})` 激活前工具表含 `agent_teams_activate`（首个）且**不含** 9 个惰性 `agent_teams_*`；②我的实际会话工具表（模型请求真正组装的 function 声明）确实含 `agent_teams_activate`，直接调用成功返回 `AgentTeams tools enabled: agent_teams_create/add_member/remove_member/create_task/claim_task/update_task/send_message/status/delete`（9 个）；③激活后再查 listTools，9 个惰性工具全部出现（10 个 agent_teams_* 齐）。**结论**：本会话动态注册工具真实进了模型请求的工具组装且可调用——与 NOTES 第 4/5 轮「注册可见≠本会话可调用、动态注册不进模型工具表」的记录相反；差异最可能=那几轮在官方 preset 工具面（不含 activate）下观测，本会话 web profile 的模型工具面把 activate 组装进来了。**坑**=①「注册可见」与「模型可调用」是两层，必须分开实测：listTools 只证注册，模型工具面是否含动态工具取决于 preset/会话组装，别用任一视角替代另一视角做断言；②agent_teams_activate 是幂等可逆探测点（仅注册工具，不建队、无成员副作用）；③activate 进工具表≠9 个惰性工具立即可用——它们激活后才装配（listTools 前后两查证实）。**验证**=listTools 前后两次查询 + 实际调用 activate 成功 + 激活后 9 工具出现。可复现?是（本会话重跑两步可复现；旧记录「不可调用」是否因 preset 差异需按会话复测）。

- **代码级「完全合并」候选盘点：notify+ui-tweaks 是唯一干净候选（2026-08-19，分析）**：问题=用户问哪些插件可从代码逻辑重构为一个完整插件而不违反约束。方法=逐一核 dsh-plugins 7 子包的宿主/客户端工具数、inject 并集、slot key、注册 id（`dsh-core`=纯工具库 0 工具；`dsh-essentials`=0 工具但 host 已有并集 fs/webServer/loader/sessions/settings/typert；`dsh-memory`=1 工具；`dsh-notify`=0 工具纯 client；`dsh-ui-tweaks`=0 工具 5 个 UI 开关；`dsh-visualize`=2 工具；`dsh-work`=10 工具）。结论=**dsh-notify + dsh-ui-tweaks 最适合合并**：同为纯 client UI 增强、各 0 个模型工具（合并后仍 0，远低于 Pi 上限 3）、host inject 并集仅 webServer/settings、slot 无碰撞（notify=settings.general.item id web-ui-notify；ui-tweaks=settings.plugins.tab + plugin.item 各 key）、注册 id 均需对齐新包名（仿 aqua 教训）。essentials+notify+ui-tweaks 代码上可行但会逆转 2026-08-18 拆分决策、违背核心最小化，不推荐；visualize+ui-tweaks 工具数 2≤3 可行但语义松散；memory 并入 essentials 会使核心带 1 工具且重功能入核心，违背最小化；dsh-work 已 10 工具=拆分红线，**绝不能并入任何东西**；dsh-core 是共享库非插件不可合。**坑**=notify 的 client 注册 id 仍是上游 `@omdsh-dev/dsh-web-ui-notify`（包名已是 dsh-notify），合并时须改成新 bundle id；essentials 与 ui-tweaks 各自 patch 都 disable `ui-settings-plugin-inventory`，合并去重一份。可复现?是（grep 各 lib 工具注册 + slot key 即可复现）。

- **合并候选盘点 + README 残留 notify 旧计数（2026-08-19，分析）**：问题=盘点当前仍独立的插件哪些适合完全合并（收编进 monorepo）。原因=自研已并入 2 monorepo（dsh-plugins 7 子包含 notify、dsh-skills 3 子包），剩余独立=dsh-better-sidebar / dsh-market / dsh-usage-plugin / dsh-ui-aqua（第三方 fork）+ dsh-desktop-shell（原生）。结论=唯一现实候选是 **dsh-usage-plugin**（小、零构建依赖、曾并入 essentials、本地改 4 处 UI，若决定不再跟上游可仿 notify 先例收编）；better-sidebar（上游活跃 ~802★ + ws/node-pty 原生依赖）、market（459★ 活跃）、aqua（267★ 活跃且本仓库不可重建）、desktop-shell（原生 Swift/Tauri）均**不适合**合并、保持独立。**坑**=README.md 未随 notify 收编同步：第 41/139 行仍把 notify 列为第三方 fork（链接已不存在的独立仓库）、第 73 行计数「6 bundle + 5 fork」应改为「7 子包 + 4 fork」；THIRD-PARTY.md 已正确，仅 README 滞后。解法=README 目录表把 notify 移入自研合并仓行、同步更新计数。可复现?是（README 行 41/73/139 与 plugins.json 不符）。

- **百度类 frame-busting 站点在侧边沙箱 iframe 渲染不出，头探测判可嵌入=插件 UX 盲区（2026-08-19，实测）**：问题=侧边浏览器访问 www.baidu.com，地址栏显示百度地址但 iframe 空白（用户反馈「地址是百度的但没访问成功」）。原因=百度无 `X-Frame-Options`/CSP `frame-ancestors`（host `browser.probe` 返回 reachable:200、无这两个头 → 客户端判 `embeddable` 走裸 iframe），但百度页面加载后用 **JS frame-busting**（检测被嵌套→强制跳转，沙箱禁 top-navigation 后只剩空帧）拒绝嵌入——响应头探测对这种手段**完全检测不到**，于是既渲染不出、也不显示原因面板+系统浏览器按钮。**实测取证**（Tabbit/Playwright，隔离真实浏览器）：本地页起 http server 托管，内嵌两个 iframe 用**与 BrowserView 完全相同的 sandbox**（`allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox`、无 `allow-same-origin`、`referrerpolicy=no-referrer`）→ example.com 正常渲染（title/正文都有），百度帧 `url` 变空（导航被中止，`frames()` 里找不到含 baidu.com 的帧）——坐实 frame-busting。解法=用 `browser_open` **`system` action** 在系统浏览器打开（设计好的逃生口）；后续可改进 BrowserView 加「空白帧启发式检测→显示原因面板+系统浏览器按钮」（难点=沙箱跨源无法读内容，只能靠 iframe load/导航中止信号，无法可靠区分「真空白页」）。**坑**=Tabbit 的 `page.goto` **拒绝 file://**（Navigating to local URL is not allowed），本地测试页须用 `python3 -m http.server` 走 http；iframe 内仍直接访问真实 https 站点，不受本地托管影响。可复现?是（任意 frame-busting 站点：google/baidu/qq 等；Tabbit 复测法可直接复现空白帧）。

- **browser_open `at` bug 修复后重启验证通过（2026-08-19，验证）**：问题=重启 dsh web 后重测侧边浏览器。解法/结果=`open https://www.baidu.com` 无报错、随后 `status` 返回 `page=https://www.baidu.com/`——完整链路（工具→host intent→可见浏览器标签轮询→iframe 导航→browser.report 清意图+记状态→下次调用返回 page）全部打通，`at` 不再泄漏、输出 schema 校验通过。经验=①host 半改动**必须重启 dsh web**（lib/index.js 启动时加载进进程；本会话两次未重启时的 `value.page.at` 报错即旧代码实锤，重启后消失）；②客户端「只有**激活且可见**的浏览器标签才消费意图」，发导航前确认侧边栏有可见浏览器标签，否则 intent 会一直挂起到有可见标签为止（relay 只会 mint 不存在的标签，面板折叠/标签不可见时不消费）。可复现?是（重启后 open+status 稳定返回 page）。

- **browser_open 端到端验证：host 链路通、客户端不消费意图=页面旧实例（2026-08-19，验证）**：问题=用户问「sidebar 插件的侧边浏览器能用吗」。分三层实测：①工具层=本会话模型**已能调用** `browser_open`（实证第一条 NOTES（2026-08-19）「新开会话再测」假设成立——新会话组装时工具表已含注册的动态工具）；open/status 正常返回。②host 层=open https://example.com 通过 URL 策略写入 per-session 意图；**冷查意图**=`curl -s -X POST http://127.0.0.1:3080/sidebar/api/browser.intent -H 'content-type: application/json' -d '{"sessionId":"<DSH_SESSION_ID>"}'` → `{"intent":{"seq":1,"op":"open","url":"https://example.com/",...}}`（该 API 是 peek 不消费，curl 静态可查 pending 意图/确认 host 注册表状态，比反复调 status 更直接；sessionId 用 `$DSH_SESSION_ID`）。③客户端层=部署给页面的 client bundle（解析 `window.__DSH_BOOT__` entries 拿 `/plugins/dsh-better-sidebar/client.js?rev=…`）与 lib/ 构建字节一致、含 open relay（src/client/index.tsx：「agent-browser open relay」）+ BrowserView 轮询（BrowserView.tsx 700ms、仅 visible 时消费），但**意图数分钟仍 pending 未被消费**→页面内存里的 client 是旧实例（`dsh web` 重启/重新 build **不会刷新已开页面**，页面加载的是自己打开时刻的 bundle；README 也写明 client 改动需硬刷新）。解法=**硬刷新 GUI 页面（Cmd/Ctrl+Shift+R）**，pending 意图仍在注册表，刷新后新 client 的 relay 会立刻 mint/激活浏览器 tab 并把 example.com 加载出来；刷新后仍不消费再查 sessions list `current` 与 sidebarStore.sessionId 是否匹配、页面 console 报错。可复现?是（curl browser.intent 可复现 pending；刷新后意图应被消费清除）。

- **动态工具「注册可见 ≠ 当前会话模型可调用」（2026-08-19，排查中）**：问题=better-sidebar 的 `browser_open` 工具注册后（settings gate 打开、`Tool.listTools` 可见、host 路由 curl 通），当前会话的模型依旧调不到它——无论当前 turn 还是后续 turn 都不在模型可调用工具表。原因=工具注册进 host 工具注册表（`ctx.tools.register` → inspect 可见）是一层；**模型请求的工具组装（`dsh-agent-loop` step 时 `assembly.tools`，经 systemPrompt.assemble 构建）是否纳入动态注册工具是另一层**——本会话两层的结论不一致（注册表有、请求组装无）。推测=会话级工具快照/组装过滤（官方 dsh-tool-* 是 preset 注册层，better-sidebar 这类第三方 bundle 工具可能未进「模型可见白名单」或需 preset 工具面声明）；未深挖到结论（会话被中断）。解法（待验证）=**新开会话**再测（新会话组装时注册表已含 browser_open；若仍不可用，需查 assembly.tools 的过滤规则/预设工具面配置）；教训=验证「agent 可用工具」以**实际模型请求注入**为准，`Tool.listTools` 的 visible 只是注册表视图；不要反复重试已确认不可用的工具（用户会看出来）。可复现?是（listTools vs 模型工具表不一致可复现；等待新会话实证）。

- **tabbit 插件重启后全链路就绪验证（2026-08-19，验证）**：问题=用户重启 web profile 后确认插件是否真正加载。验证=①运行时实证：host `Tool.listTools` inspect 已含 `tabbit_browser_install`（工具注册表全局可查）+ skill catalog 现含 `tabbit-browser` → bundle 的 apply() 成功、inject [skills,tools,jobs] 全解析；②本机环境实际已全就绪（此前判断「Tabbit 未装」是错的）：/Applications/Tabbit Browser.app 国内版（com.tab-browser.Tabbit）**1.9.22.0** ≥ 1.9.0、~/.local/bin/tabbit-cli 存在、browser-runtime-service.mjs 进程在跑；③`~/.local/bin/tabbit-cli tasks` 探测**成功**（返回任务清单 JSON，capabilities 含 playwrightHelpers/visualRoutes/cliAdditions 等）→ macOS 国内版 1.9.22.0 无 Windows 那个 INVALID_ENDPOINT_PATH 问题；④探测输出显示残留 task space `verify sidebar browser`（idle、claimedTabCount 0，来自更早会话，skill 规定此类用完的 task space 应收尾 finish）。结论=tabbit_browser_install 首调用即会返回 ready（探测已由本命令完成）；工具本身无法直接由本会话调用（不在会话工具表），但 listTools 可只读证明注册。坑=「装没装浏览器」别凭印象，直接查 /Applications + plutil 读 CFBundleShortVersionString/bundleId。可复现?是（listTools / tabbit-cli tasks 均可复现）。

- **bsk vs tabbit 浏览器自动化选型判据（2026-08-19，分析）**：问题=用户问「tabbit 插件和 browser-skill 是不是重复了」。结论=**能力域重叠但路径不同，不构成重复**：browser-skill(bsk)驱动用户真实 Chrome（复用登录态=cookie，不可替代价值）/ Agent Window 隔离 / borrow 单页，纯 skill 零工具注入（bsk 0.1.10 daemon 本机在跑、1 browser connected）；tabbit 驱动 Tabbit 自家浏览器（独立 profile 登录态）/ tabbit-cli + Browser-owned Playwright Runtime Service（task space 隔离、receipts/checkpoints/多实例 TABBIT_PLAYWRIGHT_INSTANCE、后台安装器），bundle 1 工具+1 skill。**选型判据（一句话）**=碰已登录站点→bsk；隔离受控跑批（QA/benchmark/多任务不互染）且愿装 Tabbit→tabbit；用户点名浏览器→听用户。两者 skill 描述均含「别回退到另一浏览器后端」，并存时靠此判据消歧，无需额外 router。当前 tabbit 三未就绪（插件待重启/browser 未装/上游 1.9.22 国内版 INVALID_ENDPOINT_PATH bug），日常优先 bsk。可复现?否（纯分析；bsk status / dump-config 可复核现状）。

- **Tabbit-Browser/dsh-plugin 第三方审计：纯 skill+bundle 形态、Pi 友好，但 LICENSE 缺失 + README 与代码矛盾 + 国内版 1.9.22 有已知 Runtime bug（2026-08-19，审计）**：问题=用户发来 https://github.com/Tabbit-Browser/dsh-plugin（Tabbit 浏览器官方 DSH 插件，85★，2026-08-14 建仓，对应 bilibili「Tabbit 已支持 DSH」1.9 版本）。**架构**=真 bundle（`dsh plugin --profile web add github:Tabbit-Browser/dsh-plugin`）：cordis.patch.yml 只插一行 `{id: skill-tabbit-browser, name: tabbit-browser}`；host 半区 index.js 做两件事——① `ctx.skills.registerProvider` 注册 bundled skill（**rank 600**=官方预留的包内技能档位，modelInvocable+userInvocable，resourceBase=directory，locator=SKILL.md，get 时 stripFrontmatter），② `ctx.tools.register` 一个 `tabbit_browser_install` 工具（检测稳定版 Tabbit/Tabbit Browser ≥1.9.0 + tabbit-cli launcher + Runtime 进程，结果按 agent session WeakMap 缓存，refresh 才失效；缺装或过低时经 `ctx.jobs.start` 后台下载地区匹配安装包到 ~/Downloads）；installer.js 纯 Node 零依赖（spawnSync + fs/promises + fetch）：macOS 扫 /Applications+~/Applications 的 .app+plutil 校验 bundleId/版本，Windows 查 Uninstall 注册表 64/32 view，region 检测（macOS AppleLocale / Windows Get-WinHomeLocation GeoId）→ CN 用 tabbit.com 国内源否则 tabbit.ai 国际源，下载 host 白名单（www/pkg/releases.tabbit.{com,ai}）+ 1GiB 上限 + content-length 与 MZ/koly 魔数校验 + .part 原子改名。**Pi 对照**=极好：仅 1 工具+1 skill（零常驻 token）、无记忆系统、isConcurrencySafe、副作用可回收、单 job 复训防重复下载、Windows 权限策略克制（不提前要 Full Permission，仅当 Browser/launcher/Runtime 都在但 `tabbit-cli tasks` 探测报 BROWSER_RUNTIME_UNAVAILABLE 才要求切 Full 并停止任务，不重试）；tests/node --test 539 行断言覆盖。**问题**=①仓库**无 LICENSE 文件**（package.json 声明 MIT，收编/再分发有合规缺口）；②README line 88 说 Windows 返回 `cliSandboxMode: danger-full-access`，但代码 describeCliSandbox('win32') 实际返回 `'default'`（按需权限策略上线后 README 没同步，schema enum 里的 danger-full-access 已成死值）；③peerDependencies 只声明 @deepseek-ai/dsh-jobs|skill|tools 且 dependencies 空——按本仓库「插件 peerDeps 缺陷坑」应核实 `dsh plugin add` 从 github 装时是否解析得到，不过 dsh 内置这些服务一般由 harness 提供；④**已知 bug=国内版 Tabbit Browser 1.9.22.0 的 tabbit-playwright-cli 找不到 Runtime endpoint（INVALID_ENDPOINT_PATH，issue #5/#6/#7）**；⑤open PR #3 是 AI scanner 报「owner key 不校验可注入 prototype」——WeakMap 只收对象 key，字符串 key 只会抛 TypeError，该 HIGH 判定基本是误报；PR #4 才是真修复（Windows CIM 命令行带引号时 runtime 进程正则漏匹配 + 优先 LocalAgent CLI 路径）。可复现?是（npm pack 解包 + node --test 全过可复现行为；README 与 describeCliSandbox 断言矛盾可直接对照源码）。

- **dsh web 插件加载故障修复复核 + 落地提交（2026-08-18，复核/落地）**：问题=复核修复记录 docs/dsh-web-plugin-load-fix-20260818.md 所述两项根因是否就位。①dsh-plugin-wallpaper-engine-mac@0.1.6 发包沿用原版包名（cordis.patch.yml loader `name` 与 lib/client.js `__ModuleLoader__.load({id})` 均漏 `-mac`）→ 宿主端 boot 抛 ERR_MODULE_NOT_FOUND / 浏览器端 loaded without registering；解法=web profile pnpm patch，pnpm 10 的 patch-commit 只写 lockfile，package.json 需手补 patchedDependencies；复核=patches/…patch 与 package.json 记录均在位。②dsh-essentials/lib/client.js 在 555da78 拆 dsh-ui-tweaks 时残留 ~410 行 keyboard-shortcuts 重复块 + 孤立 `return module.exports; }` → Illegal return statement、bundle 无法解析 → 浏览器 loaded without registering；解法=删重复块；复核=node --check 过、sub_atFile→sub_attachmentRemoveAlwaysVisible 边界干净、五个拆出模块（autoHideComposer/immersiveMode/keyboardShortcuts/pluginInventory/retrySettings）grep 计数均 0、sub_* 定义无重复。工作区改动未提交 → 本次 commit 3ee12f5（-410/+92，与文档「约 410 行」吻合），记录文档一并入库。坑=①client bundle「loaded without registering」先 `node --check` 排除语法错误，再核对 `__ModuleLoader__.load({id})` == 包名（与 aqua 改名案例同族，见下）；②BSD/macOS uniq 不支持 -w，排重子定义用 awk 抽函数名 + sort|uniq -d。可复现?是（解包 npm 0.1.6 见两处漏改包名；git checkout 555da78^ 的 client.js 可复现语法错误）。

- **「侧边栏内嵌浏览器 vs bsk Agent Window」能力边界调研（2026-08-19，调研）**：问题=用户问「浏览器自动化能否像 zcode 一样用侧边栏内置浏览器」。结论=①bsk 形态=独立 Agent Window（真实 Chrome/Edge 扩展窗口+CDP），不在 DSH 页面内；优点=真实登录态、不受 X-Frame-Options/iframe 拒嵌限制、可完整点击/表单/`console`/`network`；②仓库 dsh-better-sidebar 内置「🌐 内嵌浏览器」tab（src/client/BrowserView.tsx，沙箱 iframe+地址栏/多开/后退前进刷新），但**仅用户手动浏览，无 agent 控制工具**（src/tools.ts 只注册 terminal_* 等），且沙箱无登录态/第三方 cookie 受限/拒嵌站点（如 arxiv）只显示原因面板；③当前 web profile **未装** better-sidebar（已装 dsh-essentials/dsh-plugin-wallpaper-engine-mac/dsh-profile-web/dsh-ui-aqua/dsh-work），侧边栏现无内嵌浏览器；④`bsk console --session` 可读缓冲 console/log/exception（`--since` 游标/`--limit`/`--include-stack`），查页面报错比 snapshot+evaluate 更直接（是上条「纯文本模型验证 GUI」笔记的补充手段）。可复现?是（bsk --help / README / grep src 可复现；未改仓库代码）。

- **纯文本模型下 bsk 验证 DSH GUI 的替代路径（2026-08-19，浏览器验证）**：问题=用户报告打开 GUI 报错、zcode 修好后要「操作浏览器直接检查」，当前模型 deepseek-v4-flash 不支持读图，`bsk screenshot` + `read_image` 直接失败（model does not declare image input）。原因=Agent Window 复用用户真实 Chrome（登录态/存储共享），navigate 127.0.0.1:3080 后页面就是当前活跃会话（标题=会话名，属正常预期非异常）；视觉确认不可用时不代表无法验证。解法=用 `bsk snapshot`（aria 树，无错误文本/全部区域渲染即大体健康）+ `bsk evaluate` 做程序化 DOM 断言：`window.__DSH_BOOT__` 存在（只有 dsh web 注入，boot 成功标志）、页面文本无「启动失败/Error/崩溃」、侧边栏与输入框可见、`[role=alert]`/alert 横幅数量=0；全部通过即可下结论，无需 get-html/screenshot。注意=bsk 检查属「只读查询」范畴，快照+一次 evaluate 即止，勿堆叠探索步骤；查完必须 `bsk session stop <id>`（含错误路径）。可复现?是（会话中 bsk snapshot+evaluate 可复现；未改仓库代码）。

- **BrowserSkill (Tencent) 第三方审计：唯一不可替代价值=复用用户真实 Chrome 登录态，但 DSH 插件路径 11 工具超标违反 Pi 红线，只收纯 skill 路径（2026-08-19，审计+收编）**：问题=评估 https://github.com/Tencent/BrowserSkill 是否符合本仓库 Pi 理念。**架构**=Rust CLI (bsk) + 后台 daemon + WebSocket + Chrome 扩展（Agent Window 隔离）；DSH 插件注入 11 个 browser_* 工具（session_start/stop/list, navigate, click, fill, press, screenshot, emulate, snapshot, observe）。**Pi 违规**：①工具数 11 > 10 红线（必须拆分）；②核心插件 host ≤2 严重超标；③auto-update 默认开启（类似后台 bash）。**好的设计**：lazyTools 渐进式披露（skill 触发后才注册工具）、ctx.effect 完整清理、零记忆系统、遵循 DSH 插件规范。**决定性发现**=BrowserSkill 的**非 DSH 路径**（纯 skill + bash 调 bsk CLI）完全 Pi 友好——SKILL.md 写得极好（完整 workflow/sandbox rules/observation priority），Agent 读完就会用。**解法=只收 SKILL.md 作为纯技能包**（external/browser-skill/），不收 DSH 插件；scripts/install.sh --scenario browser 复制到 ~/.agents/skills/；THIRD-PARTY.md 登记维护策略；Agent 通过 /browser-skill → bash bsk CLI，零工具注入零 token 开销。可复现?否（纯审计+收编；SKILL.md 来自上游 skill/SKILL.md）。

- **dsh-loop 第三方审计：契约全过 + 工程质量高，但与官方 dsh-schedule/goal 重叠，严格 Pi 下倾向不收编（2026-08-19，审计）**：问题=找 GitHub 上的「dsh-loop」插件并对照本仓库契约与 Pi 理念。**名称去歧义**：npm `dsh-loop`（Ephemeral-AI-Lab/dsh-plugins 的 loop 目录，「Session-scoped recurring alarms」：3 工具 loop_create/list/delete + /loop 命令 + Loop dock，durable 会话事件 + zod 依赖，交付走 Agent.send+heartbeat）与 GitHub **vlln/dsh-loop**（精确同名仓库，0 runtime 依赖：单 `loop` 工具 4 动作 start/stop/status/list + /loop 命令 + composer dock 活动状态条，进程内瞬态不持久化）。审计以 vlln 为主。**契约层（rc.7 逐项 Inspect + npm 产物验证）**：inject [agents,commands,tools,timer,webServer] 全为真实服务；`Agent.followup(message)` 带显式 `source:{kind:'plugin'}`（符合 dsh-tool-goal 权威注记：非人类生产者必须自带 source、不得继承人类权威）；`agent/status`(idle⇄running)/`agent/disposed` 真实；`conversation.input.dock` list 槽注册(id/order/locale) 契约吻合；`webServer.register` 官方扩展点、0 patch、MIT、无生命周期脚本、构建产物入库——供应链纪律优秀。**决定性发现=harness 已内置官方 `dsh-schedule`**（schedule_create/list/delete，会话事件日志持久化，`every_seconds` 下限 5 分钟、低于报 frequency_too_high）+ `dsh-tool-goal`（goal 轮次即 followup 机制）——dsh-loop 真正多出的只有 秒级间隔 + 模型自调节 loop 工具 + dock 状态条。**Pi 对照**：⚑ 复杂系统是负债/无调度层=定时自循环正属「调度层/后台自动化」，且 `while+sleep+dsh chat`(tmux) 可近似；⚑ Context 最贵=10-60s 秒级唤醒每轮全 turn 烧 token + 会话无界增长；⚑ 工具数=1 主机工具(4 动作) 合规 ≤3、客户端 1 槽合规。**结论=技术契约全过、工程质量高，但核心能力与官方能力重叠 + 与「不内置重功能/无调度层/Context 最贵」冲突，严格 Pi 下不建议引入；若收编只宜独立 opt-in bundle**，且需两处改造：①webServer 硬 inject 改 `ctx.get('webServer')` 可选（CLI-only profile 下当前会挂起不加载）；②建议加最短间隔下限防秒级烧 token；状态停用走自定义 HTTP POST 路由（在官方 RPC/projection 惯例之外，本地场景低风险）。可复现?否（纯审计未改代码；验证=GitHub API + npm registry + git clone 源码 + Inspect 服务/事件/槽 + npm dsh-agent rc.7 类型产物 grep `Agent.followup` + dsh-schedule README）。

- **dsh-better-markdown 第三方评审：Pi 合规但依赖重量无解 + 与 DSH 自带渲染器功能重叠，决定不收编（2026-08-19，审计）**：问题=评审 npm 包 zerob13/dsh-better-markdown（client-only bundle，markstream-react 流式 Markdown 渲染，MIT）是否符合本仓库契约与 Pi 理念。契约层=合规：host 半区仅空 apply（0 工具/0 token）、`ctx.slots.inject('conversation.chat.node')` + `register({key:'assistant-step', priority:-100})` slot shadowing（官方扩展点，priority 0 官方 renderer 留作 fallback）、`ctx.effect()` 包 setCustomComponents + 返回 disposer 全可逆、inject:['slots'] 服务名正确、仅读叶子字段、htmlPolicy=escape + 协议白名单安全边界明确。**但依赖重量 7.4MB（gzip 1.59MB，7 runtime deps：markstream-react/mermaid/shiki/katex/stream-markdown/@shikijs/langs/themes）无可行解法**：mermaid(~2.5MB)+katex(~800KB) 是 markstream-react 的**内部静态依赖**，插件源码里根本没有 `import mermaid`（在渲染器包内部 import 打包），插件层动态 import 切不到——要减只能 fork 上游渲染器，维护成本爆炸违反「复杂系统是负债」。**决定性发现=DSH 自带渲染器已覆盖 90% 功能**：dsh-client-ui-primitives 的 MarkdownText 本身就有增量流式解析（IncrementalMarkdownParser，冻结完成 block 只重解析尾部）、Shiki 代码高亮（纯 JS regex 引擎 + 语法 allowlist 懒加载）、KaTeX 数学、完整 GFM（表格/任务/脚注/引用）、同样协议白名单安全策略——better-markdown 真正多出来的只有 Mermaid 图渲染 + 流式期间代码高亮。解法=**不收编**（用户确认「多余不要了」），依赖重量评估须区分「自引入的不必要依赖」与「上游包功能必需的依赖」，后者不构成改造理由。可复现?否（纯审计未改代码；npm pack 解包 + git clone 源码 + Inspect 查 slot 契约）。

- **pilot-harness (op7418/pilot-harness) 第三方审计：完整 DSH 分叉非插件，4 独立插件 Pi 合规（2026-08-19，审计）**：问题=审计 https://github.com/op7418/pilot-harness 是否符合本仓库契约与 Pi 理念。本质=不是单一插件，是**完整 DSH 分叉**（160+ 包，vendor cordis/cosmokit/schemastery 等 9 核心库）+ Electron 桌面壳 + 4 可独立安装插件（codepilot-theme/ui-worktree/ui-schedule-summary/session-log-export）。4 插件 Pi 合规（零 LLM 工具/零 token/inject 全声明/ctx.effect 全包裹/loopback RPC/无 MCP 记忆子代理）；整体违反「核心最小化」与「复杂系统是负债」。另：复用 `@deepseek-ai/` scope（供应链混淆）、桌面端禁 llm-deepseek 换 pi-ai（行为差异）、session-log-export client 一处 ctx.on() 未包 ctx.effect()。解法=**本仓库不应收编整体**，可借鉴插件设计模式但 scope 冲突需解决。可复现?否（纯审计未改代码）。

- **dsh-plugin-wallpaper-engine 第三方评审：Pi 典范但 CSS 脆弱 + inject/注释矛盾（2026-08-19，评审）**：问题=评审 elysia395/dsh-wallpaper-engine（Wallpaper Engine 壁纸背景 bundle，MIT）是否符合本仓库契约与 Pi 理念。原因=整体优秀（零 token 开销/纯 insert patch/副作用可逆/零外部依赖），但有三处偏差：① client.css 用 33 处 !important + 属性子串选择器（`[class*="_bubble"]`/`[class*="_panel"]`/`[class*="_pane"]`）强耦合 DSH 壳与 dsh-better-sidebar 内部类名哈希，对方一改即静默失效（注释自己承认）；② cordis.patch.yml 注释说「webServer is optional so this bundle also loads in the headless/TUI profile without failing」，但代码实际是 `inject: ['webServer']`（硬依赖）——headless 根本不加载此插件，apply() 内的 defensive check 是死代码；③ `lib/types/index.d.ts` 注释同样把硬 inject 描述为 optional，与代码矛盾。解法=①收编后需评估是否解耦 CSS（与 dsh-ui-aqua 也可能效果冲突）；②若真想做 headless no-op 应改 `ctx.get('webServer')`；③类型注释应与代码对齐。另：Host↔Client 走同源 HTTP（webServer.register + fetch）而非 host.call/harness.handle——视频流媒体的 Range 请求本质无法走 JSON RPC，属合理偏离，建议 AGENTS.md 补充「媒体流场景除外」。可复现?是（硬 inject 时 headless profile 不加载；CSS 子串选择器在 DSH 壳 class 名变更后失效）。

- **grill-me 技能生态调研（2026-08-16，调研）**：用户要求「看一下 grill-me 相关 skill 的最新版，star 多的先列」。web_search 因 api key 失效改走 GitHub Search API 多关键词（"grill me" skill / "grill-me" skill / grillme / grill interview skill）合并去重后按 star 排序，再拉各仓库 SKILL.md 原文对比。结论=源头是 **mattpocock/skills**（218.9k★/18.9k forks，MIT，「Skills for Real Engineers」技能包，grill-me 是其中一个 productivity skill）；**grill-me 最新版已薄壳化**：`skills/productivity/grill-me/SKILL.md` 只剩 frontmatter + 「Call the Skill tool with "grilling"」一行（`disable-model-invocation: true`），真正逻辑在 `skills/productivity/grilling/SKILL.md`（设计树 + 轮次 frontier + 事实自取不问用户 + 每问附推荐答案 + 空 frontier 才收尾）。社区流传最广的「旧版」单文件形态=**RobMitt/grill-me-skill**（223★/33 forks，**无 LICENSE**，2026-04-11 仅 initial commit，21 行：AskUserQuestion 一次一问 + 2-4 选项 + 决策树摘要）。中文版=**zhudan930612/grill-me**（33★，无 LICENSE，触发词含「挑战/拷打这个方案、文档、内容、设计」，支持对文档/内容评审）。其他=Jekudy/grillme-skill（32★，俄语苏格拉底深度访谈，182 行，`skills/grillme/SKILL.md`）；majorgilles/pi-grill-me（15★，MIT，是 pi 的 npm 插件 index.ts，**非 SKILL.md**）；max4c/skills（8★，MIT，grill-me 带 Freeform/Spec/Ticket 三模式 + 0.2-0.4 阈值 + 子程序退出协议，164 行，被 write-prd/tech-spec/bugbook 当 gate 调用）；wanyichen06/LLMInternSkill（278★，MIT，Codex 求职技能包，`skill-references/interview-grilling.md` 43 行，5 轮面试拷问：truth boundary→技术深度→JD 深挖→场景→风险总结，偏面试特化非方案拷问）；MoonTzai/debate-coach（9★，中文辩论教练，基于 Grill-Me 审问模式）。注意=纯 skill 仓库无 tag/版本号，「最新版」= main 分支 HEAD；RobMitt/zhudan/Jekudy 均无 LICENSE，收编需谨慎。可复现?是（GitHub Search API + raw.githubusercontent 拉 SKILL.md 可复现；未安装、未收编）。

- **Yhx888/j-space-cognition-suite 与当前仓库/DSH 冲突分析（2026-08-16，冲突/共存验证）**：用户要求「第一个看看和当前仓库还有 dsh 有没有冲突」。解法=静态核对 + 隔离共存 boot。结论=**无硬冲突，可共存；但仍不建议收编**。静态核对：①patch id/name 唯一——Yhx888 `id/name: j-space-cognition-suite`，当前 web profile 已有 essentials/dsh-market/dsh-vision-router/dsh-better-sidebar/archify-skill-filesystem 等，仓库内另有 vision-router 等，均不重名；②skill 注册——Yhx888 用 `ctx.skills.register({name:'j-space', resourceBase:{kind:'directory',...}, source:'runtime', invocation:{...}})`，DSH rc.6 `dsh-skill` 契约确认这是合法运行时嵌入式 skill（rank 250，同层同名 first-wins，重复只 warn/no-op）；当前仓库/已装插件没有同名 `j-space` skill（dsh-essentials visualize 用 registerProvider，dsh-vision-router 注册 vision-tools，archify 用 skill-filesystem provider），所以无 skill 重名；③systemPrompt——Yhx888 注册 section 名 `j-space-cognition-suite` order 150，dsh-essentials 只用 context `memory:summary`(130)/`memory:auto`(120)、mode-boost/router 预设的 section 名不同，无同名冲突；④无 client 半区/无 UI slot，与 dsh-essentials/dsh-market/dsh-vision-router 的 client 层不交叠；⑤依赖/服务——只 inject systemPrompt+skills，无第三方 runtime 依赖，headless boot 已过插件加载（之前仅缺凭据报错），本地 link 安装无 module 解析问题。隔离共存实测：`DSH_HOME=/tmp/dsh-conflict-test` 建 web profile，安装 Yhx888 + dsh-essentials（本地）+ dshmarket（本地）+ dsh-vision-router（npm 1.4.0）+ dsh-better-sidebar + @tt-a1i/archify-dsh（即当前真实 web profile 的全部第三方 bundle + Yhx888），`dsh --profile web --port 4099` boot 成功输出 `dsh web: http://127.0.0.1:4099`（12s 后手动 kill）；说明与当前仓库/当前 profile/DSH rc.6 可共存。非冲突但要注意的点：①**行为叠加**——Yhx888 每次对话注入「J-Space 强制生效」协议，与 dsh-essentials 内置 mode-boost/router-standard/spec 同属行为指令注入层，技术上不冲突但会堆 prompt/上下文，真实会话效果需实测；②**skill 重复风险**——若用户同时把纯 J-Space skill 装到 `~/.agents/skills/j-space` 或另一个 bundle 也注册 `j-space`，runtime first-wins/rank 250 会 shadow，二者只能选一；③**收编 License 冲突**——Yhx888 仓库无 LICENSE 文件（package.json 写 MIT）且内嵌上游 J-Space 内容（Apache-2.0）未附 NOTICE，收编进「各子项目均 MIT」的本仓库会污染许可声明，仍判定不 git subtree 收编；④dsh-vision-router 本地 link 安装曾报 `Cannot find package 'undici'`（本地路径不装依赖），npm 安装后正常，与 Yhx888 无关。可复现?是（临时 DSH_HOME 组合安装 + `dsh --profile web --port 4099` boot 可复现；未安装到真实 profile、未改本仓库代码，仅落档）。

- **dsh-web-ui（zhu1090093659/dsh-web-ui）外部调研（2026-08-16，调研）**：用户发
  https://github.com/zhu1090093659/dsh-web-ui 链接问是什么。问题=这是 DSH Web GUI 的插件与皮肤
  全家桶 monorepo（默认 main，HEAD 0ea284c，v0.1.18，~1.7k★，整体 Apache-2.0 为主、个别包
  BSD-3-Clause，npm scope
  @linxin666），不是单个插件而是一整套：12 个功能包（liangshen 梁神预设 / task-board 看板 /
  git-graph / aionui-panel 右侧面板 / pet 鲸鱼娘宠物 / live-stats 实时吞吐 / remote-web-ui 移动端
  远程 / ssh / tool-describe-image 图像理解 / web-ui-settings 设置组 / community-plugins /
  skins 皮肤聚合）+ 10 款皮肤 + gallery 静态画廊。解法=浅克隆（filter=blob:none 只取 tree）读
  README/package.json/aggregate.yml/cordis.patch.yml/docs/plugins.md。要点=①形态与官方一致：
  每包 `dsh.bundle.patch`→`cordis.patch.yml` 单行 insert，host 半区 exports "." + client 半区
  `dsh.client`（inject @deepseek-ai/dsh-client-*），聚合包 `dsh-web-ui-all` 用 aggregate.yml
  patchFrom+deps 把 12 行 insert 汇总成一个包；②安装：`dsh plugin --profile web add
  @linxin666/dsh-web-ui-all`，npm 已发布；仓库安装需 Node>=22+pnpm，profile 严格布局要
  nodeLinker: hoisted（或 public-hoist-pattern），否则 patch 行引用的子包被收进嵌套目录报
  Cannot find package；③可借鉴：aggregate 聚合机制（patchFrom 汇总 + deps 子包）+ settings
  一级分区归组（web-ui.plugin.item）+ host 真实服务（ssh2/xterm/ws、fs/git、session.prompt 执行
  看板）+ 移动端 SSE 配对（一次性令牌 + 可吊销）+ 皮肤中心试穿/退出还原 + describe_image 工具
  （OpenAI 兼容视觉端点，图不进会话）；④与 dsh-essentials 重叠：describe_image≈dsh-vision-any/
  ModLens，live-stats≈使用统计，settings 分区≈我们插件配置卡片，梁神预设≈router-standard 思路
  （两阶段 Minimal→Code Mode），但实现和 scope 都不同；⑤注意=以 Apache-2.0 为主（个别包
  BSD-3-Clause），均非 MIT，代码直接并入需保留对应 LICENSE/NOTICE 且仓库体量/功能面大，
  **不宜直接收编进 dsh-essentials**，可作外部参考或
  单独安装试用；未装到本机 DSH。可复现?是（filter 浅克隆读源码；未安装）。

- **VibeSkills（foryourhealth111-pixel/Vibe-Skills）外部调研（2026-08-16，调研）**：用户发
  https://github.com/foryourhealth111-pixel/Vibe-Skills 链接问是什么。问题=VibeSkills 是
  「通用 Skill 管家」类项目（v4.0.0，Apache-2.0，default main，浅克隆 HEAD d5ae560，55MB），
  不是 DSH 插件也不是 DSH bundle；定位=自动路由本机已装 Skills、按 harness 状态机编排复杂任务。
  解法=浅克隆读 README/SKILL.md/adapters/config/packages/installer，并在 /tmp 实际跑
  `bash install.sh --skills-dir /tmp/vibe-test-skills` 验证安装。要点=①工作流=需求冻结→L/XL
  分级→agent_skill_organization（模块/技能/角色/验收）→执行留痕→验收检查，progressive hard
  stop 在 requirement_doc / xl_plan / phase_cleanup，续跑要 bounded_reentry_token +
  host-decision-json；②形态=根 SKILL.md（frontmatter name: vibe）+ Python vgo-cli
  （apps/vgo-cli，要求 Python >=3.10）+ PowerShell 运行时 + 协议/配置 + host adapters
  （codex 受管、claude-code 受限、cursor/windsurf/openclaw/opencode/generic 为 preview/
  advisory）；③安装=统一 `install --skills-dir <SkillsDir>`，落 `<SkillsDir>/vibe`，实测只拷
  runtime core 3.2MB/277 文件（含 SKILL.md/config/protocols/apps/packages/scripts），
  `bundled/skills` 254 个内置技能不默认装入（minimal/full 的 internal_skill_corpus 均
  disabled，技能来自用户配置的本地 skill roots）；`check.sh` 在 mac 上 PASS。④DSH 关系=无
  DSH 适配器也无 DSH 字样，generic adapter 仅 advisory；DSH 的 skill-filesystem 扫
  `~/.agents/skills`，因此装到 `~/.agents/skills` 后 `~/.agents/skills/vibe/SKILL.md` 应能被
  `/vibe` 发现，属「外部 skill 安装」而非收编 bundle；注意其 Codex 适配器 macOS 标
  not-yet-proven，完整 runtime coherence 依赖 pwsh。⑤与本仓库 router-standard 不是替代：
  router-standard 是 DSH 预设管思考/路由，VibeSkills 是跨宿主 SKILL 编排/验收框架，可互补但重。
  依赖=核心安装/运行只需 Python >=3.10（apps/vgo-cli 与 packages/{installer,runtime}-core 的
  pyproject.toml 均无 dependencies，无 pip 第三方包）；完整 runtime coherence/官方 gate 依赖
  pwsh（PowerShell Core），无 pwsh 时降级运行；v4 不自动安装/推荐 chrome/playwright 等 MCP。
  注意=Apache-2.0 与仓库 MIT 不同，直接并入需保留 Apache/NOTICE 声明，且它不是 DSH bundle
  形态，**不宜收编进 dsh-essentials**；如用户想用，建议官方 release zip 装到 ~/.agents/skills
  单独试用，避免污染 web profile。后续用户追问：可装到 DSH=是（外部 skill 装 ~/.agents/skills
  即可，非 `dsh plugin add`）；可装到本仓库=不建议收编为 DSH bundle/子项目，仅作外部参考/文档记录。
    追问结论：当普通 skill 用=能（DSH 扫 ~/.agents/skills 的 SKILL.md 即可加载，但它是带 Python/
  pwsh 运行时的大 skill，DSH 侧需能跑 subprocess，完整 gate 仍依赖 pwsh）；合并进本仓库=技术上
  可 vendor 成 third_party 源码目录，但不能作为 DSH bundle/插件子项目，不建议收编。
  最终用户决定：不安装、不合并，仅作调研/参考记录。可复现?是（git clone + /tmp install/check
  已复现；未装到本机 DSH）。

- **iPolloWork（Devin-AXIS/iPolloWork）外部调研（2026-08-16，调研）**：用户发
  https://github.com/Devin-AXIS/iPolloWork 链接问是什么。问题=iPolloWork 是本地优先视觉 AI
  工作台（source-available，Electron+React+OpenCode，codeload tarball ~80MB，默认 main，
  apps 版本 0.21.x），定位 Codex/Claude Code 的开放替代：一个目标产出可编辑代码/文档/PPT/网站/
  设计/视频。与 DSH 关系=**两条线**：①主产品把 DSH 当外部子代理运行时：desktop 内置
  `@deepseek-ai/dsh@0.1.0-rc.6`（apps/desktop/dsh-runtime，独立 pnpm 安装并打进
  electron-builder sidecar），`examples/plugin-packages/deepseek-harness` 是其自有插件格式
  （ipollowork.plugin.json + local-service deepseek-harness.mjs + SKILL.md），通过
  `ipollowork_extension_call` 委派 DSH；DSH 在临时目录做 `git clone --shared` 隔离副本 + 可选
  macOS Seatbelt / Windows headless，跑 headless CLI（`dsh ... --profile headless --patch
  <patch.yml> <prompt>`）或 JSON-RPC stdio（initialize/session/prompt/session.status idle），
  返回 finalResponse + patch；模式 standard/code/review，provider deepseek-official/
  ipollowork/custom DSH_CORDIS_CONFIG，patch 分页、任务持久化到 jobs/result.json、60 分钟
  超时/取消；Linux 还可从 PyPI wheel `deepseek-harness-runtime-bin` 管理 JSON-RPC 运行时版本。
  ②DSH 生态侧有**真正的 DSH bundle 插件**：`external-plugins/deepseek-harness/` 下
  deepseek-idesign/deepseek-ippt/deepseek-ivideo（npm 可装，README 给 `dsh plugin --profile
  web add`），形态与我们一致：`dsh.bundle.patch` + `cordis.patch.yml` 单行 insert，host
  `inject:["webServer","workspaceRegistry"]` 注册 prefix 路由（/ipollowork-design /ipollowork-ppt
  /ipollowork-video），client `slots.inject("conversation.view")` 加 Design/PPT/Video 视图，
  Studio iframe + 随机 token + workspace 内 design/ 目录读写，Ask AI 只回填对话草稿不自动提交；
  deepseek-ivideo 重依赖 puppeteer/onnx/sharp/hyperframes。注意=①**License 不兼容**：主仓库与
  外部插件都是 iPolloWork Source Available License 1.0（非 OSI、非 MIT，个人/少于3人内部免费，
  >3人或商业/托管/白标需书面授权），与我们的 MIT 仓库冲突，**不宜收编/直接抄代码**，只能作外部
  参考或让用户自行安装；②其 DSH 外部子代理实现比 Yao 示例更完整（隔离 git 副本 + patch 回传 +
  沙箱 + 运行时管理 + 任务持久化），若未来做 dsh-mac-desktop 或宿主嵌入可参考；③三个 DSH bundle
  是「创作类 UI」的成熟参考（conversation.view + webServer 路由 + iframe 授权），但重、非 MIT，
  不并入 dsh-essentials。可复现?是（codeload tarball 已解压读源码；未安装到本机 DSH）。

- **zhuzhiliao 外部调研（2026-08-16，调研）**：用户发 https://github.com/imsai-sh/zhuzhiliao
  链接问是什么。问题=zhuzhiliao（竹知了）是传统竹筒"哇哇"玩具的 Web 模拟版（~2.8k★，默认
  main，零构建纯静态，在线 imsai.top），**不是 DSH 插件，也无任何 DSH/Cordis 集成**；README
  只是顺带挂了同作者的 Awesome DeepSeek Harness Plugins 清单。解法=浅克隆读 README/CLAUDE/
  LICENSE/index.html/3d/，并抓 GitHub 页面取 star 数。要点=①技术：单文件 `index.html`
  （~1429 行）Canvas 2D + Web Audio，零依赖，内嵌 base64 AAC 真实录音采样（1.72s 无缝循环），
  解码失败回退纯合成链（锯齿波+AM+带通共振峰）；物理=绳系质点（重力+只拉不推弹性绳+空气
  阻力，1/240s 定步长），绳方向角速度驱动音量/音高；可选 3D 层 `3d/boot3d.js`（vendored
  three.js + 程序化模型）动态 import，失败静默回落 2D。②移动端优先：触屏锚点上移、多点互斥、
  `devicemotion` 甩手机模式（需安全上下文）；计数只存 localStorage（`zzl_mywah`），页面加载后
  无网络请求。③许可=自拟 Source-Available License，**非 OSI 开源，禁止再分发/公开部署/商业
  使用**，与 MIT 仓库不兼容，**不可收编/复制**；仅可作零依赖单文件前端/物理/音频实现参考。
  可复现?是（公开仓库浅克隆即可，未安装/未改动本机）。

- **Mirage（strukto-ai/mirage）外部调研（2026-08-16，调研）**：用户发 https://github.com/strukto-ai/mirage 链接问是什么。问题=Mirage 是面向 AI Agent 的统一虚拟文件系统（Apache-2.0，3.5k★，Python/TypeScript 双实现 monorepo，主分支 main），把 S3/GDrive/Slack/Gmail/Redis/Notion/Postgres 等约 50 个后端挂载成同一个类 bash VFS，LLM 会用 bash 就会用；Python 包 `mirage-ai`、TS 包 `@struktoai/mirage-node/browser/agents/cli`。与 DSH 关系=不是普通调研对象，而是**真 DSH bundle**：`typescript/packages/dsh` 发布为 `@struktoai/mirage-dsh@0.0.1`，manifest 带 `dsh.bundle.patch` → `cordis.patch.yml`，patch 禁用 `fs-sandbox`/`bash-sandbox`/`pwsh-sandbox`/`tool-pwsh`/`tool-fs-search` 并插入 `mirage`（service，持有 Workspace）+ `mirage-fs`（实现 `@deepseek-ai/dsh-fs` 的 FileSystem）+ `mirage-shell`（实现 `@deepseek-ai/dsh-shell` 的 ShellExecutor）；`inject:['mirage']` 声明服务，`ctx.fs`/`ctx.shell` 都跑在同一个 Mirage Workspace 上，`sandboxMode` 在全部 runtime reach=vfs 时上报 `workspace-write`。安装=文档给 `dsh plugin --profile web add @struktoai/mirage-dsh`，默认世界只有一个 RAM `/tmp`；在 profile 自己的 cordis.patch.yml 覆盖 `mirage` 行的 `mounts`/`runtimes`（声明式 `resource/mode/config`，`!!js process.env.X` 运行时解析）。注意=①**npm 发布版 peerDeps 已滞后**：`npm view @struktoai/mirage-dsh@0.0.1` 是 `dsh-fs@0.0.1-rc.1` + `dsh-shell@0.0.1-rc.5`，而仓库 main 的 package.json 已改成 `0.1.0-rc.6`（npm pack 验证 tarball 同旧版），直接 `dsh plugin add` 到 rc.6 很可能 peer 冲突或拿到旧 seam 契约；文档 `npm install ...` 不锁版本也会被 peer 带偏，装前应核对或改用 GitHub main 构建的 tarball，并向上游反馈 republish；②Apache-2.0 与仓库 MIT 不同，可作外部安装/参考，不宜直接并入 MIT 子项目除非保留 Apache 声明；③其 patch 思路（替换 fs/shell 两个可交换 seam + 禁 host 子进程面）与「provider 可插拔」设计值得借鉴，落地前用 Inspect Provider 核对 rc.6 契约。可复现?是（git clone + npm pack 可复现；未安装到本机，未改代码）。

- **EchoBird（edison7009/EchoBird）外部调研（2026-08-16，调研）**：用户发 https://github.com/edison7009/EchoBird 链接问是什么。问题=EchoBird 是 Tauri 2 + React/TS 的跨平台「AI 模型/技能管理桌面应用」（v5.6.5，MIT v5+，约 3k★），核心=统一 Model Nexus 模型数据中枢 + 4 场景（Install & Repair Agent / Local LLM / My AI Projects / App Manager）+ AI News/Skills/AI Career。解法=读 README/package.json/Cargo.toml/src-tauri/tools/docs；与 DSH 关系=它是外部宿主/工具管理器，不是 DSH 插件：`tools/dsh` 把 DSH 列为受管 CLI（检测 `dsh` 二进制、`dsh web` 启动、localhost:3080 打开）；`apply_dsh` 写 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.echobird`（displayName/apiKeyEnv/api/baseURL/models）+ `agent-default-model`，密钥写 `~/.dsh/.credentials.yaml` 的 `ECHOBIRD_API_KEY`，切模型后重启受管 dsh 实例；`restore_dsh_to_official` 反写；`ai_career.rs` 直接读 `~/.dsh/sessions/<project>/<session>/session.jsonl[.zstd]`（zstd 多帧流式解码、首行 header、session/title 最新胜出、turn/start 计数）做历史/热力图；`process_manager` 对 dsh 有 kill 后重启 + 自动 open browser。注意=①可借鉴点：外部程序写 DSH settings.yaml 的「provider 路由+默认模型选择器+凭据文件」模型切换模式、zstd 多帧会话日志直读（与 NOTES 里 node zlib 重写经验互证）、DSH_HOME 解析、dsh web 进程管理；②代码量大（Rust 服务 ~23k 行 + 前端多页），是独立桌面产品，不宜收编为 DSH bundle，MIT v5+ 可读；③其 README 提及 DeepSeek Harness one-click install + model switch，且 dsh.json 注释说明 npm rc 契约（Node >=22.19、dsh web 127.0.0.1:3080、hot-reload settings.yaml 但 EchoBird 仍重启）。可复现?是（git clone 读源码即可；未安装到本机）。

- **OpenPencil（ZSeven-W/openpencil）外部调研（2026-08-16，调研）**：用户发
  https://github.com/ZSeven-W/openpencil 链接问是什么。问题=OpenPencil 是 ZSeven-W 出品的纯
  Rust AI-native 矢量设计工具（Design-as-Code，MIT，~5.0k★，v0.8.4，主语言 Rust，default main，
  主页 op.zseven.tech），自称「首个开源 AI-native 矢量设计工具 + 首个并发 Agent Teams」；不是
  DSH bundle。解法=读 GitHub API、README/AGENTS/CLAUDE、Cargo.toml、op-cli skill_install_cli.rs、
  skill-bundle.json 与 openpencil-skill 仓库。要点=①产品能力：无限画布、Prompt→Canvas 流式生成、
  并发 Agent Teams（orchestrator 拆空间子任务并行）、内置 MCP server（op-mcp，stdio+HTTP，分层
  design_skeleton→content→refine）、`op` CLI（design/insert/import:figma/codegen）、`.op` JSON
  文件、代码导出 React/Vue/Svelte/Flutter/SwiftUI/Jetpack Compose/React Native、50+ 样式指南、
  Figma `.fig` 导入、Git 集成、P2P 协作、PPT/PDF 导出、Web SDK（vanilla/React/Vue）。技术栈：Rust
  workspace + jian（vendored GPU-Skia UI）+ casement（winit fork）+ agent-rs，native Skia GL /
  浏览器 CanvasKit WASM，无 Electron，桌面单二进制 ~55.5MB、web wasm 8.2MB/2.18MB gzip；TS 版
  已退休（v0.7.5）。②DSH 关系：仓库 topics 含 `dsh-plugin` 但**仓库内没有 DSH/Cordis bundle
  代码**；真正可接入点是 openpencil-skill（agentskills.io 规范 SKILL.md，MIT，v0.8.4），
  `op install` 只显式支持 Claude/Codex/Cursor/OpenCode，其中 Codex 路径写到 `~/.agents/skills`
  （DSH 同样扫描该目录），所以 clone/symlink 到 `~/.agents/skills` 或 `~/.dsh/skills` 可被 DSH
  发现；另有 op-mcp MCP server 可供 MCP 兼容 agent 调用。③结论：独立大产品，不宜收编进本仓库，
  可作外部宿主/技能参考；如需给 DSH 装 skill 再单独执行。可复现?是（公开仓库 + 浅克隆 + skill
  仓库可复现，未安装到本机）。

- **Petdex（crafter-station/petdex）外部调研（2026-08-16，调研）**：用户发 https://github.com/crafter-station/petdex 链接问是什么。问题=Petdex 是 Codex 等编码 agent 的「动画宠物公开画廊」（3.8k★，MIT，main，最新 desktop-v0.8.0），三件套=①Web 画廊（Next.js 16/React 19/Tailwind/Drizzle/Postgres/Redis/Clerk/R2，petdex.dev）；②CLI（Bun+TS 单文件 npm `petdex`：list/install/submit/edit，Clerk OAuth+PKCE+OS keychain，R2 直传，安装落 `~/.petdex/pets` 和 `~/.codex/pets`）；③桌面浮窗（vercel-labs/native SDK，无 WebView/Node sidecar，Zig hook server `127.0.0.1:7777`，支持 Codex/Claude Code/DeepSeek Harness/Hermes/OpenCode/Gemini CLI 等，含 SSH remote agents）。解法=重点读其 DSH 集成：桌面内置 `@petdex/dsh-plugin` v0.1.0 bundle（`integrations/dsh/`，MIT，private tgz 哈希固定嵌入桌面二进制），通过官方 CLI 装进 DSH web profile：`npx --yes --package=@deepseek-ai/dsh@0.1.0-rc.6 --package=pnpm@11.19.0 -- dsh plugin --profile web add --ignore-scripts <tgz>`，卸载同理 `remove @petdex/dsh-plugin`；插件 `inject:["sessions"]` + `ctx.on("session/created|disposed|event", ..., {global:true})`，把 DSH 会话事件归一化成无内容投影（state/text/session id/seq/kind）POST 到本地 hook server（update-token 门禁、300ms 超时、失败不影响 DSH），只读不干预；子 agent/workflow/goal/compaction 归并到根会话；收到真实事件后写 `~/.petdex/runtime/dsh-handshake.json`，未重启/未收真实事件显示 restart_required。注意=①它是外部产品不是可收编 DSH bundle（桌面壳是 Native SDK/Zig），但 DSH 插件源可作为「监听 session 事件→外发投影」的最小参考；②其 README 声称事件名 turn/start、step/start、tool/call、approval/asked 等，落地前仍应以 Inspect Provider 核对 rc.6 契约；③安装命令用 npx 自带 pnpm 是桌面壳避免全局 pnpm 的实用做法；④首版只支持 macOS web profile。可复现?是（git clone + 读源码即可；未安装到本机）。

- **Yao（YaoApp/yao）外部调研（2026-08-16，调研）**：用户发 https://github.com/YaoApp/yao
  链接问是什么。问题=Yao 是 Go 写的 AI Agent + 全栈 Web 应用运行时（7.6k★，v1.0.0-rc13，默认
  main，主语言 Go，README 自称 "All your agents and workspaces in one place, on every device
  you own. Self-hosted."），从早期低代码引擎演进而来；单二进制包含数据模型/REST/SUI 页面/Chat
  UI/内置 V8 TypeScript/TypeScript Hook/MCP/向量+知识图谱+GraphRAG，产品侧是跨设备自托管 agent
  工作台（任务看板、Open API、桌面/移动/浏览器）。解法=读 GitHub API、README/README.zh-CN、
  agent/sandbox/v2/runners.go 与 dsh/{command,config,runner,session,protocol,parse,plat_*}.go、
  npm pack @yaoapp/dsh-sdk-jsonrpc-stream。与 DSH 关系=Yao 是 DSH 的宿主/嵌入方而非可
  `dsh plugin add` 的 bundle：runners 支持 yaocode/tai/claude/opencode/dsh/pi；DSH runner 动态
  生成 cordis.yml（llm-deepseek + bash/pwsh + fs/subagent/todo/token-meter/compaction/session
  persistence/checkpoint），经 `tai dsh --config` 以 stdio JSON-RPC 启动 DSH，并配套 npm
  `@yaoapp/dsh-sdk-jsonrpc-stream@0.1.1`（MIT）自定义 DSH 插件：在官方 jsonrpc-server 上扩展
  session resume（sessionPersistence + agents.resume）与 onIdle 自动退出、promptedSessionId 防
  子 agent idle 误退。注意=①整仓 license 是修改版 Apache-2.0（商标/授权验证/50 人或百万美元营收
  企业需商业授权 + 贡献者协议），与 MIT 不兼容，不能直接搬代码；②其对 DSH 的嵌入方式（自定义
  Cordis 插件 + 独立 boot bin + JSON-RPC stdio + 会话恢复/自动退出）与 Open Design dsh-runtime
  路线类似，是「外部宿主集成 DSH」的参考；③其 npm 插件只有 peerDependencies，正是本仓库记录过的
  peerDeps 坑，但在 DSH 全家桶环境内可跑。可复现?否（纯外部调研，未安装）。

- **dsh-mac-desktop 移植 DSH Desktop 设计评估（2026-08-16，评估）**：用户问哪些 DSH Desktop
  设计值得移植进 dsh-mac-desktop。问题=两项目架构不同：dsh-mac-desktop 是跑在 `dsh web` 内的轻量
  bundle + 外置 WKWebView/Tauri 壳；DSH Desktop 是 Electron 自包含产品，拥有 launcher/
  desktopProfiles/desktopPnpm 等私有服务。解法=建议只移植「壳层体验」：①托盘+关闭隐藏+显示/退出
  （Swift NSStatusItem / Tauri tray，价值高成本中）；②系统终端入口（壳层用系统终端打开当前
  profile/DSH home 目录，成本低）；③后续可选 standalone 模式下的 profile 重启切换（把
  `--profile` 传回 dsh 重启），不建议做全量 desktopProfiles 服务。不建议移植：desktopPnpm 服务
  （当前无桌面插件生态、契约负担）、advanced 桌面布局 client（与 dsh-essentials client 重叠、
  跨栈风险高）、更新/自包含安装包/内置 pnpm（那是独立产品路线，不是 bundle 插件）。可复现?否
  （纯评估未改代码）。

- **Ouroboros（Q00/ouroboros）外部调研（2026-08-16，调研）**：用户发 README.zh-CN 链接问这个
  项目。问题=Ouroboros 是 Python 写的规约优先 Agent OS（MIT，5.4k★，v0.51.6，Python >=3.12），
  不是 DSH 插件，而是把多个编码 CLI 当执行后端的独立工作流引擎：Interview（苏格拉底访谈+模糊度
  ≤0.2）→ Seed（不可变规约）→ Execute（Double Diamond/AC 分解）→ Evaluate（Mechanical→Semantic
  →Multi-Model Consensus）→ Evolve（Wonder/Reflect，本体相似度≥0.95 收敛，最多30代）；支持
  Claude Code/Codex/OpenCode/Gemini/Copilot/Hermes/Kiro/Pi/Zcode/Goose/GJC/Antigravity/Grok 13 个
  runtime，并带 MCP server/插件层/Textual TUI/事件溯源。解法=读 GitHub API、README.zh-CN、
  pyproject.toml、docs/architecture.md、docs/research/deepseek-harness-adoption.md、
  providers/dsh_acp_client.py、providers/dsh_llm_adapter.py 与 v0.51.6 release notes。与 DSH 的
  关系=①v0.51.6（2026-08-16）起把 dsh 作为一等 completion backend：复用 ourocode ACP 客户端，
  spawn `dsh-acp-demo --config <绝对 cordis.yml>`，session/new 必须传 `mcpServers: []`，模型由
  Cordis composition 决定（响应报 `dsh-composition` sentinel），只覆盖 in-process 文本 completion
  （interview/seed/qa/evaluate），不做 tool-using orchestrator；②不是 DSH 插件，也不以
  `dsh plugin add` 形态安装；反向可把它自己的 MCP server 挂进 dsh（dsh 只桥 tools）。注意=①其
  adoption 文档针对 deepseek-harness@0.1.0-rc.5（47f9438）做的深度分析，列出可借鉴机制（Ralph
  handoff/spill/end-seed marker/invariants 等）与协作通道（外部 PR 不收，走 Discussions/社区插件）；
  ②发现上游 npm 包装 bug：`npm install @deepseek-ai/dsh-acp-demo` 坏掉——`dsh-tool-bash@0.0.1-rc.1`
  peer 依赖 404 的 `@deepseek-ai/dsh-bash-env`（仓库内已改名 shell-env），真实 smoke 需从源码 build；
  ③配置路径 `OUROBOROS_DSH_CLI_PATH/OUROBOROS_DSH_CONFIG_PATH` 被其安全模型当不可信输入处理。
  可复现?否（纯外部调研，未安装/未收编）。

- **awesome-gpt-image-2 外部调研（2026-08-16，调研）**：用户发 freestylefly/awesome-gpt-image-2
  链接问是什么。问题=这是 GPT-Image2 提示词案例与模板库（MIT，JavaScript，10.4k★，最近 push
  2026-07-22），不是 DSH 插件：主仓库=520 个逆向案例 gallery + 22 套工业级模板 + React/Vite
  可视化站（Supabase/Stripe/Alipay 登录、付费社区、赞助商），并带一个通用 Agent Skill
  `gpt-image-2-style-library`（npm 1.0.4，SKILL.md + references/style-library.md 26KB +
  openai.yaml + bin/install.mjs，数据源 data/style-library.json 41KB：13 类/22 模板/19 风格/
  10 场景/25 标签）。与 DSH 关系=仓库 topics 标了 dsh-plugin 但未发现 dsh/deepseek 集成代码，
  也不是 Cordis bundle；skill 安装目标是 Codex/Claude Code/~/.agents/skills，而 DSH 原生吃
  SKILL.md，所以可直接复制 `agents/skills/gpt-image-2-style-library` 到 `~/.dsh/skills/` 或
  `~/.agents/skills/` 使用，或 `npx gpt-image-2-style-library install agents`（写
  ~/.agents/skills）。注意=①MIT 兼容；②skill 只依赖 references 生成的模板/风格索引，无网络/
  密钥/二进制，轻量可入；③npm CLI 不写 ~/.dsh/skills，DSH 若要默认目录需手动拷贝；④付费社区/
  赞助广告是网站侧商业行为，不影响 MIT skill；⑤不宜并入 dsh-essentials 的 host/client 结构，
  应作为外部 skill 安装或按需收编到仓库 skills 目录。可复现?否（纯外部调研，未安装）。

- **DSH Desktop（anywhere-labs/deepseek-harness-desktop）外部调研（2026-08-16，调研）**：用户发
  链接问这个项目。问题=这是 DSH 生态的 Electron 桌面产品（MIT，TypeScript，7.8k★，v2.0.0，
  master），不是可塞进普通 web profile 的轻量 bundle：根仓库=产品 workspace（Yarn 4.18 +
  pinned `deepseek-harness/` 子模块 + npm rc.6 全家桶），`dsh-plugin-desktop` 包是 Cordis
  Host/Client 双面 Electron shell，由 `dsh-desktop`/`dsh-plugin-desktop` bin 启动 Electron
  main 内嵌 Host generation，经 loopback HTTP/WebSocket 复用官方 Web UI；提供兼容/高级两模式、
  托盘、profile 选择与重启切换、内置终端、内置 pnpm、更新下载，并对第三方插件公开
  `desktopProfiles` 与 `desktopPnpm` 两个 Host service。解法=读 GitHub API、README/
  README.en/README.zh、docs/{architecture,why-desktop,plugin-development,README}、
  dsh-plugin-desktop/{README,cordis.patch.yml,package.json,src/main.ts,index.ts,profile-manager.ts}。
  与 dsh-mac-desktop 关系=本地插件是 `dsh web` 的轻量 WKWebView/Tauri 壳，依赖系统 Node 和已有
  dsh 服务进程；DSH Desktop 是自包含安装包（macOS DMG/Windows NSIS），打包 Electron/Node/DSH/
  pnpm，面向不想碰 CLI 的用户，属于独立桌面产品路线而非 `dsh plugin add` 收编对象。注意=①MIT
  与本仓库兼容；②`dsh-plugin-desktop` 的 patch 依赖 `desktopRuntime`/`appExit` 等 launcher
  私有服务，普通 web profile 直接 add 会缺服务，不能当常规 bundle 装；③README 自认 pinned
  rc.6 而子模块源码早于 rc.6，测试以 npm 包契约为准；④高级模式仅 macOS/Windows，Linux 只兼容
  模式；⑤对 dsh-mac-desktop 可借鉴 profile 状态机、desktopPnpm 的 run/runPlugin 边界、Windows
  pwsh ACL 与更新管线，但复制成本高（Electron+打包+子模块）。可复现?否（纯外部调研，未安装）。

- **Archify 外部调研（2026-08-16，调研）**：用户发 tt-a1i/archify 链接问是什么。问题=Archify
  是 Agent Skill 形式的架构图生成器（MIT，13.1k★，v2.14.0，主语言 HTML）：给系统描述/仓库 →
  生成自包含交互式 HTML（architecture/workflow/sequence/dataflow/lifecycle 五类 + 四视觉预设 +
  深浅主题 + 可选有限动画 + PNG/SVG/WebM/1200×630 share card），Typed JSON IR + 确定性校验
  （validate/deliver/visual-check），支持 Mermaid 输入与 Architecture Delta 对比。解法=读 GitHub
  API、tree、README/README_ZH、SKILL.md、CHANGELOG、integrations/deepseek-harness/
  {README,package.json,cordis.patch.yml,lib/index.js,scripts,test} 与 .github/workflows/dsh.yml。
  与 DSH 关系=官方仓库自带社区集成 `@tt-a1i/archify-dsh@0.1.0`：Skill-only bundle，
  `dsh plugin --profile web add` 安装；cordis.patch.yml 只插入一个
  `@deepseek-ai/dsh-skill-filesystem` 提供方（providerName: archify-plugin、
  includeDefaultRoots:false、bundledSkillDir 用 createRequire(baseUrl) 解析包内 skills/），
  不注册原生渲染工具/Web client/Produced Files chips/遥测/网络/凭据/后台服务；shell 产物不会自动
  进 Web Produced Files，需让 agent 返回精确工作区路径。注意=①实验性，仅面向 rc.6 + Node
  ^22.19||>=24；②MIT 与本仓库兼容，但它是 SKILL.md 不是 Cordis bundle，若要用应走 skill 提供方或
  直接 `dsh plugin add` 独立安装，不宜并入 dsh-essentials 的 host/client 结构；③pack.mjs 会从
  archify/ 打干净 skill tgz，测试覆盖 tarball 安装/发现/卸载/零回归。可复现?否（纯外部调研，未安装）。

- **Open Design 外部调研（2026-08-16，调研）**：用户发 nexu-io/open-design 链接问是什么。
  问题=Open Design 是本地优先的开源「Claude Design 替代品」（Apache-2.0，TypeScript，
  87.2k★，v0.19.2），macOS/Windows 桌面应用 + Next.js Web + 本地 daemon/CLI；用本机已装的
  编码 Agent（Claude Code/Codex/Cursor/OpenCode/DeepSeek Harness 等 26 个 CLI）作为设计引擎，
  生成原型/仪表盘/PPT/图片/视频/HyperFrames，导出 HTML/PDF/PPTX/MP4；有 100+ skills、
  151 个 DESIGN.md 设计系统、277 插件。解法=读 GitHub API/tree/README/中文 README/
  QUICKSTART/AGENTS、dsh-runtime 包、dsh-profile adapter 与一键安装文档。与 DSH 的关系=它不是
  「装在 DSH 里的普通 bundle 插件」，而是把 DSH 当作一等运行时：`packages/dsh-runtime` 是
  `@open-design/dsh-runtime` bundle，`dsh plugin --profile open-design add <tgz>` 装到独立
  `open-design` profile，暴露 JSONL stdio 协议（probe/models/execute/cancel，session/
  thinking/text/tool_call/tool_result/usage/result 帧）；OD 每次启动短命
  `dsh --profile open-design --stdio` 进程，支持冷会话恢复、取消、结构化事件、模型发现；
  API Key 仍由 DSH 自己保存，OD 不打包 dsh/不存 Key。注意=①`cordis.patch.yml` 用
  `system-prompt` 覆盖 persona + `hmr disabled` + insert startup/runtime 两插件，inject
  `openDesignStartup/agentDefaultModel/agents/llm/sessions/sessionPersistence`；②Apache-2.0
  与 MIT 可共存（需保留 NOTICE/许可），比 GPL 的 Voyager 更适合借鉴；③仓库巨大（~1.8GB/15.5k
  文件）git clone 易超时，用 GitHub API+raw 逐文件读。可复现?否（纯外部调研）。

- **FuRongJun-1999/dsh-memory 外部调研（2026-08-16，调研）**：用户问这个项目。问题=它是 DSH
  官方形态的 bundle 插件（npm `@furongjun1999/dsh-memory` 0.2.8，TypeScript，MIT，6★），叫
  「灵枢（AEIS）」，定位 AGI 长期记忆：五层时空记忆图、跨会话 recall/search/timeline、知识飞轮、
  自我认知、可审计护栏；安装=`dsh plugin --profile <name> add @furongjun1999/dsh-memory`，
  但运行时需先 `pip install aeis`（Python 子进程 stdio MCP 桥，零外部依赖 wheel），所以比纯 JS
  插件重一点，但比 OpenViking 轻（无独立 server/130 依赖）。解法=读 GitHub API、README、
  package.json、tree。注意=MIT 与本仓库兼容；依赖 Python 环境；`tools` 可配 brain/core/all。
  可复现?否（纯外部调研）。

- **Voyager 外部调研（2026-08-16，调研）**：用户发 Nagi-ovo/voyager 链接让看这个项目。问题=
  Voyager 是浏览器扩展（MV3，TypeScript，Bun/Vite，19.4k★，GPL-3.0），主打 Gemini/AI
  Studio/Claude/ChatGPT 增强：文件夹/时间线/导出/公式复制/提示词库/插件引擎等；对 DSH 不是插件
  bundle，而是「任意站点提示词管理器」通过 popup 添加 `localhost:3080` + 可选 host 权限挂载，
  只在 DSH 加载 Prompt Manager，其他 Gemini 专属功能不会启用。解法=读 GitHub API、tree、README、
  中文 README、deepseek-harness.md、prompts.md、plugin-contribution.md、plugins/README.md 与
  manifest/registry/types 源码。注意=①Voyager 插件引擎是 declarative-first（CSS+JSON domOps，
  无远程 JS），与 DSH 的 Cordis bundle/预设体系完全两回事；②许可证 GPL-3.0 与本仓库 MIT 不兼容，
  直接收编/搬运源码会造成 GPL 传染，只能独立使用或做参考；③另有 Azurboy/deepseek-voyager fork
  适配 DeepSeek 但非本仓库维护。可复现?否（纯外部调研，未 clone 完整仓库——git clone 超时，
  改用 GitHub API/raw 逐文件读取）。

- **colleague-skill/dot-skill 外部调研（2026-08-16，调研）**：用户问 colleague-skill 能否装在
  DSH。问题=该项目原为 Claude Code 同事蒸馏 skill；现默认分支 `dot-skill` 已升级为兼容多宿主
  （Claude Code/OpenClaw/Hermes/Codex/DeepSeek Harness）的统一 meta-skill，把
  colleague/relationship/celebrity 蒸馏成 Skill。解法=确认 DSH rc.6 自带 skill 能力：
  `@deepseek-ai/dsh-skill-filesystem` + `dsh-tool-skill`（code/standard/cordis 预设已挂载），
  扫描 `<项目>/.dsh/skills`、`<项目>/.agents/skills`、`~/.dsh/skills`、`~/.agents/skills`，
  识别 `<root>/<name>/SKILL.md`；所以不是 `dsh plugin add` bundle，而是 clone 到 skill 根即可，
  例 `git clone https://github.com/titanwings/colleague-skill ~/.dsh/skills/dot-skill`，
  新会话后 `/dot-skill` 或模型 `skill` 工具可加载。坑=旧 `main` 分支 `create-colleague` 用
  `${CLAUDE_SKILL_DIR}` 绝对宿主路径，不适合 DSH；dot-skill 分支已改相对 `tools/...` 路径。
  自动采集飞书/钉钉需 `pip3 install -r requirements.txt`。可复现?否（外部调研+读本地 npm 包契约，
  未实际安装）。

- **OpenViking 外部调研（2026-08-16，调研）**：用户问 volcengine/OpenViking 是什么。问题=
  OpenViking 是火山引擎开源的 AI 智能体上下文数据库（AGPLv3，Python），把记忆/资源/技能统一成
  `viking://` 虚拟文件系统，内容分 L0/L1/L2 三层按需加载，目录递归检索且轨迹可观测，会话提交后
  异步沉淀长期记忆；提供 server / ov CLI / Studio 及 Claude Code、Codex、Cursor、MCP 等集成。
  解法=读 README、GitHub API 与仓库树。与 DSH 直接相关：仓库 `examples/dsh-memory-plugin`
  是官方 DSH rc.6 bundle 示例（`@openviking/dsh-memory-plugin`，`dsh plugin add` 可装），
  注册 viking_search/read/browse/remember/forget/add_resource/archive_expand 工具，用
  `agent/pre-step` 用户消息注入而非 system prompt（规避 `complete:true` 预设清空），并防护
  `viking://` URI 被本地文件工具误处理。可复现?否（纯外部调研）。

- **dsh-essentials 视觉插件重叠确认（2026-08-16，调研）**：确认 dsh-vision-any 与 ModLens 功能
  重叠（都做纯文本模型粘贴识图/图片准入接管）；同时启用会重复替换图片、双工具并存，建议二选一。
  未改代码。

- **ModLens vs 当前 dsh-vision-any 对比（2026-08-16，调研）**：用户要求比较当前视觉实现与
  liustack/modlens。当前=dsh-vision-any：轻量、单后端、粘贴转路径+vision 工具、provider-agnostic；
  ModLens：2127★、结构化 JSON 证据（OCR/版面/语义）、六内置 provider + 四家 CLI 复用、故障转移链、
  `(modlens vision)` 模型变体原生缩略图、`modlens_read_image` 工具、CLI/doctor/文档完善。结论=
  ModLens 功能/生态更强，但更重；当前实现已满足基础粘贴识图；若用户要结构化证据/多引擎容错，
  可考虑集成 ModLens。未改动代码。

- **mode-boost 调研（yjh051108/dsh-mode-boost，v0.1.0 MIT，flash 用户高价值）**：问题=用户主要
  用 deepseek-v4-flash + 各种非官方 flash（opencode-go/jiyuanlvdong 等），看套装仓库有个
  「增强思考」新插件，问值不值得。事实=①**独立仓库**（非套装指针），真实 v0.1.0 release；
  ②**host-plane bundle 插件**（官方 `dsh plugin add` 形态），装在官方 preset 之上**无需 fork
  preset**，且**与 router-standard/spec 预设共存时 no-op**（"if the session already carries a
  router-owned persona section… no double injection, migration-ready"）；③实测（2026-08-15
  官方 API，deepseek-v4-flash，reasoning_effort=max，同场 A/B）：多轮路由 63%→**94%**、收敛
  63%→**88%**、相关链 25%→42%；简单任务 3.5 步→**1 步**、复杂 8.5→7.5 步；④增强内容=deep-
  persona（weak/Flash 人设加 "Think deeply first, then produce."，P20 converge 100%）+ boost
  重分类（rounds 3+ "NEW task, classify fresh"，P19 route 88%）+ 深度自适应分派（P30）；
  ⑤`isFlashModel` 用 `/flash/i` 正则匹配 modelId——**任何非官方 flash id 同样命中**（对用户
  的 opencode-go/jiyuanlvdong flash 都生效）。**决策=暂不装**（用户正处「npm 原生+逐渐恢复」
  收敛期，且 v0.2.0 router-spec 已内置部分 deep-first 增强）；**待装清单**记录：`dsh plugin
  --profile web add <mode-boost 路径>`（bundle 装配，会重新引入第三方 bundle）。可复现?是
  （clone + A/B 脚本 probe/run-mode-boost-eval.mjs）。

- **npm rc.6 未同步 GitHub 的补充核实（2026-08-16）**：问题=rc.6 已发 npm 但 GitHub 没更新。
  核实=①npm `@deepseek-ai/dsh` latest=0.1.0-rc.6（08-13T12:35Z 发布，包定位 apps/cli）；
  ②GitHub master 最新=47f943859b（rc.5 release abe560f81e + npm-public merge），**远程无任何
  tag、无 rc.6 commit**——发布流程从 CI/分支直发 npm，不同步回 master；③**npm rc.6 包不含
  supportsDeveloperRole**（下载 tarball grep 证实）——本地补丁 eb2ae502b7（08-16）比 rc.6 晚，
  若 git pull 或用 npm 装 rc.6 会丢修复/回退行为。结论=源码运行（workspace checkout+link）与
  npm 发布版无关，保持现状；等 master 真同步了再 pull 并核对补丁。可复现?是（npm pack 解包
  grep 即证）。

- **dsh-vision-bridge 第十一批（workflow 多 agent 审计 3 角度 18 项，收敛 7 项）**：subagent 只读审计
  挂起后改用 **workflow 编排 3 个独立审计 agent**（host 内存 / CPU 路径 / 契约边界，带 schema 结构化
  输出，失败容忍）成功——发现 18 项，采纳 7 项：①pre-step+llm/stream 的 map+some 双次遍历 → map 内
  跟踪 changed（消除二次全量引用比较）；②scanMessages 去重 O(n²)→O(n)（refs.some→Set）；③附件 byId
  内嵌 Map 加单会话 200 上限（Map 插入序 LRU）；④discoveryCache TTL 60s→30min（模型能力运行期不变）；
  ⑤新增 cachedListModels 短缓存（直通检查 5s / stealth listModels 60s，`llm/adapters-updated` 清空；
  坑=stealth listModels 不能走 ctx.llm.listModels 会递归自己，缓存 key 独立前缀 `stealth:`）；⑥
  autoDescribeMessages 加 describing Set 防并发 pre-step 重复调度视觉调用（await 期间同图第二次跳过）；
  ⑦presentCall 标题中文化 + 注释澄清。未采纳=rewriteImageBlocksDeep tool-result 双遍历（重构风险大于
  收益）、lookupRef 兜底、autoDescribe 冗余检查等（各 agent 结论已论证）。坑=workflow agent 的 schema
  输出必须 strict（additionalProperties:false），否则结果被拒为 null。测试 98+15 全绿；适配器注册的
  listModels 缓存不影响 getModels 语义（仅 mapped 列表复用）。可复现=node tests/apply.test.mjs（第十一批段）。

- **dsh-notification-center 生态调研（610la/lyhalal，6⭐ MIT 通知中心）**：bundle 形态与本仓库
  完全一致（`cordis.patch.yml` + src/index.js host 8.7KB + src/client.js 52KB 纯 JS，build.mjs 只
  做 `__ModuleLoader__.load` 包装）；功能=对话/任务完成、报错、等待批准等事件→浏览器系统通知 +
  21 种 Web Audio 合成音效（零音频文件），每事件独立配置（音效/文件/URL/音量/开关）、冷却间隔、
  输入栏 🔔 快捷开关、设置页「通知中心」section + DOM 级导航图标补丁（与本仓库经验一致）；
  桌面壳（Electron/Tauri）自动切 host 端 node-notifier 原生通知（适配 dsh-mac-desktop 场景）；
  **契约逐项对照 harness 源码全部真实**——`session/event` turn/end 的 TurnEndReason
  kinds=completed/aborted/blocked/error/max-tokens/interrupted（TURN_TITLES 全覆盖、aborted
  嵌套 reason.kind 正确）、`approval/request` waterfall `(req,next)=>Promise` 返回 next()、
  `agent/status` payload{agent,status}、`subagent/end` info{id,provider,stopReason}、
  `workflow/end`(info,result)、`jobs.onJobDone`/`sessionTitle` 均 ctx.get 可选、host inject
  ['webServer']、client inject ["slots","timer"] 用 ctx.interval/ctx.effect；最佳实践合规
  （JSON-safe 队列上限 100、副作用全挂 fiber、localStorage 设置迁移、纯 JS 零构建）；**风险点**=
  ①repo 无 LICENSE 文件（package.json 声明 MIT，GitHub license=None）——纳入前须作者补文件；
  ②`/dsh-notification-center/notify` 无鉴权 GET 端点（本地同源可弹原生通知，风险低但可加守卫，
  参照 classifier /install CSRF 先例）；③node-notifier ^10 是 2021 年供应链事件后的清理版但多年
  未维护（仅原生通知路径动态 import）；④无测试（同 agent-teams/better-sidebar 先例）；npm 包
  `@lyhalal/dsh-notification-center` v0.1.32 存在、今日仍在推。结论=适合纳入（见 AGENTS.md 索引）。

- **使用统计全屏布局空白+环图口径（dsh-usage-dashboard 第三轮反馈）**：①全屏大片空白根因=
  热力图固定 13px 格（26 列≈416px 居中，1100px 下左右各 ~340px 空）+ 网格最后一行只有
  「概览」单卡右半空——热力图列改 `flex:1 1 0;max-width:46px` 横向铺满、热力图卡从 full 改
  普通（与环图 2 列并排）、概览改 full；②「上 21.2亿 / 下不到 1 亿」= 模型环图 6268万 是
  扫描口径（17/51 会话），KPI/趋势/明细表都是 exact 全量 21.2亿 一致——投影缓存无 per-model
  维度，per-model 全量须解析全部会话日志（>50 万事件，超 <3s 约束），故环图保持 scan 并强化
  标注「覆盖 N/M 会话·完整拆分需解析全部日志」。验证：render 4 场景全绿；已提交（见 AGENTS.md）。

- **使用统计全量口径+全屏自适应（dsh-usage-dashboard 第二轮反馈）**：①统计按**全量 Token**
  计算、不再区分输入/输出——PRICING 改 blended 单价（USD/1M 全量，deepseek 0.4 等）、
  costOf(model, tokens) 单参数、删 modelInput/modelOutput 拆分、sessionRows 只输出
  {id,day,model,tokens,cost}、KPI 副行/摘要/趋势副题/环图 sub 全部去掉 in/out 文案；
  ②设置页全屏已生效但布局需自适应——grid 从 auto-fit 400px（全屏出 3 列太挤）改**固定 2 列**
  + `@media(max-width:900px)` 单列，全屏 2 列、窄列单列；趋势/热力图/明细表保持全宽。
  坑=改动前先跑测试确认锚点（modelCosts 断言 0.000468→0.00024 全量价）。验证：apply 24 断言 +
  render 4 场景全绿；已提交（见 AGENTS.md 索引）。

- **dsh-plugin-jinji 生态调研（第三方 quan2005，3⭐ MIT 谨迹记忆面板）**：把「谨迹/JournalClaw」记忆理念原生落地为 DSH 插件——双轨记忆（`.journal/memory/yyMM/DD-标题.md` 流水日志 + `.journal/identity/` 人物/产品画像）+ summary 分层加载（AI 写记录时同步写 frontmatter `summary`，读取先只读 summary、点开才读全文，与 skill 目录同构）。形态与本仓库完全一致：bundle + `cordis.patch.yml` + 手写 `window.__ModuleLoader__` client（零依赖零编译），host 601 行 / client 866 行 / 冒烟 57 断言自包含（check+smoke 实测全绿）。**对本仓库有用的契约细节**：①启动注入=监听 `agent/session-start` 异步预计算快照（WeakMap 按 agent 缓存）+ `systemPrompt.context({name, order:130})` 同步提供器——「提供器必须同步、fs 异步」的标准解法；②index 条目指纹缓存兼容双形态——真实 fs 服务 stat 只有 `{version,type,size?}` **无 mtimeMs**（version 等值即官方未变更语义），测试 mock 才带 mtimeMs，指纹取不到宁直读不冒险；③配置保存「读-改-写」以磁盘现文件为基底只覆盖提交字段（并发保存不互踩）；root 三级解析 config > `DSH_JINJI_ROOT` > cwd；④「谨迹秘书」预设安装走 roster 官方创作通道 `copy('standard', id, name)` + node:fs 直写 preset 目录（`~/.dsh/.agent-presets` 在 fs 写沙箱外会 FS_SANDBOX_DENIED，与本仓库 ADR-0013 结论一致）；⑤设置卡片注册 `settings.plugin.item` 槽位（`ctx.get('slots')` 可选 + shell 共享 React，拿不到降级跳过）。**审查发现可借鉴/可改进**：POST `/config`、`/install-preset` 无 CSRF 守卫、`readBody` 无大小上限（本仓库惯例建议补）；面板硬编码深色系（#151517 等）不随浅色主题；路径防护（`.journal/` 前缀 + 拒 `..` 段 + `fs.contains`）与 index/read 分层设计良好。**可复现**：`git clone https://github.com/quan2005/dsh-plugin-jinji && npm run check && npm run smoke`。附带：vision_describe 报 `every vision model failed — opencode-go/mimo-v2.5: empty response`（免费视觉模型空响应，环境性故障，与插件无关）。

- **dsh-visualize 生态调研（第三方 Nagi-ovo，86⭐）**：Codex /visualize 语义的 DSH 插件——模型调 `visualize` 工具，对话内渲染 sandboxed iframe 交互卡片（模拟器/图表/mockup）；架构要点=`tool.call.toolview` 按 key 注册卡片 + `conversation.input.dock` 流式预览（边生成边渲染）+ `presentationMeta` 内联 fragment 保重放稳定 + 严格 CSP + 主题 token 桥接（详见 NOTES.md）。

- **npm 版本号 ≠ git master 版本（harness 更新判断教训）**：npm 上 `@deepseek-ai/dsh` 已发布 `0.1.0-rc.6`，但 git 远端 `master` 仍是 `47f943859b`（rc.5）、无任何 `0.1.0-rc*` 标签——**rc.6 只存在于 npm，git 里没有对应提交**。判断是否该更新 harness 时：①`git fetch` 后查 `HEAD..origin/<分支>` 差距（本仓库默认分支是 **master 不是 main**——查 `origin/main` 会报 "unknown revision"，浪费了 4 轮排查）；②对比 npm 版本和 git 版本要分开查，不能互相推断。结论：本地 master 已是最新，`git pull` 无内容可拉，继续用 rc.5（9 插件实测全跑通），等上游把 rc.6 合进 master 再更新。**可复现**：`git ls-remote origin 'refs/tags/0.1.0*'` 为空 + `npm view @deepseek-ai/dsh version` = rc.6。

- **审计结论**：零轮询零定时器，唯一外部资源=市场数据 215KB 缓存（10min TTL 自动过期），
  classify 遍历 160+ loader 条目（5s 缓存已加），searchPlugins 每次调用重建 592 条扁平数组。

- **报告 API 纠错（分析报告三处不准确）**：① `URLCache(memoryCapacity:diskCapacity:)` **对 WKWebView
  无效**——WebKit 用进程内缓存不走 NSURLCache；② `WKWebsiteDataRecord` **没有 size 字段**、WKWebsiteDataStore
  无记录大小 API→按大小裁剪不可行；③ `didReceiveMemoryWarningNotification`/scene 生命周期是 **iOS** 的，
  macOS 用 `DispatchSource.makeMemoryPressureSource` + `NSApplication.didResignActiveNotification`。
- **解法（commit 996c49e）**：① 内存压力源（warning/critical）→ 清 HTTP 缓存 + reloadFromOrigin，
  重建 WebContent 进程释放 JS heap；② 周期清 cache-only（启动 30s 后 + 每 6h）——大小裁剪的等价物；
  ③ didResignActive 且距上次 reload >4h → 重建进程（**不打断用户**）；全部复用 round-17 的 reload()
  （只清 cache 保留 localStorage）。spawn/孤儿回归通过。
- **可复现**：是（长期运行内存曲线）；缓解已实施，实测需用户观察 Activity Monitor。

## 第三方插件统筹治理：THIRD-PARTY.md 来源/修改追踪（14 插件盘点）
- **问题**：仓库膨胀到 14 个插件，其中 8 个来自社区（git subtree 收编），但「哪些是原样、
  哪些做了本地修改、升级时会不会被覆盖」没有正式记录——用户要求「用了别人的但做了修改的
  要放本项目内后续自己改」。

- **契约确认**：host 端把 B 站 `accept_quality`（snake）规范化为 `acceptQuality`（camel）
  （index.js:575），client 读 camelCase 正确；**mock 必须镜像 host 的规范化形状**（第一版 mock 用了
  snake_case → 画质条不渲染，是 mock 错不是 client bug）。→ 可复现：是（mock 用 snake 即复现）。

- **审计副产品**：全仓库无其他未声明硬访问——bilibili/classifier/skill-manager 的 shell 均为
  ctx.get 可选读取；vision-bridge 是唯一实例且已修。收敛信号。
- **踩坑**：① patch inject 有内联与多行 bullet 两种写法，只认前者会漏（bilibili 误报
  declared=none）；② JSDoc 块注释里的 `ctx.shell` 示例要剥 `/* */` 才不误报（仅剥 `//` 不够）。

## dsh-model-selector「刷新后仍选不了」排查：插件与服务器健康，属浏览器侧

- 用户 Cmd+R 后仍「选不了」→ 真机复现（新开 Chromium）**页面/插件全部正常**：body 正常渲染、
  触发器可点、菜单弹出、`模型/推理等级 Max` 双 cell 在位；全插件端点探测仅 vision-bridge
  client.js 404——**但 `dsh.client: {}`（host-only bundle），404 是预期的，非故障**；usage-dashboard
  200（改名已入库生效）。
- 判定：服务器 + bundle 均健康，问题在用户浏览器旧 tab/缓存。**处理**：整个关掉 tab 重开（别只
  刷新）、Safari 用 Cmd+Option+R 或清缓存、换 Chrome 对比；仍不行再报具体现象+Console 错误。
- 经验：多插件并行会话反复重启 server 期间，浏览器旧 tab 的模块状态更易失效；排查顺序=
  先 curl 端点+新浏览器复现（排除服务器/bundle）→ 再谈浏览器缓存（见 NOTES.md）。

## vision-bridge inject 缺失阻断全仓库安装（多 agent 第十三轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：全 7 插件 git 矩阵（网络恢复后补跑）发现 boot 即崩——`plugin tree failed to load:
  cannot get property "tools" without inject`，服务器 000。这是**阻断性 main 缺陷**（所有全新安装
  的用户整个 web 起不来），出自并行会话已推送的 vision-bridge。→ **原因**：patch insert 无 inject
  列表 + 模块 `inject = ['llm']` 不含 `tools`，而 index.js 直接 `ctx.tools.register()`（523/581 行）；
  Cordis 在 apply 时拒绝未声明服务的属性访问；`ctx.get('attachments'/'fs'/'settings'/'credentials')`
  是可选获取不受影响。→ **解法**：`export const inject = ['llm', 'tools']`（一行）。
  → **可复现**：是（任一全新 profile 安装该插件即崩；修复后 7 插件 profile boot 干净：server 200、
  全部 client.js 200、usage API 200、零宿主错误）。
- **教训**：插件的**硬依赖服务必须全部进 inject**（含 tools/llm 这类工具类服务），`ctx.get` 才可
  选；patch 无 inject 时模块 export 的 inject 是唯一声明处。apply 级 mock 测试（ctx 为 stub）测不出
  该错——**真实 loader 路径的 boot 验证才能暴露**（本轮的 7 插件矩阵就是这种验证）。

## 包名一致性守护脚本（多 agent 第十二轮）

**交付 → 验证 → 可复现?**
- **交付**：`scripts/check-package-consistency.mjs`——把 round 11 的审计方法论固化为可执行守护：
  逐个 bundle 核对 package.json name vs cordis.patch.yml 的 insert entry（`- id:` 虚线项 +
  缩进续行 `name:`，均解析）；显式 `name:` 是 loader 模块导入，必须 == 包名（任何不等都报错），
  `id:` 若形如 dsh-* 判为残留旧名。三向验证：真实仓库 7/7 OK exit 0；负向 1（patch 旧模块名）、
  负向 2（id 旧模块名）、负向 3（name 非 dsh- 前缀但 ≠ 包名）全部 exit 1。
  → 可复现：是（构造破坏对即失败）。
- **踩坑**：首版正则只匹配 `- id:` 虚线行，漏掉真实 patch 里缩进续行的 `name:`——负向测试直接
  漏检；且显示层把合法 entry id（bilibili-player 等非 dsh- 前缀）误标 BAD。→ 修法：分别捕获
  虚线 id、缩进续行 name、虚线 name 三类；BAD 标记只由 failures 列表驱动。

## 全仓库包名一致性审计（多 agent 第十一轮）

**检测 → 结论 → 可复现?**

- **审计**：7 个插件逐一核对 package.json name vs cordis.patch.yml entry——6/7 **天然一致**
  （patch 无显式 name 覆盖 → loader 模块名 = 包名）；usage-dashboard 是唯一有显式 name 覆盖的，
  已在前轮修好（id/name = usage-dashboard = 包名）。client.js/index.js 硬编码包名扫描——全部是
  CSS 类名（dsh-bili-*/dsh-sm-*/dsh-us-*）、localStorage 键（dsh-bili-cookies-*）、合法依赖
  （dsh-web-app/dsh-skill-filesystem/dsh-llm-deepseek），跨包引用仅 2 处且均为注释（借用的模式
  说明，无功能耦合）。→ **结论**：usage-dashboard 类缺陷（包名与 loader 名不一致）在全仓库不
  存在第二处；这是收敛信号。→ 可复现：否（本轮无新缺陷）。
- **方法沉淀**：改名为包名+patch entry 三者一致后可跑此审计（`grep -E "^\s+- (id|name):"` 对照
  package.json name + 客户端 `grep -oE "dsh-[a-z-]+"` 剔除类名/存储键/合法依赖）。

## usage-dashboard 改名分发缺陷修复（多 agent 第九轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：round 7 矩阵发现改名未入库（main 上 package.json 旧名 dsh-usage-stats → 安装落在旧
  目录+bundles 旧名）。round 9 先提交 package.json 改名（216fc5f），结果更糟——**改名后 boot 报
  `Cannot find package 'dsh-usage-stats'`**：patch 行的 loader entry（id/name）仍引用旧模块名，
  与改名后的包名不一致。→ **解法**：同步改名 `cordis.patch.yml` 的 entry（id: usage-dashboard、
  name: dsh-usage-dashboard + 注释）；HEAD 的 patch 还带上了并行会话在途的 sessionPersistence
  inject（读文件间隙被其更新，整文件提交了——该服务真实存在，HEAD index.js 不用也无害，其后续
  commit 会配套）。→ **可复现**：是（改名后不改 patch 的 git/本地安装 boot 即崩）。
- **教训**：插件改名 = **目录 + package.json name + cordis.patch.yml 的 loader entry（id/name）
  三者必须同一 commit**，只改其一会在包名与 loader 名之间制造不一致，安装即崩。

- **评估接受**：bilibili 弹幕 retire setTimeout/rAF 未跟踪清理——回调只作用于已脱离 DOM 的
  span，无 DOM/内存滞留，两轮评估均为无害级，保持现状。
- **教训**：给 Swift app 加"是否连对服务"类判断，用**响应内容特征标记**（SPA 特有常量）比
  裸状态码可靠得多；验证 isReachable 的两种方向都要测（错误服务被拒 + 正确服务就绪）。

## dsh-model-selector 多 agent 检测-修复第三轮（最终回归 + 真机环境发现）

- **双半区装载确认（真实 3080 实例）**：`GET /dsh-plugin-classifier/api` 返回真实 loader 数据
  （@deepseek-ai/cordis-plugin-hmr / dsh-agent 等内置 + 状态）；`GET /plugins/dsh-plugin-classifier/client.js`
  → 200（32KB，client 模块被 manifest 收录）；profile `dsh.profile.bundles` 含本包 + node_modules 软链在位。

- **TTL 边界确认**：`Date.now() - at < TTL` 在恰好 TTL 毫秒处过期刷新（缓存有效期为
  [0, TTL)），语义正确无 Bug；与 vision-bridge 的 `>` 教训（TTL=0 同毫秒仍命中）相反。

- **契约核实（读 harness 源码确认，非猜测）**：`fs.resolve(path,opts?)` +
  `fs.readBytes(target, signal, maxBytes)→Uint8Array`；`webServer.register({kind,path,handler(req,res)})`
  是 Node 原生 `IncomingMessage/ServerResponse`（`req.headers`/`res.setHeader`/`stdout.pipe(res)` 合法）；
  `subprocess.spawn(spec)→{stdout: Readable, terminate()}`；`shell.resolve({command,stdoutMaxBytes,timeoutMs})`+`run`。
- **可复现**：是（代码审查 + 语法 + MD5/wbi 复测全过）。

## dsh-plugin-classifier 多 agent 检测-修复第二轮（回归 + 边界/交互，自查先行）

- **契约核实（排除误报）**：FiberState DISPOSED(4)→null 与官方 plugin-inventory 一致；patch 行 inject
  与模块 export inject 是**并集**（`Inject.resolve` 合并 dict，不双等不冲突）；tools/commands 经
  `layers.effect` fiber 自回收（webServer 才需 ctx.effect）；shell.run 永不 reject。
- **验证**：三套 mock 测试扩到 **76 断言全过**（新增 CSRF 403、limit 封顶、分类搜索、超长 spec 拒、
  总数显示）；`node --check` 双半区通过。
- **可复现**：是（`/tmp/test-classifier{,-2,-3}.mjs`，需带 CSRF 头调 /install）。

---

---

---

## dsh-vision-bridge 第四批检测-修复：3 处防御性修复 + 53 断言全绿

- **契约核实（读 harness 源码确认，非猜测）**：`fs.resolve(path,opts?)` +
  `fs.readBytes(target, signal, maxBytes)→Uint8Array`；`webServer.register({kind,path,handler(req,res)})`
  是 Node 原生 `IncomingMessage/ServerResponse`（`req.headers`/`res.setHeader`/`stdout.pipe(res)` 合法）；
  `subprocess.spawn(spec)→{stdout: Readable, terminate()}`；`shell.resolve({command,stdoutMaxBytes,timeoutMs})`+`run`。
- **可复现**：是（代码审查 + 语法 + MD5/wbi 复测全过）。

## dsh-plugin-classifier v0.2 增强（市场 + 对话找插件）与 70 项测试验证
- **需求**：借鉴 dsh-builtin-toggles 的中文内置目录 + 补上插件市场与对话式找插件（`find_plugin`
  工具 + `/find-plugin` 命令），仍保持「单 tab 合并 + 内置/自定义二分」。

- **契约确认**：StreamChunk 文本收 `{type:'text-delta', text}`；finish error 在
  `{type:'finish', reason:{kind:'error', failure:{message}}}`；pi-ai openai-completions 把图片
  序列化为 `image_url:{url:'data:<mime>;base64,…'}`（代理/网关接入时用得上）；GenerateOptions
  `purpose` 只允许 `compaction|session-title`，辅助视觉调用不传。
- **验证**：`node --check` + `lib/images.js` 纯函数单测（嗅探/嵌套重写/引用收集/删除重写）全过；
  完整 boot 联调留待真实实例（agent 工具环境 boot 会挂，见前条）。
- **可复现?** 是（DeepSeek 路由附图 → pre-step 改写为文字）。

## 使用统计 Token 口径统一为合计（dsh-usage-dashboard）
- **需求**：所有 token 类统计从「纯输出」改为「合计（输入+输出+缓存命中）」，重点=各模型用量。

- **对比**：
  - Lanxing6480：侧边栏「Skills」入口 + **会话视角（全局/局部分组）** + 开关持久化到
    `~/.dsh/dsh-skill-manager.json`（不改文件）+ 增删改（编辑保留 frontmatter 其他字段）+ 只读标记；
    无命令/工具/市场。
  - Fishquito7：设置页「技能」section + **停用 = 把 `SKILL.md` 改名 `SKILL.md.disabled`**（模型目录彻底
    消失、热生效靠文件监听）+ 随包 `dsh-skill` CLI（list/add/disable/enable/delete）+ 添加/删除/搜索；
    无模型工具/市场/斜杠命令。
  - 我们：唯一具备 ①`skill_manage` 模型工具（**模型自助管理**）②GitHub 技能市场（实时拉取安装）
    ③斜杠命令 `/skills`、`/skill-remove` ④sparkle 导航图标；开关=frontmatter 改写（保留文件结构、
    可分别控 model/user 面，但不如改名彻底）。
- **可借鉴**：① Fishquito7 的「改名停用」策略（彻底隐藏 vs 我们双表面控制，可做成配置项）；
  ② Lanxing6480 的行内编辑（编辑时保留 frontmatter 其它字段，我们目前只有新建/开关/删除）；
  ③ 两者都没有市场，市场 + 模型工具是核心差异化。
- **可复现**：N/A（调研）。经验：raw.githubusercontent 直连不稳时，README 走
  `api.github.com/repos/{owner}/{repo}/readme`（base64）更稳；生态调研用 GitHub topic 搜索
  （`q=topic:dsh-plugin`）比泛 web 搜索全。

## dsh 插件生态调研：无「模型选择器增强」插件，dsh-model-selector 是独有形态
- **结论**：盘点社区精选列表（awesome-dsh-plugin、0xsline/awesome-deepseek-harness，数据源
  dsh-external/hub + GitHub `dsh-plugin` topic）与 topic 搜索，**没有任何开源 DSH 插件替换/增强
  composer 的模型选择位**（`conversation.input.model` 槽）。生态集中在：记忆（dsh-memory-* 十余个）、
  搜索/工具（dsh-web-search-pro/exa、dsh-toolkit、dsh-data-agent）、输入/文件（dsh-paste-input、
  file-uploads、input-history）、会话/上下文（session-search/cluster、context-doctor、easy-ctx-manager）、
  媒体（office/bilibili）、视觉（dsh-vision-router）、桌面壳。

- **调研结论（2026-02，已核 license / README）**：
  1. **VisionBridge**（[thomasunise/visionbridge](https://github.com/thomasunise/visionbridge)，MIT）——
     最贴合：一个 OpenAI 兼容代理（`/v1/chat/completions`），收到含图请求后把图存下来、改写
     prompt，让**推理模型**（DeepSeek/Qwen/GLM…任意 OpenAI 兼容后端）通过工具
     `look/ocr/scan/crop_and_look/compare` 调**独立视觉模型**看图；每张图先并行生成 scene
     description 缓存，多工具调用并发，无工具的后端自动降级 prompt-JSON 协议；Docker 一条命令起。
     **DSH 接入**：`llm-pi-ai.providers.visionbridge { api: openai-completions, baseURL:
     http://localhost:8080/v1, models: [{id: visionbridge, input: [text, image]}] }`——DSH 侧路由
     声明了图片能力，所以**不用切模型、也不存在「会话含图切不回文本」问题**，一个模型通吃图文。
  2. **qwen-vision-mcp**（npm，Ollama 跑 Qwen 给无视觉模型加 `qwen-vision` 工具）——DSH 有
     mcp-client 可挂；**pi-ocr**（Pi agent 扩展，MinerU 免费云 / Ollama / Tesseract / Pix2Text
     多后端，`/ocr` 命令）——可参考其模式给 DSH 写 OCR 工具 bundle。
  3. **本地开源 VLM 直接当 DSH 视觉供应商**：Ollama(MIT)/vLLM(Apache-2.0)/llama.cpp(MIT) +
     Qwen2.5-VL / MiniCPM-V / LLaVA / Pixtral / InternVL，OpenAI 兼容端点 + `input: [text, image]`，
     数据不出本机；要 GPU。
  4. **codex-vision-bridge**（MIT，Codex 插件版 vision-bridge）、**agent-zero Vision Fallback
     Plugin** 同类思路可参考。
- **经验**：给 DSH 配"图→文"代理只需「OpenAI 兼容 + `input: [text, image]`」两个条件；用
  GitHub API 查 license（`/repos/{owner}/{repo}` 的 `license.spdx_id`）甄别开源项目。
- **可复现?** 否（方案调研，未落地）。

## LLM 请求重试次数默认 2 次：改 `llm-pi-ai.providers.<名>.retryPolicy`
- **问题**：用户反馈「每次都是重试 2 次」，想提高重试次数。
- **原因**：`@deepseek-ai/dsh-llm` 的 `retry-policy.ts` 里 `DEFAULT_MAX_RETRIES = 2`，且
  `settings.yaml` 未配置 `retryPolicy` 时所有供应商都走这个默认；`llm-pi-ai` / `llm-deepseek`
  的 `Config` 都只有 provider 级（`providers.<name>.retryPolicy`），没有全局配置项。
- **解法**：在每个供应商下加 `retryPolicy: { mode: normal, maxRetries: 5 }`（或
  `mode: always` 无限重试）。schema 见 `RetryPolicySchema`（`llm/src/retry-policy.ts`）：
  `normal` 模式字段 `maxRetries`（默认 2）、`retryableCodes`（默认 EMPTY_RESPONSE /
  RATE_LIMIT / SERVER / TIMEOUT / TRANSPORT）、`backoff`（initialDelayMs 500、
  maxDelayMs 10000、jitterRatio 0.1）；`always` 模式只有 `mode` + `backoff`。重试由
  `dsh-llm-retry` 插件在 `agent/request-error` 扩展点上执行，先写 `llm/retry` 持久化记录
  再等退避。改 `settings.yaml` 后热重载不保证生效，**重启最稳**（见上「settings.yaml 热重载」）。
- **可复现?** 是：默认配置下任何供应商瞬时失败都只重试 2 次（会话日志 `llm/retry` 事件
  `retry: 1, 2` 后终止）。

---

## LongCat-2.0 支持思考：官网确认 + 开关式 API 配置（longcat 路由）
- **问题**：longcat 路由的 LongCat-2.0 没有思考等级，需确认它是否支持思考。
- **查证**：官网模型页（longcatai.org/models）明确 **"MOPD: Agent + Reasoning + Interaction
  experts"**（架构含专门 Reasoning 专家）、响应示例带 `reasoning_content` → **支持思考**；
  但其 Chat API（longcat.chat/platform/docs/zh/api/chat）只提供**开关式**
  `thinking: {"type":"enabled"/"disabled"}`，**没有** OpenAI 式 effort 档位。
- **解法**：
  - `compat: { thinkingFormat: deepseek }`（URL 无法识别需显式声明）→ pi-ai 对
    openai-completions 的 deepseek 格式：**任意非 off 档位 → `thinking:{type:enabled}`、
    off → `{type:disabled}`**（档位值不发送，纯开关）。
  - `reasoningEfforts: {off:, low: low, high: high}`（须 ≥1 非 off 档位）→ UI 出现「推理等级」，
    选非 off 即开思考、off 即关思考。
- **可复现**：是。经验：判断模型能否思考先查官网能力页 + API 文档（开关式 vs 档位式决定
  compat/reasoningEfforts 形态）；deepseek/zai/qwen 等 `thinking:{type}` 格式都是开关式。

## 同名模型跨供应商「点击不切换」是显示混淆：触发器补供应商标签（dsh-model-selector）
- **问题**：搜索时点「基元律动」的 `deepseek-v4-flash-0731` 感觉没切换；不搜索时点就能切。
- **原因**：搜索点击与分组点击走**同一条代码路径**（`choose → select`），真实实例 A/B 复现
  两者都能切（从别的模型切入 0731 都成功、菜单关闭、无错误）。「没切换」的真相是**当前模型
  本来就是它**（`choose` 对同 provider+model 是设计好的 no-op 关闭），且**基元律动/基元律动2/
  千问三家的模型都叫 `deepseek-v4-flash-0731`**，触发器只显示模型名不显示供应商 → 切换前后
  显示一模一样，观感像「没更新」。
- **解法**：触发器**始终**在模型名后显示供应商名（`.dms-triggerProvider`，caption 色、max-width
  88px 省略），title/aria 也带上供应商。这样跨供应商切同名模型一眼可见，也根治了之前
  opencode-go2 那次「名字几乎一样」的混淆。
- **可复现**：是。经验：同一模型名出现在多个手写路由时，任何只显示模型名的 UI 都会产生
  「切了但看不见」；这类问题先 A/B 复现确认机制没坏，再修显示层。

## 给手写路由所有可推理模型批量补 reasoningEfforts（数据驱动 + 启发式）
- **需求**：用户「所有模型都应该补思考等级」。手写路由（有 `api`+`baseURL`）的模型不继承
  catalog 推理能力，必须逐个声明。
- **解法**（python 脚本一次性注入 134 个模型）：
  - catalog 判定：pi-ai `providers/data/*.json` 里 `reasoning:true` → 用其 `thinkingLevelMap`
    的**键**做档位，值=identity（off→空值、其余→同名），如 kimi-k2.6 → {minimal,low,medium}。
  - 不在 catalog 的用名字启发式：`REASON_RE`(deepseek|glm|kimi|qwen3|qwq|qvq|seed|hy3|grok|gpt|
    mimo|minimax-m|think) 命中且不被 `NON_REASON_RE`(image|audio|tts|asr|embedding|ocr|mt|math|
    speech|s2s|vl|realtime|livetranslate|distill|gui|omni|qwen1|qwen2|codeqwen|instruct 等) 排除
    → 标准档位 {off,minimal,low,medium,high,max}。
  - 跳过：明确不推理的（qwen 的 image/audio/tts/asr/embedding/ocr/翻译/omni/vl/蒸馏/旧代数/
    小尺寸 instruct，151 个）、无 catalog 证据的自定义家族（agnes/longcat，保守跳过待用户确认）。
- **坑**：catalog 档位**只有 off** 的模型（如 kimi-k2.7-code map={off}）→ harness 拒绝
  `reasoningEfforts offers no level beyond "off"`（必须 ≥1 个非 off 档位），要改用标准档位集。
- **验证**：改完必须跑 harness 自己的 `yaml` 解析 + `Config(section)` + `assertServiceable`
  （9 providers OK）+ `resolveProfiles().get(p).piProvider.getModels()` 逐个看 `reasoning=true`。
- **可复现**：是。经验：catalog 的 map 是 pi-ai 内部语义（值可为 null），settings 的
  `reasoningEfforts` 值必须非空（仅 off 可空）且至少一个非 off 档位；批量改配置前先干跑分类
  打印人工过一遍再落盘。

---

## 非多模态模型发图片报「当前模型不支持图片」：DSH 图片准入机制 + 配置解法（咨询类）
- **问题**：默认用 DeepSeek 系列（如 `jiyuanlvdong/deepseek-v4-flash-0731`）时，附图发送报
  「当前模型不支持图片，请切换支持图片的模型」。
- **原因**：① `api-proxy.ts` 的 `prompt` handler 在消息进会话**前**做能力准入——`content` 含
  `image` 时调 `llm.resolveModelInfo(provider, model)`，若 `inputModalities` 不含 `image` 直接
  返回 `attachment-error / MODEL_DOES_NOT_SUPPORT_IMAGES`（前端文案在
  `ui-conversation/src/client/locales.ts` 的 `image.modelUnsupported`）；② `selectModel` 也拒绝
  「会话里已有图片时切到纯文本模型」；③ `read_image` 工具（`tool-fs/src/read-image.ts`）同样按
  当前路由能力门控；④ **DeepSeek API 本身纯文本**：`llm-deepseek` 适配器硬编码
  `inputModalities: ['text']`、序列化器直接抛 `UNSUPPORTED_CONTENT`——DeepSeek 模型无解；
  ⑤ pi-ai 路由的能力 = settings.yaml `llm-pi-ai.providers.<路由>.models[].input`，缺省时继承
  pi-ai 内置 catalog 同名路由/模型的 input（`catalog.ts` resolveRouteModels：
  `declaredInput(entry.input) ?? base?.input ?? defaultInput ?? ['text']`），自定义路由（无内置
  catalog 对应）默认 `['text']`。
- **解法**：① 需看图时先切换视觉模型再发图——用户的 settings 里已可用的 catalog 继承视觉模型：
  `opencode-go` 的 kimi-k3 / kimi-k2.6 / kimi-k2.7-code / qwen3.7-plus / qwen3.6-plus /
  minimax-m3 / mimo-v2.5 / grok-4.5，`xiaomi` 的 mimo-v2-omni / mimo-v2.5，`zai` 的
  glm-5v-turbo（用 node 读 pi-ai `providers/all.js` 的 `getBuiltinModels` 核对 `input` 含
  `image` 的路由/模型）；② 自定义路由的视觉模型（如 `qwen` 的 qwen3-vl-plus / qwen3.5-ocr /
  qwen-vl-ocr）要手写 `input: [text, image]`（或路由级 `defaultInput: [text, image]`），只给
  上游真收图的模型声明，否则中途被上游拒；③ 顺序坑：**先切模型、后附图**，会话一旦含图就切不回
  纯文本模型（`selectModel` 报 "does not accept image input, but this session already contains
  images"），要回 DeepSeek 需开新会话；④ settings.yaml 直改后重启最稳（外部直改热重载不可靠，
  见前条）；⑤ 无内置「图片自动切视觉模型」配置（无 imageModel/fallbackModel），准入检查在
  api-proxy 内部、插件也拦不到该层；备选=OCR 模型把图转文字再喂 DeepSeek。
- **补充（发完图切回纯文本模型）**：同会话回切有官方路径——`/compact`（base bundle 内置命令，
  `command-compact` → `compaction.compactNow`）把**从头开始的头部区间**用纯文本 checkpoint 替换
  （`region.ts` `selectCompactableRange` 头锚定、`user/message` + `surfaceOp: replace`），只保留
  最近尾巴（`retainTokens`/`retainRatio`，默认按比例）不动；图片消息被压进区间后会话无图片块，
  即可切回 DeepSeek。**坑**：① 摘要调用会重放含图历史（`summarizer.ts` 直接 `ctx.llm.stream`
  重放 region），压缩时当前模型必须是视觉模型，否则摘要阶段就抛 `UNSUPPORTED_CONTENT`；
  ② 图在保留尾里压不掉；③ `/compact` 要求 agent 空闲、无活跃回合。硬绕过 selectModel 守卫无效：
  强切后 DeepSeek 适配器对含图历史照样抛 `UNSUPPORTED_CONTENT`，会话会坏。最省事=开新会话，
  先用视觉模型把图总结成文字带过去。
- **可复现**：是（DeepSeek 路由附图必现）。

## 仪表盘三处一致性/性能坑（dsh-usage-dashboard）

