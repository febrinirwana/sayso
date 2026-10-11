import { useSyncExternalStore } from "react";

/** The non-standard Chromium install event; not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export type InstallPlatform = "ios" | "other";

export interface InstallState {
  /** Running as an installed app (standalone display mode or iOS home-screen launch). */
  installed: boolean;
  /** A `beforeinstallprompt` event is held and `promptInstall()` will work. */
  canPrompt: boolean;
  platform: InstallPlatform;
}

/** iPhone, iPad and iPadOS (which reports a Mac UA but has touch points). */
export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
}

/** What the install button should do for a given state. */
export function installMode(state: InstallState): "hidden" | "prompt" | "ios-steps" {
  if (state.installed) return "hidden";
  if (state.canPrompt) return "prompt";
  if (state.platform === "ios") return "ios-steps";
  return "hidden";
}

const SERVER_STATE: InstallState = { installed: false, canPrompt: false, platform: "other" };

let deferred: BeforeInstallPromptEvent | null = null;
let installedViaEvent = false;
let started = false;
let state: InstallState = SERVER_STATE;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function recompute() {
  const next: InstallState = {
    installed: installedViaEvent || isStandalone(),
    canPrompt: deferred !== null,
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
  };
  if (
    next.installed === state.installed &&
    next.canPrompt === state.canPrompt &&
    next.platform === state.platform
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
}

/** Register the install listeners. Call once at app start, before React renders. Idempotent. */
export function startInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    recompute();
  });
  window.addEventListener("appinstalled", () => {
    installedViaEvent = true;
    deferred = null;
    recompute();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", recompute);
  recompute();
}

/** Show the browser install dialog. The event is single use, so it is dropped afterwards. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  recompute();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "dismissed";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => SERVER_STATE;

export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
