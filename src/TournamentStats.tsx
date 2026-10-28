import { useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { type Catalog, message } from "./contracts"
import { query } from "./domain"
import { ReportProvenance, ReportToolbar } from "./ReportShared"
import { emptyFilters, tournamentStatsSchema } from "./reporting"
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
  const qs = query(filters)
  useEffect(() => {
    let active = true
    setError("")
    api
      .request(`/tournament/stats?${qs}`, tournamentStatsSchema)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
    return () => {
      active = false
    }
  }, [api, qs])
  return (
    <>
      <ReportToolbar catalog={catalog} filters={filters} onChange={setFilters} />
      {error && <Notice error>{error}</Notice>}
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
          <section className="panel">
            <div className="table-scroll">
              <table className="report-table">
                <caption>PRE и POST на одной истории турнира</caption>
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
          <Notice>
            Доходность здесь не рассчитывается: для всей выборки нет сопоставимого набора
            подтверждённых коэффициентов.
          </Notice>
        </>
      ) : (
        !error && <Empty title="Загружаем сравнение турнира…" />
      )}
    </>
  )
}
