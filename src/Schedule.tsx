import { ArrowRight, ChevronDown, RefreshCw } from "lucide-react"
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react"
import type { z } from "zod"
import type { Api } from "./api"
import { message, scheduleSchema } from "./contracts"
import { mapPath, mapStatus, query, time } from "./domain"
import { EventOverview } from "./EventOverview"
import { type GroupStanding, type GroupStandingTable, GroupTables } from "./GroupTables"
import { MarketBoard } from "./MarketBoard"
import { PlayIn } from "./PlayIn"
import { PlayoffBracket } from "./PlayoffBracket"
import { PLAY_IN_KEY } from "./playin-data"
import { BLAST_TOURNAMENT, blastPlayoffBracket } from "./playoff-bracket"
import { type ScheduleSeries, seriesResult } from "./series-result"
import { TournamentPicker } from "./TournamentPicker"
import { tournamentPhase } from "./tournament-phase"
import { Empty, Header, Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"
import "./schedule-presentation.css"

const TournamentPrices = lazy(() =>
  import("./TournamentPrices").then(({ TournamentPrices }) => ({ default: TournamentPrices })),
)

type ScheduleData = z.infer<typeof scheduleSchema>
type Series = ScheduleSeries
type Section = "all" | "groups" | "playoff" | "markets"

function groupFor(series: Series, phase: string) {
  if (series.group) return series.group
  const name = phase.match(/(?:^| · )(Группа [^·]+?)(?: · |$)/u)?.[1]
  return name ? { id: name, name } : undefined
}

function groupStandings(id: string, name: string, matches: readonly Series[]): GroupStandingTable {
  const rows = new Map<string, GroupStanding>()
  for (const match of matches) {
    for (const name of [match.team_a, match.team_b]) {
      if (!rows.has(name))
        rows.set(name, {
          id: name,
          name,
          rank: null,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          mapsWon: 0,
          mapsLost: 0,
        })
    }
  }
  let completed = 0
  for (const match of matches) {
    const first = rows.get(match.team_a)
    const second = rows.get(match.team_b)
    if (!first || !second) continue
    const score = seriesResult(match)
    first.mapsWon += score.a
    first.mapsLost += score.b
    second.mapsWon += score.b
    second.mapsLost += score.a
    if (!score.done) continue
    completed += 1
    first.played += 1
    second.played += 1
    first[score.a > score.b ? "won" : score.a === score.b ? "drawn" : "lost"] += 1
    second[score.b > score.a ? "won" : score.b === score.a ? "drawn" : "lost"] += 1
  }
  const points = (row: GroupStanding) => row.won * 3 + row.drawn
  const ordered = [...rows.values()].sort(
    (a, b) => points(b) - points(a) || a.name.localeCompare(b.name),
  )
  if (completed > 0) {
    let rank = 0
    let previous: number | undefined
    ordered.forEach((row, index) => {
      const current = points(row)
      if (current !== previous) rank = index + 1
      row.rank = rank
      previous = current
    })
  }
  return { id, name, complete: completed === matches.length, rows: ordered }
}

function SeriesRow({
  series,
  phase,
  tournament,
  navigate,
}: {
  readonly series: Series
  readonly phase: string
  readonly tournament: string
  readonly navigate: (route: string) => void
}) {
  const score = seriesResult(series)
  const scored = score.a + score.b > 0
  const played = series.maps.filter((map) => map.play_status !== "unplayed")
  return (
    <details className="playin-series tracker-series">
      <summary>
        <span className="tracker-series-date">
          <strong>{time(series.starts_at_utc)}</strong>
          <small>
            {phase.replace(/^(Групповой этап|Плей-офф) · /u, "") || "Стадия уточняется"}
          </small>
        </span>
        <span className="tracker-series-teams">
          <span className="tracker-series-side" data-winner={score.done && score.a > score.b}>
            <TeamIdentity name={series.team_a} size="md" />
            <strong>{scored ? score.a : "–"}</strong>
          </span>
          <span className="tracker-series-side" data-winner={score.done && score.b > score.a}>
            <TeamIdentity name={series.team_b} size="md" />
            <strong>{scored ? score.b : "–"}</strong>
          </span>
        </span>
        <span className="tracker-series-status">
          <span>BO{series.best_of}</span>
          <small>{score.done ? "Завершена" : scored ? "Есть результаты" : "Ожидается"}</small>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <div className="playin-series-body">
        <div className="map-buttons tracker-map-buttons">
          {played.map((map) => (
            <a
              key={map.map_number}
              className="map-button"
              href={`#${mapPath(map)}?${query({ tournament })}`}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                navigate(`${mapPath(map)}?${query({ tournament })}`)
              }}
            >
              <span>
                Карта {map.map_number} <ArrowRight size={14} aria-hidden="true" />
              </span>
              <small>{mapStatus(map)}</small>
            </a>
          ))}
        </div>
        {played.length < series.maps.length && (
          <small className="muted">
            Отпали по счёту:{" "}
            {series.maps
              .filter((map) => map.play_status === "unplayed")
              .map((map) => map.map_number)
              .join(", ")}
          </small>
        )}
      </div>
    </details>
  )
}

