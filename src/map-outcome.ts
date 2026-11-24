import type { Forecast, MapDTO } from "./contracts"

export type MapStage = "pre" | "post"
export const stageNames = { pre: "PRE", post: "POST" } as const
export const mapStages = ["pre", "post"] as const

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
  const original = map[stage]
  const replay = stage === "post" ? map.retrospective_post : map.retrospective_pre
  const result = map.result
  const draftId = original?.draft_external_game_id
  const steamId = result?.steam_match_id
  const steamMatch = !!steamId && (draftId === `steam:${steamId}` || draftId === steamId)
  const explicitSteam = !!draftId && (draftId.startsWith("steam:") || /^\d+$/.test(draftId))
  const verified =
    !!steamId && (explicitSteam ? steamMatch : original?.verified_steam_match_id === steamId)
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
  if (map.play_status === "unplayed") note = "Карта не сыграна"
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
  else {
    const start = Date.parse(result.started_at_utc ?? "")
    const end = result.ended_at_utc
      ? Date.parse(result.ended_at_utc)
      : start + result.duration_seconds * 1000
    const cutoff = stage === "pre" ? start : end
    const saved = Date.parse(original.created_at_utc)
    const seen =
      original.draft_observed_at_utc && stage === "post"
        ? Date.parse(original.draft_observed_at_utc)
        : saved
    if (![cutoff, saved, seen].every(Number.isFinite)) note = "Время не подтверждено"
    else if (Math.max(saved, seen) >= cutoff)
      note =
        stage === "pre"
          ? "После начала карты"
          : result.ended_at_utc
            ? "После окончания карты"
            : "Позже расчётного окончания"
  }
  const hit = !note && result && selected !== null ? selected === result.winner : null
  const comparison =
    result &&
    selected &&
    map.play_status !== "unplayed" &&
    !map.result_conflict &&
    (stage === "pre" || verified || useReplay)
      ? selected === result.winner
      : null
  return { hit, pick, selected, note, forecast, comparison } as const
}
