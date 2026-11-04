import archive from "./pari-universe-archive.json"
import type { CompletedMatch, Provenance } from "./reporting"

export type ArchiveMatch = {
  readonly a: string
  readonly b: string
  readonly picksA: readonly (readonly string[])[]
  readonly picksB: readonly (readonly string[])[]
  readonly priceA: number | null
  readonly priceB: number | null
  readonly line: number | null
  readonly under: number | null
  readonly over: number | null
  readonly winnerUrl: string | null
  readonly totalUrl: string | null
  readonly winnerSource: string | null
  readonly totalSource: string | null
  readonly winnerTime: string | null
  readonly totalTime: string | null
  readonly phase: string | null
}

const matches: Readonly<Record<string, ArchiveMatch | undefined>> = archive.matches
export const tournamentArchive = {
  asOf: archive.asOf,
  bank: archive.bank,
  mapCount: Object.keys(matches).length,
}

export function archiveMatch(
  match: CompletedMatch,
  provenance: Provenance,
): ArchiveMatch | undefined {
  if (provenance.model_sha256 !== archive.modelSha) return undefined
  const entry = matches[match.match_id]
  if (entry?.a !== match.team_a || entry?.b !== match.team_b) return undefined
  return entry
}

export function formatPrice(price: number | null | undefined): string {
  return price == null ? "—" : price.toFixed(2)
}
