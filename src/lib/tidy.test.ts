import { describe, expect, it } from "vitest";
import { buildUnits, countOverlapping, planTidy, DEFAULT_TIDY_OPTIONS } from "./tidy";

const n = (id: string, x: number, y: number, extra: any = {}) => ({
  id,
  type: "text",
  position: { x, y },
  style: { width: 100, height: 40 },
  data: { text: id },
  ...extra,
});

function boxesAfter(nodes: any[], plan: ReturnType<typeof planTidy>) {
  return nodes
    .filter((x) => !x.parentId)
    .map((x) => ({ ...(plan.moves.get(x.id) ?? x.position), w: x.style.width, h: x.style.height }));
}

describe("tidy", () => {
  it("separates overlapping elements without moving anything that is fine", () => {
    const nodes = [n("a", 0, 0), n("b", 20, 10), n("c", 40, 20), n("far", 900, 900)];
    const plan = planTidy(nodes as any, [], DEFAULT_TIDY_OPTIONS);
    expect(plan.stats.overlapping).toBe(3);
    expect(countOverlapping(boxesAfter(nodes, plan))).toBe(0);
    expect(plan.moves.has("far")).toBe(false);
  });

  it("moves connected diagrams and regions as one piece", () => {
    const nodes = [
      n("frame", 0, 0, { type: "projectFrame", style: { width: 300, height: 200 } }),
      n("inside", 20, 60, { parentId: "frame" }),
      n("x", 100, 100),
      n("y", 250, 100),
    ];
    const edges = [{ id: "e", source: "x", target: "y" }];
    const units = buildUnits(nodes as any, edges as any);
    expect(units.map((u) => u.members.sort())).toEqual(expect.arrayContaining([["frame"], ["x", "y"]]));
    const plan = planTidy(nodes as any, edges as any, DEFAULT_TIDY_OPTIONS);
    const dx = plan.moves.get("x")!.x - 100;
    expect(plan.moves.get("y")!.x - 250).toBe(dx); // the diagram kept its shape
    expect(plan.moves.has("inside")).toBe(false); // region contents move with the region, untouched
  });

  it("groups close loose items (3+) into a region, leaving diagrams and pairs alone", () => {
    const nodes = [n("a", 0, 0), n("b", 0, 80), n("c", 140, 0), n("solo1", 1000, 0), n("solo2", 1000, 80)];
    const plan = planTidy(nodes as any, [], DEFAULT_TIDY_OPTIONS);
    expect(plan.groups.map((g) => g.sort())).toEqual([["a", "b", "c"]]);
  });

  it("only touches the selection when there is one", () => {
    const nodes = [n("a", 0, 0), n("b", 20, 10), n("c", 500, 0), n("d", 520, 10)];
    const plan = planTidy(nodes as any, [], DEFAULT_TIDY_OPTIONS, ["c"]);
    expect(plan.moves.has("a") || plan.moves.has("b")).toBe(false);
    expect(plan.moves.has("c") || plan.moves.has("d")).toBe(true);
  });

  it("folds mind maps to their main branches when asked", () => {
    const mm = (parentId: string | null, order = 0) => ({ mindmap: { rootId: "r", parentId, order } });
    const nodes = [
      n("r", 0, 0, { data: { text: "r", ...mm(null) } }),
      n("a", 200, 0, { data: { text: "a", ...mm("r") } }),
      n("a1", 400, 0, { data: { text: "a1", ...mm("a") } }),
      n("b", 200, 80, { data: { text: "b", ...mm("r", 1) } }),
    ];
    const plan = planTidy(nodes as any, [], { ...DEFAULT_TIDY_OPTIONS, foldMaps: true });
    expect(plan.fold).toEqual(["a"]);
    expect(plan.stats.mapsFolded).toBe(1);
  });
});
