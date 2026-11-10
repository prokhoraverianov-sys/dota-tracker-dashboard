// Presentation-only team assets. Sources: public/team-logos/sources.json.
// Previous team names are not automatically treated as current identity aliases.
type TeamAsset = {
  readonly key: string
  readonly aliases: readonly string[]
  readonly file?: string
  readonly explicitKeyOnly?: boolean
}

const teams: readonly TeamAsset[] = [
  { key: "1win", aliases: ["1win", "1w Team", "1win Team"], file: "1win.png" },
  { key: "aurora", aliases: ["Aurora Gaming", "Aurora"], file: "aurora.png" },
  { key: "gamerlegion", aliases: ["GamerLegion", "Gamer Legion"], file: "gamerlegion.png" },
  { key: "lgd", aliases: ["LGD Gaming", "LGD"], file: "lgd.png" },
  { key: "parivision", aliases: ["PARIVISION"], file: "parivision.png" },
  { key: "team-liquid", aliases: ["Team Liquid", "Liquid"], file: "team-liquid.png" },
  { key: "team-spirit", aliases: ["Team Spirit", "Spirit"], file: "team-spirit.png" },
  { key: "betboom", aliases: ["BetBoom Team", "BetBoom"], file: "betboom.png" },
  { key: "og", aliases: ["OG"], file: "og.png" },
  { key: "team-yandex", aliases: ["Team Yandex", "Yandex"], file: "team-yandex.png" },
  { key: "power-rangers", aliases: ["Power Rangers"], file: "power-rangers.png" },
  { key: "cyxariki", aliases: ["Ka4kanarskie cyxariki", "cyxariki"], file: "cyxariki.png" },
  { key: "xipto", aliases: ["Xipto Esports", "Xipto"], file: "xipto.png" },
  { key: "yellow-submarine", aliases: ["Yellow Submarine"], file: "yellow-submarine.png" },
  // A historical LEGION roster became Froglings. Only its explicit current key
  // can select the current LEGION logo; a bare historical name stays neutral.
  { key: "legion", aliases: [], file: "legion.png", explicitKeyOnly: true },
  { key: "playtime", aliases: ["PlayTime"], file: "playtime.png" },
  { key: "cyberhero", aliases: ["CyberHero"], file: "cyberhero.png" },
  { key: "huligani", aliases: ["HULIGANI"], file: "huligani.png" },
  { key: "froglings", aliases: ["Froglings"] },
  { key: "angry-birds", aliases: ["Angry Birds"] },
  { key: "astra-invicta", aliases: ["Astra Invicta"] },
  { key: "do-konca", aliases: ["DO KONCA"] },
]

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
}

const byKey = new Map(teams.map((team) => [normalize(team.key), team]))
const byName = new Map(
  teams.flatMap((team) =>
    team.explicitKeyOnly ? [] : team.aliases.map((name) => [normalize(name), team] as const),
  ),
)

export function teamLogo(name: string, teamKey?: string): string | undefined {
  const team = (teamKey ? byKey.get(normalize(teamKey)) : undefined) ?? byName.get(normalize(name))
  if (!team?.file) return undefined
  const base = import.meta.env?.BASE_URL ?? "/dota-tracker-dashboard/"
  return `${base}team-logos/${team.file}`
}

export function teamInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_.-]+/)
    .filter(Boolean)
  if (!words.length) return "?"
  const first = words[0] ?? ""
  const second = words[1]
  return (second ? first.slice(0, 1) + second.slice(0, 1) : first.slice(0, 2)).toUpperCase()
}
