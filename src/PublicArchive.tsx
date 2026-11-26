import { useEffect, useState } from "react"
import type { z } from "zod"
import { ArchivedPrices } from "./ArchivedPrices"
import type { Api } from "./api"
import { type MapDTO, mapSchema, message } from "./contracts"
import { ForecastCard } from "./ForecastCard"
import { MapOutcome } from "./MapOutcome"
import { evaluateMap, mapStages, retrospectiveForecast, stageNames } from "./map-outcome"
import { Schedule } from "./Schedule"
import { mainTournament, TournamentPicker } from "./TournamentPicker"
import { TrackedReport } from "./TrackedReport"
import { Back, Empty, Header, Notice } from "./ui"
import { isResultRoute, loadVerifiedResults, verifiedView } from "./verified-results"

const archiveReader: Pick<Api, "request"> = {
  async request<T>(path: string, schema: z.ZodType<T>, body?: unknown) {
    if (body !== undefined || !isResultRoute(path))
      throw new Error("Команда недоступна в публичном архиве.")
    const data = await verifiedView(path, null)
    if (!data) throw new Error("Этих данных пока нет в опубликованном архиве.")
    return schema.parse(data)
  },
}

function ArchiveCard({ path }: { readonly path: string }) {
  const [map, setMap] = useState<MapDTO | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    archiveReader
      .request(path, mapSchema)
      .then((value) => {
        if (active) setMap(value)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
    return () => {
      active = false
    }
  }, [path])
  if (!map) return error ? <Notice error>{error}</Notice> : <Empty title="Загружаем карту…" />
  return (
    <>
      <Header
        title={`${map.team_a} — ${map.team_b}`}
        subtitle={`${map.tournament ?? ""} · Карта ${map.map_number ?? "—"}`}
      />
      {map.play_status === "unplayed" ? (
        <Notice>Карта отпала по счёту серии.</Notice>
      ) : (
        <>
          <MapOutcome map={map} />
          <div className="two-columns forecasts">
            {mapStages.map((stage) => {
              const original = map[stage]
              const forecast =
                evaluateMap(map, stage).forecast === original
                  ? original
                  : retrospectiveForecast(map, stage)
              return (
                <div key={stage}>
                  <ForecastCard forecast={forecast} stage={stageNames[stage]} map={map} />
                  {stage === "pre" && map.archived_pre && (
                    <details>
                      <summary>Ранняя запись PRE до счёта 1:1</summary>
                      <ForecastCard forecast={map.archived_pre} stage="PRE" map={map} archived />
                    </details>
                  )}
                  {original && forecast !== original && (
                    <details>
                      <summary>Исходная запись {stageNames[stage]}</summary>
                      <ForecastCard forecast={original} stage={stageNames[stage]} map={map} />
                    </details>
                  )}
                </div>
              )
            })}
          </div>
          <ArchivedPrices map={map} />
        </>
      )}
    </>
  )
}

export function PublicArchive({
  route,
  navigate,
  retry,
}: {
  readonly route: string
  readonly navigate: (path: string) => void
  readonly retry: () => void
}) {
  const [lastGame, setLastGame] = useState("")
  useEffect(() => {
    let active = true
    loadVerifiedResults().then(([facts]) => {
      if (!active || !facts) return
      const stamps = Object.values(facts.tournaments)
        .flatMap((t) =>
          Object.values(t.series).flatMap((s) =>
            s.maps.map((m) => Date.parse(m.started_at_utc ?? "")),
          ),
        )
        .filter(Number.isFinite)
      if (stamps.length)
        setLastGame(
          new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Bangkok", dateStyle: "long" }).format(
            Math.max(...stamps),
          ),
        )
    })
    return () => {
      active = false
    }
  }, [])
  const [section = "/schedule", params] = route.split("?")
  const filters = new URLSearchParams(params)
  const selected = filters.get("tournament") || mainTournament
  const map = section.startsWith("/maps/") || section.startsWith("/series/")
  return (
    <>
      <Notice>
        Сервер трекера недоступен. Открыт публичный архив результатов.
        {lastGame && <> Последняя датированная карта в архиве — {lastGame}.</>}{" "}
        <button type="button" className="secondary" onClick={retry}>
          Повторить подключение
        </button>
      </Notice>
      {map ? (
        <>
          <Back onClick={() => navigate(`/schedule?tournament=${encodeURIComponent(selected)}`)} />
          <ArchiveCard key={section} path={section} />
        </>
      ) : section === "/schedule" ? (
        <Schedule
          key={selected}
          api={archiveReader}
          tournament={selected}
          navigate={navigate}
          view={filters.get("view")}
          archive
        />
      ) : (
        <>
          <Header
            title={
              section === "/stats"
                ? "Статистика"
                : section === "/history"
                  ? "История"
                  : "Результаты турниров"
            }
            subtitle="Опубликованные карты и прогнозы."
          />
          <TournamentPicker
            api={archiveReader}
            value={selected}
            onChange={(key) => navigate(`${section}?tournament=${encodeURIComponent(key)}`)}
          />
          <TrackedReport
            key={route}
            api={archiveReader}
            tournament={selected}
            initialSearch={filters.get("series") ?? ""}
            stats={section === "/stats"}
          />
        </>
      )}
    </>
  )
}
