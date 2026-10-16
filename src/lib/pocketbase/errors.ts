export class CloudConflictError extends Error {
  readonly code = "conflict" as const;

  constructor(
    readonly boardId: string,
    readonly remoteRevision: number,
    readonly localRevision: number
  ) {
    super(
      `Remote board “${boardId}” is at revision ${remoteRevision}, ahead of local revision ${localRevision}.`
    );
    this.name = "CloudConflictError";
  }
}

export class SnapshotTooLargeError extends Error {
  readonly code = "too_large" as const;

  constructor(
    readonly bytes: number,
    readonly limit: number
  ) {
    super(`Board snapshot is ${bytes} bytes, over the ${limit} byte cloud limit.`);
    this.name = "SnapshotTooLargeError";
  }
}

export class CloudAuthError extends Error {
  readonly code = "auth" as const;

  constructor(message = "Sign in before syncing boards.") {
    super(message);
    this.name = "CloudAuthError";
  }
}

function statusOf(err: unknown): number | null {
  if (!err || typeof err !== "object" || !("status" in err)) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function isNotFoundError(err: unknown): boolean {
  return statusOf(err) === 404;
}

export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const status = statusOf(err);
  if (status === 0) return true;
  if (err instanceof TypeError) return true;
  const message = err instanceof Error ? err.message : "";
  return /failed to fetch|network|load failed|offline/i.test(message);
}

export function cloudErrorMessage(err: unknown): string {
  if (err instanceof CloudConflictError || err instanceof SnapshotTooLargeError) {
    return err.message;
  }
  if (err instanceof CloudAuthError) return err.message;
  const status = statusOf(err);
  if (status === 401 || status === 403) return "Cloud sync was rejected. Sign in again.";
  if (status === 404) return "Cloud collections are not ready yet.";
  if (status === 400) return "Cloud rejected the board payload.";
  if (isOfflineError(err)) {
    return "You are offline. Changes stay on this device until you reconnect.";
  }
  return "Cloud sync failed.";
}

/** Field messages from PocketBase are safe to show. The password value is not included. */
export function authErrorMessage(err: unknown): string {
  const status = statusOf(err);
  const data =
    err && typeof err === "object" && "data" in err
      ? (err as { data?: unknown }).data
      : err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: unknown } }).response?.data
        : null;
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (
        value &&
        typeof value === "object" &&
        "message" in value &&
        typeof (value as { message?: unknown }).message === "string"
      ) {
        return (value as { message: string }).message;
      }
    }
  }
  if (status === 400) return "Email or password was not accepted.";
  if (status === 403) return "This account cannot sign in yet.";
  if (isOfflineError(err)) return "Could not reach the cloud server.";
  return "Could not sign in.";
}
