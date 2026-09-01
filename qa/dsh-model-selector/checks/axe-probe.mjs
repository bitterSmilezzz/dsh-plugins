import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const url = readFileSync('agent-qa.config.yaml', 'utf8').match(/^\s+url:\s*(\S+)/m)?.[1]
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.dms-trigger', { timeout: 45000 })

const run = async (label) => {
  const res = await page.evaluate(async (src) => {
    if (!window.axe) new Function(src)()
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help.slice(0, 70),
      n: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((x) => (x.target ?? []).join(' ').slice(0, 90)),
      sample: x0summary(v),
    }))
    function x0summary(v) {
      const n = v.nodes[0]
      return (n?.any?.[0]?.message ?? n?.all?.[0]?.message ?? '').slice(0, 150) + ' || ' + (n?.html ?? '').slice(0, 110)
    }
  }, axeSource)
  console.log(`### ${label}: ${res.length} violation(s)`)
  for (const v of res) console.log(JSON.stringify(v))
  return res
}

const before = await run('app, menu closed')
await page.locator('.dms-trigger').click()
await page.waitForTimeout(800)
const withMenu = await run('app, seat menu OPEN')
await page.keyboard.press('Escape')
await browser.close()
console.log(JSON.stringify({ closed: before.map((v) => v.id), open: withMenu.map((v) => v.id) }))
