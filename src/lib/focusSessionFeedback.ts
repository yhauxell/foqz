import { getCachedAppSettings } from "./appSettingsCache";

function playSoftChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    g.gain.value = 0.08;
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    // ignore
  }
}

/** Call when a focus block completes naturally (full session). */
export function playFocusBlockEndFeedback(kind: "timer" | "task") {
  const s = getCachedAppSettings();
  if (s.notifyOnTimerEnd && typeof Notification !== "undefined") {
    if (Notification.permission === "granted") {
      const title = kind === "timer" ? "Focus timer" : "Focus session";
      try {
        new Notification(title, { body: "Time’s up." });
      } catch {
        // ignore
      }
    }
  }
  if (s.playSoundOnTimerEnd) {
    playSoftChime();
  }
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
