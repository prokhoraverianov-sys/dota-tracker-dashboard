const assert = require("node:assert/strict")
const Module = require("node:module")
const { buildSync } = require("esbuild")
const { resolve } = require("node:path")
const facts = require("../public/data/verified-results.json")
const saved = require("../public/data/completed-forecasts.json")
const archivePrices = require("../src/verified-phase-quotes.json")

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
const { evaluateMap, originalPreForecast, preForecastBlock } = compile("map-outcome.ts")
const { originalPostAfterVerifiedWindow, reportPrice, reportPriceChange } = compile("report-price.ts")
const { postWeightScenario, weightedPost } = compile("weighted-post.ts")
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
          for (const [i, quote] of prices.entries()) {
            const proof = archivePrices[cards[i].result.steam_match_id]?.[stage]
            if (!proof) assert.equal(quote, null, "legacy archive has no draft-phase price proof")
            else assert.equal(quote?.retrospective, true, "verified phase proof must be labelled")
          }
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
    series_id: "phase-quote-check",
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
  assert.deepEqual(reportPriceChange(card), { provider: "Polymarket", a: 0.25, b: -0.25, retrospective: false })
  const weighted = mapSchema.parse({ ...card, post: {
    ...card.post, analysis: { ...card.post.analysis, shadow_forecast: {
      ...card.post.analysis.shadow_forecast,
      post_draft_scenarios: [[0.25, 0.61], [0.5, 0.52], [1, 0.45], [1.25, 0.39]].map(
        ([draft_weight, winner_probability_team_a]) => ({ draft_weight, winner_probability_team_a }),
      ),
    }},
  }})
  assert.deepEqual([0.25, 0.5, 1, 1.25].map(w => weightedPost(weighted, w).selected), ["A", "A", "B", "B"])
  assert.equal(postWeightScenario({ ...weighted, result: null }, weighted.post.analysis, 1.25).probability, 0.39)
  assert.equal(postWeightScenario({ ...weighted, result: null }, undefined, 1.25), null)
  assert.equal(postWeightScenario({ ...weighted, result: null }, { shadow_forecast: { winner_probability_team_a: 0.61 } }, 0.25), null)
  const outside = { ...card, result: null, post: null, pre: null, draft_started_at_utc: null, series_best_of: 3 }
  for (const map_number of [1, 2]) {
    assert.equal(preForecastBlock({ ...outside, map_number, pre_status: "before_series" }), null)
    assert.match(preForecastBlock({ ...outside, map_number, pre_status: "series_started" }), /Окно PRE закрыто/)
  }
  const third = { ...outside, map_number: 3, pre_status: "before_decider_draft" }
  assert.equal(preForecastBlock({ ...third, verified_series_score: [1, 1] }), null)
  assert.match(preForecastBlock({ ...third, verified_series_score: [2, 0] }), /счёте 1:1/)
  assert.match(preForecastBlock({ ...third, verified_series_score: [1, 1], draft_started_at_utc: stamp("11:59:00") }), /Окно PRE закрыто/)
  assert.match(preForecastBlock({ ...third, pre_status: "phase_unverified", verified_series_score: [1, 1] }), /не подтвердил/)
  const betweenMaps = { ...card, series_best_of: 3, map_number: 2, pre_window_end_utc: stamp("11:57:00") }
  assert.equal(evaluateMap(betweenMaps, "pre").hit, null)
  assert.match(evaluateMap(betweenMaps, "pre").note, /после подтверждённого окна/)
  assert.equal(reportPrice(betweenMaps, "pre", "B"), null)
  const deciderQuote = { ...preQuote, source_url: "https://polymarket.com/event/final-game3?marketSlug=final-game3" }
  const archivedDeciderPre = {
    ...card.pre, map_id: card.map_id, pre_decision_quotes: [deciderQuote],
    analysis: { shadow_forecast: { winner_probability_team_a: 0.4 } },
  }
  const beforeTie = {
    ...card, series_best_of: 3, map_number: 3, pre: null, archived_pre: archivedDeciderPre, retrospective_pre: null,
    pre_window_start_utc: stamp("11:58:30"), pre_window_end_utc: stamp("11:59:00"),
  }
  assert.equal(evaluateMap(beforeTie, "pre").hit, true)
  assert.equal(evaluateMap(beforeTie, "pre").forecast, archivedDeciderPre)
  assert.equal(evaluateMap({ ...beforeTie, pre: archivedDeciderPre, archived_pre: null }, "pre").hit, true)
  assert.equal(evaluateMap(beforeTie, "pre").note, "")
  assert.equal(beforeTie.pre, null, "the raw archived record is not promoted into the live slot")
  assert.equal(reportPrice(beforeTie, "pre", "B").value, 1.82)
  assert.equal(reportPrice(beforeTie, "pre", "B").retrospective, true)
  assert.equal(reportPrice({ ...beforeTie, archived_pre: { ...archivedDeciderPre, pre_decision_quotes: [preQuote] } }, "pre", "B"), null)
  for (const unproven of [
    { ...beforeTie, result: null }, { ...beforeTie, result_conflict: "mismatch" },
    { ...beforeTie, result: { ...beforeTie.result, steam_match_id: null } },
    { ...beforeTie, pre_status: "unplayed" }, { ...beforeTie, play_status: "unplayed" },
    { ...beforeTie, draft_started_at_utc: null, pre_window_end_utc: null },
    { ...beforeTie, draft_started_at_utc: stamp("11:57:59") },
    { ...beforeTie, archived_pre: { ...archivedDeciderPre, map_id: -1 } },
  ]) {
    assert.equal(evaluateMap(unproven, "pre").forecast, null)
    assert.equal(reportPrice(unproven, "pre", "B"), null)
  }
  const oldOriginal = {
    ...archivedDeciderPre, map_id: 49, snapshot_id: 72, pre_decision_quotes: [],
    created_at_utc: "2026-11-13T15:22:53.867220Z", pre_decision_at_utc: null,
  }
  const historicalSlot = "/series/e3-g-c1/maps/3"
  const oldCard = {
    ...card, map_id: 49, map_number: 3, series_id: "e3-g-c1", tournament: "1win Essence III",
    team_a: "LGD Gaming", team_b: "Team Liquid", result: null, pre: null, post: null,
    archived_pre: oldOriginal, draft_started_at_utc: null, pre_window_end_utc: null,
  }
  const playedDecider = await view(historicalSlot, oldCard)
  assert.equal(playedDecider.result.steam_match_id, "9088710443")
  assert.equal(playedDecider.pre_window_end_utc, "2026-11-13T17:25:36Z")
  assert.equal(originalPreForecast(playedDecider)?.snapshot_id, 72)
  assert.equal(evaluateMap(playedDecider, "pre").hit, false)
  const afterConservativeBound = {
    ...playedDecider, archived_pre: { ...oldOriginal, created_at_utc: "2026-11-13T17:30:00Z" },
  }
  assert.equal(originalPreForecast(afterConservativeBound), null)
  assert.equal(reportPrice(playedDecider, "pre", "B"), null)
  const livePair = {
    ...card, result: null,
    pre: { ...card.pre, pre_quote_status: "captured", pre_phase_checked_at_utc: stamp("11:58:00"), pre_phase_source_url: "https://cybersport.ru/fixture", pre_draft_quotes: [preQuote] },
    post: card.post,
  }
  assert.equal(reportPriceChange(livePair).a, 0.25)
  const attached = { ...livePair, pre: {
    ...livePair.pre, pre_quote_status: "attached_before_series",
    pre_decision_at_utc: stamp("11:57:58"), pre_phase_checked_at_utc: stamp("11:58:01"),
  }}
  assert.equal(reportPriceChange(attached).a, 0.25)
  assert.equal(reportPriceChange({ ...livePair, post: { ...card.post, post_draft_quote_status: "after_observation" } }), null)
  const otherMap = "https://polymarket.com/event/final-game3?marketSlug=final-game3"
  assert.equal(reportPriceChange({ ...livePair, post: { ...card.post, post_draft_quotes: [{ ...postQuote, source_url: otherMap }] } }), null)
  const leonPair = (quote) => ({ ...quote, provider: "LEON", source_url: "https://leon.bet/bets/esport/dota-2/final", observation_method: "leon_event_line", request_started_at_utc: stamp("11:59:42") })
  assert.equal(reportPriceChange({ ...livePair,
    pre: { ...livePair.pre, pre_draft_quotes: [leonPair(preQuote)] },
    post: { ...card.post, post_draft_quotes: [leonPair(postQuote)] },
  }), null)
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
  const current = mapSchema.parse({
    ...final, map_id: 121, series_id: "cs-10003480-10100688", map_number: 1,
    team_a: "GamerLegion", team_b: "Aurora Gaming", pre: null, post: null,
    result: { winner: "A", steam_match_id: "9106031971", duration_seconds: 2822, started_at_utc: "2026-11-26T09:56:06Z", settled_at_utc: "2026-11-26T11:03:26Z" },
  })
  const proofPre = reportPrice(current, "pre", "A")
  const proofPost = reportPrice(current, "post", "A")
  assert.equal(proofPre.value, 1 / 0.415)
  assert.equal(proofPost.value, 1 / 0.455)
  assert.equal(proofPost.retrospective, true)
  assert.equal(Date.parse(proofPost.observedAt), Date.parse("2026-11-26T10:10:07Z"))
  assert.match(proofPost.sourceUrl, /dota2-gl-aur1-2026-11-26-game1$/)
  const shift = reportPriceChange(current)
  assert.equal(shift.retrospective, true)
  assert.equal(shift.a, 1 / 0.455 - 1 / 0.415)
  assert.equal(shift.b, 1 / 0.545 - 1 / 0.585)
  const quarter = require("../src/essence-weighted-post.json")[current.result.steam_match_id]?.quarter
  assert.equal(postWeightScenario(current, undefined, 0.25).probability, quarter)
  assert.equal(weightedPost(current, 0.25).hit, null)
  assert.equal(originalPostAfterVerifiedWindow(current), false)
  assert.equal(originalPostAfterVerifiedWindow({ ...current, post: { ...final.post, created_at_utc: "2026-11-26T10:29:13.748934Z" } }), true)
  const reversed = { ...current, team_a: current.team_b, team_b: current.team_a }
  assert.equal(reportPrice(reversed, "pre", "A").value, 1 / 0.585)
  assert.equal(reportPrice(reversed, "pre", "A").observedAt, reportPrice(current, "pre", "B").observedAt)
  assert.equal(reportPriceChange(reversed).a, shift.b)
  for (const wrong of [
    { ...current, map_number: 2 }, { ...current, series_id: "other-series" },
    { ...current, team_b: "Other opponent" }, { ...current, result: null },
    { ...current, result: { ...current.result, steam_match_id: "1234" } },
    { ...current, result_conflict: "mismatch" },
  ]) {
    assert.equal(reportPrice(wrong, "post", "A"), null)
    assert.equal(reportPriceChange(wrong), null)
  }
  assert.equal((await view("/series/e3-p-r05-m001/maps/5")).play_status, "unplayed")
  for (const mapId of [52, 64, 102, 103, 105]) assert.equal((await view("/maps/" + mapId)).post, null)
  const mismatch = await view(permalink, { ...final, result: { ...final.result, winner: "A" } })
  assert.ok(mismatch.result_conflict)
  assert.equal(mismatch.result.winner, "A")
  console.log("Verified tournament census, immutable conflict handling and forecast bindings")
}
main().catch(err => { console.error(err); process.exitCode = 1 })
