import { describe, expect, it } from "vitest";
import { GEMINI_OPENAI_BASE_URL, mergeAppSettings, resolveActiveAiConfig } from "@/lib/appSettings";

describe("v0.14 settings migration", () => {
  it("moves an active Gemini provider onto the OpenAI-compatible endpoint", () => {
    const merged = mergeAppSettings({
      activeAiProvider: "gemini",
      geminiEnabled: true,
      geminiApiKey: " AIza-key ",
      geminiDefaultModel: "gemini-1.5-flash",
    } as any);
    expect(merged).toMatchObject({
      activeAiProvider: "openai",
      openaiEnabled: true,
      openaiApiKey: "AIza-key",
      openaiBaseUrl: GEMINI_OPENAI_BASE_URL,
      openaiDefaultModel: "gemini-2.5-flash",
    });
    expect(resolveActiveAiConfig(merged)).toMatchObject({ provider: "openai", isConfigured: true });
  });

  it("keeps an existing OpenAI key when Gemini was configured but not active", () => {
    const merged = mergeAppSettings({
      activeAiProvider: "openai",
      openaiApiKey: "sk-real",
      geminiApiKey: "AIza-key",
    } as any);
    expect(merged.openaiApiKey).toBe("sk-real");
    expect(merged.openaiBaseUrl).toBe("https://api.openai.com/v1");
  });

  it("drops removed settings keys", () => {
    const merged = mergeAppSettings({
      typesafeApiKey: "secret",
      typesafeEnabled: true,
      imageProvider: "pollinations",
      agentProfiles: [{ id: "x" }],
      geminiApiKey: "",
    } as any) as Record<string, unknown>;
    for (const key of ["typesafeApiKey", "typesafeEnabled", "imageProvider", "agentProfiles", "geminiApiKey"]) {
      expect(merged).not.toHaveProperty(key);
    }
  });

  it("falls back to Ollama when a stale gemini provider has no key", () => {
    const merged = mergeAppSettings({ activeAiProvider: "gemini" } as any);
    expect(resolveActiveAiConfig(merged).provider).toBe("ollama");
  });
});

describe("main-process migration parity", () => {
  it("electron/settingsMigration.cjs migrates the same way as the renderer", async () => {
    const { migrateLegacyAiSettings } = await import("@/lib/appSettings");
    // @ts-expect-error CommonJS module without types
    const main = await import("../../electron/settingsMigration.cjs");
    const migrateGeminiSettings = (main.default ?? main).migrateGeminiSettings;
    const cases = [
      { activeAiProvider: "gemini", geminiApiKey: "k", geminiDefaultModel: "gemini-1.5-pro" },
      { activeAiProvider: "gemini", geminiApiKey: "k", geminiDefaultModel: "gemini-2.0-flash" },
      { activeAiProvider: "openai", openaiApiKey: "sk", geminiApiKey: "k" },
      { geminiApiKey: "k" },
      { activeAiProvider: "gemini" },
      { activeAiProvider: "ollama" },
    ];
    for (const c of cases) {
      expect(migrateGeminiSettings({ ...c })).toEqual(migrateLegacyAiSettings({ ...c }));
    }
  });
});
