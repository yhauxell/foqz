import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Cloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPocketBaseUrl,
  loginWithPassword,
  logoutPocketBase,
  registerWithPassword,
  setPocketBaseUrl,
} from "@/lib/pocketbase/client";
import { DEFAULT_POCKETBASE_URL } from "@/lib/pocketbase/constants";
import { authErrorMessage } from "@/lib/pocketbase/errors";
import {
  requestCloudFlush,
  requestCloudReconcile,
  useCloudSyncStatus,
} from "@/lib/storage/cloudSync";

export function CloudSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const phase = useCloudSyncStatus((state) => state.phase);
  const detail = useCloudSyncStatus((state) => state.detail);
  const email = useCloudSyncStatus((state) => state.email);
  const [serverUrl, setServerUrl] = useState(DEFAULT_POCKETBASE_URL);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setServerUrl(getPocketBaseUrl());
    setPassword("");
    setFormError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const signedIn = Boolean(email);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      setPocketBaseUrl(serverUrl);
      if (mode === "register") {
        await registerWithPassword({ email: address, password, name });
      } else {
        await loginWithPassword(address, password);
      }
      setPassword("");
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="cloud-settings-title"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 text-zinc-900 dark:text-zinc-100 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200">
              <Cloud className="size-5" />
            </div>
            <div>
              <h3 id="cloud-settings-title" className="text-sm font-semibold">
                Cloud sync
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {detail ?? "Boards stay local first, then sync in the background."}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close cloud settings"
            onClick={onClose}
            className="size-7 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center justify-center"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Server
          <Input
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            autoComplete="url"
            spellCheck={false}
          />
        </label>

        {signedIn ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Signed in as <span className="font-medium">{email}</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {phase === "error" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => requestCloudReconcile({ preferRemote: true })}
                >
                  Use cloud copy
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => requestCloudFlush()}>
                Sync now
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  logoutPocketBase();
                  setPassword("");
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "login" ? "default" : "outline"}
                onClick={() => setMode("login")}
              >
                Log in
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "register" ? "default" : "outline"}
                onClick={() => setMode("register")}
              >
                Register
              </Button>
            </div>
            {mode === "register" ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                Name
                <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Email
              <Input
                type="email"
                required
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Password
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </label>
            {formError ? <p className="text-xs text-red-600 dark:text-red-400">{formError}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Working…" : mode === "register" ? "Create account" : "Log in"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
