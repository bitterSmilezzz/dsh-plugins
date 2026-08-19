/**
 * dsh-vision-bridge — 单元测试 + keyless 运行时冒烟。
 *
 * 运行：node dsh-essentials/tests/vision-bridge.test.mjs
 *
 * 覆盖：
 *  - images.js 纯函数（嗅探 / 深度重写 / 引用收集）
 *  - 真实 Cordis Context + stub 服务下 apply 注册工具
 *  - agent/pre-step 把图片改写为文字（自动识图）
 *  - llm/stream 兜底改写辅助调用
 */
import { Context } from '@deepseek-ai/cordis'
import {
  IMAGE_EXTENSIONS,
  hasImageIn,
  rewriteImageBlocksDeep,
  scanImageBlocks,
  sniffMediaType,
} from '../lib/vision-bridge/lib/images.js'
import { apply, name, inject } from '../lib/vision-bridge/index.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const REF = { attachmentId: 'a1', mediaType: 'image/png', bytes: 9, width: 1, height: 1, name: 'shot.png' }
const IMG = { type: 'image', attachment: REF }

let failures = 0
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures += 1
}

console.log('== images.js 纯函数 ==')
{
  ok(sniffMediaType(PNG) === 'image/png', 'sniff PNG')
  ok(IMAGE_EXTENSIONS['.jpg'] === 'image/jpeg', 'extension map')
  ok(hasImageIn([IMG]) === true, 'hasImageIn image')
  ok(hasImageIn([{ type: 'tool-result', content: [IMG] }]) === true, 'hasImageIn nested tool-result')
  const rewritten = rewriteImageBlocksDeep([IMG], () => [{ type: 'text', text: 'x' }])
  ok(rewritten.changed && rewritten.blocks[0].type === 'text', 'rewrite image to text')
  const scan = scanImageBlocks([IMG])
  ok(scan.hasImage && scan.refs[0].attachmentId === 'a1', 'scan collects refs')
}

async function boot(config = {}) {
  const ctx = new Context()
  const tools = []
  const llmCalls = []

  const llm = {
    listProviders: async () => [{ id: 'opencode-go', name: 'OpenCode Go' }],
    listModels: async () => [{ id: 'kimi-k3', name: 'Kimi K3', inputModalities: ['text', 'image'] }],
    resolveModelInfo: async (provider, model) => ({
      provider, id: model, name: model,
      inputModalities: provider === 'opencode-go' ? ['text', 'image'] : ['text'],
    }),
    stream(options) {
      llmCalls.push(options)
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '这是一段来自视觉模型的描述' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }

  ctx.provide('llm', llm)
  ctx.provide('tools', { register(d) { tools.push(d); return () => {} } })
  ctx.provide('settings', { get: () => undefined })
  ctx.provide('credentials', { resolve: async () => undefined })
  ctx.provide('attachments', {
    saveImage: async () => REF,
    readImage: async () => ({ ref: REF, data: PNG }),
  })
  ctx.provide('fs', { resolve: async (p) => ({ displayPath: p }), readBytes: async () => PNG })

  const handle = ctx.plugin({ apply, name, inject }, config)
  await handle
  return { ctx, tools, llmCalls, handle }
}

console.log('== 真实 Cordis 注册 ==')
{
  const { tools } = await boot({})
  ok(tools.some(t => t.name === 'vision_read_image'), 'vision_read_image registered')
}

console.log('== agent/pre-step 自动识图改写 ==')
{
  const { ctx, llmCalls } = await boot({})
  const payload = {
    agent: { session: { id: 'r1', deriveMessages: () => [] } },
    messages: [{ role: 'user', content: [IMG] }],
    turn: 1,
    step: 0,
  }
  const decision = await ctx.waterfall(null, 'agent/pre-step', payload, async () => ({ messages: payload.messages }))
  ok(decision && Array.isArray(decision.messages), 'waterfall returned a decision')
  ok(decision.messages[0].content.every(b => b.type === 'text'), 'image rewritten to text')
  ok(decision.messages[0].content[0].text.includes('来自视觉模型'), 'auto-describe text used')
  ok(llmCalls.some(c => c.provider === 'opencode-go'), 'vision call went through ctx.llm')
}

console.log('== llm/stream 兜底 ==')
{
  const { ctx } = await boot({ autoDescribe: false })
  const chunks = []
  const options = {
    provider: 'deepseek-official',
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: [IMG] }],
  }
  for await (const chunk of ctx.waterfall(null, 'llm/stream', options, () => (async function* () {
    yield { type: 'text-delta', index: 0, text: 'ok' }
  })())) {
    chunks.push(chunk)
  }
  ok(chunks.some(c => c.type === 'text-delta' && c.text === 'ok'), 'stream waterfall delegates')
  // 改写发生在 options.messages 上：图片已被替换
  ok(options.messages[0].content.every(b => b.type === 'text'), 'aux stream rewrites images')
}

console.log('== 工具 execute ==')
{
  const { tools } = await boot({})
  const tool = tools.find(t => t.name === 'vision_read_image')
  const value = await tool.execute(
    { file_path: '/tmp/a.png', mode: 'describe', question: '图里是什么' },
    { signal: undefined, agent: { session: { id: 'r2', deriveMessages: () => [] } } },
  )
  ok(typeof value === 'string' && value.includes('来自视觉模型'), 'vision_read_image works')
}

console.log('== 结果 ==')
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
