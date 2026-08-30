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
 *   [entry]     补丁插入的 entry id 唯一；未禁用/遮蔽官方组件
 *   [namespace] 包名不以 @deepseek-ai/ 开头
 *   [scripts]   preinstall/install/postinstall/prepare 显式列出（无则通过，报告）
 *   [permission] README/manifest 含权限等级披露（low/medium/high/unknown）
 *   [readme]    README 存在且包含安装与权限说明；写明外部依赖与已知风险
 *   [fixed]     git 仓库存在，HEAD 为 40 位 commit（固定源）
 *   [tag]       version 与最新 git tag 一致（manifest 一致）
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
}

// ---------- patch（DSH-Store 准入契约：manifest 一致 / 入口唯一 / 不动官方组件） ----------
const patchRel = pkg?.dsh?.bundle?.patch
check('patch.declared', '声明 dsh.bundle.patch', typeof patchRel === 'string' && patchRel.length > 0, String(patchRel ?? '缺失'))

let patchText = ''
if (patchRel) {
  patchText = readText(patchRel)
  check('patch.parseable', 'cordis.patch.yml 存在', patchText.length > 0, patchRel)
}

// 补丁里的 entry id 收集（insert 块与顶层 id 行）。
// 先剔除 YAML 注释行——注释里的示例 `- id: xxx` 不是真实条目，否则会被误判为重复。
const patchCode = patchText
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')
const insertIds = [...patchCode.matchAll(/-\s*id:\s*([\w-]+)/g)].map((m) => m[1])
// 顶层（无缩进）"- id:" 行 = 补丁级条目；insert 块内的 id 有缩进，不算。
const topLevelIds = [...patchCode.matchAll(/^- id:\s*([\w-]+)\s*$/gm)].map((m) => m[1])
const dup = insertIds.filter((id, i) => insertIds.indexOf(id) !== i)
check('entry.unique', '补丁插入的 entry id 唯一', dup.length === 0, dup.length ? `重复: ${[...new Set(dup)].join(', ')}` : `${insertIds.length} 个 entry`)

// 官方组件保护：顶层被禁用的官方 entry / 遮蔽 @deepseek-ai 组件
const officialPrefix = /^(ui-|dsh-|settings\.|conversation\.|agent)/i
const disabledOfficial = topLevelIds.filter((id) => officialPrefix.test(id))
const shadowsOfficial = insertIds.some((id) => id.includes('ui-settings') || id.includes('ui-plugin'))
const protectedOk = disabledOfficial.length === 0 && !shadowsOfficial
check('entry.protected', '未禁用/遮蔽官方组件', protectedOk,
  disabledOfficial.length ? `禁用官方 entry: ${disabledOfficial.join(', ')}` : (topLevelIds.length ? `补丁含 ${topLevelIds.length} 个顶层条目` : '未动官方组件'))

// ---------- README（DSH-Store 准入契约：README 完整 + 权限披露） ----------
const readme = readText('README.md')
check('readme.exists', 'README 存在', readme.length > 200)
check('readme.install', 'README 含安装/启用说明', /安装|install/i.test(readme))
const disclosed = /low|medium|high|unknown|权限|permissions?|access/i.test(readme)
if (disclosed) {
  check('readme.permission', 'README 含权限等级披露（low/medium/high/unknown）', true)
} else {
  warn('readme.permission', 'README 含权限等级披露（low/medium/high/unknown）', 'README 未披露权限等级，建议补充')
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
    const tags = execFileSync('git', ['-C', root, 'tag'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    if (tags.length > 0) {
      const latest = tags[tags.length - 1].replace(/^v/, '')
      tagInfo = `最新 tag v${latest}`
      versionMatches = latest === (pkg?.version ?? '')
    }
  }
} catch { /* 非 git 仓库 */ }
if (pkg?.version && !versionMatches) {
  warn('manifest.tag', 'version 与最新 git tag 一致（DSH-Store：manifest 一致）', `${tagInfo} ≠ manifest ${pkg.version}，发布前打 tag 对齐`)
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
