import { ArrowDown, Radio, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type Api, ApiError } from "./api"
import { CalculateBar } from "./CalculateBar"
import { CurrentOdds } from "./CurrentOdds"
import {
  type Catalog,
  type Draft,
  type Forecast,
  forecastSchema,
  type LiveProposal,
  liveSchema,
  type MapDTO,
  mapSchema,
  message,
  type Stage,
  savedSchema,
} from "./contracts"
import { DraftEditor } from "./DraftEditor"
import { draftKey, initialDraft, loadDraft, mapPath, time, validatePost } from "./domain"
import { Delta, ForecastCard } from "./ForecastCard"
import { draftCompleteness, LiveReview } from "./LiveReview"
import { MapOutcome } from "./MapOutcome"
import { evaluateMap, preForecastBlock, retrospectiveForecast } from "./map-outcome"
import { PLAY_IN_NAME, PLAY_IN_ROUTE } from "./playin-data"
import { Quotes } from "./Quotes"
import { tournamentPhase } from "./tournament-phase"
import { Back, Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"
import "./analysis-presentation.css"
export function MapWorkspace({
  initial,
  tournamentKey,
  api,
  catalog,
  navigate,
  setDirty,
}: {
  readonly initial: MapDTO
  readonly tournamentKey: string | null
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (path: string) => void
  readonly setDirty: (value: boolean) => void
}) {
  const [map, setMap] = useState(initial)
  const key = draftKey(initial)
  const [editedDraft, setEditedDraft] = useState<Draft | null>(() => {
    const baseline = initialDraft(initial)
    const saved = loadDraft(key, baseline)
    return JSON.stringify(saved) === JSON.stringify(baseline) ? null : saved
  })
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [retrospective, setRetrospective] = useState<Forecast | null>(null)
  const [proposal, setProposal] = useState<LiveProposal | null>(null)
  const forecastSectionRef = useRef<HTMLElement>(null)
  const calculationRef = useRef<HTMLFieldSetElement>(null)
  const oddsSectionRef = useRef<HTMLDivElement>(null)
  const retry = useRef<{ body: string; key: string } | null>(null)
  const unplayed = map.play_status === "unplayed"
  const recorded = map.retrospective_post
  const locked = !!map.result || !!recorded || unplayed
  const editorLocked = locked || !!map.post
  const baseline = initialDraft(map)
  const draft = editorLocked ? baseline : (editedDraft ?? baseline)
  const dirty = editedDraft !== null && JSON.stringify(editedDraft) !== JSON.stringify(baseline)
  const pollPath = mapPath(map)
  const pollable = !unplayed && (!map.result || (!map.post && !recorded))
  const preProblem = preForecastBlock(map)
  const pollInterval = !map.result && !map.post ? 2_000 : 15_000
  useEffect(() => {
    setDirty(dirty && !editorLocked)
    if (dirty) localStorage.setItem(key, JSON.stringify(editedDraft))
    else localStorage.removeItem(key)
  }, [dirty, editedDraft, key, editorLocked, setDirty])
  useEffect(() => {
    if (!pollable || busy) return
    let active = true
    let pending = false
    async function refreshCard() {
      if (pending || document.visibilityState !== "visible") return
      pending = true
      try {
        const latest = await api.request(pollPath, mapSchema)
        if (active)
          setMap((current) => {
            if (latest.revision < current.revision) return current
            if (
              !latest.result_conflict &&
              current.post?.post_draft_quotes?.length &&
              latest.post?.snapshot_id === current.post.snapshot_id &&
              !latest.post.post_draft_quotes?.length
            )
              return { ...latest, post: current.post }
            return latest
          })
      } catch {
        // Keep the last confirmed card during a temporary refresh failure.
      } finally {
        pending = false
      }
    }
    const timer = window.setInterval(refreshCard, pollInterval)
    document.addEventListener("visibilitychange", refreshCard)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshCard)
    }
  }, [api, busy, pollInterval, pollPath, pollable])
  function edit(value: Draft) {
    setEditedDraft(value)
    setProposal(null)
  }
  async function reserve(): Promise<MapDTO> {
    if (map.map_id !== null) return map
    const reserved = await api.request(`${mapPath(map)}/reserve`, mapSchema, {})
    setMap(reserved)
    return reserved
  }
  async function calculate(stage: Stage, input = draft, reserved?: MapDTO) {
    if (stage === "pre_match" && preProblem) {
      setError(preProblem)
      return
    }
    if (stage === "post_draft") {
      const problem = validatePost(input, catalog.heroes)
      if (problem) {
        setError(problem)
        return
      }
    }
    setBusy(stage)
    setError("")
    setNotice("")
    try {
      const current = reserved ?? (await reserve())
      if (stage === "pre_match") {
        const problem = preForecastBlock(current)
        if (problem) {
          setError(problem)
          return
        }
      }
      const body = { expected_revision: current.revision, input }
      if (current.result && stage === "post_draft" && current.map_id !== null) {
        const analysis = await api.request(
          `/maps/${current.map_id}/retrospective-post`,
          forecastSchema.shape.analysis,
          body,
        )
        setRetrospective({
          map_id: current.map_id,
          snapshot_id: "retrospective",
          stage,
          created_at_utc: new Date().toISOString(),
          analysis,
          players_a: input.team_a.players,
          players_b: input.team_b.players,
          heroes_a: input.team_a.heroes,
          heroes_b: input.team_b.heroes,
          explanation: "",
          odds: { provider: null, source_url: null, observed_at_utc: null, phase: null },
          candidates: [],
        })
        window.requestAnimationFrame(() => forecastSectionRef.current?.scrollIntoView())
        return
      }
      const serialized = JSON.stringify({ stage, map: current.map_id, body })
      const requestKey =
        retry.current?.body === serialized ? retry.current.key : crypto.randomUUID()
      retry.current = { body: serialized, key: requestKey }
      const result = await api.request(
        `/maps/${current.map_id}/forecasts/${stage}`,
        savedSchema,
        body,
        requestKey,
      )
      const savedPost = result.map.post
      setMap(
        stage === "post_draft" &&
          result.forecast.stage === stage &&
          (!savedPost ||
            (savedPost.snapshot_id === result.forecast.snapshot_id &&
              !savedPost.post_draft_quotes?.length &&
              result.forecast.post_draft_quotes?.length))
          ? { ...result.map, post: result.forecast }
          : result.map,
      )
      if (stage === "post_draft") setEditedDraft(null)
      retry.current = null
      window.requestAnimationFrame(() => forecastSectionRef.current?.scrollIntoView())
      setNotice(
        result.replayed
          ? "Подтверждено ранее выполненное сохранение."
          : "Прогноз сохранён. Старые снимки не изменены.",
      )
    } catch (err) {
      setError(message(err))
      if (err instanceof ApiError && err.status === 409) {
        try {
          setMap(await api.request(mapPath(map), mapSchema))
          setNotice(
            "Данные карты обновлены с сервера. Ваш черновик сохранён; проверьте его перед повтором.",
          )
        } catch (refreshError) {
          setNotice(`Не удалось обновить карту: ${message(refreshError)}`)
        }
      }
    } finally {
      setBusy("")
    }
  }
  async function live() {
    setBusy("live")
    setError("")
    setProposal(null)
    try {
      const current = await reserve()
      const source = await api.request(`/maps/${current.map_id}/live`, liveSchema, { input: draft })
      if (
        !current.post &&
        !current.retrospective_post &&
        source.status === "ok" &&
        source.conflicts.length === 0 &&
        !validatePost(source.input, catalog.heroes)
      ) {
        if (!editorLocked) setEditedDraft(source.input)
        await calculate("post_draft", source.input, current)
      } else {
        setProposal(source)
      }
    } catch (err) {
      setError(`${message(err)} Ваш черновик не изменён.`)
    } finally {
      setBusy("")
    }
  }
  function discard() {
    if (window.confirm("Удалить локальные изменения и вернуться к сохранённому составу?")) {
      setEditedDraft(null)
      setProposal(null)
      localStorage.removeItem(key)
    }
  }
  function showCalculation() {
    const section = calculationRef.current
    section?.focus({ preventScroll: true })
    section?.scrollIntoView()
  }
  const savedPre = retrospectiveForecast(map, "pre")
  const savedPost = retrospectiveForecast(map, "post")
  const preVerdict = evaluateMap(map, "pre").forecast
  const archivedPre = map.archived_pre && preVerdict === map.archived_pre ? map.archived_pre : null
  const pre = archivedPre ?? (preVerdict === map.pre ? map.pre : savedPre)
  const post =
    (evaluateMap(map, "post").forecast === map.post ? map.post : savedPost) ?? retrospective
  const forecastSection = (
    <section ref={forecastSectionRef} className="workspace-section" aria-label="Прогнозы карты">
      <div className="workspace-heading">
        <h2>Прогнозы карты</h2>
      </div>
      <Delta team={map.team_a} pre={pre} post={post} />
      <div className="two-columns forecasts">
        <div>
          <ForecastCard
            forecast={pre}
            stage="PRE"
            map={map}
            preProblem={preProblem}
            archived={!!archivedPre}
          />
          {map.archived_pre && !archivedPre && (
            <details>
              <summary>Ранняя запись PRE до счёта 1:1</summary>
              <ForecastCard forecast={map.archived_pre} stage="PRE" map={map} archived />
            </details>
          )}
          {map.pre && pre !== map.pre && (
            <details>
              <summary>Исходная запись PRE</summary>
              <ForecastCard forecast={map.pre} stage="PRE" map={map} />
            </details>
          )}
        </div>
        <div>
          <ForecastCard
            forecast={post}
            stage="POST"
            map={map}
            capturing={!locked && busy === "post_draft"}
          />
          {post?.snapshot_id === "retrospective" && recorded?.source_url.startsWith("https://") && (
            <a
              className="forecast-source"
              href={recorded.source_url}
              target="_blank"
              rel="noreferrer"
            >
              Источник драфта ↗
            </a>
          )}
          {map.post && post !== map.post && (
            <details>
              <summary>Исходная запись POST</summary>
              <ForecastCard forecast={map.post} stage="POST" map={map} />
            </details>
          )}
        </div>
      </div>
    </section>
  )
  const phase = tournamentPhase(map.series_id ?? "")
  return (
    <>
      <Back
        onClick={() =>
          navigate(
            tournamentKey
              ? `/schedule?tournament=${encodeURIComponent(tournamentKey)}`
              : map.tournament === PLAY_IN_NAME || map.series_id?.startsWith("e3pi-")
                ? PLAY_IN_ROUTE
                : map.tournament === "1win Essence III"
                  ? "/schedule?tournament=1win-essence-3"
                  : "/schedule",
          )
        }
      />
      <header className="page-heading map-heading">
        <div className="map-heading-main">
          <p className="muted">{[map.tournament, phase].filter(Boolean).join(" · ")}</p>
          <p className="map-number">Карта {map.map_number ?? map.map_id}</p>
          <h1 className="map-team-heading">
            <span className="map-heading-side">
              <small>
                <span className="team-dot team_a" /> Команда A
              </small>
              <TeamIdentity name={map.team_a} size="lg" />
            </span>
            <span className="map-heading-side">
              <small>
                <span className="team-dot team_b" /> Команда B
              </small>
              <TeamIdentity name={map.team_b} size="lg" />
            </span>
          </h1>
          {map.result?.started_at_utc && (
            <p className="muted">Начало {time(map.result.started_at_utc)} · UTC+7</p>
          )}
        </div>
        <span className="badge">
          {unplayed ? "Не сыграна" : map.result ? "Карта завершена" : "Ожидается результат"}
        </span>
      </header>
      <MapOutcome map={map} />
      {unplayed && <Notice>Серия завершилась до этой карты.</Notice>}
      {map.analysis_context === "retrospective" && (
        <Notice>
          Ретроспективный разбор: карта уже началась или завершена. PRE и POST, рассчитанные сейчас,
          сохраняются с текущим временем и не являются прогнозами, сделанными до матча.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {!unplayed && (
        <nav className="workspace-nav" aria-label="Разделы карты">
          <button
            type="button"
            className="text-button"
            onClick={() => forecastSectionRef.current?.scrollIntoView()}
          >
            <ArrowDown size={15} /> Прогнозы
          </button>
          {!locked && (!map.pre || !map.post) && (
            <button type="button" className="text-button" onClick={showCalculation}>
              <ArrowDown size={15} /> К расчёту
            </button>
          )}
          {map.series_id && (
            <button
              type="button"
              className="text-button"
              onClick={() => oddsSectionRef.current?.scrollIntoView()}
            >
              <ArrowDown size={15} /> Коэффициенты
            </button>
          )}
        </nav>
      )}
      {!unplayed && forecastSection}
      <div ref={oddsSectionRef} className="workspace-anchor">
        <CurrentOdds map={map} api={api} />
      </div>
      {!unplayed && (
        <section className="workspace-section draft-section" aria-label="Подготовка карты">
          <div className="editor-toolbar">
            <div>
              <h2>Подготовка карты</h2>
              <p className="muted">
                {dirty
                  ? editorLocked
                    ? "Локальный черновик сохранён. Здесь показан состав с сервера."
                    : "Черновик сохранён в браузере. Проверьте состав и пики перед POST."
                  : "Загрузите пики из источника или заполните 10 фиксированных позиций вручную."}
              </p>
            </div>
            <div className="actions">
              <button type="button" className="primary" disabled={!!busy} onClick={live}>
                <Radio size={16} />
                {busy === "live"
                  ? "Загружаем драфт…"
                  : map.post || recorded
                    ? "Получить данные источника"
                    : locked
                      ? "Загрузить драфт и рассчитать ретроспективный POST"
                      : "Загрузить драфт и рассчитать POST"}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={editorLocked || !dirty || !!busy}
                onClick={discard}
              >
                <RotateCcw size={16} />
                Сбросить
              </button>
            </div>
          </div>
          {proposal && (
            <LiveReview
              proposal={proposal}
              current={draft}
              readOnly={editorLocked}
              cancel={() => setProposal(null)}
              apply={() => {
                setEditedDraft(proposal.input)
                setProposal(null)
                setNotice("Предложение применено к черновику. Проверьте позиции перед POST.")
                if (!validatePost(proposal.input, catalog.heroes)) {
                  window.requestAnimationFrame(showCalculation)
                }
              }}
            />
          )}
          <DraftEditor
            map={map}
            draft={draft}
            catalog={catalog}
            onChange={edit}
            disabled={locked || !!busy || !!map.post}
          />
          <Quotes draft={draft} onChange={edit} map={map} disabled={editorLocked || !!busy} />
          {locked && !post && (
            <p className="muted">
              Карта завершена. Ретроспективный расчёт доступен по драфту из источника.
            </p>
          )}
          {!locked && (
            <fieldset
              ref={calculationRef}
              className="workspace-anchor"
              aria-label="Расчёт PRE и POST"
              tabIndex={-1}
            >
              <CalculateBar
                pre={!!map.pre}
                post={!!map.post}
                busy={busy}
                preProblem={preProblem}
                postProblem={validatePost(draft, catalog.heroes)}
                picked={draftCompleteness(draft)}
                onPre={() => calculate("pre_match")}
                onPost={() => calculate("post_draft")}
              />
            </fieldset>
          )}
        </section>
      )}
    </>
  )
}
