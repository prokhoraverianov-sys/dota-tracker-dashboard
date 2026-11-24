import { type MapDTO, mapSchema } from "./contracts"
import { mapPath } from "./domain"
import { loadVerifiedResults, verifiedView } from "./verified-results"

export async function projectHistory(items: MapDTO[], register = loadVerifiedResults()) {
  return Promise.all(
    items.map(async (card) => mapSchema.parse(await verifiedView(mapPath(card), card, register))),
  )
}

function csvCell(value: string | number | null) {
  if (value == null) return ""
  const text =
    typeof value === "string" && (/^[\t\r\n]/.test(value) || /^[=+@-]/.test(value.trimStart()))
      ? `'${value}`
      : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function historyCsv(items: MapDTO[]) {
  // Mirror the API's seven-column history export and spreadsheet formula protection.
  const rows = ["map_id,label,team_a,team_b,tournament,winner,duration_seconds"]
  for (const item of items) {
    const result = item.result_conflict || item.play_status === "unplayed" ? null : item.result
    rows.push(
      [
        item.map_id,
        item.label,
        item.team_a,
        item.team_b,
        item.tournament,
        result?.winner ?? null,
        result?.duration_seconds ?? null,
      ]
        .map(csvCell)
        .join(","),
    )
  }
  return `${rows.join("\r\n")}\r\n`
}
