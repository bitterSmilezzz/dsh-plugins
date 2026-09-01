# 修复 / 诊断（116 条）
- **dsh-asr-voice 二轮：云端 TTS sink 打断窗口静默 + 挂起超时缺失（2026-09-02，修复/语音播报）**：问题=继续优化 asr-voice，speech-out.ts 全文复审（上轮只看过开头 60 行）抓到云 TTS sink 两个真问题。解法（b0e7c34 后续，发版 v0.2.3）：①**cancel() 在 fetch 窗口不生效**——cloud TTS 每句先 fetch 合成再解码起播，cancel() 只清队列+停 current，fetch 在途的那句照样解码起播：用户打断（barge-in/新回合/interrupt）后旧回复压过人声、半双工门多关一整句；修法=句子代际（generation，cancel/dispose 递增），speak 在 fetch 返回后与解码后两处按代作废。②**TTS fetch 无超时**——host 挂起时 await fetch 永不 settle、playing 永真、onDrain 永不触发（半双工门挂在 onDrain 上）麦克风永不归还；浏览器 sink 有 utterance 看门狗、云 sink 的超时只盖 start 之后，补 AbortSignal.timeout(30s) 盖住 fetch 段。顺带 voice-chat-button.tsx（编排器）全文复审：代际 ref 转发/无回复看门狗/半双工纪律/降级链全在位，无新问题；本轮 sink 代际修复正好补齐其 interrupt() 语义。**坑**=①改写带条件守卫的代码块时把 `data.ok !== true || data.audio === undefined` 检查弄丢了（Edit 只盯着要加的代际条件）——**改守卫链必须逐条件核对，丢一个响应校验就是 atob(undefined) 崩溃**，typecheck 抓不到（atob 接受 string）；②asr-voice 版本线曾有回落（v0.2.1 tag 存在而 package.json 走到 0.2.0），bump 前必须 `git tag -l` 对齐版本线。**验证**=typecheck（alpha.4 类型）+168 测试+build 全绿；伞校验 20/20；服务端实吐 bundle 含超时常量、rev 变化（重建即生效）。可复现?是（004902a；打断窗口行为可 mock fetch 延迟复现）。
- **五自研插件批量优化轮：asr-voice 云端实时三处断流/回声真 bug + 其余四插件审计清白（2026-09-02，修复/实时状态机 + 审计方法）**：问题=用户要求「这几个插件继续做优化修复」。解法=逐插件新角度审计（notify/retry-settings/shortcuts 逐源码读 + DOM 契约对 alpha.4 源码逐一核对；asr-voice 重点扫最新代码面 realtime-cloud/transport/turn-guard）——**只有 asr-voice 抓到真 bug**（b0e7c34，发版 v0.2.2）：①**SSE 干净断流静默死区**：transport 的 fetch 读循环 `done:true`（host 重启/代理超时/provider 结束会话）直接落出 try 块什么都不发，只有异常路径才发 `events-unavailable`——cloud 引擎字幕冻结、麦克风开着、永不 onFail；修法=done 路径补发同一错误事件。②**引擎侧断流即刻判死 + 错误不受 pause 门控**：事件流断了 final 永远到不了，按连败计数等三次无意义；且原 `onProviderEvent` 首行 `if (!active || paused) return` 把播报期（半双工暂停，恰是断流高发期）的错误整个吞掉——error 分支移到 pause 门控之前、`events-unavailable` 特判即刻 failNow（其余 provider 错误仍按三次连败）。③**浏览器引擎重启回声去重无时间盒**：`chunk === lastTurn && segment === ''` 无条件吞——用户真的复述同一短句会被当 Chrome 重启重报吞掉；抽纯函数 `isRestartEcho`（turn-guard.ts，2.5s 窗口 + now<lastTurnAt 时钟回拨不放行）+ 浏览器引擎接入。**审计清白证据**：notify host/client 全部历轮修复在位（惰性端口/fenced next()/subagent 过滤/音效节流）；retry-settings 部分失败回执 client 已处理（failed→err 状态）；shortcuts 的 DOM 契约对 alpha.4 源码逐一核实（`data-composer-seat`/`data-conversation-scroll`/侧边栏与「新会话」文案全在官方 locales——「用量统计」来自第三方 usage 插件非官方面，toast 兜底已覆盖）。**验证**=asr-voice typecheck（alpha.4 类型）+168 测试（165+3 新增）+build；伞校验 20/20；服务端实吐 bundle 含 `isRestartEcho`×2/`events-unavailable`×5（rev 变化再证重建即生效；窗口常量被 tsdown 常量内联 grep 不到属正常，函数名在即新代码已上）。**坑**=①**「bump 前查 tag」教训再次生效**：asr-voice v0.2.1 tag 已被历史发版占用而 package.json 曾回落 0.2.0，sed 撞号——未推送状态下 `git reset --soft HEAD~1` 撤发版 commit 前进 0.2.2 重做，不动已发布 tag；②批量审计的正确期望：经过多轮审计的插件大概率**清白是常态**，本轮 5 插件只 1 个有真 bug——「审出零问题」要给出证据（契约逐条核对）而不是硬凑改动。可复现?是（b0e7c34；realtime-cloud.test.mjs 断流判死/pause 期错误两例 + turn-guard.test.mjs 回声时间盒一例）。
- **dsh-model-selector 无障碍补强 + dsh web 插件 bundle「重建即生效」机制钉死（2026-09-01，a11y + 交付机制）**：问题=继续优化轮换无障碍角度审：搜索命中后读屏用户没有任何结果数反馈（只能逐行摸索，超过 100 条时截断文案还在 role=menu 容器内读屏可能跳过）；另顶层 inject 的 `remote`/`remote.session` 疑似幽灵依赖。解法=①加视觉隐藏的 `role=status` 播报「N 个结果」（新词条 search.status zh/en 双语），放在 `.dms-search` 与 `.dms-groups` 之间——**必须在 role=menu 容器外**，否则污染菜单内容模型；②顺带把单用途的 `dms-effort-sr` 升级为共享视觉隐藏工具类 `dms-sr`（改名前先查 package-meta 的 RETIRED 退役名单确认不撞、改名后全绿）。**幽灵 inject 结论=保留**：官方 alpha.3 顶层 inject 同样是 `["commandUi","locale","sessions","slots","remote","remote.session"]`，且 `ModelDirectoryResolver` 的 static inject 就是 `["sessions","remote","remote.session"]`——照抄官方声明保证 modelDirectories 就绪，不是可清理项（先考古再动手，防误删）。**交付机制钉死（本轮最有价值的发现）**：dsh web 的 `/plugins/??...` 聚合 bundle 路由**按请求现读 link 路径文件、rev 逐请求重算**——用户手工重启服务后实测：构建前 rev=`09d33c77`、重新构建后不重启 rev=`693cad16` 且服务端实吐 bundle 已含新类名/新词条、旧类名清零。**link 挂载的纯 client 插件重建即生效，无需重启**；rev 不变才说明有快照层需重启。重启交接：我只停（kill/TaskStop）、用户手工启并把 token URL 发回。**验证**=50/50 单测+20/20 校验器；push+tag v0.1.13+`gh release create`（上轮教训：发版必须建 Release，用户在 Releases 页看版本）；真机 IAB 断言：搜索 "flash" → `.dms-sr[role=status]` 文本 "21 results"、computed position:absolute+width:1px（视觉隐藏实证）、数字与 `[data-row-key]` 实际行数 21 一致。可复现?是（702c692；任意 token URL 重放搜索断言）。
- **dsh-model-selector 对齐 dsh 0.1.2-alpha.3 官方源码考古 + 部署/真机双验证首次跑通全闭环（2026-09-01，适配/契约考古 + 交付验证）**：问题=用户要求「针对 dsh 最新版做契合版本和理念的优化」。解法=**直接读 profile/插件 dev 树里安装版官方源码**（`@deepseek-ai/dsh-client-ui-model-selection`/`primitives` alpha.3 的 lib/client.js + d.ts）逐面对照，落实 7 项对齐（e4acb4b，v0.1.12）：①**`routable` 理念落地**——`ModelDirectoryState.routable` 的契约注释明说「catalog membership is advisory：current 匹配不到 group 不代表没选择」，官方 modelLabel 兜底显示 `provider/model` 原始 id，插件原兜底「选择模型」是误导，照抄官方三分支（waiting=current===null&&loading → loading 文案 → current 存在但不在目录 → 原始 id）；②trigger `aria-haspopup` true→menu、triggerAria 补 waiting 分支；③**busy 行变灰**——官方 `option:disabled{color:dimmed}`，插件 R3 已改 aria-disabled 丢了这层视觉，补 `.dms-menu[aria-busy="true"] .dms-model-option{color:dimmed}`（视觉语言对齐+焦点连续两全）；④修 R1 自己引入的回归：滚动到选中行没让位 **sticky 分组头**（吸顶头约 26px 会盖住滚到容器顶缘的行），偏移量改按所在组头部实际高度；⑤EffortSlider `useState("")`/`useState(0)` 改惰性初始化到当前档（首帧空档位名/0% 进度闪烁）；⑥列表补 Home/End（WAI-ARIA menu 标准键，官方二层面包没有列表平铺场景所以没有；输入框内不劫持——那是移光标键）；⑦搜索框 `enterKeyHint="search"`。**考古澄清（防误改）**：①插件组件的 `locked` prop **不是残留**——官方注释明说「owner share (locked) + injected face」，locked 由 slot owner（composer bar）渲染时下发、不走 inject 回调，官方 inject 返回面同样只有 `available/directory/load/select`；②官方本座位**就是 root 子树内 absolute CSS 菜单**（写死 `max-height:min(360px,100vh-96px)`），不用 useAnchoredPosition/portal/anchored hooks——插件的 useAnchoredMaxHeight+useDismissOnOutsidePointer+R2 水平钳位是同架构下的超集，**评估后拒绝 useAnchoredPosition+portal 重构**（fixed 定位受 transform 祖先 containing-block 陷阱影响且重构键盘/焦点/事件架构，收益不成比例）；③官方静默吞 load/select 错误，插件保留 console.warn 诊断超集；④官方选中行透明背景仅勾号，插件高亮+加粗是刻意增强。**全闭环验证（首次完整跑通新流程）**：50/50 单测+20/20 校验器 → push v0.1.12 → **服务重启**（link 挂载下服务启动早于新构建会供旧 bundle，kill+lsof 确认+`dsh web --no-open` 后台重启并保持运行原状）→ **token URL 实测 HTTP bundle**（这次服务是我启的，启动日志里有 `?token=` 一次性 URL；401→带 `-c cookiejar` 跟 303→聚合路由 `/plugins/??<50个client.js>&rev=` **必须原样整串请求**，裁剪单插件 404；grep 服务端实吐 bundle 命中全部 0.1.12 标记）→ **浏览器真机验收**（IAB 开 token URL：菜单渲染/分组/徽标/滑杆辐射全正常；搜索 "flash" 蓝色下划线高亮可见；Escape 清词 value="" 菜单仍在；ArrowDown 进列表、**End 跳末行且焦点环渲染**；Escape 关菜单焦点还原 trigger——均截图/断言实证）。**坑**=①**跨自动化调用间隙浏览器页面失焦 → 菜单被 onBlur 收起**（relatedTarget=null 收菜单是与官方一致的预期行为，不是 bug）——键盘流测试必须在**单个 JS 调用内连续执行**，跨调用只能做状态断言；②测试全程只用键盘（Escape/Arrow/End），**绝不点模型行**——点击会真的切模型污染用户会话；③`fill()` 后 Playwright 定位以 aria-label 为准，菜单关了先查状态再重开，不硬重试同一定位器。可复现?是（e4acb4b；重启后 bundle 标记可 curl 复验；浏览器流程可用任意 token URL 重放）。
- **dsh-model-selector 三轮功能/UI 优化到「找不出项」收口（2026-09-01，feature/UI 打磨 + 终止条件判定）**：问题=用户目标「继续功能和 UI 设计优化，直到找不到优化项，每次优化测试完提交远端」。解法=三轮共 9 项，每轮 typecheck+单测+build+node --check+伞校验器 20/20 全绿后 push：**R1 六项**（b4e65d0）——①打开菜单自动滚到选中行（手动改 `.dms-groups` scrollTop，不用 scrollIntoView 防连带滚页面）；②Escape 语义分层：搜索框有关键词先清词再按才关菜单（注意 `event.target` 声明要上移到 Escape 分支前，否则 TDZ 运行时崩）；③分组头/搜索清除/重试按钮补 `:focus-visible`（此前键盘焦点隐身，上轮只补了模型行）；④`.dms-effort-flare` 两条 transition 互相覆盖留死声明（保留生效的 70ms linear）；⑤行 tooltip 带全量描述；⑥搜索框 `aria-controls`+`autoComplete="off"`+`spellCheck={false}`（**React 属性是驼峰 autoComplete，写 HTML 的 autocomplete 直接 TS2322**）。**R2 一项**（068c85a）——菜单水平钳位 `dmsMenuLeft`：菜单 `right:0` 右锚定，seat 在输入区左下且右缘不足菜单宽（窄窗口）时左缘越出视口——垂直方向的孪生 bug（menuFit 当初只修了垂直）；纯函数返回 undefined=保持右锚定 / number=改 left 锚定，宽度用菜单实际 `offsetWidth` 测量与 CSS `min(280px,100vw-32px)` 解耦，+4 单测。**R3 两项**（fa6b2d8）——①搜索命中名称片段高亮 `.dms-hit`（hits memo 顺带算 `nameHit` 区间，命中描述/供应商时不高亮；memo props 为原始区间对象、引用随 hits 稳定不破行级 memo）；②busy 由 `disabled` 改 `aria-disabled`：**disabled 聚焦控件会让焦点瞬间掉到 body**（键盘连续调滑杆断档、select 失败后失焦），重入已由 committingRef/choose busy 守卫兜住、CSS 本就无 disabled 视觉，改后键盘焦点连续。收口发版 v0.1.11+README 同步。**终止条件判定（「找不到优化项」的诚实标准）**：复扫后明确记录**评估过但拒绝**的项及理由——拼音搜索（需重依赖，违 Pi core-minimal）、分组头进方向键导航（Tab 已可达，改了破坏「下箭头落首行」直觉）、role=menu 含非 menuitem 文本（ARIA 硬洁癖，官方 primitives 同款）、README 截图重生成（需起 dsh web，工作区规则禁止主动起）、本地 profile 重装（用户只授权 push 未授权重装）。**坑**=①styles.ts 整块 Edit 时 old_string 含完整规则体、new_string 只写了前四行，把 flare 的几何/外观声明连闭合括号一起删掉——**改 CSS 后必须花括号配平 + git diff 逐行核对再 build**，本次靠 node 一段 20 行配平脚本当场抓回；②发版 bump 后 build+test 再 commit，保证 lib/ 与版本号同一提交。可复现?是（各 commit 与 /tmp 日志；dmsMenuLeft 可用窄视口 + 短模型名 seat 复现左溢出）。
- **dsh-model-selector 第三轮修复：rules-of-hooks 隐崩点 / IME 劫持按键 / select 竞态 + validate-plugin 字典序取 tag 必误报（2026-09-01，修复/客户端 React + 伞工具链）**：问题=性能/正确性两轮审计后用户再要求「修复优化」，换角度复审 `ModelSelect.tsx` 又抓出三处（均在 typecheck/build/47 测试全绿下存活）：①**4 个 `useCallback`（show/close/choose/toggleCollapse）写在 `if (!available) return null` 早退之后**——`available = sessions.subagentAddress(sid) === undefined` 每次 inject 重跑都会重算，一旦同一组件实例上翻转（子代理↔主会话判定变化），hooks 数量随渲染分支变化，React 直接抛 "Rendered more hooks than during the previous render" 崩掉整个 composer；②**搜索框无 IME 组合保护**——中文输入时 Enter 是候选上屏、方向键在候选窗翻页、Escape 是取消组合，`onRootKeyDown` 全部劫持（Enter 直接选中首个命中并发起 select RPC！），中文-first 的产品文案下这是主路径 bug；③**select 竞态**——`choose()` 不看 `busy`，行 disabled 挡得住点击但挡不住搜索框 Enter，select 进行中可并发二次提交。另发现伞仓库 `validate-plugin.mjs` 用 `git tag` **字典序**取 `tags[tags.length - 1]` 当「最新 tag」——`v0.1.10` 字典序排在 `v0.1.9` **前**，任何两位数补丁号起 manifest 一致门禁必误报（本次发版 0.1.10 当场触发）。解法=①四个 useCallback 全部上移到早退之前并注明约束（`busy`/`state.current` 等依赖本就定义在更早处，纯位移零行为变化）；②`onRootKeyDown` 首行 `if (event.nativeEvent.isComposing) return;`（一并护住 Escape/方向键/Enter 三条路径，比逐 key 判断稳）；③`choose()` 顶部 `if (busy) return;`；④校验器改 `git tag --sort=-v:refname` 取版本序第一。**坑**=①**「测试失败」先查执行顺序再查代码**：本轮首轮 test 报红 ERR_ASSERTION，实为改完 src 先跑 test——`lib/types` 的 d.ts 还是旧的，「client type declaration not stale」门禁如实报红；build 后 10 连跑全绿，并非 flake（fuzz 是固定种子 mulberry32，确定性）；链式命令里 `pnpm test | tail` 的退出码来自 tail，**测试挂了 build 照跑**，验证链要用 `set -o pipefail` 或拆开跑；②**早退之后的 useCallback 是 React 规则违规而非风格问题**，靠「available 实际不会翻转」存活，规则上 hooks 数量必须渲染间恒定；③**bump 前先 `git tag -l` 查占位**（老教训再次生效：v0.1.10 未占用才前进，不移动已发布 tag）。**验证**=`pnpm typecheck` 双 program 绿 + `node --test` 47/47 + `pnpm build` + `node --check` 双产物；伞校验器 `validate-plugin.mjs` 20/20 零提示；commit 0dbd29e（插件）+ 8b3cacb（伞脚本），tag v0.1.10 本地未 push（commit-only 工作流）。可复现?是（hooks 违规可 mocks available 翻转复现崩帧；IME 用中文输入法搜索框按 Enter 必现；字典序 bug 用 v0.1.10 tag 后跑校验器即现）。
- **dsh-asr-voice 设置卡消失：settingsScope 必须进顶层硬依赖 inject，卡片在 apply 顶层注册（2026-09-01，修复/运行时 UI）**：问题=真机验证（dsh web 3080 实测）发现「语音输入」按钮挂在输入行正常、但**设置 → 插件 → 配置里整张设置卡消失**；host 侧其实一直正常（`settings/describe` 返回 19 个命名空间含 `asr-voice`）。根因=alpha.3 适配时把设置卡注册包进了 `ctx.inject(['settingsScope','connection'], …)` 回调里——**`connection` 服务在此运行时不可注入，整个回调永不执行 → 卡片永不注册**。此前只把 `remote` 从注入列表移除、`connection` 还在列表里照样阻塞；又因为语音按钮是独立 effect 表现正常，极易漏判。解法=对齐兄弟插件（dsh-shortcuts / retry-settings / dsh-notify）的既有姿势：①`client/index.ts` 的 `inject` 改**顶层硬依赖** `['slots','locale','settingsScope']`，设置卡 `ctx.slots.inject('settings.plugin.item', …)` 移到 **apply 顶层直接注册**；②`bindConfigScope` 改用官方 `SettingsScopeBinder` 类型（弃自定义 `SettingsBinderLike` 结构接口，消除泛型方差报错）；③凭据绑定放**独立 scoped inject**（`connection`/`remote` 缺席只影响密钥区显示，绝不影响卡片注册）；④`config.ts` 加 `ASR_VOICE_NS` 常量、`voiceScope` 用官方 `SettingsScope<T>`。**坑**=①**scoped inject 是整体事务**：列表里任一服务不可注入 → 回调整体不执行，且没有编译期/运行时报错，只能真机看 UI；设置类 UI 注册**绝不能**包进 scoped inject；②typecheck / build / 单测全绿 ≠ 设置卡存在——本 bug 全程 132 测试通过、双 tsconfig 编译通过，全靠真机抓出；③判断「设置卡该不该出现」以 `settings/describe` 的 host 结果为准（它证明命名空间注册正常），client 侧问题只看 UI 渲染。**验证**=`pnpm build` + `pnpm typecheck` 全过；`node --test` 132/132；真机：设置卡出现、三步向导（识别方式/服务商/密钥自检）完整渲染、实时引擎下拉三档齐全（Web Speech / 按句转写 / I4 云端实时）、切「云端实时」→「有未保存的更改」保存/放弃流正常，测试改动已放弃不污染配置。可复现?是（任何把卡片包进含不可注入服务的 scoped inject 的环境）。
- **dsh-asr-voice 适配 dsh 0.1.2-alpha.3：client 凭据绑定从 `connection.api.credentials` 迁到 `ctx.remote.credentials`（2026-09-01，适配/运行时破坏点）**：问题=本机 `dsh` 已升到 `0.1.2-alpha.3`，插件依赖线还停在 `^0.1.2-alpha.2`（lockfile 锁 alpha.2）。把 package.json / pnpm-workspace.yaml 升到 alpha.3 后 `pnpm typecheck` / `build` / 125 测试**全绿**——但这只证明编译兼容，**运行时有一个 typecheck 抓不到的破坏点**：插件 client 半区用 `ctx.inject(['settingsScope','connection'])` 拿 `connection.api.credentials` 读写 API key（设置卡密钥状态 / 写入 / 清除），而 alpha.2 与 alpha.3 的 `ConnectionHandle` 类型面**都没有 `api` 属性**（只有 `rpc/isLoopback/generation/state/reconnect/registerGenerationSource/start`）——`c.connection?.api?.credentials` 恒为 undefined，`bindCredentialsApi(undefined)` 让密钥区永远显示「本机未启用凭据服务」，读写全部静默失效（结构类型 `*Like` 编译期不报错）。解法=①**官方姿势核查**：对照官方 `ui-settings-models`（同一 alpha.3 版本线）——它 `inject` 列表是 `['slots','locale','remote','remote.credentials','remote.llm','remote.settings','settingsScope','settingsSchema']`，凭据经 `ctx.remote.credentials.describe(refs)`（返回 `{ok,value:Record<ref,CredentialInfo>}`）/`set(ref,value)`/`unset(ref)`（返回 `{ok}` 或 `{ok:false,error}`），与插件的旧形状 `describe({refs})`（返回 `{result:{ok,value:{credentials}}}`）完全不同；②**client 绑定迁移**：`src/client/index.ts` 注入列表加 `'remote'`，`bindCredentialsApi(c.remote?.credentials ?? adaptLegacyCredentials(c.connection?.api?.credentials))`——新形状优先，旧运行时（仍暴露 connection.api 的环境）经适配器兜底，两条路径都归一成新形状 `CredentialsApiLike`；③**config.ts** 的 `CredentialsApiLike`/`readKeyState`/`saveKey` 全部改成新形状（describe 直接收 refs 数组、返回 `{ok,value}`），旧形状保留为 `LegacyCredentialsApiLike` + `adaptLegacyCredentials` 适配器；④**测试**：`config-freeze.test.mjs` 的凭据 mock 从旧形状改成新形状（describe 收数组、返回 `{ok,value}`），新增 `adaptLegacyCredentials` 夹具（旧→新归一 + 旧形状拒绝 → failure 透传）。**坑**=①**`^0.1.2-alpha.2` 的 semver 会匹配 alpha.3，但 lockfile 里锁死 alpha.2 不自动升**——只改 package.json 不动 lockfile，`pnpm install` 不会装新版，typecheck 仍在旧类型面上过，等于没适配；必须同时升 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里全部 `@0.1.2-alpha.2` 行，否则新发布版本被 release-age 策略拒装；②**`connection.api` 在 alpha.2 就没了**（下载 alpha.2 npm 包核对 ConnectionHandle 同样无 api）——插件 v0.1.7 的密钥读写很可能从发版起就是坏的，只是「设置卡能打开、密钥区显示服务不可用」看起来像正常降级，没被当成 bug；迁移到 `remote.credentials` 同时是适配 + 修复；③**`exactOptionalPropertyTypes` 下 `{ok:false,error:undefined}` 直接赋给 `error?:{message?}` 会 TS2322**——适配器里 error 为 undefined 时干脆不带该键，用三元分支构造结果对象；④**新旧形状的 describe 都是单参数**（`{refs}` vs `refs`），无法靠函数 `length` 区分，所以适配决策放调用方（index.ts 知道自己读的是 remote 还是 connection），不在 `bindCredentialsApi` 里做运行时嗅探。**验证**=`pnpm typecheck` 双 tsconfig 全过；`pnpm build` 产物含 `adaptLegacyCredentials`；`node --test` 125/125（新增 adaptLegacyCredentials 夹具 + 既有 readKeyState/saveKey 改新形状后全绿）。可复现?是（升 alpha.3 后凭据区必现「服务不可用」，旧形状 mock 在 alpha.3 类型面下必 TS 错）。
- **dsh-email 合并上游（STARDUSTLC666 → 本 fork，发版 0.8.5）：lib 冲突用「重产」而不是「选边」，并挖出一个无源码的 vendored 产物（2026-08-31，同步/治理）**：问题=用户定调「不向上游作者仓库发 我们同步上游 并进行修复」。`git merge --no-ff --no-commit upstream/main`（上游 4 个提交：93e6fce 产物入库+删 prepare / 027e2b9 清理失效注入声明 / 80e7e40 README 徽章 / 85038d1 since-until 描述统一）撞上 7 个冲突路径，其中 5 个在 `lib/`。解法=①**`lib/*` 一律不手挑任何一方**，先只合 `src/`，再用本仓自己的 `tsc` 重产 `lib/`——重产后 `lib/mail-client.{js,d.ts}` `lib/web.{js,d.ts}` 与 fork HEAD **逐字节一致**，这条对比同时是「上游 host 半区只动了 tool 描述、没动逻辑」的证据；②`package.json` 取上游 `dsh.client`（上游已补交产物，本仓 0.8.4 删声明的理由不再成立），`repository/bugs/homepage` 指回本 fork 但 `author` 保留 stardustlc；③回归 78/78、`tsc` exit 0、门禁 19/20（唯一提示＝7 工具专项评审，早已记录），tag `v0.8.5` 推 origin。**坑**=①**上游带进来的 `lib/client.js`（326 行）两侧仓库都没有 client 源码**，本仓 `build` 只有 host 半区的 `tsc`（`rootDir: src`），**重产不出它**——合并「产物入库」型上游时，必须逐个产物问「我的构建能不能重算出它」，算不出的要在 `.gitignore`/README 显式钉住来源，否则下次改设置卡会以为重跑 build 就行；②本仓 tag `v0.8.2` 与上游 `0.8.2` **同号不同内容**（前者是补交 12 条围栏/掩码回归），fork 与上游并行发版时版本号会撞，DSH-Store 的「version ↔ tag 一致」准入只认最新 tag，历史同号只能在 README 里显式标注；③同步后 README 有三处变成**假话**并全部改掉：「本插件是纯 host 半区、无浏览器 bundle」（与恢复后的现实矛盾）、「安装期授权 `prepare` 构建」（`prepare` 已被上游删除，且契约禁止安装期构建——**这是会让用户白改 pnpm-workspace 的有害指引**）、工具表只列 6 个而实注册 7 个；④核实上游设置卡是否合法时差点误判：正则写成 `settings\.[a-z]*\.[a-z]*` 会把**单段**插槽名 `settings.section` 整个漏掉，而 `grep -r ... packages/*/client* packages/*/src` 里后一个 glob 无匹配会让 zsh **直接中止整条命令**（`no matches found`，管道后静默），两个假阴性叠加就能得出「官方没这个插槽、上游卡是死代码」的错误结论。正确做法：装机版 alpha.2 的 `@deepseek-ai/dsh-client-*/lib/*.js` 里逐个 grep 插槽名与 `slots.register({` 的字段形状（结果：`settings.section` 由 `dsh-client-ui-settings` 声明，官方 `ui-settings-plugins`/`-general`/`-models` 都在用，register 形状与上游卡一致），再对照 host 路由 `snapshot()` 的 `{settings:{value,revision},…}` 与 `save`/`test` 两个 action。可复现?是（上游产物无源码 / 版本号碰撞 / 正则漏单段插槽名 + zsh glob 中止导致的假阴性，三者都会再现）。
- **dsh-asr-voice 设置卡「服务商预置 / 调用通道」全改不动、＋添加供应商抛异常：immer 深度冻结的宿主数组被按引用并进可变快照（2026-08-31，修复/client 状态）**：问题=插件自己的卡片（设置 → 插件 → 配置 → 语音输入）里除顶层「ASR 引擎」下拉与「当前使用」单选外**全部改不动**：服务商预置、调用通道、BaseURL、API Key 点了没反应（不报错、不回显），「＋ 添加供应商」直接抛。用户报「当前 DSH 下不可用」。
原因=`SettingsScopeController.derive()`（`packages/client/runtime/src/client/contract/store.ts:108-115`）把宿主快照喂进 immer `produce`，**产物连同数组元素在所有构建下都深度冻结**（不止 dev）。插件 `mergeHostValue` 对 `providers` 走「整表按引用覆盖」（`target.providers = next`），于是冻结数组与冻结行对象被塞进可变快照 `config`。此后每一处 `providers[i].xxx = v` 都是严格模式下的冻结写 → `TypeError: Cannot assign to read only property`，异常发生在 React `onChange` 内被吞掉，界面表现成「下拉点了没反应」；`providers.push(…)` 即便非严格模式也抛（`Array.push` 对 frozen array 必抛）。顶层 select / active radio 正常，是因为它们写的是**本地可变对象的叶子**（`config.asr.provider`、`config.asr.cloud.active`），碰不到冻结引用；`removeProvider` 给可变父对象赋一个**新数组**，短暂「解冻」，所以同一控件时好时坏。live 探针 + immer 复现实验（`frozen list? true | frozen row? true`，strict 抛 TypeError、sloppy 静默失效）排除了「DSH 版本错配 / CSS 遮挡 / 事件被拦截」三种猜测。
解法=①**入站一律脱冻**：providers 走 `next.map(normalizeProvider)`（逐字段重建，顺带把宿主多带的键——含旧版残留明文 `apiKey`——挡在客户端形状之外），其它数组与对象 `structuredClone` 后落位，`config` 里不留任何宿主引用；②**草稿只 rebuild**：卡片改成编辑 `newDraft()` 本地副本，`patchProvider / pickPreset / addProvider / removeProvider / withProviders` 全返回新对象与新数组，行对象永不原地改，将来即便再泄漏引用也不会退化成静默失效；③**`patchProvider` 补合成行落地**：`providers` 为空时 `draftActiveProvider` 会合成 v0.1 的 `id:'legacy'` 行，此时 map 命中不了任何行、编辑同样静默消失——找不到目标行就先把合成行 append 成真实行再打补丁。
坑=①**「整表覆盖」是按引用传递的暗管**：只补 `providers` 一处会漏掉未来任何新增数组字段，约定应是「凡从宿主进来的对象/数组一律先 clone 再用」，不是逐字段打补丁；②冻结写的失败模式随构建而异（ESM=strict 抛错、经典脚本=sloppy 静默失效），「有时能改有时不能」不是竞态，而是不同写入目标差了一层；③immer `produce` 的冻结是**副作用**，类型面上 `SettingsScopeSnapshot.value` 仍是普通 `T`，TS 完全看不出来 → 只能靠约定 + 回归测试钉住；④改代码前先用探针读宿主实际值（探针显示 `providers` 一直为空、走的是旧单配置回退），否则会误判成「写路径通了但值不对」；⑤回归测试要**双向验**：只删 `structuredClone(next)`（providers 仍走 map 重建）时全绿，还原成 `target[key] = next` 才红两例——说明断言钉的是「引用泄漏」而不是「克隆动作」。
验证=`pnpm run typecheck`（host+client）过；`pnpm test` 36/36（新增 `test/config-freeze.test.mjs` 8 例：冻结引用不漏进快照 / apiKey 不落客户端形状 / 四个草稿写路径不抛且原行未被 mutate / 合成 legacy 行编辑能落地 / writeDraft 只写变更段且宿主吞写时报段名且**重试仍报**）；红绿双向如上；`bash scripts/build.sh` 产 `lib/` 无 purity gate 违规。可复现?是（任何把宿主/immer 冻结数组按引用存进可变快照的插件卡片都必现；测试反向改回即红）。

