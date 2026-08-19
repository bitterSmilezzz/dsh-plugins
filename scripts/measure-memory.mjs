#!/usr/bin/env node
/**
 * measure-memory.mjs — DSH web 内存稳定性检测（泄漏粗筛）。
 *
 * 打开运行中的 DSH web，采样 JS 堆内存：
 *   1. 基线（networkidle 后）
 *   2. 闲置 50s（每 10s 采样）——观察是否持续增长（泄漏信号）
 *   3. 打开/关闭设置页 ×2（交互压力）
 *   4. 闲置 20s 观察回落
 *
 * Usage:
 *   DSH_WEB_URL=http://127.0.0.1:3080 node scripts/measure-memory.mjs
 *   node scripts/measure-memory.mjs --json
 */
import { chromium } from 'playwright'

const url = process.env.DSH_WEB_URL || 'http://127.0.0.1:3080'
const json = process.argv.includes('--json')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (err) => errors.push(err.message))
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })

const samples = []
async function sample(label) {
  const m = await page.evaluate(() =>
    performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null)
  samples.push({ label, usedMB: m ? Math.round(m.used / 1048576) : null, totalMB: m ? Math.round(m.total / 1048576) : null })
  console.log(`  ${label.padEnd(28)} used ${samples.at(-1).usedMB} MB / total ${samples.at(-1).totalMB} MB`)
}

async function clickText(text) {
  const locator = page.getByText(text, { exact: false }).first()
  try {
    if ((await locator.count()) > 0) { await locator.click({ timeout: 3000 }); await page.waitForTimeout(1500); return true }
  } catch {}
  return false
}

const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(3000)
console.log(`HTTP ${resp?.status()}\n--- 采样 ---`)
await sample('t0 基线')

for (let i = 1; i <= 5; i++) {
  await page.waitForTimeout(10000)
  await sample(`t${i} 闲置 +${i * 10}s`)
}

// 交互压力：开/关设置页两轮
for (let round = 1; round <= 2; round++) {
  const opened = await clickText('Settings') || await clickText('设置')
  await sample(`r${round} 设置页开`)
  await clickText('Close') || await clickText('关闭') || await page.keyboard.press('Escape')
  await page.waitForTimeout(2000)
  await sample(`r${round} 设置页关`)
}

await page.waitForTimeout(20000)
await sample('闲置 20s 后（GC 回落）')

await browser.close()

const used = samples.map((s) => s.usedMB)
const base = used[0], idleEnd = used[5], afterGc = used.at(-1)
const growth = idleEnd - base
console.log(`\n--- 结论 ---`)
console.log(`基线 ${base}MB → 闲置末期 ${idleEnd}MB（增长 ${growth > 0 ? '+' : ''}${growth}MB）→ GC 后 ${afterGc}MB`)
if (afterGc - base > 15) console.log('⚠ 疑似泄漏：GC 后仍比基线高 >15MB，建议深入 profiling')
else if (growth > 15) console.log('⚠ 闲置期持续增长 >15MB，需观察 GC 是否回收')
else console.log('✓ 内存稳定：闲置无持续增长，交互后 GC 回落正常')
if (errors.length) console.log(`页面错误 ${errors.length} 个: ${errors.slice(0, 3).join(' | ')}`)
if (json) console.log(JSON.stringify({ url, samples, errors }, null, 2))
process.exit(0)
