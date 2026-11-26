const assert = require("node:assert/strict")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { resolve } = require("node:path")
const facts = require("../public/data/verified-results.json")
const saved = require("../public/data/completed-forecasts.json")

function compile(file) {
  const result = buildSync({
    entryPoints: [resolve(__dirname, "../src", file)], bundle: true, write: false,
    format: "cjs", platform: "node", define: { "import.meta.env.BASE_URL": '"/"' },
  })
  const mod = new Module(__filename, module)
  mod._compile(result.outputFiles[0].text, __filename)
  return mod.exports
}
const { mapSchema, scheduleSchema } = compile("contracts.ts")
const { evaluateMap } = compile("map-outcome.ts")
const { reportPrice, reportPriceChange } = compile("report-price.ts")
const { verifiedView } = compile("verified-results.ts")

async function main() {
  const archive = Object.fromEntries(Object.entries(saved).map(([id,cards]) =>
    [id, cards.map((c) => mapSchema.parse(c))]))
  const data = Promise.resolve([facts, archive])
  const view = (url, raw = null) => verifiedView(url, raw, data)
  for (const [key, tournament] of Object.entries(facts.tournaments)) {
    const url = "/schedule?tournament=" + encodeURIComponent(key)
    const all = scheduleSchema.parse(await view(url))
    const normalize = (team) => team.trim().toLowerCase()
    const cards = all.series.flatMap(series => series.maps.filter(map => map.result))
    const actual = cards.map(map => [
      map.series_id, map.map_number, map.result.steam_match_id ?? null,
      normalize(map.result.winner === "A" ? map.team_a : map.team_b), map.result.duration_seconds,
    ])
    const expected = Object.entries(tournament.series).flatMap(([id, series]) =>
      series.maps.map(map => [
        id, map.map_number, map.steam_match_id ?? null,
        normalize(map.winner === "A" ? series.team_a : series.team_b), map.duration_seconds,
      ]),
    )
    assert.deepEqual(actual.toSorted(), expected.toSorted(), key + " played slots and outcomes")
    const ids = cards.map(map => map.result.steam_match_id).filter(Boolean)
    assert.equal(new Set(ids).size, ids.length, key + " duplicate Steam Match ID")
    if (["1win-essence-3", "1win-essence-3-play-in", "pari-universe"].includes(key)) {
      for (const stage of ["pre","post"]) {
        const results = cards.map(m => evaluateMap(m, stage))
        assert(results.every(v => typeof v.comparison === "boolean"), key + "/" + stage)
        if (key === "1win-essence-3") {
          const prices = cards.map((m,i) => reportPrice(m, stage, results[i].selected))
          assert(prices.every(q => q === null), "legacy archive has no draft-phase price proof")
          console.log(key, stage, results.filter(v => v.comparison).length, "of", cards.length,
            "legacy prices excluded from financial calculations")
        }
      }
    }
    const dated = []
    for (const day of all.dates) {
      const partial = await view(url + "&date=" + day)
      dated.push(...partial.series.map(s => s.series_id))
    }
    assert.deepEqual(dated.toSorted(), all.series.map(s => s.series_id).toSorted(), key + " date partition")
  }
  const final = await view("/maps/116")
  const permalink = "/series/e3-p-r05-m001/maps/4"
  assert.deepEqual(final.result, (await view(permalink)).result)
  assert.equal(final.result.steam_match_id, "9095836436")
  assert.equal(final.result.winner, "B")
  assert.equal(final.post.verified_steam_match_id, final.result.steam_match_id)
  const stamp = (clock) => `2026-11-17T${clock}Z`
  const market = {
    market_scope: "map",
    provider: "polymarket",
    source_url: "https://polymarket.com/event/final-game4?marketSlug=final-game4",
    event_id: "final-game4",
  }
  const preQuote = {
    ...market, observed_at_utc: stamp("11:58:00"), winner: { team_a: "2.00", team_b: "1.82" },
  }
  const postQuote = {
    ...market, observed_at_utc: stamp("11:59:45"), provider_quote_at_utc: stamp("11:59:44"),
    winner: { team_a: "2.25", team_b: "1.57" },
  }
  const card = mapSchema.parse({
    ...final,
    draft_started_at_utc: stamp("11:59:00"),
    gameplay_started_at_utc: stamp("12:00:00"),
    pre: { ...final.pre, created_at_utc: stamp("11:58:00"), pre_decision_at_utc: stamp("11:58:00"), pre_decision_quotes: [preQuote] },
    post: {
      ...final.post, created_at_utc: stamp("11:59:46"), draft_observed_at_utc: stamp("11:59:40"),
      draft_completed_at_utc: stamp("11:59:40"), post_draft_quote_status: "captured",
      post_draft_quotes: [postQuote],
    },
    result: { ...final.result, started_at_utc: stamp("11:58:50") },
  })
  assert.equal(reportPrice(card, "pre", "B").value, 1.82)
  assert.equal(reportPrice(card, "post", "A").value, 2.25)
  assert.equal(reportPrice(card, "post", "B").value, 1.57)
  assert.deepEqual(reportPriceChange(card), { provider: "Polymarket", a: 0.25, b: -0.25 })
  assert.equal(evaluateMap(card, "post").hit, true)
  assert.equal(evaluateMap({ ...card, gameplay_started_at_utc: null }, "post").hit, null)
  assert.equal(reportPrice({ ...card, draft_started_at_utc: null }, "pre", "B"), null)
  assert.equal(reportPrice({ ...card, post: { ...card.post, post_draft_quotes: [] } }, "post", "A"), null)
  assert.equal(reportPrice({ ...card, post: { ...card.post, draft_completed_at_utc: null } }, "post", "A"), null)
  assert.equal(reportPrice({ ...card, gameplay_started_at_utc: null }, "post", "B"), null)
  assert.equal(reportPrice({ ...card, gameplay_started_at_utc: stamp("11:59:45") }, "post", "B"), null)
  assert.equal(reportPrice({ ...card, post: { ...card.post, draft_external_game_id: "steam:1" } }, "post", "B"), null)
  for (const rejected of [
    { ...postQuote, market_scope: "series" },
    { ...postQuote, observed_at_utc: stamp("11:59:51") },
    { ...postQuote, provider_quote_at_utc: stamp("11:59:39") },
  ]) {
    assert.equal(reportPrice({ ...card, post: { ...card.post, post_draft_quotes: [rejected] } }, "post", "B"), null)
  }
  assert.equal(reportPriceChange({ ...card, post: { ...card.post, post_draft_quotes: [{ ...postQuote, event_id: "another-market" }] } }), null)
  assert.equal((await view("/series/e3-p-r05-m001/maps/5")).play_status, "unplayed")
  for (const mapId of [52, 64, 102, 103, 105]) assert.equal((await view("/maps/" + mapId)).post, null)
  const mismatch = await view(permalink, { ...final, result: { ...final.result, winner: "A" } })
  assert.ok(mismatch.result_conflict)
  assert.equal(mismatch.result.winner, "A")
  console.log("Verified tournament census, immutable conflict handling and forecast bindings")
}
main().catch(err => { console.error(err); process.exitCode = 1 })