- **dsh-email 设置路由缺 Origin 围栏可被本机网页直读邮箱授权码 + notify 的 sound 开关是完全死开关（2026-08-30，修复/安全）**：
问题=优化循环第 2 轮实测出两个真缺陷：①dsh-email 的 `/_dsh/dsh-email/settings` GET 直接把含 `password`（邮箱授权码）的完整配置回给浏览器，而防护**只有** socket remote 是 127.0.0.1 的判定——本机任意网页 `fetch('http://127.0.0.1:<port>/…')` 的 remote 同样是回环，等于跨站脚本可直读授权码，而 README 反过来声称 secret 不外泄；②dsh-notify 设置页的「通知声音」开关**完全没有被消费**：schema 有 `sound`、client 类型有、设置页复选框读写它，但 host 侧 `NotifyConfig` 接口无此字段且 `notifyConfig()` 投影时丢弃，`notifyMac` 恒传 `-sound Glass` → 典型「配置开关不生效」契约违规。
原因=①把「回环 remote」当成同源证明（二者不等价）；②配置项五处同步（schema / host 类型 / host 投影 / client 类型 / 设置页）漏了一处即静默失效，且无任何测试能发现。
解法=①email 补 `isTrusted` 围栏（与 retry/asr 同源函数体：`sec-fetch-site: cross-site` 拒、Origin 必须与 Host 同主机、`Origin: null` 与畸形 Origin 拒、无 Origin 只信回环 Host），并把 GET 改为只回掩码 `password:''` + `hasPassword` 标记，`save`/`test` 把空授权码当作「保持已存值」的哨兵——**否则掩码化后用户在设置页直接保存会把凭据清空**（`save()` 是整体 replace，这是做掩码时必须先看的落盘语义）；②notify 打通 `sound`：`NotifyConfig` 补字段 + `notifyConfig()` 补投影 + 4 个 `systemNotify` 调用点传 `configOf().sound`，开=显式 Glass、关=省略 `-sound`/`sound name` 子句跟随系统默认，并同步更正中英双语义文案（旧文案「四类通知音效各不相同」从未成立）。
坑=①**macOS 侧 terminal-notifier / osascript 都拿不到真静音**（`-sound` 无 `none` 取值），所以「声音开关」只能诚实地实现为「Glass vs 系统默认」，写「静音」就是新的谎言；②**判 API 是否分叉要靠可执行夹具而不是读代码**：把 13 条同源用例（DNS rebinding `127.0.0.1.evil.com`、`Origin: null`、IPv6 `[::1]:3080`、LAN 同源、缺 Host）逐字复制到 retry 与 asr 两仓跑 `node --test`，两仓各 13/13 通过 → 证明两份 `isTrusted` 目前行为完全一致，**据此更正本会话早前「8/30 只重写了 retry、asr 没跟上」的错误结论**；③子代理报的三条「bug」经复核被驳回：`deep-link.ts` 的 `unsub` TDZ（TDZ 只看执行顺序，15s 定时器回调时早已初始化）、shortcuts `showToast` 定时器句柄丢弃（每次新建元素、闭包只删自己，`existing.remove()` 后旧定时器对已分离节点是 no-op）、asr `readJsonBody` 「无超时」（`readRawBody` 第 3 参默认 60_000）——盲改只会引入回归；④notify 的 `summaryOf`/`isSubagent` 子代理称「已导出」实为模块私有，要测必须先做纯函数提取（`src/notify-policy.ts`）。
验证=email `pnpm test` 68/68（原 56 + 新增 12 条围栏与掩码回归，含「掩码回传保存不清空凭据」）、notify 9/9、retry 13/13、asr 13/13；备用端口 3099 一次性实例实测模型选择器点选 DeepSeek-V4-Flash 后 trigger 正确回填、5 插件 style 全注入、console 零错误；`validate-all` 6 仓全绿（email 18/19 + 唯一 WARN 为正确的「7 工具需专项评审」）。可复现?是（对未加围栏的 email 路由从本机任意网页 fetch 该路径即可读到授权码）。

