# Architecture: Foqz + `@foqz/cloud-sync`

Private cloud sync lives in this repo. Public `yhauxell/foqz` stays local-first.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  Foqz app (public)                                      │
│  FocusCanvasApp ── mounts optional cloud UI + hook      │
│         │                                               │
│         ▼                                               │
│  Phase 1 storage seam (always present)                  │
│  CanvasStorageAdapter / LocalStorageAdapter             │
│  BoardSnapshot.revision · fingerprint · catalog         │
└─────────────┬───────────────────────────────────────────┘
              │ peer imports (@/) + package API
              ▼
┌─────────────────────────────────────────────────────────┐
│  @foqz/cloud-sync (this private package)                │
│  useCloudSync / CloudSyncStatus / CloudSettingsModal    │
│  cloudSyncEngine · PocketBaseStorageAdapter             │
│  pocketbase client (authStore, SSE) · schema scripts    │
└─────────────┬───────────────────────────────────────────┘
              │ HTTPS + realtime
              ▼
┌─────────────────────────────────────────────────────────┐
│  PocketBase (e.g. foqz.yruiz.site)                      │
│  users · workspaces · boards                            │
└─────────────────────────────────────────────────────────┘
```

## Public vs private

| Concern | Where |
| --- | --- |
| Local boards, canvas, timers | Public foqz |
| `CanvasStorageAdapter`, revisions, fingerprints | Public foqz |
| PocketBase client, auth modal, sync engine | This package |
| Schema apply scripts | This package |

## Wire-up in a private Foqz build

1. Depend on this package (git dependency or workspace path).
2. Install peer `pocketbase`.
3. Keep Vite/TS `@/*` → app `src/*` (package still imports host seams).
4. In `FocusCanvasApp`:

```tsx
import { CloudSettingsModal, CloudSyncStatus, useCloudSync } from "@foqz/cloud-sync";

useCloudSync();
// topbar: <CloudSyncStatus onOpen={() => setCloudOpen(true)} />
// tree:   <CloudSettingsModal open={cloudOpen} onClose={() => setCloudOpen(false)} />
```

5. Apply schema once: `npm run pocketbase:schema` with `POCKETBASE_URL` + `POCKETBASE_AUTH_TOKEN`.

## Host seams the package expects

- `@/lib/storage` · `@/lib/storage/fingerprint` · `@/lib/storage/snapshot`
- `@/poc/store/flowCanvasStore`
- `@/types/storage`
- `@/components/ui/button` · `@/components/ui/input`

## Runtime behavior

- Local-first: canvas writes local storage immediately.
- Debounced mirror (~1s) to PocketBase when signed in.
- Revision-aware saves; conflict UX prefers explicit keep-local / take-cloud.
- SSE subscription keeps other devices in sync.
- Auth: email/password via PocketBase `users`; session in SDK `authStore` (localStorage).
