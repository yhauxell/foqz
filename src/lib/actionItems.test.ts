import { describe, expect, it } from "vitest";
import { buildExtractionPrompt, extractionScope, parseActionItems } from "./actionItems";

const n = (id: string, data: any, type = "text", extra: any = {}) => ({ id, type, position: { x: 0, y: 0 }, data, ...extra });

describe("parseActionItems", () => {
  const scope = new Set(["a", "b"]);
  it("reads plain JSON, fenced JSON and bare arrays", () => {
    expect(parseActionItems('{"items":[{"title":"Write post","sourceId":"a"}]}', scope)).toEqual([
      { title: "Write post", notes: undefined, sourceId: "a" },
    ]);
    expect(parseActionItems('Sure!\n```json\n{"items":[{"title":"X","notes":"y","sourceId":"zz"}]}\n```', scope)).toEqual([
      { title: "X", notes: "y", sourceId: null },
    ]);
    expect(parseActionItems('[{"title":"Y","sourceId":"b"}]', scope)[0].sourceId).toBe("b");
  });
  it("returns nothing for garbage", () => {
    expect(parseActionItems("I could not find any", scope)).toEqual([]);
  });
});

describe("extraction scope and prompt", () => {
  const nodes: any[] = [
    n("frame", { title: "Arch" }, "projectFrame"),
    n("db", { label: "Postgres" }, "box", { parentId: "frame" }),
    n("api", { label: "API" }, "box", { parentId: "frame" }),
    n("r", { text: "Launch", mindmap: { rootId: "r", parentId: null, order: 0 } }),
    n("c", { text: "Marketing", mindmap: { rootId: "r", parentId: "r", order: 0 } }),
    n("t", { title: "Existing" }, "focusTask"),
  ];
  it("grows a region to its contents and a map node to its whole map; skips tasks", () => {
    expect(extractionScope(nodes, ["frame"]).map((x) => x.id)).toEqual(["db", "api"]);
    expect(extractionScope(nodes, ["c"]).map((x) => x.id)).toEqual(["r", "c"]);
    expect(extractionScope(nodes, []).map((x) => x.id)).not.toContain("t");
  });
  it("describes hierarchy and connection types", () => {
    const prompt = buildExtractionPrompt(extractionScope(nodes, ["frame", "r"]), [
      { id: "e", source: "db", target: "api", data: { relation: "depends" } } as any,
      { id: "p", source: "api", target: "db", data: { relation: "plain" } } as any,
    ]);
    expect(prompt).toContain('[c] text: "Marketing" (branch of r)');
    expect(prompt).toContain("api DEPENDS ON db");
    expect(prompt).toContain("api — db (connected)");
  });
});
