/**
 * How `ensure-pocketbase-schema.mjs` chooses an admin credential.
 * A fresh PocketBase prints a 30-minute installer URL. That JWT is a superuser
 * token. The example.com admin in this environment is only for loopback.
 */

export function installerTokenFrom(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const marker = "/pbinstall/";
  const index = trimmed.indexOf(marker);
  if (index === -1) return trimmed;
  const token = trimmed.slice(index + marker.length).split(/[/?#\s]/)[0] ?? "";
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
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
