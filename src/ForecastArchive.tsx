import { Download } from "lucide-react"
import { useEffect, useState } from "react"
import type { Api } from "./api"
import { type Catalog, historySchema, type MapDTO, message } from "./contracts"
import { mapPath, mapStatus, percent, query } from "./domain"
import { Empty, Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"
export function ForecastArchive({
  api,
  catalog,
  navigate,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (path: string) => void
}) {
  const [team, setTeam] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [items, setItems] = useState<MapDTO[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const filters = query({ team, date_from: from, date_to: to })
  useEffect(() => {
    let active = true
    setBusy(true)
    setError("")
    api
      .request(`/history?${filters}`, historySchema)
      .then((data) => {
        if (active) setItems(data.items)
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
  }, [api, filters])
  async function download() {
    try {
      const response = await api.response(`/history.csv?${filters}`)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = "dota-history.csv"
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(message(err))
    }
  }
  return (
    <>
      <section className="toolbar">
        <label>
          Команда
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Все команды</option>
            {catalog.teams.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          С даты
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          По дату
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="secondary" type="button" onClick={download}>
          <Download size={16} />
          CSV
        </button>
      </section>
      {error && <Notice error>{error}</Notice>}
      <section className="panel forecast-archive-panel">
        <div className="panel-heading">
          <h2>{busy ? "Обновляем историю…" : `${items.length} карт`}</h2>
          <span className="badge">Неизменяемые снимки</span>
        </div>
        <div className="table-scroll">
          <table className="report-numeric-table">
            <thead>
              <tr>
                <th>Карта</th>
                <th>PRE · A</th>
                <th>POST · A</th>
                <th>Δ, п.п.</th>
                <th>Результат</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((map) => {
                const a = map.pre?.analysis.shadow_forecast?.winner_probability_team_a
                const b = map.post?.analysis.shadow_forecast?.winner_probability_team_a
                return (
                  <tr key={map.map_id}>
                    <td>
                      <button
                        className="table-link"
                        type="button"
                        onClick={() => navigate(mapPath(map))}
                      >
                        <span className="history-match-pair">
                          <TeamIdentity name={map.team_a} size="sm" />
                          <span className="history-versus">vs</span>
                          <TeamIdentity name={map.team_b} size="sm" />
                        </span>
                        <small>
                          Карта {map.map_number ?? map.map_id} · {map.tournament}
                        </small>
                      </button>
                    </td>
                    <td className="numeric">{percent(a)}</td>
                    <td className="numeric">{percent(b)}</td>
                    <td className="numeric">
                      {a == null || b == null ? "—" : ((b - a) * 100).toFixed(2)}
                    </td>
                    <td>
                      {map.result
                        ? map.result.winner === "A"
                          ? map.team_a
                          : map.team_b
                        : "Не записан"}
                    </td>
                    <td>
                      <span className="badge">{mapStatus(map)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!busy && items.length === 0 && (
          <Empty title="Сохранённых карт нет">
            Измените фильтры или рассчитайте первый прогноз.
          </Empty>
        )}
      </section>
    </>
  )
}
