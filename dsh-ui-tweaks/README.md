# dsh-ui-tweaks

界面增强 + 桌面通知的单一 bundle（由 `dsh-notify` + `dsh-ui-tweaks` 合并重构而来）。

## 包含功能

| 功能 | 说明 |
|---|---|
| plugin-inventory | 插件列表增强（全部/内置/自定义分类 tab + 搜索） |
| auto-hide-composer | 输入框自动隐藏（贴近恢复，延迟/阈值可调） |
| retry-settings | 请求重试次数设置（host `/api/retry-settings` 路由） |
| immersive-mode | 沉浸模式（隐藏侧栏/详情/会话头，右下角悬浮按钮） |
| keyboard-shortcuts | 全局快捷键（帮助/沉浸/自动隐藏/聚焦/导航） |
| notify | 桌面通知（审批/提问/轮次/后台会话完成，四类事件可分别开关） |

## 设置

所有功能的开关与选项统一放在 **「设置 → 通用设置 → 界面增强」** 总入口下，内部分组展示。
配置统一存于浏览器 localStorage 单 key（`dsh-ui-tweaks.settings`）。

## 设计

- 单 bundle 工具数 = 0（纯 client + 1 个 webServer 路由），不注册 LLM 工具，不增加模型 context 开销
- 统一 locale 命名空间（`ui-tweaks`）+ 统一配置对象
- 三个同构开关（auto-hide/immersive/shortcuts）复用统一 ToggleRow
- notify 作为事件驱动的独立子模块（sessions 监听 + 去重状态机）
- 所有副作用挂在同一 fiber，插件卸载全部回收

## 安装

```bash
# 推荐：场景化安装
bash scripts/install.sh --scenario essentials

# 或低层直接装
node scripts/install-plugins.mjs -p web --only dsh-ui-tweaks
```

bundle 自带 `cordis.patch.yml`，安装后自动插入 entry（id: `dsh-ui-tweaks`）。

## License

MIT
