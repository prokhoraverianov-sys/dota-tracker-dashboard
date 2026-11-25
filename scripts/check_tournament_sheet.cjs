const { readFileSync } = require("node:fs")
const { resolve } = require("node:path")

const [tournamentKey, registryPath = resolve(__dirname, "../public/data/verified-results.json")] =
  process.argv.slice(2)
const headers = {
  id: "Steam Match ID",
  series: "Серия ID",
  map: "Карта №",
  start: "Старт UTC",
  teamA: "Команда A",
  teamB: "Команда B",
  winner: "Победитель",
  duration: "Длительность, сек",
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase()
}

function spreadsheetTimestamp(value) {
  if (typeof value !== "number") return Date.parse(value)
  return Date.UTC(1899, 11, 30) + Math.round(value * 86_400) * 1000
}

function resultsBySlot(tournament) {
  return new Map(
    Object.entries(tournament.series).flatMap(([id, series]) =>
      series.maps.map(map => [`${id}/${map.map_number}`, { map, series }]),
    ),
  )
}

function checkRows(values, expected) {
  const [header, ...rows] = values
  const columns = Object.fromEntries(
    Object.entries(headers).map(([key, name]) => {
      const index = header?.indexOf(name) ?? -1
      if (index < 0) throw Error("Missing sheet column: " + name)
      return [key, index]
    }),
  )
  const seenSlots = new Set()
  const seenIds = new Set()
  const errors = []
  for (const [index, row] of rows.entries()) {
    if (row.every(value => normalize(value) === "")) continue
    const field = name => row[columns[name]]
    const slot = `${field("series")}/${field("map")}`
    const id = normalize(field("id"))
    const label = `row ${index + 2} (${slot}${id ? ", Steam " + id : ""})`
    if (seenSlots.has(slot)) errors.push(label + ": duplicate map slot")
    if (id && seenIds.has(id)) errors.push(label + ": duplicate Steam Match ID")
    seenSlots.add(slot)
    if (id) seenIds.add(id)
    const source = expected.get(slot)
    if (!source) {
      errors.push(label + ": unexpected played map")
      continue
    }
    const { series, map } = source
    const winner = map.winner === "A" ? series.team_a : series.team_b
    const teams = [field("teamA"), field("teamB")].map(normalize).sort()
    const officialTeams = [series.team_a, series.team_b].map(normalize).sort()
    if (teams.some((team, side) => team !== officialTeams[side]))
      errors.push(label + ": teams differ from verified registry")
    if (id !== normalize(map.steam_match_id))
      errors.push(label + ": Steam Match ID differs from verified registry")
    if (!id && map.started_at_utc &&
      spreadsheetTimestamp(field("start")) !== Date.parse(map.started_at_utc))
      errors.push(label + ": start time differs from verified registry")
    if (normalize(field("winner")) !== normalize(winner))
      errors.push(label + ": winner differs from verified registry")
    if (Number(field("duration")) !== map.duration_seconds)
      errors.push(label + ": duration differs from verified registry")
  }
  for (const [slot, { map }] of expected) {
    if (!seenSlots.has(slot)) errors.push(`${slot} (Steam ${map.steam_match_id ?? "unknown"}): missing played map`)
  }
  return errors
}

try {
  if (!tournamentKey) throw Error("Usage: node scripts/check_tournament_sheet.cjs <tournament> [registry.json] < sheet-readback.json")
  const registry = JSON.parse(readFileSync(registryPath, "utf8"))
  const tournament = registry.tournaments[tournamentKey]
  if (!tournament) throw Error("No tournament in verified registry: " + tournamentKey)
  const input = JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, ""))
  const expected = resultsBySlot(tournament)
  const values = Array.isArray(input) ? input : input.values
  if (!Array.isArray(values)) throw Error("Expected a JSON array of sheet rows or a Sheets values response")
  const errors = checkRows(values, expected)
  if (errors.length) throw Error(errors.join("\n"))
  console.log(`${tournamentKey}: ${expected.size} played maps matched the verified site registry`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
