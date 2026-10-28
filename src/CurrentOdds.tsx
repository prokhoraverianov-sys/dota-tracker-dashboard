import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import type { Api } from "./api"
import { type MapDTO, message } from "./contracts"
import { time } from "./domain"
import { Notice } from "./ui"

const oddsSchema = z.object({
  status: z.enum(["fresh", "stale", "empty"]),
  provider: z.string().nullable(),
  source_url: z.string().nullable(),
  observed_at_utc: z.string().nullable(),
  phase: z.string(),
  winner: z.object({ team_a: z.string(), team_b: z.string() }).nullable(),
  duration_lines: z.array(
    z.object({ line_minutes: z.string(), over: z.string(), under: z.string() }),
  ),
  notice: z.string(),
})
export function CurrentOdds({ map, api }: { readonly map: MapDTO; readonly api: Api }) {
  const [data, setData] = useState<z.infer<typeof oddsSchema> | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!map.series_id || !map.map_number) return
    let active = refresh >= 0
    setBusy(true)
    setError("")
    api
      .request(
        `/series/${encodeURIComponent(map.series_id)}/maps/${map.map_number}/odds`,
        oddsSchema,
      )
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
  }, [api, map.series_id, map.map_number, refresh])
  if (!map.series_id) return null
  return (
    <section className="panel current-odds">
      <div className="panel-heading">
        <div>
          <h2>Коэффициенты букмекера</h2>
          <p className="muted">
            Последние доступные цены из кэша. Сохранённые PRE / POST не изменяются.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} />
          {busy ? "Загружаем…" : "Обновить цены"}
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {data && (
        <>
          <div className="quote-summary">
            <span className="badge">
              {data.status === "fresh"
                ? "Свежий снимок"
                : data.status === "stale"
                  ? "Устаревший снимок"
                  : "Цен нет"}
            </span>
            <span>
              {data.provider ?? "Источник не указан"} · {time(data.observed_at_utc)}
            </span>
            <span>
              Фаза:{" "}
              {data.phase === "pre_map"
                ? "до карты"
                : data.phase === "live" || data.phase === "in_play"
                  ? "карта идёт"
                  : "неизвестна"}
            </span>
          </div>
          <p className="muted quote-notice">{data.notice}</p>
          {data.winner && (
            <div className="two-columns quote-prices">
              <div>
                <span>{map.team_a}</span>
                <strong>{data.winner.team_a}</strong>
              </div>
              <div>
                <span>{map.team_b}</span>
                <strong>{data.winner.team_b}</strong>
              </div>
            </div>
          )}
          {data.duration_lines.length > 0 && (
            <div className="table-scroll">
              <table>
                <caption>Тотал длительности</caption>
                <thead>
                  <tr>
                    <th>Линия</th>
                    <th>Больше</th>
                    <th>Меньше</th>
                  </tr>
                </thead>
                <tbody>
                  {data.duration_lines.map((line) => (
                    <tr key={line.line_minutes}>
                      <td>{line.line_minutes} мин</td>
                      <td className="numeric">{line.over}</td>
                      <td className="numeric">{line.under}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!data.winner && data.duration_lines.length === 0 && (
            <p className="quote-notice">
              Для этой карты доступных рынков пока нет. Цены можно ввести вручную ниже.
            </p>
          )}
        </>
      )}
    </section>
  )
}
