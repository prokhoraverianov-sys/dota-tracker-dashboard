import type { ReactNode } from "react"
import type { Catalog } from "./contracts"
import { time } from "./domain"
import { emptyFilters, type Provenance, type ReportFilters, sheetUrl } from "./reporting"
export function ReportToolbar({
  catalog,
  filters,
  onChange,
  children,
}: {
  readonly catalog: Catalog
  readonly filters: ReportFilters
  readonly onChange: (filters: ReportFilters) => void
  readonly children?: ReactNode
}) {
  return (
    <section className="toolbar report-filters" aria-label="Фильтры отчёта">
      {children}
      <details className="optional-filters">
        <summary>
          {filters.team || filters.date_from || filters.date_to
            ? "Фильтры применены"
            : "Фильтры отчёта"}
        </summary>
        <div className="optional-filter-fields">
          <label>
            Команда
            <select
              value={filters.team}
              onChange={(e) => onChange({ ...filters, team: e.target.value })}
            >
              <option value="">Все команды</option>
              {catalog.teams.map((team) => (
                <option key={team.name}>{team.name}</option>
              ))}
            </select>
          </label>
          <label>
            С даты
            <input
              type="date"
              value={filters.date_from}
              max={filters.date_to || undefined}
              onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
            />
          </label>
          <label>
            По дату
            <input
              type="date"
              value={filters.date_to}
              min={filters.date_from || undefined}
              onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
            />
          </label>
          {(filters.team || filters.date_from || filters.date_to) && (
            <button type="button" className="secondary" onClick={() => onChange(emptyFilters)}>
              Сбросить фильтры
            </button>
          )}
        </div>
      </details>
    </section>
  )
}
export function ReportProvenance({ data }: { readonly data: Provenance }) {
  return (
    <div className="report-provenance">
      <div className="report-links">
        <a
          href={data.sheet_url.startsWith("https://docs.google.com/") ? data.sheet_url : sheetUrl}
          target="_blank"
          rel="noreferrer"
        >
          Открыть исходную Google-таблицу ↗
        </a>
        <span className="muted">Обновлено: {time(data.as_of_utc)} UTC+7</span>
      </div>
      <details>
        <summary>Какие данные входят в сравнение</summary>
        <p className="muted">{data.notice}</p>
        <p className="muted">
          Ретроспективный расчёт: {data.analytical_maps} карт. Из них {data.history_overlap_maps}{" "}
          присутствуют в истории модели. Это сопоставление с исходной таблицей, не результаты
          будущих ставок.
        </p>
        <p className="footnote">Модель: {data.model_version}</p>
      </details>
    </div>
  )
}
