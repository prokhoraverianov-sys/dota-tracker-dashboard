import { useState } from "react"
import { archivedWinnerPrices } from "./ArchivedPrices"
import type { MapDTO } from "./contracts"
import { mapPath, query, time } from "./domain"
import { priceLabel, providerLabel, quoteSourceUrl } from "./odds"
import { Empty } from "./ui"
import { TeamIdentity } from "./VisualIdentity"

export function TournamentPrices({
  maps,
  tournament,
}: {
  readonly maps: readonly MapDTO[]
  readonly tournament: string
}) {
  const [search, setSearch] = useState("")
  const [provider, setProvider] = useState("")
  const rows = maps.flatMap((map) => {
    if (!map.result || map.result_conflict || map.play_status === "unplayed") return []
    const start = Date.parse(map.result.started_at_utc ?? "")
    const { observations } = archivedWinnerPrices(map)
    const prices = observations
      .filter(
        (row) =>
          Date.parse(row.at ?? "") < start &&
          ["map", "before", "series_at_1_1"].includes(row.scope),
      )
      .sort((a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? ""))
    const sources = [...new Set(prices.map(({ source }) => source.toLowerCase()))]
    return [
      {
        map,
        prices: sources.flatMap((source) => {
          const fromSource = prices.filter((row) => row.source.toLowerCase() === source)
          const quote = fromSource.find((row) => row.scope !== "series_at_1_1") ?? fromSource[0]
          return quote ? [quote] : []
        }),
      },
    ]
  })
  const available = rows.filter(({ prices }) => prices.length > 0).length
  const polymarket = rows.filter(({ prices }) =>
    prices.some((q) => q.source === "polymarket"),
  ).length
  const visible = rows.filter(
    ({ map, prices }) =>
      `${map.team_a} ${map.team_b} ${map.result?.steam_match_id ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()) &&
      (!provider || prices.some((q) => q.source.toLowerCase() === provider)),
  )
  return (
    <section className="panel tournament-prices">
      <div className="panel-heading schedule-list-heading">
        <div>
          <h2>Котировки до старта карты</h2>
          <p className="muted">
            {available} из {rows.length} карт с ценой · Polymarket {polymarket} из {rows.length}
          </p>
        </div>
        <div className="schedule-filters">
          <input
            type="search"
            aria-label="Поиск котировок"
            placeholder="Команда или Steam ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Источник"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="">Все источники</option>
            {[
              ...new Set(
                rows.flatMap(({ prices }) => prices.map(({ source }) => source.toLowerCase())),
              ),
            ]
              .sort()
              .map((source) => (
                <option key={source} value={source}>
                  {providerLabel(source)}
                </option>
              ))}
          </select>
        </div>
      </div>
      {visible.length ? (
        <div className="table-scroll">
          <table className="compact-stats-table">
            <thead>
              <tr>
                <th scope="col">Карта</th>
                <th scope="col">Команда</th>
                <th scope="col">Команда</th>
                <th scope="col">Источник и время</th>
              </tr>
            </thead>
            <tbody className="tournament-price-rows">
              {visible.map(({ map, prices }) => {
                const shown = prices.filter((q) => !provider || q.source.toLowerCase() === provider)
                return (
                  <tr key={`${map.series_id}/${map.map_number}`}>
                    <th scope="row">
                      <a href={`#${mapPath(map)}?${query({ tournament })}`}>
                        Карта {map.map_number}
                      </a>
                      <small className="metric-note">{time(map.result?.started_at_utc)}</small>
                    </th>
                    <td>
                      <TeamIdentity name={map.team_a} size="sm" />
                      {shown.map((q) => (
                        <small className="metric-note" key={q.source}>
                          {providerLabel(q.source)} · {priceLabel(q.team_a)}
                        </small>
                      ))}
                    </td>
                    <td>
                      <TeamIdentity name={map.team_b} size="sm" />
                      {shown.map((q) => (
                        <small className="metric-note" key={q.source}>
                          {providerLabel(q.source)} · {priceLabel(q.team_b)}
                        </small>
                      ))}
                    </td>
                    <td>
                      {shown.length ? (
                        shown.map((q) => {
                          const url = quoteSourceUrl(q.url, q.source)
                          return (
                            <div className="tournament-price-source" key={q.source}>
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer">
                                  {providerLabel(q.source)} ↗
                                </a>
                              ) : (
                                providerLabel(q.source)
                              )}
                              <small className="metric-note">
                                {q.scope === "series_at_1_1" ? "Серия при 1:1" : "Рынок карты"} ·{" "}
                                {time(q.at)}
                              </small>
                            </div>
                          )
                        })
                      ) : (
                        <span className="muted">Нет подтверждённой цены до старта</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Карт по выбранным условиям нет" />
      )}
      <p className="footnote">
        Время UTC+7. История Polymarket даёт справочный коэффициент 1 / цена исхода.
      </p>
    </section>
  )
}
