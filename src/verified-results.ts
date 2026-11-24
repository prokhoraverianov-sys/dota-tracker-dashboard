import { z } from "zod"
import { type MapDTO, mapSchema, scheduleSchema } from "./contracts"

const resultFact = z.object({
  map_number: z.number().int().positive(),
  steam_match_id: z.string().regex(/^\d+$/).nullable(),
  started_at_utc: z.iso.datetime({ offset: true }).nullable(),
  external_game_id: z.string().optional(),
  source_url: z.string().optional(),
  duration_seconds: z.number().int().positive(),
  winner: z.enum(["A", "B"]),
  observed_at_utc: z.string().optional(),
})
const seriesFact = z.object({
  team_a: z.string(),
  team_b: z.string(),
  starts_at_utc: z.iso.datetime({ offset: true }),
  tournament_date: z.string().optional(),
  best_of: z.number().int().positive(),
  finished: z.boolean(),
  maps: z.array(resultFact),
})
const register = z.object({
  version: z.literal(1),
  tournaments: z.record(
    z.string(),
    z.object({ name: z.string(), series: z.record(z.string(), seriesFact) }),
  ),
})
type Register = z.infer<typeof register>
type Series = z.infer<typeof seriesFact>
type Schedule = z.infer<typeof scheduleSchema>
type Entry = { key: string; name: string; id: string; series: Series }
const archiveSchema = z.record(z.string(), z.array(mapSchema))
type Archive = z.infer<typeof archiveSchema>

let cache: { until: number; request: Promise<Register | null> } | undefined
let archived: Promise<Archive | null> | undefined

