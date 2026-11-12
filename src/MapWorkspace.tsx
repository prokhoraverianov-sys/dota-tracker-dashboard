import { ArrowDown, Radio, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type Api, ApiError } from "./api"
import { CalculateBar } from "./CalculateBar"
import { CurrentOdds } from "./CurrentOdds"
import {
  type Catalog,
  type Draft,
  type LiveProposal,
  liveSchema,
  type MapDTO,
  mapSchema,
  message,
  type Stage,
  savedSchema,
} from "./contracts"
import { DraftEditor } from "./DraftEditor"
import { draftKey, initialDraft, loadDraft, mapPath, mapStatus, validatePost } from "./domain"
import { Delta, ForecastCard } from "./ForecastCard"
import { draftCompleteness, LiveReview } from "./LiveReview"
import { PLAY_IN_NAME, PLAY_IN_ROUTE } from "./playin-data"
import { Quotes } from "./Quotes"
import { ResultForm } from "./ResultForm"
import { Back, Notice } from "./ui"
import { TeamIdentity } from "./VisualIdentity"
import "./analysis-presentation.css"
export function MapWorkspace({
  initial,
  api,
  catalog,
  navigate,
  setDirty,
}: {
  readonly initial: MapDTO
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (path: string) => void
  readonly setDirty: (value: boolean) => void
}) {
  const [map, setMap] = useState(initial)
  const key = draftKey(initial)
  const [draft, setDraft] = useState(() => loadDraft(key, initialDraft(initial)))
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [proposal, setProposal] = useState<LiveProposal | null>(null)
  const forecastSectionRef = useRef<HTMLElement>(null)
  const calculationRef = useRef<HTMLFieldSetElement>(null)
  const oddsSectionRef = useRef<HTMLDivElement>(null)
  const retry = useRef<{ body: string; key: string } | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft(map))
  const locked = !!map.result
  const editorLocked = locked || !!map.post
  useEffect(() => {
    setDirty(dirty && !editorLocked)
    if (dirty && !editorLocked) localStorage.setItem(key, JSON.stringify(draft))
    else localStorage.removeItem(key)
  }, [dirty, draft, key, editorLocked, setDirty])
  function edit(value: Draft) {
    setDraft(value)
    setProposal(null)
  }
  async function reserve(): Promise<MapDTO> {
    if (map.map_id !== null) return map
    const reserved = await api.request(`${mapPath(map)}/reserve`, mapSchema, {})
    setMap(reserved)
    return reserved
  }
  async function calculate(stage: Stage, input = draft, reserved?: MapDTO) {
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
      const body = { expected_revision: current.revision, input }
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
      setMap(result.map)
      if (stage === "post_draft") setDraft(initialDraft(result.map))
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
        !current.result &&
        !current.post &&
        source.status === "ok" &&
        source.conflicts.length === 0 &&
        !validatePost(source.input, catalog.heroes)
      ) {
        setDraft(source.input)
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
      setDraft(initialDraft(map))
      setProposal(null)
      localStorage.removeItem(key)
    }
  }
  function showCalculation() {
    const section = calculationRef.current
    section?.focus({ preventScroll: true })
    section?.scrollIntoView()
  }
  const forecastSection = (
    <section ref={forecastSectionRef} className="workspace-section" aria-label="Прогнозы карты">
      <div className="workspace-heading">
        <h2>Прогнозы карты</h2>
        <p className="muted">Вероятности, длительность, цены и данные расчёта для каждого этапа.</p>
      </div>
      {(map.pre || map.post) && <Delta map={map} />}
      <div className="two-columns forecasts">
        <ForecastCard forecast={map.pre} stage="PRE" map={map} />
        <ForecastCard forecast={map.post} stage="POST" map={map} />
      </div>
    </section>
  )
  const prepareFirst = !locked && !map.post
  return (
    <>
      <Back
        onClick={() =>
          navigate(
            map.tournament === PLAY_IN_NAME || map.series_id?.startsWith("e3pi-")
              ? PLAY_IN_ROUTE
              : map.tournament === "1win Essence III"
                ? "/schedule?tournament=1win-essence-3"
                : "/schedule",
          )
        }
      />
      <header className="page-heading map-heading">
        <div className="map-heading-main">
          <p className="eyebrow">{map.tournament ?? "Матч"}</p>
          <h1 className="map-team-heading">
            <TeamIdentity name={map.team_a} size="lg" />
            <span className="map-versus"> — </span>
            <TeamIdentity name={map.team_b} size="lg" />
          </h1>
          <p className="muted">
            Карта {map.map_number ?? map.map_id} · {mapStatus(map)}
          </p>
        </div>
        <span className="badge">{locked ? "Карта завершена" : "Режим наблюдения"}</span>
      </header>
      {map.analysis_context === "retrospective" && (
        <Notice>
          Ретроспективный разбор: карта уже началась или завершена. PRE и POST, рассчитанные сейчас,
          сохраняются с текущим временем и не являются прогнозами, сделанными до матча.
        </Notice>
      )}
      {map.tournament === "PARI Universe" && map.series_id && (
        <Notice>
          Результаты сыгранных карт и архивные котировки доступны в истории серии.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => navigate(`/history?series=${encodeURIComponent(map.series_id ?? "")}`)}
          >
            Открыть историю серии
          </button>
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <nav className="workspace-nav" aria-label="Разделы карты">
        <span>
          <strong>PRE</strong> {map.pre ? "сохранён" : "до драфта"}
        </span>
        <span>
          <strong>POST</strong> {map.post ? "сохранён" : `${draftCompleteness(draft)}/10 героев`}
        </span>
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
            <ArrowDown size={15} /> Текущие цены
          </button>
        )}
      </nav>
      {!prepareFirst && forecastSection}
      <section className="workspace-section draft-section" aria-label="Подготовка карты">
        <div className="editor-toolbar">
          <div>
            <h2>Подготовка карты</h2>
            <p className="muted">
              {dirty && !locked
                ? "Черновик сохранён в браузере. Проверьте состав и пики перед POST."
                : "Загрузите пики из источника или заполните 10 фиксированных позиций вручную."}
            </p>
          </div>
          <div className="actions">
            <button type="button" className="primary" disabled={!!busy} onClick={live}>
              <Radio size={16} />
              {busy === "live"
                ? "Загружаем драфт…"
                : editorLocked
                  ? "Получить данные источника"
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
              setDraft(proposal.input)
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
        {locked && !map.post && (
          <p className="muted">Карта завершена. Драфт можно посмотреть в данных источника.</p>
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
              postProblem={validatePost(draft, catalog.heroes)}
              picked={draftCompleteness(draft)}
              onPre={() => calculate("pre_match")}
              onPost={() => calculate("post_draft")}
            />
          </fieldset>
        )}
      </section>
      <div ref={oddsSectionRef} className="workspace-anchor">
        <CurrentOdds map={map} api={api} />
      </div>
      {prepareFirst && forecastSection}
      <ResultForm
        onRefresh={setMap}
        map={map}
        api={api}
        onSaved={(value) => {
          setMap(value)
          setDraft(initialDraft(value))
          setDirty(false)
        }}
      />
    </>
  )
}
