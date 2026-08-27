# 性能 / 资源 / 优化（59 条）
- **dsh-asr-voice 静音案终修（更正上一条）：根因是「浏览器授权弹窗/站点设置里选中了虚拟麦克风」而非机器级 Chromium 故障——用户把浏览器输入设备改为内置麦克风后问题即解（2026-08-27，性能/诊断）**：
问题=上一轮结论（MacBook Air 上 Chromium 全家桶采不到麦克风）被用户实测推翻：浏览器里换用默认/内置麦克风后一切正常。
原因=用户机器装有 OrayVirtualAudioDevice（向日葵）与 Steam Streaming Microphone 两个虚拟音频驱动；浏览器（Tabbit 首当其冲，Chrome 同理）授权弹窗/站点设置各自记忆所选输入设备，**被选中的若是虚拟设备（无人喂音频）则录到纯数字静音**，而 Safari 默认走内置麦克风故正常。此前 ffmpeg -f avfoundation -list_devices 只见两个虚拟设备，表面像「内置麦克风从 AVFoundation 消失」，实为**终端进程无麦克风 TCC 权限被系统屏蔽了真实设备枚举**（虚拟设备不需要权限所以可见）——又一个 TCC 混淆源。
解法=浏览器授权弹窗/地址栏锁图标 → 麦克风 → 把输入设备选为「内置麦克风」（虚拟设备别选）；系统设置里默认输入也保持内置。插件侧把该提示写进静音报错文案与 README 已知风险。
坑=①**排查输入静音时，浏览器级设备选择是第一个要查的点**（各种权限弹窗里带设备下拉，各浏览器独立记忆），虚拟音频驱动（远程控制/直播软件）是重灾区；②**ffmpeg/CLI 枚举 AVFoundation 设备会被 TCC 过滤**（无麦克风权限看不到真实设备），不能据此断定「系统设备丢失」——先确认调用方是否有权限；③**「换浏览器即好」不一定等于浏览器坏了**，可能是那家浏览器记忆了不同的输入设备；④静音守卫按真实 WAV 峰值拦截、不发 ASR，把「静音幻觉错字」变成可操作的「检查设备选择」提示，这是这类问题最值得保留的插件能力。
验证=用户将浏览器输入设备改为内置麦克风后恢复；Safari 全程正常作对照。
可复现?是（把浏览器麦克风设备选成未喂音频的虚拟设备即可复现静音）。
- **dsh-asr-voice 静音案闭环：这台 MacBook Air 上 Chromium 全家桶(Chrome/Edge/Tabbit)音频采集全静音，Safari(WebKit)正常——机器级兼容问题，插件/ASR/麦克风全部无罪（2026-08-27，性能/诊断）**：
问题=上上条判 Tabbit 全局静音后，用户改用 Chrome 测仍静音，一度怀疑插件守卫误报。最终 Safari 一次通过（你好 识别正常），闭环。
原因=证据链：①Chrome 的 raw.webm（877B，2.52s）ffmpeg 解码仍 0% 非零样本——Chromium 在系统默认「MacBook Air 麦克风」上拿到纯数字静音；②系统设置输入音量条正常、语音备忘录录音正常、Safari 正常——同一台机、同一个默认输入设备，唯独 Chromium 采集路径静音；③恢复浏览器默认约束（关 AEC 也会致静音）与换守卫判定源（analyser→转换后 WAV 真实峰值）均未改变 Chrome 结果 → 不是插件参数问题。根因在 Chromium 的 macOS 音频服务与 Apple Silicon 内建麦克风/系统音频 HAL 的兼容（疑似采样率协商/格式协商失败被当作静音），属于浏览器层面，等 Chrome 更新或 OS 更新可能自然修复。
解法=①**语音输入在该机器用 Safari**（插件天然支持：pickMime 落 mp4、decodeAudioData 保底），Chrome/Edge/Tabbit 干别的；②插件侧保留全部诊断资产：raw/webm 落盘文件自动带 UA 浏览器标签（uaTag）、错误提示条允许换行（详情不再被 nowrap 截断——之前用户连报错里的设备/浏览器信息都看不见）、静音守卫基于转换后 WAV 真实峰值。
坑=①**测试必须区分「哪个浏览器跑的」**——用户口头说 Chrome 可能实际还在 Tabbit；落盘文件加 UA 标签后文件名自供证据（raw-Chrome150.webm 之类），不再依赖口头；②**提示条省略号/截断会吞掉诊断信息**：报错详情要用 wrap 而不是 nowrap，否则用户看到的和能复制的都不是完整信息；③纯 Chromium 系 WebRTC 静音但 Safari 正常时，别在插件里换采样率/约束去碰运气——先换浏览器定量，再决定是否动参数。
验证=Safari 识别「你好」成功闭环；Chrome/Edge/Tabbit 的 raw 全部 0% 非零；commit 至 c88115e。
可复现?是（该机器任意 Chromium 浏览器录任何内容均为纯静音，Safari 正常）。
- **dsh-asr-voice 静音案终局：用户实为 Tabbit(Chromium 150)浏览器，mictests.com 同样「could not capture any sounds」——Tabbit 全局拿不到麦克风，与插件/DSH 无关；系统层正常（设置音量条动+语音备忘录有声），修复=重装触发 TCC 重新授权或换 Chrome/Edge（2026-08-27，性能/诊断）**：
问题=上一条「Chrome 麦克风采集整段静音」的判决需要修正主语：用户实际用的是 **Tabbit Browser**(com.tab-browser.Tabbit，基于 Chromium 150.0.7871.129)。追问后在标准测试页 mictests.com 同样失败（Testing failed because your microphone could not capture any sounds）→ **Tabbit 全局（任何网站）拿不到麦克风**，不是 DSH 页面、不是插件、不是 MiMo。macOS 系统输入正常（系统设置输入音量条动、语音备忘录录音正常）→ 根因在 **Tabbit 与 macOS TCC 之间**：自动更新/签名变化使旧授权失效时，macOS 对 Chromium 移植版常「成功但给静音流」而不报 NotAllowedError（getUserMedia 正常 resolve、MediaRecorder 录到全零 webm）。
解法=①**换系统浏览器**（用户机器本就装有 Google Chrome.app 与 Microsoft Edge.app）——插件官方支持面，静音守卫/快速入框等全部修复与其无关，直接生效；②修 Tabbit：完全退出后 `sudo tccutil reset Microphone com.tab-browser.Tabbit` 清掉失效条目 → 重开 Tabbit → 触发系统弹窗点允许；或直接重装 Tabbit（新签名触发全新 TCC 授权）。
坑=①**「无痕窗口/刷新」只解决缓存，永远解决不了「浏览器自身拿不到麦克风」**——这类排查一定要先做浏览器无关性验证（mictests 之类标准页），否则会白改好几轮插件；②**查 mac 系统设置音量条/语音备忘录只能证明「系统层 OK」，不能证明「该浏览器 OK」**——Chrome 内核分叉的输入流是独立于系统的；③TCC 失效的 Chromium fork 静音时 getUserMedia 不 reject，静音守卫（电平峰值判断）是这类场景的唯一兜底，避免把静音发给 ASR 幻觉出假文本；④query 期尽快用 `mdls -name kMDItemCFBundleIdentifier` 拿到 bundle id 才能 tccutil。
验证=mictests.com 在 Tabbit 内失败 + 同一台机器系统输入正常，交叉互证；用户待切换 Chrome/Edge 或重置授权后复测。
可复现?是（Tabbit 内任何网站麦克风全静音均可复现）。
- **dsh-asr-voice 「yeah/好的/no text」根因：Chrome 麦克风采集整段数字静音，与插件/ASR 均无关（2026-08-27，性能/诊断）**：
问题=用户报语音输入「一直卡/识别成 yeah/返回 no text」，历经多轮修复（快速入框、静音开关、optimize 超时、webm 优先、音量归一化）均无效，无痕窗口+强制刷新后依旧。
原因=**落盘对比抓出铁证**：①host 在识别结果 ≤8 字符时自动保存转换后 WAV，异常时客户端再发 ?capture=1 存原始录音→同一轮拿到 raw.webm(1135B) 与 ok-Yeah.wav(109KB)；②ffmpeg 解码 raw.webm：**3.42s、非零样本占比 0.0%、全窗 RMS 0**——Chrome MediaRecorder 从源头采到的就是纯数字静音（opus 对静音压到 1KB 级是正常体积）；③转换后 WAV 同样是全零 → blobToWav16k 无辜（输入即静音）；④20:51 那次（无任何 Web Audio 介入）也是全零 → 与 analyser 无关；⑤1s/3s/8s/20s/60s/120s 语音和 1%/15% 音量直接 curl MiMo 全部秒级正确识别 → ASR 端彻底排除。结论=**用户机器上 Chrome 的麦克风输入就是静音**（系统默认输入设备为静音/虚拟设备/输入音量 0/外设未接，或 Chrome 设备句柄卡死）。MiMo 对静音音频会幻觉出短词（yeah/好的/嗯。）或空文本——之前全部怪象是同一根因的多种表现。
解法=①**静音守卫**：录音期间 analyser 追踪峰值电平（startLevelMeter 常开，兼恢复频谱反馈），onstop 时峰值 <0.01 判定整段静音→**不发 ASR**，reject no-sound:设备标签 → UI 提示「未检测到声音，请检查系统输入音量与麦克风设备（XX）」——把静音从「幻觉错字/空报错」变「明确诊断」；②host ?capture=1 纯抓取分支（不调上游只落盘 raw）随时可开诊断。
坑=①**「识别结果短」判定要按字符数而非字数**：yeah 4 chars ≤8 才捕获，首版阈值 ≤2 漏掉了英文短词（用户声明的关键症状差点没抓到）；②**原始音频必须单独保存**：host 收到的一向是转换后 WAV，无法判断「采集静音 vs 转码清零」——必须 client 侧在异常时把转换前 blob 也 fetch(?capture=1) 一份；③**电平表不能只跟着静音检测走**：之前 silenceStop=false 时整个 analyser 没建（频谱静止、也无法做守卫），必须常开；④macOS 自带 ffmpeg/ffprobe（Homebrew）可直接解码 webm 验证「Chrome 到底录到了什么」，零成本定位设备级问题；⑤音量归一化/格式切换等「防御性修复」在输入就是静音时全部无效——先拿原始字节定性，再谈改算法。
验证=raw.webm ffmpeg 解码 0% 非零样本 + 转换 WAV 全零 + 同等语音直连 MiMo 秒级正确，三者互证；commit 序列 1f961b3→89cc53b→10d9fc2→64c0002→f40adf5→ca62871。
可复现?是（Chrome 输入为静音时必现全零 raw/webm；静音音频打 MiMo 必幻觉短词或空文本）。
- **dsh-asr-voice 手动关麦回归 + 优化卡死根因修复：静音自动停止改开关（默认关），llmOptimize 无超时是「一直在转」的真凶（2026-08-27，性能/交互）**：问题=上轮快速路径后用户反馈「说完话一直卡着」，且明确不要静音自动关麦、要手动关麦（点停止即整段去 ASR→优化）。原因=①快速路径里 `llmOptimize`（client）是**裸 fetch、无 AbortController 超时**——后台 /optimize 一挂（reasoning=high 模型响应慢/上游卡），`runBackgroundOptimize` 永不 resolve，`setPhase('optimizing')` 把按钮永远钉在「优化中」=「一直卡着」（草稿其实已可发送，但状态机不放行新录音）；②静音自动停止 2.5s 是硬编码、用户不想要，且会在句中停顿处截断。解法=①`behavior.silenceStop`（z.boolean default false）：`createCloudRecorder(language,onError,silenceStop)` 第四参，仅开启时才 `startSilenceDetection()`（手动关麦 = 不启 AudioContext 分析，点停止才整段去 ASR；120s 时长上限兜底）；②`llmOptimize` 加 60s AbortController 超时（optime 与 transcribe 同约定），AbortError→`Error('optimize timeout')`→快速路径 catch 走 notice「优化失败，已保留清洗版」+finally setPhase('idle')，预览/autoSend 老路径也受益（以前同样会无限转圈）；③设置卡「交互行为」加 ToggleRow + zh/en 词典 + README 设置表/功能行，holdToTalk 文案同步去掉「或静音自动结束」旧描述；④传参链：voice-button `startWithEngine` → `createVoiceRecorder(engine,language,onError,config.behavior.silenceStop)`。坑=①**任何 fetch 到 host 的路由都要带超时**（transcribe 有 60s、optimize 原来没有——后台替换路径把「永远转圈」从可容忍变不可容忍，因为文字已入框、状态却不放行）；②静音检测只在 cloud 引擎存在，browser（Web Speech）天然手动/无静音概念，开关只透传 cloud；③silenceStop 关时 startSilenceDetection 完全不调用（连 AudioContext 都不建），省资源；④设置 schema/config/词典/设置卡/README 五处同步是这类配置项的固定动作；⑤已有 settings.yaml 无新字段 → schema default 兜底 false，无需迁移。验证=host/client tsc+tsdown 构建全过；commit 89cc53b（8 文件 53+/19-）；junction 重建即更新、重启 dsh web 生效。可复现?是（旧版 llmOptimize 无超时 + 上游慢 → optimizing 永转可复现；silenceStop=false 时录音可超过 2.5s 静音不自动停可复现）。
- **dsh-asr-voice 云端 ASR 延迟实测与修复：小米 MiMo 本身 0.5s 级快，卡感=静音 2.5s + 停止后 ASR 与 LLM 优化串行两跳 + 云端引擎无 interim——改为「停止即填清洗版入草稿 + LLM 优化后台完成再替换」(2026-08-27，性能/交互)**：问题=用户报 dsh-asr-voice 用小米 MiMo 还是卡，手动停止后也慢。原因=用 settings.yaml 里的 key（未打印）实测 MiMo 端点：1s/3s/8s 音频墙钟 0.42/0.51/0.75s、/models 0.12s——**provider 不是瓶颈**；卡感来自插件自身串行链：①cloud 引擎 interim 为空（录音途中零反馈，注释明写「云端引擎为空」）；②静音自动停止 2.5s；③用户实际配置 `optimize.mode: llm` 且空模型=用 DSH 当前所选模型（deepseek-v4-flash reasoning=high）再串一躺 LLM 优化；④文字要等 ASR+LLM 两趟都完成+预览卡点确认才进输入框≈2.5s+0.6s+1~3s+点击。解法=①新配置 `optimize.preview`（默认 false）：llm 模式下 stop 后立即把 `heuristicOptimize(text)||text`（本地清洗、免费即时）填进草稿，`setOptimizingDraft(true)+setPhase('optimizing')` 显示「优化中…草稿已填入，可直接编辑或发送」；后台 `llmOptimize(raw)` 完成后**仅当 `draftRef.current===insertedRef.current`（用户未编辑）才 `setDraft(优化版)` 替换**，失败仅轻提示保留清洗版；②`preview=true` 或 `autoSend=true` 保持原流程（预览卡确认 / 说完即发优化版），autoSend 不受 preview 影响防误发未优化文本；③`optimize.preview` 同步进 host schema（z.boolean default false）+ client config + 设置卡 ToggleRow + 词典 + README。感知等待从「ASR+LLM 优化+确认」→「ASR 单跳+草稿立即可用」。坑=①草稿是 owner props 的 InputState（inputActions 无 getter），防覆盖必须 `props.input?.draft` + useEffect 回写 draftRef、替换前比较，别假设 setDraft 后同步可读；②finish 里 finalize(fast) 后再 setPhase('optimizing') 被 React 批处理成最终态 optimizing，顺序无所谓；③begin() 要重置 optimizingDraft/insertedRef，防上一轮后台优化残留污染新一轮录音；④catch 不绑定变量（`catch {}`）防 noUnusedLocals；⑤llm 分支里 autoSend/preview 走原流程、快速路径只留给默认组合，防误发未优化文本；⑥已装插件是 junction（`~/.dsh/profiles/web/node_modules/dsh-asr-voice→工作区`），重建 lib/ 即更新、重启 dsh web 生效，无需重装。验证=host/client tsc + tsdown 构建全过；commit 1f961b3（6 文件 89+/13-）；junction 确认存在；README 设置表同步。可复现?是（实测 MiMo 端点 0.5s 可复现；卡感=optimize.mode=llm 且改造前两跳串行可复现）。
- **Aqua 玻璃拟态主题（dsh-client-ui-aqua fork）性能补丁：保留观感、砍每帧 GPU/布局开销——流体降 dpr+限流、dialog 50px blur 归零、呼吸动画删除、whale 布局抖动消除（2026-08-25，性能/资源）**：问题=用户报「dsh 网页端特效太多很卡」，怀疑内存不足；实测 16GB 空闲 47%、dsh web 仅 ~490MB——不是内存，是 Aqua 主题的渲染/合成开销。原因（按成本排序）=①全屏流体 shader 显示 pass 全分辨率 + 每像素 8 次 swirl 迭代 @30fps 永不空闲（dpr cap 1.5）；②多处大面积 `backdrop-filter: blur(14-20px)`（侧栏/顶栏/输入框/轨迹）+ `[role=dialog]` 直接 blur(50px)（全应用最贵单点）；③ambient 全屏 opacity 呼吸动画 9s infinite（永久全屏合成）；④whale 粒子引擎每帧跑 `querySelector('[data-phase]')`+`getBoundingClientRect`（30/s 强制布局抖动）。解法=①fluid：dpr cap 1.5→1.0 + 长边 1600px 上限（4K 保护）+ swirl 8→6——显示 pass 约省 2.8x，CSS 拉伸柔和渐变视觉无差；②blur 出厂默认 20→10（滑杆仍 0-40，backdrop-filter 成本随半径近似平方增长）；dialog blur(50px)→14px（填充 ~55% 不透明，观感不变）；CSS 兜底 var(--dsh-aqua-blur,14px)→10px 全量替换、compat 12→10；③删除 breathe 动画保留静态渐变（0.86↔1 的摆动不可感知）；④whale positionHost 每帧→500ms 节流（30/s→2/s 布局读）。**坑**=①**fork 的 src 与 lib 已漂移**：`src/index.ts` 只是空 apply，settings namespace 注册只存在于提交的 `lib/index.js`（keyed-slot 修复 commit 只改了 lib 没改 src）——重建时绝不能用当前 src 重出 node 半区（会丢 settings 注册），只能单出 client 半区、node 半区从 git 恢复；②**fork 无法原地构建**：tsdown.config.ts 引用 `../tsdown.client.ts`（原 monorepo 布局），工作区根无此文件——用 dsh-skin-runtime/build/tsdown.client.ts 同套 helper（vendor 自官方 harness packages/client/tsdown.client.ts）+ 临时 config；③helper 的 `workspaceManifest` 用 `packages/*/*/package.json` glob 定位包，插件不在该布局→临时在 dsh-skin-runtime/packages/client/ui-aqua 放一份 package.json（symlink 不 glob 到，必须真实目录）；④tsdown/rolldown 会自己从 cwd 读 tsconfig.json，`tsconfig:false` 拦不住 extends 缺失报错——临时换最小可解析 tsconfig（备份后恢复）；⑤rolldown 的 `node:module` runtime 报错来自 node 半区构建，client-only 过滤即可绕过（node 半区本来就不需要重建）；⑥bundle 验证用 grep 产物：swirlIterations:6/MAX_FLUID_BACKING=1600/blur(14px) 且无 blur(50px)/无 dsh-aqua-breathe/blur:10——minifier 会内联常量，`blur:` 后用 python 上下文确认。**验证**=node --check 三个 lib 产物全过；产物 grep 逐项确认 6 处改动；profile 依赖 github:→link:（备份 package.json+lockfile，pnpm install 后 node_modules/@deepseek-ai/dsh-client-ui-aqua 变 symlink、lockfile 记 link:，与 dsh-computer-use 同模式）；fork 本地 commit 54e69cf（未 push）。可复现?是（改动均可在产物中静态验证；运行效果需用户重启 dsh web 后体感/DevTools Performance 复核）。

