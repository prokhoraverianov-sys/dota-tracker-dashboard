import type { Forecast, MapDTO } from "./contracts"
import { archivedPhaseQuote, isSettledDecider } from "./phase-quote-evidence"

export type MapStage = "pre" | "post"
export const stageNames = { pre: "PRE", post: "POST" } as const
export const mapStages = ["pre", "post"] as const

export function preForecastBlock(map: MapDTO) {
  if (map.play_status === "unplayed" || map.pre_status === "unplayed")
    return "Карта отпала по счёту серии."
  if (map.result_conflict) return "Источники расходятся. Окно PRE не подтверждено."
  if (
    map.result ||
    map.draft_started_at_utc ||
    map.post ||
    map.analysis_context === "retrospective" ||
    map.pre_status === "draft_started"
  )
    return "Драфт начался. Окно PRE закрыто."
  if (!map.series_id) return null
  switch (map.pre_status) {
    case "before_series":
      return map.series_best_of === 3 && map.map_number === 3
        ? "PRE карты 3 открывается при подтверждённом счёте 1:1."
        : null
    case "before_decider_draft":
      return map.map_number === 3 &&
        map.verified_series_score?.[0] === 1 &&
        map.verified_series_score?.[1] === 1
        ? null
        : "PRE карты 3 открывается при подтверждённом счёте 1:1."
    case "waiting_for_decider":
      return "PRE карты 3 открывается при подтверждённом счёте 1:1."
    case "series_started":
      return "Серия началась. Окно PRE закрыто."
    case "phase_unverified":
      return "Источник ещё не подтвердил, что драфт не начался."
    default:
      return "Окно PRE пока не подтверждено источником."
  }
}

function explicitSteamReference(draftId: string | null | undefined) {
  return !!draftId && (draftId.startsWith("steam:") || /^\d+$/.test(draftId))
}

export function hasVerifiedDraft(map: MapDTO) {
  const draftId = map.post?.draft_external_game_id
  const steamId = map.result?.steam_match_id
  return (
    !!steamId &&
    (explicitSteamReference(draftId)
      ? draftId === `steam:${steamId}` || draftId === steamId
      : map.post?.verified_steam_match_id === steamId)
  )
}

export function preForecastWindow(map: MapDTO) {
  const archive = archivedPhaseQuote(map, "pre")
  if (isSettledDecider(map)) {
    const end = archive?.windowEnd ?? Date.parse(map.draft_started_at_utc ?? "")
    return Number.isFinite(end) ? { start: Number.NEGATIVE_INFINITY, end } : null
  }
  const startAt = Date.parse(map.pre_window_start_utc ?? map.pre?.pre_window_opened_at_utc ?? "")
  const endAt = Date.parse(map.pre_window_end_utc ?? "")
  const ownMapIsEnough =
    !map.series_id ||
    (map.series_best_of != null && map.series_best_of !== 2 && map.series_best_of !== 3)
  const start = Number.isFinite(startAt)
    ? startAt
    : (archive?.windowStart ?? Number.NEGATIVE_INFINITY)
  const end = Number.isFinite(endAt)
    ? endAt
    : (archive?.windowEnd ??
      (ownMapIsEnough ? Date.parse(map.draft_started_at_utc ?? "") : Number.NaN))
  const decider = map.series_best_of === 3 && map.map_number === 3
  if (!Number.isFinite(end) || !(start < end) || (decider && !Number.isFinite(start))) return null
  return { start, end }
}

export function originalPreForecast(map: MapDTO) {
  if (map.pre || !isSettledDecider(map)) return map.pre
  const historic = map.archived_pre
  if (
    !historic ||
    map.map_id == null ||
    historic.map_id !== map.map_id ||
    historic.stage !== "pre_match"
  )
    return null
  const window = preForecastWindow(map)
  const saved = Date.parse(historic.created_at_utc)
  const decision = Date.parse(historic.pre_decision_at_utc ?? historic.created_at_utc)
  return window && Math.max(saved, decision) < window.end ? historic : null
}

export function hasVerifiedPreCapture(map: MapDTO, forecast: Forecast) {
  if (
    (forecast.pre_quote_status !== "captured" &&
      forecast.pre_quote_status !== "attached_before_series") ||
    !forecast.pre_phase_source_url ||
    !Number.isFinite(Date.parse(forecast.pre_phase_checked_at_utc ?? ""))
  )
    return false
  if (map.series_best_of !== 3 || map.map_number !== 3) return true
  const [a, b] = forecast.pre_verified_series_score ?? []
  const start = Date.parse(forecast.pre_window_opened_at_utc ?? "")
  const decision = Date.parse(forecast.pre_decision_at_utc ?? "")
  return (
    forecast.pre_quote_status === "captured" &&
    a === 1 &&
    b === 1 &&
    Math.min(Date.parse(forecast.created_at_utc), decision) >= start
  )
}

