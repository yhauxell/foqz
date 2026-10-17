import PocketBase from "pocketbase";
import {
  CLOUD_REQUEST_TIMEOUT_MS,
  DEFAULT_POCKETBASE_URL,
  POCKETBASE_URL_KEY,
} from "@/lib/pocketbase/constants";
import type { PbClientLike } from "@/lib/pocketbase/types";

export const POCKETBASE_URL_EVENT = "foqz:pocketbase-url-changed";

let client: PocketBase | null = null;
let clientUrl = "";

export function normalizePocketBaseUrl(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a full server URL, including https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Server URL must start with http:// or https://");
  }
  return url.origin;
}

export function getPocketBaseUrl(): string {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(POCKETBASE_URL_KEY);
      if (raw) return normalizePocketBaseUrl(raw);
    }
  } catch {
    // Ignore unreadable or invalid stored URLs and fall back to the default.
  }
  return DEFAULT_POCKETBASE_URL;
}

export function getPocketBase(): PocketBase {
  const url = getPocketBaseUrl();
  if (!client || clientUrl !== url) {
    client = new PocketBase(url);
    // The SDK otherwise cancels the previous list/update when a newer one starts.
    // Debounced sync and realtime need those requests to finish.
    client.autoCancellation(false);
    client.beforeSend = (requestUrl, options) => {
      applyCloudRequestTimeout(requestUrl, options);
      return { url: requestUrl, options };
    };
    clientUrl = url;
  }
  return client;
}

/** Structural wrapper so the storage adapter can run against the SDK or a test double. */
export function toPocketBaseClient(pb: PocketBase): PbClientLike {
  return {
    autoCancellation(enable: boolean) {
      pb.autoCancellation(enable);
    },
    authStore: {
      get isValid() {
        return pb.authStore.isValid;
      },
      get token() {
        return pb.authStore.token;
      },
      get record() {
        const record = pb.authStore.record;
        if (!record) return null;
        return {
          id: record.id,
          email: typeof record.email === "string" ? record.email : undefined,
          name: typeof record.name === "string" ? record.name : undefined,
        };
      },
      clear() {
        pb.authStore.clear();
      },
      onChange(callback, fireImmediately) {
        return pb.authStore.onChange((token, record) => {
          callback(
            token,
            record
              ? {
                  id: record.id,
                  email: typeof record.email === "string" ? record.email : undefined,
                  name: typeof record.name === "string" ? record.name : undefined,
                }
              : null
          );
        }, fireImmediately);
      },
    },
    collection(name: string) {
      const col = pb.collection(name);
      return {
        getFullList: (options) => col.getFullList(options),
        getFirstListItem: (filter) => col.getFirstListItem(filter),
        create: (data) => col.create(data),
        update: (id, data) => col.update(id, data),
        delete: (id) => col.delete(id),
        subscribe: (topic, callback) => col.subscribe(topic, callback),
        authWithPassword: (email, password) => col.authWithPassword(email, password),
      };
    },
  };
}

/** Time out REST calls. The SSE socket at `/api/realtime` stays open. */
export function applyCloudRequestTimeout(
  url: string,
  options: { signal?: AbortSignal | null }
): void {
  if (url.includes("/api/realtime")) return;
  if (options.signal) return;
  options.signal = AbortSignal.timeout(CLOUD_REQUEST_TIMEOUT_MS);
}

export function pocketBaseClient(): PbClientLike {
  return toPocketBaseClient(getPocketBase());
}

function resetClient(): void {
  client = null;
  clientUrl = "";
}

export function setPocketBaseUrl(input: string): string {
  const next = normalizePocketBaseUrl(input);
  const current = getPocketBaseUrl();
  if (next === current) return next;
  try {
    getPocketBase().authStore.clear();
  } catch {
    // Clearing a half-initialized store should not block the URL change.
  }
  try {
    localStorage.setItem(POCKETBASE_URL_KEY, next);
  } catch {
    throw new Error("Could not store the server URL on this device.");
  }
  resetClient();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POCKETBASE_URL_EVENT));
  }
  return next;
}

export interface CloudAuthSession {
  token: string;
  email: string | null;
  userId: string | null;
  name: string | null;
}

export function readCloudSession(): CloudAuthSession {
  const store = getPocketBase().authStore;
  const record = store.record;
  return {
    token: store.isValid ? store.token : "",
    email: record && typeof record.email === "string" ? record.email : null,
    userId: record?.id ?? null,
    name: record && typeof record.name === "string" ? record.name : null,
  };
}

export function onPocketBaseAuthChange(
  callback: (session: CloudAuthSession) => void
): () => void {
  return getPocketBase().authStore.onChange((token, record) => {
    callback({
      token,
      email: record && typeof record.email === "string" ? record.email : null,
      userId: record?.id ?? null,
      name: record && typeof record.name === "string" ? record.name : null,
    });
  }, true);
}

export async function loginWithPassword(email: string, password: string) {
  const pb = getPocketBase();
  return pb.collection("users").authWithPassword(email.trim(), password);
}

export async function registerWithPassword(input: {
  email: string;
  password: string;
  name?: string;
}) {
  const pb = getPocketBase();
  const email = input.email.trim();
  await pb.collection("users").create({
    email,
    password: input.password,
    passwordConfirm: input.password,
    name: input.name?.trim() ?? "",
    emailVisibility: false,
  });
  return pb.collection("users").authWithPassword(email, input.password);
}

export function logoutPocketBase(): void {
  getPocketBase().authStore.clear();
}
