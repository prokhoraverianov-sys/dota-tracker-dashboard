import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import type { Api } from "./api"
import { type MapDTO, message } from "./contracts"
import { OddsComparison } from "./OddsComparison"
import { type Odds, oddsSchema, providerQuotes } from "./odds"
import { Notice } from "./ui"

export function CurrentOdds({ map, api }: { readonly map: MapDTO; readonly api: Api }) {
  const [data, setData] = useState<Odds | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh button triggers a new request.
  useEffect(() => {
    if (!map.series_id || !map.map_number) return
    let active = true
    let pending = false
    const path = `/series/${encodeURIComponent(map.series_id)}/maps/${map.map_number}/odds`
    async function load(manual: boolean) {
      if (pending) return
      pending = true
      if (manual) setBusy(true)
      try {
        const value = await api.request(path, oddsSchema)
        if (active) {
          setData(value)
          setError("")
        }
      } catch (err) {
        if (active) setError(message(err))
      } finally {
        pending = false
        if (active) setBusy(false)
      }
    }
    function refreshVisible() {
      if (document.visibilityState === "visible") void load(false)
    }
    void load(true)
    const timer = window.setInterval(refreshVisible, 15_000)
    document.addEventListener("visibilitychange", refreshVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshVisible)
    }
  }, [api, map.series_id, map.map_number, refresh])
  if (!map.series_id || !map.map_number) return null
  return (
    <section className="panel current-odds" aria-busy={busy}>
      <div className="panel-heading">
        <div>
          <h2>Коэффициенты карты · все источники</h2>
          <p className="muted">
            Последний снимок каждого источника. Победа относится к этой карте, тотал — к её
            длительности в минутах. Цены сохранённых расчётов указаны в PRE и POST.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} />
          {busy ? "Загружаем…" : "Обновить снимки"}
        </button>
      </div>
      {error && (
        <Notice error>
          {data && "Обновление не удалось. Последний снимок может устареть. "}
          {error}
        </Notice>
      )}
      {busy && !data && <p className="odds-loading muted">Загружаем котировки источников…</p>}
      {data && (
        <OddsComparison
          quotes={providerQuotes(data)}
          teamA={map.team_a}
          teamB={map.team_b}
          mapNumber={map.map_number}
        />
      )}
    </section>
  )
}
