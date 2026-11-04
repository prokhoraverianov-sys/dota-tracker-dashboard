import type { Forecast, MapDTO } from "./contracts"
import { criterionLabels, readCriteria } from "./criteria"
import { percent, time } from "./domain"
import { OddsTable } from "./OddsTable"
import { Notice } from "./ui"

export function ForecastCard({
  forecast,
  stage,
  map,
}: {
  readonly forecast: Forecast | null
  readonly stage: "PRE" | "POST"
  readonly map: MapDTO
}) {
  const shadow = forecast?.analysis.shadow_forecast
  const p = shadow?.winner_probability_team_a
  const duration = shadow?.duration_mean_seconds == null ? null : shadow.duration_mean_seconds / 60
  const totalLine = shadow?.duration_line_seconds
  const over = shadow?.duration_over_probability
  const missing = forecast?.analysis.missing_data ?? []
  const criteria = readCriteria(shadow?.reasons, map.team_a, map.team_b)
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
            <span>Ожидаемая длительность</span>
            <strong>{duration == null ? "Нет оценки" : `${duration.toFixed(1)} мин`}</strong>
          </div>
          {totalLine != null && over != null && (
            <div className="duration">
              <span>Вероятность больше {(totalLine / 60).toFixed(1)} мин</span>
              <strong>{percent(over)}</strong>
            </div>
          )}
          {p == null && <Notice>Модель воздержалась от оценки победителя.</Notice>}
          <div className="forecast-section">
            <h3>Коэффициенты при расчёте</h3>
            <OddsTable candidates={forecast.candidates} teamA={map.team_a} teamB={map.team_b} />
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
            {forecast.odds.observed_at_utc &&
              Date.parse(forecast.created_at_utc) - Date.parse(forecast.odds.observed_at_utc) >
                300000 && (
                <p className="warning-text">На момент расчёта котировки были старше 5 минут.</p>
              )}
          </div>
          <div className="forecast-section">
            <h3>Основания и ограничения прогноза</h3>
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
                        <td className="numeric">
                          {row.signed_logit > 0 && "+"}
                          {row.signed_logit.toFixed(4)}
                        </td>
                        <td className={row.availability === "unknown" ? "warning-text" : "muted"}>
                          {row.availability === "supported" ? "Есть опора" : "Опора неизвестна"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="footnote">
                  Вклад в логит. Плюс в пользу {map.team_a}, минус в пользу {map.team_b}.
                </p>
              </>
            )}
            <div className="explanation">
              {forecast.explanation || "Нет сохранённого пояснения."}
            </div>
          </div>
          <div className="forecast-section">
            <h3>Качество данных</h3>
            {missing.length > 0 ? (
              <ul className="missing-list">
                {[...new Set(missing)].map((item) => (
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
          <strong>Прогноз ещё не сохранён</strong>
          <p>
            {stage === "PRE"
              ? "PRE рассчитывается по исходному составу."
              : "Для POST проверьте игроков и заполните все десять героев."}
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
          : `${(b - a >= 0 ? "+" : "") + ((b - a) * 100).toFixed(2)} п.п.`}
      </strong>
      <small>Разница сохранённых оценок.</small>
    </div>
  )
}
