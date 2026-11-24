import phases from "./tournament-phases.json"

const archivedPhases: Readonly<Record<string, string>> = phases

export function tournamentPhase(id: string, livePhase = "") {
  if (archivedPhases[id]) return archivedPhases[id]
  if (/^play[- ]?offs?$/i.test(livePhase)) return "Плей-офф"
  if (/^(верхняя сетка|нижняя сетка|гранд-финал)/i.test(livePhase)) return `Плей-офф · ${livePhase}`
  if (/^группа /i.test(livePhase)) return `Групповой этап · ${livePhase}`
  return livePhase
}
