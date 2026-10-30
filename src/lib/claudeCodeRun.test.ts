import { afterEach, describe, expect, it } from "vitest";
import {
  buildClaudeCodePrompt,
  folderNote,
  isMissingSessionError,
  newClaudeCodeSessionId,
  parseClaudeCodeLine,
  runClaudeCodeAgent,
  type ClaudeCodeRunRequest,
} from "./claudeCode";
import { mergeAppSettings } from "./appSettings";

describe("Claude Code session and run events", () => {
  it("reads the session id from init and cost and duration from the result", () => {
    expect(parseClaudeCodeLine(JSON.stringify({ type: "system", subtype: "init", session_id: "abc", tools: ["Read"] }))).toEqual([
      { type: "init", sessionId: "abc", tools: ["Read"] },
    ]);
    const [result] = parseClaudeCodeLine(
      JSON.stringify({ type: "result", is_error: false, result: "ok", total_cost_usd: 0.0123, duration_ms: 4200, num_turns: 3, session_id: "abc" }),
    );
    expect(result).toEqual({ type: "result", isError: false, text: "ok", costUsd: 0.0123, durationMs: 4200, numTurns: 3, sessionId: "abc" });
  });

  it("leaves earlier turns out of a resumed session's prompt", () => {
    const options = {
      userPrompt: "next",
      canvasContext: "ctx",
      conversationHistory: [
        { role: "user" as const, content: "first" },
        { role: "assistant" as const, content: "answer" },
        { role: "user" as const, content: "next" },
      ],
    };
    expect(buildClaudeCodePrompt(options)).toContain("Conversation so far");
    expect(buildClaudeCodePrompt(options, true)).toBe("ctx\n\nUser request: next");
  });

  it("makes UUID session ids and spots a missing session", () => {
    expect(newClaudeCodeSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isMissingSessionError("No conversation found with session ID: x")).toBe(true);
    expect(isMissingSessionError("rate limited")).toBe(false);
  });

  it("tells Claude Code what it may do in the folder", () => {
    expect(folderNote("canvas", "/x")).toMatch(/no access to files/);
    expect(folderNote("read", "/x")).toMatch(/read and search/);
    expect(folderNote("workspace", "/x")).toMatch(/edit its files/);
  });

  it("keeps folder access, run limits and drops junk", () => {
    const s = mergeAppSettings({
      claudeCodeFolders: [
        { path: "/a/", profile: "workspace", bashAllowlist: ["npm test", "rm (x)"] },
        { path: "/a", profile: "read" },
        { path: "/b", profile: "root" },
      ] as any,
      claudeCodeMaxRuns: 99,
      claudeCodeTimeoutMinutes: 0,
    });
    expect(s.claudeCodeFolders).toEqual([
      { path: "/a", profile: "workspace", bashAllowlist: ["npm test"] },
      { path: "/b", profile: "canvas", bashAllowlist: [] },
    ]);
    expect(s.claudeCodeMaxRuns).toBe(10);
    expect(s.claudeCodeTimeoutMinutes).toBe(1);
    expect(mergeAppSettings({}).claudeCodeMaxRuns).toBe(3);
  });
});

type Script = (req: ClaudeCodeRunRequest, emit: (obj: unknown) => void, exit: (code: number, stderr?: string) => void) => void;

/** A stand-in for the Electron bridge that plays `script` for each run. */
function fakeBridge(script: Script, runResult = { ok: true, profile: "workspace" as const, cwd: "/repo", persistent: true }) {
  const lines = new Set<(p: any) => void>();
  const exits = new Set<(p: any) => void>();
  const runs: ClaudeCodeRunRequest[] = [];
  (globalThis as any).window = {
    focusStore: {
      claudeCode: {
        onLine: (h: any) => (lines.add(h), () => lines.delete(h)),
        onExit: (h: any) => (exits.add(h), () => exits.delete(h)),
        cancel: async () => true,
        run: async (req: ClaudeCodeRunRequest) => {
          runs.push(req);
          setTimeout(() =>
            script(
              req,
              (obj) => lines.forEach((h) => h({ requestId: req.requestId, line: JSON.stringify(obj) })),
              (code, stderr = "") => exits.forEach((h) => h({ requestId: req.requestId, code, signal: null, stderr })),
            ),
          );
          return runResult;
        },
      },
    },
  };
  return runs;
}

