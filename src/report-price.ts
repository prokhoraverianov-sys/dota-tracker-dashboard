import { archivedWinnerPrices } from "./ArchivedPrices"
import type { MapDTO } from "./contracts"

const formatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
export const decimalPrice = (value: number) => formatter.format(value)

export function reportPrice(map: MapDTO, side: "A" | "B") {
  const start = Date.parse(map.result?.started_at_utc ?? "")
  if (!map.result?.steam_match_id || !Number.isFinite(start)) return null
  const { observations } = archivedWinnerPrices(map)
  const eligible = observations
    .filter(
      (q) =>
        Date.parse(q.at ?? "") < start &&
        Number(side === "A" ? q.team_a : q.team_b) > 1 &&
        Number.isFinite(Number(side === "A" ? q.team_a : q.team_b)),
    )
    .sort((a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? ""))
  const quote =
    eligible.find((q) => q.scope === "map" || q.scope === "before") ??
    eligible.find((q) => q.scope === "series_at_1_1")
  if (!quote) return null
  const series = quote.scope === "series_at_1_1"
  return {
    value: Number(side === "A" ? quote.team_a : quote.team_b),
    series,
    label: series ? "серия при 1:1" : "до карты",
  }
}
