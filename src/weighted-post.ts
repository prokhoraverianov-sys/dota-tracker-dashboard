import type { Forecast, MapDTO, PostDraftWeight } from "./contracts"
import records from "./essence-weighted-post.json"
import { evaluateMap, hasVerifiedDraft } from "./map-outcome"

const archive: Readonly<
  Record<
    string,
    | {
        series: string
        number: number
        a: string
        b: string
        quarter?: number
        probabilities: number[]
      }
    | undefined
  >
> = records
const legacyKeys = { 0.5: "0.5", 1: "1.0", 1.25: "1.25" } as const
const legacyIndexes = { 0.5: 0, 1: 1, 1.25: 2 } as const
const legacyReason = "blast_ix_post_weights="
const legacyQuarterModel = "pari-universe-20261025-draft-enabled-shadow-v1"

export function postWeightLabel(weight: PostDraftWeight) {
  return weight === 1 ? "1,0" : String(weight).replace(".", ",")
}

function validProbability(p: unknown) {
  return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null
}

export function postWeightScenario(
  map: MapDTO,
  analysis: Forecast["analysis"] | undefined,
  weight: PostDraftWeight,
) {
  const shadow = analysis?.shadow_forecast
  const scenarios = shadow?.post_draft_scenarios
  if (scenarios?.length) {
    const sameWeight = scenarios.filter((item) => item.draft_weight === weight)
    const probability =
      sameWeight.length === 1 ? validProbability(sameWeight[0]?.winner_probability_team_a) : null
    if (probability != null) return { probability, source: "forecast" as const }
  }
  if (
    weight === 0.25 &&
    !scenarios?.length &&
    analysis?.metadata?.model_version === legacyQuarterModel
  ) {
    const probability = validProbability(shadow?.winner_probability_team_a)
    if (probability != null) return { probability, source: "forecast" as const }
  }
  const reason = shadow?.reasons?.find((item) => item.startsWith(legacyReason))
  if (reason && weight !== 0.25 && map.tournament === "BLAST Slam IX") {
    try {
      const probability = validProbability(
        JSON.parse(reason.slice(legacyReason.length))?.[legacyKeys[weight]],
      )
      if (probability != null) return { probability, source: "legacy-replay" as const }
    } catch {
      // A malformed legacy reason supplies no scenario.
    }
  }
  const row = map.result?.steam_match_id ? archive[map.result.steam_match_id] : undefined
  if (
    !row ||
    row.series !== map.series_id ||
    row.number !== map.map_number ||
    map.result_conflict ||
    map.play_status === "unplayed"
  )
    return null
  const forward = map.team_a === row.a && map.team_b === row.b
  if (!forward && (map.team_a !== row.b || map.team_b !== row.a)) return null
  const p = validProbability(
    weight === 0.25 ? row.quarter : row.probabilities[legacyIndexes[weight]],
  )
  return p == null ? null : { probability: forward ? p : 1 - p, source: "archive" as const }
}

export function weightedPost(map: MapDTO, weight: PostDraftWeight) {
  const base = evaluateMap(map, "post")
  const comparisonSource =
    base.comparison != null || hasVerifiedDraft(map) ? base.forecast?.analysis : undefined
  const scenario = postWeightScenario(map, comparisonSource, weight)
  if (
    !scenario ||
    scenario.probability === 0.5 ||
    !map.result ||
    map.result_conflict ||
    map.play_status === "unplayed"
  )
    return null
  const selected = scenario.probability > 0.5 ? "A" : "B"
  const comparison = selected === map.result.winner
  return {
    selected,
    comparison,
    hit: base.hit == null || scenario.source !== "forecast" ? null : comparison,
  } as const
}
