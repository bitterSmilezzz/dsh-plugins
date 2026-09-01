import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const url = readFileSync('agent-qa.config.yaml', 'utf8').match(/^\s+url:\s*(\S+)/m)?.[1]
if (!url) throw new Error('no target url in config')

function executable() {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH }
  try {
    const p = chromium.executablePath()
    require('node:fs').accessSync(p)
    return { executablePath: p }
  } catch {
    return { channel: 'chrome' }
  }
}

const probe = await (async () => {
  const browser = await chromium.launch({ headless: true, ...executable() })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.dms-trigger', { timeout: 45000 })
  const out = await page.evaluate(async () => {
    const vis = (el) => el !== null && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'
    const rgba = (el) => getComputedStyle(el).backgroundColor
    const trigger = document.querySelector('.dms-trigger')
    const rect = trigger.getBoundingClientRect()
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    trigger.click()
    await new Promise((r) => setTimeout(r, 600))
    const menu = document.querySelector('.dms-menu')
    const menuWidget = document.querySelector('.dms-menu [role="menu"]')
    const rows = [...document.querySelectorAll('[role="menuitemradio"]')]
    const insideMenu = rows.every((r) => menuWidget !== null && menuWidget.contains(r))
    const checked = rows.filter((r) => r.getAttribute('aria-checked') === 'true')
    const selected = document.querySelector('.dms-model-optionSelected')
    const plain = rows.find((r) => r !== selected)
    const mrect = menu?.getBoundingClientRect()
    const value = document.querySelector('.dms-effort-value')
    const desc = document.querySelector('.dms-effort-desc')
    return {
      triggerVisible: vis(trigger),
      triggerBox: { top: Math.round(rect.top), bottom: Math.round(rect.bottom) },
      triggerHaspopup: trigger.getAttribute('aria-haspopup'),
      triggerExpanded: trigger.getAttribute('aria-expanded'),
      menuPresent: menu !== null,
      menuWidgetPresent: menuWidget !== null,
      menuLabel: menuWidget?.getAttribute('aria-label') ?? null,
      radiosInsideMenu: insideMenu,
      menuClassList: menu ? [...menu.classList].join(' ') : null,
      menuInsideViewport: mrect ? mrect.top >= 0 && mrect.bottom <= innerHeight : null,
      menuBox: mrect ? { top: Math.round(mrect.top), bottom: Math.round(mrect.bottom), height: Math.round(mrect.height) } : null,
      radioRows: rows.length,
      checkedCount: checked.length,
      selectedBg: selected ? rgba(selected) : null,
      plainBg: plain ? rgba(plain) : null,
      sliderPresent: vis(document.querySelector('.dms-effort-slider')),
      effortValue: value?.textContent?.trim() ?? null,
      effortValueVisible: vis(value),
      effortDesc: desc?.textContent?.trim().slice(0, 60) ?? null,
      badges: [...document.querySelectorAll('.dms-badge')].length,
      badgeTitles: [...document.querySelectorAll('.dms-badge')].map((b) => b.getAttribute('title') ?? ''),
      providerTags: [...document.querySelectorAll('.dms-model-option-provider')].length,
      optionRows: [...document.querySelectorAll('.dms-model-option')].length,
    }
  })
  const search = page.locator('.dms-searchInput')
  await search.fill('a')
  await page.waitForTimeout(700)
  const styleOf = await page.evaluate(() => {
    const tag = document.querySelector('.dms-model-option-provider')
    const name = document.querySelector('.dms-model-option-name')
    const rows = [...document.querySelectorAll('.dms-model-option')]
    return {
      searchRows: rows.length,
      searchProviderTags: [...document.querySelectorAll('.dms-model-option-provider')].length,
      tag: tag === null || name === null ? null : {
        text: tag.textContent?.slice(0, 24),
        fontSize: getComputedStyle(tag).fontSize,
        color: getComputedStyle(tag).color,
        visible: tag.offsetParent !== null,
        nameFontSize: getComputedStyle(name).fontSize,
      },
    }
  })
  await search.fill('')
  await page.keyboard.press('Escape')
  // Short viewport: the menu must stay inside the viewport and the model list
  // must scroll instead of being cut off (covers test 60's resize scenario,
  // which the agent-qa LLM judge cannot execute — it has no resize tool).
  // The upward/downward DIRECTION decision itself is covered by unit tests on
  // menuFit.ts (dmsMenuAbove/dmsBelowMaxHeight), not by a browser stub — a
  // fresh conversation has no scrollable content, so the judge cannot move the
  // trigger near the viewport top to reproduce the downward case.
  await page.setViewportSize({ width: 1440, height: 400 })
  await page.waitForTimeout(200)
  const short = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const trigger = document.querySelector('.dms-trigger')
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    trigger.click()
    await sleep(600)
    const menu = document.querySelector('.dms-menu')
    const groups = document.querySelector('.dms-groups')
    const mrect = menu?.getBoundingClientRect()
    return {
      shortMenuPresent: menu !== null,
      shortMenuInsideViewport: mrect ? mrect.top >= 0 && mrect.bottom <= innerHeight : null,
      shortMenuHeight: mrect ? Math.round(mrect.height) : null,
      shortViewportHeight: innerHeight,
      shortGroupsScrollable: groups ? groups.scrollHeight > groups.clientHeight : null,
      shortGroupsOverflowY: groups ? getComputedStyle(groups).overflowY : null,
    }
  })
  await page.keyboard.press('Escape')
  await browser.close()
  return { out, styleOf, errors, short }
})()

