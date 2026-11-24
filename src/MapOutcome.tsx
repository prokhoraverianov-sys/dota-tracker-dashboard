import type { MapDTO } from "./contracts"
import { evaluateMap, mapStages, stageNames } from "./map-outcome"
import { decimalPrice, reportPrice } from "./report-price"
import { minutes } from "./reporting"

export function StageVerdict({
  map,
  stage,
}: {
  readonly map: MapDTO
  readonly stage: "pre" | "post"
}) {
  const { selected, pick, note, comparison } = evaluateMap(map, stage)
  const price = comparison !== null && selected ? reportPrice(map, selected) : null
  return (
    <div className="stage-verdict">
      <strong className={comparison === null ? "muted" : comparison ? "hit-text" : "miss-text"}>
        {comparison === null ? note : comparison ? "Зашло" : "Не зашло"}
      </strong>
      {pick && <small>Выбор модели · {pick}</small>}
      {price && (
        <small>
          Кэф. {decimalPrice(price.value)} · {price.label}
        </small>
      )}
      {note && comparison !== null && <small>{note} · вне точности оригиналов</small>}
    </div>
  )
}

export function MapOutcome({ map }: { readonly map: MapDTO }) {
  if (map.play_status === "unplayed") return null
  const result = map.result
  const winner = result?.winner === "A" ? map.team_a : map.team_b
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
    </section>
  )
}
