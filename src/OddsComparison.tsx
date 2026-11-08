import { ExternalLink } from "lucide-react"
import { time } from "./domain"
import { type ProviderOdds, priceLabel, providerLabel, quotePhase, quoteSourceUrl } from "./odds"

function ProviderQuote({
  quote,
  teamA,
  teamB,
  mapNumber,
  bestOf,
}: {
  readonly quote: ProviderOdds
  readonly teamA: string
  readonly teamB: string
  readonly mapNumber?: number | null | undefined
  readonly bestOf?: number | undefined
}) {
  const name = providerLabel(quote.provider)
  const source = quoteSourceUrl(quote.source_url, quote.provider)
  const series = quote.market_scope === "series"
  const scope = series
    ? `Серия${bestOf ? ` · BO${bestOf}` : ""}`
    : `Карта ${mapNumber ?? ""}`.trim()
  const available = quote.status !== "empty"
  return (
    <article
      className={`odds-provider odds-provider-${quote.status}`}
      aria-label={`${name} · ${scope}`}
    >
      <div className="odds-provider-heading">
        <strong>{name}</strong>
        <span className={`badge odds-status odds-status-${quote.status}`}>
          {quote.status === "fresh"
            ? "Свежий снимок"
            : quote.status === "stale"
              ? "Устаревший снимок"
              : "Нет котировок"}
        </span>
      </div>
      <div className="odds-provider-meta">
        <span>{scope}</span>
        {available && <span>{quotePhase(quote)}</span>}
        {quote.observed_at_utc ? (
          <time dateTime={quote.observed_at_utc}>
            Получено {time(quote.observed_at_utc)} · UTC+7
          </time>
        ) : available ? (
          <span>Время снимка не указано</span>
        ) : null}
        {quote.provider_quote_at_utc && quote.provider_quote_at_utc !== quote.observed_at_utc && (
          <time dateTime={quote.provider_quote_at_utc}>
            Котировка {time(quote.provider_quote_at_utc)} · UTC+7
          </time>
        )}
      </div>
      {available ? (
        <>
          <h3>{series ? "Победа в серии" : "Победа на карте"}</h3>
          {quote.winner ? (
            <dl className="odds-winner-prices">
              <div>
                <dt>{teamA}</dt>
                <dd>{priceLabel(quote.winner.team_a)}</dd>
              </div>
              <div>
                <dt>{teamB}</dt>
                <dd>{priceLabel(quote.winner.team_b)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted odds-missing">Цен на победу в этом снимке нет.</p>
          )}
          {!series && (
            <>
              <h3>Тотал длительности карты</h3>
              {quote.duration_lines.length > 0 ? (
                <table className="odds-duration-table" aria-label={`Тотал длительности · ${name}`}>
                  <thead>
                    <tr>
                      <th scope="col">Минуты</th>
                      <th scope="col">Больше</th>
                      <th scope="col">Меньше</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.duration_lines.map((line) => (
                      <tr key={line.line_minutes}>
                        <td>{line.line_minutes}</td>
                        <td className="numeric">{priceLabel(line.over)}</td>
                        <td className="numeric">{priceLabel(line.under)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted odds-missing">Линий тотала в этом снимке нет.</p>
              )}
            </>
          )}
        </>
      ) : (
        <p className="muted odds-missing">
          {quote.notice || "Снимок котировок этого источника отсутствует."}
        </p>
      )}
      {quote.notice && available && <p className="odds-provider-notice">{quote.notice}</p>}
      {source && (
        <a className="odds-open-source" href={source} target="_blank" rel="noreferrer">
          {quote.provider?.toLowerCase() === "polymarket"
            ? "Открыть рынок Polymarket"
            : `Открыть линию ${name}`}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}
    </article>
  )
}

export function OddsComparison({
  quotes,
  teamA,
  teamB,
  mapNumber,
  bestOf,
}: {
  readonly quotes: readonly ProviderOdds[]
  readonly teamA: string
  readonly teamB: string
  readonly mapNumber?: number | null | undefined
  readonly bestOf?: number | undefined
}) {
  return (
    <div className="odds-comparison">
      {quotes.map((quote) => (
        <ProviderQuote
          key={`${quote.provider}-${quote.market_scope}`}
          quote={quote}
          teamA={teamA}
          teamB={teamB}
          mapNumber={mapNumber}
          bestOf={bestOf}
        />
      ))}
    </div>
  )
}
