import { readFileSync } from 'node:fs'

const cfg = readFileSync(process.env.HOME + '/.config/opencode/opencode.json', 'utf8')
const j = JSON.parse(cfg)
let key = null
let base = null
for (const v of Object.values(j.provider ?? {})) {
  if (v?.options?.baseURL?.includes('/zen/go/v1')) { key = v.options.apiKey; base = v.options.baseURL }
}
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC'
const TOOLS = [{
  type: 'function',
  function: {
    name: 'report',
    description: 'Report the dominant color you see.',
    parameters: { type: 'object', properties: { color: { type: 'string' } }, required: ['color'] },
  },
}]

async function call(model, messages, extra = {}) {
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 24, messages, ...extra }),
  })
  const text = await r.text()
  return { ok: r.ok, status: r.status, body: text.slice(0, 220) }
}

const models = (await (await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } })).json()).data.map((m) => m.id)
const rows = []
for (const m of models) {
  const img = [{ role: 'user', content: [{ type: 'text', text: 'One word: dominant color?' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }] }]
  const v = await call(m, img)
  const vision = v.ok ? 'yes' : /image|vision|modalit|unsupported|invalid|empty/i.test(v.body) ? `no(${v.status})` : `?${v.status}`
  let toolChoice = '-'
  if (v.ok) {
    const t = await call(m, [{ role: 'user', content: 'Call the report tool with the color red.' }], { tools: TOOLS, tool_choice: { type: 'function', function: { name: 'report' } } })
    toolChoice = t.ok ? 'required-ok' : /tool_choice/.test(t.body) ? 'required-BLOCKED' : `?${t.status}`
  }
  rows.push(`${m}\tvision=${vision}\ttool_choice=${toolChoice}`)
  console.log(rows[rows.length - 1])
}
console.log(rows.join('\n'))