- **dsh-ui-tweaks 交互提速：effort 辐射 canvas 空闲冻结（rAF 永续→按需）+ 上传并发 2→4（2026-08-24，性能/资源）**：问题=①effort 强度滑杆的 canvas 辐射特效在菜单打开期间**永续 rAF 循环**（每帧 ~4px 网格全画布逐 cell sin/pow/hypot/exp + 粒子 + 径向渐变，60fps 空转烧 CPU/电池）；②多附件上传固定 2 并发 worker，host 上限 4。原因=①原实现无条件 `requestAnimationFrame(loop)` 且 draw 不返回是否继续；②客户端硬编码 2。解法=①循环改为**按需启停**：draw 返回「是否仍需动画」（dragging 或 progress 未收敛到 target），空闲画一帧静态图即停表；加 phase 时钟（仅在运行时累加 delta，恢复无相位跳变）+ document.hidden 停表 + visibilitychange 重启动；prefers-reduced-motion 保持单帧。②并发 worker `Math.min(2,…)`→`Math.min(4,…)`，对齐 host DEFAULT_LIMITS.maxConcurrentUploads=4（超过 429）。**坑**=①RAF 停表后必须把 frame 归零，否则 redraw 的「frame===0 才重启」判定失效；②直接用 performance.now() 作 wave 相位，冻结恢复后时间跳变会让波浪突跳——用只随运行帧累加的 phase 时钟；③frozen 帧由 redraw 的同步 draw() 维持，主题/尺寸变更观察器仍直接 draw() 不受影响。**验证**=typecheck+build 全过；lib/client.js 确认含 dms-effortFooter/并发 4、无残留 dms-cell。可复现?是（打开模型菜单 idle 时 DevTools Performance 不再有持续 canvas 绘制帧）。

