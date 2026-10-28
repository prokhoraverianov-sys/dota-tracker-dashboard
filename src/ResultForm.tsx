import { useState } from "react"
import { type Api, ApiError } from "./api"
import { type MapDTO, mapSchema, message, resultSchema } from "./contracts"
import { Notice } from "./ui"
export function ResultForm({
  map,
  api,
  onSaved,
  onRefresh,
}: {
  readonly map: MapDTO
  readonly api: Api
  readonly onSaved: (map: MapDTO) => void
  readonly onRefresh: (map: MapDTO) => void
}) {
  const [winner, setWinner] = useState("A")
  const [duration, setDuration] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState<{ body: string; key: string } | null>(null)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    const body = { expected_revision: map.revision, winner, duration, confirmed }
    const serialized = JSON.stringify(body)
    const key = retry?.body === serialized ? retry.key : crypto.randomUUID()
    setRetry({ body: serialized, key })
    setBusy(true)
    setError("")
    try {
      const result = await api.request(`/maps/${map.map_id}/result`, resultSchema, body, key)
      onSaved(result.map)
    } catch (err) {
      setError(message(err))
      if (err instanceof ApiError && err.status === 409) {
        try {
          onRefresh(await api.request(`/maps/${map.map_id}`, mapSchema))
        } catch (refreshError) {
          setError(message(refreshError))
        }
      }
    } finally {
      setBusy(false)
    }
  }
  if (map.result)
    return (
      <section className="panel result-saved">
        <span className="badge good">Результат подтверждён</span>
        <h2>
          {map.result.winner === "A" ? map.team_a : map.team_b} ·{" "}
          {Math.floor(map.result.duration_seconds / 60)}:
          {String(map.result.duration_seconds % 60).padStart(2, "0")}
        </h2>
        <p className="muted">
          Карта завершена. Прогнозы, составы и результат доступны только для чтения.
        </p>
      </section>
    )
  return (
    <details className="panel result-form">
      <summary>Записать результат карты</summary>
      <p className="muted">
        Укажите фактический результат. После подтверждения карта станет доступна только для чтения.
      </p>
      <form onSubmit={save}>
        <div className="two-columns">
          <label>
            Победитель
            <select value={winner} onChange={(e) => setWinner(e.target.value)}>
              <option value="A">{map.team_a}</option>
              <option value="B">{map.team_b}</option>
            </select>
          </label>
          <label>
            Длительность, ММ:СС
            <input
              required
              pattern="[0-9]{1,3}:[0-5][0-9]"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="43:10"
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Подтверждаю победителя и время. Результат нельзя перезаписать.
        </label>
        {error && <Notice error>{error}</Notice>}
        <button
          className="secondary"
          disabled={!confirmed || busy || map.map_id === null}
          type="submit"
        >
          {busy ? "Сохраняем…" : "Подтвердить результат"}
        </button>
        {map.map_id === null && (
          <p className="muted">Сначала сохраните прогноз или подготовьте карту.</p>
        )}
      </form>
    </details>
  )
}
