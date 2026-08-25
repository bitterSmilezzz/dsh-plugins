# 新增 / 实现 / 增强（61 条）
- **dsh-asr-voice 优化模型收敛到 DSH 已配置模型（2026-08-25，功能）**：问题=用户要求「提示词优化只能选择当前 dsh 配置好的模型，要自定义得走原生的模型列表添加」——撤销上一轮的插件独立 OpenAI-compatible 配置。解法=①删掉 optimize.llm 的 baseUrl/apiKey/model，改 `{provider, model}`（从 DSH 模型列表选，空=当前所选）；②host 新增 /api/asr-voice/models 枚举 DSH 已配置模型：`ctx.llm.listProviders()`（LlmProviderInfo{id,name}）+ `ctx.llm.listModels(provider)`（LlmModelInfo{provider,id,name}），单 provider 枚举失败 try/catch 给空列表不阻断；③/optimize 请求体 `{text, provider?, model?}`，指定时校验由 ctx.llm 自然拒绝（未注册 provider 报错），缺省走 agentDefaultModel.currentSelection()；④设置卡片 LLM 区改 ModelPicker 两级选择（provider→model 级联，留空=当前所选），提示「自定义请到 DSH 模型列表添加」。**坑**=①listModels 对部分 provider 会抛错（不可枚举），必须逐 provider try/catch；②改动 schema 后旧 settings 里残留 baseUrl/apiKey 字段被新 schema 忽略，无需迁移（DEFAULT 兜底）；③ModelPicker 的 select 空 value 代表「当前所选（默认）」，provider 为空时 model select 需 disabled。**验证**=typecheck+build+热重载；/models 返回完整列表（dimagent-oauth/deepseek-official/opencode-go/opencode-go-2 各带 models）；/optimize 指定 provider/model→200。可复现?是。
- **dsh-asr-voice 提示词优化默认用当前所选 LLM（2026-08-25，功能）**：问题=用户要求「提示词优化默认使用当前所选 llm」——原设计是优化默认 heuristic、LLM 模式需插件单独配 OpenAI-compatible 配置（grilling Q9 曾选独立配置）。解法=①默认模式 heuristic→llm；②host /optimize 双后端：独立配置（baseUrl/apiKey）优先，否则走 **ctx.llm.stream + ctx.agentDefaultModel.currentSelection()**（DSH agent-default-model 服务实时读 settings 的 provider/model，含 reasoningEffort）——零额外配置即用当前模型，API key 由 DSH provider 管理；③inject 加 llm、agentDefaultModel。**坑**=①dsh-agent-default-model 不在插件构建 node_modules（DSH 运行时 peer），直接 import 会 TS2307——用 `ctx.get('agentDefaultModel')` + 结构类型（currentSelection 最小面）访问，保持构建零依赖、符合独立性契约；②StreamChunk.finish.reason 是对象 `{kind:'error',failure}` 不是字符串，`chunk.reason==='error'` 会 TS2367 且运行时永不命中——要 `chunk.reason.kind==='error'`；③GenerateOptions 的 messages 用官方 createUserMessage({content:[{type:'text',text}],source:{kind:'plugin',plugin:'dsh-asr-voice'}}) helper（Message 需 id/role/content/source，别手拼）。**验证**=typecheck+build+热重载（inject 变 webServer/settings/llm/agentDefaultModel）+ 真实 POST「嗯那个帮我写一段Python代码然后呢…」→200「帮我写一个Python程序，然后打印出当前的时间。」（当前模型 deepseek-v4-flash，未配独立 LLM）。可复现?是。
- **dsh-asr-voice 设置页排布对齐官方 + 按钮溢出修复（2026-08-25，UI）**：问题=用户第四轮指出「左对齐/右对齐排布要和官方一致、按钮文字溢出要修」。查证=官方 checkbox 排布是 checkbox 与文本同行左对齐（ModelListEditor candidateLabel：`<label><input><span>`）；官方文本字段（ValueField）是 label/控件/hint 全左对齐、input 占满整行。解法=①ToggleRow 从「label 上行 + checkbox 下行」改为官方 checkbox 行：`.dshav-toggle`（checkbox+标题同行左对齐）+ desc 作 hint 下行；②input 从 width:100% 改 `flex:1;min-width:0;width:auto`（在 flex 容器里占满剩余、清除按钮不挤出）；③按钮加 `white-space:nowrap;text-overflow:ellipsis;max-width:100%` 防文字溢出；④状态提示条加 max-width + overflow 防长错误文本溢出屏幕。**坑**=①flex 容器里子 input 用 width:100% 会把同容器按钮挤出，应 flex:1+min-width:0（唯一溢出根因）；②checkbox 走独立 .dshav-toggle 行而不是 .dshav-field 包（后者 flex:1 会把 checkbox 撑满整行）。**验证**=typecheck+build（74.24KB）+热重载+bundle 含 nowrap/ellipsis/dshav-toggle+路由正常。可复现?是。
- **dsh-asr-voice 设置页按钮/分割线/组件最终对齐官方原生（2026-08-25，UI）**：问题=用户第三轮指出「分割线和按钮的风格还有各个组件的设计参照原生」——前两轮对齐了折叠交互和控件，但按钮还是自定义圆角（radius 8、accent 蓝底）、groupTitle 还是 uppercase 大写标题，分割线/输入框宽度也未完全按官方。解法=①**按钮完全照官方 ui-primitives Button**：胶囊形（md radius 18/h36/font14，sm radius 14/h28/font12）、primary=--dsw-alias-button-primary-fill 反色族（非品牌蓝 accent！）+ hover --button-primary-hover、outline=透明+border-l2+hover --interactive-bg-hover、disabled opacity .4、focus 2px brand 环；移除自定义 scale 按压（官方用背景色变化不是缩放）。②**分割线**：分组间 `.dshav-group + .dshav-group` 加 border-top，与字段间/body/footer 统一 --dsw-alias-border-l2。③**groupTitle 去 uppercase**：官方无大写标题风格，改 13px/600/label-secondary。④**输入框宽度**：官方 ValueField 的 input 占满字段列（width:100% + .dshav-field-control flex:1 + .dshav-field:has(checkbox) 除外），select 保持 max-width 240 下拉宽。**坑**=①官方 primary 按钮是 label-primary 反色（--button-primary-fill 族）不是品牌 accent——照抄 Button.module.css 的 token 族，别自己发明；②官方按钮无 :active 缩放反馈（用 --interactive-bg-hover/active 背景变化），带 scale 反而不像原生；③checkbox 的 label 若 flex:1 会撑满整行，用 :has(input[type=checkbox]) 限定不撑满。**验证**=typecheck+build（73.59KB）+热重载 web profile+bundle 含 button-primary-fill/outline/sm+路由正常。可复现?是。
- **dsh-asr-voice 设置页原生对齐 + 录音动效提升（2026-08-25，UI/动效）**：问题=用户两次指出：①设置页 UI 风格没达到其他设置页原生；②麦克风点击后的动效不好看。流程=先 /grill-me 用 grilling 审一轮，查清事实（官方 PluginCard.module.css 视觉规范、ui-settings-plugins fields.module.css 字段布局、frontend-design-masterclass/references/microanimations.md 动效哲学）后把三个根决策问给用户，全部确认：呼吸光环+实时频谱条 / 按钮旁状态条+动效 / 字段完全对齐官方垂直布局。解法=①**卡片完全对齐官方**：shell 对齐 PluginCard（hover border label-dimmed、cardOpen 态 bg-layer-2+border、header focus-visible outline 2px brand、body margin 0 16px）；字段从水平行重构为官方 fields 垂直布局（label/control/hint 三行 + 字段间 border-top + padding 12 0）；全部 --dsw-alias-* 变量跟随明暗主题。②**录音动效**：呼吸光环升级（back.out 缓动 + 错开延迟 i*0.24 + 奇偶环变化幅度/时长 + 光晕 box-shadow，非机械同步）；实时频谱条（recorder 加 onLevel 回调：cloud 引擎从 AnalyserNode 输出真实 RMS×4 归一化，browser 引擎用平滑伪随机模拟能量——Web Speech 不暴露音频流，实测取真实需额外 getUserMedia 会双开麦克风有风险，故 browser 用装饰性模拟）；频谱条 12 根柱 CSS 变量 --level 驱动高度、每柱 --bar 系数错落，避免每帧 React 渲染；状态提示条滑入动画 dshav-hint-in（.22s ease-exit）+ 呼吸点 + 转圈 spinner；按钮 hover svg scale 1.1 / active scale .9 / recording 红点呼吸；Motion tokens（--ease-enter/exit/bounce 非对称，enter>exit）集中到 [dsh-asr-voice] 根，reduced-motion 全关。**坑**=①exactOptionalPropertyTypes 下透传 `desc?: string` 给 `Field` 报 TS2375，Field 的 desc 声明要 `string | undefined`；②前端 skill 库的 skill_search 搜不到（不在 session catalog），但本地 dsh-skills/dsh-design 有 frontend-design-masterclass 可读文件直接取 microanimations 参考——grilling 事实优先，不必非要 skill_load；③CSS 变量驱动动效（--level/--bar）比每帧 React setState 高效得多，频谱用这个模式。**验证**=typecheck+build（72.75KB）+ 热重载 web profile active + bundle 含 dshav-spectrum/dshav-card-open/dshav-field-item/back.out + 路由正常。可复现?是（改样式源码→build→热重载即可复现）。
- **dsh-asr-voice 新建：DSH 语音输入 + 提示词优化插件（2026-08-25，新建/插件/跨平台）**：问题=用户要一个类似 Codex 语音输入的 DSH 插件（说话→识别→提示词优化→填入/发送），设置页可配 ASR 模型，跨 macOS/Windows，public 仓库，开发约束参照伞仓库 AGENTS.md，动效用 gsap-skills、UI 参考前端设计 skill。流程=先用 grill-me/grilling 技能把需求映射成设计树三轮收敛（根决策→二级→收尾，全部用户确认）：①混合 ASR（默认浏览器 Web Speech 免费免 key + 可选云端 OpenAI-compatible）；②优化=本地启发式默认 + 可选 LLM（走 host 代理）；③入口=输入框工具行按钮（conversation.input.right）+ 可选快捷键；④识别后填 draft + 可选自动发送（默认关）；⑤语言 zh+en 跟随系统；⑥GSAP 波纹+状态过渡+设置页微动效；⑦云端预置 OpenAI/Groq+国产（硅基流动、通义 Qwen-ASR——web_search 核实两家确认提供 OpenAI-compatible /audio/transcriptions）；⑧API key 存 host settings 服务端代理；⑨独立性契约（用户强调）：与 dsh-ui-tweaks 互不依赖/可单独用/可组合用。解法=新建独立仓库 dsh-asr-voice（双半区，模型参考 dsh-ui-tweaks）：host=settings namespace asr-voice + /api/asr-voice/transcribe（raw body 转发 FormData→上游 /audio/transcriptions，Node 全局 fetch）+ /api/asr-voice/optimize（LLM chat completions 重写）+ 信任围栏（回环 host/origin 防 CSRF）+ MAX_AUDIO 25MB；client=工具行麦克风按钮（inputActions.setDraft/submit，standard kit 自动注入）+ 设置卡片（settings.plugin.item）+ 快捷键（Ctrl+Shift+Space，hold-to-talk 可选）+ 本地启发式优化器（去语气词/补标点/分段/拉丁句首大写）。**坑**=①写工具把 `/d/workspace` 解析成 `D:\d\workspace`（多一层 d），bash 是 `D:\workspace`——写文件用 `D:/workspace/...` 形式，bash 用 `/d/workspace`；②离线环境无 gsap 包、npm install 会删掉 junction node_modules——自研 GSAP 风格轻量动画模块（to/fromTo/timeline，rAF 实现，API 对齐 GSAP，后续可一行换真库）；③PATH 默认 node 是 v14（nvm 里 v22 可用），tsdown 需 node:stream/promises（Node 18+）——build.sh 自动探测并前置 nvm v22；④schemastery 无 z.infer，用全局 `Schemastery.TypeT<typeof schema>`；⑤Node Buffer 非 BlobPart（Uint8Array<ArrayBufferLike>），转 `new Uint8Array(buf)` 拷贝；⑥`if(x) void f() else` 单行在 TS6 解析报错，改花括号；⑦locale namespace 需 declare module 增强 LocaleNamespaceMap；⑧slot 标准 kit（useInput/inputActions）经 sessions.provide 自动注入，组件用结构类型声明即可（参照官方 paste-input 模式）。**验证**=tsc host/client 双 program typecheck 过；build.sh 产 lib/（host）+ lib/client.js（64.8KB/gzip 18.6KB）；npm pack tgz 65.4KB 无 node_modules；dev_install_package 热装进 web profile 与 dsh-ui-tweaks 并存（组合可用）；真实 DSH web 服务 3080 上 /api/asr-voice/transcribe GET→405、POST 空→400、/optimize 空→400、未知→404，host 路由全部生效。可复现?是（build + 热装 + curl 均可复现）。
- **dsh-ui-tweaks 交互简化：模型菜单两级→单层 + 首次粘贴弹窗→非阻塞 toast（2026-08-24，设计/交互）**：问题=①模型选择器是两级菜单（打开→根页「模型/推理」两行→再进模型列表；强度在第三个页面），换模型 3 步、改强度 2 步；②首次粘贴图片弹模态框（说明+复选框+确定/取消），粘贴被拦成两步。原因=历史实现把 Model/Effort 做成钻取层级，粘贴提示用了 consent 式模态。解法=①**单层菜单**：打开即见搜索+分组模型列表，推理强度滑杆（EffortSlider 组件原样）内联固定在菜单底部 footer（flex 0 0 auto，`dms-effortFooter` 样式，border-top 分隔）；删 pane 状态机/goPane/IconChevronRight/根页与强度页 JSX/两层级 CSS（.dms-cell*），Escape 直接关闭，打开即聚焦搜索框。②**toast 化**：showToast 支持可选 action 按钮（点击执行+立即关闭）与时长参数；首次粘贴立即入输入区，同时弹 6s 非阻塞 toast 带「不再提示」按钮（写 NOTICE_KEY）；删除 showPasteNotice 与全部 .dshca-notice-* 样式。**坑**=①删 pane 后 `noUnusedLocals` 会抓 IconChevronRight/goPane 残留，连 CSS 里 `.dms-cellChevron` 在共享选择器组（.dms-chevron,.dms-groupChevron,.dms-cellChevron）里也要摘掉；②toast 基类 `pointer-events:none`，action 按钮必须单独 `pointer-events:auto` 否则点不到；③EffortSlider 内联后常驻菜单（Round 2 的空闲冻结优化成为必要前提，否则菜单开多久烧多久 CPU）。**验证**=client typecheck + build 全过；lib/client.js 含新 footer/toast-action 类、dms-cell 归零。可复现?是（打开模型菜单直接是列表+底部滑杆；首次粘贴无模态、文件立即入 dock）。


