import { ArrowRight, RefreshCw, Swords } from "lucide-react"
import { useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { type Catalog, message, scheduleSchema } from "./contracts"
import { mapPath, mapStatus, query, time } from "./domain"
import { EventOverview } from "./EventOverview"
import { Empty, Header, Notice } from "./ui"

type ScheduleData = z.infer<typeof scheduleSchema>
const tournamentOptions = [
  { key: "pari-universe", name: "PARI Universe", status: "Завершён" },
  { key: "1win-essence-3", name: "1win Essence III", status: "Предстоящий" },
] as const
const recentSeriesWindow = 4 * 60 * 60 * 1000

export function Schedule({
  api,
  catalog,
  tournament,
  navigate,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly tournament: string
  readonly navigate: (route: string) => void
}) {
  const [date, setDate] = useState("")
  const [team, setTeam] = useState("")
  const [data, setData] = useState<ScheduleData | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [refresh, setRefresh] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry the request with the same filters.
  useEffect(() => {
    let active = true
    setBusy(true)
    setError("")
    api
      .request(`/schedule?${query({ date, team, tournament })}`, scheduleSchema)
      .then((result) => {
        if (!active) return
        if (tournament === "1win-essence-3" && !result.event) {
          throw new Error("Расписание 1win Essence III пока недоступно.")
        }
        setData(result)
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
  }, [api, date, team, tournament, refresh])

  const now = Date.now()
  const recent = data?.series
    .filter((item) => {
      const start = Date.parse(item.starts_at_utc)
      return (
        start <= now && now - start < recentSeriesWindow && item.maps.some((map) => !map.result)
      )
    })
    .sort((a, b) => b.starts_at_utc.localeCompare(a.starts_at_utc))
  const upcoming = data?.series
    .filter((item) => Date.parse(item.starts_at_utc) > now && item.maps.some((map) => !map.result))
    .sort((a, b) => a.starts_at_utc.localeCompare(b.starts_at_utc))
  const series = [
    ...(recent ?? []),
    ...(upcoming ?? []),
    ...(data?.series ?? [])
      .filter((item) => !recent?.includes(item) && !upcoming?.includes(item))
      .sort((a, b) => b.starts_at_utc.localeCompare(a.starts_at_utc)),
  ]
  return (
    <>
      <Header
        title="Расписание"
        subtitle="Выберите карту для подготовки и прогноза. Время начала по Бангкоку (UTC+7)."
      />
      <fieldset className="view-tabs tournament-tabs" aria-label="Турнир">
        {tournamentOptions.map((option) => (
          <button
            key={option.name}
            type="button"
            className="secondary"
            aria-pressed={(tournament || "pari-universe") === option.key}
            onClick={() =>
              navigate(
                option.key === "pari-universe"
                  ? "/schedule"
                  : `/schedule?${query({ tournament: option.key })}`,
              )
            }
          >
            {option.name} <small>{option.status}</small>
          </button>
        ))}
      </fieldset>
      <section className="toolbar schedule-toolbar" aria-label="Настройки расписания">
        <details className="optional-filters">
          <summary>{date || team ? "Фильтры применены" : "Фильтры расписания"}</summary>
          <div className="optional-filter-fields">
            <label>
              День турнира
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                <option value="">Все даты</option>
                {data?.dates.map((day) => (
                  <option key={day}>{day}</option>
                ))}
              </select>
            </label>
            <label>
              Команда
              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">Все команды</option>
                {(data?.event?.teams ?? catalog.teams).map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <button
          type="button"
          className="secondary"
          onClick={() => setRefresh((x) => x + 1)}
          disabled={busy}
        >
          <RefreshCw size={16} /> {busy ? "Обновляем…" : "Обновить"}
        </button>
      </section>
      {error && <Notice error>{error} Попробуйте обновить расписание.</Notice>}
      <section className="panel schedule-panel" aria-busy={busy}>
        <div className="panel-heading">
          <div>
            <h2>{data?.event ? "Подтверждённые пары" : "Серии"}</h2>
            <p className="muted">
              {data
                ? `${data.series.length} · обновлено ${time(data.refreshed_at_utc)}`
                : busy
                  ? "Загружаем расписание…"
                  : "Расписание недоступно"}
            </p>
          </div>
        </div>
        {series.map((item) => (
          <article className="series-row" key={item.series_id}>
            <div className="series-time">
              <strong>{time(item.starts_at_utc)}</strong>
              <span>BO{item.best_of}</span>
              {item.tournament_date && (
                <span>Турнирный день {item.tournament_date.split("-").reverse().join(".")}</span>
              )}
            </div>
            <div className="series-teams">
              <Swords size={18} aria-hidden="true" />
              <div>
                <strong>{item.team_a}</strong>
                <span className="versus">—</span>
                <strong>{item.team_b}</strong>
              </div>
            </div>
            <div className="map-buttons">
              {!data?.event && now - Date.parse(item.starts_at_utc) >= recentSeriesWindow && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => navigate(`/history?${query({ series: item.series_id })}`)}
                >
                  Найти в истории <ArrowRight size={13} aria-hidden="true" />
                </button>
              )}
              {item.maps.map((map) => (
                <button
                  type="button"
                  key={map.map_number}
                  className="map-button"
                  onClick={() => navigate(mapPath(map))}
                >
                  <span>
                    Карта {map.map_number} <ArrowRight size={13} aria-hidden="true" />
                  </span>
                  <small>
                    {!map.result &&
                    !map.pre &&
                    !map.post &&
                    now - Date.parse(item.starts_at_utc) >= recentSeriesWindow
                      ? "Без сохранённого прогноза"
                      : mapStatus(map)}
                  </small>
                </button>
              ))}
            </div>
          </article>
        ))}
        {!busy && data?.series.length === 0 && (
          <Empty title={data.event ? "Подтверждённых пар пока нет" : "Серий по фильтрам нет"}>
            {data.event
              ? "Карточки для PRE и POST появятся после объявления пар."
              : "Выберите другую дату или команду."}
          </Empty>
        )}
      </section>
      {data?.event && <EventOverview event={data.event} />}
    </>
  )
}
