import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Api, loadConfig, loadPublicAccess, readSession, storeSession } from "./api"
import { type Catalog, catalogSchema, message, type Session } from "./contracts"
import { HistoryPage } from "./HistoryPage"
import { Login } from "./Login"
import { MapPage } from "./MapPage"
import { Schedule } from "./Schedule"
import { SourceStatus } from "./SourceStatus"
import { StatsPage } from "./StatsPage"
import { Empty, Notice, Shell } from "./ui"
export function App() {
  const [publicAccess, setPublicAccess] = useState(false)
  const [origin, setOrigin] = useState("")
  const [configError, setConfigError] = useState("")
  const [session, setSession] = useState(readSession)
  const sessionRef = useRef<Session | null>(session)
  const [notice, setNotice] = useState("")
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState("")
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/schedule")
  const dirty = useRef(false)
  const previous = useRef(route)
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value
  }, [])
  const expire = useCallback(() => {
    sessionRef.current = null
    storeSession(null)
    setSession(null)
    setNotice("Сессия завершена. Войдите снова; локальный черновик сохранён.")
  }, [])
  const api = useMemo(() => new Api(origin, () => sessionRef.current, expire), [origin, expire])
  useEffect(() => {
    loadConfig()
      .then(async (value) => {
        const isPublic = await loadPublicAccess(value)
        setPublicAccess(isPublic)
        if (isPublic) {
          sessionRef.current = null
          storeSession(null)
          setSession(null)
        }
        setOrigin(value)
      })
      .catch((err) => setConfigError(message(err)))
  }, [])
  useEffect(() => {
    if (!origin || (!session && !publicAccess)) return
    let active = true
    setCatalogError("")
    api
      .request("/catalog", catalogSchema)
      .then((value) => {
        if (active) setCatalog(value)
      })
      .catch((err) => {
        if (active) setCatalogError(message(err))
      })
    return () => {
      active = false
    }
  }, [api, origin, session, publicAccess])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    const change = () => {
      const next = window.location.hash.slice(1) || "/schedule"
      if (next === previous.current) return
      if (
        dirty.current &&
        !window.confirm(
          "Есть несохранённый черновик. Покинуть карту? Он останется в этом браузере.",
        )
      ) {
        history.replaceState(null, "", `#${previous.current}`)
        return
      }
      previous.current = next
      setRoute(next)
      dirty.current = false
      window.scrollTo(0, 0)
    }
    window.addEventListener("beforeunload", unload)
    window.addEventListener("hashchange", change)
    return () => {
      window.removeEventListener("beforeunload", unload)
      window.removeEventListener("hashchange", change)
    }
  }, [])
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(
      expire,
      Math.max(0, Date.parse(session.expires_at) - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [session, expire])
  function login(value: Session) {
    storeSession(value)
    sessionRef.current = value
    setSession(value)
    setNotice("")
  }
  async function logout() {
    try {
      await api.response("/auth/logout", {})
    } catch (err) {
      setNotice(`Сервер не подтвердил выход: ${message(err)}`)
    } finally {
      expire()
    }
  }
  function navigate(path: string) {
    window.location.hash = path
  }
  if (configError)
    return (
      <main className="login-page">
        <Notice error>
          Не удалось загрузить адрес сервера: {configError}
          <button type="button" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </Notice>
      </main>
    )
  if (!origin)
    return (
      <main className="login-page">
        <Empty title="Подключаем рабочее пространство…" />
      </main>
    )
  if (!session && !publicAccess) return <Login api={api} onLogin={login} notice={notice} />
  return (
    <Shell route={route} navigate={navigate} logout={publicAccess ? undefined : logout}>
      <SourceStatus api={api} />
      {catalogError ? (
        <Notice error>
          {catalogError}
          <button type="button" onClick={() => window.location.reload()}>
            Повторить подключение
          </button>
        </Notice>
      ) : !catalog ? (
        <Empty title="Загружаем каталог…" />
      ) : route.startsWith("/maps/") || route.startsWith("/series/") ? (
        <MapPage
          key={route}
          path={route}
          api={api}
          catalog={catalog}
          navigate={navigate}
          setDirty={setDirty}
        />
      ) : route === "/history" ? (
        <HistoryPage api={api} catalog={catalog} navigate={navigate} />
      ) : route === "/stats" ? (
        <StatsPage api={api} catalog={catalog} />
      ) : (
        <Schedule api={api} catalog={catalog} navigate={navigate} />
      )}
    </Shell>
  )
}
