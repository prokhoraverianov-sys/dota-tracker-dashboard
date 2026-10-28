import { LockKeyhole, Swords } from "lucide-react"
import { useState } from "react"
import type { Api } from "./api"
import { message, type Session, sessionSchema } from "./contracts"
import { Notice } from "./ui"
export function Login({
  api,
  onLogin,
  notice,
}: {
  readonly api: Api
  readonly onLogin: (session: Session) => void
  readonly notice: string
}) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const session = await api.request("/auth/login", sessionSchema, { password })
      setPassword("")
      onLogin(session)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <span className="brand-mark">
          <Swords size={26} />
        </span>
        <p className="eyebrow">DOTA TRACKER</p>
        <h1>Войти в аналитику</h1>
        <p className="muted">
          Расписание, составы и сравнение PRE / POST в одном рабочем пространстве.
        </p>
        {notice && <Notice>{notice}</Notice>}
        <form onSubmit={submit}>
          <label>
            Пароль доступа
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="primary full" type="submit" disabled={busy}>
            <LockKeyhole size={17} />
            {busy ? "Подключаемся…" : "Войти"}
          </button>
        </form>
        <p className="footnote">Защищённая сессия · пароль не сохраняется</p>
        <details>
          <summary>Подключение к серверу</summary>
          <p className="mono endpoint">{api.origin}</p>
          <p className="muted">Адрес задаётся в публичном config.json сайта.</p>
        </details>
      </div>
    </main>
  )
}
