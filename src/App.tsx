import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Api,
  ApiError,
  loadConfig,
  loadPublicAccess,
  readSession,
  serviceUnavailable,
  storeSession,
} from "./api"
import { type Catalog, catalogSchema, message, type Session } from "./contracts"
import { Login } from "./Login"
import { MapPage } from "./MapPage"
import { Schedule } from "./Schedule"
import { SourceStatus } from "./SourceStatus"
import { Empty, Notice, Shell } from "./ui"

const HistoryPage = lazy(() =>
  import("./HistoryPage").then(({ HistoryPage }) => ({ default: HistoryPage })),
)
const StatsPage = lazy(() =>
  import("./StatsPage").then(({ StatsPage }) => ({ default: StatsPage })),
)
const PublicArchive = lazy(() =>
  import("./PublicArchive").then(({ PublicArchive }) => ({ default: PublicArchive })),
)

export function App() {
  const [publicAccess, setPublicAccess] = useState(false)
  const [origin, setOrigin] = useState("")
  const [configError, setConfigError] = useState("")
  const [session, setSession] = useState(readSession)
  const sessionRef = useRef<Session | null>(session)
  const [notice, setNotice] = useState("")
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState("")
  const [archiveOnly, setArchiveOnly] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [connectedAttempt, setConnectedAttempt] = useState(-1)
  const [route, setRoute] = useState(
    () => window.location.hash.slice(1) || "/schedule?tournament=1win-essence-3",
  )
  const selectedTournament = new URLSearchParams(route.split("?")[1]).get("tournament") ?? ""
  const playInOverview =
    route.split("?")[0] === "/schedule" && selectedTournament === "1win-essence-3-play-in"
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
    let active = true
    loadConfig()
      .then(async (value) => {
        const isPublic = await loadPublicAccess(value)
        if (!active) return
        setConfigError("")
        setPublicAccess(isPublic)
        if (!isPublic) setArchiveOnly(false)
        if (isPublic) {
          sessionRef.current = null
          storeSession(null)
          setSession(null)
        }
        setOrigin(value)
        setConnectedAttempt(attempt)
      })
      .catch((err) => {
        if (!active) return
        if (serviceUnavailable(err)) setArchiveOnly(true)
        else {
          setArchiveOnly(false)
          setConfigError(message(err))
        }
      })
    return () => {
      active = false
    }
  }, [attempt])
  useEffect(() => {
    if (!archiveOnly) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setAttempt((n) => n + 1)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [archiveOnly])
  useEffect(() => {
    if (connectedAttempt < 0 || !origin || (!session && !publicAccess)) return
    let active = true
    setCatalogError("")
    api
      .request("/catalog", catalogSchema)
      .then((value) => {
        if (active) {
          setCatalog(value)
          setArchiveOnly(false)
        }
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof ApiError && [401, 403].includes(err.status)) {
          setArchiveOnly(false)
          setPublicAccess(false)
          expire()
        } else if (publicAccess && serviceUnavailable(err)) setArchiveOnly(true)
        else setCatalogError(message(err))
      })
    return () => {
      active = false
    }
  }, [api, origin, session, publicAccess, connectedAttempt, expire])
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
  if (archiveOnly)
    return (
      <Shell route={route} navigate={navigate}>
        <Suspense fallback={<Empty title="Загружаем публичный архив…" />}>
          <PublicArchive route={route} navigate={navigate} retry={() => setAttempt((n) => n + 1)} />
        </Suspense>
      </Shell>
    )
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
      {catalog && !playInOverview && <SourceStatus api={api} />}
      <Suspense fallback={<Empty title="Загружаем раздел…" />}>
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
        ) : route === "/history" || route.startsWith("/history?") ? (
          <HistoryPage
            key={route}
            api={api}
            catalog={catalog}
            navigate={navigate}
            initialSearch={new URLSearchParams(route.split("?")[1]).get("series") ?? ""}
            tournament={selectedTournament}
          />
        ) : route.split("?")[0] === "/stats" ? (
          <StatsPage
            key={selectedTournament}
            api={api}
            catalog={catalog}
            tournament={selectedTournament}
            navigate={navigate}
          />
        ) : (
          <Schedule
            key={route}
            api={api}
            catalog={catalog}
            navigate={navigate}
            tournament={selectedTournament}
          />
        )}
      </Suspense>
    </Shell>
  )
}
