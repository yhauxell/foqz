import { useLatestReleaseDownloads } from "./useLatestReleaseDownloads"

const repo = import.meta.env.VITE_LANDING_GITHUB_REPO?.trim() ?? ""
const releasesUrl = repo ? `https://github.com/${repo}/releases/latest` : ""
const repoUrl = repo ? `https://github.com/${repo}` : ""

export function LandingPage() {
  const { status, downloads, tag } = useLatestReleaseDownloads(repo)

  const macDownloads = downloads.filter((d) => d.id.startsWith("mac"))
  const winDownload = downloads.find((d) => d.id === "win")
  const linuxDownload = downloads.find((d) => d.id === "linux")

  return (
    <div className="min-h-dvh bg-[#070709] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[520px] w-[720px] rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[480px] w-[640px] rounded-full bg-cyan-500/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(255_255_255/6%),transparent_55%)]" />
      </div>

      <header className="relative z-10 border-b border-white/[0.06] bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <span className="text-sm font-semibold tracking-tight text-white">Foqz</span>
          <nav className="flex items-center gap-3 text-sm">
            {repoUrl ? (
              <a
                href={repoUrl}
                className="rounded-lg px-3 py-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
            ) : null}
            {releasesUrl ? (
              <a
                href={releasesUrl}
                className="rounded-lg bg-white/[0.08] px-3 py-1.5 font-medium text-white ring-1 ring-white/10 transition hover:bg-white/[0.12]"
                target="_blank"
                rel="noreferrer"
              >
                Releases
              </a>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-16 md:pt-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-400">
          Direct download
          <span className="text-zinc-500">·</span>
          Not distributed on the App Store
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-5xl md:leading-[1.1]">
          A quiet canvas for deep work — from the menu bar.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
          Toggle a frosted window when you need it, sketch and plan on a tldraw board, and keep timers
          within reach. Built as a small desktop app you install yourself — no App Store required.
        </p>

        {repo ? (
          <section className="mt-12" aria-labelledby="downloads-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="downloads-heading" className="text-lg font-semibold text-white">
                  Download for your platform
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  macOS, Windows, and Linux builds from GitHub Releases
                  {tag ? (
                    <span className="text-zinc-600">
                      {" "}
                      · <span className="font-mono text-zinc-500">{tag}</span>
                    </span>
                  ) : null}
                </p>
              </div>
              {status === "loading" ? (
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Loading…</span>
              ) : null}
            </div>

            {status === "error" ? (
              <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                Could not load release files from GitHub.{" "}
                {releasesUrl ? (
                  <a href={releasesUrl} className="font-medium underline underline-offset-2 hover:text-white" target="_blank" rel="noreferrer">
                    Open the latest release
                  </a>
                ) : null}{" "}
                and pick the installer for your system.
              </p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-3">
                <PlatformCard
                  title="macOS"
                  description="Disk image installer (.dmg)"
                  primary={
                    macDownloads[0]
                      ? { label: macDownloads[0].hint, href: macDownloads[0].url }
                      : null
                  }
                  secondary={
                    macDownloads[1]
                      ? { label: macDownloads[1].hint, href: macDownloads[1].url }
                      : null
                  }
                  fallbackUrl={releasesUrl}
                  disabled={status === "loading"}
                />
                <PlatformCard
                  title="Windows"
                  description="NSIS installer (.exe)"
                  primary={
                    winDownload ? { label: winDownload.hint, href: winDownload.url } : null
                  }
                  fallbackUrl={releasesUrl}
                  disabled={status === "loading"}
                />
                <PlatformCard
                  title="Linux"
                  description="Portable AppImage"
                  primary={
                    linuxDownload ? { label: linuxDownload.hint, href: linuxDownload.url } : null
                  }
                  fallbackUrl={releasesUrl}
                  disabled={status === "loading"}
                />
              </ul>
            )}
          </section>
        ) : (
          <div className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            Set <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">VITE_LANDING_GITHUB_REPO</code>{" "}
            when building the landing page so macOS, Windows, and Linux downloads resolve from GitHub Releases.
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {repoUrl ? (
            <a
              href={repoUrl}
              className="inline-flex items-center rounded-xl border border-white/[0.1] bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
              target="_blank"
              rel="noreferrer"
            >
              View repository
            </a>
          ) : null}
        </div>

        <ul className="mt-20 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Tray-first",
              body: "Show or hide the canvas from the menu bar without breaking flow.",
            },
            {
              title: "Infinite board",
              body: "Plan and sketch with tldraw — your snapshot stays on device.",
            },
            {
              title: "Focus timers",
              body: "Keep Pomodoro-style timers on the board so time stays visible.",
            },
          ].map((item) => (
            <li
              key={item.title}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 shadow-xl shadow-black/20"
            >
              <h2 className="text-base font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-16 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Updates can be delivered in-app when the release feed is configured (electron-updater). This site only
          links to installers — nothing is distributed through the Mac App Store.
        </p>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-8 text-center text-xs text-zinc-600">
        Foqz · {repo ? `github.com/${repo}` : "open source"}
      </footer>
    </div>
  )
}

function PlatformCard(props: {
  title: string
  description: string
  primary: { label: string; href: string } | null
  secondary?: { label: string; href: string } | null
  fallbackUrl: string
  disabled?: boolean
}) {
  const { title, description, primary, secondary, fallbackUrl, disabled } = props

  return (
    <li className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 shadow-xl shadow-black/20">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <div className="mt-4 flex flex-col gap-2">
        {primary ? (
          <a
            href={primary.href}
            className="inline-flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold text-zinc-900 shadow-lg shadow-black/20 transition hover:bg-zinc-100"
            rel="noreferrer"
          >
            <span>Download</span>
            <span className="text-xs font-normal text-zinc-600">{primary.label}</span>
          </a>
        ) : (
          <span
            className={`inline-flex items-center justify-center rounded-xl border border-white/[0.08] px-4 py-2.5 text-center text-sm text-zinc-500 ${
              disabled ? "animate-pulse" : ""
            }`}
          >
            {disabled ? "…" : "No matching file in latest release"}
          </span>
        )}
        {secondary ? (
          <a
            href={secondary.href}
            className="inline-flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-center text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            rel="noreferrer"
          >
            <span>Download</span>
            <span className="text-xs font-normal text-zinc-500">{secondary.label}</span>
          </a>
        ) : null}
        {!primary && !disabled && fallbackUrl ? (
          <a
            href={fallbackUrl}
            className="text-center text-xs font-medium text-violet-300/90 underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Browse release files on GitHub
          </a>
        ) : null}
      </div>
    </li>
  )
}
