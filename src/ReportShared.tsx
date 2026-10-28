import type { Catalog } from "./contracts"
import { time } from "./domain"
import { type Provenance, type ReportFilters, sheetUrl } from "./reporting"
export function ReportToolbar({
  catalog,
  filters,
  onChange,
}: {
  readonly catalog: Catalog
  readonly filters: ReportFilters
  readonly onChange: (filters: ReportFilters) => void
}) {
  return (
    <section className="toolbar">
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
          onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
        />
      </label>
      <label>
        По дату
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
        />
      </label>
    </section>
  )
}
export function ReportProvenance({ data }: { readonly data: Provenance }) {
  return (
    <div className="report-provenance">
      <div className="report-links">
        <a href={sheetUrl} target="_blank" rel="noreferrer">
          Открыть исходную Google-таблицу ↗
        </a>
        <span className="muted">Обновлено: {time(data.as_of_utc)} UTC+7</span>
      </div>
      <p className="muted">
        Исходный срез: {data.analytical_maps} карт с ретроспективными PRE / POST.
      </p>
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
