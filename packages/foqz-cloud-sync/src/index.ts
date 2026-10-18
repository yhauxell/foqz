/** Public surface for private Foqz builds that re-wire cloud sync. */

export {
  useCloudSync,
  useCloudSyncStatus,
  requestCloudFlush,
  requestCloudReconcile,
  startCloudSync,
  type CloudPhase,
} from "./storage/cloudSync";

export { CloudSettingsModal } from "./components/CloudSettingsModal";
export { CloudSyncStatus } from "./components/CloudSyncStatus";

export { PocketBaseStorageAdapter } from "./storage/PocketBaseStorageAdapter";
export { createCloudSyncEngine } from "./storage/cloudSyncEngine";

export {
  getPocketBase,
  getPocketBaseUrl,
  setPocketBaseUrl,
  loginWithPassword,
  logoutPocketBase,
  registerWithPassword,
  onPocketBaseAuthChange,
  readCloudSession,
  pocketBaseClient,
  POCKETBASE_URL_EVENT,
} from "./pocketbase/client";

export { DEFAULT_POCKETBASE_URL, CLOUD_SAVE_DEBOUNCE_MS } from "./pocketbase/constants";
export {
  authErrorMessage,
  cloudErrorMessage,
  CloudConflictError,
  SnapshotTooLargeError,
  isOfflineError,
} from "./pocketbase/errors";
