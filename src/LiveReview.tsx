import type { LiveProposal } from "./contracts"
import { time } from "./domain"
import { Notice } from "./ui"
export function LiveReview({
  proposal,
  apply,
  cancel,
}: {
  readonly proposal: LiveProposal
  readonly apply: () => void
  readonly cancel: () => void
}) {
  return (
    <section className="panel live-review" aria-label="Проверка данных источника">
      <h2>Данные источника: проверьте перед применением</h2>
      <p>{proposal.notice}</p>
      <p className="muted">
        Проверено {time(proposal.checked_at_utc)} · {proposal.status}
      </p>
      {proposal.conflicts.length > 0 && <Notice>Конфликты: {proposal.conflicts.join("; ")}</Notice>}
      <div className="two-columns">
        {(["team_a", "team_b"] as const).map((side, index) => (
          <div key={side}>
            <h3>Команда {index === 0 ? "A" : "B"}</h3>
            {proposal.input[side].players.map((player, i) => (
              <p key={`${side}-${i + 1}`} className="proposal-row">
                {i + 1}. {player || "нет игрока"}
                <strong>{proposal.input[side].heroes[i] || "нет героя"}</strong>
              </p>
            ))}
          </div>
        ))}
      </div>
      <p className="muted">
        Применение заменит текущий черновик показанными значениями. Сохранённые прогнозы не
        изменятся.
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={proposal.status === "failure" || proposal.status === "unavailable"}
          onClick={apply}
        >
          Применить предложение
        </button>
        <button type="button" className="secondary" onClick={cancel}>
          Оставить мой черновик
        </button>
      </div>
    </section>
  )
}
