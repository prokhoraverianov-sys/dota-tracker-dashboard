import { archiveMatch, tournamentArchive } from "./archive"
import { time } from "./domain"
import type { CompletedMatch, Provenance } from "./reporting"

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
})
const scenarioTitles: Readonly<Record<string, string | undefined>> = {
  winnerPOST125: "Победитель · POST · влияние драфта 1,25",
  winnerPRE: "Победитель · PRE",
  winnerPOST: "Победитель · POST · влияние драфта 0,25",
  totalPRE: "Тотал · PRE",
  totalPOST: "Тотал · POST",
}

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
      <section className="panel section-card">
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
          <h2>Расчётный банк · полный турнир</h2>
          <p className="muted">
            Стартовый банк 100 USD. Для POST 1,25 ставка фиксирована: 20 USD на каждую из 84 карт,
            без фильтра по коэффициенту. В остальных сценариях ставка составляет 20% текущего банка.
            Использованы архивные коэффициенты. Время относительно драфта известно не для всех карт.
          </p>
          <div className="bank-grid">
            {tournamentArchive.bank.map((row) => (
              <article key={row.scenario}>
                <h3>{scenarioTitles[row.scenario] ?? row.scenario}</h3>
                <strong>{money.format(row.bank)}</strong>
                <span className={row.profit < 0 ? "miss-text" : "hit-text"}>
                  {money.format(row.profit)} к старту
                </span>
                <small className="muted">
                  {row.won} выигр. · {row.lost} проигр. · {row.push} возвр. · {row.skip} пропусков
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
