import { z } from "zod"
export const stageSchema = z.enum(["pre_match", "post_draft"])
export type Stage = z.infer<typeof stageSchema>
export const draftSchema = z.object({
  team_a: z.object({
    players: z.array(z.string()).length(5),
    heroes: z.array(z.string()).length(5),
  }),
  team_b: z.object({
    players: z.array(z.string()).length(5),
    heroes: z.array(z.string()).length(5),
  }),
  winner_prices: z.string(),
  total_prices: z.string(),
})
export type Draft = z.infer<typeof draftSchema>
const shadowSchema = z
  .object({
    winner_probability_team_a: z.number().min(0).max(1).nullable().optional(),
    duration_mean_seconds: z.number().nullable().optional(),
    duration_over_probability: z.number().nullable().optional(),
    duration_line_seconds: z.number().nullable().optional(),
    reasons: z.array(z.string()).optional(),
  })
  .passthrough()
export const candidateSchema = z.object({
  market: z.enum(["winner", "duration_over", "duration_under"]),
  selection: z.string(),
  odds: z
    .union([z.string(), z.number()])
    .transform(Number)
    .refine((value) => Number.isFinite(value) && value > 1),
  line_minutes: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((value) => (value === null ? null : Number(value))),
})
export type Candidate = z.infer<typeof candidateSchema>
export const forecastSchema = z.object({
  map_id: z.number(),
  snapshot_id: z.union([z.number(), z.string()]),
  stage: stageSchema,
  created_at_utc: z.string(),
  analysis: z
    .object({
      shadow_forecast: shadowSchema.nullable().optional(),
      metadata: z
        .object({
          model_version: z.string().nullable(),
          validation_status: z.string().nullable().optional(),
        })
        .passthrough()
        .optional(),
      missing_data: z.array(z.string()).optional(),
    })
    .passthrough(),
  players_a: z.array(z.string()),
  players_b: z.array(z.string()),
  heroes_a: z.array(z.string()),
  heroes_b: z.array(z.string()),
  explanation: z.string(),
  odds: z.object({
    provider: z.string().nullable(),
    source_url: z.string().nullable(),
    observed_at_utc: z.string().nullable(),
    phase: z.string().nullable(),
  }),
  candidates: z.array(candidateSchema),
})
export type Forecast = z.infer<typeof forecastSchema>
export const mapSchema = z.object({
  map_id: z.number().nullable(),
  series_id: z.string().nullable(),
  map_number: z.number().nullable(),
  revision: z.number(),
  label: z.string(),
  team_a: z.string(),
  team_b: z.string(),
  tournament: z.string().nullable(),
  pre: forecastSchema.nullable(),
  post: forecastSchema.nullable(),
  result: z
    .object({
      winner: z.enum(["A", "B"]),
      duration_seconds: z.number(),
      settled_at_utc: z.string(),
    })
    .nullable(),
  rosters: z.object({ team_a: z.array(z.string()), team_b: z.array(z.string()) }),
})
export type MapDTO = z.infer<typeof mapSchema>
export const catalogSchema = z.object({
  teams: z.array(z.object({ name: z.string(), players: z.array(z.string()) })),
  heroes: z.array(z.string()),
  timezone: z.string(),
})
export type Catalog = z.infer<typeof catalogSchema>
export const scheduleSchema = z.object({
  tournament: z.string().nullable(),
  refreshed_at_utc: z.string().nullable(),
  dates: z.array(z.string()),
  series: z.array(
    z.object({
      series_id: z.string(),
      starts_at_utc: z.string(),
      tournament_date: z.string().optional(),
      team_a: z.string(),
      team_b: z.string(),
      best_of: z.number(),
      maps: z.array(mapSchema),
    }),
  ),
})
export const historySchema = z.object({ items: z.array(mapSchema) })
export const liveSchema = z.object({
  status: z.enum(["ok", "partial", "unavailable", "failure"]),
  checked_at_utc: z.string(),
  source_url: z.string().nullable(),
  input: draftSchema,
  conflicts: z.array(z.string()),
  notice: z.string(),
})
export type LiveProposal = z.infer<typeof liveSchema>
export const savedSchema = z.object({
  map: mapSchema,
  forecast: forecastSchema,
  replayed: z.boolean(),
})
export const resultSchema = z.object({ map: mapSchema, replayed: z.boolean() })
export const detailsSchema = z.object({
  snapshot_id: z.union([z.number(), z.string()]),
  stage: stageSchema,
  explanation: z.string(),
})
export const sessionSchema = z.object({ access_token: z.string(), expires_at: z.string() })
export type Session = z.infer<typeof sessionSchema>
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    current_revision: z.number().optional(),
  }),
})
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка. Повторите действие."
}
