import type { Draft, MapDTO } from "./contracts"
export function Quotes({
  draft,
  onChange,
  disabled,
  map,
}: {
  readonly draft: Draft
  readonly onChange: (draft: Draft) => void
  readonly disabled: boolean
  readonly map: MapDTO
}) {
  const fields = {
    a: draft.winner_prices.match(/A=([\d.]+)/)?.[1] ?? "",
    b: draft.winner_prices.match(/B=([\d.]+)/)?.[1] ?? "",
    line: draft.total_prices.split(",")[0] ?? "",
    over: draft.total_prices.match(/O=([\d.]+)/)?.[1] ?? "",
    under: draft.total_prices.match(/U=([\d.]+)/)?.[1] ?? "",
  }
  function change(field: keyof typeof fields, value: string) {
    const next = { ...fields, [field]: value }
    onChange({
      ...draft,
      winner_prices: next.a || next.b ? `A=${next.a},B=${next.b}` : "",
      total_prices:
        next.line || next.over || next.under ? `${next.line},O=${next.over},U=${next.under}` : "",
    })
  }
  return (
    <details className="panel quote-editor">
      <summary>Котировки · необязательно</summary>
      <p className="muted">
        Пустые поля разрешают серверу использовать доступные котировки. Укажите обе цены для
        выбранного рынка.
      </p>
      <div className="quote-fields">
        {(
          [
            { key: "a", label: `Победа ${map.team_a}` },
            { key: "b", label: `Победа ${map.team_b}` },
            { key: "line", label: "Тотал, минуты" },
            { key: "over", label: "Больше" },
            { key: "under", label: "Меньше" },
          ] as const
        ).map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min={field.key === "line" ? "1" : "1.01"}
              step="0.01"
              disabled={disabled}
              value={fields[field.key]}
              onChange={(e) => change(field.key, e.target.value)}
              placeholder={field.key === "line" ? "40.5" : "1.90"}
            />
          </label>
        ))}
      </div>
    </details>
  )
}
