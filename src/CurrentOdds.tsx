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
type Odds = z.infer<typeof oddsSchema>

function QuoteSource({ odds }: { readonly odds: Odds }) {
  const provider = odds.provider ?? "Источник не указан"
  const sourceUrl = odds.source_url?.startsWith("https://") ? odds.source_url : null
  const phase =
    odds.phase === "pre_map"
      ? "До карты"
      : odds.phase === "live" || odds.phase === "in_play"
        ? "Во время карты"
        : "Фаза неизвестна"
  return (
    <div className="quote-summary">
      <span className="badge">
        {odds.status === "fresh" ? "Свежий снимок" : "Устаревший снимок"}
      </span>
      <span>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            {provider}
          </a>
        ) : (
          provider
        )}
        {" · "}
        {time(odds.observed_at_utc)}
      </span>
      <span>{phase}</span>
    </div>
  )
}

export function CurrentOdds({ map, api }: { readonly map: MapDTO; readonly api: Api }) {
  const [data, setData] = useState<Odds | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh button triggers a new request.
  useEffect(() => {
    if (!map.series_id || !map.map_number) return
    let active = true
    setBusy(true)
    setError("")
    setData(null)
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
          <h2>Коэффициенты карты</h2>
          <p className="muted">
            Последний доступный снимок по каждому рынку. Цены сохранённых расчётов указаны в PRE и
            POST.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} />
          {busy ? "Загружаем…" : "Проверить новые цены"}
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {data && (
        <div className="two-columns">
          <section>
            <h3>Победа на карте</h3>
            {data.status !== "empty" && data.winner ? (
              <>
                <QuoteSource odds={data} />
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
              </>
            ) : (
              <p className="muted">Котировки на победу пока недоступны.</p>
            )}
          </section>
          <section>
            <h3>Тотал длительности</h3>
            {data.status !== "empty" && data.duration_lines.length > 0 ? (
              <>
                <QuoteSource odds={data} />
                <div className="table-scroll">
                  <table aria-label="Коэффициенты на тотал длительности">
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
              </>
            ) : (
              <p className="muted">Котировки на тотал пока недоступны.</p>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
