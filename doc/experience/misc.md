# 其他（140 条）

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

- **已验证**：220 断言全绿，live 实例路由正常（/api 0.002s，/market 0.27s，/install CSRF 403）。

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

- **补全**：round-33 的「摘要 vs KPI 矛盾」只是**失效模式 B**（缓存覆盖不全时）。committed main 上
  `exactMessages`（index.js:329）在缓存完整时为 steps+turns **代理**、否则回退扫描真实计数——由此
  同一「消息数」在 UI 各处混用真实/代理两种口径，**两种失效模式**：
  - A（缓存完整，现 live 状态）：KPI 头 5,299（代理）vs KPI 副行「用户 97 · 助手 286（扫描明细）」
    =383——KPI 卡内自相矛盾（5,299 ≠ 383，13.8× 虚高）。
  - B（缓存不全）：KPI=扫描真实（383）vs 摘要/趋势=代理（5,237）——round-33 报告过的同页矛盾。

- **stub 两坑**：① **别把 setTimeout 桩成同步执行**——QR 轮询 setInterval 会同步死循环（超时）；
  ② 泄漏的 interval 挂着事件循环——冒烟结尾显式 `process.exit`。

- **环境限制**：stub 环境里内嵌 QR 库的渲染在 getContext 前抛错（被 renderQrDataUrl 内部 catch
  吞掉返回 ''）——canvas 像素渲染本身已在 round 2 node 级 + round 15 live 浏览器验证；冒烟断言
  改为流程级（QR 分支 img 存在 + 状态切换）。→ 可复现：是（stub 环境复现）。

## bilibili 原生播放器路径冒烟（多 agent 第二十五轮）

**交付 → 验证 → 可复现?**
- **交付**：冒烟加场景 F——playurl 成功 → 原生播放器视图：画质条（'画质' + 质量 tab）+ video
  元素（videoRef 赋值）+ 弹幕工具栏。15 断言全过（原 13 + F 的 2）。

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
  `--dsh "pnpm --dir /Users/localuser/workspace/deepseek-harness dsh"`；`spawnSync` 失败时
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

- **分发链路验证**：从已推送 monorepo URL 全新安装两个插件——二进制 SHA-256 与仓库一致、
  bilibili 打包内 client.js 含本地 QR 库零第三方引用；boot 分布式产物窗口正常拉起、孤儿守卫正常。

## dsh-mac-desktop isReachable 标记检测 + 双插件回归验证（多 agent 第三轮）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：standalone `isReachable` 接受任意 HTTP 响应（status<600 即 ready）——3080 被无关
  服务（路由器管理页/别的 dev server）占用时会连错对象；插件模式端口冲突虽有 warn，standalone
  无诊断。→ **解法**：要求 **200 + 根 HTML 含 `__DSH_BOOT__` 标记**（dsh SPA 特有，随机 HTTP
  服务不会有）。→ **可复现**：是（python http.server 占端口 → 修复前误连、修复后正确 spawn；
  真实 dsh → 修复后就绪不重复 spawn）。

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

- **可执行验证（不是读代码）**：把 index.js 里真实的 Range 解析块抽出来跑 7 个用例全 PASS
  （`bytes=0-499`/`500-`/`-200` 后缀/`500-100` 与越界 416/无 Range/非法头）——416 分支 `res.end();
  return` 提前返回是正确行为，测副作用即可；cookie 白名单 6/6（B 站域放行、evil/127.0.0.1 拒）。

- **环境**：第二个只读回归 subagent 又挂起（共享工作区并发修改），已 interrupt，用自查+单测
  矩阵替代（与 vision-bridge 同结论）。
- **可复现**：是。

## dsh-bilibili-player 第二轮检测-修复（对抗审查 10 项全修，commit `62b09a7`）

- **高（安全）**：`/dsh-bili/video` 任意 URL 代理会把 bilibili 会话 cookie 发到任意主机
  （SSRF + SESSDATA 外泄）→ cookie 只发给 B 站自有域（`BILI_HOST_RE`：bilibili.com/biliapi.net/
  bilivideo.com/hdslb.com/bilibili.tv/acgvideo.com/mountaintoys.cn 等），非 B 站域不带 `-b JAR`，
  图片代理直接拒回源。实测白名单对 CDN 流（bilivideo.com/mountaintoys.cn）放行、对
  evil.example/127.0.0.1 拒绝。

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