- **dsh-web-search-free 新建：免费/低成本网页搜索路由插件（2026-08-21，新建/插件）**：问题=用户要把 DSH 网页搜索换成便宜的，官方 web-search-deepseek 每次搜索=一次完整模型调用（Anthropic 兼容 Messages + web_search_20250305，4096 输出 token/5 次原生搜索）太贵；且用户希望「几种免费的都放上去、专门做一个插件、官方也能有开关」。解法=新建独立仓库 dsh-web-search-free（host-only bundle，零编译）：注册路由 provider（id: free）到 ctx.web，内部按优先级分发 anysearch（匿名免 key/免费 1000 次每天）→ exa（匿名 MCP mcp.exa.ai/mcp，有 key 切 REST）→ brave（免费 2000 次/月，需 BRAVE_API_KEY）→ deepseek（官方兜底，读同一个 web-search-deepseek 设置段，官方 UI 卡片继续有效）；设置段 web-search-free（provider/fallback/各后端 enabled）live 热生效（每次搜索重新投影，同官方模式）；失败按 fallback 回退，WEB_ABORTED 立即上抛，全败聚合错误。patch 覆盖 base 的 web 行 config（searchProvider: free）+ insert 插件行，官方 web-search-deepseek 行保留。坑=①**settings.get 读官方段**：deepseek 后端选项从官方段投影（apiKey/baseURL/model/maxTokens/maxUses 全走官方段），官方段缺失时回退官方默认常量（必须与官方包常量一致，不能用 npm 包导出——npm 上的 dsh-web-search-deepseek 是 0.0.1-rc.1 旧版、peer 范围 ^0.0.1-rc.1 与安装版 0.1.1-rc.1 冲突，官方类不可依赖）；②**link 安装解析**：`dsh plugin add <本地路径>` 建 link: symlink，Node ESM 按 realpath 解析 bare import——仓库内必须自建 node_modules 指向安装版 @deepseek-ai 包（dsh-ui-tweaks 同款模式），github 安装无此问题（真实目录沿 profile node_modules 向上命中治愈镜像）；③schemastery z.union 无 default 时缺省字段保持 undefined，buildChain 需显式处理（provider undefined = auto）；④settings 服务缺席时 entry config 无默认值，apply 里包一层 Config(current()) 补默认。验证=四个后端真实 API 冒烟全过（anysearch 匿名 3 源/exa 匿名 MCP 3 源/deepseek 官方 10 源含中文结果/fallback anysearch 坏 URL→exa）；聚合错误消息正确；--dump-config 显示 searchProvider: free + web-search-free 行 + 官方行保留、零警告；已装进 web profile（bundles 第 7 条）。待办=GitHub 推送、README 已写。可复现?是（真实 API + dump-config 均可复现）。

