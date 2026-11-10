import type { EventOverviewDTO } from "./contracts"
import { time } from "./domain"
import { PlayInCarryover } from "./PlayIn"
import { PLAY_IN_ROUTE } from "./playin-data"
import { TeamIdentity } from "./VisualIdentity"

export function EventOverview({ event }: { readonly event: EventOverviewDTO }) {
  return (
    <>
      {event.play_in && <PlayInCarryover data={event.play_in} />}
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
              <TeamIdentity
                name={team.name}
                teamKey={team.play_in_team_key ?? team.key ?? undefined}
                size="md"
              />
              <span className="muted">
                {team.players.length ? team.players.join(" · ") : "Состав турнира уточняется"}
              </span>
              <small className={team.model_supported ? "hit-text" : "muted"}>
                {team.model_supported
                  ? "Команда распознана моделью"
                  : "Покрытие модели не подтверждено"}
              </small>
              {team.play_in_team_key && (
                <>
                  {team.play_in_series_count !== undefined &&
                    team.play_in_map_count !== undefined && (
                      <small className="muted">
                        Play-In: серий завершено — {team.play_in_series_count} · карт с данными —{" "}
                        {team.play_in_map_count}
                        {team.play_in_source_count !== undefined &&
                          ` · источников — ${team.play_in_source_count}`}
                      </small>
                    )}
                  <a href={`#${PLAY_IN_ROUTE}&team=${encodeURIComponent(team.play_in_team_key)}`}>
                    Матчи и состав Play-In →
                  </a>
                </>
              )}
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
          <a href={`#${PLAY_IN_ROUTE}`}>Группы и история Play-In →</a>
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
                      <span className="event-slot-pair">
                        {slot.team_a ? <TeamIdentity name={slot.team_a} size="sm" /> : "Уточняется"}
                        <span className="muted">—</span>
                        {slot.team_b ? <TeamIdentity name={slot.team_b} size="sm" /> : "уточняется"}
                      </span>
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