- **传输层双空间实测：gzip 未开（-74%）+ 缓存未生效（no-cache 无 ETag，二次加载仍全量 4.7MB）——反向代理方案已产出（2026-08-19，性能/资源）**：问题=goal 第 2 轮补完「还有优化空间吗」的传输层。实测=①**缓存头**：bundle 响应 `cache-control: no-cache` + 无 ETag/Last-Modified，同浏览器上下文二次加载仍传输 4772KB（与首次相同）——**每次刷新全量重传**；静态 URL 带 `?rev=<hash>`（内容寻址），长缓存 immutable 安全；②gzip 上轮已验证（-74%）。**解法=产出 `doc/dsh-transport-optimization.md`**：nginx 与 Caddy 两种反向代理配置（proxy 3080 + gzip/gzip_proxied + assets/plugins 改 `public, max-age=31536000, immutable` + 页面本体保持 no-cache + WebSocket 透传），叠加效果=刷新从 4.7MB → 首次 1.2MB / 之后 0 字节。**坑**=①`no-cache` 不等于「不缓存」——它允许缓存但每次必须 revalidate，无 ETag 时 revalidate 无法 304 → 全量重传（playwright 同上下文二次加载 transferSize 不变即证据）；②proxy 层 gzip 需 `gzip_proxied any`（默认只压直连响应）；③静态 location 用前缀匹配 `^/(assets|plugins)/`，页面 / 单独 no-cache（immutable 只给 rev 内容寻址资源）；④验证用 curl -I 看 content-encoding + measure-load 对比二次 transfer。可复现?是（响应头无 gzip/无 ETag、二次加载全量重传均可复现）。