- **dsh 0.1.2-alpha.2 三连破坏 settings 契约：`settingsNamespace` 删除 / `ctx.slots`+`ctx.sessions` 增补换包 / `register` 泛型变（2026-08-30，修复/兼容性）**：
问题=官方升到 alpha.2 后，7 个自有插件的 host 半区按设计会静默失效——profile `failOnStartupError: false`，不弹错、只是设置卡片与功能整体消失。
原因=`@deepseek-ai/dsh-settings` 入口导出表被砍：alpha.1 `{SettingsConflictError, SettingsProvider, default, deepEqualJson, installSettingsSection, redactSecrets, settingsNamespace}` → alpha.2 只剩 `{SettingsConflictError, SettingsProvider, default, redactSecrets}`。官方新写法是**明文常量**（`export const CHAT_SETTINGS_NAMESPACE = 'ui-chat'`），形状由类型层 `SettingsNamespaceInput<Namespace>` + 运行时 `parseSettingsNamespace`（`/^[a-z][a-z0-9-]*$/`）双重校验。同时 `ctx.slots` 的 Context 增补从 `dsh-client-ui-slots` 移到 **`dsh-client-ui-renderer/client`**、`ctx.sessions` 移到 **`dsh-api-session-controller/client`**；`register<T>` 变成 `register<const Namespace extends string, T>`。
解法=①删 `import { settingsNamespace }` 与 `import type { SettingsNamespace }`，常量改明文字面量（notify / retry-settings / shortcuts / asr-voice / Aqua 共 5 处）；②client 半区在 cordis 类型导入后补两条 type-only 增补导入；③只传一个类型参会把业务类型误绑成 Namespace、返回 `SettingsScope<unknown>`，asr-voice 补成 `register<typeof NS, AsrVoiceSettings>`；④依赖同步升到 alpha.2 线（`dsh-* ^0.1.2-alpha.2` / cordis `^4.0.2` / schemastery `^3.18.2`），否则明文常量在 rc.2 类型下 `register(ns: SettingsNamespace)` 直接编译不过。
坑=①**类型增补搬家不等于运行时断**：`ctx.slots` 服务在 alpha.2 仍在、只是 d.ts 换了提供方，所以"TS 报错"与"加载即炸"要分开判——真正会炸的只有被删的 `settingsNamespace()` 调用；②`SettingsNamespace` 仍是 `Branded<'SettingsNamespace'>`，给明文常量加该注解会**反而**编译不过，必须去注解让泛型约束去校验字面量；③判"某 API 是否还存在"要对比 `export {}` 清单，标识符出现在文件里可能只是内部同名局部量；④`import type {} from '@deepseek-ai/dsh-settings'` 这类拉 Context merge 的空导入要留着，别顺手删。
验证=4 仓 `pnpm run typecheck` + `pnpm run build` exit 0、产物 `settingsNamespace` 命中数 0；GitHub tag 归档解包复核（notify v0.1.2 lib 12 文件 / asr-voice v0.1.4 lib 36 文件）；浏览器实测模型选择器菜单渲染出 11 分组与 DeepSeek-V4-Flash/Pro 选项。可复现?是（在 alpha.2 运行时下装 v0.1.0 旧产物必现 TypeError）。



- **五自有插件正确性/健壮性审计轮（2026-08-30，修复/审计+围栏）**：问题=性能两轮收敛后用户要求继续优化自有插件（asr-voice/model-selector/notify/shortcuts/retry-settings）并验证后自动 push；本轮换角度做**正确性/竞态/资源泄漏/安全围栏**审计（Explore 只读代理×2 + 自审 notify/retry-settings，子代理审计三次因模型请求/captcha 抖动失败后改自审）。解法（按插件）——**asr-voice（P0×4）**：①`instance` useMemo([]) 冻结首帧闭包，快捷键链路 finalize 读首帧 `props.input?.draft` 且 inputActions 可能 undefined→append 丢字：handlersRef 每渲染转发最新 begin/finish/cancel + finalize 改读 draftRef 权威镜像；②EN_FILLERS 整词删 like/well/sort of/kind of 实义词削坏正常句（"I like this"→"I this"）：收敛为 um/uh/hmm/erm/you know/i mean；③MediaRecorder onerror 只 reject 无消费者→unhandledrejection+UI 永卡 recording：送达 onFail+清 maxTimer+`stopPromise?.catch(()=>{})` 标记已消费；④begin() 不清 preview 卡，旧预览确认覆盖新会话草稿：begin 首行 setPreview(null)。**系统性补强**：recorder 回调接线（onDone/onFail/onState/onInterim）加会话代际守卫——recorder 级 cancelled 只防 abort 防不了「停止→立刻重开」的会话替换（旧 onDone 会 null 掉新 recorderRef）；getUserMedia 挂起窗口加 stopRequested 复检（授权弹窗期间点停止不再幽灵开录，onDone('') 干净回 idle）；后台优化 catch 补代际守卫防取消后假失败 toast。**围栏**：http.ts isTrusted 重写——Host 回环短路不查 Origin（网页 fetch localhost 恰好 Host=回环=绕过）+`127.` 前缀可被 127.0.0.1.evil.com DNS rebinding 绕+`new URL('null')` 抛异常+IPv6 [::1] split 永不匹配：sec-fetch-site cross-site 一票拒+Host/Origin URL 解析严格全等+解析失败 fail-closed；readRawBody 60s 读取超时。**/models 无超时**（唯一漏网，设置页永久 loading）：host enumerateModels 逐 provider 20s 竞速（listModels 不确定支持 signal 用 Promise.race 兜底）+client 三处 fetch AbortSignal.timeout；setConfig 写失败事件无监听者（配置静默丢失）：设置卡监听 config-error 显示常驻提示（新词条 configSaveFailed）。**model-selector**：菜单键盘导航死路（搜索框自动聚焦但 onRootKeyDown 排除 input 目标，方向键/回车全失效）——搜索框内方向键进结果列表（精确匹配 searchRef.current，不误伤 effort range input 自带处理）+Enter 选第一个命中；select 被拒（accepted=false）显示失败提示；EffortSlider 同步 effect 补 reasoningEffort 依赖；挂载/inject 重跑路径 load 补 30s 新鲜度守卫（记得在 effect 内也记 lastLoadRef——只有 show/reload 路径会记）；onBlur relatedTarget=null（alt-tab）也收菜单。**shortcuts**：设置卡报错渲染 t('keyboardTitle')（标题当错误文案）+saveFailed 永不复位：新词条+config 事件复位；帮助面板 Tab 无圈闭/关闭不还焦/？不能 toggle/总开关关闭后 Escape 死角：焦点圈闭+还原+toggle+onConfig 关闭路径 closeHelp；innerHTML 动态插值统一 esc()（防词典引入动态内容成 XSS sink）；导航动作失败 toast 反馈（clickByText 先精确后 startsWith+usage/plugins 补 aria 回退）；setConfig 写失败回滚快照重新广播+disposer 置空 scope 写路径；侧边栏选择器 sidebarCol 优先。**notify（自审）**：四类通知不滤 subagent（session.header.origin==='subagent'，官方 session-controller history.js 同款判定；结构化读取防类型面不可达）；approval/request 通知体包 try/catch 保 next() 无条件委托；深链端口 3080 硬编码→ctx.get('webServer')?.port 推导（官方 dsh-web-app 同款）。**retry-settings（自审）**：同款围栏漏洞全修（写端点最要紧）+readBody 30s 超时+client 超时/json 守卫。**坑**=①**recorder/回调架构里「防幽灵」要分两层**：组件级代际守卫（防会话替换）+recorder 级 cancelled（防 abort），只做后者防不了重开；②Agent.session 的子代理标记在 **session.header.origin**（不是 meta；SessionHeader 类型面，agent-team 源码用 session.header.parentSession 同款路径）；③webServer 端口读取官方模式=`ctx.get("webServer")?.port`（dsh-web-app/lib/index.js:105）；④**废弃仓库的审计发现要在活跃插件里逐条对照移植**（ui-tweaks 的 CSRF/next()/subagent 发现全部适用于拆分后插件，直接修拆分件而非修废件）；⑤**清理已拆分仓库前先验证三处**：ahead=0+远端在+profile 无引用（cordis.patch.yml/package.json/node_modules/settings.yaml 四处 grep），然后 manifest 移出+本地目录删除（GitHub 留底）。**验证**=五插件 typecheck+build 全过（asr-voice 967be7f/model-selector 7892512/shortcuts ceb6dbf/notify baac447/retry-settings d1ab98d）；ui-tweaks 移出 manifest（本地目录已删，GitHub bitterSmilezzz/dsh-ui-tweaks 留底）；全部 push 远端 main。可复现?是（各 commit 可查；围栏行为可用伪造 Host/Origin curl 复现）。

- **dsh-asr-voice 两个交互缺陷：①转圈（识别/优化）时点按钮无反应无法打断；②勾选「静音自动停止」后自动停止却永远卡在转圈识别不出（2026-08-28，修复/状态机+回调）**：问题=①用户在识别/优化转圈时再点麦克风毫无反应（按钮 onClick 只有 idle→begin / recording→finish 两个分支，transcribing/optimizing 状态点击被吞掉）；②开启静音自动停止（silenceStop）后，说完话静音 2.5s 自动结束，但 UI 一直转圈、什么也识别不出来——手动点停止正常。原因=②**根因是 VoiceRecorder 只有 onState（把 UI 推进到 transcribing）+ stop() 的 promise 返回值，没有任何"转写完成"回调**：cloud 引擎静音检测（recorder.ts startLevelMeter）和超时 maxTimer 都直接 `void recorder.stop().catch(()=>{})` fire-and-forget，转写结果 resolve 进 stopPromise 后无人消费（手动路径是 UI 的 finish() 自己 await stop() 拿文本；静音/超时路径 UI 根本不在场），UI 永远停在 transcribing 转圈。①是按钮分支缺失 + recorder.abort() 不会中止在途的 host 转写请求（transcribeViaHost 的 AbortController 是函数内部私有，外部无法取消）。解法=①VoiceRecorder 接口新增 `onDone(text)`/`onFail(error)` 两个回调，browser 引擎 settle() 与 cloud 引擎 onstop 转写完成后统一调用（abort 后设 cancelled 标志不送达），UI 的 finish() 改成 fire-and-forget `void recorder.stop().catch(()=>{})`，文本一律经 onDone→handleTranscribed 消费（手动/静音/超时三条路径收敛到同一处），onFail→showError；②按钮 onClick 与 voiceController.toggle 增加第三种分支：transcribing/optimizing → cancel()（置 cancelledRef + abort recorder + abort optimizeControllerRef + 清 UI 回 idle），busy 状态提示条加 × 取消按钮（复用 .dshav-hint-dismiss），标题文案改「识别中…点击取消」；③cloud 引擎把当前转写请求的 AbortController 提升为模块内 transcribeController，abort() 时 abort 它，onstop 流程各 await 点检查 cancelled 提前 return；llmOptimize 增加可选 externalSignal 参数（与内部超时 controller 合并监听），UI 用 optimizeControllerRef 持有并被 cancel() abort。**坑**=①静音/超时自动停止与手动停止结果消费路径必须统一成同一回调（onDone），否则任何 fire-and-forget 的 stop() 路径都会丢结果卡转圈；②打断必须两层配合：入口分支（onClick/toggle 识别 busy 态）+ 数据面（abort 置 cancelled 阻止迟到回调送达），缺一层都会有「点了打断结果还是进来了」或「打断后 UI 还卡着」；③快捷键打断要新增 isBusy() 供 holdToTalk 区分——busy 时按下=打断且不进 held（否则松键 toggle 会误触发新录音）；④浏览器引擎 abort 走 recognition.abort()→onerror('aborted')→settle()，cancelled 标志要挡住 settle 里对 endResolve 的调用，否则打断仍 resolve 文本。**验证**=client tsc+build 通过；lib/client.js 含 onDone/onFail/cancelBusy。可复现?是（静音自动停止必现卡转圈；转圈时点击无响应必现）。

- **dsh-asr-voice 发送后红色波纹残留：repeat:Infinity 补间未保存 handle 无法 kill（2026-08-27，修复/动效）**：问题=点「填入并发送」后麦克风还是一直红色扩散波纹。原因=`startWave` 用 `fromTo({...repeat:Infinity})` 开无限循环动画但**丢弃返回的 TweenHandle**——rAF 循环永远在跑；`stopWave` 只把 ring 的 opacity/transform 改成 0/空，下一帧又被动画循环覆盖回去，红色呼吸环一直跳（`auto` 兜底会连调两次 `startWave`，泄漏双倍循环）。解法=`waveHandlesRef` 保存每次 fromTo 返回的 handle，`stopWave` 先遍历 `handle.kill()` 再重置内联样式；`startWave` 开头先 `stopWave()` 防叠加；组件卸载清理里 stopWave 同样生效。**坑**=**rAF 无限循环动画（repeat:Infinity / ticker）必须持有句柄并显式 kill/停 loop**，只改元素样式是「下一帧被覆盖回去」的假停止；GSAP 也同理（用 kill）。**验证**=client tsc+build；fetch `/plugins/dsh-asr-voice/client.js` 含 waveHandlesRef/handle.kill。可复现?是（repeat:Infinity 未 kill 的动画必残留）。


