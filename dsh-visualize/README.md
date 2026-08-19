# dsh-visualize

可视化工具 + 无损识图桥（从 dsh-essentials 拆出的独立 bundle）。

## 包含工具

| 工具 | 说明 |
|---|---|
| `visualize` | 模型生成交互式 HTML 卡片（模拟、算法 walkthrough、图表、对比、产品 mockup） |
| `vision_read_image` | 纯文本模型也能透明看图（图片块在进入适配器前被改写为文本证据） |

## 安装

```bash
# 推荐：场景化安装
bash scripts/install.sh --scenario essentials

# 或低层直接装
node scripts/install-plugins.mjs -p web --only dsh-visualize
```

bundle 自带 `cordis.patch.yml`，安装后自动插入 entry（id: `dsh-visualize`）。

## 设计原则

- 仅 2 个 LLM 工具，符合 Pi 哲学「核心最小化」
- 两个工具互补（视觉相关），捆为单 bundle 不违反「单插件工具 ≤ 3」约束
- 零新增运行时依赖（只使用 node 内置 + 已有 dsh 服务）

## License

MIT
