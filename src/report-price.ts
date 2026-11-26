import type { DraftQuote, Forecast, MapDTO } from "./contracts"
import { hasVerifiedDraft, type MapStage } from "./map-outcome"
import { providerLabel, quoteSourceUrl } from "./odds"
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

const formatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
export const decimalPrice = (value: number) => formatter.format(value)

function quoteTimes(quote: DraftQuote) {
  const observed = Date.parse(quote.observed_at_utc)
  const provider =
    quote.provider_quote_at_utc == null ? observed : Date.parse(quote.provider_quote_at_utc)
  return { observed, provider }
}

function validQuote(quote: DraftQuote) {
  const { observed, provider } = quoteTimes(quote)
  return (
    quote.market_scope === "map" &&
    !!quoteSourceUrl(quote.source_url, quote.provider) &&
    [quote.winner.team_a, quote.winner.team_b].every(
      (v) => Number.isFinite(Number(v)) && Number(v) > 1,
    ) &&
    Number.isFinite(provider) &&
    Number.isFinite(observed) &&
    provider <= observed
  )
}

export function observedPostDraftQuotes(forecast: Omit<Forecast, "map_id"> | null) {
  const draft = Date.parse(
    forecast?.draft_completed_at_utc ?? forecast?.draft_observed_at_utc ?? "",
  )
  return (forecast?.post_draft_quotes ?? []).filter((quote) => {
    const { observed, provider } = quoteTimes(quote)
    if (!validQuote(quote) || !(observed >= draft && observed - draft <= 10_000)) return false
    const requested = Date.parse(quote.request_started_at_utc ?? "")
    const requestInWindow = requested >= draft && requested <= observed
    const source = providerLabel(quote.provider)
    if (source === "LEON") {
      return quote.observation_method === "leon_event_line" && requestInWindow
    }
    return (
      provider >= draft ||
      (source === "Polymarket" &&
        quote.observation_method === "polymarket_rest_book" &&
        requestInWindow)
    )
  })
}

export function observedPreDecisionQuotes(forecast: Omit<Forecast, "map_id"> | null) {
  const decision = Date.parse(forecast?.pre_decision_at_utc ?? "")
  return (forecast?.pre_decision_quotes ?? []).filter(
    (quote) => validQuote(quote) && quoteTimes(quote).observed <= decision,
  )
}

function phaseQuotes(map: MapDTO, stage: MapStage) {
  if (!map.result?.steam_match_id || map.result_conflict) return []
  if (stage === "pre") {
    const saved = Date.parse(map.pre?.created_at_utc ?? "")
    const decision = Date.parse(map.pre?.pre_decision_at_utc ?? "")
    if (!(Math.max(decision, saved) < Date.parse(map.draft_started_at_utc ?? ""))) return []
    return observedPreDecisionQuotes(map.pre)
  }
  if (!hasVerifiedDraft(map) || !map.post?.draft_completed_at_utc) return []
  const gameplay = Date.parse(map.gameplay_started_at_utc ?? "")
  return observedPostDraftQuotes(map.post).filter((quote) => quoteTimes(quote).observed < gameplay)
}

function archiveTime(stamp: string | undefined) {
  return stamp && /(?:Z|\+00:00)$/.test(stamp) ? Date.parse(stamp) : Number.NaN
}

function archivedPhaseQuote(map: MapDTO, stage: MapStage) {
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
  if (stage === "post" && !(Math.min(a, b) >= archiveTime(quote.windowStart))) return null
  return {
    provider: quote.provider,
    marketId: quote.marketId.toLowerCase(),
    sourceUrl,
    windowEnd: end,
    a: forward ? quote.teamA : quote.teamB,
    b: forward ? quote.teamB : quote.teamA,
    atA: forward ? quote.atA : quote.atB,
    atB: forward ? quote.atB : quote.atA,
  }
}

export function originalPostAfterVerifiedWindow(map: MapDTO) {
  const end = archivedPhaseQuote(map, "post")?.windowEnd
  return end != null && Date.parse(map.post?.created_at_utc ?? "") >= end
}

export function reportPrice(map: MapDTO, stage: MapStage, side: "A" | "B") {
  const quotes = phaseQuotes(map, stage)
  const quote = quotes.find((q) => providerLabel(q.provider) === "Polymarket") ?? quotes[0]
  if (!quote) {
    const saved = archivedPhaseQuote(map, stage)
    return saved
      ? {
          value: side === "A" ? saved.a : saved.b,
          provider: saved.provider,
          observedAt: side === "A" ? saved.atA : saved.atB,
          retrospective: true,
          sourceUrl: saved.sourceUrl,
        }
      : null
  }
  return {
    value: Number(side === "A" ? quote.winner.team_a : quote.winner.team_b),
    provider: providerLabel(quote.provider),
    observedAt: quote.observed_at_utc,
    retrospective: false,
    sourceUrl: quoteSourceUrl(quote.source_url, quote.provider),
  }
}

export function reportPriceChange(map: MapDTO) {
  const pre = phaseQuotes(map, "pre")
  const post = phaseQuotes(map, "post")
  for (const quote of pre) {
    const second = post.find((candidate) => {
      if (providerLabel(candidate.provider) !== providerLabel(quote.provider)) return false
      if (candidate.event_id && quote.event_id) return candidate.event_id === quote.event_id
      return (
        quoteSourceUrl(candidate.source_url, candidate.provider) ===
        quoteSourceUrl(quote.source_url, quote.provider)
      )
    })
    if (second) {
      return {
        provider: providerLabel(quote.provider),
        a: Number(second.winner.team_a) - Number(quote.winner.team_a),
        b: Number(second.winner.team_b) - Number(quote.winner.team_b),
        retrospective: false,
      }
    }
  }
  const archivedPre = archivedPhaseQuote(map, "pre")
  const archivedPost = archivedPhaseQuote(map, "post")
  if (!archivedPre || !archivedPost || archivedPre.marketId !== archivedPost.marketId) return null
  return {
    provider: archivedPre.provider,
    a: archivedPost.a - archivedPre.a,
    b: archivedPost.b - archivedPre.b,
    retrospective: true,
  }
}
