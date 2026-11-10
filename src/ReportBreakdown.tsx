import { useState } from "react"
import { type CompletedMatch, winnerPrediction } from "./reporting"
import { TeamIdentity } from "./VisualIdentity"

const days = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short" })
const stages = ["pre", "post"] as const

function countWins(items: readonly CompletedMatch[], stage: "pre" | "post") {
  const scored = items.filter((item) => item[stage] != null && item.winner != null)
  return (
    scored.filter((item) => winnerPrediction(item, stage) === item.winner).length +
    " / " +
    scored.length
  )
}

export function ReportBreakdown({ items }: { readonly items: readonly CompletedMatch[] }) {
  const [view, setView] = useState<"date" | "team">("date")
  const pairs = items.filter((item) => item.pre && item.post)
  const scoredPairs = pairs.filter((item) => item.winner !== null)
  const flips = pairs.filter(
    (item) => winnerPrediction(item, "pre") !== winnerPrediction(item, "post"),
  )
  const probabilityChanges = pairs.filter(
    (item) => item.pre?.probability_team_a !== item.post?.probability_team_a,
  )
  const fixed = scoredPairs.filter(
    (item) =>
      winnerPrediction(item, "pre") !== item.winner &&
      winnerPrediction(item, "post") === item.winner,
  ).length
  const regressed = scoredPairs.filter(
    (item) =>
      winnerPrediction(item, "pre") === item.winner &&
      winnerPrediction(item, "post") !== item.winner,
  ).length
  const groups = new Map<string, CompletedMatch[]>()
  for (const item of items) {
    const keys =
      view === "date" ? [days.format(new Date(item.starts_at_utc))] : [item.team_a, item.team_b]
    for (const key of keys) {
      const group = groups.get(key) ?? []
      group.push(item)
      groups.set(key, group)
    }
  }
  return (
    <>
      <section className="panel section-card">
        <h2>Что изменилось после драфта</h2>
        <p className="muted">
          {pairs.length} пар PRE/POST · {scoredPairs.length} с известным победителем.
        </p>
        <dl className="report-kpis">
          <div>
            <dt>Сдвиг вероятности</dt>
            <dd>{probabilityChanges.length}</dd>
          </div>
          <div>
            <dt>Смена фаворита</dt>
            <dd>{flips.length}</dd>
          </div>
          <div>
            <dt>POST исправил PRE</dt>
            <dd>{fixed}</dd>
          </div>
          <div>
            <dt>POST потерял попадание</dt>
            <dd>{regressed}</dd>
          </div>
        </dl>
      </section>
      <section className="panel section-card">
        <h2>Насколько близко к длительности карты</h2>
        <div className="table-scroll">
          <table className="compact-stats-table">
            <thead>
              <tr>
                <th scope="col">Допустимая ошибка</th>
                <th scope="col">PRE</th>
                <th scope="col">POST</th>
              </tr>
            </thead>
            <tbody>
              {[5, 10].map((threshold) => (
                <tr key={threshold}>
                  <th scope="row">До {threshold} минут включительно</th>
                  {stages.map((stage) => {
                    const errors = items.flatMap((item) => {
                      const forecast = item[stage]
                      return forecast && item.duration_seconds != null
                        ? [Math.abs(forecast.duration_seconds - item.duration_seconds)]
                        : []
                    })
                    return (
                      <td key={stage}>
                        {errors.length
                          ? errors.filter((error) => error <= threshold * 60).length +
                            " / " +
                            errors.length
                          : "—"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel section-card">
        <div className="history-detail-header">
          <div>
            <h2>Попадания по победителю</h2>
            <p className="muted">Верные прогнозы / карты с известным исходом.</p>
          </div>
          <fieldset className="view-tabs inline-tabs" aria-label="Группировка статистики">
            <button
              type="button"
              className="secondary"
              aria-pressed={view === "date"}
              onClick={() => setView("date")}
            >
              По дням
            </button>
            <button
              type="button"
              className="secondary"
              aria-pressed={view === "team"}
              onClick={() => setView("team")}
            >
              По командам
            </button>
          </fieldset>
        </div>
        <div className="table-scroll">
          <table className="compact-stats-table">
            <thead>
              <tr>
                <th scope="col">{view === "date" ? "Дата по Бангкоку" : "Команда"}</th>
                <th scope="col">Карт</th>
                <th scope="col">PRE</th>
                <th scope="col">POST</th>
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([group, rows]) => (
                  <tr key={group}>
                    <th scope="row">
                      {view === "team" ? <TeamIdentity name={group} size="sm" /> : group}
                    </th>
                    <td>{rows.length}</td>
                    {stages.map((stage) => (
                      <td key={stage}>{countWins(rows, stage)}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
