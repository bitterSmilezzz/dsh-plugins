#!/usr/bin/env node
/**
 * measure-load.mjs — DSH web 加载性能测量（资源占用视角，真实数据）。
 *
 * 打开运行中的 DSH web，采集：
 *   - 导航指标（DOMContentLoaded / load / 总传输）
 *   - JS 资源按 decodedBodySize 排序（找 bundle client 大头）
 *   - JS 堆内存（performance.memory）
 *   - console/page 错误（加载期）
 *
 * Usage:
 *   DSH_WEB_URL=http://127.0.0.1:3080 node scripts/measure-load.mjs
 *   node scripts/measure-load.mjs --json        # 机器可读输出
 */
import { chromium } from 'playwright'

const url = process.env.DSH_WEB_URL || 'http://127.0.0.1:3080'
const json = process.argv.includes('--json')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`)
})
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`))

const t0 = Date.now()
const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(1500)
const wallMs = Date.now() - t0

const data = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const resources = performance.getEntriesByType('resource')
  const js = resources
    .filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'))
    .map((r) => ({
      name: r.name.replace(/^https?:\/\/[^/]+/, ''),
      transfer: r.transferSize,
      decoded: r.decodedBodySize,
      ms: Math.round(r.duration),
    }))
    .sort((a, b) => b.decoded - a.decoded)
  const totalJsTransfer = js.reduce((s, r) => s + r.transfer, 0)
  const totalJsDecoded = js.reduce((s, r) => s + r.decoded, 0)
  return {
    nav: nav ? {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      totalDuration: Math.round(nav.duration),
      transfer: nav.transferSize,
      decoded: nav.decodedBodySize,
    } : null,
    js,
    totalJsTransfer,
    totalJsDecoded,
    memory: performance.memory
      ? { usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576), totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576) }
      : null,
  }
})

await browser.close()

if (json) {
  console.log(JSON.stringify({ url, wallMs, httpStatus: resp?.status(), errors, ...data }, null, 2))
} else {
  console.log(`DSH web: ${url}  HTTP ${resp?.status()}  总耗时 ${wallMs} ms`)
  if (data.nav) {
    console.log(`导航: DOMContentLoaded ${data.nav.domContentLoaded}ms  load ${data.nav.load}ms  navigation ${data.nav.totalDuration}ms  (transfer ${(data.nav.transfer/1024).toFixed(0)}KB / decoded ${(data.nav.decoded/1024).toFixed(0)}KB)`)
  }
  console.log(`JS 资源: ${data.js.length} 个, 总 transfer ${(data.totalJsTransfer/1024).toFixed(0)} KB, 总 decoded ${(data.totalJsDecoded/1024).toFixed(0)} KB`)
  if (data.memory) console.log(`JS 堆: used ${data.memory.usedMB} MB / total ${data.memory.totalMB} MB`)
  console.log('\nTop 15 JS 资源（decoded 降序）:')
  for (const r of data.js.slice(0, 15)) {
    console.log(`  ${(r.decoded/1024).toFixed(0).padStart(6)} KB decoded / ${(r.transfer/1024).toFixed(0).padStart(5)} KB xfer / ${String(r.ms).padStart(4)} ms  ${r.name}`)
  }
  if (errors.length) {
    console.log(`\n加载期错误 ${errors.length} 个:`)
    for (const e of errors.slice(0, 10)) console.log('  ' + e)
  } else {
    console.log('\n加载期无 console/page 错误 ✓')
  }
}
process.exit(0)