const delta = (text: string) => ({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });

describe("runClaudeCodeAgent", () => {
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("starts a session, records the run and the files it changed", async () => {
    const runs = fakeBridge((req, emit, exit) => {
      emit({ type: "system", subtype: "init", session_id: req.sessionId, tools: [] });
      emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/src/a.ts" } }] } });
      emit({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
      emit(delta("Done. Summary: fixed it."));
      emit({ type: "result", is_error: false, result: "Done.", total_cost_usd: 0.01, duration_ms: 1500, session_id: req.sessionId });
      exit(0);
    });
    const res = await runClaudeCodeAgent({ userPrompt: "fix it", claudeCode: { folder: "/repo", nodeId: "n1", profile: "workspace" } });
    expect(runs[0].resume).toBe(false);
    expect(runs[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(runs[0].nodeId).toBe("n1");
    expect(res.success).toBe(true);
    expect(res.claudeCodeRun).toMatchObject({
      sessionId: runs[0].sessionId,
      cwd: "/repo",
      profile: "workspace",
      costUsd: 0.01,
      durationMs: 1500,
      changedFiles: ["src/a.ts"],
    });
    expect(res.claudeCodeRun!.entries.map((e) => e.kind)).toEqual(["tool_use", "tool_result", "text"]);
  });

  it("resumes a session without replaying the chat", async () => {
    const runs = fakeBridge((req, emit, exit) => {
      emit({ type: "result", is_error: false, result: "again", session_id: req.sessionId });
      exit(0);
    });
    const sessionId = newClaudeCodeSessionId();
    await runClaudeCodeAgent({
      userPrompt: "next",
      conversationHistory: [{ role: "user", content: "first" }, { role: "user", content: "next" }],
      claudeCode: { profile: "read", sessionId },
    });
    expect(runs[0]).toMatchObject({ sessionId, resume: true });
    expect(runs[0].prompt).not.toContain("first");
  });

  it("starts over with the chat history when the session is gone", async () => {
    const runs = fakeBridge((req, emit, exit) => {
      if (req.resume) {
        emit({ type: "result", is_error: true, subtype: "error_during_execution", result: "" });
        exit(1, "No conversation found with session ID: x");
        return;
      }
      emit(delta("fresh answer"));
      emit({ type: "result", is_error: false, result: "fresh answer", session_id: req.sessionId });
      exit(0);
    });
    const res = await runClaudeCodeAgent({
      userPrompt: "next",
      conversationHistory: [{ role: "user", content: "first" }, { role: "user", content: "next" }],
      claudeCode: { profile: "read", sessionId: newClaudeCodeSessionId() },
    });
    expect(runs).toHaveLength(2);
    expect(runs[1].resume).toBe(false);
    expect(runs[1].sessionId).not.toBe(runs[0].sessionId);
    expect(runs[1].prompt).toContain("first");
    expect(res.finalText).toMatch(/session was gone/);
    expect(res.finalText).toContain("fresh answer");
    expect(res.claudeCodeRun!.sessionId).toBe(runs[1].sessionId);
  });

  it("keeps no session for canvas-only runs", async () => {
    const runs = fakeBridge(
      (req, emit, exit) => {
        emit({ type: "system", subtype: "init", session_id: "ephemeral", tools: [] });
        emit({ type: "result", is_error: false, result: "ok" });
        exit(0);
      },
      { ok: true, profile: "canvas" as any, cwd: "/foqz", persistent: false },
    );
    const res = await runClaudeCodeAgent({ userPrompt: "hi", claudeCode: { profile: "canvas" } });
    expect(runs[0].sessionId).toBeUndefined();
    expect(res.claudeCodeRun!.sessionId).toBeUndefined();
  });
});
