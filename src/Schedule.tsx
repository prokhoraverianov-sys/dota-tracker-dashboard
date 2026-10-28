import { RefreshCw, Swords } from "lucide-react"
import { useEffect, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { type Catalog, message, scheduleSchema } from "./contracts"
import { mapPath, mapStatus, query, time } from "./domain"
import { Empty, Header, Notice } from "./ui"
export function Schedule({
  api,
  catalog,
  navigate,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (route: string) => void
}) {
  const [date, setDate] = useState("")
  const [team, setTeam] = useState("")
  const [data, setData] = useState<z.infer<typeof scheduleSchema> | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = refresh >= 0
    setBusy(true)
    setError("")
    api
      .request(`/schedule?${query({ date, team })}`, scheduleSchema)
      .then((result) => {
        if (active) setData(result)
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
  }, [api, date, team, refresh])
  return (
    <>
      <Header
        title="Расписание"
        subtitle="Выберите серию и карту для анализа. Время: Бангкок, UTC+7."
      />
      <section className="toolbar">
        <label>
          Дата
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
            {catalog.teams.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => setRefresh((x) => x + 1)}
          disabled={busy}
        >
          <RefreshCw size={16} />
          {busy ? "Обновляем…" : "Обновить"}
        </button>
      </section>
      {error && <Notice error>{error} Данные недоступны; попробуйте обновить.</Notice>}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{data?.tournament ?? "Турнир"}</h2>
            <p className="muted">
              {data
                ? `${data.series.length} серий · расписание обновлено ${time(data.refreshed_at_utc)}`
                : busy
                  ? "Загружаем расписание…"
                  : "Расписание недоступно"}
            </p>
          </div>
          <span className="badge">PRE / POST</span>
        </div>
        {data?.series.map((series) => (
          <article className="series-row" key={series.series_id}>
            <div className="series-time">
              <strong>{time(series.starts_at_utc)}</strong>
              <span>BO{series.best_of}</span>
            </div>
            <div className="series-teams">
              <Swords size={18} />
              <div>
                <strong>{series.team_a}</strong>
                <span className="versus">vs</span>
                <strong>{series.team_b}</strong>
              </div>
            </div>
            <div className="map-buttons">
              {series.maps.map((map) => (
                <button
                  type="button"
                  key={map.map_number}
                  className="map-button"
                  onClick={() => navigate(mapPath(map))}
                >
                  <span>Карта {map.map_number}</span>
                  <small>{mapStatus(map)}</small>
                </button>
              ))}
            </div>
          </article>
        ))}
        {data?.series.length === 0 && (
          <Empty title="Серий пока нет">
            Измените дату или команду. Неподтверждённые пары не появляются в расписании.
          </Empty>
        )}
      </section>
      <p className="footnote">
        Открытие карты не запускает прогноз и не меняет сохранённые данные.
      </p>
    </>
  )
}
