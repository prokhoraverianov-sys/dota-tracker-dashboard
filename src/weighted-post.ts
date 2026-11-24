import type { MapDTO } from "./contracts"
import records from "./essence-weighted-post.json"

const archive: Record<
  string,
  { series: string; number: number; a: string; b: string; probabilities: number[] }
> = records
export const weights = ["0,5", "1,0", "1,25"] as const

export function weightedPost(map: MapDTO, weight: (typeof weights)[number]) {
  const row = archive[map.result?.steam_match_id ?? ""]
  if (
    !row ||
    row.series !== map.series_id ||
    row.number !== map.map_number ||
    !map.result ||
    map.result_conflict ||
    map.play_status === "unplayed"
  )
    return null
  const p = row.probabilities[weights.indexOf(weight)]
  if (p == null || p === 0.5) return null
  const forward = map.team_a === row.a && map.team_b === row.b
  if (!forward && (map.team_a !== row.b || map.team_b !== row.a)) return null
  const selected = p > 0.5 === forward ? "A" : "B"
  return { selected, comparison: selected === map.result.winner, hit: null } as const
}
