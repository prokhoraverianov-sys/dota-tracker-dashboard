const assert = require("node:assert/strict")
const { chromium } = require("playwright")

async function main() {
  if (!process.env.SITE_URL) throw new Error("Set SITE_URL to the published dashboard URL")
  const home = new URL(process.env.SITE_URL)
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    headless: true,
  })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.setDefaultTimeout(60_000)
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))

    home.hash = "/maps/116?tournament=1win-essence-3"
    await page.goto(home.href, { waitUntil: "domcontentloaded" })
    const result = page.getByRole("region", { name: "Результат и прогнозы" })
    await result.getByText("PARIVISION · 34:10", { exact: true }).waitFor()
    const steam = result.getByRole("link", { name: /Steam Match ID 9095836436/ })
    assert.equal(await steam.getAttribute("href"), "https://www.opendota.com/matches/9095836436")
    for (const stage of ["PRE", "POST"]) {
      const block = result.locator(":scope > div").filter({
        has: page.getByRole("heading", { name: stage, exact: true }),
      })
      await block.getByText("Угадано", { exact: true }).waitFor()
      await block.getByText("Выбор модели · PARIVISION", { exact: true }).waitFor()
    }
    const odds = page.getByRole("table", { name: "Архив котировок", exact: true })
      .getByRole("row").filter({ has: page.getByRole("link", { name: "Polymarket", exact: true }) })
    await odds.waitFor()
    const prices = await odds.getByRole("cell").allTextContents()
    assert.deepEqual(prices.map((value) => Number(value.replace(",", "."))), [2.41, 1.709])
    const heading = page.getByRole("heading", { level: 1 }).first()
    const fits = await heading.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return [...range.getClientRects()].every((rect) =>
        rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1)
    })
    assert(fits, "Grand final team heading extends past the mobile viewport")

    home.hash = "/stats?tournament=1win-essence-3"
    await page.goto(home.href, { waitUntil: "domcontentloaded" })
    const completed = page.locator(".report-counts > div")
      .filter({ has: page.getByText("карт с результатом", { exact: true }) })
    await completed.getByText("66", { exact: true }).waitFor()
    assert.deepEqual(errors, [], "Unhandled application error on the published site")
    console.log("Published dashboard passed: 66 results, map 116, PRE/POST, odds, mobile heading.")
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