type ScheduleProps = {
  readonly api: Pick<Api, "request">
  readonly tournament: string
  readonly navigate: (route: string) => void
  readonly view: string | null
  readonly archive?: boolean
}

export function Schedule({ api, tournament, navigate, view, archive }: ScheduleProps) {
  const selected = tournament || "pari-universe"
  const playIn = selected === PLAY_IN_KEY && !archive
  const odds = view === "markets"
  return (
    <div className="schedule-page">
      <Header
        title={selected === PLAY_IN_KEY ? "1win Essence III · Play-In" : "Расписание"}
        subtitle="Откройте серию для просмотра карт. Время UTC+7."
      />
      <TournamentPicker
        api={api}
        value={selected}
        onChange={(key) => navigate(`/schedule?${query({ tournament: key })}`)}
      />
      {playIn && (
        <fieldset className="view-tabs schedule-views" aria-label="Раздел Play-In">
          <button
            type="button"
            className="secondary"
            aria-pressed={!odds}
            onClick={() => navigate(`/schedule?${query({ tournament: selected })}`)}
          >
            Группы
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={odds}
            onClick={() =>
              navigate(`/schedule?${query({ tournament: selected, view: "markets" })}`)
            }
          >
            Котировки
          </button>
        </fieldset>
      )}
      {playIn && !odds ? (
        <PlayIn api={api} navigate={navigate} />
      ) : (
        <ScheduleContents
          api={api}
          tournament={selected}
          navigate={navigate}
          view={view}
          archive={archive ?? false}
        />
      )}
    </div>
  )
}

