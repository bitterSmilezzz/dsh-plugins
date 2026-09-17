#!/usr/bin/env node
/**
 * validate-plugin.mjs — 按伞仓库 AGENTS.md 契约对插件仓库做静态校验（版本无关）。
 *
 * 用法：
 *   node scripts/validate-plugin.mjs <插件仓库路径> [--json]
 *
 * 检查项（对应 AGENTS.md 契约，可静态化的部分）：
 *   [manifest]  package.json 存在、合法、name/version/license 齐全
 *   [patch]     dsh.bundle.patch 声明存在，cordis.patch.yml 可解析
 *   [entry]     补丁插入的 entry id 唯一；未禁用/遮蔽官方组件（含 insert/update 块内的
 *               `disabled: true` —— 缩进嵌套的官方 entry 一样算）
 *   [namespace] 包名不以 @deepseek-ai/ 开头
 *   [scripts]   preinstall/install/postinstall/prepare 显式列出（无则通过，报告）
 *   [registry]  scripts 含 validate:registry（DSH-Store「可验证」条款）
 *   [client]    声明 dsh.client 时 lib/client.js 必须存在且非空（缺失会让整个 profile 装配失败）
 *   [permission] README/manifest 含权限等级披露等级词（low/medium/high/unknown）
 *   [readme]    README 存在、含安装与权限说明、名称用「中文名（English Name）」；写明外部依赖与已知风险
 *   [fixed]     git 仓库存在，HEAD 为 40 位 commit（固定源）
 *   [tag]       version 与最新 git tag 一致（manifest 一致；不一致 = FAIL，CI 只对 FAIL 开 Issue）
 *   [inject]    host 入口声明 inject（若存在 src/index.ts 或 lib/index.js）
 *   [tools]     工具注册数 ≤3（Pi 契约：Context 是最贵资源）；>5 需评审，>10 必须拆分
 *   [dshstd]    依赖 @dsh-std/* 时须有 docs/proposals/ 提案目录
 *
 * 退出码：0=全部通过；1=存在 FAIL；2=参数/路径错误。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const [,, argPath, flag] = process.argv
const asJson = flag === '--json'

if (!argPath) {
  console.error('用法: node scripts/validate-plugin.mjs <插件仓库路径> [--json]')
  process.exit(2)
}
const root = resolve(argPath)

/** 读取 JSON，失败返回 null。 */
function readJson(rel) {
  const p = resolve(root, rel)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

/** 读取文本（不存在返回 ''）。 */
function readText(rel) {
  const p = resolve(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const results = []
function check(id, name, ok, detail = '') {
  results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail })
}
function warn(id, name, detail = '') {
  results.push({ id, name, status: 'WARN', detail })
}

// ---------- manifest ----------
const pkg = readJson('package.json')
check('manifest', 'package.json 存在且合法', pkg !== null)
if (pkg) {
  check('manifest.name', 'name 齐全', typeof pkg.name === 'string' && pkg.name.length > 0, String(pkg.name ?? '缺失'))
  check('manifest.version', 'version 齐全', typeof pkg.version === 'string' && pkg.version.length > 0, String(pkg.version ?? '缺失'))
  check('manifest.license', 'license 齐全', typeof pkg.license === 'string' && pkg.license.length > 0, String(pkg.license ?? '缺失'))

  // ---------- namespace（DSH-Store 准入契约：命名空间合规） ----------
  const nsOk = typeof pkg.name === 'string' && !pkg.name.startsWith('@deepseek-ai/')
  check('namespace', '不以 @deepseek-ai/ 命名空间发布', nsOk, String(pkg.name ?? ''))

  // ---------- lifecycle scripts 透明 ----------
  const life = ['preinstall', 'install', 'postinstall', 'prepare'].filter((k) => pkg.scripts?.[k])
  check('scripts', '生命周期脚本显式列出', true,
    life.length ? `存在: ${life.join(', ')}` : '无生命周期脚本')

  // ---------- 可验证（DSH-Store 准入契约：npm run validate:registry 通过） ----------
  // 该条款只对**声明了商城分发意图**的仓库生效：未上架的仓库不适用（见
  // doc/experience/governance.md「validate:registry 属商城侧工具，未上架不适用」）。
  // 判据 = README 提到 DSH-Store / 商城 / 上架。误伤成本不对称：伞仓库 CI 只在
  // FAIL 时开 Issue，把未上架仓库一律判红会持续制造噪音，而 WARN 仍留痕。
  const hasRegistryScript = typeof pkg.scripts?.['validate:registry'] === 'string' && pkg.scripts['validate:registry'].length > 0
  const registryIntent = /dsh-store|商城|上架/i.test(readText('README.md'))
  if (hasRegistryScript) {
    check('scripts.registry', 'scripts 含 validate:registry（DSH-Store：可验证）', true, pkg.scripts['validate:registry'])
  } else if (registryIntent) {
    check('scripts.registry', 'scripts 含 validate:registry（DSH-Store：可验证）', false,
      'README 声明了商城分发意图，但 package.json scripts 缺 validate:registry')
  } else {
    warn('scripts.registry', 'scripts 缺 validate:registry（未声明商城分发意图，暂不阻断）',
      'README 未提 DSH-Store/商城/上架；决定上架前须补该脚本')
  }
}

// ---------- patch（DSH-Store 准入契约：manifest 一致 / 入口唯一 / 不动官方组件） ----------
const patchRel = pkg?.dsh?.bundle?.patch
check('patch.declared', '声明 dsh.bundle.patch', typeof patchRel === 'string' && patchRel.length > 0, String(patchRel ?? '缺失'))

let patchText = ''
if (patchRel) {
  patchText = readText(patchRel)
  check('patch.parseable', 'cordis.patch.yml 存在', patchText.length > 0, patchRel)
}

// 已知官方 entry id 名单（快照来源：官方 bundle dsh-base / dsh-web-app / dsh-headless /
// dsh-acp-app / dsh-sdk-app / dsh-sdk-minimal 的 cordis.patch.yml）。契约版本无关，名单只用于
// 「这个 id 属于官方吗」的判定：命中即判官方，未命中且不带官方前缀会**漏报（假阴性）**，不会误报。
// 重新生成：grep -rhoE '^\s*-\s*id:\s*[A-Za-z0-9_.@/-]+' \
//   ~/.dsh/profiles/node_modules/@deepseek-ai/*/cordis.patch.yml | sed 's/.*id: *//' | sort -u
const OFFICIAL_ENTRY_IDS = new Set(`acp acp-app-startup agent agent-default-model agent-instructions agent-invariant agent-loop
  agent-loop-invariant agent-presets api-remotes approval attachment-local bash-sandbox
  client-hmr command-compact command-feedback command-goal commands compaction-basic connection
  cordis-client-runner cordis-host-runner credentials deepseek-llm-api-extensions
  directory-picker file-reference-local file-upload fs-observation-policy fs-sandbox goal
  goal-round-driver headless-runner headless-startup hmr image-offload invariants jobs llm
  llm-deepseek llm-pi-ai llm-retry locale mcp-resources message-feedback modules office-to-pdf
  open-in-app permission persistent-bash persistent-pwsh plan-mode plugin-inventory
  plugin-manager plugin-package-inventory-deepseek ptc-runtime pty pwsh-sandbox
  repeat-tool-reminder resources sandbox sandbox-policy scope-invariant sdk-app-startup
  sdk-jsonrpc-server session session-checkpoint-policy session-controller session-invariant
  session-log-deepseek session-log-download session-persistence-jsonl session-projection
  session-projection-cache session-query-sqlite session-reference session-stats
  session-telemetry-otel session-title session-title-llm session-turn-outline sessions settings
  settings-controller shell-env skill skill-badge skill-filesystem spill-local spill-policy
  storage storage-domain storage-json subagent subagent-fork-in-process
  subagent-model-selection-settings subagent-spawn-in-process subprocess system-prompt
  terminal-bash terminal-controller terminal-pwsh timeout-policy timer token-meter tool-bash
  tool-fs tool-fs-search tool-goal tool-jobs tool-plugin-manager tool-pwsh tool-ralph
  tool-result-pruner tool-skill tool-subagent tool-subagent-control tool-subagent-fork
  tool-subagent-list-agents tool-todo tool-web tool-workflow tools typert typert-gateway
  typert-loader ui-agent-preset ui-approval ui-attachment ui-brand-official ui-chat ui-commands
  ui-conversation ui-cordis ui-deliverables ui-goal ui-input-trigger ui-jobs ui-layout
  ui-message-feedback ui-model-selection ui-open-in-app ui-permission ui-plan ui-plugin-manager
  ui-reference ui-renderer ui-schedule ui-session ui-settings ui-settings-general
  ui-settings-models ui-settings-plugin-inventory ui-settings-plugins
  ui-settings-unarchive-sessions ui-sidebar ui-sidebar-browser ui-sidebar-documentpreview
  ui-sidebar-files ui-sidebar-right ui-sidebar-terminal ui-skill ui-subagent ui-theme ui-tool
  ui-trajectory ui-user-questions ui-workflow-run ui-workspace user-questions web web-fetch-http
  web-runtime web-search-deepseek web-startup webserver workflow-ptc workspace workspace-changes
  workspace-controller workspace-files`.split(/\s+/).filter(Boolean))
// 官方 id 的形态前缀（名单之外的新官方 id 兜底）。注意**不含 `dsh-`**：本伞下自有 entry id
// 形如 dsh-model-selector / dsh-notify，用 `dsh-` 前缀会把自己的插件误判成官方。
const OFFICIAL_ENTRY_PREFIX = /^(ui-|settings\.|conversation\.|agent)/i

// 补丁里的 entry 收集：顶层、insert 块、update 块内的 `- id:` 一律纳入（缩进的官方 entry
// 一样要能被定位，否则「不动官方组件」检查会假通过）。
// 先剔除 YAML 注释行——注释里的示例 `- id: xxx` / `disabled: true` 不是真实条目。
const patchCode = patchText
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

// 逐行解析成条目：`- id: xxx` 起一条，其后的 name/disabled 等键归入该条目；
// `disabled: true` 回溯到最近一条 `- id:` 行取条目 id（YAML 里 disabled 与 id 同属一个条目）。
const entries = []
let block = null            // 当前所在的 insert/update 块
let orphanDisabled = 0      // 找不到所属 `- id:` 的 disabled: true
for (const line of patchCode.split('\n')) {
  const blockM = /^(\s*)-\s*(insert|update):\s*$/.exec(line)
  if (blockM) { block = { kind: blockM[2], indent: blockM[1].length }; continue }
  const idM = /^(\s*)-\s*id:\s*([\w.@/-]+)/.exec(line)
  if (idM) {
    if (block && idM[1].length <= block.indent) block = null
    entries.push({ id: idM[2], indent: idM[1].length, block: block?.kind ?? null, disabled: false, names: [] })
    continue
  }
  const cur = entries[entries.length - 1]
  const isDisabled = /^\s*disabled:\s*['"]?true['"]?\s*(#.*)?$/i.test(line)
  if (!cur) { if (isDisabled) orphanDisabled += 1; continue }
  const nameM = /^\s*name:\s*['"]?([^'"\s,]+)/.exec(line)
  if (nameM) cur.names.push(nameM[1])
  if (isDisabled) cur.disabled = true
}

const allIds = entries.map((e) => e.id)
const topLevelIds = entries.filter((e) => e.indent === 0).map((e) => e.id)
const dup = allIds.filter((id, i) => allIds.indexOf(id) !== i)
check('entry.unique', '补丁插入的 entry id 唯一', dup.length === 0, dup.length ? `重复: ${[...new Set(dup)].join(', ')}` : `${allIds.length} 个 entry`)

// 官方组件保护：任何层级（含 insert/update 块内）被 `disabled: true` 的官方 entry，或 insert
// 官方 id（遮蔽/替换）都判 FAIL —— DSH-Store 拒绝的高频原因。
// 官方判定：①条目 name 指向 @deepseek-ai/*；②id 命中官方名单；③id 命中官方前缀。
// 先排除本插件自有条目（package.json name 及其短名），避免把自有 id 误判成官方。
const pkgName = typeof pkg?.name === 'string' ? pkg.name : ''
const ownIds = new Set([pkgName, pkgName.split('/').pop()].filter(Boolean))
const isSelfEntry = (e) => ownIds.has(e.id) || (pkgName !== '' && e.names.includes(pkgName))
const isOfficialEntry = (e) => !isSelfEntry(e) && (
  e.names.some((n) => n.startsWith('@deepseek-ai/')) ||
  OFFICIAL_ENTRY_IDS.has(e.id) ||
  OFFICIAL_ENTRY_PREFIX.test(e.id)
)
const disabledOfficial = [
  ...entries.filter((e) => e.disabled && isOfficialEntry(e)).map((e) => e.id),
  // 行内（flow style）`- { id: xxx, disabled: true }` 写成单行时逐行解析看不到 id，单独扫一遍，
  // 免得这一形态成为绕过口子（`disabled` 写在 `id` 之前的行内写法仍会漏，属已知假阴性）。
  ...[...patchCode.matchAll(/\{[^{}]*\bid:\s*([\w.@/-]+)[^{}]*\bdisabled:\s*['"]?true['"]?[^{}]*\}/gi)]
    .filter((m) => !ownIds.has(m[1]) && (m[0].includes('@deepseek-ai/') || OFFICIAL_ENTRY_IDS.has(m[1]) || OFFICIAL_ENTRY_PREFIX.test(m[1])))
    .map((m) => m[1]),
]
const shadowsOfficial = entries.filter((e) => e.block === 'insert' && isOfficialEntry(e))
const protectedOk = disabledOfficial.length === 0 && shadowsOfficial.length === 0
const protectedDetail = protectedOk
  ? (allIds.length ? `补丁含 ${allIds.length} 个 entry（${topLevelIds.length} 个顶层），未禁用/遮蔽官方组件` : '未动官方组件')
  : [
    disabledOfficial.length ? `禁用官方 entry: ${disabledOfficial.join(', ')}` : '',
    shadowsOfficial.length ? `insert 官方 id（遮蔽/替换）: ${shadowsOfficial.map((e) => e.id).join(', ')}` : '',
  ].filter(Boolean).join('；')
check('entry.protected', '未禁用/遮蔽官方组件', protectedOk, protectedDetail)

// 归不到官方也归不到自有（如他人 entry）的 disabled: true：静态判不了归属，至少留痕，
// 不静默通过（这类行曾经整片漏检）。
const disabledForeign = entries.filter((e) => e.disabled && !isOfficialEntry(e) && !isSelfEntry(e)).map((e) => e.id)
if (disabledForeign.length || orphanDisabled) {
  warn('entry.protected.unknown', '存在无法静态判定归属的 disabled: true（人工确认未禁用官方 entry）',
    [...disabledForeign, ...(orphanDisabled ? [`${orphanDisabled} 处无所属 id`] : [])].join(', '))
}

// ---------- client 半区一致性（声明 dsh.client 就必须有可加载产物） ----------
// DSH 的 client-modules 在装配阶段就要求声明过的 client bundle 真实存在，
// 缺失会让**整个 profile 起不来**（不是只坏这个插件）；build/test 全绿掩盖不了。
const declaredClient = Boolean(pkg?.dsh?.client)
const clientBundle = resolve(root, 'lib/client.js')
const clientSize = existsSync(clientBundle) ? statSync(clientBundle).size : 0
if (declaredClient) {
  check('client.bundle', '声明 dsh.client 时 lib/client.js 必须存在且非空',
    clientSize > 200, clientSize > 200 ? `lib/client.js ${String(clientSize)}B` : `缺失或过小（${String(clientSize)}B）→ profile 装配失败`)
} else if (clientSize > 200) {
  warn('client.bundle', '有 lib/client.js 但未声明 dsh.client（浏览器半区不会加载）', `lib/client.js ${String(clientSize)}B`)
} else {
  check('client.bundle', '纯 host 插件：未声明 dsh.client 且无 client 产物', true, 'host-only')
}

// ---------- README（DSH-Store 准入契约：README 完整 + 权限披露） ----------
const readme = readText('README.md')
check('readme.exists', 'README 存在', readme.length > 200)
check('readme.install', 'README 含安装/启用说明', /安装|install/i.test(readme))

// 名称格式（AGENTS.md：名称用「中文名（English Name）」）：首个 H1 或 H1 后的首段命中即可。
const readmeNameRe = /[\u4e00-\u9fa5]+[（(][A-Za-z][\w .\-]*[）)]/
const h1M = /^#\s+(.+)$/m.exec(readme)
const h1Text = h1M ? h1M[1] : ''
const bodyAfterH1 = h1M ? readme.slice(h1M.index + h1M[0].length) : readme
const firstPara = bodyAfterH1
  .split(/\n\s*\n/)
  .map((s) => s.trim())
  .find((s) => s && !/^[<!#|>`]/.test(s) && !/^[-*]\s/.test(s) && !/^!\[/.test(s)) ?? ''
const nameOk = readmeNameRe.test(h1Text) || readmeNameRe.test(firstPara)
check('readme.name', 'README 名称用「中文名（English Name）」', nameOk,
  nameOk ? (readmeNameRe.test(h1Text) ? `H1: ${h1Text.trim()}` : `首段: ${(readmeNameRe.exec(firstPara) ?? [''])[0]}`)
    : `H1/首段未命中「中文名（English Name）」：${(h1Text || firstPara).slice(0, 60) || 'README 缺失'}`)

// 权限等级披露：必须出现等级词（low/medium/high/unknown），仅出现「权限」二字不算披露。
const disclosed = /\b(low|medium|high|unknown)\b/i.test(readme)
if (disclosed) {
  check('readme.permission', 'README 含权限等级披露（low/medium/high/unknown）', true)
} else {
  warn('readme.permission', 'README 含权限等级披露（low/medium/high/unknown）', 'README 未披露权限等级词（low/medium/high/unknown），建议补充')
}

// ---------- fixed source（DSH-Store 准入契约：固定源发布） ----------
let fixedOk = false
let headInfo = '非 git 仓库'
try {
  if (existsSync(resolve(root, '.git'))) {
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    fixedOk = /^[0-9a-f]{40}$/.test(head)
    headInfo = head
  }
} catch { /* 非 git 仓库 */ }
check('fixed', 'git HEAD 为 40 位不可变 commit', fixedOk, headInfo)

// ---------- inject（DSH 官方规则契约：硬依赖声明） ----------
const hostEntry = ['src/index.ts', 'lib/index.js', 'index.js'].find((f) => existsSync(resolve(root, f)))
let injectOk = true
let injectInfo = '未找到 host 入口'
if (hostEntry) {
  const host = readText(hostEntry)
  const hasInject = /export\s+const\s+inject|inject\s*:/.test(host)
  injectOk = hasInject
  injectInfo = hasInject ? `${hostEntry} 声明 inject` : `${hostEntry} 未声明 inject`
}
check('inject', 'host 入口声明 inject 硬依赖', injectOk, injectInfo)

// ---------- tool 数量（Pi 契约：Context 是最贵资源——工具数默认 ≤3，>5 需评审，>10 必须拆分） ----------
// 只数真源 src/：src/ 与 lib/ 同时扫会把同一工具计两次（真实 7 个报成 14 个），
// 从而把「4–10 需评审」的 WARN 误升级成「>10 必须拆分」的 FAIL。
// 仅当仓库没有 src/（产物型仓库）时才回退到 lib/。
const hasSrc = existsSync(resolve(root, 'src'))
const toolSources = hasSrc ? ['src'] : ['lib'].filter((d) => existsSync(resolve(root, d)))
let toolCount = 0
for (const dir of toolSources) {
  const walk = (d) => {
    for (const f of readdirSync(resolve(root, d))) {
      const full = resolve(root, d, f)
      if (existsSync(full) && statSync(full).isDirectory()) walk(`${d}/${f}`)
      else if (/\.(js|ts|tsx|mjs)$/.test(f)) {
        const text = readFileSync(full, 'utf8')
        toolCount += (text.match(/ctx\.tools\.register\(|tools\.register\(|\.tool\(/g) || []).length
      }
    }
  }
  walk(dir)
}
const toolDetail = `${toolCount} 个工具注册`
if (toolCount <= 3) {
  check('tools.count', '工具数 ≤ 3（Pi 契约：Context 是最贵资源）', true, toolDetail)
} else if (toolCount <= 10) {
  warn('tools.count', '工具数 4–10 需专项评审（Pi 契约）', toolDetail)
} else {
  check('tools.count', '工具数 > 10 必须拆分（Pi 契约）', false, toolDetail)
}

// ---------- version ↔ git tag（DSH-Store 准入契约：manifest 一致） ----------
let tagInfo = '无 git tag'
let versionMatches = true
try {
  if (existsSync(resolve(root, '.git'))) {
    // 字典序会让 v0.1.10 排在 v0.1.9 之前，必须用版本序取最新 tag。
    const tags = execFileSync('git', ['-C', root, 'tag', '--sort=-v:refname'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    if (tags.length > 0) {
      const latest = tags[0].replace(/^v/, '')
      tagInfo = `最新 tag v${latest}`
      versionMatches = latest === (pkg?.version ?? '')
    }
  }
} catch { /* 非 git 仓库 */ }
if (pkg?.version && !versionMatches) {
  // 保持 WARN：这条检查**无法区分**两种情形 ——
  //   (a) 发版漏打 tag（真漂移，应当阻断）；
  //   (b) 版本号已 bump、尚未发版的开发中状态（正常，asr-voice 0.3.3 vs tag v0.3.2
  //       即此例：npm 上仍是 0.3.2，工作区是下一个版本）。
  // 静态脚本查不到 npm 的已发布版本（离线、且不应联网），一律 FAIL 会让「开发中」
  // 的仓库持续被 CI 开 Issue（伞仓库 CI 只对 FAIL 开 Issue）。要升 FAIL 必须先能
  // 判定 (a)/(b)，例如比对 `npm view <name>@<version>` 的命中结果。
  warn('manifest.tag', 'version 与最新 git tag 一致（DSH-Store：manifest 一致）',
    `${tagInfo} ≠ manifest ${pkg.version}，发布前打 tag 对齐`)
} else {
  check('manifest.tag', 'version 与最新 git tag 一致（DSH-Store：manifest 一致）', true, tagInfo)
}

// ---------- README 完整性（DSH-Store：README 写明外部依赖/权限/已知风险） ----------
const readmeDeps = /外部依赖|依赖|dependencies|requires?/i.test(readme)
const readmeRisk = /已知风险|风险|limitations?|已知限制|risks?/i.test(readme)
if (readmeDeps && readmeRisk) {
  check('readme.complete', 'README 写明外部依赖与已知风险', true)
} else {
  warn('readme.complete', 'README 写明外部依赖与已知风险',
    `${readmeDeps ? '' : '缺外部依赖说明 '}${readmeRisk ? '' : '缺已知风险说明'}`.trim())
}

// ---------- dsh-std 协议契约：依赖 @dsh-std/* 时须有 docs/proposals/ ----------
const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}), ...(pkg?.peerDependencies ?? {}) }
const stdDeps = Object.keys(deps).filter((k) => k.startsWith('@dsh-std/'))
if (stdDeps.length > 0) {
  const hasProposals = existsSync(resolve(root, 'docs/proposals'))
  check('dshstd.proposals', '依赖 @dsh-std/* 时须有 docs/proposals/ 提案目录（dsh-std 契约）',
    hasProposals, `${stdDeps.join(', ')}${hasProposals ? '' : ' — 缺少 docs/proposals/'}`)
} else {
  check('dshstd.proposals', '依赖 @dsh-std/* 时须有 docs/proposals/ 提案目录（dsh-std 契约）',
    true, '未依赖 @dsh-std/*，跳过')
}

// ---------- 汇总 ----------
const fails = results.filter((r) => r.status === 'FAIL')
const warns = results.filter((r) => r.status === 'WARN')
const repoName = pkg?.name ?? root.split(/[\\/]/).pop()

if (asJson) {
  console.log(JSON.stringify({ repo: repoName, total: results.length, pass: results.length - fails.length - warns.length, warn: warns.length, fail: fails.length, results }, null, 2))
} else {
  console.log(`\n校验插件: ${repoName}  (${root})`)
  for (const r of results) {
    console.log(`  [${r.status}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  const passed = results.length - fails.length - warns.length
  console.log(`\n结果: ${passed}/${results.length} 通过, ${warns.length} 提示, ${fails.length} 失败`)
}
process.exit(fails.length ? 1 : 0)
