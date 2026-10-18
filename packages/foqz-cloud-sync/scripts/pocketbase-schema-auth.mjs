/**
 * How `ensure-pocketbase-schema.mjs` chooses an admin credential.
 * Prefer a live superuser JWT (`POCKETBASE_AUTH_TOKEN` or an installer URL).
 * Password login is the fallback. The example.com admin is only for loopback.
 */

export function installerTokenFrom(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const marker = "/pbinstall/";
  const index = trimmed.indexOf(marker);
  if (index === -1) return stripBearer(trimmed);
  const token = trimmed.slice(index + marker.length).split(/[/?#\s]/)[0] ?? "";
  try {
    return stripBearer(decodeURIComponent(token));
  } catch {
    return stripBearer(token);
  }
}

/** Raw JWT or `Bearer <jwt>` from MCP / Admin UI. */
export function authTokenFrom(raw) {
  return stripBearer(String(raw ?? "").trim());
}

function stripBearer(value) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

export function isLoopbackUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** True when the only admin email is the local placeholder and the host is not loopback. */
export function placeholderAdminBlocked(url, email) {
  const domain = String(email ?? "").split("@")[1]?.toLowerCase() ?? "";
  return domain === "example.com" && !isLoopbackUrl(url);
}