- **修了 6 处**：① notice 只在 model 面板渲染→effort 面板点当前档位仍静默（B1，移到菜单级 +
  面板切换清 notice）；② select 失败在 effort 面板零反馈（B2，错误条两面板共用，select 无重试、
  load 有重试）；③ 搜索框 ↑/↓ 被 root 方向键劫持无法移动光标（B3，`event.target` 是 input 时跳过）；
  ④ 最大档位为 off 的模型显式提交 `reasoningEffort:'off'`（E1，改不提交）；⑤ 面板切换焦点掉 body
  （A2 部分，useEffect 按 pane 聚焦搜索框/首项）；⑥ 未使用 import + 死键 `group.collapsedCount`。
- **可复现**：是（B1/B2/B3 均可在真实实例复现）。**遗留（不阻塞发布）**：A1 ARIA menu 模式违例
  （input 在 menu 内，需 combobox/listbox 重构）、E4 非 groups 区超高裁剪、P2 大目录无虚拟化。
  教训：删除官方 Toast 时要补等价的失败播报面，否则 select 拒绝静默（见 NOTES.md）。

## dsh-bilibili-player 第二轮检测-修复（对抗性审查 10 项全修）

- **高（安全）**：`/dsh-bili/video` 任意 URL 代理会把 bilibili 会话 cookie 发到任意主机
  （SSRF + SESSDATA 外泄）→ cookie 只发给 B 站自有域（`BILI_HOST_RE`：bilibili.com/biliapi.net/
  bilivideo.com/hdslb.com/bilibili.tv/acgvideo.com/mountaintoys.cn 等），非 B 站域不带 `-b JAR`，
  图片代理直接拒回源。实测白名单对 CDN 流（bilivideo.com/mountaintoys.cn）放行、对
  evil.example/127.0.0.1 拒绝。

- **低**：browse tab/搜索竞态（`browseSeq`）+ 加载更多重复追加（`moreLock`）；Range 后缀
  `bytes=-N` 语义错 + 越界伪 206（改 416 + Content-Range `bytes */len`）；headCache 无 TTL
  （加 5min，过期签名 URL 不再带错 Content-Length）；jar 固定 /tmp + 0644（启动与登录轮询后
  chmod 600）；videoInfo 失败无限转圈（playerView 渲染 error 横幅）；imgDataUri NaN 状态校验。
- **可复现**：是（审查逐条给了复现条件）。

## dsh-vision-bridge 第二轮检测-修复补充：block-end 兜底 + 47 断言全绿

- **第三批测试全过**（累计 47 断言）：视觉链失败回退（首模型 error finish → 用第二个）、
  pre-step 经 listener 改写嵌套 tool-result 历史图、畸形配置（passthroughRoutes 非数组/vision
  空项）不崩、200 层嵌套重写不爆栈、block-end-only 流。
- **可复现?** 是（`node tests/apply.test.mjs` 全绿）。

## dsh-plugin-classifier 多 agent 检测-修复第一轮（3 审查 agent + 自查，~16 处修复，76 断言全过）

- **README**：补「补丁层假设标准 web profile 含 llm-deepseek/attachment-local 两行」说明。

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

- **真实实例 boot 联调未做**：本 checkout 无构建好的 dsh CLI + agent 工具环境 boot 会挂（见前条）；
  留给用户在实例上 `dsh plugin add` 验证。
- **可复现?** 是（单测全部可复跑）。

## dsh-model-selector 借鉴点落地：no-op 反馈 + 自动最大思考 + 推理徽标 + 搜索增强

- **「搜索选择后模型没变」真因**：真机复现 = 当前模型就是所点模型（`[true]` 勾选项）+ 静默
  close 无反馈 → 观感「点击无效」。机制没坏（A/B：切到非当前项能切）。

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

- **视觉链**：显式 `config.vision` 或自动发现（`llm.listProviders/listModels/resolveModelInfo`
  找第一个 `inputModalities` 含 image 的模型，60s 缓存）。

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

