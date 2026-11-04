import { useState } from "react"
import type { Api } from "./api"
import { CompletedHistory } from "./CompletedHistory"
import type { Catalog } from "./contracts"
import { ForecastArchive } from "./ForecastArchive"
import { Header } from "./ui"
export function HistoryPage({
  api,
  catalog,
  navigate,
  initialSearch,
}: {
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (path: string) => void
  readonly initialSearch: string
}) {
  const [view, setView] = useState<"matches" | "archive">("matches")
  return (
    <>
      <Header title="История" subtitle="Отчёт PARI Universe и архив сохранённых прогнозов." />
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
          Архив прогнозов
        </button>
      </fieldset>
      {view === "matches" ? (
        <CompletedHistory api={api} catalog={catalog} initialSearch={initialSearch} />
      ) : (
        <ForecastArchive api={api} catalog={catalog} navigate={navigate} />
      )}
    </>
  )
}
