import { archiveMatch, tournamentArchive } from "./archive"
import { time } from "./domain"
import type { CompletedMatch, Provenance } from "./reporting"

export function ArchiveStats({
  items,
  provenance,
}: {
  readonly items: readonly CompletedMatch[]
  readonly provenance: Provenance
}) {
  const matched = items.flatMap((item) => {
    const row = archiveMatch(item, provenance)
    return row ? [row] : []
  })
  if (!matched.length) return null
  const winners = matched.filter((row) => row.priceA != null && row.priceB != null).length
  const twoSided = matched.filter(
    (row) => row.line != null && row.under != null && row.over != null,
  ).length
  const oneSided = matched.filter(
    (row) => row.line != null && (row.under == null) !== (row.over == null),
  ).length
  return (
    <>
      <section className="panel section-card archive-coverage">
        <h2>Покрытие архивных коэффициентов</h2>
        <p className="muted">
          {matched.length} из {items.length} карт выбранной выборки сопоставлены с архивом от{" "}
          {time(tournamentArchive.asOf)} (Бангкок).
        </p>
        <dl className="report-kpis">
          <div>
            <dt>Цены на обе команды</dt>
            <dd>
              {winners} / {matched.length}
            </dd>
          </div>
          <div>
            <dt>Тотал · обе стороны</dt>
            <dd>{twoSided}</dd>
          </div>
          <div>
            <dt>Тотал · одна сторона</dt>
            <dd>{oneSided}</dd>
          </div>
          <div>
            <dt>Без цены на тотал</dt>
            <dd>{matched.length - twoSided - oneSided}</dd>
          </div>
        </dl>
        <p className="muted">
          В истории карты доступны источник каждого рынка, время наблюдения и фаза, если они
          подтверждены.
        </p>
      </section>
      {matched.length === tournamentArchive.mapCount && items.length === matched.length && (
        <section className="panel section-card">
          <h2>Сравнение сценариев PARI Universe</h2>
          <p className="muted">
            Пять сценариев со стартом $100 и фиксированными $20 на карту. В сводке PRE использует
            подтверждённую цену до драфта, POST — live-цену после полного драфта.
          </p>
          <a
            href="https://docs.google.com/spreadsheets/d/1MB3IqnQjt7GzjwRHnKq_kaAGbBpU6kNTPU_0veq8UG8/edit#gid=1204429685"
            target="_blank"
            rel="noreferrer"
          >
            Открыть сводку турнира ↗
          </a>
        </section>
      )}
    </>
  )
}
