import {
  Activity,
  ArrowLeft,
  CalendarDays,
  ChartNoAxesCombined,
  History,
  LogOut,
  ShieldCheck,
  Swords,
} from "lucide-react"
import { type ReactNode, useId } from "react"
export function Notice({
  children,
  error = false,
}: {
  readonly children: ReactNode
  readonly error?: boolean
}) {
  return (
    <div className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
      {children}
    </div>
  )
}
export function Empty({
  title,
  children,
}: {
  readonly title: string
  readonly children?: ReactNode
}) {
  return (
    <div className="empty">
      <Activity size={28} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}
export function Header({
  title,
  subtitle,
  children,
}: {
  readonly title: string
  readonly subtitle: string
  readonly children?: ReactNode
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {children}
    </header>
  )
}
export function Shell({
  route,
  navigate,
  logout,
  children,
}: {
  readonly route: string
  readonly navigate: (route: string) => void
  readonly logout?: (() => void) | undefined
  readonly children: ReactNode
}) {
  const mainId = useId()
  const links = [
    { path: "/schedule", label: "Расписание", icon: CalendarDays },
    { path: "/history", label: "История", icon: History },
    { path: "/stats", label: "Статистика", icon: ChartNoAxesCombined },
  ]
  return (
    <div className="app-shell">
      <a
        className="skip"
        href={`#${mainId}`}
        onClick={(event) => {
          event.preventDefault()
          document.getElementById(mainId)?.focus()
        }}
      >
        К содержимому
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Swords size={22} />
          </span>
          <div>
            Dota Tracker<small>АНАЛИТИКА КАРТ</small>
          </div>
        </div>
        <nav aria-label="Основная навигация">
          {links.map((item) => (
            <button
              type="button"
              key={item.path}
              className={route === item.path ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shadow-label">
            <ShieldCheck size={16} /> Shadow only
          </div>
          <p>
            Прогнозы для наблюдения.
            <br />
            Без исполнения ставок.
          </p>
          {logout && (
            <button type="button" className="nav-item" onClick={logout}>
              <LogOut size={17} />
              Выйти
            </button>
          )}
        </div>
      </aside>
      <main id={mainId} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
export function Back({ onClick }: { readonly onClick: () => void }) {
  return (
    <button type="button" className="text-button" onClick={onClick}>
      <ArrowLeft size={16} />К расписанию
    </button>
  )
}
