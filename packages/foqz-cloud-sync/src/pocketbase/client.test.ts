import { describe, expect, it } from "vitest";
import { applyCloudRequestTimeout } from "./client";

describe("applyCloudRequestTimeout", () => {
  it("leaves the realtime socket untimed", () => {
    const options: { signal?: AbortSignal | null } = {};
    applyCloudRequestTimeout("https://foqz.yruiz.site/api/realtime", options);
    expect(options.signal).toBeUndefined();
  });

  it("bounds ordinary API calls", () => {
    const options: { signal?: AbortSignal | null } = {};
    applyCloudRequestTimeout("https://foqz.yruiz.site/api/collections/boards/records", options);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);
  });

  it("keeps an existing abort signal", () => {
    const signal = AbortSignal.abort();
    const options = { signal };
    applyCloudRequestTimeout("https://foqz.yruiz.site/api/collections/boards/records", options);
    expect(options.signal).toBe(signal);
  });
});
