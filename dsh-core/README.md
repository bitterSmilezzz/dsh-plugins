# dsh-core

DSH 场景化插件仓库的**共享工具包**（非独立 DSH bundle）。

职责：为 `dsh-essentials`、`dsh-work` 等真 bundle 以及安装器提供无依赖的纯 JS
工具——配置合并、数组去重、内容哈希、settings 脱敏等，避免各场景包重复代码。

## 使用

```js
import { mergeConfig, hashString, sanitizeSettings } from 'dsh-core'
```

## 安装

本包随仓库分发，不单独发布 npm；场景 bundle 通过 pnpm workspace 引用。
