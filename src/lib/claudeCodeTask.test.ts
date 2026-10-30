import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  appendNotePatch,
  buildTaskRunPrompt,
  extractRunSummary,
  formatRunNote,
  itemFolder,
  untrustedSources,
  withFolderProfile,
} from "./claudeCodeTask";

const node = (id: string, type: string, data: Record<string, unknown>, parentId?: string) =>
  ({ id, type, data, position: { x: 0, y: 0 }, ...(parentId ? { parentId } : {}) }) as Node;

describe("Claude Code task helpers", () => {
  it("runs an item in its own folder, else its region's", () => {
    const project = node("p", "projectFrame", { connectors: { localFolder: "~/repo" } });
    expect(itemFolder(node("t", "focusTask", {}), project)).toBe("~/repo");
    expect(itemFolder(node("t", "focusTask", { localFolder: "/other" }), project)).toBe("/other");
    expect(itemFolder(node("t", "focusTask", {}), null)).toBe("");
    expect(itemFolder(project, project)).toBe("~/repo");
  });

  it("lists GitHub-imported items, nearest first", () => {
    const project = node("p", "projectFrame", {});
    const nodes = [
      node("far", "focusTask", { title: "Far", githubRepo: "x/y", githubIssueNumber: 9 }),
      node("mine", "focusTask", { title: "Mine", githubRepo: "a/b", githubIssueNumber: 1 }, "p"),
      node("plain", "focusTask", { title: "Plain" }),
      project,
    ];
    expect(untrustedSources(nodes, nodes[1], project).map((s) => s.label)).toEqual(["a/b#1", "x/y#9"]);
    expect(untrustedSources([nodes[2]], nodes[2], null)).toEqual([]);
  });

  it("builds the Run task prompt from the task, its checklist and its issue", () => {
    const task = node("t", "focusTask", {
      title: "Fix login",
      notes: "- [ ] repro\n- [ ] patch",
      githubRepo: "a/b",
      githubIssueNumber: 7,
      actionable: true,
    });
    const prompt = buildTaskRunPrompt(task, node("p", "projectFrame", { title: "Auth", goal: "Ship SSO" }));
    expect(prompt).toContain("Work on this task in the working folder: Fix login");
    expect(prompt).toContain("- [ ] patch");
    expect(prompt).toContain("GitHub issue a/b#7");
    expect(prompt).toContain('region "Auth" (goal: Ship SSO)');
    expect(prompt).toContain('"Summary:"');
  });

  it("pulls the summary out of the answer", () => {
    expect(extractRunSummary("Did things.\n\nSummary: Fixed the bug; tests pass.")).toBe("Fixed the bug; tests pass.");
    expect(extractRunSummary("Did things.\n\n**Summary:** Two files.")).toBe("Two files.");
    expect(extractRunSummary("One.\n\nLast paragraph.")).toBe("Last paragraph.");
  });

  it("appends the run note to the task body", () => {
    const note = formatRunNote("Fixed it.", ["src/a.ts"], new Date("2026-10-30T12:34:00Z"));
    expect(note).toBe("**Claude Code run (2026-10-30 12:34):** Fixed it.\nChanged: `src/a.ts`");
    expect(appendNotePatch(node("t", "focusTask", { title: "Fix", notes: "old" }), "N")).toEqual({ title: "Fix", notes: "old\n\nN" });
    expect(appendNotePatch(node("t", "text", { text: "Body" }), "N")).toEqual({ text: "Body\n\nN" });
  });

  it("stores folder access, dropping plain canvas-only entries", () => {
    const start = [{ path: "/a", profile: "read" as const, bashAllowlist: [] }];
    expect(withFolderProfile(start, "/b", "workspace")).toEqual([...start, { path: "/b", profile: "workspace", bashAllowlist: [] }]);
    expect(withFolderProfile(start, "/a", "canvas")).toEqual([]);
    const withCmds = [{ path: "/a", profile: "workspace" as const, bashAllowlist: ["npm test"] }];
    expect(withFolderProfile(withCmds, "/a", "read")).toEqual([{ path: "/a", profile: "read", bashAllowlist: ["npm test"] }]);
  });
});
