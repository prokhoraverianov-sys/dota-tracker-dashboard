const assert = require("node:assert/strict")
const { once } = require("node:events")
const { chromium } = require("playwright")
const archive = require("../public/data/completed-forecasts.json")

const completed = archive["e3-g-b1"].find((card) => card.map_id === 43)
const savedRetrospective = completed.retrospective_post
const { heroes_a, heroes_b, players_a, players_b } = savedRetrospective
const draft = {
  team_a: { players: players_a, heroes: heroes_a },
  team_b: { players: players_b, heroes: heroes_b },
  winner_prices: "",
  total_prices: "",
}
const finishedCard = { ...completed, retrospective_post: null }
const activeCard = {
  ...finishedCard,
  map_id: 100043,
  series_id: "active-regression",
  map_number: 2,
  revision: 0,
  tournament: "Тестовый турнир",
  result: null,
  pre: null,
  retrospective_pre: null,
}
const activeOddsPath = "/series/active-regression/maps/2/odds"
const marketUrl = "https://polymarket.com/event/active-regression-game2"
const forecast = {
  ...completed.pre,
  map_id: activeCard.map_id,
  stage: "post_draft",
  analysis: { shadow_forecast: { winner_probability_team_a: 0.61 } },
  heroes_a,
  heroes_b,
  players_a,
  players_b,
  candidates: [],
}
const missing = {
  status: "empty",
  provider: "polymarket",
  source_url: null,
  observed_at_utc: null,
  phase: "in_play",
  market_scope: "map",
  winner: null,
  duration_lines: [],
  notice: "",
}

async function mockApi(page, home) {
  await page.route("**/config.json", (route) => route.fulfill({ json: { apiUrl: home.origin } }))
  // Reproduce map 43 before an archived retrospective could satisfy the UI.
  await page.route("**/data/completed-forecasts.json", (route) => route.fulfill({ json: {} }))
  const fixture = { odds: missing, oddsReads: 0, writes: [], unexpected: [] }
  let active = activeCard
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.slice("/api/v1".length)
    if (request.method() === "GET") {
      if (path === "/auth/mode") return route.fulfill({ json: { public_access: true } })
      if (path === "/status") {
        const ready = { status: "ready", checked_at_utc: null, notice: "" }
        return route.fulfill({
          json: { source: ready, model: ready, polling_enabled: false, polling_active: false },
        })
      }
      if (path === "/catalog")
        return route.fulfill({ json: { teams: [], heroes: [...heroes_a, ...heroes_b], timezone: "Asia/Bangkok" } })
      if (path === "/maps/43") return route.fulfill({ json: finishedCard })
      if (path === "/maps/100043") return route.fulfill({ json: active })
      if (path === "/series/e3-g-b1/maps/1/odds") return route.fulfill({ json: missing })
      if (path === activeOddsPath) {
        fixture.oddsReads++
        return route.fulfill({ json: fixture.odds })
      }
    }
    if (request.method() === "POST") {
      fixture.writes.push({ path, body: request.postDataJSON() })
      if (path === "/maps/43/live" || path === "/maps/100043/live")
        return route.fulfill({
          json: {
            status: "ok",
            checked_at_utc: savedRetrospective.created_at_utc,
            source_url: savedRetrospective.source_url,
            input: draft,
            conflicts: [],
            notice: "",
          },
        })
      if (path === "/maps/43/retrospective-post")
        return route.fulfill({ json: savedRetrospective.analysis })
      if (path === "/maps/100043/forecasts/post_draft") {
        active = { ...active, revision: 1, post: forecast }
        return route.fulfill({ json: { map: active, forecast, replayed: false } })
      }
    }
    fixture.unexpected.push(request.method() + " " + path)
    return route.fulfill({ status: 404, json: {} })
  })
  return fixture
}

async function openCard(browser, home, path, run) {
  const page = await browser.newPage()
  page.setDefaultTimeout(8_000)
  try {
    const fixture = await mockApi(page, home)
    await page.clock.install()
    await page.goto(new URL("#" + path, home).href)
    await run(page, fixture)
    assert.deepEqual(fixture.unexpected, [])
  } finally {
    await page.close()
  }
}

async function verifyActiveCard(browser, home) {
  await openCard(browser, home, "/maps/100043", async (page, fixture) => {
    const provider = page.getByRole("article", { name: "Polymarket · Карта 2", exact: true })
    await provider.getByText("Нет котировок", { exact: true }).waitFor()
    for (const [a, b, at] of [
      ["1.73", "2.24", "2026-11-12T13:12:00Z"],
      ["1.91", "2.03", "2026-11-12T13:12:15Z"],
    ]) {
      const reads = fixture.oddsReads
      fixture.odds = {
        ...missing,
        status: "fresh",
        source_url: marketUrl,
        observed_at_utc: at,
        winner: { team_a: a, team_b: b },
      }
      await page.clock.fastForward(15_000)
      await provider.locator(`time[datetime="${at}"]`).waitFor()
      assert(fixture.oddsReads > reads, "active quotes were not fetched again")
      assert.equal(await provider.getByRole("link", { name: "Открыть рынок Polymarket" }).getAttribute("href"), marketUrl)
      assert.deepEqual(await provider.locator("dt").allTextContents(), [activeCard.team_a, activeCard.team_b])
      const prices = await provider.locator("dd").allTextContents()
      assert.deepEqual(prices.map((value) => Number(value.replace(",", "."))), [Number(a), Number(b)])
    }
    await page.getByRole("button", { name: "Загрузить драфт и рассчитать POST", exact: true }).click()
    const post = page.locator(".forecast-card.post")
    await post.getByText("Сохранён", { exact: true }).waitFor()
    await post.getByText(/61[,.]0%/).waitFor()
    assert.deepEqual(fixture.writes.map((write) => write.path), [
      "/maps/100043/live",
      "/maps/100043/forecasts/post_draft",
    ])
    assert.deepEqual(fixture.writes[1].body, { expected_revision: 0, input: draft })
  })
}

async function verifyFinishedCard(browser, home) {
  await openCard(browser, home, "/maps/43?tournament=1win-essence-3", async (page, fixture) => {
    const result = page.getByRole("region", { name: "Результат и прогнозы" })
    await result.getByRole("link", { name: /Steam Match ID 9086875606/ }).waitFor()
    const outcome = result.getByText("GamerLegion · 30:22", { exact: true })
    await outcome.waitFor()
    await page.getByRole("button", { name: "Загрузить драфт и рассчитать ретроспективный POST" }).click()
    const post = page.locator(".forecast-card.post")
    await post.getByText("Расчёт после карты", { exact: true }).waitFor()
    const probability = Math.round(savedRetrospective.analysis.shadow_forecast.winner_probability_team_a * 1000) / 10
    const displayed = await post.locator(".probability-pair strong").first().innerText()
    assert.equal(Number(displayed.replace(",", ".").replace("%", "")), probability)
    assert.deepEqual(fixture.writes.map((write) => write.path), ["/maps/43/live", "/maps/43/retrospective-post"])
    assert.deepEqual(fixture.writes[1].body, { expected_revision: finishedCard.revision, input: draft })
    await outcome.waitFor()
  })
}

async function main() {
  const { preview } = await import("vite")
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 } })
  try {
    const home = new URL(server.resolvedUrls.local[0])
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
      headless: true,
    })
    try {
      await verifyActiveCard(browser, home)
      await verifyFinishedCard(browser, home)
      console.log("Active price refresh and both POST paths verified against the release build")
    } finally {
      await browser.close()
    }
  } finally {
    const closed = once(server.httpServer, "close")
    server.httpServer.close()
    await closed
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
