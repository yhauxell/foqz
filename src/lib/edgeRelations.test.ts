import { describe, expect, it } from "vitest";
import { DEFAULT_NEW_EDGE_RELATION, edgeRelation, isDependencyEdge } from "./edgeRelations";

describe("edgeRelations", () => {
  it("new connections are plain lines", () => {
    expect(DEFAULT_NEW_EDGE_RELATION).toBe("plain");
  });

  it("plain and relates are never dependencies", () => {
    expect(isDependencyEdge({ data: { relation: "plain" } })).toBe(false);
    expect(isDependencyEdge({ data: { relation: "relates" } })).toBe(false);
  });

  it("legacy edges with no relation keep reading as dependencies", () => {
    expect(edgeRelation({})).toBe("depends");
    expect(edgeRelation({ data: {} })).toBe("depends");
    expect(edgeRelation(undefined)).toBe("depends");
    expect(isDependencyEdge({ data: { relation: "depends" } })).toBe(true);
  });
});
