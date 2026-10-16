/** Default Foqz cloud origin. Auth tokens never leave the PocketBase SDK store. */
export const DEFAULT_POCKETBASE_URL = "https://foqz.yruiz.site";

export const POCKETBASE_URL_KEY = "foqz_pocketbase_url";

export const WORKSPACES_COLLECTION = "workspaces";
export const BOARDS_COLLECTION = "boards";

/**
 * Hard cap for one board snapshot. Keeps a single SQLite row and the renderer
 * stringify off the multi-megabyte path while a canvas is being dragged.
 */
export const MAX_SNAPSHOT_BYTES = 1_500_000;

/** Coalesce canvas edits before they touch the network. */
export const CLOUD_SAVE_DEBOUNCE_MS = 1000;

/** Bound a single REST call so a stalled server cannot leave the pill on Syncing. */
export const CLOUD_REQUEST_TIMEOUT_MS = 15_000;

export const USERS_COLLECTION_ID = "_pb_users_auth_";
