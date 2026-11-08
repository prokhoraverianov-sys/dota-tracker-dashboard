import { useId, useState } from "react"
import type { Catalog, Draft, MapDTO } from "./contracts"
import { parseBulk, positions } from "./domain"
import { Notice } from "./ui"
export function DraftEditor({
  map,
  draft,
  catalog,
  onChange,
  disabled,
}: {
  readonly map: MapDTO
  readonly draft: Draft
  readonly catalog: Catalog
  readonly onChange: (draft: Draft) => void
  readonly disabled: boolean
}) {
  const heroesId = useId()
  const [bulk, setBulk] = useState({ team_a: "", team_b: "" })
  const [error, setError] = useState("")
  function change(
    side: "team_a" | "team_b",
    field: "players" | "heroes",
    index: number,
    value: string,
  ) {
    onChange({
      ...draft,
      [side]: {
        ...draft[side],
        [field]: draft[side][field].map((old, i) => (i === index ? value : old)),
        ...(field === "players" && value !== draft[side].players[index]
          ? { heroes: draft[side].heroes.map((hero, i) => (i === index ? "" : hero)) }
          : {}),
      },
    })
  }
  function paste(side: "team_a" | "team_b") {
    const heroes = parseBulk(bulk[side], catalog.heroes)
    if (!heroes) {
      setError("Укажите ровно пять героев из каталога, через запятую или с новой строки.")
      return
    }
    setError("")
    onChange({ ...draft, [side]: { ...draft[side], heroes } })
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Составы и драфт</h2>
          <p className="muted">
            Позиции 1–5 фиксированы. При смене игрока выберите его героя заново.
          </p>
        </div>
        <span className="badge">{disabled ? "Только чтение" : "Черновик"}</span>
      </div>
      {error && <Notice error>{error}</Notice>}
      <datalist id={heroesId}>
        {catalog.heroes.map((hero) => (
          <option key={hero} value={hero} />
        ))}
      </datalist>
      <div className="lineups">
        {(["team_a", "team_b"] as const).map((side) => (
          <fieldset key={side} disabled={disabled}>
            <legend>
              <span className={`team-dot ${side}`} />
              {map[side]}
            </legend>
            <div className="lineup-labels">
              <span>ПОЗ.</span>
              <span>ИГРОК / ЗАМЕНА</span>
              <span>ГЕРОЙ</span>
            </div>
            {positions.map((position, index) => (
              <div className="lineup-row" key={position}>
                <span className="position">{position}</span>
                <input
                  aria-label={`${map[side]} игрок ${position}`}
                  value={draft[side].players[index] ?? ""}
                  onChange={(e) => change(side, "players", index, e.target.value)}
                  placeholder="Игрок"
                  list={`players-${side}`}
                />
                <input
                  aria-label={`${map[side]} герой ${position}`}
                  value={draft[side].heroes[index] ?? ""}
                  onChange={(e) => change(side, "heroes", index, e.target.value)}
                  placeholder="Поиск героя"
                  list={heroesId}
                />
              </div>
            ))}
            <datalist id={`players-${side}`}>
              {catalog.teams
                .find((team) => team.name === map[side])
                ?.players.map((player) => (
                  <option key={player} value={player} />
                ))}
            </datalist>
            {!disabled && (
              <details className="bulk">
                <summary>Вставить пять героев сразу</summary>
                <label>
                  Герои по позициям 1–5
                  <textarea
                    value={bulk[side]}
                    onChange={(e) => setBulk({ ...bulk, [side]: e.target.value })}
                    placeholder="Герой 1, Герой 2, …"
                  />
                </label>
                <button type="button" className="secondary" onClick={() => paste(side)}>
                  Применить к {map[side]}
                </button>
              </details>
            )}
          </fieldset>
        ))}
      </div>
    </section>
  )
}
