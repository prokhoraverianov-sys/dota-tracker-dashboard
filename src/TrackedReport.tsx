import { useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { type MapDTO, message, scheduleSchema } from "./contracts"
import { mapPath, percent, query, time } from "./domain"
import { StageVerdict } from "./MapOutcome"
import { evaluateMap, mapStages, stageNames } from "./map-outcome"
import { minutes } from "./reporting"
import { Empty, Notice } from "./ui"

function StageStats({ maps }: { readonly maps: MapDTO[] }) {
  return (
    <section className="panel report-comparison-panel">
      <div className="table-scroll">
        <table className="report-table">
          <caption>Точность на картах с подтверждённым победителем</caption>
          <thead>
            <tr>
              <th>Прогноз</th>
              <th>Угадано</th>
              <th>Точность</th>
              <th>Вне оценки</th>
              <th>Без прогноза</th>
            </tr>
          </thead>
          <tbody>
            {mapStages.map((stage) => {
              const verdicts = maps.map((map) => evaluateMap(map, stage))
              const scored = verdicts.filter((item) => item.hit !== null)
              const hits = scored.filter((item) => item.hit).length
              const missing = verdicts.filter((item) => !item.forecast).length
              return (
                <tr key={stage}>
                  <th scope="row">{stageNames[stage]}</th>
                  <td>
                    {hits} из {scored.length}
                  </td>
                  <td>{scored.length ? percent(hits / scored.length) : "—"}</td>
                  <td>{verdicts.length - scored.length - missing}</td>
                  <td>{missing}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="footnote">
        Для PRE проверяем время до старта. Для POST сверяем драфт и время до окончания карты. Если
        точного времени окончания нет, используем время старта плюс игровую длительность. Причины
        исключения указаны у каждой карты.
      </p>
    </section>
  )
}

export function TrackedReport({
  api,
  tournament,
  initialSearch = "",
  stats,
}: {
  readonly api: Pick<Api, "request">
  readonly tournament: string
  readonly initialSearch?: string
  readonly stats: boolean
}) {
  const [data, setData] = useState<z.infer<typeof scheduleSchema> | null>(null)
  const [error, setError] = useState("")
  const [search, setSearch] = useState(initialSearch)
  useEffect(() => {
    let active = true
    let pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const next = await api.request(`/schedule?${query({ tournament })}`, scheduleSchema)
        if (active) {
          setData(next)
          setError("")
        }
      } catch (err) {
        if (active) setError(message(err))
      } finally {
        pending = false
      }
    }
    const poll = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    void refresh()
    const timer = window.setInterval(poll, 60_000)
    document.addEventListener("visibilitychange", poll)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [api, tournament])
  const all = data?.series.flatMap((series) => series.maps.map((map) => ({ map, series }))) ?? []
  const playable = all.filter(({ map }) => map.play_status !== "unplayed")
  const played = playable.filter(({ map }) => map.result && !map.result_conflict)
  const terms = search.toLocaleLowerCase("ru").trim().split(/\s+/).filter(Boolean)
  const visible = playable.filter(({ map, series }) => {
    const label =
      `${map.team_a} ${map.team_b} ${series.series_id} ${map.result?.steam_match_id ?? ""}`.toLocaleLowerCase(
        "ru",
      )
    return terms.every((term) => label.includes(term))
  })
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {!data ? (
        !error && <Empty title="Загружаем карты турнира…" />
      ) : (
        <>
          <div className="report-counts">
            <div>
              <strong>{played.length}</strong>
              <span>карт с результатом</span>
            </div>
            <div>
              <strong>{playable.length - played.length}</strong>
              <span>слотов без результата</span>
            </div>
            <div>
              <strong>{all.length - playable.length}</strong>
              <span>карт отпали по счёту</span>
            </div>
          </div>
          {stats && <StageStats maps={played.map((item) => item.map)} />}
          <section className="panel history-panel">
            <div className="panel-heading">
              <h2>Карты турнира</h2>
              <label>
                Поиск по картам
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Команда или ID"
                />
              </label>
            </div>
            {visible.length ? (
              <div className="table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Матч</th>
                      <th>Победитель</th>
                      <th>PRE</th>
                      <th>POST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ map, series }) => (
                      <tr key={`${series.series_id}/${map.map_number}`}>
                        <td>
                          <a href={`#${mapPath(map)}?${query({ tournament })}`}>
                            {map.team_a} — {map.team_b}
                          </a>
                          <small className="metric-note">
                            Карта {map.map_number} ·{" "}
                            {time(map.result?.started_at_utc ?? series.starts_at_utc)}
                          </small>
                        </td>
                        <td>
                          {map.result_conflict ? (
                            "Источники расходятся"
                          ) : map.result ? (
                            <>
                              {map.result.winner === "A" ? map.team_a : map.team_b}
                              <small className="metric-note">
                                {minutes(map.result.duration_seconds)}
                              </small>
                            </>
                          ) : (
                            "Ожидается результат"
                          )}
                        </td>
                        {mapStages.map((stage) => (
                          <td key={stage}>
                            <StageVerdict map={map} stage={stage} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Карт по выбранным условиям нет" />
            )}
          </section>
        </>
      )}
    </>
  )
}
