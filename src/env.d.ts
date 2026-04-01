/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `owner/name` for GitHub links (releases + repo). */
  readonly VITE_LANDING_GITHUB_REPO?: string
  /** Base path for deployed assets, e.g. `/repo-name/` on GitHub Project Pages. */
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
