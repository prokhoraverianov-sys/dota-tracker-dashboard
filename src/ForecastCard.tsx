import type { DraftQuote, Forecast, MapDTO } from "./contracts"
import { criterionLabels, readCriteria } from "./criteria"
import { percent, time } from "./domain"
import { OddsTable } from "./OddsTable"
import { priceLabel, providerLabel, quoteSourceUrl } from "./odds"
import { observedPostDraftQuotes, observedPreDecisionQuotes } from "./report-price"
import { Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"
import "./analysis-presentation.css"

const abstentionLabels: Readonly<Record<string, string | undefined>> = {
  duplicate_player_identity:
    "Один и тот же игрок указан в составе несколько раз. Проверьте фактические составы обеих команд и укажите 10 разных игроков для POST.",
  unknown_team: "Одна из команд не распознана в данных модели.",
  unverified_or_ambiguous_player:
    "В составе есть неподтверждённый или неоднозначно определённый игрок. Проверьте фактических игроков и их позиции.",
  postdraft_requires_ten_distinct_verified_heroes:
    "Для POST нужны 10 разных подтверждённых героев. Проверьте пики обеих команд.",
}

const marketDiagnosticLabels = {
  no_observation: "К моменту расчёта снимок не найден",
  identity_mismatch: "Снимок не совпал с командами или рынком",
  outside_freshness_window: "Снимок вне 60-секундного окна до расчёта",
  no_complete_prices: "В стакане нет цен на обе команды",
  read_error: "Не удалось прочитать снимок котировки",
}

const quoteClock = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

function QuoteObservation({
  quote,
  map,
  completedAt,
}: {
  readonly quote: DraftQuote
  readonly map: MapDTO
  readonly completedAt?: string | null
}) {
  const source = quoteSourceUrl(quote.source_url, quote.provider)
  const elapsed = (Date.parse(quote.observed_at_utc) - Date.parse(completedAt ?? "")) / 1_000
  return (
    <p className="quote-state">
      <strong>{providerLabel(quote.provider)}</strong> · {map.team_a}{" "}
      {priceLabel(quote.winner.team_a)}
      {" / "}
      {map.team_b} {priceLabel(quote.winner.team_b)} ·{" "}
      <time dateTime={quote.observed_at_utc} title={quote.observed_at_utc}>
        {quoteClock.format(new Date(quote.observed_at_utc))} UTC
      </time>
      {Number.isFinite(elapsed) && (
        <>
          {" "}
          · через {elapsed.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с после последнего
          пика
        </>
      )}
      {source && (
        <>
          {" "}
          ·{" "}
          <a href={source} target="_blank" rel="noreferrer">
            Рынок ↗
          </a>
        </>
      )}
    </p>
  )
}

export function ForecastCard({
  forecast,
  stage,
  map,
  capturing = false,
}: {
  readonly forecast: Omit<Forecast, "map_id"> | null
  readonly stage: "PRE" | "POST"
  readonly map: MapDTO
  readonly capturing?: boolean
}) {
  const retrospective = forecast?.snapshot_id === "retrospective"
  const phaseQuotes =
    stage === "POST" ? observedPostDraftQuotes(forecast) : observedPreDecisionQuotes(forecast)
  const polymarketQuotes = (forecast?.polymarket_quotes ?? []).filter(
    (quote) =>
      !phaseQuotes.some(
        (phaseQuote) =>
          providerLabel(phaseQuote.provider) === "Polymarket" &&
          quote.market_scope === phaseQuote.market_scope &&
          quote.observed_at_utc === phaseQuote.observed_at_utc,
      ),
  )
  const polymarketDiagnostics = forecast?.polymarket_diagnostics ?? []
  const shadow = forecast?.analysis.shadow_forecast
  const p = shadow?.winner_probability_team_a
  const duration = shadow?.duration_mean_seconds == null ? null : shadow.duration_mean_seconds / 60
  const totalLine = shadow?.duration_line_seconds
  const over = shadow?.duration_over_probability
  const missing = forecast?.analysis.missing_data ?? []
  const abstentionMessages = [
    ...new Set(
      [...missing, ...(shadow?.reasons ?? [])]
        .map((reason) => abstentionLabels[reason])
        .filter((reason): reason is string => reason !== undefined),
    ),
  ]
  const qualityMessages = [
    ...new Set([
      ...missing.map((reason) => abstentionLabels[reason] ?? reason),
      ...abstentionMessages,
    ]),
  ]
  const explanation = forecast?.explanation.trim()
    ? forecast.explanation
    : abstentionMessages.join("\n\n") || "Нет сохранённого пояснения."
  const criteria = readCriteria(
    shadow?.reasons,
    forecast?.model_team_a ?? map.team_a,
    forecast?.model_team_b ?? map.team_b,
  )
  const largestContribution = Math.max(0, ...criteria.map((row) => Math.abs(row.signed_logit)))
  const postQuoteStatus = forecast?.post_draft_quote_status
  const hasDraftTime = Number.isFinite(Date.parse(forecast?.draft_completed_at_utc ?? ""))
  return (
    <article className={`forecast-card analysis-card ${stage.toLowerCase()}`}>
      <header>
        <div className="forecast-stage-title">
          <span className="stage">{stage}</span>
          <span className="muted">{stage === "PRE" ? "До драфта" : "После драфта"}</span>
        </div>
        <span className="badge">
          {retrospective ? "Расчёт после карты" : forecast ? "Сохранён" : "Нет прогноза"}
        </span>
      </header>
      {forecast ? (
        <>
          <div className="probability-pair">
            <div>
              <TeamIdentity name={map.team_a} size="sm" />
              <strong>{percent(p)}</strong>
            </div>
            <div>
              <TeamIdentity name={map.team_b} size="sm" />
              <strong>{percent(p == null ? null : 1 - p)}</strong>
            </div>
          </div>
          <div className="probability-track" aria-hidden="true">
            <span style={{ width: p == null ? "0%" : `${p * 100}%` }} />
          </div>
          <div className="duration">
            <span>Ожидаемая длительность</span>
            <strong>{duration == null ? "Нет оценки" : `${duration.toFixed(1)} мин`}</strong>
          </div>
          {totalLine != null && over != null && (
            <div className="duration">
              <span>Вероятность больше {(totalLine / 60).toFixed(1)} мин</span>
              <strong>{percent(over)}</strong>
            </div>
          )}
          {p == null && (
            <Notice>
              Модель воздержалась от оценки победителя. {abstentionMessages.join(" ")}
            </Notice>
          )}
          {stage === "POST" && !retrospective && (
            <section
              className="forecast-post-price forecast-section"
              aria-live="polite"
              aria-label="Котировки POST"
            >
              <h3>Котировки POST · карта {map.map_number ?? "—"}</h3>
              {phaseQuotes.length ? (
                <>
                  {phaseQuotes.map((quote) => (
                    <QuoteObservation
                      key={`${quote.provider}-${quote.observed_at_utc}`}
                      quote={quote}
                      map={map}
                      completedAt={forecast.draft_completed_at_utc ?? null}
                    />
                  ))}
                  {!hasDraftTime && (
                    <p className="muted">
                      Котировки POST зафиксированы после подтверждения полного драфта. Время
                      последнего пика неизвестно.
                    </p>
                  )}
                </>
              ) : (
                <p className="muted">
                  {postQuoteStatus === "window_missed"
                    ? "Котировки POST не получены в течение 10 секунд."
                    : postQuoteStatus === "draft_unverified"
                      ? "Live-источник не подтвердил полный драфт."
                      : "Подтверждённых котировок POST пока нет."}
                </p>
              )}
            </section>
          )}
          <details className="forecast-section">
            <summary>{stage === "PRE" ? "Котировки PRE" : "Снимки котировок"}</summary>
            {(forecast.candidates.length > 0 || !phaseQuotes.length) && (
              <OddsTable candidates={forecast.candidates} teamA={map.team_a} teamB={map.team_b} />
            )}
            {(forecast.odds.provider || forecast.candidates.length > 0 || !phaseQuotes.length) && (
              <p className="quote-state">
                {forecast.odds.provider ??
                  (forecast.candidates.length ? "Введены вручную" : "Нет котировок")}
                {" · "}
                {time(forecast.odds.observed_at_utc)}
                {" · "}
                {forecast.odds.phase === "pre_map"
                  ? "до карты"
                  : forecast.odds.phase === "live" || forecast.odds.phase === "in_play"
                    ? "во время карты"
                    : "фаза неизвестна"}
                {forecast.odds.source_url?.startsWith("https://") && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={forecast.odds.source_url} target="_blank" rel="noreferrer">
                      Источник ↗
                    </a>
                  </>
                )}
              </p>
            )}
            {stage === "PRE" &&
              phaseQuotes.map((quote) => (
                <QuoteObservation
                  key={`${quote.provider}-${quote.observed_at_utc}`}
                  quote={quote}
                  map={map}
                />
              ))}
            {forecast.odds.observed_at_utc &&
              Date.parse(forecast.created_at_utc) - Date.parse(forecast.odds.observed_at_utc) >
                300000 && (
                <p className="warning-text">На момент расчёта котировки были старше 5 минут.</p>
              )}
            {polymarketQuotes.map((quote) => {
              const source = quoteSourceUrl(quote.source_url, "polymarket")
              return (
                <p key={quote.market_scope} className="quote-state">
                  <strong>
                    Polymarket · {quote.market_scope === "series" ? "Серия" : "Карта"} · справочно
                  </strong>
                  {" · "}
                  {map.team_a} {priceLabel(quote.winner.team_a)} / {map.team_b}{" "}
                  {priceLabel(quote.winner.team_b)} · {time(quote.observed_at_utc)}
                  {source && (
                    <>
                      {" · "}
                      <a href={source} target="_blank" rel="noreferrer">
                        Рынок ↗
                      </a>
                    </>
                  )}
                </p>
              )
            })}
            {polymarketDiagnostics.map((item) => {
              if (item.status === "attached") return null
              return (
                <p key={`missing-${item.market_scope}`} className="quote-state">
                  <strong>Polymarket · {item.market_scope === "series" ? "Серия" : "Карта"}</strong>
                  {" · "}
                  {marketDiagnosticLabels[item.status]}
                  {" · Срез "}
                  {time(item.cutoff_at_utc)}
                  {item.observed_at_utc && <> · Снимок {time(item.observed_at_utc)}</>}
                </p>
              )
            })}
          </details>
          <details className="forecast-section">
            <summary>Основания прогноза</summary>
            {criteria.length > 0 && (
              <>
                <table className="compact-stats-table forecast-factors">
                  <thead>
                    <tr>
                      <th scope="col">Фактор</th>
                      <th scope="col">Вклад</th>
                      <th scope="col">Данные</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.map((row) => (
                      <tr key={row.criterion}>
                        <th scope="row">{criterionLabels[row.criterion] ?? row.criterion}</th>
                        <td className="factor-contribution">
                          <span className="numeric factor-number">
                            {row.signed_logit > 0 && "+"}
                            {row.signed_logit.toFixed(4)}
                          </span>
                          <span
                            className={`factor-track${row.availability === "unknown" ? " factor-track-unknown" : ""}`}
                            aria-hidden="true"
                          >
                            <span
                              className={`factor-fill ${row.signed_logit < 0 ? "factor-fill-b" : "factor-fill-a"}`}
                              style={{
                                width:
                                  row.availability === "unknown" || largestContribution === 0
                                    ? "0%"
                                    : `${(Math.abs(row.signed_logit) / largestContribution) * 50}%`,
                              }}
                            />
                          </span>
                          <small className="factor-direction">
                            {row.availability === "unknown"
                              ? "Направление не подтверждено"
                              : row.signed_logit > 0
                                ? `В пользу ${map.team_a}`
                                : row.signed_logit < 0
                                  ? `В пользу ${map.team_b}`
                                  : "Нулевой вклад"}
                          </small>
                        </td>
                        <td className={row.availability === "unknown" ? "warning-text" : "muted"}>
                          {row.availability === "supported" ? "Есть опора" : "Опора неизвестна"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="footnote">
                  Вклад в логит. Плюс в пользу {map.team_a}, минус в пользу {map.team_b}. Длина
                  полосы — относительно наибольшего вклада в этом расчёте.
                </p>
              </>
            )}
            <div className="explanation">{explanation}</div>
          </details>
          <div
            className={`forecast-section forecast-quality${qualityMessages.length > 0 ? " forecast-quality-warning" : ""}`}
          >
            <h3>Качество данных</h3>
            {qualityMessages.length > 0 ? (
              <ul className="missing-list">
                {qualityMessages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Отдельных предупреждений о пропусках в этом снимке нет.</p>
            )}
            <p className="footnote">
              Расчёт {time(forecast.created_at_utc)} ·{" "}
              <span className="mono">
                {forecast.analysis.metadata?.model_version ?? "версия не указана"}
              </span>
            </p>
          </div>
        </>
      ) : (
        <div className="forecast-empty">
          <strong>{capturing ? "Проверяем котировку POST" : "Прогноз ещё не сохранён"}</strong>
          <p aria-live="polite">
            {stage === "PRE"
              ? "PRE рассчитывается после подтверждения пары."
              : capturing
                ? "Ждём цену рынка этой карты после полного драфта."
                : map.play_status === "unplayed"
                  ? "Карта не сыграна."
                  : "POST рассчитывается после подтверждения полного драфта."}
          </p>
        </div>
      )}
    </article>
  )
}

export function Delta({
  team,
  pre,
  post,
}: {
  readonly team: string
  readonly pre: Omit<Forecast, "map_id"> | null
  readonly post: Omit<Forecast, "map_id"> | null
}) {
  const a = pre?.analysis.shadow_forecast?.winner_probability_team_a
  const b = post?.analysis.shadow_forecast?.winner_probability_team_a
  if (a == null || b == null) return null
  const difference = (b - a) * 100
  return (
    <div className="delta">
      <span>Изменение шанса PRE → POST · {team}</span>
      <strong>
        {difference > 0 && "+"}
        {difference.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} п.п.
      </strong>
    </div>
  )
}
