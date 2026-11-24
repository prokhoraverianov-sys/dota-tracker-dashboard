import { useEffect, useState } from "react"
import type { Api } from "./api"
import { scheduleSchema } from "./contracts"
import { PLAY_IN_KEY, PLAY_IN_NAME } from "./playin-data"

export const mainTournament = "1win-essence-3"
const known = [
  { key: mainTournament, name: "1win Essence III" },
  { key: "pari-universe", name: "PARI Universe" },
  { key: PLAY_IN_KEY, name: PLAY_IN_NAME },
]

export function TournamentPicker({
  api,
  value,
  onChange,
}: {
  readonly api: Pick<Api, "request">
  readonly value: string
  readonly onChange: (key: string) => void
}) {
  const [options, setOptions] = useState(known)
  const [warning, setWarning] = useState("")
  useEffect(() => {
    let active = true
    // The catalogue is independent of the date filter. Avoid requesting every PARI card for it.
    api
      .request("/schedule?date=1970-01-01", scheduleSchema.pick({ tournaments: true }))
      .then(({ tournaments }) => {
        if (!active) return
        if (tournaments?.length) setOptions(tournaments)
      })
      .catch(() => {
        if (active) setWarning("Каталог турниров недоступен. Показаны ранее известные турниры.")
      })
    return () => {
      active = false
    }
  }, [api])
  return (
    <>
      <fieldset className="view-tabs tournament-tabs" aria-label="Турнир">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className="secondary"
            aria-pressed={value === option.key}
            onClick={() => onChange(option.key)}
          >
            {option.name}
          </button>
        ))}
      </fieldset>
      {warning && (
        <p className="muted" aria-live="polite">
          {warning}
        </p>
      )}
    </>
  )
}
