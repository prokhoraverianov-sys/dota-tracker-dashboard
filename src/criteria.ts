import { z } from "zod"

const prefix = "criterion_context="
const schema = z.object({
  schema_version: z.literal(1),
  oriented_team_a: z.string(),
  oriented_team_b: z.string(),
  criteria: z.array(
    z.object({
      criterion: z.string(),
      signed_logit: z.number(),
      availability: z.enum(["supported", "unknown"]),
    }),
  ),
})

export const criterionLabels: Readonly<Record<string, string | undefined>> = {
  team_form: "Форма команд",
  player_form: "Форма игроков",
  player_hero: "Игроки на выбранных героях",
  synergy_lineup: "Сочетаемость героев",
  laning: "Линии",
  midgame: "Середина игры",
  late_game: "Поздняя игра",
  counterpick: "Контрпики",
  technical_data_support: "Техническое покрытие",
}

export function readCriteria(reasons: readonly string[] | undefined, teamA: string, teamB: string) {
  const raw = reasons?.find((reason) => reason.startsWith(prefix))
  if (!raw) return []
  try {
    const result = schema.safeParse(JSON.parse(raw.slice(prefix.length)))
    if (
      result.success &&
      result.data.oriented_team_a === teamA &&
      result.data.oriented_team_b === teamB
    ) {
      return result.data.criteria
    }
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
  }
  return []
}