- **dsh-better-sidebar 智能体驱动内嵌浏览器（browser_open）实现与验证（2026-08-19，实现+验证）**：问题=用户要「zcode 式」侧边栏内置浏览器由 agent 控制；真实浏览器走 browser-skill 不动，补齐的是内置 iframe 浏览器被 model 驱动。**架构**（commit de25c71）：①host 侧 `src/browser-intents.ts` `BrowserIntentRegistry`——per-session 单槽 intent（open/back/forward/reload/system）+ 最近 page 状态（report），`setIntent`（工具写）→ 客户端可见 browser tab 轮询 `browser.intent`（**peek 不消费**，单槽 last-write-wins 无竞态）→ 执行 → `browser.report` 带 seq 清除 + 记录状态 → 下次 `browser_open` 返回 `page`；②`browser_open` 工具（开/退/进/刷新/系统打开/status）由 `agentBrowserTools` 开关 gate（默认 off，与 agentTerminalTools 同模式，settings watch 实时注册/注销）；③client `BrowserView` 仅 `visible`（激活+面板开）时轮询消费（多开语义=「用户当前看的那个由 agent 驱动」），用 `actionsRef` 绕开 stale 闭包（goBack/goForward 读非函数式 cursor）；④client index.tsx 加「open relay」：intent 存在但会话无 browser tab → `service.openTab({type:'browser'})`；有但非激活 → `activateTab`（无则 mint+激活，用户实时围观）。**踩坑**：①收编 checkout **缺 tsconfig.json/tsconfig.build.json/tsdown.config.ts**（npm 包 files 不含）→ 从上游 omdsh-dev/DSH-better-sidebar 抓取补回；上游 main 的 tsdown 配置比 0.12.2 新（带 mermaid chunk）→ 需裁剪 `CHUNKS`/mermaid 插件（本包无 mermaid 依赖，src/client/chunks 仅 terminal/editor）；②根 pnpm workspace 安装被 `dsh-client-ui-aqua` 阻塞：其 devDeps 误用 `@deepseek-ai/*@workspace:^`（workspace 无这些包，peerDeps 已正确声明 rc.5）→ 修正为 `^0.1.0-rc.5`/`^4.0.1`，pnpm-lock.yaml 一并更新；③npm install 在 pnpm workspace 子包报 `Cannot read properties of null (reading 'edgesOut')`（npm/pnpm 混合），无解时优先修 workspace 本身；④defineTool **parameters 必须是扁平字段**（`action: {type,required,enum}` 不是 JSON Schema 的 type:object/properties 嵌套），否则 TS `ParameterPropertySpec` 拒绝；⑤execute 返回对象须与 `output.schema` 推导类型兼容——返回 `page: null` 会挂（schema 无 null），用「省略字段」表达空。**验证**：host 路由 curl 通、`Tool.listTools` 见 browser_open（开关开前没有/开后出现=gate 生效）、GUI 侧边栏工作台展开正常、设置页「浏览器 browser」tab 在列。**bsk vs Tabbit**：bsk daemon 健康但 0 浏览器连接（Edge 未开）；Tabbit 浏览器自带 `tabbit-cli`（Playwright）可作 GUI 验证替代（页面被 bsk 扩展 overlay 干扰时用 `page.locator('body').filter({has: ...})` 限定主 frame；`getByRole name` 撞消息文本用 `exact:true`）。可复现?是（de25c71 全量可复现；注意并行会话）。

