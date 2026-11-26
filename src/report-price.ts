import type { DraftQuote, Forecast, MapDTO } from "./contracts"
import {
  hasVerifiedDraft,
  hasVerifiedPreCapture,
  type MapStage,
  preForecastWindow,
} from "./map-outcome"
import { providerLabel, quoteSourceUrl } from "./odds"
import { archivedPhaseQuote } from "./phase-quote-evidence"

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
  const attached = forecast?.pre_quote_status === "attached_before_series"
  const decision = Date.parse(
    (attached ? forecast.pre_phase_checked_at_utc : forecast?.pre_decision_at_utc) ?? "",
  )
  const observations =
    attached || forecast?.pre_quote_status === "captured"
      ? forecast?.pre_draft_quotes
      : forecast?.pre_decision_quotes
  return (observations ?? []).filter(
    (quote) => validQuote(quote) && quoteTimes(quote).observed <= decision,
  )
}

function exactPolymarketMap(mapNumber: number | null, quote: DraftQuote) {
  if (!mapNumber || providerLabel(quote.provider) !== "Polymarket") return null
  const source = quoteSourceUrl(quote.source_url, quote.provider)
  if (!source) return null
  const url = new URL(source)
  const slug = url.searchParams.get("marketSlug") ?? url.pathname.split("/").filter(Boolean).at(-1)
  return slug?.endsWith(`-game${mapNumber}`) ? slug : null
}

function capturedPreQuotes(map: MapDTO) {
  if (!map.pre || !hasVerifiedPreCapture(map, map.pre)) return []
  const window = preForecastWindow(map)
  const saved = Date.parse(map.pre.created_at_utc)
  const decision = Date.parse(map.pre.pre_decision_at_utc ?? map.pre.created_at_utc)
  const start = Date.parse(map.pre.pre_window_opened_at_utc ?? "")
  if (
    window &&
    !(Math.max(saved, decision) < window.end && Math.min(saved, decision) >= window.start)
  )
    return []
  return observedPreDecisionQuotes(map.pre).filter((quote) => {
    const observed = quoteTimes(quote).observed
    return (
      !!exactPolymarketMap(map.map_number, quote) &&
      (!Number.isFinite(start) || observed >= start) &&
      (!window || (observed >= window.start && observed < window.end))
    )
  })
}

function phaseQuotes(map: MapDTO, stage: MapStage) {
  if (!map.result?.steam_match_id || map.result_conflict) return []
  if (stage === "pre") {
    if (
      map.pre?.pre_quote_status === "captured" ||
      map.pre?.pre_quote_status === "attached_before_series"
    )
      return capturedPreQuotes(map)
    const window = preForecastWindow(map)
    if (!window) return []
    const saved = Date.parse(map.pre?.created_at_utc ?? "")
    const decision = Date.parse(map.pre?.pre_decision_at_utc ?? "")
    if (!(Math.max(decision, saved) < window.end && Math.min(decision, saved) >= window.start))
      return []
    return observedPreDecisionQuotes(map.pre).filter((quote) => {
      const observed = quoteTimes(quote).observed
      return observed >= window.start && observed < window.end
    })
  }
  if (!hasVerifiedDraft(map) || !map.post?.draft_completed_at_utc) return []
  const gameplay = Date.parse(map.gameplay_started_at_utc ?? "")
  return observedPostDraftQuotes(map.post).filter((quote) => quoteTimes(quote).observed < gameplay)
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
  if (map.result_conflict || map.play_status === "unplayed") return null
  const pre = map.result ? phaseQuotes(map, "pre") : capturedPreQuotes(map)
  const post = map.result
    ? phaseQuotes(map, "post")
    : map.post?.draft_completed_at_utc && map.post.post_draft_quote_status === "captured"
      ? observedPostDraftQuotes(map.post)
      : []
  for (const quote of pre) {
    const market = exactPolymarketMap(map.map_number, quote)
    if (!market) continue
    const second = post.find((candidate) => {
      if (exactPolymarketMap(map.map_number, candidate) !== market) return false
      return !candidate.event_id || !quote.event_id || candidate.event_id === quote.event_id
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
