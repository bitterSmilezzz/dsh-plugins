# 安装 / 部署（26 条）
- **dsh 升级 0.1.2-alpha.4（npm 未发版的 alpha）：npm 壳 + workspace farm 链接换装全流程 + 插件适配的模块身份坑（2026-09-01，安装/dsh 升级/插件适配）**：问题=用户要求升级 dsh 到最新版并适配插件。`dsh-v0.1.2-alpha.4` tag 已出但 **npm 全部 @deepseek-ai/* 停在 alpha.3**（dist-tags alpha=alpha.3，`npm view @<pkg>@0.1.2-alpha.4` 404）——npm 壳的 70 个依赖声明是 `workspace:^`，pack 出的 tarball 无法从 registry 解析，纯 npm 路径死路。解法=①**重建源码树**：`git clone --no-checkout --filter=tree:0` 官方仓到 `~/workspace/dsh-upgrade` + checkout tag（上次树被删了，此树必须保留——安装将永久依赖它）；②`pnpm install`（53s，代理）+ `pnpm build`（根 scripts/build.ts：lib host+client + web 前端 220 产物）；③**换装**：`cp -a` 现有 npm 壳到 `dsh.old-0.1.2-alpha.3`（回滚点）→ 壳内 `lib` 换成 workspace `apps/cli/lib` 的符号链接 → 遍历壳内 `node_modules/@deepseek-ai/*`（223 个）逐个换成 workspace 包的符号链接（**map 要扫 packages+apps+vendor 三处**，漏 vendor 会把 cordis 族漏掉；vendor 在本区间无变化、npm 4.0.2 保留是正确的，213 换 10 留）→ 壳 package.json version 行对齐 alpha.4；④`dsh --version` 显示 alpha.4（版本串来自编译产物，manifest 只是外观）+ `--dump-config` 复验 compose。**profile 不用动**：web profile 的官方依赖 `link:` 指进 CLI 嵌套树，链接目标跟着 farm 走；`.dsh-module-fallback` 层由 boot 时 `healProfilesModuleFallback` 自愈（BFS 从运行安装锚点重解析、readlink 不匹配即重链）。**插件适配的模块身份坑（本轮最深的坑）**：把插件 node_modules 的 @deepseek-ai/* relink 到 workspace 树做类型验证时，`ctx.locale/slots/sessions/modelDirectories` 全部 TS2339——**模块增强（declare module '@deepseek-ai/cordis'）沿声明文件所在树解析 cordis**，workspace 里的包把增强落到 workspace 的 cordis 副本，与插件 pnpm store 里的 cordis 是两个物理副本=两个模块身份，插件 Context 未被增强；**cordis 族必须一并 relink**（增强与 ctx 同源）后 typecheck 即绿；跨包 d.ts 一致性要求**整组 @deepseek-ai/* 一次全换**，不能只换部分。**验证收获**：五自研插件对 alpha.4 全绿（typecheck + 13/9/7/50/165 单测），唯一真实适配项是 retry-settings 的 `RetryMeta` 漏声明 `defaultMaxRetries`（e92ba33 引入的**版本无关既有 bug**——对 alpha.3 类型同样 TS2339，只是 alpha.4 全量验证第一次跑到；发版 0.1.5）。坑=①**`pnpm run` 会因 node_modules 与 lockfile 漂移触发自动 install**，把手改的 relink 打回 lockfile 版本（retry-settings 被打回 alpha.2 造成假阳性报错）——验证期一律直调 `./node_modules/.bin/tsc`，不走 pnpm run；②relink 必须可逆（原 link 存 JSON 记录再换）；③alpha 线 peer `^0.1.2-alpha.3` semver 上涵盖 alpha.4（同 [major,minor,patch] 元组的 prerelease 递增），npm 未发版也不必动 peer——发布态等官方 npm 发版后自然对齐。可复现?是（重放：clone tag→build→farm 链接→dsh --version；插件侧 relink 脚本 + 直调 tsc）。**alpha.4 部署验收补录（用户手启后）**：web 前端资产哈希 `index-Df-65__b.js` 与构建产物**逐字一致**（host 已跑 alpha.4 的铁证）；fallback 自愈后仍指 model-selector 携带副本但解析链终点是已 relink 的 workspace alpha.4；聚合路由 53 个插件 bundle 全装载、rev=`1503e3b1`；真机断言：模型选择器全流程（SR 播报 21 results/21 处高亮/Escape 清词/End 跳末行/关菜单）+ retry-settings 卡（展开正常、已配置值 10 正确显示、无 loading/失败态）全过——**五插件在 alpha.4 host 上零回归**。
- **GitHub Release 的 Latest 徽标机制：由「发布时间最近的非 pre-release」决定，补齐历史 release 会把 Latest 从 alpha 版挪到稳定版（2026-09-01，发版/Release 管理）**：问题=v0.1.8-alpha.1 发版后曾自动置 Latest，随后补齐 v0.1.1~v0.1.7 的历史 Release（这些 tag 此前只打了 git tag、从未建 Release），Latest 徽标自动从 alpha 版移到了 v0.1.7，alpha 版列表位置虽在顶部但没了 Latest 标记。原因=**Latest ≠ 最高 semver，而是「发布时间最近的非 draft 非 pre-release」**；alpha 版是 pre-release（semver 上 0.1.8-alpha.1 > 0.1.7，但 Latest 不看这个），刚补的稳定版发布时间更新就夺走 Latest。解法=①补齐历史 Release：`git log --oneline <prev>..<tag>` 按 tag 分组取每个版本的提交差异写 notes，`gh release create v0.1.x --title ... --notes ...` 逐个补（tag 已存在，create 只建 Release 条目不动代码）；②对 alpha 版显式 `gh release edit <tag> --prerelease` 打标——语义正确（alpha 就是 pre-release），列表顶部的 alpha 带 Pre-release 标记、稳定版拿 Latest，是 GitHub 常规展示。坑=①**gh release list 里 Latest 是自动算的，gh CLI 没有直接强制 Latest 的开关**，想强设得走 API 且下次发版会被再挪走，不如接受「稳定版拿 Latest」的惯例；②补历史 Release 时各版本 notes 要按 tag 间提交差异写，不能每个都写一样；③`gh release create` 对已存在的 tag 不会重新打 tag，只是建 GitHub Release 条目，安全可逆。验证=9 个版本（v0.1.0~v0.1.7 + v0.1.8-alpha.1）全部出现在 release list，alpha 版 `isPrerelease:true`、v0.1.7 为 Latest。可复现?是（对任一 tag 只建不打的仓库补 Release，Latest 即按发布时间重排）。
- **dsh-asr-voice 发版 0.1.8-alpha.1：大改动 alpha 线发版——tag 已有先例时直接递增 + 预发布号，伞仓准入只看最新 tag（2026-09-01，发版/alpha 线）**：问题=用户要求把自 v0.1.7 后的较大 alpha 改动合集（I3 host 实时通道 + I4 client 云端实时引擎 + alpha.3 适配 + 设置卡修复 + 采集修复，共 8 提交）推远端 release。解法=①**版本号决策**：大改动走 `0.1.8-alpha.1`（保持 0.1.x 功能线、加预发布标记体现「实时通道已落地但 I4 真机实测未完成」的半成品性质），与 model-selector 的普通 `0.1.8` 区分开；②流程同先例：bump 仅动 version 行 → `typecheck`（双 program）+ `build` + `node --test` 132/132 → commit → `git tag v0.1.8-alpha.1` → `git push origin main --tags`；③**发布态验证**：`git clone --depth 1 --branch v0.1.8-alpha.1` 到 /tmp，`grep version` 与 tag 一致、`lib/index.js`/`lib/client.js`/`cordis.patch.yml` 产物齐全，伞仓 `validate-plugin.mjs` 20/20 + `check-artifact-imports.mjs` 0 缺失——**校验必须对 clone 出来的 tag 跑，不能对工作树跑**（工作树可能被 link 安装/未提交改动污染）；④`gh release create` 带 release notes（新功能/适配修复/质量/alpha 性质警告）自动置 Latest。坑=①**alpha tag 的 `git tag --sort=-v:refname` 排序正确但 human 查看要留意**：v0.1.8-alpha.1 排在 v0.1.7 前面，符合 semver（0.1.8-alpha.1 > 0.1.7），不是错位；②伞仓「version 与最新 tag 一致」准入只看最新 tag，所以 v0.1.7（存在但版本号已越过）不影响本发版；③发布前先 `git status --short` 确认工作树干净、只 add 版本文件，避免把未提交的开发改动卷进 release。验证=clone tag 后 validate 20/20、产物完整 0 缺失、release 已在 GitHub 置 Latest、远端 tag 可见。可复现?是（`git clone --branch v0.1.8-alpha.1` + `validate-plugin.mjs` 即可复验发布态）。
- **dsh-model-selector 适配 dsh 0.1.2-alpha.3 + 发版 0.1.8：先判破坏面再升依赖线，零破坏全靠真实类型验证（2026-09-01，安装/升级/发版）**：
问题=本机 dsh 已升至 0.1.2-alpha.3（8/31 发布，12h 前上 registry），插件依赖线仍锁 alpha.2；用户要求「适配最新 dsh」并发版。解法=①**先判破坏面再动手**：读 alpha.3 release notes（变更全是 UI/性能/修复：长会话渲染、图片回显、Tab 补全等，无插件 API 变化），确认 alpha.2 引入的「RemoteError 统一封装 / peer dep 优化」不影响 `ModelSelectInjected`/`ModelDirectoryState` 形状；②`sed` 全量替换 package.json 18 处 `alpha.2→alpha.3`（peerDeps+devDeps），`pnpm install` 后逐一 `node -p require(…version)` 确认 node_modules 实装 alpha.3；③**用真实类型验证而不是猜**：`pnpm typecheck` 双 program + 39 单测全绿 + build 正常，再 grep alpha.3 类型文件核对插件用到的每个字段原样存在；④**发版流程**：bump `0.1.7→0.1.8`（仅动 version 行，避免 JSON 重排污染 diff）→ commit → `git tag v0.1.8` → `git push origin main --tags` → 伞仓库 `validate-plugin.mjs` 20/20 + `validate-all.mjs` 6 插件全过（version 与最新 tag 一致那条是关键准入）。
坑=①**pnpm 11 会顺带改 supply-chain 策略**：`pnpm install` 自动把 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 逐条改成 `alpha.2 || alpha.3` 双版本兼容，这是合理自动变更，别当漂移回滚；②版本号/tag 历史遗留：本次发版前 package.json 已是 0.1.7 但 v0.1.7 tag 从未打（上轮漏发），直接 bump 到 0.1.8 避免补打错位的中间 tag——伞仓「version 与最新 tag 一致」准入只看最新 tag；③alpha 依赖线升级后 README 无需改（外部依赖段只写「运行时依赖 DSH web profile」，不钉死版本号）。
验证=typecheck 双 program 绿、39 单测全绿、build 正常；`git log origin/main..HEAD` 5 笔提交全推送（菜单方向/Enter/纯函数/适配/发版）；tag v0.1.8 已 push；伞仓 validate 20/20 + validate-all 6/6；QA 真机 8 条此前已在本机 alpha.3 dsh web 上全绿（运行时兼容先行验证过）。可复现?是（npm view @deepseek-ai/dsh dist-tags 可见 alpha=0.1.2-alpha.3；sed 全量替换 + pnpm install + typecheck 即可复现零破坏）。
- **dsh 全局 CLI 实为「软链 farm 到本地源码检出」：升级要留 dsh.old 回滚，且改名会杀死在跑的实例（2026-08-30，安装/升级）**：
问题=用户要升最新 dsh。`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh` 只有 44K，实查其下 72 个 `@deepseek-ai/*` 全是**符号链接**指向 `~/workspace/dsh-upgrade`（官方 monorepo 检出，detached 在 `dsh-v0.1.2-alpha.1`），web profile 的 9 个官方依赖再 `link:` 进这个 farm——本机是源码开发态，不是 npm 安装态。
原因=升级即「用 registry 实体包替换 farm」，一旦路径消失 profile 全部 link 悬空；而 **alpha 版本会被官方从 registry 下架**（`0.1.2-alpha.1` 实测 404），除现场目录外没有第二份回滚源。
解法=①先按本机既有惯例 `mv dsh dsh.old-0.1.2-alpha.1`（同级已有 `dsh.old-0.1.1-rc.2` 先例）保即时回滚，farm 清单另存 `~/dsh-install-backup-*/link-farm.txt`；②`npm i -g @deepseek-ai/dsh@<ver>` 在本机会拦全局 install scripts，须 `--allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs`，漏装 node-pty 只剩 prebuilds 无 `.node`；③动手前先在隔离 prefix（`npm i -g --prefix /tmp/x`）装一份，比对 `dsh/node_modules/@deepseek-ai/*` 同构嵌套布局是否保持、profile 那 9 个 link 目标是否全部存在——实测 npm 对本包**会**重建嵌套布局（虽然默认是 hoist），才允许替换；④`--dump-config` 复验 compose。
坑=①**改名目录会杀死懒加载的在跑进程**：Node 按路径 dynamic import，旧 3080 实例（已连续跑 1d23h）在 farm 被改名后某次解析模块即退出——升级前须确认是否要求服务不中断，且 `~/.dsh` 下无日志文件，事后拿不到崩溃 trace；②`grep -o x file | head && echo 有` 是**假阳性**（管道退出码来自 head），判"导出是否还在"要看 `export {}` 清单本身；③比对包名时带/不带 `@deepseek-ai/` 前缀是两套写法，直接 set 差集会得出全假结果。
验证=升级后 `dsh --version`=0.1.2-alpha.2、profile 10 条 link 全解析、`--dump-config` exit 0；备用端口 3099 起一次性实例实测 5 个插件 `<style data-plugin>` 全注入、`/api/retry-settings` 200、`/api/asr-voice/models` 200、`/api/asr-voice/transcribe` 405、浏览器 console 零错误。可复现?是（对 link farm 执行改名即在跑实例随后模块解析必 ENOENT）。
- **profile 里装的是旧 github 副本：`link:` 与 copy 决定改动是否生效（2026-08-30，安装/交付）**：
问题=插件仓库 HEAD 已到 v0.1.1 且含 8/29–8/30 一批审计修复，但 3080 实际跑 v0.1.0（产物字节全 DIFF），等于优化白做。
原因=profile `dependencies` 里 4 个插件写的是 `github:` spec → pnpm 物化成**实体目录副本**（8/28 时间戳），只有 `link:` 的 asr-voice 是热的；伞仓库只剩 `install-external.mjs`（管 browser/dsh-tui），没有刷新首方已装插件的入口。
解法=把 4 个 `github:` 依赖改成本地路径安装取得 `link:`——`dsh plugin --profile web add <绝对路径>`（**裸路径=link；加 `file:` 前缀会变 copy**，等于复刻同一个坑），此后重建 `lib/` 即生效。
坑=①remove+add 会把 `dsh.profile.bundles` **重排**，而 bundles 是有序补丁层（pnpm 把新加项排到末尾、第三方条目被挤到插件之前），必须逐项还原原顺序后用 `--dump-config` 复核；②`dsh plugin remove` 报 `ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS` 时先分清目标到底是"依赖"还是"孤立 node_modules 软链"——dsh-computer-use 属后者（不在 dependencies 也不在 bundles），`unlink` 即可，不该改 profile。
验证=5 个插件全部 `link:`、bundles 顺序与升级前逐字一致、三个路由状态码与隔离实例相同。可复现?是（`file:` 前缀装一次即变实体副本）。



- **M7 换装：旧 dsh-workbuddy/dsh-trae → 合并包 dsh-subscription-relay（2026-08-26，安装/合并）**：问题=两个插件合并为一个，如何在不重启、无重复 provider、零迁移的前提下在运行中的 web profile 完成换装。解法=①先 `dev_uninject_plugin` 依次卸 `@dsh-external/dsh-workbuddy`、`@dsh-external/dsh-trae`（卸 loader entry → 清注入 registry → 删 profile junction → 写 patch disabled 条目）；②再 `dev_inject_plugin D:\workspace\deepseek-harness\dsh-subscription-relay`（host+client 双半区即时生效）；③数据目录不动（$DSH_HOME/plugins/dsh-workbuddy / dsh-trae），登录态/积分/签到连续；④常规装配路径=dsh plugin add <本地包> + 重启 DSH Web（README 已写）。坑=①卸载要卸净——`dev_plugin_status` 应只剩新包一个 active entry；②workbuddy2api 仍要求 CWD 有 config.json——沿用旧 dataDir 的侧写文件即满足，别换目录；③守卫头 `x-dsh-subscription-relay: 1` 是路由硬门槛（漏头即 404）。验证=dev_plugin_status 单 entry；/api/dsh-subscription-relay/status ok:true 双桥（wb 13 模型 / trae 40 模型）账号原样（faith_bian / 用户8281296737）。可复现?是（装回旧两插件即双 provider；漏守卫头即 404）。
- **workbuddy2api 桥强制要求 CWD 有 config.json，env-only 会 fatal（2026-08-26，安装/桥托管）**：问题=自建 dsh-workbuddy 插件托管 workbuddy2api 子进程时，桥反复报 `load config: read config: open config.json: ... cannot find the file` 并以 code=1 退出（指数退避下重启 7 次）。原因=workbuddy2api 二进制启动**强制**读 CWD 下的 config.json——`WB2A_*` 环境变量只是覆盖层，不能代替配置文件存在性。解法=BridgeManager.init() 在 start() 前调用 writeBridgeConfig() 侧写完整 config.json（listen/api_key/auth_dir/state_file/region/cooldown/schedule/upstream 全默认值）到 dataDir，并以 cwd=dataDir 启动桥；env（WB2A_*）与 config.json **双写保持一致**。验证=桥日志由「open config.json 失败」转为 `loaded 1 cn account(s)` + `listening on 127.0.0.1:7863 (api_key=true)`，`/healthz` 200。可复现?是（删 dataDir/config.json 后重启桥必现 fatal）。

- **插件包本地构建 tsdown MODULE_NOT_FOUND：node_modules 缺 tsdown 包（2026-08-26，构建/工具链）**：问题=`npm run build:client`（tsdown 打 client bundle）报 `Cannot find module .../dsh-workbuddy/node_modules/tsdown/dist/run.mjs`。原因=插件目录 node_modules 从未装进 tsdown（link 插件 + pnpm 提升环境下 `npm i -D tsdown` 装不进去）。解法=scripts/build.sh 在 .bin junction 块后追加 node -e：探测 DSH_CHECKOUT（含 packages/+vendor 的源码 checkout）后建 junction `node_modules/tsdown` → `$CHECKOUT/node_modules/tsdown`，探测不到只 warn 不中断。验证=构建产物 lib/client.js 正常生成、dev_build_plugin 出 tgz。可复现?是（删 node_modules/tsdown junction 后重跑 build:client 必现 MODULE_NOT_FOUND）。

- **dsh-desktop-shell Windows 卸载（2026-08-20，安装/卸载）**：问题=用户反馈 dsh-desktop-shell 在 Windows 上没法用，要求从 dsh 卸掉。解法=`dsh plugin --profile web remove dsh-desktop-shell`（npm 版 dsh rc.8，D:\Program\nodejs\dsh.ps1）——web profile 的 package.json 中 bundles 与 dependencies 同步移除、node_modules 清理、`dsh --profile web --dump-config` 无残留且组合正常；web 与 dsh-tui 是独立 profile，卸载不影响 dsh-tui。坑=remove 输出不显式写 removed，以 package.json 与 node_modules 为准验证；NOTES.md 必须按 CRLF 追加（Node readFileSync/writeFileSync utf8 + \r\n）。可复现?是（同一命令可重装/重卸）。

- **本地 link 安装 bundle 解析不到 @deepseek-ai/* 依赖（2026-08-19，安装/坑）**：问题=`dsh plugin add <本地路径>` 后 `import("dsh-usage-plugin")` 报 Cannot find package @deepseek-ai/dsh-tools。原因=pnpm 对本地路径建的是**直接 symlink 指向 workspace**，Node ESM 按 realpath 解析，从 workspace 向上找 node_modules 无 @deepseek-ai/*（仓库没跑过 pnpm install）；而 github 安装走 .pnpm 结构，peer 依赖在 store 内可解析。解法=验证/分发一律用 `dsh plugin add github:<owner>/<repo>#<ref>`；若坚持本地 link 开发，须先在仓库内 `pnpm install`（README 本地开发流程本来就这么写）。**坑**=①「模块能加载」是 profile 侧验证的前置（host 半区启动即 import，缺依赖整行挂掉）；②本地 link 与 github 安装的解析语义不同，别混着验证。可复现?是（对无 node_modules 的仓库做本地 link 安装必现）。

- **合并版装回 web profile：排查「合并不见」= profile 被清空过 + 全家桶重装（2026-08-19，安装/排查）**：问题=用户问「刚才的合并呢」——合并已推送 GitHub 但运行环境看不到。排查=web profile 的 cordis.patch.yml 是 `[]` 且注释 "all third-party plugins removed (2026-08-19)"，package.json bundles 只剩官方 base/web-app（第三方插件 20:09 被全部卸载，早于 dsh web 进程 20:11 启动）——**合并只在源码层，profile 是空的，自然无效果**。解法=install.sh --only 装回全家桶（dsh-ui-tweaks/dsh-work/dsh-memory/dsh-visualize + 技能包 dsh-dev/dsh-writing/dsh-design）：bundle 走 dsh plugin add github:...#main，技能包 clone dsh-skills 后复制 ~/.agents/skills。验证=①profile package.json bundles 6 层（官方 2 + 自研 4）、dependencies 4 个自研包、node_modules 5 个（dsh-core 被 github 依赖自动解析）；②dump-config 4 个 entry 齐，dsh-ui-tweaks inject 并集 = fs/webServer/loader/sessions/settings/typert（合并正确落盘）；③省 token 配置（maxSpillBytes/readMaxBytes/spill-policy）注入 5 处。**坑**=①「合并没生效」先查 profile 是否真装着插件（cordis.patch.yml 空数组 + bundles 列表），别在源码层找问题；②运行中 dsh web（PID 4298）启动于 20:11 早于安装 20:51——host 半区必须**重启 dsh web** 才加载新组合（GUI 会话内不能自杀 harness），client 半区硬刷新即生效；③pnpm 报大量 missing peer（@deepseek-ai/* 等）是正常 WARN（harness 官方包提供运行时服务，AutoInstallPeers=false），非安装失败；④安装日志里 frontend-design-masterclass「内容不一致」警告来自 dsh-dev 技能包与本地已有同名 skill 冲突，install.sh 跳过处理，非错误；⑤dsh --dump-config 是验证组合注入的可靠只读手段（grep entry id + inject 列表）。可复现?是（卸载第三方后重跑 install.sh --only 可复现全流程）。

- **dsh-ui-tweaks 合并后安装激活 + 重启验证（2026-08-19，安装/验证）**：问题=合并重构后的 dsh-ui-tweaks 只存在于真源（8a6f010）与伞目录，web profile 未安装，运行中 GUI 不受影响也不生效。解法=①本地 link 安装（路径 B）：`dsh plugin --profile web add D:\workspace\deepseek-harness\dsh-plugins\dsh-ui-tweaks`——profile bundles 加入 dsh-ui-tweaks（第 7 个）、node_modules 为 Junction link 指向伞目录、dump-config 显示 `- id: dsh-ui-tweaks`（bundle 自带 cordis.patch.yml 自动插入 host entry）；②重启 dsh web 后验证：`GET http://127.0.0.1:3080/api/retry-settings` 返回 200 + 各 LLM 命名空间 retryPolicy 数据（llm-deepseek 顶层 maxRetries=10、llm-pi-ai providers 各 10）——证明重构后 host 半区真正生效（旧 dsh-notify host 是 no-op，此路由只可能来自新 dsh-ui-tweaks）；③client 半区验证：profile 内包结构完整、client.js/index.js node --check 过、dsh.client 声明齐全（runtime/ui-slots/ui-settings/ui-conversation/ui-primitives/locale，sessions 由 runtime 提供）。**坑**=①client 半区（通用设置「界面增强」总入口）硬刷新浏览器即生效，host 半区（retry 路由）必须重启 dsh web 进程（组合按 boot 加载）；②`dsh plugin add` 用绝对路径避免相对 cwd 解析坑；③pnpm 装本地 link 包会报 peer 依赖 WARN（无害，AutoInstallPeers=false）；④`Invoke-WebRequest` 访问本地 web 服务可验证 host 路由，不用等 GUI。**验证**=GET /api/retry-settings 200 + JSON 数据正确；dump-config 组合含 dsh-ui-tweaks；node --check 全过。可复现?是（uninstall 后重新 add 本地路径 + 重启即可复现）。

- **install.sh 本地开发优先：ensure_source 支持 ~/workspace/<repo>/<子包>（2026-08-19，开发流）**：问题=合并后 clone 了 dsh-plugins/dsh-skills 到 ~/workspace 做本地开发，但 install.sh 的 ensure_source 仍优先从 plugin-cache clone（本地只有 REPO_DIR 检查，不认 ~/workspace）。解法=ensure_source 优先链改为：汇总仓库内 REPO_DIR → **~/workspace/<repo 短名>/<path 子包>**（本地开发副本）→ plugin-cache clone。repo 短名从 manifest spec 提取（github:owner/repo#ref&path:/sub 中取 repo 名 + path 子目录）。**坑**：repo 短名正则首版写成取到 owner（bitterSmilezzz）而非仓库名（dsh-skills）——正确应取斜杠后、#/& 前的 repo 名。**验证**：--only dsh-writing 走 ~/workspace/dsh-skills/dsh-writing（无 clone 输出，40 技能复制成功）；--only dsh-essentials 的 preset 走 ~/workspace/dsh-plugins/dsh-essentials/preset（liangshen/router-standard 更新成功，无 clone）。**收益**：本地开发（改 workspace 源码 → 刷新 GUI）成为一等路径，稳定后 push 远端即可，install.sh 自动优先本地。可复现?是（owner/repo 正则取错导致走 clone 可复现：修前 ~/workspace 副本被忽略）。

- **本地开发工作流 + dsh-core 引用修复（2026-08-19，开发流）**：问题=合并后 dsh-plugins 的 essentials/work 仍引用已归档的 `bitterSmilezzz/dsh-core`（归档仓库只读虽能解析但违背合并意图）；且用户「每个插件都要改」需要本地 link 开发流。解法=①**引用修复**：dsh-plugins 内 essentials/work 的 dsh-core 依赖从 `github:bitterSmilezzz/dsh-core#main` 改为 `github:bitterSmilezzz/dsh-plugins#main&path:/dsh-core`（同仓库内子包，独立安装可解析，已实测从 git 子目录装 essentials 时 dsh-core 正确从 dsh-plugins 拉取）；②**本地开发工作流**：clone dsh-plugins 到 `~/workspace/dsh-plugins` + `pnpm install` 建 workspace 链接，web profile 的 dsh-essentials/dsh-work 从 github 源切到 `link:/~/workspace/dsh-plugins/dsh-essentials`（dsh plugin add 本地路径），改完刷新 GUI 即生效、稳定后 push；dsh-core 本地 workspace 内解析 ✅。**坑**：归档仓库（gh repo archive）内容只读、不能再 push——合并后跨包依赖必须指向**仓库内子包**（`&path:/`）而不是旧的独立仓库，否则违背合并意图且未来无法随主仓库更新；本地 link 装 bundle 时 pnpm 用 workspace 链接（profile 的 node_modules 里 essentials 是 link 到本地目录）。**验证**：web profile 无断链（essentials/work → ~/workspace/dsh-plugins/… ✅）、bundle 层含两者、本地 essentials/work lib/index.js 语法 OK、dsh-core 本地解析。可复现?是（归档仓库引用不随主仓库更新可复现）。

- **dsh-mac-desktop Windows 安装验证（2026-08-17，Windows/安装）**：`dsh plugin --profile web add` 本地目录安装成功（无需构建，native/build/DeepSeekHarness.exe ~10MB 已随仓库提交——早前 NOTES 的「Windows exe 待 CI」已过时），`dsh --profile web --dump-config` 见 `id: desktop-runner / name: dsh-mac-desktop`（inject webServer，enabled 默认 true）；重启 dsh 后自动弹 Tauri 原生窗口，进程随 dsh 退出自清理。无新增坑。可复现?是（add + dump-config）。

- **Windows 安装验证（2026-08-17，Windows/移植/修复）**：在 Windows + DSH rc.6（DSH_HOME=C:\Users\admin\.dsh，npm 版 dsh）上完整走通本仓库安装：`dsh plugin --profile web add` 本地目录装 dsh-essentials + dsh-work，仓库根 `pnpm install`，79 skills（dev 37/writing 40/design 2）复制到 ~/.agents/skills、3 presets 复制到 ~/.dsh/.agent-presets；重启后 3080 上 /dsh-market/api/plugins 与 /plugins/dsh-work/state 均 HTTP 200。问题=①link 包依赖走真实路径：bundle 的 ESM import 从 bundle 真实目录向上找 node_modules，profile 的 node_modules 不参与，本地 `dsh plugin add` 后 boot 报 `Cannot find package '@deepseek-ai/dsh-compaction-tool-result-pruner' imported from dsh-essentials/lib/index.js`；②`dsh-core: workspace:*` 依赖在 profile 工作区外被 pnpm 静默跳过（不报错也不装），运行时才 ERR_MODULE_NOT_FOUND；③pnpm 11 默认拦截 node-pty 构建脚本（`ERR_PNPM_IGNORED_BUILDS`，install 恒 exit 1），且仓库 pnpm-workspace.yaml 有 pnpm 交互残留的非法占位 `allowBuilds: node-pty: set this to true or false`；④Windows 上 `node scripts/install-plugins.mjs` 报「找不到命令 dsh」——spawnSync(`dsh`,{shell:false}) 无法执行 .ps1 shim；⑤nvm 下 `D:\Program\nodejs` 符号链接切到 v14.17.6 时 dsh shim 会从 PATH 消失（DSH 装在 v22.22.3）。解法=①/②仓库根 `pnpm install` 把 dsh-core/schemastery/@deepseek-ai/* 装进仓库自身 node_modules；③pnpm-workspace.yaml 改 `onlyBuiltDependencies: [node-pty]`（pnpm 11 语法）并删占位，`pnpm rebuild node-pty` 成功（prebuilds 就位），install 干净 exit 0；④直接在 PowerShell 跑 `dsh plugin --profile web add <目录>`（pwsh 可解析 dsh.ps1），install.sh 需 Git Bash；⑤重启 dsh 前 `nvm use 22.22.3`。可复现?是（去掉仓库 node_modules / 还原 workspace yaml / 切 nvm 版本均可复现）。

- **dsh-vision-router（ysr666/dsh-vision-router）调研判定（2026-08-16；最终被用户撤销安装/收编）**：用户发 https://github.com/ysr666/dsh-vision-router 要求评估适不适合安装到本仓库并收编，并将思想/理念落档。问题=这是一个 MIT 原生 DSH bundle（npm `dsh-vision-router` v1.4.0，326★/18 forks，真 `dsh.bundle.patch → cordis.patch.yml` + `dsh.client`），定位「给纯文本 DSH 补眼睛」：内置免 key OVH 匿名视觉链 + 12 个像素级 vision_* 工具（describe/ground/detect/crop/present/pixel_diff/colors/ocr/long_screenshot_ocr/trace/extract_foreground/html_screenshot）+ auto-wrap “+ Auto Vision” 模型组 + 可选 stealth 接管官方 deepseek-official 路由 + Web 设置卡 + doctor/repair CLI。原因=形态完全符合本仓库 bundle 约定、License MIT、npm 已发布、Node>=22、依赖 sharp/potrace/puppeteer-core/undici + peer @deepseek-ai/dsh-llm-deepseek@rc.6/dsh-anonymous-user-id@rc.6；本机隔离 `pnpm install --frozen-lockfile` + `pnpm test` 198 测试 196 过（2 失败是 macOS `/private/tmp` vs `/tmp` 路径前缀的 self-update 测试环境差异，非业务 bug）；`dsh plugin --profile web add /Users/localuser/workspace/deepseek-plugins/dsh-vision-router` 成功，`dsh --profile web --dump-config` 见 `id: vision-router / name: dsh-vision-router / config.progressiveTools: false` 与 `attachment-local` 20MB/1亿像素放宽；收编时工作树有并行未提交修改导致 `git subtree add` 拒绝，解法=在干净 temp clone 里 `git subtree add` 后用 `git fetch + git cherry-pick -m 1` 带回本仓库，再 amend 补 `git-subtree-dir`/`git-subtree-split` 元数据（并行会话的脏修改全程未动）。解法=初判**技术上适合安装并收编**，但因与 dsh-essentials ModLens 重叠，用户最终决定**不安装、不收编，仅保留判定与理念**；后续已从 web profile 卸载、`git rm` 移除仓库目录并回滚文档。注意点=①与 dsh-essentials 内置 ModLens 视觉重叠：ModLens 偏「一次读图证据」，vision-router 偏「多步像素工程/路由包装」，可共存但建议用户二选一主入口，避免两套 `+ Auto Vision`/粘贴行为叠加；②默认 `progressiveTools:false` 常驻 12 个工具 schema 增加每请求 token 固定开销（本仓库画像 ~55 工具 12K tokens，加 12 个 vision_* 需复测）；③默认 OVH 匿名兜底会把图片/问题发往第三方云，隐私敏感场景应关闭 `freeFallback` 或只配本地/自有 vision model；④其 `cordis.patch.yml` 还放宽 attachment-local 图片限制（20MB/1亿像素），如需收紧在 profile 补丁覆写；⑤升级走 `git subtree pull --prefix=dsh-vision-router https://github.com/ysr666/dsh-vision-router.git main --squash`，因无本地修改可直接跟随上游。思想/理念=①「DeepSeek 永远是大脑，视觉模型只当眼睛」的工具优先路由（routing:false）比整轮切换更可迭代/可验证；②像素级闭环：ground→crop→pixel_diff→html_screenshot→repeat 把 UI 还原变成可度量（diff ratio + worst-region）；③工具 schema 稳定性优先于渐进挂载（prefix/KV cache 考虑）；④免 key 匿名 fallback + 分类错误 + Retry-After 背压的 provider 链设计；⑤图像内容 hash 缓存 + 不可信证据标注（防 prompt injection）；⑥宿主依赖用 lazy sharp + 版本冲突运行时告警的健壮性；⑦client 设置卡 + doctor/repair CLI + self-update 的发布/自愈工程基线。可复现?是（npm registry/GitHub API/浅克隆/pnpm test/隔离 install+dump-config 均可复现；真实 GUI 图片轮未自动化）。

- **gpt-image-2-style-library 外部安装（2026-08-16，安装）**：用户同意把 awesome-gpt-image-2
  的 Agent Skill 装到 DSH。问题=该 skill 不是 DSH bundle，官方 CLI 只写 Codex/Claude Code/
  ~/.agents/skills。解法=`npx -y gpt-image-2-style-library@1.0.4 install agents`，已装到
  `~/.agents/skills/gpt-image-2-style-library/`（SKILL.md + references/style-library.md 26KB +
  agents/openai.yaml + assets/city-life-system-map.png 约 2MB 示例图）；DSH 会话 skill 目录随即
  出现 `gpt-image-2-style-library`，可直接用。注意=①npm CLI 不写 `~/.dsh/skills`，DSH 走
  `~/.agents/skills` 已发现；②skill 参考文件是 26KB 纯文本索引，无网络/密钥，安装零依赖；③后续
  升级用 `npx -y gpt-image-2-style-library@latest install agents`。可复现?是（同一命令幂等覆盖
  安装）。

- **Archify 外部安装（2026-08-16，安装）**：用户让装 @tt-a1i/archify-dsh@0.1.0 到 web profile。
  问题=这是 Skill-only bundle，不是 Cordis 功能插件。解法=`dsh plugin --profile web add
  @tt-a1i/archify-dsh@0.1.0`（pnpm 报的 missing peer 全来自 dsh-better-sidebar，已知可忽略）；
  装完 `dsh plugin list` 出现依赖、`dsh --profile web --dump-config` 出现
  `archify-skill-filesystem` 提供方（@deepseek-ai/dsh-skill-filesystem，providerName archify-plugin），
  `node .../skills/archify/bin/archify.mjs doctor` 全 ok。注意=①skill 文件在
  `~/.dsh/profiles/web/node_modules/@tt-a1i/archify-dsh/skills/archify/`，SKILL.md + bin/renderers/
  schemas/examples 完整；②DSH 3080 正在跑，bundle 变更需重启 DSH（+硬刷新）才生效；③shell 产物不会
  自动进 Web Produced Files，需 agent 返回精确路径。可复现?是（同一命令幂等安装/卸载）。

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

- **dsh-essentials 重装 web profile（2026-08-16）**：用户要求先装跨平台插件。
  跨平台核查=纯 JS host + web client，无 `.node`/child_process/平台专有路径；唯一平台分支是
  paste-input 对 `process.platform === 'win32'` 的文件名大小写/保留名处理（属适配非限制）。
  安装=`dsh plugin --profile web add ./dsh-essentials` 即完成：profile package.json 自动把
  `dsh-essentials` 加进 `dsh.profile.bundles` + dependencies，bundle 自带 patch 自动插入
  `essentials` entry（inject fs/webServer/tools/loader/sessions/settings/typert/agents/skills），
  无需手工改 cordis.patch.yml；`--dump-config` 可见 `# == dsh-essentials` + entry 且与 mode-boost
  共存。注意=新 bundle 需重启 dsh 进程才生效。可复现?是（干净 profile 直接 add 即可）。

- **v4-flash-godmode-opencode-go 安装（SheberDavid 第三方 agent preset）**：从 GitHub 仓库
  https://github.com/SheberDavid/v4-flash-godmode-opencode-go 安装 dsh agent preset——clone
  后复制 `preset/` 目录到 `~/.dsh/.agent-presets/router-flash/`；改 settings.yaml
  `agent-presets.default: router-flash`；preset 专为 opencode-go provider 的 deepseek-v4-flash
  设计（实测 w7 persona + 深度思考锚 = 规划深度 2.9 万字→37.5 万字），但 `isFlashModel` 只按
  model id `/flash/i` 匹配，对 jiyuanlvdong 等 provider 的 flash 模型同样生效；重启 dsh 生效；
  可复现：clone + cp + 改 settings.yaml + 重启 dsh。

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

- **dsh-visualize 已装进 web profile（rc.5 运行时实测结论）**：`dsh plugin --profile web add github:Nagi-ovo/dsh-visualize` 成功（bundles 列表 + `@dsh-external/dsh-visualize` 依赖 + dump-config 条目齐全）；**peer 声明 `^0.1.0-rc.6` ≠ 必须 rc.6**——作者用到的全部契约（presentationMeta/keyed toolview/input.dock/isConcurrencySafe/skills.registerProvider/defineTool）在 rc.5 源码里都存在（逐一 grep 验证）；pnpm 报 missing peer 是**良性**的，因为共享层 `~/.dsh/profiles/node_modules/@deepseek-ai/`（195 包，symlink 到 harness workspace apps/cli node_modules）在 Node 运行时解析时会被走到（实测从插件目录 require.resolve 命中 rc.5 包）——pnpm 的 peer 检查不算这一层、Node 解析算；**重启后生效验证通过**（rc.5 真机）：会话技能目录出现 `visualize` skill（随包 `ctx.skills.registerProvider`）、运行实例 `/plugins/@dsh-external/dsh-visualize/client.js` 200（29KB，`__ModuleLoader__.load`）、根 HTML boot manifest 含 dsh-visualize——host+client 双半区均装载（见 NOTES.md）；**首个真实卡片验证通过**（rc.5 全链路 OK）：用户要求「可调参数的排序算法可视化」→ 加载随包 `visualize` skill（base 目录在插件包 assets/，含 design.md/charts.md 主题 token 契约：--viz-series-N/--primary、禁用 color-scheme 声明、CDN 白名单、fragment 无骨架）→ `visualize` create 出 10.5KB 内联卡片（5 算法事件录制 + 播放/单步/调速/调参，纯 JS 零外部依赖），workspace 落 `viz/visualization-<fnv1a8>.html`。

- **pnpm 不递归目录包的本地子依赖（集合安装设计教训）**：想让「克隆一个仓库 → `dsh plugin add <仓库根>` 一次装完所有插件」，在根 package.json 里把子插件声明为 `link:./dsh-xxx` 或 `file:./dsh-xxx` 依赖——实测 **pnpm 只把根包链接进 profile，完全无视其本地子依赖**（lockfile 只记录根包一行，node_modules 里 8 个子插件全无）。`dsh plugin --profile p add <dir>` 就是 `pnpm add <绝对路径>`（link 语义）+ reconcile bundles，不会递归解析目录包的 `link:`/`file:` 子依赖。**解法**：`scripts/install.sh` 逐个 `dsh plugin add <每个子目录>`（8 次 add 包在一条 bash 命令里），每个子插件成为 profile 的直接依赖——这正是本机 web profile 一直用的模式。**可复现**：临时 DSH_HOME + scratch profile 跑 `dsh plugin add <仓库根>`，查 lockfile 只有根包。附带发现：`dsh-better-sidebar` 的 `main=lib/index.js` 但 `lib/` 被其 .gitignore 排除（subtree 后无构建产物），install.sh 需先构建 TS 插件再 add。

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

- **手动 link 安装**（无 dsh CLI 环境）：照抄现有插件的接线——`~/.dsh/profiles/web/package.json`
  的 `dsh.profile.bundles` 加 `"dsh-vision-bridge"` + `dependencies` 加
  `"dsh-vision-bridge": "link:/Users/localuser/workspace/deepseek-plugins/dsh-vision-bridge"`；
  `node_modules/dsh-vision-bridge` 软链到工作区（其余插件同款软链形态）；
  冒烟验证：从 profile 目录 `import('dsh-vision-bridge')` 成功（name/inject/apply 齐全）。

- **一键安装/市场抓取走 `ctx.shell`，默认 profile 下是沙箱 bash（workspace-write）**：bash-sandbox
  的 `resolve()` 对未传 sandboxPolicy 的调用填 `sandboxPolicy.resolve()`（默认
  `DSH_PERMISSION_MODE ?? 'workspace-write'`、workspaceRoot=boot cwd，`packages/shell/bash-sandbox/
  src/index.ts:84-85`、`packages/bundle/base/cordis.patch.yml` sandbox-policy 行）→ `dsh plugin add`
  写 `~/.dsh/profiles/<p>`（cwd 之外）被拒、无可用 runner 时抛 SandboxUnavailableError → 解法：
  `runShell` 显式传 `sandboxPolicy:{mode:'danger-full-access'}`（install 必传），README 注明
  danger-full-access 前提。**可复现?** 默认 profile 跑一键安装。

- **已安装态核验**：profile bundles 含 `dsh-usage-dashboard`、node_modules 软链指向插件目录
  （改名后重装生效）；`node --check` 双文件 OK；apply 冒烟 16/16 + client 渲染 5/5。


