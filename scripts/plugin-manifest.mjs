#!/usr/bin/env node
/**
 * plugin-manifest.mjs — deepseek-plugins 汇总仓库的插件清单查询 CLI。
 *
 * 用法（仓库根目录运行）：
 *   node scripts/plugin-manifest.mjs list                    # 列出全部插件（本地目录 + 清单 github 源）
 *   node scripts/plugin-manifest.mjs get <id>                # 输出单个插件的安装 spec（JSON）
 *   node scripts/plugin-manifest.mjs skills-src <pack>       # 技能包的本地 src 目录（不存在则输出 github clone 说明）
 *
 * 设计：plugins.json 是来源真相。source=github 的插件已拆分到独立仓库
 * （安装 spec = github:<repo>#<ref>）；source=local 的插件仍在汇总仓库内
 * （安装 spec = 本地目录；拆分前过渡，防御性优先：本地目录存在即用本地）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST_PATH = join(ROOT, 'plugins.json')

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return []
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).plugins ?? []
  } catch (e) {
    console.error(`⚠ plugins.json 解析失败: ${e.message}`)
    return []
  }
}

/** 扫描汇总仓库内的本地插件目录（dsh-* 且是 bundle 或有 package.json），用于过渡期与未拆分插件。 */
function scanLocal() {
  const out = []
  let entries = []
  try { entries = readdirSync(ROOT).filter((e) => e.startsWith('dsh-')) } catch { return out }
  for (const entry of entries) {
    const dir = join(ROOT, entry)
    if (existsSync(join(dir, 'package.json')) || existsSync(join(dir, 'cordis.patch.yml'))) {
      out.push({ id: entry, type: 'bundle', source: 'local', localDir: entry })
    }
  }
  return out
}

/** 合并：清单（source=github）优先补全，本地扫描作为过渡兜底；同一 id 以清单为准。 */
function allPlugins() {
  const manifest = loadManifest()
  const local = scanLocal()
  const byId = new Map()
  for (const p of local) byId.set(p.id, p)
  for (const p of manifest) byId.set(p.id, p)
  return [...byId.values()]
}

function buildSpec(p) {
  if (p.source === 'github') {
    const ref = p.ref ?? 'main'
    const path = p.path ? `&path:${p.path}` : ''
    return `github:${p.repo}#${ref}${path}`
  }
  return join(ROOT, p.localDir ?? p.id)
}

function cmd(args) {
  const [sub, id] = args
  if (sub === 'list') {
    for (const p of allPlugins()) {
      const kind = p.source === 'github' ? 'github' : 'local'
      console.log(`${p.id}\t${p.type ?? 'bundle'}\t${kind}\t${p.source === 'github' ? buildSpec(p) : p.id}`)
    }
    return
  }
  if (sub === 'get' && id) {
    const p = allPlugins().find((x) => x.id === id || x.id === `dsh-${id}`)
    if (!p) { console.error(`❌ 未在清单/本地找到插件: ${id}`); process.exit(1) }
    console.log(JSON.stringify({ id: p.id, type: p.type ?? 'bundle', source: p.source, spec: buildSpec(p), localDir: p.localDir ?? null }))
    return
  }
  if (sub === 'skills-src' && id) {
    // 纯技能包：本地 skills/ 目录存在则输出路径；否则提示需要从 github clone（尚未拆分前均为本地）
    const localDir = join(ROOT, id, 'skills')
    if (existsSync(localDir)) { console.log(localDir); return }
    const p = loadManifest().find((x) => x.id === id)
    if (p && p.source === 'github') { console.log(`GITHUB:${p.repo}#${p.ref ?? 'main'}:skills`) ; return }
    console.error(`❌ 技能包 ${id} 无本地 skills/ 目录且未在清单登记 github 源`); process.exit(1)
  }
  console.error('用法: plugin-manifest.mjs <list|get <id>|skills-src <pack>>')
  process.exit(1)
}

cmd(process.argv.slice(2))