import { type Draft, draftSchema, type MapDTO } from "./contracts"
export const positions = [1, 2, 3, 4, 5] as const
export function initialDraft(map: MapDTO): Draft {
  const saved = map.post
  const fill = (values: string[]) => positions.map((_, i) => values[i] ?? "")
  return {
    team_a: {
      players: fill(saved?.players_a ?? map.rosters.team_a),
      heroes: fill(saved?.heroes_a ?? []),
    },
    team_b: {
      players: fill(saved?.players_b ?? map.rosters.team_b),
      heroes: fill(saved?.heroes_b ?? []),
    },
    winner_prices: "",
    total_prices: "",
  }
}
export function draftKey(map: MapDTO): string {
  return `dota-draft:${map.series_id ?? "saved"}:${map.map_number ?? map.map_id}`
}
export function loadDraft(key: string, fallback: Draft): Draft {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : fallback
  } catch (error) {
    if (error instanceof SyntaxError) return fallback
    throw error
  }
}
export function validatePost(draft: Draft, heroes: readonly string[]): string | null {
  const picks = [...draft.team_a.heroes, ...draft.team_b.heroes]
  if ([...draft.team_a.players, ...draft.team_b.players].some((x) => !x.trim()))
    return "Заполните игроков на всех десяти позициях."
  if (picks.some((x) => !heroes.includes(x))) return "Выберите десять героев из каталога."
  if (new Set(picks).size !== 10) return "Каждый герой может быть выбран только один раз."
  return null
}
export function parseBulk(text: string, heroes: readonly string[]): string[] | null {
  const input = text
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
  const result = input.map((x) => heroes.find((hero) => hero.toLowerCase() === x.toLowerCase()))
  return result.length === 5 && result.every((x): x is string => x !== undefined) ? result : null
}
export function time(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "нет времени"
}
export function percent(value: number | null | undefined): string {
  return value == null ? "Нет оценки" : `${(value * 100).toFixed(1)}%`
}
export function mapPath(map: MapDTO): string {
  return map.map_id
    ? `/maps/${map.map_id}`
    : `/series/${encodeURIComponent(map.series_id ?? "")}/maps/${map.map_number}`
}
export function mapStatus(map: MapDTO): string {
  return map.result
    ? "Завершена"
    : map.post
      ? "POST сохранён"
      : map.pre
        ? "PRE сохранён"
        : "Ожидает анализа"
}
export function prices(
  a: string,
  b: string,
  total: string,
  over: string,
  under: string,
): { winner_prices: string; total_prices: string } {
  return {
    winner_prices: a && b ? `A=${a},B=${b}` : "",
    total_prices: total && over && under ? `${total},O=${over},U=${under}` : "",
  }
}
export function query(values: Readonly<Record<string, string>>): string {
  return new URLSearchParams(
    Object.entries(values).filter(([, value]) => value.length > 0),
  ).toString()
}
