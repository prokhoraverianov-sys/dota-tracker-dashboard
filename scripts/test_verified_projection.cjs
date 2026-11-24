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
const { verifiedView } = compile("verified-results.ts")

async function main() {
  const archive = Object.fromEntries(Object.entries(saved).map(([id,cards]) =>
    [id, cards.map((c) => mapSchema.parse(c))]))
  const data = Promise.resolve([facts, archive])
  const view = (url, raw = null) => verifiedView(url, raw, data)
  for (const [key, tournament] of Object.entries(facts.tournaments)) {
    const url = "/schedule?tournament=" + encodeURIComponent(key)
    const all = scheduleSchema.parse(await view(url))
    const ids = all.series.flatMap(s => s.maps.map(m => m.result?.steam_match_id).filter(Boolean))
    const expected = Object.values(tournament.series)
      .flatMap(series => series.maps.map(m => m.steam_match_id).filter(Boolean))
    assert.deepEqual(ids.toSorted(), expected.toSorted(), key)
    assert.equal(new Set(ids).size, ids.length, key)
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
  assert.equal((await view("/series/e3-p-r05-m001/maps/5")).play_status, "unplayed")
  for (const mapId of [52, 64, 102, 103, 105]) assert.equal((await view("/maps/" + mapId)).post, null)
  const mismatch = await view(permalink, { ...final, result: { ...final.result, winner: "A" } })
  assert.ok(mismatch.result_conflict)
  assert.equal(mismatch.result.winner, "A")
  console.log("Verified tournament census, immutable conflict handling and forecast bindings")
}
main().catch(err => { console.error(err); process.exitCode = 1 })