- **安装 Tabbit-Browser/dsh-plugin 到 web profile（2026-08-19，落地）**：问题=用户确认「装上吧」。解法=`dsh plugin --profile web add github:Tabbit-Browser/dsh-plugin`（转发 pnpm，Package: +1，4.6s）；验证=①`dsh --profile web --dump-config` 组合树第 549 行出现 `# == tabbit-browser` + `- id: skill-tabbit-browser, name: tabbit-browser` 行；②包实体在 `~/.dsh/profiles/web/node_modules/tabbit-browser/`（index.js/installer.js/skills/cordis.patch.yml 齐全），web profile package.json dependencies 增 `"tabbit-browser": "github:Tabbit-Browser/dsh-plugin"`；③node --check 两文件过。**peerDeps 警告实锤审计时的预判**：pnpm 报 tabbit 缺 peer @deepseek-ai/dsh-jobs|skill|tools（与其他旧有 react/dsh-client-ui-* 缺 peer 混在一张警告单）——但 index.js **只 import node 内置 + 自家 installer.js**，零 import harness 内部包，服务 `skills/tools/jobs` 由运行中 harness 组合提供，不依赖 profile node_modules 解析，运行时无害（与 NOTES 旧坑「插件 peerDeps 缺陷=import 时解析不到」不同：缺 peer 仅当 bundle 代码真 import 才致命）。坑=①**运行中的 harness 不会热加载新 bundle，须用户手动重启 web profile 才生效**（勿在 GUI 会话里自杀 harness）；②重启后模型侧出现 `tabbit-browser` skill（modelInvocable）+ `tabbit_browser_install` 工具；本机未装 Tabbit → 工具首次调用会按系统地区（AppleLocale）后台下载 macOS ARM64 安装包到 ~/Downloads（CN→tabbit.com 国内源），用户再手动装。可复现?是（命令幂等可重复执行；dump-config 行号随 profile 组合漂移）。

- **dsh-desktop-shell 从 web profile 卸载（2026-08-18，落地）**：用户要求把桌面壳从 web profile 卸载。问题=卸载前检查发现 `~/.dsh/profiles/web/package.json`（dependencies + dsh.profile.bundles）、`cordis.patch.yml`、`cordis.yml`、`pnpm-lock.yaml`、`.modules.yaml` 已全部无 `dsh-desktop-shell` 引用（config 侧 17:00:03 已被清），但 `node_modules\dsh-desktop-shell` junction 残留、且**运行中的 harness（PID 24232，16:58:50 boot）仍加载着 desktop-runner 行——桌面窗口 DeepSeekHarness.exe（PID 30744）还开着**。原因=配置清理发生在 boot 之后，运行进程按 boot 时组合加载了该 bundle；pnpm remove 只在依赖仍声明时生效。解法=①README 官方命令 `dsh plugin --profile web remove dsh-desktop-shell` 报 `ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS`（包已不在 package.json，命令不可用，pnpm remove 不能清残留 link）；②改走 `cmd /c rmdir <junction>` 删残留 junction（安全，只删链接不进 `D:\workspace\deepseek-plugins\dsh-desktop-shell` 仓库目标）；③`dsh --profile web --dump-config` 确认无 desktop-runner 行、node_modules 顶层只剩 aqua/essentials/work；④运行进程需重启才真正卸载——用户选择自己稍后重启（桌面窗带 `--parent-pid` orphan guard，harness 停时自动关窗）。坑=「卸载」要分三层看：config/文件系统可安全完成，**运行中进程要重启才生效**，别在 GUI 会话里杀自己的 harness。可复现?是（config 已清但 junction 残留 + 运行进程加载旧组合可复现；rmdir 删 junction 不伤目标可复现）。

