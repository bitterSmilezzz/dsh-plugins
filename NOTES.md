- **dsh-trace-compare 调研 + rc.7 适配实测（2026-08-19，第三方/适配）**：问题=研究 lamost423/dsh-trace-compare（DSH 轨迹可视化插件：上传 session log 对比 + 实时迷宫页签）并按伞目录理念审计、做 rc.7 适配验证。审计=Pi 契约全绿（零工具零注入 token 开销=0、无记忆/RAG、依赖仅 clsx、体积 client.js 127.9KB gzip 45KB 远低 900K WARN 红线、slot 与伞目录零冲突、工程卫生好）；唯一实质门槛=基线 rc.6 本机 rc.7。适配=peer 范围 `>=0.1.0-rc.6 <0.2.0` 天然覆盖 rc.7 无需改；仅 devDeps rc.6→rc.7，typecheck+13 vitest+build 全绿。**坑=①`dsh plugin --profile web add <本地路径>` 内部走 corepack pnpm，profile package.json 无 packageManager 字段时拉最新 pnpm 11.22（store v11）与 profile 现有 v10 store 冲突 → ERR_PNPM_UNEXPECTED_STORE；profile 级 .npmrc store-dir 指回 v10 无效（corepack 仍解析 v11），解法=profile package.json 钉 `"packageManager": "pnpm@10.28.2"`（与现有 store 匹配）后 add 成功，依赖记 `link:` 协议；②web profile 当前 cordis.patch.yml 是 `[]` 空数组（2026-08-19 清空第三方插件），插件经 package.json dependencies（github/link）+ 自带 patch 插入 entry，装完需重启 dsh web 生效；③产物完整性=tsdown entry 只打 client，host no-op（src/index.ts）+ invariant 由 tsc 出 lib/index.js，勿漏检。**验证**=`dsh plugin --profile web add` 成功（dsh-trace-compare link: 入 profile）；**重启 dsh web 后 playwright 实测 6/6 全绿**（scripts/verify-trace-compare.mjs：①/plugins/dsh-trace-compare/client.js 128KB 加载 ②侧边栏「Trace Compare」入口（headless 为 en locale，aria-label 英文）③shell.overlay 上传面 iframe ④上传真实 2.98MB .jsonl.zstd → 迷宫 SVG 1545 节点渲染成功 ⑤会话页「Live Maze」页签 + iframe 挂载 + SVG 239 节点 ⑥宿主 body[data-ds-dark-theme] 翻转 → iframe data-theme=dark 跟随；全程 console 零错误）；脚本坑：text= 混合引擎列表不可靠（用 [role=tab] hasText 正则）、sandbox iframe frame 对象重挂失效（每次 elementHandle().contentFrame() 重取）、页面迷宫数据是顶层 let 不在 window（用 SVG 节点数佐证）。可复现?是（无 packageManager 的 profile 加本地包必现 store 冲突）。
- **muse-spark-1.2 直连根因闭环 + dsh-model-fix 插件（新建第 6 个自研 bundle，2026-08-19，模型/插件）**：问题=用户要求 muse-spark 直连不用代理。解法=三层取证：①网络层直连畅通（200/0.6s，走 7890 代理反而慢且结果相同）；②内容层省略 max_tokens 时正常（**小 max_tokens 会返回空内容**——隐藏 thinking 吞预算；DSH 未配 maxTokens 不发该字段，不受影响）；③**根因=opencode 聚合端点（opencode.ai/zen/go/v1）的 muse-spark-1.2 实现缺陷：流式只发内容、从不发 finish_reason 也不发 [DONE]**（同端点 deepseek-v4-flash/glm-5.2 均正常，muse 特有）→ pi-ai（DSH 同款 SDK）openai-completions.js 强制 stream:true 且结尾要求 finish_reason（:437 throw "Stream ended without finish_reason"）→ DSH 映射 TRANSPORT 且 TRANSPORT 在默认可重试列表 → agent 重试插件按 maxRetries=10 反复重跑烧 token。**解法=新建 host-only bundle `dsh-model-fix`**（bitterSmilezzz/dsh-model-fix，第 6 个自研独立仓库）：在 llm/stream waterfall 上包一层转换，仅当「已输出内容 + 结尾 error(TRANSPORT|STREAM_CLOSED) + 消息匹配 /stream ended (?:before|without)|without finish_reason/i」时把 finish 改写为 {kind:'stop'}；真实传输故障（SocketError 等）与空响应照常失败。配置 modelPattern（默认 ^muse-spark）+ providers 白名单。**坑**=①schemastery 3.18 的 z.object schema 是**可调用函数** `Config(input)`（返回规范化值），**没有 .parse/.validate**；②node --test 传目录在 Node 22 会当模块加载（MODULE_NOT_FOUND），要用 glob `'tests/*.test.mjs'`；③新 bundle 遵循伞目录模式：**lib/ 入库**（gitignore 不排除）、无 prepare 脚本、GitHub 直装；④Config 非法正则要在 apply 里 new RegExp 抛错实现 loud failure（schema 只校验 string 类型）；⑤验证链=10 单测 + **真实 pi-ai 集成**（同款 SDK 复现流喂进 fix：error(Stream ended without finish_reason)→{"kind":"stop"}，内容保留）+ scratch profile dump-config 行挂载 + web profile `dsh plugin add`。**验证**=dsh-model-fix commit 已推 GitHub；plugins.json/README 已登记（check-consistency.mjs 13 条全过）；web profile bundles 已含 dsh-model-fix，**重启 dsh web 生效**。可复现?是（curl 直连 muse-spark-1.2 流式可复现缺终止事件；pi-ai 复现脚本可复现 error 事件）。
**补充（用户确认，重点记录）**=muse-spark-1.2 经 opencode-go 使用**无需**在 opencode 平台设置开启「Allow models that train on request data」（训练数据授权开关，开启后请求数据可能被用于训练）——实测不开启直连即正常返回内容，**不要为了用 muse-spark 而开启它**；此点已在 dsh-model-fix README「⚠️ 重要说明」节重点说明。
- **zod 瘦身落地：产物级 tree-shake 推翻「不可行」结论——8 API 具名导入 + IIFE 隔离，client 762→305KB（-60%）、host 581→119KB（-79%）（2026-08-19，性能/资源）**：问题=用户拍板「都做」，落地 zod 体积优化。解法=关键洞察：**esbuild 具名导入能 tree-shake zod v4**（此前 R3/R5 判「tree-shake 不可行」是因为 `import * as z` 全量导入阻止摇树；具名 `import { string, object, enum as zodEnum, boolean, union, array, discriminatedUnion, literal } from 'zod'` 触发摇树 → 68.5KB，-87%）。实施=①esbuild --bundle --minify 打包 8 API 子集；②**IIFE 隔离**：minify 子集短变量名与宿主顶层声明冲突（`Identifier 'is' has already been declared`，行首正则检测漏判单行压缩产物——minify 产物几乎单行，`var is` 不在行首），把子集包成 `var external_exports = (function () { <subset> return <inner>; })();` 完全隔离（内部名从 `export{na as external_exports}` 解析）；③替换两处 zod 定义区（各 529KB，起点 `// node_modules/zod`、终点 `// src/` 业务恢复点）。**坑**=①**minify 把导出名重命名**：`export{na as external_exports}`——去 export 行后内部无 external_exports 变量，IIFE return 名必须从 export 映射解析，否则返回 undefined（`z.string` undefined 症状）；②**行首正则检测漏单行压缩产物**：冲突检测须按 token 或直接包 IIFE（IIFE 一劳永逸）；③集成测试两个坑：vm 跨 realm 对象 deepStrictEqual 报 reference-equal（用 JSON 比较）、测试 schema 漏抄 `.default([])` 误判子集缺陷（先对比 full zod 行为再下结论）；④替换后运行实例不生效——profile 是拷贝安装，需重装/重启 dsh web（rev 缓存）。**验证**=node --check 两文件过；IIFE 提取 + at-file 真实 schema 模式（string.min/object/enum/boolean/array/union/discriminatedUnion/literal/default）host/client 双份全过；体积 762→305K + 581→119K；生成代码来源注释已写入文件。commit 80ef14c（2 files, +108/-29000）。可复现?是（具名导入摇树 + IIFE 替换可复现）。
- **visualize 工具描述压缩：schema ~1364→814 字符（-40% 固定 context 开销）（2026-08-19，性能/资源）**：问题=「都做」清单第 2 项。解法=压缩 DESCRIPTION（351→203 字符，删「Authoring contract」冗辞保「Load the visualize skill before first use」引导）与 action 参数描述（180→148，保 <20 行/<5 处/<=4 per reply 使用上限），其余参数已精炼未动。**坑**=工具描述是模型行为引导，压缩保语义优先；visualize 是活跃工具，改动下次会话生效（当前会话已注入的 schema 不变）。**验证**=node --check 过；description 总量实测 1364→814（-40%）。commit 39ee760。可复现?是（字符串长度可测）。

- **内存稳定性检测：无泄漏信号，38MB 恒定（闲置 50s 零增长 + 交互后 GC 正常）（2026-08-19，性能/资源）**：问题=goal 第 8 轮，测资源消耗的最后维度——内存。解法=新增 scripts/measure-memory.mjs（playwright 加载 3080 → 基线 → 闲置 50s 每 10s 采样 → 设置页开/关×2 交互压力 → 闲置 20s GC 回落，输出趋势+结论）。实测=JS 堆恒 38MB：基线 38、闲置 +50s 38（零增长）、交互后 38、GC 后 38——**无泄漏信号**；交互已独立验证真实命中（Settings 按钮可点、设置面板元素出现）。**坑**=①headless 下 performance.memory 量化粒度 1MB（值可能不变是正常的，粗筛只判断"持续增长"与"GC 后不回落"两种异常）；②交互是否生效必须独立验证（点没点中是两回事），用面板元素出现与否确认；③内存检测要等 networkidle + 固定延时让 bundle 解析完成再取基线。**验证**=独立交互验证脚本（Settings 点击成功、面板元素 1 个）；画像文档 doc/resource-profile.md 运行时热点节补内存数据。可复现?是（重跑 measure-memory.mjs 得同量级数据）。

- **systemPrompt 注入文本实测 + dsh-work usage section 压缩（1608→1448 字符，-9%）（2026-08-19，性能/资源）**：问题=goal 第 7 轮，测量并优化 systemPrompt 固定注入。测量=dsh-work agent-teams usage section 1,608 字符（~402 tok/请求，最大注入项）、dsh-memory memory:auto ~500 字符（~130 tok，合理）。解法=**保守压缩 dsh-work usage**：保留全部 6 步协议语义与关键指令（activate 一次/成员快照默认/不替用户选 provider-model/任务依赖/claim+send 一任务一消息/poll+中继+blocker 处理/delete），仅精简措辞（"Follow this protocol:"→"Follow:"、删冗余短语），1608→1448 字符（-9%，~40 tok/请求）；src/index.ts 与 lib/index.js 同步改（tsc 产物手改保持一致）。**坑**=①usage 文本在 src（维护源）与 lib（构建产物入库）两处存在，必须同步改，否则下一次安装用 lib 而源码与产物漂移；②压缩系统提示是行为引导文本，收益与风险权衡——保守压缩（-9%）而非激进重写（-40%），保语义优先。**验证**=node --check lib/index.js 过；新旧文本关键指令逐项人工比对 8/8 保留；字符数实测 1608→1448（src 与 lib 一致）；dsh-work 提交 f96fb7d。可复现?是（模板字符串长度差可复现；语义保留靠人工比对）。

- **工具 schema context 开销实测：36 工具 36,160 字符 ≈12K tokens/请求，自研仅占 8%——惰性注册生效，自研侧已接近最优（2026-08-19，性能/资源）**：问题=goal 第 6 轮，从 context/token 占用视角测量。解法=用 Inspect Provider（host/Tool/listTools）精确查询当前会话全部工具 schema，JSON 压缩序列化统计。数据=36 个工具共 36,160 字符（≈12K tokens/请求固定开销，与 NOTES 历史"~55 工具≈12K"量级一致）；自研 4 工具 3,222 字符（8%）= visualize 1,364 + vision_read_image 873 + write_memory 703 + agent_teams_activate 282；官方 32 工具 32,938（91%），Top=workflow 3,986 / bash 3,242 / cordis_define 1,944。**结论**=①自研 context 开销接近最优：agent_teams 惰性注册生效（10 工具仅注入 activate 282 字符，省 ~2K+），描述均已精简；②91% 是官方 harness 固有（插件不可改）；③唯一可压缩点=visualize 描述（1,364 字符，可与 dsh-visualize skill 分工压缩至 ~600，省 ~250 tok/请求，可选）。**坑**=①Inspect 结果较大时被 spill 到临时文件（"Omitted ... Full formatted result stored at ..."），统计要用 spill 文件完整解析而非截断输出；②工具 schema 大小按 JSON 压缩序列化（ensure_ascii=False + separators）估算，中文按字符计更接近实际传输。**验证**=画像文档 doc/resource-profile.md context 节更新（实测数据 + 静态核对表）。可复现?是（cordis_inspect_query listTools + 序列化统计可复现）。

- **zod 体积优化全部路径验证完毕：mini 不兼容（缺验证器）、tree-shake 不可行、产物裁剪不可行——唯一解法=源码重建 zod external（2026-08-19，性能/资源）**：问题=goal 第 5 轮，尝试"无源码"体积优化。验证=①**zod/v4/mini 替换**：npm 装 zod@4 实测——mini 含全部 8 个顶层 API（string/object/enum/boolean/union/array/discriminatedUnion/literal）但 **string() 只有 parse/safeParse，缺 min/max/length/regex/email/optional/nullable/default/trim/transform/refine 全部验证器**，at-file 业务代码用了 `.min(1)`（sessionIdSchema）→ 替换即破坏行为，**不可行**；②**esbuild tree-shake**：`import * as z`（或 zod v4 导出结构）阻止 tree-shake，原始产物 538K 即证明，**不可行**；③产物级手工裁剪：混淆类体系依赖闭包不可推导（上轮已证），**不可行**。**结论**=三路全灭，唯一正确解法=恢复 at-file 构建链（esbuild zod external 运行时解析官方依赖，预计 client 767K→~170K、host 595K→~57K），列用户决策项；现状由 check-bundle-size.mjs 守护（ui-tweaks 767K 在 WARN 900K 阈值内）。**坑**=①`enum` 是 JS 保留字，esbuild import 命名导入要 `import { enum as zodEnum }`（报 "Expected as but found ,"）；②mini 与 full 的 API 面差异巨大（mini 只 core 解析），**先验证方法面再谈替换**——顶层 API 存在不等于用法兼容；③全量导出（`export const x = import * as m`）会阻止 tree-shake（310K），按需 import 才能触发。**验证**=full vs mini 方法矩阵实测（full string 14 方法 / mini 仅 2）；临时目录 /tmp/zod-mini-check 已清理；画像文档 doc/resource-profile.md 结论节更新。可复现?是（mini 缺验证器、esbuild 保留字报错均可复现）。

- **DSH web 加载性能实测：自研 ui-tweaks client 767KB 是全站第 1 大单文件，bundle client 全部无条件加载（2026-08-19，性能/资源）**：问题=goal 第 4 轮，从"静态体积分析"升级到"真实加载测量"。解法=新增 scripts/measure-load.mjs（playwright headless 打开运行中 DSH web，采集 navigation/resource timing + performance.memory，--json 可机器读）。实测（3080）数据：页面总耗时 2.5s、DOMContentLoaded 34ms/load 245ms、**JS 资源 42 个共 5,060KB decoded**、JS 堆 used 36MB、加载期零错误；Top 资源=**dsh-ui-tweaks/client.js 767KB（全站第 1 大，超官方 vendor 727K 与 shell 433K）**、官方 conversation 418K/runtime 381K/trajectory 351K/connection 342K、自研 dsh-work 72K。**结论**=①zod 瘦身论证实锤：ui-tweaks 767K→~170K 后自研最大包袱 -78%、全站 JS -12%；②**DSH 按 profile 装载的 bundle client 半区全部无条件加载、无懒加载**——每装一个 bundle 其 client 体积直接叠加每次页面加载，自研侧体积控制（check-bundle-size.mjs）必要性实锤；③官方 bundle 合计 ~4.2MB 是页面主要成本（框架固有），自研侧 ~0.84MB。**坑**=①playwright headless 测量的是无缓存的冷加载（每次全新下载），transfer≈decoded（无 gzip 缓存效果），与真实浏览器二次加载有差异，结论看相对值；②resource timing 的 initiatorType 对 ESM script 是 "script"（部分浏览器 "other"），过滤条件要 `initiatorType==='script' || name.endsWith('.js')` 双保险；③性能测量脚本要等 networkidle + 固定延时，否则大 bundle（767K）解析未完成数据不全。**验证**=脚本两次运行结果稳定（42 个资源、ui-tweaks 767K 恒为第 1）；画像文档 doc/resource-profile.md 增加"真实加载测量"节（章节编号 一~五）。可复现?是（重跑 measure-load.mjs 可得同量级数据）。

- **bundle 体积守护脚本 + zod 使用面精确测量：8 API/29 调用确认真实使用，产物级裁剪不可行，解法=构建链重建（2026-08-19，性能/资源）**：问题=goal 第 3 轮继续优化，处理上轮发现的 zod 1.1MB 体积负债。解法=①**精确测量使用面**：at-file 业务代码（esbuild 把 z 重命名 external_exports）仅调用 8 个顶层 API 共 29 次（string 6/object 7/enum 2/boolean 3/union 1/array 6/discriminatedUnion 1/literal 3），host 与 client 相同——**zod 是真实使用非误打包**，但使用面极小；②**产物级裁剪判定不可行**：zod 是互相引用的混淆类体系（80 个文件标记 + 变量重命名），手工删未用类依赖闭包不可推导，风险不可接受；唯一正确解法=恢复 at-file 构建链（esbuild zod external 或 import zod/v4/mini 轻量入口，预计 client 767K→~170K、host 595K→~57K），列用户决策项；③**落地守护脚本 scripts/check-bundle-size.mjs**：扫 plugins.json first-party bundle 的本地 lib（client.js 单文件 + lib 合计），阈值 client>900K WARN/>1.2M ERROR、lib>1.6M WARN/>2.5M ERROR，ERROR exit 1，支持 --json；伞目录路径解析兼容 ~/workspace/deepseek-harness/&lt;repo&gt; 与旧 ~/workspace/&lt;repo&gt;。**坑**=①伞目录路径：install.sh 约定 ~/workspace/&lt;repo&gt; 但本机实际是 ~/workspace/deepseek-harness/&lt;repo&gt;（伞目录嵌套），脚本须两个位置都试；②zod 判定：业务代码不含字符串 zod（import 被 esbuild 重命名 external_exports），搜 zod 得零引用是假象，必须搜 external_exports. 调用模式；③desktop-shell 无 lib 目录（原生代码）应 skip 不报错。**验证**=脚本实测 6 个 bundle（ui-tweaks 1379K/767K 最大但在阈值内，其余 OK）；画像文档 doc/resource-profile.md 同步修正。可复现?是（zod 使用面用 external_exports 正则统计可复现；产物裁剪不可行可复现）。

- **本地 link 安装 bundle 解析不到 @deepseek-ai/* 依赖（2026-08-19，安装/坑）**：问题=`dsh plugin add <本地路径>` 后 `import("dsh-usage-plugin")` 报 Cannot find package @deepseek-ai/dsh-tools。原因=pnpm 对本地路径建的是**直接 symlink 指向 workspace**，Node ESM 按 realpath 解析，从 workspace 向上找 node_modules 无 @deepseek-ai/*（仓库没跑过 pnpm install）；而 github 安装走 .pnpm 结构，peer 依赖在 store 内可解析。解法=验证/分发一律用 `dsh plugin add github:<owner>/<repo>#<ref>`；若坚持本地 link 开发，须先在仓库内 `pnpm install`（README 本地开发流程本来就这么写）。**坑**=①「模块能加载」是 profile 侧验证的前置（host 半区启动即 import，缺依赖整行挂掉）；②本地 link 与 github 安装的解析语义不同，别混着验证。可复现?是（对无 node_modules 的仓库做本地 link 安装必现）。

- **DSH 插件资源占用画像：zod v4 完整内联是最大体积负债（~1.1MB），其余运行时热点已清零（2026-08-19，性能/资源）**：问题=继续从性能与资源占用视角做分析（goal 第 2 轮）。解法=①**体积画像**：dsh-ui-tweaks lib 1,379KB（host 612 + client 767）、dsh-work 245、dsh-visualize 125、dsh-memory 89（其余合理）；②**最大发现=at-file 的 zod v4 完整内联**：host 595KB 中 zod 538KB（93%）、client 762KB 中 zod ~596KB（sub_atFile 的 ~88%）——合计 ~1.1MB 只用到少量 API；根因=at-file 无 src（lib 是 esbuild 产物，zod 未 external 且 zod v4 导出结构不可 tree-shake），修复需恢复构建链（属架构工程待用户决策）；③**运行时热点清零**：上轮 5 项优化后复查其他插件确认无问题（paste-input 折叠 debounce+不观察 characterData、auto-hide 仅 hidden 扫描、at-file search() 懒加载启动零索引、dsh-work 轮询 1.5s 低频小 IO、dsh-memory observer 为必需功能）；④**context/token**：ui-tweaks 零工具零注入、visualize 2 工具按需、work 10 工具惰性注册、memory 1 工具——均合理。产物=`doc/resource-profile.md`（画像文档）。**坑**=①client.js 的 zod 判定不能靠 grep -c ZodError（会误报），要定位 `// node_modules/zod` 标记区间；②at-file host 与 client 各内联一份 zod（双份 ~1.1MB），修复时两处都要处理；③zod 标记 80 个连续目录注释，取首标记→factory 边界为准确跨度。**验证**=python 实测字节数 + 标记定位；各插件运行时热点逐项人工复查。可复现?是（构建产物内 zod 完整内联可复现；修复需重建）。

- **dsh-usage-plugin Pi 精简大改 v0.2.0（2026-08-19，重构）**：问题=用户选定「按 Pi 精简」方案（删重功能保面板）。解法=①host lib/index.js 894→~610 行：删 buildCsv/csvCell/parseCsvLine/writePngFile/writeTextFileViaNode/mkdirViaNode/pickDirectory/revealDir/persistPricing 与路由 setPrices/resetPrices/export/exportPng/import/pickDir/reveal；保留记录/持久化/迁移/峰谷计费/loadPricing（pricing.json 手改覆盖）/余额查询（subprocess spawn node https）；**新增 defineTool `usage_stats` 工具**（参数 since/until/groupBy day|model|all；返回 summary 三档费用 + days≤90 + byModel≤20），inject 加 tools；②client.js 996→~690 行：删 CacheListView/PriceView/drawReport(canvas PNG)/导出/导入/目录选择 UI 与 export 样式，面板保留 概览+用量日历+余额查询（顶 tab 用量与消耗/剩余余额查询），load id 从 @feiyang666/deepseekharnessdesktop 改 dsh-usage-plugin；③cordis.patch.yml inject 加 tools；④package.json 0.2.0 + peerDeps 补 @deepseek-ai/dsh-tools ^0.1.0-rc.7；⑤README 重写（github 安装、删上游 npm 发布/安装指引）。**验证**=node --check 全过 + 端到端冒烟（stub @deepseek-ai/dsh-tools + 假 ctx：llm/stream 消费后记账、usage_stats day/model/all 聚合与时间过滤正确、/usage/api list/clear/balance/unknown 行为正确）。**坑**=①ctx.tools 是 inject 后才有 ctx 属性，mock 须在 ctx 上直接挂 tools 服务（ctx.get 不覆盖属性访问）；②llm/stream handler 返回 async generator、记录写在 finally——测试须消费完整个流才见记录；③defineTool output.schema 是 author-facing ValueSchemaSpec（type:object 必须带 additionalProperties:boolean），render 返回 ContentBlock[]；④usage_stats 读 apply 闭包内 records，工具与 /usage/api 共享同一内存数组（同进程天然一致）。可复现?是（node --check + 消费流后 tool.execute 可复现全链路）。

- **DSH 记忆插件市场契约审计：13 候选对照伞目录契约全量校验，3 个 patch id=dsh-memory 与自有插件冲突（2026-08-19，审计/决策）**：问题=用户先调研市面记忆插件（上轮），本轮要求对这些插件做项目约束和契约校验，决定替代 dsh-memory 的合规路径。原因=不能只看功能，要对照仓库硬约束（AGENTS Pi 红线/THIRD-PARTY 治理/check-consistency manifest/bundle 包契约/安装通道）。解法=①建五组契约（M1 manifest schema / M2 bundle 包契约 / M3 安装通道 / P1 Pi 红线 / G1 治理）逐候选取证：GitHub 默认分支 package.json/cordis.patch.yml/目录树 + npm registry + lib 源码 grep defineTool 数工具；②产出审计报告 docs/memory-plugin-audit.md；③分级：✅ meta-memory（0 工具纯 brief 注入）/ claude-bridge（0 工具迁移）；🟡 ben7am1n dsh-memory（3 工具零依赖 SQLite FTS5 最贴 Pi，但包名=dsh-memory 冲突，fork 改名后是首选极简替代）/ jenjx @dsh-memory/bundle（引证记忆设计最佳但安装通道断裂）/ vault（3 工具合规但每轮全量注入+id 冲突）/ memento（工程最规范但 Apache-2.0+immediately:true）/ towzai（注入理念最贴但 6 工具+embedding 依赖 /api/embed）；🟠 meow（7 工具+七层+dream 复杂度超标）/ chenhw7（6 工具）/ claudemove（5+工具+Apache-2.0）/ tdai（sqlite-vec/tcvdb/jieba 原生重依赖）；🔴 mnemon（13+ 工具违反 >10 拆分红线+9 个外部 provider）/ nocturne（硬依赖自建 Nocturne MCP server 违反不内置重功能）。坑=①**3 个候选（vault/towzai/jenjx）的 cordis.patch.yml 都 insert id=dsh-memory，与伞目录自有 dsh-memory 行 id 冲突**——Cordis 后层按 id 覆盖前层，同装必一方静默失效，收编前必须 fork 改 patch id（仿 aqua 先例）；②ben7am1n 的 npm 包名就叫 dsh-memory（已发 0.1.0），npm 层与自有插件无法同装；③多数第三方仓库 lib/ 未入库（.gitignore 忽略构建产物）——GitHub 直装缺 lib/index.js，market/better-sidebar 同款坑，mnemon/meow/ben7am1n/meta-memory/nocturne/chenhw7/claude-bridge 只能走 npm（或 fork 后 lib 入库）；④jenjx @dsh-memory/bundle npm 未发+无 lib+无 prepare，当前零安装通道，要等作者发版或本地构建；⑤raw.githubusercontent.com 批量抓取中途持续超时（连续两次整批失败），unpkg/jsdelivr CDN 兜底成功——批量取证脚本要带 CDN fallback；⑥bash 内联 node -e 引号/$ 转义易碎（NOTES 此前只记了 PowerShell，bash 同理）——复杂检测一律写 .mjs 文件再跑。验证=13 候选全部取证（包结构/工具数/安装通道/★/license/patch id），审计报告落盘，未动 plugins.json（并行会话有未提交改动，只提交 docs/ 与 NOTES.md）。可复现?是（重跑抓取脚本可复现全部证据与冲突判定）。

- **dsh-ui-tweaks 性能优化：5 处常驻开销热点修复（2026-08-19，性能/资源）**：问题=从性能与资源消耗占用视角优化。分析结论=大部分已优化（paste-input 折叠 300ms debounce + 不观察 characterData 避免流式干扰 + 8s 兜底轮询；auto-hide observer 仅在 hidden 时扫描；at-file settings 走官方内存服务 `applies:live` 无每步磁盘 IO；无 systemPrompt 注入、零 LLM 工具 = context/token 零开销）。发现 5 个热点并修复：①**两处 installNavIconPatch**（sub_pasteInput + sub_atFile）observer 回调「同步 patch + rAF 调度」双跑冗余——每次 DOM 变化都多一次全量图标扫描（patch 幂等：已是目标则跳过），去掉同步跑只留 rAF 节流，修复延迟一帧肉眼无感；②**immersive observer 无条件调度**——disabled 时聊天流式更新仍每帧排一个 rAF（refresh 在 disabled 下本就是 no-op），改为 `if (enabled) scheduleRefresh()`，enabled 由 onConfig 翻转并直刷不受影响；③**installPluginTabDedupe patch 全文档 button 扫描**——设置面板未挂载时整段 no-op 却先扫全文档 `button[aria-controls]`，加面板快速失败（一条 querySelector 前置）；④**at-file host scanMentions '@' 短路**（`!text.includes("@")` 直接返回，零行为变化）；⑤（上轮已做）host 组合器 config 透传。**坑**=client.js 与 at-file/index.js 均为纯 LF（非 CRLF），edit 直接改安全；打包产物内联 factory（sub_*）可安全手改，前提=patch 幂等 + 改动只删冗余调度不碰逻辑。**验证**=node --check 全过；git diff 逐处人工审查 5/5 行为等价（12 insertions 4 deletions）；改动仅在 client 半区（硬刷新生效）+ at-file host（重启 dsh web 生效）。可复现?是（双跑冗余/无条件调度在 DOM 频繁变化时开销可测）。

- **install.sh 的 set -e 命令替换炸弹：ensure_source 在 dry-run 下 return 1 → CI bash -e 静默退出（2026-08-19，CI/修复）**：问题=重写后的 ci.yml 本地全绿，但推上 GitHub 后 Installer dry-run 一步失败：日志停在 `[info] clone 插件源码:` 后 1.7ms 即 `Process completed with exit code 1`，无任何报错信息。原因=两层：①GitHub Actions 默认 `shell: bash -e`，而本地验证时用的 `bash scripts/install.sh --dry-run` **没带 -e**——环境差异是没抓到的根因；②install.sh 第 18 行 `set -euo pipefail` + 技能包循环里 `src="$(ensure_source "$pack")"`：dry-run 下 ensure_source 对未缓存包 `return 1`，命令替换失败使赋值语句整体非零 → set -e 在 `[ -z "$src" ]` 判空**之前**直接杀脚本；同时函数内 `[dry-run] git clone` 走 stdout 被命令替换吞进 $src，污染判空（本地无 -e 时因此走了「无 skills 目录」分支而非期望的警告分支）。解法=①调用点加 `|| true` 兜底：`src="$(ensure_source "$pack" || true)"`（set -e 下命令替换失败照样中止，必须显式兜底）；②ensure_source 的 dry-run 分支日志全部改走 stderr（`>&2`），保证 stdout 只作返回值通道（本函数 stdout=返回路径，混入日志文本会让 $src 非空、判空失效）；③本地复现 CI 环境：`DSH_HOME=/tmp/empty bash -e scripts/install.sh --dry-run`（空缓存强制走未缓存分支），修复前 exit 1、修复后 exit 0 且输出「⚠ 无法获取技能包源码」警告 +（--dry-run 完成）。**坑**=①本地验证 shell 脚本必须带与 CI 相同的 `-e`（乃至 -euo pipefail），否则 set -e 类炸弹只在 push 后爆；②bash 函数 stdout 是返回值通道，日志输出必须 `>&2`，否则被命令替换吞掉；③空缓存环境变量（DSH_HOME 指到 /tmp 新目录）是复现「未缓存包」CI 分支的干净手段。**验证**=bash -n 过；`DSH_HOME=/tmp/empty bash -e scripts/install.sh --dry-run` exit 0（修复前 exit 1 可复现）；正常 dry-run exit 0；推送后 gh run 复跑 Installer dry-run 绿。可复现?是（`DSH_HOME=/tmp/empty bash -e scripts/install.sh --dry-run`：修复前必 exit 1，修复后 exit 0）。
- **dsh-ui-tweaks 架构级合并：删死代码（3 个独立 client.js + at-file/types），host 组合器统一配置契约，client 单文件唯一事实来源（2026-08-19，重构/合并）**：问题=用户要求「dsh-ui-tweaks 逐渐合并进来的，整体做代码架构级合并，精简和优化」。审查=合并后结构是「外挂组合」：host 半区 index.js 组合器（挂 model-selector/paste-input/at-file + ToolResultPruner + retry 路由），client 半区 lib/client.js（19764 行）内联 4 个 essentials factory（sub_modelSelector/sub_pasteInput/sub_atFile/sub_attachmentRemoveAlwaysVisible）由 applyEssentialsClient 统一 apply；但**残留 3 个独立 client.js 子文件**（at-file 16275 行/611K + paste-input 1217 行 + model-selector 1040 行 ≈18.5K 行）不再被任何代码引用（client.js 完全自包含，零相对 import）= 双份维护死代码；at-file/types（96K d.ts）无消费者。原因=2026-08-19 essentials 并入时把 4 个 factory 内联进 client.js（classic script 不允许顶层 import/export 必须单文件），但独立 client.js 没删，且 NOTES 历史显示此前一直按「子源码 + 合并产物」双份同步改的模式维护。解法=①**删死代码**：3 个独立 client.js + at-file/types/，删除前用脚本对比确认——内联 factory 与独立文件内容**完全一致，仅包装壳不同**（独立文件是 `window.__ModuleLoader__.load({id, factory})` 包装、内联是 `function sub_xxx(require){}` 包装），证明独立文件是被内联取代的死副本，删后行为零变化；②**host 架构统一**：index.js 头部重写为架构图注释（host 组合器 + client 单文件），定义完整配置契约（atFile/pasteInput/toolResultPruner 逐模块透传），applyPasteInput 从裸调（limits 不可配）改为 `applyPasteInput(ctx, cfg.pasteInput)` 透传；③**client 注释统一**：client.js 头部重写为唯一事实来源架构说明（4 factory 内联 + 勿再建双份）；④**文档同步**：README 设计节重写（唯一事实来源 + host 组合器 + 配置透传）、cordis.patch.yml 注释同步、顺手修 README 安装示例旧 `--scenario essentials` 语法为 `--only`。**坑**=①README 编辑两次 old_string 不命中——行首缩进/空格细节差异导致精确匹配失败，缩小锚点后成功；②**并行会话**：AGENTS.md/NOTES.md 顶部被并行会话更新（usage-plugin 脱钩内化 + CI 修复），dsh-plugins 工作树有 4 处未提交改动——不是本任务产物，只读不碰，只提交自己的 ui-tweaks 仓库（AGENTS「改完即交」防并行 checkout 清工作）；③client.js 是 19764 行打包产物，架构合并只做注释级 + 外部死文件删除，不动内部逻辑（避免破坏打包结构）。**验证**=node --check 6 文件全过；引用完整性脚本（3 host imports + 4 factory + applyEssentialsClient + load id 均在）；grep 全仓无 at-file/client|paste-input/client|model-selector/client|at-file/types 残留（仅 NOTES 历史）；lib 体积从 ~2.5M 降至 1.4M。可复现?是（合并后未删独立 client.js 即产生死副本；判断死代码方法=对比内联 factory 与独立文件差异，仅包装壳不同即纯死代码）。

- **架构决策落地：dsh-usage-plugin 脱钩内化改自研（独立仓库），放弃并入 dsh-visualize（2026-08-19，架构）**：问题=用户先问能否合并进 visualize，分析可行后用户改判「算了，用量统计得单独一个插件，改自研；可视化还是这两个」。解法=①放弃合并方案（未执行任何合并代码）；②plugins.json：dsh-usage-plugin origin third-party-fork→first-party、删 upstream 字段、note 改「脱钩内化改自研」；③THIRD-PARTY.md：治理头「第三方 fork 保持独立」列表去掉 usage、新增「已脱离上游（按第一方维护）」条目，行表维护状态改「已脱离上游，按第一方维护（不再跟上游 merge，上游更新仅作 cherry-pick 参考）」；④AGENTS/README：自研 bundle 4→5 个、fork 4→3，各处计数与列表同步（README --all 计数顺带修正为 自研 6 bundle + 3 fork + 3 技能包，旧文「+desktop-shell+preset」重复/过期一并清理）；⑤check-consistency 13 插件全过。**附带发现（现存 bug）**：dsh-visualize/lib/index.js 仍 `import {mergeConfig} from dsh-core`，而 dsh-core 已于 2026-08-19 删除、dsh-visualize package.json 无 dependencies、profile 内 node_modules 也无 dsh-core——`require.resolve` 实证 MODULE_NOT_FOUND，**当前 profile 里 dsh-visualize host 半区加载即崩**（visualize/vision_read_image 两个工具实际不可用）；修法=内联浅 spread `{...(config??{})}` 替代 mergeConfig（仅此处 1 处使用）。**坑**=①「改自研」= 治理层改动（plugins.json origin + THIRD-PARTY 脱钩 + AGENTS/README 清单），不是代码大改；大改范围用户另行确认；②usage-plugin 未安装在 web profile、`~/.dsh/dsh-usage/` 无数据——改自研零运行时影响；③之前「删除旧仓库」的选择因方案变更失效（仓库保留为自研归宿）。可复现?是（plugins.json origin 回改 third-party-fork 会触发 check-consistency 缺 upstream 失败；visualize 悬空 import 可用 require.resolve 复现 MODULE_NOT_FOUND）。

- **dsh-plugins CI 修复：ci.yml 停留在旧 monorepo 布局导致每次 push 必挂；build-windows-shell 迁往独立 dsh-desktop-shell 仓库（2026-08-19，CI/修复）**：问题=用户问「github 上的 ci workflow 一直报错」。原因=2026-08-19 的 meta-repo 重构（791bb2d：6 bundle 拆独立仓库、dsh-core 删除、技能包进 dsh-skills）只改了仓库结构，.github/workflows/ci.yml 未同步更新——仍引用旧布局：scripts/check-package-consistency.mjs / check-inject-consistency.mjs / benchmark.mjs 已不存在（MODULE_NOT_FOUND）、dsh-dev|design|writing/scripts/verify-skills.mjs 已迁 dsh-skills、dsh-core/test/*.test.mjs 目录已删（node --test 对不存在的 glob 是静默 0 文件通过，CI 首个真实失败=Package consistency）。build-windows-shell.yml 同理引用 dsh-desktop-shell/tauri/**（该目录已不在本仓库，仅 manual/path 触发故不报红）。解法=①ci.yml 重写为 meta-repo 可测面：pnpm install --frozen-lockfile + node scripts/check-consistency.mjs（plugins.json 一致性）+ node scripts/plugin-manifest.mjs list + install.sh/install-plugins/apply-settings/install-external 四个 --dry-run（本地全预跑 exit 0，dry-run 不触网）；②build-windows-shell.yml 迁到独立 dsh-desktop-shell 仓库（.github/workflows/，路径改 tauri/**、tauri/src-tauri、native/build；Cargo 产物名 dsh-desktop.exe 与 tauri.conf.json productName DeepSeekHarness.exe 核对不变），从 meta-repo 删除；③commit+push。**坑**=①重构仓库结构时 workflow 不报错不报红——CI 只在 push 暴露，改完结构必须同步核对 .github/workflows 的引用路径；②node --test 空 glob 静默通过是「假绿」，清点 CI 步骤要按目录/脚本真实存在性核对而非看 step 结果；③meta-repo 无单元测试可跑（bundle 全在独立仓库），CI 可测面=清单一致性 + dry-run 系列；④迁移 Windows 构建 workflow 时要按 Cargo.toml name + tauri.conf.json productName 双核对产物文件名。**验证**=新 ci.yml 全部 7 步本地预跑通过（check-consistency 12 插件全过）；dsh-desktop-shell 仓库 workflow 就位、路径与产物名核对无误；推送后 gh run 复跑转绿。可复现?是（旧 ci.yml 任何 push 必现 Cannot find module；新 ci.yml 本地全绿）。
- **可行性分析：dsh-usage-plugin 可精简并入 dsh-visualize（2026-08-19，架构/决策）**：问题=用户决定 usage-plugin 脱钩内化+大改，要求按 dsh-visualize 理念（≤3 模型工具/零新 npm 依赖/无固定 UI 面板）精简后合并。分析结论=**可以精简合并**，关键洞察=usage 的旗舰 UI（日历热力图/PNG 报表）恰是 visualize 的按需能力：63KB client 面板整体删除，改由 1 个新模型工具 `usage_stats`（host 服务端聚合 token/费用，按天/按模型输出 JSON）+ 现有 visualize 工具按需渲染卡片替代。精简后 host 保留=llm/stream 记录 + DSH_HOME/dsh-usage 持久化（数据路径不变、旧数据连续）+ 峰谷计费纯函数 + pricing.json override 加载 + 旧工作区迁移；砍掉=client 面板全套（日历/缓存列表/价格表 UI/余额 UI/PNG 长图导出）、/usage/api webServer 路由、原生目录选择(pickDir)与 reveal、CSV/JSON 导出与导入。合并后形态=工具 3 个（visualize/vision_read_image/usage_stats，恰 ≤3 红线）、零新 npm 依赖、usage 无 client 半区（bundle 仍声明 visualize 的 client）。注入并集=visualize(fs/tools/skills/llm/attachments/webServer) ∪ usage(fs/tools/sandboxPolicy/agents)≈8-10 服务（每个有据，但 bundle 比纯 visualize 重）。附带发现待修：dsh-visualize/lib/index.js 仍 `import {mergeConfig} from dsh-core`（dsh-core 已于 2026-08-19 删除、package.json 无 dependencies=悬空 import，当前 visualize 加载即崩或依赖传递解析，合并时内联浅 spread 修复）。待用户确认=余额查询去留（建议并入 usage_stats 可选参数，保 ≤3 工具；删则连 subprocess/credentials 注入一起省）、旧仓库 dsh-usage-plugin 删除方式（GitHub+本地 vs 归档）。可复现?否（设计分析，未执行）。

- **dsh-core 清理删除：共享工具包无多消费者，内联进消费方后删仓库（2026-08-19，重构/清理）**：问题=用户问「dsh-core 是不是多余」。审查=62 行 4 函数：mergeConfig 仅 dsh-ui-tweaks 用 1 处、dedupeBy 仅 dsh-work 用 1 处、hashString/sanitizeSettings **零消费者**（只有自身测试）——**没有任何函数被 ≥2 项目共享，「共享工具包」前提不成立**；且 plugins.json 里被列为 type=bundle 会被 --all 单独安装、两消费方各自锁 github 引用存在版本漂移风险。解法=①mergeConfig+dedupeBy（mergeConfig 数组分支依赖 dedupeBy，须连带内联）原样拷入 dsh-ui-tweaks/lib/index.js（去 export 加 vendored 注释）；②dsh-work 的 dedupeBy 调用点是常量无重复数组，直接 `[...new Set([...])].join(', ')` 等价替换（Set 保持首次出现顺序）；③hashString/sanitizeSettings 删除；④两 package.json 移除 `dsh-core` 依赖（删除空 dependencies 字段）、plugins.json 删条目（13→12）、README/AGENTS/THIRD-PARTY/doc README 同步；⑤本地 rm -rf dsh-core 目录；⑥GitHub：先 push ui-tweaks/work 新版本（不再依赖 dsh-core）再 **gh repo archive** dsh-core（保留只读可恢复，未 delete）。**坑**=①vm.runInContext 里创建的对象 deepStrictEqual 跨 realm 报「same structure but not reference-equal」（prototype 不同）——行为对比测试用 JSON.stringify 深比较；②删 GitHub 仓库前必须先发布不再引用它的新版本（旧版本 package.json 的 github: 依赖会解析失败）；③dsh-work 的 pnpm-lock.yaml 仍是 rc.6 旧版且 importers 无 dependencies 段——dsh-core 从未进 lock（本地 workspace 解析），移除依赖后 lock 无冲突，但 lock 与 rc.7 package.json 版本漂移是既有问题待下次 install 重建；④edit 工具改 CRLF 文件时 new_string 被当整行处理（行尾自动补 \r\n）——old_string 只匹配行首片段时拼接会断行（本次误删上一条 NOTES 首行即此因），改 CRLF 长文一律用 Node/Python 字节级读写或整行替换。**验证**：node --check 两 lib 过、check-consistency 12 插件全过、内联行为对比 8/8 通过（含 work Set 等价）、三仓库推送成功、gh repo view 确认 dsh-core archived=true。可复现?是（无多消费者的共享包 + 死代码函数，内联后删仓可复现；本判断方法=逐个函数统计消费者数可复现）。

- **咨询答复：dsh-usage-plugin 不建议并入 dsh-visualize（2026-08-19，架构/咨询）**：问题=用户问「dsh-usage-plugins 可以合并进 dsh-visualize 吗」。原因=四层不匹配：①治理=usage-plugin 在 plugins.json 是 `origin: third-party-fork`（upstream feiyang-dev/dsh-usage-plugin 1.4.0，本地 4 处修改点，THIRD-PARTY.md 明定「第三方 fork 保持独立」，升级 = `git fetch upstream && git merge`），并入第一方 visualize = 断上游升级路径，违反 THIRD-PARTY 治理；参照先例 dsh-notify 能并入 ui-tweaks 的前提是**脱钩不再跟上游**，usage-plugin 仍跟上游故不适用；②形态=visualize 是刻意拆出的纯模型工具 bundle（2 个 LLM 工具、零运行时依赖、无 UI 面板），usage-plugin 是重 UI bundle（client.js 63KB + index.js 40KB、4 子页签、余额外呼、PNG/CSV/JSON 导出、价格表持久化、6 个 host 服务注入），合并=把「给模型用的工具」与「给用户看的统计面板」两个正交消费轴焊在一起，违反核心最小化/复杂系统是负债；③历史=2026-08-18/19 刚把 visualize 从 essentials 拆出独立 bundle、usage-plugin 同批拆独立仓库，再合并=走回头路；④工具数红线不构成理由（usage-plugin 有 0 个 LLM 工具，「单插件 ≤3」不拦合并，障碍是形态与治理非数量）。解法=保持现状（usage-plugin 独立 fork + visualize 最小工具 bundle）；若动机是仓库太多想收编，唯一合规路径=dsh-notify 式脱钩收编，且宿主应是有 UI 定位的 dsh-ui-tweaks 而非工具 bundle，但上游活跃、脱钩成本高不建议；若想联动展示用量，走跨插件协作（usage 导出 JSON → visualize 卡片）不合并仓库。可复现?否（咨询结论，无代码改动）。


- **合并版装回 web profile：排查「合并不见」= profile 被清空过 + 全家桶重装（2026-08-19，安装/排查）**：问题=用户问「刚才的合并呢」——合并已推送 GitHub 但运行环境看不到。排查=web profile 的 cordis.patch.yml 是 `[]` 且注释 "all third-party plugins removed (2026-08-19)"，package.json bundles 只剩官方 base/web-app（第三方插件 20:09 被全部卸载，早于 dsh web 进程 20:11 启动）——**合并只在源码层，profile 是空的，自然无效果**。解法=install.sh --only 装回全家桶（dsh-ui-tweaks/dsh-work/dsh-memory/dsh-visualize + 技能包 dsh-dev/dsh-writing/dsh-design）：bundle 走 dsh plugin add github:...#main，技能包 clone dsh-skills 后复制 ~/.agents/skills。验证=①profile package.json bundles 6 层（官方 2 + 自研 4）、dependencies 4 个自研包、node_modules 5 个（dsh-core 被 github 依赖自动解析）；②dump-config 4 个 entry 齐，dsh-ui-tweaks inject 并集 = fs/webServer/loader/sessions/settings/typert（合并正确落盘）；③省 token 配置（maxSpillBytes/readMaxBytes/spill-policy）注入 5 处。**坑**=①「合并没生效」先查 profile 是否真装着插件（cordis.patch.yml 空数组 + bundles 列表），别在源码层找问题；②运行中 dsh web（PID 4298）启动于 20:11 早于安装 20:51——host 半区必须**重启 dsh web** 才加载新组合（GUI 会话内不能自杀 harness），client 半区硬刷新即生效；③pnpm 报大量 missing peer（@deepseek-ai/* 等）是正常 WARN（harness 官方包提供运行时服务，AutoInstallPeers=false），非安装失败；④安装日志里 frontend-design-masterclass「内容不一致」警告来自 dsh-dev 技能包与本地已有同名 skill 冲突，install.sh 跳过处理，非错误；⑤dsh --dump-config 是验证组合注入的可靠只读手段（grep entry id + inject 列表）。可复现?是（卸载第三方后重跑 install.sh --only 可复现全流程）。
- **预设删除补遗：install.sh 预设复制逻辑移除 + 运行侧 ~/.dsh/.agent-presets 清理 + rm 删错目录的坑（2026-08-19，清理）**：问题=用户确认「预设也包含梁神模式」，全删后复查残留。解法=①ui-tweaks 合并版无 preset 残留（合并时未复制）；②**install.sh 仍含 dsh-essentials 预设复制逻辑**（第 239-266 行整段：ensure_source dsh-essentials → 复制 preset/*/ 到 PRESETS_DIR）——dsh-essentials 已删，此段必然空跑打警告，整体删除（连带 PRESETS_DIR 变量定义与用法注释更新，bash -n 验证）；③**运行侧残留**：~/.dsh/.agent-presets/ 下仍有 liangshen + router-standard 两个已装预设目录——删目录即清（预设是独立目录非 bundle 挂载，无 profile 配置引用）；④meta 文档此前已清（README/AGENTS/THIRD-PARTY/plugins.json 零残留，仅 install.sh 留一行历史说明注释）。**坑**=①**rm -rf 删错目录**：上轮「删除本地 dsh-essentials」命令在 `cd dsh-plugins && ...` 同一 shell 内执行，`rm -rf dsh-essentials` 实际删的是 dsh-plugins/dsh-essentials（不存在，静默成功），伞目录根 dsh-essentials 原封未动——cd 后的相对路径 rm 必须确认目标位置（或先 cd 回根再删）；本次已补删，内容未丢（github 仓库本已删除，本地副本删晚无影响）；②预设删除的完整清理链=源码目录（preset/）+ 安装脚本（install.sh 复制逻辑）+ 运行侧（~/.dsh/.agent-presets/）+ 文档引用，四层都要查，漏一层就是「删了又装回来」或「装了个寂寞」；③install.sh 是纯 LF（非 CRLF），与 NOTES.md 不同，改前查换行符。**验证**=bash -n install.sh 过；grep 全 meta-repo 无 liangshen/router-spec（仅 NOTES 历史 + install.sh 历史注释）；.agent-presets 空；推送 81baa4b。可复现?是（重跑 install.sh 旧版会空跑预设段打警告；rm 相对路径删错目录可复现）。
- **dsh-essentials 并入 dsh-ui-tweaks：路由预设（Router Standard/Spec + 梁神）全删，剩余能力（model-selector/paste-input/at-file/无损省token）合并为单一 bundle，GitHub 仓库删除（2026-08-19，重构/迁移）**：问题=用户要求「essentials 里面的两个预设全部去掉不用了，其他的能不能和 ui-tweaks 合并」，并确认梁神模式也删、GitHub 仓库直接删除。解法=①**client 半区合并**：essentials/lib/client.js（18582 行）是自包含打包模块（sub_modelSelector/sub_pasteInput/sub_atFile/sub_attachmentRemoveAlwaysVisible 四个 factory + `window.__ModuleLoader__.load({id:'dsh-essentials'})`）——复制为 ui-tweaks/lib/essentials-client.js，尾部 load 块改为 `export function applyEssentialsClient(require)`（返回 {name,inject,apply}），ui-tweaks/lib/client.js 顶部 import 后在 load factory 内组合进同一 load（inject 用 `[...new Set([...原inject, ...essentials.inject])]` 去重，apply 里先调 essentials.apply(ctx)）；②**host 半区合并**：lib/index.js 组合三子模块 apply + ToolResultPruner + 保留 retry-settings 路由，inject 并集 fs/webServer/loader/sessions/settings/typert；③**cordis.patch.yml**：去重 ui-settings-plugin-inventory disabled（两包都声明），保留无损省 token 配置（pwsh-sandbox/bash-sandbox/tool-fs/spill-policy），insert id 统一 dsh-ui-tweaks；④**package.json**：deps 并集 8 个（dsh-core 等 essentials 依赖）、peerDeps 并集 24、dsh.client.inject 并集 9，version 0.2.0；⑤**预设删除**：preset/router-standard + preset/liangshen + upstream/dsh-router-standard 全删（不随合并）；⑥**清单/文档**：plugins.json 删 essentials 条目（14→13）、ui-tweaks scenario 改 all，README/AGENTS/THIRD-PARTY 同步（7+5+9+1 处替换全命中），check-consistency 13 全过；⑦**仓库删除**：gh repo delete dsh-essentials + 本地伞目录删除。**坑**=①essentials README 写「Router Standard / Router Spec 两个预设」但 preset/ 实际只有 router-standard 一个目录（Spec 是同包变体），删除按目录粒度处理即可；②essentials 的 tests/vision-bridge.test.mjs 是已拆走 vision-bridge 的过时残留（引用 @deepseek-ai/cordis + images.js），合并时不带；③essentials package.json 的 exports 含 `./preset/router-standard` 和 `./preset/router-spec`（预设删后 ui-tweaks 不需要，也不加）；④essentials-client.js 里 `dataset.plugin='dsh-essentials'` 等 CSS 标识是运行时数据标记，不影响功能，保守保留不改（避免引入风险）；⑤ui-tweaks client.js 是手写文件直接加 import（浏览器 ESM 支持），node --check 验证过；⑥esbuild 打包产物（at-file/index.js 15959 行）原样可 import，无需重建。**验证**=node --check 10 个 js 全过；essentials-client.js 无实际 load 调用残留（仅注释）；check-consistency 13 插件全过；ui-tweaks 推送 4673700；meta 推送 8ed060b；gh repo view 确认 dsh-essentials 已删。可复现?是（复制 client 打包模块 + 改尾部导出 + 组合 load 全流程可复现）。
- **meta-repo 迁移 + bundle 拆分：deepseek-plugins → dsh-plugins（目录仓库），6 子包拆独立仓库（2026-08-19，重构/迁移）**：问题=用户要求「deepseek-plugins 那个仓库有其他贡献者了，迁移到 dsh-plugins，dsh-plugins 作为目录仓库，里面的插件拆分成单独仓库」。解法=①**meta 迁移**：deepseek-plugins 全部 meta 内容（plugins.json/AGENTS/NOTES/README/THIRD-PARTY/scripts/.github/config/docs/external/package.json/pnpm-lock/.gitignore，CLAUDE.md 软链保留）并入 dsh-plugins 根，git rm 掉 6 个子包 + pnpm-workspace.yaml，package.json name 改 dsh-plugins；②**拆分 6 bundle**：cp -a 子包到伞目录根建 6 个独立工作树 → git init -b main + 初始提交（commit 信息注明 tarball snapshot baseline）→ gh repo create --source --push 推送 GitHub；③**依赖/引用修正**：dsh-ui-tweaks package.json 的 repository/homepage/bugs 仍指向 dsh-plugins（其余 5 个合并时已带独立仓库名）→ 改 dsh-ui-tweaks；essentials/work 的 dsh-core 依赖 `github:bitterSmilezzz/dsh-plugins#main&path:/dsh-core` → `github:bitterSmilezzz/dsh-core`；dsh-work publish.yml 的 `if: github.repository == 'NanmiCoder/dsh-work'` 上游残留 → bitterSmilezzz；④**plugins.json**：6 bundle 的 repo 改独立仓库、删 path 字段、$comment 更新架构 v3，check-consistency 14 插件全过；⑤**文档**：README/AGENTS/THIRD-PARTY 全面同步新架构（自研独立仓库 + 技能合并仓 + 第三方 fork），替换全部命中 25/25；⑥deepseek-plugins 按用户决定 **gh repo delete 删除**（GitHub+本地），迁移完整性用 git ls-files diff 校验（deepseek-plugins 每个文件都在 dsh-plugins 内）。**坑**=①**dsh-plugins 只有 2 个提交（tarball 快照），6 子包无子目录历史可 filter-repo/subtree split 提取**——旧 8 个独立仓库 GitHub 已删，历史不可恢复，新独立仓库只能从快照起步（与 AGENTS 旧描述「历史经 subtree 并入」不符，事实是并入未保留历史）；②子包 package.json 的 repository 字段在合并时多数已带独立仓库名（好习惯），但 dsh-ui-tweaks 漏改，拆分时逐包核查 repository/dependencies 是必做项；③NOTES.md 是纯 CRLF，但 AGENTS/README/THIRD-PARTY 是纯 LF——「仓库文件多为 CRLF」的旧认知不适用于这三份（实测修正），改文档前先查换行符再选写入方式；④gh repo delete 无输出、exit 0 是唯一信号，用 gh repo view 确认（Could not resolve = 已删）；⑤dsh-work 自带 .gitignore/.npmrc/.github，其余 5 子包无 .gitignore 需补（node_modules/ 忽略，避免将来污染索引）；⑥gh repo create --source --remote origin --push 一步完成建仓+推送，比先建空仓再 push 省事。**验证**=check-consistency 14 插件全过；gh repo list 确认 14 仓库（原 8 + 新 6）；6 独立仓库初始提交 + 推送成功；dsh-plugins 结构=纯 meta（无子包残留）；git ls-files 迁移完整性 diff 通过。可复现?是（git rm 子包 + cp -a 建仓 + gh repo create --push 全流程可复现）。
- **伞目录初始化：meta-repo + 全部 7 个插件仓库 + harness 参照源码 clone 完成（2026-08-19，组织）**：问题=用户要求先克隆 meta-repo（bitterSmilezzz/deepseek-plugins），再按 AGENTS.md「本地仓库组织约定」在伞目录下拉取全部相关项目。解法=①伞目录=当前工作区 /Users/fangshoufanji/workspace/deepseek-harness（macOS 参照 Windows 约定 D:\workspace\deepseek-harness，伞目录名即 deepseek-harness 对得上）；②按 plugins.json（来源真相）拉取 9 个仓库：meta-repo deepseek-plugins + 自研合并仓 dsh-plugins（6 子包 core/essentials/memory/visualize/ui-tweaks/work）、dsh-skills（3 子包 dev/writing/design）+ 第三方 fork dsh-better-sidebar / dsh-market / dsh-usage-plugin / DSH-Transparent-UI-Plugin + 自研独立 dsh-desktop-shell + 官方 deepseek-ai/deepseek-harness 参照源码（仅参照不修改）；③为 4 个 fork 配 upstream remote（omdsh-dev/DSH-better-sidebar、dsh-market/dsh-market、feiyang-dev/dsh-usage-plugin、WYH66666666/DSH-Transparent-UI-Plugin——地址以 plugins.json 的 upstream 字段为准）；④建 doc/ 本地记录目录。**坑**=①本次 git clone 9 个仓库全部一次成功（与 NOTES 旧记录「此机 git fetch/pull 不稳定需 curl tarball」相反——旧记录是历史网络状况，当前网络直连 GitHub 稳定；若再遇不稳再回退 codeload tarball 方案）；②默认分支：全部插件仓库均 main、官方 harness 是 master（与 AGENTS.md 记录一致），clone 后 git symbolic-ref 确认即可；③fork 的 upstream 用 plugins.json 的 upstream 字段 + THIRD-PARTY.md 核对，勿猜仓库名；④NOTES.md 是 UTF-8+CRLF 纯 CRLF，插入用 Node readFileSync/writeFileSync(utf8)+'\r\n' 前缀（沿用编码铁律）。**验证**=9 仓库 .git 就位、dsh-plugins/dsh-skills 子包目录与 plugins.json path 一一对应、4 fork upstream remote 就位、doc/ 已建。可复现?是（git clone + remote add upstream 可复现；网络状况随环境变化）。
- **DimAgent 额度用完，官方 CLI 卸载 @arcships/dsh-dim-oauth（2026-08-19，卸载）**：问题=dimagent（DimAgent 账号）额度用完，用户要求卸载该模型供应商插件。解法=①官方卸载路径 `dsh plugin --profile web remove @arcships/dsh-dim-oauth`（dsh plugin 是 pnpm 转发器：先 pnpm remove，再 reconcilePlugins 按「已安装依赖是否声明 dsh.bundle」维护 `dsh.profile.bundles` 层列表——remove 后依赖消失、bundle 层自动剔除）；②清理残留：pnpm remove 后在 `profiles/web/node_modules/@arcships` 留下空作用域目录，手动删；③核查无其他引用：settings.yaml / `.agent-presets/` 均无 dimagent 引用，web profile 的 cordis.patch.yml 不用动（`dimagent-oauth` 行来自包内自带 cordis.patch.yml 的 `- insert:`，包删行即消，区别于 aqua 先例的 profile 手写冗余 insert），令牌文件 `$DSH_HOME/dimagent-oauth.json` 不存在（oauth.js 里 `join(resolveDshHome(),'dimagent-oauth.json')` 是唯一定义位），无凭据残留。**坑**=①卸载 bundle 插件=删依赖即可，profile 手写 patch 只有 aqua 那种冗余注册才要动；②`dsh plugin --help` 输出的是 pnpm help、`dsh plugin --profile web` 报「plugin needs pnpm arguments to forward (e.g. add <package>)」——`--profile` 必填且参数原样转发给 pnpm；③卸载后 node_modules 作用域空目录残留需手动清；④运行中 harness 按 boot 组合加载，卸载需**重启 dsh web** 才生效（GUI 会话内不能自杀 harness，host 组合与 client loader 都按启动态加载）；⑤改 NOTES.md 这类中文 CRLF 文件用 Node readFileSync/writeFileSync(utf8)+'\r\n' 前缀插入，禁用 PowerShell Set-Content（GBK mojibake 铁律）。**验证**=package.json dependencies+bundles 均无 dim-oauth（bundles 剩 base/web-app/essentials/work/ui-aqua/ui-tweaks 6 层）、pnpm-lock.yaml 无引用、node_modules/@arcships 已删、profiles 下仅 web 装有（profiles/node_modules 无 @arcships）。可复现?是（`dsh plugin --profile web add @arcships/dsh-dim-oauth` 再 remove 可复现完整装/卸流程）。
- **深度 2 子代理运行 AgentTeams 端到端被拒：maxDepth 1 硬限制 + 真名实调验证 3 项修复生效（2026-08-19，实测）**：问题=按修复清单（成员派生挂官方/pending 恢复边/archive 保留名/中文 sanitize/activity 词汇）执行 AgentTeams 完整端到端实测。**关键发现（阻塞）**：`agent_teams_add_member` 返回 `Error: subagent depth 2 exceeds maxDepth 1`——**我是被委托的子代理（深度 2），AgentTeams 拒绝在深度 >1 处派生成员**。由此所有依赖成员的下游步骤（claim_task 需要 assignee=活跃成员、任务状态机 pending→claimed→in_progress 需先 claim、send_message/status 的 activity 实时字段需有真实成员）全部不可达。**真实实调结果**：①中文团队名 create 成功且 id 可读（`端到端实测团队2`，非乱码非 `team` 兜底），但**同名首次 create 报 `team id is taken by another captain`**（该名字已被之前会话占用，非本测试失败）；②`name=archive` create **被拒** `team name "archive" folds to reserved id "archive"`——archive 保留名校验真名实调生效（修复 2 生效）；③`update_task` 状态机守卫生效：`pending→failed`/`pending→in_progress` 均报 `cannot move`（须先 claim），即 pending 恢复边 + 转移校验真实存在（修复 3 生效）；④`status` 返回任务 `[pending]`、成员 0，词汇正常。**判断**=不能实测 add_member spawn/activity 实时字段/pending reopen（被 maxDepth 挡在成员派生前），这三项修复本次**无法端到端验证**，需在深度 0/1 会话跑。**坑**=①子代理实测 AgentTeams 端到端有硬上限：add_member 要求调用者深度 ≤1，必须由父/根会话跑完整流程；②任务无法被无成员时 claim（unassigned 任务 claim 需 assignee=活跃成员，captain 不是成员不可作 assignee）——任务 DAG 全流程必须有真实成员；③误用第一个已被占用的中文名字导致了首个 create 失败，换名即成功，这不反映插件缺陷；④验证「修复是否生效」应只信真名实调结果（本报告第 ②③ 项），依赖成员的项如实标注「未测」。可复现?是（任何深度 2 子代理调 add_member 必现 maxDepth 拒绝；archive 保留名/状态机守卫可复现生效）。
- **重启后已生效：运行时 Tool schema 实测确认新 host 代码（pending 恢复边/枚举在列；archive 保留名校验只读层面看不进出 decision——2026-08-19，验证）**：问题=此前定位到「dsh web 运行进程加载旧 host 代码」，需在重启后的新实例（PID 5796）确认新 host 代码是否真正生效。解法=只读三步验证：①`cordis_inspect_query(host/Tool/listTools,{})` 激活前工具表只含 `agent_teams_activate`，9 个惰性 `agent_teams_*` 未列出（符合惰性注册预期）；②实际调用 `agent_teams_activate` 成功返回 9 个工具名（幂等，仅注册不建队）；③激活后再查 listTools，9 个工具齐现。**关键证据**=`agent_teams_update_task.status` enum=`["pending","in_progress","completed","failed","cancelled"]`（含 pending），且描述明示「reopen failed/cancelled to pending is captain-only」——这就是新 host 代码（pending 恢复边）已加载的铁证。**结论**=新 host 代码已生效（高置信度）。**坑**=①Tool 的 listTools 只暴露注册的公开 schema（发给模型的 JSON 契约），运行时校验（如 create 的 archive 保留名校验）是不出现在 schema 的 handler 逻辑——全文件 grep `reserved` 零命中、`archive` 仅出现在 agent_teams_delete 描述（常规归档非保留名校验），故无法仅靠只读 schema 确证/证否该运行时校验，需保留真名实调一次 create 才见抛错，破坏只读约束故不做；②验证「新 host 代码生效」最可靠的 schema 层证据 = 查找新加的枚举值/新字段这类清单级契约变更（本次用 pending），别指望运行时校验出现在 schema；③activate 进工具表≠9 个惰性工具立即可用，需激活后再查 listTools 才见。**验证**=列表 query 前后两次 + activate 成功 + 二次 listTools 见 9 工具 + update_task enum 含 pending。可复现?是（重置会话后重跑三步可复现；若进程仍加载旧 host，enum 不含 pending 会立刻暴露）。
- **dsh-ui-tweaks 合并后安装激活 + 重启验证（2026-08-19，安装/验证）**：问题=合并重构后的 dsh-ui-tweaks 只存在于真源（8a6f010）与伞目录，web profile 未安装，运行中 GUI 不受影响也不生效。解法=①本地 link 安装（路径 B）：`dsh plugin --profile web add D:\workspace\deepseek-harness\dsh-plugins\dsh-ui-tweaks`——profile bundles 加入 dsh-ui-tweaks（第 7 个）、node_modules 为 Junction link 指向伞目录、dump-config 显示 `- id: dsh-ui-tweaks`（bundle 自带 cordis.patch.yml 自动插入 host entry）；②重启 dsh web 后验证：`GET http://127.0.0.1:3080/api/retry-settings` 返回 200 + 各 LLM 命名空间 retryPolicy 数据（llm-deepseek 顶层 maxRetries=10、llm-pi-ai providers 各 10）——证明重构后 host 半区真正生效（旧 dsh-notify host 是 no-op，此路由只可能来自新 dsh-ui-tweaks）；③client 半区验证：profile 内包结构完整、client.js/index.js node --check 过、dsh.client 声明齐全（runtime/ui-slots/ui-settings/ui-conversation/ui-primitives/locale，sessions 由 runtime 提供）。**坑**=①client 半区（通用设置「界面增强」总入口）硬刷新浏览器即生效，host 半区（retry 路由）必须重启 dsh web 进程（组合按 boot 加载）；②`dsh plugin add` 用绝对路径避免相对 cwd 解析坑；③pnpm 装本地 link 包会报 peer 依赖 WARN（无害，AutoInstallPeers=false）；④`Invoke-WebRequest` 访问本地 web 服务可验证 host 路由，不用等 GUI。**验证**=GET /api/retry-settings 200 + JSON 数据正确；dump-config 组合含 dsh-ui-tweaks；node --check 全过。可复现?是（uninstall 后重新 add 本地路径 + 重启即可复现）。
- **DSH 插件加载/形态的准确划分：bundle 补丁 vs 纯技能包（2 种加载通道）+ host/client 半区 + 动态插件第三维度（2026-08-19，知识澄清）**：问题=用户问「dsh 插件加载模式是 2 种吗」。原因=「2 种」指按交付/加载通道划分的插件形态（AGENTS.md「插件形态」节的权威表述）：①bundle 补丁插件——包 manifest 声明 `dsh.bundle.patch`（指向 `cordis.patch.yml`），`dsh plugin add`（=pnpm 转发器）把依赖装进 profile，reconcile 按「解析出的包是否声明 dsh.bundle」维护 `dsh.profile.bundles` 层列表，profile 组合器按序把各 bundle 的 patch 叠加成最终 cordis.yml 树（空根→bundles→profile cordis.patch.yml→$DSH_HOME/cordis.patch.yml→--patch）；bundle 可只含 host 半区，也可再声明 `dsh.client`（`exports["./client"]`）——Node 侧扫描 Loader 配置发现 web dsh.client 包、把构建产物哈希写入启动图、经 `/plugins` 端点供给浏览器；client-only 插件也要一个空 host apply 行占位（只为让插件出现在 host cordis.yml 与 Loader 里）。②纯技能包——不是 bundle，不走 `dsh plugin add`，复制到 skills 目录（如 `~/.agents/skills`）由技能发现/`skill(name)` 机制按需加载。解法=回答时区分三个维度：**加载通道 2 种**（bundle 补丁 / 技能包）；**bundle 内部 2 个运行平面**（host Node 进程半区 + 可选 client 浏览器半区——这是 bundle 组成，不是独立加载通道）；**第三类易混路径=动态 Cordis 插件**（cordis_define/cordis_run 临时扩展当前进程、重启即失、不落盘，区别于静态组合行）。坑=①别把「host/client 两半区」或「静态组合 vs 动态插件」当成加载通道意义上的「2 种」；②client 半区依附于 bundle 的 `dsh.client` 清单声明 + `exports["./client"]`，无独立安装入口；③验证加载正确性可用 `dsh --profile web --dump-config` 数目标行出现次数（NOTES 已有 aqua 重复注册先例）。可复现?否（纯知识澄清，无代码改动；结论核对自 npm 包 @deepseek-ai/dsh README + dsh-base/dsh-client-modules README + 本仓 AGENTS.md）。
- **dsh-ui-tweaks 合并后多轮代码检测收敛（2026-08-19，检测/修复）**：问题=对刚合并重构的 dsh-ui-tweaks（client.js ~1169 行）做多轮代码及逻辑检测直至收敛。方法=R1 自查通读 + R2 独立子代理对抗审查（只读，10 个检查域）。**R1 自查发现并修复 5 处**：① notify 通知标题/正文回归（原版区分「需要审批/回答/轮次/会话完成」+ toolName/turn 参数，合并版退化成通用文案）→ 恢复独立 title/body locale key + {toolName}/{turn} 占位符替换；② 权限行丢失四态显示（原版显示 granted/denied/default/unsupported + 条件请求按钮）→ 恢复 badge 四态 + 非 granted/unsupported 才显示按钮；③ immersive 悬浮按钮重复事件（同时 dispatch config + immersive-toggle，onConfig 注册两次 → 双 refresh + 双 toast）→ 删 immersive-toggle 事件只留 config；④ immersive onConfig 无条件 toast（任何开关变更都弹沉浸 toast）→ 加 changed-value guard；⑤ 主卡片 checkbox 外部切换（悬浮按钮/快捷键）不同步 → 卡片监听 dsh-ui-tweaks:config 重渲染。**R2 对抗审查结论**=无高/中问题，9 项低：修复 4 项（notified/seenTurns 内存泄漏清理、未知 wait.kind 兜底、isEditable 覆盖 plaintext-only、空列表用去重后判断），保留 4 项原版忠实移植（onScroll 挂 window、turnSummaryOf 取最后一条 assistant、findFrame 全量 div 查询、host 串行 mutate——均为原版行为非回归，改动有风险价值低）。**坑**=①伞目录非 git，修复需同步到真源 clone 再 commit+push（5a30cc0..8a6f010）；②`notified` key 是 `sid:waitKey` 格式，清理时按第一个 `:` 切 sid；③push 后 git 输出走 stderr 被 PowerShell 当错误（exit 1）但实际成功，用 `git ls-remote` 确认真远端 HEAD。**验证**=node --check 全过；R1+R2 共 9 处修复 markers 逐一确认；真源 HEAD=8a6f010 已推；伞目录已同步。可复现?是（合并版初始代码可复现全部问题）。
- **端到端实测揭示：dsh web 进程加载旧 host 代码，host 侧修复需重启才生效（2026-08-19，关键发现）**：问题=端到端实测（子代理调用 agent_teams_update_task）发现运行时 schema 枚举**不含 pending**，而伞目录 lib/tools.js 新构建**含 pending**——运行进程与磁盘产物不一致。原因=**dsh web 进程启动时间早于构建时间**：进程 PID 30080 于 12:54:46 启动，lib/tools.js 新构建在 15:40:54（修复后）。host 侧产物是**进程启动时 require 缓存**（旧代码），client.js 是**按需读盘**（新代码）——所以前几轮的 host 侧修复在运行实例从未生效，只有 client 侧生效。前几轮验证全是静态的（tsc/verify.mjs/node --check），没覆盖「运行进程加载的 host 代码版本」。解法=**重启 dsh web**（GUI 会话内不能自杀 harness，需用户外部重启）——重启后 host 侧修复全部生效（pending 恢复边/archive 保留名/activity 词汇统一/成员派生挂官方）。**坑**=①验证运行实例是否加载新 host 代码：比较进程启动时间 vs lib 产物修改时间，或实测工具 schema 是否含新枚举（本次就是靠子代理实测 schema 发现的）；②client.js 新 ≠ host 新——两者更新机制不同（读盘 vs require 缓存）；③子代理端到端实测是有效的验证手段（它的工具面含 agent_teams_activate 可调用，与父会话不同——NOTES 旧记录「工具不可调用」是父会话预设面视角）。**验证**=磁盘 lib/tools.js 含 pending 枚举/archive 保留名/working 映射（True×3）；进程启动 12:54 < 构建 15:40 确认旧 host。可复现?是（任何 host 侧改动后不重启 dsh web，运行时 schema 仍旧）。

- **实证：agent_teams_activate 在本会话真实可调用——「动态注册不进模型工具表」的旧记录在本会话不成立（2026-08-19，实证）**：问题=验证「listTools 注册可见 ≠ 会话模型可调用」这一已知疑点。**实测（只读+一次激活调用，未建队/未 spawn 成员）**：①`cordis_inspect_query(host/Tool/listTools,{})` 激活前工具表含 `agent_teams_activate`（首个）且**不含** 9 个惰性 `agent_teams_*`；②我的实际会话工具表（模型请求真正组装的 function 声明）确实含 `agent_teams_activate`，直接调用成功返回 `AgentTeams tools enabled: agent_teams_create/add_member/remove_member/create_task/claim_task/update_task/send_message/status/delete`（9 个）；③激活后再查 listTools，9 个惰性工具全部出现（10 个 agent_teams_* 齐）。**结论**：本会话动态注册工具真实进了模型请求的工具组装且可调用——与 NOTES 第 4/5 轮「注册可见≠本会话可调用、动态注册不进模型工具表」的记录相反；差异最可能=那几轮在官方 preset 工具面（不含 activate）下观测，本会话 web profile 的模型工具面把 activate 组装进来了。**坑**=①「注册可见」与「模型可调用」是两层，必须分开实测：listTools 只证注册，模型工具面是否含动态工具取决于 preset/会话组装，别用任一视角替代另一视角做断言；②agent_teams_activate 是幂等可逆探测点（仅注册工具，不建队、无成员副作用）；③activate 进工具表≠9 个惰性工具立即可用——它们激活后才装配（listTools 前后两查证实）。**验证**=listTools 前后两次查询 + 实际调用 activate 成功 + 激活后 9 工具出现。可复现?是（本会话重跑两步可复现；旧记录「不可调用」是否因 preset 差异需按会话复测）。

- **dsh-work 第 6 轮检测：全插件结构健康扫描（本轮无新增 bug，检测面收敛信号）（2026-08-19，检测）**：问题=继续多轮检测目标，转向此前未覆盖的「其他自研插件结构 + 运行冲突」面。**确认无问题的检测项**：①全部自研插件 lib 语法健康（dsh-core/essentials/memory/ui-tweaks/visualize/work 的 index+client+各模块 node --check 全过）；②bundle 声明完整性（essentials/memory/ui-tweaks/visualize/work 5 个 bundle 的 dsh.bundle.patch 文件 + client 声明 + lib/client.js + main 全在；dsh-core 非 bundle 是共享工具包——被 essentials/work 依赖，设计如此非异常）；③web profile 实际加载 dsh-work/dimagent-oauth/ui-aqua（+essentials/work），memory/visualize/ui-tweaks 未装（按需 opt-in，符合 Pi）；④工具名无冲突（当前会话 33 个工具，agent_teams_* 仅 activate 注册、无重复，其余 9 个惰性）。**坑**=①PowerShell 内联 node -e 的引号/$ 转义极脆（连续被破坏），复杂检测一律写 .mjs 脚本文件再跑，别用 -e；②路径字符串在 node -e 里需 replace(/\\/g,'/') 处理反斜杠，也易错——写文件避免；③bundle 声明检测是「profile 加载正确性」的前置（patch 文件缺失会导致 dsh plugin add 当普通依赖装、bundle 层消失，NOTES 已记录过 aqua 缺 dsh.bundle 的坑）。**验证**=node --check 全过、bundle 5/5 完整、工具无冲突。可复现?否（纯健康扫描，未改代码；若删某 bundle 的 patch 文件可复现加载失败）。

- **dsh-work 第 5 轮检测：agent_teams_status 与 UI 的成员 activity 词汇不一致（真实语义 bug）+ MemberStatus working 死值（2026-08-19，检测/修复）**：问题=继续多轮检测目标，深挖 client-host 语义一致性。**修复（真实 bug）**：`agent_teams_status` 工具（model-facing）暴露的成员 `activity` 字段直接用 `memberActivity` 的原始 `running/inactive/unknown/unspawned`，而 ActivityPanel/活动面板快照用映射后的 `working/idle/unknown`——同一成员的实时状态模型看到 running/inactive、UI 看到 working/idle，跨接口词汇不同步，模型对成员状态的认知与用户所见不一致。解法=tools.ts 的 status 工具改为与 snapshot.ts 相同映射：`running→working / inactive→idle / 空 id→unspawned / 其余→unknown`（`memberActivity` 返回官方 `Map<string, "running"|"inactive">`，是底层词汇；UI 层统一 working/idle/unknown）。renderStatus 文本透出同一字段，一并统一。output schema 的 activity 是 string 无 enum，词汇变化不破坏 schema。**记案（低严重度未修）**：`MemberStatus` 类型的 `working` 值从未被写入（add_member 设 idle、remove_member 设 removed，无代码写 working）——死值，但 UI/工具只依赖 `status !== "removed"` 过滤和实时 activity，不受影响；改类型可能破坏持久化兼容，保留。**坑**=①语义一致性检查要跨「模型接口 vs UI 接口」两个词汇表 grep——`running/inactive`（官方 subagent activity）与 `working/idle`（UI 映射）两套词在源码共存，改一处要全量 grep 确认无遗漏；②`member.status`（持久化 MemberStatus）与 `member.activity`（实时）是两层概念，别混用——UI 判断工作状态用 activity，过滤 removed 才用 status。**验证**=host/client tsc --noEmit 全过；verify.mjs all checks passed（不依赖 status 的 activity 词汇，无回归）；lib/tools.js 含 unspawned/working 映射；node --check 过。可复现?是（改前调用 agent_teams_status 返回 running/inactive，与面板 working/idle 不同；改后一致）。

- **dsh-work 第 4 轮检测：运行时路由实测 + 补 H2/循环检测测试覆盖缺口（2026-08-19，检测）**：问题=继续多轮检测目标，验证前几轮改动的真实运行与测试覆盖。**运行时实测（真实 dsh web 实例）**：`/plugins/dsh-work/state`（live+archived）均 HTTP 200 返回 `{"teams":[]}`、`/plugins/dsh-work/assets/team-lead.png` HTTP 200 image/png（42052B）——重构后插件在运行实例正常响应。**测试覆盖缺口修复**：①H2 恢复边（failed/cancelled→pending）verify.mjs 无断言（只有 failed→failed no-op）→ 补 4 项（failed→pending/cancelled→pending/completed→pending 拒/pending→completed 拒）；②`wouldIntroduceCycle`（create_task 循环拒绝）是私有函数未导出且零测试 → 导出 + 补 3 项（无依赖不环/链式不环/回环成环/传递环/未知依赖不环）。**坑**=①verify.mjs 顶部 import 与 6/7 的变量命名空间共享——新加 `const chain` 与既有 6/7 的 `const chain` 重名 → SyntaxError「Identifier already declared」，改名 `depChain` 即可（ESM 模块级 const 全文件唯一）；②运行时容错实测受限：dsh-work 的 agent_teams_* 工具「注册可见 ≠ 本会话可调用」（官方 preset 工具面之外，动态注册不进模型工具表，NOTES 已有记录），且 `/state` 只扫描 workspaceRegistry 登记的 workspace——把畸形团队放到非登记目录测不到 snapshot 容错；畸形 team.json 容错靠静态读 snapshot.ts try/catch 确认（每 team 包 try/catch → logger.warn + skip）。**验证**=host/client tsc --noEmit 全过；verify.mjs all checks passed（新增 7 断言全绿）；verify:skill up to date。可复现?是（删 verify 的 H2/循环断言会回归失败；工具不可调用+非登记 workspace 不扫描均可复现）。

- **dsh-work 第 3 轮检测：sync-skill.mjs 缺 mkdir 在干净环境 ENOENT 崩溃（2026-08-19，检测/修复）**：问题=`pnpm verify`（`node scripts/verify.mjs && pnpm verify:skill`）在伞目录快照上失败——`verify.mjs` 全过但 `sync-skill.mjs --check` 报「DSH skill mirror is missing」。原因=两层：①伞目录 tarball 快照缺 `.dsh/skills/dsh-plugin-development/SKILL.md` 镜像（`.dsh/` 不被 .gitignore 忽略、应随仓库分发但快照没带）；②**更深的真 bug**：`sync-skill.mjs` 的 sync 路径直接 `writeFile(mirrorPath, ...)` 但**没有先 mkdir 父目录**——在干净 checkout/快照（`.dsh/` 不存在）时必然 ENOENT 崩溃，且错误信息是裸的 `ENOENT: no such file or directory`，不是可操作的「Run: pnpm sync:skill」。解法=sync-skill.mjs 的 sync 分支加 `await mkdir(dirname(mirrorPath), { recursive: true })` 再 writeFile（import 补 mkdir/dirname）；错误路径不变（--check 仍报缺失并提示运行 sync）。**坑**=①PowerShell 管道下 node 的 stderr（NativeCommandError）会混进输出，`$LASTEXITCODE` 在 `| Select-Object` 后读的是管道尾（-1 假象），要看真实 exit 需去掉管道重跑——同理 tsdown 之前也报 -1 假象；②.README 不含 events/withPending 等旧引用（README 只讲用法不讲实现，文档一致性良好）；③verify 链三件套（verify.mjs/verify:skill/verify-package）各自独立、验证面互补，跑发布前全链是正确姿势。**验证**=sync-skill.mjs 修复后：sync 成功创建镜像（Synced ...）、--check 报 up to date（真实 exit 0）；host/client tsc --noEmit 全过；verify.mjs + verify-package 全过。可复现?是（删 `.dsh/skills/` 后跑 `pnpm sync:skill`：修复前 ENOENT 崩溃、修复后自动建目录成功）。

- **dsh-work 第 2 轮检测：团队名 archive 保留名冲突 + snapshot 死代码 + 死图片资源（2026-08-19，检测/修复）**：问题=继续「多轮代码及逻辑检测直至收敛」目标，检测 dsh-work 尚未覆盖的面。**修复 1（真实 bug）**：团队名 sanitize 后恰为 `archive` 会与归档根目录 `<stateRoot>/archive/` 冲突——`createTeamDir` 建 `archive/team.json`、`archiveTeamDir` 归档时 `rename(archive, archive/archive)` 自嵌套、`listArchivedTeamIds` 读错记录。解法=create 时拒绝 `teamId === archive || teamId === CAPTAIN_KEY`（保留名校验，`captain` 与队长邮箱 key 冲突）→ `throw team name folds to reserved id`。**修复 2（死代码）**：snapshot.ts `byName` Map 构建后从未使用（早期按名查成员遗留），删除。**记案（低严重度未修）**：①`data-analyst.png`/`action-reporting.png`/`action-celebrating.png` 在 assets 与 ART_ALLOWLIST 里但 artwork.ts 从不引用（死资源，无害——路由能服务、client 不请求）；②L5 unread=邮箱累计长度非真未读（沿用上轮记案）。**坑**=①子代理只读复审在共享工作区并发修改时易挂起（再次复现，NOTES 战役方法论已记录）——连续两轮复审子代理都挂起，改判：独立检测为主，子代理仅作并行补充且超时即中断不等；②PowerShell `node -e` 内联脚本含 require+top-level await 混用报 ERR_AMBIGUOUS_MODULE_SYNTAX，需写成 .mjs 文件跑；③grep/文件存在性核查是快速验证 allowlist 与 assets 一致性的手段（本轮用它确认 14 个图片全在）。**验证**=host tsc --noEmit 过；verify.mjs all checks passed；lib/tools.js 含 archive 保留名守卫；lib/snapshot.js 无 byName。可复现?是（创建名为 archive 的团队：修复前归档自嵌套/读错；修复后创建被拒）。

- **dsh-notify + dsh-ui-tweaks 代码级合并重构为单一 dsh-ui-tweaks（2026-08-19，重构）**：问题=用户要求把两个插件「从代码逻辑完全合并重构为一个精简插件」，不只仓库并列；且所有功能统一做设置选项（已有的丰富、缺的补齐）、UI 全部放「通用设置」下。解法=①在 GitHub 真源 `bitterSmilezzz/dsh-plugins` 重构：`dsh-ui-tweaks/lib/client.js` 从 1680 行重写为 1126 行单一 bundle——统一 locale NS（`ui-tweaks`，替代原 6 个散落 NS）、统一配置对象（localStorage 单 key `dsh-ui-tweaks.settings`，替代原 3 个 storage key）、通用设置总入口（settings.general.item id=ui-tweaks，展开分组显示全部开关）、统一 ToggleRow（auto-hide/immersive/shortcuts 三同构开关复用）、notify 作为独立子模块（sessions 监听 + 四类事件开关 + 权限行）；②host 只留 /api/retry-settings 路由（读改 LLM retryPolicy 必须走 host settings 服务），内联进 lib/index.js；③删除 dsh-notify 子包 + ui-tweaks 的 5 个冗余子模块目录（无外部引用，主 client.js 是唯一加载入口）；④更新 package.json 0.1.1 / cordis.patch.yml / README / essentials README；⑤push 真源（76c9b65..5a30cc0）；⑥meta-repo：plugins.json 删 dsh-notify 条目（15→14 插件）、README/AGENTS/THIRD-PARTY 同步 notify 并入说明与计数（「6 bundle + 4 fork」）。**坑**=①settings.general.item 是「一行偏好」、settings.plugin.item 是「插件卡片」、整页用 settings.section——「总入口+内部分组」用 general.item 注册可展开卡片实现；②notify 的 client 注册 id 仍是上游 `@omdsh-dev/dsh-web-ui-notify`，合并后统一为 `dsh-ui-tweaks`（仿 aqua 教训）；③client 包级注入无需新增（sessions 由 dsh-client-runtime 提供）；④伞目录 dsh-plugins 是 tarball 快照非 git、且 dsh-work 有未推送本地修复——合并落在独立 git clone 真源，不碰伞目录 dsh-work。**验证**=node --check 全过（client 1126 行 / index 语法 OK）、package.json node 解析 OK、plugins.json 14 插件 check-consistency 全过、git ls-remote 确认真源 HEAD=5a30cc0。可复现?是（源码全在真源 commit 5a30cc0）。
- **dsh-work 重构后测试脚本与代码脱节 + setup 读 child.options 隐患（2026-08-19，检测/修复）**：问题=上轮去重挂靠重构后，`node scripts/verify.mjs` 报 2 处失败：①5/7 断言「missing dependency is ignored (not blocked)」与 L2 修复（缺失依赖应判 blocked）直接冲突；②7/7 用旧 `withPending` API（已改名 `withPendingEffort` 且参数从完整 selection 变为仅 effort 字符串）→ TypeError。原因=重构改了 members.ts 的 bridge 契约（provider/model 走官方、effort-only）但没同步 verify.mjs 测试 fixture；且 verify.mjs 7/7 的 fakeChildContext 未给 child 配 agentProvider/agentModel。**更深的真实隐患**：重构后 `installMemberSelectionRuntime` 的 `registerContinuableSetup` 回调从 `child.options.provider/model` 读 route——但官方 `continuation.ts` 里 `setupRegistry.apply(childCtx)` 在 `agents.create({..., agentOptions, ..., setup})` 的 **setup 回调内**执行，`child.options` 在此刻是否已填充无契约保证（agentOptions 是传给 create 的输入，create 内部才构造 agent.options）→ 依赖 child.options 不可靠，可能静默跳过 effort 注入。解法=①verify.mjs：`withPending`→`withPendingEffort`（2 处调用：spawnMember 的 mock、selectionRuntime.withPending）；缺失依赖断言改 `counts as blocked (matches unsatisfiedDependencies)`；fresh fixture 补 `agentProvider: overriddenSelection.provider / agentModel: overriddenSelection.model`（route 现从 descriptor 读）；②members.ts setup：route 改从 `descriptor.agentProvider ?? child.options.provider` 读（descriptor 是官方恢复路径同源、setup 时已存在——官方自己就在 `appendDelegatedPolicyOverrides((childCtx.agent).session, ...)` 里访问 childCtx.agent，descriptor 由 foldSubagentDescriptor 从 session events 读，必有），不再依赖 child.options 时序。**坑**=①验证脚本与代码同改是双刃：改断言前先确认它验证的是「新正确行为」而非「旧行为」——缺失依赖 blocked 正是 L2 修复目标；②PowerShell 下 `node scripts/verify.mjs` 的 stderr 混入 NativeCommandError 噪音，看 exit code 而非文字；③tsdown exit 码在 PowerShell 里可能显示 -1（信号假象），产物 LastWriteTime/Length 才是真凭据。**验证**=修复后 `node scripts/verify.mjs` 7/7 全过（含 fresh child effort 注入 + cold-resumed restore）；host/client tsc --noEmit 全过；node --check client.js 过。可复现?是（改前 verify.mjs 必现 1 FAIL + TypeError；改后全绿）。

- **dsh-work 去重挂靠 DSH 官方能力（grilling 收敛后落地）：删自研事件层 + 成员派生挂官方（2026-08-19，重构）**：问题=用户要求「在满足 dsh-work 功能的基础上，把重复实现挂靠到 DSH 官方能力，不重复逻辑」。方法=grilling 三轮设计树收敛（范围=四项全挂靠/约束=不改官方源码+薄封装/验收=代码瘦身）+ 子代理只读调研官方 rc.7 契约（Q1-Q6）。**调研结论（关键契约）**：①provider/model：官方 `resolveChildAgentOptions`+`startContinuable` descriptor 原生持久化+冷恢复（`continuation.ts` snapshot-before-await）→ 自研 pending bridge 传 provider/model 是重复；reasoningEffort 不在 AgentOptions、官方不持久化，fresh spawn 子无 request/header → 需 `registerContinuableSetup`+`installModelSelection` 注入；②官方 todo 三态无 assignee/依赖/failed → 覆盖不了 dsh-work DAG，保留自定义；③官方 goal 单会话自我延续+根/human 授权 → 语义不同，保留自定义；④官方无 sibling 直连（仅父→子 followup / 子→父 reportFrom）→ 信箱保留、传输挂官方；⑤**rc.7 无插件自定义 session event 注册面**：KNOWN_SESSION_EVENT_TYPES 是生成固定集，docstring 明说 out-of-repo 插件事件 outside by construction；`SessionEvent.ignorable` 是唯一逃生口但 `Session.append()` 不接受 ignorable 参数；硬写未注册类型 live 不报但**重启/冷恢复拒读整份 session** → 唯一可靠路径=tool/call+tool/result（meta 是官方设计给插件的展示通道）。**落地改动**：①删 `src/events.ts`+`src/event-types.ts`（死代码：KNOWN 集不认 agent-teams/* 就静默跳过）+ tools.ts 全部 11 个 appendTeamEvent/captainSessionOf 调用点 + tsconfig.client.json 的 event-types include + 开发文档 2.6 节改写为「为什么不用自定义事件类型」；②members.ts 重写：pending bridge 从「存完整 selection」瘦身为「只存 reasoningEffort」（provider/model 走官方 agentOptions）；`withPending`→`withPendingEffort`；installModelSelection 的 provider/model 改从 child.options（官方 descriptor 恢复值）读，只补 effort；删 descriptor 匹配校验（官方保证一致）；resolveMemberLlmSelection 保留（仍是官方 ctx.llm.resolveCallConfig 薄封装）。**坑**=①tsc 不自动删已删文件的旧 lib 产物，需手动清 lib/events.js、lib/event-types.js、lib/types/events.d.ts、lib/types/event-types.d.ts；②event-types 曾同时被 host/client 两个 program 加载（tsconfig.client.json include 里），删它必须同步改 include 否则 client 编译报 TS6059；③文档中 event-types 引用散落 6 处需逐一同步，否则开发指南与代码脱节；④`installModelSelection` 需要完整 ModelSelection（provider/model 必填），不能只传 effort——provider/model 从 `child.options`（官方恢复值）取而非自研 pending 里存，避免重述官方拥有的 route。**验证**=host/client tsc --noEmit 全过；tsdown 重建 client bundle 成功；node --check 7 个 lib 全过；产物断言 14 项实质全过（events 层 7 项零残留 + 官方机制 4 项 + client bundle 3 项）；行为回归 11 断言全过（sanitizeKey 中文/数字/ASCII、failed/cancelled→pending、completed→pending 拒绝、悬空依赖 blocked）——既有 6 bug 修复无回归；运行实例已下发新 client.js。可复现?是（改前 dump-config/编译产物可见旧事件层与 pending bridge）。

- **grill-me/grilling 弹窗交互契约写入 AGENTS.md（2026-08-19，规则）**：问题=用户要求「用 grill-me/grilling 这类面试型 skill 时，DSH 要自动逐个问题弹窗选择（`ask_user_question`），而不是让我挨个打字回复」。解法=在 AGENTS.md「仍具现实意义的长期规则」节、紧挨「DSH 技能斜杠调用契约」条目后新增一条 **grill-me / grilling 交互契约**：每个问题必须用弹窗选择逐个发起，一轮可发多个问题，但每个都要是可选交互，不让用户打字。**坑**=①AGENTS.md 是 UTF-8+CRLF、CLAUDE.md 是软链（120000），改 AGENTS.md 自动同步软链，改含中文文件必须用 Node readFileSync/writeFileSync（utf8）而非 PowerShell Set-Content（GBK mojibake）；②插入用唯一锚点（`/grill me` 那行结尾）定位，replace 单行内容即可，避免 CRLF 匹配问题；③工作树 NOTES.md 顶部有**并行会话未提交条目**（dsh-work 深度 bug 修复记录），提交时不能清掉，连同本次落档一并 commit。验证=git diff AGENTS.md 仅 +1 行、read 确认中文无乱码、git status 只剩 AGENTS.md+NOTES.md 待提交。可复现?是（AGENTS.md 软链+CRLF 中文编辑用 PowerShell 会乱码可复现）。
- **dsh-work (AgentTeams) 深度 bug 挖掘 + 修复 6 处（2026-08-19，修复）**：问题=用户要找一个插件挖「很多未发现的 bug」。选型依据：dsh-work 是唯一带完整 src/ 的自研插件（其余子包只有 lib 产物），且在 web profile 运行中。方法=父 agent 通读全部源码 + 独立子代理对抗审查交叉验证 + node 实证复现，确认 6 处真实 bug（另记 3 处低优先遗留）。**修复清单**：① **M1 中文团队名两端 teamId 不一致（高）**：host `sanitizeKey` 用 Unicode 感知正则 `[^\p{L}\p{N}]+` 保留 CJK，而 client `parseAgentTeamsCreateArgs` 用 ASCII-only `[^a-z0-9]+`，中文团队名 host 得 `研究团队`、client 得 `team` → 对话卡片永远匹配不上磁盘快照（成员列表空白 + 活动面板出现幽灵重复卡）。解法=新建 `src/team-key.ts` 共享纯函数模块（纯 JS 零依赖，host 与 client bundle 同源），`sanitizeKey`/`keyDigest` 统一两端；digest 从 node:crypto sha256 改为 FNV-1a 32bit hex（浏览器可复现）。② **H1 移除成员后其任务永久搁浅（高）**：`remove_member` 只把 member.status=removed 不动任务，已 claimed/in_progress 任务的 assignee 指向已移除成员；`claim_task` 幂等分支 `task.assignee!==assignee` 拒绝改派、`update_task` 状态机无 claimed→pending → 下游依赖链全死锁。解法=remove_member 时把该成员名下 claimed/in_progress 任务重置为 pending+assignee=undefined；claim_task 增加 holderActive 检查（assignee 已非活跃成员视为孤儿可改派）。③ **H2 failed/cancelled 任务死胡同（高）**：`TASK_TRANSITIONS` 终态无出边，`unsatisfiedDependencies` 只认 completed → 一个 failed 任务让其所有传递下游永久不可认领（usage policy 还说「member 报告 blocker 就改派」，但改派不可能）。解法=failed/cancelled 增加 captain-only `pending` 恢复边，`update_task` enum 加 pending 且 member 禁止重开（completed→pending 仍拒绝）。④ **create_task 允许循环依赖（中高）**：只校验依赖存在不查环，t1 依赖 t2、t2 依赖 t1 → 双双永久不可 claim。解法=新增 `wouldIntroduceCycle`（新任务 id 经依赖图传递可达自己即拒绝）。⑤ **L1 withTeamLock 锁 Map 无界增长**：team 删除后 key 残留。解法=finally 里 `locks.get(key)===tail` 时 delete（tail 引用先存，避免误删排队者）。⑥ **L2 taskVisualState 与 unsatisfiedDependencies 对悬空依赖判断不一致**：缺失依赖 id 面板显示 open、工具判 blocked。解法=缺失 id 一律 blocked。**记案未修（低优先）**：L3 spawn 后 writeTeam 失败留下孤儿子代理（已加 interrupt 兜底）；L4 delete 工具描述说「deletes」实际 archive（已改描述文案为「ended and archived」）；L5 面板 unread=邮箱累计长度非真未读；M2 卡片 buildViewNode 硬编码 captainSessionId:''（rc.7 事件不含 sessionId 无干净修复路径）。**坑**=①client 侧 inspect 查询会一直 pending（已知坑，改用读 npm 包 d.ts 产物确认契约）；②伞目录 dsh-plugins 是 tarball 快照非 git，改完无法本地 commit，同步 GitHub 需 curl tarball 覆盖或等网络恢复 git clone；③tsdown 构建产物（lib/client.js）由 tsdown.config.ts 从 lib/client/index.js 打 bundle，改 client 源码必须重跑 tsc client + tsdown 才进运行 bundle。**验证**=host/client tsc --noEmit 全过；node --check 8 个 lib 全过；行为回归 16 断言全过（sanitizeKey 中文/数字/标点/超长、failed/cancelled→pending、completed→pending 拒绝、taskVisualState 悬空依赖 blocked）；profile link 指向伞目录已确认、运行实例下发新 client.js 73285B。可复现?是（修复前：中文团队名卡片空白可复现；removed 成员任务改派被拒可复现；failed 任务下游卡死可复现）。

- **代码级「完全合并」候选盘点：notify+ui-tweaks 是唯一干净候选（2026-08-19，分析）**：问题=用户问哪些插件可从代码逻辑重构为一个完整插件而不违反约束。方法=逐一核 dsh-plugins 7 子包的宿主/客户端工具数、inject 并集、slot key、注册 id（`dsh-core`=纯工具库 0 工具；`dsh-essentials`=0 工具但 host 已有并集 fs/webServer/loader/sessions/settings/typert；`dsh-memory`=1 工具；`dsh-notify`=0 工具纯 client；`dsh-ui-tweaks`=0 工具 5 个 UI 开关；`dsh-visualize`=2 工具；`dsh-work`=10 工具）。结论=**dsh-notify + dsh-ui-tweaks 最适合合并**：同为纯 client UI 增强、各 0 个模型工具（合并后仍 0，远低于 Pi 上限 3）、host inject 并集仅 webServer/settings、slot 无碰撞（notify=settings.general.item id web-ui-notify；ui-tweaks=settings.plugins.tab + plugin.item 各 key）、注册 id 均需对齐新包名（仿 aqua 教训）。essentials+notify+ui-tweaks 代码上可行但会逆转 2026-08-18 拆分决策、违背核心最小化，不推荐；visualize+ui-tweaks 工具数 2≤3 可行但语义松散；memory 并入 essentials 会使核心带 1 工具且重功能入核心，违背最小化；dsh-work 已 10 工具=拆分红线，**绝不能并入任何东西**；dsh-core 是共享库非插件不可合。**坑**=notify 的 client 注册 id 仍是上游 `@omdsh-dev/dsh-web-ui-notify`（包名已是 dsh-notify），合并时须改成新 bundle id；essentials 与 ui-tweaks 各自 patch 都 disable `ui-settings-plugin-inventory`，合并去重一份。可复现?是（grep 各 lib 工具注册 + slot key 即可复现）。
- **合并候选盘点 + README 残留 notify 旧计数（2026-08-19，分析）**：问题=盘点当前仍独立的插件哪些适合完全合并（收编进 monorepo）。原因=自研已并入 2 monorepo（dsh-plugins 7 子包含 notify、dsh-skills 3 子包），剩余独立=dsh-better-sidebar / dsh-market / dsh-usage-plugin / dsh-ui-aqua（第三方 fork）+ dsh-desktop-shell（原生）。结论=唯一现实候选是 **dsh-usage-plugin**（小、零构建依赖、曾并入 essentials、本地改 4 处 UI，若决定不再跟上游可仿 notify 先例收编）；better-sidebar（上游活跃 ~802★ + ws/node-pty 原生依赖）、market（459★ 活跃）、aqua（267★ 活跃且本仓库不可重建）、desktop-shell（原生 Swift/Tauri）均**不适合**合并、保持独立。**坑**=README.md 未随 notify 收编同步：第 41/139 行仍把 notify 列为第三方 fork（链接已不存在的独立仓库）、第 73 行计数「6 bundle + 5 fork」应改为「7 子包 + 4 fork」；THIRD-PARTY.md 已正确，仅 README 滞后。解法=README 目录表把 notify 移入自研合并仓行、同步更新计数。可复现?是（README 行 41/73/139 与 plugins.json 不符）。
- **web profile 的 dsh-ui-aqua 重复注册修复：profile 手写 insert 与 bundle 自带 patch 重复（2026-08-19，修复）**：问题=`dsh --profile web --dump-config` 里 `ui-aqua` 行出现 2 次（一次来自 dsh-ui-aqua 包自带的 `cordis.patch.yml` 的 `- insert: {id: ui-aqua, name: dsh-ui-aqua}`，一次来自 web profile 的 `C:\Users\admin\.dsh\profiles\web\cordis.patch.yml` 末尾手写的同款 insert）。原因=迁移/收编时曾靠 profile 手写 insert 注册 aqua，但 dsh-ui-aqua 包自身已声明 `dsh.bundle.patch`（自带 cordis.patch.yml 含同款 insert），bundle 安装后 patch 自动生效——profile 手写这份是冗余的；rc.7 下同名行「后者覆盖」所以 GUI 尚能跑，但属潜在重复注册隐患（keyed-slot/重复 id 更严检查时可能出问题）。解法=删除 profile `cordis.patch.yml` 末尾 6 行（注释块 + `- insert:` + `- id: ui-aqua` + `name:`），保留 bundle 自带 patch。**坑**=①profile cordis.patch.yml 是 LF-only（31 LF/0 CRLF），NOTES.md 是 CRLF+UTF-8（4720 LF 全 CRLF）——改前先查换行符再选 edit 或 Node 写入；②验证用 `dsh --profile web --dump-config` 计数 `- id: ui-aqua` 应=1（改前=2）；③运行中的 harness 按 boot 时组合加载，改 profile 配置需**重启 dsh web** 才真正生效（别在 GUI 会话里自杀 harness）。验证=dump-config ui-aqua 计数 2→1、上下文只剩 `# == dsh-ui-aqua`（bundle patch 节）、profile patch 文件其余行未动、语法干净。可复现?是（改前 dump-config 计数=2；删 profile insert 后=1）。

- **本地仓库伞目录约定 + meta-repo 干净化 + curl tarball 补回 dsh-desktop-shell（2026-08-19，组织/清理）**：问题=①插件迁移后本地各插件仓库摆放无统一约定；②meta-repo 残留 `dsh-desktop-shell/`（仅 tauri/src-tauri/target/ Rust 编译产物，含 exe/pdb）与 `dsh-usage/usage-records.json`（525KB 运行时数据），git status 一直有未跟踪噪音；③dsh-desktop-shell 源码要放到伞目录但 git 网络不稳。解法=①AGENTS.md 新增「本地仓库组织约定」章节：所有 GitHub 上 dsh 插件仓库统一放**伞目录**（Windows=`D:\workspace\deepseek-harness`，macOS 参照同约定自行设路径），meta-repo 保持干净（只存 plugins.json+脚本+文档）；②meta-repo 删 `dsh-desktop-shell/` 与 `dsh-usage/`，.gitignore 追加 `dsh-desktop-shell/`、`dsh-usage/`、`plugin-list.txt`（用户个人待尝试清单）；③curl 拉 codeload tarball（4.1MB，~54KiB/s，git 不可用时的替代）解压到伞目录 → git init + remote add origin，等网络稳定再 `git fetch && git checkout -B main origin/main` 补完整历史。**坑**：①**git fetch/pull 在此机不稳定**（Recv failure / 120s 超时），curl codeload 稳定但慢——拉源码优先 curl tarball；②codeload tarball **不含 .git 历史**，解压是源码快照不是克隆，须 git init + 配 origin 才能日后同步；③repo 文件多为 UTF-8+CRLF，改含中文文件用 Node readFileSync/writeFileSync（utf8），PowerShell Set-Content 会 GBK 误读（与既有编码铁律一致）。**验证**：meta-repo git status 干净（只剩 .gitignore/AGENTS.md 有意修改并已提交）；dsh-desktop-shell index.js `node --check` 过、11 文件就位伞目录；web profile 依赖已指向伞目录本地副本、dsh web HTTP 200。可复现?是（git fetch 超时 / tarball 无 .git / Set-Content 中文乱码均可复现）。

- **fork 仓库健康修复：gitignore 补全 + lockfile 跟踪（2026-08-19，清理）**：问题=合并/收编后各 fork 仓库 .gitignore 不完整——better-sidebar 只有 `*.map`（node_modules 显示未跟踪噪音、易误 add）、usage-plugin 空 .gitignore、pnpm-lock 未跟踪。解法=①better-sidebar：.gitignore 补 `node_modules/*.log/.DS_Store`、跟踪 pnpm-lock.yaml（依赖锁定真相，契约「lockfile 即真相」）；②usage-plugin：补 .gitignore（无 lock 文件，因为无依赖构建）。**坑**：git push 大仓库（better-sidebar 含 lib/ 产物）可能命令超时但实际推送成功——超时后用 `git log origin/main..HEAD` 确认待推送数，为 0 即已推。**验证**：7 个仓库（dsh-plugins/dsh-skills/better-sidebar/market/usage-plugin/aqua/desktop）全部 node_modules 0 跟踪、0 未提交；汇总仓库 check-consistency 15 插件全过、install.sh 语法 OK。可复现?是（无 node_modules 忽略时 git status 显示未跟踪噪音可复现）。
- **dsh-notify 收编为自研基础插件：并入 dsh-plugins 子包（2026-08-19，归位）**：问题=用户指出系统通知（notify）从功能上是基础插件，不应作为需独立维护的第三方 fork。原因=notify 是纯 client bundle（host no-op）、零依赖、极轻量（审批/提问/轮次完成/后台会话桌面通知），与 essentials 同级的基础能力；此前按第三方 fork 独立仓库（origin=third-party-fork，upstream omdsh-dev/dsh-web-ui-notify）。解法=①subtree 并入 dsh-plugins 作第 6 个自研子包（`git subtree add --prefix=dsh-notify`，历史保留）；②删 GitHub 独立仓库 dsh-notify；③plugins.json：repo 改 `bitterSmilezzz/dsh-plugins` + `path:/dsh-notify`、origin 改 first-party（去掉 upstream/scenario）；④THIRD-PARTY：notify 从第三方 fork 清单移出、记录改「收编为自研（2026-08-19）」，fork 清单剩 better-sidebar/market/usage-plugin/aqua。**坑**：subtree add 在无 user.email 的仓库报 fatal 但文件已进工作区——先 `git config user.*` 再提交即可（非 merge 状态，直接 commit 文件完成并入）；删除独立仓库前确认内容已并入（dsh-plugins 子包完整 + 语法 OK）。**验证**：manifest get 输出 `dsh-plugins#main&path:/dsh-notify`；install --all dry-run 含 notify 子包；node --check host/client 语法 OK；check-consistency 15 插件全过。可复现?是（subtree add 缺 user.email 报错但文件可提交可复现）。
- **按用户要求：归档内容直接删除，不再保留（2026-08-19，清理）**：问题=用户明确「多余的旧的不用的不用归档 直接删掉」——此前将旧自研独立仓库（GitHub archive）与过时分析文档（docs/archive/）归档保留，用户认为无用就该删。解法=①**GitHub 删除 9 个旧自研仓库**（dsh-core/essentials/memory/visualize/ui-tweaks/work/dev/writing/design）：先 `gh repo unarchive`（归档仓库不能直接 delete，报 not archived 无害）再 `gh repo delete --yes`——删除不可逆但内容与历史已完整并入 dsh-plugins（6 子包 123 提交）/dsh-skills（3 子包 16 提交），无独立价值；②**删 docs/archive/** 8 个 monorepo 时代分析文档（analysis-*/optimization/pilot-harness/token-saving/violations/vision-bridge/load-fix），内容已在 NOTES.md 决策历史中，docs/ 只留 agent-self-optimization（活契约），README 移除 archive 引用。**坑**：①gh repo delete 输出不可靠（成功时无输出、exit=0 是唯一信号），用 `gh repo view` 确认是否真删（已删仓库报 "Could not resolve"）；②归档仓库必须 unarchive 才能 delete；③删唯一副本前先确认内容已并入（git 历史对象可达），否则永久丢失。**验证**：gh repo list 无 9 个旧仓库（18→9）；docs/archive 空已删；README/AGENTS/THIRD-PARTY 无 archive 残留引用；汇总仓库工作树干净、check-consistency 15 插件全过。可复现?是（gh repo delete 无输出但 exit=0；归档仓库需 unarchive 才能删可复现）。
- **dsh-plugins 合并仓库清理：技能归位 + 根 node_modules 误跟踪修复（2026-08-19，清理）**：问题=①dsh-work/.dsh/skills/dsh-plugin-development（DSH 插件开发指南 v3.1.0，387 行）放在协作 bundle 里是错误归属（该属开发技能包）；②合并 dsh-plugins 时无根 .gitignore，pnpm install 后**根 node_modules 6191 个文件被 git 跟踪**（子包 0 个——子包有各自 .gitignore 正确忽略）。解法=①技能经 git show 从历史提取 → 放入 dsh-skills/dsh-dev/skills/dsh-plugin-development/（结构与 dsh-dev 其他技能一致），dsh-work 移除 .dsh 遗留 + .gitignore 去掉旧 .agent-teams 规则；②根 .gitignore 补 node_modules/*.log/.DS_Store，`git rm -r --cached node_modules` 从索引移除（磁盘保留）。**坑**：`git rm -r 目录` 后原文件立即从工作区消失——要先 `git show HEAD:路径` 提取内容再删，否则唯一副本丢失（本案例技能靠 git 历史恢复）；合并仓库（subtree 多仓库并入）务必第一时间建根 .gitignore，否则 pnpm install 等会污染索引。**验证**：dsh-plugins/dsh-skills 均 node_modules 0 跟踪、工作树干净；web profile bundle 正常（essentials/work 在、9 个 bundle）；dsh-work lib/index.js 语法 OK；check-consistency 15 插件全过。可复现?是（无根 .gitignore 时 pnpm install 后 node_modules 被跟踪可复现）。
- **install.sh 本地开发优先：ensure_source 支持 ~/workspace/<repo>/<子包>（2026-08-19，开发流）**：问题=合并后 clone 了 dsh-plugins/dsh-skills 到 ~/workspace 做本地开发，但 install.sh 的 ensure_source 仍优先从 plugin-cache clone（本地只有 REPO_DIR 检查，不认 ~/workspace）。解法=ensure_source 优先链改为：汇总仓库内 REPO_DIR → **~/workspace/<repo 短名>/<path 子包>**（本地开发副本）→ plugin-cache clone。repo 短名从 manifest spec 提取（github:owner/repo#ref&path:/sub 中取 repo 名 + path 子目录）。**坑**：repo 短名正则首版写成取到 owner（bitterSmilezzz）而非仓库名（dsh-skills）——正确应取斜杠后、#/& 前的 repo 名。**验证**：--only dsh-writing 走 ~/workspace/dsh-skills/dsh-writing（无 clone 输出，40 技能复制成功）；--only dsh-essentials 的 preset 走 ~/workspace/dsh-plugins/dsh-essentials/preset（liangshen/router-standard 更新成功，无 clone）。**收益**：本地开发（改 workspace 源码 → 刷新 GUI）成为一等路径，稳定后 push 远端即可，install.sh 自动优先本地。可复现?是（owner/repo 正则取错导致走 clone 可复现：修前 ~/workspace 副本被忽略）。
- **本地开发工作流 + dsh-core 引用修复（2026-08-19，开发流）**：问题=合并后 dsh-plugins 的 essentials/work 仍引用已归档的 `bitterSmilezzz/dsh-core`（归档仓库只读虽能解析但违背合并意图）；且用户「每个插件都要改」需要本地 link 开发流。解法=①**引用修复**：dsh-plugins 内 essentials/work 的 dsh-core 依赖从 `github:bitterSmilezzz/dsh-core#main` 改为 `github:bitterSmilezzz/dsh-plugins#main&path:/dsh-core`（同仓库内子包，独立安装可解析，已实测从 git 子目录装 essentials 时 dsh-core 正确从 dsh-plugins 拉取）；②**本地开发工作流**：clone dsh-plugins 到 `~/workspace/dsh-plugins` + `pnpm install` 建 workspace 链接，web profile 的 dsh-essentials/dsh-work 从 github 源切到 `link:/~/workspace/dsh-plugins/dsh-essentials`（dsh plugin add 本地路径），改完刷新 GUI 即生效、稳定后 push；dsh-core 本地 workspace 内解析 ✅。**坑**：归档仓库（gh repo archive）内容只读、不能再 push——合并后跨包依赖必须指向**仓库内子包**（`&path:/`）而不是旧的独立仓库，否则违背合并意图且未来无法随主仓库更新；本地 link 装 bundle 时 pnpm 用 workspace 链接（profile 的 node_modules 里 essentials 是 link 到本地目录）。**验证**：web profile 无断链（essentials/work → ~/workspace/dsh-plugins/… ✅）、bundle 层含两者、本地 essentials/work lib/index.js 语法 OK、dsh-core 本地解析。可复现?是（归档仓库引用不随主仓库更新可复现）。
- **install.sh 极简化为 --all/--only 两级（2026-08-19，简化）**：问题=用户确认「后面就不用按场景来区分了」——自研插件合并为 2 monorepo 后，dev/writing/design/work/heavy 这些场景区分失去意义（技能都在 dsh-skills 一个仓库，bundle 都在 dsh-plugins）。原因=场景原本的价值是「按需选装」（Pi 理念核心最小化），但合并后场景和插件归属脱钩，维护 9 个场景映射（bundles_for/skills_for/needs_presets）反而复杂。解法=install.sh 改为两级模型：`--all`（默认，装全部 12 bundle + 3 技能包 + preset）、`--only <id,...>`（按清单 type 字段智能分类：bundle 走 dsh plugin add、skills 复制到 ~/.agents/skills、dsh-essentials 自动带 preset）、`--external`（只外部浏览器组件）。目标列表从 `plugin-manifest.mjs list` 按 type 列提取（awk），删除 bundles_for/skills_for/needs_presets/SCENARIO 全部场景代码（-109 行）。**坑**：`--external` 初版没设 MODE 会默认 all 连带装全部 bundle——须独立 MODE=external 且 ONLY 为空时目标列表为空自动跳过 bundle/skills/preset 段；`--only` 里混 skills 和 bundle 时按 type 分流（manifest get 输出 type）。**验证**：--all dry-run 12 个 bundle + 技能 + preset；--only dsh-memory,dsh-work 只装指定；--only dsh-dev 只复制技能；--only dsh-essentials 带 preset；--external 只外部；真实安装 --only dsh-memory 进 bundle 层成功；check-consistency 15 插件全过。可复现?是（--external 误跑 all 可复现：加 MODE=external 前）。
- **自研插件合并为 2 monorepo：15 独立仓库 → 7 活跃仓库（2026-08-19，架构重构）**：问题=用户每个自研插件都要改、都未稳定，15 个独立仓库意味着 15 个工作区 + 每次改完分头 commit/push，管理负担重（用户原话「这 14 个仓库管理上是不是不好管理」「每个插件都要改」）。原因=拆独立仓库的前提是插件稳定低频更新，与高频迭代阶段冲突；且第三方 fork 必须独立（要跟上游 merge），自研不需要。解法=**自研合并 / 第三方独立**：①新建 `dsh-plugins`（6 子包 dsh-core/essentials/memory/visualize/ui-tweaks/work，`git subtree add --prefix=<pkg>` 逐个并入，**空 init 提交后再 subtree add** 否则报「working tree has modifications」，历史完整保留验证=旧 commit 对象可达、提交总数=6 仓库之和）、`dsh-skills`（3 技能包 dev/writing/design）；②**同仓库子包用 pnpm git 子目录语法安装** `github:<repo>#<ref>&path:/<subdir>`——`dsh plugin add` 支持（pnpm 的 path 语法），实测 essentials/memory/work 均从 dsh-plugins 子目录成功装、进 bundle 层；③**跨包依赖 dsh-core**：不能改 workspace:*（独立安装时 workspace 不解析，实测 `pnpm add /path/dsh-essentials` 时 dsh-core 缺失），**保持 `github:bitterSmilezzz/dsh-core#main`**——从 git 子目录装时能解析（实测 ✅），本地 workspace 开发时 pnpm 用本地版本覆盖；npm 未登录无法发布 dsh-core（npm whoami ENEEDAUTH）；④旧 8 个独立自研仓库 **gh repo archive**（保留只读+历史，不删除——历史已 subtree 并入新仓）；⑤web profile 断链修复：dsh-essentials/dsh-work 原 link 指向已删目录（包在但 bundle 层消失）→ remove 后从 dsh-plugins 子目录重装。**坑**：①subtree add 前必须先空 commit；②`git log -- <path>` 因 subtree 历史路径前缀不同只显示少量提交，但完整历史在对象库（用 `--all` + `git cat-file -t 旧hash` 验证可达）；③install.sh ensure_source 要支持 spec 里的 `&path:` 分离（sed 抽 subpath + clone_url 去掉 `#ref&path` 部分，clone 后返回 `cache/<id><subpath>`），技能包 clone 整个 dsh-skills 后 cd 子目录复制 skills；④plugin-manifest list/get 的 spec 统一带 `&path:`，install-plugins buildSpec 幂等补 `github:` 前缀。**验证**：全场景 dry-run 输出正确（子包 `&path:/`、fork 独立、desktop 独立）；dev 场景 37 技能 + 2 preset 从合并仓复制成功；web profile 断链修复无残留。可复现?是（workspace 依赖独立安装不解析 / subtree 需空 init / 旧 link 断链均可复现）。
- **meta-repo 冗余清理 + 依赖/性能优化（2026-08-19，优化）**：问题=插件全拆独立仓库后，汇总仓库残留大量 monorepo 时代冗余：5 个无用的 `@deepseek-ai/*` 根依赖、`pnpm-workspace.yaml`（packages: [dsh-*] 已无目录）、6 个失效脚本、8 个过时 docs、viz/ 与 .agent-teams/ 磁盘垃圾。原因=拆分只搬了插件，没清外围。解法=①**依赖**：根 package.json 删 `@deepseek-ai/cordis|dsh-invariants|dsh-scope|dsh-session|dsh-timeout`（零脚本引用，monorepo 残留），只留 `yaml`（apply-settings）+ `playwright`（web-regression）→ **node_modules 306M → 20M（-93%）**；②**脚本**：删 `benchmark/check-package-consistency/check-inject-consistency/merge-better-sidebar-client/merge-market-client/publish-packages`（全部扫根目录 dsh-* 已失效），新增 `check-consistency.mjs` 验证 plugins.json 清单（id 唯一/type/source/repo/ref/fork-upstream）；③**install-plugins.mjs 精简**：删 `--from/--ref/REPO/本地目录扫描`（source 全 github），buildSpec 直接用 manifest spec，`plugin-manifest.mjs list` 输出统一带 `github:` 前缀（与 get 一致）；④**docs/**：8 个过时分析归档到 `docs/archive/`（保留决策上下文），README 只引 agent-self-optimization；⑤**.gitignore** 精简、删磁盘 viz/ + .agent-teams/。**坑**：install-plugins 从 `list` 拿 spec 时第 4 列是 `repo#ref`（无 github: 前缀）而 `get` 的 spec 带前缀——两处格式不一致导致 dry-run 输出缺 `github:` 前缀（`dsh plugin add bitterSmilezzz/...` 装不上），统一为带前缀。**验证**：全场景 dry-run 输出正确 github 直装；check-consistency 15 插件全过；apply-settings/install-external/web-regression 均可用（精简后依赖足够）。可复现?是（未清理时 node_modules 306M、install-plugins 前缀缺失可复现）。
- **侧边浏览器「静默空白」修复：browser.probe HEAD→GET 兜底，百度正确判拒嵌（2026-08-19，bug 定位+修复）**：问题=用户要求「侧边栏能正常访问」；百度地址栏有地址但 iframe 空白且无提示。原因=上一条 NOTES 猜「JS frame-busting」是**错的**——Tabbit 真机抓 console 实锤：`reqfail https://www.baidu.com/ net::ERR_BLOCKED_BY_RESPONSE` + `Framing ... violates CSP frame-ancestors 'self' https://...`，即百度**发 CSP `frame-ancestors`**（浏览器强制阻止、任何 iframe 都渲染不了，与沙箱无关）。探测漏判根因=**HEAD vs GET**：百度只在 GET 响应带 frame-ancestors、HEAD 不带（curl 实测 HEAD/任意 UA 无 CSP、GET+node UA 有 CSP，Chrome UA 反而不发=WAF 指纹差异化）；旧 probe 只 HEAD（405/501 才转 GET）→ 判 embeddable → 静默空白。解法=`src/index.ts` browser.probe：**HEAD 无拒嵌头（XFO 与 frame-ancestors 均空）或 405/501 时补一次 GET** 再定结论；Node 复现验证 baidu→blocked、bing/zhihu→blocked（不变）、example→embeddable（不变）。**附带**=dsh-better-sidebar 已拆到独立仓库 `bitterSmilezzz/dsh-better-sidebar`；meta-repo 删目录后 **web profile 的 `link:` 悬空**（下次重启加载失败）→ 重指 `~/.dsh/profiles/web/package.json` dependencies + node_modules 符号链接到 `~/workspace/dsh-better-sidebar` 克隆。**坑**=①沙箱 iframe 父页面**读不到任何信号**（location/contentDocument/length 全 SecurityError，about:blank 也是 opaque origin）→ 空白帧无法从父页检测，只能靠 host 探测，所以探测准确性是关键；②拆分仓库全新 clone 需 `pnpm install`（node-pty 构建被 pnpm 10 拦截、仅运行时需要）+ 配 git 身份；③tsdown 重建 client 半又出非确定 CSS 哈希 → 提交只带 src+lib/index.js，恢复未动 client 文件；④git 源安装会跑 prepare 脚本（并行会话已删 better-sidebar prepare）。可复现?是（curl GET+node UA 见百度 CSP；新 probe 逻辑 Node 复现 4 站点判定正确）。
- **deepseek-plugins 全量拆分：剩余 13 插件独立仓库（2026-08-19，架构迁移）**：问题=试点（dsh-memory / aqua）之后，把剩余 13 个插件全部拆为独立 GitHub 仓库，汇总仓库纯清单化（plugins.json + 脚本 + 文档，零 dsh-* 目录）。原因=meta-repo 架构目标：各插件独立发布/升级，第三方 fork 治理，本仓库开箱即用。解法=**① 批量拆分脚本 `scripts/split-plugin.mjs`**：clone 汇总仓库 → `git filter-repo --path <dir> --path-rename <dir>/:` 提取历史（支持 `--paths` 追加历史曾用路径，如 usage-plugin/notify 的 `dsh-essentials/lib/xxx`）→ 更新 package.json repository/homepage/bugs 指向新仓库 → **workspace: 跨包依赖改 `github:owner/repo#main`**（dsh-core 被 essentials/work 用 `import {mergeConfig/dedupeBy}` 引用，未发 npm）→ `gh repo create --source --push`；② 拆完从汇总仓库 `git rm -r` 全部目录（含残留 node_modules/构建产物手动清）；③ web profile 的 dsh-ui-aqua 从 `link:` 切到 fork 源后删本地目录。**踩坑（全部实测）**：①`git subtree split` 在该仓库「目录消失又出现 + squash merge」历史下失真，**filter-repo 才对**；②**上游/收编包源码 package.json 常缺 `dsh.bundle` 声明**（npm 发布产物有、源码没有）→ GitHub 直装报「declares no dsh.bundle — installed as a plain dependency, not a profile layer」→ 拆出时需补 `dsh.bundle:{bundle:{patch}}` + files 补 cordis.patch.yml（aqua 已踩过，better-sidebar/market 本轮通过 prepare 脚本问题暴露同族坑）；③**git 源安装会执行 package.json 的 prepare 脚本** → 有 `prepare` 的包（better-sidebar `tsdown`、market `npm run build`）被 pnpm `onlyBuiltDependencies` 白名单拦截报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` → **lib/ 已入库则直接删 prepare 脚本**（无需构建）；④**bash 全角括号紧贴变量名**（`$spec）`、`$rel（`）在 `set -u` 下报「unbound variable」（bash 把全角字符并入变量名）→ 统一 `${var}` 包裹；⑤**命令替换的 stdout 污染**：ensure_source 里 `echo "[info]..."` 打 stdout 被 `$(...)` 捕获进返回路径 → 「无 skills 目录」假阴性 → 诊断信息改 `>&2`；⑥ensure_source 的 clone URL 要把 `github:owner/repo#ref` 转成 `https://github.com/owner/repo.git`（git clone 不认 github: 前缀）；⑦从 `/tmp` 拷脚本调试时 `dirname $0` 让 REPO_DIR 变 `/`——调试要在原路径。**验证**：11 个 bundle 从 GitHub 全量直装到临时 profile（层栈注册完整、语法全过）；writing 场景 40 个技能 clone+复制成功、preset 复制正常；check-package/inject 守护全过。可复现?是（prepare 脚本拦截 / 全角括号 unbound / stdout 污染均可复现）。
- **百度类 frame-busting 站点在侧边沙箱 iframe 渲染不出，头探测判可嵌入=插件 UX 盲区（2026-08-19，实测）**：问题=侧边浏览器访问 www.baidu.com，地址栏显示百度地址但 iframe 空白（用户反馈「地址是百度的但没访问成功」）。原因=百度无 `X-Frame-Options`/CSP `frame-ancestors`（host `browser.probe` 返回 reachable:200、无这两个头 → 客户端判 `embeddable` 走裸 iframe），但百度页面加载后用 **JS frame-busting**（检测被嵌套→强制跳转，沙箱禁 top-navigation 后只剩空帧）拒绝嵌入——响应头探测对这种手段**完全检测不到**，于是既渲染不出、也不显示原因面板+系统浏览器按钮。**实测取证**（Tabbit/Playwright，隔离真实浏览器）：本地页起 http server 托管，内嵌两个 iframe 用**与 BrowserView 完全相同的 sandbox**（`allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox`、无 `allow-same-origin`、`referrerpolicy=no-referrer`）→ example.com 正常渲染（title/正文都有），百度帧 `url` 变空（导航被中止，`frames()` 里找不到含 baidu.com 的帧）——坐实 frame-busting。解法=用 `browser_open` **`system` action** 在系统浏览器打开（设计好的逃生口）；后续可改进 BrowserView 加「空白帧启发式检测→显示原因面板+系统浏览器按钮」（难点=沙箱跨源无法读内容，只能靠 iframe load/导航中止信号，无法可靠区分「真空白页」）。**坑**=Tabbit 的 `page.goto` **拒绝 file://**（Navigating to local URL is not allowed），本地测试页须用 `python3 -m http.server` 走 http；iframe 内仍直接访问真实 https 站点，不受本地托管影响。可复现?是（任意 frame-busting 站点：google/baidu/qq 等；Tabbit 复测法可直接复现空白帧）。
- **browser_open `at` bug 修复后重启验证通过（2026-08-19，验证）**：问题=重启 dsh web 后重测侧边浏览器。解法/结果=`open https://www.baidu.com` 无报错、随后 `status` 返回 `page=https://www.baidu.com/`——完整链路（工具→host intent→可见浏览器标签轮询→iframe 导航→browser.report 清意图+记状态→下次调用返回 page）全部打通，`at` 不再泄漏、输出 schema 校验通过。经验=①host 半改动**必须重启 dsh web**（lib/index.js 启动时加载进进程；本会话两次未重启时的 `value.page.at` 报错即旧代码实锤，重启后消失）；②客户端「只有**激活且可见**的浏览器标签才消费意图」，发导航前确认侧边栏有可见浏览器标签，否则 intent 会一直挂起到有可见标签为止（relay 只会 mint 不存在的标签，面板折叠/标签不可见时不消费）。可复现?是（重启后 open+status 稳定返回 page）。
- **aqua fork 内容以「本地能用版本」为准（2026-08-19，重构）**：问题=试点拆 dsh-client-ui-aqua 时按 THIRD-PARTY 登记的对象走了「上游 1.3.x 原样 + 三处修补」路线，但用户澄清「虽然是 fork，要以本地现在能用的版本为主」。原因=汇总仓库里实际存在两个 aqua：凌晨自研适配 `dsh-ui-aqua`（0.1.0，peer rc.7，web profile 一直 link 使用、验证可用）与下午正式收编 `dsh-client-ui-aqua`（1.3.x，peer rc.5，从未装进 profile）；THIRD-PARTY 只登记了后者，迷惑了拆分对象。解法=**fork 关系保留（WYH66666666/DSH-Transparent-UI-Plugin），内容换成本地在用版本**：`git checkout -B main upstream/main` 重置到上游 fa0cb1f，rsync 覆盖为 dsh-ui-aqua 目录内容（diff 仅 name/version/peers + 少量 rc.7 兼容，确认内容=上游+本地适配），单 commit `feat: carry local working version as dsh-ui-aqua`，force push fork main（旧上游 1.3.x 路线从 main 移除）；汇总仓库 plugins.json/README/AGENTS/THIRD-PARTY 同步改为 dsh-ui-aqua。**坑**：①**拆分第三方前先问「哪个是本地实际在用的版本」**——THIRD-PARTY 登记 ≠ 正在运行，profile package.json 的 link 才是真相（`~/.dsh/profiles/web/package.json` dependencies 里 `dsh-ui-aqua: link:...`）；②上游源码 package.json 常缺 `dsh.bundle.patch` 声明（npm 发布产物有、源码没有），GitHub 直装会报「declares no dsh.bundle — installed as a plain dependency, not a profile layer」→ fork 需补 `dsh.bundle: {bundle:{patch}}` + files 补 cordis.patch.yml；③同名 patch id（ui-aqua）装两个 aqua 会冲突，本地目录待 profile 切换依赖后再删。**验证**：`dsh plugin add github:bitterSmilezzz/DSH-Transparent-UI-Plugin#main` 到临时 profile 安装为 `dsh-ui-aqua`、`dsh.profile.bundles` 正确注册、client.js 注册 id==包名（10 处）、cordis.patch.yml 随包安装。可复现?是（上游源码缺 dsh.bundle 声明可复现；双 aqua 并存可复现）。
- **browser_open 返回校验炸「value.page.at is not a declared property」（2026-08-19，bug 定位+修复）**：问题=硬刷新后客户端真正消费意图并回报页面状态，`browser_open` 的 status/open 在下一个调用直接报 output 校验错误（工具 invalid output 失败）。原因=`BrowserPageState` 带 `at`（report 时间戳）字段（browser-intents.ts `reportPage` 写入），工具 execute 原样返回 `registry.pageOf()` 整对象；output schema（tools.ts）只声明 url/title/embedBlocked 且 `additionalProperties:false`，dsh-tools 运行时按 schema 校验返回值 → `at` 非法。实现时没炸的原因=验证阶段 page 恒 undefined（当时客户端从未真正回报过，见「意图不消费=页面旧实例」条目），字段从未进过返回值。解法=tools.ts 加 `pageLeafOf()` 仅投影 url/title/embedBlocked（`at` 不外泄），status 与 open 两处统一走它；`pnpm build` 后 **host 半需重启**（src/tools.ts → lib/index.js，client 半未动）。**附带坑**=tsdown 重建 client 半产生**非确定性 CSS module 哈希**（同源码 `FSTq1W_*` vs 新哈希，500+ 行伪差异）+ 新生成 4 个 `.map`（不在 npm files）→ 恢复未动文件（`git checkout <pre> -- lib/client*.js`）+ 包内 .gitignore 加 `*.map`（map 用 `git rm --cached` 保留磁盘文件即可），提交保持外科手术式。可复现?是（客户端回报一次后调 status 必炸；修复后返回 `{url,title,embedBlocked}` 无 `at`；typecheck 过、包内无测试文件是既有状态）。
- **deepseek-plugins 插件拆分试点：monorepo → meta-repo（2026-08-19，架构迁移）**：问题=用户要求「各插件单独仓库，本仓库只做汇总和开箱即用；改过的第三方插件 fork 上游+本地改动，自研插件独立仓库」。原因=monorepo 里 16 个插件同仓、第三方用 `git subtree` 收编，升级/维护/独立发布都耦合，且 subtree 历史在「目录消失又出现 + squash merge」场景下无法用 `git subtree split` 正确提取。解法（试点 2 个，全链路已验证）=**架构**：汇总仓库（meta-repo）只保留 `plugins.json`（来源真相：source=github / local）+ 安装脚本 + 文档；已拆分插件由 `install.sh` 按清单 GitHub 直装。**拆分手段**：①第一方 dsh-memory → `git filter-repo --path dsh-memory --path dsh-plugin-jinji --path-rename dsh-memory/: --path-rename dsh-plugin-jinji/:` 提取 13 个提交完整历史（改名前后的两个路径都要列，单路径会丢改名前的历史）→ 新仓库 bitterSmilezzz/dsh-memory，package.json 的 repository/homepage 指针改独立仓库；②第三方 dsh-client-ui-aqua → `gh repo fork` 上游 WYH66666666/DSH-Transparent-UI-Plugin，在完整克隆（.git 全历史）上覆盖本仓库目录内容（=上游 fa0cb1f + 本地三处修改：去 scope 改名 / bundle 注册 id 对齐 / Windows 流体修复 + tsdown 存根），以单个 commit 提交在 fork main。**安装改造**：install.sh 的 bundle 循环改为先查 plugins.json（本地目录存在→本地；否则→github:<repo>#<ref>）；新增 scripts/plugin-manifest.mjs 作清单查询 CLI（list/get/skills-src）供 install.sh 与 install-plugins.mjs 复用；install-plugins.mjs discoverPlugins 并入清单 github 源。**踩坑**：①`git subtree split` 在该仓库历史形态下失真（436 提交混入无关目录、树不一致）——filter-repo 是正确工具，`--path-rename` 把匹配路径提升为仓库根是必需步骤；②**从 GitHub 装 aqua 报「declares no dsh.bundle — installed as a plain dependency」**=上游源码 package.json 缺 `dsh.bundle` 声明（npm 发布产物有、源码没有，发布流程注入）→ fork 补齐 `dsh.bundle: {bundle:{patch}}` + files 数组补 cordis.patch.yml 才被 dsh 识别为 profile layer；③仓库里存在两个 aqua（凌晨自研适配 dsh-ui-aqua 0.1.0 + 下午正式收编 dsh-client-ui-aqua 1.3.x），patch id 均为 ui-aqua 会冲突——先确认哪个是正主再拆（用户确认 DSH-Transparent-UI-Plugin fork 是正主，dsh-ui-aqua 暂留）；④manifest 工具的本地兜底扫描会让「已拆分但本地目录暂存」的插件显示 local——合并时以清单 github 源为准。**验证**：`dsh plugin add github:bitterSmilezzz/dsh-memory#main` 与 `github:bitterSmilezzz/DSH-Transparent-UI-Plugin#main` 到临时 profile 实测均成功、patch 正确进 layer 栈；check-package-consistency 全过。可复现?是（filter-repo split 失真 / aqua 缺 dsh.bundle 声明均可复现）。
- **browser_open 端到端验证：host 链路通、客户端不消费意图=页面旧实例（2026-08-19，验证）**：问题=用户问「sidebar 插件的侧边浏览器能用吗」。分三层实测：①工具层=本会话模型**已能调用** `browser_open`（实证第一条 NOTES（2026-08-19）「新开会话再测」假设成立——新会话组装时工具表已含注册的动态工具）；open/status 正常返回。②host 层=open https://example.com 通过 URL 策略写入 per-session 意图；**冷查意图**=`curl -s -X POST http://127.0.0.1:3080/sidebar/api/browser.intent -H 'content-type: application/json' -d '{"sessionId":"<DSH_SESSION_ID>"}'` → `{"intent":{"seq":1,"op":"open","url":"https://example.com/",...}}`（该 API 是 peek 不消费，curl 静态可查 pending 意图/确认 host 注册表状态，比反复调 status 更直接；sessionId 用 `$DSH_SESSION_ID`）。③客户端层=部署给页面的 client bundle（解析 `window.__DSH_BOOT__` entries 拿 `/plugins/dsh-better-sidebar/client.js?rev=…`）与 lib/ 构建字节一致、含 open relay（src/client/index.tsx：「agent-browser open relay」）+ BrowserView 轮询（BrowserView.tsx 700ms、仅 visible 时消费），但**意图数分钟仍 pending 未被消费**→页面内存里的 client 是旧实例（`dsh web` 重启/重新 build **不会刷新已开页面**，页面加载的是自己打开时刻的 bundle；README 也写明 client 改动需硬刷新）。解法=**硬刷新 GUI 页面（Cmd/Ctrl+Shift+R）**，pending 意图仍在注册表，刷新后新 client 的 relay 会立刻 mint/激活浏览器 tab 并把 example.com 加载出来；刷新后仍不消费再查 sessions list `current` 与 sidebarStore.sessionId 是否匹配、页面 console 报错。可复现?是（curl browser.intent 可复现 pending；刷新后意图应被消费清除）。
- **动态工具「注册可见 ≠ 当前会话模型可调用」（2026-08-19，排查中）**：问题=better-sidebar 的 `browser_open` 工具注册后（settings gate 打开、`Tool.listTools` 可见、host 路由 curl 通），当前会话的模型依旧调不到它——无论当前 turn 还是后续 turn 都不在模型可调用工具表。原因=工具注册进 host 工具注册表（`ctx.tools.register` → inspect 可见）是一层；**模型请求的工具组装（`dsh-agent-loop` step 时 `assembly.tools`，经 systemPrompt.assemble 构建）是否纳入动态注册工具是另一层**——本会话两层的结论不一致（注册表有、请求组装无）。推测=会话级工具快照/组装过滤（官方 dsh-tool-* 是 preset 注册层，better-sidebar 这类第三方 bundle 工具可能未进「模型可见白名单」或需 preset 工具面声明）；未深挖到结论（会话被中断）。解法（待验证）=**新开会话**再测（新会话组装时注册表已含 browser_open；若仍不可用，需查 assembly.tools 的过滤规则/预设工具面配置）；教训=验证「agent 可用工具」以**实际模型请求注入**为准，`Tool.listTools` 的 visible 只是注册表视图；不要反复重试已确认不可用的工具（用户会看出来）。可复现?是（listTools vs 模型工具表不一致可复现；等待新会话实证）。
- **dsh-better-sidebar 智能体驱动内嵌浏览器（browser_open）实现与验证（2026-08-19，实现+验证）**：问题=用户要「zcode 式」侧边栏内置浏览器由 agent 控制；真实浏览器走 browser-skill 不动，补齐的是内置 iframe 浏览器被 model 驱动。**架构**（commit de25c71）：①host 侧 `src/browser-intents.ts` `BrowserIntentRegistry`——per-session 单槽 intent（open/back/forward/reload/system）+ 最近 page 状态（report），`setIntent`（工具写）→ 客户端可见 browser tab 轮询 `browser.intent`（**peek 不消费**，单槽 last-write-wins 无竞态）→ 执行 → `browser.report` 带 seq 清除 + 记录状态 → 下次 `browser_open` 返回 `page`；②`browser_open` 工具（开/退/进/刷新/系统打开/status）由 `agentBrowserTools` 开关 gate（默认 off，与 agentTerminalTools 同模式，settings watch 实时注册/注销）；③client `BrowserView` 仅 `visible`（激活+面板开）时轮询消费（多开语义=「用户当前看的那个由 agent 驱动」），用 `actionsRef` 绕开 stale 闭包（goBack/goForward 读非函数式 cursor）；④client index.tsx 加「open relay」：intent 存在但会话无 browser tab → `service.openTab({type:'browser'})`；有但非激活 → `activateTab`（无则 mint+激活，用户实时围观）。**踩坑**：①收编 checkout **缺 tsconfig.json/tsconfig.build.json/tsdown.config.ts**（npm 包 files 不含）→ 从上游 omdsh-dev/DSH-better-sidebar 抓取补回；上游 main 的 tsdown 配置比 0.12.2 新（带 mermaid chunk）→ 需裁剪 `CHUNKS`/mermaid 插件（本包无 mermaid 依赖，src/client/chunks 仅 terminal/editor）；②根 pnpm workspace 安装被 `dsh-client-ui-aqua` 阻塞：其 devDeps 误用 `@deepseek-ai/*@workspace:^`（workspace 无这些包，peerDeps 已正确声明 rc.5）→ 修正为 `^0.1.0-rc.5`/`^4.0.1`，pnpm-lock.yaml 一并更新；③npm install 在 pnpm workspace 子包报 `Cannot read properties of null (reading 'edgesOut')`（npm/pnpm 混合），无解时优先修 workspace 本身；④defineTool **parameters 必须是扁平字段**（`action: {type,required,enum}` 不是 JSON Schema 的 type:object/properties 嵌套），否则 TS `ParameterPropertySpec` 拒绝；⑤execute 返回对象须与 `output.schema` 推导类型兼容——返回 `page: null` 会挂（schema 无 null），用「省略字段」表达空。**验证**：host 路由 curl 通、`Tool.listTools` 见 browser_open（开关开前没有/开后出现=gate 生效）、GUI 侧边栏工作台展开正常、设置页「浏览器 browser」tab 在列。**bsk vs Tabbit**：bsk daemon 健康但 0 浏览器连接（Edge 未开）；Tabbit 浏览器自带 `tabbit-cli`（Playwright）可作 GUI 验证替代（页面被 bsk 扩展 overlay 干扰时用 `page.locator('body').filter({has: ...})` 限定主 frame；`getByRole name` 撞消息文本用 `exact:true`）。可复现?是（de25c71 全量可复现；注意并行会话）。
- **tabbit 插件重启后全链路就绪验证（2026-08-19，验证）**：问题=用户重启 web profile 后确认插件是否真正加载。验证=①运行时实证：host `Tool.listTools` inspect 已含 `tabbit_browser_install`（工具注册表全局可查）+ skill catalog 现含 `tabbit-browser` → bundle 的 apply() 成功、inject [skills,tools,jobs] 全解析；②本机环境实际已全就绪（此前判断「Tabbit 未装」是错的）：/Applications/Tabbit Browser.app 国内版（com.tab-browser.Tabbit）**1.9.22.0** ≥ 1.9.0、~/.local/bin/tabbit-cli 存在、browser-runtime-service.mjs 进程在跑；③`~/.local/bin/tabbit-cli tasks` 探测**成功**（返回任务清单 JSON，capabilities 含 playwrightHelpers/visualRoutes/cliAdditions 等）→ macOS 国内版 1.9.22.0 无 Windows 那个 INVALID_ENDPOINT_PATH 问题；④探测输出显示残留 task space `verify sidebar browser`（idle、claimedTabCount 0，来自更早会话，skill 规定此类用完的 task space 应收尾 finish）。结论=tabbit_browser_install 首调用即会返回 ready（探测已由本命令完成）；工具本身无法直接由本会话调用（不在会话工具表），但 listTools 可只读证明注册。坑=「装没装浏览器」别凭印象，直接查 /Applications + plutil 读 CFBundleShortVersionString/bundleId。可复现?是（listTools / tabbit-cli tasks 均可复现）。
- **bsk vs tabbit 浏览器自动化选型判据（2026-08-19，分析）**：问题=用户问「tabbit 插件和 browser-skill 是不是重复了」。结论=**能力域重叠但路径不同，不构成重复**：browser-skill(bsk)驱动用户真实 Chrome（复用登录态=cookie，不可替代价值）/ Agent Window 隔离 / borrow 单页，纯 skill 零工具注入（bsk 0.1.10 daemon 本机在跑、1 browser connected）；tabbit 驱动 Tabbit 自家浏览器（独立 profile 登录态）/ tabbit-cli + Browser-owned Playwright Runtime Service（task space 隔离、receipts/checkpoints/多实例 TABBIT_PLAYWRIGHT_INSTANCE、后台安装器），bundle 1 工具+1 skill。**选型判据（一句话）**=碰已登录站点→bsk；隔离受控跑批（QA/benchmark/多任务不互染）且愿装 Tabbit→tabbit；用户点名浏览器→听用户。两者 skill 描述均含「别回退到另一浏览器后端」，并存时靠此判据消歧，无需额外 router。当前 tabbit 三未就绪（插件待重启/browser 未装/上游 1.9.22 国内版 INVALID_ENDPOINT_PATH bug），日常优先 bsk。可复现?否（纯分析；bsk status / dump-config 可复核现状）。
- **安装 Tabbit-Browser/dsh-plugin 到 web profile（2026-08-19，落地）**：问题=用户确认「装上吧」。解法=`dsh plugin --profile web add github:Tabbit-Browser/dsh-plugin`（转发 pnpm，Package: +1，4.6s）；验证=①`dsh --profile web --dump-config` 组合树第 549 行出现 `# == tabbit-browser` + `- id: skill-tabbit-browser, name: tabbit-browser` 行；②包实体在 `~/.dsh/profiles/web/node_modules/tabbit-browser/`（index.js/installer.js/skills/cordis.patch.yml 齐全），web profile package.json dependencies 增 `"tabbit-browser": "github:Tabbit-Browser/dsh-plugin"`；③node --check 两文件过。**peerDeps 警告实锤审计时的预判**：pnpm 报 tabbit 缺 peer @deepseek-ai/dsh-jobs|skill|tools（与其他旧有 react/dsh-client-ui-* 缺 peer 混在一张警告单）——但 index.js **只 import node 内置 + 自家 installer.js**，零 import harness 内部包，服务 `skills/tools/jobs` 由运行中 harness 组合提供，不依赖 profile node_modules 解析，运行时无害（与 NOTES 旧坑「插件 peerDeps 缺陷=import 时解析不到」不同：缺 peer 仅当 bundle 代码真 import 才致命）。坑=①**运行中的 harness 不会热加载新 bundle，须用户手动重启 web profile 才生效**（勿在 GUI 会话里自杀 harness）；②重启后模型侧出现 `tabbit-browser` skill（modelInvocable）+ `tabbit_browser_install` 工具；本机未装 Tabbit → 工具首次调用会按系统地区（AppleLocale）后台下载 macOS ARM64 安装包到 ~/Downloads（CN→tabbit.com 国内源），用户再手动装。可复现?是（命令幂等可重复执行；dump-config 行号随 profile 组合漂移）。
- **Tabbit-Browser/dsh-plugin 第三方审计：纯 skill+bundle 形态、Pi 友好，但 LICENSE 缺失 + README 与代码矛盾 + 国内版 1.9.22 有已知 Runtime bug（2026-08-19，审计）**：问题=用户发来 https://github.com/Tabbit-Browser/dsh-plugin（Tabbit 浏览器官方 DSH 插件，85★，2026-08-14 建仓，对应 bilibili「Tabbit 已支持 DSH」1.9 版本）。**架构**=真 bundle（`dsh plugin --profile web add github:Tabbit-Browser/dsh-plugin`）：cordis.patch.yml 只插一行 `{id: skill-tabbit-browser, name: tabbit-browser}`；host 半区 index.js 做两件事——① `ctx.skills.registerProvider` 注册 bundled skill（**rank 600**=官方预留的包内技能档位，modelInvocable+userInvocable，resourceBase=directory，locator=SKILL.md，get 时 stripFrontmatter），② `ctx.tools.register` 一个 `tabbit_browser_install` 工具（检测稳定版 Tabbit/Tabbit Browser ≥1.9.0 + tabbit-cli launcher + Runtime 进程，结果按 agent session WeakMap 缓存，refresh 才失效；缺装或过低时经 `ctx.jobs.start` 后台下载地区匹配安装包到 ~/Downloads）；installer.js 纯 Node 零依赖（spawnSync + fs/promises + fetch）：macOS 扫 /Applications+~/Applications 的 .app+plutil 校验 bundleId/版本，Windows 查 Uninstall 注册表 64/32 view，region 检测（macOS AppleLocale / Windows Get-WinHomeLocation GeoId）→ CN 用 tabbit.com 国内源否则 tabbit.ai 国际源，下载 host 白名单（www/pkg/releases.tabbit.{com,ai}）+ 1GiB 上限 + content-length 与 MZ/koly 魔数校验 + .part 原子改名。**Pi 对照**=极好：仅 1 工具+1 skill（零常驻 token）、无记忆系统、isConcurrencySafe、副作用可回收、单 job 复训防重复下载、Windows 权限策略克制（不提前要 Full Permission，仅当 Browser/launcher/Runtime 都在但 `tabbit-cli tasks` 探测报 BROWSER_RUNTIME_UNAVAILABLE 才要求切 Full 并停止任务，不重试）；tests/node --test 539 行断言覆盖。**问题**=①仓库**无 LICENSE 文件**（package.json 声明 MIT，收编/再分发有合规缺口）；②README line 88 说 Windows 返回 `cliSandboxMode: danger-full-access`，但代码 describeCliSandbox('win32') 实际返回 `'default'`（按需权限策略上线后 README 没同步，schema enum 里的 danger-full-access 已成死值）；③peerDependencies 只声明 @deepseek-ai/dsh-jobs|skill|tools 且 dependencies 空——按本仓库「插件 peerDeps 缺陷坑」应核实 `dsh plugin add` 从 github 装时是否解析得到，不过 dsh 内置这些服务一般由 harness 提供；④**已知 bug=国内版 Tabbit Browser 1.9.22.0 的 tabbit-playwright-cli 找不到 Runtime endpoint（INVALID_ENDPOINT_PATH，issue #5/#6/#7）**；⑤open PR #3 是 AI scanner 报「owner key 不校验可注入 prototype」——WeakMap 只收对象 key，字符串 key 只会抛 TypeError，该 HIGH 判定基本是误报；PR #4 才是真修复（Windows CIM 命令行带引号时 runtime 进程正则漏匹配 + 优先 LocalAgent CLI 路径）。可复现?是（npm pack 解包 + node --test 全过可复现行为；README 与 describeCliSandbox 断言矛盾可直接对照源码）。
- **dsh web 插件加载故障修复复核 + 落地提交（2026-08-18，复核/落地）**：问题=复核修复记录 docs/dsh-web-plugin-load-fix-20260818.md 所述两项根因是否就位。①dsh-plugin-wallpaper-engine-mac@0.1.6 发包沿用原版包名（cordis.patch.yml loader `name` 与 lib/client.js `__ModuleLoader__.load({id})` 均漏 `-mac`）→ 宿主端 boot 抛 ERR_MODULE_NOT_FOUND / 浏览器端 loaded without registering；解法=web profile pnpm patch，pnpm 10 的 patch-commit 只写 lockfile，package.json 需手补 patchedDependencies；复核=patches/…patch 与 package.json 记录均在位。②dsh-essentials/lib/client.js 在 555da78 拆 dsh-ui-tweaks 时残留 ~410 行 keyboard-shortcuts 重复块 + 孤立 `return module.exports; }` → Illegal return statement、bundle 无法解析 → 浏览器 loaded without registering；解法=删重复块；复核=node --check 过、sub_atFile→sub_attachmentRemoveAlwaysVisible 边界干净、五个拆出模块（autoHideComposer/immersiveMode/keyboardShortcuts/pluginInventory/retrySettings）grep 计数均 0、sub_* 定义无重复。工作区改动未提交 → 本次 commit 3ee12f5（-410/+92，与文档「约 410 行」吻合），记录文档一并入库。坑=①client bundle「loaded without registering」先 `node --check` 排除语法错误，再核对 `__ModuleLoader__.load({id})` == 包名（与 aqua 改名案例同族，见下）；②BSD/macOS uniq 不支持 -w，排重子定义用 awk 抽函数名 + sort|uniq -d。可复现?是（解包 npm 0.1.6 见两处漏改包名；git checkout 555da78^ 的 client.js 可复现语法错误）。
- **「侧边栏内嵌浏览器 vs bsk Agent Window」能力边界调研（2026-08-19，调研）**：问题=用户问「浏览器自动化能否像 zcode 一样用侧边栏内置浏览器」。结论=①bsk 形态=独立 Agent Window（真实 Chrome/Edge 扩展窗口+CDP），不在 DSH 页面内；优点=真实登录态、不受 X-Frame-Options/iframe 拒嵌限制、可完整点击/表单/`console`/`network`；②仓库 dsh-better-sidebar 内置「🌐 内嵌浏览器」tab（src/client/BrowserView.tsx，沙箱 iframe+地址栏/多开/后退前进刷新），但**仅用户手动浏览，无 agent 控制工具**（src/tools.ts 只注册 terminal_* 等），且沙箱无登录态/第三方 cookie 受限/拒嵌站点（如 arxiv）只显示原因面板；③当前 web profile **未装** better-sidebar（已装 dsh-essentials/dsh-plugin-wallpaper-engine-mac/dsh-profile-web/dsh-ui-aqua/dsh-work），侧边栏现无内嵌浏览器；④`bsk console --session` 可读缓冲 console/log/exception（`--since` 游标/`--limit`/`--include-stack`），查页面报错比 snapshot+evaluate 更直接（是上条「纯文本模型验证 GUI」笔记的补充手段）。可复现?是（bsk --help / README / grep src 可复现；未改仓库代码）。
- **纯文本模型下 bsk 验证 DSH GUI 的替代路径（2026-08-19，浏览器验证）**：问题=用户报告打开 GUI 报错、zcode 修好后要「操作浏览器直接检查」，当前模型 deepseek-v4-flash 不支持读图，`bsk screenshot` + `read_image` 直接失败（model does not declare image input）。原因=Agent Window 复用用户真实 Chrome（登录态/存储共享），navigate 127.0.0.1:3080 后页面就是当前活跃会话（标题=会话名，属正常预期非异常）；视觉确认不可用时不代表无法验证。解法=用 `bsk snapshot`（aria 树，无错误文本/全部区域渲染即大体健康）+ `bsk evaluate` 做程序化 DOM 断言：`window.__DSH_BOOT__` 存在（只有 dsh web 注入，boot 成功标志）、页面文本无「启动失败/Error/崩溃」、侧边栏与输入框可见、`[role=alert]`/alert 横幅数量=0；全部通过即可下结论，无需 get-html/screenshot。注意=bsk 检查属「只读查询」范畴，快照+一次 evaluate 即止，勿堆叠探索步骤；查完必须 `bsk session stop <id>`（含错误路径）。可复现?是（会话中 bsk snapshot+evaluate 可复现；未改仓库代码）。
- **BrowserSkill (Tencent) 第三方审计：唯一不可替代价值=复用用户真实 Chrome 登录态，但 DSH 插件路径 11 工具超标违反 Pi 红线，只收纯 skill 路径（2026-08-19，审计+收编）**：问题=评估 https://github.com/Tencent/BrowserSkill 是否符合本仓库 Pi 理念。**架构**=Rust CLI (bsk) + 后台 daemon + WebSocket + Chrome 扩展（Agent Window 隔离）；DSH 插件注入 11 个 browser_* 工具（session_start/stop/list, navigate, click, fill, press, screenshot, emulate, snapshot, observe）。**Pi 违规**：①工具数 11 > 10 红线（必须拆分）；②核心插件 host ≤2 严重超标；③auto-update 默认开启（类似后台 bash）。**好的设计**：lazyTools 渐进式披露（skill 触发后才注册工具）、ctx.effect 完整清理、零记忆系统、遵循 DSH 插件规范。**决定性发现**=BrowserSkill 的**非 DSH 路径**（纯 skill + bash 调 bsk CLI）完全 Pi 友好——SKILL.md 写得极好（完整 workflow/sandbox rules/observation priority），Agent 读完就会用。**解法=只收 SKILL.md 作为纯技能包**（external/browser-skill/），不收 DSH 插件；scripts/install.sh --scenario browser 复制到 ~/.agents/skills/；THIRD-PARTY.md 登记维护策略；Agent 通过 /browser-skill → bash bsk CLI，零工具注入零 token 开销。可复现?否（纯审计+收编；SKILL.md 来自上游 skill/SKILL.md）。

- **dsh-loop 第三方审计：契约全过 + 工程质量高，但与官方 dsh-schedule/goal 重叠，严格 Pi 下倾向不收编（2026-08-19，审计）**：问题=找 GitHub 上的「dsh-loop」插件并对照本仓库契约与 Pi 理念。**名称去歧义**：npm `dsh-loop`（Ephemeral-AI-Lab/dsh-plugins 的 loop 目录，「Session-scoped recurring alarms」：3 工具 loop_create/list/delete + /loop 命令 + Loop dock，durable 会话事件 + zod 依赖，交付走 Agent.send+heartbeat）与 GitHub **vlln/dsh-loop**（精确同名仓库，0 runtime 依赖：单 `loop` 工具 4 动作 start/stop/status/list + /loop 命令 + composer dock 活动状态条，进程内瞬态不持久化）。审计以 vlln 为主。**契约层（rc.7 逐项 Inspect + npm 产物验证）**：inject [agents,commands,tools,timer,webServer] 全为真实服务；`Agent.followup(message)` 带显式 `source:{kind:'plugin'}`（符合 dsh-tool-goal 权威注记：非人类生产者必须自带 source、不得继承人类权威）；`agent/status`(idle⇄running)/`agent/disposed` 真实；`conversation.input.dock` list 槽注册(id/order/locale) 契约吻合；`webServer.register` 官方扩展点、0 patch、MIT、无生命周期脚本、构建产物入库——供应链纪律优秀。**决定性发现=harness 已内置官方 `dsh-schedule`**（schedule_create/list/delete，会话事件日志持久化，`every_seconds` 下限 5 分钟、低于报 frequency_too_high）+ `dsh-tool-goal`（goal 轮次即 followup 机制）——dsh-loop 真正多出的只有 秒级间隔 + 模型自调节 loop 工具 + dock 状态条。**Pi 对照**：⚑ 复杂系统是负债/无调度层=定时自循环正属「调度层/后台自动化」，且 `while+sleep+dsh chat`(tmux) 可近似；⚑ Context 最贵=10-60s 秒级唤醒每轮全 turn 烧 token + 会话无界增长；⚑ 工具数=1 主机工具(4 动作) 合规 ≤3、客户端 1 槽合规。**结论=技术契约全过、工程质量高，但核心能力与官方能力重叠 + 与「不内置重功能/无调度层/Context 最贵」冲突，严格 Pi 下不建议引入；若收编只宜独立 opt-in bundle**，且需两处改造：①webServer 硬 inject 改 `ctx.get('webServer')` 可选（CLI-only profile 下当前会挂起不加载）；②建议加最短间隔下限防秒级烧 token；状态停用走自定义 HTTP POST 路由（在官方 RPC/projection 惯例之外，本地场景低风险）。可复现?否（纯审计未改代码；验证=GitHub API + npm registry + git clone 源码 + Inspect 服务/事件/槽 + npm dsh-agent rc.7 类型产物 grep `Agent.followup` + dsh-schedule README）。

- **dsh-better-markdown 第三方评审：Pi 合规但依赖重量无解 + 与 DSH 自带渲染器功能重叠，决定不收编（2026-08-19，审计）**：问题=评审 npm 包 zerob13/dsh-better-markdown（client-only bundle，markstream-react 流式 Markdown 渲染，MIT）是否符合本仓库契约与 Pi 理念。契约层=合规：host 半区仅空 apply（0 工具/0 token）、`ctx.slots.inject('conversation.chat.node')` + `register({key:'assistant-step', priority:-100})` slot shadowing（官方扩展点，priority 0 官方 renderer 留作 fallback）、`ctx.effect()` 包 setCustomComponents + 返回 disposer 全可逆、inject:['slots'] 服务名正确、仅读叶子字段、htmlPolicy=escape + 协议白名单安全边界明确。**但依赖重量 7.4MB（gzip 1.59MB，7 runtime deps：markstream-react/mermaid/shiki/katex/stream-markdown/@shikijs/langs/themes）无可行解法**：mermaid(~2.5MB)+katex(~800KB) 是 markstream-react 的**内部静态依赖**，插件源码里根本没有 `import mermaid`（在渲染器包内部 import 打包），插件层动态 import 切不到——要减只能 fork 上游渲染器，维护成本爆炸违反「复杂系统是负债」。**决定性发现=DSH 自带渲染器已覆盖 90% 功能**：dsh-client-ui-primitives 的 MarkdownText 本身就有增量流式解析（IncrementalMarkdownParser，冻结完成 block 只重解析尾部）、Shiki 代码高亮（纯 JS regex 引擎 + 语法 allowlist 懒加载）、KaTeX 数学、完整 GFM（表格/任务/脚注/引用）、同样协议白名单安全策略——better-markdown 真正多出来的只有 Mermaid 图渲染 + 流式期间代码高亮。解法=**不收编**（用户确认「多余不要了」），依赖重量评估须区分「自引入的不必要依赖」与「上游包功能必需的依赖」，后者不构成改造理由。可复现?否（纯审计未改代码；npm pack 解包 + git clone 源码 + Inspect 查 slot 契约）。

- **pilot-harness (op7418/pilot-harness) 第三方审计：完整 DSH 分叉非插件，4 独立插件 Pi 合规（2026-08-19，审计）**：问题=审计 https://github.com/op7418/pilot-harness 是否符合本仓库契约与 Pi 理念。本质=不是单一插件，是**完整 DSH 分叉**（160+ 包，vendor cordis/cosmokit/schemastery 等 9 核心库）+ Electron 桌面壳 + 4 可独立安装插件（codepilot-theme/ui-worktree/ui-schedule-summary/session-log-export）。4 插件 Pi 合规（零 LLM 工具/零 token/inject 全声明/ctx.effect 全包裹/loopback RPC/无 MCP 记忆子代理）；整体违反「核心最小化」与「复杂系统是负债」。另：复用 `@deepseek-ai/` scope（供应链混淆）、桌面端禁 llm-deepseek 换 pi-ai（行为差异）、session-log-export client 一处 ctx.on() 未包 ctx.effect()。解法=**本仓库不应收编整体**，可借鉴插件设计模式但 scope 冲突需解决。可复现?否（纯审计未改代码）。

- **dsh-plugin-wallpaper-engine 第三方评审：Pi 典范但 CSS 脆弱 + inject/注释矛盾（2026-08-19，评审）**：问题=评审 elysia395/dsh-wallpaper-engine（Wallpaper Engine 壁纸背景 bundle，MIT）是否符合本仓库契约与 Pi 理念。原因=整体优秀（零 token 开销/纯 insert patch/副作用可逆/零外部依赖），但有三处偏差：① client.css 用 33 处 !important + 属性子串选择器（`[class*="_bubble"]`/`[class*="_panel"]`/`[class*="_pane"]`）强耦合 DSH 壳与 dsh-better-sidebar 内部类名哈希，对方一改即静默失效（注释自己承认）；② cordis.patch.yml 注释说「webServer is optional so this bundle also loads in the headless/TUI profile without failing」，但代码实际是 `inject: ['webServer']`（硬依赖）——headless 根本不加载此插件，apply() 内的 defensive check 是死代码；③ `lib/types/index.d.ts` 注释同样把硬 inject 描述为 optional，与代码矛盾。解法=①收编后需评估是否解耦 CSS（与 dsh-ui-aqua 也可能效果冲突）；②若真想做 headless no-op 应改 `ctx.get('webServer')`；③类型注释应与代码对齐。另：Host↔Client 走同源 HTTP（webServer.register + fetch）而非 host.call/harness.handle——视频流媒体的 Range 请求本质无法走 JSON RPC，属合理偏离，建议 AGENTS.md 补充「媒体流场景除外」。可复现?是（硬 inject 时 headless profile 不加载；CSS 子串选择器在 DSH 壳 class 名变更后失效）。

- **NOTEWORTHY: Pi 哲学第三方评审 checklist 沉淀**：本次评审形成可复用 checklist——零 token 开销（无 tool/prompt）/ insert-only patch / 副作用可逆（disposer + ctx.effect）/ 依赖纪律（零 runtime dep + Node 内置构建）/ 安全（token 化路径不外暴露 / 同源）/ 文档（双语 README + 限制披露）。核心 Pi 评分：Context 成本=满分（零注入）；极简=满分；用户决策=满分（4 滑块 + 轮播列表全权）。后续收编评审可直接对照。

- **essentials 拆分为 3 个 bundle（2026-08-18，重构）**：按 Pi 哲学「复杂系统是负债」将 dsh-essentials 拆为 3 个独立 bundle：① dsh-visualize（visualize + vision-bridge，2 个 LLM 工具）；② dsh-ui-tweaks（5 个 UI 开关：plugin-inventory/auto-hide/immersive/keyboard-shortcuts/retry-settings，0 工具）；③ dsh-essentials（保留 model-selector/paste-input/at-file + preset，核心输入层）。结果：essentials 从 10 个子模块→3 个，inject 从 18→6；用户可不装 ui-tweaks（省 context）或 visualize（不需画图）。dsh-mode-boost 同步删除（源码+配置+profile）。坑=①拆 client.js 时需按行号精确提取 sub_* 函数，先删高区间避免行号漂移；②cordis.patch.yml inject 必须与 lib/index.js 同步裁剪，否则运行时缺服务；③retry-settings 用 ctx.webServer 注册路由，拆出后 essentials 仍需保留 webServer（paste-input 也在用）。

- **合并 origin/main + 清除 mode-boost + Pi 契约入 AGENTS + 插件审计（2026-08-18，合并/清理）**：远程（Windows）大规模重构（P0 裁剪 mode-boost/router-spec、UTF-8 修复、pi-agent 哲学入 AGENTS）与本地（macOS）独立包拆分（memory/better-sidebar/market/usage/notify 拆为独立 bundle）严重分歧（410 文件、本地 16 提交/远程 20 提交）。冲突解决=逐文件与用户确认：AGENTS 取远程精简结构+本地独立包清单、NOTES 取远程精简重组版、README 取本地独立包全列、THIRD-PARTY 取远程（mode-boost 标已删除）、mode-boost 代码全删（独立包+upstream 快照+modlens）。清理=①web profile cordis.patch.yml 移除 mode-boost 配置；②`dsh plugin remove @deepseek-ai/dsh-bridge-browser`（浏览器自动化=复杂系统负债）；③`dsh plugin remove @dsh-external/dsh-mode-boost`。Pi 契约约束写入 AGENTS（代码即真相/Bash 足够用/复杂系统是负债/Context 最贵/核心最小化/不内置重功能/用户决定）。审计发现 web profile 135 个插件中官方基础工具（bash/subagent/plan-mode/workflow 等）违反 Pi 哲学但不可移除（官方铁律）；第三方 web-search-deepseek/code-runtime 同为官方插件不动。可复现?是（merge commit 9a7a463 + cleanup commit 3aadc9a）。

- **dsh-client-ui-aqua Windows 上无动态/粒子效果：流体不跟手 + reduced-motion 静态帧（2026-08-18，修复）**：问题=用户在 Mac 上装毛玻璃插件有动态和粒子效果，Windows 上没有。原因=两层叠加：①`fluid-shader.ts` 把 deepseek.com 官网「触摸设备和 Windows 不喂鼠标」策略照搬进插件（`if (!coarse && !windows)`），Windows 上流体背景永不跟随光标（Mac 鼠标一划水面起波纹，Windows 没有）；②Windows「设置 → 辅助功能 → 视觉效果 → 动画效果」关闭时 Chromium 报 `prefers-reduced-motion: reduce`，粒子鲸鱼（whale.ts:88/321）/流体（fluid-shader.ts:474）/网状交互（mesh.ts:203）/小鱼（aqua.module.css:941）全部按设计降级为静态帧——Mac 的 Reduce motion 默认关闭所以效果齐全。解法=①去掉 Windows 分支改 `if (!coarse)`（src 与 lib/client.js 同步改——本仓库不可重建 aqua，只能直接改构建产物），桌面指针全平台喂鼠标；②reduced-motion 静态帧是**可访问性设计，保留**，README 写明开关位置让用户自查。坑=①改 UTF-8+CRLF 文件必须 Node readFileSync/writeFileSync（PowerShell Set-Content 会 GBK 破坏中文）；②改第三方插件构建产物必须同步改 src 并在 THIRD-PARTY 记本地修改点，升级 pull 后 lib/client.js 被上游产物覆盖要复查。验证=`node --check lib/client.js` 过 + grep 无 `userAgent*Windows` 残留。可复现?是（Windows 上 `prefers-reduced-motion: reduce` 时全部静态、鼠标不动流体不扰均可复现）。

- **dsh-desktop-shell 从 web profile 卸载（2026-08-18，落地）**：用户要求把桌面壳从 web profile 卸载。问题=卸载前检查发现 `~/.dsh/profiles/web/package.json`（dependencies + dsh.profile.bundles）、`cordis.patch.yml`、`cordis.yml`、`pnpm-lock.yaml`、`.modules.yaml` 已全部无 `dsh-desktop-shell` 引用（config 侧 17:00:03 已被清），但 `node_modules\dsh-desktop-shell` junction 残留、且**运行中的 harness（PID 24232，16:58:50 boot）仍加载着 desktop-runner 行——桌面窗口 DeepSeekHarness.exe（PID 30744）还开着**。原因=配置清理发生在 boot 之后，运行进程按 boot 时组合加载了该 bundle；pnpm remove 只在依赖仍声明时生效。解法=①README 官方命令 `dsh plugin --profile web remove dsh-desktop-shell` 报 `ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS`（包已不在 package.json，命令不可用，pnpm remove 不能清残留 link）；②改走 `cmd /c rmdir <junction>` 删残留 junction（安全，只删链接不进 `D:\workspace\deepseek-plugins\dsh-desktop-shell` 仓库目标）；③`dsh --profile web --dump-config` 确认无 desktop-runner 行、node_modules 顶层只剩 aqua/essentials/work；④运行进程需重启才真正卸载——用户选择自己稍后重启（桌面窗带 `--parent-pid` orphan guard，harness 停时自动关窗）。坑=「卸载」要分三层看：config/文件系统可安全完成，**运行中进程要重启才生效**，别在 GUI 会话里杀自己的 harness。可复现?是（config 已清但 junction 残留 + 运行进程加载旧组合可复现；rmdir 删 junction 不伤目标可复现）。
- **modlens「cannot get required service llm in inactive context」每次启动必现（2026-08-18，落地）**：问题=`dsh web` 启动时 `[modlens] vision provider discovery sweep failed: Error: cannot get required service "llm" in inactive context`（host 其余正常，Web UI 可用；但稳定启动后可能无人再触发拓扑通知 → 视觉 wrapper 一直没注册）。原因=Cordis 4 经 **fiber store** 解析注入服务（激活时快照 `store={..._store}`、卸载后 `store=undefined`；getter 走到 `prop in fiber.inject` 且 store 无值即抛「inactive context」）；modlens 初始 sweep 在 apply 里同步启动、内部 `await ctx.llm.listModels()`，当 essentials 组合 fiber 因某注入服务被重新 provide 而 **unload/reload** 时，旧 sweep 的异步续延再访问 `ctx.llm` → 抛错被 sweepOnce 捕获打日志。解法=① `registerVisionProvider` 开头在 apply 同步期 `const llm = ctx.llm` 捕获服务实例，sweep / registerAdapter / listModels / resolveModelInfo / stream / listProviders 共 8 处全部改用捕获引用（续延不再经 fiber store 解析，卸载后不抛）；② `pasteTakeoverVerdict` 的 `host.llm` 访问包 try/catch，重载窗口降级返回 false（保守否决）。验证=**node 22（`D:\Program\nvm\v22.22.3\node.exe`，默认 shell 的 node 是 v14.17.6 跑不动 cordis 4 的 `??=`）写 cordis 最小复现**：提供 llm 服务 + inject['llm'] 插件在 apply 内启动异步 sweep + 中途 `registry.delete(plugin)` dispose fiber → 续延访问 ctx.llm 报同款错误、捕获后消除，根因实锤。坑=① Edit 工具参数写反（old/new 对调）把 `llm.registerAdapter` 替换成 `ctx.ctx.llm.registerAdapter`，grep 复查才发现——**批量/机械替换后必须 grep 验证**；② 收编第三方插件时「无本地修改」会随升级漂移，modlens 现在有本地修复，THIRD-PARTY 维护状态与升级复查点已更新。可复现?是（cordis 4 + inject llm + apply 内异步续延 + 中途 dispose fiber）。

- **dsh-client-ui-aqua 收编改名后 bundle 注册 id 未同步 → client-modules「loaded without registering」（2026-08-18，落地）**：问题=harness 启动报 `failed to import loader entry (dsh-client-ui-aqua): client-modules: bundle /plugins/dsh-client-ui-aqua/client.js?rev=… loaded without registering "dsh-client-ui-aqua" via __ModuleLoader__.load`，Web UI 加载不了刚收编的 Aqua 主题。原因=harness 的 client-modules 按插件**包名**解析浏览器 bundle 的注册 id（`__ModuleLoader__.load` 的 id 必须 == package.json name）；收编时把包名从 `@deepseek-ai/dsh-client-ui-aqua` 去 scope 成 `dsh-client-ui-aqua`（package.json + patch name 都改了），但提交的构建产物 `lib/client.js` 是上游在 deepseek-harness monorepo 内构建的旧产物，注册 id 仍是 scope 名 → 加载器等 `dsh-client-ui-aqua` 永远等不到。解法=把 `lib/client.js`（10 处：注册 id、CSS `<style data-plugin>` tag、OVERRIDE_SOURCE）、`lib/invariant.js`（3 处：PACKAGE_NAME）、`src/client/theme-layer.ts`、`src/invariant.ts` 里全部 `@deepseek-ai/dsh-client-ui-aqua` 替换为 `dsh-client-ui-aqua`，同步修 README/README.zh 手动安装片段（patch `name:` 与 ln -s 目标）；`tsdown.config.ts` 改为自述性存根——**本仓库无法重建 aqua**（tsconfig extends/references 与 `../tsdown.client.ts` helper 只存在于上游 monorepo，见 build.ps1），只能上游构建后提交产物。坑=① 第三方插件改名后**构建产物里的身份字符串**不会跟着 package.json 变（bundle 注册 id / invariant 包名 / override source / CSS tag 全要 grep 复查）；② 此插件 host 半区是 no-op，host 侧一切正常、错误只出现在浏览器端，容易误判已修复；③ `lib/client.js.map` 保留原样（dev-only，本就含上游机器路径，手改 sourcemap 易错）。可复现?是（任何 client bundle 注册 id ≠ 包名的插件都会报同款错误）。

- **dsh-client-ui-aqua 第三方收编 + 直接从仓库安装（2026-08-18，落地）**：用户昨天在 Mac 装了个「毛玻璃」插件但没 push，要求找回来并作为第三方收编进本仓库、直接从仓库安装。问题=先后误判 dsh-neu-theme（轻拟物+磨砂玻璃，3★）与 dsh-ui-appearance（透明+模糊，7★）都被用户否定；经 ask_user_question 确认是 **WYH66666666/DSH-Transparent-UI-Plugin（267★，MIT）**，npm 包名 `dsh-client-ui-aqua`（Aqua 玻璃质感主题：可调模糊/磨砂/流体或壁纸背景，client-only bundle）。原因=用户记得的描述是「毛玻璃/磨砂玻璃片」且名字带 dsh；前两个候选描述虽含 glass/blur 但不是用户装的那个。解法=`git subtree add --prefix=dsh-client-ui-aqua`（完整克隆后本地 subtree add，浅克隆被拒 shallow roots），lib/ 已随上游入库无需构建；**坑=上游 package.json name 是 `@deepseek-ai/dsh-client-ui-aqua` 但 npm 实际发布与 cordis.patch.yml name 都是无 scope 的 `dsh-client-ui-aqua`**，包名一致性检查要求 patch name==包名，收编时用 Node 改 package.json name 去 scope（本地修改已记 THIRD-PARTY）；`node scripts/check-{package,inject}-consistency.mjs` 全过；README 表格/THIRD-PARTY/AGENTS 已登记。可复现?是（git subtree add 浅克隆报错、包名不一致导致 check 失败均可复现）。

- **去芜存菁 P0 落地：移除 mode-boost + router-spec，压缩 memory 指令（2026-08-18，落地）**：按 AGENTS.md 设计理念（pi-agent 哲学）清理。问题=4 个路由机制重叠（mode-boost/router-standard/router-spec/liangshen），mode-boost 自动应用路由违反「用户决定需要什么」原则；memory:auto 指令 ~25 行常驻每个会话。原因=历史上逐步收编多个第三方路由预设未去重；memory 为全局 ctx.inject 注入。解法=①删除 lib/mode-boost/（自动替换 persona + 注入 guidance + 过滤工具目录，-478 行）并清理 README/AGENTS/THIRD-PARTY/market client 引用；②删除 preset/router-spec/（与 router-standard 仅差 
outerMode: spec 配置值，router-standard 已支持，-4 文件）；③memory:auto 指令 25 行压缩为 6 行（保留全部关键语义：write_memory 两轨道/何时写/summary 最重要），
ode --check + inject/package 一致性全过。**大坑=PowerShell Set-Content 处理含中文的 UTF-8 文件会损坏编码**（GBK 解释 UTF-8 → U+FFFD mojibake），此前多轮用 Get-Content -Raw + Set-Content 改文件，已损坏 12 个文件（README/dsh-work package.json/registry-snapshot/router-core.mjs/upstream docs 等），且已 push 到 GitHub；本次用 git show 逐文件找最后正常 commit，git checkout <good> -- <file> 恢复后用 **Node 
eadFileSync(...,'utf8') + writeFileSync(...,'utf8') 重放意图修改**，全部 893 个 tracked 文本文件验证无 U+FFFD。另：better-sidebar 的 8 个 terminal 工具**已有** gentTerminalTools 设置门控（默认 false），非用户启用不注册，P1-1 无需改；at-file 是纯构建产物（无源码/tsconfig）内联 zod，外部化需上游源码+重建，且不影响 token 开销，暂缓；usage-plugin 子进程走 DSH 官方 subprocess 服务（含 sandboxPolicy）+ 不在 LLM 热路径，非裸 child_process 反模式，重构风险>收益，暂缓。可复现?是（git log 逐版本校验 U+FFFD 可定位损坏 commit；mode-boost/router-spec 删除后 
ode scripts/check-* 全过）。
- **dsh-desktop-shell Windows 托盘图标仍模糊（2026-08-17，修复）**：用户反馈 32px 单色 `>_` 托盘图标在缩放/高 DPI 下仍“分辨率低、看不清”。解法=把 `tauri/src-tauri/icons/tray-black.png` / `tray-white.png` 从 32px 重绘为 256px（System.Drawing 抗锯齿 + 圆头笔触，按原 32px 设计 8 倍缩放：5px 笔触→40px、3px 留白→24px、`>` 折线 (40,40)→(120,128)→(40,216)、下划线 (112,208)→(224,208)），`cargo build --release` 重建并覆盖 `native/build/DeepSeekHarness.exe`；运行中的旧 exe 已改名 `.old`，需重启桌面壳生效。验证=256px PNG 尺寸/Alpha 正常，重新编译成功。可复现?是（旧 32px exe 放大糊；新 256px 源重编译后清晰）。
- **无损省 token 配置并入 dsh-essentials（2026-08-17，落地）**：用户要求「不影响生成质量和效果」的上下文压缩，且不改 dsh 源码、不动 AGENTS.md、不动 compaction。问题=上下文大头除 skill catalog/AGENTS.md 外还有工具结果内联输出，常驻浪费 token；原因=shell/read/spill 的默认内联上限偏高；解法=纯 `cordis.patch.yml` 覆盖 dsh-base 行（pwsh-sandbox/bash-sandbox `maxOutputBytes:16384`+spill、tool-fs `readLimit:500/readMaxBytes:16384`、spill-policy `maxInlineBytes:16384`），完整内容仍可通过 spill 文件/分页读取按需取回，因此无损；同时 KV cache 靠保持前缀稳定受益。坑=patch 会替换目标行整个 config，覆盖时须把该行需要的字段写全；用户后续可再覆盖（最后写入者生效）。可复现?是（`dsh --profile web --dump-config` 可见覆盖行；去掉 patch 后恢复默认）。

- **dsh-desktop-shell Windows 自绘一体式标题栏（2026-08-17，落地）**：用户要求去掉 Windows 原生标题栏，改为与页面融为一体的自绘边框（对齐 macOS unified 观感）。经 grilling 收敛：统一无边框（Win10/11 都 decorations:false）+ 壳层注入 CSS/JS + 36px 全宽浅色条（#F9FAFB 与页面同色、内容下移）+ 左侧 "DeepSeek Harness" 文字 + 右侧 DSH 主题线性按钮（hover 高亮/关闭红）+ 双击最大化 + 拖拽 + 右键自绘菜单 + 深色跟随 + 自动隐藏关闭。**技术要点**：①窗口改由 main.rs 的 WebviewWindowBuilder 构建（config 的 windows 不支持 initializationScript，须清空 config 窗口避免重复声明），`initialization_script(include_str!("../titlebar-init.js"))` 注入，Tauri 2 的 init 脚本经 AddScriptToExecuteOnDocumentCreated 对外部 http 页面**每次加载都生效**；②外部页面调窗口 API 的授权=**ACL capability**（`capabilities/default.json`：windows:["main"] + permissions core:default + core:window:allow-{minimize,maximize,toggle-maximize,unmaximize,close,start-dragging,is-maximized} + remote.urls ["http://127.0.0.1:*","http://localhost:*"]）；③**dangerousRemoteDomainIpcAccess 已从 tauri-utils 现行 config.rs（v2）移除**（只剩旧 config_v1 有），用了会报 unknown field；④`titleBarStyle: Overlay` 在 Windows 是**空操作**（纯 macOS cfg），Win11 无 Tauri 侧 overlay；⑤拖拽用 CSS `-webkit-app-region: drag`（WebView2 原生、免 IPC），按钮走 `window.__TAURI__.window`；⑥验证无边框**不能查 WS_CAPTION**——tao 无边框保留 WS_CAPTION 位但 WM_NCCALCSIZE 返回 0 清零非客户区（假阳性），该位存在反而让 app-region drag 生效。坑=git mv 后 cargo clean 重建（target 里旧路径）；include_image!/include_str! 路径基准不同（crate 根 vs 源文件）。可复现?是（旧 exe 原生栏；新 exe 无边框+自绘条）。

- **Windows 托盘图标模糊优化（2026-08-17，修复）**：用户反馈 dsh-desktop-shell 的 Windows 托盘图标不如 macOS 清楚。问题=Windows 托盘用的是 `app.default_window_icon()`（1024px 鱼图标被系统硬缩到 16px 物理尺寸 → 糊）；macOS 用的是 SF Symbol `chevron.left.forwardslash.chevron.right`（终端提示符 `>_`）且 `isTemplate=true` 单色自适应。解法=①用 System.Drawing 画 32px 单色 `>_` 图标（4px 圆头笔触、3px 留白），新增 `icons/tray-black.png` / `tray-white.png`；②main.rs 新增 `tray_icon()`：Windows 启动时 `reg query AppsUseLightTheme` 读任务栏深浅色，浅色用黑、深色用白（等效 macOS template 自适应；Windows 托盘不会自动反色），`tauri::include_image!` 编译期嵌入；③`TrayIconBuilder.icon(tray_icon())` 替换 default_window_icon。坑=**git mv 会把整个目录（含 gitignore 的 target/）搬走，增量构建因残留产物里烤入旧绝对路径而报 `failed to read plugin permissions ... 系统找不到指定的路径`——改名后必须 `cargo clean` 全量重建**。验证=32px 图标几何分析（居中/21% 覆盖/不裁切）；构建 + 启动正常。可复现?是（旧 exe 托盘糊；换图标后清晰）。

- **dsh-mac-desktop 改名 dsh-desktop-shell（2026-08-17，重构/落地）**：桌面壳已 macOS（Swift WKWebView）+ Windows（Tauri WebView2）双平台，原名名不副实。问题=包名/目录/引用散落全仓库；解法=①`git mv dsh-mac-desktop dsh-desktop-shell`；②package.json name + cordis.patch.yml `name:`（loader 按包名解析）+ index.js/Cargo.toml 描述 + 双 README 标题/安装命令/组合图 + README.i18n.yaml 哈希重录；③全仓库引用：install.sh bundles_for、install-plugins.mjs 注释、benchmark.mjs pkgDirs、根 README 表格/列表、docs/optimization.md、.github/workflows/build-windows-shell.yml 的 paths/workspaces（**必须同步，否则 tauri 改动不再触发 CI**）；④dsh-essentials 两个 client.js 的 MARKET_ITEMS（id/name/install 改指向 github path:/dsh-desktop-shell；locale descKey 与文案不变，已是跨平台表述）；⑤profile 重装：remove dsh-mac-desktop + add dsh-desktop-shell；⑥pnpm install 重建 lockfile。坑=市场 curated 条目**只存在于构建产物 client.js**（无独立源码，是市场合并时手工加进合并产物的，需直接改 lib 两处）；git mv 后按新路径重读文件（fs-observation）。验证=dump-config 见 dsh-desktop-shell + boot/desktop-runner 正常。可复现?是。

- **dsh-mac-desktop Windows 桌面窗口不弹出（2026-08-17，修复）**：装到 web profile 后 desktop-runner 日志打印 opening 但窗口不出现。问题=exe 启动 ~1s 即 exit(0)；原因=**两层 bug 叠加**：①`lifecycle.rs` 的 `windows_dupe_count` 用 PowerShell 扫描去重，扫描脚本自身命令行含 'DeepSeekHarness' 和 '--parent-pid <n>' 匹配串，powershell 扫描进程匹配到**自己** → count≥1 → 每次 plugin 模式启动必现；②真正杀手=**`watch_parent` 的 `OpenProcess` 只带 `PROCESS_QUERY_LIMITED_INFORMATION` 没带 `SYNCHRONIZE`**，而 `WaitForSingleObject` 要求句柄有 SYNCHRONIZE 权限，否则立刻返回 `WAIT_FAILED` → watcher 线程 exit(0)（P/Invoke 实测确认：OpenProcess 成功但 Wait 直接 0xFFFFFFFF）；macOS dedupe 是 no-op、Swift 壳用 kqueue 所以从没暴露。解法=①去重扫描改**按进程名匹配**（`$_.Name -eq 'DeepSeekHarness.exe'`）+ flag 用 `'--parent' + '-pid <n>'` 拼接 + 排除 $PID；②`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE)`（windows-sys 里是 `PROCESS_SYNCHRONIZE` 常量）；`cargo build --release` 重建覆盖 `native/build/DeepSeekHarness.exe`（与 build-windows-shell.yml CI 同流程）。验证=带 --parent-pid 启动窗口 1.5s 弹出、15s 存活；standalone 对照正常。可复现?是（旧 exe 必现；缺 SYNCHRONIZE 时 WaitForSingleObject 必 WAIT_FAILED）。

- **dsh-mac-desktop Windows 安装验证（2026-08-17，Windows/安装）**：`dsh plugin --profile web add` 本地目录安装成功（无需构建，native/build/DeepSeekHarness.exe ~10MB 已随仓库提交——早前 NOTES 的「Windows exe 待 CI」已过时），`dsh --profile web --dump-config` 见 `id: desktop-runner / name: dsh-mac-desktop`（inject webServer，enabled 默认 true）；重启 dsh 后自动弹 Tauri 原生窗口，进程随 dsh 退出自清理。无新增坑。可复现?是（add + dump-config）。

- **Windows 安装验证（2026-08-17，Windows/移植/修复）**：在 Windows + DSH rc.6（DSH_HOME=C:\Users\admin\.dsh，npm 版 dsh）上完整走通本仓库安装：`dsh plugin --profile web add` 本地目录装 dsh-essentials + dsh-work，仓库根 `pnpm install`，79 skills（dev 37/writing 40/design 2）复制到 ~/.agents/skills、3 presets 复制到 ~/.dsh/.agent-presets；重启后 3080 上 /dsh-market/api/plugins 与 /plugins/dsh-work/state 均 HTTP 200。问题=①link 包依赖走真实路径：bundle 的 ESM import 从 bundle 真实目录向上找 node_modules，profile 的 node_modules 不参与，本地 `dsh plugin add` 后 boot 报 `Cannot find package '@deepseek-ai/dsh-compaction-tool-result-pruner' imported from dsh-essentials/lib/index.js`；②`dsh-core: workspace:*` 依赖在 profile 工作区外被 pnpm 静默跳过（不报错也不装），运行时才 ERR_MODULE_NOT_FOUND；③pnpm 11 默认拦截 node-pty 构建脚本（`ERR_PNPM_IGNORED_BUILDS`，install 恒 exit 1），且仓库 pnpm-workspace.yaml 有 pnpm 交互残留的非法占位 `allowBuilds: node-pty: set this to true or false`；④Windows 上 `node scripts/install-plugins.mjs` 报「找不到命令 dsh」——spawnSync(`dsh`,{shell:false}) 无法执行 .ps1 shim；⑤nvm 下 `D:\Program\nodejs` 符号链接切到 v14.17.6 时 dsh shim 会从 PATH 消失（DSH 装在 v22.22.3）。解法=①/②仓库根 `pnpm install` 把 dsh-core/schemastery/@deepseek-ai/* 装进仓库自身 node_modules；③pnpm-workspace.yaml 改 `onlyBuiltDependencies: [node-pty]`（pnpm 11 语法）并删占位，`pnpm rebuild node-pty` 成功（prebuilds 就位），install 干净 exit 0；④直接在 PowerShell 跑 `dsh plugin --profile web add <目录>`（pwsh 可解析 dsh.ps1），install.sh 需 Git Bash；⑤重启 dsh 前 `nvm use 22.22.3`。可复现?是（去掉仓库 node_modules / 还原 workspace yaml / 切 nvm 版本均可复现）。

- **Phase 3：UI 回归 + 工具懒加载 + CI 阈值 + npm 准备（2026-08-17，落地）**：用户确认继续后执行。①深度 UI 回归脚本升级为点击 Settings/Market/Side card + 截图 + 抓错，当前 3080 无错误；②rc.6 无原生 tool demote，采用 vision-router 同款 bootstrap：dsh-work 新增 `agent_teams_activate`，首次执行才注册 9 个 `agent_teams_*`，systemPrompt 加 step 0；同时压缩 dsh-work 工具描述；③dsh-core 最小接入：essentials 用 `mergeConfig` 兜底子配置，work 用 `dedupeBy` 生成 toolNames，dsh-core 补 `lib/index.d.ts` 类型；④benchmark.mjs 加 CI 阈值（clientKb/skills/tools 当前基线 +20%）；⑤6 个包（core/essentials/work/dev/writing/design）改 public publishConfig + repository/files，新增 `scripts/publish-packages.mjs --dry-run` 验证通过，未实际发布。坑=`defineTool` 的 output 必须带 `render`（TS2741）；dsh-core 纯 JS 被 TS import 需补 d.ts。可复现?是（build/verify/benchmark/publish dry-run 全过）。

- **web profile 真实回归 + 刷新报错排查（2026-08-17，回归/诊断）**：把 web profile 从旧 `@nanmicoder/dsh-agent-teams` 切到 `dsh-work`（remove 旧包 + add 本地 dsh-work），`dsh --profile web --dump-config` 见 `id: dsh-work`；`dsh --profile web --port 4099` boot 通过、HTTP 200；`/dsh-market/api/plugins`、`/sidebar/api`(405)、`/plugins/dsh-work/state`(200) 路由可达。用户反馈刷新报错，用 Playwright headless Chromium 加载 `127.0.0.1:3080` 无 console/pageerror。原因=未复现；最可能是浏览器缓存了合并过程中曾出现语法错误的旧 client.js（中间态 `sub_market` 多一层 `}` 曾导致 SyntaxError），或 WebKit 缓存。解法=硬刷新（Cmd/Ctrl+Shift+R）/ 桌面壳 Reload；若仍报错需提供控制台原文与宿主（浏览器 vs dsh-mac-desktop）。新增 `scripts/web-regression.mjs`（Playwright Chromium 抓 console/pageerror）与根 devDependency `playwright@1.62.1`。可复现?部分（headless Chromium 未复现；缓存假说可通过硬刷新验证）。

- **dsh web 启动补坑：schemastery/mode-boost/better-sidebar（2026-08-17，修复）**：移除 dshmarket 后 `dsh web` 启动报 `Cannot find package 'schemastery' imported from dsh-essentials/lib/better-sidebar/lib/index.js` 和 `Cannot find package '@dsh-external/dsh-mode-boost' imported from profile`。原因=①dsh-essentials 内嵌 better-sidebar 的 host 代码直接 `import z from 'schemastery'`（unscoped），但 essentials 根 package.json 只声明了 scoped `@deepseek-ai/schemastery`；link 包解析走真实路径，不会用 profile node_modules 里 dsh-better-sidebar 带来的 schemastery。②profile 里 mode-boost 的 link 指向已不存在的 `workspace/deepseek-plugins/dsh-mode-boost`，实际包在 `dsh-essentials/upstream/dsh-mode-boost`。③profile 还保留独立 `dsh-better-sidebar`，与 essentials 内置 better-sidebar 重复。解法=①essentials package.json 补 `"schemastery": "^3.18.0"`（unscoped），workspace `pnpm install` 后 root node_modules 有 schemastery；②profile package.json 的 mode-boost link 改为 `link:.../dsh-essentials/upstream/dsh-mode-boost`；③profile 移除 `dsh-better-sidebar` bundle/dependency（已合并进 essentials）；④`dsh plugin --profile web install` 重建。验证=`dsh --profile web --port 4099` 输出 `dsh web: http://127.0.0.1:4099` 后 kill。可复现?是（去掉 schemastery 依赖 / 保留错误 mode-boost link 会复现；修复后 boot 通过）。

- **dshmarket 独立包从 web profile 移除（2026-08-16，修复）**：用户报 `Failed to load plugins dsh-essentials ... locale namespace "dsh-market" already has locale "zh"`。问题=web profile 同时装 `dsh-essentials`（已合并 lib/market 并注册 `dsh-market` locale NS）和独立 npm `dshmarket`（同样注册 `dsh-market` zh/en），client 加载时第二次 register 同 NS 同 locale 直接 throw。原因=合并进 essentials 后旧独立 dshmarket 未从 profile 卸载，`dsh.profile.bundles` 与 dependencies 仍保留。解法=从 `~/.dsh/profiles/web/package.json` 删除 `dshmarket` bundle 行与 dependency，`dsh plugin --profile web install` 清理 node_modules/lock，`dsh --profile web --dump-config` 已无 dshmarket；市场功能由 dsh-essentials 内置 market 继续提供。可复现?是（再加回 `dshmarket` 依赖并 install 后重启 web 会复现同错误；移除后 dump-config 无 dshmarket）。

- **dsh-market / dsh-better-sidebar 合并进 essentials（2026-08-16，合并/落地）**：按 grilling 决策把两个已收编 bundle 真合并进 dsh-essentials 单 bundle。问题=client 合并必须保持单 factory 且不能破坏 1MB 级 client.js；原因=DSH boot graph 每包一入口，重复注册会 throw。解法=①写 `scripts/merge-market-client.mjs` / `scripts/merge-better-sidebar-client.mjs`：从 `factory: (require) => {` 提取 body，替换 `return module.exports;` 为 `return { inject, apply };`，并去掉原 factory 自身收尾 `}`（否则多一层括号 SyntaxError），包装成 `sub_*` 函数插入 client.js parts 数组；②host 在 `lib/index.js` import + apply，better-sidebar 补 `webRuntime` inject，package.json 补 `ws`/`node-pty` 依赖与 client peer；③移除 essentials 内置 plugin-inventory 市场 tab（`settings.plugins.tab id=market`），由 dsh-market 的 `settings.section market` 接管；④install.sh/install-plugins 移除嵌套 bundle 安装项。验证=node --check 双文件、package/inject 一致性、install dry-run、benchmark 全过。可复现?是（脚本幂等；去掉尾 `}` 后语法过；升级上游需重跑合并脚本）。

- **dsh-writing 收编 7 个写作技能项目（2026-08-16，收编/落地）**：用户确认把调研候选的 7 个项目全部收编进 dsh-writing。问题=要把多仓库的 SKILL.md 技能整理进一个场景包且不污染根目录；原因=直接 `cp -R "$d/" "$DST/"`（带尾斜杠）会把技能目录内容拍平进目标根，多个 SKILL.md 互相覆盖；解法=`cp -R "${d%/}" "$DST/$name"`（去掉尾斜杠）逐目录复制，`_shared` 作为无 SKILL.md 支持目录保留，LICENSE 统一收进 `dsh-writing/licenses/`；codex-claude-academic-skills 只收 `research-writing-skill`（office/scientific 子包体积大且非文章写作）。验证=verify-skills 39 个 SKILL.md 全过 + install.sh --scenario writing --dry-run 正常。可复现?是（带尾斜杠 cp 会拍平；去掉尾斜杠后正常）。

- **DSH 场景化仓库 Phase 2A（2026-08-16，重构/落地）**：按 grilling 决策执行 agent-teams→dsh-work 改名收编 + router/mode-boost 移入 essentials/upstream + benchmark/settings 脚本。问题=需要把第三方 bundle 改名成场景包且不破坏代码；原因=用户要「dsh-work 即 bundle 根」并接受脱钩第一方维护。解法=①`git mv dsh-agent-teams dsh-work` 时若目标目录仍存在会产生 `dsh-work/dsh-agent-teams/` 嵌套，必须先 `git rm -r dsh-work` 并清掉残留空目录，再 `git mv`；②全局替换 `@nanmicoder/dsh-agent-teams`/`dsh-agent-teams`→`dsh-work` 时排除 node_modules/pnpm-lock/*.map，随后 `pnpm --filter dsh-work build` 重新生成 lib 与 sourcemap；③`export const name='agent-teams'`、工具名 `agent_teams_*`、磁盘目录 `.agent-teams` 等协议标识保留不改成 dsh-work，避免破坏既有数据；④新增 `scripts/benchmark.mjs`（du -sk + 正则工具注册点估算）与 `scripts/apply-settings.mjs`（yaml 依赖 + 备份 + dry-run + 交互确认）；⑤`dsh-router-standard`/`dsh-mode-boost` 用 git mv 进 `dsh-essentials/upstream/`，README/THIRD-PARTY/AGENTS/docs 同步。可复现?是（git mv 嵌套坑、build 后 sourcemap、check 全过均可复现）。

- **DSH 场景化仓库重构 Phase 1（2026-08-16，重构/落地）**：用户要求把本地所有 DSH 自定义（自研/第三方插件、skill、预设）分门别类放进 GitHub 项目，做到可分发、可复用、一键/分场景安装，并做兼容性/性能/资源/可用性优化。问题=原仓库只有 5 个独立 bundle，没有场景包、纯技能包和统一安装编排；原因=本地自定义横跨 ~/.agents/skills、~/.dsh/.agent-presets、第三方 bundle、settings 路由，分散且无分发层。解法=经 grilling 收敛决策后落地 Phase 1：①新增 dsh-core（共享工具，含单测）与 dsh-dev（mattpocock/skills 全量 + archify）、dsh-writing（文章写作空壳）、dsh-design（gpt-image + frontend-design）、dsh-work（场景编排，agent-teams Phase 2 并入）；②dsh-market 物理 git mv 进 dsh-essentials/lib/market，dsh-better-sidebar 从 npm 包收编进 dsh-essentials/lib/better-sidebar，梁神模式 preset 收进 dsh-essentials/preset/liangshen；③scripts/install.sh 改为场景化（--scenario all|essentials|dev|writing|design|work|desktop|browser），纯技能包复制到 ~/.agents/skills，presets 幂等复制；install-plugins.mjs 改为只发现真 bundle（含嵌套 lib/market、lib/better-sidebar）；④新增 external/manifest.json + install-external.mjs（browser/dsh-tui 外部引导）、config/settings.example.yaml（脱敏完整路由目录）、docs/optimization.md、GitHub Actions ci.yml。坑=①macOS 自带 bash 3.2 不支持 declare -A 关联数组，install.sh 必须用 case 函数映射场景；②write/str_replace 工具要求先 read 才能覆盖已存在文件；③从本地 skills 复制会带入嵌套 .git（frontend-design-masterclass），必须 rm -rf 避免子模块污染；④dsh-core sanitizeSettings 初版用原样 secretKeys 对 lowercased key includes 导致 apiKey 脱不掉，需统一 toLowerCase；⑤install-plugins 自动发现会误把纯技能包当 bundle，需按 pkg.dsh/dshBundle/dshClient 过滤。可复现?是（git mv dsh-market→dsh-essentials/lib/market、复制 skills、跑 install.sh --dry-run/check 脚本均可复现；deep 合并留 Phase 2）。

- **DSH 本地盘点（2026-08-16，盘点/无新增经验）**：为 repo 重组做了只读盘点（skills、agent-presets、profiles、dsh-browser/browser-extension、deepseek-plugins/dsh-*、settings.yaml 结构），全部按用户要求不输出凭据/API key/token。问题→用户需要结构化清单；原因→本地 DSH 组件分散在 `~/.agents/skills`、`~/.dsh`、`~/workspace/deepseek-plugins`；解法→只读 frontmatter/package.json/配置文件结构，敏感值一律不读不打印，产出 Markdown 报告；可复现?是（对应路径与命令可复现，报告已归档在本次回复）。本次无新增经验。

- **dsh-mac-desktop 九次复审（2026-08-16，修复）**：再审发现 2 个问题。①Tauri 插件模式下 `config_dir` 从未初始化（空 PathBuf），设置窗口保存会往当前工作目录写 `settings.json` 且不生效；原因=setup 只在 standalone 分支设置 config_dir。解法=在 setup 开头统一 `app.path().app_config_dir()` 并写入 shared，插件模式的设置保存也落到 app config 目录。②“打开 DSH 终端”只做 nil 回退、不做存在性检查；profileDir 猜错或已删除时 `cd` 到不存在目录失败。解法=Swift/Tauri 都改为从 profileDir→dshHome→DSH_HOME/默认 home 中选**第一个真实存在的目录**。验证=`make-app.sh`/`cargo check`/`cargo test --lib`（8 过）/`node --check`/`git diff --check` 全过。可复现?是（读代码可复现：插件模式改设置会在 cwd 生成 settings.json；profileDir 不存在时终端 `cd` 报错）。

- **mattpocock/skills 35 个全部转 model-invocable（2026-08-16，用户决定）**：用户要求「原本 Claude Code 能用的在 DSH 里也能用」=让 20 个 `disable-model-invocation:true` 的技能也能被模型直接调用。执行=先审计全部 37 个 SKILL.md frontmatter 字段（只有 name/description/disable-model-invocation/argument-hint，无 DSH 会 reject 的 legacy key 如 disableModelInvocation 驼峰），再批量删除 20 个文件里的 `disable-model-invocation: true` 行（python re.subn 逐文件、保留其余内容），frontmatter 完整性复验 0 异常。结果=watcher 热刷新后 `<available_skills>` 从 19 增至 40（35 个 mattpocock 全进 + 原有 frontend-design-masterclass/gpt-image-2-style-library/archify/visualize），grill-me/handoff/implement/to-spec/to-tickets/wayfinder/teach/wait-what 等全部可按描述自动调用，不再需要 `/技能名` 斜杠。注意=这是对第三方技能的**本地修改**（改在 `~/.agents/skills/`，不在本仓库 git 内），后续 git pull 上游更新时这些文件会被覆盖/冲突，需重新套用；个别技能语义上偏用户主动触发（wait-what 打断重述/handoff 交接/teach 教学），改为 model-invocable 后模型按描述自行判断，观察期留意误触发。可复现?是（删字段后 catalog 热刷新全量出现可复现；还原=重新加回 `disable-model-invocation: true`）。

- **DSH 技能斜杠调用契约（2026-08-16，契约澄清）**：用户问「为什么没法斜杠 grill me」。问题=`/grill me` 带空格不触发任何技能。原因=DSH 的 user-invocable 技能斜杠触发规则是**空白边界内的 `/name` token 精确匹配 kebab-case 技能名**（dsh-tool-skill README：`A whitespace-bounded "/name" token anywhere in a claimed user message, naming a user-invocable skill in the workspace catalog, injects that skill's full <skill_content>`）；`disable-model-invocation:true` 只关 modelInvocable、userInvocable 默认仍 true（dsh-skill-filesystem `parseInvocationPolicy`：`modelInvocable: disableModelInvocation!==true` / `userInvocable: userInvocable!==false`），所以 `/grill-me` 是唯一斜杠入口；GUI 输入框的 `/` 技能菜单由官方 `dsh-client-ui-skill` client.js 注册（`inputTriggers.registerSource`，trigger "/"、order 2），候选过滤 `skill.name.startsWith(query)`、user-only 项标注「仅用户调用」，菜单选中插入 `/skill-name `。解法=斜杠必须 `/grill-me`（连字符无空格）；更顺的路径是直接说「grill me」——`grilling` 是 model-invocable（description 明确匹配 'grill' 触发词）会自动加载，而 `grill-me` 官方版是 7 行薄壳（内容=Call the Skill tool with "grilling"），两条路径最终都到 grilling。其余 20 个 user-only 技能（grill-with-docs/handoff/implement/to-spec/to-tickets/triage/wayfinder/teach/to-questionnaire/wait-what 等）同样 `/技能名` 规则。可复现?是（源码 grep parseInvocationPolicy + dsh-tool-skill README 可复现；GUI 未真机验证斜杠菜单）。

- **dsh-mac-desktop 八次复审（2026-08-16，修复）**：再审发现 3 个问题。①Swift standalone “打开 DSH 终端”不回退 `$DSH_HOME`，只落到 `~/.dsh`，与 index.js/Tauri 的 `$DSH_HOME` 优先行为不一致；②Tauri 设置窗口用 `WebviewUrl::App("tauri://localhost/settings.html")` 传了完整 URL，而 `WebviewUrl::App` 只要 path 部分（`settings.html`），运行时会打开错误地址；③Tauri `default_dsh_home` 对空白 `DSH_HOME` 未 trim，可能把纯空格当有效路径。解法=①Swift `openTerminal` 先取 trim 后非空的 `$DSH_HOME` 再回退 `~/.dsh`，`make-app.sh` 重建通过；②Tauri `open_settings_window` 改为 `WebviewUrl::App("settings.html".into())` 并删除 `SETTINGS_URL` 常量；③Tauri `default_dsh_home` 对 env `.trim()` 后再判空。验证=`make-app.sh`/`cargo check`/`cargo test --lib`（8 过）/`node --check`/`git diff --check` 全过。可复现?是（读代码可复现：Swift standalone 设 `DSH_HOME` 后托盘终端仍开 `~/.dsh`；Tauri 设置窗口 URL 构造错误；Windows 下 `DSH_HOME="   "` 会被当成路径）。

- **mattpocock/skills 全量安装到 ~/.agents/skills（2026-08-16，落地）**：用户确认要装整个 mattpocock/skills 项目（218.9k★，MIT，「Skills for Real Engineers」）。执行=浅克隆 → 枚举 `skills/**/SKILL.md` 共 **35 个**（engineering 19 / productivity 8 / in-progress 6 / misc 4；deprecated 目录只有 README 无技能）→ 检查 frontmatter 无重名、name 均合法（`[a-z0-9._-]`）→ 用 rsync 把每个 skill 目录**整体拍平**拷贝到 `~/.agents/skills/<skill-name>/`（保留 agents/、scripts/ 等支持文件，SKILL.md 里 `scripts/xxx.sh` 相对引用按 skill 目录解析，如 git-guardrails-claude-code/scripts/、diagnosing-bugs/scripts/hitl-loop.template.sh）。关键坑=**DSH skill-filesystem 只收根下两层**（`<root>/<name>/SKILL.md`，watch 过滤器 `segments.length===2 && segments[1]==='SKILL.md'`，discoverRoot readdir 一层），仓库里 `skills/productivity/grill-me/` 这种嵌套必须拍平，直接把 `skills/` 拷过去不会被发现；默认根=user-agents `~/.agents/skills`（还有 `~/.dsh/skills`、项目 `.dsh/skills`/`.agents/skills`、customSkillDirs、bundled）。验证=装完当前会话 skill catalog 立即热刷新：15 个 model-invocable 技能进入 `<available_skills>`（code-review/codebase-design/diagnosing-bugs/domain-modeling/git-guardrails-claude-code/grilling/migrate-to-shoehorn/prototype/research/resolving-merge-conflicts/scaffold-exercises/setup-pre-commit/tdd/wizard/writing-for-agents）。**重要语义=其余 20 个（grill-me/grill-with-docs/handoff/implement/to-spec/to-tickets/triage/wayfinder/teach/to-questionnaire/wait-what/ask-matt/loop-me/setup-matt-pocock-skills/setup-ts-deep-modules/writing-*/claude-handoff/improve-codebase-architecture）全部带 `disable-model-invocation: true`**，DSH 解析为 `modelInvocable:false`（不进模型自动调用目录）但 `userInvocable:true`（用户显式点名/斜杠路径仍可用）——**不是装失败**，与 Claude Code 的 `/斜杠命令` 语义一致；grill-me 官方版就是薄壳（只有 frontmatter + 「Call the Skill tool with 'grilling'」），真正逻辑在 grilling。可复现?是（浅克隆 + rsync 拍平 + 会话 catalog 热刷新可见 15 个 model-invocable；watcher 监听到文件变化即 invalidate）。

- **grill-me 技能生态调研（2026-08-16，调研）**：用户要求「看一下 grill-me 相关 skill 的最新版，star 多的先列」。web_search 因 api key 失效改走 GitHub Search API 多关键词（"grill me" skill / "grill-me" skill / grillme / grill interview skill）合并去重后按 star 排序，再拉各仓库 SKILL.md 原文对比。结论=源头是 **mattpocock/skills**（218.9k★/18.9k forks，MIT，「Skills for Real Engineers」技能包，grill-me 是其中一个 productivity skill）；**grill-me 最新版已薄壳化**：`skills/productivity/grill-me/SKILL.md` 只剩 frontmatter + 「Call the Skill tool with "grilling"」一行（`disable-model-invocation: true`），真正逻辑在 `skills/productivity/grilling/SKILL.md`（设计树 + 轮次 frontier + 事实自取不问用户 + 每问附推荐答案 + 空 frontier 才收尾）。社区流传最广的「旧版」单文件形态=**RobMitt/grill-me-skill**（223★/33 forks，**无 LICENSE**，2026-04-11 仅 initial commit，21 行：AskUserQuestion 一次一问 + 2-4 选项 + 决策树摘要）。中文版=**zhudan930612/grill-me**（33★，无 LICENSE，触发词含「挑战/拷打这个方案、文档、内容、设计」，支持对文档/内容评审）。其他=Jekudy/grillme-skill（32★，俄语苏格拉底深度访谈，182 行，`skills/grillme/SKILL.md`）；majorgilles/pi-grill-me（15★，MIT，是 pi 的 npm 插件 index.ts，**非 SKILL.md**）；max4c/skills（8★，MIT，grill-me 带 Freeform/Spec/Ticket 三模式 + 0.2-0.4 阈值 + 子程序退出协议，164 行，被 write-prd/tech-spec/bugbook 当 gate 调用）；wanyichen06/LLMInternSkill（278★，MIT，Codex 求职技能包，`skill-references/interview-grilling.md` 43 行，5 轮面试拷问：truth boundary→技术深度→JD 深挖→场景→风险总结，偏面试特化非方案拷问）；MoonTzai/debate-coach（9★，中文辩论教练，基于 Grill-Me 审问模式）。注意=纯 skill 仓库无 tag/版本号，「最新版」= main 分支 HEAD；RobMitt/zhudan/Jekudy 均无 LICENSE，收编需谨慎。可复现?是（GitHub Search API + raw.githubusercontent 拉 SKILL.md 可复现；未安装、未收编）。

- **dsh-mac-desktop 七次复审（2026-08-16，修复）**：再审发现 Phase 1 代码在 git 工作树/HEAD 中丢失（AppDelegate 无托盘/关闭隐藏/打开终端，index.js 无 profile 参数，Tauri 无 tray），但 AGENTS/NOTES 索引已声称落地，README 也未同步。原因=并行会话/history reset 把未提交的 dsh-mac-desktop 改动清掉，文档索引却被别的提交带走；`git fsck --lost-found` 找到 dangling tree（bb7b6ce）正是丢失前完整实现。解法=用 `git restore --source=<dangling-tree> --worktree -- dsh-mac-desktop` 恢复全部 Phase 1 源码与已构建 macOS 二进制，重新跑 `make-app.sh`/`cargo check`/`cargo test --lib`/`node --check` 全过；顺带修 README 示例用 `~/.dsh` 但代码不展开 `~` 的问题（index.js 增加 `expandHome()`，对 `dshHome`/`profileDir`/`appPath`/`appBundlePath` 生效）。可复现?是（当前 HEAD 的 dsh-mac-desktop 确实无托盘/终端代码；git fsck 可找回 dangling tree；`git restore` + 构建可复现）。

- **Archify「重启后未生效」诊断（2026-08-16，诊断）**：用户反馈 `@tt-a1i/archify-dsh@0.1.0` 安装后重启仍「未生效」。问题=用户可能期待在插件列表/设置/侧边栏看到 Archify 的 UI 入口或工具按钮，但实际没看到。原因=archify-dsh 是 **Skill-only bundle**：`cordis.patch.yml` 只 insert 一个 `@deepseek-ai/dsh-skill-filesystem` 实例（id `archify-skill-filesystem`，providerName `archify-plugin`，includeDefaultRoots false，bundledSkillDir 指向 npm 包内 `skills/`），没有 `dsh.client`、没有自定义工具、没有 settings/UI 入口；所以「生效」的唯一表现是 agent 的 skill 目录里多了一个名为 `archify` 的 skill，而不是可见插件卡/侧栏。验证=`dsh plugin --profile web list` 有 `@tt-a1i/archify-dsh 0.1.0`；`dsh --profile web --dump-config` 有 `archify-skill-filesystem`；web 进程 21:09 启动晚于安装；当前会话 `session.jsonl.zstd` 首条 user/message 的 `<available_skills>` 已含 `archify` 条目——确实已生效。解法=直接对 DSH 说「用 archify skill 画架构图/工作流/时序图」或输入 `/archify` 调用；若在旧会话看不到，开新会话或等 skill catalog 热刷新；不要按插件列表/市场里的 UI 入口判断。可复现?是（`dsh plugin --profile web list` + `--dump-config` + 解压 session.jsonl.zstd grep `available_skills` 可复现；无需改代码）。

- **dsh-market 把 mode-boost 显示为「安装完成但校验失败」（2026-08-16，诊断）**：用户安装 `@dsh-external/dsh-mode-boost` v0.1.0 后在 dsh-market 看到 broken 且问为什么未生效。问题=两个现象叠加：①dsh-market `verifyActivation` 只认 `dsh.bundle`/`dsh.client` 元数据，mode-boost 是纯 Cordis 插件（package.json 无 `dsh` 字段、无 cordis.patch.yml），因此被归类 broken（`stateBroken: '安装完成但校验失败'`），但这只是市场校验器的误报，不代表 boot 失败；②即使插件已由 `~/.dsh/profiles/web/cordis.patch.yml` 手动 `insert` 加载（`--dump-config` 有 `id: mode-boost`、活动日志有 `apply`），其共存守卫看到会话 catalog 里有 `dev_router_status`（Router Standard/Spec 预设在场）就整会话 no-op（日志 `assemble:inactive / other-router-present` 6300 次）。解法=要真正生效：新会话选官方 Standard preset（不是 router-standard/spec），或删/不用 router-standard/spec 预设让 mode-boost 接管；dsh-market 的 broken 状态可忽略（它是非 bundle 插件，市场校验器不覆盖 cordis.patch insert 这条激活路径）。可复现?是（`grep dev_router_status ~/.dsh/.agent-presets/router-*/*.mjs` + `tail ~/.dsh/mode-boost-activity.jsonl` + `dsh --profile web --dump-config` 均可复现）。

- **dsh-vision-router 撤销安装/收编（2026-08-16，用户确认）**：用户指出与 dsh-essentials ModLens 重叠后选择「连仓库收编也撤销」。已从 web profile 卸载（`dsh plugin --profile web remove dsh-vision-router`，`dump-config` 已无 vision-router），已 `git rm -r dsh-vision-router` 并回滚 README/THIRD-PARTY/AGENTS 相关条目；`scripts/check-inject-consistency.mjs` 的 `\bctx\.` / 忽略 `ctx.inject` 修复保留（通用改进，不依赖该插件）。技术判定与设计理念仍见下一条：dsh-vision-router 是 MIT 真 bundle、198 测试 196 过、免 key OVH 链 + 12 像素工具，但与 ModLens 双入口重叠/默认 OVH 外发/工具 schema 常驻，最终不装不收编。可复现?是（卸载、git rm、文档回滚均可复现）。

- **dsh-browser 扩展路径不可见（2026-08-16，修复）**：用户反馈 `~/.dsh/browser-extension` 找不到。原因=`~/.dsh` 是隐藏目录（`.` 开头），Chrome「加载已解压的扩展程序」文件选择器默认不显示隐藏目录，用户在 Finder/选择器里看不到。解法=把已构建扩展再复制一份到**非隐藏可见路径** `~/dsh-browser-extension`（即 `/Users/fangshoufanji/dsh-browser-extension`，含 manifest.json/background.js/content.js/panel/），Chrome 加载时选这个目录即可；`~/.dsh/browser-extension` 仍保留。可复现?是（隐藏目录在 Chrome 文件选择器不可见，复制到非隐藏路径后可见）。
- **dsh-agent-teams（NanmiCoder/dsh-agent-teams）安装/收编判定 + 可借鉴理念（2026-08-16，判定/落地）**：用户发 https://github.com/NanmiCoder/dsh-agent-teams 链接，要求判断适不适合安装到本仓库并收编，同时把思想/理念落档。问题=这是 **DSH 原生的多 Agent 团队协作 bundle**（GitHub API：388★/35 forks/9 open issues，MIT，2026-08-12 建仓、最近推送 2026-08-15，默认 main；npm `@nanmicoder/dsh-agent-teams` latest 0.1.5，Node ^22.19||>=24）。形态=`dsh.bundle.patch → cordis.patch.yml` 单行 insert `id: agent-teams / name: '@nanmicoder/dsh-agent-teams'`，`dsh.client` web 半区（inject locale/runtime/ui-conversation），**无 runtime dependencies**（仅 peerDeps 全 rc.6，均 optional；devDeps 才从 npm 装 DSH peer，全新 clone 可独立构建）。功能=9 个 `agent_teams_*` 工具（create/add_member/remove_member/create_task/claim_task/update_task/send_message/status/delete）+ 一条 `systemPrompt.section` 使用协议；队长用 `subagents.startContinuable`/`followup` 创建 durable 可续聊成员，状态以 `<workspace>/.agent-teams/<teamId>/` 磁盘真相（team.json + inbox/*.jsonl）+ 会话日志双写；任务状态机 `pending→claimed→in_progress→completed/failed/cancelled`，依赖未完成不可领取；delete 只归档不删（archive/ 保留任务/依赖/邮箱供复盘）；Web UI=右上角 body-portal 活动面板 + 对话流卡片 + 会话跟随/历史恢复。验证=浅克隆 → `pnpm install --frozen-lockfile` ok → `pnpm build`（tsc+tsc client+tsdown，client 71.6KB/gzip 16.4KB）全过 → `pnpm verify`（7 组约 55 断言 + skill mirror check）全过；**隔离 DSH_HOME 实测安装通过**：本地 `/tmp/dsh-agent-teams-upstream` 与 npm 0.1.5 两种来源都 `dsh plugin add` 成功，`--dump-config` 均见 `# == @nanmicoder/dsh-agent-teams` + `id: agent-teams` 行；`scripts/check-package-consistency.mjs` 对 patch 的 `id: agent-teams`（非 dsh-* 前缀）与 name 匹配不会误报。原因=①MIT 与本仓库 License 兼容；②形态完全符合「bundle 补丁 + 可选 client」且 rc.6 契约对齐（成员 provider/model/reasoningEffort 快照用 rc.6 新 API `installModelSelection`/`ReasoningEffortId`/`foldSubagentDescriptor`）；③质量高：离线 verify 覆盖纯规则/依赖门控/磁盘流/宿主快照/客户端投影/成员模型选择，构建与隔离安装全过；④无第三方服务/无额外运行时依赖，状态全本地文件，资源占用低（client 72KB，面板轮询后台不可见自动暂停；旧资源画像=内存低、host 0 interval）；⑤与现有 dsh-essentials/dsh-market/mode-boost/router-standard **无功能重叠**（唯一类似点是都注入 system prompt/工具，但 agent-teams 是任务编排，不是路由/市场/记忆/视觉）。注意/风险=①**源码仓 `.gitignore` 已忽略 `lib/`**（与 dsh-market 同款坑）：git subtree 收编后必须本地 `pnpm build` 并把 lib/ 提交入库，否则 `dsh plugin add ./dsh-agent-teams` 会 `ERR_MODULE_NOT_FOUND`；升级 pull 后要复查重建；②上游迭代快（0.1.2→0.1.5 主要加了成员零交互模型路由快照/冷恢复），收编后需跟随；③一个队长同时只带一个团队、文件状态多进程不保证一致、成员可能不按“仪式”更新任务状态——上游 README 已如实声明，属可接受边界；④曾于 2026-08-16 瘦身时被删除（与 better-sidebar 等一起），本次重评无技术性否决项，但**重新收编会增加一个独立子项目维护面**，且若装到 web profile 会增加 9 个工具 + 1 条 system prompt 段（token 开销小）。解法=判定并执行：**适合安装到 DSH web profile 且已安装（`dsh plugin --profile web add @nanmicoder/dsh-agent-teams` 成功，dump-config 见 `id: agent-teams`）**，**已 git subtree 收编为独立子目录 `dsh-agent-teams/`**（MIT、bundle、活跃、有验证、无重叠），执行步骤=dirty 工作树先 stash/commit → `git subtree add --prefix=dsh-agent-teams https://github.com/NanmiCoder/dsh-agent-teams.git main --squash` → 在子目录 `pnpm install --no-frozen-lockfile && pnpm build`（上游 lockfile 可能过期，dsh-market 同款）→ 移除/注释 `.gitignore` 的 `lib/` 并 `git add lib` → 更新 README 目录表 + THIRD-PARTY 收编行 + AGENTS 当前插件计数与索引 + NOTES（本文）。**用户已确认执行：已安装到真实 web profile（`dsh plugin --profile web add @nanmicoder/dsh-agent-teams`，`--dump-config`/import 验证通过）+ 已 git subtree 收编为 `dsh-agent-teams/`（源码仓缺 lib/ 已构建入库、移除 .gitignore 的 lib/、根 pnpm-lock.yaml 已更新）。** 涉及理念=①**队长-成员协议不是 workflow 引擎**：只用 DSH 原生 seam（tools 注册表 + subagents 可续聊 + systemPrompt section + 文件系统），把编排协议放提示段而非再造运行时——DSH 插件应优先复用能力接缝。②**磁盘真相 + 邮箱 + 归档**：team.json 是事实源、inbox JSONL 是成员/队长消息、delete=archive 不销毁，事件同时写会话日志供审计/复盘；「状态可回放、删除可恢复」是协作类插件的好基线。③**零交互成员模型路由**：默认快照队长当前实际生效的 provider/model/reasoningEffort，冷恢复时从 team.json 同步到子代理（`installModelSelection`），只有用户明确要异构团队才传 provider+model，不弹窗不二次选择——模型路由继承应「继承当前有效值，显式才覆盖」。④**headless/Web 双态安全**：webServer/workspace 服务未挂载时工具照常可用，Web 路由用 `internal/service` 懒注册，`webServer`/`httpServer`、`workspaceRegistry`/`workspace` 双键兼容过渡——插件应默认在 headless 不卡启动。⑤**安全最小面**：sanitizeKey 保留 Unicode 字母/数字并截断+摘要防路径穿越/撞名，资源路由显式 allowlist，成员 spawn 用 toolFilter deny 队长专属工具，进程内 per-team 锁串行化读改写。⑥**UI 是投影不是控制面**：活动面板 1s 轮询只读磁盘快照+实时子代理状态，后台不可见自动暂停，模型不以 UI 为准而以状态文件/status 工具为准——展示层与事实源分离。⑦**工程门禁**：verify.mjs 7 段离线断言 + skill 同步 check + peerDeps optional + prepublish build/verify，是第三方 bundle 可抄的发布基线。可复现?是（GitHub API + git ls-remote + 浅克隆 + pnpm install/build/verify + 临时 DSH_HOME 本地/npm 安装 + --dump-config + check-package-consistency 均可复现；已安装到真实 profile、已收编）。

- **Yhx888/j-space-cognition-suite 与当前仓库/DSH 冲突分析（2026-08-16，冲突/共存验证）**：用户要求「第一个看看和当前仓库还有 dsh 有没有冲突」。解法=静态核对 + 隔离共存 boot。结论=**无硬冲突，可共存；但仍不建议收编**。静态核对：①patch id/name 唯一——Yhx888 `id/name: j-space-cognition-suite`，当前 web profile 已有 essentials/dsh-market/dsh-vision-router/dsh-better-sidebar/archify-skill-filesystem 等，仓库内另有 vision-router 等，均不重名；②skill 注册——Yhx888 用 `ctx.skills.register({name:'j-space', resourceBase:{kind:'directory',...}, source:'runtime', invocation:{...}})`，DSH rc.6 `dsh-skill` 契约确认这是合法运行时嵌入式 skill（rank 250，同层同名 first-wins，重复只 warn/no-op）；当前仓库/已装插件没有同名 `j-space` skill（dsh-essentials visualize 用 registerProvider，dsh-vision-router 注册 vision-tools，archify 用 skill-filesystem provider），所以无 skill 重名；③systemPrompt——Yhx888 注册 section 名 `j-space-cognition-suite` order 150，dsh-essentials 只用 context `memory:summary`(130)/`memory:auto`(120)、mode-boost/router 预设的 section 名不同，无同名冲突；④无 client 半区/无 UI slot，与 dsh-essentials/dsh-market/dsh-vision-router 的 client 层不交叠；⑤依赖/服务——只 inject systemPrompt+skills，无第三方 runtime 依赖，headless boot 已过插件加载（之前仅缺凭据报错），本地 link 安装无 module 解析问题。隔离共存实测：`DSH_HOME=/tmp/dsh-conflict-test` 建 web profile，安装 Yhx888 + dsh-essentials（本地）+ dshmarket（本地）+ dsh-vision-router（npm 1.4.0）+ dsh-better-sidebar + @tt-a1i/archify-dsh（即当前真实 web profile 的全部第三方 bundle + Yhx888），`dsh --profile web --port 4099` boot 成功输出 `dsh web: http://127.0.0.1:4099`（12s 后手动 kill）；说明与当前仓库/当前 profile/DSH rc.6 可共存。非冲突但要注意的点：①**行为叠加**——Yhx888 每次对话注入「J-Space 强制生效」协议，与 dsh-essentials 内置 mode-boost/router-standard/spec 同属行为指令注入层，技术上不冲突但会堆 prompt/上下文，真实会话效果需实测；②**skill 重复风险**——若用户同时把纯 J-Space skill 装到 `~/.agents/skills/j-space` 或另一个 bundle 也注册 `j-space`，runtime first-wins/rank 250 会 shadow，二者只能选一；③**收编 License 冲突**——Yhx888 仓库无 LICENSE 文件（package.json 写 MIT）且内嵌上游 J-Space 内容（Apache-2.0）未附 NOTICE，收编进「各子项目均 MIT」的本仓库会污染许可声明，仍判定不 git subtree 收编；④dsh-vision-router 本地 link 安装曾报 `Cannot find package 'undici'`（本地路径不装依赖），npm 安装后正常，与 Yhx888 无关。可复现?是（临时 DSH_HOME 组合安装 + `dsh --profile web --port 4099` boot 可复现；未安装到真实 profile、未改本仓库代码，仅落档）。
- **dsh-browser（Lum1104/dsh-browser）安装落地（2026-08-16，用户确认安装）**：用户确认「可以安装」后执行=①官方 `curl | bash install.sh` 下载到 `~/.dsh/dsh-browser`，bridge 构建成功（`packages/browser/bridge-browser/lib/` 已生成），但**第 2 步 `dsh plugin --profile web add` 失败**：`ERR_PNPM_UNEXPECTED_STORE`——上游 workspace `packageManager: pnpm@11.7.0` 使 Homebrew pnpm 在 `~/.dsh/dsh-browser` 下自动切到 v11/store v11，而本机 web profile 的 node_modules 由 pnpm v10/store v10 安装，dsh 在 profile 目录调 pnpm 时版本不匹配。解法=**不要在 dsh-browser 的 pnpm11 workspace 内执行 `dsh plugin add`，改到中立 cwd（`/tmp`）执行**：`cd /tmp && dsh plugin --profile web add "@deepseek-ai/dsh-bridge-browser@link:/Users/fangshoufanji/.dsh/dsh-browser/packages/browser/bridge-browser"`，使用 pnpm v10.28.2 成功；与 NOTES 既有「npm 版 dsh 转发 pnpm 版本须与 profile store 对齐（当前 v10/Homebrew）」完全一致。②继续手工完成 install.sh 因失败未执行的 3/4 步：`cd ~/.dsh/dsh-browser && pnpm --filter dsh-browser-extension run build` 成功，`rsync` 复制 `extensions/dsh-browser/dist/` 到 `~/.dsh/browser-extension/`，`open -a "Google Chrome" "chrome://extensions"` 已打开。③验证：`dsh plugin --profile web list` 见 `@deepseek-ai/dsh-bridge-browser link:../../dsh-browser/packages/browser/bridge-browser`；`dsh --profile web --dump-config` 见 `# == @deepseek-ai/dsh-bridge-browser / - id: bridge-browser`；`cd ~/.dsh/profiles/web && node -e "import('@deepseek-ai/dsh-bridge-browser')"` 输出 `import ok bridge-browser`。④**未收编**：本次只安装到本地 web profile，未 `git subtree add` 到本仓库；后续若收编需处理 lib/dist 未入库、`@deepseek-ai/` scope 未发布包名、嵌套 bundle 结构、mac-only install.sh 等（详见上方/此前调研判定）。涉及理念=真实浏览器优于 headless、文本化 DOM 编号操作、快照上下文经济（32k 字符≈8–10k tokens）、confused-deputy 桥自带 token 认证（回环免 token 还需 chrome-extension:// origin）、privileged gateway loopback-only、操作审批 fail-closed + tab handoff、session deferral/workspace、单活动连接 + 代际令牌、协议单一来源 `protocol.ts`。可复现?是（上游 install.sh 在 pnpm v10 profile 上因 v11 workspace 必现 store mismatch；改中立 cwd 后安装/import/dump-config 均可复现；未收编）。
- **pi-ai replay state 块数不匹配修复（2026-08-16，修复）**：问题=长会话运行报 `invalid pi-ai replay state: block count does not match assistant content` / `INVALID_REPLAY_STATE`，`/compact` 连续失败「Compaction could not produce a useful summary. The conversation is unchanged」。原因=`@deepseek-ai/dsh-llm-pi-ai` 的 `replayedAssistant` 要求 `source.replayState.blocks.length === message.content.length`；目标会话 `session-c241a169-b908-488a-9aa8-1fd14669c620` 有一条 `assistant/message`（seq=116103）因 `stopReason: length`（max-tokens）截断：pi-ai 原生响应有 `[reasoning, tool-call]` 两块，但 Harness 持久化的 `message.content` 只保留了 `[reasoning]`（不完整 tool call 未落盘），replayState 仍带 2 块，后续任意请求/compact 重建历史时即抛 INVALID_REPLAY_STATE。解法=不改 harness 源码，做会话数据修复：用 Node `node:zlib` 逐帧扫描/解压 `session.jsonl.zstd`，把该条 `source.replayState.blocks` 对齐为 content 实际块（去掉未落盘的 tool-call），保持首帧恰一行、逐帧带 checksum 重新压缩写回；原文件备份在 `/tmp/session-c241a169-invalid-replay-backup-20260816-205504.zstd`。修复后全 workspace 扫描 replayState 块数 mismatch=0。可复现?是（长会话 max-tokens 截断出半截 tool call 后可复现；本次已修复目标会话；**但正在运行的 DSH 进程仍持有旧内存态，实测不重启/不重新加载仍报错，必须重启 DSH web 或让该会话从磁盘重新加载**）。根治方向=上游 `dsh-llm-pi-ai` 应在 `stopReason=length` 时不要把未落盘的 tool-call 块写进 replayState，或 Harness 落 content 时保留该不完整 tool-call；本仓库按「harness 源码不改」只做数据修复。
- **dsh-vision-router（ysr666/dsh-vision-router）调研判定（2026-08-16；最终被用户撤销安装/收编）**：用户发 https://github.com/ysr666/dsh-vision-router 要求评估适不适合安装到本仓库并收编，并将思想/理念落档。问题=这是一个 MIT 原生 DSH bundle（npm `dsh-vision-router` v1.4.0，326★/18 forks，真 `dsh.bundle.patch → cordis.patch.yml` + `dsh.client`），定位「给纯文本 DSH 补眼睛」：内置免 key OVH 匿名视觉链 + 12 个像素级 vision_* 工具（describe/ground/detect/crop/present/pixel_diff/colors/ocr/long_screenshot_ocr/trace/extract_foreground/html_screenshot）+ auto-wrap “+ Auto Vision” 模型组 + 可选 stealth 接管官方 deepseek-official 路由 + Web 设置卡 + doctor/repair CLI。原因=形态完全符合本仓库 bundle 约定、License MIT、npm 已发布、Node>=22、依赖 sharp/potrace/puppeteer-core/undici + peer @deepseek-ai/dsh-llm-deepseek@rc.6/dsh-anonymous-user-id@rc.6；本机隔离 `pnpm install --frozen-lockfile` + `pnpm test` 198 测试 196 过（2 失败是 macOS `/private/tmp` vs `/tmp` 路径前缀的 self-update 测试环境差异，非业务 bug）；`dsh plugin --profile web add /Users/fangshoufanji/workspace/deepseek-plugins/dsh-vision-router` 成功，`dsh --profile web --dump-config` 见 `id: vision-router / name: dsh-vision-router / config.progressiveTools: false` 与 `attachment-local` 20MB/1亿像素放宽；收编时工作树有并行未提交修改导致 `git subtree add` 拒绝，解法=在干净 temp clone 里 `git subtree add` 后用 `git fetch + git cherry-pick -m 1` 带回本仓库，再 amend 补 `git-subtree-dir`/`git-subtree-split` 元数据（并行会话的脏修改全程未动）。解法=初判**技术上适合安装并收编**，但因与 dsh-essentials ModLens 重叠，用户最终决定**不安装、不收编，仅保留判定与理念**；后续已从 web profile 卸载、`git rm` 移除仓库目录并回滚文档。注意点=①与 dsh-essentials 内置 ModLens 视觉重叠：ModLens 偏「一次读图证据」，vision-router 偏「多步像素工程/路由包装」，可共存但建议用户二选一主入口，避免两套 `+ Auto Vision`/粘贴行为叠加；②默认 `progressiveTools:false` 常驻 12 个工具 schema 增加每请求 token 固定开销（本仓库画像 ~55 工具 12K tokens，加 12 个 vision_* 需复测）；③默认 OVH 匿名兜底会把图片/问题发往第三方云，隐私敏感场景应关闭 `freeFallback` 或只配本地/自有 vision model；④其 `cordis.patch.yml` 还放宽 attachment-local 图片限制（20MB/1亿像素），如需收紧在 profile 补丁覆写；⑤升级走 `git subtree pull --prefix=dsh-vision-router https://github.com/ysr666/dsh-vision-router.git main --squash`，因无本地修改可直接跟随上游。思想/理念=①「DeepSeek 永远是大脑，视觉模型只当眼睛」的工具优先路由（routing:false）比整轮切换更可迭代/可验证；②像素级闭环：ground→crop→pixel_diff→html_screenshot→repeat 把 UI 还原变成可度量（diff ratio + worst-region）；③工具 schema 稳定性优先于渐进挂载（prefix/KV cache 考虑）；④免 key 匿名 fallback + 分类错误 + Retry-After 背压的 provider 链设计；⑤图像内容 hash 缓存 + 不可信证据标注（防 prompt injection）；⑥宿主依赖用 lazy sharp + 版本冲突运行时告警的健壮性；⑦client 设置卡 + doctor/repair CLI + self-update 的发布/自愈工程基线。可复现?是（npm registry/GitHub API/浅克隆/pnpm test/隔离 install+dump-config 均可复现；真实 GUI 图片轮未自动化）。

- **dsh-market 安装 + git subtree 收编落地（2026-08-16，用户确认执行）**：用户选择「安装到 web profile + git subtree 收编为 dsh-market/」。执行=①真实 web profile `dsh plugin --profile web add dshmarket` 成功，`--dump-config` 见 `id: dsh-market / name: dshmarket`（有 missing peer @deepseek-ai/cordis 警告，运行时由 DSH closure 解析）；②`git subtree add --prefix=dsh-market https://github.com/dsh-market/dsh-market.git main --squash` 成功（先 stash 了工作树里并行会话的未提交修改，add 后 pop 恢复）；③**关键坑：源码仓库没有 `lib/`**（上游 `.gitignore` 忽略 `lib/`，只有 npm 包 prepack 后才含 lib）——`dsh plugin add ./dsh-market` 本地链接看起来成功且 dump-config 有 entry，但 `import('dshmarket')` 报 `ERR_MODULE_NOT_FOUND: .../dshmarket/lib/index.js`；远程 `github:dsh-market/dsh-market` 安装则因 pnpm 默认拦截 git 依赖的 prepare 构建直接 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`。解法=在仓库内构建 `lib/`（从同 HEAD 源码 build）并**移除 `dsh-market/.gitignore` 里的 `lib/` 行**，把构建产物提交入库（免构建安装；升级 pull 后需复查/重建）；④**包名一致性守护脚本误报**：`scripts/check-package-consistency.mjs` 把 patch 的 `name: 'dshmarket'` 带引号当不等、把逻辑 id `dsh-market` 当旧模块名残留；解法=脚本升级：name 值先去引号，dsh-* 形 id 仅当同条目没有匹配包名的 `name:` 时才判残留，dsh-market 通过；⑤文档已更新：README 目录表加 dsh-market 行、THIRD-PARTY 加收编行（本地修改=lib 入库 + .gitignore + 一致性脚本增强）、AGENTS 当前插件 3→4；⑥仍未处理：与 dsh-essentials 内置「插件市场」tab 的双入口/去重问题（用户选择同时保留，待后续二选一或实测共存）；上游 lockfile 过期（pnpm-lock 缺 @deepseek-ai/dsh-invariants）未在仓库内修，当前子目录测试/构建需 `--no-frozen-lockfile` 或直接用已提交 lib。可复现?是（npm 安装、本地链接缺 lib 报错、git 远程 prepare 拦截、脚本修复、subtree add 均可复现）。
- **dsh-handbook（Electricitysheep/dsh-handbook）外部调研（2026-08-16，判定/记录）**：用户发 https://github.com/Electricitysheep/dsh-handbook 链接。问题=这是 **DSH 社区手册/白皮书仓库**（「DeepSeek Harness 中文手册 × 生态观察中心」，docsify 站点，GitHub API：342★/10 forks/3 open issues，2026-08-13 建仓，最近推送 2026-08-16，默认 main HEAD 8ee8a84，HTML 为主 + 15 章中英 docs + 中英 PDF + cheatsheet/FAQ/config-reference/roadmap + examples/plugin-template），**不是 DSH 插件/bundle/预设/skill**：根目录无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无 Cordis 代码；唯一可运行包是 `examples/plugin-template/`（非 bundle 的教程模板，MIT）。许可=README 明确「内容 CC BY-NC-SA 4.0 · 示例代码 MIT」（无 LICENSE 文件，GitHub license=null），与本仓库「各子项目 MIT、以 MIT 分发」不兼容，不能整体收编/搬运正文。原因=①形态不符：本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能；dsh-handbook 是文档站，安装入口是 `npx -y @deepseek-ai/dsh web` 的教程不是插件；②License 非 MIT（CC BY-NC-SA 含非商业/相同方式共享），整体 `git subtree add` 会污染 MIT 分发；③价值在内容/生态数据，不在可安装代码；与已有官方参考文档互补（新手路径/cheatsheet/插件模板/生态报告/FAQ）。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；建议作为社区参考文档链接（已加到根 README「依赖的参照项目与文档」：社区手册 dsh-handbook，在线 https://electricitysheep.github.io/dsh-handbook/，内容 CC BY-NC-SA 4.0 仅引用不搬运）；其 `examples/plugin-template/` 是 MIT 可单独参考（写插件教学/脚手架），生态报告方法（1804 插件 × 780 帖交叉验证）可作社区调研口径参考。可复现?是（GitHub API + git ls-remote + 浅克隆读 README/CONTRIBUTING/docs 可复现；未安装、未收编、未改本仓库代码）。
- **dsh-mac-desktop 六次复审（2026-08-16，修复）**：再审发现 Dock 重开逻辑只处理「无可见窗口」，
  若主窗口隐藏但设置窗口可见，点 Dock 不会把主窗口带回来。解法=`applicationShouldHandleReopen`
  改为：只要主窗口存在且不可见就 `showMainWindow()`，否则按原逻辑；`make-app.sh` 重建通过。
  可复现?是（源码可复现；GUI 真机未自动化）。
- **dsh-market（dsh-market/dsh-market）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/dsh-market/dsh-market 问适不适合安装到本仓库并收编。问题=这是 **DSH 官方形态的插件市场 bundle**（README 定位「The plugin market inside DeepSeek Harness — browse, search, one-click install」，MIT，459★/39 forks，npm `dshmarket` latest 1.9.0，main HEAD 9e7daac，homepage dshmarket.com，活跃 2026-08-16 仍有提交）：package.json `name=dshmarket`、`dsh.bundle.patch → cordis.patch.yml` 单行 insert `id: dsh-market / name: dshmarket`、`dsh.client` web 半区 inject connection/runtime/locale/ui-settings/ui-theme，**无 runtime dependencies**（仅 peerDeps @deepseek-ai/cordis ^4.0.1）。功能=浏览/搜索社区插件目录（awesome-dsh-plugin.com 800+，分类/星数/最新排序/双语）、AppStore 式截图、主题市场（安装/实时切换/互斥/卸载）、一键安装（npm tarball 优先 github，实时进度/取消）、更新（npm 或 pinned commit vs HEAD）、卸载、备份/恢复（JSON + WebDAV 每日自动，恢复前校验+失败回滚）、缺 pnpm 一键补齐、脱敏日志导出、需要时一键重启；安全=只装 curated registry、构建脚本默认拦截+逐包批准、终端类插件标记、same-origin POST、重启限 loopback、备份含凭据时 UI 警告、WebDAV 仅 https/拒私网/不存密码、无遥测。架构=host `src/index.ts` inject webServer+loader（profile 用 `--profile` argv 推导，避免装错 profile；DSH Desktop 走 desktopProfiles/desktopPnpm 契约）、routes 挂 `/dsh-market/*`；client `src/client/index.ts` inject slots/locale/theme，注册 `settings.section` id=market order=40 + `shell.overlay` InstallToast；含 hot.ts（纯 insert patch 热挂）、themes.ts、verify.ts（live/restart/inert/broken 四态）、backup/updates/restart/pnpm-compat/ndjson/log；目录数据 data/registry-snapshot.json 离线兜底。验证=浅克隆 → `pnpm install` 因 **lockfile 过期**（package.json 已加 `@deepseek-ai/dsh-invariants` 但 pnpm-lock.yaml 未同步）需 `--no-frozen-lockfile` 才成功；`pnpm typecheck` 全过、`pnpm test` 19 文件 211 测试全过、build 通过（client 172KB / gzip 36KB，lib 316KB，tgz 380KB）；临时 DSH_HOME 下 `dsh plugin --profile web add dshmarket` 安装成功，`--dump-config` 见 `dsh-market` 行，`import('dshmarket')` ok（有 missing peer @deepseek-ai/cordis 警告但运行时由 DSH closure 解析，与既有 peerDeps 坑一致）。原因=①MIT 与本仓库 License 兼容；②形态完全符合「bundle 补丁 + 可选 client」；③npm 已发布、无 runtime 依赖、体积轻、测试质量高（211 tests）；④rc.6 契约对齐（依赖 rc.6 primitives，且有 missingPrimitives 降级门控）；⑤功能上**与本仓库 dsh-essentials 内置的「插件市场」tab 高度重叠**——dsh-market 是一级 `settings.section` 真在线安装市场，dsh-essentials 是 `settings.plugins.tab` 静态市场（GitHub Search + 复制命令、无在线安装 API），二者会同时出现两个市场入口；且 dsh-market 本身可安装/卸载/更新/重启 profile，属于**高权限 profile 管理工具**，收编后维护责任重。解法=判定：**适合从 npm 安装到 DSH web profile（推荐 `dsh plugin --profile web add dshmarket`，隔离安装实测通过；装完重启+硬刷新）**；**有条件适合收编为独立子目录 `dsh-market/`**（MIT、bundle、活跃、有测试，可 `git subtree add` 跟随上游），但收编前需：①先由用户确认是否真要安装/收编（本次仅隔离验证，未装真实 profile、未改仓库代码）；②与 dsh-essentials 市场 tab 二选一或接受双入口/移除旧 tab；③上游 lockfile 过期问题在收编后要补锁或改 CI（`pnpm install --no-frozen-lockfile` 或更新 lock）；④若收编需更新 THIRD-PARTY/README/AGENTS 清单，且当前工作树有多任务未提交，`git subtree add` 前必须先提交/stash。涉及理念=①**市场即信任边界**：安装只允许 curated registry 来源，防名字抢注（npm 名需 registry 校验）、防同名冲突、防 alias 重复安装、防 fake-success（clean exit 但没装上不读成功）；做插件安装/分发类能力可直接借鉴。②**失败可恢复是产品底线**：manifest 快照回滚（pnpm 先写 package.json 再失败会留幽灵依赖）、恢复备份失败时逐个重装/空依赖重试、取消操作保留 partial 并回执 diff、坏条目自动 remove；「操作结果可解释、可回滚」应成为 DSH 插件默认要求。③**激活状态不是布尔**：verifyActivation 区分 live/restart/inert/broken 并给原因（patch 复杂不能热挂/无 dsh.bundle 成普通依赖/仅 client/装坏），UI 不再一刀切「重启后生效」；我们 dsh-essentials 安装/插件列表也可升级为这种多态呈现。④**热挂载 + 持久 disable 状态自愈**：纯 insert patch 可 hotMount/hotUnmount，bundle 层 disable 在内存中不持久，boot 时重放 disable 列表 + 监听 `internal/plugin` 把被覆盖的关闭状态再压回去——「UI 开关与运行时状态一致」的工程样板。⑤**安全面分层**：same-origin POST、backup 导出限 loopback、WebDAV https-only/拒私网/密码不进浏览器、restart 限 direct loopback 且保留原 argv/env/cwd、日志脱敏（home 路径/凭据形状）——权限类插件的合规 checklist。⑥**跨宿主兼容**：普通 DSH 用 argvProfile 推导，DSH Desktop 用 `desktopProfiles` + `desktopPnpm` 契约且 allowRestart=false 交给宿主重启；第三方 bundle 想同时兼容桌面壳可参考这套「环境探测 + 能力降级」模式。⑦**客户端自包含与优雅降级**：只依赖 host 注入的 primitives，构建时 external，运行前检查必需导出缺失则跳过注册（避免整页白屏）；module-scope 缓存 registry/installed 让重进秒开。⑧**发布纪律**：prepack 跑 build+preflight、validate:registry、固定 registry 快照、测试矩阵（unit/compat/web e2e）——都是可抄的工程基线。可复现?是（GitHub API + 浅克隆 + pnpm typecheck/test/build + 临时 DSH_HOME 安装/dump-config/import 均可复现；未安装到本机真实 profile、未改本仓库代码）。
- **Aegis 最终决定（2026-08-16，用户确认）**：用户确认 **不安装、不收编，仅落档思想理念**。本仓库与 DSH profile 均不新增 Aegis；可借鉴理念已在前述 Aegis 条目存档（thin DSH bundle 适配器、`agent/session-start` 同步 bootstrap、method pack 不冒充 runtime core、fast-path / 证据槽 / TaskStartSnapshot / 单一 closeout、canonical skills + 单暴露路径、多宿主生成视图、doctor 结构化验证门禁、本地路径安装的模块解析坑）。可复现?是（判定与理念已在 NOTES 上文；未安装、未收编）。
- **MuseAI 可借鉴点记录（2026-08-16，记录）**：用户决定不安装、不收编，只落档思想理念。问题=yejiming/MuseAI 与配套 dsh-museai-tavern 虽不纳入本仓库，但 dsh-museai-tavern 的架构/交互有不少对本仓库插件设计可借鉴的点。解法=按可落地度整理：①**把外部应用的领域模型映射为 DSH storage-domain**：世界书/角色卡/会话/羁绊作为独立 `museai` 域（store 表 + sessions 表，zustand persist envelope 原样落盘），浏览器 localStorage 仅做离线镜像，重启不丢——本仓库做「长期记忆/角色/素材」类插件可照此把核心实体收敛到 `$DSH_HOME/storages/<domain>.json`。②**conversation.view 承载完整子应用**：order 15 插一个「MuseAI 标签」，内部再分五页，激活时隐藏平台 composer，形成 DSH 内嵌的应用区；适合创作/娱乐/垂直工具类插件，避免把业务 UI 塞进普通会话流。③**零凭据模型桥**：插件不出现 API Key/BaseURL，全部复用 DSH `ctx.llm` + `agentDefaultModel`，前端只从 `/models` 目录选「跟随默认」或显式 provider/model——所有 AI 功能插件都应这样，不要自建第二套模型配置。④**host 双行拆分的 headless 安全**：`museai` 行（存储服务）任何 profile 都可用；`museai-routes` 行用嵌套 inject（webServer+llm+agentDefaultModel+museaiStore）只在 web 存在时挂 `/plugins/museai/*`，headless 不卡启动——同 bundle 兼容 web/headless 的推荐范式。⑤**内存→持久化域升级 facade**：storage-domain 晚挂载时先内存服务，facility 出现后 flush 升级 durable，数据不丢、可降级——可选持久化设施时的优雅模式。⑥**NDJSON 流式桥 + thinking 分离**：`start/delta/thinking_delta/done/error/aborted` 事件流，前端可做 Markdown + 折叠思考 + 停止生成；与 DSH 流式生成模型一致，适合做自定义生成面板。⑦**模型目录接口**：GET `/plugins/museai/models` 聚合 provider×model + failures + defaultSelection，前端一个下拉解决「跟随默认 or 指定模型」——是复用 DSH 模型能力的通用 HTTP 面。⑧**开放格式互操作**：角色卡/世界书支持 JSON 导入导出 + SillyTavern 双格式导出/转换预览；创作类工具做开放格式能显著提升生态价值。⑨**发布纪律**：openspec 变更记录、11 个测试文件覆盖 utils/routes/domain/client-bundle smoke、lib 提交仓库免构建安装，都是外部 bundle 可借鉴的工程基线。⑩**反面教材**：README 安装命令与实际 npm/GitHub 地址不一致、npm 未发布、@deepseek-ai/* 只放 peerDependencies、client bundle ~8.5MB——外部调研/收编前必须核查发布元数据、依赖策略与体积。可复现?是（读源码/测试/构建/隔离安装均可复现；未安装到 DSH profile、未收编）。
- **dsh-mac-desktop 五次复审（2026-08-16，修复）**：再审发现 Swift “打开 DSH 终端”的路径
  只做了 AppleScript 双引号转义，路径里的 `$`/反引号/`!` 仍会被 Terminal 的 shell 二次展开。
  解法=改为先做 shell 单引号转义（`'` → `'\''`），再对 AppleScript 外层双引号做
  backslash/quote 转义；`make-app.sh` 重建通过。其余未发现新的功能性问题。可复现?是
  （源码可复现；GUI 真机未自动化）。
- **SandBase Harness 可借鉴点记录（2026-08-16，记录）**：用户决定不安装、不收编，只把设计思想和理念落档。解法=按对本仓库可落地度整理：①**本地优先 + Git 友好 workspace**：agents/skills 是 YAML/Markdown 文件进 Git，runtime state（SQLite/logs/files/sandbox）放 `.managed-agents/` 忽略；「源码文件是配置/能力，运行时状态是数据」与我们的 README/NOTES 分离思路一致。②**单活动栈（One active stack）**：Settings V2 每次只允许一个 model vendor / loop engine / storage / memory / sandbox backend；未实现的适配器（Postgres/S3/mem0/harness 等）保持 roadmap，不提供假 UI。理念=「验证优于信任」：运行时影响型设置要 probe 验证，不只是 schema 验证。③**控制面/执行面分离 + 小核心扩展点**：Agent（持久定义）/ Environment（沙箱模板）/ Session（控制面状态）/ Sandbox（执行资源，一个 session 独享）；core 小，模型、沙箱、工具、策略走稳定接口。DSH 插件做外部 runtime 桥可沿用「薄适配层 + 稳定契约」。④**事件日志是会话真源**：append-only 结构化事件，重启后从事件回放恢复会话；SSE 瞬态 chunk 不落盘；compaction 边界也入日志。这比把会话当黑盒更可审计/可复现，dsh-essentials 记忆/审计可参考。⑤**诚实能力边界**：明确 non-goals（无可视化工作流画布、无图 DSL、无隐藏远端控制面）；BACKLOG 承认 Console 未纳入 typecheck（~90 errors）、本地沙箱无内核隔离、K8s live 测试无集群时跳过等。诚实列边界比宣称全能更可信。⑥**沙箱安全分层**：本地路径禁锢 + 环境 allowlist；Docker/K8s/self-hosted 更强隔离；沙箱只属于一个 session，结束/停机清理；egress 控制列为 roadmap。DSH 侧 sandboxPolicy 可对应做「能力分级 + 如实上报」。⑦**工具治理**：MCP server 按 agent 配置、按 session 连接；工具输出设上限保护事件/上下文；可选集成失败优雅降级并返回状态；敏感操作确认流在 roadmap。对应 dsh-essentials 的「超大工具结果剪枝/权限策略」。⑧**DSH 集成=纯 MCP client bundle**：一行 `@deepseek-ai/dsh-mcp-client` + stdio + env 透传 + `failOnStartupError`，无自写 host 插件；`run_session` 等流到 idle 再返回 text/terminal_event/event_count，并给 structuredContent——外部长任务委托可直接抄这个语义。⑨**发布纪律**：`release:check` 门禁（typecheck+test+build+package:check+smoke）；README 固定不可变 tag；CI 还构建 MCP 容器。npm 包名被占位这一教训也说明「包名/发布路径要早规划」。可复现?是（git clone + docs/spec + src/mcp + CI/package.json 可复现；未安装、未改本仓库代码）。
- **MuseAI（yejiming/MuseAI）外部调研 + dsh-museai-tavern 安装/收编判定（2026-08-16，判定/记录）**：用户发 https://github.com/yejiming/MuseAI 问看看这个项目。问题=主体是**独立 Tauri 桌面 AI 角色扮演/文字冒险应用**（React 19 + AntD + ECharts + Rust/Tauri 2，v0.9.8，~567★/46 forks，本地数据 `~/Documents/MuseAI/`，支持局域网移动端；仓库**无 LICENSE 文件**、GitHub license=null，非 DSH bundle，无 dsh.bundle.patch/cordis.patch）；但它 README 醒目指向配套 **DSH 客户端插件 dsh-museai-tavern**（yejiming/dsh-museai-tavern，MIT，v0.0.1，8★，2026-08-13 新建，浅克隆 HEAD a7a077a），这才是真 DSH bundle：`dsh.bundle.patch → cordis.patch.yml` 两条 insert（`museai` 存储服务行 + `museai-routes` 路由行），`dsh.client` 浏览器半区注册 `conversation.view` order 15 标签（轨迹右侧），把 MuseAI 五个页面（背景/聊天/冒险/羁绊/设置）搬进 DSH Web GUI，模型全部复用 DSH `ctx.llm` + `agentDefaultModel`，无任何 API Key/BaseURL；持久化走 `@deepseek-ai/dsh-storage-domain` 的 `museai` 域（`$DSH_HOME/storages/museai.json`），headless 自动跳过路由。原因=①主体 app 形态/许可/体量都不符合本仓库「MIT 子项目 + bundle 补丁」约定，**不宜安装到 DSH profile、不宜收编**，仅可作外部产品/创作类应用参考；②配套插件**技术上可安装、质量不错**：pnpm install + `pnpm test`（11 文件 49 测试全过）+ `pnpm typecheck` + client typecheck + `pnpm build` 全过；临时 DSH_HOME 下 `dsh plugin --profile web add /tmp/dsh-museai-tavern` 和 `github:yejiming/dsh-museai-tavern` 均成功，`--dump-config` 见 museai/museai-routes 两行；代码结构清晰（src/index.ts 只开 store，routes.ts 嵌套 inject webserver+llm+agentDefaultModel+museaiStore，domain.ts 内存→域升级 facade，client 分页/store/utils/组件，含 openspec 与 11 个测试文件），符合本仓库「路由 patch inject/副作用 effect 回收/headless 安全/无凭据」最佳实践。③但有几个注意点：**README 写 npm 装 `@yejiming/dsh-museai-tavern` 但 npm registry 404 未发布**；**README/package.json 写 `github:omdsh-dev/dsh-museai-tavern` 和 repository omdsh-dev，实际仓库在 yejiming 下，omdsh-dev/dsh-museai-tavern 不存在**（实测 `github:omdsh-dev/...` 安装失败）；package.json 只把 @deepseek-ai/* 放 peerDependencies（dependencies 仅 schemastery），远程安装时 pnpm 报 missing peer 但 DSH 运行时可解析（与既有 peerDeps 坑类似，若收编应补 dependencies 或放宽）；client bundle `lib/client.js` 约 8.57MB + 14.6MB sourcemap（AntD/ECharts 全家桶），偏重；`maxCompleteChars` 配置项在 routes 里没真正截断非流式输出；项目太新（0.0.1、8★）上游可能快速变动。解法=判定：**MuseAI 主体不装不收编；dsh-museai-tavern 作为外部插件可装（推荐 `dsh plugin --profile web add github:yejiming/dsh-museai-tavern`，别用 README 的 npm/omdsh 命令），有条件适合收编为独立子目录**（MIT、bundle 形态、独立仓库、有测试），但收编前需：修 package/repo/README 的 omdsh/npm 不一致、补 @deepseek-ai dependencies 或统一 peer 到 rc.6/`*`、评估 8.5MB client 体积与 dsh-essentials conversation.view（usage-stats order 20）共存、加 THIRD-PARTY 与根 README/NOTES 行。本次只做调研+隔离安装验证，未安装到本机真实 profile、未改本仓库代码。可复现?是（GitHub API + 浅克隆 + pnpm install/test/build + 临时 DSH_HOME 的本地/GitHub 安装与 dump-config 均可复现）。
- **Aegis 冲突分析（2026-08-16，补充）**：问题=用户问 Aegis 若可装，与本仓库现状、当前 DSH 现状是否冲突。原因=当前 web profile 已装 `dsh-essentials`、`dsh-mode-boost`、`dsh-better-sidebar`、`@tt-a1i/archify-dsh`，并有 router-standard/spec/liangshen presets；Aegis 会新增 `aegis-method-pack` 行 + `aegis-method-pack` filesystem provider + `using-aegis`（alwaysApply）skill + `agent/session-start` 同步 bootstrap。解法=结论：**技术上不冲突**（无重复 id/service/provider，远程安装实测通过），但有三个注意点：①**路由/上下文叠加**：Aegis 的 auto bootstrap + alwaysApply `using-aegis` 与 router-standard/spec、mode-boost 都是“给模型注入路由/行为指令”，会叠加并增加每会话上下文，是否干扰需在真实会话里实测，不能只看 dump-config；②**仓库一键脚本**只发现 `dsh-*` 且默认本地路径：收编为 `aegis/` 不会进脚本（安全但需手动扩展），收编为 `dsh-aegis/` 会进脚本但本地安装会因 pnpm 链到 profile 外报 `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-llm`，需改脚本用 GitHub 子目录或补 dependencies；③当前工作树多任务未提交，`git subtree add` 前需先处理。可复现?是（`dsh plugin --profile web list` / `dump-config` + Aegis 远程隔离安装实测可复现；未实际装到本机 profile、未收编）。
- **coding-tools-mcp（xyTom/coding-tools-mcp）安装/收编判定 + 可借鉴理念（2026-08-16，判定/记录）**：用户发 https://github.com/xyTom/coding-tools-mcp 问适不适合安装到本仓库并收编。问题=它是**通用模型中立编码运行时 MCP server**（README 定位「Give any AI chat or agent a safe pair of hands on your codebase」，Apache-2.0，PyPI `coding-tools-mcp` 0.3.0（2026-08-13），npm launcher 0.1.0，main HEAD 66b3f19，Python>=3.11，`coding_tools_mcp/` 约 8.9k LOC，仓库 244 文件含 Docker/Cloudflare Worker/desktop client/benchmarks/SWE-bench/CI），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，也无 DSH/DeepSeek 引用。形态=固定 18 工具目录（files/search：read_file/list_dir/list_files/search_text/apply_patch/view_image；exec：exec_command/write_stdin/read_output/kill_command/request_permissions；git：git_status/diff/log/show/blame；runtime：server_info/check_exec_environment），`apply_patch` 是唯一文件写原语（staged + baseline check + atomic + rollback），safe/trusted/dangerous 权限模式只改命令策略不改 tools/list，stdio + Streamable HTTP，同时支持 MCP 2026-07-28 与 2025-11-25/2025-06-18 双 era，无 sessions，一个 workspace 一个信任域，Linux Landlock 文件系统约束。与 DSH 关系=DSH npm rc.6 自带官方 `@deepseek-ai/dsh-mcp-client` 插件（`dsh` 的 package.json dependencies 有 `^0.1.0-rc.6`），可在 `cordis.yml`/profile patch 里加一个实例把它挂成外部 MCP server：
  ```yaml
  - id: mcp-coding-tools
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: codingTools
      transport: stdio
      command: uvx
      args: ['coding-tools-mcp', '--stdio', '--workspace', '/path/to/repo']
  ```
  模型侧工具名变为 `mcp__codingTools__read_file` 等；DSH mcp-client 只桥 tools（Resources/Prompts 暂不消费），而 coding-tools-mcp 恰好只暴露 tools，协议面可对接。原因=①形态不匹配：`dsh plugin add` 收 bundle 补丁，coding-tools-mcp 是独立 Python 产品（自带 Docker/Cloudflare/desktop/benchmark 生态），整体 `git subtree` 会引入非 DSH 大仓与 Python 运行时；②License 不兼容本仓库「各子项目 MIT、以 MIT 分发」约定：Apache-2.0 可分发但需保留 LICENSE/NOTICE/attribution，不是本仓库现行策略；③能力高度重叠：DSH 已有 fs/shell/sandbox/git/工具结果剪枝等原生编码能力，再挂 18 个 `mcp__codingTools__*` 工具会增加每次请求的 tool schema token 开销（本仓库画像 ~55 工具已 ~12K tokens），且形成双轨入口，默认不值得；④它可独立用 `uvx/npx` 运行，无需仓库维护。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；若确实想要其安全边界/原子 patch/权限模式，按上述配置作为**外部 MCP server 按需挂载**（每个 workspace 一个实例），或未来做薄 MIT bundle 只负责 insert `@deepseek-ai/dsh-mcp-client` 配置并声明官方插件依赖，**不 vendor coding-tools-mcp 源码**。涉及理念=①**安全是产品不是补丁**：workspace root 限制、绝对路径/`..`/symlink 逃逸拒绝、权限模式门控网络/展开/内联脚本/破坏性命令、Linux Landlock、`apply_patch` 原子替换+回滚、命令超时/输出预算/PTY——DSH 插件做文件/执行工具可参考「边界即契约、失败显式报」。②**固定且如实标注的工具目录**：没有 profile 切换/annotation games，权限模式只改 policy 不改 tools/list；与 DSH「工具 schema 稳定、KV cache 前缀稳定」方向一致。③**上下文经济是工程指标**：结果 summary + `structuredContent` 完整机器结果、分页/上限、序列化结果字节随版本下降 37%（dogfood）——DSH 插件应把「token/字节成本」当可度量优化项。④**无 sessions 的运行时**：每个请求自带 `_meta`，无握手状态，重连/多客户端简单；DSH 侧 mcp-client 的 reconnect 世代替换也体现「恢复不重复不泄漏」理念。⑤**合规/可复现发布**：release 流水线从同一 commit 跑 compliance + dogfood + SWE-bench 再发 PyPI/npm，匿名遥测可关；外部工具接入时「发布即验证、证据可复现」值得借鉴。⑥**库依赖优先于源码收编**：通用外部运行时用官方 MCP client 桥 + 薄配置接入，只有 DSH 形态的插件才 git subtree——与 PicGo-Core/agent-qa 的判定一致。可复现?是（git ls-remote + 浅克隆读 README/SPEC/pyproject/docs + PyPI/npm registry + 读本机 `@deepseek-ai/dsh-mcp-client` README 可复现；未安装到 DSH profile、未改本仓库代码）。
- **SandBase Harness（sandbaseai/sandbase-harness）外部调研 + 安装/收编判定（2026-08-16，判定/记录）**：用户发 https://github.com/sandbaseai/sandbase-harness 链接。问题=这是一个「本地优先、Claude Managed Agents 风格」的独立 AI Agent 运行时（TypeScript，Apache-2.0，v0.3.2，~598★/57 forks，main HEAD 9670796，浅克隆成功），不是 DSH 插件仓库；但它自带一个**真 DSH bundle**：根 package.json `dsh.bundle.patch → ./examples/deepseek-harness/cordis.yml`，patch 单行 insert `id: mcp-sandbase-harness / name: @deepseek-ai/dsh-mcp-client / transport: stdio / command: managed-agents-mcp / env: MANAGED_AGENTS_URL+MANAGED_AGENTS_API_KEY（!!js process.env）/ failOnStartupError: true`，无 `dsh.client` 半区；`src/mcp/server.ts` 用 `@modelcontextprotocol/sdk` 实现六个工具 `mcp__sandbase__list_agents/create_session/run_session/get_session/list_artifacts/stop_session`，`run_session` 聚合流事件返回 text + terminal_event + event_count，并回 `structuredContent`。原因=①它是完整运行时：Hono HTTP + SQLite + React Console + CLI/SDK + local/Docker/K8s/self-hosted 沙箱 + MCP toolsets + skills + credential vaults + audit/replay，体量和定位远超本仓库「可 `dsh plugin add` 的 bundle/预设」子项目；②License Apache-2.0 与本仓库「各子项目 MIT、以 MIT 对外分发」约定冲突；③分发有坑：npm 上 `managed-agents@0.0.1` 是另一个占位包（README 自己警告不要 `npm install managed-agents`），`@sandbaseai/sandbase-harness` 未发布，所以 README 里 `dsh plugin add managed-agents` 不能直接当作 npm 包安全安装，官方路径是 clone tag + `npm ci && npm run build && npm link` 再起 runtime + 装 bundle；④DSH 集成只是把 DSH 当 MCP client 接入外部 runtime，需要先 `managed-agents start`（http://127.0.0.1:3000），不是开箱即用插件；⑤上游验证基线是 DSH commit 47f9438，本机 npm rc.6 未实测。解法=判定：**不整体收编为本仓库子项目、不 git subtree add；当前也不建议往 DSH profile 装**（除非确实要用 SandBase 的持久会话/沙箱/审计能力）；如需体验应严格按官方 source 构建流程，在独立环境跑 runtime + MCP 桥，切勿 `npm i managed-agents`。它的 DSH 集成部分可作「纯 MCP client bundle」范式参考：官方 `@deepseek-ai/dsh-mcp-client` 单行 insert + stdio + env 透传 + `failOnStartupError`，对外部 runtime 暴露工具无需自写 host 插件；`run_session` 聚合到 idle 再返回 text/terminal_event 的「委托长任务」语义也值得 dsh-essentials 任务委托参考。可复现?是（git ls-remote + 浅克隆读 README/package.json/examples/deepseek-harness/{cordis.yml,README.md}/src/mcp/server.ts + GitHub API + npm view 可复现；未安装到 DSH profile、未改本仓库代码）。
- **dsh-mac-desktop 四次复审（2026-08-16，修复）**：再审发现 index.js 的 `defaultDshHome()`
  对 `$DSH_HOME=""` 会返回空串，与 Tauri 侧已修的空串兜底不一致。解法=`defaultDshHome()`
  改为仅接受非空且 trim 后非空的 `$DSH_HOME`，否则回退 `~/ .dsh`；node --check 与 diff check
  通过。其余未发现新的功能性问题。可复现?是（源码可复现）。
- **BitFun（GCWing/BitFun）可借鉴点记录（2026-08-16，记录）**：用户要求把 BitFun 中可借鉴/可参考的内容独立落档（上一轮已记录安装/收编判定：不安装、不收编，本条目单独展开设计参考）。问题=BitFun 主体虽不纳入本仓库，但 `packages/dsh-acp` 与产品工程里有多个对 dsh-essentials / dsh-mac-desktop / dsh-router-standard / 未来宿主集成有参考价值的理念。解法=按对本仓库可落地度整理：
  ①**外部宿主嵌 DSH = profile + ACP，不是 bundle**：独立产品内嵌 DSH 时建
  `$DSH_HOME/profiles/<name>/`（`dsh.profile.bundles: []` + cordis.patch.yml 全量 insert）跑
  `dsh --profile`，比往用户 profile 塞插件更干净、可整体替换；dsh-mac-desktop 或未来宿主可参考。
  ②**ACP 展示层是产品决策**：官方 @deepseek-ai/dsh-acp 是 automation-only，故意不发布 tool
  calls/reasoning/plans；BitFun fork 成 IDE 可见。做 IDE/可视化客户端时「协议能通 ≠ 信息足够」，
  展示数据上 wire 按客户端设计；更优是推动官方加 verbosity 开关。
  ③**profile 依赖最小化**：profile node_modules 只放 DSH closure 外的 vendored 包
  （@agentclientprotocol/sdk、dsh-agent-spine-demo），其余从用户已装 dsh 的 flat closure 解析，
  不装第二份 harness；与我们 mode-boost/router-standard 的非 bundle 分发一致。
  ④**远程 profile 同步**：编译好的 profile tar 流经会话 transport 推到远端，stamp 一致跳过，
  无 SFTP；适合 dsh-mac-desktop 未来远程工作区/容器。
  ⑤**会话 load/resume 与 mode 锁定**：ACP loadSession 从 JSONL 回放，存储 mode 覆盖 roster
  默认；会话开始后禁止切 preset，避免日志出现新组合无法复现的工具调用；预设系统可参考
  「首轮后锁定工具集」。
  ⑥**上下文经济**：byte-stable prompt assembly 达 98.67% KV cache hit；flashgrep 跨轮索引把
  大仓搜索提速 ~36x。DSH 插件侧可借鉴「prompt 顺序/字节稳定」与「搜索工具跨轮索引」。
  ⑦**任务即界面**：Mini App 给任务生成 UI 并绑定会话 live state，与 dsh-essentials 可视化卡片
  「会话↔UI 状态绑定」同方向。
  ⑧**自托管零知识 relay**：Argon2id + AES-GCM、用户自部署；远程/外发/多设备同步功能设计时可参考。
  ⑨**工程纪律**：远程场景 first-class、profile 生成/校验脚本、i18n/theme audit；本仓库已有类似，
  可补「profile 产物防漂移」门禁。
  注意=只借鉴思想/写法，不搬源码；dsh-acp 是 fork 官方 MIT，若抽取需保留 NOTICE。可复现?是
  （读 README/AGENTS/packages/dsh-acp/docs 可复现；未安装、未改产品代码）。
- **AgentRQ 安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/agentrq/agentrq 问适不适合安装到本仓库并收编。问题=agentrq/agentrq 是「人机协作任务平台」monorepo（Go/Fiber backend + Vue3 frontend + MCP server + ACP/Codex gateway + integrations/docker），不是独立 DSH 插件；其 `plugins/deepseek-harness` 才是真 DSH bundle，已发布 npm `@agentrq/dsh-plugin-agentrq@0.2.1`（Apache-2.0，`dsh.bundle.patch`→`cordis.patch.yml` 单行 insert，自带 `@deepseek-ai/dsh-mcp-client` 子 fiber + `agentrq:protocol` systemPrompt 段 + `agentrq_autopull` 工具，把 AgentRQ workspace 的任务/消息推送实时注入 DSH 会话）。原因=①技术上可安装：临时 DSH_HOME `dsh plugin --profile test add @agentrq/dsh-plugin-agentrq` 成功，`--dump-config` 出现 agentrq 行；npm 装依赖后 build/typecheck/32 测试全过；直接 import 可经 `$DSH_HOME/profiles/node_modules` 解析到全局 rc.6 的 dsh-* 模块。②但不宜直接收编：License Apache-2.0 与本仓库「各子项目 MIT、以 MIT 对外分发」约定冲突；功能强依赖 AgentRQ 远端/自托管 workspace（`url`+`token`），无 AgentRQ 账号装上无用，属外部服务集成而非通用增强；上游是 monorepo，收编需先 `git subtree split --prefix=plugins/deepseek-harness` 只取子目录，升级/维护比独立仓库复杂；npm 发布版 peerDeps 版本滞后（dsh-llm/dsh-tools/dsh-mcp-client/dsh-system-prompt 写 `^0.0.1-rc.1`，semver 不含 rc.6 的 `0.1.0-rc.6`，虽 dsh CLI 实际能加载但 pnpm 报 missing peer，独立构建解析到 rc.1 类型，属上游应修项）。解法=判定：**可单独安装试用（仅当使用 AgentRQ 时），当前不建议收编为本仓库子项目/并入 dsh-essentials**；若用户坚持收编，需先决策 License 策略（Apache-2.0 子项目保留 LICENSE/NOTICE）、把 dsh-* 移入 dependencies 或放宽 peer 到 rc.6/`*`、用 subtree split 只收 `plugins/deepseek-harness` 并补 THIRD-PARTY/README 行。涉及理念=①**服务端推送而非客户端轮询**：AgentRQ 服务端在任务创建/每 60s ticker 推送 `notifications/claude/channel`，DSH 侧只订阅不轮询，避免双投；②**一个 workspace 一个 profile**：URL 存 profile patch，`scope: single-agent` 只让一个根 agent 持有会话，防多会话重复投递；③**原文转发 + JSON 转义 framing**：推送不分类，只加 `chat_id`/`content_json` 框，防伪造字段；④**MCP 桥由插件自挂子 fiber**：`ctx.plugin(mcpClient, ...)` 与自有 workspace session 同生命周期，URL 单点配置；⑤**补齐 MCP server Instructions**：harness 不展示 server instructions，插件用 `ctx.systemPrompt.section` 补 AgentRQ 协作协议；⑥**断线指数退避 + catchUpOnStart + seen 去重**：会话断开不丢活（服务端会补推），启动 catch-up 只提速度；⑦**bundle 自包含**：npm 包只发 lib+cordis.patch.yml，README 把「安装即契约」写得很清楚；收编 monorepo 子目录必须 split。可复现?是（git ls-remote main 52721b9 + 浅克隆读 `plugins/deepseek-harness/{src,test,package.json,cordis.patch.yml,README.md}` + npm registry 0.2.1 + 临时 DSH_HOME 安装/dump-config 可复现；未安装到本机真实 profile、未改本仓库代码）。
- **Aegis（GanyuanRan/Aegis）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/GanyuanRan/Aegis 问适不适合安装到本仓库并收编。问题=它是「Aegis Method Pack」（v2.8.1，MIT，默认 main，浅克隆 HEAD c8483d6，~11MB/511 文件，22 个 Agent Skills + docs/current 基线 + benchmarks + assets + Python scripts），不是单纯 DSH 插件，而是一套多宿主「方法包」；但它的 DSH 集成是**真原生 bundle**：根 package.json `dsh.bundle.patch → ./extensions/dsh/cordis.patch.yml`，patch 单行 insert `id: aegis-method-pack / name: aegis/extensions/dsh/index.js`，index.js `inject: [skills, agents]`，用 `@deepseek-ai/dsh-skill-filesystem` 的 apply 把发现隔离到包内 `skills/`（includeDefaultRoots:false、watch:false），并在 auto 模式监听 `agent/session-start`（startup/resume/clear/compact，跳子代理）同步注入 `using-aegis` 路由 bootstrap。原因=①MIT 与本仓库 License 兼容；②形态是 bundle，不是普通 skill 包；③DSH 官方安装文档（docs/README.deepseek-harness.md）写明默认 `dsh plugin --profile <profile> add github:GanyuanRan/Aegis`，还有独立 `tests/deepseek-harness/` 边界测试；④但它也是大而全的多宿主 method pack（Codex/OpenCode/Claude/Kimi/Pi 等大量宿主适配、Python workspace 脚本、基准图表），DSH 兼容性在上游矩阵里只是「structural install，尚无 release-level fresh smoke」；⑤**本地路径安装有坑**：`dsh plugin --profile web add /tmp/Aegis` 后 pnpm 把 `node_modules/aegis` 链到 profile 外，即使 `dsh --profile web --dump-config` 触发 `$DSH_HOME/profiles/node_modules` 平铺 fallback，`import('aegis/extensions/dsh/index.js')` 仍报 `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-llm`（Node 按真实路径解析，看不到 profile 的 flat closure）；改用 `github:GanyuanRan/Aegis#v2.8.1` 远程安装后包落在 profile 内，同样 import 通过。解法=判定：**适合作为 DSH profile 插件安装（推荐从上游 GitHub 安装，远程装后 rc.6 下 import/dump-config 实测通过）**；**有条件适合收编为独立第三方子目录 `aegis/` 或 `dsh-aegis/`（git subtree 跟随上游）**，但收编前必须解决一键脚本本地安装的模块解析：要么 install 脚本对该子项目用 GitHub `&path:/aegis` 远程子目录安装，要么给 Aegis 的 package.json 补 `@deepseek-ai/dsh-llm` + `@deepseek-ai/dsh-skill-filesystem` dependencies / 纳入仓库 pnpm workspace 后再本地 link；不建议并入 dsh-essentials（体量/定位不同）。本次只做调研+落档，未安装到 DSH profile、未 git subtree add（工作树有无关未提交修改）。涉及理念=①**thin bundle 适配器**：不复制 skill 正文、不替换 native `skill` tool，只把一个隔离的 filesystem provider 指向包内 canonical `skills/` 树，再由 host 原生 skill 加载——DSH 侧做「技能/方法包」类插件可照此最小侵入。②**生命周期同步 bootstrap**：在 plugin apply 时预读 `using-aegis/SKILL.md` 并构建好注入消息，`agent/session-start` 触发时同步 `agent.inject()`，避免首步模型与异步 skill 文件读竞争；explicit 模式关闭注入但仍可显式 `skill` 调用。③**方法包不是 runtime core**：明确无 GateDecision/PolicySnapshot/完成权威，用户指令优先，简单任务走 `Route: fast-path`，完成前给 A/B/C 证据槽 + TaskStartSnapshot + 单一 closeout 聚合——与本仓库「诚实能力边界」理念一致。④**多宿主 canonical skills + 生成视图**：同一 `skills/` 树经各宿主插件/直接拷贝/direct-child 暴露，updater 管理生成视图，且**同一时间只允许一条暴露路径**，避免重复 owner；收编多宿主项目时可借鉴「canonical 源 + 宿主视图 + 去重约束」。⑤**doctor 验证门禁**：`python scripts/aegis-doctor.py --write-config --json` 要求 `ok:true` + `workspaceSupport:available` + `configStatus:configured`，DSH 收编/安装验证可参考这种「结构化 doctor + 明确字段门禁」。验证=本机 rc.6 下：Aegis 自带 `bash tests/deepseek-harness/run-tests.sh`（不带 --integration）确定性检查全过；远程 GitHub 隔离 profile 安装 `dsh plugin --profile web add github:GanyuanRan/Aegis#v2.8.1` → `dump-config` 见 `id: aegis-method-pack` → `import('aegis/extensions/dsh/index.js')` ok；doctor 输出 `ok:true/workspaceSupport:available/configStatus:configured`。注意=①Aegis 自带 integration 脚本在 macOS 上因 `mktemp` 落在 `/var/folders` 被其安全白名单拒（只允许 /tmp、/var/tmp、$TMPDIR 前缀），但手工隔离安装已覆盖验证；②若未来收编，升级用 `git subtree pull --prefix=aegis https://github.com/GanyuanRan/Aegis.git main --squash`，并对照 THIRD-PARTY 复查本地依赖/安装修改点。可复现?是（git ls-remote + 浅克隆 + 远程隔离 profile 安装 + node import + doctor 均可复现；未安装到本机 DSH profile、未改本仓库代码）。
- **dsh-mac-desktop 三次复审（2026-08-16，修复）**：再审发现 3 个 UX/边界问题。问题=①macOS
  窗口隐藏后点 Dock 图标不会重新显示（没实现 `applicationShouldHandleReopen`）；②Tauri 设置
  窗口已存在时再次点“设置…”不聚焦/不显示；③Tauri `DSH_HOME` 为空字符串时会被当成有效 home。
  解法=Swift 加 `applicationShouldHandleReopen → showMainWindow`；Tauri `open_settings_window`
  改为 show+set_focus；`default_dsh_home` 空串跳过。验证=Swift make-app.sh 重建通过；Tauri
  cargo check 通过。可复现?是（源码可复现；GUI 真机未自动化）。
- **WeSight（freestylefly/wesight）安装/收编判定 + 外部调研（2026-08-16，判定/记录）**：用户发
  https://github.com/freestylefly/wesight 链接。问题=这是独立开源桌面 AI Agent 工作台
  （Electron+React+Vite+better-sqlite3，MIT，~879★/205 forks，homepage wesight.ai，latest release
  v1.0.4 2026-08-03，main HEAD 53ce05f，浅克隆 ~61MB/449 src 文件），不是 DSH bundle/预设/skill：
  仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无任何 DSH/Cordis/deepseek-harness
  引用；唯一相关项是把独立 `deepseek-tui` CLI 当受管外部引擎（`spawn('deepseek-tui', [
  '--workspace', ..., 'serve', '--http', ...])`），与 DSH 的 `dsh-tui`/DeepSeek Harness 是不同
  项目，勿混淆。原因=本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能；WeSight 是完整
  Electron 桌面产品（自带内置 agent runtime、bundled OpenClaw v2026.3.2、IM Agent Hub、SkillHub、
  scheduled tasks、memory、runtime telemetry、desktop pet），体量/技术栈远超插件范围；MIT 兼容
  不是收编理由。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；
  如需体验可单独下载 WeSight 桌面 App 作外部宿主/多引擎控制台参考。
  可借鉴理念（已落档）：①**GUI/Cowork/Engine 三层解耦**：渲染层只消费统一 Cowork 标准事件，
  `CoworkEngineRouter` 按 `agentEngine` 切换 Claude Code/OpenClaw/内置 runtime，引擎切换时清理
  活动会话；DSH 桌面壳/多引擎 UI 可借鉴「统一会话事件 + 引擎路由器 + 引擎状态机」，避免 UI 感知
  具体引擎。②**外部 CLI 托管模式**：`DeepSeekTuiRuntimeManager` spawn CLI → 找空闲端口 + 随机
  token → `serve --http --host 127.0.0.1 --auth-token` → 轮询 `/health` 就绪，退出时
  SIGTERM→2s SIGKILL；接入任意外部 agent CLI 到 DSH 桌面壳可照此「子进程 + 本地 HTTP + 健康检查
  + 生命周期清理」。③**配置同步与模式映射**：`OpenClawConfigSync` 把 UI 模型/executionMode 映射
  到外部 runtime 配置（local→sandbox.mode=off、auto→non-main、sandbox→all），切换后按需重启
  网关；与 DSH 的 settings.mutate/外部 provider 同步思路一致。④**运行时遥测**：TTFT、输出阶段
  TPS、工具延迟、步数、状态、时长采集到 SQLite 并在 dashboard 展示；dsh-essentials 使用统计可扩展
  「工具延迟/步数」维度。⑤**IM Agent Hub**：Feishu 等 IM 消息路由到 OpenClaw/Hermes/Claude/Codex，
  每引擎 bot profile；若 DSH 要做 IM 桥可参考「统一入口 + 按引擎配置」而非每平台一套逻辑。
  ⑥**SkillHub/Scheduled Tasks/Memory/Pet**：技能市场、定时任务、记忆抽取、桌面宠物都是独立桌面
  产品常见功能，可作 dsh-essentials/dsh-mac-desktop 功能规划参考，但无需收编。⑦**Electron 打包/
  发布**：electron-builder + macOS 签名/公证/staple + Windows NSIS + SHA256，与 dsh-mac-desktop
  （Swift/Tauri 轻壳）路线不同，可参考 CI 产物校验与发布清单纪律。注意=①bundled OpenClaw 是另一
  个 agent 运行时，与 DSH 无集成；②Node>=24 大工程，不适合插件化；③`deepseek-tui` 不是 DSH，
  名字像但生态不同。可复现?是（git ls-remote + 浅克隆读 README/docs/architecture/package/src +
  `gh repo view` 可复现；未安装、未改本仓库代码）。
- **agent-qa 可借鉴点记录（2026-08-16，记录）**：把 vostride/agent-qa 调研中值得 DSH 插件/预设/技能借鉴的设计理念落档，用户只要事项和想法、不要源码。解法=按「对本仓库可落地度」整理：①**自然语言测试即代码 + QA 工件版本化**：测试/套件/钩子/记忆/配置全部是 YAML+git 可 diff 文件，每个 run 产物（artifacts/logs/memory）也有版本可回看；DSH 做「任务模板/回归验证/可复现工作流」时可借鉴「能力与工件都进仓库、可 diff/review/复用」，而不是只把结果留在会话。②**自愈执行 + 经验回写**：任一子动作（click/fill/select）失败后不立即判失败，而是重新观察 UI、在当前 run 内换路径重试；把被治愈的步骤 curate 进 execution memory 供未来 run 使用；action cache 复用已验证计划降 planner/token/耗时。DSH 插件做浏览器/QA/自动化工具时可做「失败重试 + 经验回写 + 计划缓存」三层，而非一次性执行。③**多面交付 + skill 分层**：同一能力同时有 CLI、本地 dashboard、MCP、skills；skills 按 authoring/debug-fix/result-triage 拆开，分别强调 canonical ID、schema 引用、验证后运行、证据规则（优先 MCP 证据、禁止脑补 selector/日志/截图）；DSH skill 可参考这种「按生命周期拆技能 + 严格前置验证 + 证据闭环」。④**MCP 桥接 DSH 的具体姿势**：`@vostride/agent-qa-mcp` 提供 `agent_qa_*` 工具（stdio/HTTP），DSH dsh-tools 明确支持「一 MCP server 一插件：发现工具后用其 schema 调 `ctx.tools.register()`」；若未来想让 DSH 会话直接用 agent-qa，建议写薄 MIT bundle 做 MCP client→`ctx.tools.register()` 桥，只依赖 `@vostride/agent-qa-mcp`，不 vendor agent-qa 源码（FSL-1.1-ALv2 不并入本仓库）。⑤**沙箱 hooks**：Node/Bun/Python/Bash 钩子在隔离 Docker 容器跑 setup/teardown/seed，结果结构化传回 run；DSH 侧可对应 subprocess/sandboxPolicy 表达，hook 与测试主体职责分离。⑥**BYO LLM**：OpenAI/Anthropic 兼容、Gemini、本地、Codex/Claude Code 订阅多后端；DSH 已有 provider 抽象，方向一致，可继续把「外部订阅认证」做成独立可选包（如 @vostride/agent-qa-subscription-auth 的形态）而不是内置。注意=①只借鉴理念/写法，不搬源码（FSL-1.1-ALv2 非 MIT，两年后才转 Apache-2.0）；②若落地 MCP 桥，先用 Inspect Provider / npm 包产物核对 `ctx.tools.register()` 的 ToolDefinition 契约；③agent-qa 本身 Node>=24、Playwright/Appium/Docker 重，DSH 侧只做桥或工具，不整体收编。可复现?是（git clone / npm view agent-qa 可复现；未安装、未改本仓库代码）。
- **Anionex/agent-vision-toolkit 安装/收编判定 + DSH 子包调研（2026-08-16，判定/可借鉴点）**：用户发 https://github.com/Anionex/agent-vision-toolkit 问适不适合安装到本仓库并收编。问题=该 URL 是一个「视觉工具箱」父仓库（默认 main，HEAD 77c24ad，2026-08-16，MIT，浅克隆 ~42MB）：内含 Python 3.11+ 视觉 CLI（bin/{glance,ground,detect,trace,crop} + ground.py/detect.py + vision_client.py/vision_proxy.py）、vision-tools skill、Codex/Claude Code/Pi/OpenCode extensions，以及一个 Git submodule `dsh-vision-toolkit`——后者才是真正可 `dsh plugin add` 的 DSH Profile Bundle（独立仓库 Anionex/dsh-vision-toolkit，MIT，v0.1.9，HEAD 2192c98，npm @anionex/dsh-vision-toolkit 0.1.9）。原因=①父仓库整体不是 DSH bundle（无 dsh.bundle.patch/cordis.patch/dsh.client），不适合直接收编为子项目；②但 dsh-vision-toolkit 是原生 bundle：`package.json dsh.bundle.patch → cordis.patch.yml` 单行 insert `id: vision-toolkit`，`dsh.client` 声明 Web 半区，形态与本仓库约定一致，MIT 兼容 rc.6。解法=判定：父仓库不直接收编；其 DSH 子包技术上适合收编/安装，但**用户最终决定不安装、不收编，仅作理念落档**；本次未安装到 DSH profile、未 git subtree add、未改仓库代码。若未来改变主意再执行：先提交/stash 脏工作树 → `git subtree add --prefix=dsh-vision-toolkit https://github.com/Anionex/dsh-vision-toolkit.git main --squash -m "chore: merge dsh-vision-toolkit (third-party, MIT)"` → README/THIRD-PARTY 各补一行 → `pnpm run verify:portable` → 可选 `dsh plugin --profile web add ./dsh-vision-toolkit`。要点=①10 个 `vision_*` 工具（glance/ground/detect/crop/trace/pixel_diff/long_screenshot_ocr/extract_foreground/dominant_colors/html_screenshot）+ 自带 `vision-tools` skill；②**渐进暴露**：初始只有 `vision_toolkit_activate`，Agent 加载 skill 后才挂 10 个 schema，健康/版本永远不进模型 schema；③**managed 运行时**：vendor 固定上游快照 + UPSTREAM_MANIFEST 哈希 + requirements.lock（pillow/numpy/vtracer），uv→venv 兜底，prepare 成功才原子切 generation；④**Credentials 只存引用**：Settings 写 key 后浏览器只回显引用，每次调用解析并注入子进程 env，错误/日志脱敏；⑤**Artifacts**：只写 `<workspace>/.dsh-vision-toolkit/artifacts`，带签名 URL 预览/下载，无 HTTP host 时降级 Open file；SVG fail-closed 校验；⑥**image-input variants**：为 text-only 模型注册 `<model> (Vision Toolkit)` 变体，粘贴自动切变体走原生附件流，仅 wire 上把图改写为描述文本、会话日志不动——**与 dsh-essentials 内置 ModLens/paste-input 高度重叠**（ModLens 也做变体+粘贴接管），v0.1.8 前旧结论「工具驱动不冲突」已过时，建议二者选一或关闭一方的 imageInputVariants/paste 接管并先做共存实测。具体核对=①工具名不撞：ModLens=`modlens_read_image`，Vision Toolkit=`vision_*` 十个，skill 名 `modlens` vs `vision-tools`；②bundle patch id 不撞：现有 `essentials`/`desktop-runner`，新包 `vision-toolkit`；③HTTP 路由不撞：ModLens=`/modlens/paste`+`/modlens/config`，Vision=`/_dsh/vision-toolkit/paste-policy`+`paste-images`；④模型变体不撞但重复：ModLens=`(modlens vision)`/`modlens-*`，Vision=`(Vision Toolkit)`/`vision-toolkit-*`，同一 text-only 模型会出现两组变体；⑤粘贴监听都会 `document.addEventListener('paste', ..., true)`，且都做 wire 图片块改写，可能竞态/双处理；⑥slot 有交集但 id 不同：共用 `conversation.input.dock`（paste-input id=`dsh-paste-input-dock`，Vision id=`vision-toolkit-pasted-images`）、`settings.section`（essentials 多个 vs Vision id=`vision-toolkit`）、`tool.call.toolview`（visualize vs Vision 各工具 key），一般可共存但视觉相关 UX 会堆叠；⑦运行时依赖不冲突：Vision 额外要 Python/uv 托管环境，现有仓库无此依赖；文件级新增 `dsh-vision-toolkit/` 目录不覆盖现有文件。⑦诚实能力边界：P2 稳定 `ctx.visionToolkit` 服务在无独立消费方前不发布。轻量对比=ModLens 明显更轻：npm unpacked ~0.53MB（DSH 内只含 dsh/ + dist/main.js ~272KB），单工具 `modlens_read_image`，纯 Node 跑内置 dist/main.js，无 Python/uv；Vision Toolkit npm unpacked ~5.8MB（约 11 倍），10 个 `vision_*` 工具 + skill + Artifacts/Web Settings，且 managed 运行时要 Python 3.11+/uv（pillow/numpy/vtracer，首次联网）。结论=只「看图/贴图识别」选 ModLens；要 grounding/detect/crop/pixel diff/OCR 管线/UI 还原等重能力才需要 Vision Toolkit。注意=Node 需 ^22.19||>=24，Python 3.11+，managed 首次运行要联网装 Python 包；`pnpm run verify:portable` 本地已跑通过（28 required files/25 JS/26 images）。可复现?是（git clone + verify 可复现；未安装、未改本仓库代码）。
- **brooks-lint 安装/收编判定（2026-08-16，判定/记录）**：用户发 https://github.com/hyhmrright/brooks-lint 问适不适合安装到本仓库并收编；追问「再分析，还不明朗」。问题=它是纯 Agent Skills 代码质量工具（v1.5.0，MIT，main HEAD d4b5c408，浅克隆 3.4MB/skills 144KB，114 测试通过），不是 DSH bundle/预设：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无 Cordis 代码；DSH 接入方式是标准 SKILL.md Agent Skills，v1.5.0 新增 `docs/dsh-setup.md`，安装器 `scripts/install.sh dsh` 把 `skills/` 六个 `brooks-*` + `_shared/` 平铺到 `$DSH_HOME/skills`（`--project` 到 `.dsh/skills`）。原因=DSH rc.6 `@deepseek-ai/dsh-skill-filesystem` 契约确认：发现只扫 `<root>/<name>/SKILL.md` 或 `<name>.md`（一层平铺），名字必须 kebab-case，`../_shared/` 靠兄弟目录解析；brooks-lint 的 `brooks-*` 和 `_shared` 正好满足，实测 `/tmp/brooks-lint/scripts/install.sh dsh --dir /tmp/brooks-dsh-skills` 安装 6 skills 成功。本仓库当前子项目均为 `dsh plugin add` 的 bundle/预设；若把 brooks-lint 收进 `dsh-brooks-lint/`，`scripts/install.sh` 会自动发现其 package.json 并尝试 `dsh plugin add`（会失败/无用），需要新增 skill 安装分支或改用非 `dsh-*` 目录，且仓库「每个子目录都是独立 DSH 插件/bundle」的契约要改。收编可行但收益低：上游多平台内容（Claude/Codex/Gemini/Cursor 等）与 DSH 无关，纯 DSH 可用部分只有 144KB skills；本仓库已有外部 Agent Skill 先例（gpt-image-2-style-library / dot-skill）都是装到 `~/.agents/skills` 而不收编。解法=判定：**适合作为 DSH 外部 Agent Skill 安装（一条命令），现阶段不建议作为本仓库 bundle 收编/不做 git subtree add**；若用户后续要自维护/离线分发，再以 `brooks-lint/`（非 dsh-*）收编为 skill 源目录并改 install 脚本，或做薄 DSH skill 包装。涉及理念=①**经典工程书→可执行诊断框架**：把 12 本经典书（人月神话/Code Complete/Refactoring/Clean Architecture/程序员修炼之道/DDD/A Philosophy of Software Design/SE@Google/单元测试艺术/Google 测试/遗留代码/xUnit Test Patterns）提炼为 6 个生产代码衰减风险（R1 认知过载/R2 变更传播/R3 知识重复/R4 意外复杂度/R5 依赖混乱/R6 领域模型失真）+6 个测试衰减风险（T1 测试晦涩/T2 脆弱/T3 重复/T4 Mock 滥用/T5 覆盖幻觉/T6 架构不匹配），把「原则」变成可触发、可诊断、可打分的检查维度。②**Iron Law：先诊断后开方**：每条 finding 必须 Symptom→Source→Consequence→Remedy，禁止跳过诊断直接给修复；这是让 AI 审查可追溯、可防「先射箭再画靶」的关键。③**可复现/诚实边界**：解析器用 30 份冻结真实报告做确定性 benchmark（severity 计数 30/30、risk-code 0 FP/0 FN、SARIF 合法 30/30），57 场景 eval 区分结构 vs live；README 明确 parser 只测“报告解析保真”，不声称 finding 一定正确，live 指标会波动。④**多平台标准 Agent Skills 分发**：SKILL.md + 平铺布局 + `_shared/` 共享框架 + kebab-case 名字，让同一套技能被 Claude/Codex/Gemini/Cursor/OpenCode/DSH 等原生发现；DSH 也遵循此契约，所以「非 bundle」不等于「不能装」。⑤**工程自举**：仓库用 `npm test`（114 个）守护自身文档/版本/安装器/解析器一致性，`npm run validate` 校验 guide 步骤连续性、README 版本引用、平台清单；做插件/技能类收编前可先看对方是否自带自测。可复现?是（git ls-remote + 浅克隆读 README/docs/dsh-setup/scripts/install.sh/skills + npm test 114 通过 + /tmp 安装器实测可复现；未安装到本机 DSH、未改本仓库代码）。
- **BitFun（GCWing/BitFun）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发
  https://github.com/GCWing/BitFun 问适不适合安装到本仓库并收编。问题=BitFun 是独立桌面 AI Agent
  （README 定位「A desktop AI agent that turns every task into an app you can open」），MIT，
  main HEAD 8aad825，v0.2.18；形态=Rust workspace + React/Tauri 全栈（desktop/CLI/server/
  relay/mobile-web/installer/mini-app market），Cargo workspace 数十 crate，仓库体积大
  （codeload tar gzip 原始解压 ~318MB，下载 60s 超时只部分解压）。它**不是 DSH bundle/预设/
  skill**：根仓库无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`；与 DSH 的关系是**外部
  宿主**——把 DSH 当可替换 Agent runtime，通过 `packages/dsh-acp` 的 ACP 桥 + `dsh --profile
  bitfun-acp` 拉起用户已装的 harness，读取用户自己的 `~/.dsh/settings.yaml` 与
  `.credentials.yaml`。唯一 DSH 形态组件是 `packages/dsh-acp`（private @bitfun/dsh-acp v0.0.1，
  MIT，fork 官方 @deepseek-ai/dsh-acp + dsh-acp-demo）：把官方 automation-only ACP 故意不下发
  的 tool calls/reasoning/plans 发布给 IDE；构建为 `$DSH_HOME/profiles/bitfun-acp/` profile
  （package.json `dsh.profile.bundles: []` + 生成 cordis.patch.yml + presets
  standard/code/minimal），**不是 `dsh plugin add` 的 bundle**。原因=本仓库子项目必须是可安装/
  维护的 DSH 插件、bundle 或预设；BitFun 主体是完整独立 agent 运行时（自己的 UI/agent loop/
  tool/远程/桌面），体量与 Rust+React 技术栈远超插件范围，整体收编会破坏 monorepo 插件边界；
  MIT 兼容不是收编理由。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree
  add**；如需体验可单独下载 BitFun 桌面 App（外部宿主，与 DSH 并行）。其 `packages/dsh-acp`
  若未来要做「IDE 版 DSH」可单独抽取成独立 profile 源，但更优路径是推动上游
  @deepseek-ai/dsh-acp 增加 verbosity/presentation 开关，避免长期维护 fork。
  涉及理念=①**外部宿主嵌 DSH = profile + ACP，不是 bundle**：独立产品要内嵌 DSH 时，建
  `$DSH_HOME/profiles/<name>/`（空 bundle 列表 + cordis.patch.yml 全量 insert）跑 `dsh
  --profile`，比往用户 profile 塞插件更干净、可整体替换。②**ACP 展示层是产品决策**：官方
  dsh-acp automation-only 不发布 tool/reasoning/plan，IDE 场景需要 fork 补发；做外部客户端时
  「协议能通 ≠ 信息足够」，展示数据是否上 wire 按客户端需要设计。③**profile 依赖最小化**：
  profile 的 node_modules 只放 DSH closure 外 vendored 包（@agentclientprotocol/sdk、
  dsh-agent-spine-demo），其余从用户已装 dsh 的 flat closure 解析，不装第二份 harness；
  与我们 mode-boost/router-standard 的非 bundle 分发思路一致。④**远程 profile 同步**：把编译好
  的 profile tar 流经会话 transport 推到远端，stamp 一致跳过，无 SFTP，适合容器/SSH 远程
  工作区。⑤**会话 load/resume 与 mode 锁定**：ACP loadSession 从 JSONL 回放，存储 mode 覆盖
  roster 默认；会话开始后禁止切 preset，避免日志出现新组合无法复现的工具调用；预设系统可参考
  「首轮后锁定工具集」。⑥**上下文经济**：byte-stable prompt assembly 达 98.67% KV cache hit，
  flashgrep 跨轮索引把大仓搜索提速 ~36x；DSH 插件侧可借鉴「prompt 顺序/字节稳定」与「搜索工具
  跨轮索引」。⑦**任务即界面**：Mini App 给任务生成 UI 并绑定会话 live state，与
  dsh-essentials 可视化卡片的「会话↔UI 状态绑定」同方向。⑧**自托管零知识 relay**：Argon2id +
  AES-GCM、用户自部署，远程/外发功能设计时可参考。注意=①codeload 下载超时/截断，仅部分解压
  （根文档、Cargo.toml、packages/dsh-acp 完整）但已足够判定形态；②`src/crates/adapters/
  dsh-adapter` 在 Cargo members 中但未在截断包里读到，判定不受影响；③dsh-acp 是 fork 官方
  MIT，若未来借鉴/抽取需保留 NOTICE 与 MIT 归属。可复现?是（git ls-remote + codeload tar 部分
  解压读 README/AGENTS/package/Cargo/packages/dsh-acp 可复现；未安装、未改本仓库代码）。
- **agent-qa（vostride/agent-qa）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发 https://github.com/vostride/agent-qa 问适不适合安装到本仓库并收编。问题=它是独立「自改进 Agentic QA harness」（default main，浅克隆 HEAD 22636e1（2026-08-03），npm agent-qa@0.1.21，TypeScript，~831★，13M/840 文件，Node>=24 + pnpm workspace + turbo），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无任何 DSH/Cordis 集成（仅测试里出现 deepseek-chat 作 LLM provider）；形态=CLI + 本地 dashboard（SQLite）+ MCP server + 3 个 SKILL.md（authoring/debug-fix/result-triage）+ Playwright/Appium 适配 + Docker hooks。原因=①形态不匹配：`dsh plugin add` 只收 bundle 补丁，agent-qa 是独立大 monorepo（9 个包，840 文件，Playwright/WebdriverIO/Appium/Docker/Node>=24），整体收编会引入非 DSH 的 QA 运行时；②License 不兼容：FSL-1.1-ALv2（Functional Source License，两年后转 Apache-2.0，NOTICE 版权 Pranshu Chittora），非 MIT/OSI，本仓库以 MIT 分发且各子项目均为 MIT，直接 git subtree 收编会把 FSL 文件带进 MIT 仓库，无法重授权；③它的 skills 虽可被 DSH 扫 `~/.agents/skills` 发现，但依赖 agent-qa MCP/CLI 运行时，不是独立可用 skill。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；如需使用建议独立 `npm install -D agent-qa` / `npx agent-qa init` 跑 QA，与本仓库无关；若未来想让 DSH 会话直接调 agent-qa，可做薄 MIT bundle 桥接其 MCP server（`@vostride/agent-qa-mcp`）到 `ctx.tools.register()`（DSH dsh-tools 明确支持「一 MCP server 一插件」模式），只依赖不 vendor 源码。涉及理念=①「自然语言测试即代码」：测试/套件/钩子/记忆/配置全以 YAML+版本控制文件存在，可 diff/review/复用，值得 DSH 任务模板/回归场景参考；②「自愈执行 + 记忆」：子动作失败后重观察 UI 改走路径、把治愈步骤写进 memory、action cache 复用已验证计划降低 token/耗时——DSH 插件做浏览器/QA 工具可借鉴「失败重试 + 经验回写」而非一次性执行；③「多面交付」：CLI+dashboard+MCP+skills 同一能力多入口，skills 按 authoring/debug-fix/result-triage 拆分并强制 canonical ID/schema 引用/证据规则（优先 MCP 证据、禁止脑补 selector/日志）——DSH skill 分层可参考；④「沙箱 hooks」：Node/Bun/Python/Bash 钩子跑隔离 Docker 容器做 setup/teardown/seed，DSH 侧可用 subprocess/sandboxPolicy 表达；⑤「BYO LLM」：OpenAI/Anthropic 兼容、Gemini、本地、Codex/Claude Code 订阅多后端，DSH 已有 provider 抽象，方向一致。可复现?是（git ls-remote + 浅克隆 + npm view agent-qa 可复现；未安装、未改本仓库代码）。
- **EchoBird 可借鉴点确认（2026-08-16，确认）**：用户要求把 EchoBird 中值得借鉴的内容落档。问题=是否已把 EchoBird 对本仓库（dsh-mac-desktop / dsh-essentials / host 侧）可落地的理念完整存档。原因=此前已有「EchoBird 可借鉴点记录」详细条目，但位置较深，且本对话先做的是安装/收编判定，容易被忽略。解法=确认已落档并在此汇总核心：①**外部切 DSH 模型的配置面**：写 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.echobird` 路由（displayName/apiKeyEnv/api/baseURL/models）+ `agent-default-model` 选择器，密钥写 `~/.dsh/.credentials.yaml` 的 `ECHOBIRD_API_KEY`，restore 时反写删除；做 dsh-mac-desktop 模型切换外部接口可直接照此契约，YAML 用 serde_yaml_ng 避免 PyYAML 裸 `off` 坑（本仓库已踩过）。②**DSH zstd 会话日志直读契约**：`<DSH_HOME|~/.dsh>/sessions/<project>/<session>/session.jsonl[.zstd]` 为 checksummed 多帧 concat，首行 header，事件含 session/title（最新胜出）、user/message、turn/start（计轮数）；Rust `zstd::stream::read::Decoder` 与 JS node zlib 逐帧重写互证。③**`dsh web` 进程管理**：按平台探测 dsh 路径（%APPDATA%\npm、/opt/homebrew/bin、/usr/local/bin 等），spawn 后轮询 127.0.0.1:3080 再开浏览器，切模型后 kill+重启保证确定性，EADDRINUSE 容忍。④**tools/<id>/{config,paths}.json 工具管理抽象**：统一 apply/restore，适合未来桌面 App Manager，DSH 插件侧不需要。⑤**外部 agent 循环防护（低优先）**：MAX_CONTEXT_BYTES≈300KB 字节预算、同 tool+args 哈希环形缓冲 3 次判循环、MAX_TOOL_LOOPS=150 兜底。⑥**本地 LLM 管理（背景）**：vLLM/SGLang/llama.cpp + GGUF + Anthropic↔OpenAI 代理，独立产品能力。完整原文见 NOTES 内「EchoBird 可借鉴点记录」。可复现?是（NOTES 内可查原文；未新增代码）。
- **dsh-mac-desktop 二次复审（2026-08-16，修复）**：再审又发现 4 个小问题。问题=①macOS
  托盘图标未设 `isTemplate`，深色菜单栏下可能显示异常；②standalone（双击 App）没传
  profile/dsh-home 参数时托盘“打开 DSH 终端”菜单项被隐藏，无法使用；③Tauri 托盘直接复用窗口
  菜单，托盘菜单会带着“文件”子菜单层级；④Tauri standalone 无参数时打开终端 no-op。解法=Swift
  托盘图标设 `isTemplate=true`、终端项常驻并在无参数时回退 `~/ .dsh`；Tauri 新增独立 flat
  `tray_menu()`（显示/隐藏、终端、设置、退出），`open_dsh_terminal` 增加
  `DSH_HOME`/home 回退。验证=Swift make-app.sh 重建通过；Tauri cargo check 通过；
  node --check/package-consistency 通过。可复现?是（源码+构建可复现；GUI 真机仍未自动化）。
- **PicGo-Core 安装/收编判定（2026-08-16，判定）**：用户发 https://github.com/PicGo/PicGo-Core 问适不适合安装到本仓库并收编。问题=它是通用图片上传工具/库（v3.0.1，MIT，master 95db432，Node>=20.19，源码 ~20.5k LOC/1.8MB，npm 包名 `picgo`），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，无任何 DSH/Cordis 引用；形态是 CLI + Node API（`import { PicGo } from 'picgo'`）+ 可选 HTTP server（Hono，`picgo server`，支持 multipart/clipboard 上传与 secret 鉴权）+ 自带 PicGo 插件系统与云同步（cloud.picgo.app），内置 smms/github/imgur/qiniu/tcyun/upyun/aliyun/picgoCloud 上传器，配置落在 `~/.picgo/config.json`。原因=本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能，PicGo-Core 是独立通用 npm 包，虽然 MIT 兼容，但整体收编会引入非 DSH 的 2 万行 TypeScript + 大量依赖（axios/hono/inquirer/ejs 等）和它自己的插件生态/云服务，与本仓库插件边界不符；直接 `dsh plugin add picgo` 无法安装（非 bundle），`git subtree` 收编只会造成维护双轨。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；本机要单独用可 `npm install -g picgo`，与仓库无关。若未来 DSH 需要图片上传能力，建议做薄 DSH bundle 包装器而非收编源码：a) 把 `picgo` 作 npm dependency 在 host 侧 `new PicGo()` + `picgo.upload([path])`；b) 或 spawn `picgo upload <file>` / 调 `picgo server` HTTP 接口，把结果（imgUrl/items）转成 DSH 工具返回；上传器与凭据仍由 PicGo 自己的 `~/.picgo/config.json` 管理，DSH 侧不持久化第三方 token。涉及理念=①「外部运行时≠插件」：MIT 只解决可否复制，形态匹配（bundle/patch/服务契约）才决定可否收编；②「库依赖优先于源码收编」：通用库用 npm 依赖/子进程接入，只有 DSH 形态的插件才 git subtree；③「重活放 host、凭证隔离」：上传/网络/第三方登录放 host 侧，client 只收 JSON；④「外部服务合规」：SM.MS/GitHub/云服务等有各自防盗链/登录态/隐私边界，README 需写清楚会把文件发到哪个第三方。可复现?是（git ls-remote + 浅克隆读 package.json/README/src 可复现；未安装、未改本仓库代码）。
- **DeepTide（paean-ai/deeptide）安装/收编判定 + 可借鉴点（2026-08-16，判定/记录）**：用户发
  https://github.com/paean-ai/deeptide 问适不适合安装到本仓库并收编。问题=DeepTide 是独立 AI
  coding agent（README 自称「Built by DeepSeek, for DeepSeek」，但 NOTICE 声明与 DeepSeek/
  Anthropic 无隶属，勿当官方项目），不是 DSH 插件/bundle/预设/skill：默认 main，HEAD 4604b17
  （2026-07-08），MIT，浅克隆 ~18MB；仓库内无任何 `dsh.bundle.patch`/`cordis.patch.yml`/
  `dsh.client`，也无 DSH 字样。形态=三合一社区入口：①macOS 原生 Swift App（deeptide.sh 分发）；
  ②TypeScript/Bun CLI `deeptide`/`tide`（npm 0.11.8，bin.js 只是 thin redirect：设
  `ZERO_CLI_INVOKED_AS=tide` 后 import `@paean-ai/zero-cli/dist/_cli.js`，CLI 源码在上游
  zero-cli，运行需要 Bun）；③Rust 移植 `deeptide-rs`/`deeptide-gui`（crates
  deeptide-cli/core/gui/host，eframe/egui 桌面 GUI 与 CLI 共享 `~/.config/tide/settings.json`
  和会话存储）。另含 native/ 本地推理：`ds4`（DeepSeek V4 Flash Metal 引擎，MIT+ggml 归属）
  和 `dsgo`（Swift 本地 OpenAI/Anthropic 兼容网关），skills/ 10 个纯 SKILL.md 文档技能，
  samples/ 大量像素游戏/模板（~8.4MB）。原因=本仓库子项目必须可 `dsh plugin add` 的
  bundle/预设/技能；DeepTide 是独立 agent 运行时（自有 agent loop/tool/permission/memory/
  CLI/GUI），与 DSH 是同类替代而非插件扩展，体量/技术栈（Bun+Swift+Rust+原生推理）也远超
  插件范围。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；MIT
  兼容不是收编理由。如需体验可单独全局装 `bun add -g deeptide` / `npm install -g deeptide-rs`
  （外部 CLI，与 DSH 并行），或把其 skills/ 中可用的纯 SKILL.md 拷到 ~/.agents/skills 单独
  试用；若要 DSH 侧调用可未来写薄适配 bundle 包 `tide` 子进程，但当前不建议。
  可借鉴理念（已落档）：①**thin redirect / 单一事实源**：deeptide npm 包只留 launcher+元数据，
  全部引擎在上游 zero-cli，品牌包不重复实现；我们已有 dsh-tui launcher 与 router-standard
  「上游=源仓库」先例，发布时仍应坚持「薄壳包只转发、不 fork 引擎」。②**多形态共享一套契约**：
  macOS App / TS CLI / Rust GUI 通过 tide-spec 共享工具目录/斜杠命令/hook 事件/模型别名，CLI
  和 GUI 还共享同一 settings/session 文件，避免各端漂移；dsh-mac-desktop/headless/web profile
  可参考「接口契约 + 同一存储」来对齐。③**本地推理用稳定 HTTP 契约**：dsgo 暴露
  OpenAI/Anthropic 兼容端点并把请求路由到 ds4/llama-server，DSH 侧只要把本地网关配成 provider
  即可接入；任何本地运行时都应优先做兼容 API 面而非私有协议。④**npm 发布用 files 白名单**：
  native/ 源码留在 GitHub 供审阅/自建但不进 tarball；我们若未来发布大件/原生件可沿用「源码在
  仓库、发布物白名单」的分发纪律。⑤**纯 SKILL.md 文档技能**：DeepTide skills/ 是 sample-derived
  文档型 playbook，不绑运行时，agent 可廉价加载；与我们 ~/.agents/skills 共享目录思路一致，
  适合沉淀「玩法/视觉/交付/调研」类可复用技能。注意=①其 CLI 核心在 @paean-ai/zero-cli（源自
  Claude Code，MIT），收编/参考需按上游 NOTICE 处理；②本地 ds4 涉及 GGML 归属，若借鉴须保留
  native/ds4/LICENSE。可复现?是（git ls-remote + 浅克隆 HEAD 4604b17 读 README/package/
  Cargo/native/README/skills 可复现；未安装、未改本仓库代码）。
- **EchoBird 安装/收编判定（2026-08-16，判定）**：用户发 edison7009/EchoBird 问适不适合安装到本仓库并收编。问题=它是独立 Tauri 2 桌面产品（main ff9de43，v5.6.5，MIT），不是 DSH bundle/预设/skill：仓库内无 `dsh.bundle.patch`/`cordis.patch.yml`/`dsh.client`，只有 `tools/dsh/{config,paths}.json` + `docs/api/tools/install/dsh.json` 把 DSH 当受管 CLI（npm 全局装 `@deepseek-ai/dsh`、`dsh web` 起 127.0.0.1:3080、写 settings.yaml provider + agent-default-model + .credentials.yaml 切模型、直读 zstd 会话日志）。原因=本仓库子项目必须是可 `dsh plugin add` 的 bundle/预设/技能，EchoBird 是独立桌面 App（Rust ~23k 行 + 前端多页），形态与体量都不匹配；MIT 虽兼容但整体收编会引入庞大非插件代码。解法=判定：**不安装到 DSH profile、不收编为子项目、不做 git subtree add**；如需体验可单独下载 EchoBird 桌面 App（外部宿主/工具管理器），与本仓库只做设计互参（外部切模型配置面、zstd 多帧会话日志直读、dsh web 进程管理），已有外部调研与可借鉴点记录。可复现?是（git ls-remote + 浅克隆读 tools/dsh、docs/api/tools/install/dsh.json 可复现；未安装、未改本仓库代码）。
- **dsh-mac-desktop 自审修复（2026-08-16，修复）**：用户问「调整还有问题吗」。问题=①Swift
  关闭隐藏按 `title != "Settings"` 判断主窗口，中文设置窗口标题是「设置」会被误判成主窗口，
  关闭设置会隐藏而不是关闭，托盘显示/隐藏也可能切到设置窗口；②README 仍写「Only macOS
  opens a window」，与仓库内 Windows Tauri 壳事实不符。解法=Swift 改为 `isSettingsWindow`
  （Settings/设置/Preferences 匹配）+ `closeToHideWindow` weak 引用记住第一个非设置窗口，
  设置窗口永远不挂 close-to-tray delegate；README 中英改为「macOS Swift 壳为主，Windows Tauri
  源码已同步、需 Windows CI 重建 exe」并更新 i18n hash。注意=Swift `NSApp.sendAction
  (showSettingsWindow:)` 和 AppleScript 终端命令只在真机验证，当前未做 GUI 自动化。
  可复现?是（源码可复现；macOS 二进制已重建通过）。
- **dsh-web-ui（zhu1090093659/dsh-web-ui）可借鉴点记录（2026-08-16，记录）**：把 dsh-web-ui 调研中值得本仓库（dsh-essentials / dsh-mac-desktop / dsh-router-standard）借鉴的工程思想与写法落档，用户只要事项和想法、不要源码。解法=按「对本仓库可落地度」整理：①**聚合包自动生成器**：`aggregate.yml` 用 `patchFrom`（汇总子包 cordis.patch.yml insert 行）+ `deps`（子包进 dependencies）+ `self`（聚合包自身 host/client），`scripts/aggregate.mjs` 生成聚合包 patch 并提供 `--check` 防漂移；我们 dsh-essentials 是手写合并，可借鉴「清单驱动生成 + 一致性门禁」降低维护成本。②**shared 运行时单一事实源 + 同步副本门禁**：settings 卡/轮询护栏/DSH_HOME 等跨包模块放 shared/，包内同名文件由 `sync-shared.mjs` 生成，`test:scripts` 含 drift 门禁；我们脚本已有 check-inject/package-consistency，可把「跨包共享代码」也纳入同款同步防漂移。③**设置页一级分区 + 插件子槽归组**：`settings.section`（alwaysOpen 直接展开）作一级菜单，`web-ui.plugin.item` 子槽把多个插件的设置卡归到同一组，并注意先声明子槽再让其他卡注入；我们设置卡片已不少，可借鉴「先分组再展开」的导航结构。④**皮肤中心“先试穿再应用”**：试穿即时生效、退出完全还原、满意再应用；皮肤资产全打进一个 dsh-skins 包，启用互斥由 `dsh-skin use` 管 `~/.dsh/cordis.patch.yml` managed 区段，避免每皮肤一个 npm 包。若我们未来做主题/皮肤能力，这是低维护分发模型。⑤**移动端远程的配对与降级**：扫码/链接一次性限时配对令牌，可一键吊销；SSE 实时推送，隧道不支持 SSE 时自动降级轮询（收发正常、延迟几秒）。适合 dsh-mac-desktop/未来远程能力参考。⑥**真实服务驱动的面板类插件**：task-board 用 `session.prompt` 真实执行并回写状态，aionui-panel 用 host 侧 fs/git 服务，ssh 用 ssh2 连接池 + 端口转发只监听 127.0.0.1 + 集群并发 + agent 工具共用同一配置；说明「UI 只是壳、重活放 host、配置单点」是成熟插件共同模式。⑦**图像理解不进会话**：describe_image 调 OpenAI 兼容视觉端点，只有返回文本进会话，图片本身不落会话记录；和我们的 vision-any/ModLens 思路一致，可强调“原始图片不外泄/不持久化”作为安全卖点。⑧**两阶段预设（梁神）**：先 Minimal 双工具锚定轨迹，再切 Code Mode 全工具，带 fallback 门控；与 router-standard 的“简单任务少工具、复杂任务全工具”互补，可做预设级“首轮收敛”变体。⑨**工程纪律**：包级 AGENTS 分层（根/包/文档）、README 中英三件套 + i18n 配对校验、CI 全量 check（aggregate/gallery/skin-center/docs/emoji）、tag 触发发布 + verify-version、pr-review.mjs 批量审查 PR（规模上限/密钥/emoji/CI 序列/皮肤视觉验证）。我们的文档体系已经类似，可补「生成物漂移门禁」与「发布 tag 校验」。⑩**新包/新皮肤脚手架**：`dsh-plugin-new`/`dsh-skin-new` 生成标准骨架 + 自动注册聚合/皮肤清单；我们 scripts 已有 install/check，可补脚手架减少新包起步成本。注意=①只借鉴思想/写法，不搬源码（仓库以 Apache-2.0 为主、个别 BSD-3-Clause，均非 MIT）；②落地前用 Inspect Provider 核对 rc.6 槽位/服务契约；③聚合/皮肤中心等属于较大工程，按用户决定分期做。可复现?是（读仓库文档/package/scripts 即可复现；未安装、未改本仓库代码）。
- **iPolloWork（Devin-AXIS/iPolloWork）可借鉴点记录（2026-08-16，记录）**：把 iPolloWork 调研中值得 DSH 插件/宿主参考的思想与设计理念落档，用户决定不安装。解法=按「对本仓库可落地度」整理：①**可编辑产物优先**：Agent 目标不是“聊完给文件”，而是把结果维护成工作区真实可编辑项目（`design/<sessionId>/` 下 index.html/design-tokens.css/manifest.json/brief.json），DSH 创作类插件可借鉴「结构化物件 + 设计令牌 + manifest + 可逆保存」而非一次性生成物。②**AI 与手动编辑并存**：画布直接改 + 选区 Ask AI 只把文件/定位/当前样式整理成对话草稿回填，不自动提交；这是「用户确认门」的好范例，尤其适合我们的可视化/模板插件。③**外部委托隔离边界**：宿主把 DSH 放进 `git clone --shared` 隔离副本，跑完只回传 finalResponse + patch，由主代理决定是否应用；比共享工作区更安全，适合 dsh-mac-desktop 或未来宿主嵌入。④**双传输形态**：headless CLI（`--profile headless --patch`）适合一次性任务，JSON-RPC stdio（initialize/session/prompt/idle）适合可观测/可取消任务；配套任务持久化、patch 分页、60min 超时、运行时版本管理（PyPI wheel）。⑤**Studio 插件分区**：DSH bundle host 用 `webServer+workspaceRegistry` 开 prefix 路由，client 用 `slots.inject("conversation.view")` 挂 iframe；随机 token + same-origin + workspace 目录白名单，Ask AI 只回填草稿。⑥**模板市场按场景隔离**：Design/PPT/Video 目录与模板分类彼此独立，避免网站/海报混入 PPT；模板先隔离校验再原子替换，失败恢复原项目。⑦**插件独立安装**：三个 DSH bundle 各自含浏览器资源，只装选中能力，不把桌面主项目拖进 Harness。⑧**诚实能力边界**：SKILL.md 明确 DSH 子代理不自动继承 OAuth/主代理工具，除非 capabilities 报告桥接可用，不得声称能直接操作 Studio/Video。注意=①这些思想来自 source-available 代码，落地时只能参考理念，不能直接搬代码（License 非 MIT）；②事件/槽位契约以 Inspect Provider 核对 rc.6 为准；③用户明确不安装，本次仅落设计。可复现?是（codeload tarball 已解压读源码可复现）。
- **Petdex（crafter-station/petdex）可借鉴点记录（2026-08-16，记录）**：把 Petdex 调研中值得 DSH 插件/桌面壳借鉴的设计落档，用户决定不安装。解法=按「对本仓库可落地度」整理：①只读 session 事件投影 bundle：`inject:["sessions"]` + 全局监听 `session/created|disposed|event`，不碰 agent/approval 决策；这是「外部 UI/通知/遥测镜像 DSH 活动」的最小骨架。②内容零外发：归一化为 state/text/rootSessionId/sourceSessionId/sourceSeq/kind 的无内容投影，prompt/tool 参数/model 输出/审批内容不转发；外发只走本地 loopback + update-token 门禁 + 300ms 超时，失败 fail-open 不影响 DSH。③会话归并与事件治理：子 agent 经 `header.parentSession + origin==='subagent'` 回溯根会话（seen 集合+MAX_PARENT_DEPTH 防环），workflow/goal/compaction 更新父卡片；per-source `event.seq` 高水位去重，队列上限 64，可替换 progress 合并，intervention/turn 终局事件优先。④状态映射可作任务卡片参考：turn/start→jumping，step/tool/workflow/goal/compaction→running，approval/asked→waiting，approval/decided→running，turn/completed→waving，blocked/max-tokens→waiting，failed/stopped→failed；审批只展示不代答。⑤官方 CLI 安装/卸载是桌面壳可复制的模式：npx 固定 `@deepseek-ai/dsh@0.1.0-rc.6` + `pnpm@11.19.0`，`dsh plugin --profile web add --ignore-scripts <tgz>`，卸载只按包名 remove；私有 tgz 哈希锁定后嵌入二进制，稳定路径落在 `~/.petdex/integrations/dsh/<ver>/`。⑥连接状态机：`absent→not_installed→restart_required→connected`，查 `~/.dsh/profiles/web/package.json` 的 dependencies+bundles 判断已装，真实事件回写 `~/.petdex/runtime/dsh-handshake.json`（含 integrationVersion）才算 connected——避免「装了但没重启」误报成功。⑦macOS 桌面壳 PATH 处理：Finder 启动不继承交互 shell 环境，用 `/bin/zsh -lic 'exec "$@"'` 转发 argv，不把包路径/profile 插进 shell 源码；DSH_HOME 可覆盖 `~/.dsh`。⑧点击宠物只激活默认浏览器，不做会话级深链（诚实兜底）。⑨SSH remote agents：反向隧道 `-R 127.0.0.1:7777:127.0.0.1:7777`、先装依赖再发布配置、全部通过后原子发布 update-token——若 dsh-mac-desktop 做远程能力可参考。注意=①以上事件名/字段来自 Petdex 源码，落地前必须用 Inspect Provider 核对 rc.6 契约；②`@petdex/dsh-plugin` 是 MIT 可读代码，但 Petdex 桌面主体是 Native SDK/Zig 产品，不宜整体收编；③用户明确不安装，本次仅落设计。可复现?是（git clone 读源码即可复现）。
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
- **dsh-mac-desktop 托盘/终端/关闭隐藏落地（2026-08-16，实现）**：用户按评估让做 Phase 1。
  问题=要把 DSH Desktop 的托盘/系统终端/close-to-tray 移植进轻量壳。解法=①index.js 自动探测
  `$DSH_HOME` + `--profile`/`web` argv，spawn 时传 `--dsh-home/--profile-name/--profile-dir`，
  并支持 config 覆盖；②Swift AppConfig 解析新参数，AppDelegate 加 NSStatusItem 托盘
  （显示/隐藏、打开 DSH 终端、设置、退出），`windowShouldClose` 改 orderOut 隐藏、
  `applicationShouldTerminateAfterLastWindowClosed=false`；打开终端用 osascript 控制 Terminal
  cd 到 profileDir；`make-app.sh` 已重建 universal .app 并 ad-hoc 签名；③Tauri config.rs 解析
  新参数，main.rs 启用 `tray-icon` feature + TrayIconBuilder + close-requested prevent_close/hide
  + open_dsh_terminal（Windows PowerShell / macOS open Terminal），cargo check/test 通过；
  Windows 二进制未在本机重编，待 CI/Windows 构建。注意=DSH 没有暴露当前 profile 的环境变量，
  只能从 argv 猜 + config 覆盖；Swift 托盘“设置”用 `NSApp.sendAction(showSettingsWindow:)`。
  可复现?是（Swift 已重建可运行；Tauri 源码级通过 cargo check，Windows exe 未更新）。
- **Mirage（strukto-ai/mirage）可借鉴点记录（2026-08-16，记录）**：把 Mirage DSH 适配器里值得本仓库参考的套路落档，避免只留「统一 VFS」的泛泛总结。解法=按「对本仓库可落地度」整理：①**替换 fs/shell 两个可交换 seam**：bundle patch 直接禁用 `fs-sandbox`/`bash-sandbox`/`pwsh-sandbox`/`tool-pwsh`/`tool-fs-search`，再插入自实现 `FileSystem`（`@deepseek-ai/dsh-fs`）与 `ShellExecutor`（`@deepseek-ai/dsh-shell`），不改 harness 即可把 DSH 的文件/命令世界整体换成虚拟/远程后端；做「沙箱替换、worktree、远程文件、多后端聚合」类插件可直接抄这个 patch 骨架。②**共享 Service 持有执行世界**：`MirageService` 提供 `ctx.mirage`（Workspace 唯一实例），fs/shell 两个 provider 都 `inject:['mirage']`，`processPath` 与 shell 命令在同一路径空间，保证 `ctx.fs` 写出的文件 shell 能读到；任何需要 fs/shell 联动的插件应共享同一状态对象而非各自初始化。③**异步构造 + `ready` 门**：声明式 mount 走资源注册表异步 build，service 暴露 `ready: Promise<Workspace>`，fs/shell 每个入口先 await ready、再二次检查 AbortSignal；避免半初始化对象被访问，也覆盖等待期间信号已取消的竞态。④**sandboxMode 如实上报**：`get sandboxMode()` 动态返回 `'workspace-write'` 或 undefined——只有所有 runtime `reach==='vfs'`（即一切效果都过 Workspace 门）才宣称沙箱，有 host 可达 runtime 就放弃声明；宁可 undefined 让权限预设拒绝组合，也不假报 full/workspace-write。⑤**错误码映射**：把底层 POSIX stamp（ENOENT/EISDIR/ENOTDIR/EACCES/EPERM）映射成 dsh-fs 的 `FS_NOT_FOUND`/`FS_NOT_REGULAR_FILE`/`FS_NOT_DIRECTORY`/`FS_PERMISSION_DENIED`/`FS_IO_ERROR`，并保留 cause；不要消息 sniffing。⑥**严格文本语义**：NUL 采样 + `TextDecoder(fatal:true)` 判二进制（`FS_NOT_TEXT`），CRLF 多数保持、编辑 oldString 唯一性/`replaceAll` 语义与 DSH 自研后端一致；文件 seam 必须复刻 DSH 文本契约，不能直接透传底层「宽松解码」。⑦**版本/并发控制**：`versionOf(stat)` 按 fingerprint→revision→meta 派生 `FsVersion`，per-targetKey tail promise 串行化 mutating ops，保证 read→guard→write 窗口不交错；多后端文件系统不能依赖底层 API 的原子性。⑧**后台命令流式 + spill**：`start` 用 console 流式输出并设 retention budget；`spillDir` 配置后把完整 stdout/stderr 写到 workspace 路径供 agent 读回，发现丢块立即 lossy + 停用 spill（不给有洞的文件）；长命令输出治理可参考。⑨**声明式 YAML 配置面**：`mounts` 块 `{resource, mode, config}` 走 `buildResource` 注册表，支持 `!!js process.env.X` 运行期解析、`registerResourceFactory` 注册自定义资源；bundle 复杂配置应区分「注册名+配置块」与「活实例」，让 profile YAML 可配而不用写代码。⑩**sessionId 持久 shell**：未绑定 session 时每次命令 clean slate（贴合 DSH bash 契约），绑定时保留 cwd/export/函数；需要跨命令状态时可做按 sessionId 的有状态执行器。注意=①Apache-2.0，代码不可直接搬入 MIT 仓库；②这些点多数围绕 fs/shell provider 契约，落地前用 Inspect Provider 核对 rc.6 `FileSystem`/`ShellExecutor` 确切签名；③npm 发布版 peerDeps 滞后（见外部调研条目），若参考其实现以 GitHub main 为准。可复现?是（git clone 读 `typescript/packages/dsh/src/{service,fs,shell,errors,text,spill}.ts`；未实现/未安装）。
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
- **OpenPencil 可借鉴点记录（2026-08-16，记录）**：把 OpenPencil 调研中值得 DSH 插件/预设/技能
  借鉴的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①分层设计工作流
  （skeleton→content→refine）：先骨架、后内容、最后统一 refine/自检，等价于 DSH 大任务「先出
  结构→分块填充→统一校验」，可做成预设或工具链。②空间分解 + 并发 Agent Teams：orchestrator
  把页面拆成 hero/features/footer 等空间子任务并行生成，成员有画布指示器 + delegate + fallback；
  DSH 可借鉴「按产物空间/模块拆子 agent + 收敛校验」，而非只按步骤拆。③增量 codegen 管线
  （codegen_plan→submit_chunk→assemble→clean）：声明 chunks/依赖/sharedStyles/rootLayout，
  逐块提交再装配；适合 DSH 大代码生成避免一次性超长输出。④模型能力分档：full/standard/basic
  自动调 prompt/thinking/timeout，与现有 mode-boost/router-standard 成本路由互补。⑤Design-as-Code
  + 变量→CSS 变量：产物用可 diff JSON + 设计 token 引用；任何 agent 工作流都可借鉴「先定义
  token/组件，再生成实例」。⑥技能包设计：SKILL.md 内嵌严格 JSON 规则、schema、常见错误表、可
  复制 pattern；DSH skill 也可把「最易错约束 + 对照表 + 最小可跑示例」前置。⑦MCP 工具面：分层
  工具（skeleton/content/refine + codegen plan/submit/assemble）+ `op tools` 自省 + 分段知识加载
  （只取需要的 schema/layout/style）；DSH 插件做工具集时可按「分段检索知识 + 明确 pipeline 阶段」
  组织。⑧跨 agent 技能分发：openpencil-skill 以独立仓库 + `op install --target` 写到各 agent 的
  skill 目录；DSH 可继续沿用 ~/.agents/skills 共享目录方案。注意=①OpenPencil 是独立 Rust 产品，
  代码不可直接搬，思想可借鉴；②落地前用 DSH 契约核对，特别是 subagent 并发/工具 schema 限制。
  用户已决定不安装 openpencil-skill / op CLI / OpenPencil 实例，仅保留思想落档。
  可复现?否（纯记录，未改代码）。
- **EchoBird 可借鉴点记录（2026-08-16，记录）**：把 edison7009/EchoBird 调研中值得 DSH 插件/桌面壳借鉴的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①外部切 DSH 模型的配置面：EchoBird 写 `~/.dsh/settings.yaml` 的 `llm-pi-ai.providers.echobird` 路由（displayName/apiKeyEnv/api/baseURL/models）+ `agent-default-model` 选择器，密钥写 `~/.dsh/.credentials.yaml` 的 `ECHOBIRD_API_KEY`；restore 时删路由、删选择器、删 key。这是「外部程序/桌面壳管理 DSH 模型」的 canonical 写入面，做 dsh-mac-desktop 或 dsh-essentials 的模型切换外部接口可直接照此契约；写 YAML 用 serde_yaml_ng（Rust）而非 PyYAML 语义，避免裸 `off` 变布尔键（本仓库已踩过）。②DSH 会话日志直读契约：`<DSH_HOME|~/.dsh>/sessions/<project>/<session>/session.jsonl[.zstd]`，zstd 是 checksummed 多帧 concat；首行 header `{"type":"session",version,id,cwd,createdAt}`，事件含 `session/title`（最新胜出）、`user/message`、`turn/start`（计轮数）；只有 header 无事件视为空会话丢弃。Rust 用 `zstd::stream::read::Decoder` 流式跨帧解码；JS 侧对应 NOTES 里 node zlib 逐帧重写的已知坑，双向互证。③`dsh web` 进程管理：按平台探测 dsh 路径（%APPDATA%\npm、/opt/homebrew/bin、/usr/local/bin 等），spawn `dsh web` 后轮询 `http://127.0.0.1:3080` 再自动开浏览器；切模型后 kill 受管实例再重启保证确定性（settings.yaml 虽热重载但外部重启更稳）；端口被占时容忍 EADDRINUSE 继续。④工具管理抽象：每工具 `tools/<id>/{config,paths}.json` 定义读/写映射与安装路径，`tool_config_manager.rs` 统一 apply/restore；若未来做桌面 App Manager 可借鉴，但 DSH 插件侧不需要。⑤外部 Agent 循环防护（低优先）：`agent_loop.rs` 用 MAX_CONTEXT_BYTES≈300KB 字节预算而非条数，工具调用哈希环形缓冲（同 tool+args 3 次判循环），MAX_TOOL_LOOPS=150 兜底；本仓库做 host 侧长任务可参考。⑥本地 LLM 管理（低优先）：vLLM/SGLang/llama.cpp 运行时 + GGUF 下载 + Anthropic↔OpenAI 代理，属于独立产品能力，仅作背景。注意=①EchoBird 是独立 Tauri 桌面产品（MIT v5+，~3k★），代码量大不宜收编，只借鉴契约/模式；②落地前仍以 Inspect Provider / npm 包产物核对 rc.6 的 settings.yaml 字段与会话事件名，EchoBird 注释写的是 rc.x 契约；③其 `dsh.json` install 注释也确认 Node >=22.19、`dsh web` 只 loopback 3080、`--host 0.0.0.0` 不支持。可复现?否（纯记录，未改代码）。
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
- **Yao（YaoApp/yao）可借鉴点记录（2026-08-16，记录）**：把 Yao 的 DSH 嵌入实现中值得本仓库
  参考的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①外部宿主嵌入 DSH 骨架：
  动态 Cordis 插件 + 自定义 boot bin（`@deepseek-ai/dsh-app-boot` 的 `boot(NAME, configPath,
  ...)`）+ stdio JSON-RPC；stdout 只走协议帧，退出由 `onIdle`/`shutdown` 驱动而非 stdin EOF。
  ②JSON-RPC 协议面：方法 `initialize`/`session/prompt`/`shutdown`，通知
  `session.event`/`session.status`/`subagent.started`/`subagent.finished`；initialize 传
  cwd/provider/model/maxTokens，prompt 传 sessionId+contentBlocks。③会话恢复：
  `sessionPersistence.list()` 命中后 `agents.resume({resumeSessionId, agentOptions})`，否则
  `agents.create`；用 `assistantID:chatID` SHA1 UUID 做稳定 sessionId，跨进程可续。④自动退出：
  监听 `agent/status==='idle'` 且只对 `promptedSessionId` 根会话触发；子 agent idle 不退出；
  `maxTokensAsSuccess` 把 max-tokens 视为 ok。⑤最小 headless DSH cordis.yml 组合：
  llm-deepseek + agent-spine-demo + subprocess + bash/pwsh + fs-local + tool-fs/tool-todo/
  tool-subagent + token-meter + compaction-basic + session-persistence-jsonl +
  session-checkpoint-policy；Windows 关 toolBash/toolJobs、加 shell-env/tool-pwsh。⑥宿主环境
  注入：`DSH_CWD/DSH_SESSION_ROOT/DSH_SYSTEM_PROMPT/DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL`、
  `CTX_WORKSPACE_ID/CTX_ASSISTANT_ID/CTX_LOCALE/CTX_SKILLS_DIR/CTX_EXT_SKILLS_DIR/CTX_NODE_ID/
  CTX_TARGET_ID`、`HOME/WORKDIR` + git/SSH/XDG 隔离。⑦进程清理：会话级
  `pkill -9 -f 'dsh-<chatID>'` / Windows taskkill；ctx cancel 时 5s 超时强杀；正常完成不清理
  保留子进程。注意=①完整代码/配置在 Yao `agent/sandbox/v2/dsh/` 与
  `@yaoapp/dsh-sdk-jsonrpc-stream@0.1.1`，本记录是骨架；②其 npm 插件只有 peerDependencies
  （本仓库已知坑），但在 DSH 全家桶环境内可跑；③落地前用 Inspect Provider 核对 rc.6 契约，
  别硬造服务。可复现?否（纯记录，未改代码）。
- **gpt-image-2-style-library 外部安装（2026-08-16，安装）**：用户同意把 awesome-gpt-image-2
  的 Agent Skill 装到 DSH。问题=该 skill 不是 DSH bundle，官方 CLI 只写 Codex/Claude Code/
  ~/.agents/skills。解法=`npx -y gpt-image-2-style-library@1.0.4 install agents`，已装到
  `~/.agents/skills/gpt-image-2-style-library/`（SKILL.md + references/style-library.md 26KB +
  agents/openai.yaml + assets/city-life-system-map.png 约 2MB 示例图）；DSH 会话 skill 目录随即
  出现 `gpt-image-2-style-library`，可直接用。注意=①npm CLI 不写 `~/.dsh/skills`，DSH 走
  `~/.agents/skills` 已发现；②skill 参考文件是 26KB 纯文本索引，无网络/密钥，安装零依赖；③后续
  升级用 `npx -y gpt-image-2-style-library@latest install agents`。可复现?是（同一命令幂等覆盖
  安装）。
- **Ouroboros 可借鉴点记录（2026-08-16，记录）**：把 Q00/ouroboros 调研中值得 DSH 插件/预设
  借鉴的点落档，避免只留泛泛总结。解法=按「对本仓库可落地度」整理：①访谈门禁（Socratic
  interview）：写码前强制澄清，Ambiguity=1-加权清晰度，阈值≤0.2，可显式 `force` 反驳；DSH 侧可
  做成 router-standard/spec 的「先访谈/先澄清」预设或工具提醒，而非直接写码。②不可变 Seed：
  意图锁进 seed 规约（本体/约束/验收标准），写码中不漂移；DSH 可用系统提示/会话元数据固化
  「目标+约束+成功标准」，压缩/新会话时保留。③三阶段评估（Mechanical→Semantic→Multi-Model
  Consensus）：先用免费机械检查，再语义评估，最后多模型共识；判分断言对 worker 隐藏（hidden
  checklist），可借鉴到 DSH 的 agent 工作流（把验收清单放 host 侧，不让执行 agent 自评）。
  ④预算化演化（Evolve）：最多30代、本体相似度≥0.95 收敛、停滞模式检测（spinning/oscillation/
  重复反馈/硬上限）；适合 DSH 做长任务自动迭代/收敛判断。⑤PAL Router：任务复杂度打分（token/
  工具数/AC深度加权）→ Frugal/Standard/Frontier，失败升级成功降级；与现有 mode-boost/
  router-standard 的成本路由方向互补。⑥事件溯源：append-only SQLite + replay/checkpoint，
  完整审计；DSH 会话已是事件式，可借鉴其「所有动作绑定 seed/记入 ledger 可回放」的表述。
  ⑦其 adoption 文档反过来列了 DSH 值得借鉴的机制（Ralph handoff、spill、end-seed marker、
  invariants），若做 DSH 插件可优先看这些。注意=①Ouroboros 是 Python 独立引擎，思想可借鉴但
  代码不可直接搬（MIT 可读，但要翻译成 Cordis/TS 生态）；②这些点多数是方法论，落地前先查 DSH
  契约，别硬造服务。可复现?否（纯记录，未改代码）。
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
- **Archify 外部安装（2026-08-16，安装）**：用户让装 @tt-a1i/archify-dsh@0.1.0 到 web profile。
  问题=这是 Skill-only bundle，不是 Cordis 功能插件。解法=`dsh plugin --profile web add
  @tt-a1i/archify-dsh@0.1.0`（pnpm 报的 missing peer 全来自 dsh-better-sidebar，已知可忽略）；
  装完 `dsh plugin list` 出现依赖、`dsh --profile web --dump-config` 出现
  `archify-skill-filesystem` 提供方（@deepseek-ai/dsh-skill-filesystem，providerName archify-plugin），
  `node .../skills/archify/bin/archify.mjs doctor` 全 ok。注意=①skill 文件在
  `~/.dsh/profiles/web/node_modules/@tt-a1i/archify-dsh/skills/archify/`，SKILL.md + bin/renderers/
  schemas/examples 完整；②DSH 3080 正在跑，bundle 变更需重启 DSH（+硬刷新）才生效；③shell 产物不会
  自动进 Web Produced Files，需 agent 返回精确路径。可复现?是（同一命令幂等安装/卸载）。
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
- **dsh-memory（FuRongJun）半途集成清理（2026-08-16，清理）**：另一个会话把
  `@furongjun1999/dsh-memory` 复制进 dsh-essentials 做本地收编，但只完成一半（
  `lib/lingshu-memory/` 未跟踪、`lib/index.js`/`lib/client.js` 改接 lingshu、
  `lib/memory/{client,index}.js` 被删）。用户决定先不收编。清理=`git checkout --`
  还原 `dsh-essentials/lib/{index,client}.js` 与 `lib/memory/{client,index}.js`，
  再 `rm -rf dsh-essentials/lib/lingshu-memory`；同时确认 ~/.dsh/profiles 无
  @furongjun1999/lingshu/aeis 残留、Python aeis 未安装。可复现?是（git status 可见半成品）。
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
- **dsh-TUI 外部安装（2026-08-16，安装）**：用户发 ccch1mneyyy/dsh-TUI 链接让装。问题=这是 DSH
  官方公众号收录的 Claude Code 风格 TUI 插件（npm `@deepseek-harness-tui/dsh-tui` v0.7.2，MIT，
  bundle 形态，自带 `dsh-working-activity` 依赖与 patch 自动挂载）。解法=①
  `dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui` 初始化 profile（等价于仓库
  `install.sh`），profile 自动含 `@deepseek-ai/dsh-base` + 本包两个 bundle；②再
  `npm install -g @deepseek-harness-tui/dsh-tui` 获得 `dsh-tui` 直达命令（不装也可用
  `dsh --profile dsh-tui`）。验证=`dsh --profile dsh-tui --dump-config` 正常组合；
  launcher 与 profile 内包版本均 0.7.2；`/opt/homebrew/bin/dsh-tui` 已生成。注意=①pnpm/npm
  报的 missing peer（@deepseek-ai/cordis、dsh-invariants 等）与 react 19/dsh-working-activity
  的 peer 冲突均为已知警告，实际由 `~/.dsh/profiles/node_modules/@deepseek-ai` 提供可忽略；
  ②`dsh-tui --version` 打印的是 dsh CLI 版本 0.1.0-rc.6 而非 TUI 版本，看 TUI 版本用
  `node -p require('@deepseek-harness-tui/dsh-tui/package.json').version` 或启动横幅；
  ③勿再单独 add `dsh-working-activity`，会重复工作状态行。可复现?是（同一命令幂等重装）。
- **dsh-better-sidebar 外部安装（2026-08-16，安装）**：用户发 omdsh-dev/DSH-better-sidebar
  链接让装。问题=该插件是本仓库已删过的 better-sidebar 的新版本（npm
  `dsh-better-sidebar@0.12.2`，bundle 形态，host+client 双半，依赖 node-pty）。解法=读仓库
  README 后直接用其自带 `scripts/install.sh 0.12.2`（等价于
  `dsh plugin --profile web add dsh-better-sidebar@0.12.2`），脚本幂等预写
  `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 allowBuilds（node-pty/protobufjs）与
  minimumReleaseAgeExclude，CLI 自动把包加入 `dsh.profile.bundles`，无需手写 cordis.patch.yml。
  验证=profile package.json `bundles` 含 dsh-better-sidebar、node import lib/index.js ok。
  注意=pnpm 报的一堆 missing peer 可忽略：`~/.dsh/profiles/node_modules/@deepseek-ai` 提供
  @deepseek-ai 依赖；装完需重启 DSH 并硬刷新浏览器。可复现?是（再跑一次脚本幂等）。
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
- **dsh-essentials 视觉实现切换为 ModLens（2026-08-16，替换）**：用户决定换成 ModLens。执行=
  ①复制 liustack/modlens 3.17.3 的 `dsh/` + `dist/main.js` 到 `lib/modlens/`（dist 为本地构建
  产物）；②host `lib/index.js` 从 `./modlens/dsh/index.js` apply，inject 补 `attachments`；
  ③client 合并 `dsh/client.js` 为 sub_modLens（现 13 个 factory）；④删除 `lib/vision-any/`，
  README/package/cordis/THIRD-PARTY 同步。注意=ModLens 视觉引擎配置在 `~/.modlens`，需自行配置
  provider；dist/main.js 是构建产物，升级上游需重新 build。可复现?是（重启后出现
  modlens_read_image 工具和粘贴转路径）。
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
- **dsh-essentials 发图仍提示不支持（2026-08-16，修复）**：用户反馈发图又提示不支持。原因=
  vision-any 的 apiProxy 准入覆盖里，如果当前模型路由或 llm 服务暂时取不到，会直接走原始
  prompt，DSH 图片准入拒绝纯文本模型。修复=路由/llm 取不到时不再直接放行，而是走替换兜底
  （保存图片→路径提示→vision 工具），只有明确知道当前模型支持图片才原样放行。改动=
  `lib/vision-any/lib/admission.js`。注意=仍需重启 dsh 使 host 生效。可复现?是（配置好
  visionAny 后，在纯文本模型粘贴图片不再报不支持）。
- **dsh-essentials 输入框自动隐藏开关提示（2026-08-16，新增）**：用户要求隐藏/取消隐藏对话框
  开关要有提示。实现=auto-hide-composer 增加居中 toast：开启显示「输入框自动隐藏已开启」，关闭
  显示「已关闭」，1.5s 自动消失；快捷键/设置开关触发都提示。合并 client 同步。可复现?是
  （Ctrl+Shift+H 或设置开关）。
- **dsh-essentials 沉浸提示与快捷键扩充（2026-08-16，新增）**：用户要求隐藏开启/关闭时页面中间
  提示，且快捷键增多。实现=①immersive-mode 增加居中 toast（开启/关闭沉浸时显示，1.5s 自动消失）；
  ②keyboard-shortcuts 新增 `Ctrl+Shift+S` 侧边栏、`Ctrl+Alt+N` 新会话、`Ctrl+,` 设置、
  `Ctrl+Shift+U` 用量统计、`Ctrl+Shift+P` 插件设置、`Ctrl+Shift+End/Home` 滚动底部/顶部；
  帮助面板同步更新。合并 client 同步。可复现?是（切换沉浸看居中提示；按 ? 看新增快捷键）。
- **dsh-essentials 用量统计图标与模型撞车（2026-08-16，修复）**：用户反馈用量统计图标与模型图标
  一致。原因=之前用了 `ic_ds_data_outline_16`，与模型设置图标相同。修复=改为
  `ic_ds_goal_outline_16`（飞镖靶+箭头），路径含 fill/stroke 混合，patch 按属性写入；合并 client
  同步。可复现?是（设置页用量统计图标与模型不同）。
- **dsh-essentials 系统通知（2026-08-16，新增）**：用户要求系统通知、点击跳转具体页面、其他软件
  也能跳转。调研 GitHub：`omdsh-dev/dsh-notification`（50★，完成通知但点击只聚焦窗口）、
  `omdsh-dev/dsh-web-ui-notify`（3★，审批/提问/完成通知，点击跳转会话，适合）。选定
  dsh-web-ui-notify 并入 `lib/notify/`：host no-op + client 系统通知（Notification API），
  设置→通用开启；支持后台会话/当前会话离开 tab 时通知，点击通知跳回对应会话。合并 client 新增
  sub_notify（现 12 个 factory）。注意=需要浏览器 Notification 权限；页面关闭后无法通知。可复现?
  是（切到其他软件/标签页，DSH 完成/审批时弹系统通知，点击跳回）。
- **dsh-essentials 插件列表面板重复（2026-08-16，修复）**：用户反馈分类按钮和列表重复显示。原因=
  官方 `ui-settings-plugin-inventory` 若仍加载，`settings.plugins.tab` 里同 id "all" 有两条；
  section 对每个 row 渲染 panel 且 `renderSlot(only:id)` 会把同 id 的所有组件都渲染进去，导致增强
  列表重复出现。修复=`installPluginTabDedupe` 增强：①tab 按钮去重；②同 id panel 去重（只留含
  `.dspi-section` 的）；③panel 内 `.dspi-section` 去重。合并 client 同步。可复现?是（若官方仍加载，
  打开插件列表分类/列表不再重复）。
- **dsh-essentials 用量统计设置图标原生（2026-08-16，调整）**：用户要求设置页用量统计图标参照原生
  风格。实现=在 usage-plugin client 增加 `patchUsageNavIcon`，把设置导航「用量统计」的齿轮替换为
  DSH 原生 `ic_ds_data_outline_16` 路径（两个 fill path），MutationObserver 常驻；合并 client
  同步。可复现?是（打开设置看用量统计图标）。
- **dsh-essentials 插件列表自定义分类仍混入内置（2026-08-16，修复）**：用户反馈点自定义后内置仍
  显示。原因=分类只认 `@deepseek-ai/` 前缀，若个别 entry 的 moduleName 缺失/非标准前缀（如
  `cordis:` 或 `ui-`/`dsh-` 开头的 entryId）会被误判为 custom。修复=`kindOf` 增强：moduleName 为
  `@deepseek-ai/` 或 `cordis:` 判内置；moduleName 缺失时按 entryId 的 `@deepseek-ai/` / `ui-` /
  `dsh-` / `cordis-` 前缀兜底判内置。合并 client 同步。可复现?是（点自定义，内置不应出现）。
- **dsh-essentials 用量与余额合并入口（2026-08-16，调整）**：用户要求用量与消耗、剩余余额查询
  没必要分两个设置按钮。实现=新增 `UsageStatsPanel` 合并组件，conversation.view 和
  settings.section 都只注册一个「用量统计」，内部 tab 切换用量/余额；删除原
  usage-cost-view/balance-view/usage-cost/balance 四个注册。合并 client 同步。可复现?是
  （顶部/设置只剩一个「用量统计」）。
- **dsh-essentials 用量统计 UI 优化（2026-08-16，调整）**：用户要求用量统计有图标展示、导出收敛
  为下拉。实现=在 usage-plugin client 概览统计卡加 SVG 图标；把「导出 CSV/JSON/PNG/打开目录」
  四个按钮收敛为一个「导出 ▾」下拉菜单，一级界面更简洁；THIRD-PARTY 记录本地修改。合并 client
  同步。可复现?是（打开用量与消耗概览看图标，点导出看下拉）。
- **dsh-essentials 自动隐藏偶发不恢复（2026-08-16，修复）**：用户反馈自动隐藏后光标回来不出现。
  原因=可能鼠标经过底部 iframe/滚动条等导致 `mousemove` 未触发，或 32px 阈值太小。修复=阈值
  32→64；增加 `pointermove`/`pointerdown` 兜底（点击底部附近也恢复）；增加 scroll 到底部时恢复。
  合并 client 同步。可复现?是（隐藏后把鼠标移到最底部或点击底部）。
- **dsh-essentials 全局快捷键（2026-08-16，新增）**：用户要求沉浸模式快捷键 + 全键盘操作。实现=
  新增 `lib/keyboard-shortcuts/client.js`：插件配置卡片「快捷键」开关（默认开）；全局 keydown
  （捕获阶段，输入框内忽略）支持 `?`/`Ctrl+/` 打开帮助面板、`Esc` 关闭、`Ctrl/Cmd+Shift+F` 切换
  沉浸、`Ctrl/Cmd+Shift+H` 切换输入框自动隐藏、`Ctrl/Cmd+Shift+C` 聚焦聊天输入框；帮助面板列出
  全部快捷键。合并 client 新增 sub_keyboardShortcuts（现 11 个 factory）。可复现?是（按 ? 看帮助，
  Ctrl+Shift+F 进沉浸）。
- **dsh-essentials 插件列表自定义重复（2026-08-16，修复）**：用户反馈插件列表自定义里有非自定义/
  重复。原因=官方 `pluginInventory.list()` 直接返回 loader entries，同一 `moduleName` 可能出现
  多条（如 `@deepseek-ai/dsh-tool-subagent` 出现 2 次）；自定义 tab 按 `moduleName` 分类，重复项
  会让列表看起来混乱。修复=在 `PluginInventoryTab` 增加按 `moduleName` 去重（保留首条），
  `kindOf` 对缺失 `moduleName` 兜底；合并 client 同步。可复现?是（打开插件列表内置/全部看重复项
  消失；自定义只剩 dsh-essentials + @dsh-external/dsh-mode-boost）。
- **dsh-essentials 使用统计（2026-08-16，新增）**：用户要求类似 zcode 的使用统计（近7天/近30天/
  全部、每模型、每日高峰、对话费用、供应商/类型分类）。调研 GitHub：
  `Make0209/dsh-usage-stats`（热力图+30/90/全部，无费用/供应商分类）、
  `le-soleil-se-couche/dsh-token-cost`（费用+7/30/自定义，DeepSeek 专）、
  `feiyang-dev/dsh-usage-plugin`（1.4.0，功能最全：记录每次调用 token/缓存/费用、今天/7/30/全部、
  按模型消耗表、峰谷时段、日历热力图、导出、余额）。选定 feiyang 并入 `lib/usage-plugin/`：
  host `llm/stream` 记录 + client 面板/顶部 tab；host inject 补 `subprocess/credentials/sandboxPolicy`；
  client 合并为 `sub_usagePlugin`（现 10 个 factory）。注意=计费价格表内置 DeepSeek 峰谷价，
  非 DeepSeek 供应商费用为 0；数据从插件激活后开始记录，不回溯历史。可复现?是（发消息后顶部
  「用量与消耗」出现记录）。
- **dsh-essentials 沉浸模式（2026-08-16，新增）**：用户要求网页内全屏、能隐藏都隐藏。实现=新增
  `lib/immersive-mode/client.js`：插件配置卡片「沉浸模式」+ 右上角悬浮切换按钮；开启后
  `html.dsh-immersive` 隐藏会话头部/shell overlay，并把 AppFrame grid 设为 `0|1fr|0` 隐藏侧栏
  和详情栏，MutationObserver 保持；localStorage 持久化。合并 client 新增 sub_immersiveMode
  （现 9 个 factory）。注意=AppFrame 是 CSS Module 哈希类名，不能按 class 选择，改用
  `[data-slot="sidebar"]` 找 frame 后直接改 inline grid。可复现?是（设置→插件配置→沉浸模式开启，
  或点右上角按钮）。
- **dsh-essentials 插件列表仍重复（2026-08-16，修复）**：用户反馈插件里还是两个插件列表。原因=
  虽然 cordis.patch.yml 已禁用官方 `ui-settings-plugin-inventory`，但若旧进程/缓存仍加载官方
  client，`settings.plugins.tab` 列表不会按 id 去重，两个「插件列表」同时出现。修复=在
  plugin-inventory client 增加 DOM 层双保险 `installPluginTabDedupe`：MutationObserver 监听
  tab 按钮，发现重复「插件列表」时保留含 `.dspi-section` 的增强版，移除另一个；合并 client
  同步。可复现?是（若官方仍加载则开设置→插件可见重复，刷新后只剩一个）。
- **dsh-essentials 输入框自动隐藏移入插件配置（2026-08-16，调整）**：用户要求与请求重试一样
  放进插件配置。修复=从 `settings.section` 改为 `settings.plugin.item`，组件改成可折叠卡片
  （展开后显示启用开关），合并 client 同步。可复现?是（设置→插件配置→输入框自动隐藏）。
- **dsh-essentials 请求重试移入插件配置（2026-08-16，调整）**：用户要求请求重试次数放进插件配置。
  原因=之前注册在 `settings.section` 作为独立设置页条目。修复=改为注册 `settings.plugin.item`
  （与 memory 设置卡片同槽位），组件改成可折叠卡片 `RetrySettingsCard`，展开时才加载/保存；
  合并 client 同步。可复现?是（设置→插件配置→请求重试）。
- **dsh-essentials 压缩后 400 CONTEXT_WINDOW_EXCEEDED（2026-08-16，修复）**：问题=对话压缩后
  本轮仍报「400 status code (no body) / CONTEXT_WINDOW_EXCEEDED」。原因=从 session 日志看，
  turn 22 先超限触发 compaction，compaction 只 shadow 了旧 tool/result，但当前轮次里有一条
  超大 tool/result（如 grep 整包源码输出）作为单个 oversized retained unit 无法靠 surface
  compaction 修复，压缩后重试仍超限。解法=启用官方
  `@deepseek-ai/dsh-compaction-tool-result-pruner`：在 dsh-essentials host
  `ctx.plugin(ToolResultPruner)`，压缩/上下文溢出时把超预算 tool/result 改写为 head+marker+tail
  （默认 threshold 8192 chars），并加入 dependencies/lockfile；这样后续溢出压缩能真正减小超大头。
  注意=已损坏会话需再触发一次压缩（或新会话）才恢复；该服务只在使用 compaction-basic 的溢出/
  压力路径生效，不改变正常轮次。可复现?是（超长 grep 输出导致超限后压缩仍失败；启用后再次压缩
  可恢复）。
- **dsh-essentials 纯文本模型识图（2026-08-16，新增）**：用户要求非多模态模型识图，能粘贴/
  上传图片、对话中遇到图片能识别不报错、适合所有文本模型、未来新增供应商/文本模型自动适配。
  调研 GitHub 候选：`oil-oil/dsh-vision`（42★，体验好但绑定 `deepseek-official` 适配器）、
  `Anionex/dsh-vision-toolkit`（453★，Agent 工具套件，非聊天粘贴直通）、
  `linenxi-ctrl/dsh-vision`（11★，功能全但安装脚本侵入 preset）、
  `tianmingwan/dsh-vision-any`（15★，纯 bundle 零客户端、provider-agnostic）。选定
  `dsh-vision-any`：通过 apiProxy prompt admission 把图片附件转本地路径提示 + `vision` 工具
  调用任意 OpenAI/Anthropic/Gemini 视觉 API；按当前模型 `inputModalities` 判断是否直通，
  天然适配未来文本模型/供应商。实现=复制到 `lib/vision-any/`，在 host `lib/index.js`
  import/apply，配置经 `config.visionAny` 透传（也可 `~/.config/dsh-vision-any/config.json` /
  env）。注意=需要配置一个视觉 API；未配置时图片仍可粘贴但模型无法真正识图。可复现?是
  （配置视觉 API 后粘贴图片，模型调用 vision 工具）。
- **dsh-essentials 请求重试次数设置（2026-08-16，新增）**：用户反馈设置里没有重试次数。原因=
  retryPolicy 是各 LLM 适配器在 settings.yaml 里的 per-provider 配置，官方设置 UI 没暴露。
  实现=新增 `lib/retry-settings/` host+client：GET/POST `/api/retry-settings`；POST 用
  `ctx.settings.mutate()` 对每个 `llm-*` 命名空间的 `providers.*.retryPolicy`（或顶层
  retryPolicy）写 `mode:'normal' + maxRetries`，保留已有 backoff/retryableCodes；设置页新增
  「请求重试次数」卡片，0–100 整数，保存后所有 LLM 提供方统一。注意=settings-file 是
  comment-preserving YAML patch，用官方 mutate 而非手写 YAML 重写。可复现?是（设置→请求重试，
  改保存后看 settings.yaml）。
- **dsh-essentials 设置导航图标开关后不稳定（2026-08-16，修复）**：问题=设置多次点开关闭后
  「文件提及」「多媒体输入」图标先变齿轮再变回自定义，显示不稳定。原因=两个子插件的 nav icon
  MutationObserver 在首次发现 dialog 后把观察目标从 body 切换到 dialog；设置 dialog 每次关闭会
  销毁/重建，observer 停在已脱离文档的旧 dialog 上，新 dialog 插入 body 不再触发回调（at-file
  尤其明显；paste-input 靠聊天折叠的 body observer 兜底所以延迟恢复）。修复=两个
  `installNavIconPatch` 都改为**终身观察 document.body**（childList+subtree+attributes:d），
  不再切换目标；paste-input 同步加 rAF 二次 patch，消除 React 重绘后的齿轮闪烁。可复现?是
  （多次开/关设置观察图标）。
- **dsh-essentials 输入框自动隐藏（2026-08-16，新增）**：用户要求对话内下方聊天框自动隐藏、
  鼠标碰到底部后恢复、有全局开关。实现=新增 `lib/auto-hide-composer/client.js` 子模块：
  ①设置 → 通用新增「输入框自动隐藏」开关（localStorage `dsh-essentials.autoHideComposer`，
  默认开，事件 `dsh-essentials:auto-hide-composer` 同步控制器）；②全局 `mousemove` 监听，
  鼠标距底部 <32px 或焦点在 `[data-composer-seat]` 内就显示，离开 600ms 后隐藏；
  ③隐藏用 `.dsh-composer-hidden { display:none !important }`，不占布局、不挡滚动；
  ④MutationObserver 给动态挂载的 composer 补 class。注意=`settings.section` 只依赖
  `slots/locale`，无需新增 patch inject。合并 client 同步为 `sub_autoHideComposer`（现共 7 个
  factory），README/AGENTS 计数同步。可复现?是（开启后把鼠标移出底部聊天框）。
- **dsh-memory 自动画像（2026-08-16，增强）**：用户问「画像功能好像没用过，是不是也要设置自动」。
  原因=自动记忆只有流水日志兜底，`type: identity` 完全靠 AI 自觉调用，系统提示也没强调，所以
  画像长期空白。修复=①新增 `autoIdentity` 配置（默认 true，设置卡片加「自动画像」开关）；
  ②`memory:auto` 系统提示增加「自动维护画像」段落，明确名字/职业/偏好/项目等稳定信息要主动
  `write_memory(type: identity)` 且同一实体更新原文件；③`turn-stopping` 兜底增加启发式
  `maybeAutoWriteIdentity`：从最后一条用户消息匹配强信号（我叫/我是/我喜欢/我在用/我负责/
  我们项目等 17 条正则，过滤「这个/那个/一下/试试」等弱信号），命中则写
  `.journal/identity/本人-<title>.md`（无名字时 title=用户偏好）。注意=启发式是兜底，主路径
  仍是模型主动调用；自动日志和自动画像可同时写。改动文件=`lib/memory/index.js` +
  `lib/memory/client.js` + 合并 `lib/client.js` + README。可复现?是（说「我叫 XX，我喜欢 YY」
  后看 `.journal/identity/`）。
- **dsh-essentials 模型搜索框左右空隙不一致（2026-08-16，修复）**：问题=模型选择页搜索框
  左侧有 4px 空隙、右侧贴边（因为 menu 为滚动条贴边去掉了右 padding）。修复=给
  `.dms-search` 加 `margin-right: 4px`，搜索框左右对称，同时 `.dms-groups` 仍贴右缘保持滚动条
  贴边。改动文件=`lib/model-selector/client.js` + `lib/client.js`。可复现?是（打开模型选择页）。
- **dsh-essentials 插件市场 GitHub 发现+统计（2026-08-16，增强）**：用户要求增加使用统计、
  能找 GitHub 上已有 dsh 插件。实现=`PluginMarketTab` 增加「从 GitHub 发现 dsh 插件」区：
  输入关键词调 GitHub Search API（`api.github.com/search/repositories`，按 stars 排序），
  结果卡片显示 full_name/描述/Stars/Forks/更新日期/仓库链接，并提供
  `dsh plugin add github:<owner>/<repo>` 复制命令；有频率限制提示。注意=GitHub 未登录 API
  限流（搜索约 10 次/分钟），错误时提示稍后再试。改动文件=`lib/plugin-inventory/client.js`
  + `lib/client.js` + README。可复现?是（市场输入 dsh plugin 搜索）。
- **dsh-essentials 插件市场补充搜索+安装按钮（2026-08-16，增强）**：用户反馈插件市场没有
  插件、不能搜索/安装。原因=初版市场只有 4 张静态卡片+复制命令，无搜索和安装入口。
  修复=①`PluginMarketTab` 增加搜索框（按名称/描述/命令过滤）和空结果提示；②卡片增加主按钮
  「安装」——由于 DSH 暂无浏览器安装 Remote，安装按钮实际是复制安装命令到剪贴板并提示
  「已复制」，同时保留「复制」按钮；已安装插件显示「已安装」禁用态。改动文件=
  `lib/plugin-inventory/client.js` + `lib/client.js`。可复现?是（设置→插件→插件市场）。
- **dsh-essentials 设置插件出现两个「插件列表」（2026-08-16，修复）**：问题=并入自定义插件列表
  tab 后，设置→插件里出现两个「插件列表」。原因=`settings.plugins.tab` 是 list slot，官方
  section 用 `ctx.slots.entries()` 原始列表渲染 tab，**不会按 id 去重**；我们注册同 id `all`
  的 shadow 只影响内容渲染，不影响 tab 列表，所以官方 `all` 和我们的 `all` 都显示。
  修复=在 `dsh-essentials/cordis.patch.yml` 顶层加 `- id: ui-settings-plugin-inventory
  disabled: true`，禁用官方只读插件列表 UI，由我们的增强 tab 完全接管；`--dump-config` 已验证
  `disabled: true` 生效。可复现?是（未禁用前重启进设置→插件）。
- **dsh-essentials 并入路由预设+mode-boost（2026-08-16，合并）**：用户要求把两个自定义预设
  （Router Standard/Spec）和相关插件（mode-boost）加入 dsh-essentials。执行=①复制
  `dsh-mode-boost/lib/{core,index}.js` → `dsh-essentials/lib/mode-boost/`，并在
  `lib/index.js` import+apply，`inject` 补 `systemPrompt/llm`，`cordis.patch.yml` 同步；
  ②复制 `dsh-router-standard/preset/{router-standard,router-spec}` →
  `dsh-essentials/preset/`；③package.json `files` 加 `preset`、description/exports 更新；
  ④README/根 README/THIRD-PARTY/AGENTS 同步。**坑**：mode-boost 无自重复守卫，若用户同时装
  独立 `@dsh-external/dsh-mode-boost` 会重复注册工具 → 文档明确先 remove 独立包。预设是文件型，
  不会随 bundle 自动安装，仍需复制到 `~/.dsh/.agent-presets/`。可复现?是（装 dsh-essentials
  后 dump-config 有 essentials 含 systemPrompt/llm；preset 目录存在）。
- **dsh-memory 自动兜底读不到用户消息（2026-08-16，修复）**：问题=用户问「这么多对话没触发
  记忆插件写记忆吗」，查 ~/.journal 无任何自动笔记。原因=自动兜底用了
  `session.getMessages({limit,direction})`，但 npm rc.6 的 `dsh-session` **没有该方法**（grep
  全包无 getMessages），session 实际提供 `deriveMessages()`；读取失败→lastText 空→`isTrivial`
  跳过，所有轮次都不写。修复=改用 `session.deriveMessages()` 从后往前找最后一条
  `role==='user'` 消息，仍保留 `session.lastMessage` 兜底。改动文件=`lib/memory/index.js`。
  可复现?是（旧代码在 rc.6 任何会话都不写自动笔记）。
- **dsh-essentials 设置图标先齿轮后替换（2026-08-16，修复）**：问题=刷新后打开设置，插件
  设置图标常先显示齿轮再变成自定义图标。原因=paste-input 的设置导航图标**没有自己的
  MutationObserver**，只靠聊天 foldScan 顺带 patch，设置打开时不触发；at-file 虽有 observer
  但仍可能晚一帧。修复=①paste-input `installNavIconPatch` 增加独立 body/dialog
  MutationObserver（与 at-file 同构）；②at-file observer 回调里加 `requestAnimationFrame`
  兜底 patch，尽量在首帧前换成正确图标；③两者都返回 disposer。改动文件=`lib/paste-input/client.js`
  + `lib/at-file/client.js` + `lib/client.js`。可复现?是（刷新后打开设置观察图标）。
- **dsh-essentials 模型选择搜索框边框异常（2026-08-16，修复）**：问题=模型选择页搜索框
  上边有白边、左右无边框只有上下有。原因=`.dms-searchInput` 用 `border-inverted` token 且
  `width:100%` 在 content-box 下左右边框被溢出/裁切。修复=`box-sizing:border-box` +
  `border:1px solid var(--dsw-alias-border-l2)`，四边统一标准边框。改动文件=
  `lib/model-selector/client.js` + `lib/client.js`。可复现?是（打开模型选择页看搜索框）。
- **dsh-essentials 设置插件市场标签页（2026-08-16，新增）**：用户要求在插件列表右侧加
  「插件市场」。实现=在 `lib/plugin-inventory/client.js` 的 `settings.plugins.tab` 再注册
  `id:"market"`、`order:20`、`priority:-1` 标签页；市场为静态卡片（本仓库 dsh-essentials /
  dsh-mac-desktop / dsh-mode-boost / dsh-router-standard），展示说明+安装命令+复制按钮，
  并通过 `pluginInventory.list()` 动态标记「已安装」；预设项标「预设」。CSS 沿用 `dspi-*`。
  注意=DSH 无市场后端，当前是静态市场/命令复制，不做在线安装。可复现?是（设置→插件→插件市场）。
- **dsh-essentials 插件列表按类型分组（2026-08-16，新增）**：用户要求设置→插件列表按
  「全部/内置/自定义」分类。实现=新增 `lib/plugin-inventory/client.js` 子模块（新 NS
  `essentials.pluginInventory`），以 `priority:-1` 覆盖官方 `settings.plugins.tab` id `all`
  标签页；组件保留搜索/展开卡片，新增三个 tab（全部/内置/自定义+计数），按
  `moduleName.startsWith('@deepseek-ai/')` 判内置、其余自定义；CSS 用 `dspi-*` 前缀并注入。
  同时把子模块并入 `lib/client.js`（parts 数组加 `sub_pluginInventory`），package.json
  peerDependencies 补 `@deepseek-ai/dsh-client-ui-primitives`，README 补一句。注意=官方
  inventory 的 list() 数据没有 source 字段，只能按包名前缀分类。可复现?是（打开设置→插件列表）。
- **dsh-essentials 设置「文件提及」图标换原生（2026-08-16，调整）**：问题=设置里「文件提及」
  导航图标是手绘文件轮廓（stroke 2）太丑。修复=`patchAtFileNavIcon` 的 `FILE_ICON_PATHS`
  换成 DSH primitives `ic_ds_browse_outline_16` 的官方路径（文档+内容行，fill:currentColor），
  path 属性从 stroke 改为 fill，风格与 DSH 原生图标一致。改动文件=`lib/at-file/client.js` +
  `lib/client.js`（合并产物同步）。可复现?是（打开设置看「文件提及」导航图标）。
- **dsh-essentials 思考等级图标回退（2026-08-16，回退）**：用户要求去掉刚加的头脑图标、
  恢复原生。执行=移除 `IconThink` 组件、推理等级 cell 里的 `span.dms-cellIcon` 以及
  `.dms-cellIcon` CSS；保留「模型/推理等级」6px 间距和其他原生图标调整。改动文件=
  `lib/model-selector/client.js` + `lib/client.js`。可复现?否（一次性偏好回退）。
- **dsh-essentials 触发器三段行高不一致（2026-08-16，调整）**：问题=对话右下角触发器里
  「思考等级/模型/提供商」高度不一。原因=`.dms-triggerLabel`/`.dms-triggerEffort` 继承
  20px 行高，`.dms-triggerProvider` 单独 `line-height:16px`。修复=三者的 `line-height` 统一为
  `20px`（provider 仍 11px 字号但行高一致），flex 垂直居中后高度一致。改动文件=
  `lib/model-selector/client.js` + `lib/client.js`。可复现?是（看对话右下角触发器）。
- **dsh-essentials 模型选择滚动条仍有 1px 细缝（2026-08-16，修复）**：问题=去掉 menu
  padding-right 后右侧仍有一条很细缝隙。原因=`.dms-menu` 右边框本身占 1px，滚动条最多到
  内容区右缘，边框仍可见。修复=模型 pane 的 menu 加 `dms-menuModel` 类并
  `.dms-menuModel { border-right: none }`，滚动条贴到最右缘；根菜单/其他 pane 仍保留右边框。
  改动文件=`lib/model-selector/client.js` + `lib/client.js`。可复现?是（模型选择页滚动条）。
- **dsh-essentials 思考模式加头脑图标+间隙（2026-08-16，调整）**：问题=用户希望「推理等级/
  思考模式」入口参照 ZCode 加一个头脑图标，且与「模型」入口之间留间隙。修复=①新增
  `IconThink` 组件，直接用 DSH primitives `ic_ds_think_outline_14` 官方路径（14px，
  fill:currentColor，原生风格）；②在根菜单「推理等级」cell 的 label 前插入
  `span.dms-cellIcon`；③`.dms-cell + .dms-cell { margin-top: 6px }` 给「模型/推理等级」
  两行加间距；④`.dms-cellIcon` 用 inline-flex 居中。改动文件=`lib/model-selector/client.js`
  + `lib/client.js`。可复现?是（打开模型选择根菜单）。
- **dsh-essentials 模型选择菜单滚动条右侧空白（2026-08-16，修复）**：问题=模型选择页滚动条
  离右边缘有 4px 空白，搜索框边框也没到右缘，视觉像溢出。原因=`.dms-menu` 统一
  `padding: 4px`，右侧内容（搜索框/滚动列表）整体内缩。修复=`.dms-menu` 改为
  `padding: 4px 0 4px 4px`（右侧内边距归零），滚动条与搜索框都贴到右边缘；左/上/下仍保留
  4px。改动文件=`lib/model-selector/client.js` + `lib/client.js`。可复现?是（打开模型选择页）。
- **dsh-essentials 模型选择器图标换原生（2026-08-16，调整）**：问题=用户嫌回形针旁模型
  选择器的箭头/下拉图标/对钩是手绘 stroke SVG 太丑，且箭头与文字行内高度有偏差。修复=
  ①四个图标（chevron-down/right/check/clear）的 path 换成 `@deepseek-ai/dsh-client-ui-primitives`
  官方图标数据（fill:currentColor，无运行时依赖，仅内联路径）；②`.dms-chevron`/
  `.dms-groupChevron`/`.dms-cellChevron` 统一 `display:inline-flex; align-items:center;
  justify-content:center; line-height:0`，消除 SVG baseline 造成的行内偏移；③`.dms-check svg`
  设 `display:block`。改动文件=`lib/model-selector/client.js` + `lib/client.js`（合并产物同步）。
  可复现?是（打开模型选择器看触发器箭头/下拉菜单/对钩）。
- **dsh-essentials 模型名过长显示不够（2026-08-16，调整）**：问题=对话右下角模型选择器
  触发器 `.dms-trigger` 写死 `max-width: 220px`，长模型名只能省略号截断。修复=改为
  `max-width: min(420px, calc(100vw - 48px))`，桌面端给到 420px，窄屏按视口收缩；模型名
  `.dms-triggerLabel` 仍保留 ellipsis 兜底，hover title 有全名。改动文件=
  `lib/model-selector/client.js`（子源码）+ `lib/client.js`（合并产物）。可复现?是（长模型名
  在 composer 右下角可见截断）。
- **dsh-essentials 回形针菜单不自动关闭（2026-08-16，修复）**：问题=点回形针弹出
  「选择文件/选择文件夹」菜单后，光标移开菜单不关，必须再点一次回形针。原因=`AttachButton`
  只用 `onClick` 切换 `open`，没有任何鼠标离开关闭逻辑。修复=在 `.dshca-wrap` 上加
  `onMouseEnter={cancelAutoClose}` + `onMouseLeave={scheduleAutoClose}`：离开后 150ms 自动
  `setOpen(false)`，期间回到按钮/菜单会取消定时器（避免按钮→菜单 6px 间隙误关）；组件卸载时
  `useEffect` 清理定时器。改动文件=`lib/paste-input/client.js`（子源码）+ `lib/client.js`
  （合并产物，两者同步改）。可复现?是（点回形针后光标移出 wrap）。
- **dsh-essentials 重装 web profile（2026-08-16）**：用户要求先装跨平台插件。
  跨平台核查=纯 JS host + web client，无 `.node`/child_process/平台专有路径；唯一平台分支是
  paste-input 对 `process.platform === 'win32'` 的文件名大小写/保留名处理（属适配非限制）。
  安装=`dsh plugin --profile web add ./dsh-essentials` 即完成：profile package.json 自动把
  `dsh-essentials` 加进 `dsh.profile.bundles` + dependencies，bundle 自带 patch 自动插入
  `essentials` entry（inject fs/webServer/tools/loader/sessions/settings/typert/agents/skills），
  无需手工改 cordis.patch.yml；`--dump-config` 可见 `# == dsh-essentials` + entry 且与 mode-boost
  共存。注意=新 bundle 需重启 dsh 进程才生效。可复现?是（干净 profile 直接 add 即可）。
- **当前 web profile 第三方插件核查（2026-08-16 快照）**：`dsh plugin --profile web list` 仅
  1 个第三方 bundle 依赖=**@dsh-external/dsh-mode-boost**（link 到本仓库 dsh-mode-boost）；
  `~/.dsh/.agent-presets/` 有 **router-standard / router-spec** 两个第三方预设（来自
  yjh051108/dsh-router-standard）；**dsh-essentials / dsh-mac-desktop 已不在当前
  profile**（`package.json.bak-20260816-101607` 显示 10:16 时仍在 bundles+deps，现已被移除），
  仓库目录仍保留但未激活；官方 bundle 只有 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`。
  可复现?是（读 profile package.json / `dsh plugin list`）。
- **会话 zstd 修复假成功：zstd CLI 管道静默失败（2026-08-16，真修复）**：问题=上次用
  `zstd -dc | python | zstd -o` 管道改会话 agentPreset，验证时看到 router-standard，但重启后
  报错依旧（仍 router-flash）。原因=**zstd CLI 管道在 zstd -o 步骤静默失败/未生效**（多帧
  zstd 流经管道重压后写入失败或写入的是临时文件未 mv 成功），之前「验证通过」读到的是临时
  文件假象。**正确修法=node zlib 直接操作**：读二进制→按 magic (28 B5 2F FD) 找帧边界→逐帧
  zstdDecompressSync→改第一帧 header 行 agentPreset→逐帧 zstdCompressSync({checksumFlag:1})
  重压（**保持多帧结构，每帧一行，与 DSH 写格式一致**）→写回（先 cp 备份）。**DSH zstd 格式
  契约**：多帧文件（每次写入一个 batch 一帧），第一帧必须恰一行 header（assertZstdHeaderFrame：
  `indexOf(10) === length-1`）；node zstdDecompressSync 只解第一帧（多帧流只返回首帧），
  zstd CLI -dc 解全部帧——验证时注意区分。验证=全库 132 会话第一帧全合法 + 无 router-flash
  残留。可复现?是（zstd CLI 管道改多帧 zstd 文件会静默失败）。
- **删除预设后旧会话报 "preset not found"（2026-08-16，修复）**：问题=删掉 router-flash 预设后，
  新建/恢复会话报 `agent-presets: preset "router-flash" not found (available: standard, code,
  minimal, cordis, router-spec, router-standard)`。原因=会话存储首行 session 元数据的
  `agentPreset` 字段记住了创建时的预设 id，预设删除后 roster 解析失败。**会话存储位置**=
  `~/.dsh/sessions/<工作区-hash>/session-<id>/session.jsonl.zstd`（zstd 压缩 JSONL）；首行
  `{"type":"session",...,"agentPreset":"<id>"}`。解法=解压→只改首行 agentPreset 为现有预设
  （router-standard，日常向）→重压缩写回（先备份 .bak）；全库扫描 `find ~/.dsh/sessions -name
  'session.jsonl.zstd'` + grep 首行。本次修 5 个会话（deepseek-plugins 1 + ai-test 4）。
  可复现?是（删预设 + 旧会话 resume 必现）。
- **预设描述中文化（2026-08-16）**：用户要求 router-standard/router-spec 两预设描述改中文
  （官方预设即中文）。本机 ~/.dsh/.agent-presets/ + 仓库 dsh-router-standard/preset/ 四份
  preset.yml 同步改；描述含全角括号/分号无 YAML 问题，仍保留双引号保险；js-yaml 解析验证
  通过。THIRD-PARTY 本地修改记录更新（② 加引号+中文化）。可复现?否（一次性偏好）。
- **harness 源码目录已删除，零影响（2026-08-16）**：问题=用户手动删了
  `/Users/fangshoufanji/workspace/deepseek-harness/`，担心有影响。核查=①运行实例=npm rc6
  （/opt/homebrew/bin/dsh，PID 67591）HTTP 200 正常；②profile（package.json/patch/settings）
  与插件仓库（dsh-essentials 含子模块、scripts/）**零引用**该路径（grep 全空）——此前迁移已把
  插件依赖改为 npm registry 包（0.1.0-rc.6）而非 link 到 harness，junction 指向 deepseek-plugins
  不受影响；③npm 版 dsh 自带全部组件无需源码。结论=删除是「npm 为主不存源码」的最后一环，
  **彻底安全**；AGENTS.md 已更新（契约不确定时读 npm 包产物 /opt/homebrew/lib/node_modules/
  @deepseek-ai/ 或官方 GitHub，不再指向本地源码）。NOTES 中历史记录（dsh-at-file link 路径、
  --dsh 源码路径）为档案保留。可复现?否（一次性迁移完成）。
- **mode-boost 收编+安装完成（2026-08-16，29e7ec2）**：问题=用户确认「装且收编」mode-boost。
  执行=①`git subtree add --prefix=dsh-mode-boost`（需先 unshallow 上游克隆，浅克隆被拒
  "shallow roots are not allowed"）；②**非 bundle 纯 Cordis 插件**（`export const name`+`apply`，
  无 dsh.bundle.patch/cordis.patch.yml）→ `dsh plugin add` 只装进 profile dependencies 不会
  进 loader；③激活=profile `cordis.patch.yml` **必须用 `insert:` 语法**（patch 顶层条目分两种：
  无 insert=改已存在 entry→新 entry 报 "entry not found"；带 insert 才是插入新 entry）；
  `name` 裸包名 `@dsh-external/dsh-mode-boost` 由 loader **双锚解析**（dsh 安装→profile
  node_modules，baseUrl=profile 目录）。**pnpm store 版本错位坑**：npm 版 dsh 转发系统 pnpm
  v10（/opt/homebrew/bin/pnpm）而 profile 是 v11 store 装的 → `ERR_PNPM_UNEXPECTED_STORE`；
  解法=`CI=true pnpm install` 用 v10 重装对齐（Homebrew pnpm 10.28.2），此后 `dsh plugin
  --profile web add` 直接可用。验证=dump-config 出现 mode-boost entry + 启动 HTTP 200 进程
  存活。注=mode-boost 运行时生效需新会话（system-prompt/assemble 时注入），loader 装配链路
  已通。可复现?是（非 bundle 插件激活必须 insert 语法；store 错位必现）。
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
- **preset.yml YAML 解析坑：description 含 `: ` 未加引号 → 设置页「无描述」（2026-08-16）**：
  问题=用户报 router-standard/router-spec 两预设「没有描述」。原因=metadata.ts 用 yaml.load
  读 preset.yml，description 行 `Task-aware routing — RL-interface restoration: ...` 里冒号后跟
  空格被 YAML 当作嵌套映射开始（bad indentation of a mapping entry）→ 整个 metadata 解析失败
  → 设置页显示「无描述」（代码 `text.description ?? t('noDescription')`）。官方预设描述无冒号
  所以正常。**上游 v0.2.0 自身 bug**（最新 main 仍未修，克隆即现）。解法=description 值加双
  引号（`description: "..."`），js-yaml 正常解析 name+description。修复点=本机
  ~/.dsh/.agent-presets/{router-standard,router-spec}/preset.yml + 仓库
  dsh-router-standard/preset/{router-standard,router-spec}/preset.yml（THIRD-PARTY 已记第二处
  本地修改，下次 subtree pull 复查）。验证=js-yaml 重新解析 OK。可复现?是（任何含 `: ` 的
  未引号 YAML 标量都会触发）。
- **决策：绕过套装仓库，直接用源仓库（2026-08-16，用户拍板）**：问题=router-standard 相关
  记录多处以「dsh-routing-suite 套装仓库」为框架（生态调研/双组件收编/辨析三条），用户要求
  套装仓库记录都去掉、直接用源仓库 `yjh051108/dsh-router-standard`（独立仓库，remote 别名
  `upstream-router-standard` 已配）。解法=NOTES 三条改写/删除：①「生态调研」整条删（内容已被
  收编+更新记录取代）；②「双组件收编落地」改写为源仓库视角（保留 super-injector 收编/构建
  细节——该插件已删但经验留档）；③「anchored-standard vs routing-suite 辨析」改写为
  anchored-standard vs router-standard（保留 anchored 调研）。AGENTS 索引去 routing-suite
  字样；THIRD-PARTY 上游列标注「源仓库，套装已弃用」。**不动**=dsh-router-standard/docs/ 下
  上游自己的文件（statement/blog/apology 里的套装引用是上游作者陈述，subtree 原样收编，改
  了破坏与上游一致性、下次 pull 冲突）。可复现?否（决策）。
- **dsh-router-standard 更新至上游 v0.2.0（2026-08-16，subtree pull 246a700/2e2368f）**：
  问题=本地收编 v0.1.1（d4655d5）落后上游。解法=`git subtree pull --prefix=dsh-router-standard
  upstream-router-standard main --squash`（remote 别名 upstream-router-standard，上游=
  yjh051108/dsh-router-standard 独立仓库，非套装仓库——基线 a97b7df6 是本地 squash commit
  非上游对象，原始 commit 是 d4655d5 在独立仓库）。**v0.2.0 重大变化**：①拆双预设
  （preset/router-standard=RL 接口还原 think-act 循环 / preset/router-spec=深度思考优先长链）；
  git 自动识别旧 preset 文件 rename 到 router-spec/；②理论勘误（双吸引子 A1-A4 标注作废，
  改断层/断裂带叙事 + 道歉声明 docs/apology.md）；③修 crash bug（legacyCore import bandOf
  ReferenceError）+ issue #3 firstUserText。**踩坑=上游 v0.2.0 自身测试是坏的**：router.test.mjs
  仍 import 旧路径 `./preset/router-core.mjs`，拆分后文件已移入子目录——上游 clone 直接跑也
  ERR_MODULE_NOT_FOUND；本地修 import → `./preset/router-standard/router-core.mjs`，15 测试全
  过（这是本仓库对上游的唯一本地修改，已记 THIRD-PARTY）。**本地预设同步**：删旧
  .agent-presets/router-standard 重建（loader 按 URL 缓存 ESM，不能原地覆盖——上游 README
  明示）+ 新增 router-spec；settings 默认仍 router-standard（新行为=RL 接口还原）。选择指引=
  standard 日常高效执行 / spec 复杂新功能先想透。验证=node --test 15/15 + npm 版 dsh 启动
  HTTP 200。可复现?是（上游测试 bug 克隆即现）。
- **npm 版 dsh 迁移：裸 profile 启动成功 + 端口冲突（2026-08-16，进行中）**：问题=插件
  dsh-essentials `dependencies:{}` 空、6 个 harness 内部包只声明 peerDeps（dsh-typert-protocol/
  dsh-tools/dsh-skill/dsh-settings/dsh-llm/schemastery）→ npm 版解析不到（Node ESM 从插件文件
  路径向上找 node_modules，够不到 /opt/homebrew；实验③证 cwd 在 harness 也失败）。修复=插件
  package.json 补 dependencies（含闭包 cordis/dsh-scope/dsh-session/dsh-timeout/dsh-invariants，
  版本对齐 rc.6）+ 仓库根 pnpm install → import 全部 OK。**用户决定先裸启动**：profile 三处拆
  卸（bundles 数组删 dsh-essentials/dsh-mac-desktop、dependencies 清空、node_modules junction
  删）→ npm 版 `dsh web --port 0` 启动成功（HTTP 200 + __DSH_BOOT__，只剩官方 bundle）。
  **新坑=端口冲突**：默认 `dsh web` 报 EADDRINUSE 127.0.0.1:3080——被 10:01 启动的源码实例
  （PID 63881，apps/cli/src/bin.ts，带 mac-desktop 壳 63883）占用；进程内仍是旧 profile（含
  插件）。切换=停旧实例（63881+壳）→ `dsh web` 裸启动，**当前对话会中断**（用户已确认，自切）。
  可复现?是（npm 版与源码版共用 3080 默认端口+同 profile，必然冲突；插件 peerDeps 缺陷是
  根因，源码 harness node_modules 恰好掩盖）。
- **决策：harness 源码不再本地修改，dsh 改用 npm 安装（2026-08-16，用户拍板）**：问题=之前为修
  子-agent 400 打的本地补丁 eb2ae502b7（supportsDeveloperRole，改 llm-pi-ai 3 文件）直接改了
  harness 源码，用户明确「这个不要改」。解法=①`git revert eb2ae502b7`（a73a6571fc，3 文件恢复
  官方，git diff 47f943859b 确认源码与远程一致；revert 保留历史可追溯）；②以后**不再本地改
  harness 源码**，修复走插件/settings/预设层；③本机 dsh 迁移方向=**npm 安装**（`@deepseek-ai/
  dsh@0.1.0-rc.6` 是聚合包，bin=dsh，dependencies 含 dsh-web-app/dsh-base 等全部组件，web GUI
  随依赖装，无需源码目录），插件照常 `dsh plugin add`（GitHub 子目录 URL 或本地目录），不依赖
  harness 源码。**npm 包=编译产物非源码**（拆包核实：files 白名单仅 lib/*.js + *.d.ts +
  cordis.patch.yml + config yml，无 src/ 无 .ts 实现）——本地不存 TS 源码，物理杜绝误改。
  **代价**=子-agent 400 问题（qwen/DashScope 拒 developer role，pi-ai 自动检测
  误判）回退后复发，官方 rc.6 亦不含该修复（npm pack 解包 grep 证实）——接受或待官方修复；
  插件 devDeps 的 `link:../../deepseek-harness` 仅构建/测试用，运行时不受影响。可复现?否（决策）。
  **执行进度（2026-08-16）**：①已 `npm i -g @deepseek-ai/dsh@0.1.0-rc.6`（531 包，bin=
  /opt/homebrew/bin/dsh → lib/bin.js，`dsh --version`=0.1.0-rc.6）；②只读验证 `dsh --profile web
  --dump-config` 能解析现有 profile，dsh-essentials/dsh-mac-desktop 都在组合树——**npm 版可直接
  读现有配置与插件，切换无需改 profile**；③切换时机=用户定（下次自然重启时用 `dsh web` 替代
  `pnpm dsh web`，重启会中断会话，故等下次重启；删 harness 源码目录是最后一步待用户确认）。
- **npm rc.6 未同步 GitHub 的补充核实（2026-08-16）**：问题=rc.6 已发 npm 但 GitHub 没更新。
  核实=①npm `@deepseek-ai/dsh` latest=0.1.0-rc.6（08-13T12:35Z 发布，包定位 apps/cli）；
  ②GitHub master 最新=47f943859b（rc.5 release abe560f81e + npm-public merge），**远程无任何
  tag、无 rc.6 commit**——发布流程从 CI/分支直发 npm，不同步回 master；③**npm rc.6 包不含
  supportsDeveloperRole**（下载 tarball grep 证实）——本地补丁 eb2ae502b7（08-16）比 rc.6 晚，
  若 git pull 或用 npm 装 rc.6 会丢修复/回退行为。结论=源码运行（workspace checkout+link）与
  npm 发布版无关，保持现状；等 master 真同步了再 pull 并核对补丁。可复现?是（npm pack 解包
  grep 即证）。
- **router-flash 预设来源澄清（2026-08-16）**：问题=「Router Flash (opencode-go)」预设是哪个
  插件给的。原因=易混三点：①它是**第三方 agent 预设**，来自 SheberDavid/v4-flash-godmode-
  opencode-go（8/15 手动装：clone 后复制 preset/ 到 `~/.dsh/.agent-presets/router-flash/` +
  settings.yaml `agent-presets.default: router-flash`），专为 opencode-go 供应商的
  deepseek-v4-flash 特调（/flash/i 匹配，w7 方案）；②与 dsh-router-standard **两套独立代码**
  （同名文件 md5 全不同，仅目录结构撞名；agent.cordis.yml 注释头残留原作者字样=fork 改造）；
  ③与已删 dsh-opencode-go-usage（Xenia0922 用量仪表盘 bundle）**无关**，只是都沾 opencode-go
  字眼。预设非 bundle，不在瘦身范围。解法=查 `~/.dsh/.agent-presets/<id>/preset.yml` 的 name
  + NOTES 安装记录即可溯源。可复现?是（同名目录预设撞名易混，先 md5 再下结论）。
- **NOTES.md 增长策略决策（2026-08-16，用户确认「维持现状+阈值」）**：问题=NOTES 已达 350KB，
  担心越来越大是否有影响。分析=逐维度无影响：①不注入每轮上下文（只有 AGENTS.md 进 64KB
  预算），涨到 35MB 也不影响推理成本；②按需读（read 分页 + grep 全文毫秒级）；③git delta
  压缩实际存储几十 KB，每次追加只几行 diff；④编辑冲突风险不随体积变大（追加最上方+改前必
  read 约定已覆盖）。唯一真实风险=**被整读**：350KB 中文 ≈ 9-12 万 tokens，一次读入爆上下文
  → 永远不要整读 NOTES.md，按需读、靠索引+标题 grep 定位。阈值约定=**~1MB 或活跃条目 ~100
  条再分片**，届时方案：按月分片 docs/notes/2608.md（AGENTS 索引带月份）或归档滚动（主文件
  只留近 N 条）。可复现?否（决策记录）。
- **README/THIRD-PARTY 精简（2026-08-16，README 7.2→5.0KB、THIRD-PARTY 6.4→4.8KB）**：
  问题=瘦身收尾后 README 三个安装小节重叠（--dsh 说明重复两处、历史说明重复）+ THIRD-PARTY
  头部两段信息重叠 + at-file/paste-input 详情节 commit 级细节过长。解法=README 安装合并为
  「一键全部」+「单个·批量」两小节，去掉重复 `--dsh` 与重复历史说明；「如何新增」删动态
  Cordis 形态（dsh.plugin.json+host.js/client.js 已废弃，历史在 NOTES）只提
  `dsh.bundle.patch`/`dsh.client`。THIRD-PARTY 头部合并一段（2026-08-16 变更：at-file/
  paste-input 已并入 dsh-essentials + 六插件已删）；一览表每行压缩为要点级（link 路径改两跳、
  locale/图标/token/资源优化三轮、router-standard 原样收编），commit 级细节删（NOTES 有全文）；
  保留维护流程与判定规则两节。**NOTES.md 判定为档案不精简**：349KB 不注入、按需读，靠索引
  导航，内容精简反而丢可发现性。可复现?否（一次性收尾）。
- **AGENTS.md 二轮精简（2026-08-16，19.5KB→11.2KB，-43%）**：规则部分压 1.5KB（动态插件半节废弃并入「仓库概况」一句、目录树 8 行→2 行、引言行合并、版权条 B 站示例泛化）+ 索引 51→39 条（删纯历史/已删插件时代低价值条目：GitHub 同步、super-injector 删除、paste-input 真机/脱钩、at-file 收编、Tauri 零耦合、借鉴点落地、贡献者重写、bundle link、monorepo 合并、动态插件 define、headless 合并、主题 token 与图表悬停合并为一条）+ 多条索引合并（bundle 通用套路、mac-desktop 汇总保持）+ 每条保留 1-3 行要点（完整细节仍在 NOTES）。11.2KB 占 64KB 预算 17%。可复现?是（索引价值=可发现性，压太狠会丢导航）。
- **AGENTS.md 精简重写（2026-08-16，78KB→19.5KB，-75%）**：问题=201 条索引里约 100 条指向已删除插件（notification-center/usage-dashboard/plugin-classifier/skill-manager/better-sidebar/vision-bridge/ocgo/dream-skin/agent-teams/bilibili），且 78KB 超 64KB 每轮注入预算被截断。解法=索引区重写为「仅当前有效经验」51 条精选导航：瘦身决策（essentials 合并/inject 坑/super-injector 删除/GitHub 同步）、settings.yaml 与 LLM 契约类、essentials 五子模块关键经验、mac-desktop 汇总一条、router-standard/第三方治理、scripts 守护、通用方法；已删插件经验合并为一句导航指向 NOTES.md；规则部分微调（bundle 示例改 dsh-essentials）。可复现?是（AGENTS.md 超预算必然被截断，任何大仓库都适用）。
- **GitHub 仓库内容同步（2026-08-16，25f7cdb）**：瘦身 commit 推送（21 个，92960ec..b8bea2e）+
  清理历史遗留——`.agent-teams/`（已删插件归档）与 `viz/`（历史卡片副本）在 .gitignore 却仍被
  git 跟踪（`git ls-files -ci --exclude-standard` 可查），`git rm --cached` 停止跟踪本地保留；
  `docs/agent-self-optimization.md` 是 NOTES 引用的有效契约文档，从 .gitignore 移除保留跟踪；
  根 package.json description 更新（旧文还写"自有 7 个插件 + better-sidebar/at-file"）；AGENTS
  目录计数 4→3。验证=GitHub API contents 有 CDN 缓存延迟，**以 `git ls-tree origin/main` 为准**。
- **dsh-zcode-import 清理（2026-08-16，用户决定处理掉）**：ZCode/Codex 迁移会话绑定插件
  （@dsh-external 私有包，0.0.1）——注入器删除后 junction 成死引用（重启后 boot manifest 0
  引用），随用户决定一并删除：profile junction + 仓库未跟踪目录；引用核查=settings.yaml/
  patch/package.json 均无残留。至此非官方插件只剩 dsh-essentials + dsh-mac-desktop（+ router-standard
  预设），profile node_modules 顶层仅两 junction。
- **dsh-super-injector 删除（2026-08-16，用户决定只留 router-standard 预设）**：问题=瘦身后
  剩下 4 个非官方插件，用户确认去掉注入器（保留预设）。**核实结论**：super-injector 与
  router-standard 零依赖（grep 双向无引用）；预设里的 `dev_router_status`/`dev_router_mode`/
  `dev_mode_subagent` 是预设自己 `ctx.tools.register` 注册的（`preset/router-bootstrap.mjs`），
  只是名字撞 `dev_` 前缀，与注入器的 `dev_inject_plugin` 等无关——删注入器不影响预设。
  删除点=profile package.json（dependencies + bundles 数组各一处）+ node_modules junction +
  仓库目录 + 文档三处（README/THIRD-PARTY/AGENTS）。注意=当前运行实例的 loader 还挂着
  injector（进程内），重启后才消失；`~/.dsh/super-injector/` 运行数据（self-heal.log 等）
  留存但无影响。可复现?否（一次性决策）。
- **dsh-essentials 合并包启动报错：inject 服务名 `agent`≠`agents` + visualize config 无兜底（2026-08-16，zcode 定位修复 47d0d1a）**：问题=合并后 dsh 启动失败。原因=①inject 项是 **Cordis 服务名**（非 entry id）：dsh-agent 注册的服务是 `agents`（源码 `super(ctx,'agents')`），`ctx.agent` 只是恒为 undefined 的 DX accessor，声明 `agent` → Cordis 等一个永不出现的服务，组合永不就绪；②visualize 依赖 `ctx.skills.registerProvider` 但 inject 未声明 `skills`，同样等不到；③`applyVisualize(ctx, config.visualize)` 无兜底，profile 未传 config 时 `config.visualize===undefined` → visualize apply 内 `config.maxFractionBytes` TypeError 崩溃（at-file 自身模块 inject 是 `["typert","settings","agents"]`，合并时手工并集抄错）。解法=inject `agent`→`agents` + 补 `skills`；`applyVisualize(ctx, config.visualize ?? {})`。验证=node --check + 重启后 boot manifest 含 essentials client entry；**合并包的 inject 并集必须逐子模块核对真实服务名**（grep `ctx.<svc>.` 调用），子模块有默认参数（`config = {}`）的才安全，visualize 无默认参数必须兜底。可复现?是（任何把服务名写错/漏声明的合并包都会启动失败）。
- **16 插件瘦身：5 个合并为 dsh-essentials 组合包 + 9 个删除（2026-08-16）**：问题=16 个独立
  bundle 装配过重，5 个高频日常插件（模型选择器/记忆/粘贴输入/@引用/可视化）可合一，9 个停用
  插件（ocgo/通知中心/vision-bridge/skill-manager/plugin-classifier/usage-dashboard/
  dream-skin/better-sidebar/agent-teams）应删。**client 合并的硬约束**：bundle 客户端模块系统=
  每包一个 boot graph 入口（id==包名），bundle script 只注册 factory（`window.__ModuleLoader__
  .load({id,factory})`），重复注册同 id 会 throw，且**只有 graph entry id 会被激活** → 合并后的
  client 必须物理上是**一个 factory**：五个子 factory 提为命名函数，一个入口 factory 顺序调用
  并去重 inject。host 侧=一个 apply 调五个子 apply 同一 fiber（ctx.on/ctx.effect 一起回收），
  inject=并集（host 8 项：fs/webServer/tools/loader/sessions/settings/typert/agent；client 7 项）。
  **profile 层**：bundle 自带 cordis.patch.yml 自插 entry，**profile 手动 insert 同 entry 会
  duplicate loader entry id 启动崩溃**（dream-skin 教训）→ 合并包自插，profile 手插行删除。
  **git 历史保留**：`git rm` 旧目录 + `git add` 合并目录（内容逐字复制）→ git 自动识别 rename（R）。
  生成器=/tmp/build-essentials-client.mjs（括号匹配跳过字符串/注释/正则字面量），改子源码后
  重新生成 lib/client.js。验证=materialize 测试（stub __ModuleLoader__+DOM）+ host 加载验证
  （@deepseek-ai symlink 到 workspace 包）；host 半区改动**需重启 dsh 生效**。
  可复现?是（client 单 factory 约束=模块系统契约所致，任何多合一 bundle 都适用）。
  副作用=重启后 vision-bridge 删除 → 发图/切模型守卫回退（附件限制回 5MB、llm-deepseek 官方
  路由恢复 active）、skill_manage/find_plugin/agent_teams_* 工具消失、换肤/侧边栏回默认；
  settings.yaml 的 `dsh-better-sidebar` 键孤儿残留（故意保留，勿用 PyYAML 重写）。
- **「模型选不了」根因=settings.yaml 被 Python YAML 重写，132 个 reasoningEfforts 的 `off:` 键变布尔 `false:` 键**：PyYAML（YAML 1.1）把裸 `off` 解析成布尔 false，重写落盘成 `false: null`；harness 用 yaml 2.9（YAML 1.2）读成布尔键，`assertServiceable` 校验 THINKING_LEVELS 键名失败 → 拒掉整个 llm-pi-ai 分节 → 全部自定义路由模型消失 → 模型选不了；修复=`false: null` → `'off': null`（**必须带引号**，否则 PyYAML 再读还会变布尔；文件里已有 3 处带引号先例），双解析器验证（yaml2.9 + PyYAML 均 0 布尔键）+ `Config(section)` 解析 9 provider/330 模型通过；改完需重启 dsh 生效；备份=settings.yaml.bak-falsekey-*/bak-offquote-*（见 NOTES.md）。
- **commit 4b9bb79（memory cap/memo + ocgo 单遍/inline）只读审查=4 项全正确**：listJournals 全局 YYMM+DD
  降序取前缀，cap 恰好等于全量前 N 条，够 max 即 break 不再 listDir 旧月份（调用方仅 buildIndex:120 /
  composeSummary:maxEntries，若误传 max=0 会返空——当前无此调用）；mdHtml 单条目 memo 纯函数无过期，同输入同输出
  （undefined/'' 同键同结果）；collectDshScan 单遍合并标题/用量=旧两遍逐字等价（多标题最后一个生效/无标题 null/
  cache 增量按会话顺序/cache 非单调 Math.max 防御/标题后置回填发生在全部会话后）；删 snaps 死 Map 无残留引用；
  buildView 内联 today/month/total 复用单次 dk/costOf，membership 与 r4 舍入（只在最终合计）与旧 agg(filter) 逐字段
  浮点等价。验证：ocgo test 10/10、memory smoke 50/50、/tmp 合成数据新旧算法逐行 deepEqual。（经验=本次无新增）
- **dsh-memory + dsh-opencode-go-usage 只读跨切面资源审计（契约核对）**：对照 harness core/session、
  agent、session-query 源码——①memory `agent/turn-stopping` 兜底里 `session.getMessages` / `session.lastMessage`
  在 harness `Session`（core/session types.ts：仅 surface/header/id/firstLiveSeq/events）**不存在**→ 兜底永不写文件，
  每轮 turn 死监听；②ocgo `fetchAll` 的 45s cache TTL(807) < 客户端 60s 轮询 → 缓存轮询路径永远 miss，
  每次轮询都对全量 corpus 重跑 `backfillDsh`+`buildView`（in-place 幂等但 O(N×M) CPU，840-843）；③ocgo `collectQuota`
  每次轮询重读 auth.json + HTTPS，无 TTL 缓存。审计结论=无 HIGH/无界缓存/O(n²)（cache/lastScan/entryCache/summaryCache 全有界），
  两插件事件流无重复消费（ocgo 单次 readSession 内折叠标题+usage，memory entryCache 指纹自愈）。可复现?是（读 harness 类型即可证）。
- **「另一个会话发图后报错」根因与修复（vision-bridge ee04118）**：症状=ai-test 会话
  `pi-ai model "deepseek-v4-flash" does not support image input`（turn 16 step 2 / turn 17 /
  18 连续 UNSUPPORTED_CONTENT，compaction 也随之失败）。**根因链条**：① 用户发图→图片进
  inbox（agent/inbox/spliced）→ pre-step 改写 claimed 消息→ loop 把改写版 append 成
  user/message → surface 干净 → step 1 成功（模型看到描述后调 `read_image`）；② 内置
  `read_image` 的结果由 harness 直接以 `tool/result` 事件 append 进 **session surface**
  （tool-calls.ts appendToolResult，surfaceOp:append）——**不经 claimed 消息**，pre-step 的
  decision.messages 改写覆盖不到；③ 下一步模型请求来自 `session.deriveMessages()`（surface
  投影，深冻结，无去重——user/message 与 tool/result 各自投影），含图 tool/result 原样进入
  纯文本适配器；④ llm/stream 兜底因 `Object.isFrozen(options)` 跳过冻结的 loop 请求 → 直
  达 pi-ai → UNSUPPORTED_CONTENT。**关键契约**：session surface 支持 **replace 操作**
  （`{op:'replace',start,end}` + `sourceEventSeqs` 覆盖被替换节点；tool/result 重写只允许改
  content——`assertToolResultRewrite` 把 content[0].content 置 null 后深比较其余字段，所以
  turn/step/error/meta/role/source/callId 必须原样保留）；`session.append` 同步校验、确定性
  失败；`ctx.on('session/event', (session, event))` 可监听到所有 live session 的 append
  （store ctx 向上传播，notification-center 同模式）。**修复**：session/event 落地时记录含图
  tool/result（WeakMap 队列，热路径零开销；首见会话全量扫一次 surface 兜底重启续会话），
  pre-step 用 surface replace 把改写版替换回去 → surface 永久干净，loop/compaction/标题生成
  投影都不再含图；直通（多模态路由）保留原图，切回文本路由后补替换（队列留存）。
  **验证**：新增第十二批 19 断言全绿 + 真实 Session 契约脚本（替换被接受/deriveMessages 无
  图/改 role 被拒）；**需重启 dsh 进程生效**（host 半区改动）。**排查工具沉淀**：zstd 解压
  session 日志后按 type 过滤 surface 事件（user/message、assistant/message、tool/result +
  surfaceOp/sourceEventSeqs），含图事件用递归 has_image 扫描；`turn/end` reason.kind=error
  带 code/message。
- **子 agent 全部 400 INVALID_REQUEST 根因定位与修复（harness eb2ae502b7）**：症状=每次 subagent/
  workflow 子 agent 首请求即挂，错误 `developer is not one of ['system','assistant','user','tool',
  'function'] - 'messages.['0'].role'`。**根因链条**：① 子 agent 继承 `parent.options.provider`
  （创建时快照=qwen），而主会话请求头是 jiyuanlvdong/opencode-go（model-selection 的
  selectionFor(agent).current 覆盖）→ 主会话正常、子 agent 用 qwen；② pi-ai 的 openai-completions
  API：`useDeveloperRole = model.reasoning && compat.supportsDeveloperRole`——qwen 的 baseURL
  (dashscope.aliyuncs.com/compatible-mode) 不在 pi-ai 的 `isNonStandard` 名单 → 自动检测
  `supportsDeveloperRole=true` → 系统提示被转成 `developer` role；③ DashScope OpenAI 兼容网关
  只认 system/assistant/user/tool/function → 400。**排查方法沉淀**：子 agent 会话在
  `~/.dsh/sessions/<workspace>/<uuid>/session.jsonl.zstd`（zstd 压缩，python zstandard
  stream_reader 解压），`turn/end` 事件带 `reason.kind=error` + 原始上游错误；`request/header`
  记录实际路由；`subagent/descriptor` 记录 agentProvider/agentModel（继承快照）；settings.yaml
  进程持有旧 inode（lsof 对比 inode/size 可发现文件被外部改写而进程未重载）。**修复**：harness
  `llm-pi-ai` 的 compat schema/类型/resolveModelCompat 暴露 `supportsDeveloperRole`（route 和
  model 级，沿用 thinkingFormat/supportsReasoningEffort 的 win 链），settings 里给 qwen 配
  `compat: { supportsDeveloperRole: false }`；**生效需重启 dsh 进程**（tsx 加载源码 + settings
  新 inode）。注意 settings.yaml 被并行会话频繁改写（inode 23:56→23:57 连变），写前先备份。
  可复现=每次 subagent 必现（当前进程内）。
- **dsh-memory 资源优化 Round 5 + 终审（80e3eb1）**：独立 2-agent workflow 终审再次全部失败无
  回执（共享工作区惯例），自查+静态扫描发现 1 项 LOW——搜索 150ms debounce timer 在 closePanel
  后不清理，关面板前 150ms 内输入会残留一个空触发（renderPanel 有 panelRoot===null 守卫，仅
  一次 no-op）；修复=searchTimer 提升到面板作用域，closePanel 里 clearTimeout；50/50 全绿。
  终审静态清单（两插件全部核对）：host 0 常驻定时器、缓存全有界（entryCache 200 / WeakMap
  summaryCache / lastAutoWrite 随 agent/disposed 清理 / officialCache 15min+磁盘+增量 / quota
  受 45s 响应缓存约束）；client 全部 addEventListener 有清理路径、三处拖动 rAF 合帧、观察器
  合帧+快路径、debounce 关闭即清；无 O(n²)、无无界增长（见 AGENTS.md 索引）。
- **dsh-opencode-go-usage 资源优化 Round 4 + 收敛判定（512f0dc）**：独立 3-agent workflow 审计
  全部失败无回执（共享工作区惯例），自查+静态扫描发现 1 项 NEW——拖动/缩放/FAB 的 mousemove
  handler 每次事件直接 setPos/setSize/setFabPos，高回报率鼠标（500-1000Hz）下每秒数百次整面板
  React 重渲染 → 三处都改 rAF 合帧（每帧最多一次 setState，mouseup cancel 挂起 rAF，结束仍只
  持久化一次）；10/10 测试全绿。终审静态清单：host 0 常驻定时器、缓存全有界（entryCache 200 /
  WeakMap summaryCache / lastAutoWrite 随 agent/disposed 清理 / officialCache 15min+磁盘+增量）；
  client 10 addEventListener 全部有清理路径（4 处显式 remove + 其余随节点 GC）、两处延时
  （150ms debounce / 300ms localStorage 节流）关闭后触发均为 renderPanel 守卫 no-op；
  收敛=无待优化项（见 AGENTS.md 索引）。
- **dsh-memory + dsh-opencode-go-usage 资源优化 Round 2/3（c9d8a26/3f2f065/2313fd7/c5c1d15）**：
  dsh-memory Round2（并行会话落地）=composeSummary 复用 entryCache 指纹缓存 + client 搜索 150ms
  debounce；Round3（本会话）=两个全文档 MutationObserver 改 rAF 合帧+快路径（面板定位观察器
  宽度未变跳过样式写入、关闭 cancel rAF；nav 按钮观察器纯 childList 且按钮与锚点都在 → 零动作、
  class 变化/锚点替换/按钮摘除 → 合帧重同步、attachedAnchor 跟踪锚点替换）。opencode-go-usage
  Round2=删 byProvider 死聚合 + 官方响应去 records/autoExtracted/browser 死字段（**rows 必须留**——
  host backfillDsh/syncOfficialToCache 依赖 off.rows）；Round3=删 readTitleSnapshots 二次全量
  事件加载（标题直接从 readSession 事件流折叠最后 session/title 事件，与官方 foldSessionTitle
  同语义）+ 删死增量脚手架（sessionSnapshots 从未赋值、且契约 SessionRecord 无 eventCount 字段）。
  **坑=test.mjs:109 配额断言是环境相关 flake**——本机有真实 auth.json+网络，collectQuota 走
  https 直达真实接口（percent=8 而非 mock 30），HEAD 版本同样失败；改断言结构不锁数值。收敛
  判定=两次只读审计 subagent 均失败（共享工作区并发修改惯例），自查+静态扫描收敛（见 NOTES.md）。
- **dsh-memory 合入 monorepo 收尾（git 全跟踪 + 清理 jinji 残留）**：dsh-memory 目录 18 文件全
  被 git 跟踪、包名一致（package name=dsh-memory / patch id=memory、name=dsh-memory）、一键安装
  discoverPlugins() 自动发现（dry-run 验证）、profile 软链指向仓库副本；清理残留
  `node_modules/dsh-plugin-jinji` 旧软链（改名遗留，profile patch 已无 jinji 引用，删除安全）；
  50/50 smoke 通过（见 NOTES.md）。
- **dsh-notification-center 终审回执落地（6e798fa）**：两个 Round-3 终审 agent 回执迟到——
  client 侧 CONVERGED（6 低项全理论/既有，无需改）；host 侧报 2 Medium——① cooldownMs=0 被
  `|| DEFAULT_COOLDOWN` 吞成 3000（真 bug，host 与 client「无冷却」语义分叉）→ 改 Number.isFinite
  兜底；② notifierDisposed 永不重置（**经验证为误报**——标志是 per-apply 闭包，stop+start 后
  click 跳会话实测 3 断言全过，未盲改）；另修 nativeNotify 复用 notifierReady（免重复 import）、
  client apply 重置 lastNotifyAt；教训=审计发现必须过可执行验证再落代码，含误报也要记录结论
  （见 AGENTS.md 索引）。
- **dsh-paste-input 脱离上游（用户决定，2026-08-15）**：不再跟随上游 @dsh-community/lhh010 更新，
  本仓库副本即唯一事实来源，按第一方插件维护（与 dsh-at-file 同列「已脱离上游」，但**未做
  filter-repo 历史重写**——上游原作者仍留在历史贡献者里，这是刻意的差异；如需单作者化再按
  at-file 流程重写）。处理=THIRD-PARTY.md 表格行「已脱钩」+ 详情节改写（升级风险段→「不再升级
  上游，值得借鉴的手动 cherry-pick」）；AGENTS.md 第三方维护段（从「有本地修改的」移到「已脱离
  上游」，引言同步）；根 README 表格标注；插件 README 加维护状态块。要点=subtree add 的关联只
  存在于历史 commit message，无持久元数据文件，文档声明即脱钩；「已脱离上游」≠「重写历史」，
  两者是独立选项（at-file 都做、paste-input 只脱钩）。
- **dsh-model-selector 新 goal 实例终审（workflow 3 agent 验收）**：目标重开后用 workflow 编排 3 独立
  审计 agent（host 内存/client CPU/契约泄漏）终审——**坑=agent 失败返回 null 时 hasOptimizableItems
  恒 false，verdicts 全 null 暴露假阴性，null 过滤绝不能当收敛证据**；改脚本化验收（静态 typecheck+
  useMemo 依赖+监听 cleanup 配对+零定时器全绿；动态 PerformanceObserver 实测菜单打开仅 1 次 129ms
  一次性长任务、DOM 21 节点、搜索/切换回归通过）；结论=无待优化项，收敛成立（见 AGENTS.md 索引）。
- **dsh-notification-center 资源优化收敛（三轮多 agent + 五轮验证，70432ee/e8ffa2d）**：三轮共 4+
  独立审计 agent（首轮 9 发现修 5、二轮对抗揪 Round1 回归 clickHooked 死代码 + 修 4、三轮全文件审计
  分析完成但回执因子 agent 基建卡死未送达）；收敛证据=修复后连续三轮零新可修项 + 静态清单逐项核对
  （host 零定时器全事件驱动队列有界 100；client 15 个资源构造全有门控/可逆回收）+ 三套可执行验证
  （host mock 8 / 突发回归 4 / 双引擎 headless 12）+ live 端点健康；稳态=可见 1 请求/3s 隐藏 0；
  保留项均有文档化理由（focus kick/豁免 500ms 地板/常驻 observer 快路径/JSON 协议/activeId 上游限制）；
  教训=最终收敛判定别依赖子 agent 回执，用同步审计或自查+可执行验证兜底（见 NOTES.md）。
- **dsh-paste-input 资源优化第二轮（独立审计 CONVERGED + 3 项微修，d38660a）**：独立子 agent 全量
  审计（两文件通读）判「CONVERGED：无可操作项」，5 项 LOW 全为有界/可忽略（订阅滞留/跨会话
  records 留存/全树 TreeWalker/attributeFilter 'd'/cleanup reduce 次数），并逐项核实 Round1 修复
  无回归；本轮再落地 3 项=① patchAttachmentNavIcon 缓存对话框外壳（isConnected O(1) 快路径，
  消除每次 foldScan 在无对话框常态下的整树 querySelector 落空遍历）；② foldScan 的 TreeWalker
  加 `document.hidden` 门控（后台标签页 MutationObserver 不受节流，流式期间每 ~300ms 不可见的
  全树文本遍历→跳过，回前台由 8s sweep/下一次变更补齐，折叠纯装饰零可见影响）；③ input.state
  订阅加 `records.has(ref)` 早退（dock 移除发生在途上传时订阅不再滞留到下一次状态变更、且不再
  对已删记录广播多余 changed()；ref 唯一不复用故安全）。验证=mapFiles 回归 10/10、双文件
  node --check 过；client 硬刷新生效（见 AGENTS.md 索引）。
- **dsh-notification-center 资源优化 Round 2（多 agent，e8ffa2d）**：对抗审计揪出 Round1 真回归——
  删 clickHooked 声明时 nativeNotify 内旧注册块未删，sessionId 通知全部 ReferenceError 静默失败
  （/notify 无 sessionId 不受影响，Round1 host smoke 因此漏检；教训=回归测试必须断言 native 标记）；
  修复=host 冷却改同步（同 tick 突发不再全放行）+ rec.native 乐观标记（消双弹竞窗，失败回退）+
  豁免类 500ms 冷却地板（approval/error 风暴不再无限 spawn 进程）+ client 同款地板 + cfgDirty
  序列化失败不置 false + apply 重置轮询守卫 + catChange 持久化失败回滚（data-URL 不滞留内存）；
  验证=host mock 8 + 突发/回归 4 + 双引擎 headless 12 全过（见 AGENTS.md 索引）。
- **dsh-model-selector 资源优化收敛（多 agent 两轮 + 双自查，6789f33）**：Round1 独立 subagent
  审计「无值得改的项」+ 自查落地 3 项（haystack 预计算/selectedIndex memo/itemRefs 复用）；
  Round2 独立 subagent 挂起（共享工作区已知模式），按教训改自查静态复核——useMemo 依赖全对、
  高频路径全 memo、监听/定时器/rAF 均按需可清理、bundle 34.9KB 无死代码；双内核真机全路径
  通过；收敛结论=**无待优化项**（见 AGENTS.md 索引）。
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
- **dsh-visualize 资源优化收敛（多轮多 agent，3 角度零新增）**：3 个独立审计角度全完成、修复后零新增
  可优化项——①静态代码审计（子 agent）：修 attributeFilter + DESCRIPTION 压缩，8 项驳回（含 value 不落盘
  契约核实）；②自查深挖：skill readFile 按需、监听器全作用域、resolveTheme 单次 getComputedStyle、
  流式 150ms 节流；③运行时生命周期审计（子 agent）：6 维度 4 干净 + 微修 2 项（流式 shell `.dsh-viz-enter`
  补 `@media (prefers-reduced-motion: reduce)`、host `byteLength` 提升模块级 `TEXT_ENCODER` 免每调用分配）
  + 驳回 2 项——presentationMeta 去 fragment（作者**有意的重放契约**：README 明言重放不依赖文件仍在；
  改为 path+文件回退会在文件被清理时坏重放=体验回退，且无真实膨胀场景）与流式 O(n²)（150ms 节流已把
  复杂度从每 delta 降为每 150ms，理论边缘，子代理自评不紧急）。最终产物：index.js 16845→16327B
  （−518B，−3.1%）、client.js 29390→29712B（rAF 合并 + attributeFilter + reduced-motion 三处安全微改），
  全双文件 node --check OK、实例服务 client.js 29712B HTTP 200。⚠️ node_modules 补丁会被 plugin update
  覆盖，持久化需 fork（见 NOTES.md）。
- **dsh-paste-input 资源优化第一轮（多 agent，mapFiles O(n²)→O(n·maxDepth) 等 6 项）**：独立
  子 agent 双半区审计共报 8 项（4 高/中 + 4 低），落地 6 项——host ① **mapFiles 文件/目录前缀
  冲突检测 O(n²)→O(n·maxDepth)**（原来每插入一条就遍历全部已有路径，1 万文件 ≈50M 次
  startsWith；改为「插入时查本路径各级祖先前缀 + 收尾再扫一遍」双向覆盖，错误文案与抛出顺序
  与旧代码逐字一致，10k 文件实测 14ms）；② commit rename 失败会残留 staging 目录 + Map 条目
  （要等 1h TTL 清扫）→ try/finally 失败即 rm staging + 移出 Map；③ abortBatch 的 rm 失败会让
  DELETE 返回 400（批次已从 Map 删除、无法重试、staging 成孤儿）→ catch + logger.warn，DELETE
  恒 200；client ④ 提交成功后 `record.items=[]` 释放 File 引用（upload() 对 committed 早退、
  dock chip 只在 uploading 态读 items.length，大文件 blob/handle 不再随 record 存活到页面结束）；
  ⑤ worker changed() 进度节流 120ms（此前每文件一次同步 store 通知，N 文件 N 次全量渲染）；
  ⑥ foldScan 已折叠 wrap 跳过重解析。**坑=「排序后相邻对检测前缀冲突」不正确**：段内含
  `< '/'` 字符（空格、`!`、`+`、`-` 等）的路径会按字典序插在「路径与其子孙」之间（如
  `a/b`、`a/b!x`、`a/b/c`），相邻对漏检 `a/b`×`a/b/c` 冲突——必须用祖先前缀 Set 查找，不能
  用排序+相邻比较。经论证不改 2 项=usage/cleanup 不加缓存（仅设置页挂载+手动刷新触发，无轮询，
  缓存只会引入陈旧语义）、records 不做 subscribe 缺失兜底（DSH input store 恒有 subscribe，
  且 record 必须留到订阅回调删除——聊天 chip 标签靠 `records.get(ref)`，删早了会变
  `attachment:<ref>` 回退文案）。验证=mapFiles 10 项功能测试全过（含双向冲突、深链、
  10k 性能、报错顺序与旧代码一致）；client 改动硬刷新生效、host 改动需重启 dsh（见 AGENTS.md 索引）。
- **dsh-notification-center 资源优化 Round 1（多 agent，70432ee）**：独立子 agent 双半区审计
  共报 9 项，落地 5 项——client ① patchNavIcon 缓存已修补 cell（设置页开启时每次 DOM 变更/每次
  按键不再全对话框扫描，仅失效重扫）+ ② 逐次扫描剪枝 hiddenSvgs 离引用（防开/关累积）+
  ③ poll fetch 加 10s AbortController 超时（防 host 卡死永久停轮询=通知静默失效）+
  ④ 插件停止时 audioCtx.close()；host ⑤ node-notifier click 监听改 ctx.effect 注册/卸载
  （模块级 EventEmitter 单例，重载循环不再累积监听器，async import 竞态用 disposed 标志守卫）；
  保留未改=focus 监听（壳遮挡场景 visibilitychange 不触发，是点击跳会话唯一 kick）、
  豁免类别冷却（批准不能丢）、observer 常驻（对话框瞬间补丁 UX 换每次变更一次 querySelector）；
  验证=12 断言双引擎 headless 全过 + host mock 8 断言全过（见 AGENTS.md 索引）。
- **dsh-model-selector 资源优化多 agent 轮（Round1，commit 6789f33）**：独立子 agent 全量审计
  （host/client/构建产物）结论「无值得改的项」（5 项极低收益微优化、虚拟化不推荐）；自查补 3 项
  落地——①**搜索 haystack 预计算**：choices 扁平化时一次构建小写 haystack（原来 hits 每次击键对
  174 模型重复模板拼接+toLowerCase，且 choices/hits 两次独立遍历树）→ 搜索变纯 includes filter、
  单次遍历；②selectedIndex useMemo（原来每次渲染 findIndex 174 项）；③itemRefs 数组复用
  （length=0 替代新建）。双内核真机全路径（开菜单/搜索/切换/关闭）通过，语义零变化（见 AGENTS.md 索引）。
- **dsh-visualize 资源优化多agent轮（Round1）**：独立子 agent 全量审计（lib+src+assets+package.json）
  报「3 值得修 / 8 不值得修」——落地 2 项：①**MutationObserver 加 `attributeFilter:['data-ds-dark-theme']`**
  （harness `packages/client/ui-theme/src/boot-theme.ts:19` 确认 DSH 用 `document.body.toggleAttribute
  ('data-ds-dark-theme')` 切主题；此前 html/body **任何属性**变更都触发 rAF→setThemeTick→整份 frame
  文档重建+iframe 重解析，其他插件改属性会误触发；过滤后仅主题属性变更才重建，零行为影响，保留
  documentElement+body 双观察兼容非 DSH 宿主）；②**DESCRIPTION 再压缩 410→296 字符**（保留全部规则）。
  8 项不值得修含契约核实：**tool/result 持久化只存 message+meta**（harness tool-calls.ts:278/287，
  `value` 不落盘→fragment 在日志仅一份无重复）、skill readFile 按需每会话一次（5.5KB 可忽略）、
  流式扫描已被 150ms 节流、FRAME_CSS 内联是 opaque 沙箱必需、presentationMeta 内联是重放设计（1MB 可配）。
  验证：node --check 双文件 OK；实例服务 client.js 29632B（含 attributeFilter ×2）；index.js 16292B。
  生效：client 硬刷新、host 重启。⚠️ node_modules 补丁会被 plugin update 覆盖（见 NOTES.md）。
- **v4-flash-godmode-opencode-go 资源优化（router-flash preset，Round 1）**：审计 router-flash 预设的 router-bootstrap.mjs + router-core.mjs——无轮询、无定时器、无冗余监听器。优化 3 项：①promoted 后跳过所有分类/过滤逻辑（WeakSet 缓存 full-catalog 结果，后续 assembly 只保留 persona 注入）；②mode/core/persona 按 session 缓存（WeakMap，首次计算后不再重复）；③sessionMode 结果缓存（WeakMap）+ applyPersona 结果缓存（Map，4 种 persona 文本有限）。语义零变化，重启 dsh 生效。可复现：对比优化前后同一会话的 `system-prompt/assemble` 调用次数。

- **dsh-vision-bridge 第十批（无图短路 + 多 agent 检测失败教训，aa7b1ee）**：目标循环 Round1-2——
  ①pre-step 改写缺 hasImage 门控（每个 agent 每个步骤无条件 map+rewriteImageBlocksDeep 全树遍历+新数组分配，
  即使会话无图）→ `if (hasImage && !passthrough)` 短路；②stealth stream() 无条件 map+rewrite → 先
  hasImageIn 扫描，无图直接转发（messages 同一引用）；③基准实测无图步骤 1.7x 提速（20K 次：7.4ms→4.5ms，
  单步省 ~0.1µs，长会话收益更大）；④坑=独立只读子 agent 审计再次挂起（共享工作区并发修改，interrupt 无产出），
  按先例改用自查+静态扫描+单测矩阵：无定时器/轮询/模块级可变状态、push 全局部数组、helper 无死代码；
  测试 93+15 全绿。可复现=node tests/apply.test.mjs + 无图 pre-step 基准（lib/images.js 纯函数）。
- **dsh-model-selector 资源优化审计（只读，无新增可改项）**：覆盖 Host 半区 src/index.ts + types.ts、Client 半区 index.ts + ModelSelect.tsx（588 行）+ locales.ts + styles.ts + 构建产物 lib/client.js。Host 为空 apply 零优化点。Client 唯一理论浪费=useSyncExternalStore 在菜单关闭时仍订阅 store 更新，每次外部 store 变更触发全组件重渲染（choices 重建 + selectedIndex findIndex + normalized + itemRefs 重置 + 闭包重建），但 O(174) 计算量 <1ms 且 DOM 仅触发按钮，收益极低不值得改；effortChoices useMemo 依赖 t 可能被冲刷（t 若每次重建 identity 则 memo 失效），但 effortChoices 仅 1-10 项计算极快；goPane rAF 未 cancel 但仅 null-safe .focus() 无害；174 模型节点不支持虚拟化（仅 ~10 可见，引入复杂度收益近零）；零内存泄漏；零网络浪费（30s TTL 已完美）；零死代码。结论：无值得改的项。

- **better-sidebar 资源优化再验证（第三角度：运行时实测+产物清点）**：jobs-routes 的
  session/event 监听器确认**已内建快路径**（traceOf 含 JSON.parse 只在 tool/call、tool/result
  分支内调用，其他类型仅一次 sessionId 提取+两次字符串比较，子代理建议的守卫无需再加）；live
  dsh 进程（运行 50min）124 fd/7 TCP 连接/15 线程无泄漏迹象（RSS 2.4GB 为 16 插件+harness 进程
  总量不可单归因）；构建产物定时器清点=client.js 3 setInterval（全门控）/terminal+editor 各 1
  （xterm/CodeMirror 内部，懒加载 chunk 存在=对应视图打开时）/host 0——无漏网裸定时器。
  **可复现**：grep setInterval lib/*.js + lsof 进程 fd。
- **better-sidebar 资源优化收敛（多轮多 agent，d48f66c）**：目标=对 better-sidebar 做多轮
  多 agent 资源检测直到无待优化项。本轮修复 2 项——①nav 图标 MutationObserver 是 document.body
  全量监听（聊天流式渲染每次 DOM 变更都触发 querySelector 扫描，99.9% 时设置对话框未开）→ rAF
  合帧（每帧最多扫一次，卸载取消 pending 帧）；②SidebarStore.bySession 只增不删（每访问过的会话
  一个 SidebarState，页面生命周期累积）→ 上限 20 FIFO 逐出（跳过 active 与有 pending 持久化的
  条目；逐出后重访从 localStorage 重播种、uid 计数由 maxCounterId 重灌，可观察零变化）。独立
  子 agent 全 52 文件审计确认「无待优化项」（18 处 useEffect 全清理、数据结构全有界、WS 无泄漏、
  无裸 <2s 定时器）；仅 3 项 [低] 理论风险（jobs-routes 事件过滤 O(1)、AgentPtyRegistry 无上限
  =设计使然、TerminalView store.subscribe 每 tab 极轻）明确判定不值得修；Sidebar.tsx 的 #root
  MutationObserver 作用域正确（只 childList 观察 #root，boot 切换才变异）无需改。累计 3 修复
  （3ebb8e6 时钟门控 + d48f66c 两项），62/62 测试全绿。**可复现**：读 src/client/state.ts 的
  SESSION_STATE_CAP/pruneSessionCache、src/client/settings-nav-icon.ts 的 schedule()。
- **dsh-visualize 资源优化（node_modules 本地补丁，仅限本插件）**：审计结论=流式预览已有 150ms
  节流（useThrottled FLUSH_MS，作者已做）、fragment 只回一行确认不进模型上下文、host 无常驻缓存，
  三大结构项无需动；实际落地两项——①**host 工具 schema 压缩**：DESCRIPTION 470→340 字符、7 参数
  描述收紧（保留全部行为规则：create/update 语义、≤20 行/≤5 处/≤4 次/超限重建、骨架标签拒收、
  加载 visualize skill 提示），index.js 16845→16361B（−484B，−2.9%），每请求模型侧文本省 ~130 字符
  ≈30-40 tokens；②**client 主题观察器 rAF 合并**：MutationObserver（html/body 属性级）在主题切换
  多属性连改时由每属性一次 setState 改为每帧至多一次重建 frame，卸载 cancelAnimationFrame，
  client.js +160B（实例已服务新 bundle，HTTP 200 29550B）；生效=client 硬刷新即生效、host 需重启
  dsh；⚠️ node_modules 补丁会被 `dsh plugin update`/重装覆盖，要持久需 fork 进 monorepo 或在
  src/ 同步（见 NOTES.md）。
- **dsh-vision-bridge 第九批：插件自身资源优化（仅限本插件）**：①附件 ref 表
  `sessionAttachmentsById` 原只有数量上限无时间淘汰（会话关闭后 ref 长期驻留）→ 改为
  `Map<sid,{at,byId}>` + 24h 惰性 TTL + **LRU**（Map 插入序移尾、超 512 淘汰最久未访问）；
  ②`visionFailures` 原无数量上限（视觉链挂时可能无界增长）→ 复用 `cacheMaxEntries` 淘汰最旧
  （被淘汰的图冷却失效、可重试）；③`imageMemory`+`imageMemoryAt` 双 map 合并为单 map
  `{text,at}`，且 **remember 存储即截断**（按 descriptionCap，驻留上限=200×2000，replacer
  不再重复截断）；④新增 `scanImageBlocks`（lib/images.js）：一次递归同时收集 refs+hasImage，
  替代 pre-step / llm-stream / autoDescribe 的**三次重复遍历**（长会话每步只走一遍消息树）；
  ⑤工具描述压缩 ~15%（每次请求随 schema 发送）。行为语义零变化（失败冷却、缓存命中、直通
  判定全部等价），apply 90 断言 + 真实 Cordis 15 断言全绿。坑=测试设计时 x1 重试失败会把 x2
  挤出上限（淘汰链），重试改成功才验证到"resident 保持冷却"；README 新增「内存占用」表。
  可复现=node tests/apply.test.mjs（第九批段）。
- **dsh-notification-center 资源优化（commit ac3d9f5）**：审计=client 1.5s 固定轮询（40 次/分，
  后台照轮）+ patchNavIcon 1s 全 document 扫描 + 每次 poll 带全量 cfg（~1.5KB 上行）为主，
  host 队列/设置/pendingOpen 均 KB 级；优化=①**页面 hidden 完全停轮询**（host 已直发原生通知，
  轮询只服务音效/面板/点击跳转；可见时立即 poll+恢复调度，点击通知激活 App 的跳转链路不受影响）；
  ②**自适应间隔**：有事件 1.5s、空闲回退 3s（自调度 setTimeout 替代 ctx.interval）；
  ③**cfg 按需上报**：saveSettings 置 dirty，poll 只在 dirty 时带 cfg（host 保留旧 cfg 兼容）；
  ④patchNavIcon **dialog 守卫**（对话框未开直接 return，零扫描）+ interval 1s→5s 兜底；
  ⑤wait 通知 timeout 10s→8s；坑=大块 edit 替换时**重复声明**（新块含 poll 定义+原文件已有 →
  SyntaxError Identifier already declared，node --check 即暴露；大块 edit 前先 grep 目标符号
  确认唯一）；验证=调度逻辑 8 场景 mock 全 PASS + node --check + 双引擎无回归（见 AGENTS.md 索引）。
- **dsh-model-selector 资源优化（目录快照缓存，commit 4f341be）**：审计=无轮询无定时器、唯一监听
  mousedown 按 open 挂载/关闭卸载；唯一浪费=**每次打开菜单都强制 reload()**（RPC 拉全量目录 +
  174 模型重渲染）。修复=目录数据本就在会话级 store，show() 只在 `error / groups 空 / 超 30s TTL`
  才重载；实测连续 3 次开关 + 完整交互（进面板/搜索/切换）**RPC 全程 0 次**（原每次 1 次）。
  语义零变化（首次打开、失败重试、30s 新鲜度均有保障）；只改 client.js，硬刷新即生效（见 AGENTS.md 索引）。
- **dsh-at-file 资源优化（四项，不改 harness）**：审计→①INDEX_TTL_MS 30s→300s（减少 90% 重复索引请求）；②MutationObserver 缩小到 settings dialog 区域（去 body+subtree 级全量 DOM 监听）；③expandMentions 串行 stat 改为 Promise.all 并行（多 @path 回合延迟降低）；④entryByRel 存 path 字符串而非 FileEntry 对象（省第三份拷贝 50% 内存）。构建+149 测试全绿。
- **dsh-paste-input 资源优化（client 折叠扫描降频，commit 68b0411）**：审计=host 半区零优化点
  （batches 提交即删+TTL 定时器 10min unref+卸载清 staging）、client records 发送后经
  occurrence 订阅自动删除释放 File 引用（已有机制）。真实开销在气泡折叠扫描：
  ①MutationObserver **去掉 characterData**——assistant 流式输出高频改文本节点，而折叠只响应
  user 消息节点（childList 插入），移除后流式期间零 foldScan 触发（最大收益）；②debounce
  120→300ms 吸收 DOM 变化风暴；③兜底 sweep 2000→8000ms（observer 为主路径）。语义零变化
  （折叠即时性/防循环/孤儿回收全保留）；只改 client.js 硬刷新生效（见 AGENTS.md 索引）。
- **agent 自优化契约（行为级资源优化，agent 自身可落地的优化项）**：实测自身行为资源消耗——①工具调用批量化（4 独立 curl → 1 个 bash `&&` 串联，省 ~3KB 上下文）；②精准文件读取（禁止 `cat` 大文件，`read`+offset/limit；AGENTS.md 已自动注入不再重读）；③消除不必要的子代理（简单 clone/copy 用 bash 直跑）；④回复精简（分析只给结论，不重复中间数据）；⑤持久化行为契约 `docs/agent-self-optimization.md`。可复现：对比优化前后同一任务的工具调用次数和回复长度。

- **better-sidebar 高内存分析报告核实（外部报告多不实，微修 1s 时钟门控）**：逐条对照源码——
  ①「agent-pty 50ms 轮询」❌不实（终端是 WebSocket 推送，无轮询）；②「RAF 每帧轮询后台也在跑」❌
  不实（RAF 仅拖拽/测量瞬态）；③「3s/2s 轮询后台也跑」⚠️常量存在但**已按 visible(active) 门控**
  （不可见即停）；④「editor chunk 按需加载」✅已实现（chunk-loader）；⑤「pty 清理不及时」❌
  close 帧+pty.close 路由+disposeAll 全在；⑥「2 WebSocketServer 常驻」✅存在但 noServer+effect
  注册+teardown 全清理，agent-list 是事件驱动低频推送通道（设计如此）。唯一真实可优化点：
  SubagentView 1s 相对时间时钟只按 liveCount 门控、未按 active 门控 → 补 active（commit 3ebb8e6，
  构建后 live link 生效）。教训=外部/AI 生成的分析报告必须对照源码核实再动手，别盲改（P0 建议
  全基于不实前提，照做只会损 UX 无收益）。**可复现**：读 src/client/SubagentView.tsx 的
  POLL_MS/JOB_POLL_MS 与时钟 effect。

- **16 插件全量资源画像与优化建议**：实测全部 16 插件的 Host/Client 资源消耗模式，按优先级给出优化建议无需改代码的 3 项 + 降频可调的 3 项 + 架构级 2 项（见当前会话出力报告）。结论：当前 16 插件全量运行无显著内存压力，最值得改的是 super-injector Host 轮询 1500ms→3000ms（不影响体验）和 agent-teams ActivityPanel 1s→2s（用户无感，<1MB 传输）。可复现：grep 各插件源码的 setInterval/POLL 模式。

- **agent 会话资源占用画像（与「AGENTS.md 膨胀」条互补）**：实测当前会话 68 次 assistant 调用
  inputTokens 均值 11K/峰值 308K（历史未压缩时）、outputTokens 均值 1.1K——除 AGENTS.md 注入外，
  **第二大固定开销是工具 schema**：本 agent 约 55 个工具（dev_* 19 + agent_teams 9 + cordis 6 +
  subagent/workflow/ralph + 记忆/可视化/文件等）定义合计 ~50KB ≈ 12K tokens/请求，且每次请求全量
  随行；优化=dev_* 描述压缩到一句话（保留参数 schema，只砍修饰语）+ 低频诊断类（dev_fix_patch /
  dev_heal_links / dev_stage_* 等）demote 或配置隐藏 + 长会话中途主动 /compact（308K 峰值→~20K）+
  避免整读大文件（read 带 offset/limit；NOTES.md 290KB 从不整读）。宿主进程 RSS 2.3GB（16GB 机，
  含全部插件+会话缓存，非本 agent 独有）；宿主侧顺手项=super-injector 1500ms 轮询→3000ms、
  usage-dashboard 缓存 TTL 60s→300s。可复现=解压会话 jsonl.zstd 统计 assistant/message.usage。
# NOTES.md — 踩坑 / 项目经验

- **使用统计资源优化第三轮（dsh-usage-dashboard Round 3）**：①删除孤儿字段 dayHourGrid
  （client 0 引用却每次返回 365×24=8760 数组 → 省 ~70KB 序列化/请求 + 内存 + 每活动事件
  一次写入）；②缓存加 json 字段（p.then 时 JSON.stringify 一次，缓存命中直接发字符串，
  免每次请求重序列化 ~100KB payload）。坑=python 批量脚本第 5 步锚点与实际 handler 缩进
  不符（setHeader 夹在中间）导致整批未写盘——锚点必须逐字匹配；验证：apply 26 + render 4
  全绿；已提交（见 AGENTS.md 索引）。

- **使用统计资源优化第二轮（dsh-usage-dashboard Round 2）**：Host——①事件循环天级缓存
  dayOfCached（非 activity 事件零 new Date，activity 仍一次复用；Map 上限 512 廉价重置）；
  ②每会话聚合完 snap=null 显式释放解码事件数组（大日志立即回收不等 GC）；Client——
  ③UsageStats days/TrendChart data/Heatmap weeks/SessionTable sorted+visible 全部 useMemo
  （hover/交互/分页不再重建 365 项数组与排序）；④nav/全屏 MutationObserver rAF 合帧（一帧
  一扫，高频 DOM 变更不再逐条回调）；坑=client-render 测试 mini React stub 缺 useMemo 会崩，
  先补 stub `useMemo(fn){return fn()}`；dayBucket 按 UTC 天切、dayOf 按本地天算——同本地天跨
  UTC 天最多两次 miss，结果恒正确。验证：apply 26 + render 4 全绿；已提交（见 AGENTS.md 索引）。

- **dsh-super-injector 资源优化第 3 轮（测量收敛：无进一步安全优化点）**：对遗留候选逐项
  **实测**后确认全部可忽略或为正确性必需——①`fingerprintOf` 全目录深扫：实测 0.030ms/次，
  3s tick 下等效 **0.01ms/s**（0.86s CPU/天），保留（Windows 改文件内容不更新父目录 mtime，
  目录级快路径不可用，全扫是轮询方案的正确性底线）；②watch interval 懒启停：空转 tick 仅
  1 次 stat/3s（可忽略），保留（轮询比 fs.watch 鲁棒，防漏事件断自动重载）；③dev_* 18 工具
  description 总计 2171B ≈ **543 tokens/请求**——已是一句话级，再压缩收益 ~250 tokens 且
  伤模型工具选择质量，不动；④观察器 `attributes['d']`：对话框开启时防 React 就地改 path
  回退齿轮所必需（罕见触发），保留；⑤host 活跃监听仅 `llm/stream`（1 个，注释掉的 assemble
  不算）；Map 全部按操作创建即释放或已修剪。**结论**：3 轮检测-修复收敛——常驻成本=1 个 3s
  tick（空转 1 stat）+ 观察器关闭态近零 + 页面挂载期可见性门控轮询，未发现不损害使用/
  兼容性的进一步优化方法。**可复现**：`node -e` 计时 fingerprintOf（0.03ms/次）+ 描述字节统计。

- **dsh-super-injector 资源优化第 2 轮（观察器关闭态门控 + 只读路径缓存）**：第 1 轮后复查
  发现观察器在「对话框关闭」（常态）时每次 mutation 仍做一次全文档 `querySelector`——
  修复=**新增节点门控**：只有 `childList && addedNodes.length > 0` 的变更才可能打开对话框，
  纯移除/属性变更直接 return（`patchDialogNav` 抽取复用；流式输出的 text/characterData 本就
  不在观察范围 childList+attributes['d']），关闭态扫描成本归零；host 侧 dev_* 工具只读路径
  统一 `readRegistryCached()`（mtime 缓存），**注入流程的读-改-写保持新鲜读**（避免就地修改
  缓存数组、写失败时缓存与磁盘不一致的边角）。坑=python 批量替换 `readRegistry()` 时被
  `const list = readRegistry()` 同形行误伤（缓存内部新鲜读被跳过替换），须按内容语义逐点核对
  而非纯文本替换。验证：双构建 + node --check + import 冒烟 + 产物 grep
  （addedNodes/patchDialogNav/readRegistryCached 已编入）。语义零变化；host 重启、client 硬刷
  新生效。**可复现**：`grep -n "addedNodes" lib/client.js` + `grep -c readRegistryCached lib/index.js`。
- **dsh-super-injector 资源优化实施（多轮检测第 1 轮）**：把画像的 P0/P1/P2 全部落地——
  **host**（`src/index.ts`）：①watch 轮询 `intervalMs` 默认 1500→3000ms（schema + `?? 3000`
  兜底双改）；②registry mtime 内存缓存 `readRegistryCached()`（热路径 statSync 代读+parse，
  `writeRegistry` 写后置 null 失效，跨进程写也被 mtime 覆盖）；③tick 空转跳过
  （`watchList.length === 0` 直接 return，无 watch 无注入时零磁盘读）；④`fingerprints`/
  `lastDangleTs` 按当前 watchList 修剪（防 Map 随历史注入数无界增长）。**client**
  （`src/client/index.ts`）：⑤导航图标观察器缓存 dialog 元素（`isConnected` O(1) 快速路径，
  仅缓存失效才 querySelector 全文档扫描——流式输出高频 mutation 下把每次全扫描降为常量
  判断）；⑥设置页 60s 轮询 `document.hidden` 暂停 + `visibilitychange` 回前台补刷新（dispose
  连 listener 回收）。验证：双构建通过 + `node --check` 双产物 OK + import 冒烟 + 产物 grep
  确认 readRegistryCached/空转跳过/isConnected/hidden 门控已编入 + register 形状不变。语义
  零变化；host 需重启、client 硬刷新生效。**可复现**：`grep -n "readRegistryCached\|watchList.length === 0" lib/index.js`
  + `grep -n "isConnected\|document.hidden" lib/client.js`。

- **使用统计资源优化（dsh-usage-dashboard 自查）**：审计 host/client 资源占用后落地
  ①缓存 TTL 60s→5min（统计页低频变化，扫描频率降 5 倍）；②**stale-while-revalidate**
  （TTL 过期后非 force 请求秒回旧快照 + 后台 compute(true) 静默刷新，用户永不转圈、
  1-2s 扫描不阻塞请求，手动刷新按钮仍是 force）；坑=SWR 测试 stub Date.now 只推 61s 时
  TTL=5min 缓存仍新鲜走正常命中（断言误判），须推 301s；computedAt 毫秒精度 mock 下同毫秒
  撞车 → 用 listSessions 调用计数证明后台重算。验证：apply 26 断言 + render 4 场景全绿；
  已提交（见 AGENTS.md 索引）。

- **dsh-super-injector 资源占用画像与优化建议（host 轮询 + client 观察器深挖）**：实测源码定位
  全部资源点——**Host**：①watch 自动重载轮询 `ctx.setInterval(…, intervalMs=1500)` **常驻运行，
  即使 0 watch + 空 registry 也每 tick 都 `readRegistry()`（读文件+JSON.parse，~57,600 tick/天）
  空转**，且每 tick 对每个被 watch 的 lib/ 目录递归 readdir+stat 全部 .js 算指纹
  （`fingerprintOf`，按 mtimeMs+size 全文件扫描）；②`registry.json` 无内存缓存（每 tick 重读重
  parse）；③瞬态 50ms 状态等待器（注入/重载期间，有界自清，非残留）；④自愈日志 1MB 轮转 2 代、
  registry 原子写（tmp+rename）——已良好。**Client**：①导航图标 MutationObserver 挂
  `document.body`（childList+subtree+attributes['d']）**全页生命周期常驻**，每次 DOM 变更都
  `querySelector('[role="dialog"]')` 全文档扫描（流式输出时每毫秒多次）；②设置页 60s 轮询仅
  页面挂载期（dispose 自清，OK）。**优化建议（按收益）**：P0-host 空转跳过（watches 空且
  registry 空直接 return，连 read 都不做）+ registry mtime 缓存（statSync 代 read+parse）；
  P1-host fingerprint 只 stat `lib/index.js` mtime+size（或把 intervalMs 1500→3000，并行会话
  资源画像也同建议）；P2-client observer 缓存 dialog 元素用 `isConnected` O(1) 快速路径（仅当
  缓存失效才 querySelector）+ 页面 60s 轮询 `document.hidden` 时暂停；P3 可选项=注入/卸载时
  懒启停 watch interval。**可复现**：`grep -n "ctx.setInterval" src/index.ts`（2270 行）+ 
  `grep -n "MutationObserver" src/client/index.ts`。
- **AGENTS.md 膨胀超注入预算（67.6KB > 65,536B 截断，实测）**：每轮注入的工作区指令预算 64KB，
  AGENTS.md 现 67,590B（173 条索引 bullet），**尾部被静默截断**——新落档的条目/规则可能每轮都看不到；
  这是每轮固定 token 开销最大头。解法=索引区压缩到「规则 + 一行导航」、条目只留一行链接，正文规则
  保留；目标 ≤30KB 每轮省 ~35-40KB token（仓库已有「AGENTS.md 精简原则」条目但已再度膨胀）。附带：
  NOTES.md 290KB 不注入（只按需读）设计正确；viz/ 卡片 fragment 会内联进会话日志 meta 属重放依赖。
- **DeepSeek V4 API 第三轮调价（2026-08-17 峰谷定价，涨价逆转降价）**：V4 全系正式版上线采用峰谷定价
  ——高峰时段 9:00-12:00/14:00-18:00（北京），闲时=高峰一半；Pro 高峰 缓存命中 0.3（+1100%）、未命中 9
  （+200%）、输出 27（+350%）（均较 5-31 价），闲时 0.15/4.5/13.5；Pro 输出高峰 27 元已**高于调价前原价
  24 元**；Flash 现价 0.02/1/2 → 高峰 0.1/3/9（+400%/+200%/+350%）、闲时 0.05/1.5/4.5；来源=DeepSeek
  官方定价公告（21世纪经济报道、中国金融信息网、南方都市报 2026-08-13）。已把三轮价格（原价/5-31永久/
  8-17闲时/8-17高峰）做成对比卡片（viz/ 工作区副本）。
- **DeepSeek V4 API 官方调价事实（2026-04/05，对 usage-dashboard PRICING 快照相关）**：04-26 公告全系
  输入缓存命中降至首发价 1/10；05-31 起 V4-Pro **永久**按原价 1/4 执行——每百万 Tokens：缓存命中输入
  1→0.1→**0.025** 元（−97.5%、40×，创全球新低）、未命中输入 12→**3** 元、输出 24→**6** 元（均 −75%）；
  V4-Flash 缓存命中 0.2→**0.02** 元（−90%）；deepseek-chat/reasoner 旧名弃用，对应 V4-Flash 非思考/
  思考模式。来源：DeepSeek 官方定价公告（证券时报 stcn.com/article/detail/3924059、太平洋科技
  pconline.com.cn/ai/article/1584702）。已做「调价前后对比」可视化卡片验证（viz/ 工作区副本）。

- **dsh-better-sidebar 设置页导航图标（齿轮→右面板，DOM 级替换不改 harness）**：DSH 设置壳
  `navIcon(id)` 只认 models/agent-presets/plugins 三个内置 id，其余（含 better-sidebar 的
  `better-sidebar` section）一律回退齿轮且无 slot hook；解法照 skill-manager 先例——client
  插件 MutationObserver + 保留外壳 `<svg>` 只换子元素：用插件自带的 `IconPanelRightOutline16`
  形状（圆角框+右侧填充条，1.5px stroke + currentColor，天然 DSH 风格），label 匹配覆盖
  locale 双值（侧边卡片/Side card），内容匹配（rect 属性）防 React 重渲染回滚；`ctx.effect`
  可逆注册，卸载即恢复齿轮；零 DSH 源码改动；新模块 `src/client/settings-nav-icon.ts`；
  构建后 live 3080 link 实例直接生效（硬刷新即可）。坑：TS 严格模式 `rects[0]` 可能 undefined
  要显式判空；**better-sidebar 的 6 个测试失败是环境性的**（smoke git 测试报
  `Author identity unknown`=本机未配 git user.name/email；side-card-section 断言英文文案但环境
  渲染中文）与本改动无关。**可复现**：开设置页看「侧边卡片」导航图标。
- **dsh-plugin-jinji → dsh-memory 全量重命名 + 自动记忆（脱离上游，化为自有插件）**：问题=
  用户要求记忆自动记录（不依赖预设）+ 重命名 jinji→memory。解法=lib/index.js 加 `write_memory`
  工具 + `memory:auto` 系统提示（order 120，所有会话注入）+ `turn-stopping` 兜底（琐碎寒暄过滤
  /^(好的|好|嗯|谢谢|ok|yes|no)$/i + 长度≤3 不记）；`git mv dsh-plugin-jinji dsh-memory` 全量
  重命名（目录/包名/模块名/API 路径/配置文件名/设置页文案/预设 ID）；**坑=改名后 profile 的
  node_modules/dsh-plugin-jinji 软链悬空（指向已不存在的旧目录），运行中的 dsh 进程加载旧
  loader entry 时 client.js 404 → 修复：`ln -sfn ../../dsh-memory dsh-plugin-jinji` 让旧路径
  重定向到新目录**，不重启即可恢复；profile 已更新为 `dsh-memory`，下次重启后旧 loader entry 自然
  消失；THIRD-PARTY.md 移除、AGENTS.md/README 同步；**可复现**：`npm run check && npm run smoke`
  （57 断言）。
- **dsh-paste-input 设置页导航图标 + 主题 token 化（零 harness 改动）**：与 super-injector
  同模式 DOM 级替换（见下条），差异化点：**图标直接用 DSH 官方 `ic_ds_paperclip_outline_16`**
  （ui-primitives 现成回形针，与齿轮同源同风格，path 从 harness 源码拷——比自绘更「符合定位
  且风格统一」）；label 匹配要覆盖 locale 双值（'多媒体输入'/'Multimedia input'）。CSS
  token 化：遮罩 `rgba(0,0,0,.45)` → `--dsw-alias-bg-mask-1`+`--dsw-mask-blur`（Modal
  primitive 同款）；OK 按钮 `state-business-primary+#fff` → `button-primary-fill`+
  `label-primary-foreground`（官方主按钮写法，深色主题 #fff 白字在亮蓝上会瞎）。只改
  client.js 时**无需重启 dsh web**（页面硬刷新即加载新 bundle；改 package.json inject 才需
  重启）；link: 依赖改仓库副本直接生效。同步更新 THIRD-PARTY.md 本地修改清单（见 AGENTS.md 索引）。
- **dsh-super-injector 设置导航图标（DOM 级替换，不改 harness）**：`settings.section` 图标由
  外壳 `navIcon(id)` 硬编码、非内置 id 回退齿轮、**无 slot hook**——自定义图标只能①patch
  SettingsRoot.tsx（fork harness，升级被覆盖，禁止）或②client 插件 DOM 级替换。采用②（与
  dsh-skill-manager sparkle 同模式）：MutationObserver 监听 `document.body`（childList +
  attributes['d']），在 `[role=dialog] nav button` 里按 label 文本「模组管理」定位导航行，
  **保留外壳 svg 的 class/尺寸/颜色上下文，只换 path**；按 glyph 内容（首个 path 的 `d`）
  判重防 React 重渲染回退。**图标语义与风格**：外壳图标是实心填充风格（viewBox 16、
  `fill="currentColor"`，如 IconSettingsOutline16 实心齿轮），因此直接复用 ui-primitives
  原生 `IconDownloadOutline16` 的 path 数据（箭头载入托盘=「把模组注入运行时」语义）——
  与 DSH 原生导航图标像素级同风格，非手绘。副作用全在进程内（observer+DOM），卸载重启自动
  恢复原齿轮；页面标题同步加同款 16px 小图标（h3 改 flex 对齐）。**可复现**：设置→「模组管理」
  导航行显示载入箭头图标（不再是齿轮）；`grep NAV_ICON_D src/client/index.ts`。
- **dsh-super-injector 设置页空白修复（slots.register 双参 API）**：症状=设置里注入器的
  「插件」页点开内容空白（另一 agent 报「它自己的页面有问题」）——**根因不是安装状态，是
  上游 client 的 API 兼容 bug**：`src/client/index.ts` 用 `ctx.slots.register({...options,
  component: () => ({render(){}})} )` **单参调用**，而 rc.5 的
  `slots.register(options, component)` 是**双参** API（guard.ts 展开 options 后把第二参
  透传，options 里的 `component` 字段被忽略）→ 注册后 `entry.component === undefined`；
  渲染器 `renderEntry` 里 `const Comp = entry.component` → `<Comp {...props}/>` 无组件可渲染
  → 空白。对照仓库内已知可用注册（dsh-usage-dashboard `register({...}, () => h(...))` 双参）
  即见差异。**解法**（本地修复，收编即本仓库所有）：①改双参 `register(options, ReactFC)`；
  ②FC 直接把 vanilla DOM 树经 ref 挂载（useEffect 里 `holder.current.appendChild(root)`，
  cleanup 清 60s 轮询 timer）——注意注册值**就是 FC 本身**，`renderEntry` 是
  `<Comp {...props}/>` 直接渲染，不能包一层返回函数的 provider（会返回函数被 React 拒）；
  ③与内置「插件」分区明确区分（**不是同一个东西**）：本页管理注入器**运行时注入的模组**
  （免重启、独立于官方装配/bundles），导航 label 与页面文案统一「模组管理」+ 页面顶部说明行
  指向官方「插件」分区。验证=tsdown 构建 +
  `node --check` + 产物 register 调用形状核对；真机需硬刷新（client.js 改动直接生效，无需
  重启 host）。已同步 THIRD-PARTY.md（原样收编 → 本仓库维护，升级 subtree pull 须复查）。
  **可复现**：`grep -n "slots.register" src/client/index.ts`（修复前单参、修复后双参）+ 设置页
  点「模组管理」应显示注入器管理 UI。
- **dsh-opencode-go-usage 收编进 monorepo（git subtree 第三方 OpenCode Go 用量仪表盘）**：Xenia0922/dsh-opencode-go-usage，MIT，1.6.5，bundle 形态（`dsh.bundle.patch: ./cordis.patch.yml` 自插 entry，与 dream-skin 同模式安装）；已在 web profile 的 `package.json` 的 bundles 列表 + dependencies 中，无需手动 patch；`dsh-dream-skin` 收编后 ZCode 修复了 `cordis.patch.yml` 中 dream-skin 的重复 insert（profile 手动 insert 与 bundle 自插 patch 冲突）——opencode-go-usage 无此问题（profile 手动 insert 已随备份一并移除）；可复现：git subtree add 后 restart dsh 即可。

- **v4-flash-godmode-opencode-go 安装（SheberDavid 第三方 agent preset）**：从 GitHub 仓库
  https://github.com/SheberDavid/v4-flash-godmode-opencode-go 安装 dsh agent preset——clone
  后复制 `preset/` 目录到 `~/.dsh/.agent-presets/router-flash/`；改 settings.yaml
  `agent-presets.default: router-flash`；preset 专为 opencode-go provider 的 deepseek-v4-flash
  设计（实测 w7 persona + 深度思考锚 = 规划深度 2.9 万字→37.5 万字），但 `isFlashModel` 只按
  model id `/flash/i` 匹配，对 jiyuanlvdong 等 provider 的 flash 模型同样生效；重启 dsh 生效；
  可复现：clone + cp + 改 settings.yaml + 重启 dsh。

- **dsh-dream-skin 收编进 monorepo（git subtree 第三方换肤/壁纸/主题包插件）**：RevolutionLA/dsh-dream-skin，MIT，0.2.5，纯原生 DSH token 系统实现（无注入）；npm 安装后需手动改 profile 的 cordis.patch.yml 加 insert 行 + 切换 `package.json` 依赖从 `^0.2.5` 到 `link:` 本地路径 + 重建 node_modules 软链；README/THIRD-PARTY.md/AGENTS.md 三处文档同步更新（见 NOTES.md）。

- **dsh-anchored-standard vs dsh-router-standard 辨析（同族预设不同路）**：问题=用户问两仓库区别；
  事实=①**anchored-standard**（xiaobright，1621⭐/51 forks）=单一预设，两阶段「首请求用 Minimal
  完整 prompt + Minimal 真实工具 schema（bash+str_replace_editor 两工具）+ 剥离 AGENTS/skills
  自动注入（suppressedContextSources）→ 首个持久信号（tool/call 或 assistant/message，
  `promoteOn` 可选）后提升到 Standard 25 工具全集」，针对 V4 Pro 对 API 可见工具目录敏感
  （官方评测 Minimal 99/96 vs Standard 91/92，本项目 Project2 实测 98/99）；阶段从持久会话事件
  推导（resume/reload 不丢）；rc.5+Windows/Node24 实测，rc.6 有 adapterDefaults 覆盖
  bootstrapMaxTokens 的坑；MIT+NOTICE（改编官方 rc.5 Standard 预设 commit 47f9438，GitHub
  检测 NOASSERTION 实为 MIT 多版权头）；②**router-standard**（yjh051108，源仓库独立维护）
  =任务感知路由预设 v0.2.0（router-standard/router-spec 双预设，spec/react/weak 行为带 +
  按模型选 persona + 近距离引导 + 三锚 + plan 保留），MIT；关系=router-standard README 致谢
  anchored-standard「锚定机制」，是机制借鉴非 fork；结论=两者都是 agent 预设层
  （装 ~/.dsh/.agent-presets），锚定应用点不同（首请求工具目录 vs 任务收敛行为）；**可复现**：
  两仓库 README/tree/LICENSE 直查。
- **通知面板「App 里错位、浏览器正常」排查（结论=App 缓存旧 bundle）**：症状=桌面 App 里 🔔
  面板落到输入框下方且无背景（视觉模型看图确认：面板与输入栏操作区重叠、完整设置按钮被截断），
  浏览器正常；排查=Playwright chromium + webkit（**`pnpm exec playwright install webkit` 装
  webkit 内核，路径 `node_modules/.pnpm/playwright@*/node_modules/playwright/index.mjs`，老版本
  playwright 要 `executablePath` 指 ms-playwright 缓存的 Chrome for Testing**）双引擎实测页面/
  设置/通知中心全部正常、面板 getBoundingClientRect 定位正确（menu 在 wrap 上方 8px）、零
  console/pageerror；代码审查=CSS 注入（style.textContent 数组）、面板挂载（slots.inject
  conversation.input.left）、定位（.dsh-cn-wrap position:relative + menu absolute bottom:calc(100%+8px)）
  全部标准；结论=App 的 WKWebView 缓存了中间版本 bundle（App Reload 清缓存后正常）——**排查
  「App 特有 UI 异常」先让用户 Cmd+R 清缓存再深挖**（见 AGENTS.md 索引）。
- **单作者化历史重写（filter-repo mailmap 把第三方作者并入主账号）**：问题=用户要求「不要上游，
  贡献者只剩我」——GitHub 贡献者页有 FSMargoo（14 commits）与占位身份 `dsh-at-file@example.com`
  （7 commits，无账号不归主）；原因=subtree 全历史收编保留原作者 commit，contributors 按 commit
  作者统计；解法=①`pip3 install --user --break-system-packages git-filter-repo`（PEP 668 拦
  `--user` 需 `--break-system-packages`；装到 `~/Library/Python/<ver>/bin`，PATH 未含时用
  `python3 -m git_filter_repo`，其 `--version` 输出发布哈希不是版本号）；②mailmap 两行
  `新名 <新邮箱> 旧名 <旧邮箱>`，filter-repo `--mailmap` 同时改 author+committer；③
  `git filter-repo --mailmap <f> --force`（209 commits 0.9s；要求工作树干净，先提交；跑完自动
  删 origin 远程需重加）；④验证三件套=身份枚举无残留 / `rev-list` 计数不变 / 备份 bundle 的
  `^{tree}` 与重写后逐字节一致（`git fetch <bundle> main:refs/backup/x` 后对比）；⑤force push
  （先查影响面：本例 0 fork / 0 PR / 0 issue 才安全）；后果=subtree 与上游关联断开（正合需求），
  THIRD-PARTY.md / AGENTS.md 标记 dsh-at-file 脱离上游，备份留存
  `/tmp/deepseek-plugins-pre-rewrite.bundle`；**可复现**：任何带第三方全历史收编的仓库。
- **GitHub 贡献者页出现第三方原作者（subtree 全历史收编的副作用）**：问题=用户问「我的仓库怎么
  有其他贡献者」，Contributors 页显示 FSMargoo 14 commits（自己 186）；原因=GitHub contributors
  按**默认分支历史里 commit 的作者**统计，与 collaborator/权限无关；`git subtree add`（未
  `--squash`）保留 dsh-at-file 原仓库全历史，原作者 FSMargoo（1683691371@qq.com）的 14 个
  commit 全部落在 dsh-at-file/ 内（src/tests/README），而合并提交 7e34990/94b5a0d 作者是本人
  （fangshoufanji）；解法=属正常收编（THIRD-PARTY.md 有记录），无权限/安全风险，无需处理；
  要消掉只能 filter-repo 改写作者 + force push（破坏 subtree 关系与所有 clone，不建议）；
  验证=API `fork=false`、contributors 计数恰等于历史作者统计；**可复现**：任何 subtree 全历史
  收编的仓库都会把上游作者算进贡献者。
- **dsh-plugin-jinji 面板主题 token 化（硬编码深色 → 随浅/深主题）**：问题=调研时记录的遗留
  「面板硬编码深色系（#151517 等）不随浅色主题」；原因=client.js 的 `JM_CSS`/`CFG_CSS` 两块样式
  全部裸 hex，只有设置卡片用了部分 token；解法=从 harness `design-platform.css` 主题表逐 token
  取值核对后整块替换——背景 `#151517`→`bg-layer-1`（fallback 保留原 hex）、卡片 `#1D2126`→
  `bg-layer-2`、文字 `#E4E8ED/#C9CFD6`→`label-primary`、`#7A828C`→`label-caption`、
  `#6b737d`→`label-dimmed`、`#b3bac2`→`label-primary-dimmed`、边框 `#23282E/#31373F/#1c2126`→
  `border-l2/l3/l1`、输入/内凹 `#101216/#14171B`→`bg-mask-2`、代码块/行内码→
  `markdown-code-block/inline-code`、滚动条→`scrollbar-bg-l1`、选中悬停→`interactive-bg-hover`；
  **强调色 #5B8DB8/#6FA3CC → `state-business-primary`（浅 #4176E6/深 #679EFE DeepSeek 蓝）——
  不能用 `brand-primary`（中性对比色 浅=近黑/深=近白）**；选中项底 `#1A232C`→`state-business-
  tertiary`（浅=deepseek-100 淡蓝/深=deepseek-800 蓝灰，两态都成立）；标签三色底/边框改
  `color-mix(in srgb, currentColor 10%/28%, transparent)` 自动适配两主题；**坑=CFG_CSS 用了
  主题中不存在的 `label-secondary`/`label-tertiary`（src grep 无定义，永远走深色 fallback）
  → 换 `label-caption`/`label-primary`**；smoke 的 `#5B8DB8` 断言靠 fallback 字面量存活，勿删；
  client 侧改动刷新页面即生效（client.js 按请求静态读），面板 var() 随根主题实时切换；
  文档四处同步（jinji README「本仓库本地化改动」、THIRD-PARTY.md 表格+详情（原样→本仓库维护）、
  AGENTS.md 维护清单+索引、NOTES.md）；**可复现**：`npm run check && npm run smoke`（57 断言）。
- **dsh-router-standard 收编（yjh051108/dsh-router-standard 源仓库）**：`git subtree add
  --prefix=<dir> <upstream> main --squash` 收编（v0.1.1→现 v0.2.0，remote 别名
  `upstream-router-standard`；套装仓库 dsh-routing-suite 仅聚合壳+坏 submodule，**已弃用，
  直接跟源仓库**）。agent 预设，纯 JS 零依赖：复制 `preset/` 到
  `~/.dsh/.agent-presets/router-standard/`；rc.5 契约逐项核对全兼容；v0.2.0 拆双预设
  （router-standard RL 接口还原 / router-spec 深度思考优先），详见上方 v0.2.0 更新条目。
  同日还收编过 dsh-super-injector（@dsh-external，BSD-3-Clause，TS/tsdown bundle，
  构建需 DSH_CHECKOUT+符号链接 vendor）——**该插件已于 2026-08-16 用户决定删除**，
  收编/构建细节留档：tsconfig types 缺 @types/node 需从 harness 链、tsdown bin 按 cwd
  解析需链整个包、install.sh 冷克隆不带 DSH_CHECKOUT 会失败；安装用 `pnpm dsh plugin
  --profile web add <abs路径>`（dsh 不在 PATH 用 `pnpm --dir <harness> dsh`）。
- **dsh-plugin-jinji 加入 monorepo（git subtree 第三方谨迹记忆面板）**：`git subtree add --prefix=dsh-plugin-jinji https://github.com/quan2005/dsh-plugin-jinji.git main --squash` 拉入（3⭐ MIT，上游 0.6.0 已含调研时点名的修复：面板搜索/键盘导航/渐进渲染 + index 指纹缓存 + 配置读-改-写并发防护 + CI/npm 发布流水线）；bundle 形态（`cordis.patch.yml` insert `jinji-memory` 行 + web client，`inject: ['fs','webServer']`，零依赖零编译）与仓库一致，与现有插件无 id/服务冲突；`npm run check` + `npm run smoke`（57 断言）全绿；`scripts/install.sh` 自动发现 dsh-* 目录无需改脚本；文档三处同步（README 目录表 + 「一键安装」数量 11→12、AGENTS.md 树、NOTES.md 落档）；**踩坑=`dsh plugin add ./dsh-plugin-jinji` 的 `./` 相对 CLI 自身 cwd（harness 目录）解析**，装成指向不存在目录的悬空 link、且 CLI 因此误报「declares no dsh.bundle」——必须用绝对路径 `dsh plugin --profile web add /abs/path/dsh-plugin-jinji`（先 remove 坏条目再重装，profile 内 link 正确后 bundle 自动进 `dsh.profile.bundles`）；遗留=POST /config、/install-preset 无 CSRF 守卫、readBody 无大小上限、面板硬编码深色（上游未修，沿用调研结论）；激活需重启 dsh web（组合层无热重载）；**可复现**：是（subtree commit + 三处文档同 commit）。附带发现：`dsh-router-standard` / `dsh-super-injector` 两个 subtree 已入库且 super-injector 已装进 web profile，但根 README/AGENTS.md 清单未同步（并行会话遗留，本次未处理）。
- **通知点击跳会话（node-notifier wait 模式 + poll 交接）**：macOS 原生通知默认点击即消失不跳转；
  harness 前端是**无 URL 路由 SPA**（会话切换纯前端状态 `sessions.open(id)`，无深链，grep 构建产物
  确认无 URLSearchParams/hash）→ 不能靠 open URL；解法=node-notifier `wait: true`（mapToMac 自动
  转 `timeout` + `json: true`，terminal-notifier 保持运行，点击输出 activationType）→ host 挂
  `notifier.on('click', (emitter, opts)=>...)` 读自定义 `options.dshSession`（actionJackerDecorator
  emit 带 notify 的 options clone，自定义字段可透传）→ 记 `pendingOpen`，poll 响应**一次性消费**
  返回，client 调 `ctx.get('sessions').open(id)` 跳转（桌面 App 内直接切会话，比开浏览器更优）；
  配套=visibilitychange/focus 立即 kick-poll（点击通知激活 App 后秒跳）；坑=click 监听只挂一次
  （clickHooked 守卫，避免每次 notify 累积监听）、无 sessionId 的通知不走 wait（避免 spawn
  挂进程）、node-notifier 模块级 activeId 机制=只有最新通知的点击会被处理（旧通知点击忽略，可接受）
  （见 AGENTS.md 索引）。
- **dsh-paste-input 收编进 monorepo（git subtree --squash + 本地化修复随行）**：工作树有
  未提交改动时 `git subtree add` 直接拒（`working tree has modifications`）→ 先
  `git stash push` 全部改动再 add、完事 `git stash pop`（并行会话文件若正在被改有冲突风险，
  先看 git status 确认）；subtree 后把修复文件（lib/client.js + package.json）从 profile
  node_modules 副本 cp 进 `dsh-paste-input/`，README 加「本仓库本地化改动」一节说明
  `git subtree pull` 合并上游后需重新应用；profile 依赖 `github:` → `link:` 切换用
  `dsh plugin --profile web add link:<abs>`（pnpm 直接替换同名依赖，symlink 指向仓库目录，
  dump-config 合成正常）；根 README 目录表+「一键安装」数量描述（10→11）两处同步，
  install.sh 自动发现 dsh-* 目录无需改但注意**非 bundle 插件 install.sh 装完仍要手动
  patch 行**（README 已注明）（见 AGENTS.md 索引）。
- **通知插件「切走不提醒、切回才提醒」修复（host 直发原生通知）**：根因=client 1.5s 轮询
  `/poll` 依赖页面 JS 定时器，页面后台时被节流/暂停（浏览器 tab、WKWebView 壳），事件到达
  但页面收不到，切回才拉取弹出；解法=host 在 push 队列时**直接弹 node-notifier 原生通知**
  （node 进程永不被节流），client 每次 poll 上报 `packaged=1` + `cfg=<JSON 设置>`，host 按
  设置（总开关/类别 notify/冷却，豁免 approval/error 等）判定并弹，成功后给 rec 打
  `native=true`，client 收到 native 项只放音效不双弹；stopKeyOf/categoryOf 映射 host/client
  双份保持同步（aborted+user→manual、interrupted→manual、非法 reason→other）；验证=判定链
  9 场景 mock 全 PASS（冷却/豁免/类别关闭/总开关）；坑=URLSearchParams 自动编码 JSON query
  （Node URL 解析自动 decode，无需 base64），Node server maxHeaderSize 16KB 内 ~1.5KB 无压力；
  改 host 半区后**必须重启 dsh 进程**才生效（组合层无热重载）（见 AGENTS.md 索引）。
- **WKWebView 文件选择没反应 + 插件文案本地化（dsh-paste-input × dsh-mac-desktop 修复）**：
  ① 桌面壳 `<input type=file>`/`webkitdirectory` 点了没反应=壳的 `WKUIDelegate` 没实现
  `runOpenPanelWith`（WebKit 默认静默取消，拖拽/粘贴是 DOM 事件所以正常）——修复=Coordinator
  加 `runOpenPanelWith` 弹 `NSOpenPanel`，按 `WKOpenPanelParameters.allowsMultipleSelection/
  allowsDirectories` 设多选/目录；坑=**macOS 26 SDK 委托标签是 `initiatedByFrame`**（老的
  `initiatedBy` 只报 near-match 警告不匹配）、`NSOpenPanel` 无 `canResolveAliases` 成员、
  原生面板标题别硬编码（系统自动本地化）；`native/scripts/make-app.sh` 出 universal 二进制。
  ② 第三方插件文案硬编码英文/中文混排 → 接入 DSH `locale` 服务：client 侧 `ctx.get('locale')`
  （`@deepseek-ai/dsh-client-locale`，`getLocale().active` 读当前语言，跟随系统语言+DSH 设置页
  Language），inject 数组和 package.json `dsh.client.inject` **两处都要加**（boot 图加载顺序
  看 package.json 声明 → 改了 package.json 必须重启 dsh web；只改 client.js 内容刷新页面即可，
  client.js 按请求从包目录静态读取）；改 node_modules 里的 github 依赖包直接生效但
  `dsh plugin update` 会覆盖 → 长期修复要走 PR 上游或本地 fork（见 AGENTS.md 索引）。
- **dsh-paste-input 实装后真机首验（rc.5，全链路 OK）**：拖入 xlsx → 落盘
  `<工作区>/.dsh/tmp/attachments/session-<会话id>-<12位短token>/<发送批次>/`（目录名=harness 会话
  id+短 token 后缀，manifest sessionId 只有纯 id）+ `.dsh-paste-input.json`（owner/version/
  createdAt/committedAt/totalBytes/files[]）；openpyxl 直接读 4 sheet 全中（模型读表链路成立）；
  ⚠️ **模型上下文里消息块路径与会话日志不一致**（同一消息日志存 `f5fb3d`、上下文渲染成 `f7fb3d`、
  另一条少 `-427fb7eceb66` 后缀；全盘无 f7fb3d 会话）——是 harness 上下文构建/渲染的路径改写，
  非插件问题；**模型侧兜底=以磁盘为准用 find/glob 定位**，别盲信块内路径；图片粘贴双份观察成真
  （输入框聚焦贴图：原生 intakeImages + 插件 document paste 监听都接 → 消息同时含图片块+附件块、
  文件名被原生哈希化）；vision 链 `opencode-go/mimo-v2.5` 连续空响应（自动+vision_describe 手动
  均失败，上游不稳非插件问题），可换链或稍后重试（见 AGENTS.md 索引）。
- **dsh-notification-center 桌面壳授权修复（WKWebView 壳检测）**：症状=浏览器通知正常、桌面
  App（dsh-mac-desktop macOS SwiftUI+WKWebView 壳）里 Notification 授权永远失败——原因=壳 UA 无
  Electron/`__TAURI__` 标记，插件 IS_PACKAGED=false 走 HTML5 Notification，而 WKWebView 无地址栏、
  requestPermission 永不弹授权框；解法=client 壳检测加**裸 WKWebView 启发式**
  （`AppleWebKit && !Safari|Version/|Chrome|Firefox|Edg/|CriOS|FxiOS|EdgiOS|Mobile`），命中即
  IS_PACKAGED → 走 host `/dsh-notification-center/notify`（node-notifier 原生通知，免授权），
  授权按钮自动隐藏；UA 矩阵实测 7 例无误伤（Safari/Chrome/Edge/Firefox/iOS Safari 均 browser）；
  验证=curl `-G --data-urlencode`（**中文 query 不编码直接 curl 会 400**，Node HTTP parser 拒非
  ASCII URL）→ `{"ok":true}` 真实弹 macOS 通知；构建=改 src 后必须重跑 `node scripts/build.mjs`
  再提交 lib（见 AGENTS.md 索引）。
- **第三方非 bundle 插件安装（dsh-paste-input 实装到 web profile）**：`pnpm --dir <harness>
  dsh plugin --profile web add github:lhh010/dsh-paste-input`——该包**无 `dsh.bundle.patch`**
  （只有 `dsh.client` 元数据 + host lib/index.js），reconcile 会警告「declares no dsh.bundle —
  installed as a plain dependency, not a profile layer」并**不**进 bundles 列表（预期行为，别当
  失败）；激活靠手动在 `~/.dsh/profiles/web/cordis.patch.yml` 追加
  `- insert: [{id: dsh-paste-input, name: '@dsh-community/dsh-paste-input'}]`（host 半导出
  `name='dsh-paste-input'` 与行 id 对齐；与 vision-bridge 的 insert 行同构）；验证组合=
  **`pnpm dsh --profile web --dump-config`**（注意：不是 `dsh dump-config --profile web`，后者
  报 `--profile <name> is required`——dump 是 boot 命令的 `--dump-config` 旗标，见 args.ts
  resolveBoot）。**组合层无热重载**（boot/app-boot 无 fs.watch/chokidar 监听 cordis.patch.yml），
  改完必须重启 `dsh web`；服务在用户终端前台跑（`node --import tsx/esm apps/cli/src/bin.ts web`），
  agent 无法自杀式自重启（会杀掉自己的进程，最终消息丢失）→ 装完把重启命令交给用户。
  raw.githubusercontent CDN 从本机**间歇性返回陈旧/截断文件**（同一 main 路径两次拉到 38280B 与
  52572B；API contents 的 base64 稳定，`git ls-remote` 直连正常）——校验第三方产物内容时用
  API 按 commit SHA 拉（见 AGENTS.md 索引）。
- **dsh plugin add 的路径解析坑（本机实测）**：`pnpm --dir <harness> dsh plugin add ./dsh-xxx`
  会把 cwd 切到 harness，**相对路径解析到 harness 下**（报 `Installing a dependency from a
  non-existent directory: <harness>/dsh-xxx`，且因目录不存在被当 plain dependency 而非 bundle
  layer）；必须用**绝对路径** add。link 包的运行时依赖（如 node-notifier）pnpm 不自动装：
  插件目录内 `npm install --legacy-peer-deps`（peer `@deepseek-ai/*` rc 版本在 registry 无
  `>=0.1.0` 匹配，npm 默认自动装 peer 会 notarget 失败；pnpm install 在插件目录会拉整个根
  workspace 11 项目、被无关项目版本问题卡死）；装完 `node -e "import('node-notifier')…"` 验证
  动态 import；验证安装= `dsh --dump-config` grep patch 行 + profile package.json 的 bundles/
  dependencies（见 AGENTS.md 索引）。
- **dsh-notification-center 已纳入 monorepo（git subtree）**：`git subtree add --squash`（与
  agent-teams 先例一致）+ 本地 `node scripts/build.mjs` 生成 lib 并**提交**（原 .gitignore 忽略
  lib/，注释掉后提交——git 分发 `#sha&path:` 安装无构建步骤也能用，agent-teams/at-file 同款惯例）；
  根 README 目录表 + install.sh 注释同步时发现**历史遗留数量错误**（bilibili 移除后仍写「自有 7 个
  + 第三方 3 个=10」，实际 6 自有 + 4 第三方=10；dry-run 实测 10 个插件才核对出来）；install.sh
  自动发现 `dsh-*` 目录无需改动；dry-run 全绿（见 AGENTS.md 索引）。
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
- **dsh-visualize 已装进 web profile（rc.5 运行时实测结论）**：`dsh plugin --profile web add github:Nagi-ovo/dsh-visualize` 成功（bundles 列表 + `@dsh-external/dsh-visualize` 依赖 + dump-config 条目齐全）；**peer 声明 `^0.1.0-rc.6` ≠ 必须 rc.6**——作者用到的全部契约（presentationMeta/keyed toolview/input.dock/isConcurrencySafe/skills.registerProvider/defineTool）在 rc.5 源码里都存在（逐一 grep 验证）；pnpm 报 missing peer 是**良性**的，因为共享层 `~/.dsh/profiles/node_modules/@deepseek-ai/`（195 包，symlink 到 harness workspace apps/cli node_modules）在 Node 运行时解析时会被走到（实测从插件目录 require.resolve 命中 rc.5 包）——pnpm 的 peer 检查不算这一层、Node 解析算；**重启后生效验证通过**（rc.5 真机）：会话技能目录出现 `visualize` skill（随包 `ctx.skills.registerProvider`）、运行实例 `/plugins/@dsh-external/dsh-visualize/client.js` 200（29KB，`__ModuleLoader__.load`）、根 HTML boot manifest 含 dsh-visualize——host+client 双半区均装载（见 NOTES.md）；**首个真实卡片验证通过**（rc.5 全链路 OK）：用户要求「可调参数的排序算法可视化」→ 加载随包 `visualize` skill（base 目录在插件包 assets/，含 design.md/charts.md 主题 token 契约：--viz-series-N/--primary、禁用 color-scheme 声明、CDN 白名单、fragment 无骨架）→ `visualize` create 出 10.5KB 内联卡片（5 算法事件录制 + 播放/单步/调速/调参，纯 JS 零外部依赖），workspace 落 `viz/visualization-<fnv1a8>.html`。

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

- **dsh-vision-bridge 第八批：会话含图切文本模型报 model-unavailable 修复（declareImage 垫片）+ compaction 兜底（llm/stream waterfall）+ 失败透明重建**：问题=用户报 `模型操作失败：model-unavailable: Model "deepseek-v4-flash" does not accept image input, but this session already contains images; select an image-capable model`（dsh-plugin-memory 会话里切到其他 provider 的纯文本模型全报错）。原因=api-proxy 的 `selectModel`（api-proxy.ts:2299）和 `prompt` 附件准入（:2487）都在**切模型/附图时**查 `ctx.llm.resolveModelInfo(...).inputModalities`——会话含图 + 目标纯文本 → 直接拒绝；这发生在任何步骤之前，**agent/pre-step 改写救不了**（pre-step 只覆盖步骤，覆盖不了准入）。解法=插件内 `declareImage` 垫片（默认开）：包一层 `ctx.llm.resolveModelInfo`，给 `inputModalities` 缺 image 的模型补上 image（准入放行、任意模型可切），`ctx.effect(() => () => restore)` 卸载恢复；安全由 pre-step + 新增 llm/stream 兜底保证（图片进适配器前必被改写）。第二个坑=**compaction 等辅助调用不经 agent/pre-step** 直达 `ctx.llm.stream`，会话含图时 pi-ai 适配器抛 UNSUPPORTED_CONTENT（input 未声明或 attachments 缺失都拒）、官方 DeepSeek 会坏会话——新增 `llm/stream` Waterfall 兜底：非冻结请求（`Object.isFrozen` 判定，loop 构建请求深冻结跳过）的图片改写为文字；**Cordis waterfall 监听器必须返回 AsyncIterable 而非 Promise**（`for await` 不消费 Promise），改写路径用懒执行 async generator + `yield* next()`；自己的视觉链请求用 WeakSet 引用排除（原图必须送达视觉模型）。第三个坑=垫片会让 resolveModelInfo 对所有文本模型「撒谎」→ 视觉链发现与 passthrough 直通判定**改用 `listModels` 的 inputModalities（真实声明）**，否则自动发现会选到文本模型当视觉链。第四个坑=settings 批量声明 `input: [text, image]` 的官方杠杆在**带 `models` 列表的路由上行不通**（catalog `modelOverrides` 明说 only meaningful while `models` is absent，同时出现直接 invalid），本部署 318 个文本模型逐一改 settings 不现实——垫片方案免改 settings 且对未来 catalog 新模型自动生效。另：第七批失败透明工作（visionFailures 原因标记 + 冷却 + README 成本控制）被并行 agent 的 git checkout 清掉（未提交工作），本轮重建并加测试。测试 85+15 断言全绿（apply 新增垫片/llm-stream/发现链真实/失败透明四组；cordis-boot 补 listModels inputModalities stub 契约）。可复现=任一会话附图后切 opencode-go/deepseek-v4-flash 等文本模型不再报错（需重启 dsh 加载新 bundle）。
- **dsh-plugin-jinji 生态调研（第三方 quan2005，3⭐ MIT 谨迹记忆面板）**：把「谨迹/JournalClaw」记忆理念原生落地为 DSH 插件——双轨记忆（`.journal/memory/yyMM/DD-标题.md` 流水日志 + `.journal/identity/` 人物/产品画像）+ summary 分层加载（AI 写记录时同步写 frontmatter `summary`，读取先只读 summary、点开才读全文，与 skill 目录同构）。形态与本仓库完全一致：bundle + `cordis.patch.yml` + 手写 `window.__ModuleLoader__` client（零依赖零编译），host 601 行 / client 866 行 / 冒烟 57 断言自包含（check+smoke 实测全绿）。**对本仓库有用的契约细节**：①启动注入=监听 `agent/session-start` 异步预计算快照（WeakMap 按 agent 缓存）+ `systemPrompt.context({name, order:130})` 同步提供器——「提供器必须同步、fs 异步」的标准解法；②index 条目指纹缓存兼容双形态——真实 fs 服务 stat 只有 `{version,type,size?}` **无 mtimeMs**（version 等值即官方未变更语义），测试 mock 才带 mtimeMs，指纹取不到宁直读不冒险；③配置保存「读-改-写」以磁盘现文件为基底只覆盖提交字段（并发保存不互踩）；root 三级解析 config > `DSH_JINJI_ROOT` > cwd；④「谨迹秘书」预设安装走 roster 官方创作通道 `copy('standard', id, name)` + node:fs 直写 preset 目录（`~/.dsh/.agent-presets` 在 fs 写沙箱外会 FS_SANDBOX_DENIED，与本仓库 ADR-0013 结论一致）；⑤设置卡片注册 `settings.plugin.item` 槽位（`ctx.get('slots')` 可选 + shell 共享 React，拿不到降级跳过）。**审查发现可借鉴/可改进**：POST `/config`、`/install-preset` 无 CSRF 守卫、`readBody` 无大小上限（本仓库惯例建议补）；面板硬编码深色系（#151517 等）不随浅色主题；路径防护（`.journal/` 前缀 + 拒 `..` 段 + `fs.contains`）与 index/read 分层设计良好。**可复现**：`git clone https://github.com/quan2005/dsh-plugin-jinji && npm run check && npm run smoke`。附带：vision_describe 报 `every vision model failed — opencode-go/mimo-v2.5: empty response`（免费视觉模型空响应，环境性故障，与插件无关）。
- **dsh-visualize 生态调研（第三方 Nagi-ovo，86⭐）**：Codex /visualize 语义的 DSH 插件——模型调 `visualize` 工具，对话内渲染 sandboxed iframe 交互卡片（模拟器/图表/mockup）；架构要点=`tool.call.toolview` 按 key 注册卡片 + `conversation.input.dock` 流式预览（边生成边渲染）+ `presentationMeta` 内联 fragment 保重放稳定 + 严格 CSP + 主题 token 桥接（详见 NOTES.md）。
- **dsh-bilibili-player 已移除（用户决定，2025-06）**：用户认为该插件多余，`git rm -r dsh-bilibili-player`
  连同根 README/AGENTS.md 的目录树与表格行、以及失效引用（动态插件说明的 v0.1.x、同类调研条目指向的
  COMPARISON.md）一并清理；git 历史完整保留（`git log` 可随时找回，全部代码与 NOTES 经验条目仍在）。
  教训=删插件要「目录 + 根文档三处清单 + 失效链接」一次清完，别留悬空索引。**可复现**：是（commit 见下）。
- **npm 版本号 ≠ git master 版本（harness 更新判断教训）**：npm 上 `@deepseek-ai/dsh` 已发布 `0.1.0-rc.6`，但 git 远端 `master` 仍是 `47f943859b`（rc.5）、无任何 `0.1.0-rc*` 标签——**rc.6 只存在于 npm，git 里没有对应提交**。判断是否该更新 harness 时：①`git fetch` 后查 `HEAD..origin/<分支>` 差距（本仓库默认分支是 **master 不是 main**——查 `origin/main` 会报 "unknown revision"，浪费了 4 轮排查）；②对比 npm 版本和 git 版本要分开查，不能互相推断。结论：本地 master 已是最新，`git pull` 无内容可拉，继续用 rc.5（9 插件实测全跑通），等上游把 rc.6 合进 master 再更新。**可复现**：`git ls-remote origin 'refs/tags/0.1.0*'` 为空 + `npm view @deepseek-ai/dsh version` = rc.6。
- **dsh-agent-teams 加入 monorepo（git subtree 第三方多 agent 团队插件）**：用 `git subtree add --prefix=dsh-agent-teams https://github.com/NanmiCoder/dsh-agent-teams.git main --squash` 拉入（255⭐ MIT，作者 程序员阿江）；该插件不依赖额外构建（lib/ 已随 subtree 带进来），`scripts/install.sh` 自动发现 `dsh-*` 目录，无需改脚本；需更新三处文档（AGENTS.md 目录树 + 表格、README.md 表格 + 安装说明文字），以及 NOTES.md 落档；**注意**：`git subtree add` 只拉 `main` 分支，带 `--squash` 压缩历史，不丢原始 commit 时间线；第三方 MIT 插件保留其 LICENSE 文件即可；**可复现**：`git subtree add --prefix=dsh-xxx <repo> main --squash`。

- **pnpm 不递归目录包的本地子依赖（集合安装设计教训）**：想让「克隆一个仓库 → `dsh plugin add <仓库根>` 一次装完所有插件」，在根 package.json 里把子插件声明为 `link:./dsh-xxx` 或 `file:./dsh-xxx` 依赖——实测 **pnpm 只把根包链接进 profile，完全无视其本地子依赖**（lockfile 只记录根包一行，node_modules 里 8 个子插件全无）。`dsh plugin --profile p add <dir>` 就是 `pnpm add <绝对路径>`（link 语义）+ reconcile bundles，不会递归解析目录包的 `link:`/`file:` 子依赖。**解法**：`scripts/install.sh` 逐个 `dsh plugin add <每个子目录>`（8 次 add 包在一条 bash 命令里），每个子插件成为 profile 的直接依赖——这正是本机 web profile 一直用的模式。**可复现**：临时 DSH_HOME + scratch profile 跑 `dsh plugin add <仓库根>`，查 lockfile 只有根包。附带发现：`dsh-better-sidebar` 的 `main=lib/index.js` 但 `lib/` 被其 .gitignore 排除（subtree 后无构建产物），install.sh 需先构建 TS 插件再 add。
- **使用统计 TokenTracker 三件套 + 设置页全屏（dsh-usage-dashboard）**：借鉴 TokenTracker
  （已原生支持 DSH）搬入——①成本估算：host 内置 PRICING 快照（USD/1M，LiteLLM 风格，
  cacheRead=0.1×in）+ modelInput/modelOutput 分开计价 → modelCosts/totalCost；②会话明细表：
  sessionRows（covered 会话取缓存精确 input/output/cache 拆分、uncovered 取扫描值、主导模型
  从扫描）→ client 可排序分页表格；③设置页全屏：settings dialog 外壳 800px 固定、hash class
  不可预测 → MutationObserver 探测「nav+≥2 个 button」特征加 .dsh-us-max-settings class →
  CSS 放大到 calc(100vw-20px)×calc(100vh-20px)，图表区改 auto-fit 两栏 grid（窄列自动单列）。
  坑：①**并行会话 git checkout 清掉未提交工作两次**（口径统一+三件套全丢）→ 改完立即提交；
  ②**host const TDZ**：touchSession 定义在 exact 循环之后，调用抛 ReferenceError 被 catch 吞掉
  静默丢数据 → 定义必须先于使用；③测试断言时间相关（Date.now() 相对 → 日键漂移）→ 用 mock
  自身时间戳+host 同款本地 dayOf 推导期望。验证：apply 冒烟 24 断言 4 场景、client 渲染 4 场景
  130 节点全绿（见 AGENTS.md 索引）。

- **dsh-better-sidebar 加入 monorepo（git subtree 第三方）**：用 `git subtree add --prefix=dsh-better-sidebar https://github.com/omdsh-dev/DSH-better-sidebar.git main --squash` 拉入 omdsh-dev 组织（802⭐）的 MIT 侧边栏插件；该插件是 TS/tsdown 构建，自带 cordis.patch.yml 和 dsh.plugin.json，与仓库现有 7 个插件无冲突——它提供 `ctx.betterSidebar` 服务，其他插件可注册 tab/viewer；根目录新增 `package.json`（workspace + DSH 集合 bundle）、`pnpm-workspace.yaml`、`cordis.patch.yml`（统一挂载全部 8 插件）、`dsh.plugin.json`、`scripts/install.sh`（bash 一键安装）；注意：git subtree 要求干净工作树，`dsh-at-file/` 未跟踪要先暂存/移除；publish 时注意 `package.json` 的 `files` 白名单只包含集合入口文件，不包含子插件源码。
- **dsh-at-file 加入 monorepo（克隆第三方仓库）**：从 GitHub 克隆 omdsh-dev/dsh-at-file（MIT），复制到 `dsh-at-file/` 并去掉 `.git`；该 repo 的 devDependencies 用 `link:../dsh/...` 指向同目录下的 `dsh` 目录（harness checkout），在 monorepo 中需改为 `link:../../deepseek-harness/...`（从 `dsh-at-file/` 到 `workspace/deepseek-harness/` 是 `../../` 而非 `../`）；vitest.config.ts 的 alias 路径同样要改；`apply.client.spec.tsx` 测试依赖 `@deepseek-ai/dsh-client-runtime/client` 等 alias，改对路径后 149 项测试全过；根文档 AGENTS.md + README.md 三处同步更新（目录树 + 表格）。

这个仓库做 DSH 插件开发时踩过的坑、学到的经验，统一记在这里，按新→旧排列。
格式：**问题 → 原因 → 解法 → 可复现?**。每条开头有个短标题便于索引。

> **⚑ 强制约定**（根 [AGENTS.md](AGENTS.md) 的硬性约束）：**每个对话 / agent 任务结束前
> 必须落档**——新踩的坑追加在**最上方**（新→旧），并顺手在根 AGENTS.md 的「踩坑 / 项目经验」
> 一节留一行索引。落档内容包括：踩过的坑、查到的契约/API 细节、性能套路、决策理由、失败原因；
> 若本次无新增经验，须在最终回复中明确说明「本次无新增经验」。尽量写成别人能照做的步骤，
> 别只写给自己。未落档视为任务未完成。

---

## Windows 壳父进程看护事件驱动化（WaitForSingleObject，df6f32a）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：Tauri 壳 watch_parent 每 2s GetExitCodeProcess 轮询，App 全生命周期持续 CPU 驻留
  ——插件内最后一处持续轮询（mac Swift 壳已 kqueue 化、index.js 无定时器、server/main 轮询限启动期）。
- **解法**：OpenProcess + 后台线程阻塞 WaitForSingleObject(INFINITE)——内核在父进程退出瞬间信号
  句柄，事件间零 CPU、退出 ~1s（vs 轮询 2s+）；OpenProcess 失败（父已死）立即退出；WAIT_FAILED
  保守退出；HANDLE(*mut c_void 非 Send) 转 usize 传线程。
- **坑**：windows-sys 0.59 的 INFINITE 在 **Win32::System::Threading**（不在 Foundation）；
  thread::spawn 闭包捕获 HANDLE 报 *mut c_void 非 Send（同 server.rs JobHandle 教训）。
- **可复现**：是——交叉 check 前 INFINITE import/闭包 Send 两处编译错；修复后 windows 0 错误
  + mac 8 测试过 + 零警告。

## dsh-plugin-classifier 资源优化（Round 1，3 项修复）

- **审计结论**：零轮询零定时器，唯一外部资源=市场数据 215KB 缓存（10min TTL 自动过期），
  classify 遍历 160+ loader 条目（5s 缓存已加），searchPlugins 每次调用重建 592 条扁平数组。
- **修复 1（Host）**：flattenMarket 结果 + haystack 字符串预计算并缓存于 marketCache 旁，
  searchPlugins 改用预计算数据，避免每次搜索重建 592 对象 + 字符串拼接。——`index.js`
- **修复 2（Client MarketTab）**：flattened/perCategory 计算从 render 每次重算改为 useMemo
  （依赖 view.categories 不变则跳过），避免筛选/分类切换时 592 次遍历。——`client.js`
- **修复 3（Client ClassifiedTab）**：filtered 结果从 render 每次重算改为 useCallback + useMemo
  （依赖 query 不变则跳过），避免过滤按钮切换时重复遍历 160+ 条目。——`client.js`
- **已验证**：220 断言全绿，live 实例路由正常（/api 0.002s，/market 0.27s，/install CSRF 403）。
- **未优化理由**：搜索防抖（延迟输入反馈，得不偿失）、虚拟列表（160 项太少）、懒加载市场数据
  （Host 缓存 2ms 响应，无实质收益）、desc 截断（500→200 切掉有用信息）。
- **可复现**：是（220 断言回归）。

---
## mac-desktop 父进程看护 kqueue 化（轮询→事件驱动，e4d98e4）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：孤儿清理的父进程看护每 2s 轮询 proc_pidinfo，App 全生命周期持续 CPU 驻留。
- **两个坑（重要）**：① **DispatchSource.makeReadSource 在 macOS 上不投递 kqueue 事件**
  （阻塞 kevent 能读到、dispatch read source 收不到——最小复现实验证实）；② kevent.fflags
  是 Int32、NOTE_EXIT 也是 Int32，`UInt32(...)` 包装是类型错/trap。
- **解法**：kqueue EVFILT_PROC/NOTE_EXIT + utility 线程阻塞 kevent（内核唤醒、事件间零 CPU、
  父进程死后 ~1s 退出 vs 轮询 2s+）；zombie 也触发（NOTE_EXIT 在 exit 时而非 reap）；kq
  **不手动 close**（进程退出内核回收，close 会唤醒阻塞线程 mid-termination）；kqueue 失败
  fallback 2s 轮询。
- **可复现**：是——kill -9 父进程（SIGKILL 未 reap），App 1s 内退出 + `NOTE_EXIT fired` 日志。

## mac-desktop WebContent 高内存治理（内存压力/周期清缓存/未激活重建）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：WebKit WebContent 进程长期运行涨到 1.57GB（重型 React SPA + WebKit 已知长期泄漏）。
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
- **盘点**（git 历史判定）：**有本地修改** 3 个——`dsh-at-file`（link 路径 16+1 处）、
  `dsh-notification-center`（深度：壳检测+原生通知+点击跳会话，3 个本地 commit，与 mac-desktop
  耦合）、`dsh-paste-input`（文案本地化）；**原样收编** 5 个——agent-teams / better-sidebar /
  plugin-jinji / router-standard / super-injector。自有原创 6 个。
- **解法**：新建根级 `THIRD-PARTY.md`——一览表（上游/许可证/本地修改/维护状态）+ 每个修改
  插件的「改了什么/升级风险/验证」细则 + 维护流程（subtree add/pull 步骤）+ 判定规则
  （无修改→跟随上游；有修改→本仓库维护，pull 后复查修改点）。README 引用块加链接；
  AGENTS.md 新增「第三方插件维护」小节（AI 每次注入可见：收编即本仓库所有、改完立即提交、
  升级对照 THIRD-PARTY.md）。
- **可复现**：是（任何新增第三方插件时照 THIRD-PARTY.md 流程收编 + 记录一行）。
- **教训**：第三方插件收编不能只记「加了什么」，要记「改了什么」——否则 `git subtree pull`
  升级时本地修改被上游静默覆盖（尤其 notification-center 这类与桌面壳深度耦合的）。

---

## AGENTS.md 精简：介绍性内容移到 README，只留 AI 高频规则

- **问题**：AGENTS.md 是每次会话注入的文档，581 行里介绍性内容（仓库是什么/参照文档表/插件清单表/
  目录树逐插件注释）与 README 重复，白白占用注入上下文。
- **解法**：①「现有子项目」9 行表格删掉→指向 README「目录」（README 表格更详细含链接）；
  ②「参照项目与文档」5 行表格→一行链接 README 对应节 + 保留 Inspect/源码提示（AI 高频）；
  ③「目录结构」逐插件注释树→压缩为根文件 + 「9 个插件见 README」；④「这个仓库是什么」压缩为
  3 条（monorepo 定位 / git subtree 历史 / 两类加载方式）。581→553 行。
- **保留不动**：硬性落档约束、两类加载方式细节、写插件最佳实践（AI 每次动手都要用）、
  踩坑索引（136 条是 NOTES.md 导航，AI 可发现性价值 > 体积，README 不需要）。
- **可复现**：是（任何 AGENTS.md 膨胀后做「介绍移 README、规则留 AGENTS」即可）。
- **教训**：AGENTS.md 是「AI 操作规则 + 经验导航」，README 是「访客介绍」；内容重复处
  以 README 为准，AGENTS 只留一行链接，避免两处维护漂移。

---

## dsh-visualize 生态调研（Nagi-ovo，86⭐，BSD-3-Clause）

- **问题**：用户问 GitHub 上 `Nagi-ovo/dsh-visualize` 项目怎么样——需要完整评估（定位/架构/安全/质量）。
- **定位**：Codex 桌面端 `/visualize` 语义的 DSH 插件——模型调用 `visualize` 工具，把整段内联
  HTML fragment 作为参数传入，Web UI 在对话里渲染成**可交互卡片**（模拟器/图表/对比面板/UI mockup）；
  建仓仅 2 天（2026-08-13 创建、08-14 仍在提交），TypeScript + tsdown + vitest，双语文档，已进
  awesome-dsh-plugin 清单，可从「设置→插件」市场装。
- **架构（双半区 bundle + patch）**：node 半区 `ctx.tools.register(visualizeTool)` + 内嵌
  `visualize` skill provider（`ctx.skills.registerProvider`），inject `['tools','skills','fs']`；
  client 半区 `ctx.slots.inject('tool.call.toolview', key:'visualize')` 注册 `VisualizeCard` +
  `conversation.input.dock` 注册 `StreamingPreview`（order 30）。工具支持 `create`（整段 fragment）
  与 `update`（按唯一 `old_str`/`new_str` 精确补丁，>20 行/5 处要求重建）；create 结果写
  内容寻址文件 `viz/<slug>-<fnv1a8>.html`，`isConcurrencySafe` 仅 create 为 true。
- **可借鉴的 DSH 契约细节**：①**工具输出三件套**——`render` 只回一行确认文本（fragment 已在模型
  自己输出里，回显会双倍上下文成本）、`presentationMeta` 把整个 fragment 内联进持久化
  `tool/result` meta（重放逐字节复现、不依赖磁盘文件仍在）、`presentCall/presentResult` 派生卡片
  标题；②**流式预览**——`extractStreamingFragment` 解析不完整 JSON 参数前缀（扫描 `"fragment":"`
  opener，处理尾随反斜杠/半截 `\uXXXX`/畸形转义即停），`trimStreamingScripts` 丢弃未闭合
  `<script>` 块；③**卡片高度**——sandbox iframe 无法从父页访问 frame 文档，frame 内
  ResizeObserver + `postMessage` 回报 scrollHeight（token 关联 callId），父侧按 mode 封顶
  （inline 800px / wide 1200px）内部滚动；④**主题桥**——resolveTheme 读 `--dsw-alias-*` 计算值
  注入 frame 为 `--dsh-viz-*`，MutationObserver(documentElement/body attributes) + matchMedia
  dark 变化重解析；⑤**安全**——`<iframe sandbox="allow-scripts">` 不透明源 + frame 自带严格 CSP
  （default-src 'none'、script/style 仅 unsafe-inline + 固定 CDN 白名单 cdnjs/jsdelivr/esm.sh/
  fonts.bunny/google fonts/unpkg、connect-src 仅 blob:/data:、frame-src/form-action/base-uri 全
  none）；fragment 拒 doctype/html/head/body 骨架标签；默认 1MB 上限 `maxFragmentBytes` 可调。
- **风险/限制**：仓库太新（2 天）单作者，成熟度未证；CSP 允许 `unsafe-eval`/`wasm-unsafe-eval`
  且 CDN 白名单含 esm.sh/unpkg（可加载任意第三方包）——只在不透明源 iframe 内、无网络出口，可接受
  但非强隔离；卡片内按钮暂不能向对话发 follow-up；TUI/headless 只显示普通工具结果（文档声明降级）；
  peerDependencies 锁 `@deepseek-ai/*` rc.6 线。
- **安装到 web profile + rc.6 结论（用户选择装）**：`pnpm --dir <harness> dsh plugin --profile web add
  github:Nagi-ovo/dsh-visualize` 成功（bundles 列表追加 `@dsh-external/dsh-visualize`、dependencies
  加 github 依赖、`--dump-config` 出现 `# == @dsh-external/dsh-visualize` 条目、包落在
  `~/.dsh/profiles/web/node_modules/@dsh-external/dsh-visualize`）；pnpm 报 missing peer 7 个
  （cordis/dsh-fs/dsh-llm/dsh-sandbox-policy/dsh-session/dsh-skill/dsh-tools/schemastery）——
  **良性**：这些包在 `~/.dsh/profiles/node_modules/@deepseek-ai/`（195 包共享层，symlink 到
  harness `apps/cli/node_modules`）里，Node 运行时从插件目录向上解析会命中（实测 require.resolve
  命中 rc.5 包）；**peer 声明 `^0.1.0-rc.6` 不等于必须 rc.6**——逐一 grep rc.5 源码确认作者用到的
  契约全在：`presentationMeta`（packages/core/tools/src/presentation.ts）、`tool.call.toolview`
  keyed 槽位（client/ui-tool contract slots.ts:23 `kind:'keyed'`）、`conversation.input.dock`
  （ui-conversation）、`isConcurrencySafe`（tools/schema.ts）、`skills.registerProvider`
  （packages/skill/skill/src/index.ts:391）、`defineTool`；剩余风险=作者未在 rc.5 实测（如
  `update` 动作/流式 dock 的 rc.6 行为差异），重启 dsh web 后真机验证（模型调 visualize 出卡片即通）。
- **可复现**：`git ls-remote https://github.com/Nagi-ovo/dsh-visualize` + api.github.com 读源码
  （raw.githubusercontent.com 本机超时，走 api + `Accept: application/vnd.github.raw` 可通）。

---

## 集合分发「开箱即用」总中枢统筹：9 插件一次安装 + 第三方收编

- **问题**：用户要「克隆→一次安装→开箱即用」的完整项目（自有 + 第三方插件混合、无冲突）。
  盘点发现：集合机制已存在但未提交（package.json/pnpm-workspace.yaml/scripts/install.sh 全是
  未跟踪文件）；**dsh-at-file 文档有记录但目录/提交全无**（并行会话克隆后未提交被清掉）——
  「三处清单一致」规则破例（AGENTS.md 有、README 表格无、仓库无此插件）。
- **解法**：
  ① 先把集合文件提交（它们是一键安装核心）；② `git subtree add --prefix=dsh-at-file /tmp/clone
  main` 恢复第三方插件并保留历史；③ 修 link 路径 `../dsh/` → `../../deepseek-harness/`
  （16 处 package.json devDependencies + vitest.config.ts alias，`sed -i ''` 批量）；
  `pnpm install && pnpm build && pnpm test` 149 断言全过；④ 修 install.sh 缺陷——**dry-run 不应
  要求 dsh 可用**（`if ! $DRY_RUN && ! command -v`）；⑤ README 补前置条件（dsh 本体需先就绪 +
  Node≥20 + pnpm）和 at-file 表格行；⑥ 真实一键安装 9 插件全成功。
- **验证**：inject 一致性脚本 7 插件 ALL CONSISTENT；第三方插件用模块级 `export const inject`
  （at-file: typert/settings/agents、better-sidebar: settings），patch 行无需写 inject；typert
  服务由 harness 提供（agent 包 `ctx.inject(['typert'])` 佐证）；**boot 最终验证需重启 dsh**
  （运行中的是旧进程，at-file 未加载）。
- **可复现**：是（任何 git subtree 前未提交的第三方目录都会被清掉——先提交再 subtree）。

---

## 免费模型中断频繁：retryPolicy maxRetries 提到 10（jiyuanlvdong/jiyuanlvdong2）

- **问题**：基元律动（jiyuanlvdong）的 `deepseek-v4-flash-0731` 免费模型容易中断，`maxRetries: 5`
  不够，长任务中途失败。
- **原因**：该模型在 3 个供应商（基元律动/基元律动2/千问）都有，各分组 retryPolicy 都是 5 次；
  harness 默认 maxRetries=2（`packages/llm/llm/src/retry-policy.ts`），模式 `normal` 只重试瞬时码
  （EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT），backoff 500ms→10s 指数+抖动。
- **解法**：把 `~/.dsh/settings.yaml` 里 `llm-pi-ai.providers.jiyuanlvdong` 和 `jiyuanlvdong2`
  的 `maxRetries` 5→10（用户选择：只改这两个、10 次）；改前备份。**热重载确认生效**：
  settings-file 默认 chokidar watch（100ms debounce）→ `llm-pi-ai` `onChange` →
  `ensureRegistrationFacts` 比较 `registrationFacts(profiles())`（**含 retryPolicy**，代码注释明说
  「captures each route's retry policy at registration, so a change must re-register」）→ 原子替换路由。
  无需重启。
- **可复现**：是（任何 `mode: normal` + maxRetries 不够的免费模型）。
- **其他选项**：`mode: always` = 无限重试（省略 maxRetries，所有失败都重试）；千问（qwen）分组
  仍是 5 次未动。

---

## Windows 壳 CI 编译失败修复（Tauri 交叉编译教训）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：v1 Tauri 壳推上去后 GitHub Actions（windows-latest）编译失败。
- **根因**：本地 `cargo check` 只验证了 **macOS target**，`#[cfg(windows)]` 的代码（Job Object、
  进程枚举、HANDLE 比较）从未被编译——**交叉编译检查缺失**。
- **解法（commit 7814523）**：`rustup target add x86_64-pc-windows-msvc` + `cargo check --target
  x86_64-pc-windows-msvc --lib` 本地验证 windows cfg，修出 6 类问题：
  ① HANDLE(*mut c_void) 与 0 比较 → `is_null()`（3 处）；② HANDLE 非 Send → JobHandle 包装 +
  `unsafe impl Send`（连锁 40+ 错误根因）；③ `CreateJobObjectW` 需 `Win32_Security` feature（签名
  含 SECURITY_ATTRIBUTES）；④ reqwest 去 rustls（ring 的 C build 无法 mac 交叉编译；探测仅本地
  http 无需 TLS）；⑤ **拆 lib**（config/settings/server/lifecycle 不依赖 tauri，可交叉 check；
  bin 的 tauri 窗口桥交 CI——tauri-build 的 winres 需真 Windows 工具链）；⑥ build.rs 在
  mac→windows 交叉时跳 winres 并补 desktop/dev cfg（用 HOST/TARGET env，非 CARGO_CFG_HOST_*）。
- **可复现**：是——交叉 check 前 windows cfg 全是编译错误；修复后 lib 交叉 0 错误 + mac 0 错误 +
  8 测试过 + 零警告。
- **教训**：多平台 Rust 代码必须**按 target 交叉检查**（`cargo check --target <triple> --lib`），
  平台 cfg 分支单独验证；带 C build 的依赖（ring）会阻断交叉编译，纯逻辑与框架层拆 lib 分离。

---

---

---

---

---

## 竞品调研：Anionex/dsh-vision-toolkit（339★，MIT）vs 我们的 dsh-vision-bridge

- **定位差异**：toolkit=「视觉作为 agent 可调用的能力」——10 个独立 vision_* 工具
  （意图问答/长截图 OCR/grounding 像素坐标/UI 还原/pixel diff/前景提取/crop/trace/HTML 渲染/
  Artifacts），渐进暴露（先 vision_toolkit_activate，按需挂 10 schema）；runtime=固定版本的
  上游 agent-vision-toolkit（Python 3.11+ 隔离环境）+ 远程视觉 API 走 DSH Credentials，
  本地操作免凭据；产出结构化坐标/JSON + Web 可预览 Artifact + Settings 健康页；要求 DSH
  0.1.0-rc.6+。我们=「自动透明」——pre-step 每步把图改写成文字，零配置发图即用，轻量纯
  Node 无 Python。
- **不冲突可共存**：toolkit 是工具驱动（不自动注入图片），不与我们的 pre-step 改写冲突；
  工具名 vision_* vs vision_describe/vision_ocr 不撞名；都装也 OK（toolkit 需 Python 运行时）。
- **可借鉴点（待定）**：①渐进暴露（单个激活工具 + 按需挂载 schema，省上下文）；②结构化
  结果（坐标/JSON）+ Artifacts Web 预览；③Settings 健康页 + Test connection。
- **可复现?** 是（README + 仓库结构可核）。

## dsh-model-selector WebKit 面板切换吞菜单修复（真实 App 症状）

- 用户 App 具体症状=**root 面板能弹出，但点「模型/推理等级」cell 时整个菜单消失**（非缓存问题，
  ⌘R 后仍复现）。根因：切面板时旧 cell 卸载 → focusout（relatedTarget=null）→ 旧 onBlur rAF 查
  activeElement，而真实 WKWebView 的**同帧 programmatic focus 进新面板不可靠**（焦点落到 body）
  → 误判离开菜单 → close()。
- 修复（commit `ea5dc54`）：① onBlur **relatedTarget=null 永不 close**（外部点击关闭交给已有
  document mousedown 监听，Tab 移出有真实 relatedTarget）；② goPane 加 `requestAnimationFrame`
  聚焦兜底（WKWebView 同帧 focus 丢失时下一帧补）。
- 验证：chromium+webkit 双内核全路径（菜单开/点 cell 不关+搜索框现/切不同供应商成功且关闭/
  no-op 保持/外部点击关）。**教训**：Playwright webkit 的 programmatic focus 与真实 WKWebView 有
  差异（修复前 webkit 复现不了点 cell 消失，真实 App 才暴露）——WebKit 路径别只信 Playwright；
  另「切换后菜单不关」可能是点当前模型的正确 no-op，测试要先读当前供应商再选不同目标（见 NOTES.md）。

## 用户固定视觉链为 opencode-go/mimo-v2.5（profile 补丁层 config.vision）

- **背景**：自动发现默认用 opencode-go/minimax-m3（候选第 1），用户嫌贵，想用 mimo-v2.5。
- **做法**：`~/.dsh/profiles/web/cordis.patch.yml`（profile 补丁层，非 bundle）加
  `- id: vision-bridge → config.vision: [{provider: opencode-go, model: mimo-v2.5}]`；
  显式 vision 跳过自动发现（visionPairs 直接返回 cfg.vision）→ 候选链只剩 mimo-v2.5；
  已备份 + yaml 校验通过。
- **注意**：显式链无回退（单 pair 失败即报错→优雅降级为标记）；有两个 mimo-v2.5
  （opencode-go 与 xiaomi），按用户语境锁定 opencode-go。
- **验证**：重启后附图，日志应显 `vision chain candidates: opencode-go/mimo-v2.5` +
  `vision used opencode-go/mimo-v2.5`。
- **可复现?** 是。

## 修正：「谁在看图」= opencode-go/minimax-m3（catalog 运行时数据）

- **之前结论有误**（「唯一候选=0731」）：根因=pi-ai catalog 数据是**运行时加载**的（不在
  catalog.ts 源码里），grep 源码漏掉；用 harness 自带 `catalogModels(provider)` + 与运行时相同
  公式（`entry.input ?? base?.input ?? route.defaultInput ?? ['text']`）解析用户 settings 后：
  图片候选共 12 个，按 provider 顺序前 4 = **opencode-go/minimax-m3、qwen3.7-plus、kimi-k2.6、
  kimi-k2.7-code**（catalog 原生声明多模态）。
- **实际使用的** = 候选链第一个成功者 = **opencode-go/minimax-m3**（真·多模态，OCR 级质量
  由此解释）；0731 在候选链第 12 位（几乎轮不到），其 input 声明只服务准入放行。
- **方法论教训**：判断某能力（如 image）是否可用，别 grep 源码字面量——catalog/数据文件
  运行时加载，必须用框架自带解析（catalogModels/Config）或运行时日志。
- 运行时日志（candidates/vision used，待重启生效）会最终实锤。
- **可复现?** 是（harness tsx 脚本 + settings 即复现候选序）。

## 「谁在看图」钉死：唯一候选=0731，网关内转视觉；新增运行时日志

- **配置级证明**：settings.yaml 全文件仅 1 处 `input:[text,image]`（0731）；无 defaultInput/
  base/mcp；pi-ai catalog 无带图条目；已装 7 插件仅 vision-bridge 有看图能力；harness core
  无内置描述服务 → 发现链候选列表必为 [jiyuanlvdong/deepseek-v4-flash-0731]；转述文字
  「此前由视觉模型读取，内容转述：」是 vision-bridge 独有缓存格式 → 描述必然来自 visionAnswer。
- **语义澄清**：DSH 把带图请求发给「0731 这个名字」（经基元律动网关），网关返回真描述——
  「其他工具」不存在；可能是网关内部把带图请求转给了视觉后端（解释文本模型名也能出 OCR 级描述）。
- **新增运行时日志**（index.js）：发现时 `vision chain candidates: …`、成功时
  `vision used {provider}/{model}`——重启后附图即可在服务日志里亲见；两套测试仍全绿。
- **可复现?** 是（重启+附图看日志）。

## vision-bridge 当前视觉模型 = jiyuanlvdong/deepseek-v4-flash-0731（唯一候选）

- **查证**：llm-pi-ai 全配置（settings.yaml + catalog.ts）只有一处声明图片输入——
  `jiyuanlvdong.models[deepseek-v4-flash-0731].input:[text,image]`（我们补的那行）；无 defaultInput、
  catalog 无带图片能力的模型条目 → 自动发现链**只有一个候选**，visionAnswer 就用它。
- **推论**：基元律动网关实际接受 image_url 并返回描述（用户附图转述质量=真 OCR），说明该网关
  走 OpenAI 兼容转发、上游能处理图片——「准入按声明、转发按网关能力」两回事，实测一致。
- **给用户**：想让视觉走专门的多模态模型（如 opencode-go 的 VL/kimi-k3），显式配
  `config.vision: [{provider, model}]` 固定链（显式对不做 inputModalities 校验，直接 stream）；
  否则视觉与主模型共用 jiyuanlvdong 额度。
- **可复现?** 是（grep input: [text, image] 全配置仅 1 处）。

## mac-desktop Windows 壳 v1 实施交付（Tauri 2，Windows-first）

**交付**：WINDOWS_PORT.md 方案 v1 落地（commit 9f948c4）——mac Swift 壳零改动，新增 `tauri/`
Rust 壳（Windows 交付）。
- **代码**：server.rs（isReachable 200+__DSH_BOOT__ / 90s 轮询 / AtomicU64 代际守卫 / stderr tail；
  **Windows 子进程挂 Job Object KILL_ON_JOB_CLOSE**——整树随句柄关闭被杀，shell 忽略信号无效）；
  lifecycle.rs（PowerShell 按 --parent-pid 查重退出 + GetExitCodeProcess 父进程看护）；窗口桥=
  loading.html 状态机→ready navigate；设置页用 `__TAURI_INTERNALS__.invoke` **免前端构建**；
  menu Reload(Ctrl+R)/浏览器打开/设置。**8 单测全过 + cargo check 零警告**。
- **index.js**：平台分支——win32 spawn `native/build/DeepSeekHarness.exe`（detached+unref），
  darwin 路径逐字节不变（保 mac 回归）；环境变量兼容新旧名。
- **CI**：`.github/workflows/build-windows-shell.yml`——windows-latest 构建 exe 并**提交进仓库**
  （git 安装依赖入库二进制）。
- **待 Windows 真机验证（v1 已知限制）**：① reload 未做清 HTTP 缓存（Tauri clear_all_browsing_data
  粒度未知，round-17 硬约束，暂用 navigate 重载）；② cmd /C 对含空格命令的引号转义；③ PowerShell
  防重延迟 ~200ms。
- **可复现**：cargo test 全绿可复现；Windows exe 需 CI 出产物后真机验证。

---

---

---

## vision-bridge 真实实例全链路验证通过（附图→转述→DeepSeek 推理）

- **验证**：用户在 jiyuanlvdong/deepseek-v4-flash-0731（已补 input 声明）会话里直接附图，
  消息里出现 `[图片「…」此前由视觉模型读取，内容转述：…]` ——准入放行 → pre-step 改写 →
  视觉链自动描述 → 文本模型拿到文字，全链路真实实例跑通；长年悬置的「真实实例 boot 联调」
  缺口就此关闭。
- **顺带结论**：给 pi-ai 模型补 `input:[text,image]` 后，该模型同时进入**视觉自动发现**候选
  （declares image）——实测该实例的视觉链工作正常（真 OCR 级转述）；若某提供方网关拒图，
  auto-describe 会优雅降级为工具标记 + warn，不影响主链路。
- **可复现?** 是（附图即现）。

## 用户实况排障：切到 jiyuanlvdong 仍报「当前模型不支持图片」

- **症状**：vision-bridge 已装（02:05 服务重启后挂载）但给 pi-ai 路由（jiyuanlvdong/deepseek-v4-flash-0731）
  附图仍报错。
- **根因**：报错发生在**挂图那一刻的准入检查**（api-proxy 按当前模型 inputModalities 拒绝），
  图片根本没进会话——pre-step 改写只作用于已进会话的图，救不了准入。pi-ai 路由模型没声明
  `input`（settings 里全量 grep 无 input:）→ 按默认 text-only 拒图。官方 deepseek-official 路由
  因 stealth 适配器声明图片所以不受影响。
- **解法**：settings.yaml 的 `llm-pi-ai.providers.jiyuanlvdong.models[deepseek-v4-flash-0731]` 补
  `input: [text, image]`（声明安全：pre-step 保证图不会真发到上游）；已改 + 备份
  （settings.yaml.bak-visionbridge-*）+ yaml.safe_load 校验通过；改完须重启 dsh（热重载不保证）。
- **坑**：YAML 键缩进要对齐同级键（该 model 的键是 10 空格，插成 8 会 parse error）；
  其余 pi-ai 路由（jiyuanlvdong2/qwen）同名模型同样处理；「先切模型后附图、含图后切回纯文本
  模型需 /compact」的顺序坑依旧适用。
- **可复现?** 是（换任意 pi-ai 无 input 声明模型附图即现）。

## dsh-bilibili-player 与 Tauri 换壳零耦合（影响评估）

- **结论**：dsh-mac-desktop 改 Tauri 跨平台，对 bilibili 插件**零影响**，反而解锁 Windows/Linux。
  Host 路由（/dsh-bili/api、/dsh-bili/video）跑在 dsh Node 进程里，client（面板/弹幕/播放器）跑在
  页面里——壳只是 WebView 容器，与两半都无耦合；client 全用相对路径（`/dsh-bili/api`、
  `/dsh-bili/video?url=`）+ 标准 Web API（fetch/video/localStorage/canvas/rAF），三内核
  （WKWebView/WebView2/WebKitGTK）都支持。
- **壳侧 3 个注意点（与本插件无关，但换壳那轮别踩）**：① Reload 清缓存语义（round-17 教训，
  Tauri 同适用——否则旧 client.js 残留，看起来像插件坏了）；② 分发打包 files 白名单 + native/
  布局要随 Tauri 产物（target/release）同步，否则 git 安装丢二进制；③ 进程生命周期沿用
  ensure/spawn dsh 服务器 + 退出清理（Windows Job Object/Linux 进程组）——bilibili 的 curl
  是 dsh 服务器的孩子，服务器退出即清，无孤儿风险。
- **建议验证**：Tauri webview 必须加载真实 dsh web 页（isReachable：200 + HTML 含 __DSH_BOOT__），
  别用静态快照；同源下 localStorage（观看历史/弹幕设置/画质记忆）延续。
- **可复现**：架构分析（未改码）。

## 桌面壳换 Tauri 对 Web 设置页插件（dsh-plugin-classifier）影响评估

- **结论**：mac-desktop 改 Tauri 对本插件**零功能影响**——壳只包 dsh web URL，不触及 dsh 进程
  （host 半区 /api、/market、/install、find_plugin 全跑在 dsh 进程内）也不改变设置页 DOM；同源
  fetch + CSRF 头在壳内外一致；一键安装走 host ctx.shell 与壳无关。
- **跨平台注意点（壳侧责任）**：① Tauri macOS 仍 WKWebView（行为不变）、Windows WebView2/Chromium、
  Linux WebKitGTK——都比 WKWebView 更接近标准，`navigator.clipboard`（点击手势下）/fetch/CSS 只可能
  更稳；② 必须延续 round-17「清 cache-only + reloadFromOrigin」机制，否则壳内所有插件更新后旧 JS
  缓存不生效。
- **唯一理论接触面**：client 复制安装命令用 `navigator.clipboard.writeText`——仅当 Linux WebKitGTK
  剪贴板权限出问题时才需 fallback（execCommand/Tauri 剪贴板桥），当前无触发点、不做预防性改动。
- **可复现**：否（纯架构评估，无代码改动）。

---
## dsh-vision-bridge 与桌面壳正交性结论（dsh-mac-desktop 改 Tauri 影响评估）

- **结论**：把 dsh-mac-desktop（SwiftUI/WKWebView 壳）改 Tauri 跨平台，对 vision-bridge **无任何
  直接影响**——vision-bridge 是 host-only bundle（`dsh.client:{}`），全部逻辑（agent/pre-step
  waterfall 改写、stealth 适配器、vision_describe/vision_ocr 工具）跑在 dsh **Node host 进程**里，
  与窗口壳用什么框架无关；壳只负责把 dsh web 页面装进 WebView。
- **注意点（壳层，非 vision-bridge）**：① Tauri 用系统 WebView（macOS=WKWebView 与现在一致，
  Windows=WebView2/Chromium）——WebKit 系怪癖（model-selector focusout、round-17 缓存/Reload
  旧 JS）跟随引擎而非框架，Windows 上怪癖反而更少；② 壳做 Reload 必须清缓存从源重载
  （round-17 硬约束），否则改插件后 App 吃旧 bundle（影响所有插件）；③ 壳若自管 dsh server，
  须用同一 DSH_HOME/profile 启动 `dsh web`，插件按实例/配置生效与窗口无关。
- **可复现?** 否（纯架构分析；与 WINDOWS_PORT.md 的 Tauri 2.0 评审互补）。

## Tauri 换壳对 dsh-model-selector 零影响（三内核兼容矩阵）

- 用户问 mac-desktop 改 Tauri 跨平台是否影响 model-selector：**无影响**——该插件是纯 web 端
  bundle+client（Slot 遮蔽 + host RPC 全在 dsh server 进程），壳只是 WebView 容器指向同一 3080。
- 唯一相关点=内核矩阵：macOS WKWebView（WebKit）已修（3db9625 relatedTarget=null）；Windows
  WebView2=Chromium 已验证；Linux WebKitGTK 未实测（标准防御应兼容，发布前用 Playwright webkit
  验一次）。壳侧注意：①Reload 要清缓存（保留 round-17 语义，Windows 用 WebView2 ClearBrowsingData）；
  ②localStorage 不跨壳迁移——本插件不用 localStorage 持久化选择器状态，影响极小（见 NOTES.md）。

## dsh-mac-desktop Windows 兼容移植方案（Tauri 2.0）

**交付**：`dsh-mac-desktop/WINDOWS_PORT.md`——用户要求先出方案（不写代码），范围=plugin+standalone 两模式全做。
- **结论**：现有壳平台逻辑全在 Swift（native/ 773 行）+ index.js（101 行）；用 **Tauri 2.0（Rust）** 一套代码
  双平台（Win=WebView2 预装、mac=WKWebView）；index.js 按平台选二进制；mac Swift 壳保留为回退。
- **模块映射**：AppConfig→config.rs、AppSettings→settings.rs（store 插件）、AppDelegate→lifecycle.rs（sysinfo
  防重 / signal-hook / GetExitCodeProcess）、ServerManager→server.rs（tokio 进程 + AtomicU64 代际守卫）、
  ContentView+WebView→window.rs（本地 loading.html 门控 + on_new_window 开系统浏览器）、SettingsView→settings.html。
- **关键风险（实施前验证）**：① Tauri `clear_all_browsing_data` 粒度未知——若清 localStorage 则违背
  round-17「只清 HTTP 缓存」硬约束，需 WebView2 ClearBrowsingData（Win）/WKWebsiteDataStore（mac）平台分支；
  ② Windows `cmd /C` 执行含空格 npx 命令的转义；③ Job Object vs 进程树清理需真机验证。
- **里程碑**：M0 脚手架 → M1 server.rs 单测 → M2 窗口 → M3 设置页 → M4 index.js 平台分支 → M5 双平台 CI → M6 Windows 真机验证。
- **可复现**：方案本身无需复现；风险项均标注待真机验证。

## dsh-model-selector WebKit 菜单打不开修复（App/WKWebView）

- 用户 App（WKWebView）选不了模型、浏览器（Chromium/Edge）正常，且确认 App 连的就是 3080
  同一健康服务器 → 差异只剩 WebKit 内核。修 `onBlur`：`focusout` 的 `relatedTarget` 为 null
  时（WebKit 程序化聚焦可产生）旧代码直接 `close()`，菜单打开瞬间被吞；改为
  `requestAnimationFrame` 延一帧查 `document.activeElement`，焦点仍在 root 内就不关。
- 验证：Playwright 装 webkit（`node apps/web/node_modules/playwright/cli.js install webkit`，
  harness 根没有 playwright 依赖）驱动 3080 全路径通过（菜单开/搜索/切基元律动2/Max）；
  commit `3db9625`。⚠️ App 里已加载旧 bundle，需 App 内 Reload（mac-desktop 已改清缓存+
  reloadFromOrigin）或重启 App 才吃到新 client.js（见 NOTES.md）。

## 多 agent 检测-修复战役收敛结论（多 agent 第四十轮）

**结论**：战役目标「多轮多 agent 检测-修复直到不能检测出新问题」达到收敛——连续 3 轮
（38/39/40）用**不同检测角度**（数据一致性矩阵、entry 查重、分类器完整性、live 健康、
全量回归）均未检出新缺陷；最后一个真实缺陷（usage-dashboard 消息口径混用，round 33 检出）
已在 round 37 修复并 round 38 live 验证生效。
- **收敛证据**：① 5 测试套件 + 2 守护脚本全绿；② 7 插件 git 安装 + boot 矩阵通过；
  ③ live 3080 全路由健康 + 跨指标一致性通过；④ 工作树零在途、与 origin 同步；
  ⑤ 并行会话近 10 轮无新提交（其 8ef6080 大改早已合入）。
- **方法沉淀**：跨指标口径一致性检查（exact 求和 vs totals）是测试套件全绿时仍能抓用户可见
  矛盾的唯一有效手段（round 33/34 两连中）；建议后续维护沿用。

## usage-dashboard 消息口径标注修复落地（多 agent 第三十七轮）

**交付 → 验证 → 可复现?**
- **交付**：round-33/34 移交的「消息数混用真实/代理」矛盾由本会话落地修复——**纯标签改动零语义
  变更**：KPI 头改「消息数（估算）」+ title「按步数/轮次估算，含未扫描会话」；副行改「真实计数：
  用户 X · 助手 Y（扫描明细）」；摘要句加「约 …（按步数/轮次估算）」。数字不再自相矛盾。
- **决策背景**：移交 4 轮未处理 + 工作树完全干净（无竞态风险）+ 修复不改变任何计算 → 跨插件边界
  安全修复。client 渲染冒烟 + apply 冒烟 + 语法全过。
- **可复现**：修复前 live 可见 KPI 头 5.3k vs 副行 383 矛盾（是）；修复后数字并排但有语义标注（否）。
- **教训**：跨指标口径一致性检查（exact 求和 vs totals）在测试套件全绿时仍能抓用户可见矛盾——
  该检查应进 usage-dashboard 的冒烟（断言 exactMessages 与 sub 计数口径标注一致）。

## usage-dashboard 消息口径失效模式补全（多 agent 第三十四轮，继续移交）

**问题 → 原因 → 解法 → 可复现?**
- **补全**：round-33 的「摘要 vs KPI 矛盾」只是**失效模式 B**（缓存覆盖不全时）。committed main 上
  `exactMessages`（index.js:329）在缓存完整时为 steps+turns **代理**、否则回退扫描真实计数——由此
  同一「消息数」在 UI 各处混用真实/代理两种口径，**两种失效模式**：
  - A（缓存完整，现 live 状态）：KPI 头 5,299（代理）vs KPI 副行「用户 97 · 助手 286（扫描明细）」
    =383——KPI 卡内自相矛盾（5,299 ≠ 383，13.8× 虚高）。
  - B（缓存不全）：KPI=扫描真实（383）vs 摘要/趋势=代理（5,237）——round-33 报告过的同页矛盾。
- **根因**：`steps+turns ≈ 消息` 的代理（零 I/O 设计，index.js:144）被直接呈现为「条消息」，无标注、
  且与任何一处真实计数并排显示即露馅。
- **解法（移交 usage-dashboard 会话）**：统一口径——要么摘要/KPI 全部用代理并明确标注「按步数/轮次
  估算」（副行也改代理口径），要么摘要/趋势用真实消息数（贵，需逐日事件）；至少让 KPI 头与副行同源。
- **可复现**：是（live 3080 现可见 A；缓存失效重算即见 B）。
- **验证**：exactDayTokens sum==outputTokens ✓（token 侧完整一致）；modelTotals 求和 47 万 <
  outputTokens 499 万为**设计**（模型占比仅扫描子集，环图已标注「N 会话」）。

## usage-dashboard 消息数同页矛盾（多 agent 第三十三轮，检测移交）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：同一页两个互相矛盾的"消息"总数——摘要句（client.js:589）"完成了 X 条消息"用
  `exactDayMsgs` 求和（本轮实测 **5,237** = steps 4,981 + turns 256），KPI 卡（client.js:723）
  "消息数（全量，含未扫描会话）"用 `exactMessages`（**383**，真实消息数）——**13.7× 虚高**。
- **原因**：host index.js:144 注释 `steps + turns ≈ assistant + user messages (exact proxy)`——
  按天消息数有意用 steps+turns 代理（投影缓存零 I/O），但摘要句把它当"条消息"呈现且无任何标注；
  round-24 已把 **Token** 趋势与 KPI 对齐（exactDayTotal），**消息** 漏了同类处理。
- **解法（移交 usage-dashboard 会话）**：摘要句改用 `totalMessages`（= exactMessages 可用时）；
  趋势图消息系列保留代理但标注"按步数/轮次估算"。→ 可复现：是（live 3080 实例任意时间可见）。
- **验证**：exactDayTokens 求和 == outputTokens ✓（token 侧已一致）；仅消息侧矛盾。

## bilibili 登录 QR 弹窗冒烟（多 agent 第二十六轮）

**交付 → 验证 → 可复现?**
- **交付**：冒烟加场景 G——点登录 → 弹窗 → 获取登录二维码 → getQr（loginQr fetch + 本地 canvas QR
  + 轮询 effect）→ 断言 QR 分支渲染 <img> 并切到「刷新二维码」。20 断言全过。
- **stub 两坑**：① **别把 setTimeout 桩成同步执行**——QR 轮询 setInterval 会同步死循环（超时）；
  ② 泄漏的 interval 挂着事件循环——冒烟结尾显式 `process.exit`。
- **环境限制**：stub 环境里内嵌 QR 库的渲染在 getContext 前抛错（被 renderQrDataUrl 内部 catch
  吞掉返回 ''）——canvas 像素渲染本身已在 round 2 node 级 + round 15 live 浏览器验证；冒烟断言
  改为流程级（QR 分支 img 存在 + 状态切换）。→ 可复现：是（stub 环境复现）。

## bilibili 原生播放器路径冒烟（多 agent 第二十五轮）

**交付 → 验证 → 可复现?**
- **交付**：冒烟加场景 F——playurl 成功 → 原生播放器视图：画质条（'画质' + 质量 tab）+ video
  元素（videoRef 赋值）+ 弹幕工具栏。15 断言全过（原 13 + F 的 2）。
- **契约确认**：host 端把 B 站 `accept_quality`（snake）规范化为 `acceptQuality`（camel）
  （index.js:575），client 读 camelCase 正确；**mock 必须镜像 host 的规范化形状**（第一版 mock 用了
  snake_case → 画质条不渲染，是 mock 错不是 client bug）。→ 可复现：是（mock 用 snake 即复现）。
- **覆盖**：bilibili client 现在 main 渲染路径全部有可执行验证——加载/apply/FAB/面板/列表/失败
  横幅/播放器回退/原生播放器。

## bilibili client 播放器视图冒烟扩展（多 agent 第二十三轮）

**交付 → 验证 → 可复现?**
- **交付**：client 渲染冒烟加场景 E——点 popular 卡片 → openVideo（videoInfo 合并、历史写入、
  stream 拉取）→ 断言播放器视图渲染：视频标题、UP主信息、取流失败回退提示（'已回退官方播放器'）、
  返回列表条。13 断言全过（原 8 + E 的 5）。
- **stub 补充**：renderNode 支持 **ref 赋值**（videoRef 挂到元素对象，否则播放器 effect 拿 null）；
  video 元素桩（currentTime/play/pause/duration）。→ 可复现：是（去掉 ref 支持 E 即崩）。
- **渲染事实**：playurl 失败（404）时播放器视图走**官方播放器回退**（iframe + 提示条），画质条
  （qualityBar）只在取流成功时出现——断言要用回退标记而非画质条。

## 一键/批量安装脚本：dsh 不在 PATH 时 spawn 会 ENOENT（scripts/install-plugins.mjs）

- **问题**：写 `scripts/install-plugins.mjs`（一键装全部 / `--only`/`--skip` 筛选 / 交互多选 /
  `--from github`），dry-run 全对，但真实执行 `spawnSync('dsh', ...)` 报 `ENOENT`——本机 dsh
  不是全局命令，是从 deepseek-harness checkout 用 `pnpm dsh` 跑的。
- **原因**：脚本默认 `dsh` 在 PATH；从源码运行的 dsh 没有全局二进制。
- **解法**：加 `--dsh "<cmd>"` 参数（按空格拆成命令前缀数组，默认 `['dsh']`），本机用法
  `--dsh "pnpm --dir /Users/fangshoufanji/workspace/deepseek-harness dsh"`；`spawnSync` 失败时
  打印「找不到命令」+ 提示 `--dsh` 用法。真实安装验证通过（pnpm 报 Already up to date）。
  交互多选用 readline `setRawMode(true)` + 方向键/空格/回车，`\x1b[2J\x1b[H` 重绘。
- **可复现**：是（任何 PATH 无 dsh 的机器都会 ENOENT）。
- **附带**：`node --check` 对 `.mjs` 顶层 await 报 SyntaxError，脚本改成 IIFE 包裹 async main 即可。

---

## dsh-mac-desktop WKWebView Reload 清缓存（多 agent 第十七轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：并行会话移交——桌面 App 里插件更新后仍显示旧 JS（"浏览器好、桌面 App 不行"）。
  → **原因**：WKWebView 壳的 Reload（Cmd+R / 工具栏）走 `webView?.reload()`——按 HTTP 缓存
  重新验证，更新后的 client.js 可能仍从缓存出。→ **解法**：Reload 时先清**仅缓存类**
  （disk+memory，`WKWebsiteDataTypeDiskCache/MemoryCache`）再 `reloadFromOrigin()`；**不清
  localStorage**（bilibili 设置/历史/画质偏好都在里面）。初始加载保持
  `reloadRevalidatingCacheData`。→ **可复现**：是（改 client.js 后桌面 Reload 仍旧内容；修复后
  从源重载）。
- **教训**：清 WKWebView 缓存**不要用 `removeData(ofTypes: allWebsiteDataTypes)`**——那会连
  localStorage 一起清掉（插件持久化状态全丢）；只清 cache 类型。已重建二进制 + spawn/孤儿回归。

## bilibili client 可执行渲染冒烟（多 agent 第十六轮）

**交付 → 验证 → 可复现?**
- **交付**：`dsh-bilibili-player/tests/client-render.smoke.mjs`——最后一个无可执行测试的客户端半区
  （108KB bundle）补上覆盖。驱动 `__ModuleLoader__` factory（mini React stub），apply shell.overlay
  slot，渲染 BiliApp 4 场景：初始 FAB、打开面板（rail tabs）、mock popular API 出卡片、ranking
  fetch 失败出错误横幅。8 断言全过。
- **stub 踩坑（两条通用）**：① `useState(() => ...)` **函数式初始化器必须求值**，否则状态是函数
  本身（`dmBlock.filter is not a function`）；② `useEffect` **必须跟踪依赖**，否则每次 render 都
  重跑 → async 加载被 seq 守卫反复重启、loading 永远 true（本插件 browseSeq 守卫恰好把这类 bug
  掩盖成"加载中"，mock 单测能暴露）。→ 可复现：是（stub 未实现这两点时测试即崩）。
- **提取边界坑**：`client.js` 尾部内嵌 QR 库有自己的 `})();` 闭合，`lastIndexOf('\n})')` 会切错——
  用 QR 注释做硬边界取 load 调用闭合。

## 根文档维护三坑：安装 URL 语法传播错误 + 并行会话误插 + 索引漏建

- **问题 1**：README.md / 各子插件 README 的 git 安装命令写成 `#<sha>:subdir`（npm 冒号形式），
  但 pnpm（dsh 的包管理器）不认，正确语法是 `#<sha>&path:/subdir`。同类错误在根 README、
  skill-manager（中英）、model-selector（中英）5 处都有——**一个坑会复制粘贴传染**。
- **问题 2**：AGENTS.md「这个仓库是什么」一节顶部混进了 3 条 NOTES.md 风格的索引条目
  （skill-manager 重启验证、vision-bridge 发布、vision-bridge Cordis 验证）——并行会话编辑时
  误插入；且这三条在「踩坑 / 项目经验」索引区**没有对应索引**（索引漏建）。
- **问题 3**：目录结构树缺 `dsh-vision-bridge`（表格有、树没有），清单不一致。
- **解法**：① 全仓库 `grep -rn "deepseek-plugins#" --include="*.md" . | grep -v "&path:"` 扫
  冒号语法批量改 `&path:/`；② 编辑 AGENTS.md 时先 `grep -n "^## "` 看结构、改完再 `sed` 验证
  没吞标题；误插内容挪回索引区（按 NOTES.md 实际章节名建索引）；③ 目录树与表格、README 三处
  清单保持一致，新增子项目三处一起补。
- **可复现**：是（任何新增子项目时只改表格不改树/README 就会不一致）。

---

## dsh-model-selector「浏览器好、桌面 App 不行」：WKWebView 壳缓存侧

- 用户浏览器（3080）一切正常、桌面 App 不行 → 定位到 dsh-mac-desktop 的 WKWebView 壳；
  已核实 App 源码：Reload 菜单（Cmd+R）和工具栏刷新按钮都走 `webView?.reload()`（**不清缓存**），
  只有初始加载才用 `reloadRevalidatingCacheData`；改设置才触发 `server.restart`（ContentView:35-37）。
  App 端旧页面/旧 boot manifest 会一直被 WKWebView 端着 → 建议 mac-desktop 会话把 reload 改
  `reloadFromOrigin()` 或加「清 WKWebsiteDataStore 缓存」入口（移交，未改代码）。
- 经验：用户说「浏览器好、app 不行」时直接查壳的 reload 实现，普通 `webView?.reload()` 在
  WKWebView 里可能复用缓存（见 NOTES.md）。

## live 实例健康度核查（多 agent 第十五轮）

**核查 → 结论 → 可复现?**
- **核查**：3080 live 实例（运行 20 分钟）逐插件探活——bilibili `/dsh-bili/api?m=popular` 200 真实
  数据、usage `/dsh-usage/api` 200（25 字段时代）、classifier `/dsh-plugin-classifier/api` 200 真实
  loader 数据、vision-bridge 加载无崩溃（服务器存活 = 已含 round-13 inject 修复代码）、skill-manager/
  classifier client.js 200、vision-bridge client.js 404（host-only 预期）。→ **结论**：live 实例健康
  且为最新代码，无需重启。→ 可复现：是（curl 各路由即见）。
- **坑**：先用**旧路径** `/dsh-pc/api` 探活 classifier → 200 HTML（SPA fallback）误判为"路由未挂载"；
  实际是并行会话工作树把路由改成了 `/dsh-plugin-classifier/api`（在途重构，未提交）。→ 教训：
  **live 探活必须先查当前代码里的实际路由路径**（grep webServer.on/path），别凭记忆用旧路径，
  SPA fallback 200-HTML 是"路径不存在"的标准信号。

## inject 完整性守护脚本（多 agent 第十四轮）

**交付 → 验证 → 可复现?**
- **交付**：`scripts/check-inject-consistency.mjs`——把 round 13 的 vision-bridge 教训固化为
  守护：模块 export inject + patch insert inject（内联 `[a,b]` 与多行 bullet 两种形式）并集 vs
  index.js 中 `ctx.<svc>` **硬访问**（剥 /* */ 与 // 注释、排除 ctx.get 可选读取与 on/effect/
  logger 内建）。正向：7/7 OK exit 0；负向：复造 vision-bridge（inject 缺 tools + 硬访问）exit 1；
  ctx.get('shell') 不误报。→ 可复现：是（构造破坏对即失败）。
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
- **网络备注**：本轮末代理 127.0.0.1:7890 宕掉（git 全局配置指向它），直连 github 超时——
  b9d9465/12963ff 已本地提交待推送；git 安装验证也因网络失败（非包缺陷，早前轮次同流程成功）。
- **现状**：HEAD 已一致（package dashboard + patch dashboard）；本地路径安装验证通过
  （node_modules/dsh-usage-dashboard）；vision-bridge 已被并行会话提交（7bdae5c）。

## dsh-skill-manager 真实实例重启验证（三轮修复后）

- 重启后 curl 3080 实例：client.js 含新代码特征（`x-dsh-skill-manager` 守卫头/`__saving__`/
  `invalid API response`）；mkt-list 三个市场均带 id 且 0.0008s 缓存命中（10min TTL 生效）。
- **CSRF 守卫生产实测**：不带守卫头 `?m=toggle&…` → 403 `missing x-dsh-skill-manager guard header`
  （守卫在 method 分发前拦截、未执行任何文件操作）；带守卫头只读 list → 200 真实技能列表；
  带守卫头 remove 不存在技能 → 500 `does not exist under a managed root`（正确业务错误）。
- **经验**：守卫"req.headers 存在才校验"的 fake-ctx 兼容设计在生产正确（真实 HTTP 恒有 headers）；
  验证生产实例用「不存在的技能名 + 变更 method」可无副作用确认守卫与业务错误分层。
- **可复现**：是。

---

## dsh-vision-bridge 安装到 web profile + 发布到 GitHub（commit 7bdae5c）

- **手动 link 安装**（无 dsh CLI 环境）：照抄现有插件的接线——`~/.dsh/profiles/web/package.json`
  的 `dsh.profile.bundles` 加 `"dsh-vision-bridge"` + `dependencies` 加
  `"dsh-vision-bridge": "link:/Users/fangshoufanji/workspace/deepseek-plugins/dsh-vision-bridge"`；
  `node_modules/dsh-vision-bridge` 软链到工作区（其余插件同款软链形态）；
  冒烟验证：从 profile 目录 `import('dsh-vision-bridge')` 成功（name/inject/apply 齐全）。
- **GitHub 发布**：commit `7bdae5c`（9 文件 1713 行）→ `origin main`（bitterSmilezzz/deepseek-plugins）
  走 127.0.0.1:7890 代理推送成功，远端 `refs/heads/main` 确认。只提交 `dsh-vision-bridge/` + 根
  README.md（含 usage-dashboard 更名行）；**未提交 NOTES/AGENTS**（并行 agent 在途改动，避免扫入
  无关变更，日志本地上库）。
- **根 .gitignore 已含 `node_modules/`** → 插件测试软链不入库（check-ignore 验证）。
- **待用户**：重启 `dsh web` 让 bundle patch（禁用 llm-deepseek 行 + 挂 vision-bridge + 放宽附件）
  生效；装完自查：设置插件列表出现 dsh-vision-bridge、官方 DeepSeek 选择器外观不变（stealth）。
- **可复现?** 是（profile 文件 + 软链 + 冒烟命令均可复跑）。

## 全插件 git 分发矩阵（多 agent 第七轮）

**检测 → 结论 → 处置 → 可复现?**
- **矩阵**：从已推送 `#main&path:/...` 全新安装 7 插件——6 个干净（mac-desktop/bilibili/
  model-selector/skill-manager/classifier 文件齐全；boot 冒烟：服务器 200、三 client.js 200、
  classifier API 200、宿主日志零错误）。
- **发现 1（真实分发缺陷，属并行会话在途改名）**：`dsh-usage-dashboard` 从 main 安装后落在
  `node_modules/dsh-usage-stats`（旧名）——**已推送 main 的 package.json 还是 `dsh-usage-stats`**，
  工作树的改名（dir+README+package.json）未提交。外部用户按 `path:/dsh-usage-dashboard` 安装会
  得到空目录+旧包名。→ 处置：不替并行会话提交在途文件（避免竞态），本记录显式标记；待其
  提交 rename 后 main 即恢复。→ 可复现：是（git 全新安装该插件即复现）。
- **发现 2（预期状态）**：`dsh-vision-bridge` 未入库（untracked），`path:/dsh-vision-bridge` 在
  main 上不存在 → 安装 [ELIFECYCLE]。属并行会话开发中，提交后可装。
- **教训**：插件改名（目录+包名）必须**同 commit 提交**，否则分发链断裂（git 安装按 package.json
  name 落盘、bundles 列表取 name）；跨会话共享仓库时，改名类改动应尽早入库。

## dsh-mac-desktop ensure/restart 并发竞态（多 agent 第六轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：round 5 的 `restart()` 停掉旧进程并重跑 ensure，但**已在跑**的旧 ensure 循环仍会
  轮询旧 URL，最长 90 秒内反复覆盖新 ensure 的状态（甚至可能为旧 URL 再 spawn）。
  → **解法**：generation 代数令牌——restart 时 ++，ensure 捕获 gen 并在每次 await 后校验，
  不匹配则放弃写状态直接 return。→ **可复现**：是（改 baseURL 的瞬间若旧 ensure 正在轮询，
  状态会被旧 URL 的 reachable 结果覆盖）。
- **安全面扫描**：bilibili client 无 `innerHTML`/`eval`/`new Function`（React 文本节点 +
  textContent，无 XSS 面）；localStorage 只存画质档位数字（JSON 包裹）。根 README 插件清单与
  实际 7 个目录一致。
- **环境备注**：AGENTS.md 与并行会话并发重写会丢失多行条目续行——改用单行自包含条目规避；
  NOTES.md 完整记录为准。

## dsh-mac-desktop baseURL 变更不重跑 ensure（多 agent 第五轮）+ 分发链路验证

**问题 → 原因 → 解法 → 可复现?**
- **问题**：standalone 在 Settings 改 baseURL 后，WebView 会重载到新 URL（updateNSView 的 url
  比较机制），但 **server.ensure 不会重跑**（ContentView 的 `.task` 只跑一次）——新 URL 没在跑
  且 autoLaunch 开启时，服务器永远不会被拉起，手动重试只重载 WebView，必须重启 app 才能连上。
  → **解法**：ServerManager 加 `restart(url:settings:)`（stopSpawned 停掉旧 URL spawn 的服务器 +
  state 复位 + 重跑 ensure），ContentView `.onChange(of: settings.baseURL)`（standalone 才生效）
  触发。→ **可复现**：是（改 baseURL 到未运行端口 + autoLaunch，观察不会 spawn）。
- **次要**：`DSH_MAC_DESKTOP_MANAGED` 环境变量残留时插件静默跳过开窗（无任何提示）——加
  console.log 诊断。
- **审查过程**：第 5 轮只读 subagent 再次挂起（共享工作区并发修改，与 NOTES 既往记录一致），
  改自查——重点排查了 plugin/standalone 互操作、Settings→WebView 传播（确认 SettingsView 直接
  bind 共享 AppSettings、updateNSView 比较 url 生效）、窗口去重边界（argv 短、不同 parent-pid
  互不干扰）、killTree ps 快照性能（数百进程时 ~百 ms 级，可接受）。
- **分发链路验证**：从已推送 monorepo URL 全新安装两个插件——二进制 SHA-256 与仓库一致、
  bilibili 打包内 client.js 含本地 QR 库零第三方引用；boot 分布式产物窗口正常拉起、孤儿守卫正常。

## dsh-mac-desktop isReachable 标记检测 + 双插件回归验证（多 agent 第三轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：standalone `isReachable` 接受任意 HTTP 响应（status<600 即 ready）——3080 被无关
  服务（路由器管理页/别的 dev server）占用时会连错对象；插件模式端口冲突虽有 warn，standalone
  无诊断。→ **解法**：要求 **200 + 根 HTML 含 `__DSH_BOOT__` 标记**（dsh SPA 特有，随机 HTTP
  服务不会有）。→ **可复现**：是（python http.server 占端口 → 修复前误连、修复后正确 spawn；
  真实 dsh → 修复后就绪不重复 spawn）。
- **回归验证**：4 套既有测试全过（vision-bridge apply+cordis-boot、usage-dashboard
  apply-smoke+client-render）；bilibili 集成冒烟 6 项全绿（loginQr/popular/search/SSRF 403/404
  兜底/client.js 服务，宿主日志无报错）；mac-desktop **插件模式端到端**（临时 profile 起实例 →
  窗口经 LaunchServices 带 `--url --parent-pid` 拉起 → 杀 dsh 窗口自行退出）。
- **评估接受**：bilibili 弹幕 retire setTimeout/rAF 未跟踪清理——回调只作用于已脱离 DOM 的
  span，无 DOM/内存滞留，两轮评估均为无害级，保持现状。
- **教训**：给 Swift app 加"是否连对服务"类判断，用**响应内容特征标记**（SPA 特有常量）比
  裸状态码可靠得多；验证 isReachable 的两种方向都要测（错误服务被拒 + 正确服务就绪）。

## dsh-model-selector 多 agent 检测-修复第三轮（最终回归 + 真机环境发现）

- **第 3 审查 subagent（最终回归）**：A1 最小方案剥离干净（全项目无 menu/menuitem/aria-checked 残留）、
  N1/N2 边界全对、E4 封顶完整、locales 21 键对齐；新发现 3 处全部修复——**三-1（疑似回归）**：
  busy 置灰刚点击的按钮 → Chromium/Firefox 触发 blur（focusout→body）→ `onBlur` 提前 close，
  第一轮的 select 失败错误条在这两个内核上失效（Safari 不抢焦点故正常）→ 加一行
  `if (busy) return` 守卫（成功路径仍由 close(true) 收尾）；**三-2**：搜索无结果 + 模型总数为 0
  时 noMatch 与 empty.models 双空态堆叠 → empty.models 加 `hits === null` 条件；**三-3**：
  `.dms-selected` 是死类（styles 无规则）→ 补 interactive-bg-hover 高亮。
- **真机环境发现（非插件 bug）**：Playwright 探测 live 实例 → 整个 Web UI「Failed to load plugins」
  `entry 0f42c4f2 (dsh-usage-stats)` client.js 404；探测 `/plugins/{usage-stats,usage-dashboard}/client.js`
  双 404、model-selector 200 → **运行中 server 的 boot manifest 是旧的**（启动时 profile 还叫
  usage-stats，改名后旧条目 404、新条目未注册）；profile 配置本身已正确（bundles+deps+软链都是
  usage-dashboard）→ **只需重启 `dsh web`**（不能代劳：本会话就跑在该实例上）。
- **可复现**：三-1 是（Chromium/Firefox 真机）；环境问题是（重启后消失）。教训：disabled 聚焦元素
  会触发 blur 提前关菜单，busy 期间必须拦 onBlur（见 NOTES.md）。

## dsh-plugin-classifier 真实实例 boot 联调验证（用户重启 dsh web 后）

- **双半区装载确认（真实 3080 实例）**：`GET /dsh-plugin-classifier/api` 返回真实 loader 数据
  （@deepseek-ai/cordis-plugin-hmr / dsh-agent 等内置 + 状态）；`GET /plugins/dsh-plugin-classifier/client.js`
  → 200（32KB，client 模块被 manifest 收录）；profile `dsh.profile.bundles` 含本包 + node_modules 软链在位。
- **守卫在真实 HTTP 层生效**：`/install` 无 `x-dsh-plugin-classifier` 头 → **403**（CSRF 守卫）；
  带头但 spec 含 `..` → **400**（`..` 段拒绝）；`/market` → 200 + 真实 zh 目录（fetchedAt/lang/source/
  categories 齐全，10min 缓存逻辑工作）。
- **结论**：host/client 双半区在真实实例全部装载生效，无需额外代码改动；剩余待人工确认的仅是
  UI 侧目测（设置 → 插件 → 插件列表/插件市场两个 tab 是否按预期显示与交互）。
- **可复现**：是（curl 三连，见上）。

---
## dsh-plugin-classifier client 边界深挖审查（第三轮产物）+ 第四轮收尾验证

- **client 边界 agent（5 段 59 断言全绿）**：shortName 对真实 loader 模块名映射（scoped/cordis:/子路径/
  版本号/空/dsh-client-* 变体）经真实组件驱动 + CATALOG 覆盖交叉核对——未收录内置插件按设计回退显示
  shortName（合理降级，非缺陷）；/api 数据边界（fiberPhase 缺失/数字漂移/enabled 非布尔/重复 entryId/
  双组同名/total 漂移）；MarketTab 空格与 1000 字符搜索、安装中切 tab、500 {error}/{error,hint}、
  复制互斥、搜索后 chip 计数、空/非数组 categories；ClassifiedTab「web 服务器」搜索、filter=all 计数
  与卡片数一致、展开+筛选切换、内置/自定义单侧为空；React hooks 前置、setForce 无死循环、卸载后 timer
  不抛。全部通过（该 agent 跨两轮未返回，工作产物 test-classifier-6.mjs 提取后全绿，已中断）。
- **第四轮收尾自查**：idf 边界查询（`web ui`→webui 插件、`上下文 记忆`→记忆插件、`番茄钟`→pomodoro、
  空 query 正确拒绝）均良好；7 套 mock 测试 220 断言全过；`node --check` 双半区通过。
- **可复现**：是（/tmp/test-classifier-6.mjs 边界 59 项、-7.mjs 回归 6 项）。

---
## dsh-plugin-classifier 多 agent 检测-修复第三轮（回归 + idf 搜索质量 + client 边界）

- **host agent R1/R2/N2/N3 修复（均实测驱动）**：① **搜索 idf 加权**——`web 服务器` 类「常见英文词+
  稀有中文词」查询 top3 全无关（`web` 子串霸榜、等分按 README 序）→ 三档词频权重（df≤8% →3、≤35% →2、
  其余 1），实测 `web 服务器` top2 变为真正的「MCP 服务器」插件；② **classify `fiber:null` 仍 500**
  （`=== undefined` 漏掉 null，与官方 plugin-inventory 逐字相同）→ 改 `== null`，实测 200 + fiberPhase null；
  ③ spec 三点段 `a/...` 被放行 → `seg.includes('..')` 收紧；④ install 失败仍带「安装后需重启」note →
  note 仅成功时携带。
- **交互 agent 2 Risk + 4 Nit 修复**：R1 **安装失败误导反馈**——host 失败返回 `{ok:false, output, note}`
  无 error 字段、client 不查 `r.ok`/`d.ok` → 面板按成功渲染 → host 补 `error` 字段 + client onInstall
  双保险（`!r.ok || d.ok === false` → 显示「错误：」并丢弃成功 note）；R2 **categories 非数组/`[null]`
  元素崩 tab**——setView 加 `Array.isArray` + flatten/chip 双循环防 null（stub 实测抓到 chip `.map` 的
  残留崩溃并修复）；N1 chip 计数改按有效插件数（perCategory）；N3 zh 只 parse 一次。
- **自查**：classify `entry.options` 缺失防御；`web 服务器` 等 8 个查询真实数据搜索质量抽查（top3 相关性
  良好）；shortName 对真实 loader 模块名映射无不可读缺口。
- **验证**：6 套 mock 测试 161 断言全过（新增 test-7：R1 失败标记/R2 畸形 categories/N1 chip 计数）；
  `node --check` 双半区通过。
- **可复现**：是（/tmp/test-classifier-7.mjs 等）。

---
## dsh-plugin-classifier host 第三轮检测（回归+搜索质量+classify 健壮性）

**问题 → 原因 → 解法 → 可复现?**
- **搜索质量：`web 服务器` 类「常见英文词+稀有中文词」查询 top3 全无关**——41 命中全 score=1
  （只中一个词），等分按 README 插入序排列，`web` 子串（14 个 spec 含 web）淹没真正的
  `服务器` 命中（dsh-hud/dsh-cowork 的「MCP 服务器」也 1 分但排更后）。→ 解法建议：按词
  稀有度加权（idf，`服务器` 只 2 个文档应比 `web` 权重大）或等分时按「命中词更长优先」排序。
  → 可复现：是（真实 301 数据跑 `find_plugin("web 服务器")`，5 条结果全是 web-only 匹配）。
- **classify 残留边界 `entry.fiber === null` → /api 500（合法 JSON）**——代码用
  `fiber === undefined ? null : FIBER_PHASE[fiber.state]`，与官方 plugin-inventory 逐字相同；
  真实 Cordis entry 的 fiber 只会是 undefined 或 Fiber 对象，null 仅理论上可达。→ 建议顺手
  改 `== null`（零成本防御）。→ 可复现：是（mock `fiber: null` 单条目，error 字符串为
  `Cannot read properties of null (reading 'state')`）。
- **spec `a/...`（三点段）被放行 → 200 并执行 `dsh plugin add github:a/...`**——GitHub 仓库名
  不允许连续点，安装必然失败，但无注入（spec 字符集受限 + shq 全程引用，实测命令无任何
  shell 元字符）。→ 建议 `hasDotSegment` 用 `seg.includes('..')`（GitHub 本就禁 `..`）。→ 可复现：是。
- **审查中文件被并发修改（23:27→23:35）**：classify 加 `entry.options || {}`（options undefined
  不再 500，改为跳过）、marketList 改单次 parse（原「先校验再解析」的双 parse 已消除，D3 实测
  zh 空 → 恰好一次 en fetch）、install 响应补 `error` 字段（失败时 ok:false+error，但 `note`
  仍提示「安装后需重启」——失败时文案误导，Nit）。→ 教训：审查长文件前先记 mtime，中途
  发现变化必须重跑全部套件（三套 host 回归 + 本轮 6 组单测重跑全绿）。
- **TTL 边界确认**：`Date.now() - at < TTL` 在恰好 TTL 毫秒处过期刷新（缓存有效期为
  [0, TTL)），语义正确无 Bug；与 vision-bridge 的 `>` 教训（TTL=0 同毫秒仍命中）相反。
- **搜索其它结论**：`token 用量`(21 命中 3/3 相关)、`侧边栏文件浏览器`(bigram 43 命中 top1
  精确)、`UI 增强`(94 命中全为该分类，分类名查询生效)、`桌面宠物`(6 命中 3/3)、`主题美化`
  (4 命中 3/3) 全好；`bilibili 播放器` 市场内无 bilibili 播放器（仅媒体播放/下载类，2 命中
  属最佳可得）；`模型选择器` 仅 1 命中（dsh-reasoning-slider，含精确短语，相关）。

## B 站扫码登录二维码本地化（多 agent 第二轮）+ 分发链路复核

**问题 → 原因 → 解法 → 可复现?**
- **问题**：扫码登录弹窗把 3 分钟有效的 `passport.bilibili.com` 登录 URL 交给第三方
  `api.qrserver.com` 出图——隐私泄漏（第三方能得知该 IP 正在登录 B 站）+ 大陆常不可达
  （扫码登录直接不可用）。→ **解法**：内嵌 qrcode-generator（MIT，Kazuhiko Arase）到
  client.js，canvas 本地渲染 PNG data URL，URL 不出本机、出图零网络；README 同步。
  → **可复现**：是（旧代码 grep `qrserver.com/v1` 即见）。
- **内嵌技巧**：qrcode.js 是「`var qrcode = function(){...}();` + 尾部 UMD」结构（含两处
  `}();`），按行号手术很脆；**整文件包进 `var _qrcode = (function(){ var define, exports,
  module; <原文件> return qrcode; })();`**——遮蔽 CommonJS 全局让 UMD 分支全 no-op，
  `return qrcode` 拿到工厂结果，零结构改动、幂等可重跑。→ 可复现：是（node --check + 生成
  41 模块有效矩阵验证）。
- **验证**：临时 profile 起实例——`/plugins/dsh-bilibili-player/client.js` 含 `_qrcode`+
  `renderQrDataUrl` 且 0 个 `qrserver.com/v1`；`/dsh-bili/api?m=loginQr` 返回真实 B 站 URL
  （渲染路径由库的正确性 + 标准 canvas API 保证）。
- **遗留**：mac-desktop standalone `isReachable` 仍接受任意 HTTP 响应（无法可靠区分外部
  服务与 dsh），插件模式端口冲突已有 warn 诊断——列为已知低危。

---

## dsh-plugin-classifier client 回归+交互审查第二轮

- **方法**：扩展迷你 React stub（per-function state + **useEffect 依赖追踪** + 受控 fetch/clipboard/
  定时器 mock + `render()` 循环 flush 微任务），直接驱动 client.js 的 ClassifiedTab/MarketTab 真实组件
  代码做回归 + 交互；host 契约用 apply() 级 mock 实测 /api、/market、/install 三路由 + CSRF + force。
  5 套 test-classifier-*.mjs（含新增 /tmp/test-classifier-5.mjs，60 断言）全绿。
- **回归确认（8 项修复全部正确无回归）**：① 复制成功「已复制 ✓」/失败「复制失败」均 1.5s 复位，
  同 spec 连点产生的两个 timer 由函数式更新守卫（`(c)=>c===p.spec?null:c`）兜底、互不清新状态；
  ② 安装期间所有安装按钮 disabled + onInstall 前置守卫拦截二次点击（无第二发 /install 请求）；
  ③ refresh 恰好发一发 `?force=1`，effect 内 `setForce(false)` 因 deps=[request] 不重跑 → 无多余
  请求、无死循环（仅多一次渲染）；④ 市场防御 categories 空/c.plugins 缺/p.spec 缺/profile 缺全部
  优雅降级不崩；⑤ 分类 chip/搜索（spec/desc/分类名）/内置自定义筛选/「Web 服务器」中文 catalog 命中
  全部正确；⑥ 两组件 hooks 均在条件 return 前。**结论：无 Bug 级问题，可发布。**
- **Risk（2 项）**：
  - **R1 安装失败无失败标记、且显示成功向 note（误导反馈）** —— `client.js:395-397`（`.then(r=>r.json())`
    不查 `r.ok`）、`client.js:437`（isResult）、`client.js:466-468`（显示分支只认 `result.error`）；
    host `index.js:408-415` exitCode≠0 返回 500 `{ok:false, output, note}` 无 error 字段 → 面板显示
    `output + note`，无「错误：」前缀，且「安装后需重启 dsh web 才会装载该 bundle。」照常显示。
    复现：mock /install 返回 `{ok:false, output:'ERR! code E404', note:'安装后需重启…'}`（HTTP 500）。
    建议：`.then` 检查 `r.ok`/`d.ok`，失败时前缀「错误：」并替换 note、`role` 改 `alert`。
  - **R2 `data.categories` 为 truthy 非数组时市场 tab 崩溃** —— `client.js:421`（`view.categories.map`）
    防御仅到 `client.js:351` 的 `|| []`（只挡 null/undefined）；`client.js:374-375` 对 `[null]` 元素
    `c.plugins` 抛 TypeError。复现：`/market` 返回 `{categories:'x'}` 或 `{categories:[null]}`。
    建议：`const cats = Array.isArray(data.categories)?data.categories:[]`，flatten 循环判 `c&&typeof c==='object'`。
- **Nit（4 项）**：
  - **N1** `client.js:402 vs 427`：顶部 note 计数用 flattened 有效数、chip 用原始 `c.plugins.length`，
    混入无效 spec 行时两处数字不一致；建议 chip 也按有效数计。
  - **N2** `index.js:162`：`marketplace payload unparseable` 等英文内部错误经 `client.js:368` 原样透出 UI。
  - **N3** `index.js:156+161`：zh 解析执行两次（`parseMarket(md)` 守卫 + 正式解析），可缓存一次结果。
  - **N4** `client.js:313-314 vs 320-321`：搜索生效时筛选 chip 显示未过滤总数、组标题显示过滤后数，计数不一致。
- **教训**：成功/失败显示应键控 `d.ok`/`r.ok` 而非 error 字段有无；stub 必须带 useEffect 依赖追踪
  才能验证 setForce 类模式不循环；审查期间 index.js 被并发 agent 从 394→424 行更新（marketInflight
  去重、parseQuery `+` 解码、`..` 段拒绝、CJK 搜索），已按最终版复核并纳入测试。


---

---

---

## dsh-vision-bridge 第六轮收尾：cacheTtlMs 死配置修复 + 全量回归（64+15 断言全绿）

- **问题**：`DEFAULTS.cacheTtlMs`（"描述缓存 TTL"）声明并被 README 提及，但实现从未使用——
  缓存条目只按数量淘汰、不按时间过期（死配置）。
- **解法**：补 `imageMemoryAt` Map（attachmentId→写入时间戳），`cached()` 命中时检查
  `now - at >= cacheTtlMs` 过期即视为未缓存（重描述）；淘汰时两表同步删。边界教训：**TTL 判断
  要用 `>=`**——`>` 会让 TTL=0 在同毫秒内仍命中（实测 1 次 vs 2 次视觉调用）。
- **测试**：新增 2 项（默认 TTL 内同图 1 次视觉调用 / TTL=0 立即过期 2 次），apply 套件累计
  **64 断言**；真实 Cordis 套件 15 断言保持全绿。README 配置表补 cacheTtlMs/cacheMaxEntries/
  descriptionCap。
- **收尾通读结论**：index.js（642 行）与 lib/images.js（92 行）逐行复核——无未用 import、
  无未用配置（本轮仅 cacheTtlMs 一处）、错误路径均有清晰中文报错、presentCall/output/render
  契约一致；仅剩完整 dsh 实例 boot 联调（环境受限）。
- **可复现?** 是（两套测试均可复跑）。

## dsh-model-selector 多 agent 检测-修复第二轮

- **方法**：第 2 个审查 subagent（回归检查 + 对抗扫描），对照官方 seat 核实契约；另有 E4 已在本轮
  先自行封顶（`.dms-failures` 96px 滚动 + 全部固定块 `flex:0 0 auto`，subagent 分析基于旧快照）。
- **回归确认**：第一轮 6 处修复全部正确无回归（notice 菜单级+`goPane` 清除闭环、聚焦 effect 合理、
  E1 协议同构、错误条两面板对称；store 在 load/select 启动时先清 error，无「loading+陈旧 error」）。
- **新发现 3 处（全部已修）**：N1=清除按钮出发的方向键跳过第 0 项（`Math.max(active,0)` 对 active=-1
  错位，改 base 判定 ↓→0/↑→n-1）；N2=聚焦目标缺失/disabled 时 focus() no-op 焦点落 body（改
  find 第一个非 disabled）；**A1 最小方案**=删 `role="menu"`/`menuitem*`（input 不再嵌 menu，消除
  SR 菜单模式吞键/输入框语义错乱），trigger `aria-haspopup="true"`，顺带清死键 `menu.aria`。
- **遗留（排期）**：A1 完整 combobox/listbox 重构（30-50 行方案已给，纯 role/aria + 2 个小 handler）、
  P2 虚拟化、E2/E6 属设计。subagent 结论=可发布、无阻塞项。
- **可复现**：N1 是（Tab 到清除按钮按方向键）；A1 是（NVDA 菜单模式）。教训=ARIA menu 里嵌 input
  是 SR 硬伤，最小解法是剥掉 menu 角色回退原生 button/input，不必等完整 listbox 重构（见 NOTES.md）。

## dsh-vision-bridge 真实 Cordis 运行时验证通过（15 断言全绿）

- **突破**：不再只有 mock ctx——新增 `tests/cordis-boot.test.mjs`，把插件装进 harness
  **vendor 的 @deepseek-ai/cordis@4.0.1 真实 Context**（真实 on/effect/plugin/provide/get/
  waterfall 语义 + 最小服务 stub），验证：① stealth 适配器/工具/configurable 目录真实注册；
  ② `ctx.waterfall(null,'agent/pre-step',payload,finalNext)` 触发真实 waterfall → pre-step
  listener 的 `await next()` + decision 改写 + autoDescribe（走真实 ctx.llm）全链路正确；
  ③ reject decision 透传；④ stealth stream 委托 native 路由 + 残留图片兜底改写；⑤ 工具
  execute 真跑通；⑥ `handle.dispose()` 经真实 fiber effect 移除适配器。
- **关键 API 事实**：Cordis 插件 fiber **异步启动**（state 1→2）——`ctx.plugin()` 后必须
  `await handle`（handle 是 thenable）再断言，否则 apply 尚未执行（首跑 3 项同步断言全 FAIL
  即此因）；卸载同样要 `await handle.dispose()`。waterfall 触发用 `ctx.waterfall(thisArg,
  event, ...args, finalNext)`，listener 经 `ctx.on` 注册即可被 waterfall dispatch 命中。
- **可复现?** 是（`node tests/cordis-boot.test.mjs`；依赖 node_modules/@deepseek-ai/cordis
  软链→harness vendor/cordis，仅测试环境需要）。

## dsh-mac-desktop 孤儿清理修复 + B 站 /video SSRF 补全（多 agent 首轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题 1**：standalone 退出（Cmd+Q 优雅退出 / `kill -TERM`）后，spawn 的 `zsh -lc 'cmd & wait'`
  及其子进程**全部残留**，dsh 服务器变孤儿（实测：app 已退出、zsh+sleep 都还在）。→ **原因**：
  ① `willTerminateNotification` 观察者里用 `Task { @MainActor }` 调 `stopSpawned()`——terminate()
  在 willTerminate 返回后立即 exit，主 actor 执行器**不再被调度**，Task 根本没跑（打印插桩证实
  无任何 ServerManager 日志）；② 即使跑了，`p.terminate()` 只 SIGTERM 直系子进程，shell 在
  `wait` 内可能忽略 SIGTERM，孙进程照常存活。→ **解法**：观察者改**同步**调用
  （`MainActor.assumeIsolated { self?.stopSpawned() }`，queue 是 .main 故合法）；stopSpawned
  **先 ps 快照后代树再 terminate**（root 死后子进程被 reparent 到 launchd，事后快照会漏），
  leaf-first SIGTERM + 1.5s 轮询 + SIGKILL 兜底；AppDelegate 加 SIGTERM DispatchSource
  （`signal(SIGTERM, SIG_IGN)` + `DispatchSource.makeSignalSource` → `NSApp.terminate`），
  否则 `killall`/logout 直接绕过 Cocoa 终止流程。→ **可复现**：是（`sleep 300 & wait` 做
  launchCommand，退出后 pgrep 验证）。
- **问题 2**：B 站 `/dsh-bili/video` 代理的 **SSRF 本体仍在**——并行会话修了「cookie 只发 B 站域」
  （外泄），但 `target` 任意 `https?://` URL 仍会被 curl 拉取并流回，且 `-L` 跟随重定向到任意主机。
  → **解法**：加 `VIDEO_HOST_RE` host 白名单（B 站自有域 + akamaized.net，拒绝 IP 字面量/IPv4 段），
  白名单外 403；`-L` 全去掉（headInfo + spawnCurl）；spawnCurl 补 `--max-time 300`；
  `req.on('close')` **提前到 handler 顶部**注册（否则客户端在 headInfo 期间断开时 close 监听还没挂，
  curl 会一直下载）；`aborted` 标志在每次 await 后检查。→ **可复现**：是（临时 profile 起实例，
  curl 内网地址 → 403，B 站域 → 放行）。
- **问题 3**（minor）：cookie jar 全局单文件 `/tmp/dsh-bili-cookies.txt`，多 profile 互相污染；
  弹幕分片首个空段 break 截断长视频后半段。→ 解法：jar 名按 `DSH_HOME` 哈希后缀隔离；
  弹幕连续 2 个空段才 break。
- **检测过程**：5 个只读 subagent 并行深审 7 插件（bilibili/mac-desktop/skill-manager/model-selector/
  vision-bridge），共报 ~35 项；其中 skill-manager/vision-bridge/classifier/usage-dashboard 与
  并行会话工作重叠（它们已提交对应修复），我补做 mac-desktop（实证孤儿 bug）+ bilibili 剩余 SSRF。
- **测试盲区**：raw 二进制读不到 bundle 的 UserDefaults 域（`ai.deepseek.dsh-mac`），
  用 `.build/.../DshMac` 直跑测 defaults 驱动逻辑会静默走默认值——必须用 make-app.sh 出的
  bundle 二进制测。

---

---

---

## dsh-plugin-classifier host 边界/fuzz 审查第二轮（全部实测）

- **缓存 fallback 竞态（中）**：`marketList` 冷缓存无 in-flight 去重 → 并发请求重复拉取；且
  **慢的 en fallback 会覆盖已成功的 zh 缓存**（实测调用序列 `["zh","zh","en"]`，最终缓存
  `lang=en` 持续 10 分钟，中文分类名/中文查询全部失效）→ 解法：模块级 `inflight` promise 去重 +
  仅当缓存为空/更旧时才写入（`fetchedAt` 比较）。
- **200 但解析为空的 body 仍缓存（中）**：`curl -f` 只挡 HTTP≥400；200 + 格式漂移（无 `###`）
  → `categories=[]` 照常缓存 10 分钟且**不触发 en 回退**（实测）→ 解法：`categories.length===0`
  时不写缓存并尝试 en。
- **searchPlugins 无标点/CJK 分词（中，UX）**：terms 只按 `\s+` 切 → `token/用量`、`UI增强`、
  `侧边栏文件浏览器`（工具自带示例！）全 0 命中（实测）；`统计 token、用量` 靠「统计」一词误中
  → 解法：按非字母数字切词 + 0 命中时回退「query 字符/二元组」模糊匹配。
- **spec 正则放行 `.`/`..` 仓库段（低）**：`a/..` 通过校验 → 命令 `dsh plugin add 'github:a/..'`
  （全量 shq 引号包裹，无注入，纯运行时错误）→ 解法：仓库段排除纯 `.`/`..`。
- **1 字符 query 必空（设计取舍）**：denoise 过滤后 length-1 查询恒 0 命中；CJK 单字（盘/忆/墙）
  丢失 → 可接受，但可对 CJK 单字特判。
- **验证方法**：`/tmp/classifier-export.mjs`（index.js 源 + 追加 export 纯函数，零拷贝漂移）+
  5 个 fuzz 脚本（parseMarket 17 项、search 21 项、路由 25 项、并发 3 场景、shq 注入 5 项）+
  基线 test-classifier.mjs 全绿；shq 组合命令用真实 `bash -lc` argv-echo 验证无注入
  （`; touch /tmp/pwned`、`$(touch ...)` 均不执行）。
- **已核实无问题**：CSRF 头严格 `'1'`（Node 自动小写头键，大小写变体/多余头/`'1 '` 均正确
  403/200）；spec 双重编码 `%2523`、`%2F`、199/200/201 长度边界、`#`、`?`、`%0A` 全部正确
  400/200；handler 抛错/exit 127 → 500 且响应为合法 JSON；zh/en README 解析 301/301 零差异
  （`## 徽章` 重置兜住）；`dsh plugin add github:` 是合法 CLI 语法（apps/cli/src/plugin.ts:150）；
  formatMatches 两个调用点签名一致。
- **可复现**：是（脚本在 /tmp/fuzz1-5*.mjs）。

## dsh-bilibili-player 第三轮：stale-set 收尾 + 对交付代码的可执行验证（Range 7/7）

- **新发现（低）**：播放页「← 返回列表」不推 `streamSeq`/`openSeq` → 在途 playurl/videoInfo
  resolve 晚到会 setStream/setCurrent（无害但脏）→ 返回时两序都 `++`（commit `c9cba59`）。
- **可执行验证（不是读代码）**：把 index.js 里真实的 Range 解析块抽出来跑 7 个用例全 PASS
  （`bytes=0-499`/`500-`/`-200` 后缀/`500-100` 与越界 416/无 Range/非法头）——416 分支 `res.end();
  return` 提前返回是正确行为，测副作用即可；cookie 白名单 6/6（B 站域放行、evil/127.0.0.1 拒）。
- **环境**：第二个只读回归 subagent 又挂起（共享工作区并发修改），已 interrupt，用自查+单测
  矩阵替代（与 vision-bridge 同结论）。
- **可复现**：是。

## dsh-bilibili-player 第二轮检测-修复（对抗审查 10 项全修，commit `62b09a7`）

- **审查方式**：独立 subagent 通读 Host+Client + 对照 harness 源码，报 10 项（1 高 3 中 6 低），
  全部属实无误报。
- **高（安全）**：`/dsh-bili/video` 任意 URL 代理会把 bilibili 会话 cookie 发到任意主机
  （SSRF + SESSDATA 外泄）→ cookie 只发给 B 站自有域（`BILI_HOST_RE`：bilibili.com/biliapi.net/
  bilivideo.com/hdslb.com/bilibili.tv/acgvideo.com/mountaintoys.cn 等），非 B 站域不带 `-b JAR`，
  图片代理直接拒回源。实测白名单对 CDN 流（bilivideo.com/mountaintoys.cn）放行、对
  evil.example/127.0.0.1 拒绝。
- **中（功能）**：① `activeDm` 只增不减 → 密度上限退化「累计数」、弹幕中途永久停 → `retireDm`
  到期从数组删除；② 字号/透明度/弹速是 interval 闭包旧值、运行中改不生效 → 依赖补三项；③
  openVideo/switchPage/switchQuality 无请求序保护 → `streamSeq` 守卫 resolve。
- **低**：browse tab/搜索竞态（`browseSeq`）+ 加载更多重复追加（`moreLock`）；Range 后缀
  `bytes=-N` 语义错 + 越界伪 206（改 416 + Content-Range `bytes */len`）；headCache 无 TTL
  （加 5min，过期签名 URL 不再带错 Content-Length）；jar 固定 /tmp + 0644（启动与登录轮询后
  chmod 600）；videoInfo 失败无限转圈（playerView 渲染 error 横幅）；imgDataUri NaN 状态校验。
- **可复现**：是（审查逐条给了复现条件）。

## dsh-bilibili-player 首轮检测-修复（4 个真实问题）+ Host 契约核实（commit `ca76736`）

- **问题/修复**：① 弹幕 seg.so 逐段抓取无容错——一段失败整个 500、弹幕全无 → 逐段 try/catch，
  失败即停不拖垮（403/网络抖动时优雅降级）；② `/dsh-bili/video` 代理与 HEAD 探测不带 cookie jar
  （playurl 带、取流不带，登录/会员流可能被 CDN 拒）→ 两处都补 `-b JAR`；③ client 切视频/切 P
  时弹幕层残留 DOM 弹幕最多滞留 7s → 加载 effect 重置前先 remove 旧 span；④ 历史记录 30 张
  data-URI 封面可能撑爆 localStorage（~5MB，超限静默不持久化）→ 写入时按总 JSON 体积裁剪
  （>1.5MB 丢最旧，至少留 10 条）。
- **契约核实（读 harness 源码确认，非猜测）**：`fs.resolve(path,opts?)` +
  `fs.readBytes(target, signal, maxBytes)→Uint8Array`；`webServer.register({kind,path,handler(req,res)})`
  是 Node 原生 `IncomingMessage/ServerResponse`（`req.headers`/`res.setHeader`/`stdout.pipe(res)` 合法）；
  `subprocess.spawn(spec)→{stdout: Readable, terminate()}`；`shell.resolve({command,stdoutMaxBytes,timeoutMs})`+`run`。
- **可复现**：是（代码审查 + 语法 + MD5/wbi 复测全过）。

## dsh-plugin-classifier 多 agent 检测-修复第二轮（回归 + 边界/交互，自查先行）

- **自查修复（2 处）**：① `parseQuery` 不识别 `force=TRUE` 且不解码 `+`（空格）→ force 匹配改大小写
  不敏感（`['1','true'].includes(toLowerCase)`）+ key/value 都 `decodeURIComponent(+/空格)`；
  ② `marketList` 冷缓存并发无 in-flight 去重（两个并发 /market 各拉一次 zh+en）→ 模块级
  `marketInflight` promise 共享，并发只拉一次。
- **fuzz agent 修复（R1/R2/R3/N1，均实测驱动）**：① **缓存竞态**——慢的 en 回退会覆盖已成功的 zh
  缓存 10 分钟 → 写缓存仅当 `lang==='zh'` 或缓存为空（en 永不替换 zh）；② **200-空解析仍缓存**——
  `-f` 只挡 HTTP≥400，格式漂移（无 `###`）产出空目录照常缓存 → `categories.length===0` 视为失败改抓 en、
  en 也空则抛 500；③ **搜索无标点/CJK 分词**——`token/用量`、`侧边栏文件浏览器` 0 命中 → terms 按
  `[^A-Za-z0-9\u4e00-\u9fff]+` 切词 + 全词命中加分 + CJK 二元组兜底；④ spec 放行 `a/..` → 拒绝纯
  `.`/`..` 段；另加 `parseMarket` 非字符串入参防御（N4）。
- **自查验证（155 断言全过，5 套脚本）**：en README 实测解析 ~301 插件（zh 之外的分隔/结构也兼容）；
  force=TRUE / force=1&force=1 / force=0 语义正确；spec 长度精确边界（200 接受 / 201 拒）；畸形市场
  数据（categories 空 / plugins 缺失 / profile 缺失）client tab 不崩、优雅降级；交互级 stub 测试——
  filter=builtin 隐藏自定义组、搜索按 catalog 中文名/模块名过滤、市场分类 chip 过滤/「全部」恢复、
  市场按 desc 搜索，全部符合预期。
- **契约排除**：harness webserver `kind:'exact'` 用 `new URL(req.url).pathname` 匹配（**剥离 query**），
  `/install?spec=…` 正确命中，无 404 隐患；`formatMatches({matches,total})` 两个调用点（工具 execute 与
  /find-plugin 命令）一致。
- **可复现**：是（`/tmp/test-classifier-4.mjs` 边界/模糊、`-5.mjs` 交互）。

---

## dsh-vision-bridge 第五批检测：分发产物验证 + 混合/多图/错误路径（62 断言全绿）

- **分发验证**：`npm pack --dry-run` 确认 tarball 恰 6 文件（LICENSE/README/cordis.patch.yml/
  index.js/**lib/images.js**/package.json），`lib/` 已随 files 白名单打入、tests/node_modules 正确
  排除——files 修复（第三批）真实生效。
- **新增测试**：混合来源（paths+attachmentIds 同调）、一条消息两张图（都改写、autoDescribe 各调
  一次）、OCR 空 file_path 报错、非图片字节+未知扩展名清晰报错、next() 返回无 messages 的 decision
  时回退 payload.messages、fs.resolve 失败清晰报错。
- **测试教训**：默认 mock 的 readBytes 对任意路径都返回 PNG 字节 → 嗅探优先于扩展名是**正确设计**
  （字节为准），扩展名只在嗅探失败时兜底；测试前先想清 pre-condition。
- **可复现?** 是（`node tests/apply.test.mjs`，累计 62 断言）。

## dsh-model-selector 多 agent 检测-修复第一轮

- **方法**：1 审查 subagent（只读逐行）+ 自查；契约核实=wire `ModelCatalogModel` 只有
  id/name/description/reasoning、`reasoning` 键在无思考模型上被省略（不会遇到空对象）、
  pi-ai 推理模型 efforts 恒 ≥5 项、`priority:-1` 单槽 shadowing 合法、官方 seat 用
  **Toast** 播报 select 拒绝而我们删了 Toast。
- **修了 6 处**：① notice 只在 model 面板渲染→effort 面板点当前档位仍静默（B1，移到菜单级 +
  面板切换清 notice）；② select 失败在 effort 面板零反馈（B2，错误条两面板共用，select 无重试、
  load 有重试）；③ 搜索框 ↑/↓ 被 root 方向键劫持无法移动光标（B3，`event.target` 是 input 时跳过）；
  ④ 最大档位为 off 的模型显式提交 `reasoningEffort:'off'`（E1，改不提交）；⑤ 面板切换焦点掉 body
  （A2 部分，useEffect 按 pane 聚焦搜索框/首项）；⑥ 未使用 import + 死键 `group.collapsedCount`。
- **可复现**：是（B1/B2/B3 均可在真实实例复现）。**遗留（不阻塞发布）**：A1 ARIA menu 模式违例
  （input 在 menu 内，需 combobox/listbox 重构）、E4 非 groups 区超高裁剪、P2 大目录无虚拟化。
  教训：删除官方 Toast 时要补等价的失败播报面，否则 select 拒绝静默（见 NOTES.md）。

## dsh-bilibili-player 第二轮检测-修复（对抗性审查 10 项全修）

- **审查方式**：独立 subagent 通读 Host+Client + 对照 harness 源码，报 10 项（1 高 3 中 6 低），
  全部属实无误报，commit `62b09a7` 修完。
- **高（安全）**：`/dsh-bili/video` 任意 URL 代理会把 bilibili 会话 cookie 发到任意主机
  （SSRF + SESSDATA 外泄）→ cookie 只发给 B 站自有域（`BILI_HOST_RE`：bilibili.com/biliapi.net/
  bilivideo.com/hdslb.com/bilibili.tv/acgvideo.com/mountaintoys.cn 等），非 B 站域不带 `-b JAR`，
  图片代理直接拒回源。实测白名单对 CDN 流（bilivideo.com/mountaintoys.cn）放行、对
  evil.example/127.0.0.1 拒绝。
- **中（功能）**：① `activeDm` 只增不减 → 密度上限退化「累计数」、弹幕中途永久停 → `retireDm`
  到期从数组删除；② 字号/透明度/弹速是 interval 闭包旧值、运行中改不生效 → 依赖补三项；③
  openVideo/switchPage/switchQuality 无请求序保护 → `streamSeq` 守卫 resolve。
- **低**：browse tab/搜索竞态（`browseSeq`）+ 加载更多重复追加（`moreLock`）；Range 后缀
  `bytes=-N` 语义错 + 越界伪 206（改 416 + Content-Range `bytes */len`）；headCache 无 TTL
  （加 5min，过期签名 URL 不再带错 Content-Length）；jar 固定 /tmp + 0644（启动与登录轮询后
  chmod 600）；videoInfo 失败无限转圈（playerView 渲染 error 横幅）；imgDataUri NaN 状态校验。
- **可复现**：是（审查逐条给了复现条件）。

## dsh-vision-bridge 第二轮检测-修复补充：block-end 兜底 + 47 断言全绿

- **新修复（健壮性）**：`visionAnswer` 原来只收 `text-delta`——若某适配器只发整块文本
  `block-end` 不发 delta 会得空文本；补「无 delta 时取 block-end.block.text」兜底（有 delta 时
  跳过避免重复），单测用只发 block-end 的 mock 流验证。
- **第三批测试全过**（累计 47 断言）：视觉链失败回退（首模型 error finish → 用第二个）、
  pre-step 经 listener 改写嵌套 tool-result 历史图、畸形配置（passthroughRoutes 非数组/vision
  空项）不崩、200 层嵌套重写不爆栈、block-end-only 流。
- **可复现?** 是（`node tests/apply.test.mjs` 全绿）。

## dsh-plugin-classifier 多 agent 检测-修复第一轮（3 审查 agent + 自查，~16 处修复，76 断言全过）

- **3 个并行审查 agent**（host 对抗 / client 对抗 / 打包安装链路）+ 父 agent 自查，发现并修复：
  - **安全**：`/install` 是写操作但可被跨站简单请求触发（`<img src>` CSRF）→ 加自定义头
    `x-dsh-plugin-classifier: 1` 校验（跨源简单请求带不了自定义头，触发 CORS 预检被同源路由拒绝），
    client fetch 带该头；缺头 403。
  - **host 逻辑**：① searchPlugins 不搜分类名（「UI 增强」0 命中）→ haystack 拼 `category`；
    ② curl 无 `-f`（404 也 exit 0 → 空市场缓存 10min + zh→en fallback 失效）→ `curl -fsS`；
    ③ spec/limit 无上限 → spec>200 拒、limit 封顶 20（schema `maximum:20`）；④ 1 字符词噪声
    （query「a」命中 263/301）→ 忽略 len<2 词；⑤「找到 N 个」用 slice 数误导 → 返回 total
    显示「前 N 个（共 M 个）」；⑥ 工具 execute 无 try/catch（命令面有）→ 补 catch 返回友好文案；
    ⑦ 分隔符缺 `–`/`：` → 放宽；⑧ `##` 二级标题不重置分类（徽章/免责声明段落污染风险）→ 重置；
    ⑨ localeCompare 依赖环境 locale → 改按 code point；⑩ 空模块名进 custom → 跳过。
  - **client**：① 复制按钮 `clipboard.writeText` 异步失败仍显示「已复制 ✓」（假成功）→ then/catch
    分别显示「已复制 ✓ / 复制失败」；② 安装竞态：只禁用当前安装卡片，可对别的卡片连点重复提交 →
    任意安装进行中禁用全部安装按钮 + onInstall 前置守卫；③ 市场「刷新」不带 `?force=1` → Host 缓存
    命中永不刷新 → refresh 置 force 状态；④ GitHub 链接按钮缺 `text-decoration:none`；⑤ installCmd
    profile 缺失时拼 `undefined` → 回退 `web`；⑥ 市场数据防御（`c.plugins`/`p.spec` 缺失不再崩 tab）+
    跨分类重复 spec 的 React key 改 `spec:category` + 无障碍（市场 chips aria-pressed、状态点 aria-label、
    结果盒 role=status、空态悬空冒号）。
  - **打包/安装**：一键安装走 `ctx.shell` 受默认 workspace-write 沙箱约束（写 ~/.dsh/profiles 被拒）→
    README 注明需放开沙箱或改用复制命令 + install 错误加沙箱提示；README 指明持久改 config 的位置是
    **profile 自己的 cordis.patch.yml**（包内 patch 重装被覆盖）。
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

- **修复 1（waterfall 稳定性）**：pre-step 里 `session.requestHeader()` 可能抛错 → 若抛错会
  让 waterfall 监听器整体崩、步骤挂死；已 try/catch（passthrough 判定降级为 false → 走改写）。
- **修复 2（工具稳定性）**：`lookupRef` 兜底扫 `session.deriveMessages()` 可能抛错 → 已
  try/catch，降级为"未找到 ref"（干净报错，而非裸 TypeError）。
- **修复 3（配置边界）**：`timeoutMs`/`maxTokens` 非法或过小（`AbortSignal.timeout(0)` 立即中止
  → 视觉调用必失败）→ normalizeConfig 钳制：timeoutMs 下限 1000、maxTokens 需 >0 整数，否则回退默认。
- **README**：补「补丁层假设标准 web profile 含 llm-deepseek/attachment-local 两行」说明。
- **子代理审查环境结论**：两次派出的审查子代理均挂起，停止信息显示「文件在审查中被并发修改」——
  本环境共享工作区被多 agent 并发写，**子代理只读审查不可靠**，改用自查 + 单测矩阵。
- **测试**：新增 requestHeader 抛错不崩/deriveMessages 抛错回退记录表/未知 id 干净报错/配置钳制
  4 项，累计 **53 断言全绿**。
- **可复现?** 是（`node tests/apply.test.mjs`）。

## dsh-vision-bridge 第三批检测：回退/嵌套/配置/深层 4 类测试全过（46 断言）

- **本轮补充测试**（无新代码缺陷，均为验证加固）：① 视觉链失败回退——第一个视觉模型 error
  finish 时自动尝试第二个（`stream` 按 provider 定制 mock）；② pre-step 经 listener 改写历史里
  嵌套 `tool-result` 的图片（内置 read_image 场景）；③ 畸形配置（passthroughRoutes 非数组、
  vision 空项/null）不崩、仍改写；④ `rewriteImageBlocksDeep` 200 层嵌套不爆栈。
- **自查结论**：pre-step 内 `await next()` 后所有异步路径均有 try/catch（autoDescribe 逐图捕获、
  passthrough 的 resolveModelInfo 捕获），listener 自身不会因视觉失败抛错；stealth `stream()`
  用 `{...options, provider: NATIVE_ROUTE}` 全字段透传（tools/system/reasoningEffort/signal/
  sessionId/maxTokens 等）；缓存按内容寻址 attachmentId + sessionId，跨会话无误命中。
- **可复现?** 是（单测可复跑，累计 46 断言）。

## dsh-skill-manager 多 agent 检测-修复第一轮（3 审查 agent → 1高+5中+8低 + 契约 5中+8低）

- **client 高**：市场安装必然失败——`mkt-list` 返回无 `id`，client 发 `market=undefined` → host find 不匹配
  → 500；修复=host 返回补 `id`（端到端 fake-shell 验证）。
- **host 高**：编辑 flat 停用技能复活旧内容——writeUserSkill 恢复 flat parked 再写目录 bundle，
  re-park 只 park 目录 → 旧 flat 内容复活在模型目录；修复=**统一目录形态**（删 flat 旧副本/disabled 副本）。
- **中**：① save 走 GET query 传正文 → node 超长 URL 431（实测 60KB→431）；改 **POST body**（readJsonBody
  1MB 上限，body 优先 query 兜底，client save 用 POST）；② save 永远写 ~/.dsh → 编辑 ~/.agents 技能制造
  同名副本；按 `readSkill` 归属 root 原地更新；③ rename toggle 与 frontmatter 模式互切状态不一致 →
  统一 `ensureCleanActiveSkill`（恢复 parked 或删残留 + 清 model 面限制字段，**保留用户 user-invocable**）；
  ④ active+parked 并存时 rename 静默覆盖丢数据 → 恢复时 active 存在则删 parked；⑤ mkt-install 覆盖同名
  用户技能 → 冲突报错 + 清同名 parked；⑥ frontmatter legacy 键/非法布尔提供方拒收、插件宽容且保留
  legacy → UI 切换无效；对齐=legacy 键/非法布尔整文件拒收；⑦ listRoot 与提供方 4 处不一致（点目录/
  symlink/.system/flat 双文件重复）→ 只跳 `.system`、symlink 用 stat 跟随、按名去重（活跃优先）、
  SKILL.md 存在（含无效）不回退 parked。
- **低**：removeSkill rm force 不抛 ENOENT 死代码 → 先 pathExists；parseQuery 解码 `+`；市场封顶并发
  超额 ≤6 → fetch 后 push 前再检查；curl 加 `-f`；mkt 缓存按 markets/proxy 指纹键控；skill_manage 工具
  save 感知 toggleMode；client busy/installing 单值并发锁 → 任一在途禁用全部操作；sparkle 图标 WeakSet
  节点身份+仅 childList → 改内容特征（首个 path d）+ 观察 attributes['d']；loadMarket 竞态 → 请求序号
  token；重名校验+maxlength；saving 禁用表单；市场失败 setMarkets([])；package.json dsh.client.inject
  补 `@deepseek-ai/dsh-client-ui-settings`。
- **验证**：新增 test-post（64KB POST）、test-switchmode（模式互切）、test-mktid（market id 链路）、
  test-round2（6 项新行为）全过 + 原 6 套回归全绿。
- **可复现**：是（旧代码各自必现）。经验：**市场/API 层「契约字段缺失」只有端到端链路测试才暴露**
  （fake-shell 模拟 client 全流程）；长正文必须 POST；「恢复/覆盖」操作先探测双侧；借鉴提供方行为前
  对照其源码（legacy 键、发现规则）。

## dsh-plugin-classifier 打包/补丁/安装链路审查（只读，未改文件）

**问题 → 原因 → 解法 → 可复现?**
- **一键安装/市场抓取走 `ctx.shell`，默认 profile 下是沙箱 bash（workspace-write）**：bash-sandbox
  的 `resolve()` 对未传 sandboxPolicy 的调用填 `sandboxPolicy.resolve()`（默认
  `DSH_PERMISSION_MODE ?? 'workspace-write'`、workspaceRoot=boot cwd，`packages/shell/bash-sandbox/
  src/index.ts:84-85`、`packages/bundle/base/cordis.patch.yml` sandbox-policy 行）→ `dsh plugin add`
  写 `~/.dsh/profiles/<p>`（cwd 之外）被拒、无可用 runner 时抛 SandboxUnavailableError → 解法：
  `runShell` 显式传 `sandboxPolicy:{mode:'danger-full-access'}`（install 必传），README 注明
  danger-full-access 前提。**可复现?** 默认 profile 跑一键安装。
- **patch 行 inject 与模块 export inject 是并集、非冲突**：`registry.plugin()` 先 `Inject.resolve(
  plugin.inject)`（模块 export），loader `internal/plugin` 再 `Inject.resolve(entry.options.inject,
  fiber.inject)` 合并进同一 dict（`vendor/cordis/src/registry.ts:330`、`vendor/loader/src/index.ts:122`）
  → 重复列同服务名幂等、**不双等不报错**；skill-manager 拆两处只是风格。两处都列全 = 冗余但最稳。
- **`dsh.client.inject` 里的 `@deepseek-ai/dsh-client-ui-slots` 是纯库无 dsh.client 声明**：host 不
  校验 inject 目标、client 侧 boot 不把 manifest 的 inject 边转成 fiber inject（`packages/client/web/
  src/boot.tsx` 只 `loader.create({name})`，inject 边仅"informational"）→ 该边是 no-op；真正必需的
  `@deepseek-ai/dsh-client-ui-settings-plugins`（声明 settings.plugins.tab 的包）已在列 → 无功能影响。
- **README「改 cordis.patch.yml 的 config」没说改哪份**：git 安装时包内 patch 在 node_modules 且重装
  被覆盖；持久位置是 **profile 自己的 `cordis.patch.yml`**（用户层最后应用，`- id: plugin-classifier`
  + `config:` 可覆盖 insert 行，`applyEntryPatches` 的 buildMap 让后层能 patch 前层 insert 的行）。
- **契约核实（非 bug）**：package.json 与 dsh-usage-dashboard 模板逐字段一致（files 6 文件全覆盖、
  exports ./client 映射、零依赖无 peer）；`dsh plugin add` CLI=pnpm 转发 + reconcilePlugins 追加
  bundles 到模板之后（disable ui-settings-plugin-inventory 必在 web-app 之后，成立）；webServer
  `{kind:'exact',path,handler(req,res)}`、tools `{name,description,parameters,output:{schema,render},
  execute}`、commands `{name,description,input:{hint},handler}`、shell resolve/run 均对照 harness
  源码核实；client `window.__ModuleLoader__.load` + `{apply,inject:['slots']}` 与 usage-dashboard
  同形；parseMarket 实测 301/301（见上一条 host 审查）；README 安装命令/路由/默认值（profile=web、
  dshBin=dsh、proxy 无）与 index.js 一致。

---

## dsh-plugin-classifier host 半区对抗性审查（只读，未改文件）

**问题 → 原因 → 解法 → 可复现?**
- **searchPlugins 的 haystack 不含 category**（`index.js:163`）：实测真实 README.zh.md 下
  query「UI 增强」（该分类 67 个插件）→ 0 命中、「娱乐」（18 个）→ 0 命中；用户按分类名/意图词
  搜不到 → 解法：haystack 拼上 `plugin.category`（或单独给 category 命中加分）。**可复现**：任意
  含中文分类名的查询。
- **fetchUrl 不查 HTTP 状态码**（`index.js:89-98`）：curl 无 `-f`，实测 404 返回 **exit=0** +
  空 body → 被当成功 → parseMarket 得 0 分类 → 空市场**缓存 10 分钟**，且 zh→en fallback 只响应
  网络异常、对 404 永不触发 → 解法：`curl -fsS` 或 `-w '%{http_code}'` 校验 200。**可复现**：把
  AWESOME_URLS 改成不存在的路径。
- **spec 白名单无长度上限**（`index.js:314`）：`[A-Za-z0-9_.-]+` 无界 → 超长输入拼出巨型命令行
  （exec E2BIG / 120s 慢跑）→ 解法：`spec.length <= 200`（owner≤39 + repo≤100 + `#subdir`）。
- **find_plugin 的 limit 无 maximum**（`index.js:231/172`）：模型传大 limit → formatMatches 全量
  301 条进上下文 → 解法：schema `maximum:10` + execute 再 clamp。
- **评分失真**（`index.js:165-169`）：实测 query「a」→ 263/301 命中、排序近随机；多词 query 的
  `+10` 短语加分几乎不触发（「统计 token 用量」25 命中但排序=逐词和）→ 解法：忽略 len<2 词、
  「全词都命中」才加短语分、category 加分。
- **契约核实（非 bug）**：FiberState 0-5= PENDING/LOADING/ACTIVE/FAILED/**DISPOSED**/UNLOADING，
  官方 `plugin-inventory` 也把 DISPOSED(4) 映射 null（`packages/host/plugin-inventory/src/index.ts`）；
  `tools.register`/`commands.register` 经 `layers.effect` **fiber 自回收**（不必包 ctx.effect，包了
  反而双 disposer），`webServer.register` 返回同步 disposer 且**非** layer 作用域 → 必须 `ctx.effect`
  包（`packages/host/webserver/src/index.ts:94`、`packages/core/tools/src/index.ts:1037`、
  `packages/interaction/commands/src/index.ts:245`）；`shell.run` **永不 reject**（超时/信号杀也 resolve，
  `exitCode` 可为 null，`packages/shell/shell/src/types.ts`）；curl 404 exit=0 实测确认。
- **parseMarket 对真实 README 精确**：`README.zh.md`（61KB，301 插件）实测 **301/301 全解析**，
  仅 TOC anchor 被跳过；`—`/`-` 双分隔符、`## 贡献/徽章/免责声明` 尾部 section 无 `- [` 行不污染；
  潜在漂移点：只认 `—`/`-`（不认 `–`/`：`）、`##` 后 current 分类不关闭。

---

## dsh-vision-bridge 第二轮检测-修复：原生多模态直通 + 超时组合（2 个真实问题）

- **问题 1（违反用户需求）**：pre-step 对**所有**路由改写图片，真正多模态的模型也拿不到原图
  （用户要求"有多模态的模型走原模型就行"）。解法：新增 `config.passthroughRoutes`（provider id
  列表）——会话模型在该路由上且 `resolveModelInfo` 声明图片输入、且不是 stealth 路由时，
  pre-step **不改写、不 autoDescribe**，原图直发；默认空 = 全走 visionbridge（DeepSeek 零配置
  即用）。注意语义：声明的图片输入可能是"为过准入而手写"的（纯文本模型），所以直通必须显式
  列入；README 给了 `passthroughRoutes: [qwen]` 示例。
- **问题 2（无限挂起风险）**：`signal || AbortSignal.timeout(...)` 在有 turn signal 时丢超时——
  挂起的视觉调用会无限阻塞步骤。解法：`withTimeout(signal)` = `AbortSignal.any([signal, timeout])`
  （无 signal 时直接 timeout），autoDescribe 与两个工具统一使用。
- **测试**：新增 6 项（直通保留原图/直通路由上纯文本模型仍改写/未列路由仍改写/stealth 列入
  直通也改写/视觉调用携带 AbortSignal 断言），总 34 项断言全过；README 同步补配置与直通示例。
- **可复现?** 是（单测可复跑）。

## dsh-skill-manager 兼容性审查（只读，未改文件）

**问题 → 原因 → 解法 → 可复现?**
- **listRoot 与提供方发现规则有 4 处不一致**（对照 `packages/skill/skill-filesystem/src/index.ts`）：
  ① 插件 `index.js:204` 跳过 `.` 开头条目，提供方只跳过 user-dsh 根的 `.system`、不跳其他点目录
  → `.foo/SKILL.md`/`.foo.md` 目录里有、插件列表/readSkill 都够不着（frontmatter name 是 kebab 时
  按名也拼不到点目录路径）；② 符号链接技能：提供方 fs 与 node 双路径都跟 symlink，插件
  `readdir(withFileTypes)` 跳过 → 链接技能在目录但不在设置页/`/skills`（get/toggle 直接路径仍可用）；
  ③ `.system` 只在 user-dsh 根被提供方跳过，user-agents 根提供方不跳、插件两个根都跳；
  ④ flat `foo.md` 与 `foo.md.disabled` 同存时插件 push 两条同名记录（目录形态同存只推活跃）→ 列表重复。
- **frontmatter 校验宽容度不对称**：提供方对 legacy 键（`disableModelInvocation`/`modelInvocable`/
  `userInvocable`）或非法布尔值**抛错整文件不发现**；插件 boolField 宽容→列表显示 enabled，
  且 renderSkill 保留 legacy 键 → UI 切换对目录永远无效。解法：parseSkill 对齐提供方行为。
- **`slots.inject` 是按声明等待的**（runtime `client/slots.ts`：`specDynamic`+`subscribeDeclaration`，
  声明出现才跑 callback），所以 client 不 inject `@deepseek-ai/dsh-client-ui-settings` 也能在 boot 自愈注册
  settings.section —— 但对照 dsh-usage-dashboard（同注册 settings.section 却 inject 了 ui-settings），
  属契约不一致，HMR/顺序边缘有风险，建议补。
- **已核实无问题**：patch 行 `inject:[webServer]` 与模块 `inject:['commands','tools']` 是**并集**不覆盖
  （`vendor/cordis/src/registry.ts` `Inject.resolve` 填同一 fiber.inject 字典）；`!!js process.env.DSH_HOME`
  合法（`vendor/loader/src/config/utils.ts` `with(ctx){eval}` 回退全局作用域拿到 process）；webServer handler
  契约=Node req/res + exact 路由（`packages/host/webserver/src/index.ts`），插件 res.statusCode/setHeader/end
  JSON + 500 错误分支符合；skill 名正则与 `isSkillName` 完全一致；市场 URL 按段 `encodeURIComponent`
  对空格/#/%/UTF-8 正确。**可复现?** 规则差异均可由构造文件复现（未实跑实例）。


- **发现（按严重度）**：① **Bug**：复制按钮「已复制 ✓」与真实结果脱钩——`copyText` 静默
  `.catch(()=>{})`，非安全上下文（LAN IP 访问 3080）或写剪贴板被拒时仍显示成功，建议
  `copyText` 返回 Promise<boolean> 成功才 `setCopied`；② **Risk**：`installing`/`result` 是单槽
  状态、按 spec 键控——同时点两张卡安装时后完成的覆盖先完成的、且在途卡按钮提前恢复可用可
  重复提交，建议 installing 期间禁用全部安装按钮或 result 改 spec→结果 map；③ **Risk**：
  `installCmd` 拼 `--profile ${view.profile}` 无缺省防护（当前 host 恒返回 profile，属契约漂移
  防护缺失），`for (const p of c.plugins)`（行 370）与 `spec.includes`（行 377）缺字段会抛
  TypeError 崩 tab；④ **Risk**：市场卡 `key: p.spec` 跨分类重复时 React 重复 key + 状态联动；
  ⑤ **Nit**：市场分类 chips 缺 `aria-pressed`（与列表页 chips 不一致）、无匹配查询时「没有匹配的
  插件。」与两个 Group 各自「暂无插件」三重复、chip 计数是总数搜索后不一致、错误文案悬空冒号、
  dot 用 title 应改 aria-label、retry/refresh 重复。
- **契约核验（正面）**：`slots.register({name,id,order,label})` 与 harness slot-catalog
  （packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1359）逐字段一致，label
  字符串由外壳 `resolveSlotLabel` 支持；`id:'all'` 与原装 inventory tab 的阴影冲突已被
  `cordis.patch.yml` 的 `ui-settings-plugin-inventory disabled:true` 消除；两个组件全部 hooks 都在
  条件 return 之前、`[request]` 依赖不重复 fetch、fetch 副作用 alive 守卫完整（onInstall 除外）；
  CSS 用到的全部 `--dsw-alias-*`/`--ds-*` token 都能在
  `packages/client/ui-theme/src/styles/design-platform.css` / `base.css` 里找到（bg-layer-1/3、
  border-l1/l2、label-primary/secondary/tertiary、state-error/success/business-primary、
  interactive-bg-hover、button-primary-fill、label-primary-foreground、bg-module-platform、
  shadow-lv1、ds-font-family-code、ds-ease-in-out），`color-mix(in srgb, state-business-primary 18%,…)`
  写法与 harness 自带 PluginInventorySettingsTab.module.css 一致，无猜测 token。
- **附带知识点**：设置页 plugins 分区外壳 `PluginsSettingsSection.tsx` 对访问过的 tab **保持挂载**
  （visitedIds），切 tab 不卸载 → 组件内 fetch 不会因切 tab 重跑、copy/install 状态跨 tab 存活；
  内置 `configurable` tab 是 order 0，本插件 all=10/market=20 排序在其后。

## dsh-bilibili-player 首轮检测-修复（4 个真实问题）+ Host 契约核实

- **问题/修复**：① 弹幕 seg.so 逐段抓取无容错——一段失败整个 500、弹幕全无 → 逐段 try/catch，
  失败即停不拖垮（403/网络抖动时优雅降级）；② `/dsh-bili/video` 代理与 HEAD 探测不带 cookie jar
  （playurl 带、取流不带，登录/会员流可能被 CDN 拒）→ 两处都补 `-b JAR`；③ client 切视频/切 P
  时弹幕层残留 DOM 弹幕最多滞留 7s → 加载 effect 重置前先 remove 旧 span；④ 历史记录 30 张
  data-URI 封面可能撑爆 localStorage（~5MB，超限静默不持久化）→ 写入时按总 JSON 体积裁剪
  （>1.5MB 丢最旧，至少留 10 条）。
- **契约核实（读 harness 源码确认，非猜测）**：`fs.resolve(path,opts?)` +
  `fs.readBytes(target, signal, maxBytes)→Uint8Array`；`webServer.register({kind,path,handler(req,res)})`
  是 Node 原生 `IncomingMessage/ServerResponse`（`req.headers`/`res.setHeader`/`stdout.pipe(res)` 合法）；
  `subprocess.spawn(spec)→{stdout: Readable, terminate()}`；`shell.resolve({command,stdoutMaxBytes,timeoutMs})`+`run`。
- **可复现**：是（代码审查 + 语法 + MD5/wbi 复测全过）。

## dsh-plugin-classifier v0.2 增强（市场 + 对话找插件）与 70 项测试验证

- **需求**：借鉴 dsh-builtin-toggles 的中文内置目录 + 补上插件市场与对话式找插件（`find_plugin`
  工具 + `/find-plugin` 命令），仍保持「单 tab 合并 + 内置/自定义二分」。
- **实现**：host `ctx.tools.register` 注册 `find_plugin`（原始 JSON Schema，`parameters`/`output`
  结构与 skill-manager 一致）；`ctx.commands.register` 注册 `/find-plugin`；市场 = curl 拉
  awesome-dsh-plugin README.zh.md（en 回退）→ 正则解析（`### category` + `- [owner/repo](url) — desc`，
  跳 TOC anchor、spec 校验 `/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.#-]+$/`），10 分钟缓存 + `?force=1`；
  一键安装 = `shell` 执行 `dsh plugin --profile <p> add github:<spec>`（**`config.dshBin` 覆盖
  默认 `dsh`**，`shq` 引号包住命令名/路径，宿主 shell PATH 无 dsh 时能填绝对路径）；monorepo
  子包（spec 含 `#`）不提供一键安装、提示打开仓库。
- **验证套路（无 react-test-renderer 也能全链路测 client）**：mock ctx 必须同时支持
  **属性访问（`ctx.tools`/`ctx.commands`，来自 inject）与 `ctx.get()`**；`ctx.effect` 立即执行
  回调（client 里要 stub `document`）；渲染 loop = 执行 effect → `await setTimeout 0` flush
  `fetch().then` 微任务 → 重渲染到稳定，用**自研迷你 React stub**（per-function state Map +
  queued effects）驱动 ready 状态；三套脚本共 70 项断言全过（host 26 + 契约 15 + ready 渲染 14 +
  真实 curl 拉取 + patch 组合顺序 + dshBin）。
- **坑**：`find_plugin` 的 execute 里 `marketList` 用模块级缓存（进程单例 bundle 无碍）；安装
  路由对 spec 做白名单正则防注入；测试脚本里 mock 只给 `get()` 会报 `ctx.tools undefined`。
- **可复现**：是（`/tmp/test-classifier{,-2,-3}.mjs` 可重跑）。

---

## dsh-vision-bridge 多测多检：apply() 级 mock 集成测试 + 三个修复

- **测试体系**（`dsh-vision-bridge/tests/apply.test.mjs`，`node tests/apply.test.mjs` 全过）：
  ① `lib/images.js` 纯函数单测（嗅探/嵌套 tool-result 重写/引用收集/删除式重写）；② apply()
  级集成测试用 mock ctx 驱动真实 `apply()`（软链 harness workspace 包到插件 node_modules 即可
  import，三个依赖 `dsh-llm-deepseek`/`dsh-launch-environment`/`dsh-anonymous-user-id`）——
  覆盖：插件注册（listener/tools/stealth 双路由/configurable provider）、stealth
  `listModels/resolveModel` 声明图片能力、stealth `stream()` 兜底改写+转发 native 路由、
  pre-step 改写（autoDescribe 描述/同图缓存/关闭时附件标记/无图不动/reject 透传）、视觉发现
  排除 stealth 路由、工具（路径/attachmentIds/未知 id 报错/超 4 张拒绝/OCR/无视觉链明确报错）、
  显式 vision 配置。
- **修复 1（compaction 直连漏洞）**：`agent/pre-step` 只覆盖 agent 循环；**compaction 等辅助
  调用直达适配器**不经 pre-step——stealth `stream()` 里加了兜底改写（残留图片块→文字再转发），
  pi-ai 路由的摘要调用仍可能带图（上游不收图则失败），README 注明。
- **修复 2（发现选错）**：自动发现视觉链会把 stealth 路由当视觉模型（它声明了图片能力但背后是
  纯文本转发）——发现时排除 `deepseek-official`/`deepseek-official-native`。
- **修复 3（发布级）**：`package.json files` 白名单漏了 `lib/`（index.js import
  `./lib/images.js`），git 安装会丢目录（同 dsh-mac-desktop 教训）——已加。
- **真实实例 boot 联调未做**：本 checkout 无构建好的 dsh CLI + agent 工具环境 boot 会挂（见前条）；
  留给用户在实例上 `dsh plugin add` 验证。
- **可复现?** 是（单测全部可复跑）。

## dsh-model-selector 借鉴点落地：no-op 反馈 + 自动最大思考 + 推理徽标 + 搜索增强

- **「搜索选择后模型没变」真因**：真机复现 = 当前模型就是所点模型（`[true]` 勾选项）+ 静默
  close 无反馈 → 观感「点击无效」。机制没坏（A/B：切到非当前项能切）。
- **落地**：① 点当前模型/当前档位不再静默关闭——菜单保持打开 + 内联 `.dms-notice`「已是当前
  模型」（搜索输入/关闭时清除）；② **选择模型后自动带最大思考档位**（`maxEffortOf`：按
  off<minimal<low<medium<high<xhigh<max 排 rank 取最高，随 select 提交 `reasoningEffort`）；
  ③ LobeChat 式**推理徽标** `.dms-badge`（wire 有 `reasoning` 就标「推理」，无 inputModalities
  所以不做图片徽标——wire `ModelCatalogModel` 只有 id/name/description/reasoning）；④ Cherry
  Studio 式搜索增强：haystack 加 `model.id`+`group.id`（搜 0731/dashscope/jiyuanlvdong 都能中）。
- **可复现**：是（当前项 no-op）。经验：wire 层模型信息有限（无 inputModalities/contextWindow），
  能力标签只能做 reasoning；「点了没反应」类问题先确认是否 no-op + 给反馈，别急着改逻辑（见 NOTES.md）。

## dsh-mac-desktop 分发实测：pnpm git 子目录语法 + files 白名单两个坑

**问题 → 原因 → 解法 → 可复现?**
- **问题 1**：`dsh plugin add github:user/monorepo#main:dsh-mac-desktop` 报
  `Could not resolve main:dsh-mac-desktop to a commit`。→ **原因**：`#ref:subdir` 是 **npm**
  语法，**pnpm 把 `#` 后整段当 ref** 解析，冒号子目录不识别。→ **解法**：pnpm 用
  `path:` 参数：`github:user/monorepo#main&path:/dsh-mac-desktop`（`&` 组合多个参数，
  官方文档 pnpm.io/package-sources，pnpm 9+ 支持；固定版本用 `#<sha>&path:/<subdir>`）。
  → **可复现**：是（pnpm 11.7.0 实测，冒号形式必报错）。
- **问题 2**：装出来的包**没有 `native/`**，预编译的 `DeepSeek Harness.app` 不随包分发，
  boot 后 `spawnApp` 找不到二进制。→ **原因**：git 安装按包 `package.json` 的 `files`
  白名单打包；二进制从 `DshMac.app` 改名成 `DeepSeek Harness.app` 时 **`files` 里的旧条目
  没同步**，条目失配 → 整个 `native/` 被排除。→ **解法**：改 `files` 为
  `native/build/DeepSeek Harness.app`，`pnpm pack --dry-run` 验证目录树再提交。
  → **可复现**：是（pack dry-run 即可复现）。
- **分发结论**：`dsh plugin add` 装的是 monorepo 子目录 + 预编译 app，`dsh web` 每次
  启动自动弹窗；更新=重新 `add` 拉到新 commit。**下次改二进制名/路径必须同步 `files`。**

---

## dsh-vision-bridge 实现落地（透明附图插件，纯 bundle 不 fork）

- **目标**：任意切模型 + 附图即用——多模态模型直发原图，纯文本模型自动图转文；官方 deepseek
  路由 + pi-ai 自定义路由全覆盖。
- **关键发现（此前方案设计的修正）**：透明拦截不需要本地代理，**`agent/pre-step` Waterfall
  事件**（`Event.listEvents` 确认：payload `{agent, messages, turn, step, signal}`，`next()`
  返回 `PreStepDecision`，返回 `{...decision, messages: 改写后}` 即可替换进入该步骤的消息）
  在每个模型步骤前改写消息，**天然覆盖所有路由**（含 pi-ai）。图片块留在会话日志 → UI 正常
  显示、历史无图片块 → 「切不回文本模型」问题消失。
- **三层实现**（`dsh-vision-bridge/index.js` + `lib/images.js`，纯 JS 无构建）：
  ① pre-step 重写：递归（含 tool-result 嵌套，否则内置 read_image 记录的图下一轮漏出）把图片块
  换成缓存描述 / autoDescribe 场景描述 / 附件标记（指引调 vision_describe/ocr）；按附件 id 缓存
  （同图不重复调视觉）；② 官方路由隐身接管：patch `disabled` 官方 `llm-deepseek` 行 + 重建原生
  `DeepSeekAdapter`（import `@deepseek-ai/dsh-llm-deepseek`，构造 `{options, resolveApiKey,
  resolveUserId}`，读同一 `llm-deepseek` 设置段/凭据）挂隐藏路由 + 公开路由
  `listModels/resolveModel` 声明 `inputModalities:['text','image']`（准入放行、选择器外观不变）、
  `stream` 纯转发（图片已在 pre-step 改写）；③ `vision_describe(paths|attachmentIds, question)`
  + `vision_ocr(file_path)`：路径走 `fs.resolve/readBytes` + 字节嗅探 + `attachments.saveImage`；
  attachmentIds 走 per-session 记录表（`readImage` 校验 ref 元数据，**必须持有完整 ref**，按 id
  查不到时兜底扫 `session.deriveMessages()`）。
- **pi-ai 路由接入**：用户给模型声明 `input: [text, image]`（或路由级 `defaultInput`）让准入放行
  即可——**因为 pre-step 保证图片永远不会发到上游，声明图片能力是安全的**（上游不收图也不影响）。
- **视觉链**：显式 `config.vision` 或自动发现（`llm.listProviders/listModels/resolveModelInfo`
  找第一个 `inputModalities` 含 image 的模型，60s 缓存）。
- **契约确认**：StreamChunk 文本收 `{type:'text-delta', text}`；finish error 在
  `{type:'finish', reason:{kind:'error', failure:{message}}}`；pi-ai openai-completions 把图片
  序列化为 `image_url:{url:'data:<mime>;base64,…'}`（代理/网关接入时用得上）；GenerateOptions
  `purpose` 只允许 `compaction|session-title`，辅助视觉调用不传。
- **验证**：`node --check` + `lib/images.js` 纯函数单测（嗅探/嵌套重写/引用收集/删除重写）全过；
  完整 boot 联调留待真实实例（agent 工具环境 boot 会挂，见前条）。
- **可复现?** 是（DeepSeek 路由附图 → pre-step 改写为文字）。

## 使用统计 Token 口径统一为合计（dsh-usage-dashboard）

- **需求**：所有 token 类统计从「纯输出」改为「合计（输入+输出+缓存命中）」，重点=各模型用量。
- **改动**：host `modelTotals`/`modelDays` 改累计 `tot=out+din`（input+cacheRead+cacheWrite）；
  `eventDays[].tokens` 同步改合计；client 环图（中心「合计 tokens」+「各模型 Token 占比（输入+输出+缓存命中）」）、
  趋势悬停模型行（值自动合计）、热力图悬停「Token 总量」+数据源改用 `exactDayTotal+e.total`、
  摘要「Token 合计约 …（输入+输出+缓存命中）」；KPI 副行保留输入/输出分解（有意口径说明）。
- **发现（并行会话已改 host 为 merge 设计）**：totals = exact(covered 全量) + scan(仅未覆盖会话)——
  断言 2700 = exact 2000 + scan 700 成立；模型归属仍在 `!covered` 之外（scan 全事件，标注「覆盖 N 会话」）。
- **踩坑**：冒烟断言用 `Date.now()` 相对时间戳 → 日键随运行时刻漂移（`ts(1,14)`=now-10h 落在哪天不定），
  eventDays 断言要**时间无关**（用 mock 自身时间戳 + host 同款本地 dayOf 推导期望集合，29h 跨距保证两日）。
- **验证**：冒烟 17/17（模型 600=300+100+200；merge 总量 2700；time-less 9999 排除）；client 渲染 4 场景全过。
- **可复现**：是（冒烟测试）。

## 使用统计用户反馈二连修（dsh-usage-dashboard）

- **问题 1「亿和万差的多」**：数据正确（KPI 输入 15.28亿+输出 473万，输入含缓存读取）但趋势图只画
  **输出**（万级），与 KPI 头部（亿级）量级差 32 倍，观感像坏了 → **趋势改画每日 Token 总量**
  （host 新增 `exactDayTotal`（exact 模式：uncachedInput+cacheRead+cacheWrite+output 按创建日）+
  scan 模式 `eventDays[].total`）；client 趋势 exact 模式用 `exactDayTotal[d]`、scan 用 `e.total`，
  悬停提示「Token 总量（输入+输出+缓存读取）」、卡片标题改「按天 Token 总量趋势」副题注明
  「与顶部 KPI 总量一致」——**趋势求和恰等于 KPI 总量**（生产实测 exactDayTotal 求和 ==
  input+output+cacheRead+cacheWrite）。
- **问题 2「峰值图其他小时有柱子」**：hourHist 数据正确（仅 23 时有 709，其余 23 小时全 0），
  「柱子」= `bar-wrap` 的 `interactive-bg-hover` **轨道背景**在零小时也显示成浅柱 → 去掉轨道
  background，零小时真正留空（有数据的柱子不受影响）。
- **验证**：冒烟扩到 17 断言（exactDayTotal 求和 == 全量 input+output+cache）；client 渲染
  4 场景全过（卡片新文案）；`node --check` 双文件 OK。
- **可复现**：是（curl 3080 实例 hourHist 即复现问题 2 根因）。

## 使用统计插件真实实例联调（dsh-usage-dashboard）

- **用户重启后 curl 3080 实例**：`/dsh-usage/api?force=1` → 200 JSON（24 字段含全部新字段
  eventCapHit/exactComplete/exactMessages/exactDayTokens）；`/plugins/dsh-usage-dashboard/client.js`
  → 200 text/javascript 45KB（改名后包正常服务）。
- **关键一致性证明（生产环境）**：`exactComplete=true` 时 `exactDayTokens` 求和
  （2323030+2377121=4700151）**恰等于** `totals.outputTokens`（4700151）——KPI ↔ 趋势同源，
  「几十万 vs 好几亿」类不一致在 exact 模式下结构性不可能（单一数据源模式生效）。
- **缓存**：连续两次非 force 请求均 <0.5ms（60s TTL 命中）；`readErrors=0`；工具计数/时段口径正常。
- **可复现**：是（用户实例即复现环境）。

## 使用统计插件检测-修复（第四轮，dsh-usage-dashboard）

- **防御性边界**：损坏/部分日志的事件可能缺 `ev.time` → `dayOf(undefined)` 产生 `NaN-NaN-NaN`
  桶污染 eventDays/hourHist → 事件循环顶部加 `if (!ev.time) continue`（冒烟补断言：time-less
  assistant 事件 9999 tokens 被跳过、总量仍 700，16/16 全过）。
- **已安装态核验**：profile bundles 含 `dsh-usage-dashboard`、node_modules 软链指向插件目录
  （改名后重装生效）；`node --check` 双文件 OK；apply 冒烟 16/16 + client 渲染 5/5。
- **无新增插件缺陷**：本轮 1 处防御性修复（corrupt-log 容错），未发现功能性新问题。
- **可复现**：是（冒烟测试含 time-less 事件场景）。

## 使用统计插件检测-修复（第三轮，dsh-usage-dashboard）

- **补齐最大验证缺口：client 全渲染路径可执行测试**（`tests/client-render.smoke.mjs`，迷你 React
  stub 递归展开函数组件 + useState/useEffect 驱动 + fetch stub）：首载失败（HTML→「统计加载失败+重试」）、
  初始加载态、happy-path 完整仪表盘（100 文本节点，万/亿格式 5.4亿/4000万/100.5万 全对）、刷新失败横幅
  （显示旧数据+原因）——4 场景全过，client 图表/KPI/环图/热力图/时段/摘要首次被真实执行验证。
- **host 冒烟补边界**：空语料（结构完整不崩、peakHour=-1、exactComplete=false）、readFrom 全失败
  （readErrors 透出、不崩）——apply 冒烟扩到 **15 断言**。
- **踩坑**：迷你 React stub 必须**递归展开函数组件**（`h(UsageStats)` 只是 element 不是渲染结果）、
  hooks 需按场景重置（模块级 statsCache 会被前序场景污染）；加载 client.js 用「提取 factory 函数体 +
  `(factoryBody)(requireStub)`」而非真实 __ModuleLoader__。
- **可复现**：是（测试文件即复现步骤）。

## 使用统计插件多 agent 检测-修复（第二轮，dsh-usage-dashboard）

- **复查发现并修复**：① **高**——client 按天「exact 缺失才回退扫描」在 exactComplete=true 时跨天双计
  （长会话全部 Token 归创建日、活动日又回退扫描值，同一笔出现两次）→ 改**单一数据源模式**：exact 完整时
  趋势/热力图/摘要全用 exact（缺失天记 0）、不完整时全用 scan，杜绝逐日混源；② **中**——host `useExact`
  （对 scannedSessions）与 `exactComplete`（对 cacheTotal）条件不一致→合并为同一判据
  `cacheHits>=cacheTotal`，KPI 与按天图同语料；③ 低——SummaryText「全部时间」文案→「近一年」（与范围按钮一致）；
  force 在 inflight 期间被合并→等 inflight 结束再 force 重算；墙钟预算补**会话内检查**（每 2048 事件查一次，
  防单大会话超预算）；`budgetHit`/`eventCapHit` 拆开，页脚按事件上限给出准确文案。
- **残留（记录在案，非 bug）**：服务端/浏览器时区差异（同机部署无感）、窄屏 tooltip 残差、
  steps+turns 代理高估消息数（KPI 副行已标注扫描口径）。导航图标自愈盲区已用**几何校验**闭环
  （marker 存在且 x 匹配 BAR_GLYPH 才跳过，属性级覆写也会重打）。
- **环境教训**：共享工作区被并发修改→**子 agent 只读审查挂起**（vision-bridge 已记录同样结论），
  本轮 host 复查 agent 挂起后改为自查；client 复查 agent 正常完成。
- **验证**：冒烟测试扩到 **13 断言**（新增场景 2：缓存全覆盖 → exactComplete=true、totals=全缓存和、
  exactDayTokens 3 天）；`node --check` 双文件通过；字段一致性 client↔host 全核对通过。

## 使用统计插件多 agent 检测-修复（第一轮，dsh-usage-dashboard）

- **三路审查**：host/client 各一子 agent 代码审查 + 一子 agent 对照 harness 源码核实契约
  （契约零硬性问题，全部签名/字段名一致：readFrom→{meta,events}、cachedSnapshot(header)→
  {asOfSeq,values}、SessionRecord={header,live,persisted}、webServer.register({kind:'exact',path,handler})
  返回 disposer、settings.section label 允许字符串）。子 agent 只读不改，落档由主 agent 统一做。
- **修复（host index.js）**：① 缓存从未写入是死代码（`cache` 恒 null）→ 落值 + **60s TTL**
  （否则挂载 fetch 恒命中进程缓存、数据永远过期）；② 事件上限只 break 内层循环→外层也 break；
  ③ `exactMessages` 在投影缓存部分覆盖时恒用精确值→**`cacheHits>=cacheTotal` 才用 exact**，否则回退扫描；
  ④ 峰值时段 `hourHist` 原来统计所有事件（含 request/header 等）虚高→只统计消息+工具（与热力图口径一致）；
  ⑤ `Number(x)||0` 挡不住 ±Infinity（JSON.stringify→null）→ `num()` 有限性防御；
  ⑥ 新增 `exactComplete` 标志，缓存不全时客户端趋势/热力图/摘要回退扫描（防静默欠计）。
- **修复（client.js）**：① fetch 200 非 JSON（SPA fallback/代理）会无限 loading→**校验
  `totalSessions` 字段**；② 有数据时刷新失败静默→顶部 notice 横幅（显示旧数据+原因）；
  ③ 热力图/小时柱 tooltip 边缘溢出→ left 夹取 10-90%；④ 范围「全部」实为 365 天→改标「近一年」；
  ⑤ 导航图标补丁 WeakSet 无自愈（React 重渲染恢复齿轮但 svg 节点不变被跳过）→ 改
  `data-us-glyph` 标记自愈 + 遍历全部 `[role="dialog"]`；⑥ 全扫描失败时摘要误报「暂无使用记录」→
  显示「N 个会话读取失败」。
- **验证**：apply() 级 mock 冒烟测试 9 断言全过（缓存命中/force 重算/hourHist 口径/exactMessages
  回退/modelTotals 归属/toolCounts/eventDays/exactDayTokens）；`node --check` 双文件通过。
- **可复现**：缓存死代码/事件上限/exactMessages/hourHist 均为必现 bug；Infinity 与 TZ 错位为
  边界（同机部署 TZ 一致则无感）。README 补「仅支持 web profile」警告（patch 硬注入 web-only 服务）。

## 插件改名 dsh-usage-stats → dsh-usage-dashboard（避开生态 3 个同名）

- **问题**：GitHub `dsh-plugin` topic 里已有 ≥3 个同名 `dsh-usage-stats`（Ychris/lanlandeli/Make0209），
  发布会撞名混淆。
- **解法**：`git mv` 目录 + 全量改名——`package.json name`、client `__ModuleLoader__` id、patch 行
  `id/name`、console/effect 标签、`dataset.plugin`、README/LICENSE/COMPARISON；profile 里
  `dsh plugin remove dsh-usage-stats` + `add ./dsh-usage-dashboard`（link 自动重建），
  `--dump-config` 确认新行；**API 路由 `/dsh-usage/api` 保持不动**（不含旧名，无需改）。
- **坑**：批量替换时 **COMPARISON/NOTES 里第三方同名仓库名（Ychris12138/dsh-usage-stats 等）必须保留**，
  只能按上下文精确替换我们的引用；改名后旧的 `node_modules/dsh-usage-stats` 悬空软链要手动 `rm`。
- **可复现**：N/A（一次操作）。界面 label「使用统计」、导航图标 DOM 补丁（按 label 匹配）不受影响。

## 使用统计插件生态调研（dsh-usage-dashboard）

- **结论**：GitHub `dsh-plugin` topic + [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) /
  [awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness) 里用量/统计类插件**不少**，最接近四个：
  [Ychris12138/dsh-usage-stats](https://github.com/Ychris12138/dsh-usage-stats)（⭐16，月历热图+余额/订阅额度，增量聚合）、
  [zhangzheng25/dsh-token-monitor](https://github.com/zhangzheng25/dsh-token-monitor)（设置页+90 天贡献图+数据落盘+30s 轮询）、
  [lanlandeli/dsh-usage-stats](https://github.com/lanlandeli/dsh-usage-stats)（趋势+一年热力图+模型分析+CSV/JSON 导出+工作区筛选）、
  [Make0209/dsh-usage-stats](https://github.com/Make0209/dsh-usage-stats)（53 周热力图+余额+工作区别名）；另有
  悬浮/底栏费用类（dsh-usage-footer、pangzi499/dsh-balance-stats、H1a3x/dsh-token-stats 等，主打余额/峰谷计价，需官方 API）。
- **我们的差异化**：① **全量一致**——KPI 与按天趋势/热力图/摘要同源（投影缓存精确按天，相加恰等于总量，无「几十万 vs 好几亿」）；
  ② 独有维度——**工具排行、峰值时段、自然语言摘要**、自定义导航图标（DOM 级替换）；③ **<3s 无轮询**（有界扫描+缓存）。
- **可借鉴**：lanlandeli 的 CSV/JSON 导出+工作区筛选、zhangzheng25 的跨重启落盘（91 天桶）、Ychris 的余额/配额卡（需官方 API，属另一产品线）。
- **⚠️ 命名冲突**：生态已有 ≥3 个同名 `dsh-usage-stats`（Ychris/lanlandeli/Make0209），本插件已改名 `dsh-usage-dashboard` 区分。
- **可复现**：N/A（调研）。详见 `dsh-usage-dashboard/COMPARISON.md`。

## wbi 签名落地：纯 JS MD5 有个「小端字节序输出」坑（dsh-bilibili-player）

- **问题**：按 bilibili-API-collect 实现 wbi 签名（mixinKey 重排 + MD5），MD5 输出对不上
  标准向量（`abc` 算出 `98500190…` 而非 `90015098…`）。
- **原因**：算法内部 32 位字是对的，但**标准 MD5 摘要按小端字节序输出**——我按大端拼十六进制
  了；每个字输出前要 `(w&0xff)<<24 | (w&0xff00)<<8 | (w>>>8)&0xff00 | (w>>>24)&0xff` 再转 hex。
- **解法**：修好输出后三个标准向量全 PASS；实测「nav 取 img_key/sub_key → mixinKey → 参数排序
  + wts → `w_rid=md5(query+mixin)` → `x/player/wbi/playurl`」返回 code 0（quality 64）——
  **验证签名正确性用无效 bvid/cid 会返回 -404（bvid/cid 不匹配）而非 -403（签名错），别误判**。
- **配套落地**：`playurl` 优先 wbi 接口、失败回退旧接口；client 侧 localStorage 持久化弹幕设置
  （DPlayer/ArtPlayer 式）+ 画质记忆 + 观看历史（Bilibili-Evolved 清单首项）+ 弹幕密度档位。
- **可复现**：是（2026-08 实测）。

## dsh-mac-desktop「轻量 vs 开箱即用」取舍分析

- **矛盾**：dsh 是 Node 应用，开箱即用必须有一个 Node 运行时；绝对轻量则不带运行时，两者不可兼得。
- **方案**：A 零成本=智能启动链（system `dsh` → checkout `pnpm dsh` → `npx --yes @deepseek-ai/dsh`）
  + 首次运行友好引导（检测 Node 缺失给安装指引）；B 推荐=.app 内置最小 Node（universal
  ~50-70MB）+ 构建时把已发布 `@deepseek-ai/dsh` 依赖预装进 app（离线零依赖双击即用），体积
  ~80-150MB 仍比 Electron（~200MB+）和全量 fork 竞品轻一个量级；C=全量 fork（=竞品路线）放弃轻量。
- **结论**：插件本体保持轻量 bundle 不变，把「重」放进可选的自足 .app；A+B 组合，先 A 后 B。
- **落地状态（2026-08）**：用户决定暂不实施，保持现状（A/B 均留待后续需要时再做）。
- **可复现**：N/A（设计决策）。

## ⚠️ skill「改名停用」必须改文件（SKILL.md → SKILL.md.disabled），不是改目录

- **问题**：实现 Fishquito7 借鉴点时先做了「目录级改名」`<name>` → `<name>.disabled`，单元测试也过了，
  但**功能实际无效**：DSH 的 `dsh-skill-filesystem` 提供方发现「目录 bundle」只看 `目录/SKILL.md`
  是否存在（`discoverRoot`：`entry.type==='directory' ? join(dir,'SKILL.md')`），`<name>.disabled/SKILL.md`
  依然存在 → 模型目录照样发现该技能。
- **原因**：Fishquito7 的 rename 是**文件级**（`SKILL.md` → `SKILL.md.disabled`）——文件名不匹配
  `SKILL.md` 后提供方才跳过；我误读成目录级。且 `parseSkillFile` 只校验 frontmatter 的 name/description、
  **不校验目录名与 name 一致**，所以目录改名完全不影响发现。
- **解法**：改成文件级改名——`<name>/SKILL.md` ↔ `<name>/SKILL.md.disabled`（目录名不变）；flat 技能
  `<name>.md` ↔ `<name>.md.disabled`（提供方按 `name.endsWith('.md')` 匹配 flat，`.md.disabled` 不匹配）。
  测试补一条「模拟提供方发现规则」断言：park 后 `SKILL.md` 必须不存在。
- **可复现**：是（目录级实现下模型目录仍可见该技能）。经验：借鉴别人的实现前**先读宿主（提供方）的
  发现/匹配逻辑**再动手；单元测试要按宿主规则断言效果（这里是「提供方能否发现」），不能只断言
  「文件改名成功」。

## skill 管理借鉴点落地：行内编辑保留 frontmatter 未知字段 + toggleMode rename 改名停用

- **问题**：调研两个可借鉴点——Lanxing6480 的行内编辑（保留 frontmatter 其它字段）、Fishquito7 的
  改名停用（`SKILL.md` → `SKILL.md.disabled` 彻底隐藏）；我们此前只有新建/开关/删除，且 **toggle/save
  会把 `metadata` 等未知 frontmatter 字段丢掉**（`parseSkill` 丢弃、`renderSkill` 只重建已知字段）——
  顺带是个数据丢失隐患。
- **解法**：① `parseSkill` 保留原始 frontmatter 对象（`frontmatter` 字段，不进 API 响应），
  `renderSkill` 只重建 5 个受管字段（name/description/whenToUse/disable-model-invocation/
  user-invocable），其余字段原样合并——toggle/save/改名全部受益；② save 编辑路径先 `readSkill` 取现有
  frontmatter 传入（`originalName` 支持改名）；③ 新增 `toggleMode: 'frontmatter' | 'rename'` 配置
  （默认 frontmatter 保持兼容）：rename 模式 toggle = 目录 `<name>` ↔ `<name>.disabled` 改名，
  list/read/remove/write 全部支持 `.disabled` 后缀（list 置灰展示 enabled=false、可恢复；write 同名时
  先恢复再写；用户文件内容原样不动）；④ client 行内「编辑」按钮：`api('get')` 预填表单（新增
  whenToUse 输入框），表单标题区分新增/编辑，改名称即重命名。
- **可复现**：是（旧代码编辑必丢 metadata）。经验：SKILL.md 的 frontmatter 是用户数据，任何改写路径
  都要「保留未知字段」；改名停用比内容改写更安全（文件不动、目录级隐藏），代价是丢「分别控制
  model/user 面」的能力——做成配置项让用户选。测试：test-edit.mjs 4 组全过 + 回归全绿。

## DSH 生态内 skill 管理插件实测调研（修正：并非无同类，有 2 个小项目）

- **修正**：此前「DSH 生态无同类」结论过时——`topic:dsh-plugin`（2013 仓库）筛出 2 个同类：
  [Lanxing6480/dsh-skill-manager](https://github.com/Lanxing6480/dsh-skill-manager)（2★，树外 npm 包）与
  [Fishquito7/dsh-skill-viewer](https://github.com/Fishquito7/dsh-skill-viewer)（14★，bundle + CLI）。
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
- **最接近但方向不同**：`dsh-plan-execute` + `dsh-client-ui-plan-execute`（双模型路由，UI 是设置页
  「规划/执行模型」配置行——只选两个固定角色模型，无搜索/折叠/思考档位）；`dsh-token-panel`
  （每模型 token 定价面板——模型列表但为计费）；`dsh-vision-router`（适配器型视觉路由，走同款
  DSH 深度集成但非选择器）。
- **差异化**：dsh-model-selector 是生态里唯一「增强对话模型选择器」——供应商折叠 + 跨供应商搜索 +
  适配器驱动思考档位 + 触发器显供应商，挂官方单槽替换缝、与 /model 共享会话目录（见 NOTES.md）。

## dsh 插件生态调研：桌面壳直接竞品 anywhere-labs/deepseek-harness-desktop

- **结论**：dsh 生态里「桌面窗口壳」唯一直接竞品是
  [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)
  （⭐1084，MIT，2026-08-13 建仓，与本插件同期）：它是**整个 harness 的 fork**
  （root=`@deepseek-ai/dsh-root`）+ 内置 `apps/desktop`（**Electron + electron-builder**），
  功能=桌面窗口 + 系统托盘 + 自启动自管理本地服务（声称免装 Node）、macOS/Windows 安装包；
  手机远程控制/插件市场/IM Channels 规划中。局限=必须整体换用它的发行版，不是
  `dsh plugin add` 可装的轻量 bundle。
- **本插件差异化**：轻量 bundle 一行装进现有 harness；SwiftUI+WKWebView 原生壳（~1MB vs
  Electron 内嵌 Chromium）；与宿主生命周期绑定（孤儿守护/防重窗口/端口跟随 webServer.port）；
  双模式（插件拉起 + 双击独立自动起服务）。
- **生态其他**：dsh-web-ui（⭐1737，Web UI 皮肤合集）、modlens（⭐1179，视觉插件）、
  dsh-vision-toolkit、dsh-agent-teams；awesome-dsh-plugin（⭐808）清单里桌面类只有宠物/通知，
  无同款桌面壳。
- **可复现**：N/A（调研结论）。

## B 站播放插件同类开源调研（dsh-bilibili-player / COMPARISON.md）

- **结论**：没有单个开源项目覆盖「嵌入 + 搜索 + 扫码登录 + 登录联动画质 + 弹幕 + 评论」全集；
  社区方案是分层组合——「播放器+弹幕层」（ArtPlayer / DPlayer / ABPlayerHTML5-bilibili-ver）
  与「Host 侧 API 逻辑」（BBDown / bilibili-API-collect / Danmaku-PHP-API）——与本插件
  的 Host 代理 ↔ Client 自绘播放页架构一致，且我们多了 DSH 深度集成（进程内、可开关、随 dsh
  启动），通用客户端（bilimini/bilibili-linux/iina-plus）做不到。
- **可借鉴**：① ArtPlayer 弹幕层（DOM/Canvas 双模式）——若 client 允许外链库可替换手写引擎；
  ② BBDown + bilibili-API-collect 的 **wbi 签名**实现（接 wbi 接口如更高画质 playurl 时参照，
  dm/post 等实测免 wbi）；③ Bilibili-Evolved 功能清单（历史/收藏/稍后再看/下载 = 路线图）。
- **License 注意**：bilibili-API-collect 是 CC-BY-NC-SA（文档、不可商用再分发），实现另写即可；
  其余参照项目均 MIT。调研详情见 `dsh-bilibili-player/COMPARISON.md`（含逐项对比表）。
- **可复现**：是（2026-08 调研）。

## 插件分类/管理同类调研（dsh-plugin-classifier 对比）

- **问题**：判断「区分内置/自定义插件」的分类插件是否重复造轮子、可借鉴谁。
- **原因**：DSH 社区已有高度相关的插件（awesome-dsh-plugin 精选 301 个插件），且通用生态里
  「内置 vs 自定义」是成熟模式。
- **解法**（对比结论）：
  - **dsh-builtin-toggles**（Starfie1d1272）：中文官方内置插件目录 + 本地搜索 + 状态说明
    （含 Agent Preset 管理项解释）+ 9 个审核过的 UI 安全开关（`MANAGEABLE_IDS` 精确 allowlist、
    fail-closed 锁定其余，服务端每次重校验）。**新增「内置插件」tab、保留扁平列表、不做自定义
    分组** → 与我们的「合并成单 tab + 内置/自定义二分」理念相反；可借鉴其「loader id → 中文名/
    一句话说明/分类」的静态 catalog（`src/client/catalog.zh.ts`，纯展示层不参与授权）思路。
  - **dsh-plugin-hub**（Noob-stupid）：已装插件一键启停（写 profile 用户补丁层 `cordis.patch.yml`
    + HMR 生效）+ GitHub dsh-plugin 市场一键安装；基础设施 70+ 行「受保护」禁止开关；列表平铺、
    打标「补丁停用/补丁强制启用」。是「管理动作 + 市场」型，列表不分内置/自定义。
  - **dsh-market / dsh-find-plugin**：市场浏览（逛/搜/star/安装/更新/卸载）与对话式找插件，不是
    已装列表的分类浏览。
  - **通用生态参照**：VS Code Extensions 的 **Built-in vs User** 分组、JetBrains **Bundled vs
    Marketplace vs 磁盘安装**、Dify 官方市场 vs 自定义插件、Home Assistant 内置集成 vs HACS
    自定义集成——「内置/自定义」二分是业界通用做法。
  - **结论**：我们的差异化 = **唯一把「插件列表」合并成单 tab 并按内置/自定义二分浏览**的插件；
    dsh-builtin-toggles 是「内置目录+开关」（新增 tab），dsh-plugin-hub 是「管理动作+市场」。
    可增强方向：借 dsh-builtin-toggles 的中文名/说明静态 catalog 让分类列表更有信息量，借
    dsh-plugin-hub 的「补丁状态打标」区分用户补丁停用 vs bundle 层停用。
- **可复现**：是（awesome-dsh-plugin 列表与上述仓库 README 可复核）。

---

## dsh-mac-desktop 同类开源项目调研（web→桌面窗口 wrapper 对比）

- **结论**：无现成项目「完全符合」需求。**Pake**（Rust+Tauri/WKWebView，60.7k⭐，**GPL-3.0**，
  活跃）最接近「任意网页→桌面 App」：一条命令出独立 .app、体积小、跨平台；但它是**独立生成器**，
  不感知宿主进程、不自动拉起本地服务、不插件式分发。**Nativefier**（Electron，35.3k⭐，MIT）
  已归档（2023-09 停更），每个 App 自带 Chromium ~100MB+。**Coil / Epichrome / WebCatalog**
  是 SSB（站点专用浏览器）形态，面向普通用户的独立 App。Tauri/Electron 是底层框架非现成工具。
- **我们的差异化**：SwiftUI+WKWebView 原生壳 + dsh 深度集成——URL 自动跟随 `webServer.port`、
  孤儿守护（--parent-pid）生命周期绑定、`DSH_MAC_DESKTOP_MANAGED` 防重复窗口、`dsh plugin add`
  插件式分发、独立双击自动拉起 `dsh web`；这些通用 wrapper 都做不到。
- **可复现**：N/A（调研结论）。若只要通用 wrapper，Pake 首选（注意 GPL-3.0 传染性，本插件 MIT）。

## 开源模型选择器横向调研（dsh-model-selector 对比结论）

- **结论**：主流开源 AI 客户端（Open WebUI / LobeChat / Cherry Studio / LibreChat 等）都做的是
  **整应用内置**的模型选择器，没有「可嵌入他人宿主输入框的独立增强选择器」；也没有项目同时具备
  「供应商分组折叠 + 跨供应商按名搜索 + 适配器驱动的思考档位 + 触发器显示供应商」这组特性。
- **最接近的参考**：Cherry Studio 的 `ModelSelector` 组件（开源，后来补了输入框模糊搜索）；
  LobeChat 的模型元数据体系（RFC 033，`reasoning/vision/functionCall` 能力旗标）——但都只是
  **开/关式**的推理旗标，不是按模型适配器暴露的档位集（pi-ai `thinkingLevelMap`）。
- **差异化**：dsh-model-selector 是 DSH 组合里走官方单槽替换缝的插件、与 `/model` 共享同一份
  会话级模型目录（host 单一事实源）、思考档位来自适配器元数据（catalog 继承 / reasoningEfforts
  声明）——这三者是 DSH 生态独有的，OSS 组件无法直接平替（见 NOTES.md）。

## 「透明附图」可作纯插件分发——社区 dsh-vision-router 已实现（核查官方文档后的修正）

- **官方文档核查结论**：DSH 官方**没有任何**图片回退/自动图转文机制，官方唯一做法是 settings.yaml
  给模型声明 `input: [text, image]`（`docs/user/guide/providers.md`「Image input」一节，含
  `defaultInput` 路由级 fallback 与 `modelOverrides` 收窄）；官方也不提供发送拦截/图转文扩展点。
- **社区已有现成透明版**：[ysr666/dsh-vision-router](https://github.com/ysr666/dsh-vision-router)
  （LGPL-3.0，`dsh plugin add` 一条命令装，零手动改文件）——"发图即用，DeepSeek 保持主力"。
  机制（**不 fork**）：① 包内 `cordis.patch.yml` 自动 `disabled` 官方 `llm-deepseek` 行 + insert
  插件行 + 放宽 attachment 限制（5MB→20MB/40MP→100MP）；② 插件 `import DeepSeekAdapter` 重建
  原生适配器挂到隐藏路由 `deepseek-official-native`，再 `registerAdapter(['deepseek-official'])`
  注册 stealth 适配器：`listModels/resolveModel` 返回官方目录但 `inputModalities:['text','image']`
  （准入通过、选择器外观与官方一致），`stream()` **在模型输入层递归重写图片块**（含嵌套
  tool-result，否则内置 read_image 记录后每轮都崩）→ 有缓存描述用缓存、否则放「调 vision_describe
  等工具」的标记 → `yield* ctx.llm.stream` 转发隐藏原生路由；**会话日志保留原图 → Web UI 仍显示
  上传图片**（优于我此前"准入转文本"设计）；③ 视觉工具链 vision_describe/ground/crop/pixel_diff/
  colors/ocr/trace/extract_foreground，默认免费端点 OVHcloud 匿名 Qwen2.5-VL-72B（2 req/min/IP），
  可配 dashscope/openrouter/siliconflow/zhipu preset；④ 若官方行未 disabled（DUPLICATE_ADAPTER）
  自动降级为可见 wrapper 路由 `deepseek-vision`。
- **对"可分发性"结论的修正**：透明版**能**作纯插件分发——关键是 composition `disabled` 原适配器行
  + 自建同 provider 适配器重注册。但该技法只适用于「单一适配器行承载的官方路由」（deepseek-official/
  llm-deepseek）；**对 pi-ai 一行承载的所有自定义路由不适用**（jiyuanlvdong/qwen 等不能整体
  disabled，pi-ai 路由也无法 registerAdapter 覆盖，会 DUPLICATE_ADAPTER）。用户默认模型
  `jiyuanlvdong/deepseek-v4-flash-0731` 走 pi-ai，装该插件需改用官方 DeepSeek API（`llm-deepseek`
  设置段 + DEEPSEEK_API_KEY），且 stealth 文本转发固定走原生路由、不能 delegate 到 pi-ai 路由。
- **其他社区方案**：gugu123a/dsh-tool-see-image（工具型，默认智谱 GLM-4V-Flash 免费）、
  Sorwcyra/ds-vision-skill（skill 型多路回退）、npm @gitawego/dsh-vision、@jasonjin06/vision。
- **可复现?** 否（外部项目核查，未实测）。

## 统计页数字对不上（几十万 vs 好几亿）根因与正解（dsh-usage-dashboard）

- **问题**：KPI「Token 用量」5.4亿，但按天趋势/热力图/摘要只有几十万——用户觉得坏了。
- **根因**：KPI 走投影缓存（exact 全量），明细走有界深扫描（只覆盖部分会话，差 ~1800 倍）。
- **正解**：**按天 Token 也改从投影缓存算**——`cachedSnapshot` 每会话 `tokenUsage.outputTokens`
  归到 `dayOf(createdAt)`，全量、零 I/O、逐天相加恰好等于总量；消息数用 `sessionStats.steps+turns`
  作精确代理（`steps+turns ≈ 用户+助手消息`）。深扫描只留给无法从缓存得到的**模型占比/工具排行/
  时段分布/消息拆分**，并明确标注「明细覆盖 N 会话」。这样趋势/热力图/摘要与 KPI 同源、对得上。
- **可复现**：是（大语料必现）。经验：聚合统计先分清「哪些维度能走全量缓存、哪些只能扫描」，
  别让精确总量和有界子集混排。

## 原生 title 悬停有延迟；柱状图 0 值别画 stub（dsh-usage-dashboard）

- **问题**：热力图格/小时柱/环图分段用原生 `title`，浏览器默认延迟 ~1s 才弹，用户嫌慢；
  峰值时段图一排 0 活动小时还画 3px 小柱，看着「错乱」。
- **解法**：①图表悬停全改**自定义 tooltip**（`React.useState` hover + 绝对定位
  `.dsh-us-tip.up{bottom:calc(100%+10px)}`，位置按索引百分比 `left:(i+0.5)/N*100%`，即时弹出）；
  环图分段用 `onMouseEnter` 定位，热力图格/小时柱按列索引。②柱状图改**轨道+填充**式：
  轨道（`bar-wrap`）常显浅色、柱 `height:0%`（0 活动不可见），有活动才 `Math.max(2,pct)%`——
  空小时自然留白，不再碎柱。
- **可复现**：是（title 延迟必现；0 值 stub 必现）。

## VisionBridge 理念做成 DSH 插件：两种形态（工具型 / 适配器型）

- **结论**：可行，且比原版代理更优雅——DSH 的 agent 工具循环就是 VisionBridge 的 look/ocr 循环，
  不需要外部代理进程。
- **形态 A（工具型，推荐先做）**：注册 `describe_image(path, question?)` / `ocr_image(path)` 工具；
  流程=路径→`ctx.fs.readBytes`→`ctx.attachments.saveImage` 得 attachment→
  `ctx.llm.stream({provider: 视觉供应商, model: 视觉模型, messages: [text+image 块]})` 取文字→
  只返回**文本**结果。关键：图片块从不进会话历史 → 准入检查、切回文本模型、DeepSeek
  UNSUPPORTED_CONTENT 三个坑全消失，DeepSeek 始终是会话模型。
- **形态 B（适配器型，复刻"附图即用"体验）**：`ctx.llm.registerAdapter(['visionbridge'], adapter)`
  注册伪视觉路由，模型 `resolveModel` 返回 `inputModalities: ['text','image']`（准入通过），
  唯一强制方法是 `stream(options)`（`LlmAdapter` 其余方法都有默认实现，见
  `llm/src/index.ts:180`）：检测 `contentHasImage`→逐图调视觉模型生成描述（用 `attachments.readImage`
  读字节）→把 image 块替换成文本→`yield*` 转发给推理模型。DSH 里选 `visionbridge/visionbridge`
  一个模型即可图文通吃，无需切模型。注意：视觉后端不能指向本适配器（递归）；StreamChunk
  透传即可。
- **经验**：动态插件做 PoC 验证后转 bundle 落仓（本仓库模式）；独立 bundle 别 import
  harness 包，工具用手写 JSON Schema 对象传 `ctx.tools.register`。
- **可复现?** 否（设计分析，未实现）。

## 「纯文本模型看不了图」的开源方案调研（VisionBridge / OCR / 本地 VLM / MCP）

- **问题**：DeepSeek 等纯文本模型发不了图（见上「非多模态模型发图片」）。用户问有什么开源方案。
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

- **「各模型用量 vs 总量对不上」**：KPI「Token 用量」走投影缓存 exact 全量（如 5.4亿），模型
  环图走有界深扫描的子集（如 30万）——两者必然不同。解法：①深扫描改用
  `sessionPersistence.readFrom(id, 0)`（**轻量、无 replay 校验**，预算内能扫更多会话 → 覆盖率
  提升、首点更快）；②环图中心/图例只显示「扫描明细」的和，副标题明说「明细覆盖 N 个会话
  （较早会话未纳入）」，避免误导。
- **按天趋势柱状图**：7 天太稀、365 天太密都难看——改 **面积图**（polyline + 渐变填充 +
  虚线网格线 + 悬停竖线/圆点 + tooltip），任意 N 都自适应。
- **热力图 52 列溢出滚动**：改 26 周（近 6 个月）+ 13px 大格子，无横向滚动、纵向更饱满；
  格悬停 title 显示「日期 · 输出 x tokens · n 次互动」。
- **每次点都转圈**：host 内存缓存其实命中，但每次 remount 都先转一下。client 加**模块级
  `statsCache`**（`useState(statsCache)` 初始化 + fetch 后写回），重开秒出旧数据再静默刷新。
- **可复现**：是（大语料下模型环图子集 vs 总量差异必现）。

## 播放页面板「B 站化」：light 主题 + 左导航栏 + 圆角卡片（dsh-bilibili-player）

- **需求**：打开后的面板尽量仿照 B 站网页版 / mac 版 B 站 App（此前用户先要「和 DSH 风格
  一致」用 token 化，现在明确要 B 站观感——**面板走 B 站品牌风，FAB 仍保持 DSH 原生**，
  两者分开）。
- **设计决策**：白底 `#fff`、主文字 `#18191c`、次级 `#61666d`、三级 `#9499a0`、品牌粉
  `#fb7299`、分隔线 `#f1f2f3`、边框 `#e3e5e7`；粉色 `bilibili` 字标 + `#f1f2f3` 圆角胶囊搜索框
  （focus 粉色光环）；**左导航栏**（推荐/排行榜/我的，选中=粉字+浅粉底）替代顶部 tab（mac App
  风格）；卡片=白卡内嵌圆角封面（8px）、2 行标题、灰色 meta、黑色胶囊时长角标、hover 粉边；
  播放页 18px 标题 + 灰 stat 行 + `#f1f2f3` 简介块；评论区灰用户名 + 粉链接 + 浅灰分隔线；
  画质/弹幕/排序控件与登录弹窗同步改白色系粉胶囊。
- **实现技巧**：整套 CSS 是嵌在 `const CSS = '…'` 单引号字符串里（无单引号），整体替换用
  python 定位 `const CSS = '` 起、取其后第一个 `'` 为结束，直接换内容（断言 CSS 无单引号）。
- **可复现**：是（用户需求）。

## 设置导航图标（settings.section）自定义：官方无图标扩展点 → client 插件 DOM 级替换（可分发、可逆）

- **问题**：想要「技能」设置页有专属导航图标。官方 `settings.section` 注册项只有 `id/order/label` 三字段
  （`ui-settings/src/client/contract/slots.ts` 注释明示 "carry the nav identity: id, order, label"），外壳
  `SettingsRoot.tsx` 的 `navIcon(id)` 硬编码（models/agent-presets/plugins 专属、其余一律齿轮），官方文档
  无任何图标扩展点——早期结论「只能 fork harness」。
- **解法**（无需 fork、可分发可逆）：client 插件 **DOM 级替换**——`MutationObserver` 观察
  `document.body`，找 `[role="dialog"] nav button` 中文本匹配目标 label 的按钮，**保留外壳 `<svg>`
  （class/尺寸/颜色上下文），只替换 glyph path**；path 加 `fill="currentColor"`（官方图标组件
  `IconSettingsOutline16` 就是 path 级 `fill="currentColor"` 着色）；`WeakSet` 防重复替换，React 重渲染
  重建节点由 observer 兜底。副作用全在进程内（observer + DOM）→ **卸载插件重启自动恢复原状**。
- **坑**：CSS Modules 类名是 hash（`_4QiBIW_navCell`），别依赖类名选择器，用「结构 + 文本」定位；
  设置面板 dialog 用 `[role="dialog"]` 定位（onboarding 弹层也有 dialog role 但无 nav）；按钮文本
  `textContent.trim()` 精确匹配 label。
- **可复现**：N/A（Playwright 实测 patched=1，仅目标项替换、其余原样）。

## skill 市场在直连不稳的网络下仍加载不出：TCP 握手黑洞 → connect-timeout 快速失败 + 结果缓存

- **问题**：用户网络到 GitHub 直连**时好时坏**——好时段 `mkt-list` 9s 全量成功，坏时段所有 curl 卡
  SYN_SENT（TCP 握手 7.7s 或直接超时、失败率 ~40%），浏览器 fetch 无限转圈「正在获取市场技能…」。
- **诊断**：`lsof -nP -a -p <curl pid> -i` 看 socket 状态（SYN_SENT=握手卡死）；`ps -o pid,etime,state`
  确认 host 端 curl 是否在跑（用户点市场时会出现新批次）；对照 `curl --noproxy '*'` 直连测速判断
  网络 vs 代码；`ps eww <host pid> | tr ' ' '\n' | grep -i proxy` 看 host 进程是否意外继承终端
  http_proxy（curl 默认尊重环境变量，配了死代理会静默全挂）。
- **解法**：① 市场 curl 全部加 `--connect-timeout 5`——SYN 失败 5s 快速放弃，不再耗满 `--max-time 20`，
  坏时段 ~30-60s 出结果而非无限挂；② `mkt-list` 结果缓存 10 分钟（模块级 Map，重新打开秒回），
  `force=1` 参数让「刷新」按钮强制重拉；部分失败也缓存，避免立刻重试同一次抖动；③ 每个市场独立
  error 字段，不阻塞其他市场；④ `config.proxy` 配了才 `-x`，没配就直连（可加 `--noproxy '*'` 强制
  不继承环境变量代理）。
- **可复现**：是（坏时段必现）。经验：拉远程列表必须「快速失败 + 结果缓存 + 部分结果」三件套，
  否则网络抖动直接表现为页面无限转圈、用户以为功能坏了。

## skill 市场加载卡死/超时（用户报「市场加载报错」）：顺序抓全量 SKILL.md → 封顶 + 有界并发 + 市场间并行

- **问题**：设置页点「市场」后 `mkt-list` 长时间无响应（端到端测试 >120s 超时无输出），页面最终报错。
- **原因**：`discoverMarketSkills` 对每个目录项**顺序** `fetchUrl` 抓 SKILL.md；`skillsDir:''` 的分类仓库
  （skills-hub）还要下探第二层（~10 个分类目录 + 100+ 个 SKILL.md 顺序拉取），一个市场就能拖几分钟，
  三个市场再**串行累加**；且旧 `fetchUrl` 先直连试一遍，直连被墙时每个请求白耗满 `--max-time 20`。
- **解法**：① 每市场上限 `MAX_SKILLS_PER_MARKET=30`、分类仓库只扫前 `MAX_CATEGORY_SCANS=8` 个顶层目录
  （先探 `dir/SKILL.md` 是否直接是 skill，不是再下探一层）；② SKILL.md 抓取用 `mapLimit` 有界并发
  （`FETCH_CONCURRENCY=6`，`Promise.all` + 游标 worker 实现）；③ `mkt-list` 三个市场 `Promise.all` 并行
  （总耗时≈最慢市场，不再是三者之和）；④ `fetchUrl` 改为**配了 proxy 就直接走代理**，没配才直连。
  实测带代理 4.5s 完成：anthropics 17 / superpowers 14 / skills-hub 30（封顶）。
- **可复现**：是（旧代码必现）。经验：拉远程列表要「封顶 + 有界并发 + 条目间并行」三件套，别顺序抓
  全量；「默认直连、代理可选」对开源用户友好，但用户既然配了代理就该直接走代理，别先直连试一遍
  白挂 20s——注意 raw.githubusercontent 不限流、contents API 计 60/h 配额，封顶同时保护配额。

## 中文界面数字用「万 / 亿」单位 + KPI 卡 2×2 布局（dsh-usage-dashboard）

- **问题**：4 连 KPI 卡（每张 ~140px）里「Token 用量 / 活跃天数」文字截断，大数字 k/M/B 也不直观。
- **解法**：`fmtCompact` 改中文单位——`>=1e8` 用 `亿`（2 位小数、`toFixed(2).replace(/\.?0+$/,'')` 去尾零）、
  `>=1e4` 用 `万`（1 位小数）、其余原样；KPI 卡改 **2 行 × 2 块**（`repeat(2,minmax(0,1fr))`），
  每张 ~300px，标签/数值/副行全部完整显示。
- **可复现**：N/A（惯例）。经验：中文仪表盘数字单位用万/亿，卡密排不下就降列数。

## 图表/图标都要有悬停提示：KPI 图标、标题图标、环图分段、热力图图例

- **问题**：仪表盘里 KPI 卡图标、标题栏图标、环图分段、热力图图例悬停无任何提示——图标
  语义只有靠颜色/位置猜。
- **解法**：KPI 图标容器加 `title`（iconTitle prop）；标题图标 span 加 `title`；**SVG 图形
  元素（circle/rect）里嵌 `<title>` 子元素**即得原生悬停气泡（`h('circle', props, h('title', null, '文本'))`），
  环图分段悬停显示「模型：x tokens · n%」；热力图图例格加 `title`（无/低/中/高/极高）。
- **可复现**：N/A（惯例）。经验：凡是图表组件，每个可交互图形元素都要有 title/悬停气泡。

## skill 市场：GitHub API 列目录 + raw.githubusercontent 取 SKILL.md（raw 不限流，只列目录算 API 配额）

- **问题**：在技能管理里加「从市场安装 skill」——需要实时拉取开源 GitHub skill 集合并安装。
- **解法**：
  - 市场源 = GitHub 仓库列表（`anthropics/skills`、`obra/superpowers`、`tinh2/skills-hub-registry`），每个配 `repo` + `skillsDir`（`skills/` 或空=顶层分类目录，再下探一层找 `SKILL.md`）。
  - **列目录**用 `https://api.github.com/repos/{repo}/contents/{dir}`（走 GitHub API，**有 60 次/时配额**，一个市场只调 1-2 次）；**取文件**用 `https://raw.githubusercontent.com/{repo}/HEAD/{path}`（**不限流**，每个 skill 一次）。
  - host 用 `ctx.get('shell')` + `curl`（bilibili 已验证该通道可用）；`parseSkill` 解析 frontmatter 得 name/description；安装 = 下载 SKILL.md 原样写入 `~/.dsh/skills/<name>/SKILL.md`。
- **开源原则**：**默认直连**（不写死代理）；`config.proxy` 可选，**配置了就直接用 `-x <proxy>` 走代理**
  （不再先直连试一遍——直连被墙会白白挂满 20s），没配才直连。代理是少数人的本地配置，用
  `proxy.patch.yml` 便捷 overlay 提供，别进默认 cordis.patch.yml。
- **可复现**：是。经验：市场类功能「列目录走 API（计配额）、取内容走 raw（不限流）」；网络默认直连、
  代理是显式配置且配了就直接用，别做「先直连后回退」的双尝试。

## Dock 悬停显示旧短名（DshMac）：同一 bundle id 被 pnpm 临时副本的陈旧注册抢占

- **问题**：改完 `CFBundleName`/`CFBundleDisplayName` 并重打包、重启后，Dock 悬停名字仍显示
  旧短名（如 DshMac）；`killall Dock`、`lsregister -f` 都无效。
- **原因**：Dock 悬停显示的是 LaunchServices 注册的「短名」（CFBundleName）。同名 bundle id
  （`ai.deepseek.dsh-mac`）存在**两条注册**：一条来自 pnpm store 临时目录
  （`~/Library/pnpm/store/v11/tmp/_tmp_*/native/build/DshMac.app`，`dsh plugin add github:…`
  暂存包时留下的历史副本，带旧 Info.plist），它的陈旧短名把正确注册顶掉了；`killall Dock`
  只清 Dock 缓存、清不掉 LS 数据库。
- **解法**：`lsregister -u <pnpm副本路径>` 注销 → `rm -rf` 删掉副本 →
  `lsregister -f <真实.app>` 强制重注册 → `killall Dock`；验证 `lsregister -dump` 该 bundle id
  只剩一条且 `CFBundleName` 正确。若悬停仍显示**进程名**（可执行文件名），在 app 启动时
  （SwiftUI App 的 `init()`）设 `ProcessInfo.processInfo.processName = "<显示名>"` 兜底，再
  重启 dsh web 让新实例生效。**终极兜底**：把 bundle 目录名和可执行文件名也改成显示名
  （如 `build/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness`，SPM target 名可保留），
  让所有「文件级回退」（Dock 悬停、Finder 显示）都一致；同时删掉旧目录名的旧 bundle 并
  `lsregister -u` 注销，避免又生成陈旧注册。
- **可复现**：是（有历史 pnpm 暂存副本时）。经验：Dock 显示名不对先 `lsregister -dump` 查同
  bundle id 是否有多个注册。

## 设置页仪表盘改版：图表卡全宽一行一个；环图/热力图渲染坑（dsh-usage-dashboard）

- **问题**：半宽卡片（~280px）里 52 周热力图横向溢出滚动、24 根小时柱细成线、环图圆头分段
  互相压叠——用户反馈「统计图错乱、排版太紧凑、文字越界」。
- **解法**：所有图表卡改**全宽一行一个**（去掉 2 列 grid，KPI/概览小项仍可多列）；热力图从
  `display:contents + grid-auto-flow:column` 改成 **flex 列**
  （`.dsh-us-heat{display:flex;gap:2px}` + 每列 `.dsh-us-heat-col{display:flex;flex-direction:column}`），
  WebKit 下更稳；环图去掉 `strokeLinecap:'round'`（圆头让相邻分段重叠），用默认 butt + 1.6px 间隙。
- **按钮黑字坑**：`--dsw-alias-brand-primary` 是**中性对比色**（浅色≈近黑）且
  `button-primary-fill`=它；选中态必须 `background:button-primary-fill + color:label-primary-foreground`，
  否则黑底黑字（与并发进程「主题 token 陷阱」条目一致，实测复现）。
- **可复现**：是（浅色主题必现黑字）。

## 手写路由模型没有「思考等级」：根因是 `reasoningEfforts` 未声明（dsh-model-selector）

- **问题**：用户切到 `opencode-go2` 的 `deepseek-v4-flash` 时模型选择器没有「推理等级」菜单；
  且「搜索到的模型点击时看起来没切换」。
- **原因**（两条同一根因）：
  - `opencode-go` 是 pi-ai **catalog 路由**（`settings.yaml` 里没写 `api`/`baseURL`），模型继承
    catalog 的 `thinkingLevelMap`（如 deepseek: `{minimal:null, low:null, medium:null,
    high:"high", max:"max"}`）→ 有推理等级；
  - `opencode-go2` 是**手写路由**（`api: openai-completions` + `baseURL` + 只写 `id` 的 models），
    手写模型没有 `reasoningEfforts` 就被视为**不推理**（llm-pi-ai README：省略=无能力、`false`=
    剥除、空声明拒绝）→ 界面自动隐藏推理等级（`model.reasoning === undefined` 就不渲染该项，
    与是否我的插件无关，原版也一样）。
  - 「点击没切换」= 点击了另一路由的**同名模型**：名字几乎一样（`deepseek-v4-flash` vs
    `DeepSeek V4 Flash`），只是推理等级消失，观感像「没切换」。真实实例 Playwright 复现：点击
    切换成功、菜单关闭、无错误，root 菜单从 `["模型"]` 变成 `["模型","推理等级High"]` 只取决于
    目标模型是否带推理元数据。
- **解法**：给手写路由的模型补 `reasoningEfforts`。**只有 `off` 允许空值**（选择它=不发参数）；
  其他档位**必须给线上拼写值**，否则 `assertServiceable` 拒绝**整个分节**
  （报 `provider X model Y reasoningEfforts.minimal needs the wire value dispatch should send;
  only "off" may leave it empty`），llm-pi-ai 进入休眠、**所有自定义路由全部消失**（模型目录
  只剩 pi-ai catalog 组）：
  ```yaml
  - id: deepseek-v4-flash
    reasoningEfforts:
      minimal: minimal
      low: low
      medium: medium
      high: high
      max: max
  ```
- **陷阱**：pi-ai **catalog 的 `thinkingLevelMap` 允许 null**（minimal:null = pi-ai 内部「用模型
  默认」语义），但 **settings 接缝的 `reasoningEfforts` 更严（仅 off 可空）**——直接把 catalog
  的 null 镜像成空值会校验失败。改完 settings 必须用 harness 自己的校验跑一遍：
  schema 是**可调用函数**（`Config(section)`，不是 `.validate()`）+ `assertServiceable(v)`；
  `yaml` 包是 YAML 1.2（`off:` 裸写合法、解析为字符串键），Python `yaml.safe_load`（YAML 1.1）
  会把 `off` 读成布尔 False，别用 Python 校验。
- **可复现**：是（空档位值必现「所有模型消失」）。经验：模型目录的 `reasoning` 完全由适配器
  元数据驱动；catalog 路由继承能力、手写路由必须自己声明；官方对「openai-completions + URL
  无法识别」的推理方言姿势是路由级 `compat: {thinkingFormat: deepseek}`（会作用于整条路由，
  混合模型族慎用）。

## agent 工具环境无法 boot 任何 dsh 实例：0% CPU 挂起，与插件无关

- **问题**：在本会话 bash 工具里跑 `node --import tsx/esm apps/cli/src/bin.ts --profile X
  --port Y`（或 `pnpm dsh ...`），进程 0% CPU、无任何输出、无监听 socket、`kevent` 空转挂起；
  连 `dsh-base` 单 bundle 的最小 profile 也一样。同一条命令在用户终端（`bin.ts web`）正常。
- **排查排除**：清掉环境里全部 `DSH_*` 变量（`DSH_SESSION_ID/JSONL/WEB_URL/SHELL`）仍挂；
  目录选择器（`directory-picker-auto` 是同步解析）不是它；profile 组合（`--dump-config` 正常）。
  判断为工具执行环境对 boot 进程的某种隔离所致。
- **解法**：不再用隔离 demo 验证 client 行为；改用 **Playwright 驱动用户真实运行中的 3080 实例**
  （读 trigger/菜单/错误条），只读式验证可靠且无需起新服务。
- **可复现**：是（本工具环境）。经验：跑 DSH 相关进程验证前先确认环境；patch 的
  `- id: directory-picker, disabled: true` 在 `--dump-config` 里会报 `entry "directory-picker"
  not found`（dump 只显示 profile patch 层），真实 boot 组合里该行存在，别被 dump 警告误导。

## settings.yaml 直接改文件后热重载不保证立刻生效

- **问题**：直接编辑 `~/.dsh/settings.yaml` 给手写路由加 `reasoningEfforts` 后，运行中实例的
  模型目录**没刷新**（界面仍无推理等级）。
- **原因**：`settings-file` 用 chokidar 监听文件、llm-pi-ai 有 `installSettingsSection` 的
  `onChange` 重载路由，但外部直接改文件的事件传播到模型目录**实测未生效**（可能需应用侧保存
  或重启）。
- **解法**：改完 settings 后**重启**最稳（boot 时全量读取）。验证用 Playwright 驱动真机。
- **可复现**：是。

---

## FAB 侧边停靠：transform 滑出/滑回 + 全局 mousemove 边缘探测（dsh-bilibili-player）

- **需求**：右下角按钮平时收向屏幕右缘、**只留一个小角**（不要求完全隐藏），光标碰到右边缘
  才滑出来（「侧边隐藏」）。用户明确：不是完全藏，要留一个角落当 affordance。
- **解法**：`window.addEventListener('mousemove')` 探测 `e.clientX >= innerWidth-16` →
  `setFabShow(true)`，`< innerWidth-64` → **260ms 延时**收回（`scheduleHide`，且**悬停按钮期间
  `hoverRef=true` 绝不收回**，`onMouseLeave` 才重新计时）——大滞回区间 + 延迟 + hover 豁免，
  防「光标停在小角附近反复弹出/收回」抖动；滑动放**外层 rail**（`.dsh-bili-fab-rail`，
  `right:20px` + `transform`：显示 `translateX(0)`、隐藏 `translateX(calc(100%+10px))` 留左端
  ~10px 小角），过渡 `transform .42s cubic-bezier(.16,1,.3,1)`（平滑 ease-out）；按钮本体只管
  hover/active（`translateY(-1px)`/`scale(.97)`）——**别把内联 transform 直接放按钮上，否则会
  盖掉 CSS hover 变换**；rail `pointer-events:none`、按钮 `pointer-events:auto`。同值 setState
  React 会 bail-out，mousemove 高频触发不重渲染。
- **注意**：留小角 = 隐藏位移取 `calc(100% + 10px)`（≈ 露 10px），全隐藏则是 `calc(100% + 24px)`；
  面板打开时 FAB 不渲染，listener 无害。
- **可复现**：是（用户需求）。

## 会话日志修复的两层坑：zstd CLI 重压缩毁布局 + 恢复 .bak 只修一半（已落 cookbook）

- **问题**：上次修 seq 重复时用 `zstd -f` 把整个 `session.jsonl.zstd` 重压缩成一个 frame，
  结果 dsh 启动直接崩：`corrupt Zstandard session log: first frame is not exactly one header line`
  （boot 列举会话时读首帧，要求首帧恰好一行 header）。让 ZCode 恢复 `.bak-*` 备份后启动不崩了，
  但**打开该会话仍报「历史加载失败：seq gap in committed region」**——备份内容里 seq 133131
  重复还在。
- **原因**：① DSH JSONL 后端是 **frame-per-batch** 布局：header 单独首帧、每批写入一个 zstd
  frame；zstd CLI 整文件压缩 = 单帧，首帧解码出上万行，过不了 `assertZstdHeaderFrame`。**用
  zstd CLI 解压安全，重压缩是雷区**。② `.bak-*` 是外部工具改写前的副本，帧布局正确但**内容**
  可能本来就是坏的；恢复备份只解决了布局（启动），没解决内容（seq gap 打开失败）。
- **解法**（两步合并）：解压→明文里删掉无业务数据的重复行（`session/end-seed` 可删、
  `spliced`/`user/message` 不可删）→用 harness 自带 `compressZstdFrame` 逐行分帧重编码
  （`packages/session/session-persistence-jsonl/src/zstd.ts`，**不要用 zstd CLI**）→验证：
  ① `scanZstdFrames` 首帧恰一行 header；② `decodeStorageRecord` 走全量，seq 严格连续。
  完整流程已写成官方 cookbook：`deepseek-harness/docs/cookbook/repairing-a-corrupt-session-log.md`
  （双语，含 check/reframe/encode 三个脚本）。
- **可复现**：是（任何用 zstd CLI 重压缩会话日志都会复现启动崩溃）。
- **顺带**：改官方仓库 docs 时 `pnpm run doc-typecheck` 有 opt-out 比例红线（>50% 失败）——
  新增 `ignore-check` 代码块会把比例推过线；尽量把块写成**可编译**（用包名
  `@deepseek-ai/dsh-*` import 而非相对源码路径），配 `verify-translation-pairing --write` 重录
  i18n hash；zh 文档内容链接指向不带 `.zh.md` 后缀的目标（配对规则要求两边链接 basename 一致）。

---

## 悬浮按钮（FAB）别花哨：DSH 风格就用它自己的 FAB token（dsh-bilibili-player）

- **问题**：用户先要「高端动效」（流体极光 + 光晕 + 扫光 + 悬停展开），后改口「不要花里胡哨，
  和 DSH 界面风格一致」。花哨 FAB 与 DSH 界面违和。
- **解法**：回到原生风格——`background:var(--dsw-alias-button-floating-fill)`（hover 用
  `--dsw-alias-button-floating-hover`）、`border:1px solid var(--dsw-alias-border-l2)`、
  `color:var(--dsw-alias-label-primary)`、图标 `var(--dsw-alias-brand-primary)`；普通胶囊
  （圆角 999px、高 40px、常显文字标签），hover 仅轻微上浮 + 换面，无动画层。
- **经验**：做「贴合 DSH 界面」的控件，优先用主题表里现成的**语义 token**（button-floating-*、
  border-l2、label-primary、brand-primary），别自造视觉体系；动效类需求先跟用户确认是
  「花哨展示」还是「克制原生」，避免返工。
- **可复现**：是（用户反馈）。

## 主题 token 陷阱：brand-primary 是中性对比色；主按钮文字必须用 `label-primary-foreground`（不是 contrast-fill）

- **问题**：设置页主按钮（新增/保存）用 `background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-button-primary-fill,#fff)`，结果**浅色模式黑底黑字、深色模式白底白字，文字全看不见**。
- **原因**：`--dsw-alias-brand-primary` **不是品牌蓝而是中性对比色**——浅色=`neutral-bluish-1000`（近黑）、深色=`neutral-bluish-50`（近白）；而 `--dsw-alias-button-primary-fill` **恰好等于 brand-primary**，于是文字色=背景色，必然不可见。
- **解法（照抄 DSH 自带 UI 的按钮写法）**：主按钮 = `background: var(--dsw-alias-button-primary-fill)` + `color: var(--dsw-alias-label-primary-foreground)`（浅色=近白、深色=近黑，与背景相反）+ hover `--dsw-alias-button-primary-hover`。**`--dsw-alias-button-contrast-fill` 不是按钮文字色**（浅色下它是中灰 `bluish-700` rgb(97,102,107)，放近黑按钮上对比度低、仍然看不清）——它只用在 Toast/附件栏等其它场景。次按钮 = 透明底 + `border-l2` + `label-primary` + hover `interactive-bg-hover`；危险按钮 = 透明底 + `state-error-primary` + hover `interactive-bg-hover-danger`（无 `--dsw-alias-danger`）。开关圆点 thumb 也用 `label-primary-foreground`。
- **教训**：用主题 token 前先 `grep -r <token> packages/client/ui-theme/src/styles/design-platform.css` 确认**存在 + 语义值**（尤其名字带 brand/contrast 的可能是别的东西）；**不确定就搜 harness 自带 UI 里该按钮的实际写法照抄**（如 `grep -rn "button-primary-fill" packages/client`），别凭名字猜。可复现：是。

## B 站多 P（分P）视频：cid 按 P 不同，评论共享 aid（dsh-bilibili-player）

- **问题**：原生播放器只播第一 P，多 P 视频（`view` 的 `pages.length > 1`）无法切集。
- **契约细节**：`/x/web-interface/view` 返回 `pages[]`，每项 `{cid,page,part,duration}`；
  `data.cid` = 第一 P 的 cid，**每 P 的 cid 不同**——**播放地址（playurl）和弹幕（seg.so）
  都按 cid 取**，所以切 P 必须换 cid 重新取流/拉弹幕；**评论区按 aid**（`oid=aid`），
  全 P 共享、不用重拉。
- **解法**：Host `videoInfo` 额外返回 `pages`；Client 分 P tab 切换时 `current.cid ← pages[i].cid`
  + 重取 playurl + 重置弹幕（danmaku 加载 effect 依赖 cid 自动重拉）；iframe 回退带
  `&page=<n>`。
- **可复现**：是（2026-08 实测 BV1FRgn6pEph 两 P，cid 各异）。

## B 站发弹幕：`dm/post` 不需要 wbi，只要登录 cookie + csrf（dsh-bilibili-player）

- **问题**：原生播放器想「发弹幕」，担心要 wbi 签名（要 MD5 + mixinKey 算法，Host 又没 crypto）。
- **实测**：`POST api.bilibili.com/x/v2/dm/post` 带 cookie jar + `csrf=bili_jct` 即可——
  无效 oid 返回 `-400 请求错误`（已过登录/风控校验），**没有 -403 wbi 签名校验**；不带 cookie
  才返回 `-101 账号未登录`。参数：`type=1 oid msg progress(毫秒) mode fontsize color rnd pool=0
  plat=1 csrf`。
- **解法**：csrf 从 Netscape cookie jar 读 `bili_jct` 字段（`awk '$6=="bili_jct"{print $7}'` 或
  `fs.readText` 后按 `\t` 切第 5/6 列）；Host `curl -X POST --data`（urlencoded）即可。未登录
  jar 里没有 bili_jct → 前端隐藏发送框、显示「登录后可发送弹幕」。
- **前端配套**：发送框用 `video.currentTime*1000` 当 progress；弹幕外观（字号/透明度/速度）
  与屏蔽词过滤都在 client 侧（`dmRaw` 原始列表 + `dmBlock` 过滤出 `dmList`，换词实时重筛）。
- **可复现**：是（2026-08 实测；**用无效 oid 验证请求链，别真往别人视频上发测试弹幕**）。

## 设置页「对应风格」：用 `--dsw-alias-*` 主题 token（VSCode/ZCode 卡片风），图标只能做进页面标题

- **问题**：给自定义 `settings.section` 页做「跟其它设置页一个风格」的美化 + 图标。
- **解法**：
  - 颜色一律用 `--dsw-alias-*` token（别自造 `--ds-color-*`）：文字 `--dsw-alias-label-primary/secondary/tertiary`；卡片底 `--dsw-alias-bg-layer-1`（输入框用 `--dsw-alias-bg-base`）；边框 `--dsw-alias-border-l1/l2`；主色 `--dsw-alias-brand-primary`；悬停 `--dsw-alias-interactive-bg-hover`；危险 `--dsw-alias-danger`；主按钮字色 `--dsw-alias-button-primary-fill`。
  - 卡片：`border-radius:14px` + `border:1px solid border-l1` + `bg-layer-1` + hover `translateY(-1px)` + `box-shadow:0 4px 14px -8px color-mix(in srgb,label-primary 28%,transparent)`；标题 `18px/650` + 副标题 `12px tertiary`；字体栈 `-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC",…`。参照 `dsh-usage-dashboard`。
  - 页面标题/空态里的图标用**内联 stroke SVG**：`h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap/join:'round'})` + `h('path',{d})`，颜色 `--dsw-alias-brand-primary`（nav 图标 shell 硬编码改不了，见下条）。
  - 纯 CSS 开关：隐藏 checkbox + 轨道 `34×20` 圆角 + 圆点 `16×16`，`input:checked ~ .switch{background:brand}` + `.thumb{transform:translateX(14px)}`。
- **可复现**：是（模式）。

## 设置导航图标要改，只能 patch harness 外壳 + 重建该包 client（无 slot hook、无图表图标）

- **问题**：给自定义 `settings.section`（如「使用统计」）配图标，发现外壳 `navIcon(id)` 硬编码
  id→图标，**没有 slot 注册项**；且 `@deepseek-ai/dsh-client-ui-primitives` 里没有图表/统计
  图标（最接近的是 `IconDataOutline16`，已被 models 占用；图标都是 `fill="currentColor"` 的
  16×16 填充风格，不是 stroke）。
- **解法**：只能改 shipped 外壳 `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`
  的 `navIcon`，给 `usage-dashboard` 加一个 case，内联一个 16×16、`fill="currentColor"` 的柱状图
  SVG（3 根圆角柱，风格对齐其它图标）。
- **重建**：该包构建脚本是 `bundle`（**不是 `build`**）→
  `pnpm --filter @deepseek-ai/dsh-client-ui-settings-general bundle`（tsdown 重新打包
  `lib/client.js`）。注意这是改 harness 源码、属 fork，升级会被覆盖，需重新 apply。
- **最终决定**：本仓库**不改 harness**——已回滚该 patch 并重建还原；「使用统计」导航图标保持
  齿轮回退（与 General 一致）。想改图标只能整体替换设置外壳（过重），或接受齿轮。
- **可复现**：是。

## B 站弹幕：XML 接口已死、seg.so 是 protobuf，且字段布局与文档不符（dsh-bilibili-player）

- **问题**：换原生 `<video>` 后弹幕没了；想接 B 站弹幕接口，`x/v1/dm/list.so` 和
  `comment.bilibili.com/<cid>.xml` 都返回**二进制**（不再是 XML），按 XML 解析 0 条。
- **原因/实测**：现在只有 `x/v2/dm/web/seg.so?type=1&oid=<cid>&segment_index=<n>` 返回
  protobuf；且**实测字段布局与 bilibili-API-collect 文档不一致**：DanmakuElem 实际是
  `1=id(int64) 2=progress(毫秒) 3=mode 4=fontsize 5=color 6=midHash 7=content 8=ctime
  9=weight 12=idStr 15=attr`（progress 在 **2**、content 在 **7**，不是文档的 1/6）；
  顶层 `1=重复 elem`。必须先写通用 protobuf 解码器把首条元素各字段打出来定映射，别背 schema。
- **解法**：Host 用「curl -o 临时文件 + `fs.readBytes`（Uint8Array）」拿二进制——
  `shell.run` 的 stdout 是 **UTF-8 解码文本，装不了二进制**；base64+`atob` 只作 fs 缺失时的
  兜底。手写 ~30 行 varint/字段迭代器即可，无需依赖。分段 1..12 拉到空段为止。
- **前端弹幕引擎**：绝对定位层叠在 `<video>` 上（pointer-events:none），300ms 轮询
  `video.currentTime` 播发；滚动弹幕按容器宽/字号分道（busy-until 防重叠）、CSS transform
  线性位移；seek/切画质时清屏并二分重置游标；`prefers-reduced-motion` 下静态显示。
- **可复现**：是（2026-08 实测，字段映射已按实测固化在 `index.js` 注释里）。

## 设置页 UI 排版：内容列仅 ~612px，长文本要「缩写 + min-width:0」才不溢出

- **问题**：设置面板内容列（800px 面板 − 188px 导航，再扣 padding ≈ 612px）偏窄，4 列 KPI
  卡、半宽卡片里长模型名（`provider/model`）、工具名、大数字会溢出/换行，破坏布局、显「糙」。
- **解法**：
  - 数字缩写：Token 用 k/M/B（`fmtCompact`）；计数 ≥10 万转 compact、否则千分位（`fmtCount`）。
  - 名称缩写：模型名去掉 `provider/` 前缀、超 24 字符截断加 `…`（`shortModel`）；工具名超 26
    截断；**完整名放 `title`**，悬停仍可看全。
  - CSS 关键：flex/grid 里要让 `text-overflow:ellipsis` 真正生效，**父级必须 `min-width:0`**
    （否则 ellipsis 被 flex 默认 min-width:auto 顶破）；文本自身再加
    `overflow:hidden;white-space:nowrap;text-overflow:ellipsis`。KPI body、legend row、tooltip
    row、tool row、summary item 这些装文本的 flex 子项都补了 `min-width:0`。
- **可复现**：是（长模型/工具名在窄列必现）。经验：窄列 dashboard 先定缩写规则，再补
  `min-width:0`，最后再上视觉美化。

## macOS app 显示名：菜单栏用 CFBundleName（短名），Finder/Spotlight 用 CFBundleDisplayName

- **问题**：Dock/Spotlight 显示「DeepSeek Harness」，但菜单栏（左上角粗体 app 名）、「关于」面板仍显示「DshMac」。
- **原因**：macOS 有两处显示名：`CFBundleDisplayName` 用于 Finder/Spotlight/Dock，`CFBundleName`
  （短名）用于菜单栏、Activity Monitor、关于面板等；两者不一致时各显示各的。
- **解法**：`Info.plist` 里把 `CFBundleName` 和 `CFBundleDisplayName` 都设成同一个显示名
  （「DeepSeek Harness」）；改完重新 `make-app.sh` 打包生效。可执行文件名（SPM target）不必改，
  它不是用户可见的显示名。
- **可复现**：是。

## 替换内置「插件列表」tab：list slot 同 id shadowing 会重复导航，必须 bundle disable 原行

- **问题**：想给「设置 → 插件」只留一个带分类的「插件列表」tab。动态插件往
  `settings.plugins.tab` 注册与内置扁平列表同 id `all`，企图用 shadowing 替换它——结果
  导航里出现两个同名「插件列表」按钮（React duplicate key），且两个面板内容相同。
- **原因**：`settings.plugins.tab` 是 **list slot**，cell = `id`。shadowing 判定走
  `entriesOfSlot()`（每个 cell 取最低 priority 的 winner），但 `PluginsSettingsSection`
  的**导航 tabs 投影用的是 `ctx.slots.entries()`（原始 ledger）**，包含 shadowing 与被
  shadowing 双方、只按 `order` 排序不去重；而面板内容 `renderSlot(..., { only: id })` 又走
  `entriesOfSlot()` 只渲染 winner。两边口径不一致 → 同 id 出现两个按钮 + 两个同内容面板。
  （SlotCore：list cell=`id`、keyed cell=`key`、single=整槽；priority 升序、最低渲染；
  动态插件 `allocatePriority` 返回递减负数 `--nextPriority`，所以能盖过 priority 0 的内置行。）
- **解法**：替换内置 tab 别用同 id shadowing，改为在 **bundle 的 `cordis.patch.yml`** 里
  `- id: ui-settings-plugin-inventory` + `disabled: true` 停掉内置扁平列表，再 `insert` 自己的
  host 行 + client 注册自己的 tab。patch 层按 `dsh.profile.bundles` 顺序 apply（`composeEntries`
  把各 bundle 的 patch `flat()` 后一次 `applyEntryPatches`，增量建 entryMap），所以**后一个
  bundle 能 disable 前一个 bundle insert 的行**——本 bundle 必须排在 `dsh-web-app` 之后。
- **可复现**：是。任何想「替换」而不是「新增」`settings.plugins.tab` / list slot 现有行时都适用。

---

## 插件「内置 vs 自定义」的判定信号：`loader.entries()` 的 `moduleName` 作用域

- **问题**：怎么区分「官方仓库 160+ 内置插件」与「自己/第三方装的插件」。
- **原因**：`plugin-inventory`（host 包，提供 `remote.pluginInventory`）就是 `inject: ['loader']`
  然后 `for (const e of loader.entries())` 投影。每项关键字段：`entry.id`、`entry.options.name`
  （模块名）、`entry.options.group`（分组条目要 `continue` 跳过）、`entry.disabled`（enabled =
  `!entry.disabled`）、`entry.fiber.state`（FiberState 枚举：PENDING=0/LOADING=1/ACTIVE=2/
  FAILED=3/DISPOSED=4/UNLOADING=5，DISPOSED 映射为 phase `null`）。内置插件模块名全是
  `@deepseek-ai/dsh-*`，Harness 内置是 `cordis:*`；自定义是 `link:`/本地路径/第三方/github。
- **解法**：`moduleName.startsWith('@deepseek-ai/') || moduleName.startsWith('cordis:')` → 内置，
  否则自定义。要更精确可改判 profile 模板 bundle 清单（`@deepseek-ai/dsh-base` +
  `@deepseek-ai/dsh-web-app`）。
- **可复现**：是（官方插件都在 `@deepseek-ai/*` 作用域）。动态插件 host 半区同样 `inject: ['loader']`
  即可拿到同源数据。

---

## bundle 手动 link 安装 + `dsh.client.inject` 要含声明 slot 的包

- **问题**：新 bundle 只改 profile `package.json` 仍 boot 不到；或 client 注册 `settings.plugins.tab`
  时 slot 未声明。
- **原因**：boot 解析 bundle 走 `resolveBundleDir` → `packageDirFromAnchor` → Node `require.resolve`
  的路径探测，`link:` 依赖必须是 profile `node_modules/<pkg>` 下的**真实软链**（pnpm 建、或手动
  `ln -s`）；只写 `dependencies` 不建软链会 `cannot resolve profile bundle`。client 半区要注入声明
  目标 slot 的平台包（`settings.plugins.tab` 由 `@deepseek-ai/dsh-client-ui-settings-plugins` 声明），
  否则加载顺序/声明不保证（虽然 `ctx.slots.inject` 会等声明，但显式列上更稳）。
- **解法**：① 改 `~/.dsh/profiles/<p>/package.json`：`dsh.profile.bundles` 追加包名（**放在
  `dsh-web-app` 之后**，确保 disable 补丁能命中）+ `dependencies` 加 `"<pkg>": "link:<abs路径>"`；
  ② `ln -sfn <abs路径> ~/.dsh/profiles/<p>/node_modules/<pkg>`；③ `package.json` 的
  `dsh.client.inject` 列出 `@deepseek-ai/dsh-client-runtime` + `@deepseek-ai/dsh-client-ui-slots` +
  声明目标 slot 的包；④ `dsh web` 重启才装载 bundle。
- **可复现**：是（`dsh plugin add` 会代跑 pnpm 建软链，手动安装时这一步容易漏）。

---

## 会话日志损坏：`seq gap in committed region`（重启/并发写导致 seq 重复）

- **问题**：打开某个会话报「历史加载失败」：`corrupt session log: seq gap in committed
  region at line N (expected X, got X-1)`。原因不一定是插件，先看是不是会话日志文件损坏。
- **原因**：DSH 的 JSONL 会话日志（`~/.dsh/sessions/<cwd-mangled>/<id>/session.jsonl.zstd`）
  要求事件 seq 严格连续（0,1,2,...）。本次是 **seq 133131 被两个事件重复占用**：
  `session/end-seed`（加载时自动追加的标记，无业务数据）与 `agent/inbox/spliced`
  （一条真实用户消息）——疑似**两个 dsh 实例（如重启前后的旧/新进程、或 DshMac 与 CLI
  并存）并发写同一会话**，各自从内存里同一 seq 分配。
- **解法**（手修日志，不丢任何业务数据）：
  1. `zstd -d` 解压出明文 JSONL；用 harness 的 `decodeStorageRecord` 扫描，找到唯一冲突行
     （注意 validator 的行号 = 文件行号 + 1：header 之后从 1 计数，`eventLine` 与文件行差 1）。
  2. 删掉**无业务数据的那一行**（`session/end-seed` 是加载时自动补的标记，删除无副作用；
     保留 `agent/inbox/spliced` 用户消息），再用 `scanLog` 全量校验严格连续。
  3. `sed 'Nd' file > fixed` → `zstd -f` 重新压缩 → **先备份原文件** → `mv` 原子替换
     （注意 `chown` 保持属主/属组一致，macOS 下 /tmp 产物属组可能变成 wheel）。
  4. 用官方 `scanLog`（`packages/session/session-persistence-jsonl/lib/types/format.js`）
     验证 `issue: (none)` 且 `committedBytes == total`。
- **可复现**：是（并发写会再触发）。经验：多实例并存时别同时操作同一 DSH_HOME；改日志前
  先备份；`end-seed` 可安全删除，但 `spliced`/`user/message` 是真实用户数据不可删。

---

## bundle 用 webServer 注册路由，patch 行必须 `inject: [webServer, ...]`，否则路由静默跳过

- **问题**：设置里的「使用统计」页报「统计加载失败」（WebKit 下 JSON 解析错误显示为
  `The string did not match the expected pattern.`）；curl `/dsh-usage/api` 返回的是 SPA 的
  `index.html`（200 text/html）而不是 JSON——即 API 路由根本没注册上。
- **原因**：host 半区在 `apply` 里 `ctx.get('webServer')` 拿服务再 `webServer.register(route)`；
  但 patch 行没写 `inject`，`apply` 不等 `webServer` 就绪就执行，此时 `ctx.get('webServer')`
  是 `undefined`，代码 `if (webServer === undefined) return` 直接静默返回，路由被跳过。而
  client bundle 是 `client-modules` 扫描 `dsh.client` 单独伺服的，**照常加载**——于是页面能
  出现、但每次 `fetch('/xxx/api')` 都落到 SPA fallback，拿到 HTML 再 `r.json()` 报错。
- **解法**：`cordis.patch.yml` 的 insert 行加上
  `inject: [webServer, sessionQuery, sessionProjectionCache]`（列出 host 硬依赖的服务），让
  `apply` 等这些服务就绪再跑；`dsh web --dump-config` 能看到该行带上 `inject` 即已生效。link
  安装下改 patch 文件直接重启生效，无需重新 `dsh plugin add`。
- **可复现**：是（症状与 bilibili 的 `cordis.patch.yml` 注释一致）。经验：凡是 host 里
  `webServer.register`/`ctx.get('webServer')`，patch 行一定要 `inject: [webServer]`。

## 把多个独立 GitHub 插件仓库合并成单一 monorepo（git subtree）

- **问题**：根目录要一个 GitHub 仓库，但 4 个插件子目录各自是独立 git 仓库（各自 remote、
  `.git`），想合并成一个仓库、清掉嵌套 `.git`，又不想丢历史。
- **原因**：目录嵌套时 `git subtree add` 要求前缀不存在，且根仓库必须有初始 commit 才能
  `subtree add`（否则 `fatal: ambiguous argument 'HEAD'`）；把子仓库目录移走后 remote 指向
  会失效。
- **解法**：
  1. 根仓库先 `git init -b main` + 提交**根文档与无历史的新子项目**（初始 commit）。
  2. 把每个子仓库目录**移出根目录**（如 `/tmp/dsh-merge-src/`），`git remote add <name> <path>`
     指向移出的路径 → `git subtree add --prefix=<dir> <name> main -m "chore: merge ..."`。
     子树导入只取源 commit 的 tree，**不会带入嵌套 `.git`**；子目录内 gitignore 的
     `node_modules` 等也不会进来。
  3. 全部导入后 `git remote remove` 临时 remote、删除 `/tmp` 源目录；用 `git log` 确认
     原 commit SHA 都在图里。
  4. 更新各子项目 README 里的安装 URL：独立仓库 `github:user/pkg` 改成 monorepo 子目录
     `github:user/monorepo#<ref>&path:/<subdir>`（**pnpm 语法**：`path:` 参数、`&` 组合 ref；npm 的 `#ref:subdir` 冒号形式 pnpm 会当成 ref 解析直接报错，2025-08 分发实测修正）。
- **可复现**：N/A（一次性操作）。

---

## 动态插件 code.host/code.client 在 cordis_define 前，先用 `new Function` 本地校验语法

- **问题**：大段 client 代码里多一个 `)`（`React.createElement` 少闭合）会报
  `SyntaxError: missing ) after argument list`，`cordis_define` 直接失败，还得整段重传。
- **原因**：动态包原样接收函数体、不经任何编译器；括号不平衡只能靠解析阶段发现。
- **解法**：写完先本地跑
  `node -e "new Function('React','host','styles','ctx','harness','console','window','fetch', require('fs').readFileSync('client.js','utf8'))"`
  （函数体顶层 `return {...}` 合法，正好模拟动态包的包裹方式）；bundle 的 ESM 半区用
  `node --check index.js` / `node --check client.js`。都通过再 define / 提交。
- **可复现**：是（`content:''` 引号坑、少一个 `)` 都必现）。经验：粘贴大段纯 JS 前先过语法。

## 「使用统计」类聚合插件：listSessions + 投影缓存 + 有界深扫描，才能 <3s

- **问题**：要统计 Token / 会话 / 消息 / 按天趋势 / 模型环图，若对每个 session 读全量事件，
  会话一多就慢、内存高。参照 ZCode 使用统计（https://zcode.z.ai/cn/docs/usage-stats）的
  「应用用量」：Token/会话/消息/活跃天数 + 连续天数 + 峰值时段 + 按天趋势（悬停看各模型）+
  模型环图 + 全部/30天/7天切换。
- **解法**（两层读取）：
  - 快路径（总量）：`sessionQuery.listSessions()` 只读 header 元数据（id/createdAt/cwd）；
    `sessionProjectionCache.cachedSnapshot(header)` 是**同步、零 I/O**，读每个 turn/end 落盘的
    投影缓存，含 `sessionStats`{turns,steps,llmMs,toolMs,decodeTokens} 与
    `tokenUsage`{uncachedInputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}。
  - 明细（趋势/环图/工具排行/热力图）：`sessionQuery.readSession(id)` 全量事件，做**有界深扫描**
    ——墙钟预算(~2.2s) + 会话上限(500) + 事件上限(50万)，**新会话优先**（7/30 天视图始终完整）；
    结果在 host 缓存，首点 ≤3s、再点秒开，点刷新才 `force` 重算。
- **可复现**：N/A（模式）。经验：读统计优先走投影缓存，别一上来就遍历所有日志。

## 用量字段在 Session 事件里的准确位置

- `tool/call` 的 `data.name` = 工具名（按名计数排行）。
- `assistant/message` 的 `data.usage` = `{inputTokens, outputTokens, cacheReadTokens?,
  cacheWriteTokens?, reasoningTokens?}`；「输入」= uncached + cacheRead + cacheWrite。
- `request/header` 的 `data.header.config.model` = 当前模型；须按 seq 顺序维护 `currentModel`，
  再回填给后续 `assistant/message` 做「按模型/按天」归因。
- `SessionHeader.createdAt` 用于按天聚合会话数、`header.cwd` 分组工作区。
- 事件时间 `event.time`（Unix ms）→ `new Date(t).getHours()` 做峰值时段、`getFullYear/Month/Date`
  做按天分桶（本地时区）。
- **可复现**：是（2026-08 实测，`@deepseek-ai/dsh-session` 的 `SessionEventMap` 为准）。

## `settings.section` 左侧导航图标由外壳按 id 硬编码，非内置 id 回退齿轮

- **问题**：想给自定义 section（如「使用统计」）配一个统计图图标，结果不是自己的图标。
- **原因**：设置外壳的 `navIcon(id)` 只映射 `models`/`agent-presets`/`plugins` 三个 id，
  其余（含 `general`、任意自定义 id）一律回退 `IconSettingsOutline16` 齿轮；Slot 没有
  「导航图标」注册项，不能从插槽注入图标。
- **解法**：接受齿轮（与 General 一致，风格统一）；页面内部的统计图图标用自绘内联 SVG。
  `order` 越大越靠下——做「左下角入口」用大 order（如 100，排在 general=0/models=10/
  plugins=15/agent-presets=20 之后）。
- **可复现**：是。

## headless 自动化 DSH Web GUI（截图 / e2e）的几个坑

- **问题**：想用 Playwright 自动「连接工作区 → 打开模型选择器 → 截图」，卡在「点『选择工作区』
  没反应、`getByRole('dialog', {name:'选择工作区目录'})` 永远等不到」。
- **原因**：① macOS 上 `directory-picker` 默认 `-auto`，会解析成**原生目录选择器**（无 DOM，
  headless 点不到）；② patch 层不能改已有行的 `name`（`--dump-config` 报
  `name mismatch ... skipping`），所以没法直接把 `-auto` 换成 `-browse`。
- **解法**：
  - **隔离环境**：设临时 `DSH_HOME`（`DSH_HOME=/tmp/xxx`）。模型分组来自
    `$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers`（热重载，无需重启；手写 provider 用
    `api: openai-completions` + `baseURL` + `models:[{id,name,contextWindow,maxTokens}]`）。
    profile 也要放同一 `DSH_HOME/profiles/<name>/`（`dsh plugin` 带 `DSH_HOME=...` 再 add）。
  - **pin 浏览器目录选择器**：`- id: directory-picker, disabled: true`，再 `insert` 两行
    `@deepseek-ai/dsh-host-directory-picker-browse` + `@deepseek-ai/dsh-client-ui-directory-picker-browse`
    （只能 disable+insert，不能靠改 name）。
  - **Playwright 版本与已装 chromium build 不匹配**时（报 `Executable doesn't exist ...
    chromium_headless_shell-XXXX`）用 `chromium.launch({ executablePath: '<本机已装 chromium>' })`。
  - `getByRole('...', { name })` 是**子串匹配**：`name:'GPT-4o'` 会同时命中 "GPT-4o mini"，
    要 `exact: true`。
- **可复现**：是。经验：隔离 demo 一律走临时 `DSH_HOME`；目录选择器要可自动化就 pin browse。

## Client 平台 Inspect 查询会挂起——契约优先读 harness 源码

- **问题**：`cordis_inspect_query` 查 Client 平台的 Service/Slot 时一直 pending，最后超时被取消
  （本次会话卡了约 55 分钟）。
- **原因**：Client 查询要**浏览器页面实时应答**；没有对应活页面（或页面未响应）就永远等。
- **解法**：契约优先读 harness 源码 checkout（如 `packages/client/ui-model-selection/src/`、
  `packages/client/runtime/src/client/slots.ts`、`.agents/notes/implemented/architecture/`），
  比 Client inspect 更可靠；Client inspect 只在确有活页面时做补充确认。单槽位遮蔽语义在
  `packages/client/ui-slots/src/index.ts` 的 `SlotCore.register`（`priority` 升序、最低渲染，
  同 priority 第二次注册会 throw）。
- **可复现**：是。

## tsdown 自包含构建 client bundle 的三个细节

- **问题**：自包含 tsdown 双半构建，node 半输出成 `lib/index.mjs` 而非 `lib/index.js`；client 半
  `external` 报警告。
- **原因**：`platform:'node'` + ESM 默认 `fixedExtension:true` → 强制 `.mjs`；tsdown 0.22 起
  `external` 已废弃。
- **解法**：
  - node 半加 `fixedExtension:false`（配合 package.json `type:"module"`）输出 `lib/index.js`。
  - client 半用 `deps.neverBundle: ['react','react/jsx-runtime']` 替代 `external`。
  - client 半必须 CJS + `outputOptions.banner/footer/intro` 包成
    `window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports } })`；
    加上 `exports["./client"]` + `dsh.client.platform="web"` 才会被 client-modules 扫进 `__DSH_BOOT__`。
- **可复现**：是。

---

## link 安装的 bundle：依赖（yaml 等）必须沿插件「真实路径」解析，否则 boot 报 Cannot find package

- **问题**：`dsh plugin --profile web add /path/to/plugin`（link 到本地源码）后，`pnpm dsh web`
  启动即失败：`Cannot find package 'yaml' imported from /path/to/plugin/index.js`
  （`ERR_MODULE_NOT_FOUND`）。用户视角表现成「插件没加载成功 / 重启后找不到插件」。
- **原因**：`link:` 安装是符号链接指向本地源码；Node ESM 解析 `import 'yaml'` 时按**真实路径**
  向上找 `node_modules`，不会去 profile 的 `node_modules` 找。本地源码目录没跑过
  `npm install`，就没有 `node_modules/yaml`。git 安装（`dsh plugin add github:...`）没这问题：
  pnpm 会把依赖装进 profile，包的真实位置在 `.pnpm` store 里、依赖可解析。
- **解法**：在插件目录跑一次 `npm install`（或 `pnpm install`）生成 `node_modules/`；README 里
  加一句「本地/link 开发先 `npm install`，git 安装自动拉依赖」。
- **可复现**：是。经验：link 开发模式下，插件的外部依赖必须能沿插件**真实路径**被解析到。

## 可分发 bundle 别直接 import harness 包（defineTool 的 peer 依赖在 pnpm 下会缺）

- **问题**：为注册模型工具，`import { defineTool } from '@deepseek-ai/dsh-tools'`。用 npm 装依赖
  时测试通过，但 `dsh plugin add`（底层 pnpm）装完 boot 失败——`dsh-tools` 运行时又 import 了
  `@deepseek-ai/dsh-llm`/`dsh-session`/`dsh-scope`/`cordis` 等 peer，pnpm 不自动装 peer，
  加载时缺模块。
- **原因**：`dsh-tools` 把这些 harness 包声明为 `peerDependencies`（供 workspace 内使用）；
  独立插件里它只是普通依赖，pnpm 不补齐 peer。
- **解法**：手写工具定义对象传给 `ctx.tools.register`（`{ name, description, parameters: 原始
  JSON Schema, output: { schema, render }, execute }`），不 import `defineTool`；让插件唯一运行
  时依赖是 `yaml` 这类「无 peer 依赖的叶子包」。写前先读 harness 的 `defineTool`，看它把
  property-map 编译成什么 raw schema，照着填。
- **可复现**：是。经验：独立 bundle 的运行时依赖只留叶子包；harness 能力一律走 `inject` +
  `ctx.<service>`，别 `import`。

## 在设置里新增一个 section：`settings.section` 槽位、order 值、临时实例验证

- **问题**：想在 Web 设置的左侧导航加一个页面（如「技能管理」「使用统计」）。
- **解法**：
  - client 半区 `ctx.slots.inject('settings.section', () => ctx.slots.register({ name:
    'settings.section', id: '<key>', order: <n>, label: () => '显示名' }, Component))`；
    `label` 是**函数**（返回字符串），组件只拿到 `{ close }`。
  - 内置 section 的 order：general=0、models=10、plugins=15，新页面用 20（排 plugins 之后）。
  - host↔client 通信走同源 HTTP：`ctx.get('webServer')` 有值时
    `ctx.effect(() => webServer.register({ kind:'exact', path:'/xxx/api', handler }))`，
    client 里 `fetch('/xxx/api?...')`。
- **验证**：起临时实例 `pnpm dsh web --port 3090`，`curl /plugins/<pkg>/client.js`（应 200）
  和 `curl /<pkg>/api?...`，确认双半区都伺服正常再关。注意 `dsh web` 就是 `dsh --profile web`，
  profile 在 `~/.dsh/profiles/web`，`pnpm build`/`pnpm dsh web` 并不安装插件——装插件是
  `dsh plugin add`，装完要重启才生效。
- **可复现**：是。

## 直连 github.com 超时，git push / curl 都要走本地 7890 代理

- **问题**：`git push`、`curl https://github.com` 直连失败（"Couldn't connect to server"，
  约 75s 超时）；但本机跑着一个代理（ClashX / V2Ray 等，监听 `127.0.0.1:7890`）。
- **原因**：本机到 `github.com:443` 的直连不稳/被墙；代理在本地 7890 端口，但 git/curl 默认
  不走它（没有 `http_proxy`/`https_proxy` 环境变量，也没配 git 全局代理）。
- **解法**：临时走代理（不改全局配置）：
  - 探测代理端口：`nc -z -w1 127.0.0.1 7890`（其它常见端口 1087/1080/8888 也试试）
  - git：`git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push`
  - curl：`curl -x http://127.0.0.1:7890 -o /dev/null -w '%{http_code}\n' https://github.com`
- **可复现**：是（取决于网络环境）。经验：github 直连失败，先查本地代理端口，别急着换命令。

## macOS Dock 图标显示成直角方块，而 Spotlight/「应用」搜索里是圆角

- **问题**：`dsh-mac-desktop` 插件用 `spawn` 直接 execve 原生二进制拉起窗口，Dock 图标是
  直角方块；但同一个 `AppIcon.icns` 在 Spotlight /「应用」搜索里是圆角矩形。
- **原因**：Dock 对运行中应用的图标圆角依赖 macOS 的 squircle 遮罩，遮罩只在 bundle 图标
  （CFBundleIconFile，走 LaunchServices）路径上生效。裸 `spawn` 拉起时：即使 `lsappinfo` 显示
  bundle path 正常，手动设的 `NSApplication.applicationIconImage` 也会覆盖 bundle 图标且不套
  遮罩；另外我曾把图标预切成「透明圆角」的非标准资源，反而让 Dock 更不稳定。标准做法是图标
  资源保持**满幅方形（不透明）**，交给 macOS 自动套圆角遮罩。
- **解法**：插件改用 `/usr/bin/open -n <App.app> --args …`（走 LaunchServices）拉起；**不要**设
  `applicationIconImage`；图标资源改回满幅方形（CoreGraphics `addRect` 全幅，不预切圆角）。
  进程清理交给 App 的 `--parent-pid` 孤儿守护（`open` 没有子进程 PID 可 kill）。
- **可复现**：是。经验：macOS 桌面图标别自己「预圆角」，资源满幅 + 走 LaunchServices 才是正道。

## 动态 Cordis 插件里 Client 无法使用 MediaSource / fetch——「登录联动画质」只好用 mp4

- **问题**：`dsh-bilibili-player` 想用 DASH + MediaSource(MSE) 实现 1080P/4K 原生播放，
  让画质选择真实吃到 B 站登录态。
- **原因**：DSH 的动态 Client 是沙箱环境——网络走 `host.call`、样式走 `styles`，并没有暴露
  `MediaSource` / `fetch` 等宿主全局；audio/video 分轨的 MSE 方案在沙箱里做不了。
- **解法**：退而用 `fnval=1` 的单文件 mp4（最高约 720P，登录联动）；要更高画质就回退官方
  iframe 播放器。取流失败时已自动回退 iframe。
- **可复现**：是。经验：写动态 Client 前，先确认要用的宿主能力是否在沙箱里存在。

## 浏览器 `<img>` 直连第三方 CDN 会带 `localhost` Referer 被 403（防盗链）

- **问题**：B 站封面 / 头像在浏览器直接 `<img src>` 会 403。
- **原因**：图片 CDN 按 `Referer` 防盗链；浏览器里 `<img>` 会带上 `http://localhost…` 的
  Referer，第三方不认识。
- **解法**：Host 用**正确 Referer** 下载图片 → 转 `base64` data URI 返回给前端，彻底绕开
  防盗链与 Referer 问题。
- **可复现**：是。经验：跨域名取第三方图片，优先在 Host 侧代理并转 data URI。

## 调用第三方 API 要带 UA / Referer / Cookie；浏览器 `fetch` 带不上这些头

- **问题**：B 站 web API 在很多端点上要 UA / Referer / Cookie，浏览器直连（甚至 `web.fetch`）
  带不上。
- **原因**：浏览器 fetch 由页面策略约束，无法随意设置任意的 UA/Referer。
- **解法**：Host 经 `ctx.shell` 跑 `curl`（可自由设头、带 cookie jar）；登录 cookie 由 Host
  落盘、供后续接口与取流共用。
- **可复现**：是。经验：需要自由控制 HTTP 头的请求，放 Host 用 `shell`/`subprocess` 跑。

## Host 登录态（cookie jar）与浏览器 iframe 官方播放器的登录态互相隔离

- **问题**：扫码登录把 cookie 存进 Host 的 jar，但 chrome 里的 iframe 官方播放器用的是
  **浏览器自己的 cookie**，两者不互通。
- **原因**：Host 进程 与 浏览器页面是两个 cookie 边界。
- **解法**：弃用 iframe，改用**原生 `<video>` + Host 转流代理**（代理给请求补
  `Referer: bilibili.com`、转发 Range/206），使画质真正吃到 Host 登录态。
- **可复现**：是。

## 动态插件 code.host / code.client 是纯 JS，别写 TS/JSX/import

- **问题**：糊着 `import`、`<Component />` 写动态 Client 加载即报错。
- **原因**：动态 Cordis 包不经过 TS/JSX/bundler 变换，`cordis_define` 原样接收函数体。
- **解法**：Client 用 `React.createElement(...)`；不用 `process`/`window`/`fetch` 等未经验证
  的全局；副作用一律 `ctx.effect()` / `ctx.on()` 注册。
- **可复现**：是。经验：写动态插件前读 `cordis-plugin-development` skill 与 Inspect 输出。

## bundle 与动态插件的取舍：要不要构建、要不要预编译

- **问题**：插件该做成哪种，才能本地 / git 装得省事。
- **经验**：纯 ESM、零依赖的（如 `dsh-skill-manager`）直接做成 bundle，git 安装无需 `prepare`
  脚本、无需 `allowBuilds`；要 TS/JSX 的（如 `dsh-model-selector`）用自包含 `tsdown` 双半
  构建并**把 `lib/` 一并提交**，这样本地/git 安装都直接解析产物、无需现场构建。
- **可复现**：N/A（设计取舍）。

## bundle 的浏览器半区：`dsh.client` + `inject` + 单槽位替换

- **问题**：想增强 DSH 现成 UI 的某一个座位（如模型选择器），而不是自绘一整套。
- **经验**：声明 `dsh.client.platform = "web"` + `inject` 需要的 `@deepseek-ai/dsh-client-*`
  平台包；浏览器半以**低于原版占位者的优先级**接管同一 Slot（单槽位替换），并读写原版给的
  共享服务（如 `ctx.modelDirectories`），实现「换座位、不改组合其余部分」。
- **可复现**：N/A（模式）。

## host 行等待 `webServer` 服务的顺序问题

- **问题**：`dsh-mac-desktop` 要等 Web server 起来再拉原生窗口，一启动就拉会找不到服务器。
- **解法**：patch 层**在提供 `webServer` 的 bundle（dsh-web-app）之后应用**，host 行
  `inject: ['webServer']`，只在拿到该服务后才拉起 App；并监听卸载（`terminateOnDispose`）关
  窗，避免 stop/update/remove 留残留进程。
- **可复现**：是。经验：依赖其它 bundle 提供的服务时，patch 顺序与 `inject` 缺一不可。

## 动态 Cordis 插件不跨重启、要持久化就转 bundle

- **问题**：`cordis_define`/`cordis_run` 定义的动态插件是**进程内**的，`pnpm build` +
  `pnpm dsh web` 重启后即丢失（Inspect 报 `no dynamic plugin ... in this process`）。
- **解法**：转成持久化 bundle（`dsh.bundle.patch` + `dsh.client` + `cordis.patch.yml`），
  用 `dsh plugin add/enable/disable` 开关，每次 `dsh web` 自动加载。
- **通信改造**：持久化浏览器半区不用动态插件的 `harness.handle`/`host.call`，可走
  **同源 HTTP**（Host 用 `webServer.register` 暴露 `/xxx/api`、`/xxx/video` 路由，Client 用
  `fetch`/`<img>`/`<video>` 调用），免去 typert remote 代码生成；Client bundle 需按
  `window.__ModuleLoader__.load({ id: <包名>, factory: (require) => ... })` 打包，且
  `exports["./client"]` + `dsh.client.platform="web"` 才会被 client-modules 扫描进
  `__DSH_BOOT__`。
- **可复现**：是。经验：host.js/client.js 粘贴式只是「源码副本」，别当持久安装。

## B 站类第三方站点：Referer 防盗链 / 登录态隔离 / MSE 上限

- **图片**：`hdslb.com` 封面/头像对非 `bilibili.com` Referer 返回 403（localhost 也一样）；
  `referrerPolicy` 在沙箱 Client 不可靠——**Host 用正确 Referer 下载转 base64 data URI**
  最稳。
- **视频**：CDN 流要求 `Referer: bilibili.com` 且支持 Range/206；用 Host `webServer` 路由
  做**转流代理**（subprocess spawn curl `-o -` 管道 + 转发 Range + Content-Range），浏览器
  原生 `<video>` 即可播放。取流带登录 cookie → 画质与登录联动。
- **画质上限**：`fnval=1` 单文件 mp4 最高约 720P；1080P/4K 需 DASH（fnval=16）+ MSE
  （音视频分轨）——实现复杂且需要 `MediaSource`，本项目未做，回退官方 iframe。
- **扫码登录**：`qrcode/poll` 的真实状态在 **`data.code`**（外层 `code` 恒 0），读错层会
  误判「未扫码」为「登录成功」。
- **可复现**：是（2026-08 实测）。

## UI 动效：参考来源、实现手法与踩坑（dsh-bilibili-player）

- **参考来源（Obsidian 知识库「动效网站」笔记）**：origin kit（发光卡片、光标跟随、
  背景动画等即搬即用组件）、arlen's vault（发光卡片、流动界面）、GSAP（丝滑、专业缓动）、
  Impeccable / taste（**克制是硬原则**：无意义动效、滥用渐变、堆叠阴影都是反模式；留白、
  层次、节奏感优先）。笔记是视频摘要、没有可直接复制的代码，因此按「风格取向」自实现。
- **高端动效按钮（纯 CSS，零依赖）**：流动渐变 + 呼吸光晕（blur 径向层）+ 悬停展开标签
  （width/max-width 弹簧缓动 `cubic-bezier(.22,1.2,.36,1)`）+ 扫光（skew 高光层）+ 按压回弹。
- **流体极光背景**：`inset:-45%` 放大层 + 4 团 `radial-gradient` 色斑（粉/玫红/紫/淡蓝）
  叠成 mesh，`translate3d/rotate/scale` 慢速漂移（16s alternate）+ `blur(6px) saturate(1.25)`；
  图案纹理 = `repeating-linear-gradient` 细线 + `radial-gradient` 点阵，`mix-blend-mode:overlay`。
- **光标跟随 spotlight**：`onMouseMove` 往元素写 CSS 变量 `--mx/--my`，叠加层
  `radial-gradient(... at var(--mx) var(--my))`，比 React state 逐帧重渲染高效。
- **层级坑**：绝对定位背景层默认画在行内内容（图标/文字）之上——图标/文字/扫光必须
  `position:relative; z-index` 抬层。
- **引号坑**：CSS 整体嵌在单引号 JS 字符串（`styles.insert('...')`）里，CSS 中出现单引号
  （如伪元素 `content:''`）会**打断 JS 字符串导致解析失败**（SyntaxError）——改用真实子元素
  代替伪元素，或让 CSS 只出现双引号。动态 client 用 `styles.insert`；持久化 bundle 用
  `document.createElement('style')` + `ctx.effect` 回收。
- **可及性**：全局 `@media (prefers-reduced-motion: reduce)` 关闭动画/过渡；动效全部
  走 CSS（transform/opacity/background-position），避免 layout 抖动。
- **可复现**：是（2026-08 实测，`content:''` 必现解析错误）。
- **dsh-dream-skin client bundle 结构 bug：settings nav icon 区块漏出 apply()（浏览器端 "ctx is not defined" 导入失败）**：
  症状 = 服务端 `dsh web` 启动正常，但浏览器（含 mac desktop 的 WKWebView）顶部报
  `Failed to load plugins / failed to import loader entry <hash> (dsh-dream-skin): Can't find
  variable: ctx`（Safari 措辞，Chromium 为 `ctx is not defined`），换肤功能完全不可用。
  根因 = `lib/client.js` 里 `//#region dsh-dream-skin: settings nav icon patching` 整个区块
  （createPaletteSvg / patchNavIcon / navObserver / `ctx.effect` 注册）被放在了
  `function apply(ctx)` 的闭合括号**之外**、factory 顶层——client-modules 执行 factory 顶层
  代码时 `ctx` 不存在（Node 环境先抛 MutationObserver 未定义）。排查路径 = 浏览器端导入
  错误别在打包产物里猜：页面 HTML 内嵌模块清单 JSON（`{"id","url"}` 行），Node fetch bundle
  + 执行 factory 即可复现并拿到真实堆栈（缺的浏览器全局用垫片补齐）。修复 =
  用括号匹配脚本把 apply() 的闭合 `}` 移到 `//#endregion` 之后（`node --check` 验证；
  **lib/client.js 无构建步骤，bundle 即源，手改即生效**；profile 是 `link:` 软链，
  改仓库副本后重启 dsh web + 页面硬刷新即可）。教训 = region 注释块编辑时容易漂移到
  函数外，手编 bundle 改完必须过语法检查 + 浏览器实测；**可复现**：改动前重启 dsh 后
  浏览器必然报该导入错误。
