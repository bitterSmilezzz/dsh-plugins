/**
 * dsh-memory —— 服务端部分（跑在 dsh 的 Node 进程里）。
 *
 * 本插件分两个文件运行：这里是服务端，负责读数据；lib/client.js 是浏览器部分，负责界面。
 * - 通过官方 `fs` 服务读取日志库（.journal/memory 最近日志 + .journal/identity 画像）
 * - 通过 `webServer` 服务注册数据接口 GET /api/memory，返回 JSON 给网页
 * - 会话启动时注入记忆摘要快照（最近日志 + 画像的 summary）
 * - 书写能力走「谨迹秘书」Agent 预设：用户在设置卡片里一键安装，
 *   新建会话时选用它，该会话才会携带书写规范（见 ADR-0012）
 * - 配置：cordis config（patch yml）打底，`.memory.json` 覆盖，
 *   由「设置 → 插件配置」里的卡片读写（保存即生效，新会话采用新值）；
 *   保存走「读-改-写」——以磁盘现文件为基底只覆盖本次提交的字段，
 *   两个 DSH 会话并行保存也不会把对方刚写的字段打回旧值
 * - index 结果带条目级缓存：按 mtime/size（或 fs 服务的 version 令牌）指纹
 *   判断文件是否变更，未变更直接复用解析结果，面板重开不再全量重读
 * - 路径防护：只允许读 .journal/ 之内的文件，拒绝 `..` 与越界
 * - 日志库根目录的查找顺序：配置 config.root > 环境变量 DSH_JINJI_ROOT > dsh 启动目录
 * - 不依赖任何第三方包，不需要编译
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_ROOT = process.env.DSH_JINJI_ROOT || process.cwd()

export const name = 'memory'
export const inject = ['fs', 'webServer', 'tools']

// ── 配置 ────────────────────────────────────────────────────────────────
// 生效优先级：配置文件（<root>/.memory.json，设置卡片写它）
//   > cordis config（profile 的 cordis.patch.yml）> 内置默认。
// root 例外：只在 cordis config / 环境变量里配（配置文件自己就放在 root 下）。
const CONFIG_FILE = '.memory.json'

const DEFAULTS = {
  maxEntries: 20, // 启动摘要里带多少条最近日志（1–200）
  maxPersonas: 30, // 启动摘要里带多少条画像（1–500）
  maxBytes: 60000, // 摘要文本字节软上限（4096–500000）
  startupContext: true, // 是否注入启动摘要
  autoMemory: true, // 是否自动记忆（全局工具+提示+兜底，不依赖预设）
  autoIdentity: true, // 是否自动识别并更新实体画像（名字/职业/偏好/项目等）
}

const CONFIG_RULES = {
  maxEntries: { kind: 'int', min: 1, max: 200 },
  maxPersonas: { kind: 'int', min: 1, max: 500 },
  maxBytes: { kind: 'int', min: 4096, max: 500000 },
  startupContext: { kind: 'bool' },
  autoMemory: { kind: 'bool' },
  autoIdentity: { kind: 'bool' },
}

/** 校验单个字段；合法返回 undefined，非法返回错误消息。 */
function configError(field, value) {
  const rule = CONFIG_RULES[field]
  if (rule === undefined) return '未知字段 ' + field
  if (rule.kind === 'int') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < rule.min || value > rule.max) {
      return field + ' 必须是 ' + rule.min + '–' + rule.max + ' 的整数'
    }
    return undefined
  }
  if (rule.kind === 'bool') return typeof value === 'boolean' ? undefined : field + ' 必须是布尔值'
  if (typeof value !== 'string') return field + ' 必须是字符串'
  if (value.length > rule.max) return field + ' 超过 ' + rule.max + ' 字符上限'
  return undefined
}

/** 把一份来源（cordis config 或配置文件 JSON）里合法的字段并入 target；非法字段静默忽略。 */
function mergeConfig(target, source) {
  if (source === null || typeof source !== 'object') return
  for (const field of Object.keys(CONFIG_RULES)) {
    if (source[field] !== undefined && configError(field, source[field]) === undefined) target[field] = source[field]
  }
}

