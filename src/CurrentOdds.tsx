import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { ArchivedPrices } from "./ArchivedPrices"
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
  const finished = !!map.result || map.play_status === "unplayed"
  // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh button triggers a new request.
  useEffect(() => {
    if (!map.series_id || !map.map_number || map.play_status === "unplayed") return
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
    const timer = finished ? undefined : window.setInterval(refreshVisible, 15_000)
    if (!finished) document.addEventListener("visibilitychange", refreshVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshVisible)
    }
  }, [api, map.series_id, map.map_number, map.play_status, finished, refresh])
  if (!map.series_id || !map.map_number || map.play_status === "unplayed") return null
  return (
    <section className="panel current-odds" aria-busy={busy}>
      <div className="panel-heading">
        <div>
          <h2>{finished ? "Коэффициенты карты" : "Текущие коэффициенты"}</h2>
          <p className="muted">
            {finished
              ? "Источники, время и рынок каждой цены."
              : "Победа и тотал длительности по рынкам этой карты."}
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} />
          {busy ? "Загружаем…" : "Обновить котировки"}
        </button>
      </div>
      <ArchivedPrices map={map} beforeStart={data?.before_start_providers} />
      {error && (
        <Notice error>
          {data && "Обновление не удалось. Последний снимок может устареть. "}
          {error}
        </Notice>
      )}
      {busy && !data && <p className="odds-loading muted">Загружаем котировки источников…</p>}
      {data && !finished && (
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
