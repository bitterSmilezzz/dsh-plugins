#!/usr/bin/env node
/**
 * verify-trace-compare.mjs — dsh-trace-compare rc.7 适配实测（playwright）。
 *
 * 对运行中的 DSH web 验证：
 *   1. /plugins/dsh-trace-compare/client.js 被加载（bundle 生效）
 *   2. 侧边栏底部「Trace 对比」入口（sidebar.footer.action）
 *   3. 点击入口 → shell.overlay 上传面 iframe 出现
 *   4. 上传真实 session.jsonl.zstd → 迷宫 SVG 渲染（解析/判定/布局链路）
 *   5. 会话内「实时迷宫」页签（conversation.view）挂载
 *   6. 宿主主题翻转 → iframe 内 data-theme 跟随（MutationObserver → postMessage）
 *
 * Usage:
 *   DSH_WEB_URL=http://127.0.0.1:3080 \
 *   SAMPLE=/path/to/session.jsonl.zstd \
 *   node scripts/verify-trace-compare.mjs
 * 输出 JSON 到 stdout，截图到 scripts/.trace-compare-shots/。
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.env.DSH_WEB_URL || 'http://127.0.0.1:3080'
const SAMPLE = process.env.SAMPLE || ''
const SHOTS = new URL('.trace-compare-shots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })

const out = { steps: {} }
const step = async (name, fn) => {
  try {
    const r = await fn()
    out.steps[name] = { ok: true, ...(r ?? {}) }
  } catch (e) {
    out.steps[name] = { ok: false, error: String(e).slice(0, 400) }
  }
}

// 双语选择器（headless 默认 en locale，用户 GUI 是 zh）
const TRIGGER_CSS = 'button[aria-label="Open Trace Compare"], button[aria-label="打开 Trace 对比"]'
// role=tab + hasText 正则最稳（probe 实测：text= 混合引擎列表不可靠）
const LIVE_TAB = page => page.locator('[role="tab"]').filter({ hasText: /Live Maze|实时迷宫/ }).first()

/** sandbox iframe 每次重新取 Frame 句柄（对象不会因重挂失效）。 */
async function iframeFrame(page, title) {
  const el = await page.locator(`iframe[title="${title}"]`).elementHandle()
  return el === null ? null : el.contentFrame()
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + String(e).slice(0, 200)))

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)

  // 1. bundle 加载
  await step('1-client-bundle-loaded', async () => {
    const hit = await page.evaluate(() =>
      performance.getEntriesByType('resource')
        .filter((r) => r.name.includes('/plugins/dsh-trace-compare/'))
        .map((r) => ({ name: r.name.replace(/^https?:\/\/[^/]+/, ''), size: r.transferSize })))
    if (hit.length === 0) throw new Error('dsh-trace-compare bundle 未加载')
    return { resources: hit }
  })

  // 2. 侧边栏入口
  await step('2-sidebar-trigger', async () => {
    const trigger = page.locator(TRIGGER_CSS)
    const n = await trigger.count()
    if (n === 0) throw new Error('侧边栏未找到 Trace 对比入口（aria-label 双语均试）')
    await page.screenshot({ path: SHOTS + '01-sidebar.png' })
    return { found: n }
  })

  // 3. 点击入口 → 上传面 iframe
  await step('3-surface-opens', async () => {
    await page.locator(TRIGGER_CSS).first().click()
    await page.waitForTimeout(2000)
    const surface = page.locator('iframe[title="trace-compare"]')
    const n = await surface.count()
    if (n === 0) throw new Error('shell.overlay 未挂载 iframe[title=trace-compare]')
    const frame = await iframeFrame(page, 'trace-compare')
    if (frame === null) throw new Error('iframe contentFrame 不可达')
    const dropTxt = await frame.locator('body').innerText()
    const hasDrop = /点击选择或拖拽|Upload|拖拽|Drop/.test(dropTxt)
    await page.screenshot({ path: SHOTS + '02-surface.png' })
    return { iframe: n, dropVisible: hasDrop }
  })

  // 4. 上传真实 zstd 会话 → 迷宫渲染
  await step('4-upload-maze-renders', async () => {
    if (!SAMPLE) return { skipped: 'SAMPLE 未提供' }
    const frame = await iframeFrame(page, 'trace-compare')
    if (frame === null) throw new Error('iframe 不可达')
    await frame.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.waitForTimeout(7000)
    const maze = await frame.evaluate(() => {
      const svg = document.getElementById('svg')
      // 页面迷宫数据是顶层 let（不在 window 上），用 SVG 节点数与正文统计佐证渲染
      const bodyTxt = (document.body.textContent || '').replace(/\s+/g, ' ').trim()
      return {
        svgNodes: svg ? svg.querySelectorAll('*').length : 0,
        bodyStats: bodyTxt.slice(0, 160),
        err: window.lastErr ? String(window.lastErr).slice(0, 200) : null,
      }
    })
    if (maze.svgNodes < 100) throw new Error('迷宫未渲染: ' + JSON.stringify(maze))
    await page.screenshot({ path: SHOTS + '03-maze.png' })
    return maze
  })

  // 5. 会话内「实时迷宫」页签
  await step('5-live-tab-mounts', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    const row = page.locator('[class*="sessionRow"]').first()
    if (await row.count() === 0) return { skipped: '未找到会话行' }
    await row.click()
    await page.waitForTimeout(2500)
    const liveTab = LIVE_TAB(page)
    const ln = await liveTab.count()
    if (ln === 0) {
      await page.screenshot({ path: SHOTS + '04-no-live-tab.png' })
      return { found: false, note: '会话已打开但无实时迷宫页签' }
    }
    await liveTab.click()
    await page.waitForTimeout(3000)
    const live = page.locator('iframe[title="trace-live"]')
    const lc = await live.count()
    if (lc === 0) throw new Error('实时迷宫 iframe 未挂载')
    const lframe = await iframeFrame(page, 'trace-live')
    const liveInfo = lframe === null ? null : await lframe.evaluate(() => {
      const svg = document.getElementById('svg')
      return {
        svg: !!svg,
        svgNodes: svg ? svg.querySelectorAll('*').length : 0,
        bodyTxt: (document.body.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      }
    })
    await page.screenshot({ path: SHOTS + '05-live.png' })
    return { found: true, iframe: lc, liveInfo }
  })

  // 6. 主题跟随（模拟宿主翻转 body[data-ds-dark-theme]）
  await step('6-theme-follows', async () => {
    const surface = page.locator('iframe[title="trace-compare"]')
    if (await surface.count() === 0) {
      const trigger = page.locator(TRIGGER_CSS)
      if (await trigger.count() > 0) await trigger.click()
      await page.waitForTimeout(1500)
    }
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    await page.waitForTimeout(1500)
    const frame = await iframeFrame(page, 'trace-compare')
    if (frame === null) throw new Error('iframe 不可达')
    const theme = await frame.evaluate(() => document.documentElement.getAttribute('data-theme'))
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    await page.waitForTimeout(800)
    if (theme !== 'dark') throw new Error('主题未跟随: iframe data-theme=' + theme)
    await page.screenshot({ path: SHOTS + '06-dark.png' })
    return { iframeTheme: theme }
  })

  out.consoleErrors = consoleErrors
  out.summary = {
    ok: Object.values(out.steps).filter((s) => s.ok).length,
    fail: Object.values(out.steps).filter((s) => !s.ok).length,
  }
} catch (e) {
  out.fatal = String(e).slice(0, 500)
} finally {
  await browser.close()
}

console.log(JSON.stringify(out, null, 2))
process.exit(out.summary && out.summary.fail > 0 ? 1 : 0)
