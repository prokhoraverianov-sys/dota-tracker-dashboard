import { useEffect, useState } from "react"
import type { Api } from "./api"
import { detailsSchema, type Forecast, type MapDTO, message } from "./contracts"
import { percent, time } from "./domain"
import { Notice } from "./ui"
export function ForecastCard({
  forecast,
  stage,
  map,
  api,
}: {
  readonly forecast: Forecast | null
  readonly stage: "PRE" | "POST"
  readonly map: MapDTO
  readonly api: Api
}) {
  const [expanded, setExpanded] = useState(false)
  const [explanation, setExplanation] = useState(forecast?.explanation ?? "")
  const [error, setError] = useState("")
  useEffect(() => {
    setExplanation(forecast?.explanation ?? "")
  }, [forecast])
  useEffect(() => {
    if (!expanded || !forecast) return
    let active = true
    api
      .request(`/maps/${map.map_id}/snapshots/${forecast.stage}/details`, detailsSchema)
      .then((data) => {
        if (active) setExplanation(data.explanation)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
    return () => {
      active = false
    }
  }, [expanded, forecast, api, map.map_id])
  const shadow = forecast?.analysis.shadow_forecast
  const p = shadow?.winner_probability_team_a
  const duration = shadow?.duration_mean_seconds == null ? null : shadow.duration_mean_seconds / 60
  return (
    <article className={`forecast-card ${stage.toLowerCase()}`}>
      <header>
        <span className="stage">{stage}</span>
        <span className="muted">{stage === "PRE" ? "До драфта" : "После драфта"}</span>
        <span className="badge">{forecast ? "Сохранён" : "Нет прогноза"}</span>
      </header>
      {forecast ? (
        <>
          <div className="probability-pair">
            <div>
              <span>{map.team_a}</span>
              <strong>{percent(p)}</strong>
            </div>
            <div>
              <span>{map.team_b}</span>
              <strong>{percent(p == null ? null : 1 - p)}</strong>
            </div>
          </div>
          <div className="probability-track" aria-hidden="true">
            <span style={{ width: p == null ? "0%" : `${p * 100}%` }} />
          </div>
          <div className="duration">
            <span>Длительность</span>
            <strong>{duration == null ? "Нет оценки" : `${duration.toFixed(1)} мин`}</strong>
          </div>
          {p == null && (
            <Notice>Модель воздержалась от оценки победителя. Причины доступны в деталях.</Notice>
          )}
          <p className="footnote">
            {time(forecast.created_at_utc)} ·{" "}
            <span className="mono">
              {forecast.analysis.metadata?.model_version ?? "версия в деталях"}
            </span>
          </p>
          <p className="quote-state">
            Котировки: {forecast.odds.provider ?? "отсутствуют"} ·{" "}
            {time(forecast.odds.observed_at_utc)} · фаза:{" "}
            {forecast.odds.phase === "unknown"
              ? "неизвестна"
              : (forecast.odds.phase ?? "неизвестна")}
          </p>
          {forecast.odds.observed_at_utc &&
            Date.now() - Date.parse(forecast.odds.observed_at_utc) > 300000 && (
              <p className="warning-text">Котировки старше 5 минут</p>
            )}
          <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
            <summary>Основания и ограничения прогноза</summary>
            {error && <Notice error>{error}</Notice>}
            <div className="explanation">{explanation || "Нет сохранённого пояснения."}</div>
          </details>
        </>
      ) : (
        <div className="forecast-empty">
          <strong>Прогноз ещё не сохранён</strong>
          <p>
            {stage === "PRE"
              ? "PRE использует исходную политику модели. Правки состава ниже не влияют на PRE."
              : "Для POST подтвердите игроков и все десять героев."}
          </p>
        </div>
      )}
    </article>
  )
}
export function Delta({ map }: { readonly map: MapDTO }) {
  const a = map.pre?.analysis.shadow_forecast?.winner_probability_team_a
  const b = map.post?.analysis.shadow_forecast?.winner_probability_team_a
  return (
    <div className="delta">
      <span>Изменение PRE → POST · {map.team_a}</span>
      <strong>
        {a == null || b == null
          ? "Нет пары для сравнения"
          : `${b - a >= 0 ? "+" : ""}${((b - a) * 100).toFixed(2)} п.п.`}
      </strong>
      <small>Разница сохранённых оценок, не причинный эффект драфта.</small>
    </div>
  )
}
