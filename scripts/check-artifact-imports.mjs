#!/usr/bin/env node
/**
 * check-artifact-imports.mjs — 校验发布产物的相对 import 完整性（固定源安装自检）。
 *
 * 要堵的坑：src 拆出新模块后，若产物 lib/<新模块>.js 漏提交（`git add -u` 只收
 * 已跟踪文件），HEAD 里的 lib/*.js 仍会 import './<新模块>.js' → 从 GitHub 固定源
 * 安装直接 ERR_MODULE_NOT_FOUND，而本地因为 link: 安装完全看不出来。
 *
 * 用法：
 *   node scripts/check-artifact-imports.mjs <插件仓库路径> [--dir lib] [--json]
 * 退出码：0=完整；1=存在缺失的相对 import；2=参数/路径错误。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'

const [,, argPath, ...rest] = process.argv
if (!argPath) {
  console.error('用法: node scripts/check-artifact-imports.mjs <插件仓库路径> [--dir lib] [--json]')
  process.exit(2)
}
const root = resolve(argPath)
const asJson = rest.includes('--json')
const dirIdx = rest.indexOf('--dir')
const targetDir = dirIdx >= 0 ? (rest[dirIdx + 1] ?? 'lib') : 'lib'
const base = resolve(root, targetDir)

if (!existsSync(base) || !statSync(base).isDirectory()) {
  console.log(asJson ? JSON.stringify({ repo: root, checked: 0, missing: [], note: `无 ${targetDir}/ 目录` }) : `跳过：${root} 无 ${targetDir}/ 目录`)
  process.exit(0)
}

/** 递归收集 js/mjs（跳过 .map 与 .d.ts）。 */
function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.m?js$/.test(name) && !name.endsWith('.d.ts')) acc.push(full)
  }
  return acc
}

const files = walk(base, [])
// 静态 import / export from / 动态 import() 的裸相对与 ./ 说明符
const specRe = /(?:\bfrom|\bimport|require\s*\()\s*['"]((?:\.{1,2}\/)[^'"]+)['"]/g
const missing = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(specRe)) {
    const spec = m[1]
    const target = resolve(dirname(file), spec)
    // 允许指向目录的 index.* 与省略扩展名两种解析结果
    const candidates = [target, `${target}.js`, `${target}.mjs`, join(target, 'index.js'), join(target, 'index.mjs')]
    if (!candidates.some((c) => existsSync(c))) {
      missing.push({ file: file.replace(`${root}/`, ''), spec })
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ repo: root, checked: files.length, missing }, null, 2))
} else {
  console.log(`${existsSync(resolve(root, 'package.json')) ? JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name : root}: 扫 ${files.length} 个产物文件，缺失相对 import ${missing.length} 处`)
  for (const m of missing) console.log(`  [MISSING] ${m.file} → ${m.spec}`)
}
process.exit(missing.length ? 1 : 0)
