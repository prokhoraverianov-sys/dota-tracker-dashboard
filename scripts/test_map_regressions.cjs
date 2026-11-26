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
  pre: {
    ...completed.pre,
    map_id: 100043,
    analysis: { shadow_forecast: { winner_probability_team_a: 0.61 } },
  },
  retrospective_pre: null,
}
const marketUrl = "https://polymarket.com/event/active-regression-game2"
const fullDraftAt = "2026-11-12T13:12:16Z"
const postPriceAt = "2026-11-12T13:12:20Z"
const forecast = {
  ...completed.pre,
  map_id: activeCard.map_id,
  snapshot_id: "fixture-post-100043",
  stage: "post_draft",
  analysis: { shadow_forecast: { winner_probability_team_a: 0.61 } },
  heroes_a,
  heroes_b,
  players_a,
  players_b,
  candidates: [],
  draft_observed_at_utc: "2026-11-12T13:12:19Z",
  draft_completed_at_utc: fullDraftAt,
  post_draft_quote_status: "captured",
  post_draft_quotes: [{
    market_scope: "map",
    provider: "polymarket",
    observed_at_utc: postPriceAt,
    provider_quote_at_utc: "2026-11-12T13:12:15Z",
    observation_method: "polymarket_rest_book",
    request_started_at_utc: "2026-11-12T13:12:19Z",
    source_url: marketUrl,
    quote_id: "post-quote-for-map-2",
    winner: { team_a: "1.95", team_b: "1.99" },
  }],
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

async function mockApi(page, home, initialCard) {
  await page.route("**/config.json", (route) => route.fulfill({ json: { apiUrl: home.origin } }))
  // Reproduce map 43 before an archived retrospective could satisfy the UI.
  await page.route("**/data/completed-forecasts.json", (route) => route.fulfill({ json: {} }))
  const fixture = { odds: missing, oddsReads: 0, writes: [], unexpected: [] }
  let active = initialCard
  const activePath = `/maps/${initialCard.map_id}`
  const oddsPath = `/series/${initialCard.series_id}/maps/${initialCard.map_number}/odds`
  fixture.receivePost = (post = forecast) => { active = { ...active, revision: 1, post } }
  fixture.delayCardProjection = false
  fixture.postResponse = forecast
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
      if (path === activePath) return route.fulfill({ json: active })
      if (path === "/series/e3-g-b1/maps/1/odds") return route.fulfill({ json: missing })
      if (path === oddsPath) {
        fixture.oddsReads++
        return route.fulfill({ json: fixture.odds })
      }
    }
    if (request.method() === "POST") {
      fixture.writes.push({ path, body: request.postDataJSON() })
      if (path === "/maps/43/live" || path === `${activePath}/live`)
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
      if (path === `${activePath}/forecasts/post_draft`) {
        const savedPost = fixture.postResponse
        fixture.receivePost(fixture.delayCardProjection ? { ...savedPost, post_draft_quotes: [] } : savedPost)
        return route.fulfill({ json: { map: active, forecast: savedPost, replayed: false } })
      }
    }
    fixture.unexpected.push(request.method() + " " + path)
    return route.fulfill({ status: 404, json: {} })
  })
  return fixture
}

async function openCard(browser, home, path, run, withManualDraft = false, initialCard = activeCard) {
  const page = await browser.newPage()
  page.setDefaultTimeout(8_000)
  try {
    const fixture = await mockApi(page, home, initialCard)
    if (withManualDraft) {
      const key = `dota-draft:${initialCard.series_id}:${initialCard.map_number}`
      await page.addInitScript(({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)), { key, saved: draft })
    }
    await page.clock.install()
    await page.goto(new URL("#" + path, home).href)
    await run(page, fixture)
    assert.deepEqual(fixture.unexpected, [])
  } finally {
    await page.close()
  }
}

async function verifyVisiblePostPrice(page) {
  const pre = page.locator(".forecast-card.pre")
  const post = page.locator(".forecast-card.post")
  await pre.getByText(/61[,.]0%/).waitFor()
  await post.getByText(/61[,.]0%/).waitFor()
  const visibleQuote = post.getByRole("region", { name: "Котировки POST", exact: true })
  await visibleQuote.locator(`time[datetime="${postPriceAt}"]`).waitFor()
  assert.match(await visibleQuote.innerText(), /1\.95.+1\.99.+13:12:20 UTC.+через 4 с после последнего пика/s)
  assert.equal(await visibleQuote.getByRole("link", { name: "Рынок ↗" }).getAttribute("href"), marketUrl)
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
    await verifyVisiblePostPrice(page)
    assert.deepEqual(fixture.writes.map((write) => write.path), [
      "/maps/100043/live",
      "/maps/100043/forecasts/post_draft",
    ])
    assert.deepEqual(fixture.writes[1].body, { expected_revision: 0, input: draft })
  })
}

async function verifyManualPost(browser, home) {
  await openCard(browser, home, "/maps/100043", async (page, fixture) => {
    fixture.delayCardProjection = true
    await page.getByRole("button", { name: "Рассчитать POST", exact: true }).click()
    await verifyVisiblePostPrice(page)
    assert.deepEqual(fixture.writes.map((write) => write.path), ["/maps/100043/forecasts/post_draft"])
    const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/v1/maps/100043"))
    await page.clock.fastForward(15_000)
    await refreshed
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await verifyVisiblePostPrice(page)
  }, true)
}

