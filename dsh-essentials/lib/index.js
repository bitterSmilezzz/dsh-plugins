/**
 * dsh-essentials — host half (merged bundle).
 *
 * 组合包：模型选择器（model-selector）+ 粘贴上传（paste-input）
 * + @文件引用（at-file）。
 *
 * 本文件只做「组合」：把各子插件的 apply 依次挂到同一个 fiber 的 ctx 上，
 * 子模块各自的 ctx.on / ctx.effect / ctx.inject 注册都随本 entry 一起回收。
 * inject 取各子模块的并集（at-file 依赖 settings/typert/agents），
 * 保证 apply 执行时所有硬依赖服务已就绪。
 *
 * 注意：inject 项是 Cordis 服务名（非 entry id）。dsh-agent 提供的服务是
 * `agents`；`ctx.agent` 只是恒为 undefined 的 DX accessor，不能作为依赖。
 *
 * 可选 config（profile patch entry 传入）：
 *   { atFile: {...} }
 * 与各子插件原 patch config 字段一一对应。
 *
 * 已拆出为独立 bundle：
 * - visualize + vision-bridge → dsh-visualize
 * - auto-hide + immersive + shortcuts + retry + plugin-inventory → dsh-ui-tweaks
 */
import { apply as applyModelSelector } from './model-selector/index.js'
import { apply as applyPasteInput } from './paste-input/index.js'
import { apply as applyAtFile } from './at-file/index.js'
import ToolResultPruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import { mergeConfig } from 'dsh-core'

export const name = 'dsh-essentials'

export const inject = [
  // paste-input
  'fs', 'webServer', 'loader', 'sessions',
  // at-file
  'settings', 'typert',
]

export function apply(ctx, config = {}) {
  const cfg = mergeConfig({}, config)
  // 启用官方工具结果剪枝：压缩/上下文溢出时把超大 tool/result 改写成有界
  // head + marker + tail，避免"单条超大工具结果"导致压缩后仍 400
  // CONTEXT_WINDOW_EXCEEDED。
  ctx.plugin(ToolResultPruner, cfg.toolResultPruner)
  applyModelSelector(ctx)
  applyPasteInput(ctx)
  applyAtFile(ctx, cfg.atFile)
}
