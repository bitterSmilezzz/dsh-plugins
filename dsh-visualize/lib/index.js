/**
 * dsh-visualize — 可视化工具 + 无损识图桥（独立 bundle）。
 *
 * 从 dsh-essentials 拆出：
 * - visualize：defineTool 注册 `visualize` 工具，模型可生成交互式 HTML 卡片
 * - vision-bridge：tools.register 注册 `vision_read_image` 工具，纯文本模型也能看图
 *
 * 两者互补（都是视觉相关），捆为单 bundle。
 */
import { apply as applyVisualize, inject as injectVisualize } from './visualize/index.js'
import { apply as applyVisionBridge, inject as injectVisionBridge } from './vision-bridge/index.js'
import { mergeConfig } from 'dsh-core'

export const name = 'dsh-visualize'

export const inject = [
  ...new Set([
    ...injectVisualize,
    ...injectVisionBridge,
  ]),
]

export function apply(ctx, config = {}) {
  const cfg = mergeConfig({}, config)
  applyVisualize(ctx, cfg.visualize ?? {})
  applyVisionBridge(ctx, cfg.visionBridge)
}