async function verifyAutomaticPost(browser, home) {
  await openCard(browser, home, "/maps/100043", async (page, fixture) => {
    await page.locator(".forecast-card.post").getByText("Прогноз ещё не сохранён", { exact: true }).waitFor()
    fixture.receivePost()
    const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/v1/maps/100043"), { timeout: 1_500 })
    await page.clock.fastForward(2_000)
    await refreshed
    await verifyVisiblePostPrice(page)
    assert.deepEqual(fixture.writes, [])
  })
}

async function verifyLeonMapThree(browser, home) {
  const map = { ...activeCard, map_id: 100044, map_number: 3, pre: { ...activeCard.pre, map_id: 100044 } }
  const source = "https://leon.bet/bets/esport/dota-2/blast-slam-ix/875421-active-regression"
  await openCard(browser, home, "/maps/100044", async (page, fixture) => {
    fixture.postResponse = {
      ...forecast,
      map_id: map.map_id,
      snapshot_id: "fixture-leon-post-map3",
      polymarket_quotes: [],
      polymarket_diagnostics: [],
      post_draft_quotes: [{
        market_scope: "map",
        provider: "LEON",
        event_id: "875421",
        observed_at_utc: postPriceAt,
        provider_quote_at_utc: null,
        request_started_at_utc: "2026-11-12T13:12:19Z",
        observation_method: "leon_event_line",
        source_url: source,
        quote_id: "leon:875421:map3:2026-11-12T13:12:20Z",
        winner: { team_a: "1.83", team_b: "2.12" },
      }],
    }
    const identity = page.locator(".map-number")
    await identity.filter({ hasText: /^Карта 3$/ }).waitFor()
    await page.getByRole("button", { name: "Рассчитать POST", exact: true }).click()
    const pre = page.locator(".forecast-card.pre")
    const post = page.locator(".forecast-card.post")
    await pre.getByText(/61[,.]0%/).waitFor()
    await post.getByText(/61[,.]0%/).waitFor()
    const quote = post.getByRole("region", { name: "Котировки POST", exact: true })
    await quote.getByRole("heading", { name: "Котировки POST · карта 3", exact: true }).waitFor()
    await quote.locator(`time[datetime="${postPriceAt}"]`).waitFor()
    assert.match(await quote.innerText(), /LEON.+1\.83.+2\.12.+13:12:20 UTC.+через 4 с после последнего пика/s)
    assert.equal(await quote.getByText("Polymarket", { exact: true }).count(), 0)
    assert.equal(await quote.getByRole("link", { name: "Рынок ↗" }).getAttribute("href"), source)
    assert.equal(await identity.innerText(), "Карта 3")
    assert.deepEqual(fixture.writes.map((write) => write.path), ["/maps/100044/forecasts/post_draft"])
  }, true, map)
}

async function verifyExpiredPostQuote(browser, home) {
  await openCard(browser, home, "/maps/100043", async (page, fixture) => {
    const post = page.locator(".forecast-card.post")
    await post.getByText("Прогноз ещё не сохранён", { exact: true }).waitFor()
    fixture.receivePost({
      ...forecast, post_draft_quote_status: "window_missed", post_draft_quotes: [{
        ...forecast.post_draft_quotes[0], request_started_at_utc: "2026-11-12T13:12:15Z",
      }],
      polymarket_quotes: [{
        market_scope: "map", observed_at_utc: "2026-11-12T13:12:15Z", source_url: marketUrl,
        winner: { team_a: "1.91", team_b: "2.03" },
      }],
    })
    await page.clock.fastForward(2_000)
    const postQuote = post.getByRole("region", { name: "Котировки POST", exact: true })
    await postQuote.getByText("Котировки POST не получены в течение 10 секунд.", { exact: true }).waitFor()
    assert.equal(await postQuote.locator("time").count(), 0)
    await post.getByText("Снимки котировок", { exact: true }).click()
    await post.getByText("Polymarket · Карта · справочно", { exact: true }).waitFor()
  })
}

async function verifyPostQuoteAfterObservation(browser, home) {
  await openCard(browser, home, "/maps/100043", async (page, fixture) => {
    const post = page.locator(".forecast-card.post")
    await post.getByText("Прогноз ещё не сохранён", { exact: true }).waitFor()
    fixture.receivePost({
      ...forecast,
      draft_completed_at_utc: null,
      post_draft_quote_status: "after_observation",
    })
    await page.clock.fastForward(2_000)
    const quotes = post.getByRole("region", { name: "Котировки POST", exact: true })
    await quotes.getByText(/Справочный снимок после получения драфта/).waitFor()
    await quotes.locator(`time[datetime="${postPriceAt}"]`).waitFor()
    assert.doesNotMatch(await quotes.innerText(), /с после последнего пика/)
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
    await post.getByText("Ретроспективный расчёт", { exact: true }).waitFor()
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
      await verifyManualPost(browser, home)
      await verifyAutomaticPost(browser, home)
      await verifyLeonMapThree(browser, home)
      await verifyExpiredPostQuote(browser, home)
      await verifyPostQuoteAfterObservation(browser, home)
      await verifyFinishedCard(browser, home)
      console.log("Active market refresh and exact POST quotes verified for live import, manual save, and automatic capture; retrospective map 43 verified")
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
