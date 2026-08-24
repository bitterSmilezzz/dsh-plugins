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
 *   [readme]    README 存在且包含安装与权限说明
 *   [fixed]     git 仓库存在，HEAD 为 40 位 commit（固定源）
 *   [inject]    host 入口声明 inject（若存在 src/index.ts 或 lib/index.js）
 *
 * 退出码：0=全部通过；1=存在 FAIL；2=参数/路径错误。
 */
import { existsSync, readFileSync } from 'node:fs'
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

// 补丁里的 entry id 收集（insert 块与顶层 id 行）
const insertIds = [...patchText.matchAll(/-\s*id:\s*([\w-]+)/g)].map((m) => m[1])
// 顶层（无缩进）"- id:" 行 = 补丁级条目；insert 块内的 id 有缩进，不算。
const topLevelIds = [...patchText.matchAll(/^- id:\s*([\w-]+)\s*$/gm)].map((m) => m[1])
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
