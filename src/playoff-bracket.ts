import { mapPath, query } from "./domain"
import { type ScheduleSeries, seriesResult } from "./series-result"

export const BLAST_TOURNAMENT = "blast-slam-ix"

type Lane = "upper" | "lower" | "grand"
type Round = 1 | 2 | 3 | 4
type Position = 1 | 2
type Outcome = "winner" | "loser"
type Seed = { name: string } | { match: number; outcome: Outcome }

type MatchDefinition = {
  id: number
  title: string
  shortTitle: string
  lane: Lane
  round: Round
  position: Position
  startsAt: string
  bestOf: number
  seeds: readonly [Seed, Seed]
}

type BracketTeam = {
  name: string | null
  source: string | null
  score: number | null
  winner: boolean
}

export type BracketMatch = Omit<MatchDefinition, "id" | "seeds"> & {
  id: string
  teams: readonly [BracketTeam, BracketTeam]
  status: "scheduled" | "playing" | "finished"
  maps: readonly { number: number; href: string }[]
}

const team = (name: string): Seed => ({ name })
const winner = (match: number): Seed => ({ match, outcome: "winner" })
const loser = (match: number): Seed => ({ match, outcome: "loser" })

// Organizer's bracket, in dependency order. IDs are the existing Cybersport fixtures.
// https://blast.tv/dota/tournaments/blast-slam-ix/series?view=schedule
const blast: readonly MatchDefinition[] = [
  {
    id: 10100688,
    title: "Четвертьфинал верхней сетки 1",
    shortTitle: "Четвертьфинал 1",
    lane: "upper",
    round: 1,
    position: 1,
    startsAt: "2026-11-26T10:00:00Z",
    bestOf: 3,
    seeds: [team("GamerLegion"), team("Aurora Gaming")],
  },
  {
    id: 10100689,
    title: "Четвертьфинал верхней сетки 2",
    shortTitle: "Четвертьфинал 2",
    lane: "upper",
    round: 1,
    position: 2,
    startsAt: "2026-11-26T13:30:00Z",
    bestOf: 3,
    seeds: [team("1w Team"), team("Team Liquid")],
  },
  {
    id: 10100692,
    title: "Полуфинал верхней сетки 1",
    shortTitle: "Полуфинал 1",
    lane: "upper",
    round: 2,
    position: 1,
    startsAt: "2026-11-26T17:00:00Z",
    bestOf: 3,
    seeds: [team("Team Yandex"), winner(10100688)],
  },
  {
    id: 10100693,
    title: "Полуфинал верхней сетки 2",
    shortTitle: "Полуфинал 2",
    lane: "upper",
    round: 2,
    position: 2,
    startsAt: "2026-11-27T10:00:00Z",
    bestOf: 3,
    seeds: [team("PARIVISION"), winner(10100689)],
  },
  {
    id: 10100690,
    title: "Четвертьфинал нижней сетки 1",
    shortTitle: "Четвертьфинал 1",
    lane: "lower",
    round: 1,
    position: 1,
    startsAt: "2026-11-27T13:30:00Z",
    bestOf: 3,
    seeds: [loser(10100693), loser(10100688)],
  },
  {
    id: 10100691,
    title: "Четвертьфинал нижней сетки 2",
    shortTitle: "Четвертьфинал 2",
    lane: "lower",
    round: 1,
    position: 2,
    startsAt: "2026-11-27T17:00:00Z",
    bestOf: 3,
    seeds: [loser(10100692), loser(10100689)],
  },
  {
    id: 10100695,
    title: "Финал верхней сетки",
    shortTitle: "Финал",
    lane: "upper",
    round: 3,
    position: 1,
    startsAt: "2026-11-28T11:30:00Z",
    bestOf: 3,
    seeds: [winner(10100692), winner(10100693)],
  },
  {
    id: 10100694,
    title: "Полуфинал нижней сетки",
    shortTitle: "Полуфинал",
    lane: "lower",
    round: 2,
    position: 1,
    startsAt: "2026-11-28T15:00:00Z",
    bestOf: 3,
    seeds: [winner(10100690), winner(10100691)],
  },
  {
    id: 10100696,
    title: "Финал нижней сетки",
    shortTitle: "Финал",
    lane: "lower",
    round: 3,
    position: 1,
    startsAt: "2026-11-29T10:00:00Z",
    bestOf: 3,
    seeds: [loser(10100695), winner(10100694)],
  },
  {
    id: 10100697,
    title: "Гранд-финал",
    shortTitle: "Гранд-финал",
    lane: "grand",
    round: 4,
    position: 1,
    startsAt: "2026-11-29T14:00:00Z",
    bestOf: 5,
    seeds: [winner(10100695), winner(10100696)],
  },
]

function resolveSeed(seed: Seed, resolved: ReadonlyMap<number, BracketMatch>): BracketTeam {
  if ("name" in seed) return { name: seed.name, source: null, score: null, winner: false }
  const match = resolved.get(seed.match)
  if (!match) throw new Error(`Unresolved BLAST bracket dependency: ${seed.match}`)
  const expectedWinner = seed.outcome === "winner"
  const participant =
    match.status === "finished"
      ? match.teams.find((team) => team.winner === expectedWinner)
      : undefined
  return {
    name: participant?.name ?? null,
    source: `${expectedWinner ? "Победитель" : "Проигравший"} · ${match.title}`,
    score: null,
    winner: false,
  }
}

export function blastPlayoffBracket(series: readonly ScheduleSeries[]): BracketMatch[] {
  const byId = new Map(series.map((item) => [item.series_id, item]))
  const resolved = new Map<number, BracketMatch>()
  for (const { id: sourceId, seeds, ...definition } of blast) {
    const id = `cs-10003480-${sourceId}`
    const match = byId.get(id)
    const incoming = [resolveSeed(seeds[0], resolved), resolveSeed(seeds[1], resolved)] as const
    if (!match) {
      resolved.set(sourceId, { ...definition, id, teams: incoming, status: "scheduled", maps: [] })
      continue
    }
    const { a, b, done } = seriesResult(match, definition.bestOf)
    const scored = a + b > 0
    resolved.set(sourceId, {
      ...definition,
      id,
      startsAt: match.starts_at_utc,
      teams: [
        { name: match.team_a, source: null, score: scored ? a : null, winner: done && a > b },
        { name: match.team_b, source: null, score: scored ? b : null, winner: done && b > a },
      ],
      status: done ? "finished" : scored ? "playing" : "scheduled",
      maps: match.maps.flatMap((map) =>
        map.play_status !== "unplayed" && map.map_number && map.map_number <= definition.bestOf
          ? [
              {
                number: map.map_number,
                href: `#${mapPath(map)}?${query({ tournament: BLAST_TOURNAMENT })}`,
              },
            ]
          : [],
      ),
    })
  }
  return [...resolved.values()]
}
