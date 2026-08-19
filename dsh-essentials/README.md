# dsh-essentials

DSH **基础组合包**：无关场景、只要用 DSH 都需要的基础能力。

**模型选择器 + 粘贴上传 + @文件引用 + 无损省 token + 超大工具结果自动剪枝 +
Router Standard/Spec 路由预设 + 梁神模式**。

> 重功能已拆分为独立 bundle：**dsh-visualize**（可视化+识图）/ **dsh-ui-tweaks**（UI 增强 + 系统通知，含 notify）/ **dsh-memory** / **dsh-better-sidebar** / **dsh-market** / **dsh-usage-plugin**，按需安装，不再内置于 essentials。

2026-08-16 由 5 个独立插件合并而来，随后又并入 Router 预设；2026-08-18 将 visualize/vision-bridge 和 5 个 UI 开关拆回独立 bundle。

| 剩余组件 | 说明 |
|---|---|
| dsh-model-selector / dsh-paste-input / dsh-at-file | 基础输入能力 |
| Router Standard / Router Spec | 任务感知路由预设，`preset/` |
| 梁神模式 | 本地自定义预设，`preset/liangshen/` |

合并后是**单个 bundle**：一个 host entry（`lib/index.js` 组合 apply）+ 一个
client 模块（`lib/client.js` 统一 apply），共享同一 fiber。

## 安装

```bash
# 推荐：场景化安装
bash scripts/install.sh --scenario essentials

# 或低层直接装
node scripts/install-plugins.mjs -p web --only dsh-essentials
```

bundle 自带 `cordis.patch.yml`，安装后自动插入 entry（id: `essentials`）。

### 路由预设安装

`install.sh --scenario essentials|all|dev|writing|design|work` 会自动把
`preset/router-standard`、`preset/router-spec`、`preset/liangshen` 复制到
`~/.dsh/.agent-presets/`。新建会话时即可选择。

## 无损省 token（内置）

essentials 内置一组「无损省 token」配置，默认已生效：

| 配置行 | 默认值 | 效果 |
|---|---|---|
| `pwsh-sandbox` / `bash-sandbox` | `maxOutputBytes: 16384` | shell 输出内联只保留尾部，完整输出 spill 到临时文件，模型可按结果里的路径读取全文 |
| `tool-fs` | `readLimit: 500` / `readMaxBytes: 16384` | `read` 默认窗口变小，需要更多内容时用 `offset`/`limit` 分页 |
| `spill-policy` | `maxInlineBytes: 16384` | 超过上限的纯文本工具结果自动替换为 head/tail 预览 + spill 文件路径 |

这些配置不删除信息：完整内容仍可通过 spill 文件或分页读取按需取回，
因此不影响生成质量和效果。

如需调整，在 profile 的 `cordis.patch.yml` 按行 id 覆盖即可（最后写入者生效）：

```yaml
- id: spill-policy
  config:
    maxInlineBytes: 32768
```

## 配置（profile 的 cordis.patch.yml 按 id 覆盖）

```yaml
- id: essentials
  config:
    atFile: { enabled: true }
```

脱敏 settings 模板见 `config/settings.example.yaml`。

## 目录结构

```
lib/
├── index.js            # 组合 host（import 各子 apply，inject 并集）
├── client.js           # 组合 client（统一入口）
├── model-selector/  paste-input/  at-file/
preset/
├── router-standard/
└── liangshen/
```

## License

子插件各自的 LICENSE 见其历史仓库（at-file MIT、paste-input MIT）；
本组合层按 MIT 分发。