- **modlens「cannot get required service llm in inactive context」每次启动必现（2026-08-18，落地）**：问题=`dsh web` 启动时 `[modlens] vision provider discovery sweep failed: Error: cannot get required service "llm" in inactive context`（host 其余正常，Web UI 可用；但稳定启动后可能无人再触发拓扑通知 → 视觉 wrapper 一直没注册）。原因=Cordis 4 经 **fiber store** 解析注入服务（激活时快照 `store={..._store}`、卸载后 `store=undefined`；getter 走到 `prop in fiber.inject` 且 store 无值即抛「inactive context」）；modlens 初始 sweep 在 apply 里同步启动、内部 `await ctx.llm.listModels()`，当 essentials 组合 fiber 因某注入服务被重新 provide 而 **unload/reload** 时，旧 sweep 的异步续延再访问 `ctx.llm` → 抛错被 sweepOnce 捕获打日志。解法=① `registerVisionProvider` 开头在 apply 同步期 `const llm = ctx.llm` 捕获服务实例，sweep / registerAdapter / listModels / resolveModelInfo / stream / listProviders 共 8 处全部改用捕获引用（续延不再经 fiber store 解析，卸载后不抛）；② `pasteTakeoverVerdict` 的 `host.llm` 访问包 try/catch，重载窗口降级返回 false（保守否决）。验证=**node 22（`D:\Program\nvm\v22.22.3\node.exe`，默认 shell 的 node 是 v14.17.6 跑不动 cordis 4 的 `??=`）写 cordis 最小复现**：提供 llm 服务 + inject['llm'] 插件在 apply 内启动异步 sweep + 中途 `registry.delete(plugin)` dispose fiber → 续延访问 ctx.llm 报同款错误、捕获后消除，根因实锤。坑=① Edit 工具参数写反（old/new 对调）把 `llm.registerAdapter` 替换成 `ctx.ctx.llm.registerAdapter`，grep 复查才发现——**批量/机械替换后必须 grep 验证**；② 收编第三方插件时「无本地修改」会随升级漂移，modlens 现在有本地修复，THIRD-PARTY 维护状态与升级复查点已更新。可复现?是（cordis 4 + inject llm + apply 内异步续延 + 中途 dispose fiber）。

- **dsh-client-ui-aqua 收编改名后 bundle 注册 id 未同步 → client-modules「loaded without registering」（2026-08-18，落地）**：问题=harness 启动报 `failed to import loader entry (dsh-client-ui-aqua): client-modules: bundle /plugins/dsh-client-ui-aqua/client.js?rev=… loaded without registering "dsh-client-ui-aqua" via __ModuleLoader__.load`，Web UI 加载不了刚收编的 Aqua 主题。原因=harness 的 client-modules 按插件**包名**解析浏览器 bundle 的注册 id（`__ModuleLoader__.load` 的 id 必须 == package.json name）；收编时把包名从 `@deepseek-ai/dsh-client-ui-aqua` 去 scope 成 `dsh-client-ui-aqua`（package.json + patch name 都改了），但提交的构建产物 `lib/client.js` 是上游在 deepseek-harness monorepo 内构建的旧产物，注册 id 仍是 scope 名 → 加载器等 `dsh-client-ui-aqua` 永远等不到。解法=把 `lib/client.js`（10 处：注册 id、CSS `<style data-plugin>` tag、OVERRIDE_SOURCE）、`lib/invariant.js`（3 处：PACKAGE_NAME）、`src/client/theme-layer.ts`、`src/invariant.ts` 里全部 `@deepseek-ai/dsh-client-ui-aqua` 替换为 `dsh-client-ui-aqua`，同步修 README/README.zh 手动安装片段（patch `name:` 与 ln -s 目标）；`tsdown.config.ts` 改为自述性存根——**本仓库无法重建 aqua**（tsconfig extends/references 与 `../tsdown.client.ts` helper 只存在于上游 monorepo，见 build.ps1），只能上游构建后提交产物。坑=① 第三方插件改名后**构建产物里的身份字符串**不会跟着 package.json 变（bundle 注册 id / invariant 包名 / override source / CSS tag 全要 grep 复查）；② 此插件 host 半区是 no-op，host 侧一切正常、错误只出现在浏览器端，容易误判已修复；③ `lib/client.js.map` 保留原样（dev-only，本就含上游机器路径，手改 sourcemap 易错）。可复现?是（任何 client bundle 注册 id ≠ 包名的插件都会报同款错误）。

- **dsh-client-ui-aqua 第三方收编 + 直接从仓库安装（2026-08-18，落地）**：用户昨天在 Mac 装了个「毛玻璃」插件但没 push，要求找回来并作为第三方收编进本仓库、直接从仓库安装。问题=先后误判 dsh-neu-theme（轻拟物+磨砂玻璃，3★）与 dsh-ui-appearance（透明+模糊，7★）都被用户否定；经 ask_user_question 确认是 **WYH66666666/DSH-Transparent-UI-Plugin（267★，MIT）**，npm 包名 `dsh-client-ui-aqua`（Aqua 玻璃质感主题：可调模糊/磨砂/流体或壁纸背景，client-only bundle）。原因=用户记得的描述是「毛玻璃/磨砂玻璃片」且名字带 dsh；前两个候选描述虽含 glass/blur 但不是用户装的那个。解法=`git subtree add --prefix=dsh-client-ui-aqua`（完整克隆后本地 subtree add，浅克隆被拒 shallow roots），lib/ 已随上游入库无需构建；**坑=上游 package.json name 是 `@deepseek-ai/dsh-client-ui-aqua` 但 npm 实际发布与 cordis.patch.yml name 都是无 scope 的 `dsh-client-ui-aqua`**，包名一致性检查要求 patch name==包名，收编时用 Node 改 package.json name 去 scope（本地修改已记 THIRD-PARTY）；`node scripts/check-{package,inject}-consistency.mjs` 全过；README 表格/THIRD-PARTY/AGENTS 已登记。可复现?是（git subtree add 浅克隆报错、包名不一致导致 check 失败均可复现）。

