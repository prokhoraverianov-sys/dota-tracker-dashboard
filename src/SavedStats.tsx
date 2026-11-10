import { useEffect, useState } from "react"
import { z } from "zod"
import type { Api } from "./api"
import { message } from "./contracts"
import { Empty, Header, Notice } from "./ui"

const numeric = z.union([z.string(), z.number()]).nullable()
const statsSchema = z.object({
  items: z.array(
    z.object({
      stage: z.string(),
      engine: z.string(),
      model_version: z.string().nullable(),
      artifact_sha256: z.string().nullable().optional(),
      validation_status: z.string().nullable(),
      maps: z.number(),
      winner_scored: z.number(),
      winner_correct: z.number(),
      winner_accuracy: numeric,
      duration_scored: z.number(),
      duration_mae_seconds: numeric,
      total_scored: z.number(),
      total_hits: z.number(),
      total_pushes: z.number(),
      total_accuracy: numeric,
    }),
  ),
})
export function SavedStats({ api }: { readonly api: Api }) {
  const [data, setData] = useState<z.infer<typeof statsSchema> | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    api
      .request("/stats", statsSchema)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
    return () => {
      active = false
    }
  }, [api])
  return (
    <>
      <Header
        title="Сохранённые прогнозы"
        subtitle="Только прогнозы, сохранённые вручную через бот или dashboard. Это другая выборка, чем история турнира."
      />
      <Notice>
        Эта история не является проспективной проверкой. Поздние расчёты и карты из обучающей
        истории могут присутствовать в выборке.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      {data?.items.map((row) => (
        <section
          className="panel stats-panel saved-stats-panel"
          key={`${row.stage}-${row.engine}-${row.model_version}`}
        >
          <div className="panel-heading">
            <div>
              <span className="stage">{row.stage === "pre_match" ? "PRE" : "POST"}</span>
              <h2>{row.model_version}</h2>
              <p className="muted">
                {row.engine} · {row.validation_status}
              </p>
            </div>
            <span className="badge">{row.maps} карт в истории</span>
          </div>
          <div className="stats-metrics">
            <div>
              <span>Победитель</span>
              <strong>
                {row.winner_accuracy == null
                  ? "Нет оценки"
                  : `${(Number(row.winner_accuracy) * 100).toFixed(1)}%`}
              </strong>
              <small>
                {row.winner_correct} верных / {row.winner_scored} оценённых
              </small>
            </div>
            <div>
              <span>Ошибка длительности · MAE</span>
              <strong>
                {row.duration_mae_seconds == null
                  ? "Нет оценки"
                  : `${(Number(row.duration_mae_seconds) / 60).toFixed(1)} мин`}
              </strong>
              <small>{row.duration_scored} карт с прогнозом и результатом</small>
            </div>
            <div>
              <span>Тотал</span>
              <strong>
                {row.total_accuracy == null
                  ? "Нет оценки"
                  : `${(Number(row.total_accuracy) * 100).toFixed(1)}%`}
              </strong>
              <small>
                {row.total_hits} попаданий / {row.total_scored} оценённых · {row.total_pushes}{" "}
                возвратов
              </small>
            </div>
          </div>
        </section>
      ))}
      {data?.items.length === 0 && (
        <Empty title="Для статистики пока нет данных">
          Она появится после сохранения прогнозов и результатов.
        </Empty>
      )}
      {!data && !error && <Empty title="Загружаем статистику…" />}
    </>
  )
}
