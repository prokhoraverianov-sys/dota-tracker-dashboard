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
