# DeepSeek Harness Plugins

[EN](#deepseek-harness-plugins) · 简体中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）**场景化插件汇总仓库**：
按「基础 / 开发 / 写作 / 设计 / 工作」组织场景，每个插件已拆分到**独立仓库**（本仓库作为
meta-repo：只维护清单 `plugins.json` + 安装脚本 + 文档），可单独安装，也可一键安装全部核心场景。

> Agent 与贡献者请先读 **[AGENTS.md](AGENTS.md)**（仓库约定与开发注意事项）与
> **[NOTES.md](NOTES.md)**（踩坑 / 项目经验）。`CLAUDE.md` 是 `AGENTS.md` 的软链。
> 第三方组件（fork / 收编后由本仓库维护）见 **[THIRD-PARTY.md](THIRD-PARTY.md)**。
> 插件来源清单见 **[plugins.json](plugins.json)**（来源真相：每个插件指向独立仓库）。

## 目录

> ✅ **2026-08-19 架构定型（v3）**：自研 bundle 插件原为 6 个独立仓库（memory/
> visualize/ui-tweaks/work/usage-plugin/model-fix；essentials 已并入 ui-tweaks，dsh-core 因无多消费者已内联清理删除，
> usage-plugin 同日脱钩内化改自研），
> 技能包保持 dsh-skills 合并仓，
> 第三方 fork 保持独立。
> 本仓库为纯汇总（meta-repo），只维护 `plugins.json`（来源真相）+ 安装脚本 + 文档。
> 每个插件可单独安装，也可一键安装全部核心场景。
> **2026-08-20**：`dsh-work`（agent-teams 收编版）因与官方 rc.8 内置 Agent Teams 运行时功能重复，已退役清仓；
> `dsh-model-fix`（muse-spark-1.2 流式收尾修复）同日归档（完整历史存档于伞目录 `doc/archives/dsh-model-fix-2026-08-20.bundle`）。
> **2026-08-21**：`dsh-market` 与 `dsh-usage-plugin` 卸载清仓（web profile 卸载 + GitHub 仓库删除，完整历史存档于伞目录 `doc/archives/` git bundle）；`dsh-visualize` 本地暂停使用、仓库保留待验证。

### 自研插件（独立仓库）

| 插件 | 类型 | 说明 | 仓库 |
| --- | --- | --- | --- |
| dsh-memory | bundle + client | 记忆插件（自动日志/画像/摘要） | [dsh-memory](https://github.com/bitterSmilezzz/dsh-memory) |
| dsh-visualize | bundle + client | 可视化 + 识图（visualize / vision_read_image） | [dsh-visualize](https://github.com/bitterSmilezzz/dsh-visualize) |
| dsh-ui-tweaks | bundle + client | **基础输入 + UI 增强 + 桌面通知**：模型选择、粘贴/拖拽/@引用、无损省 token、插件列表、自动隐藏、重试、沉浸、快捷键、系统通知（2026-08-19 并入原 essentials，去路由预设） | [dsh-ui-tweaks](https://github.com/bitterSmilezzz/dsh-ui-tweaks) |

### 技能合并仓库

| 仓库 | 包含子包 | 类型 | 说明 |
| --- | --- | --- | --- |
| [dsh-skills](https://github.com/bitterSmilezzz/dsh-skills) | `dsh-dev` | 纯技能包 | 开发场景（mattpocock/skills + archify） |
| | `dsh-writing` | 纯技能包 | 写作场景（39 个文章/学术写作技能） |
| | `dsh-design` | 纯技能包 | 设计场景（gpt-image + frontend-design） |

### 独立仓库（第三方 fork / 原生）

| 插件 | 类型 | 一句话 | 仓库 |
| --- | --- | --- | --- |
| [dsh-desktop-shell](https://github.com/bitterSmilezzz/dsh-desktop-shell) | bundle | 原生桌面壳（macOS Swift + Windows Tauri） | 自研独立 |
| [external](external/manifest.json) | 外部清单 | BrowserSkill + dsh-browser 等安装引导 | `external/manifest.json` |

> **架构演进（2026-08-19）**：
> - 自研插件先合并为 2 个 monorepo（dsh-plugins/dsh-skills），同日又拆回独立仓库；
>   2026-08-19 再把 dsh-essentials（去路由预设）并入 dsh-ui-tweaks，并清理删除
>   dsh-core（共享函数内联进消费方），把 bundle 拆为 6 个独立仓库
>   （memory/visualize/ui-tweaks/work/usage-plugin/model-fix），技能包仍留 dsh-skills 合并仓。
> - 原汇总仓库 `deepseek-plugins` 已删除，meta-repo 角色由本仓库（dsh-plugins）承担。
> - 第三方 fork（`dsh-market`）与 `dsh-usage-plugin` 于 **2026-08-21 卸载清仓**（完整历史存档于伞目录 `doc/archives/` git bundle；usage-plugin 曾于 2026-08-19 脱钩内化改自研）。
>   `dsh-usage-plugin` 已于 2026-08-19 **脱钩内化改自研**（不再跟上游 merge）；
>   `dsh-better-sidebar`、`DSH-Transparent-UI-Plugin`（aqua）已于 **2026-08-20** 因 GitHub 仓库删除而下架（完整历史存档于伞目录 `doc/archives/` git bundle）。
> - `dsh-mode-boost` 已删除（去芜存菁）。`dsh-agent-teams` 曾改名收编为 `dsh-work`，
>   因与官方 rc.8 内置 Agent Teams 运行时功能重复已于 2026-08-20 退役清仓。
> - `dsh-model-fix`（muse-spark-1.2 流式收尾修复）已于 **2026-08-20 归档**（完整历史存档于伞目录 `doc/archives/dsh-model-fix-2026-08-20.bundle`）。
> - `dsh-notify`（系统通知）已并入 `dsh-ui-tweaks`，代码级重构为单一 bundle。

## 社区推荐（不收编，各自维护）

以下插件非本仓库维护，但符合 Pi 理念（零 token 开销 / 副作用可逆 / 依赖干净），按需安装：

| 插件 | 一句话 | 安装 |
| --- | --- | --- |
| [dsh-plugin-wallpaper-engine-mac](https://github.com/ruijiaang-lab/dsh-wallpaper-engine) | WaifuX / Wallpaper Engine 壁纸做 DSH 背景 + iOS 液态玻璃（**零 token 注入**） | `dsh plugin --profile web add dsh-plugin-wallpaper-engine-mac` |

> ⚠️ macOS 版（ruijiaang-lab fork）扫描 WaifuX 下载目录 + `~/Documents/dsh/we-content/`，装好 WaifuX 即可零配置使用。Windows 原版见 [elysia395/dsh-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine)。
> ⚠️ CSS 与 DSH 壳 / dsh-better-sidebar 内部类名耦合，对方升级后玻璃效果可能静默失效。

## 安装

### 一键安装全部（推荐）

```sh
git clone https://github.com/bitterSmilezzz/deepseek-plugins.git
cd deepseek-plugins
bash scripts/install.sh
```

`--all`（默认）安装**全部插件**：自研 4 bundle（独立仓库）+ 3 个技能包（第三方 fork 已全部下架）。
3 个技能包。安装来源以 [plugins.json](plugins.json) 为真相：
bundle 全部从 GitHub 直装（`github:<repo>#<ref>`），技能包子包用 `&path:/<subdir>`；
纯技能包 clone 到 `~/.dsh/plugin-cache/` 后复制 skills/ 与 preset/ 到对应目录。
装完**硬刷新浏览器**（Cmd/Ctrl+Shift+R）。

### 按需安装

```sh
bash scripts/install.sh --only dsh-ui-tweaks,dsh-memory  # 只装指定 bundle
bash scripts/install.sh --only dsh-dev                     # 只装技能包（复制到 ~/.agents/skills）
bash scripts/install.sh --only dsh-ui-tweaks               # 基础输入 + UI 增强（自动带省 token 配置）
bash scripts/install.sh --external                         # 只装外部浏览器组件
bash scripts/install.sh -p headless --all                  # 指定 profile
```

`dsh` 不在 PATH 时加 `--dsh`：`bash scripts/install.sh --dsh "pnpm --dir /path/to/deepseek-harness dsh"`。

### 低层批量安装

```sh
node scripts/install-plugins.mjs -p web                        # 安装全部真 bundle
node scripts/install-plugins.mjs -p web --only dsh-ui-tweaks,dsh-memory
```

纯技能包（dsh-dev / dsh-writing / dsh-design）不走 `dsh plugin add`，由
`install.sh` clone 后复制到 `~/.agents/skills`（源码缓存于 `~/.dsh/plugin-cache/`）。

## 本地开发模式（每个插件都要改时）

每个自研插件是**独立仓库**，**clone 一份到本地，profile 用 link 指向本地**，
改完刷新 GUI 即生效，稳定后 push：

```sh
git clone https://github.com/bitterSmilezzz/dsh-ui-tweaks.git ~/workspace/dsh-ui-tweaks
cd ~/workspace/dsh-ui-tweaks && pnpm install    # 装依赖（官方 @deepseek-ai/* 包）

# 从本地 link 装（替换 github 源）
dsh plugin --profile web add ~/workspace/dsh-ui-tweaks
```

之后直接在 `~/workspace/dsh-ui-tweaks/` 改代码，浏览器硬刷新即生效；
第三方 fork 各自独立（dsh-market 已于 2026-08-21 下架），同样可 clone 到 `~/workspace/` 做 link 开发。
同样可 clone 到 `~/workspace/` 做 link 开发。

## 配置

- 脱敏 settings 模板：`config/settings.example.yaml`（无任何 key/token）。
- 外部组件清单：`external/manifest.json`。

## 如何新增一个插件

1. 自研 bundle：创建**独立仓库**（如 `dsh-xxx`）；技能：加入 `dsh-skills` 仓库（新增子包目录）。
2. 登记 `plugins.json`：`source: github` + `repo` + `ref` + `path`（技能子包）+ `type`（bundle/skills）。
3. 根 README 目录表补一行，并按 AGENTS.md 要求落档 NOTES。

## English Index

A DSH plugin **meta-repo**: self-developed bundle plugins live in standalone
repos, skills stay in the `dsh-skills` monorepo, third-party forks stay
independent (see [plugins.json](plugins.json)); this repo holds the manifest,
install scripts, and docs. All plugins install from GitHub.

- `dsh-memory`, `dsh-visualize`, `dsh-usage-plugin` — standalone repos;
  `dsh-ui-tweaks` — standalone repo (base input + UI enhancements + desktop notifications,
  merged from former essentials; `dsh-core` was inlined and removed 2026-08-19;
  `dsh-usage-plugin` decoupled from upstream and became first-party 2026-08-19;
  `dsh-work` retired 2026-08-20 — overlaps the official rc.8 Agent Teams runtime;
  `dsh-model-fix` archived 2026-08-20 — stream-termination fix for models whose
  provider never sends `finish_reason`/`[DONE]` (e.g. opencode's muse-spark-1.2), history
  preserved as a git bundle under the umbrella `doc/archives/dsh-model-fix-2026-08-20.bundle`).
- `dsh-skills` — monorepo: `dsh-dev`, `dsh-writing` (39 writing skills), `dsh-design`.
- `dsh-market` — third-party fork (independent, tracks upstream; removed 2026-08-20:
  `dsh-better-sidebar` and `DSH-Transparent-UI-Plugin`/aqua were deleted on GitHub,
  delisted here, history preserved as git bundles under the umbrella `doc/archives/`).
- `dsh-desktop-shell` — native desktop shell (macOS Swift + Windows Tauri).
- `external/` — browser/TUI install manifest.

Install all core scenarios:

```sh
bash scripts/install.sh                    # install everything
bash scripts/install.sh --only dsh-memory  # install a specific plugin
```

## License

MIT — 各子项目各有自己的 LICENSE（见各自独立仓库）。第三方组件来源与本地修改见
[THIRD-PARTY.md](THIRD-PARTY.md)。

