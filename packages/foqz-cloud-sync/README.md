# @foqz/cloud-sync (private)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how Foqz mounts this package.

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

## Private remote

Target repo: **[yhauxell/foqz-cloud](https://github.com/yhauxell/foqz-cloud)** (private).

```bash
# From this package directory (or unpack foqz-cloud-sync.tgz):
git remote add origin git@github.com:yhauxell/foqz-cloud.git
git push -u origin main
```

Or from the extraction branch in foqz:

```bash
git subtree push --prefix=packages/foqz-cloud-sync origin-foqz-cloud main
```