- **剩余优化空间终版评估：自研侧已饱和，唯一大空间=gzip 传输压缩（-74%，插件不可达需官方/代理）（2026-08-19，性能/资源）**：问题=用户问「还有优化空间吗」。评估=①**已排除 6 项**（全部实测）：内联外部依赖（全自研 bundle 零 `// node_modules/` 标记，zod 是唯一已剥离）、CSS 体积（client.js 样式块仅 12KB/4%）、官方 bundle 裁剪（conversation/runtime/trajectory 等由 harness web-app 自带，profile 依赖列表无这些包，不可配）、at-file search 性能（模拟 indexWorkspace：伞目录 5000 文件 65ms、父目录 33ms，@ 触发时才运行，健康）、内存（R8 无泄漏）、dsh-work 工具描述（14 条 1746 字符，每条 100-211 已紧凑，行为引导文本压缩风险>收益）；②**唯一剩余大空间=gzip**：实测 DSH 静态服务器未开 content-encoding，client.js 306KB 传输→gzip 79KB（-74%），全站 4.7MB JS→~1.2MB。**坑**=①webServer 服务契约（Inspect：register/registerUpgrade/registerFallback/tapIndex/applyIndexTaps）无 compress 配置——插件与 profile 层均无法开启 gzip，registerFallback 只有一个座位（SPA dist server 已占用，再注册 throw）；②判定「还有没有空间」要区分**插件可达**与**框架固有**两层——自研侧已达饱和，框架侧（gzip）是唯一未开发传输优化，需官方支持或用户侧反向代理（nginx/caddy 对 3080 gzip，收益与插件体积优化正交叠加）。**验证**=playwright 请求 client.js 响应头（content-encoding 空）+ zlib.gzipSync 实测 -74%；indexWorkspace 模拟扫描实测。可复现?是（响应头无 gzip、gzip 压缩比均可复现）。

