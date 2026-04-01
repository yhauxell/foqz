import { useEffect, useState } from "react"
import { downloadsFromReleaseAssets, type ReleaseDownload } from "./githubReleaseDownloads"

type Status = "idle" | "loading" | "ready" | "error"

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

    const url = `https://api.github.com/repos/${owner}/${name}/releases/latest`

    fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`GitHub ${r.status}`)
        return r.json() as Promise<{ tag_name?: string; assets?: { name: string; browser_download_url: string }[] }>
      })
      .then((data) => {
        if (cancelled) return
        const assets = Array.isArray(data.assets) ? data.assets : []
        setDownloads(downloadsFromReleaseAssets(assets))
        setTag(typeof data.tag_name === "string" ? data.tag_name : null)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) {
          setDownloads([])
          setTag(null)
          setStatus("error")
        }
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  return { status, downloads, tag }
}