async function loadFile<T>(name: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`, {
      cache: "no-cache",
      signal: AbortSignal.timeout(6000),
    })
    return response.ok ? schema.parse(await response.json()) : null
  } catch {
    return null
  }
}

export function loadVerifiedResults() {
  if (!cache || Date.now() >= cache.until)
    cache = { until: Date.now() + 60_000, request: loadFile("verified-results", register) }
  if (!archived) {
    archived = loadFile("completed-forecasts", archiveSchema).then((value) => {
      if (!value) archived = undefined
      return value
    })
  }
  return Promise.all([cache.request, archived])
}

function entries(facts: Register): Entry[] {
  return Object.entries(facts.tournaments).flatMap(([key, event]) =>
    Object.entries(event.series).map(([id, series]) => ({ key, name: event.name, id, series })),
  )
}

function blankCard(entry: Entry, number: number): MapDTO {
  return {
    map_id: null,
    series_id: entry.id,
    map_number: number,
    revision: 0,
    label: `${entry.name} · Карта ${number}`,
    tournament: entry.name,
    team_a: entry.series.team_a,
    team_b: entry.series.team_b,
    rosters: { team_a: [], team_b: [] },
    pre: null,
    post: null,
    result: null,
  }
}

function normalized(value: string) {
  return value.trim().toLowerCase()
}

function matchingOrder(card: MapDTO, entry: Entry) {
  const a = normalized(card.team_a)
  const b = normalized(card.team_b)
  if (a === normalized(entry.series.team_a) && b === normalized(entry.series.team_b)) return 1
  if (b === normalized(entry.series.team_a) && a === normalized(entry.series.team_b)) return -1
  return 0
}

export function projectResult(card: MapDTO, entry: Entry, archive?: MapDTO): MapDTO {
  const number = card.map_number
  const order = matchingOrder(card, entry)
  if (
    !number ||
    !order ||
    card.series_id !== entry.id ||
    (card.tournament && normalized(card.tournament) !== normalized(entry.name))
  )
    return card
  const fact = entry.series.maps.find((item) => item.map_number === number)
  if (!fact) {
    if (entry.series.finished && number > entry.series.maps.length && !card.result)
      return { ...card, play_status: "unplayed", post: null, retrospective_post: null }
    return card
  }
  const winner = order === 1 ? fact.winner : fact.winner === "A" ? "B" : "A"
  const previous = card.result
  if (
    previous &&
    (previous.winner !== winner ||
      previous.duration_seconds !== fact.duration_seconds ||
      (previous.steam_match_id &&
        fact.steam_match_id &&
        previous.steam_match_id !== fact.steam_match_id))
  ) {
    return {
      ...card,
      result_conflict: "Исход, длительность или Steam Match ID расходятся с реестром.",
    }
  }
  const backup =
    archive?.map_number === number &&
    archive.series_id === entry.id &&
    (archive.map_id == null || card.map_id == null || archive.map_id === card.map_id) &&
    archive.team_a === card.team_a &&
    archive.team_b === card.team_b
      ? archive
      : undefined
  let post = card.post ?? backup?.post ?? null
  const external = post?.draft_external_game_id
  if (
    external?.startsWith("steam:") &&
    fact.steam_match_id &&
    external.slice(6) !== fact.steam_match_id
  )
    post = null
  if (
    post &&
    fact.steam_match_id &&
    backup?.post?.verified_steam_match_id === fact.steam_match_id &&
    post.snapshot_id === backup.post.snapshot_id &&
    (external ?? null) === (backup.post.draft_external_game_id ?? null) &&
    post.created_at_utc === backup.post.created_at_utc &&
    (["players_a", "players_b", "heroes_a", "heroes_b"] as const).every(
      (field) => JSON.stringify(post?.[field]) === JSON.stringify(backup.post?.[field]),
    )
  )
    post = { ...post, verified_steam_match_id: fact.steam_match_id }
  return {
    ...card,
    pre: card.pre ?? backup?.pre ?? null,
    post,
    retrospective_pre: backup?.retrospective_pre ?? card.retrospective_pre,
    retrospective_post: backup?.retrospective_post ?? card.retrospective_post,
    play_status: null,
    result: {
      ...previous,
      winner,
      duration_seconds: fact.duration_seconds,
      steam_match_id: fact.steam_match_id ?? previous?.steam_match_id,
      started_at_utc: fact.started_at_utc,
      settled_at_utc:
        previous?.settled_at_utc ??
        fact.observed_at_utc ??
        (fact.started_at_utc
          ? new Date(Date.parse(fact.started_at_utc) + fact.duration_seconds * 1000).toISOString()
          : ""),
    },
  }
}

function localDay(stamp: string) {
  return new Date(Date.parse(stamp) + 7 * 3600_000).toISOString().slice(0, 10)
}

function projectSchedule(
  url: URL,
  facts: Register,
  archive: Archive,
  live: Schedule | null,
): Schedule | null {
  const key = url.searchParams.get("tournament") || "pari-universe"
  const event = facts.tournaments[key]
  if (!event) return live
  const selected = new Map((live?.series ?? []).map((row) => [row.series_id, row]))
  const dates = new Set(live?.dates ?? [])
  for (const [id, series] of Object.entries(event.series)) {
    const entry = { id, name: event.name, key, series }
    const existing = selected.get(id)
    if (
      existing &&
      (existing.best_of !== series.best_of ||
        Math.abs(Date.parse(existing.starts_at_utc) - Date.parse(series.starts_at_utc)) >
          12 * 3600_000 ||
        ![series.team_a, series.team_b].every((name) =>
          [existing.team_a, existing.team_b].some(
            (other) => normalized(name) === normalized(other),
          ),
        ))
    )
      continue
    const date =
      existing?.tournament_date ?? series.tournament_date ?? localDay(series.starts_at_utc)
    dates.add(date)
    const dayFilter = url.searchParams.get("date")
    const team = url.searchParams.get("team")
    if (
      (dayFilter && date !== dayFilter) ||
      (team &&
        ![series.team_a, series.team_b].some((name) => normalized(name).includes(normalized(team))))
    )
      continue
    const rows = new Map((existing?.maps ?? []).map((card) => [card.map_number, card]))
    for (let number = 1; number <= series.best_of; number++) {
      const saved = archive[id]?.find((item) => item.map_number === number)
      const card = rows.get(number) ?? saved ?? blankCard(entry, number)
      rows.set(number, projectResult(card, entry, saved))
    }
    selected.set(id, {
      ...(existing ?? {
        series_id: id,
        team_a: series.team_a,
        team_b: series.team_b,
        tournament_date: date,
        starts_at_utc: series.starts_at_utc,
        best_of: series.best_of,
      }),
      maps: [...rows.values()].sort((a, b) => (a.map_number ?? 0) - (b.map_number ?? 0)),
    })
  }
  const tournaments = new Map((live?.tournaments ?? []).map((item) => [item.key, item]))
  for (const [id, item] of Object.entries(facts.tournaments))
    if (!tournaments.has(id)) tournaments.set(id, { key: id, name: item.name })
  return {
    ...live,
    tournament: live?.tournament ?? event.name,
    refreshed_at_utc: live?.refreshed_at_utc ?? null,
    tournaments: [...tournaments.values()],
    dates: [...dates].sort(),
    series: [...selected.values()],
  }
}

export function isResultRoute(path: string) {
  return /^\/(schedule(?:\?|$)|maps\/\d+$|series\/[^/?]+\/maps\/\d+$)/.test(path)
}

export async function verifiedView(
  path: string,
  raw: unknown,
  pending = loadVerifiedResults(),
): Promise<unknown> {
  const [facts, snapshots] = await pending
  if (!facts) return raw
  const archive = snapshots ?? {}
  const url = new URL(path, "https://dashboard.invalid")
  if (url.pathname === "/schedule") {
    return projectSchedule(url, facts, archive, raw == null ? null : scheduleSchema.parse(raw))
  }
  const captured = Object.values(archive).flat()
  let card = raw == null ? null : mapSchema.parse(raw)
  if (!card && url.pathname.startsWith("/maps/"))
    card = captured.find((item) => item.map_id === Number(url.pathname.split("/")[2])) ?? null
  const parts = /^\/series\/([^/]+)\/maps\/(\d+)$/.exec(url.pathname)
  const id = card?.series_id ?? (parts?.[1] && decodeURIComponent(parts[1]))
  const number = card?.map_number ?? (parts && Number(parts[2]))
  if (!id || !number) return raw
  const candidates = entries(facts).filter(
    (entry) => entry.id === id && (!card || matchingOrder(card, entry)),
  )
  const [entry] = candidates
  if (candidates.length !== 1 || !entry || number > entry.series.best_of) return raw
  const saved = archive[id]?.find((item) => item.map_number === number)
  return projectResult(card ?? saved ?? blankCard(entry, number), entry, saved)
}
