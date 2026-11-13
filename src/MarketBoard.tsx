import { ChevronDown, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import type { Api } from "./api"
import { message } from "./contracts"
import { query, time } from "./domain"
import { OddsComparison } from "./OddsComparison"
import { completeProviders, priceLabel, providerLabel, providerOddsSchema } from "./odds"
import { Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"

export const marketBoardSchema = z.object({
  checked_at_utc: z.string(),
  events: z.array(
    z.object({
      key: z.string(),
      team_a: z.string(),
      team_b: z.string(),
      starts_at_utc: z.string().nullable(),
      competition: z.string(),
      best_of: z.number().optional(),
      markets: z.array(
        z.object({
          map_number: z.number(),
          market_scope: z.enum(["series", "map"]),
          providers: z.array(providerOddsSchema),
        }),
      ),
    }),
  ),
  sources: z.array(
    z.object({
      provider: z.string(),
      status: z.enum(["ok", "unavailable"]),
      notice: z.string(),
    }),
  ),
  notice: z.string(),
})
type MarketBoardData = z.infer<typeof marketBoardSchema>
type Event = MarketBoardData["events"][number]

function EventMarkets({ event }: { readonly event: Event }) {
  return (
    <article className="market-event">
      <div className="market-event-heading">
        <div>
          <h3 className="market-match-identity">
            <TeamIdentity name={event.team_a} />
            <span className="market-versus"> — </span>
            <TeamIdentity name={event.team_b} />
          </h3>
          <p className="muted">{event.competition}</p>
        </div>
        <span className="muted">
          {event.starts_at_utc ? `${time(event.starts_at_utc)} · UTC+7` : "Время не указано"}
        </span>
      </div>
      {event.markets.map((market, index) => (
        <details
          className="market-scope"
          key={`${market.market_scope}-${market.map_number}`}
          open={market.market_scope === "series" || index === 0}
        >
          <summary>
            <span>
              <strong>
                {market.market_scope === "series" ? "Победа в серии" : `Карта ${market.map_number}`}
              </strong>
              <span className="market-preview">
                {market.providers
                  .filter(
                    (provider) =>
                      provider.status !== "empty" && provider.provider?.toLowerCase() !== "betboom",
                  )
                  .map((provider) => (
                    <span key={provider.provider}>
                      {providerLabel(provider.provider)}{" "}
                      {provider.winner
                        ? `${priceLabel(provider.winner.team_a)} / ${priceLabel(provider.winner.team_b)}`
                        : "нет цен на победу"}
                      {provider.duration_lines.length > 0
                        ? ` · линий тотала: ${provider.duration_lines.length}`
                        : ""}
                    </span>
                  ))}
              </span>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <OddsComparison
            quotes={completeProviders(market.providers, market.market_scope)}
            teamA={event.team_a}
            teamB={event.team_b}
            mapNumber={market.map_number}
            bestOf={event.best_of}
          />
        </details>
      ))}
    </article>
  )
}

export function MarketBoard({
  api,
  tournament,
}: {
  readonly api: Api
  readonly tournament: string
}) {
  const [data, setData] = useState<MarketBoardData | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [refresh, setRefresh] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh button reloads the same board.
  useEffect(() => {
    let active = true
    let pending = false
    async function load(manual: boolean) {
      if (pending) return
      pending = true
      if (manual) setBusy(true)
      try {
        const value = await api.request(`/markets?${query({ tournament })}`, marketBoardSchema)
        if (active) {
          setData(value)
          setError("")
        }
      } catch (err) {
        if (active) setError(message(err))
      } finally {
        pending = false
        if (active) setBusy(false)
      }
    }
    function refreshVisible() {
      if (document.visibilityState === "visible") void load(false)
    }
    void load(true)
    const timer = window.setInterval(refreshVisible, 15_000)
    document.addEventListener("visibilitychange", refreshVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshVisible)
    }
  }, [api, tournament, refresh])
  return (
    <section className="panel market-board" aria-busy={busy}>
      <div className="panel-heading">
        <div>
          <h2>Котировки · PARI и Polymarket</h2>
          <p className="muted">
            Серия и отдельные карты показаны раздельно. Все цены в десятичном формате.
            Автообновление раз в 15 секунд, пока страница открыта.
          </p>
          {data && (
            <p className="muted market-checked">
              Последнее успешное обновление: {time(data.checked_at_utc)} · UTC+7
            </p>
          )}
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {busy ? "Загружаем…" : "Обновить котировки"}
        </button>
      </div>
      {error && (
        <Notice error>
          {data
            ? "Обновление не удалось. Показаны ранее полученные снимки; цены могут устареть."
            : "Котировки сейчас недоступны."}{" "}
          {error}
        </Notice>
      )}
      {busy && !data && <p className="odds-loading muted">Загружаем источники котировок…</p>}
      {data && (
        <>
          <section className="market-source-statuses" aria-label="Доступность источников котировок">
            {data.sources
              .filter((source) => source.provider.toLowerCase() !== "betboom")
              .map((source) => (
                <p key={source.provider}>
                  <strong
                    className="provider-wordmark"
                    data-provider={source.provider.toLowerCase()}
                  >
                    <span className="provider-marker" aria-hidden="true" />
                    {providerLabel(source.provider)}
                  </strong>
                  <span className={source.status === "ok" ? "hit-text" : "muted"}>
                    {source.status === "ok" ? "Снимки доступны" : "Нет снимка"}
                  </span>
                  {source.notice && <small>{source.notice}</small>}
                </p>
              ))}
          </section>
          {data.notice && <p className="market-board-notice muted">{data.notice}</p>}
          {data.events.map((event) => (
            <EventMarkets key={event.key} event={event} />
          ))}
          {data.events.length === 0 && (
            <p className="market-board-notice muted">
              Подтверждённых котировок для выбранного турнира пока нет.
            </p>
          )}
        </>
      )}
    </section>
  )
}