function forecastTimingNote(map: MapDTO, stage: MapStage, forecast: Forecast) {
  const saved = Date.parse(forecast.created_at_utc)
  if (!Number.isFinite(saved)) return "Время прогноза не подтверждено"
  if (stage === "pre") {
    const window = preForecastWindow(map)
    const decision = Date.parse(forecast.pre_decision_at_utc ?? forecast.created_at_utc)
    if (!Number.isFinite(decision)) return "Окно PRE не подтверждено"
    if (!window) return hasVerifiedPreCapture(map, forecast) ? "" : "Окно PRE не подтверждено"
    if (Math.min(saved, decision) < window.start)
      return map.series_best_of === 3 && map.map_number === 3
        ? "PRE записан до подтверждённого счёта 1:1"
        : "PRE записан до подтверждённого окна"
    return Math.max(saved, decision) < window.end ? "" : "PRE записан после подтверждённого окна"
  }
  const draft = Date.parse(forecast.draft_completed_at_utc ?? "")
  const gameplay = Date.parse(map.gameplay_started_at_utc ?? "")
  const end = Date.parse(map.result?.ended_at_utc ?? "")
  if (saved >= end) return "После окончания карты"
  if (saved >= gameplay) return "После начала игры"
  if (saved < draft) return "До подтверждения полного драфта"
  return Number.isFinite(draft) && Number.isFinite(gameplay)
    ? ""
    : "Окно сразу после драфта не подтверждено"
}

export function retrospectiveForecast(
  map: MapDTO,
  stage: MapStage,
): Omit<Forecast, "map_id"> | null {
  const saved = stage === "pre" ? map.retrospective_pre : map.retrospective_post
  if (!saved) return null
  return {
    ...saved,
    snapshot_id: "retrospective",
    stage: stage === "pre" ? "pre_match" : "post_draft",
    explanation: "",
    odds: { provider: null, source_url: null, observed_at_utc: null, phase: null },
    candidates: [],
  }
}

export function evaluateMap(map: MapDTO, stage: MapStage) {
  const original = stage === "pre" ? originalPreForecast(map) : map.post
  const replay = stage === "post" ? map.retrospective_post : map.retrospective_pre
  const result = map.result
  const unplayed = map.play_status === "unplayed" || map.pre_status === "unplayed"
  const draftId = original?.draft_external_game_id
  const steamId = result?.steam_match_id
  const explicitSteam = explicitSteamReference(draftId)
  const verified = hasVerifiedDraft(map)
  const originalProbability = original?.analysis.shadow_forecast?.winner_probability_team_a
  const replayProbability = replay?.analysis.shadow_forecast?.winner_probability_team_a
  const needsReplay =
    originalProbability == null ||
    originalProbability === 0.5 ||
    (stage === "post" && !!result && !verified)
  const useReplay = needsReplay && replayProbability != null && replayProbability !== 0.5
  const forecast = useReplay ? replay : (original ?? replay)
  const probability = forecast?.analysis.shadow_forecast?.winner_probability_team_a
  const selected: "A" | "B" | null =
    probability == null || probability === 0.5 ? null : probability > 0.5 ? "A" : "B"
  const pick = selected === null ? null : selected === "A" ? map.team_a : map.team_b
  let note = ""
  if (unplayed) note = "Карта не сыграна"
  else if (map.result_conflict) note = "Источники расходятся"
  else if (!forecast) note = "Нет сохранённого прогноза"
  else if (!selected) note = probability === 0.5 ? "Равные шансы" : "Модель воздержалась"
  else if (
    useReplay ||
    !original ||
    original.snapshot_id === "retrospective" ||
    map.analysis_context === "retrospective"
  )
    note = "Ретроспективный расчёт"
  else if (!result) note = "Ожидается результат"
  else if (stage === "post" && !verified)
    note = explicitSteam && steamId ? "Драфт другой карты" : "Привязка драфта не подтверждена"
  else note = forecastTimingNote(map, stage, original)
  const hit = !note && result && selected !== null ? selected === result.winner : null
  const comparison =
    result &&
    selected &&
    !unplayed &&
    !map.result_conflict &&
    (stage === "pre" || verified || useReplay)
      ? selected === result.winner
      : null
  return { hit, pick, selected, note, forecast, comparison } as const
}