- **去芜存菁 P0 落地：移除 mode-boost + router-spec，压缩 memory 指令（2026-08-18，落地）**：按 AGENTS.md 设计理念（pi-agent 哲学）清理。问题=4 个路由机制重叠（mode-boost/router-standard/router-spec/liangshen），mode-boost 自动应用路由违反「用户决定需要什么」原则；memory:auto 指令 ~25 行常驻每个会话。原因=历史上逐步收编多个第三方路由预设未去重；memory 为全局 ctx.inject 注入。解法=①删除 lib/mode-boost/（自动替换 persona + 注入 guidance + 过滤工具目录，-478 行）并清理 README/AGENTS/THIRD-PARTY/market client 引用；②删除 preset/router-spec/（与 router-standard 仅差 
outerMode: spec 配置值，router-standard 已支持，-4 文件）；③memory:auto 指令 25 行压缩为 6 行（保留全部关键语义：write_memory 两轨道/何时写/summary 最重要），
ode --check + inject/package 一致性全过。**大坑=PowerShell Set-Content 处理含中文的 UTF-8 文件会损坏编码**（GBK 解释 UTF-8 → U+FFFD mojibake），此前多轮用 Get-Content -Raw + Set-Content 改文件，已损坏 12 个文件（README/dsh-work package.json/registry-snapshot/router-core.mjs/upstream docs 等），且已 push 到 GitHub；本次用 git show 逐文件找最后正常 commit，git checkout <good> -- <file> 恢复后用 **Node 
eadFileSync(...,'utf8') + writeFileSync(...,'utf8') 重放意图修改**，全部 893 个 tracked 文本文件验证无 U+FFFD。另：better-sidebar 的 8 个 terminal 工具**已有** gentTerminalTools 设置门控（默认 false），非用户启用不注册，P1-1 无需改；at-file 是纯构建产物（无源码/tsconfig）内联 zod，外部化需上游源码+重建，且不影响 token 开销，暂缓；usage-plugin 子进程走 DSH 官方 subprocess 服务（含 sandboxPolicy）+ 不在 LLM 热路径，非裸 child_process 反模式，重构风险>收益，暂缓。可复现?是（git log 逐版本校验 U+FFFD 可定位损坏 commit；mode-boost/router-spec 删除后 
ode scripts/check-* 全过）。

- **无损省 token 配置并入 dsh-essentials（2026-08-17，落地）**：用户要求「不影响生成质量和效果」的上下文压缩，且不改 dsh 源码、不动 AGENTS.md、不动 compaction。问题=上下文大头除 skill catalog/AGENTS.md 外还有工具结果内联输出，常驻浪费 token；原因=shell/read/spill 的默认内联上限偏高；解法=纯 `cordis.patch.yml` 覆盖 dsh-base 行（pwsh-sandbox/bash-sandbox `maxOutputBytes:16384`+spill、tool-fs `readLimit:500/readMaxBytes:16384`、spill-policy `maxInlineBytes:16384`），完整内容仍可通过 spill 文件/分页读取按需取回，因此无损；同时 KV cache 靠保持前缀稳定受益。坑=patch 会替换目标行整个 config，覆盖时须把该行需要的字段写全；用户后续可再覆盖（最后写入者生效）。可复现?是（`dsh --profile web --dump-config` 可见覆盖行；去掉 patch 后恢复默认）。

- **dsh-desktop-shell Windows 自绘一体式标题栏（2026-08-17，落地）**：用户要求去掉 Windows 原生标题栏，改为与页面融为一体的自绘边框（对齐 macOS unified 观感）。经 grilling 收敛：统一无边框（Win10/11 都 decorations:false）+ 壳层注入 CSS/JS + 36px 全宽浅色条（#F9FAFB 与页面同色、内容下移）+ 左侧 "DeepSeek Harness" 文字 + 右侧 DSH 主题线性按钮（hover 高亮/关闭红）+ 双击最大化 + 拖拽 + 右键自绘菜单 + 深色跟随 + 自动隐藏关闭。**技术要点**：①窗口改由 main.rs 的 WebviewWindowBuilder 构建（config 的 windows 不支持 initializationScript，须清空 config 窗口避免重复声明），`initialization_script(include_str!("../titlebar-init.js"))` 注入，Tauri 2 的 init 脚本经 AddScriptToExecuteOnDocumentCreated 对外部 http 页面**每次加载都生效**；②外部页面调窗口 API 的授权=**ACL capability**（`capabilities/default.json`：windows:["main"] + permissions core:default + core:window:allow-{minimize,maximize,toggle-maximize,unmaximize,close,start-dragging,is-maximized} + remote.urls ["http://127.0.0.1:*","http://localhost:*"]）；③**dangerousRemoteDomainIpcAccess 已从 tauri-utils 现行 config.rs（v2）移除**（只剩旧 config_v1 有），用了会报 unknown field；④`titleBarStyle: Overlay` 在 Windows 是**空操作**（纯 macOS cfg），Win11 无 Tauri 侧 overlay；⑤拖拽用 CSS `-webkit-app-region: drag`（WebView2 原生、免 IPC），按钮走 `window.__TAURI__.window`；⑥验证无边框**不能查 WS_CAPTION**——tao 无边框保留 WS_CAPTION 位但 WM_NCCALCSIZE 返回 0 清零非客户区（假阳性），该位存在反而让 app-region drag 生效。坑=git mv 后 cargo clean 重建（target 里旧路径）；include_image!/include_str! 路径基准不同（crate 根 vs 源文件）。可复现?是（旧 exe 原生栏；新 exe 无边框+自绘条）。

- **Phase 3：UI 回归 + 工具懒加载 + CI 阈值 + npm 准备（2026-08-17，落地）**：用户确认继续后执行。①深度 UI 回归脚本升级为点击 Settings/Market/Side card + 截图 + 抓错，当前 3080 无错误；②rc.6 无原生 tool demote，采用 vision-router 同款 bootstrap：dsh-work 新增 `agent_teams_activate`，首次执行才注册 9 个 `agent_teams_*`，systemPrompt 加 step 0；同时压缩 dsh-work 工具描述；③dsh-core 最小接入：essentials 用 `mergeConfig` 兜底子配置，work 用 `dedupeBy` 生成 toolNames，dsh-core 补 `lib/index.d.ts` 类型；④benchmark.mjs 加 CI 阈值（clientKb/skills/tools 当前基线 +20%）；⑤6 个包（core/essentials/work/dev/writing/design）改 public publishConfig + repository/files，新增 `scripts/publish-packages.mjs --dry-run` 验证通过，未实际发布。坑=`defineTool` 的 output 必须带 `render`（TS2741）；dsh-core 纯 JS 被 TS import 需补 d.ts。可复现?是（build/verify/benchmark/publish dry-run 全过）。

