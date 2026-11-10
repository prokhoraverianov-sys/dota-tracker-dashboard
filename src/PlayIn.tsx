import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import type { Api } from "./api"
import { message } from "./contracts"
import { time } from "./domain"
import {
  duration,
  groupName,
  PLAY_IN_KEY,
  PLAY_IN_ROUTE,
  type PlayInData,
  type PlayInMap,
  type PlayInSeries,
  playInSchema,
  qualificationSlots,
  seriesScore,
  teamName,
} from "./playin-data"
import { Empty, Notice } from "./ui"
import { HeroPortrait, TeamIdentity } from "./VisualIdentity"
import "./playin.css"

const statusLabels = {
  scheduled: "По расписанию",
  live: "Идёт серия",
  completed: "Завершена",
  cancelled: "Отменена",
} as const
const value = (number: number | null | undefined) =>
  number == null ? "—" : number.toLocaleString("ru-RU", { maximumFractionDigits: 1 })

function Sources({ data, ids }: { readonly data: PlayInData; readonly ids: readonly string[] }) {
  const sources = data.sources.filter(
    (source) => ids.includes(source.id) && source.url.startsWith("https://"),
  )
  return sources.length ? (
    <span className="playin-sources">
      {sources.map((source) => (
        <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
          {source.title} ↗
        </a>
      ))}
    </span>
  ) : null
}

