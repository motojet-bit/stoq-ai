import { describe, expect, it } from "vitest";
import {
  normalizeSlots,
  slotOf,
  swapSlots,
  SLOT_IDS,
  type Slots,
} from "@/lib/ui/layoutStore";

const DEFAULT: Slots = { leftTop: "market", leftBottom: "chat", right: "analysis" };

/** 3 枠に 3 パネルが必ず 1 つずつ入っていることを検査する。 */
function assertValid(slots: Slots) {
  const panels = SLOT_IDS.map((s) => slots[s]);
  expect(new Set(panels).size).toBe(3);
  expect([...panels].sort()).toEqual(["analysis", "chat", "market"]);
}

describe("swapSlots", () => {
  it("2 つの枠の中身を入れ替える", () => {
    const next = swapSlots(DEFAULT, "leftTop", "right");
    expect(next.leftTop).toBe("analysis");
    expect(next.right).toBe("market");
    expect(next.leftBottom).toBe("chat");
    assertValid(next);
  });

  it("同じ枠なら変化しない", () => {
    expect(swapSlots(DEFAULT, "right", "right")).toBe(DEFAULT);
  });

  it("何度入れ替えても配置が壊れない", () => {
    let slots = DEFAULT;
    const pairs: [typeof SLOT_IDS[number], typeof SLOT_IDS[number]][] = [
      ["leftTop", "leftBottom"],
      ["leftBottom", "right"],
      ["right", "leftTop"],
      ["leftTop", "right"],
    ];
    for (const [a, b] of pairs) {
      slots = swapSlots(slots, a, b);
      assertValid(slots);
    }
  });

  it("2 回入れ替えると元に戻る", () => {
    const once = swapSlots(DEFAULT, "leftTop", "right");
    expect(swapSlots(once, "leftTop", "right")).toEqual(DEFAULT);
  });
});

describe("slotOf", () => {
  it("パネルのある枠を返す", () => {
    expect(slotOf(DEFAULT, "analysis")).toBe("right");
    expect(slotOf(DEFAULT, "market")).toBe("leftTop");
  });
});

describe("normalizeSlots（壊れた保存値からの復旧）", () => {
  it("正しい値はそのまま通す", () => {
    expect(normalizeSlots(DEFAULT)).toEqual(DEFAULT);
  });

  it("null / 文字列 / 配列でも既定値を返す", () => {
    for (const bad of [null, undefined, "x", 42, []]) {
      assertValid(normalizeSlots(bad));
    }
  });

  it("同じパネルが重複していても 1 つずつに直す", () => {
    const dup = { leftTop: "chat", leftBottom: "chat", right: "chat" };
    const fixed = normalizeSlots(dup);
    assertValid(fixed);
    expect(fixed.leftTop).toBe("chat");
  });

  it("知らないパネル名は捨てて埋め直す", () => {
    const broken = { leftTop: "market", leftBottom: "unknown", right: "analysis" };
    const fixed = normalizeSlots(broken);
    assertValid(fixed);
    expect(fixed.leftBottom).toBe("chat");
  });

  it("枠が欠けていても補完する", () => {
    assertValid(normalizeSlots({ right: "chat" }));
  });
});
