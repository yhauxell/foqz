/**
 * Fetches the latest GitHub release (CI: uses GITHUB_TOKEN + full rate limit)
 * and writes landing-public/release-embed.json for the static landing build.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const outFile = path.join(root, "landing-public", "release-embed.json")

const repo = process.env.GITHUB_REPOSITORY?.trim()
if (!repo) {
  console.warn("write-landing-release: GITHUB_REPOSITORY unset, skipping embed")
  process.exit(0)
}

const url = `https://api.github.com/repos/${repo}/releases/latest`
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "foqz-landing-ci",
}
const token = process.env.GITHUB_TOKEN
if (token) {
  headers.Authorization = `Bearer ${token}`
}

let payload = { tag_name: null, assets: [] }

try {
  const res = await fetch(url, { headers })
  if (res.ok) {
    const data = await res.json()
    const assets = Array.isArray(data.assets) ? data.assets : []
    payload = {
      tag_name: typeof data.tag_name === "string" ? data.tag_name : null,
      assets: assets.map((a) => ({
        name: a.name,
        browser_download_url: a.browser_download_url,
      })),
    }
  } else {
    console.warn(`write-landing-release: GitHub API ${res.status}, writing empty embed`)
  }
} catch (e) {
  console.warn("write-landing-release: fetch failed, writing empty embed:", e?.message ?? e)
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(payload))
console.log("write-landing-release: wrote", outFile)