- **zod 瘦身落地：产物级 tree-shake 推翻「不可行」结论——8 API 具名导入 + IIFE 隔离，client 762→305KB（-60%）、host 581→119KB（-79%）（2026-08-19，性能/资源）**：问题=用户拍板「都做」，落地 zod 体积优化。解法=关键洞察：**esbuild 具名导入能 tree-shake zod v4**（此前 R3/R5 判「tree-shake 不可行」是因为 `import * as z` 全量导入阻止摇树；具名 `import { string, object, enum as zodEnum, boolean, union, array, discriminatedUnion, literal } from 'zod'` 触发摇树 → 68.5KB，-87%）。实施=①esbuild --bundle --minify 打包 8 API 子集；②**IIFE 隔离**：minify 子集短变量名与宿主顶层声明冲突（`Identifier 'is' has already been declared`，行首正则检测漏判单行压缩产物——minify 产物几乎单行，`var is` 不在行首），把子集包成 `var external_exports = (function () { <subset> return <inner>; })();` 完全隔离（内部名从 `export{na as external_exports}` 解析）；③替换两处 zod 定义区（各 529KB，起点 `// node_modules/zod`、终点 `// src/` 业务恢复点）。**坑**=①**minify 把导出名重命名**：`export{na as external_exports}`——去 export 行后内部无 external_exports 变量，IIFE return 名必须从 export 映射解析，否则返回 undefined（`z.string` undefined 症状）；②**行首正则检测漏单行压缩产物**：冲突检测须按 token 或直接包 IIFE（IIFE 一劳永逸）；③集成测试两个坑：vm 跨 realm 对象 deepStrictEqual 报 reference-equal（用 JSON 比较）、测试 schema 漏抄 `.default([])` 误判子集缺陷（先对比 full zod 行为再下结论）；④替换后运行实例不生效——profile 是拷贝安装，需重装/重启 dsh web（rev 缓存）。**验证**=node --check 两文件过；IIFE 提取 + at-file 真实 schema 模式（string.min/object/enum/boolean/array/union/discriminatedUnion/literal/default）host/client 双份全过；体积 762→305K + 581→119K；生成代码来源注释已写入文件。commit 80ef14c（2 files, +108/-29000）。可复现?是（具名导入摇树 + IIFE 替换可复现）。

- **visualize 工具描述压缩：schema ~1364→814 字符（-40% 固定 context 开销）（2026-08-19，性能/资源）**：问题=「都做」清单第 2 项。解法=压缩 DESCRIPTION（351→203 字符，删「Authoring contract」冗辞保「Load the visualize skill before first use」引导）与 action 参数描述（180→148，保 <20 行/<5 处/<=4 per reply 使用上限），其余参数已精炼未动。**坑**=工具描述是模型行为引导，压缩保语义优先；visualize 是活跃工具，改动下次会话生效（当前会话已注入的 schema 不变）。**验证**=node --check 过；description 总量实测 1364→814（-40%）。commit 39ee760。可复现?是（字符串长度可测）。

- **内存稳定性检测：无泄漏信号，38MB 恒定（闲置 50s 零增长 + 交互后 GC 正常）（2026-08-19，性能/资源）**：问题=goal 第 8 轮，测资源消耗的最后维度——内存。解法=新增 scripts/measure-memory.mjs（playwright 加载 3080 → 基线 → 闲置 50s 每 10s 采样 → 设置页开/关×2 交互压力 → 闲置 20s GC 回落，输出趋势+结论）。实测=JS 堆恒 38MB：基线 38、闲置 +50s 38（零增长）、交互后 38、GC 后 38——**无泄漏信号**；交互已独立验证真实命中（Settings 按钮可点、设置面板元素出现）。**坑**=①headless 下 performance.memory 量化粒度 1MB（值可能不变是正常的，粗筛只判断"持续增长"与"GC 后不回落"两种异常）；②交互是否生效必须独立验证（点没点中是两回事），用面板元素出现与否确认；③内存检测要等 networkidle + 固定延时让 bundle 解析完成再取基线。**验证**=独立交互验证脚本（Settings 点击成功、面板元素 1 个）；画像文档 doc/resource-profile.md 运行时热点节补内存数据。可复现?是（重跑 measure-memory.mjs 得同量级数据）。

- **systemPrompt 注入文本实测 + dsh-work usage section 压缩（1608→1448 字符，-9%）（2026-08-19，性能/资源）**：问题=goal 第 7 轮，测量并优化 systemPrompt 固定注入。测量=dsh-work agent-teams usage section 1,608 字符（~402 tok/请求，最大注入项）、dsh-memory memory:auto ~500 字符（~130 tok，合理）。解法=**保守压缩 dsh-work usage**：保留全部 6 步协议语义与关键指令（activate 一次/成员快照默认/不替用户选 provider-model/任务依赖/claim+send 一任务一消息/poll+中继+blocker 处理/delete），仅精简措辞（"Follow this protocol:"→"Follow:"、删冗余短语），1608→1448 字符（-9%，~40 tok/请求）；src/index.ts 与 lib/index.js 同步改（tsc 产物手改保持一致）。**坑**=①usage 文本在 src（维护源）与 lib（构建产物入库）两处存在，必须同步改，否则下一次安装用 lib 而源码与产物漂移；②压缩系统提示是行为引导文本，收益与风险权衡——保守压缩（-9%）而非激进重写（-40%），保语义优先。**验证**=node --check lib/index.js 过；新旧文本关键指令逐项人工比对 8/8 保留；字符数实测 1608→1448（src 与 lib 一致）；dsh-work 提交 f96fb7d。可复现?是（模板字符串长度差可复现；语义保留靠人工比对）。

