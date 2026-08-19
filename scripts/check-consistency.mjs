#!/usr/bin/env node
/**
 * check-consistency.mjs — meta-repo（汇总仓库）一致性守护。
 *
 * 插件已拆分为独立仓库（自研合并为 dsh-plugins/dsh-skills，第三方 fork 独立），
 * 本仓库只维护 plugins.json 清单。本脚本验证：
 *  - plugins.json 可解析、schema 字段合法
 *  - id 唯一
 *  - type ∈ bundle|skills、source ∈ github|local
 *  - github 源的 repo/ref/path 格式、origin/upstream 一致性（fork 必有 upstream）
 *
 * 用法：node scripts/check-consistency.mjs
 * 退出码：0 全部一致；1 有失败。
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST = resolve(ROOT, 'plugins.json')
const TYPES = new Set(['bundle', 'skills'])
const SOURCES = new Set(['github', 'local'])

function fail(msg) { console.error(`  ✗ ${msg}`); return false }

const failures = []
let count = 0

if (!existsSync(MANIFEST)) {
  console.error('✗ plugins.json 不存在')
  process.exit(1)
}

let data
try { data = JSON.parse(readFileSync(MANIFEST, 'utf8')) }
catch (e) { console.error(`✗ plugins.json 解析失败: ${e.message}`); process.exit(1) }

if (!Array.isArray(data.plugins)) fail('plugins 不是数组')
else {
  const seen = new Set()
  for (const p of data.plugins) {
    count++
    const label = p.id || '<no-id>'
    if (!p.id) { fail(`${label}: 缺 id`); continue }
    if (seen.has(p.id)) { fail(`${p.id}: id 重复`); continue }
    seen.add(p.id)
    if (!TYPES.has(p.type)) fail(`${p.id}: type=${p.type} 非法（bundle|skills）`)
    if (!SOURCES.has(p.source)) fail(`${p.id}: source=${p.source} 非法（github|local）`)
    if (p.source === 'github') {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.repo || '')) fail(`${p.id}: repo 格式非法 (${p.repo})`)
      if (!/^[A-Za-z0-9._\/-]+$/.test(p.ref || '')) fail(`${p.id}: ref 格式非法 (${p.ref})`)
      if (p.path !== undefined && !/^\/[A-Za-z0-9_.\/-]+$/.test(p.path)) fail(`${p.id}: path 格式非法（须 / 开头）(${p.path})`)
      if (p.origin === 'third-party-fork' && !p.upstream) fail(`${p.id}: fork 必须声明 upstream`)
    }
    if (p.source === 'local' && !existsSync(resolve(ROOT, p.id))) fail(`${p.id}: source=local 但本地目录不存在`)
  }
}

console.log(`plugins.json 检查：${count} 个插件，${failures.length ? failures.length + ' 处失败' : '全部一致'}`)
for (const f of failures) console.log(f)
process.exit(failures.length ? 1 : 0)