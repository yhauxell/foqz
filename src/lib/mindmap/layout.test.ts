import { describe, expect, it } from "vitest";
import { balancedSide, descendantsOf, layoutMindmap, parseOutline, type MapItem } from "./layout";

const item = (id: string, parentId: string | null, order: number, extra: Partial<MapItem> = {}): MapItem => ({
  id,
  parentId,
  order,
  w: 100,
  h: 40,
  ...extra,
});

describe("layoutMindmap", () => {
  it("keeps the root in place and puts children to its right, centered", () => {
    const items = [item("r", null, 0), item("a", "r", 0), item("b", "r", 1)];
    const { positions } = layoutMindmap(items, "r", { x: 0, y: 0 });
    expect(positions.get("r")).toEqual({ x: 0, y: 0 });
    const a = positions.get("a")!;
    const b = positions.get("b")!;
    expect(a.x).toBeGreaterThan(100);
    expect(a.x).toBe(b.x);
    expect(a.y).toBeLessThan(b.y);
    // Children block is centered on the root's center (y = 20).
    expect((a.y + b.y + 40) / 2).toBeCloseTo(20);
  });

  it("puts left-side branches to the left", () => {
    const items = [item("r", null, 0), item("l", "r", 0, { side: "left" }), item("l1", "l", 0)];
    const { positions } = layoutMindmap(items, "r", { x: 0, y: 0 });
    expect(positions.get("l")!.x).toBeLessThan(0);
    expect(positions.get("l1")!.x).toBeLessThan(positions.get("l")!.x);
  });

  it("hides branches under a collapsed node", () => {
    const items = [item("r", null, 0), item("a", "r", 0, { collapsed: true }), item("a1", "a", 0), item("a2", "a1", 0)];
    const { hidden } = layoutMindmap(items, "r", { x: 0, y: 0 });
    expect([...hidden].sort()).toEqual(["a1", "a2"]);
  });

  it("lays out a 50-node map without overlaps", () => {
    const items: MapItem[] = [item("r", null, 0)];
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const p = `p${i}`;
      items.push(item(p, "r", i, { side: i % 2 ? "left" : "right" }));
      for (let j = 0; j < 4; j++) {
        const c = `${p}c${j}`;
        items.push(item(c, p, j, { h: 30 + ((n++ * 7) % 40) }));
        if (j < 2) items.push(item(`${c}g`, c, 0), item(`${c}h`, c, 1));
      }
    }
    expect(items.length).toBeGreaterThanOrEqual(46);
    const { positions } = layoutMindmap(items, "r", { x: 500, y: 500 });
    const placed = items.map((i) => ({ ...positions.get(i.id)!, w: i.w, h: i.h }));
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(hit, `${items[i].id} overlaps ${items[j].id}`).toBe(false);
      }
  });
});

describe("helpers", () => {
  it("balances new root children between sides", () => {
    expect(balancedSide([item("r", null, 0)], "r")).toBe("right");
    expect(balancedSide([item("r", null, 0), item("a", "r", 0)], "r")).toBe("left");
  });

  it("lists descendants", () => {
    const items = [item("r", null, 0), item("a", "r", 0), item("b", "a", 0), item("c", "r", 1)];
    expect(descendantsOf(items, "a")).toEqual(["b"]);
    expect(descendantsOf(items, "r").sort()).toEqual(["a", "b", "c"]);
  });

  it("parses indented lists and markdown outlines", () => {
    expect(parseOutline("Launch\n- Marketing\n  - Post\n- Build")).toEqual([
      { depth: 0, text: "Launch" },
      { depth: 0, text: "Marketing" },
      { depth: 1, text: "Post" },
      { depth: 0, text: "Build" },
    ]);
    expect(parseOutline("single line")).toBeNull();
  });
});
