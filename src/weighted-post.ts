import type { MapDTO } from "./contracts"
import records from "./essence-weighted-post.json"
import { evaluateMap } from "./map-outcome"

const archive: Record<
  string,
  { series: string; number: number; a: string; b: string; probabilities: number[] }
> = records
export const weights = ["0,5", "1,0", "1,25"] as const
const blastKeys = ["0.5", "1.0", "1.25"] as const

export function weightedPost(map: MapDTO, weight: (typeof weights)[number]) {
  if (map.tournament === "BLAST Slam IX") {
    const base = evaluateMap(map, "post")
    if (!map.result || !map.result.steam_match_id || base.comparison == null) return null
    const raw = base.forecast?.analysis.shadow_forecast?.reasons?.find((reason) =>
      reason.startsWith("blast_ix_post_weights="),
    )
    if (!raw) return null
    try {
      const key = blastKeys[weights.indexOf(weight)]
      if (!key) return null
      const p: unknown = JSON.parse(raw.slice("blast_ix_post_weights=".length))?.[key]
      if (typeof p !== "number" || p < 0 || p > 1 || p === 0.5) return null
      const selected = p > 0.5 ? "A" : "B"
      const comparison = selected === map.result.winner
      return { selected, comparison, hit: base.hit == null ? null : comparison } as const
    } catch {
      return null
    }
  }
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
