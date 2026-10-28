import { z } from "zod"
export const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1MB3IqnQjt7GzjwRHnKq_kaAGbBpU6kNTPU_0veq8UG8/edit"
export const provenanceSchema = z.object({
  as_of_utc: z.string(),
  model_version: z.string(),
  model_sha256: z.string(),
  sheet_url: z.string(),
  analytical_maps: z.number(),
  history_overlap_maps: z.number(),
  notice: z.string(),
})
export type Provenance = z.infer<typeof provenanceSchema>
const stage = z.object({
  probability_team_a: z.number(),
  duration_seconds: z.number(),
  criteria: z.record(z.string(), z.number()),
})
export const tournamentHistorySchema = z.object({
  provenance: provenanceSchema,
  items: z.array(
    z.object({
      match_id: z.string(),
      series_id: z.string().nullable(),
      map_number: z.number().nullable(),
      starts_at_utc: z.string(),
      team_a: z.string(),
      team_b: z.string(),
      winner: z.string().nullable(),
      duration_seconds: z.number().nullable(),
      pre: stage.nullable(),
      post: stage.nullable(),
      in_model_history: z.boolean().nullable(),
      source_url: z.string(),
    }),
  ),
})
export type CompletedMatch = z.infer<typeof tournamentHistorySchema>["items"][number]
const stats = z.object({
  samples: z.number(),
  winner_correct: z.number(),
  winner_accuracy: z.number().nullable(),
  duration_samples: z.number(),
  duration_mae_minutes: z.number().nullable(),
  control_total_minutes: z.number(),
  control_total_correct: z.number(),
  control_total_samples: z.number(),
})
export const tournamentStatsSchema = z.object({
  provenance: provenanceSchema,
  completed_maps: z.number(),
  paired_maps: z.number(),
  pre: stats,
  post: stats,
})
export type ReportFilters = {
  readonly team: string
  readonly date_from: string
  readonly date_to: string
}
export const emptyFilters: ReportFilters = { team: "", date_from: "", date_to: "" }
export function minutes(seconds: number | null): string {
  return seconds === null
    ? "Нет данных"
    : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
}
export function winnerPrediction(match: CompletedMatch, stage: "pre" | "post"): string {
  const value = match[stage]?.probability_team_a
  return value == null ? "Нет расчёта" : value >= 0.5 ? match.team_a : match.team_b
}
