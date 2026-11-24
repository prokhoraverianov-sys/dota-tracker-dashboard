import { Download } from "lucide-react"
import { useEffect, useState } from "react"
import type { Api } from "./api"
import { type Catalog, historySchema, type MapDTO, message } from "./contracts"
import { mapPath, mapStatus, percent, query } from "./domain"
import { historyCsv, projectHistory } from "./history-results"
import { StageVerdict } from "./MapOutcome"
import { evaluateMap } from "./map-outcome"
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
  const [loadedFilters, setLoadedFilters] = useState<string | null>(null)
  const filters = query({ team, date_from: from, date_to: to })
  useEffect(() => {
    let active = true
    setBusy(true)
    setError("")
    setItems([])
    api
      .request(`/history?${filters}`, historySchema)
      .then((data) => projectHistory(data.items))
      .then((cards) => {
        if (active) {
          setItems(cards)
          setLoadedFilters(filters)
        }
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
  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([historyCsv(items)], { type: "text/csv;charset=utf-8" }),
      )
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
        <button
          className="secondary"
          type="button"
          disabled={busy || !!error || filters !== loadedFilters}
          onClick={download}
        >
          <Download size={16} />
          CSV
        </button>
      </section>
      {error && <Notice error>{error}</Notice>}
      <section className="panel forecast-archive-panel">
        <div className="panel-heading">
          <h2>{busy ? "Обновляем историю…" : `${items.length} карт`}</h2>
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
                const a = evaluateMap(map, "pre").forecast?.analysis.shadow_forecast
                  ?.winner_probability_team_a
                const b = evaluateMap(map, "post").forecast?.analysis.shadow_forecast
                  ?.winner_probability_team_a
                return (
                  <tr key={mapPath(map)}>
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
                    <td className="numeric">
                      {percent(a)}
                      <StageVerdict map={map} stage="pre" />
                    </td>
                    <td className="numeric">
                      {percent(b)}
                      <StageVerdict map={map} stage="post" />
                    </td>
                    <td className="numeric">
                      {a == null || b == null ? "—" : ((b - a) * 100).toFixed(2)}
                    </td>
                    <td>
                      {map.result_conflict
                        ? "Требует сверки"
                        : map.play_status === "unplayed"
                          ? "Карта не сыграна"
                          : map.result
                            ? map.result.winner === "A"
                              ? map.team_a
                              : map.team_b
                            : "Ожидаем результат"}
                      {map.result?.steam_match_id && !map.result_conflict && (
                        <small>Steam Match ID {map.result.steam_match_id}</small>
                      )}
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
