import type { EventOverviewDTO } from "./contracts"
import { time } from "./domain"

export function EventOverview({ event }: { readonly event: EventOverviewDTO }) {
  return (
    <>
      <section className="panel section-card" aria-label="Участники 1win Essence III">
        <h2>Участники 1win Essence III</h2>
        <p className="muted">
          {event.teams.length} подтверждённых команд.
          {event.qualifier_slots > 0 && (
            <>
              {" "}
              Ещё {event.qualifier_slots} места разыгрываются в Play-In (
              {event.qualifier_dates[0].slice(8)}–{event.qualifier_dates[1].slice(8)} ноября).
            </>
          )}
        </p>
        <ul className="event-teams">
          {event.teams.map((team) => (
            <li key={team.name}>
              <strong>{team.name}</strong>
              <span className="muted">
                {team.players.length ? team.players.join(" · ") : "Состав турнира уточняется"}
              </span>
              <small className={team.model_supported ? "hit-text" : "muted"}>
                {team.model_supported
                  ? "Команда распознана моделью"
                  : "Покрытие модели не подтверждено"}
              </small>
              {team.roster_source?.startsWith("https://") && (
                <a href={team.roster_source} target="_blank" rel="noreferrer">
                  Источник состава ↗
                </a>
              )}
            </li>
          ))}
        </ul>
        <div className="actions">
          {event.source_url.startsWith("https://") && (
            <a href={event.source_url} target="_blank" rel="noreferrer">
              Расписание и участники ↗
            </a>
          )}
          {event.qualifier_url.startsWith("https://") && (
            <a href={event.qualifier_url} target="_blank" rel="noreferrer">
              Play-In ↗
            </a>
          )}
        </div>
      </section>
      {event.slots.length > 0 && (
        <section className="panel section-card pending-series" aria-label="Слоты расписания">
          <h2>Слоты расписания</h2>
          <p className="muted">
            Время уже опубликовано. Карта откроется для подготовки после подтверждения обеих команд.
          </p>
          <div className="table-scroll">
            <table className="compact-stats-table">
              <thead>
                <tr>
                  <th scope="col">Бангкок</th>
                  <th scope="col">Этап</th>
                  <th scope="col">Формат</th>
                  <th scope="col">Пара</th>
                </tr>
              </thead>
              <tbody>
                {event.slots.map((slot) => (
                  <tr key={slot.series_id}>
                    <td>{time(slot.starts_at_utc)}</td>
                    <th scope="row">{slot.phase}</th>
                    <td>BO{slot.best_of}</td>
                    <td>
                      {slot.team_a ?? "Уточняется"} — {slot.team_b ?? "уточняется"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