- **mattpocock/skills 全量安装到 ~/.agents/skills（2026-08-16，落地）**：用户确认要装整个 mattpocock/skills 项目（218.9k★，MIT，「Skills for Real Engineers」）。执行=浅克隆 → 枚举 `skills/**/SKILL.md` 共 **35 个**（engineering 19 / productivity 8 / in-progress 6 / misc 4；deprecated 目录只有 README 无技能）→ 检查 frontmatter 无重名、name 均合法（`[a-z0-9._-]`）→ 用 rsync 把每个 skill 目录**整体拍平**拷贝到 `~/.agents/skills/<skill-name>/`（保留 agents/、scripts/ 等支持文件，SKILL.md 里 `scripts/xxx.sh` 相对引用按 skill 目录解析，如 git-guardrails-claude-code/scripts/、diagnosing-bugs/scripts/hitl-loop.template.sh）。关键坑=**DSH skill-filesystem 只收根下两层**（`<root>/<name>/SKILL.md`，watch 过滤器 `segments.length===2 && segments[1]==='SKILL.md'`，discoverRoot readdir 一层），仓库里 `skills/productivity/grill-me/` 这种嵌套必须拍平，直接把 `skills/` 拷过去不会被发现；默认根=user-agents `~/.agents/skills`（还有 `~/.dsh/skills`、项目 `.dsh/skills`/`.agents/skills`、customSkillDirs、bundled）。验证=装完当前会话 skill catalog 立即热刷新：15 个 model-invocable 技能进入 `<available_skills>`（code-review/codebase-design/diagnosing-bugs/domain-modeling/git-guardrails-claude-code/grilling/migrate-to-shoehorn/prototype/research/resolving-merge-conflicts/scaffold-exercises/setup-pre-commit/tdd/wizard/writing-for-agents）。**重要语义=其余 20 个（grill-me/grill-with-docs/handoff/implement/to-spec/to-tickets/triage/wayfinder/teach/to-questionnaire/wait-what/ask-matt/loop-me/setup-matt-pocock-skills/setup-ts-deep-modules/writing-*/claude-handoff/improve-codebase-architecture）全部带 `disable-model-invocation: true`**，DSH 解析为 `modelInvocable:false`（不进模型自动调用目录）但 `userInvocable:true`（用户显式点名/斜杠路径仍可用）——**不是装失败**，与 Claude Code 的 `/斜杠命令` 语义一致；grill-me 官方版就是薄壳（只有 frontmatter + 「Call the Skill tool with 'grilling'」），真正逻辑在 grilling。可复现?是（浅克隆 + rsync 拍平 + 会话 catalog 热刷新可见 15 个 model-invocable；watcher 监听到文件变化即 invalidate）。

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

- **dsh-essentials 输入框自动隐藏开关提示（2026-08-16，新增）**：用户要求隐藏/取消隐藏对话框
  开关要有提示。实现=auto-hide-composer 增加居中 toast：开启显示「输入框自动隐藏已开启」，关闭
  显示「已关闭」，1.5s 自动消失；快捷键/设置开关触发都提示。合并 client 同步。可复现?是
  （Ctrl+Shift+H 或设置开关）。

- **dsh-essentials 沉浸提示与快捷键扩充（2026-08-16，新增）**：用户要求隐藏开启/关闭时页面中间
  提示，且快捷键增多。实现=①immersive-mode 增加居中 toast（开启/关闭沉浸时显示，1.5s 自动消失）；
  ②keyboard-shortcuts 新增 `Ctrl+Shift+S` 侧边栏、`Ctrl+Alt+N` 新会话、`Ctrl+,` 设置、
  `Ctrl+Shift+U` 用量统计、`Ctrl+Shift+P` 插件设置、`Ctrl+Shift+End/Home` 滚动底部/顶部；
  帮助面板同步更新。合并 client 同步。可复现?是（切换沉浸看居中提示；按 ? 看新增快捷键）。

- **dsh-essentials 系统通知（2026-08-16，新增）**：用户要求系统通知、点击跳转具体页面、其他软件
  也能跳转。调研 GitHub：`omdsh-dev/dsh-notification`（50★，完成通知但点击只聚焦窗口）、
  `omdsh-dev/dsh-web-ui-notify`（3★，审批/提问/完成通知，点击跳转会话，适合）。选定
  dsh-web-ui-notify 并入 `lib/notify/`：host no-op + client 系统通知（Notification API），
  设置→通用开启；支持后台会话/当前会话离开 tab 时通知，点击通知跳回对应会话。合并 client 新增
  sub_notify（现 12 个 factory）。注意=需要浏览器 Notification 权限；页面关闭后无法通知。可复现?
  是（切到其他软件/标签页，DSH 完成/审批时弹系统通知，点击跳回）。

- **dsh-essentials 用量统计设置图标原生（2026-08-16，调整）**：用户要求设置页用量统计图标参照原生
  风格。实现=在 usage-plugin client 增加 `patchUsageNavIcon`，把设置导航「用量统计」的齿轮替换为
  DSH 原生 `ic_ds_data_outline_16` 路径（两个 fill path），MutationObserver 常驻；合并 client
  同步。可复现?是（打开设置看用量统计图标）。

- **dsh-essentials 用量与余额合并入口（2026-08-16，调整）**：用户要求用量与消耗、剩余余额查询
  没必要分两个设置按钮。实现=新增 `UsageStatsPanel` 合并组件，conversation.view 和
  settings.section 都只注册一个「用量统计」，内部 tab 切换用量/余额；删除原
  usage-cost-view/balance-view/usage-cost/balance 四个注册。合并 client 同步。可复现?是
  （顶部/设置只剩一个「用量统计」）。