- **工具 schema context 开销实测：36 工具 36,160 字符 ≈12K tokens/请求，自研仅占 8%——惰性注册生效，自研侧已接近最优（2026-08-19，性能/资源）**：问题=goal 第 6 轮，从 context/token 占用视角测量。解法=用 Inspect Provider（host/Tool/listTools）精确查询当前会话全部工具 schema，JSON 压缩序列化统计。数据=36 个工具共 36,160 字符（≈12K tokens/请求固定开销，与 NOTES 历史"~55 工具≈12K"量级一致）；自研 4 工具 3,222 字符（8%）= visualize 1,364 + vision_read_image 873 + write_memory 703 + agent_teams_activate 282；官方 32 工具 32,938（91%），Top=workflow 3,986 / bash 3,242 / cordis_define 1,944。**结论**=①自研 context 开销接近最优：agent_teams 惰性注册生效（10 工具仅注入 activate 282 字符，省 ~2K+），描述均已精简；②91% 是官方 harness 固有（插件不可改）；③唯一可压缩点=visualize 描述（1,364 字符，可与 dsh-visualize skill 分工压缩至 ~600，省 ~250 tok/请求，可选）。**坑**=①Inspect 结果较大时被 spill 到临时文件（"Omitted ... Full formatted result stored at ..."），统计要用 spill 文件完整解析而非截断输出；②工具 schema 大小按 JSON 压缩序列化（ensure_ascii=False + separators）估算，中文按字符计更接近实际传输。**验证**=画像文档 doc/resource-profile.md context 节更新（实测数据 + 静态核对表）。可复现?是（cordis_inspect_query listTools + 序列化统计可复现）。

- **zod 体积优化全部路径验证完毕：mini 不兼容（缺验证器）、tree-shake 不可行、产物裁剪不可行——唯一解法=源码重建 zod external（2026-08-19，性能/资源）**：问题=goal 第 5 轮，尝试"无源码"体积优化。验证=①**zod/v4/mini 替换**：npm 装 zod@4 实测——mini 含全部 8 个顶层 API（string/object/enum/boolean/union/array/discriminatedUnion/literal）但 **string() 只有 parse/safeParse，缺 min/max/length/regex/email/optional/nullable/default/trim/transform/refine 全部验证器**，at-file 业务代码用了 `.min(1)`（sessionIdSchema）→ 替换即破坏行为，**不可行**；②**esbuild tree-shake**：`import * as z`（或 zod v4 导出结构）阻止 tree-shake，原始产物 538K 即证明，**不可行**；③产物级手工裁剪：混淆类体系依赖闭包不可推导（上轮已证），**不可行**。**结论**=三路全灭，唯一正确解法=恢复 at-file 构建链（esbuild zod external 运行时解析官方依赖，预计 client 767K→~170K、host 595K→~57K），列用户决策项；现状由 check-bundle-size.mjs 守护（ui-tweaks 767K 在 WARN 900K 阈值内）。**坑**=①`enum` 是 JS 保留字，esbuild import 命名导入要 `import { enum as zodEnum }`（报 "Expected as but found ,"）；②mini 与 full 的 API 面差异巨大（mini 只 core 解析），**先验证方法面再谈替换**——顶层 API 存在不等于用法兼容；③全量导出（`export const x = import * as m`）会阻止 tree-shake（310K），按需 import 才能触发。**验证**=full vs mini 方法矩阵实测（full string 14 方法 / mini 仅 2）；临时目录 /tmp/zod-mini-check 已清理；画像文档 doc/resource-profile.md 结论节更新。可复现?是（mini 缺验证器、esbuild 保留字报错均可复现）。

- **DSH web 加载性能实测：自研 ui-tweaks client 767KB 是全站第 1 大单文件，bundle client 全部无条件加载（2026-08-19，性能/资源）**：问题=goal 第 4 轮，从"静态体积分析"升级到"真实加载测量"。解法=新增 scripts/measure-load.mjs（playwright headless 打开运行中 DSH web，采集 navigation/resource timing + performance.memory，--json 可机器读）。实测（3080）数据：页面总耗时 2.5s、DOMContentLoaded 34ms/load 245ms、**JS 资源 42 个共 5,060KB decoded**、JS 堆 used 36MB、加载期零错误；Top 资源=**dsh-ui-tweaks/client.js 767KB（全站第 1 大，超官方 vendor 727K 与 shell 433K）**、官方 conversation 418K/runtime 381K/trajectory 351K/connection 342K、自研 dsh-work 72K。**结论**=①zod 瘦身论证实锤：ui-tweaks 767K→~170K 后自研最大包袱 -78%、全站 JS -12%；②**DSH 按 profile 装载的 bundle client 半区全部无条件加载、无懒加载**——每装一个 bundle 其 client 体积直接叠加每次页面加载，自研侧体积控制（check-bundle-size.mjs）必要性实锤；③官方 bundle 合计 ~4.2MB 是页面主要成本（框架固有），自研侧 ~0.84MB。**坑**=①playwright headless 测量的是无缓存的冷加载（每次全新下载），transfer≈decoded（无 gzip 缓存效果），与真实浏览器二次加载有差异，结论看相对值；②resource timing 的 initiatorType 对 ESM script 是 "script"（部分浏览器 "other"），过滤条件要 `initiatorType==='script' || name.endsWith('.js')` 双保险；③性能测量脚本要等 networkidle + 固定延时，否则大 bundle（767K）解析未完成数据不全。**验证**=脚本两次运行结果稳定（42 个资源、ui-tweaks 767K 恒为第 1）；画像文档 doc/resource-profile.md 增加"真实加载测量"节（章节编号 一~五）。可复现?是（重跑 measure-load.mjs 可得同量级数据）。

