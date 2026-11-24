import { useState } from "react"
import type { Api } from "./api"
import type { Catalog } from "./contracts"
import { SavedStats } from "./SavedStats"
import { mainTournament, TournamentPicker } from "./TournamentPicker"
import { TournamentStats } from "./TournamentStats"
import { TrackedReport } from "./TrackedReport"
import { Header } from "./ui"
import "./history-presentation.css"
export function StatsPage({
  api,
  catalog,
  tournament,
  navigate,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly tournament: string
  readonly navigate: (path: string) => void
}) {
  const [view, setView] = useState<"tournament" | "saved" | "archive">("tournament")
  const selected = tournament || mainTournament
  return (
    <div className="report-view statistics-view">
      <Header title="Статистика" subtitle="Результаты карт и точность прогнозов PRE и POST." />
      <TournamentPicker
        api={api}
        value={selected}
        onChange={(key) => navigate(`/stats?tournament=${encodeURIComponent(key)}`)}
      />
      <fieldset className="view-tabs" aria-label="Выбор данных">
        <button
          type="button"
          className="secondary"
          aria-pressed={view === "tournament"}
          onClick={() => setView("tournament")}
        >
          Карты турнира
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={view === "saved"}
          onClick={() => setView("saved")}
        >
          Архив моделей · все турниры
        </button>
        {selected === "pari-universe" && (
          <button
            type="button"
            className="secondary"
            aria-pressed={view === "archive"}
            onClick={() => setView("archive")}
          >
            Ретроспективный разбор PARI
          </button>
        )}
      </fieldset>
      {view === "tournament" ? (
        <TrackedReport key={selected} api={api} tournament={selected} stats />
      ) : view === "archive" ? (
        <TournamentStats api={api} catalog={catalog} />
      ) : (
        <SavedStats api={api} />
      )}
    </div>
  )
}
