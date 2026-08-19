#!/usr/bin/env node
/**
 * install-external.mjs — 外部组件安装清单/引导脚本。
 *
 * 外部组件不满足收编条件（或属于独立平台件），源码不进仓库；本脚本读取
 * external/manifest.json，打印安装步骤；`--dry-run` 只打印。
 *
 * 用法：
 *   node scripts/install-external.mjs --component browser
 *   node scripts/install-external.mjs --component dsh-tui
 *   node scripts/install-external.mjs --component all
 *   node scripts/install-external.mjs --dry-run
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'external/manifest.json'), 'utf8'))

function parseArgs(argv) {
  const args = { component: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--component') args.component = argv[++i]
    else if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法: node scripts/install-external.mjs [--component browser|dsh-tui|all] [--dry-run]')
      process.exit(0)
    } else {
      console.error(`未知参数: ${argv[i]}`)
      process.exit(1)
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const names = args.component === 'all' || !args.component
  ? Object.keys(manifest)
  : [args.component]

for (const name of names) {
  const comp = manifest[name]
  if (!comp) {
    console.error(`未知组件: ${name}`)
    process.exit(1)
  }
  console.log(`\n=== ${name}: ${comp.name} ===`)
  console.log(`来源: ${comp.source}`)
  console.log(`License: ${comp.license}`)
  if (comp.managedPath) console.log(`本地管理路径: ${comp.managedPath.replace('~', homedir())}`)
  if (comp.extensionPath) console.log(`扩展路径: ${comp.extensionPath.replace('~', homedir())}`)
  console.log(`安装说明:\n  ${comp.installHint}`)
}

console.log('\n外部组件多为平台/手动安装（Chrome 扩展需手动加载），脚本只提供引导，不自动改系统。')
