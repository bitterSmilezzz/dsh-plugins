/**
 * dsh-ui-tweaks — host half（合并重构后的单一 bundle）。
 *
 * 从 dsh-notify + dsh-ui-tweaks 合并而来。宿主逻辑只保留一处：
 * 请求重试次数设置（/api/retry-settings 路由）——它读写 host 侧的
 * settings 服务（各 LLM 命名空间的 retryPolicy），client 拿不到，
 * 必须以宿主路由形态存在。notify / plugin-inventory / auto-hide /
 * immersive / keyboard-shortcuts 均为纯 client，host 无逻辑。
 *
 * inject：webServer（注册路由）+ settings（describe/mutate retryPolicy）。
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// 单提供方适配器：retryPolicy 在命名空间顶层，即使当前没显式配置也允许写入。
const SINGLE_PROVIDER_NAMESPACES = new Set(['llm-deepseek'])

function retryPolicyOf(profileOrSection) {
  if (!isPlainObject(profileOrSection)) return {}
  const rp = profileOrSection.retryPolicy
  return isPlainObject(rp) ? rp : {}
}

/** 收集当前所有可写 retryPolicy 的 LLM 条目，供 UI 展示。 */
function collectEntries(descriptors) {
  const entries = []
  for (const desc of descriptors) {
    const ns = desc && desc.ns
    const value = desc && desc.value
    if (typeof ns !== 'string' || !ns.startsWith('llm-') || !isPlainObject(value)) continue
    if (isPlainObject(value.providers)) {
      for (const [provider, profile] of Object.entries(value.providers)) {
        if (!isPlainObject(profile)) continue
        const rp = retryPolicyOf(profile)
        entries.push({
          ns,
          provider,
          mode: rp.mode === 'always' ? 'always' : 'normal',
          maxRetries: typeof rp.maxRetries === 'number' ? rp.maxRetries : 2,
        })
      }
    } else if (Object.prototype.hasOwnProperty.call(value, 'retryPolicy') || SINGLE_PROVIDER_NAMESPACES.has(ns)) {
      const rp = retryPolicyOf(value)
      entries.push({
        ns,
        provider: null,
        mode: rp.mode === 'always' ? 'always' : 'normal',
        maxRetries: typeof rp.maxRetries === 'number' ? rp.maxRetries : 2,
      })
    }
  }
  return entries
}

/** 为单个命名空间构造 mutate ops：把所有提供方/顶层 retryPolicy 改成 normal + maxRetries。 */
function buildOpsForNamespace(ns, value, maxRetries) {
  const ops = []
  if (isPlainObject(value.providers)) {
    for (const provider of Object.keys(value.providers)) {
      ops.push({ op: 'set', path: ['providers', provider, 'retryPolicy', 'mode'], value: 'normal' })
      ops.push({ op: 'set', path: ['providers', provider, 'retryPolicy', 'maxRetries'], value: maxRetries })
    }
  } else if (Object.prototype.hasOwnProperty.call(value, 'retryPolicy') || SINGLE_PROVIDER_NAMESPACES.has(ns)) {
    ops.push({ op: 'set', path: ['retryPolicy', 'mode'], value: 'normal' })
    ops.push({ op: 'set', path: ['retryPolicy', 'maxRetries'], value: maxRetries })
  }
  return ops
}

async function readBody(req) {
  let data = ''
  for await (const chunk of req) data += chunk
  return data
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

export const name = 'dsh-ui-tweaks'

export const inject = [
  'webServer',
  'settings',
]

export function apply(ctx, config = {}) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/retry-settings',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          const descriptors = ctx.settings.describe()
          const entries = collectEntries(descriptors)
          const maxes = entries.map((e) => e.maxRetries).filter((n) => typeof n === 'number')
          const current = maxes.length > 0 && maxes.every((n) => n === maxes[0]) ? maxes[0] : null
          const modes = entries.map((e) => e.mode)
          const mode = modes.length > 0 && modes.every((m) => m === modes[0]) ? modes[0] : null
          return sendJson(res, 200, { ok: true, entries, current, mode, defaultMaxRetries: 2 })
        }
        if (req.method === 'POST') {
          let patch
          try {
            patch = JSON.parse(await readBody(req))
          } catch {
            return sendJson(res, 400, { ok: false, reason: '请求体不是合法 JSON' })
          }
          if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
            return sendJson(res, 400, { ok: false, reason: '请求体必须是 JSON 对象' })
          }
          const maxRetries = patch.maxRetries
          if (typeof maxRetries !== 'number' || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 100) {
            return sendJson(res, 400, { ok: false, reason: 'maxRetries 必须是 0–100 的整数' })
          }
          const descriptors = ctx.settings.describe()
          const touched = []
          for (const desc of descriptors) {
            const ns = desc && desc.ns
            const value = desc && desc.value
            if (typeof ns !== 'string' || !ns.startsWith('llm-') || !isPlainObject(value)) continue
            const ops = buildOpsForNamespace(ns, value, maxRetries)
            if (ops.length === 0) continue
            await ctx.settings.mutate(ns, ops)
            touched.push(ns)
          }
          return sendJson(res, 200, { ok: true, updated: touched.length, namespaces: touched })
        }
        return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
      } catch (error) {
        return sendJson(res, 500, { ok: false, reason: String((error && error.message) || error) })
      }
    },
  }), 'dsh-ui-tweaks: retry-settings route')
}
