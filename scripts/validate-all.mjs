#!/usr/bin/env node
/**
 * validate-all.mjs — 校验 scripts/manifest.json 中全部插件（本地版；CI 用同一逻辑内联在
 * .github/workflows/validate-plugins.yml）。
 *
 * 用法：node scripts/validate-all.mjs [--json]
 * 退出码：0=全部通过；1=存在 FAIL。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const [, , flag] = process.argv
const asJson = flag === '--json'
const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/manifest.json'), 'utf8'))
const workDir = resolve(root, '.checkout')

if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const reports = []
let anyFail = false
for (const p of manifest.plugins) {
  const dir = resolve(workDir, p.id)
  try {
    execFileSync('git', ['clone', '--depth', '1', `https://github.com/${p.repo}.git`, dir], { stdio: 'ignore' })
    const out = execFileSync('node', [resolve(root, 'scripts/validate-plugin.mjs'), dir, '--json'], { encoding: 'utf8' })
    const r = JSON.parse(out)
    reports.push(r)
    if (r.fail > 0) anyFail = true
    // 产物完整性：固定源安装时 lib/*.js 的相对 import 必须都能在仓库里解析到
    let artifact = ''
    try {
      execFileSync('node', [resolve(root, 'scripts/check-artifact-imports.mjs'), dir], { encoding: 'utf8', stdio: 'pipe' })
    } catch (e) {
      anyFail = true
      artifact = ` ${String((e.stdout || e.message || '')).split('\n').filter((l) => l.includes('MISSING')).join(' ; ')}`.slice(0, 200)
    }
    console.log(`[${r.fail === 0 && !artifact ? 'PASS' : 'FAIL'}] ${p.id}: ${r.pass} 通过 / ${r.warn} 提示 / ${r.fail} 失败${artifact}`)
  } catch (e) {
    anyFail = true
    console.log(`[FAIL] ${p.id}: 校验执行失败 — ${String(e.message || e).slice(0, 200)}`)
  }
}

rmSync(workDir, { recursive: true, force: true })
process.exit(anyFail ? 1 : 0)
