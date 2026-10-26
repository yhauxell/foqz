import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildClaudeCodePrompt, parseClaudeCodeLine, splitClaudeToolName } from "./claudeCode";
import { mergeAppSettings, resolveActiveAiConfig } from "./appSettings";

// Recorded from `claude -p --output-format stream-json --verbose --include-partial-messages`.
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8").split("\n").filter(Boolean);

describe("parseClaudeCodeLine", () => {
  it("streams text from partial deltas and reads the final result", () => {
    const events = fixture("claude-code-stream.ndjson").flatMap(parseClaudeCodeLine);
    expect(events).toEqual([
      { type: "text", text: "hi" },
      { type: "result", isError: false, text: "hi" },
    ]);
  });

  it("pairs a tool call with its result", () => {
    const events = fixture("claude-code-tool-stream.ndjson").flatMap(parseClaudeCodeLine);
    expect(events).toEqual([
      { type: "tool_use", id: "toolu_01V3FM85QdM6LYXHppnzr5Xq", name: "Glob", input: { pattern: "*.ndjson" } },
      { type: "tool_result", toolUseId: "toolu_01V3FM85QdM6LYXHppnzr5Xq", isError: false, text: "sample.ndjson\ntool.ndjson" },
    ]);
  });

  it("reads array tool results and errors", () => {
    const line = JSON.stringify({
      type: "user",
      parent_tool_use_id: null,
      message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: [{ type: "text", text: "nope" }] }] },
    });
    expect(parseClaudeCodeLine(line)).toEqual([{ type: "tool_result", toolUseId: "t1", isError: true, text: "nope" }]);
  });

  it("skips subagent events, other events and junk", () => {
    const sub = JSON.stringify({
      type: "stream_event",
      parent_tool_use_id: "toolu_x",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "inner" } },
    });
    expect(parseClaudeCodeLine(sub)).toEqual([]);
    expect(parseClaudeCodeLine('{"type":"system","subtype":"init"}')).toEqual([]);
    expect(parseClaudeCodeLine("not json")).toEqual([]);
  });
});

describe("splitClaudeToolName", () => {
  it("splits MCP tool names and leaves built-ins alone", () => {
    expect(splitClaudeToolName("mcp__foqz__update_node")).toEqual({ serverName: "foqz", toolName: "update_node" });
    expect(splitClaudeToolName("Glob")).toEqual({ toolName: "Glob" });
  });
});

describe("buildClaudeCodePrompt", () => {
  it("writes earlier turns and the canvas context ahead of the request", () => {
    const prompt = buildClaudeCodePrompt({
      userPrompt: "split it",
      canvasContext: "Board overview: 3 items",
      conversationHistory: [
        { role: "user", content: "what is this?" },
        { role: "assistant", content: "A plan." },
        { role: "user", content: "split it" },
      ],
    });
    expect(prompt).toBe(
      "Conversation so far:\nUser: what is this?\n\nAssistant: A plan.\n\nBoard overview: 3 items\n\nUser request: split it",
    );
  });
});

describe("Claude Code settings", () => {
  it("keeps claude-code as the chosen provider across a reload", () => {
    const merged = mergeAppSettings({ activeAiProvider: "claude-code", claudeCodeEnabled: true, claudeCodeModel: " opus " });
    expect(merged.activeAiProvider).toBe("claude-code");
    expect(resolveActiveAiConfig(merged)).toEqual({ provider: "claude-code", model: "opus", isConfigured: true });
  });

  it("is off until turned on", () => {
    expect(resolveActiveAiConfig({ activeAiProvider: "claude-code" }).isConfigured).toBe(false);
  });
});
