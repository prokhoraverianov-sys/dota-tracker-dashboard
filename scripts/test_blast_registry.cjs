const assert = require("node:assert/strict")
const Module = require("node:module")
const path = require("node:path")
const { buildSync } = require("esbuild")
const registry = require("../public/data/verified-results.json")
const archive = require("../public/data/completed-forecasts.json")
const prices = require("../src/polymarket-api-prices.json")
const config = require("./tournaments.json")

const key = "blast-slam-ix"
const event = registry.tournaments[key]
assert.equal(event.name, "BLAST Slam IX")
assert.equal(config.find((stage) => stage.key === key).best_of_overrides["10100697"], 5)

// Reconciled with the organizer's results through Last Chance on 25 November.
const expected = Object.fromEntries([
  ["10100664", [9097783398, 9097870389]], ["10100665", [9097940178, 9098054405, 9098169261]],
  ["10100666", [9099625641, 9099798925]], ["10100667", [9099748911, 9099903959, 9100004430]],
  ["10100668", [9102538823, 9102638098]], ["10100669", [9097789980, 9097868416]],
  ["10100670", [9097973005, 9098067582]], ["10100671", [9099515151, 9099614690]],
  ["10100672", [9099951595, 9100047324, 9100301435]], ["10100673", [9102537211, 9102662210]],
  ["10100674", [9098185996, 9098298585]], ["10100675", [9098273104, 9098373280]],
  ["10100676", [9101190574, 9101312905, 9101479361]], ["10100677", [9101188899, 9101299342, 9101476409]],
  ["10100678", [9102753849, 9102844753]], ["10100679", [9099278768, 9099376074, 9099504624]],
  ["10100680", [9099277554, 9099401953]], ["10100681", [9101574910, 9101675886, 9101771071]],
  ["10100682", [9101577619, 9101661529]], ["10100683", [9102778505, 9102872629]],
  ["10100684", [9103792288, 9103887230, 9103988169]], ["10100685", [9103792148, 9103896435]],
  ["10100686", [9104081844, 9104185540, 9104260611]], ["10100687", [9104002501, 9104082306, 9104215841]],
])
const seen = new Set()
for (const [sid, source] of Object.entries(expected)) {
  const seriesId = `cs-10003480-${sid}`
  const series = event.series[seriesId]
  assert.ok(series.finished, seriesId)
  assert.deepEqual(series.maps.map((row) => Number(row.steam_match_id)), source, seriesId)
  for (const fact of series.maps) {
    const replay = archive[seriesId].find((card) => card.map_number === fact.map_number)
    assert.equal(replay.team_a, series.team_a)
    assert.equal(replay.team_b, series.team_b)
    assert.notEqual(replay.external_id, undefined)
    assert.ok(!seen.has(fact.steam_match_id))
    seen.add(fact.steam_match_id)
    const steam = `steam:${fact.steam_match_id}`
    assert.equal(replay.pre, null)
    assert.equal(replay.post, null)
    for (const stage of [replay.retrospective_pre, replay.retrospective_post]) {
      assert.equal(stage.external_game_id, steam)
      assert.ok(Date.parse(stage.created_at_utc) > Date.parse(fact.started_at_utc))
      assert.equal(stage.analysis.metadata.status, "prediction")
      assert.ok(stage.analysis.shadow_forecast.winner_probability_team_a > 0)
    }
    const post = replay.retrospective_post
    for (const [fields, n] of [[[post.heroes_a, post.heroes_b], 10], [[post.players_a, post.players_b], 10]]) {
      assert.equal(new Set(fields.flat()).size, n, steam)
      assert.ok(fields.every((items) => items.length === 5), steam)
    }
    const row = prices[`${seriesId}/${fact.map_number}`]
    if (row) {
      assert.deepEqual([row.steam, row.team_a, row.team_b], [fact.steam_match_id, series.team_a, series.team_b])
      for (const quote of row.quotes) {
        assert.ok(Number(quote.team_a) > 1 && Number(quote.team_b) > 1)
        if (quote.scope === "map" || quote.scope === "series_at_1_1") {
          assert.ok(Date.parse(quote.at) < Date.parse(fact.started_at_utc))
        }
        if (quote.scope.startsWith("series_at_1_1")) {
          assert.equal(fact.map_number, 3)
          assert.notEqual(series.maps[0].winner, series.maps[1].winner)
        }
      }
    }
  }
}
assert.equal(seen.size, 58)
const spirit = event.series["cs-10003480-10100672"].maps[2]
assert.equal(spirit.duration_seconds, 1614)
assert.equal(spirit.winner, "B")
console.log("BLAST Slam IX: 58 exact result and retrospective forecast bindings verified")

const bracketModule = new Module(__filename, module)
bracketModule.paths = module.paths
bracketModule._compile(buildSync({
  absWorkingDir: path.resolve(__dirname, ".."),
  entryPoints: ["src/playoff-bracket.ts"],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
}).outputFiles[0].text, __filename)
const { blastPlayoffBracket } = bracketModule.exports
const slot = (number) => `cs-10003480-${number}`
const lookup = (bracket, number) => bracket.find((item) => item.id === slot(number))
const startingBracket = blastPlayoffBracket([])
assert.equal(startingBracket.length, 10)
assert.deepEqual(lookup(startingBracket, 10100692).teams.map((team) => team.name), ["Team Yandex", null])
assert.equal(lookup(startingBracket, 10100690).teams[0].source, "Проигравший · Полуфинал верхней сетки 2")
assert.equal(lookup(startingBracket, 10100697).bestOf, 5)

function fixture(number, team_a, team_b, winners) {
  const series_id = slot(number)
  return {
    series_id, team_a, team_b, best_of: 3, starts_at_utc: "2026-11-26T10:00:00Z",
    maps: winners.map((winner, position) => ({
      series_id, map_id: null, map_number: position + 1,
      team_a: position === 0 ? team_b : team_a,
      team_b: position === 0 ? team_a : team_b,
      play_status: winner === null ? "unplayed" : null,
      result: winner === null ? null : {winner: (winner === team_a) === (position !== 0) ? "A" : "B"},
    })),
  }
}

const partial = fixture(10100688, "GamerLegion", "Aurora Gaming", ["Aurora Gaming"])
const unfinished = blastPlayoffBracket([partial])
assert.equal(lookup(unfinished, 10100688).status, "playing")
assert.equal(lookup(unfinished, 10100692).teams[1].name, null)

const played = blastPlayoffBracket([
  fixture(10100688, "GamerLegion", "Aurora Gaming", ["Aurora Gaming", "Aurora Gaming", null]),
  fixture(10100693, "PARIVISION", "Team Liquid", ["PARIVISION", "PARIVISION", null]),
  fixture(10100697, "PARIVISION", "Aurora Gaming", ["Aurora Gaming", "Aurora Gaming", "PARIVISION"]),
])
assert.deepEqual(lookup(played, 10100688).teams.map(({ score, winner }) => [score, winner]), [[0, false], [2, true]])
assert.deepEqual(lookup(played, 10100688).maps.map(({ number }) => number), [1, 2])
assert.deepEqual(lookup(played, 10100692).teams.map((team) => team.name), ["Team Yandex", "Aurora Gaming"])
assert.deepEqual(lookup(played, 10100690).teams.map((team) => team.name), ["Team Liquid", "GamerLegion"])
assert.equal(lookup(played, 10100697).status, "playing", "a 2:1 BO5 is still in progress")
console.log("BLAST playoff bracket: all slots, verified advances, cross-seeding and BO5 checked")
