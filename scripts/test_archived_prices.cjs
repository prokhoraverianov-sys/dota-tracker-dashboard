const assert = require("node:assert/strict")
const Module = require("node:module")
const path = require("node:path")
const { buildSync } = require("esbuild")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

const root = path.resolve(__dirname, "..")
const output = buildSync({
  absWorkingDir: root,
  entryPoints: ["src/ArchivedPrices.tsx"],
  bundle: true,
  write: false,
  jsx: "automatic",
  platform: "node",
  format: "cjs",
  packages: "external",
}).outputFiles[0]
const component = new Module(__filename, module)
component.filename = __filename
component.paths = module.paths
component._compile(output.text, __filename)
const data = require("../public/data/verified-results.json")
const recovered = require("../src/polymarket-api-prices.json")
const seriesById = Object.assign({}, ...Object.values(data.tournaments).map((event) => event.series))
for (const [key, entry] of Object.entries(recovered)) {
  const [seriesId, number] = key.split("/")
  const series = seriesById[seriesId]
  const fact = series?.maps.find((map) => map.map_number === Number(number))
  assert(fact?.steam_match_id && fact.started_at_utc, key)
  assert.deepEqual([entry.steam, entry.team_a, entry.team_b],
                   [fact.steam_match_id, series.team_a, series.team_b], key)
  for (const quote of entry.quotes) {
    const address = new URL(quote.url)
    const market = address.searchParams.get("marketSlug")
    assert.equal(address.hostname, "polymarket.com", key)
    assert.equal(quote.source, "polymarket", key)
    assert(Date.parse(quote.at) < Date.parse(fact.started_at_utc), key)
    assert([quote.team_a, quote.team_b].every((value) => Number.isFinite(+value) && +value > 1), key)
    if (quote.scope === "series_at_1_1") {
      assert.equal(number, "3", key)
      assert.equal(series.best_of, 3, key)
      assert.notEqual(series.maps[0].winner, series.maps[1].winner, key)
    } else {
      assert.equal(quote.scope, "map", key)
      assert(market?.endsWith(`-game${number}`), key)
    }
  }
}
assert(Object.keys(recovered).length >= 69, "Polymarket API coverage regressed")
let compared = 0
for (const event of Object.values(data.tournaments)) {
  for (const [series_id, series] of Object.entries(event.series)) {
    for (const row of series.maps) {
      const render = (a, b) =>
        renderToStaticMarkup(React.createElement(component.exports.ArchivedPrices, { map: {
          series_id, map_number: row.map_number, team_a: a, team_b: b, result: row,
        } }))
      const forward = render(series.team_a, series.team_b)
      const reverse = render(series.team_b, series.team_a)
      const prices = (html) => Array.from(html.matchAll(/<td class="numeric">([^<]*)<\/td>/g), m => m[1])
      const original = prices(forward)
      // Newly registered events can legitimately have no published archive yet.
      if (!original.length) continue
      const expected = []
      for (let index = 0; index < original.length; index += 2) {
        expected.push(original[index + 1], original[index])
      }
      assert.deepEqual(prices(reverse), expected, row.steam_match_id)
      assert.equal(forward.split('aria-label="Архив тоталов длительности"')[1],
                   reverse.split('aria-label="Архив тоталов длительности"')[1], row.steam_match_id)
      assert.equal(prices(render(series.team_a, "unrelated team")).length, 0)
      compared++
    }
  }
}
assert.ok(compared >= 205, `only ${compared} of the initially published 205 maps have archive quotes`)
console.log(`Verified ordered and reversed winner prices on ${compared} maps`)
