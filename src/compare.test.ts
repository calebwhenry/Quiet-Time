import { describe, it, expect } from "vitest";
import { compare, tokenize } from "./compare";

const SRC = "In the beginning God created the heavens and the earth.";

describe("compare", () => {
  it("empty input has no errors", () => {
    const r = compare("", SRC);
    expect(r.errors).toEqual([]); expect(r.complete).toBe(false);
  });
  it("correct prefix and in-progress word are not errors", () => {
    expect(compare("In the begin", SRC).errors).toEqual([]);
    expect(compare("In the beginning G", SRC).firstError).toBe(-1);
  });
  it("a finished wrong word is flagged once, without cascading", () => {
    const r = compare("In teh beginning God created", SRC);
    expect(r.errors).toEqual([[3, 6]]);
    expect(r.hint).toContain("the");
  });
  it("a wrong character in an in-progress word is flagged immediately", () => {
    expect(compare("In the bx", SRC).errors.length).toBe(1);
  });
  it("an inserted extra word only flags that word", () => {
    const r = compare("In the very beginning God created", SRC);
    expect(r.errors).toEqual([[7, 11]]);
  });
  it("a deleted word shows a missing marker, later words stay correct", () => {
    const r = compare("In beginning God created", SRC);
    expect(r.errors).toEqual([]);
    expect(r.missing).toEqual([3]);
    expect(r.hint).toBe("Missing “the”");
  });
  it("case and punctuation matter", () => {
    expect(compare("in the beginning ", SRC).errors.length).toBe(1);
    expect(compare(SRC.replace(".", ","), SRC).complete).toBe(false);
  });
  it("complete only when every token matches", () => {
    expect(compare(SRC, SRC).complete).toBe(true);
    expect(compare(SRC.slice(0, -1), SRC).complete).toBe(false);
  });
  it("whitespace, line breaks and NBSP are equivalent", () => {
    expect(compare("In  the\nbeginning God created the heavens and the earth.", SRC).complete).toBe(true);
  });
  it("typographic equivalences", () => {
    const src = "“I’m here”—he said… pages 1–2";
    expect(compare("\"I'm here\"--he said... pages 1-2", src).complete).toBe(true);
    expect(compare(src, src).complete).toBe(true);
  });
  it("hyphen is not an em dash", () => {
    expect(compare("a-b", "a—b").complete).toBe(false);
  });
  it("editing an earlier word updates errors", () => {
    expect(compare("In the beginnin God", SRC).errors).toEqual([[7, 15]]);
    expect(compare("In the beginning God", SRC).errors).toEqual([]);
  });
  it("tokens keep raw offsets", () => {
    expect(tokenize("Lord's, ok").map((t) => [t.raw, t.start])).toEqual([["Lord's", 0], [",", 6], ["ok", 8]]);
  });
  it("trailing space after a partial word makes it an error", () => {
    expect(compare("In the begin ", SRC).errors.length).toBe(1);
  });
});
