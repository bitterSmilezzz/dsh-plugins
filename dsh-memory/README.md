# dsh-memory

DSH 记忆插件：自动日志 + 自动画像 + 启动摘要。

从 `dsh-essentials` 拆出的独立 bundle，按需安装；essentials 不再内置记忆功能。

## 安装

```bash
# 从本仓库直接安装（GitHub 源）
dsh plugin --profile web add github:bitterSmilezzz/dsh-memory

# 或本地源码安装
dsh plugin --profile web add ./dsh-memory
```

## 功能

- `write_memory` 工具：写入流水日志或实体画像。
- 新会话启动时注入记忆摘要（最近日志 + 画像）。
- 自动画像：识别用户/团队/产品稳定信息并更新。
- Web 侧边记忆面板 + 设置卡片。

## 配置

默认自动初始化，开箱即用；高级配置见 `lib/index.js` 中的 `DEFAULTS`（`maxEntries` / `maxPersonas` / `maxBytes` / `startupContext` / `autoMemory` / `autoIdentity`），可在 profile 的 `cordis.patch.yml` 中覆盖：

```yaml
- id: dsh-memory
  config:
    autoMemory: false
    startupContext: false
```

## License

MIT
