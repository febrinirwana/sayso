import { describe, expect, it } from "vitest";
import { detectPlatform, type InstallState, installMode } from "./install";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";

const state = (over: Partial<InstallState>): InstallState => ({
  installed: false,
  canPrompt: false,
  platform: "other",
  ...over,
});

describe("detectPlatform", () => {
  it("spots iPhone and iPadOS", () => {
    expect(detectPlatform(IPHONE, 5)).toBe("ios");
    expect(detectPlatform(MAC, 5)).toBe("ios");
  });
  it("leaves desktop Mac and Android alone", () => {
    expect(detectPlatform(MAC, 0)).toBe("other");
    expect(detectPlatform(ANDROID, 5)).toBe("other");
  });
});

describe("installMode", () => {
  it("hides when installed", () => {
    expect(installMode(state({ installed: true, canPrompt: true }))).toBe("hidden");
  });
  it("prompts when the event is held", () => {
    expect(installMode(state({ canPrompt: true }))).toBe("prompt");
    expect(installMode(state({ canPrompt: true, platform: "ios" }))).toBe("prompt");
  });
  it("shows iOS steps without an event", () => {
    expect(installMode(state({ platform: "ios" }))).toBe("ios-steps");
  });
  it("shows nothing elsewhere", () => {
    expect(installMode(state({}))).toBe("hidden");
  });
});
