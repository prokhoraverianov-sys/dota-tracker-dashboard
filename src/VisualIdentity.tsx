import { useState } from "react"
import { heroImage } from "./hero-images"
import { teamInitials, teamLogo } from "./team-identity"
import "./visual-identity.css"

export function TeamIdentity({
  name,
  teamKey,
  size = "md",
  showName = true,
}: {
  readonly name: string
  readonly teamKey?: string | undefined
  readonly size?: "sm" | "md" | "lg"
  readonly showName?: boolean
}) {
  const source = teamLogo(name, teamKey)
  const [failedSource, setFailedSource] = useState<string | undefined>()
  const showImage = source !== undefined && failedSource !== source
  return (
    <span className={`team-identity team-identity-${size}`}>
      <span
        className={`team-mark${showImage ? "" : " team-mark-fallback"}`}
        aria-hidden="true"
        title={name || "Команда уточняется"}
      >
        {showImage ? (
          <img
            src={source}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedSource(source)}
          />
        ) : (
          <span>{teamInitials(name)}</span>
        )}
      </span>
      {showName && <span className="team-identity-name">{name || "Участник уточняется"}</span>}
    </span>
  )
}

export function HeroPortrait({
  name,
  size = "sm",
  showName = false,
}: {
  readonly name: string
  readonly size?: "sm" | "md"
  readonly showName?: boolean
}) {
  const source = heroImage(name)
  const [failedSource, setFailedSource] = useState<string | undefined>()
  const showImage = source !== undefined && failedSource !== source
  return (
    <span className={`hero-portrait hero-portrait-${size}`}>
      <span className="hero-portrait-frame" aria-hidden="true" title={name || "Герой не выбран"}>
        {showImage ? (
          <img
            src={source}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedSource(source)}
          />
        ) : (
          <span className="hero-portrait-placeholder">?</span>
        )}
      </span>
      {showName && <span className="hero-portrait-name">{name || "Герой не выбран"}</span>}
    </span>
  )
}