- **dsh-asr-voice 识别报「Param Incorrect」：MiMo-V2.5-ASR 只收 wav/mp3，浏览器 webm/m4a 被拒（2026-08-27，修复/协议探测）**：问题=用户点麦克风后识别失败，插件报「识别失败: Param Incorrect」。原因=**MiMo-V2.5-ASR 的 chat+input_audio 通道只接受 wav 和 mp3**（官方文档 + 实测）：对 webm/m4a 返回 400 `Param Incorrect: input_audio.data mime type must be one of: audio/wav, audio/mpeg, audio/mp3. Got: audio/webm`；base64 data URI 上限 10MB。浏览器 MediaRecorder 产出的是 webm（或 m4a），直接上传必被拒。解法=浏览器端在 onstop 后用 **Web Audio API 解码重编码**：`blob.arrayBuffer()` → `new AudioContext().decodeAudioData()` → 多声道混单声道 + 线性插值重采样 16kHz → 组装 16-bit PCM WAV（44 字节头 + data）→ 以 `audio/wav` 上传。纯浏览器无外部依赖；whisper 式通道也兼容 wav，故**所有云端模式统一转 WAV**（无需区分通道）。解码失败 try/catch 退回原始 blob 让上游报错，不卡死录音。**坑**=①先怀疑通道/鉴权会白查——用「直接对上游发变体」定位（WAV±asr_options 全 200，换 webm/m4a MIME 即 400 才锁定是格式）；②MiMo 官方文档「Supported Audio Formats: data:{MIME_TYPE}」的通用写法会误导，实际白名单只有 wav/mp3（要逐格式实测）；③AudioContext 解码后要 `ctx.close()` 防泄漏；④`noUncheckedIndexedAccess` 下 `Float32Array[i] +=` 会 TS2532，改 `mono[i] = (mono[i] ?? 0) + …`；⑤bundle 改动纯 client 侧**无需重启进程**，link 安装下重建 lib/client.js 后服务器 `/plugins/<id>/client.js` 即返回新内容，用户刷新页面（Ctrl+Shift+R）即可生效（served bytes 与磁盘 bytes 完全一致可作核对）。**验证**=client tsc+build 过；fetch 运行服务器 `/plugins/dsh-asr-voice/client.js` 含 blobToWav16k 且字节数与磁盘一致；WAV 直发 MiMo 200。可复现?是（任意 webm/m4a data URI 发 MiMo 必 400 Param Incorrect）。

- **dsh-asr-voice 挂载失效：client/host inject 引用了当前运行时不存在的服务（2026-08-27，修复/诊断）**：问题=插件「点了麦克风不能识别语音」+ 在当前 DSH 0.1.1-rc.2 下根本不挂载（无麦克风按钮、无设置卡）。原因=①client `inject` 列了 `remote/conversation/inputTriggers/settingsScope`——查 Client Service 目录，当前 client 服务只有 `slots/locale/sessions/layout/theme/timer/workspaces`，插件级 inject 引用不存在的服务会让插件挂载等待（dsh-context 等正在工作的插件 inject 只列 `['slots','locale']`）；②`settingsScope`（与 host 的 `settings`）是「可选服务」，应走 `ctx.inject(['settingsScope'],(raw)=>{…})` scoped inject（对应当前官方插件模式，缺失时只跳过卡片不阻塞主链路），写进插件级 inject 会让整个插件等它；③host 同理：inject 只留硬依赖 `['webServer','llm']`，settings 走 scoped inject，agentDefaultModel 用 `ctx.get`。解法=逐项对照 dsh-context（当前正常工作的参考插件）的运行时写法修正后 typecheck+build+link 装回。**坑**=①**用 cordis_inspect_list/query（Service/Slots Provider）当唯一真相**，别按旧文档/记忆猜服务名——client Service 目录与早期版本不一致是主坑；②`settingsScope` 虽在 dsh-client-ui-settings 的 module 增强里声明为 `Context.settingsScope`，但它不该进插件级 inject（可选服务一律 scoped inject）；③host 侧 `settings` 服务同样如此（dsh-context 用 `ctx.inject(['settings'],…)`）。**验证**=tsc host/client 全过；重启后 `Slots.listSubTree` 见 `conversation.input.right` occupant `dsh-asr-voice-button` + `settings.plugin.item` occupant `asr-voice` 均 active。可复现?是（旧 inject 列表在当前 runtime 必挂载等待）。
- **dsh-asr-voice 识别不可用三层根因：未安装 + Web Speech 被屏蔽 + 云端 key 空（2026-08-27，诊断）**：问题=用户「点了麦克风不能识别语音」。原因=三层：①插件已被第二轮瘦身卸载（web profile 无此 bundle，按钮本来就不在）；②`browser` 引擎=Chrome Web Speech，国内被 Google 识别服务器屏蔽 → `network` 错误 → 旧代码**不 settle 不提示**，静默失败（无报错、无结果、UI 卡录音）；③settings 里 `asr-voice` 段虽残留（插件卸载也不清）但 `apiKey` 为空、provider 停在 `browser`、云端配的是 DashScope `qwen3-asr-flash`（该模型走 chat 通道不是 whisper，即使有 key 也不兼容）。解法=①修复挂载（见上条）+ 重新 link 安装 + 设置 provider→`auto`、cloud→MiMo（`mimo-v2.5-asr`/`api.xiaomimimo.com/v1`，key 留空走 credentials 复用）；②错误暴露 + auto 云端兜底 + 双通道支持（见 features.md 两条）。**坑**=①settings.yaml 的插件段即使插件卸载也残留，且**重启才生效**——直接改文件 + 重启即可，别在 GUI 会话里等热加载；②诊断「为什么不能用」按三层拆：插件装没装（Slots occupant）/ 引擎通不通（网络/报错）/ 配置对不对（key/通道）。**验证**=重启后 GET /models 200、POST /transcribe 静音 WAV → `{"ok":true,"text":"嗯。"}`、POST /optimize → 200 优化文本——三层全通。可复现?是（国内网络 Web Speech 必 network 错误）。

- **M7 合并插件两个坑：z 自引用 TS2702 + gateway RPC 不是 HTTP 路由（2026-08-26，修复/排查）**：问题=①合并 dsh-workbuddy+dsh-trae 为 dsh-subscription-relay 时 `src/index.ts(92,22): error TS2702: 'z' only refers to a type`；②想确认模型选择器数据源时 POST `/api/llm/providers` 返回 404「not found」。原因=①Config schema 里 `z.infer<typeof Config>` 自引用让 TS 把 `z` 折叠成 type-only（import 的 value 面丢失）→ 运行时无法 `z.object(...)`；②gateway 的 RPC 由 `connection.rpc.intercept('/api', ...)` 在**客户端连接通道**上分发（packages/api/gateway/src/index.ts:105，endpoint 形如 `llm/providers` 两段），webserver 包根本没有 `/api` HTTP 路由——裸 HTTP POST 必 404，是设计不是 bug。解法=①手写 `interface Config` + `export const Config = z.object({...})` 分离类型与运行时值；②放弃用 HTTP 探测模型选择器数据源，改以插件运行态验证（fiber active + /status 双桥 modelCount + 旧两插件 loader entry 已卸）证明 provider 唯一注册。验证=tsc 全过；dev_inject_plugin host+client OK；/api/dsh-subscription-relay/status 双桥 ok（wb 13 / trae 40）。可复现?是（z.infer 自引用必 TS2702；POST /api/llm/providers 必 404）。
- **workbuddy2api 鉴权只认 `Authorization: Bearer <key>`，其余头全 401（2026-08-26，修复/协议探测）**：问题=/v1/models 不带头 401 Unauthorized，试 X-API-Key / X-Api-Key / 裸 key 仍 401。原因=桥鉴权实现只读 Authorization 头的 Bearer 形式（README 未写清，需实测）。解法=逐头探测确认唯一合法形式；DSH provider profiles 的 headers 与外部客户端统一用 `Authorization: Bearer <bridge-key>`（key 来自 dataDir/bridge-key.json，0600）。验证=curl 对照 4 种头：仅 Bearer 返回 200 且列出 13 模型，其余 401。可复现?是（任一错误头形式必现 401）。

- **muse-spark-1.2 直连根因闭环 + dsh-model-fix 插件（新建第 6 个自研 bundle，2026-08-19，模型/插件）**：问题=用户要求 muse-spark 直连不用代理。解法=三层取证：①网络层直连畅通（200/0.6s，走 7890 代理反而慢且结果相同）；②内容层省略 max_tokens 时正常（**小 max_tokens 会返回空内容**——隐藏 thinking 吞预算；DSH 未配 maxTokens 不发该字段，不受影响）；③**根因=opencode 聚合端点（opencode.ai/zen/go/v1）的 muse-spark-1.2 实现缺陷：流式只发内容、从不发 finish_reason 也不发 [DONE]**（同端点 deepseek-v4-flash/glm-5.2 均正常，muse 特有）→ pi-ai（DSH 同款 SDK）openai-completions.js 强制 stream:true 且结尾要求 finish_reason（:437 throw "Stream ended without finish_reason"）→ DSH 映射 TRANSPORT 且 TRANSPORT 在默认可重试列表 → agent 重试插件按 maxRetries=10 反复重跑烧 token。**解法=新建 host-only bundle `dsh-model-fix`**（bitterSmilezzz/dsh-model-fix，第 6 个自研独立仓库）：在 llm/stream waterfall 上包一层转换，仅当「已输出内容 + 结尾 error(TRANSPORT|STREAM_CLOSED) + 消息匹配 /stream ended (?:before|without)|without finish_reason/i」时把 finish 改写为 {kind:'stop'}；真实传输故障（SocketError 等）与空响应照常失败。配置 modelPattern（默认 ^muse-spark）+ providers 白名单。**坑**=①schemastery 3.18 的 z.object schema 是**可调用函数** `Config(input)`（返回规范化值），**没有 .parse/.validate**；②node --test 传目录在 Node 22 会当模块加载（MODULE_NOT_FOUND），要用 glob `'tests/*.test.mjs'`；③新 bundle 遵循伞目录模式：**lib/ 入库**（gitignore 不排除）、无 prepare 脚本、GitHub 直装；④Config 非法正则要在 apply 里 new RegExp 抛错实现 loud failure（schema 只校验 string 类型）；⑤验证链=10 单测 + **真实 pi-ai 集成**（同款 SDK 复现流喂进 fix：error(Stream ended without finish_reason)→{"kind":"stop"}，内容保留）+ scratch profile dump-config 行挂载 + web profile `dsh plugin add`。**验证**=dsh-model-fix commit 已推 GitHub；plugins.json/README 已登记（check-consistency.mjs 13 条全过）；web profile bundles 已含 dsh-model-fix，**重启 dsh web 生效**。可复现?是（curl 直连 muse-spark-1.2 流式可复现缺终止事件；pi-ai 复现脚本可复现 error 事件）。
**补充（用户确认，重点记录）**=muse-spark-1.2 经 opencode-go 使用**无需**在 opencode 平台设置开启「Allow models that train on request data」（训练数据授权开关，开启后请求数据可能被用于训练）——实测不开启直连即正常返回内容，**不要为了用 muse-spark 而开启它**；此点已在 dsh-model-fix README「⚠️ 重要说明」节重点说明。

- **install.sh 的 set -e 命令替换炸弹：ensure_source 在 dry-run 下 return 1 → CI bash -e 静默退出（2026-08-19，CI/修复）**：问题=重写后的 ci.yml 本地全绿，但推上 GitHub 后 Installer dry-run 一步失败：日志停在 `[info] clone 插件源码:` 后 1.7ms 即 `Process completed with exit code 1`，无任何报错信息。原因=两层：①GitHub Actions 默认 `shell: bash -e`，而本地验证时用的 `bash scripts/install.sh --dry-run` **没带 -e**——环境差异是没抓到的根因；②install.sh 第 18 行 `set -euo pipefail` + 技能包循环里 `src="$(ensure_source "$pack")"`：dry-run 下 ensure_source 对未缓存包 `return 1`，命令替换失败使赋值语句整体非零 → set -e 在 `[ -z "$src" ]` 判空**之前**直接杀脚本；同时函数内 `[dry-run] git clone` 走 stdout 被命令替换吞进 $src，污染判空（本地无 -e 时因此走了「无 skills 目录」分支而非期望的警告分支）。解法=①调用点加 `|| true` 兜底：`src="$(ensure_source "$pack" || true)"`（set -e 下命令替换失败照样中止，必须显式兜底）；②ensure_source 的 dry-run 分支日志全部改走 stderr（`>&2`），保证 stdout 只作返回值通道（本函数 stdout=返回路径，混入日志文本会让 $src 非空、判空失效）；③本地复现 CI 环境：`DSH_HOME=/tmp/empty bash -e scripts/install.sh --dry-run`（空缓存强制走未缓存分支），修复前 exit 1、修复后 exit 0 且输出「⚠ 无法获取技能包源码」警告 +（--dry-run 完成）。**坑**=①本地验证 shell 脚本必须带与 CI 相同的 `-e`（乃至 -euo pipefail），否则 set -e 类炸弹只在 push 后爆；②bash 函数 stdout 是返回值通道，日志输出必须 `>&2`，否则被命令替换吞掉；③空缓存环境变量（DSH_HOME 指到 /tmp 新目录）是复现「未缓存包」CI 分支的干净手段。**验证**=bash -n 过；`DSH_HOME=/tmp/empty bash -e scripts/install.sh --dry-run` exit 0（修复前 exit 1 可复现）；正常 dry-run exit 0；推送后 gh run 复跑 Installer dry-run 绿。可复现?是（`DSH_HOME=/tmp/empty bash -e scripts/install.sh --dry-run`：修复前必 exit 1，修复后 exit 0）。

