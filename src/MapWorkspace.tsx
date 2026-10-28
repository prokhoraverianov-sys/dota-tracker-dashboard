import { Radio, RotateCcw, Save } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type Api, ApiError } from "./api"
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
import { LiveReview } from "./LiveReview"
import { Quotes } from "./Quotes"
import { ResultForm } from "./ResultForm"
import { Back, Header, Notice } from "./ui"
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
  async function calculate(stage: Stage) {
    if (stage === "post_draft") {
      const problem = validatePost(draft, catalog.heroes)
      if (problem) {
        setError(problem)
        return
      }
    }
    setBusy(stage)
    setError("")
    setNotice("")
    try {
      const current = await reserve()
      const body = { expected_revision: current.revision, input: draft }
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
    if (
      map.map_id === null &&
      !window.confirm(
        "Подготовить карту и запросить данные источника? Будет создана запись карты без прогноза.",
      )
    )
      return
    setBusy("live")
    setError("")
    setProposal(null)
    try {
      const current = await reserve()
      setProposal(await api.request(`/maps/${current.map_id}/live`, liveSchema, { input: draft }))
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
  return (
    <>
      <Back onClick={() => navigate("/schedule")} />
      <Header
        title={`${map.team_a} vs ${map.team_b}`}
        subtitle={`${map.tournament} · Карта ${map.map_number ?? map.map_id} · ${mapStatus(map)}`}
      >
        <span className="badge">{map.result ? "Только чтение" : "Shadow only"}</span>
      </Header>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <div className="two-columns forecasts">
        <ForecastCard forecast={map.pre} stage="PRE" map={map} api={api} />
        <ForecastCard forecast={map.post} stage="POST" map={map} api={api} />
      </div>
      <Delta map={map} />
      <div className="editor-toolbar">
        <div>
          <h2>Подготовка карты</h2>
          <p className="muted">
            {dirty && !locked
              ? "Несохранённый черновик хранится в этом браузере"
              : "Состав по фиксированным позициям"}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={editorLocked || !!busy}
            onClick={live}
          >
            <Radio size={16} />
            {busy === "live" ? "Проверяем…" : "Получить данные источника"}
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
          cancel={() => setProposal(null)}
          apply={() => {
            setDraft(proposal.input)
            setProposal(null)
            setNotice("Предложение применено к черновику. Проверьте позиции перед POST.")
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
      {!locked && (
        <section className="calculate-bar">
          <div>
            <strong>Сохранить прогноз</strong>
            <p className="muted">
              PRE не учитывает правки состава. POST требует 10 уникальных героев.
            </p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={!!map.pre || !!busy}
              onClick={() => calculate("pre_match")}
            >
              <Save size={16} />
              {busy === "pre_match" ? "Рассчитываем…" : map.pre ? "PRE сохранён" : "Рассчитать PRE"}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!!map.post || !!busy}
              onClick={() => calculate("post_draft")}
            >
              <Save size={16} />
              {busy === "post_draft"
                ? "Рассчитываем…"
                : map.post
                  ? "POST сохранён"
                  : "Рассчитать POST"}
            </button>
          </div>
        </section>
      )}
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
