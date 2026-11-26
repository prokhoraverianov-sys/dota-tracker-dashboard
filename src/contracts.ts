import { z } from "zod"
import { playInSchema } from "./playin-data"
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
export const postDraftWeights = [0.25, 0.5, 1, 1.25] as const
export type PostDraftWeight = (typeof postDraftWeights)[number]
const shadowSchema = z
  .object({
    winner_probability_team_a: z.number().min(0).max(1).nullable().optional(),
    duration_mean_seconds: z.number().nullable().optional(),
    duration_over_probability: z.number().nullable().optional(),
    duration_line_seconds: z.number().nullable().optional(),
    reasons: z.array(z.string()).optional(),
    post_draft_scenarios: z
      .array(
        z.object({
          draft_weight: z.literal(postDraftWeights),
          winner_probability_team_a: z.number().min(0).max(1),
        }),
      )
      .optional(),
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
const draftQuoteSchema = z.object({
  market_scope: z.literal("map"),
  provider: z.string().min(1),
  observed_at_utc: z.string(),
  provider_quote_at_utc: z.string().nullish(),
  source_url: z.string(),
  quote_id: z.string().nullish(),
  event_id: z.string().nullish(),
  observation_method: z.string().nullish(),
  request_started_at_utc: z.string().nullish(),
  winner: z.object({ team_a: z.string(), team_b: z.string() }),
})
export type DraftQuote = z.infer<typeof draftQuoteSchema>
export const forecastSchema = z.object({
  map_id: z.number(),
  snapshot_id: z.union([z.number(), z.string()]),
  stage: stageSchema,
  created_at_utc: z.string(),
  draft_external_game_id: z.string().nullish(),
  draft_observed_at_utc: z.string().nullish(),
  draft_completed_at_utc: z.string().nullish(),
  verified_steam_match_id: z.string().nullish(),
  model_team_a: z.string().nullish(),
  model_team_b: z.string().nullish(),
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
  pre_decision_at_utc: z.string().nullish(),
  pre_decision_quotes: z.array(draftQuoteSchema).optional(),
  pre_quote_status: z.string().nullish(),
  pre_draft_quotes: z.array(draftQuoteSchema).optional(),
  pre_phase_checked_at_utc: z.string().nullish(),
  pre_phase_source_url: z.string().nullish(),
  pre_verified_series_score: z
    .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
    .nullish(),
  pre_window_opened_at_utc: z.string().nullish(),
  post_draft_quotes: z.array(draftQuoteSchema).optional(),
  post_draft_quote_status: z
    .enum(["captured", "after_observation", "window_missed", "draft_unverified"])
    .nullish(),
  polymarket_quotes: z
    .array(
      z.object({
        market_scope: z.enum(["map", "series"]),
        observed_at_utc: z.string(),
        source_url: z.string(),
        winner: z.object({ team_a: z.string(), team_b: z.string() }),
      }),
    )
    .optional(),
  polymarket_diagnostics: z
    .array(
      z.object({
        market_scope: z.enum(["map", "series"]),
        cutoff_at_utc: z.string(),
        observed_at_utc: z.string().nullable(),
        status: z.enum([
          "attached",
          "no_observation",
          "identity_mismatch",
          "outside_freshness_window",
          "no_complete_prices",
          "read_error",
        ]),
      }),
    )
    .optional(),
})
export type Forecast = z.infer<typeof forecastSchema>
const retrospectiveSchema = z.object({
  analysis: forecastSchema.shape.analysis,
  created_at_utc: z.string(),
  source_url: z.string(),
  external_game_id: z.string().optional(),
  players_a: z.array(z.string()),
  players_b: z.array(z.string()),
  heroes_a: z.array(z.string()),
  heroes_b: z.array(z.string()),
})
export const mapSchema = z.object({
  map_id: z.number().nullable(),
  series_id: z.string().nullable(),
  map_number: z.number().nullable(),
  series_best_of: z.number().int().positive().nullish(),
  verified_series_score: z
    .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
    .nullish(),
  pre_status: z.string().nullish(),
  pre_window_start_utc: z.string().nullish(),
  pre_window_end_utc: z.string().nullish(),
  revision: z.number(),
  label: z.string(),
  team_a: z.string(),
  team_b: z.string(),
  tournament: z.string().nullable(),
  analysis_context: z.enum(["manual", "retrospective"]).optional(),
  draft_started_at_utc: z.string().nullish(),
  gameplay_started_at_utc: z.string().nullish(),
  play_status: z.literal("unplayed").nullish(),
  result_conflict: z.string().nullish(),
  pre: forecastSchema.nullable(),
  archived_pre: forecastSchema.nullish(),
  post: forecastSchema.nullable(),
  retrospective_pre: retrospectiveSchema.nullish(),
  retrospective_post: retrospectiveSchema.nullish(),
  result: z
    .object({
      winner: z.enum(["A", "B"]),
      duration_seconds: z.number(),
      settled_at_utc: z.string(),
      steam_match_id: z.string().nullish(),
      started_at_utc: z.string().nullish(),
      ended_at_utc: z.string().nullish(),
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
const eventOverviewSchema = z.object({
  source_url: z.string(),
  qualifier_url: z.string(),
  qualifier_dates: z.tuple([z.string(), z.string()]),
  qualifier_slots: z.number(),
  teams: z.array(
    z.object({
      name: z.string(),
      players: z.array(z.string()),
      roster_source: z.string().nullable(),
      model_supported: z.boolean(),
      key: z.string().nullish(),
      aliases: z.array(z.string()).optional(),
      play_in_team_key: z.string().nullish(),
      origin_tournament_key: z.string().nullish(),
      play_in_series_count: z.number().optional(),
      play_in_map_count: z.number().optional(),
      play_in_source_count: z.number().optional(),
      source_urls: z.array(z.string()).optional(),
    }),
  ),
  play_in: playInSchema.optional(),
  slots: z.array(
    z.object({
      series_id: z.string(),
      starts_at_utc: z.string(),
      tournament_date: z.string(),
      phase: z.string(),
      best_of: z.number(),
      team_a: z.string().nullable(),
      team_b: z.string().nullable(),
    }),
  ),
})
export type EventOverviewDTO = z.infer<typeof eventOverviewSchema>
export const scheduleGroupSchema = z.object({ id: z.string().min(1), name: z.string().min(1) })
export const scheduleSchema = z.object({
  tournaments: z.array(z.object({ key: z.string(), name: z.string() })).optional(),
  event: eventOverviewSchema.nullish(),
  tournament: z.string().nullable(),
  refreshed_at_utc: z.string().nullable(),
  dates: z.array(z.string()),
  series: z.array(
    z.object({
      series_id: z.string(),
      phase: z.string().nullish(),
      group: scheduleGroupSchema.nullish(),
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
