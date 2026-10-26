import { describe, expect, it } from "vitest";
import { HIGHLIGHT_COLORS, applyFormattingToString, clearTextFormatting, toggleHighlight } from "./textFormatting";

const color = (key: string) => HIGHLIGHT_COLORS.find((c) => c.key === key)!;

describe("toggleHighlight", () => {
  it("wraps plain text in a compact marker", () => {
    expect(toggleHighlight("text", color("blue"))).toBe("=={blue}text==");
  });

  it("recolors an existing highlight and unwraps on the same color", () => {
    expect(toggleHighlight("=={blue}text==", color("green"))).toBe("=={green}text==");
    expect(toggleHighlight("=={green}text==", color("green"))).toBe("text");
    expect(toggleHighlight("==text==", color("yellow"))).toBe("text");
  });

  it("replaces inner highlights instead of nesting them", () => {
    expect(toggleHighlight("a =={blue}b== c", color("pink"))).toBe("=={pink}a b c==");
  });

  it("converts a legacy <mark style> highlight", () => {
    const legacy = '<mark style="background-color: #bfdbfe; color: #1e3a8a;">old</mark>';
    expect(toggleHighlight(legacy, color("orange"))).toBe("=={orange}old==");
  });

  it("marks each line after its list, checkbox or heading prefix", () => {
    expect(toggleHighlight("# Title\n\n- [ ] one\n1. two\n> quote", color("blue"))).toBe(
      "# =={blue}Title==\n\n- [ ] =={blue}one==\n1. =={blue}two==\n> =={blue}quote==",
    );
  });

  it("does not treat a mid-line selection as a list prefix", () => {
    expect(toggleHighlight("- not a bullet", color("blue"), false)).toBe("=={blue}- not a bullet==");
  });
});

describe("clearing formatting", () => {
  it("removes compact and legacy highlights", () => {
    expect(clearTextFormatting("=={blue}a== and ==b== and <mark style=\"x\">c</mark>")).toBe("a and b and c");
  });

  it("applies to a whole string", () => {
    expect(applyFormattingToString("hi", "highlight", { color: color("purple") })).toBe("=={purple}hi==");
  });
});
