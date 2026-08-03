import { describe, expect, it } from "vitest";
import { isSelectAll, SELECT_SCOPE_ATTR, scopeElementOf } from "@/lib/ui/selectScope";

const key = (over: Partial<Parameters<typeof isSelectAll>[0]> = {}) => ({
  key: "a",
  ctrlKey: true,
  metaKey: false,
  target: null,
  ...over,
});

describe("Ctrl+A の判定", () => {
  it("Ctrl+A / Cmd+A を拾う", () => {
    expect(isSelectAll(key())).toBe(true);
    expect(isSelectAll(key({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(isSelectAll(key({ key: "A" }))).toBe(true);
  });

  it("修飾キー無しは拾わない", () => {
    expect(isSelectAll(key({ ctrlKey: false }))).toBe(false);
  });

  it("別のキーは拾わない", () => {
    expect(isSelectAll(key({ key: "c" }))).toBe(false);
  });

  it("**入力欄の中では効かせない**（既定の全選択のほうが正しい）", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    expect(isSelectAll(key({ target: input }))).toBe(false);
    expect(isSelectAll(key({ target: textarea }))).toBe(false);
  });
});

describe("選択対象の探索", () => {
  it("印の付いた祖先を見つける", () => {
    const scope = document.createElement("div");
    scope.setAttribute(SELECT_SCOPE_ATTR, "report");
    const inner = document.createElement("p");
    scope.appendChild(inner);
    expect(scopeElementOf(inner)).toBe(scope);
  });

  it("**印が無ければ null**（既定の全選択に任せる）", () => {
    expect(scopeElementOf(document.createElement("div"))).toBeNull();
    expect(scopeElementOf(null)).toBeNull();
  });
});
