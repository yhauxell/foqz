# @foqz/cloud-sync (private)

PocketBase board sync for Foqz. **Do not merge this package into the public `main` branch.** Keep it on a private remote or vendor it only into private Foqz builds.

## What’s included

| Area | Path |
| --- | --- |
| Client / auth | `src/pocketbase/*` |
| Sync engine + adapter | `src/storage/cloudSync*.ts`, `PocketBaseStorageAdapter.ts` |
| UI | `src/components/CloudSettingsModal.tsx`, `CloudSyncStatus.tsx` |
| Schema ops | `scripts/ensure-pocketbase-schema.mjs`, `pocketbase-schema-*.mjs` |

Host Phase 1 storage stays in the app (`LocalStorageAdapter`, `BoardSnapshot.revision`, fingerprint/snapshot helpers).

## Re-wire into a private Foqz checkout

1. Copy this package (or push this branch) to your private remote.
2. Add a dependency / workspace entry for `@foqz/cloud-sync` and install `pocketbase`.
3. Ensure Vite/TS resolve `@/*` to the app `src/` (host seams below still use that alias).
4. In `FocusCanvasApp.tsx`:

```tsx
import {
  CloudSettingsModal,
  CloudSyncStatus,
  useCloudSync,
} from "@foqz/cloud-sync";

// inside the app shell:
useCloudSync();
// topbar: <CloudSyncStatus onOpen={() => setCloudOpen(true)} />
// root:   <CloudSettingsModal open={cloudOpen} onClose={() => setCloudOpen(false)} />
```

5. Apply schema:

```bash
POCKETBASE_URL=https://your-host \
POCKETBASE_AUTH_TOKEN=<superuser-jwt> \
npm run pocketbase:schema -w @foqz/cloud-sync
```

## Host seams (still imported via `@/`)

These stay in the public app; the package expects them at runtime:

- `@/lib/storage` (`getCanvasStorage`)
- `@/lib/storage/fingerprint`, `@/lib/storage/snapshot`
- `@/lib/storage/LocalStorageAdapter` (types)
- `@/poc/store/flowCanvasStore`
- `@/types/storage`
- `@/components/ui/button`, `@/components/ui/input`

## Push to a private remote

```bash
git remote add private git@github.com:<org>/foqz-cloud-sync.git   # or private foqz fork
git push private cursor/private-foqz-cloud-sync-9b39:main
```

Or unpack the release tarball from `/opt/cursor/artifacts/foqz-cloud-sync.tgz` into a private repo.