const report = { ...probe.out, ...probe.styleOf, ...probe.short, consoleErrors: probe.errors.slice(0, 3) }
const fails = []
if (!report.triggerVisible) fails.push('seat trigger not visible')
if (!report.menuPresent) fails.push('menu did not open')
if (report.menuWidgetPresent !== true) fails.push('no role=menu inside popup')
if (report.radiosInsideMenu !== true) fails.push('menuitemradio rows outside role=menu')
if (report.triggerExpanded !== 'true') fails.push(`trigger aria-expanded=${report.triggerExpanded}`)
if (report.radioRows < 2) fails.push(`menuitemradio rows=${report.radioRows}`)
if (report.checkedCount !== 1) fails.push(`aria-checked count=${report.checkedCount}`)
if (report.menuInsideViewport !== true) fails.push('menu overflows viewport')
if (report.selectedBg === report.plainBg) fails.push('selected row has no distinct background')
if (report.sliderPresent && (!report.effortValue || !report.effortValueVisible)) fails.push('slider has no visible readout')
if (report.searchRows === 0) fails.push('search returned no rows (cannot judge provider tag)')
if (report.searchRows > 0 && report.searchProviderTags === 0) fails.push('no provider tag in search results')
if (report.tag && (!report.tag.visible || parseFloat(report.tag.fontSize) >= parseFloat(report.tag.nameFontSize) || report.tag.color === 'rgba(0, 0, 0, 0)')) fails.push('provider tag not legible-as-secondary')
// 推理徽章必须带非空 title（headless 下 hover 弹不出原生 title，agent-qa LLM
// judge 看不到；这里是确定性断言）。
if (report.badges > 0 && report.badgeTitles.some((t) => t === '')) fails.push(`badge without title (${report.badges} badges)`)
if (report.badges > 0 && !report.badgeTitles.some((t) => t.length > 0)) fails.push('no badge carries a non-empty title hint')
// 短视口：菜单必须仍在视口内，且模型列表可滚动（而不是被裁掉）。
// 向上/向下弹的方向决策本身由 menuFit.ts 的单测覆盖（浏览器 stub 会造成
// 布局与决策不一致的人为场景，故不在 DOM 层断言方向翻转）。
if (report.shortMenuPresent !== true) fails.push('short viewport: menu did not open')
if (report.shortMenuInsideViewport !== true) fails.push('short viewport: menu overflows viewport')
if (report.shortGroupsScrollable !== true) fails.push(`short viewport: list not scrollable (overflowY=${report.shortGroupsOverflowY})`)
console.log(JSON.stringify(report, null, 1))
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS (read-only subset)')
process.exit(fails.length ? 1 : 0)