- **dsh-essentials 用量统计 UI 优化（2026-08-16，调整）**：用户要求用量统计有图标展示、导出收敛
  为下拉。实现=在 usage-plugin client 概览统计卡加 SVG 图标；把「导出 CSV/JSON/PNG/打开目录」
  四个按钮收敛为一个「导出 ▾」下拉菜单，一级界面更简洁；THIRD-PARTY 记录本地修改。合并 client
  同步。可复现?是（打开用量与消耗概览看图标，点导出看下拉）。

- **dsh-essentials 全局快捷键（2026-08-16，新增）**：用户要求沉浸模式快捷键 + 全键盘操作。实现=
  新增 `lib/keyboard-shortcuts/client.js`：插件配置卡片「快捷键」开关（默认开）；全局 keydown
  （捕获阶段，输入框内忽略）支持 `?`/`Ctrl+/` 打开帮助面板、`Esc` 关闭、`Ctrl/Cmd+Shift+F` 切换
  沉浸、`Ctrl/Cmd+Shift+H` 切换输入框自动隐藏、`Ctrl/Cmd+Shift+C` 聚焦聊天输入框；帮助面板列出
  全部快捷键。合并 client 新增 sub_keyboardShortcuts（现 11 个 factory）。可复现?是（按 ? 看帮助，
  Ctrl+Shift+F 进沉浸）。

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

- **dsh-essentials 输入框自动隐藏移入插件配置（2026-08-16，调整）**：用户要求与请求重试一样
  放进插件配置。修复=从 `settings.section` 改为 `settings.plugin.item`，组件改成可折叠卡片
  （展开后显示启用开关），合并 client 同步。可复现?是（设置→插件配置→输入框自动隐藏）。

- **dsh-essentials 请求重试移入插件配置（2026-08-16，调整）**：用户要求请求重试次数放进插件配置。
  原因=之前注册在 `settings.section` 作为独立设置页条目。修复=改为注册 `settings.plugin.item`
  （与 memory 设置卡片同槽位），组件改成可折叠卡片 `RetrySettingsCard`，展开时才加载/保存；
  合并 client 同步。可复现?是（设置→插件配置→请求重试）。

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

- **dsh-essentials 触发器三段行高不一致（2026-08-16，调整）**：问题=对话右下角触发器里
  「思考等级/模型/提供商」高度不一。原因=`.dms-triggerLabel`/`.dms-triggerEffort` 继承
  20px 行高，`.dms-triggerProvider` 单独 `line-height:16px`。修复=三者的 `line-height` 统一为
  `20px`（provider 仍 11px 字号但行高一致），flex 垂直居中后高度一致。改动文件=
  `lib/model-selector/client.js` + `lib/client.js`。可复现?是（看对话右下角触发器）。

- **dsh-essentials 思考模式加头脑图标+间隙（2026-08-16，调整）**：问题=用户希望「推理等级/
  思考模式」入口参照 ZCode 加一个头脑图标，且与「模型」入口之间留间隙。修复=①新增
  `IconThink` 组件，直接用 DSH primitives `ic_ds_think_outline_14` 官方路径（14px，
  fill:currentColor，原生风格）；②在根菜单「推理等级」cell 的 label 前插入
  `span.dms-cellIcon`；③`.dms-cell + .dms-cell { margin-top: 6px }` 给「模型/推理等级」
  两行加间距；④`.dms-cellIcon` 用 inline-flex 居中。改动文件=`lib/model-selector/client.js`
  + `lib/client.js`。可复现?是（打开模型选择根菜单）。

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

- **dsh-notification-center 终审回执落地（6e798fa）**：两个 Round-3 终审 agent 回执迟到——
  client 侧 CONVERGED（6 低项全理论/既有，无需改）；host 侧报 2 Medium——① cooldownMs=0 被
  `|| DEFAULT_COOLDOWN` 吞成 3000（真 bug，host 与 client「无冷却」语义分叉）→ 改 Number.isFinite
  兜底；② notifierDisposed 永不重置（**经验证为误报**——标志是 per-apply 闭包，stop+start 后
  click 跳会话实测 3 断言全过，未盲改）；另修 nativeNotify 复用 notifierReady（免重复 import）、
  client apply 重置 lastNotifyAt；教训=审计发现必须过可执行验证再落代码，含误报也要记录结论
  （见 AGENTS.md 索引）。

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

- **新增运行时日志**（index.js）：发现时 `vision chain candidates: …`、成功时
  `vision used {provider}/{model}`——重启后附图即可在服务日志里亲见；两套测试仍全绿。
- **可复现?** 是（重启+附图看日志）。

## vision-bridge 当前视觉模型 = jiyuanlvdong/deepseek-v4-flash-0731（唯一候选）
- **查证**：llm-pi-ai 全配置（settings.yaml + catalog.ts）只有一处声明图片输入——
  `jiyuanlvdong.models[deepseek-v4-flash-0731].input:[text,image]`（我们补的那行）；无 defaultInput、
  catalog 无带图片能力的模型条目 → 自动发现链**只有一个候选**，visionAnswer 就用它。

- **中（功能）**：① `activeDm` 只增不减 → 密度上限退化「累计数」、弹幕中途永久停 → `retireDm`
  到期从数组删除；② 字号/透明度/弹速是 interval 闭包旧值、运行中改不生效 → 依赖补三项；③
  openVideo/switchPage/switchQuality 无请求序保护 → `streamSeq` 守卫 resolve。

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

- **中（功能）**：① `activeDm` 只增不减 → 密度上限退化「累计数」、弹幕中途永久停 → `retireDm`
  到期从数组删除；② 字号/透明度/弹速是 interval 闭包旧值、运行中改不生效 → 依赖补三项；③
  openVideo/switchPage/switchQuality 无请求序保护 → `streamSeq` 守卫 resolve。

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

- **无新增插件缺陷**：本轮 1 处防御性修复（corrupt-log 容错），未发现功能性新问题。
- **可复现**：是（冒烟测试含 time-less 事件场景）。

## 使用统计插件检测-修复（第三轮，dsh-usage-dashboard）

- **配套落地**：`playurl` 优先 wbi 接口、失败回退旧接口；client 侧 localStorage 持久化弹幕设置
  （DPlayer/ArtPlayer 式）+ 画质记忆 + 观看历史（Bilibili-Evolved 清单首项）+ 弹幕密度档位。
- **可复现**：是（2026-08 实测）。

## dsh-mac-desktop「轻量 vs 开箱即用」取舍分析

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