- **dsh-plugins CI 修复：ci.yml 停留在旧 monorepo 布局导致每次 push 必挂；build-windows-shell 迁往独立 dsh-desktop-shell 仓库（2026-08-19，CI/修复）**：问题=用户问「github 上的 ci workflow 一直报错」。原因=2026-08-19 的 meta-repo 重构（791bb2d：6 bundle 拆独立仓库、dsh-core 删除、技能包进 dsh-skills）只改了仓库结构，.github/workflows/ci.yml 未同步更新——仍引用旧布局：scripts/check-package-consistency.mjs / check-inject-consistency.mjs / benchmark.mjs 已不存在（MODULE_NOT_FOUND）、dsh-dev|design|writing/scripts/verify-skills.mjs 已迁 dsh-skills、dsh-core/test/*.test.mjs 目录已删（node --test 对不存在的 glob 是静默 0 文件通过，CI 首个真实失败=Package consistency）。build-windows-shell.yml 同理引用 dsh-desktop-shell/tauri/**（该目录已不在本仓库，仅 manual/path 触发故不报红）。解法=①ci.yml 重写为 meta-repo 可测面：pnpm install --frozen-lockfile + node scripts/check-consistency.mjs（plugins.json 一致性）+ node scripts/plugin-manifest.mjs list + install.sh/install-plugins/apply-settings/install-external 四个 --dry-run（本地全预跑 exit 0，dry-run 不触网）；②build-windows-shell.yml 迁到独立 dsh-desktop-shell 仓库（.github/workflows/，路径改 tauri/**、tauri/src-tauri、native/build；Cargo 产物名 dsh-desktop.exe 与 tauri.conf.json productName DeepSeekHarness.exe 核对不变），从 meta-repo 删除；③commit+push。**坑**=①重构仓库结构时 workflow 不报错不报红——CI 只在 push 暴露，改完结构必须同步核对 .github/workflows 的引用路径；②node --test 空 glob 静默通过是「假绿」，清点 CI 步骤要按目录/脚本真实存在性核对而非看 step 结果；③meta-repo 无单元测试可跑（bundle 全在独立仓库），CI 可测面=清单一致性 + dry-run 系列；④迁移 Windows 构建 workflow 时要按 Cargo.toml name + tauri.conf.json productName 双核对产物文件名。**验证**=新 ci.yml 全部 7 步本地预跑通过（check-consistency 12 插件全过）；dsh-desktop-shell 仓库 workflow 就位、路径与产物名核对无误；推送后 gh run 复跑转绿。可复现?是（旧 ci.yml 任何 push 必现 Cannot find module；新 ci.yml 本地全绿）。

- **dsh-ui-tweaks 合并后多轮代码检测收敛（2026-08-19，检测/修复）**：问题=对刚合并重构的 dsh-ui-tweaks（client.js ~1169 行）做多轮代码及逻辑检测直至收敛。方法=R1 自查通读 + R2 独立子代理对抗审查（只读，10 个检查域）。**R1 自查发现并修复 5 处**：① notify 通知标题/正文回归（原版区分「需要审批/回答/轮次/会话完成」+ toolName/turn 参数，合并版退化成通用文案）→ 恢复独立 title/body locale key + {toolName}/{turn} 占位符替换；② 权限行丢失四态显示（原版显示 granted/denied/default/unsupported + 条件请求按钮）→ 恢复 badge 四态 + 非 granted/unsupported 才显示按钮；③ immersive 悬浮按钮重复事件（同时 dispatch config + immersive-toggle，onConfig 注册两次 → 双 refresh + 双 toast）→ 删 immersive-toggle 事件只留 config；④ immersive onConfig 无条件 toast（任何开关变更都弹沉浸 toast）→ 加 changed-value guard；⑤ 主卡片 checkbox 外部切换（悬浮按钮/快捷键）不同步 → 卡片监听 dsh-ui-tweaks:config 重渲染。**R2 对抗审查结论**=无高/中问题，9 项低：修复 4 项（notified/seenTurns 内存泄漏清理、未知 wait.kind 兜底、isEditable 覆盖 plaintext-only、空列表用去重后判断），保留 4 项原版忠实移植（onScroll 挂 window、turnSummaryOf 取最后一条 assistant、findFrame 全量 div 查询、host 串行 mutate——均为原版行为非回归，改动有风险价值低）。**坑**=①伞目录非 git，修复需同步到真源 clone 再 commit+push（5a30cc0..8a6f010）；②`notified` key 是 `sid:waitKey` 格式，清理时按第一个 `:` 切 sid；③push 后 git 输出走 stderr 被 PowerShell 当错误（exit 1）但实际成功，用 `git ls-remote` 确认真远端 HEAD。**验证**=node --check 全过；R1+R2 共 9 处修复 markers 逐一确认；真源 HEAD=8a6f010 已推；伞目录已同步。可复现?是（合并版初始代码可复现全部问题）。

- **dsh-work 第 6 轮检测：全插件结构健康扫描（本轮无新增 bug，检测面收敛信号）（2026-08-19，检测）**：问题=继续多轮检测目标，转向此前未覆盖的「其他自研插件结构 + 运行冲突」面。**确认无问题的检测项**：①全部自研插件 lib 语法健康（dsh-core/essentials/memory/ui-tweaks/visualize/work 的 index+client+各模块 node --check 全过）；②bundle 声明完整性（essentials/memory/ui-tweaks/visualize/work 5 个 bundle 的 dsh.bundle.patch 文件 + client 声明 + lib/client.js + main 全在；dsh-core 非 bundle 是共享工具包——被 essentials/work 依赖，设计如此非异常）；③web profile 实际加载 dsh-work/dimagent-oauth/ui-aqua（+essentials/work），memory/visualize/ui-tweaks 未装（按需 opt-in，符合 Pi）；④工具名无冲突（当前会话 33 个工具，agent_teams_* 仅 activate 注册、无重复，其余 9 个惰性）。**坑**=①PowerShell 内联 node -e 的引号/$ 转义极脆（连续被破坏），复杂检测一律写 .mjs 脚本文件再跑，别用 -e；②路径字符串在 node -e 里需 replace(/\\/g,'/') 处理反斜杠，也易错——写文件避免；③bundle 声明检测是「profile 加载正确性」的前置（patch 文件缺失会导致 dsh plugin add 当普通依赖装、bundle 层消失，NOTES 已记录过 aqua 缺 dsh.bundle 的坑）。**验证**=node --check 全过、bundle 5/5 完整、工具无冲突。可复现?否（纯健康扫描，未改代码；若删某 bundle 的 patch 文件可复现加载失败）。

- **dsh-work 第 5 轮检测：agent_teams_status 与 UI 的成员 activity 词汇不一致（真实语义 bug）+ MemberStatus working 死值（2026-08-19，检测/修复）**：问题=继续多轮检测目标，深挖 client-host 语义一致性。**修复（真实 bug）**：`agent_teams_status` 工具（model-facing）暴露的成员 `activity` 字段直接用 `memberActivity` 的原始 `running/inactive/unknown/unspawned`，而 ActivityPanel/活动面板快照用映射后的 `working/idle/unknown`——同一成员的实时状态模型看到 running/inactive、UI 看到 working/idle，跨接口词汇不同步，模型对成员状态的认知与用户所见不一致。解法=tools.ts 的 status 工具改为与 snapshot.ts 相同映射：`running→working / inactive→idle / 空 id→unspawned / 其余→unknown`（`memberActivity` 返回官方 `Map<string, "running"|"inactive">`，是底层词汇；UI 层统一 working/idle/unknown）。renderStatus 文本透出同一字段，一并统一。output schema 的 activity 是 string 无 enum，词汇变化不破坏 schema。**记案（低严重度未修）**：`MemberStatus` 类型的 `working` 值从未被写入（add_member 设 idle、remove_member 设 removed，无代码写 working）——死值，但 UI/工具只依赖 `status !== "removed"` 过滤和实时 activity，不受影响；改类型可能破坏持久化兼容，保留。**坑**=①语义一致性检查要跨「模型接口 vs UI 接口」两个词汇表 grep——`running/inactive`（官方 subagent activity）与 `working/idle`（UI 映射）两套词在源码共存，改一处要全量 grep 确认无遗漏；②`member.status`（持久化 MemberStatus）与 `member.activity`（实时）是两层概念，别混用——UI 判断工作状态用 activity，过滤 removed 才用 status。**验证**=host/client tsc --noEmit 全过；verify.mjs all checks passed（不依赖 status 的 activity 词汇，无回归）；lib/tools.js 含 unspawned/working 映射；node --check 过。可复现?是（改前调用 agent_teams_status 返回 running/inactive，与面板 working/idle 不同；改后一致）。

- **dsh-work 第 4 轮检测：运行时路由实测 + 补 H2/循环检测测试覆盖缺口（2026-08-19，检测）**：问题=继续多轮检测目标，验证前几轮改动的真实运行与测试覆盖。**运行时实测（真实 dsh web 实例）**：`/plugins/dsh-work/state`（live+archived）均 HTTP 200 返回 `{"teams":[]}`、`/plugins/dsh-work/assets/team-lead.png` HTTP 200 image/png（42052B）——重构后插件在运行实例正常响应。**测试覆盖缺口修复**：①H2 恢复边（failed/cancelled→pending）verify.mjs 无断言（只有 failed→failed no-op）→ 补 4 项（failed→pending/cancelled→pending/completed→pending 拒/pending→completed 拒）；②`wouldIntroduceCycle`（create_task 循环拒绝）是私有函数未导出且零测试 → 导出 + 补 3 项（无依赖不环/链式不环/回环成环/传递环/未知依赖不环）。**坑**=①verify.mjs 顶部 import 与 6/7 的变量命名空间共享——新加 `const chain` 与既有 6/7 的 `const chain` 重名 → SyntaxError「Identifier already declared」，改名 `depChain` 即可（ESM 模块级 const 全文件唯一）；②运行时容错实测受限：dsh-work 的 agent_teams_* 工具「注册可见 ≠ 本会话可调用」（官方 preset 工具面之外，动态注册不进模型工具表，NOTES 已有记录），且 `/state` 只扫描 workspaceRegistry 登记的 workspace——把畸形团队放到非登记目录测不到 snapshot 容错；畸形 team.json 容错靠静态读 snapshot.ts try/catch 确认（每 team 包 try/catch → logger.warn + skip）。**验证**=host/client tsc --noEmit 全过；verify.mjs all checks passed（新增 7 断言全绿）；verify:skill up to date。可复现?是（删 verify 的 H2/循环断言会回归失败；工具不可调用+非登记 workspace 不扫描均可复现）。

- **dsh-work 第 3 轮检测：sync-skill.mjs 缺 mkdir 在干净环境 ENOENT 崩溃（2026-08-19，检测/修复）**：问题=`pnpm verify`（`node scripts/verify.mjs && pnpm verify:skill`）在伞目录快照上失败——`verify.mjs` 全过但 `sync-skill.mjs --check` 报「DSH skill mirror is missing」。原因=两层：①伞目录 tarball 快照缺 `.dsh/skills/dsh-plugin-development/SKILL.md` 镜像（`.dsh/` 不被 .gitignore 忽略、应随仓库分发但快照没带）；②**更深的真 bug**：`sync-skill.mjs` 的 sync 路径直接 `writeFile(mirrorPath, ...)` 但**没有先 mkdir 父目录**——在干净 checkout/快照（`.dsh/` 不存在）时必然 ENOENT 崩溃，且错误信息是裸的 `ENOENT: no such file or directory`，不是可操作的「Run: pnpm sync:skill」。解法=sync-skill.mjs 的 sync 分支加 `await mkdir(dirname(mirrorPath), { recursive: true })` 再 writeFile（import 补 mkdir/dirname）；错误路径不变（--check 仍报缺失并提示运行 sync）。**坑**=①PowerShell 管道下 node 的 stderr（NativeCommandError）会混进输出，`$LASTEXITCODE` 在 `| Select-Object` 后读的是管道尾（-1 假象），要看真实 exit 需去掉管道重跑——同理 tsdown 之前也报 -1 假象；②.README 不含 events/withPending 等旧引用（README 只讲用法不讲实现，文档一致性良好）；③verify 链三件套（verify.mjs/verify:skill/verify-package）各自独立、验证面互补，跑发布前全链是正确姿势。**验证**=sync-skill.mjs 修复后：sync 成功创建镜像（Synced ...）、--check 报 up to date（真实 exit 0）；host/client tsc --noEmit 全过；verify.mjs + verify-package 全过。可复现?是（删 `.dsh/skills/` 后跑 `pnpm sync:skill`：修复前 ENOENT 崩溃、修复后自动建目录成功）。

- **dsh-work 第 2 轮检测：团队名 archive 保留名冲突 + snapshot 死代码 + 死图片资源（2026-08-19，检测/修复）**：问题=继续「多轮代码及逻辑检测直至收敛」目标，检测 dsh-work 尚未覆盖的面。**修复 1（真实 bug）**：团队名 sanitize 后恰为 `archive` 会与归档根目录 `<stateRoot>/archive/` 冲突——`createTeamDir` 建 `archive/team.json`、`archiveTeamDir` 归档时 `rename(archive, archive/archive)` 自嵌套、`listArchivedTeamIds` 读错记录。解法=create 时拒绝 `teamId === archive || teamId === CAPTAIN_KEY`（保留名校验，`captain` 与队长邮箱 key 冲突）→ `throw team name folds to reserved id`。**修复 2（死代码）**：snapshot.ts `byName` Map 构建后从未使用（早期按名查成员遗留），删除。**记案（低严重度未修）**：①`data-analyst.png`/`action-reporting.png`/`action-celebrating.png` 在 assets 与 ART_ALLOWLIST 里但 artwork.ts 从不引用（死资源，无害——路由能服务、client 不请求）；②L5 unread=邮箱累计长度非真未读（沿用上轮记案）。**坑**=①子代理只读复审在共享工作区并发修改时易挂起（再次复现，NOTES 战役方法论已记录）——连续两轮复审子代理都挂起，改判：独立检测为主，子代理仅作并行补充且超时即中断不等；②PowerShell `node -e` 内联脚本含 require+top-level await 混用报 ERR_AMBIGUOUS_MODULE_SYNTAX，需写成 .mjs 文件跑；③grep/文件存在性核查是快速验证 allowlist 与 assets 一致性的手段（本轮用它确认 14 个图片全在）。**验证**=host tsc --noEmit 过；verify.mjs all checks passed；lib/tools.js 含 archive 保留名守卫；lib/snapshot.js 无 byName。可复现?是（创建名为 archive 的团队：修复前归档自嵌套/读错；修复后创建被拒）。

- **dsh-work 重构后测试脚本与代码脱节 + setup 读 child.options 隐患（2026-08-19，检测/修复）**：问题=上轮去重挂靠重构后，`node scripts/verify.mjs` 报 2 处失败：①5/7 断言「missing dependency is ignored (not blocked)」与 L2 修复（缺失依赖应判 blocked）直接冲突；②7/7 用旧 `withPending` API（已改名 `withPendingEffort` 且参数从完整 selection 变为仅 effort 字符串）→ TypeError。原因=重构改了 members.ts 的 bridge 契约（provider/model 走官方、effort-only）但没同步 verify.mjs 测试 fixture；且 verify.mjs 7/7 的 fakeChildContext 未给 child 配 agentProvider/agentModel。**更深的真实隐患**：重构后 `installMemberSelectionRuntime` 的 `registerContinuableSetup` 回调从 `child.options.provider/model` 读 route——但官方 `continuation.ts` 里 `setupRegistry.apply(childCtx)` 在 `agents.create({..., agentOptions, ..., setup})` 的 **setup 回调内**执行，`child.options` 在此刻是否已填充无契约保证（agentOptions 是传给 create 的输入，create 内部才构造 agent.options）→ 依赖 child.options 不可靠，可能静默跳过 effort 注入。解法=①verify.mjs：`withPending`→`withPendingEffort`（2 处调用：spawnMember 的 mock、selectionRuntime.withPending）；缺失依赖断言改 `counts as blocked (matches unsatisfiedDependencies)`；fresh fixture 补 `agentProvider: overriddenSelection.provider / agentModel: overriddenSelection.model`（route 现从 descriptor 读）；②members.ts setup：route 改从 `descriptor.agentProvider ?? child.options.provider` 读（descriptor 是官方恢复路径同源、setup 时已存在——官方自己就在 `appendDelegatedPolicyOverrides((childCtx.agent).session, ...)` 里访问 childCtx.agent，descriptor 由 foldSubagentDescriptor 从 session events 读，必有），不再依赖 child.options 时序。**坑**=①验证脚本与代码同改是双刃：改断言前先确认它验证的是「新正确行为」而非「旧行为」——缺失依赖 blocked 正是 L2 修复目标；②PowerShell 下 `node scripts/verify.mjs` 的 stderr 混入 NativeCommandError 噪音，看 exit code 而非文字；③tsdown exit 码在 PowerShell 里可能显示 -1（信号假象），产物 LastWriteTime/Length 才是真凭据。**验证**=修复后 `node scripts/verify.mjs` 7/7 全过（含 fresh child effort 注入 + cold-resumed restore）；host/client tsc --noEmit 全过；node --check client.js 过。可复现?是（改前 verify.mjs 必现 1 FAIL + TypeError；改后全绿）。

- **dsh-work (AgentTeams) 深度 bug 挖掘 + 修复 6 处（2026-08-19，修复）**：问题=用户要找一个插件挖「很多未发现的 bug」。选型依据：dsh-work 是唯一带完整 src/ 的自研插件（其余子包只有 lib 产物），且在 web profile 运行中。方法=父 agent 通读全部源码 + 独立子代理对抗审查交叉验证 + node 实证复现，确认 6 处真实 bug（另记 3 处低优先遗留）。**修复清单**：① **M1 中文团队名两端 teamId 不一致（高）**：host `sanitizeKey` 用 Unicode 感知正则 `[^\p{L}\p{N}]+` 保留 CJK，而 client `parseAgentTeamsCreateArgs` 用 ASCII-only `[^a-z0-9]+`，中文团队名 host 得 `研究团队`、client 得 `team` → 对话卡片永远匹配不上磁盘快照（成员列表空白 + 活动面板出现幽灵重复卡）。解法=新建 `src/team-key.ts` 共享纯函数模块（纯 JS 零依赖，host 与 client bundle 同源），`sanitizeKey`/`keyDigest` 统一两端；digest 从 node:crypto sha256 改为 FNV-1a 32bit hex（浏览器可复现）。② **H1 移除成员后其任务永久搁浅（高）**：`remove_member` 只把 member.status=removed 不动任务，已 claimed/in_progress 任务的 assignee 指向已移除成员；`claim_task` 幂等分支 `task.assignee!==assignee` 拒绝改派、`update_task` 状态机无 claimed→pending → 下游依赖链全死锁。解法=remove_member 时把该成员名下 claimed/in_progress 任务重置为 pending+assignee=undefined；claim_task 增加 holderActive 检查（assignee 已非活跃成员视为孤儿可改派）。③ **H2 failed/cancelled 任务死胡同（高）**：`TASK_TRANSITIONS` 终态无出边，`unsatisfiedDependencies` 只认 completed → 一个 failed 任务让其所有传递下游永久不可认领（usage policy 还说「member 报告 blocker 就改派」，但改派不可能）。解法=failed/cancelled 增加 captain-only `pending` 恢复边，`update_task` enum 加 pending 且 member 禁止重开（completed→pending 仍拒绝）。④ **create_task 允许循环依赖（中高）**：只校验依赖存在不查环，t1 依赖 t2、t2 依赖 t1 → 双双永久不可 claim。解法=新增 `wouldIntroduceCycle`（新任务 id 经依赖图传递可达自己即拒绝）。⑤ **L1 withTeamLock 锁 Map 无界增长**：team 删除后 key 残留。解法=finally 里 `locks.get(key)===tail` 时 delete（tail 引用先存，避免误删排队者）。⑥ **L2 taskVisualState 与 unsatisfiedDependencies 对悬空依赖判断不一致**：缺失依赖 id 面板显示 open、工具判 blocked。解法=缺失 id 一律 blocked。**记案未修（低优先）**：L3 spawn 后 writeTeam 失败留下孤儿子代理（已加 interrupt 兜底）；L4 delete 工具描述说「deletes」实际 archive（已改描述文案为「ended and archived」）；L5 面板 unread=邮箱累计长度非真未读；M2 卡片 buildViewNode 硬编码 captainSessionId:''（rc.7 事件不含 sessionId 无干净修复路径）。**坑**=①client 侧 inspect 查询会一直 pending（已知坑，改用读 npm 包 d.ts 产物确认契约）；②伞目录 dsh-plugins 是 tarball 快照非 git，改完无法本地 commit，同步 GitHub 需 curl tarball 覆盖或等网络恢复 git clone；③tsdown 构建产物（lib/client.js）由 tsdown.config.ts 从 lib/client/index.js 打 bundle，改 client 源码必须重跑 tsc client + tsdown 才进运行 bundle。**验证**=host/client tsc --noEmit 全过；node --check 8 个 lib 全过；行为回归 16 断言全过（sanitizeKey 中文/数字/标点/超长、failed/cancelled→pending、completed→pending 拒绝、taskVisualState 悬空依赖 blocked）；profile link 指向伞目录已确认、运行实例下发新 client.js 73285B。可复现?是（修复前：中文团队名卡片空白可复现；removed 成员任务改派被拒可复现；failed 任务下游卡死可复现）。

- **web profile 的 dsh-ui-aqua 重复注册修复：profile 手写 insert 与 bundle 自带 patch 重复（2026-08-19，修复）**：问题=`dsh --profile web --dump-config` 里 `ui-aqua` 行出现 2 次（一次来自 dsh-ui-aqua 包自带的 `cordis.patch.yml` 的 `- insert: {id: ui-aqua, name: dsh-ui-aqua}`，一次来自 web profile 的 `C:\Users\admin\.dsh\profiles\web\cordis.patch.yml` 末尾手写的同款 insert）。原因=迁移/收编时曾靠 profile 手写 insert 注册 aqua，但 dsh-ui-aqua 包自身已声明 `dsh.bundle.patch`（自带 cordis.patch.yml 含同款 insert），bundle 安装后 patch 自动生效——profile 手写这份是冗余的；rc.7 下同名行「后者覆盖」所以 GUI 尚能跑，但属潜在重复注册隐患（keyed-slot/重复 id 更严检查时可能出问题）。解法=删除 profile `cordis.patch.yml` 末尾 6 行（注释块 + `- insert:` + `- id: ui-aqua` + `name:`），保留 bundle 自带 patch。**坑**=①profile cordis.patch.yml 是 LF-only（31 LF/0 CRLF），NOTES.md 是 CRLF+UTF-8（4720 LF 全 CRLF）——改前先查换行符再选 edit 或 Node 写入；②验证用 `dsh --profile web --dump-config` 计数 `- id: ui-aqua` 应=1（改前=2）；③运行中的 harness 按 boot 时组合加载，改 profile 配置需**重启 dsh web** 才真正生效（别在 GUI 会话里自杀 harness）。验证=dump-config ui-aqua 计数 2→1、上下文只剩 `# == dsh-ui-aqua`（bundle patch 节）、profile patch 文件其余行未动、语法干净。可复现?是（改前 dump-config 计数=2；删 profile insert 后=1）。

- **侧边浏览器「静默空白」修复：browser.probe HEAD→GET 兜底，百度正确判拒嵌（2026-08-19，bug 定位+修复）**：问题=用户要求「侧边栏能正常访问」；百度地址栏有地址但 iframe 空白且无提示。原因=上一条 NOTES 猜「JS frame-busting」是**错的**——Tabbit 真机抓 console 实锤：`reqfail https://www.baidu.com/ net::ERR_BLOCKED_BY_RESPONSE` + `Framing ... violates CSP frame-ancestors 'self' https://...`，即百度**发 CSP `frame-ancestors`**（浏览器强制阻止、任何 iframe 都渲染不了，与沙箱无关）。探测漏判根因=**HEAD vs GET**：百度只在 GET 响应带 frame-ancestors、HEAD 不带（curl 实测 HEAD/任意 UA 无 CSP、GET+node UA 有 CSP，Chrome UA 反而不发=WAF 指纹差异化）；旧 probe 只 HEAD（405/501 才转 GET）→ 判 embeddable → 静默空白。解法=`src/index.ts` browser.probe：**HEAD 无拒嵌头（XFO 与 frame-ancestors 均空）或 405/501 时补一次 GET** 再定结论；Node 复现验证 baidu→blocked、bing/zhihu→blocked（不变）、example→embeddable（不变）。**附带**=dsh-better-sidebar 已拆到独立仓库 `bitterSmilezzz/dsh-better-sidebar`；meta-repo 删目录后 **web profile 的 `link:` 悬空**（下次重启加载失败）→ 重指 `~/.dsh/profiles/web/package.json` dependencies + node_modules 符号链接到 `~/workspace/dsh-better-sidebar` 克隆。**坑**=①沙箱 iframe 父页面**读不到任何信号**（location/contentDocument/length 全 SecurityError，about:blank 也是 opaque origin）→ 空白帧无法从父页检测，只能靠 host 探测，所以探测准确性是关键；②拆分仓库全新 clone 需 `pnpm install`（node-pty 构建被 pnpm 10 拦截、仅运行时需要）+ 配 git 身份；③tsdown 重建 client 半又出非确定 CSS 哈希 → 提交只带 src+lib/index.js，恢复未动 client 文件；④git 源安装会跑 prepare 脚本（并行会话已删 better-sidebar prepare）。可复现?是（curl GET+node UA 见百度 CSP；新 probe 逻辑 Node 复现 4 站点判定正确）。

- **browser_open 返回校验炸「value.page.at is not a declared property」（2026-08-19，bug 定位+修复）**：问题=硬刷新后客户端真正消费意图并回报页面状态，`browser_open` 的 status/open 在下一个调用直接报 output 校验错误（工具 invalid output 失败）。原因=`BrowserPageState` 带 `at`（report 时间戳）字段（browser-intents.ts `reportPage` 写入），工具 execute 原样返回 `registry.pageOf()` 整对象；output schema（tools.ts）只声明 url/title/embedBlocked 且 `additionalProperties:false`，dsh-tools 运行时按 schema 校验返回值 → `at` 非法。实现时没炸的原因=验证阶段 page 恒 undefined（当时客户端从未真正回报过，见「意图不消费=页面旧实例」条目），字段从未进过返回值。解法=tools.ts 加 `pageLeafOf()` 仅投影 url/title/embedBlocked（`at` 不外泄），status 与 open 两处统一走它；`pnpm build` 后 **host 半需重启**（src/tools.ts → lib/index.js，client 半未动）。**附带坑**=tsdown 重建 client 半产生**非确定性 CSS module 哈希**（同源码 `FSTq1W_*` vs 新哈希，500+ 行伪差异）+ 新生成 4 个 `.map`（不在 npm files）→ 恢复未动文件（`git checkout <pre> -- lib/client*.js`）+ 包内 .gitignore 加 `*.map`（map 用 `git rm --cached` 保留磁盘文件即可），提交保持外科手术式。可复现?是（客户端回报一次后调 status 必炸；修复后返回 `{url,title,embedBlocked}` 无 `at`；typecheck 过、包内无测试文件是既有状态）。

- **dsh-client-ui-aqua Windows 上无动态/粒子效果：流体不跟手 + reduced-motion 静态帧（2026-08-18，修复）**：问题=用户在 Mac 上装毛玻璃插件有动态和粒子效果，Windows 上没有。原因=两层叠加：①`fluid-shader.ts` 把 deepseek.com 官网「触摸设备和 Windows 不喂鼠标」策略照搬进插件（`if (!coarse && !windows)`），Windows 上流体背景永不跟随光标（Mac 鼠标一划水面起波纹，Windows 没有）；②Windows「设置 → 辅助功能 → 视觉效果 → 动画效果」关闭时 Chromium 报 `prefers-reduced-motion: reduce`，粒子鲸鱼（whale.ts:88/321）/流体（fluid-shader.ts:474）/网状交互（mesh.ts:203）/小鱼（aqua.module.css:941）全部按设计降级为静态帧——Mac 的 Reduce motion 默认关闭所以效果齐全。解法=①去掉 Windows 分支改 `if (!coarse)`（src 与 lib/client.js 同步改——本仓库不可重建 aqua，只能直接改构建产物），桌面指针全平台喂鼠标；②reduced-motion 静态帧是**可访问性设计，保留**，README 写明开关位置让用户自查。坑=①改 UTF-8+CRLF 文件必须 Node readFileSync/writeFileSync（PowerShell Set-Content 会 GBK 破坏中文）；②改第三方插件构建产物必须同步改 src 并在 THIRD-PARTY 记本地修改点，升级 pull 后 lib/client.js 被上游产物覆盖要复查。验证=`node --check lib/client.js` 过 + grep 无 `userAgent*Windows` 残留。可复现?是（Windows 上 `prefers-reduced-motion: reduce` 时全部静态、鼠标不动流体不扰均可复现）。

- **dsh-desktop-shell Windows 托盘图标仍模糊（2026-08-17，修复）**：用户反馈 32px 单色 `>_` 托盘图标在缩放/高 DPI 下仍“分辨率低、看不清”。解法=把 `tauri/src-tauri/icons/tray-black.png` / `tray-white.png` 从 32px 重绘为 256px（System.Drawing 抗锯齿 + 圆头笔触，按原 32px 设计 8 倍缩放：5px 笔触→40px、3px 留白→24px、`>` 折线 (40,40)→(120,128)→(40,216)、下划线 (112,208)→(224,208)），`cargo build --release` 重建并覆盖 `native/build/DeepSeekHarness.exe`；运行中的旧 exe 已改名 `.old`，需重启桌面壳生效。验证=256px PNG 尺寸/Alpha 正常，重新编译成功。可复现?是（旧 32px exe 放大糊；新 256px 源重编译后清晰）。

- **Windows 托盘图标模糊优化（2026-08-17，修复）**：用户反馈 dsh-desktop-shell 的 Windows 托盘图标不如 macOS 清楚。问题=Windows 托盘用的是 `app.default_window_icon()`（1024px 鱼图标被系统硬缩到 16px 物理尺寸 → 糊）；macOS 用的是 SF Symbol `chevron.left.forwardslash.chevron.right`（终端提示符 `>_`）且 `isTemplate=true` 单色自适应。解法=①用 System.Drawing 画 32px 单色 `>_` 图标（4px 圆头笔触、3px 留白），新增 `icons/tray-black.png` / `tray-white.png`；②main.rs 新增 `tray_icon()`：Windows 启动时 `reg query AppsUseLightTheme` 读任务栏深浅色，浅色用黑、深色用白（等效 macOS template 自适应；Windows 托盘不会自动反色），`tauri::include_image!` 编译期嵌入；③`TrayIconBuilder.icon(tray_icon())` 替换 default_window_icon。坑=**git mv 会把整个目录（含 gitignore 的 target/）搬走，增量构建因残留产物里烤入旧绝对路径而报 `failed to read plugin permissions ... 系统找不到指定的路径`——改名后必须 `cargo clean` 全量重建**。验证=32px 图标几何分析（居中/21% 覆盖/不裁切）；构建 + 启动正常。可复现?是（旧 exe 托盘糊；换图标后清晰）。

- **dsh-mac-desktop Windows 桌面窗口不弹出（2026-08-17，修复）**：装到 web profile 后 desktop-runner 日志打印 opening 但窗口不出现。问题=exe 启动 ~1s 即 exit(0)；原因=**两层 bug 叠加**：①`lifecycle.rs` 的 `windows_dupe_count` 用 PowerShell 扫描去重，扫描脚本自身命令行含 'DeepSeekHarness' 和 '--parent-pid <n>' 匹配串，powershell 扫描进程匹配到**自己** → count≥1 → 每次 plugin 模式启动必现；②真正杀手=**`watch_parent` 的 `OpenProcess` 只带 `PROCESS_QUERY_LIMITED_INFORMATION` 没带 `SYNCHRONIZE`**，而 `WaitForSingleObject` 要求句柄有 SYNCHRONIZE 权限，否则立刻返回 `WAIT_FAILED` → watcher 线程 exit(0)（P/Invoke 实测确认：OpenProcess 成功但 Wait 直接 0xFFFFFFFF）；macOS dedupe 是 no-op、Swift 壳用 kqueue 所以从没暴露。解法=①去重扫描改**按进程名匹配**（`$_.Name -eq 'DeepSeekHarness.exe'`）+ flag 用 `'--parent' + '-pid <n>'` 拼接 + 排除 $PID；②`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE)`（windows-sys 里是 `PROCESS_SYNCHRONIZE` 常量）；`cargo build --release` 重建覆盖 `native/build/DeepSeekHarness.exe`（与 build-windows-shell.yml CI 同流程）。验证=带 --parent-pid 启动窗口 1.5s 弹出、15s 存活；standalone 对照正常。可复现?是（旧 exe 必现；缺 SYNCHRONIZE 时 WaitForSingleObject 必 WAIT_FAILED）。

- **web profile 真实回归 + 刷新报错排查（2026-08-17，回归/诊断）**：把 web profile 从旧 `@nanmicoder/dsh-agent-teams` 切到 `dsh-work`（remove 旧包 + add 本地 dsh-work），`dsh --profile web --dump-config` 见 `id: dsh-work`；`dsh --profile web --port 4099` boot 通过、HTTP 200；`/dsh-market/api/plugins`、`/sidebar/api`(405)、`/plugins/dsh-work/state`(200) 路由可达。用户反馈刷新报错，用 Playwright headless Chromium 加载 `127.0.0.1:3080` 无 console/pageerror。原因=未复现；最可能是浏览器缓存了合并过程中曾出现语法错误的旧 client.js（中间态 `sub_market` 多一层 `}` 曾导致 SyntaxError），或 WebKit 缓存。解法=硬刷新（Cmd/Ctrl+Shift+R）/ 桌面壳 Reload；若仍报错需提供控制台原文与宿主（浏览器 vs dsh-mac-desktop）。新增 `scripts/web-regression.mjs`（Playwright Chromium 抓 console/pageerror）与根 devDependency `playwright@1.62.1`。可复现?部分（headless Chromium 未复现；缓存假说可通过硬刷新验证）。

- **dsh web 启动补坑：schemastery/mode-boost/better-sidebar（2026-08-17，修复）**：移除 dshmarket 后 `dsh web` 启动报 `Cannot find package 'schemastery' imported from dsh-essentials/lib/better-sidebar/lib/index.js` 和 `Cannot find package '@dsh-external/dsh-mode-boost' imported from profile`。原因=①dsh-essentials 内嵌 better-sidebar 的 host 代码直接 `import z from 'schemastery'`（unscoped），但 essentials 根 package.json 只声明了 scoped `@deepseek-ai/schemastery`；link 包解析走真实路径，不会用 profile node_modules 里 dsh-better-sidebar 带来的 schemastery。②profile 里 mode-boost 的 link 指向已不存在的 `workspace/deepseek-plugins/dsh-mode-boost`，实际包在 `dsh-essentials/upstream/dsh-mode-boost`。③profile 还保留独立 `dsh-better-sidebar`，与 essentials 内置 better-sidebar 重复。解法=①essentials package.json 补 `"schemastery": "^3.18.0"`（unscoped），workspace `pnpm install` 后 root node_modules 有 schemastery；②profile package.json 的 mode-boost link 改为 `link:.../dsh-essentials/upstream/dsh-mode-boost`；③profile 移除 `dsh-better-sidebar` bundle/dependency（已合并进 essentials）；④`dsh plugin --profile web install` 重建。验证=`dsh --profile web --port 4099` 输出 `dsh web: http://127.0.0.1:4099` 后 kill。可复现?是（去掉 schemastery 依赖 / 保留错误 mode-boost link 会复现；修复后 boot 通过）。

- **dshmarket 独立包从 web profile 移除（2026-08-16，修复）**：用户报 `Failed to load plugins dsh-essentials ... locale namespace "dsh-market" already has locale "zh"`。问题=web profile 同时装 `dsh-essentials`（已合并 lib/market 并注册 `dsh-market` locale NS）和独立 npm `dshmarket`（同样注册 `dsh-market` zh/en），client 加载时第二次 register 同 NS 同 locale 直接 throw。原因=合并进 essentials 后旧独立 dshmarket 未从 profile 卸载，`dsh.profile.bundles` 与 dependencies 仍保留。解法=从 `~/.dsh/profiles/web/package.json` 删除 `dshmarket` bundle 行与 dependency，`dsh plugin --profile web install` 清理 node_modules/lock，`dsh --profile web --dump-config` 已无 dshmarket；市场功能由 dsh-essentials 内置 market 继续提供。可复现?是（再加回 `dshmarket` 依赖并 install 后重启 web 会复现同错误；移除后 dump-config 无 dshmarket）。

- **dsh-mac-desktop 九次复审（2026-08-16，修复）**：再审发现 2 个问题。①Tauri 插件模式下 `config_dir` 从未初始化（空 PathBuf），设置窗口保存会往当前工作目录写 `settings.json` 且不生效；原因=setup 只在 standalone 分支设置 config_dir。解法=在 setup 开头统一 `app.path().app_config_dir()` 并写入 shared，插件模式的设置保存也落到 app config 目录。②“打开 DSH 终端”只做 nil 回退、不做存在性检查；profileDir 猜错或已删除时 `cd` 到不存在目录失败。解法=Swift/Tauri 都改为从 profileDir→dshHome→DSH_HOME/默认 home 中选**第一个真实存在的目录**。验证=`make-app.sh`/`cargo check`/`cargo test --lib`（8 过）/`node --check`/`git diff --check` 全过。可复现?是（读代码可复现：插件模式改设置会在 cwd 生成 settings.json；profileDir 不存在时终端 `cd` 报错）。

- **dsh-mac-desktop 八次复审（2026-08-16，修复）**：再审发现 3 个问题。①Swift standalone “打开 DSH 终端”不回退 `$DSH_HOME`，只落到 `~/.dsh`，与 index.js/Tauri 的 `$DSH_HOME` 优先行为不一致；②Tauri 设置窗口用 `WebviewUrl::App("tauri://localhost/settings.html")` 传了完整 URL，而 `WebviewUrl::App` 只要 path 部分（`settings.html`），运行时会打开错误地址；③Tauri `default_dsh_home` 对空白 `DSH_HOME` 未 trim，可能把纯空格当有效路径。解法=①Swift `openTerminal` 先取 trim 后非空的 `$DSH_HOME` 再回退 `~/.dsh`，`make-app.sh` 重建通过；②Tauri `open_settings_window` 改为 `WebviewUrl::App("settings.html".into())` 并删除 `SETTINGS_URL` 常量；③Tauri `default_dsh_home` 对 env `.trim()` 后再判空。验证=`make-app.sh`/`cargo check`/`cargo test --lib`（8 过）/`node --check`/`git diff --check` 全过。可复现?是（读代码可复现：Swift standalone 设 `DSH_HOME` 后托盘终端仍开 `~/.dsh`；Tauri 设置窗口 URL 构造错误；Windows 下 `DSH_HOME="   "` 会被当成路径）。

- **dsh-mac-desktop 七次复审（2026-08-16，修复）**：再审发现 Phase 1 代码在 git 工作树/HEAD 中丢失（AppDelegate 无托盘/关闭隐藏/打开终端，index.js 无 profile 参数，Tauri 无 tray），但 AGENTS/NOTES 索引已声称落地，README 也未同步。原因=并行会话/history reset 把未提交的 dsh-mac-desktop 改动清掉，文档索引却被别的提交带走；`git fsck --lost-found` 找到 dangling tree（bb7b6ce）正是丢失前完整实现。解法=用 `git restore --source=<dangling-tree> --worktree -- dsh-mac-desktop` 恢复全部 Phase 1 源码与已构建 macOS 二进制，重新跑 `make-app.sh`/`cargo check`/`cargo test --lib`/`node --check` 全过；顺带修 README 示例用 `~/.dsh` 但代码不展开 `~` 的问题（index.js 增加 `expandHome()`，对 `dshHome`/`profileDir`/`appPath`/`appBundlePath` 生效）。可复现?是（当前 HEAD 的 dsh-mac-desktop 确实无托盘/终端代码；git fsck 可找回 dangling tree；`git restore` + 构建可复现）。

- **Archify「重启后未生效」诊断（2026-08-16，诊断）**：用户反馈 `@tt-a1i/archify-dsh@0.1.0` 安装后重启仍「未生效」。问题=用户可能期待在插件列表/设置/侧边栏看到 Archify 的 UI 入口或工具按钮，但实际没看到。原因=archify-dsh 是 **Skill-only bundle**：`cordis.patch.yml` 只 insert 一个 `@deepseek-ai/dsh-skill-filesystem` 实例（id `archify-skill-filesystem`，providerName `archify-plugin`，includeDefaultRoots false，bundledSkillDir 指向 npm 包内 `skills/`），没有 `dsh.client`、没有自定义工具、没有 settings/UI 入口；所以「生效」的唯一表现是 agent 的 skill 目录里多了一个名为 `archify` 的 skill，而不是可见插件卡/侧栏。验证=`dsh plugin --profile web list` 有 `@tt-a1i/archify-dsh 0.1.0`；`dsh --profile web --dump-config` 有 `archify-skill-filesystem`；web 进程 21:09 启动晚于安装；当前会话 `session.jsonl.zstd` 首条 user/message 的 `<available_skills>` 已含 `archify` 条目——确实已生效。解法=直接对 DSH 说「用 archify skill 画架构图/工作流/时序图」或输入 `/archify` 调用；若在旧会话看不到，开新会话或等 skill catalog 热刷新；不要按插件列表/市场里的 UI 入口判断。可复现?是（`dsh plugin --profile web list` + `--dump-config` + 解压 session.jsonl.zstd grep `available_skills` 可复现；无需改代码）。

- **dsh-market 把 mode-boost 显示为「安装完成但校验失败」（2026-08-16，诊断）**：用户安装 `@dsh-external/dsh-mode-boost` v0.1.0 后在 dsh-market 看到 broken 且问为什么未生效。问题=两个现象叠加：①dsh-market `verifyActivation` 只认 `dsh.bundle`/`dsh.client` 元数据，mode-boost 是纯 Cordis 插件（package.json 无 `dsh` 字段、无 cordis.patch.yml），因此被归类 broken（`stateBroken: '安装完成但校验失败'`），但这只是市场校验器的误报，不代表 boot 失败；②即使插件已由 `~/.dsh/profiles/web/cordis.patch.yml` 手动 `insert` 加载（`--dump-config` 有 `id: mode-boost`、活动日志有 `apply`），其共存守卫看到会话 catalog 里有 `dev_router_status`（Router Standard/Spec 预设在场）就整会话 no-op（日志 `assemble:inactive / other-router-present` 6300 次）。解法=要真正生效：新会话选官方 Standard preset（不是 router-standard/spec），或删/不用 router-standard/spec 预设让 mode-boost 接管；dsh-market 的 broken 状态可忽略（它是非 bundle 插件，市场校验器不覆盖 cordis.patch insert 这条激活路径）。可复现?是（`grep dev_router_status ~/.dsh/.agent-presets/router-*/*.mjs` + `tail ~/.dsh/mode-boost-activity.jsonl` + `dsh --profile web --dump-config` 均可复现）。

- **dsh-browser 扩展路径不可见（2026-08-16，修复）**：用户反馈 `~/.dsh/browser-extension` 找不到。原因=`~/.dsh` 是隐藏目录（`.` 开头），Chrome「加载已解压的扩展程序」文件选择器默认不显示隐藏目录，用户在 Finder/选择器里看不到。解法=把已构建扩展再复制一份到**非隐藏可见路径** `~/dsh-browser-extension`（即 `/Users/localuser/dsh-browser-extension`，含 manifest.json/background.js/content.js/panel/），Chrome 加载时选这个目录即可；`~/.dsh/browser-extension` 仍保留。可复现?是（隐藏目录在 Chrome 文件选择器不可见，复制到非隐藏路径后可见）。

- **pi-ai replay state 块数不匹配修复（2026-08-16，修复）**：问题=长会话运行报 `invalid pi-ai replay state: block count does not match assistant content` / `INVALID_REPLAY_STATE`，`/compact` 连续失败「Compaction could not produce a useful summary. The conversation is unchanged」。原因=`@deepseek-ai/dsh-llm-pi-ai` 的 `replayedAssistant` 要求 `source.replayState.blocks.length === message.content.length`；目标会话 `session-c241a169-b908-488a-9aa8-1fd14669c620` 有一条 `assistant/message`（seq=116103）因 `stopReason: length`（max-tokens）截断：pi-ai 原生响应有 `[reasoning, tool-call]` 两块，但 Harness 持久化的 `message.content` 只保留了 `[reasoning]`（不完整 tool call 未落盘），replayState 仍带 2 块，后续任意请求/compact 重建历史时即抛 INVALID_REPLAY_STATE。解法=不改 harness 源码，做会话数据修复：用 Node `node:zlib` 逐帧扫描/解压 `session.jsonl.zstd`，把该条 `source.replayState.blocks` 对齐为 content 实际块（去掉未落盘的 tool-call），保持首帧恰一行、逐帧带 checksum 重新压缩写回；原文件备份在 `/tmp/session-c241a169-invalid-replay-backup-20260816-205504.zstd`。修复后全 workspace 扫描 replayState 块数 mismatch=0。可复现?是（长会话 max-tokens 截断出半截 tool call 后可复现；本次已修复目标会话；**但正在运行的 DSH 进程仍持有旧内存态，实测不重启/不重新加载仍报错，必须重启 DSH web 或让该会话从磁盘重新加载**）。根治方向=上游 `dsh-llm-pi-ai` 应在 `stopReason=length` 时不要把未落盘的 tool-call 块写进 replayState，或 Harness 落 content 时保留该不完整 tool-call；本仓库按「harness 源码不改」只做数据修复。

- **dsh-mac-desktop 六次复审（2026-08-16，修复）**：再审发现 Dock 重开逻辑只处理「无可见窗口」，
  若主窗口隐藏但设置窗口可见，点 Dock 不会把主窗口带回来。解法=`applicationShouldHandleReopen`
  改为：只要主窗口存在且不可见就 `showMainWindow()`，否则按原逻辑；`make-app.sh` 重建通过。
  可复现?是（源码可复现；GUI 真机未自动化）。

- **dsh-mac-desktop 五次复审（2026-08-16，修复）**：再审发现 Swift “打开 DSH 终端”的路径
  只做了 AppleScript 双引号转义，路径里的 `$`/反引号/`!` 仍会被 Terminal 的 shell 二次展开。
  解法=改为先做 shell 单引号转义（`'` → `'\''`），再对 AppleScript 外层双引号做
  backslash/quote 转义；`make-app.sh` 重建通过。其余未发现新的功能性问题。可复现?是
  （源码可复现；GUI 真机未自动化）。

- **dsh-mac-desktop 四次复审（2026-08-16，修复）**：再审发现 index.js 的 `defaultDshHome()`
  对 `$DSH_HOME=""` 会返回空串，与 Tauri 侧已修的空串兜底不一致。解法=`defaultDshHome()`
  改为仅接受非空且 trim 后非空的 `$DSH_HOME`，否则回退 `~/ .dsh`；node --check 与 diff check
  通过。其余未发现新的功能性问题。可复现?是（源码可复现）。

- **dsh-mac-desktop 三次复审（2026-08-16，修复）**：再审发现 3 个 UX/边界问题。问题=①macOS
  窗口隐藏后点 Dock 图标不会重新显示（没实现 `applicationShouldHandleReopen`）；②Tauri 设置
  窗口已存在时再次点“设置…”不聚焦/不显示；③Tauri `DSH_HOME` 为空字符串时会被当成有效 home。
  解法=Swift 加 `applicationShouldHandleReopen → showMainWindow`；Tauri `open_settings_window`
  改为 show+set_focus；`default_dsh_home` 空串跳过。验证=Swift make-app.sh 重建通过；Tauri
  cargo check 通过。可复现?是（源码可复现；GUI 真机未自动化）。

- **dsh-mac-desktop 二次复审（2026-08-16，修复）**：再审又发现 4 个小问题。问题=①macOS
  托盘图标未设 `isTemplate`，深色菜单栏下可能显示异常；②standalone（双击 App）没传
  profile/dsh-home 参数时托盘“打开 DSH 终端”菜单项被隐藏，无法使用；③Tauri 托盘直接复用窗口
  菜单，托盘菜单会带着“文件”子菜单层级；④Tauri standalone 无参数时打开终端 no-op。解法=Swift
  托盘图标设 `isTemplate=true`、终端项常驻并在无参数时回退 `~/ .dsh`；Tauri 新增独立 flat
  `tray_menu()`（显示/隐藏、终端、设置、退出），`open_dsh_terminal` 增加
  `DSH_HOME`/home 回退。验证=Swift make-app.sh 重建通过；Tauri cargo check 通过；
  node --check/package-consistency 通过。可复现?是（源码+构建可复现；GUI 真机仍未自动化）。

- **dsh-mac-desktop 自审修复（2026-08-16，修复）**：用户问「调整还有问题吗」。问题=①Swift
  关闭隐藏按 `title != "Settings"` 判断主窗口，中文设置窗口标题是「设置」会被误判成主窗口，
  关闭设置会隐藏而不是关闭，托盘显示/隐藏也可能切到设置窗口；②README 仍写「Only macOS
  opens a window」，与仓库内 Windows Tauri 壳事实不符。解法=Swift 改为 `isSettingsWindow`
  （Settings/设置/Preferences 匹配）+ `closeToHideWindow` weak 引用记住第一个非设置窗口，
  设置窗口永远不挂 close-to-tray delegate；README 中英改为「macOS Swift 壳为主，Windows Tauri
  源码已同步、需 Windows CI 重建 exe」并更新 i18n hash。注意=Swift `NSApp.sendAction
  (showSettingsWindow:)` 和 AppleScript 终端命令只在真机验证，当前未做 GUI 自动化。
  可复现?是（源码可复现；macOS 二进制已重建通过）。

- **dsh-essentials 发图仍提示不支持（2026-08-16，修复）**：用户反馈发图又提示不支持。原因=
  vision-any 的 apiProxy 准入覆盖里，如果当前模型路由或 llm 服务暂时取不到，会直接走原始
  prompt，DSH 图片准入拒绝纯文本模型。修复=路由/llm 取不到时不再直接放行，而是走替换兜底
  （保存图片→路径提示→vision 工具），只有明确知道当前模型支持图片才原样放行。改动=
  `lib/vision-any/lib/admission.js`。注意=仍需重启 dsh 使 host 生效。可复现?是（配置好
  visionAny 后，在纯文本模型粘贴图片不再报不支持）。

- **dsh-essentials 用量统计图标与模型撞车（2026-08-16，修复）**：用户反馈用量统计图标与模型图标
  一致。原因=之前用了 `ic_ds_data_outline_16`，与模型设置图标相同。修复=改为
  `ic_ds_goal_outline_16`（飞镖靶+箭头），路径含 fill/stroke 混合，patch 按属性写入；合并 client
  同步。可复现?是（设置页用量统计图标与模型不同）。

- **dsh-essentials 插件列表面板重复（2026-08-16，修复）**：用户反馈分类按钮和列表重复显示。原因=
  官方 `ui-settings-plugin-inventory` 若仍加载，`settings.plugins.tab` 里同 id "all" 有两条；
  section 对每个 row 渲染 panel 且 `renderSlot(only:id)` 会把同 id 的所有组件都渲染进去，导致增强
  列表重复出现。修复=`installPluginTabDedupe` 增强：①tab 按钮去重；②同 id panel 去重（只留含
  `.dspi-section` 的）；③panel 内 `.dspi-section` 去重。合并 client 同步。可复现?是（若官方仍加载，
  打开插件列表分类/列表不再重复）。

- **dsh-essentials 插件列表自定义分类仍混入内置（2026-08-16，修复）**：用户反馈点自定义后内置仍
  显示。原因=分类只认 `@deepseek-ai/` 前缀，若个别 entry 的 moduleName 缺失/非标准前缀（如
  `cordis:` 或 `ui-`/`dsh-` 开头的 entryId）会被误判为 custom。修复=`kindOf` 增强：moduleName 为
  `@deepseek-ai/` 或 `cordis:` 判内置；moduleName 缺失时按 entryId 的 `@deepseek-ai/` / `ui-` /
  `dsh-` / `cordis-` 前缀兜底判内置。合并 client 同步。可复现?是（点自定义，内置不应出现）。

- **dsh-essentials 自动隐藏偶发不恢复（2026-08-16，修复）**：用户反馈自动隐藏后光标回来不出现。
  原因=可能鼠标经过底部 iframe/滚动条等导致 `mousemove` 未触发，或 32px 阈值太小。修复=阈值
  32→64；增加 `pointermove`/`pointerdown` 兜底（点击底部附近也恢复）；增加 scroll 到底部时恢复。
  合并 client 同步。可复现?是（隐藏后把鼠标移到最底部或点击底部）。

- **dsh-essentials 插件列表自定义重复（2026-08-16，修复）**：用户反馈插件列表自定义里有非自定义/
  重复。原因=官方 `pluginInventory.list()` 直接返回 loader entries，同一 `moduleName` 可能出现
  多条（如 `@deepseek-ai/dsh-tool-subagent` 出现 2 次）；自定义 tab 按 `moduleName` 分类，重复项
  会让列表看起来混乱。修复=在 `PluginInventoryTab` 增加按 `moduleName` 去重（保留首条），
  `kindOf` 对缺失 `moduleName` 兜底；合并 client 同步。可复现?是（打开插件列表内置/全部看重复项
  消失；自定义只剩 dsh-essentials + @dsh-external/dsh-mode-boost）。

- **dsh-essentials 插件列表仍重复（2026-08-16，修复）**：用户反馈插件里还是两个插件列表。原因=
  虽然 cordis.patch.yml 已禁用官方 `ui-settings-plugin-inventory`，但若旧进程/缓存仍加载官方
  client，`settings.plugins.tab` 列表不会按 id 去重，两个「插件列表」同时出现。修复=在
  plugin-inventory client 增加 DOM 层双保险 `installPluginTabDedupe`：MutationObserver 监听
  tab 按钮，发现重复「插件列表」时保留含 `.dspi-section` 的增强版，移除另一个；合并 client
  同步。可复现?是（若官方仍加载则开设置→插件可见重复，刷新后只剩一个）。

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

- **dsh-essentials 设置导航图标开关后不稳定（2026-08-16，修复）**：问题=设置多次点开关闭后
  「文件提及」「多媒体输入」图标先变齿轮再变回自定义，显示不稳定。原因=两个子插件的 nav icon
  MutationObserver 在首次发现 dialog 后把观察目标从 body 切换到 dialog；设置 dialog 每次关闭会
  销毁/重建，observer 停在已脱离文档的旧 dialog 上，新 dialog 插入 body 不再触发回调（at-file
  尤其明显；paste-input 靠聊天折叠的 body observer 兜底所以延迟恢复）。修复=两个
  `installNavIconPatch` 都改为**终身观察 document.body**（childList+subtree+attributes:d），
  不再切换目标；paste-input 同步加 rAF 二次 patch，消除 React 重绘后的齿轮闪烁。可复现?是
  （多次开/关设置观察图标）。

- **dsh-essentials 模型搜索框左右空隙不一致（2026-08-16，修复）**：问题=模型选择页搜索框
  左侧有 4px 空隙、右侧贴边（因为 menu 为滚动条贴边去掉了右 padding）。修复=给
  `.dms-search` 加 `margin-right: 4px`，搜索框左右对称，同时 `.dms-groups` 仍贴右缘保持滚动条
  贴边。改动文件=`lib/model-selector/client.js` + `lib/client.js`。可复现?是（打开模型选择页）。

- **dsh-essentials 设置插件出现两个「插件列表」（2026-08-16，修复）**：问题=并入自定义插件列表
  tab 后，设置→插件里出现两个「插件列表」。原因=`settings.plugins.tab` 是 list slot，官方
  section 用 `ctx.slots.entries()` 原始列表渲染 tab，**不会按 id 去重**；我们注册同 id `all`
  的 shadow 只影响内容渲染，不影响 tab 列表，所以官方 `all` 和我们的 `all` 都显示。
  修复=在 `dsh-essentials/cordis.patch.yml` 顶层加 `- id: ui-settings-plugin-inventory
  disabled: true`，禁用官方只读插件列表 UI，由我们的增强 tab 完全接管；`--dump-config` 已验证
  `disabled: true` 生效。可复现?是（未禁用前重启进设置→插件）。

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

- **dsh-essentials 模型选择滚动条仍有 1px 细缝（2026-08-16，修复）**：问题=去掉 menu
  padding-right 后右侧仍有一条很细缝隙。原因=`.dms-menu` 右边框本身占 1px，滚动条最多到
  内容区右缘，边框仍可见。修复=模型 pane 的 menu 加 `dms-menuModel` 类并
  `.dms-menuModel { border-right: none }`，滚动条贴到最右缘；根菜单/其他 pane 仍保留右边框。
  改动文件=`lib/model-selector/client.js` + `lib/client.js`。可复现?是（模型选择页滚动条）。

- **dsh-essentials 模型选择菜单滚动条右侧空白（2026-08-16，修复）**：问题=模型选择页滚动条
  离右边缘有 4px 空白，搜索框边框也没到右缘，视觉像溢出。原因=`.dms-menu` 统一
  `padding: 4px`，右侧内容（搜索框/滚动列表）整体内缩。修复=`.dms-menu` 改为
  `padding: 4px 0 4px 4px`（右侧内边距归零），滚动条与搜索框都贴到右边缘；左/上/下仍保留
  4px。改动文件=`lib/model-selector/client.js` + `lib/client.js`。可复现?是（打开模型选择页）。

- **dsh-essentials 回形针菜单不自动关闭（2026-08-16，修复）**：问题=点回形针弹出
  「选择文件/选择文件夹」菜单后，光标移开菜单不关，必须再点一次回形针。原因=`AttachButton`
  只用 `onClick` 切换 `open`，没有任何鼠标离开关闭逻辑。修复=在 `.dshca-wrap` 上加
  `onMouseEnter={cancelAutoClose}` + `onMouseLeave={scheduleAutoClose}`：离开后 150ms 自动
  `setOpen(false)`，期间回到按钮/菜单会取消定时器（避免按钮→菜单 6px 间隙误关）；组件卸载时
  `useEffect` 清理定时器。改动文件=`lib/paste-input/client.js`（子源码）+ `lib/client.js`
  （合并产物，两者同步改）。可复现?是（点回形针后光标移出 wrap）。

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

- **dsh-essentials 合并包启动报错：inject 服务名 `agent`≠`agents` + visualize config 无兜底（2026-08-16，zcode 定位修复 47d0d1a）**：问题=合并后 dsh 启动失败。原因=①inject 项是 **Cordis 服务名**（非 entry id）：dsh-agent 注册的服务是 `agents`（源码 `super(ctx,'agents')`），`ctx.agent` 只是恒为 undefined 的 DX accessor，声明 `agent` → Cordis 等一个永不出现的服务，组合永不就绪；②visualize 依赖 `ctx.skills.registerProvider` 但 inject 未声明 `skills`，同样等不到；③`applyVisualize(ctx, config.visualize)` 无兜底，profile 未传 config 时 `config.visualize===undefined` → visualize apply 内 `config.maxFractionBytes` TypeError 崩溃（at-file 自身模块 inject 是 `["typert","settings","agents"]`，合并时手工并集抄错）。解法=inject `agent`→`agents` + 补 `skills`；`applyVisualize(ctx, config.visualize ?? {})`。验证=node --check + 重启后 boot manifest 含 essentials client entry；**合并包的 inject 并集必须逐子模块核对真实服务名**（grep `ctx.<svc>.` 调用），子模块有默认参数（`config = {}`）的才安全，visualize 无默认参数必须兜底。可复现?是（任何把服务名写错/漏声明的合并包都会启动失败）。

- **「模型选不了」根因=settings.yaml 被 Python YAML 重写，132 个 reasoningEfforts 的 `off:` 键变布尔 `false:` 键**：PyYAML（YAML 1.1）把裸 `off` 解析成布尔 false，重写落盘成 `false: null`；harness 用 yaml 2.9（YAML 1.2）读成布尔键，`assertServiceable` 校验 THINKING_LEVELS 键名失败 → 拒掉整个 llm-pi-ai 分节 → 全部自定义路由模型消失 → 模型选不了；修复=`false: null` → `'off': null`（**必须带引号**，否则 PyYAML 再读还会变布尔；文件里已有 3 处带引号先例），双解析器验证（yaml2.9 + PyYAML 均 0 布尔键）+ `Config(section)` 解析 9 provider/330 模型通过；改完需重启 dsh 生效；备份=settings.yaml.bak-falsekey-*/bak-offquote-*（见 NOTES.md）。

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

- **dsh-vision-bridge 第十批（无图短路 + 多 agent 检测失败教训，aa7b1ee）**：目标循环 Round1-2——
  ①pre-step 改写缺 hasImage 门控（每个 agent 每个步骤无条件 map+rewriteImageBlocksDeep 全树遍历+新数组分配，
  即使会话无图）→ `if (hasImage && !passthrough)` 短路；②stealth stream() 无条件 map+rewrite → 先
  hasImageIn 扫描，无图直接转发（messages 同一引用）；③基准实测无图步骤 1.7x 提速（20K 次：7.4ms→4.5ms，
  单步省 ~0.1µs，长会话收益更大）；④坑=独立只读子 agent 审计再次挂起（共享工作区并发修改，interrupt 无产出），
  按先例改用自查+静态扫描+单测矩阵：无定时器/轮询/模块级可变状态、push 全局部数组、helper 无死代码；
  测试 93+15 全绿。可复现=node tests/apply.test.mjs + 无图 pre-step 基准（lib/images.js 纯函数）。

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

- **dsh-vision-bridge 第八批：会话含图切文本模型报 model-unavailable 修复（declareImage 垫片）+ compaction 兜底（llm/stream waterfall）+ 失败透明重建**：问题=用户报 `模型操作失败：model-unavailable: Model "deepseek-v4-flash" does not accept image input, but this session already contains images; select an image-capable model`（dsh-plugin-memory 会话里切到其他 provider 的纯文本模型全报错）。原因=api-proxy 的 `selectModel`（api-proxy.ts:2299）和 `prompt` 附件准入（:2487）都在**切模型/附图时**查 `ctx.llm.resolveModelInfo(...).inputModalities`——会话含图 + 目标纯文本 → 直接拒绝；这发生在任何步骤之前，**agent/pre-step 改写救不了**（pre-step 只覆盖步骤，覆盖不了准入）。解法=插件内 `declareImage` 垫片（默认开）：包一层 `ctx.llm.resolveModelInfo`，给 `inputModalities` 缺 image 的模型补上 image（准入放行、任意模型可切），`ctx.effect(() => () => restore)` 卸载恢复；安全由 pre-step + 新增 llm/stream 兜底保证（图片进适配器前必被改写）。第二个坑=**compaction 等辅助调用不经 agent/pre-step** 直达 `ctx.llm.stream`，会话含图时 pi-ai 适配器抛 UNSUPPORTED_CONTENT（input 未声明或 attachments 缺失都拒）、官方 DeepSeek 会坏会话——新增 `llm/stream` Waterfall 兜底：非冻结请求（`Object.isFrozen` 判定，loop 构建请求深冻结跳过）的图片改写为文字；**Cordis waterfall 监听器必须返回 AsyncIterable 而非 Promise**（`for await` 不消费 Promise），改写路径用懒执行 async generator + `yield* next()`；自己的视觉链请求用 WeakSet 引用排除（原图必须送达视觉模型）。第三个坑=垫片会让 resolveModelInfo 对所有文本模型「撒谎」→ 视觉链发现与 passthrough 直通判定**改用 `listModels` 的 inputModalities（真实声明）**，否则自动发现会选到文本模型当视觉链。第四个坑=settings 批量声明 `input: [text, image]` 的官方杠杆在**带 `models` 列表的路由上行不通**（catalog `modelOverrides` 明说 only meaningful while `models` is absent，同时出现直接 invalid），本部署 318 个文本模型逐一改 settings 不现实——垫片方案免改 settings 且对未来 catalog 新模型自动生效。另：第七批失败透明工作（visionFailures 原因标记 + 冷却 + README 成本控制）被并行 agent 的 git checkout 清掉（未提交工作），本轮重建并加测试。测试 85+15 断言全绿（apply 新增垫片/llm-stream/发现链真实/失败透明四组；cordis-boot 补 listModels inputModalities stub 契约）。可复现=任一会话附图后切 opencode-go/deepseek-v4-flash 等文本模型不再报错（需重启 dsh 加载新 bundle）。

- **修复 1（Host）**：flattenMarket 结果 + haystack 字符串预计算并缓存于 marketCache 旁，
  searchPlugins 改用预计算数据，避免每次搜索重建 592 对象 + 字符串拼接。——`index.js`

- **修复 2（Client MarketTab）**：flattened/perCategory 计算从 render 每次重算改为 useMemo
  （依赖 view.categories 不变则跳过），避免筛选/分类切换时 592 次遍历。——`client.js`

- **修复 3（Client ClassifiedTab）**：filtered 结果从 render 每次重算改为 useCallback + useMemo
  （依赖 query 不变则跳过），避免过滤按钮切换时重复遍历 160+ 条目。——`client.js`

- **定位**：Codex 桌面端 `/visualize` 语义的 DSH 插件——模型调用 `visualize` 工具，把整段内联
  HTML fragment 作为参数传入，Web UI 在对话里渲染成**可交互卡片**（模拟器/图表/对比面板/UI mockup）；
  建仓仅 2 天（2026-08-13 创建、08-14 仍在提交），TypeScript + tsdown + vitest，双语文档，已进
  awesome-dsh-plugin 清单，可从「设置→插件」市场装。

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

- **回归验证**：4 套既有测试全过（vision-bridge apply+cordis-boot、usage-dashboard
  apply-smoke+client-render）；bilibili 集成冒烟 6 项全绿（loginQr/popular/search/SSRF 403/404
  兜底/client.js 服务，宿主日志无报错）；mac-desktop **插件模式端到端**（临时 profile 起实例 →
  窗口经 LaunchServices 带 `--url --parent-pid` 拉起 → 杀 dsh 窗口自行退出）。

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

- **回归确认（8 项修复全部正确无回归）**：① 复制成功「已复制 ✓」/失败「复制失败」均 1.5s 复位，
  同 spec 连点产生的两个 timer 由函数式更新守卫（`(c)=>c===p.spec?null:c`）兜底、互不清新状态；
  ② 安装期间所有安装按钮 disabled + onInstall 前置守卫拦截二次点击（无第二发 /install 请求）；
  ③ refresh 恰好发一发 `?force=1`，effect 内 `setForce(false)` 因 deps=[request] 不重跑 → 无多余
  请求、无死循环（仅多一次渲染）；④ 市场防御 categories 空/c.plugins 缺/p.spec 缺/profile 缺全部
  优雅降级不崩；⑤ 分类 chip/搜索（spec/desc/分类名）/内置自定义筛选/「Web 服务器」中文 catalog 命中
  全部正确；⑥ 两组件 hooks 均在条件 return 前。**结论：无 Bug 级问题，可发布。**

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

- **已核实无问题**：CSRF 头严格 `'1'`（Node 自动小写头键，大小写变体/多余头/`'1 '` 均正确
  403/200）；spec 双重编码 `%2523`、`%2F`、199/200/201 长度边界、`#`、`?`、`%0A` 全部正确
  400/200；handler 抛错/exit 127 → 500 且响应为合法 JSON；zh/en README 解析 301/301 零差异
  （`## 徽章` 重置兜住）；`dsh plugin add github:` 是合法 CLI 语法（apps/cli/src/plugin.ts:150）；
  formatMatches 两个调用点签名一致。
