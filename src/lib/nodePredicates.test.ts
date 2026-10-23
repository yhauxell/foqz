import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { convertTextStyle, isActionable, isTextNode, nodeTitle, textStyleOf } from "@/lib/nodePredicates";

const plain = (data: Record<string, unknown>): Node =>
  ({ id: "t1", type: "text", position: { x: 10, y: 20 }, parentId: "r1", data, style: { width: 300 } }) as Node;

describe("isActionable", () => {
  it("is true for cards and for text with the to-do behavior", () => {
    expect(isActionable({ type: "focusTask", data: {} } as Node)).toBe(true);
    expect(isActionable(plain({ text: "x", actionable: true }))).toBe(true);
    expect(isActionable({ type: "note", data: { actionable: true } } as unknown as Node)).toBe(true);
  });

  it("is false for plain text and for shapes even if flagged", () => {
    expect(isActionable(plain({ text: "x" }))).toBe(false);
    expect(isActionable({ type: "box", data: { actionable: true } } as unknown as Node)).toBe(false);
    expect(isTextNode({ type: "projectFrame" } as Node)).toBe(false);
  });
});

describe("nodeTitle", () => {
  it("uses the first line of text and skips the default sticky title", () => {
    expect(nodeTitle(plain({ text: "# Pricing\n- [ ] Free" }))).toBe("Pricing");
    expect(nodeTitle({ id: "n", data: { title: "Note", text: "Ask Sam" } } as unknown as Node)).toBe("Ask Sam");
    expect(nodeTitle({ id: "c", data: { title: "Ship it" } } as unknown as Node)).toBe("Ship it");
  });
});

describe("convertTextStyle", () => {
  it("keeps id, position, parent and behavior when turning plain text into a card", () => {
    const card = convertTextStyle(
      plain({ text: "Pricing tiers\n- [ ] Free", actionable: true, status: "done", focusSecondsSpent: 60, color: "#2563eb" }),
      "card"
    );
    expect(card).toMatchObject({ id: "t1", type: "focusTask", parentId: "r1", position: { x: 10, y: 20 } });
    expect(card.data).toMatchObject({
      title: "Pricing tiers",
      notes: "- [ ] Free",
      status: "done",
      actionable: true,
      focusSecondsSpent: 60,
    });
    expect(card.data).not.toHaveProperty("text");
    expect(card.data).not.toHaveProperty("color");
  });

  it("round-trips card → sticky → plain without losing text", () => {
    const card: Node = {
      id: "c1",
      type: "focusTask",
      position: { x: 0, y: 0 },
      data: { title: "Write post", notes: "Draft\nEdit", status: "open", paper: "sage", githubIssueNumber: 7 },
    } as Node;
    const sticky = convertTextStyle(card, "sticky");
    expect(textStyleOf(sticky)).toBe("sticky");
    expect(sticky.data).toMatchObject({ text: "Write post\nDraft\nEdit", actionable: true, githubIssueNumber: 7 });
    expect(sticky.data).not.toHaveProperty("paper");

    const back = convertTextStyle(sticky, "plain");
    expect(back.type).toBe("text");
    expect(back.data).toMatchObject({ text: "Write post\nDraft\nEdit", actionable: true });
    expect(back.data).not.toHaveProperty("variant");
  });

  it("is a no-op for the current style and for non-text nodes", () => {
    const t = plain({ text: "a" });
    expect(convertTextStyle(t, "plain")).toBe(t);
    const box = { id: "b", type: "box", position: { x: 0, y: 0 }, data: {} } as Node;
    expect(convertTextStyle(box, "card")).toBe(box);
  });
});
