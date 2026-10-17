# DeepSeek Harness Plugins

[EN](#deepseek-harness-plugins) · 简体中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件的**伞仓库**：
所有新增插件的共同遵循仓库，承载插件契约并承担新插件的校验与测试。插件本体为独立仓库，
各自安装；本仓库维护契约、校验脚本与经验档案。

> - **契约（强制）**：见 [AGENTS.md](AGENTS.md)（`CLAUDE.md` 是其软链）——Pi 契约约束、
>   DSH 官方规则契约、新插件校验与测试契约、DSH-Store 准入契约、dsh-std 协议契约。
> - **经验档案**：见 [doc/experience/](doc/experience/)（按主题分类的踩坑/修复/治理记录）。
> - **校验脚本**：`scripts/validate-plugin.mjs` —— 按契约对插件仓库逐条静态检查。

## 校验

新插件登记发布前，须在本仓库通过校验（契约见 AGENTS.md「新插件校验与测试契约」）：

```sh
node scripts/validate-plugin.mjs ../dsh-xxx     # 校验某个插件仓库（默认输出报告）
node scripts/validate-plugin.mjs ../dsh-xxx --json   # JSON 输出（CI 用）
```

GitHub Actions（`.github/workflows/validate-plugins.yml`）每 8 小时 + push 清单时自动校验
`scripts/manifest.json` 中的全部插件，失败自动开 Issue。新增插件：在 `scripts/manifest.json`
加一行即自动纳入。

## 账号下仓库登记

**在用 · 受 `manifest.json` 门禁**（各行数据为该插件最近一次登记时点：dsh-notify 2026-09-16 / dsh-model-selector 2026-10-17；门禁项数随校验脚本增长，旧行未回填）：

| 插件 | 版本 | 回归测试 | 门禁 |
| --- | --- | --- | --- |
| `@bittersmilezzz/dsh-notify` | 0.1.14（tag `v0.1.14`：设置卡片残留自绘开关对齐官方 `Switch`；依赖线 `^0.1.6-alpha.1`） | 58 | 20/20 |
| `@bittersmilezzz/dsh-model-selector` | 0.3.9（tag `v0.3.9`：适配 DSH 0.2.1-rc.2；菜单摆位改用官方 `useAnchoredPosition`（`align: 'end'`）；`conversation.input.model.label` 子座位实测不可采纳，已回滚为已知限制并加反向契约测试） | 121 | 22/22 |

**已退役 · 本地不再使用**（归档按 `doc/archives/` 命名；无 git 历史的用 tar 打包工作树，有历史的用 bundle。⚠ 2026-10-17 之前的归档文件已丢失，表中文件名仅作历史记录）：

| 仓库 | 退役原因 | 归档 |
| --- | --- | --- |
| `dsh-asr-voice`（`@bittersmilezzz/dsh-asr-voice`） | **2026-10-17 退役**：用户决定完整退役（最终版 0.4.7 / tag `v0.4.7`，153 commits、37 tags；GitHub 远端已归档 archived、本地已删除、web profile 已解绑） | `dsh-asr-voice-2026-10-17.bundle`（完整历史 + 37 tags + `main`/`dev`，3.0M，实测 clone-back 153 commits 通过）+ `dsh-asr-voice-2026-10-17.tar.gz`（工作树含 `.git`，6.3M，解包 `diff -r` 0 差异） |
| `dsh-antigravity-tool`（`@local/dsh-antigravity-tool`） | **2026-10-17 退役**：用户决定归档（本地私有插件，非 git 仓库、无 GitHub 远端、未发布 npm；web profile 已解绑、本地目录已删除） | `dsh-antigravity-tool-2026-10-17.tar.gz`（工作树 4 文件，8.3K，解包 `diff -r` 0 差异） |
| `dsh-codex-bypass`（`@local/dsh-codex-bypass`） | **2026-10-17 退役**：用户决定归档（本地私有插件，非 git 仓库、无 GitHub 远端、未发布 npm；web profile 已解绑、本地目录已删除） | `dsh-codex-bypass-2026-10-17.tar.gz`（工作树 2 文件，1.2K，解包 `diff -r` 0 差异） |
| `dsh-ui-tweaks` | 拆分前的合并包，已被上面 4 个插件取代；本地与远端均已删除 | `dsh-ui-tweaks-2026-08-30.bundle`（48 commits + tag，实测可 clone 恢复） |
| `dsh-computer-use`（自有版 `@bittersmilezzz/dsh-computer-use`） | **2026-09-15 退役**：官方 `@deepseek-ai/dsh-computer-use` + `dsh-experimental-computer-use-cua-driver-native` 已发布并**实测可用**（headless 下真实调用 `cua_driver_native__check_permissions` 通过，驱动 55 个工具）；自研版与官方同名 `ctx.computerUse` 服务互斥，web profile 已切换到官方方案；远端已归档（archived）、本地已删除 | `dsh-computer-use-2026-09-15.bundle`（完整历史 + tag，`git bundle verify` 通过，3.5M） |
| ~~`dsh-computer-use`~~ | ~~非 git 仓库（无历史、不可固定源分发）；8 个宿主工具超 Pi 契约~~ **已于 2026-09-10 复活为自有 git 仓库**（脱离上游 fork，包名 `@bittersmilezzz/dsh-computer-use`，`0.4.1` 于 2026-09-14 发布，见上表） | `dsh-computer-use-2026-08-31.tar.gz`（旧非 git 版归档，仅历史留档） |
| `dsh-skin-runtime` | 非 git 仓库；效果引擎与 Aqua 重复 2048 行 | `dsh-skin-runtime-2026-08-30.tar.gz` |
| `dsh-skills` | 纯技能包（非 bundle 插件，不可上架）；内容已迁至 OpenViking 技能空间 | `dsh-skills-2026-08-30.tar.gz` |
| `dsh-wallpaper-engine` | 仅 Windows；注入的 3 个官方包在 alpha.2 已消失，且 host 半区无源码不可重建 | `dsh-wallpaper-engine-2026-08-30.tar.gz` |
| `DSH-Transparent-UI-Plugin`（Aqua） | 与官方 `dsh-client-ui-theme` 正面重叠；包名违反 `@deepseek-ai/*` 命名空间契约；`tsdown.config.ts` 指向不存在的路径故不可重建 | `DSH-Transparent-UI-Plugin-2026-08-30.tar.gz` |

> **2026-08-31 收口**：上述退役仓的 **GitHub 远端已按指示全部删除**（`DSH-Transparent-UI-Plugin`、
> `dsh-wallpaper-engine`、`dsh-skills`，加上此前双删的 `dsh-ui-tweaks`），账号当时只剩伞仓库 +
> 6 个在用插件（2026-10-17 `dsh-asr-voice` 归档后，受 `manifest.json` 门禁的在用插件为 2 个）。
> `dsh-computer-use` / `dsh-skin-runtime` 本就是非 git 目录、从未有远端。
> 退役仓的本地副本已于 2026-08-31 清空（`~/dsh-quarantine-20260830/` 701M 已删），
> **`doc/archives/` 当时是唯一副本**（该目录此后丢失，见下方 2026-10-17 更正）。归档为双形态：`.tar.gz`（工作树，排除可再生产物）
> + `.bundle`（单文件全历史）。删除前的核验口径：tar 用「解包 + `diff -r`」比对到 0 行差异，
> bundle 必须在临时 git 仓内 `git bundle verify`（在非 git 目录跑会假报 `need a repository`），
> 并对最大的一份做真实 clone-back 计数比对。
>
> ⚑ **删除远端前的强制核验**（本轮实测教训）：`dsh-wallpaper-engine` 本地是 `--depth 5`
> **浅克隆**，只有 9 个 commit，而远端有 **85 个 commit + 4 个分支**（`main`/`mac`/
> `scene-support`/`fix/npm-name-waifux-darkmode`）——直接删远端就会永久丢掉 76 个 commit。
> 更要命的是浅克隆上 `git bundle --all` 会产出**父提交缺失、无法 clone 的残缺 bundle**
> （`Failed to traverse parents of commit …`），文件照样生成、看着像成功。所以删之前必须：
> ① `git rev-parse --is-shallow-repository` 为真 → 先 `--unshallow` 或重新全量 clone；
> ② 把 `refs/remotes/origin/*` 转成**本地分支**（clone 不会把源仓的 remote-tracking ref 再导出，
> 否则 bundle 回 clone 只剩 `main`）；
> ③ 用 bundle **实际 clone 回来**比对 commit 数与分支数，而不是只看 `bundle verify` 或文件大小。

> **2026-10-17 完整退役批次**：`dsh-asr-voice` 的 GitHub 远端已 `archived`（`gh repo view --json isArchived` → `true`）、
> 本地仓库已删除；同批归档两个本地私有插件 `dsh-antigravity-tool` / `dsh-codex-bypass`（非 git 仓库、
> 无远端、未发布 npm）并删除本地目录。web profile 中三者的 `dependencies`、`dsh.profile.bundles`、
> `pnpm-lock.yaml` 与 `node_modules` 链接均已清除，其余插件不受影响。
> **npm 已收口（2026-10-17 20:29）**：`@bittersmilezzz/dsh-asr-voice` 已执行 `npm deprecate`
> （registry `deprecated` 字段已生效）；`@bittersmilezzz/dsh-model-selector@0.3.9` 已发布并成为 `latest`。
> 过程记录：首次 publish 因 token 失效报 E401/E404，`npm login` 后走 2FA web auth 才成功（registry 处理延迟约 2 分钟）。
> **`doc/archives/` 更正**：该目录此前已丢失（历史归档未找回，2026-08-31 叙述中的「唯一副本」已不成立），
> 2026-10-17 重建；当前含 `dsh-asr-voice-2026-10-17.bundle`、`dsh-asr-voice-2026-10-17.tar.gz`、
> `dsh-antigravity-tool-2026-10-17.tar.gz`、`dsh-codex-bypass-2026-10-17.tar.gz` 四份，
> 上表 2026-10-17 之前的归档文件均不存在。

## 脚本

| 脚本 | 用途 |
| --- | --- |
| `validate-plugin.mjs` | 按契约静态校验插件仓库（核心，20 项） |
| `validate-all.mjs` | 校验 `manifest.json` 全部插件（clone 发布态：契约 20 项 + 产物完整性） |
| `check-artifact-imports.mjs` | 固定源产物自洽：`lib/**/*.js` 的相对 import 必须能在仓库里解析到（堵 `git add -u` 漏收新产物导致的装到空壳/起不来） |
| `apply-settings.mjs` | 安全合并设置模板到 `~/.dsh/settings.yaml` |
| `install-external.mjs` | 外部组件安装引导（读 `external/manifest.json`） |
| `measure-load.mjs` / `measure-memory.mjs` / `web-regression.mjs` | 浏览器加载/内存/回归测量 |

## 本地开发

插件仓库 clone 到伞目录，profile 用 link 指向本地，改完硬刷新即生效，稳定后 push
（详见各插件仓库 README）。

## English Index

A DSH plugin **umbrella repo**: holds the plugin contracts (see
[AGENTS.md](AGENTS.md)) and validates your own plugins against them
(`scripts/validate-plugin.mjs`, automated by GitHub Actions). Plugins live in
standalone repos and install independently; experience notes are categorized
under [doc/experience/](doc/experience/).

## License

MIT — 各子项目各有自己的 LICENSE（见各自独立仓库）。