- **可复现**：是（脚本在 /tmp/fuzz1-5*.mjs）。

## dsh-bilibili-player 第三轮：stale-set 收尾 + 对交付代码的可执行验证（Range 7/7）
- **新发现（低）**：播放页「← 返回列表」不推 `streamSeq`/`openSeq` → 在途 playurl/videoInfo
  resolve 晚到会 setStream/setCurrent（无害但脏）→ 返回时两序都 `++`（commit `c9cba59`）。

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

- **新修复（健壮性）**：`visionAnswer` 原来只收 `text-delta`——若某适配器只发整块文本
  `block-end` 不发 delta 会得空文本；补「无 delta 时取 block-end.block.text」兜底（有 delta 时
  跳过避免重复），单测用只发 block-end 的 mock 流验证。

- **修复 1（waterfall 稳定性）**：pre-step 里 `session.requestHeader()` 可能抛错 → 若抛错会
  让 waterfall 监听器整体崩、步骤挂死；已 try/catch（passthrough 判定降级为 false → 走改写）。

- **修复 2（工具稳定性）**：`lookupRef` 兜底扫 `session.deriveMessages()` 可能抛错 → 已
  try/catch，降级为"未找到 ref"（干净报错，而非裸 TypeError）。

- **修复 3（配置边界）**：`timeoutMs`/`maxTokens` 非法或过小（`AbortSignal.timeout(0)` 立即中止
  → 视觉调用必失败）→ normalizeConfig 钳制：timeoutMs 下限 1000、maxTokens 需 >0 整数，否则回退默认。

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

