import type { Candidate } from "./contracts"

export function selectionLabel(candidate: Candidate, teamA: string, teamB: string): string {
  switch (candidate.market) {
    case "winner":
      return candidate.selection === "A"
        ? teamA
        : candidate.selection === "B"
          ? teamB
          : candidate.selection
    case "duration_over":
      return `Больше ${candidate.line_minutes ?? "?"} мин`
    case "duration_under":
      return `Меньше ${candidate.line_minutes ?? "?"} мин`
  }
}

export function OddsTable({
  candidates,
  teamA,
  teamB,
}: {
  readonly candidates: readonly Candidate[]
  readonly teamA: string
  readonly teamB: string
}) {
  if (candidates.length === 0) return <p className="muted">Коэффициенты не сохранены.</p>
  return (
    <div className="table-scroll">
      <table className="odds-table">
        <caption>Коэффициенты на момент расчёта</caption>
        <thead>
          <tr>
            <th>Исход</th>
            <th>Коэффициент</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate, index) => (
            <tr
              key={`${candidate.market}-${candidate.selection}-${candidate.line_minutes}-${index}`}
            >
              <td>{selectionLabel(candidate, teamA, teamB)}</td>
              <td className="numeric">{candidate.odds.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