- **bundle 体积守护脚本 + zod 使用面精确测量：8 API/29 调用确认真实使用，产物级裁剪不可行，解法=构建链重建（2026-08-19，性能/资源）**：问题=goal 第 3 轮继续优化，处理上轮发现的 zod 1.1MB 体积负债。解法=①**精确测量使用面**：at-file 业务代码（esbuild 把 z 重命名 external_exports）仅调用 8 个顶层 API 共 29 次（string 6/object 7/enum 2/boolean 3/union 1/array 6/discriminatedUnion 1/literal 3），host 与 client 相同——**zod 是真实使用非误打包**，但使用面极小；②**产物级裁剪判定不可行**：zod 是互相引用的混淆类体系（80 个文件标记 + 变量重命名），手工删未用类依赖闭包不可推导，风险不可接受；唯一正确解法=恢复 at-file 构建链（esbuild zod external 或 import zod/v4/mini 轻量入口，预计 client 767K→~170K、host 595K→~57K），列用户决策项；③**落地守护脚本 scripts/check-bundle-size.mjs**：扫 plugins.json first-party bundle 的本地 lib（client.js 单文件 + lib 合计），阈值 client>900K WARN/>1.2M ERROR、lib>1.6M WARN/>2.5M ERROR，ERROR exit 1，支持 --json；伞目录路径解析兼容 ~/workspace/deepseek-harness/&lt;repo&gt; 与旧 ~/workspace/&lt;repo&gt;。**坑**=①伞目录路径：install.sh 约定 ~/workspace/&lt;repo&gt; 但本机实际是 ~/workspace/deepseek-harness/&lt;repo&gt;（伞目录嵌套），脚本须两个位置都试；②zod 判定：业务代码不含字符串 zod（import 被 esbuild 重命名 external_exports），搜 zod 得零引用是假象，必须搜 external_exports. 调用模式；③desktop-shell 无 lib 目录（原生代码）应 skip 不报错。**验证**=脚本实测 6 个 bundle（ui-tweaks 1379K/767K 最大但在阈值内，其余 OK）；画像文档 doc/resource-profile.md 同步修正。可复现?是（zod 使用面用 external_exports 正则统计可复现；产物裁剪不可行可复现）。

- **DSH 插件资源占用画像：zod v4 完整内联是最大体积负债（~1.1MB），其余运行时热点已清零（2026-08-19，性能/资源）**：问题=继续从性能与资源占用视角做分析（goal 第 2 轮）。解法=①**体积画像**：dsh-ui-tweaks lib 1,379KB（host 612 + client 767）、dsh-work 245、dsh-visualize 125、dsh-memory 89（其余合理）；②**最大发现=at-file 的 zod v4 完整内联**：host 595KB 中 zod 538KB（93%）、client 762KB 中 zod ~596KB（sub_atFile 的 ~88%）——合计 ~1.1MB 只用到少量 API；根因=at-file 无 src（lib 是 esbuild 产物，zod 未 external 且 zod v4 导出结构不可 tree-shake），修复需恢复构建链（属架构工程待用户决策）；③**运行时热点清零**：上轮 5 项优化后复查其他插件确认无问题（paste-input 折叠 debounce+不观察 characterData、auto-hide 仅 hidden 扫描、at-file search() 懒加载启动零索引、dsh-work 轮询 1.5s 低频小 IO、dsh-memory observer 为必需功能）；④**context/token**：ui-tweaks 零工具零注入、visualize 2 工具按需、work 10 工具惰性注册、memory 1 工具——均合理。产物=`doc/resource-profile.md`（画像文档）。**坑**=①client.js 的 zod 判定不能靠 grep -c ZodError（会误报），要定位 `// node_modules/zod` 标记区间；②at-file host 与 client 各内联一份 zod（双份 ~1.1MB），修复时两处都要处理；③zod 标记 80 个连续目录注释，取首标记→factory 边界为准确跨度。**验证**=python 实测字节数 + 标记定位；各插件运行时热点逐项人工复查。可复现?是（构建产物内 zod 完整内联可复现；修复需重建）。

- **dsh-ui-tweaks 性能优化：5 处常驻开销热点修复（2026-08-19，性能/资源）**：问题=从性能与资源消耗占用视角优化。分析结论=大部分已优化（paste-input 折叠 300ms debounce + 不观察 characterData 避免流式干扰 + 8s 兜底轮询；auto-hide observer 仅在 hidden 时扫描；at-file settings 走官方内存服务 `applies:live` 无每步磁盘 IO；无 systemPrompt 注入、零 LLM 工具 = context/token 零开销）。发现 5 个热点并修复：①**两处 installNavIconPatch**（sub_pasteInput + sub_atFile）observer 回调「同步 patch + rAF 调度」双跑冗余——每次 DOM 变化都多一次全量图标扫描（patch 幂等：已是目标则跳过），去掉同步跑只留 rAF 节流，修复延迟一帧肉眼无感；②**immersive observer 无条件调度**——disabled 时聊天流式更新仍每帧排一个 rAF（refresh 在 disabled 下本就是 no-op），改为 `if (enabled) scheduleRefresh()`，enabled 由 onConfig 翻转并直刷不受影响；③**installPluginTabDedupe patch 全文档 button 扫描**——设置面板未挂载时整段 no-op 却先扫全文档 `button[aria-controls]`，加面板快速失败（一条 querySelector 前置）；④**at-file host scanMentions '@' 短路**（`!text.includes("@")` 直接返回，零行为变化）；⑤（上轮已做）host 组合器 config 透传。**坑**=client.js 与 at-file/index.js 均为纯 LF（非 CRLF），edit 直接改安全；打包产物内联 factory（sub_*）可安全手改，前提=patch 幂等 + 改动只删冗余调度不碰逻辑。**验证**=node --check 全过；git diff 逐处人工审查 5/5 行为等价（12 insertions 4 deletions）；改动仅在 client 半区（硬刷新生效）+ at-file host（重启 dsh web 生效）。可复现?是（双跑冗余/无条件调度在 DOM 频繁变化时开销可测）。

