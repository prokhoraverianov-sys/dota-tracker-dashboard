import { Save } from "lucide-react"
export function CalculateBar({
  pre,
  post,
  busy,
  postProblem,
  picked,
  onPre,
  onPost,
}: {
  readonly pre: boolean
  readonly post: boolean
  readonly busy: string
  readonly postProblem: string | null
  readonly picked: number
  readonly onPre: () => void
  readonly onPost: () => void
}) {
  return (
    <section className="calculate-bar">
      <div>
        <strong>Сохранить прогноз</strong>
        <p className="muted">PRE не учитывает правки состава. POST требует 10 уникальных героев.</p>
        {!post && (
          <p className={postProblem ? "warning-text" : "muted"} aria-live="polite">
            Герои: {picked}/10. {postProblem ?? "Драфт готов к расчёту POST."}
          </p>
        )}
      </div>
      <div className="actions">
        <button type="button" className="secondary" disabled={pre || !!busy} onClick={onPre}>
          <Save size={16} />
          {busy === "pre_match" ? "Рассчитываем…" : pre ? "PRE сохранён" : "Рассчитать PRE"}
        </button>
        <button
          type="button"
          className="primary"
          disabled={post || !!busy || postProblem !== null}
          onClick={onPost}
        >
          <Save size={16} />
          {busy === "post_draft" ? "Рассчитываем…" : post ? "POST сохранён" : "Рассчитать POST"}
        </button>
      </div>
    </section>
  )
}
