import type { MapDTO } from "./contracts"
import { time } from "./domain"
import { evaluateMap, mapStages, stageNames } from "./map-outcome"
import {
  decimalPrice,
  originalPostAfterVerifiedWindow,
  phasePriceLabels,
  reportPrice,
  reportPriceChange,
} from "./report-price"
import { minutes } from "./reporting"

export function StageVerdict({
  map,
  stage,
}: {
  readonly map: MapDTO
  readonly stage: "pre" | "post"
}) {
  const { selected, pick, note, comparison, forecast } = evaluateMap(map, stage)
  const timingNote =
    stage === "post" &&
    forecast === map.post &&
    !map.gameplay_started_at_utc &&
    originalPostAfterVerifiedWindow(map)
      ? "Прогноз записан после подтверждённого окна POST"
      : note
  const price = comparison !== null && selected ? reportPrice(map, stage, selected) : null
  return (
    <div className="stage-verdict">
      <strong className={comparison === null ? "muted" : comparison ? "hit-text" : "miss-text"}>
        {comparison === null ? timingNote : comparison ? "Зашло" : "Не зашло"}
      </strong>
      {pick && <small className="verdict-pick">Выбор модели · {pick}</small>}
      {price && (
        <small>
          {price.retrospective ? "Ретроспективная котировка" : "Котировка"}{" "}
          {decimalPrice(price.value)} · {price.provider} ·{" "}
          <time dateTime={price.observedAt} title={price.observedAt}>
            {price.retrospective
              ? price.observedAt.replace("T", " ").replace(/(?:\.000)?(?:Z|\+00:00)$/, " UTC")
              : time(price.observedAt)}
          </time>
          {price.retrospective && price.sourceUrl && (
            <>
              {" "}
              ·{" "}
              <a href={price.sourceUrl} target="_blank" rel="noreferrer">
                Рынок ↗
              </a>
            </>
          )}
        </small>
      )}
      {comparison !== null && !price && (
        <small>Нет подтверждённой цены {phasePriceLabels[stage]}</small>
      )}
      {timingNote && comparison !== null && <small>{timingNote}</small>}
    </div>
  )
}

export function MapOutcome({ map }: { readonly map: MapDTO }) {
  if (map.play_status === "unplayed") return null
  const result = map.result
  const winner = result?.winner === "A" ? map.team_a : map.team_b
  const priceChange = reportPriceChange(map)
  return (
    <section className="panel outcome-panel" aria-label="Результат и прогнозы">
      <div>
        <h2>{result ? "Победитель карты" : "Результат карты"}</h2>
        {map.result_conflict ? (
          <p aria-live="polite">Источники расходятся. {map.result_conflict}</p>
        ) : result ? (
          <>
            <strong>
              {winner} · {minutes(result.duration_seconds)}
            </strong>
            {result.steam_match_id && /^\d+$/.test(result.steam_match_id) && (
              <a
                href={`https://www.opendota.com/matches/${result.steam_match_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Steam Match ID {result.steam_match_id} ↗
              </a>
            )}
          </>
        ) : (
          <p className="muted">Ожидаем подтверждения источника.</p>
        )}
      </div>
      {mapStages.map((stage) => (
        <div key={stage}>
          <h3>{stageNames[stage]}</h3>
          <StageVerdict map={map} stage={stage} />
        </div>
      ))}
      {priceChange && (
        <p className="footnote outcome-price-change">
          Изменение котировок PRE → POST · {priceChange.provider}
          {priceChange.retrospective && " · ретроспектива"} · {map.team_a}{" "}
          {priceChange.a > 0 ? "+" : ""}
          {decimalPrice(priceChange.a)} / {map.team_b} {priceChange.b > 0 ? "+" : ""}
          {decimalPrice(priceChange.b)}
        </p>
      )}
    </section>
  )
}
