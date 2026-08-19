#!/usr/bin/env node
/**
 * web-regression.mjs — DSH web UI regression smoke.
 *
 * Opens the running DSH web, clicks through Settings → Plugin Market,
 * Side card, and AgentTeams surfaces, captures console/page errors and
 * screenshots.
 *
 * Usage:
 *   DSH_WEB_URL=http://127.0.0.1:3080 node scripts/web-regression.mjs
 *   DSH_WEB_URL=http://127.0.0.1:3080 node scripts/web-regression.mjs --screenshot-dir /tmp
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.DSH_WEB_URL || 'http://127.0.0.1:3080'
const args = process.argv.slice(2)
const shotDir = args.includes('--screenshot-dir')
  ? resolve(args[args.indexOf('--screenshot-dir') + 1])
  : '/tmp'
mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) logs.push(`[console:${msg.type()}] ${msg.text()}`)
})
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`))
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`))

async function clickText(text) {
  const locator = page.getByText(text, { exact: false }).first()
  try {
    if ((await locator.count()) > 0) {
      await locator.click({ timeout: 3000 })
      await page.waitForTimeout(800)
      return true
    }
  } catch {}
  return false
}

async function shot(name) {
  const p = resolve(shotDir, `${name}.png`)
  await page.screenshot({ path: p, fullPage: false })
  console.log(`screenshot: ${p}`)
}

try {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  console.log('HTTP', resp?.status())
  await page.waitForTimeout(2000)
  await shot('01-home')

  // Settings → Plugin Market
  const settings = await clickText('Settings') || await clickText('设置')
  console.log('open Settings:', settings)
  await shot('02-settings')
  const market = await clickText('插件市场') || await clickText('Plugin Market') || await clickText('Market')
  console.log('open Market:', market)
  await page.waitForTimeout(1500)
  await shot('03-market')

  // Side card settings section
  const sidecard = await clickText('Side card') || await clickText('侧边栏')
  console.log('open Side card:', sidecard)
  await shot('04-sidecard')

  // Try to open AgentTeams surface (may be in conversation area or settings)
  const teams = await clickText('AgentTeams') || await clickText('团队') || await clickText('Team')
  console.log('open AgentTeams:', teams)
  await shot('05-agentteams')

  // Close settings overlay if present
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(500)
  await shot('06-after-escape')
} catch (e) {
  logs.push(`[goto] ${e.message}`)
}

console.log('--- logs ---')
for (const l of logs.slice(0, 120)) console.log(l)
if (logs.length === 0) console.log('(no console/page errors)')
console.log('--- title ---', await page.title().catch(() => 'ERR'))
await browser.close()
