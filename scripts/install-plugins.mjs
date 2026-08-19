#!/usr/bin/env node
/**
 * install-plugins.mjs — 按 plugins.json 清单批量安装 deepseek-plugins 插件。
 *
 * 所有插件均已拆分为独立仓库（source=github），安装 = GitHub 直装
 * （github:<repo>#<ref>，ref 取清单）。本脚本只做选择 + 调用 dsh。
 *
 * 用法（在仓库根目录运行）：
 *   node scripts/install-plugins.mjs                      # 交互式多选
 *   node scripts/install-plugins.mjs --profile web        # 安装全部到 web profile
 *   node scripts/install-plugins.mjs -p web --only dsh-essentials,dsh-work
 *   node scripts/install-plugins.mjs -p web --skip dsh-desktop-shell
 *   node scripts/install-plugins.mjs -p web --dry-run     # 只打印将要执行的命令
 *
 * 交互模式：方向键 ↑↓ 移动、空格 切换选中、回车 确认、a 全选、n 全不选。
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

const ROOT = resolve(import.meta.dirname, '..')

function parseArgs(argv) {
  const args = { profile: 'web', only: null, skip: null, dryRun: false, interactive: false, dsh: ['dsh'] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => (i + 1 < argv.length ? argv[++i] : null)
    if (a === '-p' || a === '--profile') args.profile = next()
    else if (a === '--only') args.only = next()
    else if (a === '--skip') args.skip = next()
    else if (a === '--dsh') args.dsh = (next() ?? 'dsh').split(/\s+/).filter(Boolean)
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '-i' || a === '--interactive') args.interactive = true
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0) }
    else { console.error(`未知参数: ${a}（用 --help 查看用法）`); process.exit(1) }
  }
  return args
}

function printHelp() {
  console.log(`install-plugins.mjs — 按 plugins.json 清单批量安装 deepseek-plugins 插件

用法：
  node scripts/install-plugins.mjs                        # 交互式多选
  node scripts/install-plugins.mjs --profile web          # 装全部到 web
  node scripts/install-plugins.mjs -p web --only a,b      # 只装指定插件
  node scripts/install-plugins.mjs -p web --skip b        # 跳过指定插件
  node scripts/install-plugins.mjs -p web --dry-run       # 只打印命令
  node scripts/install-plugins.mjs -p web --dsh "pnpm --dir /path/to/deepseek-harness dsh"  # 指定 dsh 命令

说明：
  所有插件均按 plugins.json 的 github 源直装（github:<repo>#<ref>）。

选项：
  -p, --profile <name>  目标 profile（默认 web）
      --only <a,b>      只安装这些插件（逗号分隔）
      --skip <a,b>      跳过这些插件
      --dsh <cmd>       dsh 命令（默认 "dsh"；dsh 不在 PATH 时用
                        "pnpm --dir <harness路径> dsh"）
      --dry-run         只打印将要执行的命令，不实际安装
  -i, --interactive     强制交互多选（无参数时自动进入）
  -h, --help            显示帮助`)
}

/** 从 plugin-manifest.mjs list 拿全部插件（id, type, source, spec）。 */
function discoverPlugins() {
  const out = []
  const manifest = spawnSync('node', [resolve(ROOT, 'scripts/plugin-manifest.mjs'), 'list'], { encoding: 'utf8' })
  if (manifest.status === 0 && manifest.stdout) {
    for (const line of manifest.stdout.split('\n').filter(Boolean)) {
      const [id, type, source, spec] = line.split('\t')
      if (!id) continue
      out.push({ id, type: type ?? 'bundle', source: source ?? 'github', spec })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** 安装 spec：github 源补 github: 前缀（manifest list 输出 repo#ref），其余（理论不存在）回退本地路径。 */
function buildSpec(plugin) {
  if (plugin.source === 'github') {
    return plugin.spec.startsWith('github:') ? plugin.spec : `github:${plugin.spec}`
  }
  return resolve(ROOT, plugin.id)
}

/** 交互多选：↑↓ 移动、空格切换、a/n 全选/全不选、回车确认。 */
async function interactSelect(plugins) {
  let cursor = 0
  const selected = new Set(plugins.map((_, i) => i))
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const render = () => {
    process.stdout.write('\x1b[?25l')
    process.stdout.write('\x1b[2J\x1b[H')
    console.log('选择要安装的插件（↑↓ 移动 · 空格 切换 · a 全选 · n 全不选 · 回车 确认）：\n')
    plugins.forEach((p, i) => {
      const mark = selected.has(i) ? '✔' : ' '
      const cur = i === cursor ? '> ' : '  '
      console.log(`${cur}[${mark}] ${p.id}  (${p.source})`)
    })
    process.stdout.write('\x1b[?25h')
  }
  render()
  return await new Promise((resolvePromise) => {
    rl.input.setRawMode(true)
    rl.input.on('data', (key) => {
      const k = key.toString()
      if (k === '\x03') { process.exit(130) } // Ctrl+C
      if (k === '\r' || k === '\n') {
        rl.input.setRawMode(false)
        rl.close()
        console.log()
        resolvePromise([...selected].map((i) => plugins[i]))
        return
      }
      if (k === '\x1b[A' || k === 'k') { cursor = (cursor - 1 + plugins.length) % plugins.length; render() }
      else if (k === '\x1b[B' || k === 'j') { cursor = (cursor + 1) % plugins.length; render() }
      else if (k === ' ') { selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor); render() }
      else if (k === 'a' || k === 'A') { plugins.forEach((_, i) => selected.add(i)); render() }
      else if (k === 'n' || k === 'N') { selected.clear(); render() }
    })
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const plugins = discoverPlugins()
  if (plugins.length === 0) { console.error('⚠ plugins.json 无插件登记'); process.exit(1) }

  let selected
  if (args.only) {
    const wanted = new Set(args.only.split(',').map((s) => s.trim()).filter(Boolean))
    selected = plugins.filter((p) => wanted.has(p.id))
    const missing = [...wanted].filter((w) => !selected.some((p) => p.id === w))
    if (missing.length) console.warn(`⚠ 未找到插件: ${missing.join(', ')}`)
  } else if (args.skip) {
    const skipped = new Set(args.skip.split(',').map((s) => s.trim()).filter(Boolean))
    selected = plugins.filter((p) => !skipped.has(p.id))
  } else if (args.interactive || (!args.only && !args.skip && !args.dryRun && process.argv.slice(2).filter((a) => !a.startsWith('-')).length === 0 && !process.argv.slice(2).some((a) => a === '-p' || a === '--profile'))) {
    selected = await interactSelect(plugins)
  } else {
    selected = plugins
  }
  if (selected.length === 0) { console.log('没有选择任何插件，退出。'); return }

  console.log(`\n目标 profile: ${args.profile}  来源: GitHub（按 plugins.json 清单）`)
  console.log(`将安装 ${selected.length} 个插件：\n  ${selected.map((p) => p.id).join('\n  ')}\n`)

  if (args.dryRun) {
    for (const p of selected) console.log(`dsh plugin --profile ${args.profile} add ${buildSpec(p)}`)
    console.log('\n（--dry-run：未实际安装）')
    return
  }

  let failed = 0
  for (const p of selected) {
    const spec = buildSpec(p)
    console.log(`\n=== 安装 ${p.id} ===`)
    console.log(`$ ${[...args.dsh, 'plugin', '--profile', args.profile, 'add', spec].join(' ')}`)
    const res = spawnSync(args.dsh[0], [...args.dsh.slice(1), 'plugin', '--profile', args.profile, 'add', spec], {
      stdio: 'inherit', cwd: ROOT, shell: false,
    })
    if (res.status === 0) {
      console.log(`✔ ${p.id} 安装成功`)
    } else {
      failed++
      const reason = res.error ? `找不到命令「${args.dsh[0]}」` : `exit ${res.status}`
      console.error(`✘ ${p.id} 安装失败（${reason}）`)
      if (res.error) console.error(`  提示：dsh 不在 PATH 时用 --dsh 指定，例如 --dsh "pnpm --dir /path/to/deepseek-harness dsh"`)
    }
  }

  console.log(`\n完成：成功 ${selected.length - failed}/${selected.length}${failed ? `，失败 ${failed} 个` : ''}`)
  if (failed === 0) console.log(`提示：重启 dsh（${args.profile} profile）后生效。`)
  process.exit(failed ? 1 : 0)
}

main()