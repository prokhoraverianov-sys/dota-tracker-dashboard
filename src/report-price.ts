import type { DraftQuote, Forecast, MapDTO } from "./contracts"
import { hasVerifiedDraft, type MapStage } from "./map-outcome"
import { providerLabel, quoteSourceUrl } from "./odds"

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

export const phasePriceLabels = { pre: "до драфта", post: "после драфта" } as const

export function reportPrice(map: MapDTO, stage: MapStage, side: "A" | "B") {
  const quotes = phaseQuotes(map, stage)
  const quote = quotes.find((q) => providerLabel(q.provider) === "Polymarket") ?? quotes[0]
  if (!quote) return null
  return {
    value: Number(side === "A" ? quote.winner.team_a : quote.winner.team_b),
    provider: providerLabel(quote.provider),
    observedAt: quote.observed_at_utc,
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
      }
    }
  }
  return null
}
