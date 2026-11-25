import { describe, it, expect } from "vitest";
import { parseRefs, formatRange, verseIdsInRange } from "./books";
describe("refs", () => {
  it("parses common forms", () => {
    expect(parseRefs("Gen 1:1-3")).toEqual([{ s: 1001001, e: 1001003 }]);
    expect(parseRefs("John 1")).toEqual([{ s: 43001001, e: 43001051 }]);
    expect(parseRefs("1 Cor 13:4-7, 13")).toEqual([{ s: 46013004, e: 46013007 }, { s: 46013013, e: 46013013 }]);
    expect(parseRefs("Ps 23–24; Rom 8:28")!.length).toBe(2);
    expect(parseRefs("Genesis 1:31-2:3")).toEqual([{ s: 1001031, e: 1002003 }]);
    expect(parseRefs("Jude")).toEqual([{ s: 65001001, e: 65001025 }]);
    expect(parseRefs("Gen 51")).toBeNull();
    expect(parseRefs("Foo 1")).toBeNull();
  });
  it("formats", () => {
    expect(formatRange(1001001, 1002025)).toBe("Genesis 1–2");
    expect(formatRange(1001001, 1001003)).toBe("Genesis 1:1–3");
  });
  it("skips NIV-omitted verses", () => {
    expect(verseIdsInRange(40017020, 40017022)).toEqual([40017020, 40017022]);
  });
});
