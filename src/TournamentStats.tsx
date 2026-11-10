import { useEffect, useState } from "react"
import type { z } from "zod"
import { ArchiveStats } from "./ArchiveStats"
import type { Api } from "./api"
import { type Catalog, message } from "./contracts"
import { query } from "./domain"
import { ReportBreakdown } from "./ReportBreakdown"
import { ReportProvenance, ReportToolbar } from "./ReportShared"
import { emptyFilters, tournamentHistorySchema, tournamentStatsSchema } from "./reporting"
import { Empty, Notice } from "./ui"
export function TournamentStats({
  api,
  catalog,
}: {
  readonly api: Api
  readonly catalog: Catalog
}) {
  const [filters, setFilters] = useState(emptyFilters)
  const [data, setData] = useState<z.infer<typeof tournamentStatsSchema> | null>(null)
  const [error, setError] = useState("")
  const [history, setHistory] = useState<z.infer<typeof tournamentHistorySchema> | null>(null)
  const [historyError, setHistoryError] = useState("")
  const [retry, setRetry] = useState(0)
  const qs = query(filters)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry the request with the same filters.
  useEffect(() => {
    let active = true
    setError("")
    setHistoryError("")
    setHistory(null)
    setData(null)
    api
      .request(`/tournament/stats?${qs}`, tournamentStatsSchema)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
    api
      .request(`/tournament/history?${qs}`, tournamentHistorySchema)
      .then((value) => {
        if (active) setHistory(value)
      })
      .catch((err) => {
        if (active) setHistoryError(message(err))
      })
    return () => {
      active = false
    }
  }, [api, qs, retry])
  const details =
    data &&
    history &&
    data.completed_maps === history.items.length &&
    data.provenance.model_sha256 === history.provenance.model_sha256
      ? history
      : null
  return (
    <>
      <ReportToolbar catalog={catalog} filters={filters} onChange={setFilters} />
      {error && (
        <Notice error>
          {error}{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить
          </button>
        </Notice>
      )}
      {data ? (
        <>
          <div className="report-counts">
            <div>
              <strong>{data.completed_maps}</strong>
              <span>завершённых карт</span>
            </div>
            <div>
              <strong>{data.paired_maps}</strong>
              <span>карт с парой PRE + POST</span>
            </div>
            <div>
              <strong>{data.completed_maps - data.paired_maps}</strong>
              <span>без полного сравнения</span>
            </div>
          </div>
          <ReportProvenance data={data.provenance} />
          <section className="panel report-comparison-panel">
            <div className="table-scroll">
              <table className="report-table">
                <caption>Точность и длительность</caption>
                <thead>
                  <tr>
                    <th>Что сравниваем</th>
                    <th>PRE · до драфта</th>
                    <th>POST · после драфта</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Победитель угадан
                      <small className="metric-note">Верные прогнозы / карты с прогнозом</small>
                    </td>
                    {[data.pre, data.post].map((stage, index) => (
                      <td key={index === 0 ? "pre" : "post"}>
                        <strong>
                          {stage.winner_accuracy === null
                            ? "Нет данных"
                            : `${(stage.winner_accuracy * 100).toFixed(1)}%`}
                        </strong>
                        <small className="metric-note">
                          {stage.winner_correct} из {stage.samples}
                        </small>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>
                      Средняя ошибка длительности
                      <small className="metric-note">
                        Насколько прогноз в среднем отличается от факта; меньше лучше
                      </small>
                    </td>
                    {[data.pre, data.post].map((stage, index) => (
                      <td key={index === 0 ? "pre" : "post"}>
                        <strong>
                          {stage.duration_mae_minutes === null
                            ? "Нет данных"
                            : `${stage.duration_mae_minutes.toFixed(2)} мин`}
                        </strong>
                        <small className="metric-note">{stage.duration_samples} карт</small>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>
                      Контрольный тотал {data.pre.control_total_minutes} минут
                      <small className="metric-note">
                        Угадано больше / меньше порога. Это не линия букмекера.
                      </small>
                    </td>
                    {[data.pre, data.post].map((stage, index) => (
                      <td key={index === 0 ? "pre" : "post"}>
                        <strong>
                          {stage.control_total_correct} из {stage.control_total_samples}
                        </strong>
                        <small className="metric-note">
                          {stage.control_total_samples
                            ? `${((stage.control_total_correct / stage.control_total_samples) * 100).toFixed(1)}%`
                            : "Нет данных"}
                        </small>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          {details && details.items.length > 0 && (
            <>
              <ReportBreakdown items={details.items} />
              <ArchiveStats items={details.items} provenance={details.provenance} />
            </>
          )}
          {historyError && (
            <Notice error>
              Не удалось загрузить разбивку по картам. {historyError}{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => setRetry((value) => value + 1)}
              >
                Повторить
              </button>
            </Notice>
          )}
          {history && !details && (
            <Notice>
              Отчёт обновился во время загрузки.{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => setRetry((value) => value + 1)}
              >
                Загрузить сводку заново
              </button>
            </Notice>
          )}
        </>
      ) : (
        !error && <Empty title="Загружаем сравнение турнира…" />
      )}
    </>
  )
}