function ScheduleContents({ api, tournament, navigate, view, archive }: ScheduleProps) {
  const matchesId = useId()
  const matchesHeading = useRef<HTMLHeadingElement>(null)
  const [group, setGroup] = useState("")
  const [team, setTeam] = useState("")
  const [date, setDate] = useState("")
  const [data, setData] = useState<ScheduleData | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [refresh, setRefresh] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Manual refresh repeats the same request.
  useEffect(() => {
    let active = true
    let pending = false
    async function load(manual: boolean) {
      if (pending) return
      pending = true
      if (manual) setBusy(true)
      try {
        const result = await api.request(`/schedule?${query({ tournament })}`, scheduleSchema)
        if (active) {
          setData(result)
          setError("")
        }
      } catch (err) {
        if (active) setError(message(err))
      } finally {
        pending = false
        if (active) setBusy(false)
      }
    }
    void load(true)
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false)
    }, 30_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [api, tournament, refresh])

  const slots = new Map(data?.event?.slots.map((slot) => [slot.series_id, slot.phase]))
  const phaseOf = (match: Series) =>
    tournamentPhase(match.series_id, match.phase ?? slots.get(match.series_id) ?? match.group?.name)
  const series = data?.series ?? []
  const groups = new Map<string, { name: string; matches: Series[] }>()
  for (const match of series) {
    const phase = phaseOf(match)
    const source = groupFor(match, phase)
    if (!source || phase.includes("переигровки")) continue
    const entry = groups.get(source.id) ?? { name: source.name, matches: [] }
    entry.matches.push(match)
    groups.set(source.id, entry)
  }
  const groupEntries = [...groups].sort(([, a], [, b]) => a.name.localeCompare(b.name, "ru"))
  const groupMatches = groupEntries.flatMap(([, item]) => item.matches)
  const playoff = series.filter((match) => phaseOf(match).startsWith("Плей-офф"))
  const hasBracket = tournament === BLAST_TOURNAMENT
  const allComplete = series.length > 0 && series.every((item) => seriesResult(item).done)
  const active: Section =
    view === "all" || view === "groups" || view === "playoff" || view === "markets"
      ? view
      : groups.size
        ? "groups"
        : "all"
  const teams = [...new Set(series.flatMap((item) => [item.team_a, item.team_b]))].sort((a, b) =>
    a.localeCompare(b),
  )
  const visible = (active === "playoff" ? playoff : series)
    .filter((item) => {
      const phase = phaseOf(item)
      const matchGroup = groupFor(item, phase)
      return (
        (active !== "groups" ||
          ((matchGroup || phase.startsWith("Групповой этап")) &&
            (!group || matchGroup?.id === group))) &&
        (!team || item.team_a === team || item.team_b === team) &&
        (!date || (item.tournament_date ?? item.starts_at_utc.slice(0, 10)) === date)
      )
    })
    .sort((a, b) => {
      const aDone = seriesResult(a).done
      const bDone = seriesResult(b).done
      if (aDone !== bDone) return Number(aDone) - Number(bDone)
      return active === "groups" || !aDone
        ? a.starts_at_utc.localeCompare(b.starts_at_utc)
        : b.starts_at_utc.localeCompare(a.starts_at_utc)
    })

  function filterGroup(next: string, name = "") {
    setGroup(next)
    setTeam(name)
    setDate("")
    window.requestAnimationFrame(() => matchesHeading.current?.focus())
  }

  return (
    <>
      {(tournament !== PLAY_IN_KEY || archive) && (
        <fieldset className="view-tabs schedule-views" aria-label="Раздел турнира">
          {(
            [
              ["all", "Все матчи", true],
              ["groups", "Группы", groups.size > 0],
              ["playoff", "Плей-офф", hasBracket || playoff.length > 0],
              ["markets", "Котировки", true],
            ] as const
          )
            .filter(([, , show]) => show)
            .map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="secondary"
                aria-pressed={active === key}
                onClick={() => {
                  setGroup("")
                  setTeam("")
                  setDate("")
                  navigate(`/schedule?${query({ tournament, view: key })}`)
                }}
              >
                {label}
              </button>
            ))}
        </fieldset>
      )}
      {active === "markets" ? (
        !data && busy ? (
          <Empty title="Загружаем котировки…" />
        ) : !data && error ? (
          <Notice error>Не удалось загрузить котировки. {error}</Notice>
        ) : allComplete || tournament === PLAY_IN_KEY || archive ? (
          <Suspense fallback={<Empty title="Загружаем историю цен…" />}>
            <TournamentPrices maps={series.flatMap((item) => item.maps)} tournament={tournament} />
          </Suspense>
        ) : (
          <MarketBoard api={api} tournament={tournament} />
        )
      ) : (
        <>
          {error && <Notice error>Не удалось обновить расписание. {error}</Notice>}
          {active === "playoff" && hasBracket && (
            <PlayoffBracket matches={blastPlayoffBracket(playoff)} />
          )}
          {active === "groups" && groups.size > 0 && (
            <div className="schedule-groups">
              <div className="report-counts">
                <div>
                  <strong>
                    {new Set(groupMatches.flatMap((match) => [match.team_a, match.team_b])).size}
                  </strong>
                  <span>команд · {groups.size} групп</span>
                </div>
                <div>
                  <strong>
                    {groupMatches.filter((match) => seriesResult(match).done).length} /{" "}
                    {groupMatches.length}
                  </strong>
                  <span>серий завершено</span>
                </div>
                <div>
                  <strong>
                    {groupMatches.reduce((total, match) => {
                      const score = seriesResult(match)
                      return total + score.a + score.b
                    }, 0)}
                  </strong>
                  <span>карт с результатом</span>
                </div>
              </div>
              <GroupTables
                tables={groupEntries.map(([id, item]) =>
                  groupStandings(id, item.name, item.matches),
                )}
                onTeam={filterGroup}
              />
              <p className="muted">
                Положение по результатам серий. При равенстве показателей учитывайте тай-брейки
                турнира.
              </p>
            </div>
          )}
          <section className="panel schedule-panel" aria-busy={busy} aria-labelledby={matchesId}>
            <div className="panel-heading schedule-list-heading">
              <div>
                <h2 id={matchesId} ref={matchesHeading} tabIndex={-1}>
                  {active === "groups"
                    ? "Матчи групп"
                    : active === "playoff"
                      ? "Матчи плей-офф"
                      : "Матчи турнира"}
                </h2>
                <p className="muted">
                  {data
                    ? `${visible.length} из ${series.length} серий`
                    : busy
                      ? "Загружаем расписание…"
                      : "Расписание недоступно"}
                </p>
              </div>
              <div className="schedule-filters">
                {active === "groups" && (
                  <select
                    aria-label="Группа"
                    value={group}
                    onChange={(e) => {
                      setGroup(e.target.value)
                      setTeam("")
                    }}
                  >
                    <option value="">Все группы</option>
                    {groupEntries.map(([id, item]) => (
                      <option key={id} value={id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
                <select aria-label="Команда" value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">Все команды</option>
                  {teams.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <select aria-label="Дата" value={date} onChange={(e) => setDate(e.target.value)}>
                  <option value="">Все даты</option>
                  {data?.dates.map((day) => (
                    <option key={day} value={day}>
                      {day.split("-").reverse().join(".")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRefresh((value) => value + 1)}
                  disabled={busy}
                  aria-label="Обновить расписание"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            {visible.map((item) => (
              <SeriesRow
                key={item.series_id}
                series={item}
                phase={phaseOf(item)}
                tournament={tournament}
                navigate={navigate}
              />
            ))}
            {!busy && !visible.length && data && <Empty title="Серий по выбранным условиям нет" />}
          </section>
          {data?.event && (
            <details className="panel tournament-details">
              <summary>Участники, составы и источники</summary>
              <EventOverview event={data.event} />
            </details>
          )}
        </>
      )}
    </>
  )
}
