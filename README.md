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

## 脚本

| 脚本 | 用途 |
| --- | --- |
| `validate-plugin.mjs` | 按契约静态校验插件仓库（核心） |
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