- **环境教训**：共享工作区被并发修改→**子 agent 只读审查挂起**（vision-bridge 已记录同样结论），
  本轮 host 复查 agent 挂起后改为自查；client 复查 agent 正常完成。
- **验证**：冒烟测试扩到 **13 断言**（新增场景 2：缓存全覆盖 → exactComplete=true、totals=全缓存和、
  exactDayTokens 3 天）；`node --check` 双文件通过；字段一致性 client↔host 全核对通过。

## 使用统计插件多 agent 检测-修复（第一轮，dsh-usage-dashboard）

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

- **矛盾**：dsh 是 Node 应用，开箱即用必须有一个 Node 运行时；绝对轻量则不带运行时，两者不可兼得。

- **方案**：A 零成本=智能启动链（system `dsh` → checkout `pnpm dsh` → `npx --yes @deepseek-ai/dsh`）
  + 首次运行友好引导（检测 Node 缺失给安装指引）；B 推荐=.app 内置最小 Node（universal
  ~50-70MB）+ 构建时把已发布 `@deepseek-ai/dsh` 依赖预装进 app（离线零依赖双击即用），体积
  ~80-150MB 仍比 Electron（~200MB+）和全量 fork 竞品轻一个量级；C=全量 fork（=竞品路线）放弃轻量。
- **结论**：插件本体保持轻量 bundle 不变，把「重」放进可选的自足 .app；A+B 组合，先 A 后 B。

