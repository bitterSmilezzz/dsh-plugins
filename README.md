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

**在用 · 受 `manifest.json` 门禁**（数据截至 2026-08-31，dsh 0.1.2-alpha.2）：

| 插件 | 版本 | 回归测试 | 门禁 |
| --- | --- | --- | --- |
| `dsh-notify` | 0.1.5 | 9 | 20/20 |
| `dsh-model-selector` | 0.1.6 | 13 | 20/20 |
| `dsh-asr-voice` | 0.1.7（发版 tag `v0.1.7`：API key 迁 credentials + 宿主冻结数组脱冻 + 设置卡三步向导） | 36 | 20/20 |

**已退役 · 本地不再使用**（副本一律在 `doc/archives/`；无 git 历史的用 tar 含 `.git`，有历史的用 bundle）：

| 仓库 | 退役原因 | 归档 |
| --- | --- | --- |
| `dsh-ui-tweaks` | 拆分前的合并包，已被上面 4 个插件取代；本地与远端均已删除 | `dsh-ui-tweaks-2026-08-30.bundle`（48 commits + tag，实测可 clone 恢复） |
| `dsh-computer-use` | 非 git 仓库（无历史、不可固定源分发）；8 个宿主工具超 Pi 契约 | `dsh-computer-use-2026-08-31.tar.gz`（194 文件；⚠ 08-30 版整棵 `native/` 漏档，丢了 13 个手写 Swift 源，已废弃） |
| `dsh-skin-runtime` | 非 git 仓库；效果引擎与 Aqua 重复 2048 行 | `dsh-skin-runtime-2026-08-30.tar.gz` |
| `dsh-skills` | 纯技能包（非 bundle 插件，不可上架）；内容已迁至 OpenViking 技能空间 | `dsh-skills-2026-08-30.tar.gz` |
| `dsh-wallpaper-engine` | 仅 Windows；注入的 3 个官方包在 alpha.2 已消失，且 host 半区无源码不可重建 | `dsh-wallpaper-engine-2026-08-30.tar.gz` |
| `DSH-Transparent-UI-Plugin`（Aqua） | 与官方 `dsh-client-ui-theme` 正面重叠；包名违反 `@deepseek-ai/*` 命名空间契约；`tsdown.config.ts` 指向不存在的路径故不可重建 | `DSH-Transparent-UI-Plugin-2026-08-30.tar.gz` |

> **2026-08-31 收口**：上述退役仓的 **GitHub 远端已按指示全部删除**（`DSH-Transparent-UI-Plugin`、
> `dsh-wallpaper-engine`、`dsh-skills`，加上此前双删的 `dsh-ui-tweaks`），账号现只剩伞仓库 +
> 6 个在用插件。`dsh-computer-use` / `dsh-skin-runtime` 本就是非 git 目录、从未有远端。
> 退役仓的本地副本已于 2026-08-31 清空（`~/dsh-quarantine-20260830/` 701M 已删），
> **`doc/archives/` 现在是唯一副本**。归档为双形态：`.tar.gz`（工作树，排除可再生产物）
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
