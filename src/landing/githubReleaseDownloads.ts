export type ReleaseDownload = {
  id: string
  label: string
  /** Short platform hint for the button subtitle */
  hint: string
  url: string
}

type GhAsset = { name: string; browser_download_url: string }

function lower(n: string) {
  return n.toLowerCase()
}

/**
 * Maps electron-builder release filenames to macOS / Windows / Linux download rows.
 * Prefers .dmg (installer) over .zip on macOS for the landing page.
 */
export function downloadsFromReleaseAssets(assets: GhAsset[]): ReleaseDownload[] {
  const list = assets.filter((a) => a?.name && a?.browser_download_url)
  const out: ReleaseDownload[] = []

  const dmgs = list.filter((a) => lower(a.name).endsWith(".dmg"))
  const armDmg = dmgs.find((a) => /arm64|aarch64/i.test(a.name))
  const intelDmg = dmgs.find(
    (a) =>
      (/\bx64\b|amd64|x86_64/i.test(a.name) || /[._-]x64[._-]/i.test(a.name)) &&
      !/arm64|aarch64/i.test(a.name),
  )

  if (armDmg) {
    out.push({
      id: "mac-arm",
      label: "macOS",
      hint: "Apple Silicon (.dmg)",
      url: armDmg.browser_download_url,
    })
  }
  if (intelDmg) {
    out.push({
      id: "mac-intel",
      label: "macOS",
      hint: "Intel (.dmg)",
      url: intelDmg.browser_download_url,
    })
  }
  if (!armDmg && !intelDmg && dmgs[0]) {
    out.push({
      id: "mac",
      label: "macOS",
      hint: "Disk image (.dmg)",
      url: dmgs[0].browser_download_url,
    })
  }

  const exe = list.find((a) => lower(a.name).endsWith(".exe"))
  if (exe) {
    out.push({
      id: "win",
      label: "Windows",
      hint: "Installer (.exe)",
      url: exe.browser_download_url,
    })
  }

  const appImage = list.find((a) => lower(a.name).endsWith(".appimage"))
  if (appImage) {
    out.push({
      id: "linux",
      label: "Linux",
      hint: "AppImage",
      url: appImage.browser_download_url,
    })
  }

  return out
}