- **修正**：此前「DSH 生态无同类」结论过时——`topic:dsh-plugin`（2013 仓库）筛出 2 个同类：
  [Lanxing6480/dsh-skill-manager](https://github.com/Lanxing6480/dsh-skill-manager)（2★，树外 npm 包）与
  [Fishquito7/dsh-skill-viewer](https://github.com/Fishquito7/dsh-skill-viewer)（14★，bundle + CLI）。

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

---

## 归档：THIRD-PARTY.md（历史治理记录，2026-08-24 归档）

# THIRD-PARTY.md — 第三方插件治理：fork / 收编与本地修改追踪

**2026-08-19 架构定型 v3（自研独立 / 技能合并 / 第三方独立）**：自研 bundle 插件为
3 个独立仓库（`dsh-memory`/`dsh-visualize`/`dsh-ui-tweaks`（`dsh-usage-plugin`
同日脱钩内化改自研、2026-08-21 卸载清仓）；`dsh-essentials` 已于
2026-08-19 并入 dsh-ui-tweaks，路由预设删除；
`dsh-core` 因无多消费者同日内联清理删除），
技能包保持 `dsh-skills` 3 子包合并仓，第三方 fork 保持独立。来源真相见
`plugins.json`（schema 3，技能子包含 `path`）。治理口径：

- **改过的第三方插件** → **fork 上游仓库**，本地改动提交在 fork 上（不再 `git subtree`
  收编进汇总仓库）；后续上游更新用 `git fetch upstream && git merge upstream/main`，
  冲突对照本文「本地修改」列复查。
- **第三方 fork（不合并）**：`dsh-market` 于 2026-08-21 卸载清仓；`dsh-better-sidebar`
  已于 2026-08-20 随 GitHub 仓库删除而下架，本地同步移除；
  `DSH-Transparent-UI-Plugin`（aqua）同日下架、**2026-08-21 从存档恢复为按需可选**
  （本地仓库自 bundle clone 恢复，GitHub fork 未恢复，**不入默认安装清单**）。
  完整历史存档于伞目录 `doc/archives/`。
- **已脱离上游（按第一方维护，2026-08-21 卸载清仓）**：`dsh-usage-plugin`（2026-08-19
  脱钩内化改自研；完整历史存档 `doc/archives/dsh-usage-plugin-2026-08-21.bundle`）。
- **自研插件**：合并进 `dsh-plugins`/`dsh-skills`（subtree 并入，历史保留）；旧的 8 个
  独立自研仓库已删除（历史经 subtree 并入新合并仓）。
- **收编为自研（已并入 ui-tweaks）**：`dsh-notify`（系统通知）2026-08-19 并入 dsh-plugins 作子包，
  同日代码级并入 `dsh-ui-tweaks` 重构为单一 bundle，不再跟上游。
- 安装一律以 `plugins.json` 为真相；同仓库子包用 `&path:/<subdir>` 安装。

> ⚠️ **2026-08-16 变更**：`dsh-at-file`、`dsh-paste-input` 已并入 `dsh-essentials` 组合包
> （源码在 `dsh-essentials/lib/{at-file,paste-input}/`，不再单独 `subtree pull`；
> 2026-08-19 随 essentials 并入 dsh-ui-tweaks，现位于 `dsh-ui-tweaks/lib/{at-file,paste-input}/`）；
> 同日后又并入 `@liustack/modlens`（`dsh-essentials/lib/modlens/`，2026-08-16 替换 dsh-vision-any）、
> `dsh-usage-plugin`（`dsh-essentials/lib/usage-plugin/`）、
> `dsh-web-ui-notify`（`dsh-essentials/lib/notify/`）、
> Router Standard/Spec 预设（`dsh-essentials/preset/`）与
> **`dsh-market`（`dsh-essentials/lib/market/`）、`dsh-better-sidebar`（`dsh-essentials/lib/better-sidebar/`）**
> ——上游源目录仍保留，升级时同步复制；
> `dsh-notification-center`、`dsh-dream-skin`、`dsh-opencode-go-usage`、
> `dsh-super-injector` 四个第三方插件已删除（历史仍在 git 中；better-sidebar 本次按用户决定重新收编）。
>
> **2026-08-18 拆分**：从 `dsh-essentials` 拆出 `dsh-visualize`（visualize + vision-bridge）
> 和 `dsh-ui-tweaks`（5 个 UI 开关：plugin-inventory/auto-hide/immersive/keyboard-shortcuts/retry-settings）
> 为独立 bundle。`dsh-mode-boost` 删除。modlens 随 vision-bridge 半成品移出后不再维护。
>
> **2026-08-18/19 仓库拆分（全部完成）**：**15 个插件全部拆为独立仓库**——第一方
> （essentials/memory/visualize/ui-tweaks/dev/writing/design/work/desktop-shell）
> 用 filter-repo 提取历史建仓；第三方（dsh-market/usage-plugin/notify/better-sidebar）
> 同样 filter-repo 拆分（本地修改已在仓库内），aqua 走 fork 上游。全部登记于
> `plugins.json`（source=github）、由 `install.sh` 从 GitHub 直装。
>
> **2026-08-19 合并（自研 → 2 monorepo）**：因用户高频编辑每个自研插件、15 个独立仓库管理
> 负担重，自研插件合并：`dsh-plugins`（core/essentials/memory/visualize/ui-tweaks/work，
> subtree 合并保留历史）+ `dsh-skills`（dev/writing/design）。旧的 8 个独立自研仓库归档。
> 第三方 fork 保持独立（需跟上游 merge）。子包用 `&path:/<subdir>` 安装。

## 一览

| 插件 | 上游 | 许可证 | 本地修改 | 维护状态 |
| --- | --- | --- | --- | --- |
| [dsh-ui-tweaks（lib/at-file/）](https://github.com/bitterSmilezzz/dsh-ui-tweaks) | omdsh-dev/dsh-at-file（**已脱钩**） | MIT | link 路径改 `../../deepseek-harness/`（16 处 devDeps + vitest alias） | **已脱离上游**（2026-08-15 重写历史单作者化；不再 subtree pull；2026-08-16 并入 dsh-essentials，2026-08-19 随并入 dsh-ui-tweaks） |
| [dsh-ui-tweaks（lib/paste-input/）](https://github.com/bitterSmilezzz/dsh-ui-tweaks) | @dsh-community (8⭐，**已脱钩**) | MIT | 文案本地化（`locale`）+ 设置页导航图标（官方回形针 DOM 级替换）+ 遮罩/主按钮 token 化 + 资源优化三轮（mapFiles O(n²)→O(n·maxDepth) 等） | **已脱离上游**（2026-08-15 脱钩，按第一方维护；2026-08-16 并入 dsh-essentials，2026-08-19 随并入 dsh-ui-tweaks） |
| ~~dsh-router-standard 预设~~ | yjh051108/dsh-router-standard（**源仓库**，套装仓库 dsh-routing-suite 已弃用） | MIT | ① 测试 import 路径修复 ② preset.yml description 加引号 + 中文化 | **已删除（2026-08-19）**：Router Standard/Spec 预设随用户要求全部移除，不再跟随上游 |
| ~~dsh-mode-boost~~ | ~~yjh051108/dsh-mode-boost~~ | ~~MIT~~ | **已删除（2026-08-18 去芜存菁）**：mode-boost 自动应用路由违反设计理念，host 副本 `lib/mode-boost/` 已移除 | — |
| ~~dsh-essentials/lib/modlens~~ | ~~liustack/modlens~~ | ~~MIT~~ | **已随 vision-bridge 移出**：modlens 已被 vision-bridge 替代，半成品从 essentials 移除；visualize + vision-bridge 现独立为 `dsh-visualize` | — |
| ~~dsh-usage-plugin~~ | ~~feiyang-dev/dsh-usage-plugin（1.4.0）~~（**已脱钩**） | MIT | ① 概览统计卡加 SVG 图标；② 导出按钮收敛为「导出 ▾」下拉；③ 「用量与消耗」「剩余余额查询」合并（内部 tab 切换）；④ 设置导航图标改为 DSH 原生风格 | **已删除（2026-08-21 卸载清仓）**：web profile 卸载 + GitHub 仓库删除；完整历史存档 `doc/archives/dsh-usage-plugin-2026-08-21.bundle` |
| ~~dsh-notify~~（并入 ui-tweaks） | omdsh-dev/dsh-web-ui-notify（0.1.4） | BSD-3-Clause → MIT | 无（原样复制，host no-op，client 通知逻辑） | **已并入 `dsh-ui-tweaks`（2026-08-19）**：notify 功能收编进 dsh-ui-tweaks 重构为单一 bundle，不再单独维护 |
| ~~dsh-market~~ | ~~dsh-market/dsh-market（v1.9.0，459★）~~ | MIT | ① **lib/ 构建产物入库**（上游 .gitignore 忽略 lib/）；② **2026-08-19 独立仓库拆分**（移除 prepare 脚本）③ patch `id: dshmarket` 保持 | **已删除（2026-08-21 卸载清仓）**：web profile 卸载 + GitHub 仓库删除；完整历史存档 `doc/archives/dsh-market-2026-08-21.bundle` |
| ~~dsh-better-sidebar~~ | omdsh-dev/DSH-better-sidebar（v0.12.2） | MIT | ① 从 npm 包收编源码（src+lib）；② **2026-08-16 合并进 essentials**：host apply + client sub_betterSidebar，新增 ws/node-pty 依赖与 webRuntime inject；终端/编辑器 chunk 仍由 host `/sidebar/bundle` 路由提供；③ **2026-08-19 独立仓库拆分**：移除 `prepare` 脚本（同 market） | **已删除（2026-08-20）**：GitHub 仓库删，本地同步移除；完整历史存档 `doc/archives/dsh-better-sidebar-2026-08-20.bundle` |
| dsh-ui-aqua | WYH66666666/DSH-Transparent-UI-Plugin（355★） | MIT | ① **改名 dsh-ui-aqua**（去官方 `@deepseek-ai/` scope，0.1.0）；② **peer 升 rc.7**（上游 rc.5 → 与本机 npm dsh 对齐）；③ **补 `dsh.bundle.patch` 声明 + files 含 cordis.patch.yml**（上游源码缺声明，npm 发布产物有、源码没有，GitHub 直装时会当普通依赖）；④ tsdown 等 rc.7 兼容微调。**内容=本地在用版本**（web profile 实测运行的，2026-08-19 确认以此为准） | **已恢复·按需可选（2026-08-21）**：本地仓库自 `doc/archives/DSH-Transparent-UI-Plugin-2026-08-20.bundle` clone 恢复（HEAD=`7d831d6`=上游 fa0cb1f+本地适配），web profile link 使用；GitHub fork 未恢复（仅本地）；上游自 fa0cb1f 后仅 3 个 README commit（2026-08-20），无代码更新。**不入默认安装清单**——按需手动 `dsh plugin --profile web add <伞目录>/DSH-Transparent-UI-Plugin`；本机 dsh 0.1.1-rc.1 下浏览器实测待做 |
| ~~dsh-work~~（已退役 2026-08-20） | NanmiCoder/dsh-agent-teams（v0.1.5，388★，**已脱钩**） | MIT | ① **lib/ 构建产物入库**（上游 .gitignore 忽略 lib/，源码仓库无 lib；移除 .gitignore 的 lib/ 并提交构建产物，免构建安装）② **2026-08-16 改名收编为 dsh-work**：package name / cordis patch / 代码内 `dsh-agent-teams`→`dsh-work` 全量替换，repository/homepage 指向本仓库 | **已退役（2026-08-20）**：与官方 rc.8 内置 Agent Teams 运行时功能重复，已从 web profile 卸载并从 plugins.json/README 清仓；独立仓库保留历史 |
| [dsh-writing（skills/）](https://github.com/bitterSmilezzz/dsh-skills) | imraywang/wewrite (MIT) · Gracker/gracker-writing (MIT) · zLanqing/codex-claude-academic-skills (MIT, 仅 research-writing-skill) · aiworkskills/wechat-article-skills (Apache-2.0) · Jeffallan/writing-with-agents (MIT) · Mouriya-Emma/writing-pipeline-zh (MIT) · Hyacehila/tech-blog-writing (Apache-2.0) | MIT / Apache-2.0 | 原样复制 skill 目录，无代码修改；各来源 LICENSE 收在 `dsh-writing/licenses/`；codex 只收 `research-writing-skill`（office/scientific 子包未收） | 跟随上游（2026-08-16 收编于 dsh-skills 子包；升级 = 重新拉取对应仓库并对照 `licenses/` 复查） |
| [external/browser-skill](external/browser-skill/)（meta-repo 内）| Tencent/BrowserSkill（MIT） | MIT | 仅收 SKILL.md（纯技能包），不收 DSH 插件（11 个 browser_* 工具超标，违反 Pi「>10 必须拆分」红线）；bsk CLI + Chrome 扩展由用户按 AGENT_INSTALL.md 自行安装 | 跟随上游（仅同步 SKILL.md；升级 = 重新拉取 skill/SKILL.md 覆盖） |

## 本地修改详情（升级合入时重点检查）

### dsh-ui-tweaks/lib/at-file — link 路径（基础设施修改）

- **已脱离上游（2026-08-15）**：`git filter-repo --mailmap` 重写历史单作者化，不再 subtree pull，
  按第一方插件维护。**独立仓库（2026-08-19）**：源码在 dsh-ui-tweaks 仓库的 `lib/at-file/`。
- **改了什么**：devDependencies 全部 `link:../dsh/...` → `link:../../deepseek-harness/...`（16 处），
  `vitest.config.ts` alias 同步（1 处）——上游假设插件与 `dsh` 目录平级，monorepo 里是两跳。
- **验证**：`pnpm install && pnpm test`（149 项）全过。

### dsh-ui-tweaks/lib/paste-input — 已脱离上游（本地化 + 导航图标 + 主题 token + 资源优化）

- **已脱离上游（2026-08-15）**：不再跟随上游，本仓库副本即唯一事实来源，按第一方维护
  （未做历史重写，原作者仍留在贡献者史里——与 at-file 的差异是刻意的）。
  **独立仓库（2026-08-19）**：源码在 dsh-ui-tweaks 仓库的 `lib/paste-input/`。
- **改了什么**：① 文案接 `@deepseek-ai/dsh-client-locale`（inject 双处声明）；② 设置页导航图标
  DOM 级替换为官方回形针（外壳 `navIcon()` 无 slot hook，MutationObserver 常驻，卸载重启恢复）；
  ③ CSS token 化（遮罩 → `--dsw-alias-bg-mask-1` + `--dsw-mask-blur`，OK 按钮 →
  `button-primary-fill` + `label-primary-foreground`）；④ 资源优化三轮（68b0411 折叠扫描降频 /
  847e8e6 mapFiles O(n²)→O(n·maxDepth)、commit 失败即清 staging、释放 File 引用 / d38660a 外壳
  isConnected 快路径、TreeWalker hidden 门控）——语义零变化，细节见 NOTES.md。
- **升级**：不再升级上游；如上游出现值得借鉴的修复，手动 cherry-pick 后对照上述修改点复查。
- **验证**：mapFiles 回归 10/10 + `node --check`；真机=client 硬刷新、host 重启。

### dsh-essentials/lib/modlens — llm 服务引用捕获（bundle 重载竞态修复）

- **问题**：`dsh web` 每次启动必现 `[modlens] vision provider discovery sweep failed: Error:
  cannot get required service "llm" in inactive context`（host 其余正常）。
- **原因**：Cordis 4 经 fiber store 解析注入服务（激活时快照、卸载时置 undefined）；modlens 初始
  sweep 在 apply 里同步启动、内部 `await llm.listModels()`；essentials 组合 fiber 因注入服务被
  重新 provide 而 unload/reload 时，旧 sweep 的异步续延再访问 `ctx.llm` 直接抛错，sweepOnce 捕获
  打日志，且稳定启动后可能无人再触发重试 → 视觉 wrapper 一直没注册。
- **改了什么**：① `registerVisionProvider` 开头 `const llm = ctx.llm` 同步捕获，sweep /
  `registerAdapter` / `listModels` / `resolveModelInfo` / `stream` / `listProviders`（8 处）全部
  改用捕获引用——续延不再经 fiber store 解析，卸载后不抛；② `pasteTakeoverVerdict` 的
  `host.llm` 访问包 try/catch，重载窗口降级返回 false（保守否决）。
- **验证**：node 22 跑 cordis 4 最小复现（apply 内异步续延 + 中途 dispose fiber → 同款报错；
  捕获后消除）+ `node --check` + inject/package 一致性守护全过。
- **升级**：`git subtree pull` 后对照本修改点复查（上游包名/代码未变，此修复为本仓库独有）。

### dsh-client-ui-aqua — 包名去 scope + bundle 注册 id 同步

- **收编（2026-08-18）**：`git subtree add`，lib/ 随上游入库无需构建。上游在
  deepseek-harness monorepo 内构建（`build.ps1` 把源码拷进 `packages/client/ui-aqua`，
  `tsdown.config.ts` 用 monorepo 共享的 `../tsdown.client.ts` helper）——**本仓库无法重建
  aqua**：tsconfig `extends: ../../../tsconfig.base.client.json` 与 `references` 指向的
  `../../../vendor/cordis`、`../locale` 等路径只存在于上游 monorepo；本仓库只提交构建产物。
- **改了什么**：① package.json name 去 scope（`@deepseek-ai/dsh-client-ui-aqua` →
  `dsh-client-ui-aqua`，与 npm 发布名、patch name 对齐）；② **`lib/client.js` 的
  `__ModuleLoader__.load` id 去 scope**——harness 的 client-modules 按插件**包名**查找
  bundle 注册 id，改名后 bundle 仍注册旧 scope id 会报
  「loaded without registering "dsh-client-ui-aqua"」；同步替换了 `lib/invariant.js` 的
  `PACKAGE_NAME`、`src/client/theme-layer.ts` 的 `OVERRIDE_SOURCE`（theme override 栈身份）
  与 `src/invariant.ts`，以及 README/README.zh 的手动安装片段（patch `name:` 与 ln -s 目标）；
  ③ `tsdown.config.ts` 改为自述性存根（本仓库不可构建，运行 `pnpm bundle` 会抛带指引的错误）。
- **升级**：`git subtree pull` 后重新构建产物会带旧 scope id（上游包名没变）——**必须复查
  `lib/client.js` 的注册 id == `dsh-client-ui-aqua`**，否则浏览器端加载失败（host 半区照常
  加载，错误只出现在 Web UI）。
- **验证**：`node --check lib/client.js lib/invariant.js` + grep 无残留
  `@deepseek-ai/dsh-client-ui-aqua`；真机=client 硬刷新（host 重启非必需，此插件 host 为 no-op）。

### dsh-client-ui-aqua — Windows 流体鼠标反馈修复（本地修改）

- **改了什么**（2026-08-18）：上游把 deepseek.com 官网的「触摸设备和 Windows 不喂鼠标」策略照搬进 `fluid-shader.ts`——Windows 上流体背景永不跟随光标（Mac 鼠标一划水面起波纹，Windows 没有）。本地去掉 Windows 分支改为 `if (!coarse)`：桌面指针（含 Windows）全部喂鼠标，触摸/coarse 仍跳过。`src/client/fluid-shader.ts` 与 `lib/client.js`（本仓库不可重建 aqua，直接同步改构建产物）两处一致修改，头部注释同步更新。
- **reduced-motion 静态帧保留**：Windows「设置 → 辅助功能 → 视觉效果 → 动画效果」关闭时 Chromium 报 `prefers-reduced-motion: reduce`，粒子鲸鱼/流体/网状交互/小鱼全部降级为静态帧——这是可访问性设计，尊重系统偏好，不随本次修复改动；README 已写明开关位置。
- **验证**：`node --check lib/client.js` 通过；grep 无 `userAgent*Windows` 残留；真机=Windows 浏览器硬刷新后移动鼠标，流体应出现波纹。
- **升级**：`git subtree pull` 后 `lib/client.js` 会被上游产物覆盖——**必须复查 `fluid-shader.ts` 的 `if (!coarse)` 分支与 `lib/client.js` 对应处**，否则 Windows 修复失效。


## 维护流程（新增/升级第三方插件）

1. **改过的第三方 → fork**：`gh repo fork <upstream> --clone=false`，克隆 fork 后把本地改动
   提交到 fork（单 commit 便于对照）；汇总仓库 `plugins.json` 登记 `source: github` +
   `origin: third-party-fork` + `upstream` 字段。
2. **未改的第三方**：可 `git subtree add --prefix=<dir> <upstream> main --squash`，或直接登记上游 URL。
3. **记录**：THIRD-PARTY.md 加一行（来源 / 许可证 / 本地修改 / 维护状态）+ README 表格标注「第三方 / fork」。
4. **升级 fork**：`git fetch upstream && git merge upstream/main` → 对照本文档「本地修改」
   检查是否被覆盖 → 重新构建/测试 → 提交 → push fork。
5. **安装**：`install.sh` 按 `plugins.json` 直装（`github:<repo>#<ref>`）或 `dsh plugin add <绝对路径>`。

## 判定规则：跟随上游 vs fork vs 本仓库维护

- **无本地修改** → 跟随上游：登记上游 URL 或 `subtree pull`。
- **有本地修改** → **fork 上游 + 本地 commit**：本地与上游并存，升级 merge 后复查修改点；
  若修改与上游方向冲突（如 paste-input 的本地化/脱钩），以本地为准，必要时脱钩后按第一方维护。
- **已脱钩**（at-file / paste-input）→ 第一方维护，独立仓库（已拆分）。
- **dsh-work 已退役（2026-08-20）**：与官方 rc.8 内置 Agent Teams 运行时功能重复，
  已从 web profile 卸载并从 plugins.json/README 清仓；独立仓库 `bitterSmilezzz/dsh-work` 保留历史。

---

## 归档：docs/agent-self-optimization.md（历史文档，2026-08-24 归档）

# Agent 自优化契约

## 目标
在**不影响使用体验**的前提下，最小化 agent 自身的资源消耗（上下文 token、工具调用开销、推理计算）。

## 优化规则

### 1. 工具调用 - 批量化
- 多个独立 curl/API 请求合并为**一个 bash 命令**（`&&` 串联）
- 多个 grep 查询合并为**一个 grep 调用**（`-e` 多模式）
- 避免先查再读的冗长链路，直接读目标行

### 2. 文件读取 - 精准化
- 禁止 `cat` 大文件；改用 `read` + `offset`/`limit`
- 禁止读取已在 workspace instructions 中加载的文件（AGENTS.md 已自动注入）
- 大文件只读需要的行号范围，不读整文件

### 3. 子代理 - 零轻量
- 简单操作（clone、copy、ls）直接用 `bash`，不用 `subagent`
- 子代理仅用于需要独立推理上下文的复杂任务

### 4. 回复 - 精简
- 优先用一两个工具 + 简洁回复完成任务
- 分析类回复只给结论，不重复中间数据
- 可视化卡片仅用于需要视觉呈现的复杂数据

### 5. 上下文 - 不重复
- 同会话内不重复读取已加载过的文件
- 不重复陈述已给出的信息

---

## 归档：docs/memory-plugin-audit.md（历史文档，2026-08-24 归档）

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