export function PlayInCarryover({ data }: { readonly data: PlayInData }) {
  const slots = qualificationSlots(data)
  return (
    <section
      className="panel section-card playin-qualification"
      aria-label="Выход в основной турнир"
    >
      <div className="panel-heading">
        <div>
          <h2>Выход в 1win Essence III</h2>
          <p className="muted">
            {data.qualifications.length} из {slots.length} участников подтверждено · по{" "}
            {data.tournament.qualifiers_per_group} из каждой группы.
            {slots.some((slot) => !slot.confirmed) && (
              <span className="playin-qualification-note">
                {" "}
                Текущее место в таблице не подтверждает выход.
              </span>
            )}
          </p>
        </div>
        <a href={`#${PLAY_IN_ROUTE}`}>История Play-In →</a>
      </div>
      <div className="playin-slots">
        {slots.map(({ group, position, confirmed }) => (
          <article
            key={`${group}-${position}`}
            className={confirmed ? "playin-slot qualified" : "playin-slot"}
          >
            <small>
              {groupName(group)} ·{" "}
              {confirmed?.position === null ? "проходное место" : `место ${position}`}
            </small>
            {confirmed ? (
              <TeamIdentity
                name={teamName(data, confirmed.team_key)}
                teamKey={confirmed.team_key}
                size="sm"
              />
            ) : (
              <strong className="playin-slot-pending">Участник уточняется</strong>
            )}
            {confirmed ? (
              <>
                <span className="hit-text">
                  {confirmed.method === "completed_results"
                    ? "Выход следует из завершённых результатов"
                    : "Выход подтверждён источником"}
                </span>
                <a href={`#${PLAY_IN_ROUTE}&team=${encodeURIComponent(confirmed.team_key)}`}>
                  Матчи и состав →
                </a>
                <Sources data={data} ids={confirmed.source_ids} />
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

const extraPlayerColumns = [
  ["hero_damage", "Урон героям"],
  ["tower_damage", "Урон строениям"],
  ["hero_healing", "Лечение"],
  ["obs_placed", "Observer"],
  ["sen_placed", "Sentry"],
  ["observer_kills", "Снятые Observer"],
  ["last_hits_at_10", "LH @10"],
  ["denies_at_10", "DN @10"],
  ["gold_at_10", "Золото @10"],
  ["xp_at_10", "Опыт @10"],
] as const

function ExtraPlayerStats({ map }: { readonly map: PlayInMap }) {
  const columns = extraPlayerColumns.filter(([key]) =>
    map.players.some((player) => player[key] != null),
  )
  if (!columns.length) return null
  return (
    <details className="playin-stats-details">
      <summary>Урон, обзор и показатели к 10-й минуте</summary>
      <div className="table-scroll">
        <table className="compact-stats-table">
          <caption>Дополнительные показатели игроков · карта {map.map_number}</caption>
          <thead>
            <tr>
              <th scope="col">Игрок / герой</th>
              {columns.map(([key, label]) => (
                <th scope="col" key={key}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {map.players.map((player, index) => (
              <tr key={`${player.team_key}-${player.nickname}-${index}`}>
                <th scope="row">
                  <span className="playin-player-identity">
                    {player.hero && <HeroPortrait name={player.hero} size="sm" />}
                    <span>
                      {player.nickname}
                      <small className="metric-note">{player.hero ?? "Герой неизвестен"}</small>
                    </span>
                  </span>
                </th>
                {columns.map(([key]) => (
                  <td key={key}>{value(player[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted playin-no-data">
        @10 — снимок к 10-й минуте. Пропуск обозначен «—»; нулевое значение показано как 0.
      </p>
    </details>
  )
}

function ActualMap({
  map,
  series,
  data,
}: {
  readonly map: PlayInMap
  readonly series: PlayInSeries
  readonly data: PlayInData
}) {
  return (
    <section className="playin-map" aria-label={`Карта ${map.map_number}`}>
      <div className="playin-map-heading">
        <h3>Карта {map.map_number}</h3>
        <span>
          {map.winner_team_key
            ? `Победитель: ${teamName(data, map.winner_team_key)}`
            : "Победитель не подтверждён"}
        </span>
        <span>Длительность: {duration(map.duration_seconds)}</span>
        <span>
          Убийства: {value(map.team1_kills)} : {value(map.team2_kills)}
        </span>
        {map.radiant_team_key && <span>Radiant: {teamName(data, map.radiant_team_key)}</span>}
        {map.first_pick_team_key && (
          <span>Первый пик: {teamName(data, map.first_pick_team_key)}</span>
        )}
      </div>
      {map.raw_available && map.raw_url?.startsWith("https://") && (
        <a className="playin-sources" href={map.raw_url} target="_blank" rel="noreferrer">
          Исходные данные карты ↗
        </a>
      )}
      <Sources data={data} ids={map.source_ids} />
      <div className="playin-drafts">
        {[series.team1_key, series.team2_key].map((key) => (
          <div key={key}>
            <TeamIdentity name={teamName(data, key)} teamKey={key} size="sm" />
            <div className="playin-hero-line">
              <span className="muted playin-draft-label">Пики: </span>
              {map.picks.some((pick) => pick.team_key === key) ? (
                <span className="playin-hero-strip">
                  {map.picks
                    .filter((pick) => pick.team_key === key)
                    .map((pick) => (
                      <span className="playin-draft-hero" key={pick.hero}>
                        <HeroPortrait name={pick.hero} size="md" />
                        <small>{pick.hero}</small>
                      </span>
                    ))}
                </span>
              ) : (
                "Нет подтверждённого драфта"
              )}
            </div>
            <div className="playin-hero-line playin-bans">
              <span className="muted playin-draft-label">Баны: </span>
              {map.bans.some((ban) => ban.team_key === key) ? (
                <span className="playin-hero-strip">
                  {map.bans
                    .filter((ban) => ban.team_key === key)
                    .map((ban) => (
                      <span className="playin-ban-hero" key={ban.hero} title={ban.hero}>
                        <HeroPortrait name={ban.hero} size="sm" />
                        <span className="playin-ban-name">{ban.hero}</span>
                      </span>
                    ))}
                </span>
              ) : (
                "Нет данных"
              )}
            </div>
          </div>
        ))}
      </div>
      {map.players.length > 0 ? (
        <div className="table-scroll">
          <table className="compact-stats-table">
            <caption>Фактическая статистика игроков · карта {map.map_number}</caption>
            <thead>
              <tr>
                <th scope="col">Игрок / герой</th>
                <th scope="col">Команда</th>
                <th scope="col">K / D / A</th>
                <th scope="col">GPM</th>
                <th scope="col">XPM</th>
                <th scope="col">LH / DN</th>
                <th scope="col">Ценность</th>
              </tr>
            </thead>
            <tbody>
              {map.players.map((player, index) => (
                <tr key={`${player.team_key}-${player.nickname}-${index}`}>
                  <th scope="row">
                    <span className="playin-player-identity">
                      {player.hero && <HeroPortrait name={player.hero} size="sm" />}
                      <span>
                        {player.nickname}
                        <small className="metric-note">{player.hero ?? "Герой неизвестен"}</small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <TeamIdentity
                      name={teamName(data, player.team_key)}
                      teamKey={player.team_key}
                      size="sm"
                    />
                  </td>
                  <td>
                    {value(player.kills)} / {value(player.deaths)} / {value(player.assists)}
                  </td>
                  <td>{value(player.gold_per_min)}</td>
                  <td>{value(player.xp_per_min)}</td>
                  <td>
                    {value(player.last_hits)} / {value(player.denies)}
                  </td>
                  <td>{value(player.net_worth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted playin-no-data">
          Подтверждённая статистика игроков этой карты пока не получена.
        </p>
      )}
      <ExtraPlayerStats map={map} />
    </section>
  )
}

function Fixtures({
  data,
  team,
  group,
}: {
  readonly data: PlayInData
  readonly team: string
  readonly group: string
}) {
  const series = data.series.filter(
    (item) =>
      (!team || item.team1_key === team || item.team2_key === team) &&
      (!group || item.group === group),
  )
  return (
    <section className="panel playin-fixtures" aria-label="Серии Play-In">
      <div className="panel-heading">
        <div>
          <h2>Расписание и результаты</h2>
          <p className="muted">
            Серий: {series.length} · время по Бангкоку. Откройте серию для данных карт.
          </p>
        </div>
      </div>
      {series.length ? (
        series.map((item) => (
          <details className="playin-series" key={item.key}>
            <summary>
              <span className="playin-series-date">
                <strong>{item.scheduled_at ? time(item.scheduled_at) : "Время уточняется"}</strong>
                <small>
                  {groupName(item.group)} · BO{item.best_of}
                </small>
              </span>
              <span className="playin-series-teams">
                <TeamIdentity
                  name={teamName(data, item.team1_key)}
                  teamKey={item.team1_key}
                  size="md"
                />
                <strong className="playin-series-score">{seriesScore(item)}</strong>
                <TeamIdentity
                  name={teamName(data, item.team2_key)}
                  teamKey={item.team2_key}
                  size="md"
                />
              </span>
              <span className="playin-series-result">
                <small className={item.status === "live" ? "hit-text" : "muted"}>
                  {statusLabels[item.status]}
                </small>
              </span>
              <span className="playin-expand">Карты ↓</span>
            </summary>
            <div className="playin-series-body">
              <Sources data={data} ids={item.source_ids} />
              {item.maps.length ? (
                item.maps.map((map) => (
                  <ActualMap key={map.key} map={map} series={item} data={data} />
                ))
              ) : (
                <p className="muted playin-no-data">
                  Данные карт не опубликованы или ещё не подтверждены. Счёт серии не заменяет
                  результат отдельной карты.
                </p>
              )}
            </div>
          </details>
        ))
      ) : (
        <Empty title="Серий по фильтрам нет">Выберите другую группу или команду.</Empty>
      )}
    </section>
  )
}

function Coverage({ data }: { readonly data: PlayInData }) {
  const stats = data.stats
  return (
    <section className="panel section-card" aria-label="Покрытие данных Play-In">
      <h2>Полнота и источники данных</h2>
      <p className="muted">{data.coverage.notice}</p>
      <div className="playin-coverage-grid">
        {[
          ["Результат карты", stats.maps_with_winner],
          ["Длительность", stats.maps_with_duration],
          ["Драфт", stats.maps_with_draft],
          ["Статистика игроков", stats.maps_with_player_stats],
        ].map(([label, count]) => (
          <div key={label}>
            <strong>
              {count} / {stats.completed_maps}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        Знаменатель — завершённые карты, о которых есть данные. Отсутствующие карты и поля не
        считаются нулевыми значениями.
      </p>
      {data.coverage.missing.length > 0 && (
        <div className="playin-missing">
          <strong>Пока не подтверждено</strong>
          <ul>
            {data.coverage.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {data.coverage.notes.map((item) => (
        <p className="muted" key={item}>
          {item}
        </p>
      ))}
      <details className="playin-source-details">
        <summary>Источники и время получения</summary>
        <ul>
          {data.sources.map((source) => (
            <li key={source.id}>
              {source.url.startsWith("https://") ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title} ↗
                </a>
              ) : (
                source.title
              )}
              <span className="muted"> · получено {time(source.retrieved_at_utc)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function FactualStats({ data, team }: { readonly data: PlayInData; readonly team: string }) {
  const players = data.stats.players.filter((player) => !team || player.team_key === team)
  return (
    <section className="panel section-card" aria-label="Статистика подтверждённых карт">
      <h2>Статистика подтверждённых карт</h2>
      <p className="muted">
        По всему Play-In. Средняя длительность: {duration(data.stats.average_duration_seconds)} ·
        выборка {data.stats.maps_with_duration}. Все показатели описывают сыгранные карты.
      </p>
      <details className="playin-stats-details">
        <summary>Герои · пики и баны</summary>
        {data.stats.heroes.length ? (
          <div className="table-scroll">
            <table className="compact-stats-table">
              <caption>Герои во всех подтверждённых драфтах Play-In</caption>
              <thead>
                <tr>
                  <th scope="col">Герой</th>
                  <th scope="col">Пики</th>
                  <th scope="col">Баны</th>
                  <th scope="col">Победы / поражения</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.heroes.map((hero) => (
                  <tr key={hero.hero}>
                    <th scope="row">
                      <span className="playin-hero-table-name">
                        <HeroPortrait name={hero.hero} size="sm" />
                        {hero.hero}
                      </span>
                    </th>
                    <td>{hero.picks}</td>
                    <td>{hero.bans}</td>
                    <td>
                      {hero.wins} / {hero.losses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted playin-no-data">
            Подтверждённых драфтов пока нет. Частоты героев появятся после получения данных.
          </p>
        )}
      </details>
      <details className="playin-stats-details">
        <summary>Игроки · статистика и размер выборки</summary>
        {players.length ? (
          <div className="table-scroll">
            <table className="compact-stats-table">
              <caption>
                Показатели игроков{team ? ` · ${teamName(data, team)}` : " · все команды"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Игрок / команда</th>
                  <th scope="col">Карт</th>
                  <th scope="col">П / Пор</th>
                  <th scope="col">Σ K / D / A</th>
                  <th scope="col">Средний GPM</th>
                  <th scope="col">Средний XPM</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={`${player.team_key}-${player.nickname}`}>
                    <th scope="row">
                      {player.nickname}
                      <small className="metric-note">{teamName(data, player.team_key)}</small>
                    </th>
                    <td>{player.maps}</td>
                    <td>
                      {player.wins} / {player.losses}
                    </td>
                    <td>
                      {value(player.kills)} / {value(player.deaths)} / {value(player.assists)}
                    </td>
                    <td>{value(player.average_gold_per_min)}</td>
                    <td>{value(player.average_xp_per_min)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted playin-no-data">Подтверждённой статистики игроков пока нет.</p>
        )}
      </details>
    </section>
  )
}

export function PlayIn({
  api,
  navigate,
}: {
  readonly api: Api
  readonly navigate: (route: string) => void
}) {
  const [data, setData] = useState<PlayInData | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [group, setGroup] = useState("")
  const [team, setTeam] = useState(
    () => new URLSearchParams(window.location.hash.split("?")[1]).get("team") ?? "",
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: Manual refresh uses the same source and preserves the last successful snapshot.
  useEffect(() => {
    let active = true
    let running = false
    async function update() {
      if (running || document.visibilityState === "hidden") return
      running = true
      setBusy(true)
      try {
        const result = await api.request(`/tournaments/${PLAY_IN_KEY}`, playInSchema)
        if (active) {
          setData(result)
          setError("")
        }
      } catch (err) {
        if (active) setError(message(err))
      } finally {
        running = false
        if (active) setBusy(false)
      }
    }
    void update()
    const timer = window.setInterval(() => {
      void update()
    }, 120000)
    const show = () => {
      if (document.visibilityState === "visible") void update()
    }
    document.addEventListener("visibilitychange", show)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", show)
    }
  }, [api, refresh])

  return (
    <div className="playin-page">
      <div className="playin-toolbar">
        <p className="muted">
          {data
            ? `Данные на ${time(data.as_of)} · обновление каждые 2 минуты`
            : "Загружаем Play-In…"}
        </p>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((current) => current + 1)}
        >
          <RefreshCw size={16} />
          {busy ? "Обновляем…" : "Обновить"}
        </button>
      </div>
      {error && (
        <Notice error>
          Не удалось обновить Play-In: {error}
          {data && " Показан последний полученный снимок."}
        </Notice>
      )}
      {!data ? (
        busy ? (
          <Empty title="Загружаем группы и результаты…" />
        ) : (
          <Empty title="Данные Play-In недоступны">
            Нажмите «Обновить», чтобы повторить загрузку.
          </Empty>
        )
      ) : (
        <>
          <div className="report-counts playin-counts">
            <div>
              <strong>{data.teams.length}</strong>
              <span>команд · {data.groups.length} группы</span>
            </div>
            <div>
              <strong>
                {data.stats.completed_series} / {data.series.length}
              </strong>
              <span>
                серий завершено
                {data.stats.live_series > 0 ? ` · ${data.stats.live_series} идут` : ""}
              </span>
            </div>
            <div>
              <strong>{data.stats.completed_maps}</strong>
              <span>завершённых карт с данными</span>
            </div>
          </div>
          <div className="playin-group-grid">
            {data.groups.map((item) => (
              <section
                className="panel playin-group"
                key={item.group}
                aria-label={groupName(item.group)}
              >
                <div className="panel-heading">
                  <div>
                    <h2>{groupName(item.group)}</h2>
                    <p className="muted">
                      {item.complete
                        ? "Все серии группы завершены"
                        : "Текущее положение · группа не завершена"}
                    </p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="compact-stats-table">
                    <caption>Таблица · {groupName(item.group)}</caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Команда</th>
                        <th scope="col">Серии П–Н–Пор</th>
                        <th scope="col">Карты</th>
                        <th scope="col">Разница</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.standings.map((row) => (
                        <tr key={row.team_key}>
                          <td>{row.rank}</td>
                          <th scope="row">
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => {
                                setTeam(row.team_key)
                                setGroup(item.group)
                              }}
                            >
                              <TeamIdentity name={row.team_name} teamKey={row.team_key} size="sm" />
                            </button>
                            {row.qualification_status === "qualified" && (
                              <small className="metric-note hit-text">Выход подтверждён</small>
                            )}
                          </th>
                          <td>
                            {row.won}–{row.drawn}–{row.lost}
                            <small className="metric-note">сыграно {row.played}</small>
                          </td>
                          <td>
                            {row.maps_won} : {row.maps_lost}
                          </td>
                          <td>
                            {row.map_difference > 0 ? "+" : ""}
                            {row.map_difference}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
          <p className="muted playin-standing-note">
            Места при равных показателях предварительные до подтверждения тай-брейков. Выход
            показывается по опубликованному подтверждению или завершённым результатам всей группы
            без неразрешённой ничьей на границе прохода.
          </p>
          <PlayInCarryover data={data} />
          <fieldset className="toolbar playin-filters" aria-label="Фильтры Play-In">
            <label>
              Группа
              <select
                value={group}
                onChange={(event) => {
                  setGroup(event.target.value)
                  setTeam("")
                }}
              >
                <option value="">Все группы</option>
                {data.groups.map((item) => (
                  <option key={item.group} value={item.group}>
                    {groupName(item.group)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Команда
              <select value={team} onChange={(event) => setTeam(event.target.value)}>
                <option value="">Все команды</option>
                {data.teams
                  .filter((item) => !group || item.group === group)
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {(group || team) && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setGroup("")
                  setTeam("")
                }}
              >
                Сбросить фильтры
              </button>
            )}
          </fieldset>
          <Fixtures data={data} team={team} group={group} />
          <section className="panel section-card" aria-label="Составы участников Play-In">
            <h2>Составы и замены</h2>
            <p className="muted">
              Опубликованные составы турнира. Фактический участник карты указан в её статистике;
              замены отмечаются по источнику.
            </p>
            <div className="playin-rosters">
              {data.teams
                .filter((item) => (!group || item.group === group) && (!team || item.key === team))
                .map((item) => (
                  <article key={item.key}>
                    <h3>
                      <TeamIdentity name={item.name} teamKey={item.key} size="md" />
                    </h3>
                    <small className="muted">{groupName(item.group)}</small>
                    {item.roster.length ? (
                      <ol>
                        {item.roster.map((player, index) => (
                          <li key={`${player.nickname}-${index}`}>
                            <strong>{player.nickname}</strong>
                            {player.role !== null && (
                              <small className="muted"> · позиция {player.role}</small>
                            )}
                            {player.is_standin && (
                              <span className="playin-sub">
                                {" "}
                                · замена
                                {player.replaced_nickname
                                  ? ` вместо ${player.replaced_nickname}`
                                  : ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">Состав не подтверждён.</p>
                    )}
                    {item.roster_notes?.map((note) => (
                      <p className="muted" key={note}>
                        {note}
                      </p>
                    ))}
                    {item.aliases.length > 0 && (
                      <p className="muted">Также в источниках: {item.aliases.join(", ")}</p>
                    )}
                    {!!item.previous_names?.length && (
                      <p className="muted">Прежние названия: {item.previous_names.join(", ")}</p>
                    )}
                    <Sources data={data} ids={item.source_ids} />
                  </article>
                ))}
            </div>
          </section>
          <FactualStats data={data} team={team} />
          <Coverage data={data} />
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(`/schedule?tournament=${data.tournament.main_event_key}`)}
            >
              Основной турнир →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
