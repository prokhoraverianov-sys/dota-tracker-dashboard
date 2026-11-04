import { useState } from "react"
import type { Api } from "./api"
import type { Catalog } from "./contracts"
import { SavedStats } from "./SavedStats"
import { TournamentStats } from "./TournamentStats"
import { Header } from "./ui"
export function StatsPage({ api, catalog }: { readonly api: Api; readonly catalog: Catalog }) {
  const [view, setView] = useState<"tournament" | "saved">("tournament")
  return (
    <>
      <Header
        title="Статистика"
        subtitle="Точность PRE и POST, длительность и разрезы турнира. Отдельно — статистика сохранённых прогнозов."
      />
      <fieldset className="view-tabs" aria-label="Выбор данных">
        <button
          type="button"
          className="secondary"
          aria-pressed={view === "tournament"}
          onClick={() => setView("tournament")}
        >
          PARI Universe · турнир
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={view === "saved"}
          onClick={() => setView("saved")}
        >
          Только сохранённые прогнозы
        </button>
      </fieldset>
      {view === "tournament" ? (
        <TournamentStats api={api} catalog={catalog} />
      ) : (
        <SavedStats api={api} />
      )}
    </>
  )
}
