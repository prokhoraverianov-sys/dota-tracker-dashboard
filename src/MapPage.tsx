import { useEffect, useState } from "react"
import type { Api } from "./api"
import { type Catalog, type MapDTO, mapSchema, message } from "./contracts"
import { MapWorkspace } from "./MapWorkspace"
import { Back, Empty, Notice } from "./ui"
export function MapPage({
  path,
  api,
  catalog,
  navigate,
  setDirty,
}: {
  readonly path: string
  readonly api: Api
  readonly catalog: Catalog
  readonly navigate: (path: string) => void
  readonly setDirty: (value: boolean) => void
}) {
  const [map, setMap] = useState<MapDTO | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    api
      .request(path, mapSchema)
      .then((value) => {
        if (active) setMap(value)
      })
      .catch((err) => {
        if (active) setError(message(err))
      })
    return () => {
      active = false
      setDirty(false)
    }
  }, [path, api, setDirty])
  if (!map)
    return (
      <>
        <Back onClick={() => navigate("/schedule")} />
        {error ? (
          <Notice error>
            {error}
            <button type="button" onClick={() => window.location.reload()}>
              Повторить
            </button>
          </Notice>
        ) : (
          <Empty title="Загружаем карту…" />
        )}
      </>
    )
  return (
    <MapWorkspace
      key={path}
      initial={map}
      api={api}
      catalog={catalog}
      navigate={navigate}
      setDirty={setDirty}
    />
  )
}
