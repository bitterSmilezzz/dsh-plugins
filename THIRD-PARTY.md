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
- **第三方 fork（已全部下架，不合并）**：`dsh-market` 于 2026-08-21 卸载清仓
  （`dsh-better-sidebar`、`DSH-Transparent-UI-Plugin`（aqua）已于 2026-08-20 随 GitHub 仓库删除而下架）
  已于 2026-08-20 随 GitHub 仓库删除而下架，本地同步移除，完整历史存档于伞目录 `doc/archives/`）。
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
| ~~dsh-ui-aqua~~ | WYH66666666/DSH-Transparent-UI-Plugin（267★） | MIT | ① **改名 dsh-ui-aqua**（去官方 `@deepseek-ai/` scope，0.1.0）；② **peer 升 rc.7**（上游 rc.5 → 与本机 npm dsh rc.7 对齐）；③ **补 `dsh.bundle.patch` 声明 + files 含 cordis.patch.yml**（上游源码缺声明，npm 发布产物有、源码没有，GitHub 直装时会当普通依赖）；④ tsdown 等 rc.7 兼容微调。**内容=本地在用版本**（web profile 实测运行的，2026-08-19 确认以此为准） | **已删除（2026-08-20）**：GitHub 仓库删，本地同步移除；本地在用版 `7d831d6` 完整存档 `doc/archives/DSH-Transparent-UI-Plugin-2026-08-20.bundle`，可随时恢复 |
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