- **契约核实（非 bug）**：FiberState 0-5= PENDING/LOADING/ACTIVE/FAILED/**DISPOSED**/UNLOADING，
  官方 `plugin-inventory` 也把 DISPOSED(4) 映射 null（`packages/host/plugin-inventory/src/index.ts`）；
  `tools.register`/`commands.register` 经 `layers.effect` **fiber 自回收**（不必包 ctx.effect，包了
  反而双 disposer），`webServer.register` 返回同步 disposer 且**非** layer 作用域 → 必须 `ctx.effect`
  包（`packages/host/webserver/src/index.ts:94`、`packages/core/tools/src/index.ts:1037`、
  `packages/interaction/commands/src/index.ts:245`）；`shell.run` **永不 reject**（超时/信号杀也 resolve，
  `exitCode` 可为 null，`packages/shell/shell/src/types.ts`）；curl 404 exit=0 实测确认。

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

- **修复 1（compaction 直连漏洞）**：`agent/pre-step` 只覆盖 agent 循环；**compaction 等辅助
  调用直达适配器**不经 pre-step——stealth `stream()` 里加了兜底改写（残留图片块→文字再转发），
  pi-ai 路由的摘要调用仍可能带图（上游不收图则失败），README 注明。

- **修复 2（发现选错）**：自动发现视觉链会把 stealth 路由当视觉模型（它声明了图片能力但背后是
  纯文本转发）——发现时排除 `deepseek-official`/`deepseek-official-native`。

- **修复 3（发布级）**：`package.json files` 白名单漏了 `lib/`（index.js import
  `./lib/images.js`），git 安装会丢目录（同 dsh-mac-desktop 教训）——已加。

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

- **根因**：KPI 走投影缓存（exact 全量），明细走有界深扫描（只覆盖部分会话，差 ~1800 倍）。

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


