#!/usr/bin/env node
/**
 * apply-settings.mjs — 把 config/settings.example.yaml 安全合并到 ~/.dsh/settings.yaml
 *
 * 策略：
 *  - 只补缺失/可安全合并的字段，不覆盖用户已有标量。
 *  - 写前自动备份 settings.yaml。
 *  - 默认交互确认；--dry-run 只打印差异。
 *
 * 用法：
 *   node scripts/apply-settings.mjs --dry-run
 *   node scripts/apply-settings.mjs --yes
 *   node scripts/apply-settings.mjs --settings /path/to/settings.yaml
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import YAML from 'yaml'

const ROOT = resolve(import.meta.dirname, '..')
const DSH_HOME = process.env.DSH_HOME || joinHome('.dsh')
const DEFAULT_SETTINGS = resolve(DSH_HOME, 'settings.yaml')
const DEFAULT_TEMPLATE = resolve(ROOT, 'config/settings.example.yaml')

function joinHome(...p) {
  return resolve(homedir(), ...p)
}

function parseArgs(argv) {
  const args = { dryRun: false, yes: false, settings: DEFAULT_SETTINGS, template: DEFAULT_TEMPLATE }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--yes' || argv[i] === '-y') args.yes = true
    else if (argv[i] === '--settings') args.settings = resolve(argv[++i])
    else if (argv[i] === '--template') args.template = resolve(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法: node scripts/apply-settings.mjs [--dry-run] [--yes] [--settings path] [--template path]')
      process.exit(0)
    } else {
      console.error(`未知参数: ${argv[i]}`)
      process.exit(1)
    }
  }
  return args
}

function loadYaml(file) {
  if (!existsSync(file)) return {}
  try {
    return YAML.parse(readFileSync(file, 'utf8')) || {}
  } catch (e) {
    console.error(`❌ 无法解析 ${file}: ${e.message}`)
    process.exit(1)
  }
}

function merge(base, patch, path = '') {
  const changes = []
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const out = { ...base }
    for (const [k, v] of Object.entries(patch)) {
      const keyPath = path ? `${path}.${k}` : k
      if (!(k in out)) {
        out[k] = v
        changes.push({ key: keyPath, type: 'add' })
      } else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        const sub = merge(out[k], v, keyPath)
        out[k] = sub.value
        changes.push(...sub.changes)
      } else if (Array.isArray(v) && Array.isArray(out[k])) {
        const seen = new Set(out[k].map((x) => JSON.stringify(x)))
        const added = v.filter((x) => !seen.has(JSON.stringify(x)))
        if (added.length) {
          out[k] = [...out[k], ...added]
          changes.push({ key: keyPath, type: 'array-add', count: added.length })
        }
      }
      // 已有标量/不同结构：保留 target，不覆盖
    }
    return { value: out, changes }
  }
  return { value: base, changes }
}

const args = parseArgs(process.argv.slice(2))
const target = loadYaml(args.settings)
const template = loadYaml(args.template)
const merged = merge(target, template)

console.log(`模板: ${args.template}`)
console.log(`目标: ${args.settings}`)
console.log(`差异: ${merged.changes.length} 处`)
for (const c of merged.changes.slice(0, 50)) {
  if (c.type === 'array-add') console.log(`  + ${c.key} (array +${c.count})`)
  else console.log(`  + ${c.key}`)
}
if (merged.changes.length > 50) console.log(`  … 还有 ${merged.changes.length - 50} 处`)

if (args.dryRun) {
  console.log('\n（--dry-run：未写入）')
  process.exit(0)
}

if (!args.yes) {
  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question('\n应用以上合并? [y/N] ')
  rl.close()
  if (!/^y/i.test(ans)) {
    console.log('已取消')
    process.exit(0)
  }
}

if (!existsSync(args.settings)) {
  mkdirSync(dirname(args.settings), { recursive: true })
} else {
  const backup = `${args.settings}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  copyFileSync(args.settings, backup)
  console.log(`\n已备份: ${backup}`)
}

writeFileSync(args.settings, YAML.stringify(merged.value, { lineWidth: 0 }))
console.log('✅ 已合并写回 settings.yaml')
console.log('提示：DSH 热重载不保证生效，建议重启 dsh 进程。')
