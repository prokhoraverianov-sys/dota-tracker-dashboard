import type { Draft, LiveProposal } from "./contracts"
import { time } from "./domain"
import { Notice } from "./ui"
import { HeroPortrait } from "./VisualIdentity"
import "./analysis-presentation.css"
export function draftCompleteness(input: Draft): number {
  return [...input.team_a.heroes, ...input.team_b.heroes].filter((hero) => hero.trim()).length
}
export function conflictText(value: string): string {
  return value
    .replace(
      /position (\d+): manual player differs from live source/g,
      "Позиция $1: выбранный игрок отличается от источника",
    )
    .replace(/manual hero differs from live source/g, "выбранный герой отличается от источника")
    .replace(
      /Live roster is incomplete; manual lineup preserved/g,
      "Состав источника неполный; ваш состав сохранён",
    )
}
export function LiveReview({
  proposal,
  current,
  apply,
  cancel,
}: {
  readonly proposal: LiveProposal
  readonly current: Draft
  readonly apply: () => void
  readonly cancel: () => void
}) {
  const picked = draftCompleteness(proposal.input)
  const changed = JSON.stringify(proposal.input) !== JSON.stringify(current)
  const unavailable = proposal.status === "failure" || proposal.status === "unavailable"
  return (
    <section className="panel live-review" aria-label="Проверка данных источника">
      <h2>
        {picked === 10
          ? "Драфт получен: проверьте 10 героев"
          : picked === 0
            ? "Героев пока нет · доступны только составы"
            : `Драфт неполный: ${picked} из 10 героев`}
      </h2>
      <p className="muted">
        Проверено {time(proposal.checked_at_utc)}.{" "}
        {unavailable
          ? "Источник недоступен. Можно заполнить драфт вручную."
          : picked < 10
            ? "Заполните недостающих героев вручную или повторите запрос позже."
            : "Проверьте позиции и ручные замены перед применением."}
      </p>
      {proposal.conflicts.length > 0 && (
        <Notice>{proposal.conflicts.map(conflictText).join("; ")}</Notice>
      )}
      <div className="two-columns">
        {(["team_a", "team_b"] as const).map((side, index) => (
          <div key={side}>
            <h3>Команда {index === 0 ? "A" : "B"}</h3>
            {proposal.input[side].players.map((player, i) => (
              <p key={`${side}-${i + 1}`} className="proposal-row">
                {i + 1}.{" "}
                {current[side].players[i] && current[side].players[i] !== player ? (
                  <span>
                    {current[side].players[i]} → {player || "нет игрока"}
                  </span>
                ) : (
                  player || "нет игрока"
                )}
                <strong className="proposal-hero">
                  <HeroPortrait name={proposal.input[side].heroes[i] ?? ""} size="sm" />
                  {proposal.input[side].heroes[i] || "нет героя"}
                </strong>
              </p>
            ))}
          </div>
        ))}
      </div>
      <p className="muted">
        {changed
          ? "Применение перенесёт показанные значения в черновик. Сохранённые прогнозы не изменятся."
          : "Новых значений нет. Текущий черновик уже содержит эти данные."}
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={unavailable || !changed}
          onClick={apply}
        >
          {picked === 0 ? "Применить изменения состава" : "Применить предложение"}
        </button>
        <button type="button" className="secondary" onClick={cancel}>
          Оставить мой черновик
        </button>
      </div>
    </section>
  )
}
