import { useId } from "react"
import { time } from "./domain"
import type { BracketMatch } from "./playoff-bracket"
import { TeamIdentity } from "./VisualIdentity"
import "./playoff-bracket.css"

const statusLabels = {
  scheduled: "Ожидается",
  playing: "Идёт",
  finished: "Завершён",
} as const

function MatchCard({ match }: { readonly match: BracketMatch }) {
  return (
    <div
      className="playoff-bracket-slot"
      data-lane={match.lane}
      data-round={match.round}
      data-position={match.position}
    >
      <article
        className="playoff-bracket-match"
        aria-label={match.title}
        data-match-id={match.id}
        data-status={match.status}
      >
        <header className="playoff-match-heading">
          <h4>{match.shortTitle}</h4>
          <span className="playoff-match-format">BO{match.bestOf}</span>
        </header>
        <div className="playoff-match-teams">
          {match.teams.map((team, index) => (
            <div
              className="playoff-match-team"
              data-winner={team.winner}
              key={index === 0 ? "team-a" : "team-b"}
            >
              {team.winner && <span className="playoff-bracket-sr-only">Победитель </span>}
              {team.name ? (
                <TeamIdentity name={team.name} size="sm" />
              ) : (
                <span className="playoff-team-source">{team.source ?? "Команда уточняется"}</span>
              )}
              {(team.name || team.score !== null) && (
                <strong className="playoff-team-score" aria-hidden={team.score === null}>
                  {team.score ?? "–"}
                </strong>
              )}
            </div>
          ))}
        </div>
        <div className="playoff-match-details">
          <time dateTime={match.startsAt}>{time(match.startsAt)}</time>
          <span className="playoff-match-status">{statusLabels[match.status]}</span>
        </div>
        {match.maps.length > 0 && (
          <div className="playoff-match-maps">
            <span>Карты</span>
            {match.maps.map((map) => (
              <a key={map.number} href={map.href} aria-label={`Карта ${map.number}`}>
                {map.number}
              </a>
            ))}
          </div>
        )}
      </article>
    </div>
  )
}

export function PlayoffBracket({ matches }: { readonly matches: readonly BracketMatch[] }) {
  const heading = useId()

  return (
    <section className="panel playoff-bracket" aria-labelledby={heading}>
      <div className="panel-heading playoff-bracket-heading">
        <h2 id={heading}>Сетка плей-офф</h2>
        <span className="playoff-bracket-scroll-hint">Листайте вправо →</span>
      </div>
      <section
        className="playoff-bracket-scroll"
        aria-label="Раунды плей-офф"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Make the scroll region keyboard accessible.
        tabIndex={0}
      >
        <div className="playoff-bracket-layout">
          <h3 className="playoff-lane-heading" data-lane="upper">
            Верхняя сетка
          </h3>
          {matches
            .filter((match) => match.lane === "upper")
            .map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          <h3 className="playoff-lane-heading" data-lane="lower">
            Нижняя сетка
          </h3>
          {matches
            .filter((match) => match.lane !== "upper")
            .map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
        </div>
      </section>
    </section>
  )
}
