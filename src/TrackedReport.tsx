import { useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { type MapDTO, message, scheduleSchema } from "./contracts"
import { mapPath, percent, query, time } from "./domain"
import { StageVerdict } from "./MapOutcome"
import { evaluateMap, mapStages } from "./map-outcome"
import { decimalPrice, reportPrice } from "./report-price"
import { minutes } from "./reporting"
import { tournamentPhase } from "./tournament-phase"
import { Empty, Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"
import { weightedPost, weights } from "./weighted-post"

function StageStats({ maps, essence }: { readonly maps: MapDTO[]; readonly essence: boolean }) {
  const scenarios = essence ? [...mapStages, ...weights] : mapStages
  return (
    <section className="panel report-comparison-panel">
      <div className="table-scroll">
        <table className="report-table">
          <caption>Результаты прогнозов на сыгранных картах</caption>
          <thead>
            <tr>
              <th>Прогноз</th>
              <th>Зашло</th>
              <th>Не зашло</th>
              <th>Ср. кэф. до карты</th>
              {essence && <th>Итоговый банк</th>}
              <th>Точность своевременных оригиналов</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((stage) => {
              const original = stage === "pre" || stage === "post"
              const label =
                stage === "pre"
                  ? "PRE"
                  : stage === "post"
                    ? essence
                      ? "POST · 0,25"
                      : "POST"
                    : `POST · ${stage}`
              const verdicts = maps.map((map) =>
                stage === "pre" || stage === "post"
                  ? evaluateMap(map, stage)
                  : weightedPost(map, stage),
              )
              const scored = verdicts.filter((item) => item?.hit != null)
              const hits = scored.filter((item) => item?.hit).length
              const wins = verdicts.filter((v) => v?.comparison === true).length
              const losses = verdicts.filter((v) => v?.comparison === false).length
              const prices = maps.flatMap((map, index) => {
                const v = verdicts[index]
                const quote =
                  v?.comparison != null && v.selected ? reportPrice(map, v.selected) : null
                return quote ? [{ ...quote, won: v?.comparison === true }] : []
              })
              const mean = prices.length
                ? prices.reduce((sum, q) => sum + q.value, 0) / prices.length
                : null
              return (
                <tr key={stage}>
                  <th scope="row">{label}</th>
                  <td>{wins}</td>
                  <td>{losses}</td>
                  <td>
                    {mean != null ? decimalPrice(mean) : "Нет подтверждённых цен"}
                    <small className="metric-note">
                      {prices.length} из {maps.length} карт ·{" "}
                      {prices.filter((q) => q.series).length} по рынку серии при 1:1
                    </small>
                  </td>
                  {essence && (
                    <td>
                      $
                      {decimalPrice(
                        100 +
                          prices.reduce(
                            (sum, q) => sum + (q.won ? Math.round(2000 * (q.value - 1)) : -2000),
                            0,
                          ) /
                            100,
                      )}
                    </td>
                  )}
                  <td>
                    {original ? (
                      <>
                        {scored.length ? percent(hits / scored.length) : "—"}
                        <small className="metric-note">
                          {hits} из {scored.length}
                        </small>
                      </>
                    ) : (
                      "Пересчёт веса"
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="footnote">
        «Зашло» и «Не зашло» включают поздние и восстановленные расчёты. Средний кэф. — среднее по
        выбранным командам, одна архивная цена до старта на карту. На решающих картах при отсутствии
        цены карты используется рынок серии при 1:1.
        {essence &&
          " Каждый сценарий начинает со $100. Ставка всегда $20, выигрыш округляется до цента на каждой карте."}
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
  const livePhases = new Map(data?.event?.slots.map((slot) => [slot.series_id, slot.phase]))
  const phaseFor = (series: (typeof all)[number]["series"]) =>
    tournamentPhase(
      series.series_id,
      series.phase ?? livePhases.get(series.series_id) ?? series.group?.name,
    )
  const terms = search.toLocaleLowerCase("ru").trim().split(/\s+/).filter(Boolean)
  const visible = playable.filter(({ map, series }) => {
    const label =
      `${phaseFor(series)} ${map.team_a} ${map.team_b} ${series.series_id} ${map.result?.steam_match_id ?? ""}`.toLocaleLowerCase(
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
          {stats && (
            <StageStats
              essence={tournament === "1win-essence-3"}
              maps={played.map((item) => item.map)}
            />
          )}
          <section className="panel history-panel">
            <div className="panel-heading">
              <h2>Карты турнира</h2>
              <label>
                Поиск по картам
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Команда, стадия или ID"
                />
              </label>
            </div>
            {visible.length ? (
              <div className="table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Матч</th>
                      <th>Стадия</th>
                      <th>Победитель</th>
                      <th>PRE</th>
                      <th>{tournament === "1win-essence-3" ? "POST · 0,25" : "POST"}</th>
                    </tr>
                  </thead>
                  <tbody className="tracked-map-rows">
                    {visible.map(({ map, series }) => (
                      <tr key={`${series.series_id}/${map.map_number}`}>
                        <td>
                          <a
                            className="tracked-map-pair"
                            href={`#${mapPath(map)}?${query({ tournament })}`}
                          >
                            <TeamIdentity name={map.team_a} size="sm" />
                            <TeamIdentity name={map.team_b} size="sm" />
                          </a>
                          <small className="metric-note">
                            Карта {map.map_number} ·{" "}
                            {time(map.result?.started_at_utc ?? series.starts_at_utc)}
                          </small>
                        </td>
                        <td data-mobile-label="Стадия">
                          {phaseFor(series) || "Стадия уточняется"}
                        </td>
                        <td data-mobile-label="Победитель">
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
                          <td key={stage} data-mobile-label={stage.toUpperCase()}>
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
