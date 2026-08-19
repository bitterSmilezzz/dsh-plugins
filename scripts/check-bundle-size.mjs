#!/usr/bin/env node
/**
 * check-bundle-size.mjs — 自研 bundle 体积守护（资源占用视角）。
 *
 * 扫描 plugins.json 中 first-party bundle 的本地仓库 lib/，报告：
 *   - lib 合计体积
 *   - client.js 单文件体积（浏览器加载/解析大头，最关键）
 *   - 相对阈值的状态（OK / WARN / ERROR，ERROR 时 exit 1）
 *
 * 阈值（2026-08-19 基线）：
 *   - client.js > 900 KB   → WARN（当前最大 767 KB 的 ~1.2 倍）
 *   - client.js > 1.2 MB   → ERROR
 *   - lib 合计   > 1.6 MB  → WARN（当前最大 1,379 KB 的 ~1.2 倍）
 *   - lib 合计   > 2.5 MB  → ERROR
 *
 * 本地仓库路径：伞目录 ~/workspace/<repo 短名>（与 install.sh ensure_source 同约定）；
 * 仓库不存在时跳过（不报错，仅提示）。
 *
 * 用法：node scripts/check-bundle-size.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.HOME || process.env.USERPROFILE
const WORKSPACE = join(HOME, 'workspace')

const CLIENTS = new Set(['client.js', 'client/index.js'])
const WARN = { clientKb: 900, libKb: 1.6 * 1024 }
const ERROR = { clientKb: 1.2 * 1024, libKb: 2.5 * 1024 }

function walk(dir) {
  let total = 0
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'types') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = walk(p)
      total += sub.total
      files.push(...sub.files)
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      const size = statSync(p).size
      total += size
      files.push({ name: entry.name, path: p, size })
    }
  }
  return { total, files }
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'plugins.json'), 'utf8'))
const bundles = manifest.plugins.filter((p) => p.origin === 'first-party' && p.type === 'bundle')

function findRepoDir(repo) {
  const short = repo.split('/').pop()
  // 伞目录约定（AGENTS.md「本地仓库组织约定」）：<伞目录>/<repo>；Windows
  // D:\workspace\deepseek-harness，macOS ~/workspace/deepseek-harness；
  // 兼容直接 ~/workspace/<repo> 的旧布局。
  const candidates = [
    join(WORKSPACE, 'deepseek-harness', short),
    join(WORKSPACE, short),
  ]
  return candidates.find((dir) => existsSync(dir))
}

let failed = 0
const rows = []
for (const p of bundles) {
  const repo = p.repo.split('/').pop()
  const repoDir = findRepoDir(p.repo)
  const libDir = join(repoDir ?? '', 'lib')
  if (!existsSync(libDir)) {
    rows.push({ id: p.id, repo, libKb: null, clientKb: null, status: 'skip（本地仓库不存在）' })
    continue
  }
  const { total, files } = walk(libDir)
  const clientFile = files.find((f) => CLIENTS.has(f.name)) || files.find((f) => f.name === 'client.js')
  const clientKb = clientFile ? clientFile.size / 1024 : 0
  const libKb = total / 1024
  let status = 'OK'
  if (clientKb > ERROR.clientKb || libKb > ERROR.libKb) { status = 'ERROR'; failed += 1 }
  else if (clientKb > WARN.clientKb || libKb > WARN.libKb) { status = 'WARN' }
  rows.push({ id: p.id, repo, libKb, clientKb, status })
}

const out = {
  generated: new Date().toISOString(),
  thresholds: { warnClientKb: WARN.clientKb, errorClientKb: ERROR.clientKb, warnLibKb: Math.round(WARN.libKb), errorLibKb: Math.round(ERROR.libKb) },
  rows,
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2))
} else {
  console.log(`bundle 体积守护（阈值 WARN client>${WARN.clientKb}K / lib>${Math.round(WARN.libKb)}K，ERROR client>${ERROR.clientKb}K / lib>${ERROR.libKb}K）`)
  for (const r of rows) {
    const lib = r.libKb === null ? '—' : `${Math.round(r.libKb)} KB`
    const client = r.clientKb === null ? '—' : `${Math.round(r.clientKb)} KB`
    console.log(`  ${r.id.padEnd(18)} lib ${lib.padEnd(9)} client.js ${client.padEnd(9)} ${r.status}`)
  }
  console.log(failed === 0 ? '\n全部在阈值内 ✓' : `\n${failed} 个插件超 ERROR 阈值 ✗`)
}
process.exit(failed === 0 ? 0 : 1)
