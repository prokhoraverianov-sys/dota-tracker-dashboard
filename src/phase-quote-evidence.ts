import type { MapDTO } from "./contracts"
import type { MapStage } from "./map-outcome"
import { quoteSourceUrl } from "./odds"
import verifiedPhaseQuotes from "./verified-phase-quotes.json"

interface ArchivedPhaseQuote {
  provider: string
  marketId: string
  marketUrl: string
  teamA: number
  teamB: number
  atA: string
  atB: string
  windowStart?: string
  windowEnd: string
}

interface ArchivedMapQuotes {
  seriesId: string
  mapNumber: number
  teamA: string
  teamB: string
  pre?: ArchivedPhaseQuote
  post?: ArchivedPhaseQuote
}

const archivedQuotes: Readonly<Record<string, ArchivedMapQuotes | undefined>> = verifiedPhaseQuotes

function archiveTime(stamp: string | undefined) {
  return stamp && /(?:Z|\+00:00)$/.test(stamp) ? Date.parse(stamp) : Number.NaN
}

export function archivedPhaseQuote(map: MapDTO, stage: MapStage) {
  const steam = map.result?.steam_match_id
  if (!steam || map.result_conflict || map.play_status === "unplayed") return null
  const saved = archivedQuotes[steam]
  if (!saved || saved.seriesId !== map.series_id || saved.mapNumber !== map.map_number) return null
  const forward = saved.teamA === map.team_a && saved.teamB === map.team_b
  const reverse = saved.teamA === map.team_b && saved.teamB === map.team_a
  if (!forward && !reverse) return null
  const quote = saved[stage]
  if (!quote || quote.provider !== "Polymarket" || !/^0x[0-9a-f]{64}$/i.test(quote.marketId))
    return null
  const sourceUrl = quoteSourceUrl(quote.marketUrl, quote.provider)
  if (
    !sourceUrl ||
    !new URL(sourceUrl).searchParams.get("marketSlug")?.endsWith(`-game${map.map_number}`)
  )
    return null
  if (![quote.teamA, quote.teamB].every((price) => Number.isFinite(price) && price > 1)) return null
  const a = archiveTime(quote.atA)
  const b = archiveTime(quote.atB)
  const end = archiveTime(quote.windowEnd)
  if (![a, b, end].every(Number.isFinite) || Math.max(a, b) >= end) return null
  const start = archiveTime(quote.windowStart)
  const decider = map.series_best_of === 3 && map.map_number === 3
  if ((stage === "post" || decider || quote.windowStart != null) && !(Math.min(a, b) >= start))
    return null
  return {
    provider: quote.provider,
    marketId: quote.marketId.toLowerCase(),
    sourceUrl,
    windowStart: Number.isFinite(start) ? start : null,
    windowEnd: end,
    a: forward ? quote.teamA : quote.teamB,
    b: forward ? quote.teamB : quote.teamA,
    atA: forward ? quote.atA : quote.atB,
    atB: forward ? quote.atB : quote.atA,
  }
}
