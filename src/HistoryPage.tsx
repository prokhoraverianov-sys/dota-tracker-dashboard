import { useState } from "react"
import type { Api } from "./api"
import { CompletedHistory } from "./CompletedHistory"
import type { Catalog } from "./contracts"
import { ForecastArchive } from "./ForecastArchive"
import { mainTournament, TournamentPicker } from "./TournamentPicker"
import { TrackedReport } from "./TrackedReport"
import { Header } from "./ui"
import "./history-presentation.css"
export function HistoryPage({
  api,
  catalog,
  navigate,
  initialSearch,
  tournament,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (path: string) => void
  readonly initialSearch: string
  readonly tournament: string
}) {
  const [view, setView] = useState<"matches" | "archive" | "pari">("matches")
  const selected = tournament || mainTournament
  return (
    <div className="report-view history-view">
      <Header title="История" subtitle="Карты, результаты и архив прогнозов." />
      <TournamentPicker
        api={api}
        value={selected}
        onChange={(key) => navigate(`/history?tournament=${encodeURIComponent(key)}`)}
      />
      <fieldset className="view-tabs" aria-label="Вид истории">
        <button
          type="button"
          className="secondary"
          aria-pressed={view === "matches"}
          onClick={() => setView("matches")}
        >
          Матчи турнира
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={view === "archive"}
          onClick={() => setView("archive")}
        >
          Архив прогнозов · все турниры
        </button>
        {selected === "pari-universe" && (
          <button
            type="button"
            className="secondary"
            aria-pressed={view === "pari"}
            onClick={() => setView("pari")}
          >
            Ретроспективный разбор PARI
          </button>
        )}
      </fieldset>
      {view === "matches" ? (
        <TrackedReport
          key={selected}
          api={api}
          tournament={selected}
          initialSearch={initialSearch}
          stats={false}
        />
      ) : view === "pari" ? (
        <CompletedHistory api={api} catalog={catalog} initialSearch={initialSearch} />
      ) : (
        <ForecastArchive api={api} catalog={catalog} navigate={navigate} />
      )}
    </div>
  )
}
