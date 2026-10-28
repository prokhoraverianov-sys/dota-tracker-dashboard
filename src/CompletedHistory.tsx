import { useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { type Catalog, message } from "./contracts"
import { percent, query, time } from "./domain"
import { ReportProvenance, ReportToolbar } from "./ReportShared"
import { emptyFilters, minutes, tournamentHistorySchema, winnerPrediction } from "./reporting"
import { Empty, Notice } from "./ui"
export function CompletedHistory({
  api,
  catalog,
}: {
  readonly api: Api
  readonly catalog: Catalog
}) {
  const [filters, setFilters] = useState(emptyFilters)
  const [data, setData] = useState<z.infer<typeof tournamentHistorySchema> | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const qs = query(filters)
  useEffect(() => {
    let active = true
    setBusy(true)
    setError("")
    api
      .request(`/tournament/history?${qs}`, tournamentHistorySchema)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [api, qs])
  return (
    <>
      <ReportToolbar catalog={catalog} filters={filters} onChange={setFilters} />
      {error && <Notice error>{error}</Notice>}
      {data && <ReportProvenance data={data.provenance} />}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {busy ? "Загружаем завершённые карты…" : `${data?.items.length ?? 0} завершённых карт`}
          </h2>
          <span className="badge">Фактические результаты</span>
        </div>
        <p className="table-intro">
          PRE и POST показывают вероятность победы первой команды и ожидаемую длительность. Для
          новых карт без расчёта стоят пропуски.
        </p>
        <p className="table-intro">Прокрутите таблицу вправо, чтобы увидеть PRE / POST.</p>
        <div className="table-scroll">
          <table className="completed-table">
            <thead>
              <tr>
                <th>Матч · карта</th>
                <th>Факт</th>
                <th>PRE · до драфта</th>
                <th>POST · после драфта</th>
                <th>Проверка победителя</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((match) => (
                <tr key={match.match_id}>
                  <td>
                    <strong>
                      {match.team_a} vs {match.team_b}
                    </strong>
                    <small className="metric-note">
                      {time(match.starts_at_utc)} ·{" "}
                      {match.map_number ? `Карта ${match.map_number}` : `Матч ${match.match_id}`}
                    </small>
                    {match.source_url.startsWith("https://") && (
                      <a
                        className="source-link"
                        href={match.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Источник результата ↗
                      </a>
                    )}
                  </td>
                  <td>
                    {match.winner ?? "Не указан"}
                    <small className="metric-note">{minutes(match.duration_seconds)}</small>
                  </td>
                  <td className="numeric">
                    {percent(match.pre?.probability_team_a)}
                    <small className="metric-note">
                      {match.pre
                        ? `${(match.pre.duration_seconds / 60).toFixed(1)} мин`
                        : "Нет расчёта"}
                    </small>
                  </td>
                  <td className="numeric">
                    {percent(match.post?.probability_team_a)}
                    <small className="metric-note">
                      {match.post
                        ? `${(match.post.duration_seconds / 60).toFixed(1)} мин`
                        : "Нет расчёта"}
                    </small>
                  </td>
                  <td>
                    <span>
                      PRE:{" "}
                      {match.pre && match.winner
                        ? winnerPrediction(match, "pre") === match.winner
                          ? "верно"
                          : "ошибка"
                        : "—"}
                    </span>
                    <small className="metric-note">
                      POST:{" "}
                      {match.post && match.winner
                        ? winnerPrediction(match, "post") === match.winner
                          ? "верно"
                          : "ошибка"
                        : "—"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!busy && data?.items.length === 0 && (
          <Empty title="Завершённых карт по фильтру нет">Измените дату или команду.</Empty>
        )}
        {!busy && !data && !error && <Empty title="История матчей пока недоступна" />}
      </section>
    </>
  )
}
