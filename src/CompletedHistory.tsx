import { ChevronDown, Search } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { archiveMatch, formatPrice } from "./archive"
import { type Catalog, message } from "./contracts"
import { percent, query, time } from "./domain"
import { HistoryMatchDetails } from "./HistoryMatchDetails"
import { ReportProvenance, ReportToolbar } from "./ReportShared"
import {
  type CompletedMatch,
  emptyFilters,
  minutes,
  tournamentHistorySchema,
  winnerPrediction,
} from "./reporting"
import { Empty, Notice } from "./ui"

function StageCell({
  match,
  stage,
}: {
  readonly match: CompletedMatch
  readonly stage: "pre" | "post"
}) {
  const forecast = match[stage]
  if (!forecast) return <span className="muted">Нет расчёта</span>
  const favorite = winnerPrediction(match, stage)
  const p = forecast.probability_team_a
  const outcome = match.winner === null ? null : favorite === match.winner
  return (
    <>
      <strong>
        {favorite} · {percent(Math.max(p, 1 - p))}
      </strong>
      <small className="metric-note">
        {minutes(forecast.duration_seconds)}
        {outcome !== null && (
          <span className={outcome ? "hit-text" : "miss-text"}>
            {" "}
            · {outcome ? "Верно" : "Ошибка"}
          </span>
        )}
      </small>
    </>
  )
}

export function CompletedHistory({
  api,
  catalog,
  initialSearch,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly initialSearch: string
}) {
  const [filters, setFilters] = useState(emptyFilters)
  const [data, setData] = useState<z.infer<typeof tournamentHistorySchema> | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [search, setSearch] = useState(initialSearch)
  const [openMatch, setOpenMatch] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const qs = query(filters)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry the request with the same filters.
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
  }, [api, qs, retry])
  const terms = search.toLocaleLowerCase("ru").trim().split(/\s+/).filter(Boolean)
  const matches =
    data?.items.filter((match) =>
      terms.every((term) =>
        `${match.team_a} ${match.team_b} ${match.match_id} ${match.series_id ?? ""}`
          .toLocaleLowerCase("ru")
          .includes(term),
      ),
    ) ?? []
  return (
    <>
      <ReportToolbar catalog={catalog} filters={filters} onChange={setFilters}>
        <label>
          Поиск по картам
          <span className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Команда или ID карты"
            />
          </span>
        </label>
      </ReportToolbar>
      {error && (
        <Notice error>
          {error}{" "}
          <button
            className="secondary"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить
          </button>
        </Notice>
      )}
      {data && <ReportProvenance data={data.provenance} />}
      <section className="panel history-panel" aria-busy={busy}>
        <div className="panel-heading">
          <div>
            <h2>
              {busy
                ? "Загружаем завершённые карты…"
                : terms.length > 0
                  ? `${matches.length} из ${data?.items.length ?? 0} карт`
                  : `${data?.items.length ?? 0} завершённых карт`}
            </h2>
            <p className="muted">
              Факт, прогнозы и архивные цены. Откройте карту, чтобы увидеть пики, факторы и
              источники цен.
            </p>
          </div>
          <span className="badge">Ретроспектива</span>
        </div>
        {data && matches.length > 0 && (
          <div className="history-table-wrap">
            <table className="completed-table">
              <thead>
                <tr>
                  <th scope="col">Матч</th>
                  <th scope="col">Результат</th>
                  <th scope="col">PRE · до драфта</th>
                  <th scope="col">POST · после драфта</th>
                  <th scope="col">Архив цен</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const archive = archiveMatch(match, data.provenance)
                  const expanded = openMatch === match.match_id
                  const label = `${match.team_a} — ${match.team_b}`
                  return (
                    <Fragment key={match.match_id}>
                      <tr className={expanded ? "history-row expanded" : "history-row"}>
                        <td className="history-identity">
                          <button
                            type="button"
                            className="history-open"
                            aria-expanded={expanded}
                            aria-controls={expanded ? `match-details-${match.match_id}` : undefined}
                            onClick={() => setOpenMatch(expanded ? null : match.match_id)}
                          >
                            <strong>{label}</strong>
                            <ChevronDown size={16} aria-hidden="true" />
                          </button>
                          <small className="metric-note">
                            {time(match.starts_at_utc)} · Карта {match.map_number ?? "—"} · #
                            {match.match_id}
                          </small>
                        </td>
                        <td data-label="Результат">
                          <strong>{match.winner ?? "Не указан"}</strong>
                          <small className="metric-note">{minutes(match.duration_seconds)}</small>
                        </td>
                        <td data-label="PRE · до драфта">
                          <StageCell match={match} stage="pre" />
                        </td>
                        <td data-label="POST · после драфта">
                          <StageCell match={match} stage="post" />
                        </td>
                        <td data-label="Архив цен">
                          {archive ? (
                            <>
                              <strong>
                                Победа · {formatPrice(archive.priceA)} /{" "}
                                {formatPrice(archive.priceB)}
                              </strong>
                              <small className="metric-note">
                                {archive.line == null
                                  ? "Тотал · нет линии"
                                  : `${archive.line} мин · Б ${formatPrice(archive.over)} / М ${formatPrice(archive.under)}`}
                              </small>
                            </>
                          ) : (
                            <span className="muted">Нет данных</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="history-detail-row">
                          <td colSpan={5}>
                            <HistoryMatchDetails match={match} archive={archive} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!busy && data && matches.length === 0 && (
          <Empty title="Карт по этим условиям нет">Измените фильтры или поисковый запрос.</Empty>
        )}
        {!busy && !data && !error && <Empty title="История матчей пока недоступна" />}
      </section>
    </>
  )
}
