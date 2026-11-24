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
      await block.getByText("Зашло", { exact: true }).waitFor()
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
    const summary = page.getByRole("table", { name: "Результаты прогнозов на сыгранных картах" })
    for (const [label, wins, losses, odds, bank] of [
      ["PRE", 42, 24, "1,63", "75,12"], ["POST · 0,25", 45, 21, "1,58", "170,71"],
      ["POST · 0,5", 45, 21, "1,58", "170,71"], ["POST · 1,0", 43, 23, "1,59", "96,52"],
      ["POST · 1,25", 43, 23, "1,59", "96,52"]
    ]) {
      const row = summary.getByRole("row").filter({has: page.getByRole("rowheader", {name: label, exact: true})})
      const cells = await row.locator("td").allTextContents()
      assert.deepEqual(cells.slice(0,2), [String(wins),String(losses)])
      assert(cells[2].startsWith(odds))
      assert.equal(cells[3], "$" + bank)
    }
    const maps = page.locator(".history-panel tbody tr")
    assert.equal(await maps.count(), 66)
    assert.equal(await maps.locator(".stage-verdict strong").filter({ hasText: /^(Зашло|Не зашло)$/ }).count(), 132)
    assert.equal(await maps.getByText(/Групповой этап · Группа/).count(), 30)
    assert.equal(await maps.getByText(/^Плей-офф ·/).count(), 36)
    assert.equal(await maps.getByText("Плей-офф · Гранд-финал", { exact: true }).count(), 4)
    assert.equal(await maps.getByText(/^Кэф\. /).count(), 132)
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
