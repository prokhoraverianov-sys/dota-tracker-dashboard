import { z } from "zod"

const snapshotSchema = z.object({
  status: z.enum(["fresh", "stale", "empty"]),
  provider: z.string().nullable(),
  source_url: z.string().nullable(),
  observed_at_utc: z.string().nullable(),
  provider_quote_at_utc: z.string().nullish(),
  phase: z.string(),
  market_scope: z.enum(["map", "series"]).default("map"),
  winner: z.object({ team_a: z.string(), team_b: z.string() }).nullable(),
  duration_lines: z.array(
    z.object({ line_minutes: z.string(), over: z.string(), under: z.string() }),
  ),
  notice: z.string(),
})
export const providerOddsSchema = snapshotSchema
export const oddsSchema = snapshotSchema.extend({ providers: z.array(snapshotSchema).optional() })
export type ProviderOdds = z.infer<typeof providerOddsSchema>
export type Odds = z.infer<typeof oddsSchema>

const trackedProviders = ["PARI", "betboom", "polymarket"] as const

export function providerLabel(provider: string | null): string {
  switch (provider?.toLocaleLowerCase("en")) {
    case "pari":
      return "PARI"
    case "betboom":
      return "BetBoom"
    case "polymarket":
      return "Polymarket"
    default:
      return provider ?? "Источник не указан"
  }
}

export function completeProviders(
  snapshots: readonly ProviderOdds[],
  scope: ProviderOdds["market_scope"],
): ProviderOdds[] {
  const tracked = trackedProviders.map(
    (provider) =>
      snapshots.find((snapshot) => snapshot.provider?.toLowerCase() === provider.toLowerCase()) ?? {
        status: "empty" as const,
        provider,
        source_url: null,
        observed_at_utc: null,
        phase: "unknown",
        market_scope: scope,
        winner: null,
        duration_lines: [],
        notice: "Снимок котировок этого источника отсутствует.",
      },
  )
  return [
    ...tracked,
    ...snapshots.filter(
      (snapshot) =>
        !trackedProviders.some(
          (provider) => snapshot.provider?.toLowerCase() === provider.toLowerCase(),
        ),
    ),
  ]
}
export function providerQuotes(odds: Odds): ProviderOdds[] {
  return completeProviders(
    odds.providers?.length ? odds.providers : odds.provider ? [odds] : [],
    odds.market_scope,
  )
}

export function quoteSourceUrl(value: string | null, provider?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return null
    switch (provider?.toLowerCase()) {
      case "pari":
        if (url.hostname !== "pari.ru") return null
        break
      case "betboom":
        if (url.hostname !== "betboom.ru") return null
        break
      case "polymarket":
        if (url.hostname !== "polymarket.com" || !/^\/event\/[^/]+/.test(url.pathname)) return null
        break
    }
    return url.href
  } catch {
    return null
  }
}

export function quotePhase(quote: ProviderOdds): string {
  const scope = quote.market_scope === "series" ? "серии" : "карты"
  if (quote.phase === "pre_map" || quote.phase === "pre_series") return `До ${scope}`
  if (quote.phase === "live" || quote.phase === "in_play") return `Во время ${scope}`
  return "Фаза неизвестна"
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
  useGrouping: false,
})

export function priceLabel(value: string): string {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? priceFormatter.format(price) : value
}

export function quoteNotice(value: string): string {
  const messages: Readonly<Record<string, string>> = {
    "Cached odds observed within the last 60 seconds": "Снимок получен не более минуты назад.",
    "Cached odds are stale or have a future timestamp":
      "Снимок устарел или время источника опережает текущее.",
    "No cached observation for this provider and market":
      "Подтверждённого снимка этого рынка у источника нет.",
    "No supported prices in this provider's latest observation":
      "В последнем снимке нет подтверждённых цен этого рынка.",
  }
  return messages[value] ?? value
}
