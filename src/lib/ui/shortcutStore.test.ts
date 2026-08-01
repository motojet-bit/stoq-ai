import { describe, expect, it } from "vitest";
import { mergeBindings, SHORTCUTS } from "@/lib/ui/shortcutStore";

describe("mergeBindings", () => {
  it("上書きが無ければ既定がそのまま入る", () => {
    const map = mergeBindings([]);
    for (const def of SHORTCUTS) {
      expect(map[def.action]).toBe(def.defaultBinding);
    }
  });

  it("上書きされたアクションだけ差し替わる", () => {
    const map = mergeBindings([{ action: "chat.new", binding: "F2" }]);
    expect(map["chat.new"]).toBe("F2");
    expect(map["sidebar.toggle"]).toBe("Ctrl+B");
  });

  it("上書きの表記ゆれも正規化される", () => {
    const map = mergeBindings([{ action: "chat.new", binding: "shift+ctrl+n" }]);
    expect(map["chat.new"]).toBe("Ctrl+Shift+N");
  });

  it("空文字の上書きは「割り当てなし」になる", () => {
    expect(mergeBindings([{ action: "chat.new", binding: "" }])["chat.new"]).toBe("");
  });

  it("知らないアクションの上書きは無視する（古い設定が残っていても壊れない）", () => {
    const map = mergeBindings([{ action: "legacy.action", binding: "F9" }]);
    expect(Object.keys(map).sort()).toEqual(SHORTCUTS.map((s) => s.action).sort());
  });
});

describe("既定の割り当て", () => {
  it("アクション ID が重複していない", () => {
    const ids = SHORTCUTS.map((s) => s.action);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("既定キーが互いに衝突していない", () => {
    const used = SHORTCUTS.map((s) => s.defaultBinding);
    expect(new Set(used).size).toBe(used.length);
  });

  it("主要アクションに既定キーが割り当ててある", () => {
    const map = mergeBindings([]);
    expect(map["chat.new"]).toBe("Ctrl+N");
    expect(map["candidates.add"]).toBe("Ctrl+Shift+A");
    expect(map["chat.send"]).toBe("Ctrl+Enter");
  });

  it("チャット送信だけが入力欄の中でも効く", () => {
    const inInput = SHORTCUTS.filter((s) => s.allowInInput).map((s) => s.action);
    expect(inInput).toEqual(["chat.send"]);
  });
});
