import type { z } from "zod"
import type { scheduleSchema } from "./contracts"

export type ScheduleSeries = z.infer<typeof scheduleSchema>["series"][number]

export function seriesResult(series: ScheduleSeries, bestOf = series.best_of) {
  const winners = series.maps.flatMap((map) =>
    !map.result || map.result_conflict || map.play_status === "unplayed"
      ? []
      : [map.result.winner === "A" ? map.team_a : map.team_b],
  )
  const a = winners.filter((name) => name === series.team_a).length
  const b = winners.filter((name) => name === series.team_b).length
  const target = Math.floor(bestOf / 2) + 1
  const done = a >= target || b >= target || (bestOf > 0 && a + b === bestOf)
  return { a, b, done }
}
