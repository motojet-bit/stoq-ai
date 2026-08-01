import { describe, expect, it } from "vitest";
import {
  bindingFromEvent,
  displayBinding,
  findConflicts,
  formatChord,
  isModifierOnly,
  normalizeBinding,
} from "@/lib/ui/shortcutKeys";

const chord = (over: Partial<Parameters<typeof formatChord>[0]> = {}) => ({
  key: "n",
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  ...over,
});

describe("formatChord", () => {
  it("修飾キーを Ctrl → Alt → Shift → Meta の順に並べる", () => {
    expect(
      formatChord(chord({ key: "n", ctrl: true, alt: true, shift: true, meta: true })),
    ).toBe("Ctrl+Alt+Shift+Meta+N");
  });

  it("1 文字キーは大文字に揃える", () => {
    expect(formatChord(chord({ key: "n", ctrl: true }))).toBe("Ctrl+N");
    expect(formatChord(chord({ key: "N", ctrl: true }))).toBe("Ctrl+N");
  });

  it("修飾キーなしでも成立する", () => {
    expect(formatChord(chord({ key: "F5" }))).toBe("F5");
  });

  it("修飾キー単体は割り当てにならない", () => {
    expect(formatChord(chord({ key: "Control", ctrl: true }))).toBe("");
    expect(formatChord(chord({ key: "Shift", shift: true }))).toBe("");
    expect(isModifierOnly("Meta")).toBe(true);
    expect(isModifierOnly("n")).toBe(false);
  });

  it("記号キーはそのまま使う", () => {
    expect(formatChord(chord({ key: ",", ctrl: true }))).toBe("Ctrl+,");
  });
});

describe("normalizeBinding", () => {
  it("書き方が違っても同じ表記になる", () => {
    expect(normalizeBinding("ctrl+shift+n")).toBe("Ctrl+Shift+N");
    expect(normalizeBinding("Shift+Ctrl+N")).toBe("Ctrl+Shift+N");
    expect(normalizeBinding(" CONTROL + n ")).toBe("Ctrl+N");
  });

  it("Cmd / Command は Meta に寄せる", () => {
    expect(normalizeBinding("cmd+enter")).toBe("Meta+Enter");
    expect(normalizeBinding("Command+Enter")).toBe("Meta+Enter");
  });

  it("別名を正式名に直す", () => {
    expect(normalizeBinding("ctrl+return")).toBe("Ctrl+Enter");
    expect(normalizeBinding("esc")).toBe("Escape");
    expect(normalizeBinding("ctrl+up")).toBe("Ctrl+ArrowUp");
  });

  it("主キーが無ければ未割り当てとして扱う", () => {
    expect(normalizeBinding("Ctrl+")).toBe("");
    expect(normalizeBinding("Ctrl+Shift")).toBe("");
    expect(normalizeBinding("")).toBe("");
    expect(normalizeBinding("   ")).toBe("");
  });

  it("正規化は何度かけても変わらない", () => {
    const once = normalizeBinding("ctrl+shift+enter");
    expect(normalizeBinding(once)).toBe(once);
    expect(once).toBe("Ctrl+Shift+Enter");
  });
});

describe("bindingFromEvent", () => {
  const event = (init: Partial<KeyboardEventInit> & { key: string }) =>
    new KeyboardEvent("keydown", init);

  it("押されたキーから割り当て文字列を作る", () => {
    expect(bindingFromEvent(event({ key: "n", ctrlKey: true }))).toBe("Ctrl+N");
    expect(bindingFromEvent(event({ key: "Enter", ctrlKey: true }))).toBe("Ctrl+Enter");
  });

  it("スペースは Space として扱う", () => {
    expect(bindingFromEvent(event({ key: " ", ctrlKey: true }))).toBe("Ctrl+Space");
  });

  it("Cmd は Meta になる", () => {
    expect(bindingFromEvent(event({ key: "Enter", metaKey: true }))).toBe("Meta+Enter");
  });

  it("修飾キーを押しただけでは空", () => {
    expect(bindingFromEvent(event({ key: "Control", ctrlKey: true }))).toBe("");
  });
});

describe("displayBinding", () => {
  it("未割り当ては — で示す", () => {
    expect(displayBinding("")).toBe("—");
  });

  it("Windows ではそのまま出す", () => {
    expect(displayBinding("Ctrl+Shift+N")).toBe("Ctrl+Shift+N");
  });

  it("macOS では記号に置き換える", () => {
    expect(displayBinding("Meta+Enter", true)).toBe("⌘+Enter");
    expect(displayBinding("Ctrl+Alt+Shift+N", true)).toBe("⌃+⌥+⇧+N");
  });
});

describe("findConflicts", () => {
  it("同じキーが重なっているアクションを返す", () => {
    const conflicts = findConflicts({
      "chat.new": "Ctrl+N",
      "candidates.add": "Ctrl+N",
      "app.settings": "Ctrl+,",
    });
    expect(conflicts).toEqual({ "Ctrl+N": ["chat.new", "candidates.add"] });
  });

  it("重複が無ければ空", () => {
    expect(findConflicts({ a: "Ctrl+N", b: "Ctrl+B" })).toEqual({});
  });

  it("未割り当て同士は重複とみなさない", () => {
    expect(findConflicts({ a: "", b: "", c: "Ctrl+N" })).toEqual({});
  });
});
