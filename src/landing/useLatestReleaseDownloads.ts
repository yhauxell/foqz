import { useEffect, useState } from "react"
import { downloadsFromReleaseAssets, type ReleaseDownload } from "./githubReleaseDownloads"

type Status = "idle" | "loading" | "ready" | "error"

type GhReleasePayload = {
  tag_name?: string | null
  assets?: { name: string; browser_download_url: string }[]
}

function applyReleasePayload(
  data: GhReleasePayload,
  setDownloads: (d: ReleaseDownload[]) => void,
  setTag: (t: string | null) => void,
  setStatus: (s: Status) => void,
) {
  const assets = Array.isArray(data.assets) ? data.assets : []
  setDownloads(downloadsFromReleaseAssets(assets))
  setTag(typeof data.tag_name === "string" ? data.tag_name : null)
  setStatus("ready")
}

export function useLatestReleaseDownloads(repo: string) {
  const [status, setStatus] = useState<Status>(repo ? "loading" : "idle")
  const [downloads, setDownloads] = useState<ReleaseDownload[]>([])
  const [tag, setTag] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = repo.trim()
    if (!trimmed) {
      setStatus("idle")
      setDownloads([])
      setTag(null)
      return
    }

    const parts = trimmed.split("/").filter(Boolean)
    const owner = parts[0]
    const name = parts[1]
    if (!owner || !name) {
      setStatus("error")
      setDownloads([])
      setTag(null)
      return
    }

    let cancelled = false
    setStatus("loading")
    setDownloads([])
    setTag(null)

    const apiUrl = `https://api.github.com/repos/${owner}/${name}/releases/latest`
    const embedUrl = `${import.meta.env.BASE_URL}release-embed.json`

    ;(async () => {
      try {
        const embedRes = await fetch(embedUrl, { cache: "no-store" })
        if (embedRes.ok) {
          const data = (await embedRes.json()) as GhReleasePayload
          if (cancelled) return
          applyReleasePayload(data, setDownloads, setTag, setStatus)
          return
        }
      } catch {
        /* fall through to API */
      }

      try {
        const r = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } })
        if (!r.ok) throw new Error(`GitHub ${r.status}`)
        const data = (await r.json()) as GhReleasePayload
        if (cancelled) return
        applyReleasePayload(data, setDownloads, setTag, setStatus)
      } catch {
        if (!cancelled) {
          setDownloads([])
          setTag(null)
          setStatus("error")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [repo])

  return { status, downloads, tag }
}