- **重启后已生效：运行时 Tool schema 实测确认新 host 代码（pending 恢复边/枚举在列；archive 保留名校验只读层面看不进出 decision——2026-08-19，验证）**：问题=此前定位到「dsh web 运行进程加载旧 host 代码」，需在重启后的新实例（PID 5796）确认新 host 代码是否真正生效。解法=只读三步验证：①`cordis_inspect_query(host/Tool/listTools,{})` 激活前工具表只含 `agent_teams_activate`，9 个惰性 `agent_teams_*` 未列出（符合惰性注册预期）；②实际调用 `agent_teams_activate` 成功返回 9 个工具名（幂等，仅注册不建队）；③激活后再查 listTools，9 个工具齐现。**关键证据**=`agent_teams_update_task.status` enum=`["pending","in_progress","completed","failed","cancelled"]`（含 pending），且描述明示「reopen failed/cancelled to pending is captain-only」——这就是新 host 代码（pending 恢复边）已加载的铁证。**结论**=新 host 代码已生效（高置信度）。**坑**=①Tool 的 listTools 只暴露注册的公开 schema（发给模型的 JSON 契约），运行时校验（如 create 的 archive 保留名校验）是不出现在 schema 的 handler 逻辑——全文件 grep `reserved` 零命中、`archive` 仅出现在 agent_teams_delete 描述（常规归档非保留名校验），故无法仅靠只读 schema 确证/证否该运行时校验，需保留真名实调一次 create 才见抛错，破坏只读约束故不做；②验证「新 host 代码生效」最可靠的 schema 层证据 = 查找新加的枚举值/新字段这类清单级契约变更（本次用 pending），别指望运行时校验出现在 schema；③activate 进工具表≠9 个惰性工具立即可用，需激活后再查 listTools 才见。**验证**=列表 query 前后两次 + activate 成功 + 二次 listTools 见 9 工具 + update_task enum 含 pending。可复现?是（重置会话后重跑三步可复现；若进程仍加载旧 host，enum 不含 pending 会立刻暴露）。

- **meta-repo 冗余清理 + 依赖/性能优化（2026-08-19，优化）**：问题=插件全拆独立仓库后，汇总仓库残留大量 monorepo 时代冗余：5 个无用的 `@deepseek-ai/*` 根依赖、`pnpm-workspace.yaml`（packages: [dsh-*] 已无目录）、6 个失效脚本、8 个过时 docs、viz/ 与 .agent-teams/ 磁盘垃圾。原因=拆分只搬了插件，没清外围。解法=①**依赖**：根 package.json 删 `@deepseek-ai/cordis|dsh-invariants|dsh-scope|dsh-session|dsh-timeout`（零脚本引用，monorepo 残留），只留 `yaml`（apply-settings）+ `playwright`（web-regression）→ **node_modules 306M → 20M（-93%）**；②**脚本**：删 `benchmark/check-package-consistency/check-inject-consistency/merge-better-sidebar-client/merge-market-client/publish-packages`（全部扫根目录 dsh-* 已失效），新增 `check-consistency.mjs` 验证 plugins.json 清单（id 唯一/type/source/repo/ref/fork-upstream）；③**install-plugins.mjs 精简**：删 `--from/--ref/REPO/本地目录扫描`（source 全 github），buildSpec 直接用 manifest spec，`plugin-manifest.mjs list` 输出统一带 `github:` 前缀（与 get 一致）；④**docs/**：8 个过时分析归档到 `docs/archive/`（保留决策上下文），README 只引 agent-self-optimization；⑤**.gitignore** 精简、删磁盘 viz/ + .agent-teams/。**坑**：install-plugins 从 `list` 拿 spec 时第 4 列是 `repo#ref`（无 github: 前缀）而 `get` 的 spec 带前缀——两处格式不一致导致 dry-run 输出缺 `github:` 前缀（`dsh plugin add bitterSmilezzz/...` 装不上），统一为带前缀。**验证**：全场景 dry-run 输出正确 github 直装；check-consistency 15 插件全过；apply-settings/install-external/web-regression 均可用（精简后依赖足够）。可复现?是（未清理时 node_modules 306M、install-plugins 前缀缺失可复现）。

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

- **dsh-memory + dsh-opencode-go-usage 只读跨切面资源审计（契约核对）**：对照 harness core/session、
  agent、session-query 源码——①memory `agent/turn-stopping` 兜底里 `session.getMessages` / `session.lastMessage`
  在 harness `Session`（core/session types.ts：仅 surface/header/id/firstLiveSeq/events）**不存在**→ 兜底永不写文件，
  每轮 turn 死监听；②ocgo `fetchAll` 的 45s cache TTL(807) < 客户端 60s 轮询 → 缓存轮询路径永远 miss，
  每次轮询都对全量 corpus 重跑 `backfillDsh`+`buildView`（in-place 幂等但 O(N×M) CPU，840-843）；③ocgo `collectQuota`
  每次轮询重读 auth.json + HTTPS，无 TTL 缓存。审计结论=无 HIGH/无界缓存/O(n²)（cache/lastScan/entryCache/summaryCache 全有界），
  两插件事件流无重复消费（ocgo 单次 readSession 内折叠标题+usage，memory entryCache 指纹自愈）。可复现?是（读 harness 类型即可证）。

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

- **dsh-paste-input 设置页导航图标 + 主题 token 化（零 harness 改动）**：与 super-injector
  同模式 DOM 级替换（见下条），差异化点：**图标直接用 DSH 官方 `ic_ds_paperclip_outline_16`**
  （ui-primitives 现成回形针，与齿轮同源同风格，path 从 harness 源码拷——比自绘更「符合定位
  且风格统一」）；label 匹配要覆盖 locale 双值（'多媒体输入'/'Multimedia input'）。CSS
  token 化：遮罩 `rgba(0,0,0,.45)` → `--dsw-alias-bg-mask-1`+`--dsw-mask-blur`（Modal
  primitive 同款）；OK 按钮 `state-business-primary+#fff` → `button-primary-fill`+
  `label-primary-foreground`（官方主按钮写法，深色主题 #fff 白字在亮蓝上会瞎）。只改
  client.js 时**无需重启 dsh web**（页面硬刷新即加载新 bundle；改 package.json inject 才需
  重启）；link: 依赖改仓库副本直接生效。同步更新 THIRD-PARTY.md 本地修改清单（见 AGENTS.md 索引）。

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

- **未优化理由**：搜索防抖（延迟输入反馈，得不偿失）、虚拟列表（160 项太少）、懒加载市场数据
  （Host 缓存 2ms 响应，无实质收益）、desc 截断（500→200 切掉有用信息）。
- **可复现**：是（220 断言回归）。

---
## mac-desktop 父进程看护 kqueue 化（轮询→事件驱动，e4d98e4）

**问题 → 原因 → 解法 → 可复现?**
- **问题**：孤儿清理的父进程看护每 2s 轮询 proc_pidinfo，App 全生命周期持续 CPU 驻留。

