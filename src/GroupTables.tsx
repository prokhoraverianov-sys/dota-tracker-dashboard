import { TeamIdentity } from "./VisualIdentity"

export type GroupStanding = {
  id: string
  name: string
  teamKey?: string | undefined
  rank: number | null
  played: number
  won: number
  drawn: number
  lost: number
  mapsWon: number
  mapsLost: number
  qualified?: boolean | undefined
}

export type GroupStandingTable = {
  id: string
  name: string
  complete: boolean
  rows: readonly GroupStanding[]
}

export function GroupTables({
  tables,
  onTeam,
}: {
  readonly tables: readonly GroupStandingTable[]
  readonly onTeam: (group: string, team: string) => void
}) {
  return (
    <div className="playin-group-grid">
      {tables.map((group) => (
        <section className="panel playin-group" key={group.id} aria-label={group.name}>
          <div className="panel-heading">
            <div>
              <h2>{group.name}</h2>
              <p className="muted">
                {group.complete
                  ? "Все серии группы завершены"
                  : "Текущее положение · группа не завершена"}
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="compact-stats-table">
              <caption>Таблица · {group.name}</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Команда</th>
                  <th scope="col" title="Победы, ничьи, поражения">
                    Серии В–Н–П
                  </th>
                  <th scope="col">Карты</th>
                  <th scope="col">Разница</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const difference = row.mapsWon - row.mapsLost
                  return (
                    <tr key={row.id}>
                      <td>{row.rank ?? "—"}</td>
                      <th scope="row">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => onTeam(group.id, row.id)}
                        >
                          <TeamIdentity name={row.name} teamKey={row.teamKey} size="sm" />
                        </button>
                        {row.qualified && (
                          <small className="metric-note hit-text">Выход подтверждён</small>
                        )}
                      </th>
                      <td>
                        {row.won}–{row.drawn}–{row.lost}
                        <small className="metric-note">сыграно {row.played}</small>
                      </td>
                      <td>
                        {row.mapsWon} : {row.mapsLost}
                      </td>
                      <td>
                        {difference > 0 ? "+" : ""}
                        {difference}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
