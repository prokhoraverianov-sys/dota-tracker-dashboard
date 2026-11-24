import type { ArchiveMatch } from "./archive"
import type { MapDTO } from "./contracts"
import { time } from "./domain"
import records from "./essence-archived-prices.json"
import { type ProviderOdds, priceLabel, providerLabel, quoteSourceUrl } from "./odds"
import pariRecords from "./pari-universe-archive.json"
import playInRecords from "./playin-archived-prices.json"

interface Observation {
  source: string
  scope: string
  team_a: string
  team_b: string
  at: string | null
  url: string
  resolution?: number
}

interface ArchivedMap {
  steam: string
  team_a: string
  team_b: string
  quotes: Observation[]
}

const archive: Record<string, ArchivedMap> = { ...records, ...playInRecords }
const pariArchive: Readonly<Record<string, ArchiveMatch | undefined>> = pariRecords.matches

function phaseLabel(scope: string) {
  switch (scope) {
    case "series_at_1_1":
      return "Рынок серии при 1:1 · справочная цена до карты"
    case "map":
      return "Рынок карты · справочная цена до старта"
    case "before":
      return "Рынок карты · снимок до старта"
    case "during":
      return "Рынок карты · снимок по ходу игры"
    case "after":
      return "Рынок карты · снимок после игры"
    case "undated":
      return "Архив линии · время снимка неизвестно"
    default:
      return "Архив линии · время относительно карты неизвестно"
  }
}

function observationPhase(at: string | null, map: MapDTO) {
  if (!at) return "undated"
  const start = Date.parse(map.result?.started_at_utc ?? "")
  if (!Number.isFinite(start) || !map.result) return "unconfirmed"
  const observed = Date.parse(at)
  if (!Number.isFinite(observed)) return "undated"
  if (observed < start) return "before"
  return observed < start + map.result.duration_seconds * 1000 ? "during" : "after"
}

function bookmaker(url: string) {
  try {
    const host = new URL(url).hostname
    if (host === "pari.ru") return "PARI"
    if (host === "www.olimp.bet" || host === "olimp.bet") return "OLIMPBET"
  } catch {
    /* An archived record can lack a valid source. */
  }
  return null
}

function observationTime(at: string | null) {
  return at ? <time dateTime={at}>{time(at)} · UTC+7</time> : <>Время не подтверждено</>
}

export function archivedWinnerPrices(map: MapDTO, beforeStart: readonly ProviderOdds[] = []) {
  const saved = archive[`${map.series_id}/${map.map_number}`]
  const steam = map.result?.steam_match_id
  const sameOrder = saved && map.team_a === saved.team_a && map.team_b === saved.team_b
  const reverseOrder =
    saved &&
    steam &&
    String(steam) === saved.steam &&
    map.team_a === saved.team_b &&
    map.team_b === saved.team_a
  const matches = saved && (!steam || String(steam) === saved.steam) && (sameOrder || reverseOrder)
  const pariEntry =
    map.series_id?.startsWith("p26-") && map.result?.steam_match_id
      ? pariArchive[String(map.result.steam_match_id)]
      : undefined
  const pariReversed = pariEntry?.a === map.team_b && pariEntry?.b === map.team_a
  const pari =
    pariReversed || (pariEntry?.a === map.team_a && pariEntry?.b === map.team_b)
      ? pariEntry
      : undefined
  const observations: Observation[] = []
  for (const row of beforeStart) {
    if (!row.winner || !row.provider || !row.observed_at_utc || !row.source_url) continue
    observations.push({
      source: row.provider,
      scope: "before",
      team_a: row.winner.team_a,
      team_b: row.winner.team_b,
      at: row.observed_at_utc,
      url: row.source_url,
    })
  }
  if (matches) {
    for (const item of saved.quotes) {
      if (!observations.some((row) => row.source === item.source && row.at === item.at)) {
        observations.push(
          reverseOrder ? { ...item, team_a: item.team_b, team_b: item.team_a } : item,
        )
      }
    }
  }
  if (pari?.winnerUrl && pari.priceA != null && pari.priceB != null) {
    const source = bookmaker(pari.winnerUrl)
    if (
      source &&
      !observations.some(
        (q) => q.source.toLowerCase() === source.toLowerCase() && q.at === pari.winnerTime,
      )
    ) {
      observations.push({
        source,
        url: pari.winnerUrl,
        scope: observationPhase(pari.winnerTime, map),
        team_a: String(pariReversed ? pari.priceB : pari.priceA),
        team_b: String(pariReversed ? pari.priceA : pari.priceB),
        at: pari.winnerTime,
      })
    }
  }
  return { observations, pari }
}

export function ArchivedPrices({
  map,
  beforeStart = [],
}: {
  readonly map: MapDTO
  readonly beforeStart?: readonly ProviderOdds[] | undefined
}) {
  const { observations, pari } = archivedWinnerPrices(map, beforeStart)
  const totalSource = pari?.totalUrl ? bookmaker(pari.totalUrl) : null
  const totalUrl = pari?.totalUrl && totalSource ? quoteSourceUrl(pari.totalUrl, totalSource) : null
  if (!observations.length && !totalUrl)
    return map.result ? (
      <div className="archive-prices">
        <h3>Архив котировок</h3>
        <p className="muted">
          Для этой карты в архиве пока нет подтверждённого снимка с ценами обеих команд.
        </p>
      </div>
    ) : null
  return (
    <div className="archive-prices">
      <h3>Архив котировок</h3>
      {observations.length > 0 && (
        <table className="odds-duration-table" aria-label="Архив котировок">
          <thead>
            <tr>
              <th>Источник и рынок</th>
              <th>{map.team_a}</th>
              <th>{map.team_b}</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((q) => {
              const url = quoteSourceUrl(q.url, q.source)
              return (
                <tr key={`${q.source}-${q.at}-${q.scope}`}>
                  <th scope="row">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {providerLabel(q.source)}
                      </a>
                    ) : (
                      providerLabel(q.source)
                    )}
                    <div>{phaseLabel(q.scope)}</div>
                    <small>
                      {observationTime(q.at)}
                      {!!q.resolution && ` · шаг архива ${q.resolution} с`}
                    </small>
                  </th>
                  <td className="numeric">{priceLabel(q.team_a)}</td>
                  <td className="numeric">{priceLabel(q.team_b)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {pari && totalUrl && pari.line != null && (
        <table className="odds-duration-table" aria-label="Архив тоталов длительности">
          <thead>
            <tr>
              <th>Тотал длительности</th>
              <th>Меньше</th>
              <th>Больше</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <a href={totalUrl} target="_blank" rel="noreferrer">
                  {totalSource}
                </a>{" "}
                · {pari.line} мин
                <div>{phaseLabel(observationPhase(pari.totalTime, map))}</div>
                <small>{observationTime(pari.totalTime)}</small>
              </th>
              <td>{pari.under == null ? "Цена не сохранена" : priceLabel(String(pari.under))}</td>
              <td>{pari.over == null ? "Цена не сохранена" : priceLabel(String(pari.over))}</td>
            </tr>
          </tbody>
        </table>
      )}
      {observations.some((q) => q.scope === "map" || q.scope === "series_at_1_1") && (
        <p className="muted">
          Справочные коэффициенты равны 1 / историческая цена Polymarket. Исполнимая цена заявки в
          момент PRE или POST хранится отдельно в прогнозе, если трекер её зафиксировал.
        </p>
      )}
    </div>
  )
}
