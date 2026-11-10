import { z } from "zod"

export const PLAY_IN_KEY = "1win-essence-3-play-in"
export const PLAY_IN_NAME = "1win Essence III · Play-In"
export const PLAY_IN_ROUTE = `/schedule?tournament=${PLAY_IN_KEY}`
export const playInSourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  retrieved_at_utc: z.string(),
})
const rosterPlayerSchema = z.object({
  nickname: z.string(),
  player_name: z.string().nullable(),
  role: z.number().nullable(),
  account_id: z.number().nullable(),
  is_standin: z.boolean().optional(),
  replaced_nickname: z.string().nullable().optional(),
})
const mapPlayerSchema = z.object({
  team_key: z.string(),
  nickname: z.string(),
  account_id: z.number().nullable(),
  hero: z.string().nullable(),
  kills: z.number().nullable(),
  deaths: z.number().nullable(),
  assists: z.number().nullable(),
  gold_per_min: z.number().nullable(),
  xp_per_min: z.number().nullable(),
  last_hits: z.number().nullable(),
  denies: z.number().nullable(),
  net_worth: z.number().nullable(),
  hero_damage: z.number().nullable().optional(),
  tower_damage: z.number().nullable().optional(),
  hero_healing: z.number().nullable().optional(),
  obs_placed: z.number().nullable().optional(),
  sen_placed: z.number().nullable().optional(),
  observer_kills: z.number().nullable().optional(),
  last_hits_at_10: z.number().nullable().optional(),
  denies_at_10: z.number().nullable().optional(),
  gold_at_10: z.number().nullable().optional(),
  xp_at_10: z.number().nullable().optional(),
})
const heroPickSchema = z.object({ team_key: z.string(), hero: z.string() })
const actualMapSchema = z.object({
  key: z.string(),
  map_number: z.number(),
  winner_team_key: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  team1_kills: z.number().nullable(),
  team2_kills: z.number().nullable(),
  players: z.array(mapPlayerSchema),
  picks: z.array(heroPickSchema),
  bans: z.array(heroPickSchema),
  source_ids: z.array(z.string()),
  raw_available: z.boolean().optional(),
  raw_path: z.string().nullable().optional(),
  radiant_team_key: z.string().nullable().optional(),
  team1_side: z.enum(["radiant", "dire"]).nullable().optional(),
  first_pick_team_key: z.string().nullable().optional(),
  raw_url: z.string().nullable().optional(),
})
export const playInSchema = z.object({
  tournament: z.object({
    key: z.literal(PLAY_IN_KEY),
    name: z.string(),
    main_event_key: z.string(),
    starts_on: z.string(),
    ends_on: z.string(),
    format: z.string(),
    group_count: z.number(),
    teams_per_group: z.number(),
    qualifiers_per_group: z.number(),
  }),
  as_of: z.string(),
  sources: z.array(playInSourceSchema),
  teams: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      group: z.string(),
      aliases: z.array(z.string()),
      previous_names: z.array(z.string()).optional(),
      roster: z.array(rosterPlayerSchema),
      roster_notes: z.array(z.string()).optional(),
      source_ids: z.array(z.string()),
    }),
  ),
  series: z.array(
    z.object({
      key: z.string(),
      group: z.string(),
      scheduled_at: z.string().nullable(),
      team1_key: z.string(),
      team2_key: z.string(),
      best_of: z.number(),
      status: z.enum(["scheduled", "live", "completed", "cancelled"]),
      score1: z.number().nullable(),
      score2: z.number().nullable(),
      maps: z.array(actualMapSchema),
      source_ids: z.array(z.string()),
    }),
  ),
  qualifications: z.array(
    z.object({
      team_key: z.string(),
      group: z.string(),
      position: z.union([z.literal(1), z.literal(2)]).nullable(),
      method: z.enum(["published", "completed_results"]).default("published"),
      source_ids: z.array(z.string()),
    }),
  ),
  coverage: z.object({
    notice: z.string(),
    missing: z.array(z.string()),
    notes: z.array(z.string()),
  }),
  groups: z.array(
    z.object({
      group: z.string(),
      complete: z.boolean(),
      standings: z.array(
        z.object({
          rank: z.number(),
          team_key: z.string(),
          team_name: z.string(),
          played: z.number(),
          won: z.number(),
          drawn: z.number(),
          lost: z.number(),
          maps_won: z.number(),
          maps_lost: z.number(),
          map_difference: z.number(),
          qualification_status: z.enum(["qualified", "pending"]),
        }),
      ),
    }),
  ),
  stats: z.object({
    completed_series: z.number(),
    live_series: z.number(),
    scheduled_series: z.number(),
    completed_maps: z.number(),
    maps_with_winner: z.number(),
    maps_with_duration: z.number(),
    maps_with_draft: z.number(),
    maps_with_player_stats: z.number(),
    average_duration_seconds: z.number().nullable(),
    heroes: z.array(
      z.object({
        hero: z.string(),
        picks: z.number(),
        bans: z.number(),
        wins: z.number(),
        losses: z.number(),
        win_rate: z.number().nullable(),
      }),
    ),
    players: z.array(
      z.object({
        team_key: z.string(),
        nickname: z.string(),
        maps: z.number(),
        wins: z.number(),
        losses: z.number(),
        kills: z.number().nullable(),
        deaths: z.number().nullable(),
        assists: z.number().nullable(),
        average_gold_per_min: z.number().nullable(),
        average_xp_per_min: z.number().nullable(),
      }),
    ),
  }),
})

export type PlayInData = z.infer<typeof playInSchema>
export type PlayInSeries = PlayInData["series"][number]
export type PlayInMap = PlayInSeries["maps"][number]

export function playInMapPath(seriesKey: string, mapNumber: number): string {
  return `/series/${encodeURIComponent(`e3pi-${seriesKey}`)}/maps/${mapNumber}`
}

export function playInAnalysisMaps(data: PlayInData, series: PlayInSeries): number[] {
  if (
    series.status === "cancelled" ||
    !series.scheduled_at ||
    !Number.isFinite(Date.parse(series.scheduled_at)) ||
    ![1, 3, 5].includes(series.best_of) ||
    series.team1_key === series.team2_key ||
    ![series.team1_key, series.team2_key].every((key) =>
      data.teams.some((team) => team.key === key),
    )
  )
    return []
  if (series.status === "completed")
    return [...new Set(series.maps.map((map) => map.map_number))]
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= series.best_of)
      .sort((a, b) => a - b)
  return Array.from({ length: series.best_of }, (_, index) => index + 1)
}

export function duration(value: number | null): string {
  if (value === null) return "Нет данных"
  const seconds = Math.round(value)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function teamName(data: PlayInData, key: string): string {
  return data.teams.find((team) => team.key === key)?.name ?? key
}

export function groupName(group: string): string {
  return /групп|group/i.test(group) ? group : `Группа ${group}`
}

export function seriesScore(series: Pick<PlayInSeries, "score1" | "score2">): string {
  return series.score1 === null || series.score2 === null
    ? "Счёт не подтверждён"
    : `${series.score1} : ${series.score2}`
}

export function qualificationSlots(data: PlayInData) {
  return data.groups.flatMap(({ group }) => {
    const confirmations = data.qualifications.filter((item) => item.group === group)
    const unranked = confirmations.filter((item) => item.position === null)
    return Array.from({ length: data.tournament.qualifiers_per_group }, (_, index) => {
      const position = index + 1
      const confirmed = confirmations.find((item) => item.position === position) ?? unranked.shift()
      return { group, position, confirmed }
    })
  })
}
