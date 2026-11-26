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
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: "Polymarket", exact: true }) })
      .filter({ hasText: "справочная цена до старта" })
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
    for (const [label, wins, losses] of [
      ["PRE", 42, 24], ["POST · 0,25", 45, 21], ["POST · 0,5", 45, 21],
      ["POST · 1,0", 43, 23], ["POST · 1,25", 43, 23]
    ]) {
      const row = summary.getByRole("row").filter({has: page.getByRole("rowheader", {name: label, exact: true})})
      const cells = await row.locator("td").allTextContents()
      assert.deepEqual(cells.slice(0,2), [String(wins),String(losses)])
      const coverage = cells[2].match(/(\d+) из 66 карт(?: · из истории рынка: (\d+))?$/)
      assert(coverage)
      assert(Number(coverage[1]) > 0 && Number(coverage[1]) <= 66)
      assert(Number(coverage[2]) > 0 && Number(coverage[2]) <= Number(coverage[1]))
      assert.match(cells[3], /^\$-?[\d\s]+,\d{2}$/)
    }
    const maps = page.locator(".history-panel tbody tr")
    assert.equal(await maps.count(), 66)
    assert.equal(await maps.locator(".stage-verdict strong").filter({ hasText: /^(Зашло|Не зашло)$/ }).count(), 132)
    assert.equal(await maps.getByText(/Групповой этап · Группа/).count(), 30)
    assert.equal(await maps.getByText(/^Плей-офф ·/).count(), 36)
    assert.equal(await maps.getByText("Плей-офф · Гранд-финал", { exact: true }).count(), 4)
    const withPrice = await maps.getByText(/^(Ретроспективная котировка|Котировка) /).count()
    const withoutPrice = await maps.getByText(/^Нет подтверждённой цены (до|после) драфта$/).count()
    assert(withPrice > 0)
    assert.equal(withPrice + withoutPrice, 132)

    home.hash = "/schedule?tournament=1win-essence-3&view=groups"
    await page.goto(home.href)
    await page.getByRole("region", { name: "Группа D", exact: true }).waitFor()
    assert.equal(await page.locator(".schedule-groups .playin-group").count(), 4)
    const group = page.getByRole("region", { name: "Группа B", exact: true })
    await group.getByRole("button", { name: "GamerLegion", exact: true }).click()
    assert.equal(await page.locator(".tracker-series").count(), 2)
    const aurora = page.locator(".tracker-series").filter({ hasText: "Aurora Gaming" })
    assert.deepEqual(await aurora.locator(".tracker-series-side > strong").allTextContents(), ["1", "2"])
    await aurora.locator("summary").click()
    await aurora.getByRole("link", { name: /Карта 2/ }).click()
    await page.getByRole("heading", { level: 1 }).getByText("Aurora Gaming").waitFor()

    home.hash = "/schedule?tournament=pari-universe&view=markets"
    await page.goto(home.href)
    await page.getByRole("heading", { name: "Котировки до старта карты" }).waitFor()
    await page.getByRole("searchbox", { name: "Поиск котировок" }).fill("9056215433")
    const recovered = page.locator(".tournament-price-rows > tr")
    assert.equal(await recovered.count(), 1)
    await recovered.getByRole("link", { name: "Polymarket ↗" }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))

    home.hash = "/schedule?tournament=1win-essence-3-play-in&view=markets"
    await page.goto(home.href)
    await page.getByText("55 из 55 карт с ценой · Polymarket 55 из 55", { exact: true }).waitFor()
    await page.getByRole("button", { name: "Группы", exact: true }).click()
    await page.getByRole("heading", { name: "Группа A", exact: true }).waitFor()
    await page.reload()
    await page.getByRole("heading", { name: "Группа B", exact: true }).waitFor()
    assert.equal(await page.locator(".playin-group tbody tr").count(), 10)

    await page.getByRole("button", { name: "PARI Universe", exact: true }).click()
    await page.locator(".schedule-groups").getByRole("region", { name: "Группа B", exact: true }).waitFor()
    assert.equal(await page.locator(".schedule-groups .playin-group").count(), 2)
    assert.equal(await page.locator(".schedule-groups tbody tr").count(), 10)

    const fresh = await browser.newPage()
    await fresh.route("**/data/verified-results.json", async (route) => {
      const original = await route.fetch()
      const data = await original.json()
      data.tournaments["new-tournament-group-test"] = {
        name: "Тестовый турнир",
        series: {
          "cs-1234-5678": {
            group: { id: "9501", name: "Группа Z" },
            phase: "Групповой этап · Группа Z",
            team_a: "Test Team Alpha",
            team_b: "Test Team Beta",
            starts_at_utc: "2099-01-01T12:00:00Z",
            best_of: 3,
            finished: false,
            maps: [],
          },
        },
      }
      await route.fulfill({ response: original, json: data })
    })
    home.hash = "/schedule?tournament=new-tournament-group-test"
    await fresh.goto(home.href)
    const futureGroup = fresh.getByRole("region", { name: "Группа Z", exact: true })
    await futureGroup.getByRole("button", { name: "Test Team Alpha", exact: true }).waitFor()
    await futureGroup.getByRole("button", { name: "Test Team Beta", exact: true }).waitFor()
    assert.equal(await futureGroup.getByText("сыграно 0", { exact: true }).count(), 2)
    await fresh.close()

    home.hash = "/series/cs-10003480-10100672/maps/3?tournament=blast-slam-ix"
    await page.goto(home.href)
    const blastResult = page.getByRole("region", { name: "Результат и прогнозы" })
    await blastResult.getByText("Xtreme Gaming · 26:54", { exact: true }).waitFor()
    await blastResult.getByRole("link", { name: /Steam Match ID 9100301435/ }).waitFor()
    assert.equal(await blastResult.getByText("Ретроспективный расчёт", { exact: true }).count(), 2)

    home.hash = "/stats?tournament=blast-slam-ix"
    await page.goto(home.href)
    const blastStats = page.getByRole("table", { name: "Результаты прогнозов на сыгранных картах" })
    await blastStats.getByRole("rowheader", { name: "POST · 1,25", exact: true }).waitFor()
    assert.equal(await blastStats.getByRole("rowheader").count(), 5)
    const blastCount = page.locator(".report-counts > div")
      .filter({ has: page.getByText("карт с результатом", { exact: true }) })
    assert(Number(await blastCount.locator("strong").textContent()) >= 58)

    home.hash = "/schedule?tournament=blast-slam-ix&view=groups"
    await page.goto(home.href)
    await page.locator(".schedule-groups").getByRole("region", { name: "Группа D", exact: true }).waitFor()
    assert.equal(await page.locator(".schedule-groups .playin-group").count(), 4)

    await page.getByRole("button", { name: "Плей-офф", exact: true }).click()
    const bracket = page.locator(".playoff-bracket")
    await bracket.getByRole("heading", { name: "Сетка плей-офф", exact: true }).waitFor()
    assert.equal(await bracket.getByRole("article").count(), 10)
    const grandFinal = bracket.getByRole("article", { name: "Гранд-финал", exact: true })
    await grandFinal.getByText("BO5", { exact: true }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    const opening = bracket.getByRole("article", { name: "Четвертьфинал верхней сетки 1", exact: true })
    await opening.getByText("GamerLegion", { exact: true }).waitFor()
    await opening.getByText("Aurora Gaming", { exact: true }).waitFor()
    await opening.getByRole("link", { name: "Карта 1", exact: true }).click()
    const openingHeading = page.getByRole("heading", { level: 1 })
    await openingHeading.getByText("GamerLegion").waitFor()
    await openingHeading.getByText("Aurora Gaming").waitFor()
    const openingOutcome = page.getByRole("region", { name: "Результат и прогнозы" })
    await openingOutcome.getByRole("link", { name: /Steam Match ID 9106031971/ }).waitFor()
    await openingOutcome.getByText(/Изменение котировок PRE → POST.*ретроспектива/s).waitFor()
    const historicalPost = openingOutcome.getByText(/Ретроспективная котировка 2,20 · Polymarket/)
    await historicalPost.waitFor()
    assert.equal(await historicalPost.locator("time").getAttribute("datetime"), "2026-11-26T10:10:07.000Z")
    await openingOutcome.getByText("Прогноз записан после подтверждённого окна POST", { exact: true }).waitFor()

    assert.deepEqual(errors, [], "Unhandled application error on the published site")
    console.log("Dashboard passed: 1win and BLAST results, exact map forecasts, groups, CLOB odds and mobile layout.")
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
