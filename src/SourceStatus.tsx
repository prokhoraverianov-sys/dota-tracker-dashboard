import { Activity } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import type { Api } from "./api"
import { message } from "./contracts"
import { time } from "./domain"

const healthSchema = z.object({
  status: z.enum(["ready", "empty", "stale", "unsupported", "failure"]),
  checked_at_utc: z.string().nullable(),
  notice: z.string(),
})
const statusSchema = z.object({
  model: healthSchema,
  source: healthSchema,
  polling_enabled: z.boolean(),
  polling_active: z.boolean(),
})
const labels = {
  ready: "готов",
  empty: "нет данных",
  stale: "устарел",
  unsupported: "не поддерживается",
  failure: "недоступен",
} as const
export function SourceStatus({ api }: { readonly api: Api }) {
  const [error, setError] = useState("")
  const [data, setData] = useState<z.infer<typeof statusSchema> | null>(null)
  useEffect(() => {
    let active = true
    async function refresh() {
      if (document.hidden) return
      try {
        const value = await api.request("/status", statusSchema)
        if (active) {
          setData(value)
          setError("")
        }
      } catch (err) {
        if (active) setError(message(err))
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [api])
  return (
    <div className="source-strip">
      <Activity size={15} />
      {error ? (
        <strong className="warning-text">Проверка состояния недоступна</strong>
      ) : data ? (
        <>
          <strong>Модель: {labels[data.model.status]}</strong>
          <span>· Источник: {labels[data.source.status]}</span>
        </>
      ) : (
        <strong>Проверяем источники…</strong>
      )}
      <details>
        <summary>Состояние данных</summary>
        <div className="source-details">
          {error ? (
            <p className="warning-text">{error}</p>
          ) : data ? (
            <>
              <p>
                <strong>Модель: {labels[data.model.status]}</strong> ·{" "}
                {time(data.model.checked_at_utc)}
              </p>
              <p>{data.model.notice}</p>
              <p>
                <strong>Источник: {labels[data.source.status]}</strong> ·{" "}
                {time(data.source.checked_at_utc)}
              </p>
              <p>{data.source.notice}</p>
              <p>
                Telegram-бот:{" "}
                {data.polling_active
                  ? "активно"
                  : data.polling_enabled
                    ? "ожидает запуска"
                    : "отключено"}
              </p>
            </>
          ) : (
            <p>Состояние ещё не получено.</p>
          )}
          <p>Кэш сервера проверяется каждые 30 секунд, пока вкладка открыта.</p>
        </div>
      </details>
    </div>
  )
}