/** 读取 <root>/.memory.json 的原始 JSON 对象；文件不存在/损坏/非对象时返回 null。 */
async function readConfigFile(fs, root) {
  try {
    const target = await fs.resolve(root + '/' + CONFIG_FILE)
    const st = await fs.stat(target)
    if (st === undefined || st.type !== 'file') return null
    const parsed = JSON.parse(await fs.readText(target))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** 按「默认 ← cordis config ← 配置文件」把 fileBody 刷新进 runtimeConfig（保持对象身份，提供器热读的就是它）。 */
function rebuildRuntimeConfig(runtimeConfig, configSource, fileBody) {
  const fresh = { ...DEFAULTS }
  mergeConfig(fresh, configSource)
  mergeConfig(fresh, fileBody)
  for (const field of Object.keys(CONFIG_RULES)) runtimeConfig[field] = fresh[field]
}

/** 启动时读取配置文件并刷新 runtimeConfig；文件不存在/损坏时保持现状。 */
async function loadConfigFile(fs, root, runtimeConfig, configSource) {
  const raw = await readConfigFile(fs, root)
  if (raw !== null) rebuildRuntimeConfig(runtimeConfig, configSource, raw)
}

/** 把配置对象写回配置文件（原子写，走 fs 服务）。 */
async function saveConfigFile(fs, root, body) {
  const target = await fs.resolve(root + '/' + CONFIG_FILE)
  await fs.writeText(target, JSON.stringify(body, null, 2) + '\n')
}

async function readBody(req) {
  let data = ''
  for await (const chunk of req) data += chunk
  return data
}

function listOf(val) {
  if (typeof val !== 'string') return []
  const trimmed = val.trim()
  const m = /^\[(.*)\]$/.exec(trimmed)
  const inner = m ? m[1] : trimmed
  return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

function parseFrontmatter(text, fallbackTitle) {
  let body = text
  let summary = ''
  let tags = []
  let sources = []
  const m = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(text)
  if (m) {
    body = text.slice(m[0].length)
    for (const line of m[1].split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 1) continue
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) val = val.slice(1, -1)
      if (key === 'summary' && val) summary = val
      if (key === 'tags') tags = listOf(val)
      if (key === 'sources') sources = listOf(val)
    }
  }
  const h1 = /^#\s+(.+?)\s*$/m.exec(body)
  return { title: h1 ? h1[1].trim() : fallbackTitle, summary, tags, sources }
}

async function listJournals(fs, root, max) {
  const mem = await fs.resolve(root + '/.journal/memory')
  const memStat = await fs.stat(mem)
  if (memStat === undefined || memStat.type !== 'directory') return []
  const entries = await fs.listDir(mem)
  const out = []
  for (const ym of entries
    .filter((e) => e.type === 'directory' && /^\d{4}$/.test(e.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1))) {
    // 目录按 YYMM 降序、目录内按 `DD-标题.md` 降序 → 全局最新优先；
    // 收集够 max 即可停止，无需 listDir 更旧的月份目录（调用方本就只取前 N 条）
    if (max !== undefined && out.length >= max) break
    const files = (await fs.listDir(ym.target))
      .filter((e) => e.type === 'file' && e.name.endsWith('.md'))
      .sort((a, b) => (a.name < b.name ? 1 : -1))
    for (const f of files) {
      if (max !== undefined && out.length >= max) break
      out.push({ rel: '.journal/memory/' + ym.name + '/' + f.name, ym: ym.name, name: f.name, target: f.target })
    }
  }
  return out
}

async function listPersonas(fs, ident) {
  const entries = await fs.listDir(ident)
  const out = []
  const readme = entries.find((e) => e.name === 'README.md' && e.type === 'file')
  if (readme) out.push({ name: 'README.md', kind: 'user', region: '本人', target: readme.target })
  for (const e of entries
    .filter((e) => e.type === 'file' && e.name.startsWith('product-') && e.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    out.push({ name: e.name, kind: 'product', region: '产品', target: e.target })
  }
  for (const e of entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && e.name !== 'README.md' && !e.name.startsWith('product-'))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const stem = e.name.replace(/\.md$/, '')
    const dash = stem.indexOf('-')
    out.push({ name: e.name, kind: 'person', region: dash > 0 ? stem.slice(0, dash) : '其他', target: e.target })
  }
  return out
}

async function readDoc(fs, root, rel) {
  if (typeof rel !== 'string' || !rel.startsWith('.journal/')) throw new Error('invalid path')
  const parts = rel.split('/')
  if (parts.some((p) => p === '..' || p === '')) throw new Error('invalid path')
  const file = await fs.resolve(root + '/' + rel)
  const journal = await fs.resolve(root + '/.journal')
  if (!fs.contains(journal, file)) throw new Error('outside journal root')
  return fs.readText(file)
}

// ── index 条目缓存 ────────────────────────────────────────────────────────
// fs.stat 的返回形态见 @deepseek-ai/dsh-fs 的 FsInfo：{ version, type, size? }，
// 没有 mtimeMs。version 是后端签发的「新鲜度令牌」字符串（本地后端由
// dev:ino:size:mtimeNs:ctimeNs 组成），两次 stat 的 version 等值即官方语义
// 的未变更检查。为兼容带 mtimeMs 的 Node 风格 stat（测试 mock 等），指纹取两种形态：
//   1) mtimeMs + size 都是数字；
//   2) version 是非空字符串（真实 fs 服务）。
// 两者都取不到 → 无指纹，调用方跳过缓存照常读（正确性优先，宁可慢不可陈旧）。

/** 从 stat 结果提取缓存指纹；无可用指纹时返回 undefined。 */
function statFingerprint(st) {
  if (st === null || typeof st !== 'object') return undefined
  const mtimeMs = typeof st.mtimeMs === 'number' ? st.mtimeMs : undefined
  const size = typeof st.size === 'number' ? st.size : undefined
  const version = typeof st.version === 'string' && st.version ? st.version : undefined
  if (version === undefined && (mtimeMs === undefined || size === undefined)) return undefined
  return { mtimeMs, size, version }
}

/** 两枚指纹是否指向同一份未变更的内容。 */
function sameFingerprint(a, b) {
  return a.mtimeMs === b.mtimeMs && a.size === b.size && a.version === b.version
}

/** 把 fs 服务解析出的 target 转成稳定字符串，作为缓存 key（「解析后路径」）。 */
function targetKeyOf(target) {
  if (target === null || typeof target !== 'object') return String(target)
  if (typeof target.targetKey === 'string') return target.targetKey
  if (typeof target.key === 'string') return target.key
  if (typeof target.displayPath === 'string') return target.displayPath
  try {
    return JSON.stringify(target)
  } catch {
    return String(target)
  }
}

/**
 * 读取并解析一个条目，带指纹缓存：stat 指纹与缓存一致 → 复用缓存 entry；
 * 指纹取不到或已变化 → 重新 readText 解析并更新缓存。
 * read（读全文）不走这里，始终现读。
 */
async function readCachedEntry(fs, cache, target, parse) {
  let fingerprint = undefined
  try {
    fingerprint = statFingerprint(await fs.stat(target))
  } catch {
    fingerprint = undefined // stat 报错时不冒险用缓存，照常读，失败交给外层容错
  }
  const key = targetKeyOf(target)
  if (fingerprint === undefined) {
    cache.delete(key) // 无指纹就不留旧值，避免后续误命中
  } else {
    const hit = cache.get(key)
    if (hit !== undefined && sameFingerprint(hit, fingerprint)) return hit.entry
  }
  const entry = await parse()
  if (fingerprint !== undefined) cache.set(key, { ...fingerprint, entry })
  return entry
}

async function buildIndex(fs, root, entryCache) {
  const journalRes = await fs.resolve(root + '/.journal')
  const jStat = await fs.stat(journalRes)
  if (jStat === undefined || jStat.type !== 'directory') {
    return { ok: false, reason: 'no-journal', root }
  }
  const journals = []
  for (const item of (await listJournals(fs, root, 120)).slice(0, 120)) {
    try {
      journals.push(await readCachedEntry(fs, entryCache, item.target, async () => {
        const text = await fs.readText(item.target)
        const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
        const dayMatch = /^(\d+)-/.exec(item.name)
        return {
          rel: item.rel,
          ym: item.ym,
          day: dayMatch ? parseInt(dayMatch[1], 10) : 0,
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags,
          sources: parsed.sources,
        }
      }))
    } catch {
      /* skip unreadable */
    }
  }
  const personas = []
  const ident = await fs.resolve(root + '/.journal/identity')
  const iStat = await fs.stat(ident)
  if (iStat !== undefined && iStat.type === 'directory') {
    for (const item of await listPersonas(fs, ident)) {
      try {
        personas.push(await readCachedEntry(fs, entryCache, item.target, async () => {
          const text = await fs.readText(item.target)
          const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
          return {
            rel: '.journal/identity/' + item.name,
            kind: item.kind,
            region: item.region,
            title: parsed.title,
            summary: parsed.summary,
            tags: parsed.tags,
          }
        }))
      } catch {
        /* skip unreadable */
      }
    }
  }
  return { ok: true, root, journals, personas }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/**
 * 组装「记忆摘要」快照文本（启动时注入用，见 docs/architecture.md 2.5）。
 * 通过 entryCache 读取，避免重复 I/O（buildIndex 已缓存过的条目直接复用）。
 */
async function composeSummary(fs, root, opts, entryCache) {
  const { maxEntries, maxPersonas, maxBytes } = opts
  const journalRes = await fs.resolve(root + '/.journal')
  const jStat = await fs.stat(journalRes)
  if (jStat === undefined || jStat.type !== 'directory') return ''
  const out = []
  const journals = (await listJournals(fs, root, maxEntries)).slice(0, maxEntries)
  if (journals.length > 0) {
    out.push(`# 最近 ${journals.length} 条日志`)
    for (const item of journals) {
      try {
        const entry = await readCachedEntry(fs, entryCache, item.target, async () => {
          const text = await fs.readText(item.target)
          const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
          const dayMatch = /^(\d+)-/.exec(item.name)
          return { rel: item.rel, ym: item.ym, day: dayMatch ? parseInt(dayMatch[1], 10) : 0, title: parsed.title, summary: parsed.summary, tags: parsed.tags, sources: parsed.sources }
        })
        out.push(`## ${entry.title}`)
        out.push(`\`${entry.rel}\``)
        if (entry.summary) out.push(entry.summary)
        out.push('')
      } catch { /* skip unreadable */ }
    }
  }
  const ident = await fs.resolve(root + '/.journal/identity')
  const iStat = await fs.stat(ident)
  if (iStat !== undefined && iStat.type === 'directory') {
    const personas = await listPersonas(fs, ident)
    if (personas.length > 0) {
      const counts = { user: 0, product: 0, person: 0 }
      const label = { user: '用户', product: '产品', person: '人物' }
      for (const p of personas) counts[p.kind] = (counts[p.kind] || 0) + 1
      const shown = personas.slice(0, maxPersonas)
      const truncated = shown.length < personas.length ? `（仅列出前 ${shown.length} 条）` : ''
      out.push(`# 画像档案（${counts.user} 用户 / ${counts.product} 产品 / ${counts.person} 人物）${truncated}`)
      for (const item of shown) {
        try {
          const entry = await readCachedEntry(fs, entryCache, item.target, async () => {
            const text = await fs.readText(item.target)
            const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
            return { rel: '.journal/identity/' + item.name, kind: item.kind, region: item.region, title: parsed.title, summary: parsed.summary, tags: parsed.tags }
          })
          out.push(`## [${label[entry.kind]}] ${entry.title}`)
          out.push(`\`.journal/identity/${item.name}\``)
          if (entry.summary) out.push(entry.summary)
          out.push('')
        } catch { /* skip unreadable */ }
      }
    }
  }
  let text = out.join('\n')
  const bytes = new TextEncoder().encode(text)
  if (bytes.length > maxBytes) {
    text = new TextDecoder().decode(bytes.slice(0, maxBytes))
    text += `\n\n…（输出已超过 ${maxBytes} 字节软上限被截断；请按需读取完整档案。）`
  }
  return text
}

// ── 自动记忆助手 ──────────────────────────────────────────────────────────
// 以下函数用于「与预设无关的自动记忆」：write_memory 工具 + turn-stopping 兜底。

function pad2(n) { return n < 10 ? '0' + n : String(n) }

// 缓存已确认存在的目录，避免重复 mkdirSync（recursive 即使目录已存在也有系统调用开销）
const ensuredDirs = new Set()

function ensureJournalDir(root) {
  const now = new Date()
  const yymm = String(now.getFullYear()).slice(2) + pad2(now.getMonth() + 1)
  const dir = join(root, '.journal', 'memory', yymm)
  if (!ensuredDirs.has(dir)) { mkdirSync(dir, { recursive: true }); ensuredDirs.add(dir) }
  return { yymm, dir }
}

function ensureIdentityDir(root) {
  const dir = join(root, '.journal', 'identity')
  if (!ensuredDirs.has(dir)) { mkdirSync(dir, { recursive: true }); ensuredDirs.add(dir) }
  return dir
}

function sanitizeSlug(title) {
  return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'untitled'
}

function writeJournalEntry(root, title, content, summary, tags) {
  const { yymm, dir } = ensureJournalDir(root)
  const now = new Date()
  const dd = pad2(now.getDate())
  const slug = sanitizeSlug(title)
  const filename = dd + '-' + slug + '.md'
  const filepath = join(dir, filename)
  const dateStr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + dd
  const tagLine = tags && tags.length ? 'tags: [' + tags.join(', ') + ']' : 'tags: []'
  const frontmatter = '---\ntitle: ' + title + '\ndate: ' + dateStr + '\nsummary: ' + (summary || '') + '\n' + tagLine + '\n---\n\n' + content + '\n'
  writeFileSync(filepath, frontmatter, 'utf8')
  return { rel: '.journal/memory/' + yymm + '/' + filename, path: filepath }
}

function writeIdentityEntry(root, name, content, summary, region, tags) {
  const dir = ensureIdentityDir(root)
  const prefix = region ? region.replace(/\s+/g, '-') + '-' : ''
  const filename = prefix + sanitizeSlug(name) + '.md'
  const filepath = join(dir, filename)
  const dateStr = new Date().toISOString().slice(0, 10)
  const tagLine = tags && tags.length ? 'tags: [' + tags.join(', ') + ']' : 'tags: []'
  const frontmatter = '---\ntitle: ' + name + '\ndate: ' + dateStr + '\nsummary: ' + (summary || '') + '\n' + tagLine + '\n---\n\n' + content + '\n'
  writeFileSync(filepath, frontmatter, 'utf8')
  return { rel: '.journal/identity/' + filename, path: filepath }
}

const TRIVIAL_PATTERNS = [/^(好的|好|嗯|嗯嗯|哦|哦哦|行|可以|对|是|不是|没有|谢谢|感谢|知道了|明白|收到|ok|okay|yes|no|yep|nope|sure|thanks|thx|ty)$/i, /^.{0,3}$/]

function isTrivial(text) {
  if (!text || typeof text !== 'string') return true
  const t = text.trim()
  if (t.length <= 3) return true
  for (const pat of TRIVIAL_PATTERNS) { if (pat.test(t)) return true }
  return false
}

// ── 自动画像（identity）启发式 ──────────────────────────────────────────
// 在 AI 没有主动 write_memory(type: identity) 时，兜底从用户消息里识别
// 稳定的个人/团队/产品信息并写入画像。只处理强信号，宁可少写也不误报。
const IDENTITY_PATTERNS = [
  /我叫([^，。,.！？!?]{1,20})/,
  /我的名字是([^，。,.！？!?]{1,20})/,
  /我是([^，。,.！？!?]{1,20})/,
  /我的职业是([^，。,.！？!?]{1,20})/,
  /我在([^，。,.！？!?]{1,20})(?:工作|上班)/,
  /我来自([^，。,.！？!?]{1,20})/,
  /我住在([^，。,.！？!?]{1,20})/,
  /我喜欢([^，。,.！？!?]{1,30})/,
  /我讨厌([^，。,.！？!?]{1,30})/,
  /我不喜欢([^，。,.！？!?]{1,30})/,
  /我常用([^，。,.！？!?]{1,30})/,
  /我在用([^，。,.！？!?]{1,30})/,
  /我用([^，。,.！？!?]{1,30})/,
  /我负责([^，。,.！？!?]{1,30})/,
  /我从事([^，。,.！？!?]{1,30})/,
  /我的目标(?:是)?([^，。,.！？!?]{1,30})/,
  /(?:我们|我的)(?:公司|团队|项目)(?:是|叫|做)([^，。,.！？!?]{1,30})/,
]
const IDENTITY_STOP = /^(你|您|这个|那个|这|那|它|他|她|我们|你们)$/
const IDENTITY_SKIP = /这个|那个|一下|试试|看看|这样|那样|它|你/
const IDENTITY_BAD_PREFIX = /^(来|想|要|问|打算|准备|看看|试试|一下)/

function cleanIdentityPhrase(text) {
  const value = String(text || '').trim().replace(/[，。,.！？!?]+$/, '')
  return value.length > 20 ? value.slice(0, 20) : value
}

/** 从用户消息里提取画像候选；没有强信号时返回 null。 */
function identityCandidate(text) {
  if (!text || typeof text !== 'string') return null
  const t = text.trim()
  if (isTrivial(t) || t.length > 300) return null
  let phrase = ''
  for (const pat of IDENTITY_PATTERNS) {
    const m = pat.exec(t)
    if (m && m[1]) {
      phrase = cleanIdentityPhrase(m[1])
      if (phrase && !IDENTITY_STOP.test(phrase) && !IDENTITY_SKIP.test(phrase) && !IDENTITY_BAD_PREFIX.test(phrase)) break
      phrase = ''
    }
  }
  if (!phrase) return null

  let title = '用户偏好'
  const name = /(?:我叫|我的名字是)([^，。,.！？!?]{1,20})/.exec(t)
  if (name && name[1]) {
    title = cleanIdentityPhrase(name[1])
  } else {
    const role = /(?:我是|我的职业是)([^，。,.！？!?]{1,20})/.exec(t)
    if (role && role[1] && !role[1].trim().endsWith('的')) {
      title = cleanIdentityPhrase(role[1])
    } else {
      const org = /(?:我们|我的)(?:公司|团队|项目)(?:是|叫|做)([^，。,.！？!?]{1,30})/.exec(t)
      if (org && org[1]) title = cleanIdentityPhrase(org[1])
    }
  }
  if (!title) title = '用户偏好'

  const now = new Date()
  const dateStr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
  const timeStr = pad2(now.getHours()) + ':' + pad2(now.getMinutes())
  const excerpt = t.length > 80 ? t.slice(0, 80) + '…' : t
  return {
    title,
    content: '自动画像（' + dateStr + ' ' + timeStr + '）。\n\n用户说：' + t,
    summary: '用户提到：' + excerpt,
    region: '本人',
    tags: ['auto', 'identity'],
  }
}

function maybeAutoWriteIdentity(root, text) {
  const cand = identityCandidate(text)
  if (!cand) return false
  writeIdentityEntry(root, cand.title, cand.content, cand.summary, cand.region, cand.tags)
  return true
}

export function apply(ctx, config = {}) {
  const root = typeof config.root === 'string' && config.root ? config.root : DEFAULT_ROOT

  // 生效配置 = 内置默认 ← cordis config ← 配置文件（异步加载完成后覆盖）。
  // 提供器每次组装都读 runtimeConfig，所以设置卡片保存后新会话立即用新值。
  const runtimeConfig = { ...DEFAULTS }
  mergeConfig(runtimeConfig, config)
  loadConfigFile(ctx.fs, root, runtimeConfig, config)

  // index 条目缓存：有界 Map（最多 200 条），超出淘汰最旧的。
  // 放在 apply 闭包里，插件停用即随 Run 一起丢弃；read（读全文）不经过它。
  const entryCache = new (class LimitedMap {
    constructor(max = 200) { this.max = max; this._map = new Map() }
    get(k) { return this._map.get(k) }
    set(k, v) { if (this._map.size >= this.max) { const first = this._map.keys().next().value; this._map.delete(first) }; this._map.set(k, v) }
    delete(k) { this._map.delete(k) }
    clear() { this._map.clear() }
  })()

  // ── 启动注入：记忆摘要快照（见 ADR-0009） ────────────────────────────
  // systemPrompt 的上下文提供器是同步的，而 fs 服务是异步的：
  // 所以在 agent/session-start 事件里异步预计算快照（按 agent 缓存一次），
  // 提供器只同步返回缓存。若首个请求前预计算未完成，该次请求暂无摘要，
  // 后续组装会自动取到。书写规范不在此处全局注入——它由「谨迹秘书」预设承载。
  const summaryCache = new WeakMap() // agent -> { text, root }
  ctx.on('agent/session-start', (payload) => {
    const agent = payload && payload.agent
    if (agent === undefined || summaryCache.has(agent)) return
    ;(async () => {
      let snapshotRoot = root
      try {
        const sessionCwd = agent.session && agent.session.header ? agent.session.header.cwd : undefined
        if (typeof sessionCwd === 'string' && sessionCwd) {
          const probe = await ctx.fs.resolve(sessionCwd + '/.journal')
          const probeStat = await ctx.fs.stat(probe)
          if (probeStat !== undefined && probeStat.type === 'directory') snapshotRoot = sessionCwd
        }
        if (!runtimeConfig.startupContext) {
          summaryCache.set(agent, { text: '', root: snapshotRoot })
          return
        }
        const text = await composeSummary(ctx.fs, snapshotRoot, runtimeConfig, entryCache)
        summaryCache.set(agent, { text, root: snapshotRoot })
      } catch {
        summaryCache.set(agent, { text: '', root: snapshotRoot })
      }
    })()
  })
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.context({
      name: 'memory:summary',
      order: 130,
      text: (assembleCtx) => {
        const agent = assembleCtx && assembleCtx.agent
        if (agent === undefined || !runtimeConfig.startupContext) return ''
        const entry = summaryCache.get(agent)
        return entry ? entry.text : ''
      },
    })
  })

  // ── 自动记忆：全局工具 + 系统提示 + 兜底（与预设无关） ──────────────
  if (ctx.tools) {
    ctx.tools.register({
      name: 'write_memory',
      description: '写入一条记忆——流水日志或实体画像。摘要（summary）最重要，索引层只读摘要，点开才读全文，所以摘要必须独立成句、自带信息量。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['memory', 'identity'], description: 'memory=流水日志（按日期归档到 .journal/memory/YYMM/DD-标题.md），identity=实体画像（存到 .journal/identity/）' },
          title: { type: 'string', description: '标题：日志用事件名称，画像用人物名/产品名' },
          content: { type: 'string', description: '正文（Markdown）' },
          summary: { type: 'string', description: '一句话摘要（50 字以内，索引层只读这个）' },
          tags: { type: 'string', description: '逗号分隔的标签（可选）' },
          region: { type: 'string', description: '仅画像：所属分组（如"趣丸""开源项目""其他"），不传则默认"其他"；仅 type=identity 时有效' },
        },
        required: ['type', 'title', 'content', 'summary'],
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async (args) => {
        if (!runtimeConfig.autoMemory) return '自动记忆已关闭'
        try {
          if (args.type === 'identity') {
            const tags = args.tags ? args.tags.split(',').map((s) => s.trim()).filter(Boolean) : []
            const result = writeIdentityEntry(root, args.title, args.content, args.summary, args.region, tags)
            return '已写入画像档案：' + result.rel
          }
          const tags = args.tags ? args.tags.split(',').map((s) => s.trim()).filter(Boolean) : []
          const result = writeJournalEntry(root, args.title, args.content, args.summary, tags)
          return '已写入记忆日志：' + result.rel
        } catch (e) {
          return '写入失败：' + (e && e.message ? e.message : String(e))
        }
      },
    })
  }

  // 全局系统提示：告诉所有会话（无论什么预设）它们有记忆工具
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.context({
      name: 'memory:auto',
      order: 120,
      text: (assembleCtx) => {
        if (!runtimeConfig.autoMemory) return ''
        const identityTip = runtimeConfig.autoIdentity
          ? '\n\n### 自动维护画像\n' +
            '当用户提到稳定的个人/团队/产品信息（名字、职业、技术栈、偏好、常用工具、项目、公司等）时，' +
            '应主动用 `write_memory`（`type: identity`）新建或更新画像；同一实体更新原文件，不要重复建档。\n' +
            '示例：用户说「我在用 Rust 写后端」→ 写入用户画像；用户介绍「我们团队在做 XX 产品」→ 写入产品/团队画像。'
          : ''
        return '## 记忆系统\n\n你可以用 `write_memory` 工具记录：\n' +
          '- **流水日志**（`type: memory`）：事件、决策、踩坑、结论，按日期归档\n' +
          '- **实体画像**（`type: identity`）：人物/产品档案，一实体一份\n\n' +
          '值得记住的信息、结论、决策、踩坑就写；一次性琐事和用户明确不要记的不写。\n' +
          '`summary` 字段最重要，索引层只读它。' +
          identityTip
      },
    })
  })

  // 自动兜底：每轮对话结束时，如果 AI 没写记忆，自动记一条梗概（琐碎对话过滤）
  // 同个会话 30 秒内只写一次，避免高频对话频繁写文件
  const lastAutoWrite = new Map()
  ctx.on('agent/turn-stopping', (payload) => {
    if (!runtimeConfig.autoMemory) return
    const agent = payload && payload.agent
    if (!agent) return
    ;(async () => {
      try {
        // 限流：同个会话 30s 冷却
        const sessionId = typeof agent.id === 'string' ? agent.id : (agent.session && agent.session.id)
        if (sessionId) {
          const last = lastAutoWrite.get(sessionId)
          if (last && Date.now() - last < 30000) return
          lastAutoWrite.set(sessionId, Date.now())
        }
        let lastText = ''
        try {
          const session = agent.session
          if (session && typeof session.deriveMessages === 'function') {
            const msgs = session.deriveMessages()
            for (let i = msgs.length - 1; i >= 0; i--) {
              const m = msgs[i]
              if (m && m.role === 'user') {
                lastText = (m.content && typeof m.content === 'string') ? m.content : (m.text || '')
                break
              }
            }
          } else if (session && session.lastMessage) {
            lastText = session.lastMessage.content || session.lastMessage.text || ''
          }
        } catch { /* 读不到消息也不影响兜底 */ }
        if (isTrivial(lastText)) return
        if (runtimeConfig.autoIdentity) {
          try { maybeAutoWriteIdentity(root, lastText) } catch { /* 画像兜底失败不影响对话 */ }
        }
        const turn = payload.turn || 0
        const now = new Date()
        const timeStr = pad2(now.getHours()) + ':' + pad2(now.getMinutes())
        const excerpt = lastText.length > 80 ? lastText.slice(0, 80) + '…' : lastText
        writeJournalEntry(root, '对话 ' + timeStr, '第 ' + turn + ' 轮对话自动笔记。\n\n用户说：' + lastText, excerpt, ['auto'])
      } catch { /* 兜底失败不影响对话 */ }
    })()
  })

  // 清理 lastAutoWrite：会话结束或关闭时移除条目，避免 Map 无限增长
  ctx.on('agent/disposed', (payload) => {
    const agent = payload && payload.agent
    if (!agent) return
    const sid = typeof agent.id === 'string' ? agent.id : (agent.session && agent.session.id)
    if (sid) lastAutoWrite.delete(sid)
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/memory',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const action = url.searchParams.get('action')
        if (action === 'config') {
          if (req.method === 'GET') {
            return sendJson(res, 200, {
              ok: true,
              config: { ...runtimeConfig },
              defaults: { ...DEFAULTS },
              file: CONFIG_FILE,
            })
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
            for (const field of Object.keys(patch)) {
              const err = configError(field, patch[field])
              if (err !== undefined) return sendJson(res, 400, { ok: false, reason: err })
            }
            // 读-改-写：以磁盘现文件为基底（读不到/损坏时退回当前 runtimeConfig），
            // 只覆盖本次请求体里实际提交的字段，磁盘上其他会话刚写的字段原样保留。
            const base = (await readConfigFile(ctx.fs, root)) ?? { ...runtimeConfig }
            const body = { ...base, ...patch }
            await saveConfigFile(ctx.fs, root, body)
            rebuildRuntimeConfig(runtimeConfig, config, body)
            return sendJson(res, 200, { ok: true, config: { ...runtimeConfig } })
          }
          return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
        }
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
        if (action === 'read') {
          const rel = url.searchParams.get('rel') || ''
          const text = await readDoc(ctx.fs, root, rel)
          return sendJson(res, 200, { ok: true, rel, text })
        }
        const index = await buildIndex(ctx.fs, root, entryCache)
        return sendJson(res, 200, index)
      } catch (error) {
        return sendJson(res, 500, { ok: false, reason: String((error && error.message) || error) })
      }
    },
  }), 'memory route')
}
