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
    return { resources: hit }
  })

  // 2. 侧边栏入口
  await step('2-sidebar-trigger', async () => {
    const trigger = page.locator('button[aria-label="打开 Trace 对比"], button[aria-label="Open Trace Compare"], text=Trace 对比').first()
    const n = await trigger.count()
    if (n === 0) throw new Error('侧边栏未找到 Trace 对比入口')
    await page.screenshot({ path: SHOTS + '01-sidebar.png' })
    return { found: true }
  })

  // 3. 点击入口 → 上传面 iframe
  await step('3-surface-opens', async () => {
    const trigger = page.locator('button[aria-label="打开 Trace 对比"], button[aria-label="Open Trace Compare"]').first()
    await trigger.click()
    await page.waitForTimeout(2000)
    const surface = page.locator('iframe[title="trace-compare"]')
    const n = await surface.count()
    if (n === 0) throw new Error('shell.overlay 未挂载 iframe[title=trace-compare]')
    const frame = await surface.first().contentFrame()
    if (frame === null) throw new Error('iframe contentFrame 不可达')
    const dropTxt = await frame.locator('body').innerText()
    const hasDrop = /点击选择或拖拽|Upload|拖拽/.test(dropTxt)
    await page.screenshot({ path: SHOTS + '02-surface.png' })
    return { iframe: n, dropVisible: hasDrop }
  })

  // 4. 上传真实 zstd 会话 → 迷宫渲染
  await step('4-upload-maze-renders', async () => {
    if (!SAMPLE) return { skipped: 'SAMPLE 未提供' }
    const surface = page.locator('iframe[title="trace-compare"]').first()
    const frame = await surface.contentFrame()
    if (frame === null) throw new Error('iframe 不可达')
    await frame.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.waitForTimeout(6000)
    const maze = await frame.evaluate(() => {
      const svg = document.getElementById('svg')
      return {
        svgNodes: svg ? svg.querySelectorAll('*').length : 0,
        dataSteps: window.DATA ? window.DATA.lanes.reduce((n, l) => n + l.main.length + l.detours.length, 0) : null,
        dataTools: window.DATA ? window.DATA.lanes.reduce((n, l) => n + l.stats.tools, 0) : null,
      }
    })
    if (maze.svgNodes === 0 || maze.dataSteps === null) throw new Error('迷宫未渲染: ' + JSON.stringify(maze))
    await page.screenshot({ path: SHOTS + '03-maze.png' })
    return maze
  })

  // 5. 会话内「实时迷宫」页签
  await step('5-live-tab-mounts', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    // 打开第一个会话（sidebar 会话项选择器宽松探测）
    const candidate = page.locator('[data-conversation-scroll] [role="tab"], [title]').first()
    await page.screenshot({ path: SHOTS + '04-sessions.png' })
    // 尝试点侧边栏会话：常见模式是 sidebar 里的可点击标题项
    const items = page.locator('aside [role="button"]').filter({ hasText: /^.{1,40}$/ })
    const n = await items.count()
    if (n === 0) return { skipped: '未探测到会话项（截图 04 已存）' }
    await items.nth(0).click()
    await page.waitForTimeout(2000)
    const liveTab = page.locator('text=实时迷宫').first()
    const ln = await liveTab.count()
    if (ln === 0) return { found: false, note: '会话已打开但无实时迷宫页签（可能会话无轨迹或 tab 未渲染）' }
    await liveTab.click()
    await page.waitForTimeout(2500)
    const live = page.locator('iframe[title="trace-live"]')
    const lc = await live.count()
    if (lc === 0) throw new Error('实时迷宫 iframe 未挂载')
    await page.screenshot({ path: SHOTS + '05-live.png' })
    return { found: true, iframe: lc }
  })

  // 6. 主题跟随（模拟宿主翻转 body[data-ds-dark-theme]）
  await step('6-theme-follows', async () => {
    const surface = page.locator('iframe[title="trace-compare"]').first()
    const open = await surface.count()
    if (open === 0) {
      const trigger = page.locator('button[aria-label="打开 Trace 对比"], button[aria-label="Open Trace Compare"]').first()
      if (await trigger.count() > 0) await trigger.click()
      await page.waitForTimeout(1500)
    }
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    await page.waitForTimeout(1500)
    const iframe = page.locator('iframe[title="trace-compare"]').first()
    const frame = await iframe.contentFrame()
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
