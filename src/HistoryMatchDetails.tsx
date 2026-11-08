import { type ArchiveMatch, formatPrice, heroDisplayName } from "./archive"
import { criterionLabels } from "./criteria"
import { percent, time } from "./domain"
import { type CompletedMatch, minutes } from "./reporting"

function durationError(predicted: number | undefined, actual: number | null) {
  if (predicted == null || actual == null) return "—"
  const delta = (predicted - actual) / 60
  return `${(delta > 0 ? "+" : "") + delta.toFixed(1)} мин`
}

export function HistoryMatchDetails({
  match,
  archive,
  heroes,
}: {
  readonly match: CompletedMatch
  readonly heroes: readonly string[]
  readonly archive: ArchiveMatch | undefined
}) {
  const criteria = [
    ...new Set([
      ...Object.keys(match.pre?.criteria ?? {}),
      ...Object.keys(match.post?.criteria ?? {}),
    ]),
  ]
  const pre = match.pre?.probability_team_a
  const post = match.post?.probability_team_a
  const delta = pre == null || post == null ? null : (post - pre) * 100
  return (
    <section
      id={`match-details-${match.match_id}`}
      className="history-detail"
      aria-label="Разбор карты"
    >
      <div className="history-detail-header">
        <div>
          <h3>Сравнение прогнозов</h3>
          <p className="muted">
            Факт · {match.winner ?? "Победитель неизвестен"} · {minutes(match.duration_seconds)}
          </p>
        </div>
        <span className="badge">
          {match.in_model_history === null
            ? "Пересечение с обучением неизвестно"
            : match.in_model_history
              ? "Карта в истории модели"
              : "Вне истории модели"}
        </span>
      </div>
      <dl className="history-metrics">
        <div>
          <dt>{match.team_a} · PRE → POST</dt>
          <dd>
            {percent(pre)} → {percent(post)}
          </dd>
        </div>
        <div>
          <dt>{match.team_b} · PRE → POST</dt>
          <dd>
            {percent(pre == null ? null : 1 - pre)} → {percent(post == null ? null : 1 - post)}
          </dd>
        </div>
        <div>
          <dt>Сдвиг · {match.team_a}</dt>
          <dd>{delta == null ? "—" : `${(delta > 0 ? "+" : "") + delta.toFixed(2)} п.п.`}</dd>
        </div>
        <div>
          <dt>Отклонение длительности · PRE / POST</dt>
          <dd>
            {durationError(match.pre?.duration_seconds, match.duration_seconds)} /{" "}
            {durationError(match.post?.duration_seconds, match.duration_seconds)}
          </dd>
        </div>
      </dl>
      {archive && (
        <>
          <p className="muted">
            Игроки и герои этой карты из архива. Текущий состав команды здесь не подставляется.
          </p>
          <div className="two-columns archive-draft">
            {[
              { team: match.team_a, picks: archive.picksA },
              { team: match.team_b, picks: archive.picksB },
            ].map(({ team, picks }) => (
              <div key={team}>
                <h3>Драфт · {team}</h3>
                <ol>
                  {picks.map(([player, hero]) => (
                    <li key={player}>
                      <strong>{player}</strong>
                      <span>{heroDisplayName(hero, heroes)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <div className="archive-prices">
            <h3>Архивные коэффициенты</h3>
            <div className="two-columns">
              <div>
                <strong>
                  {match.team_a} {formatPrice(archive.priceA)} · {match.team_b}{" "}
                  {formatPrice(archive.priceB)}
                </strong>
                <p className="muted">
                  {archive.winnerSource ?? "Источник не указан"} · {time(archive.winnerTime)}
                </p>
                {archive.winnerUrl?.startsWith("https://") && (
                  <a href={archive.winnerUrl} target="_blank" rel="noreferrer">
                    Источник победителя ↗
                  </a>
                )}
              </div>
              <div>
                <strong>
                  {archive.line == null
                    ? "Тотал · нет линии"
                    : archive.line +
                      " мин · Б " +
                      formatPrice(archive.over) +
                      " / М " +
                      formatPrice(archive.under)}
                </strong>
                <p className="muted">
                  {archive.totalSource ?? "Источник не указан"} · {time(archive.totalTime)}
                </p>
                {archive.totalUrl?.startsWith("https://") && (
                  <a href={archive.totalUrl} target="_blank" rel="noreferrer">
                    Источник тотала ↗
                  </a>
                )}
              </div>
            </div>
            <p className="muted">
              Фаза драфта{" "}
              {archive.phase && archive.phase !== "unknown" ? archive.phase : "не подтверждена"}.
            </p>
          </div>
        </>
      )}
      {criteria.length > 0 && (
        <div className="archive-criteria">
          <h3>Факторы модели</h3>
          <p className="muted">
            Положительное значение в пользу {match.team_a}, отрицательное — в пользу {match.team_b}.
            Значения в логитах.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Фактор</th>
                <th scope="col">PRE</th>
                <th scope="col">POST</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((key) => (
                <tr key={key}>
                  <th scope="row">{criterionLabels[key] ?? key}</th>
                  <td className="numeric">{match.pre?.criteria[key]?.toFixed(4) ?? "—"}</td>
                  <td className="numeric">{match.post?.criteria[key]?.toFixed(4) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {match.source_url.startsWith("https://") && (
        <a href={match.source_url} target="_blank" rel="noreferrer">
          Источник результата ↗
        </a>
      )}
    </section>
  )
}
