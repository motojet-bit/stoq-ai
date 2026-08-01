import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSlots, resetSlots, type SlotId } from "@/lib/ui/layoutStore";
import {
  cancelPanelDrag,
  endPanelDrag,
  getPanelDrag,
  resolveDrop,
  slotFromPoint,
  startPanelDrag,
  updatePanelDrag,
} from "@/lib/ui/panelDrag";

/**
 * jsdom には `document.elementFromPoint` が無いため、テスト側で差し込む。
 * （レイアウト計算を持たないので実装されていない）
 */
type PointLookup = Document & { elementFromPoint: (x: number, y: number) => Element | null };

function setPointAt(element: Element | null) {
  (document as PointLookup).elementFromPoint = () => element;
}

function clearPointAt() {
  delete (document as Partial<PointLookup>).elementFromPoint;
}

/**
 * ドロップ先の判定。
 * 枠の外や自分自身で離したときに入れ替わってしまうと、配置が壊れる。
 */
describe("resolveDrop", () => {
  it("別の枠の上で離したら、その枠を返す", () => {
    expect(resolveDrop("leftTop", "right")).toBe("right");
    expect(resolveDrop("right", "leftBottom")).toBe("leftBottom");
  });

  it("つかんだ枠の上で離したら何もしない", () => {
    expect(resolveDrop("leftTop", "leftTop")).toBeNull();
  });

  it("枠の外で離したら何もしない", () => {
    expect(resolveDrop("leftTop", null)).toBeNull();
  });
});

/** 座標からドロップ先の枠を引く（`data-panel-slot` を辿る） */
describe("slotFromPoint", () => {
  afterEach(() => {
    clearPointAt();
    document.body.innerHTML = "";
  });

  const mockPointAt = (element: Element | null) => {
    setPointAt(element);
  };

  it("パネルの子孫要素からでも枠を特定できる", () => {
    document.body.innerHTML =
      '<section data-panel-slot="right"><div><span id="deep">本文</span></div></section>';
    mockPointAt(document.getElementById("deep"));
    expect(slotFromPoint(10, 10)).toBe("right");
  });

  it("パネルの外なら null", () => {
    document.body.innerHTML = '<div id="outside">枠の外</div>';
    mockPointAt(document.getElementById("outside"));
    expect(slotFromPoint(10, 10)).toBeNull();
  });

  it("知らない値が入っていても null を返す", () => {
    document.body.innerHTML = '<section data-panel-slot="bogus"><i id="x"></i></section>';
    mockPointAt(document.getElementById("x"));
    expect(slotFromPoint(10, 10)).toBeNull();
  });
});

/**
 * ドラッグ一連の流れ。
 * Pointer Events で実装しているため、状態遷移だけで検証できる。
 */
describe("パネルのドラッグ移動", () => {
  const pointAt = (slot: SlotId | null) => {
    document.body.innerHTML = slot
      ? `<section data-panel-slot="${slot}"><i id="t"></i></section>`
      : '<div id="t"></div>';
    setPointAt(document.getElementById("t"));
  };

  beforeEach(() => {
    resetSlots();
    cancelPanelDrag();
    document.body.className = "";
  });

  afterEach(() => {
    clearPointAt();
    document.body.innerHTML = "";
  });

  it("別のパネルへ落とすと配置が入れ替わる", () => {
    const before = getSlots();
    expect(before.leftTop).toBe("market");
    expect(before.right).toBe("analysis");

    startPanelDrag("leftTop", 0, 0);
    pointAt("right");
    updatePanelDrag(500, 200);
    expect(getPanelDrag()?.over).toBe("right");

    expect(endPanelDrag()).toBe("right");

    const after = getSlots();
    expect(after.leftTop).toBe("analysis");
    expect(after.right).toBe("market");
    // 残りの枠は動かない
    expect(after.leftBottom).toBe("chat");
  });

  it("同じパネルの上で離しても配置は変わらない", () => {
    startPanelDrag("leftTop", 0, 0);
    pointAt("leftTop");
    updatePanelDrag(10, 10);
    expect(endPanelDrag()).toBeNull();
    expect(getSlots()).toEqual({ leftTop: "market", leftBottom: "chat", right: "analysis" });
  });

  it("枠の外で離しても配置は変わらない", () => {
    startPanelDrag("right", 0, 0);
    pointAt(null);
    updatePanelDrag(9999, 9999);
    expect(getPanelDrag()?.over).toBeNull();
    expect(endPanelDrag()).toBeNull();
    expect(getSlots().right).toBe("analysis");
  });

  it("中断すると入れ替えずに状態が消える", () => {
    startPanelDrag("leftTop", 0, 0);
    pointAt("right");
    updatePanelDrag(500, 200);
    cancelPanelDrag();

    expect(getPanelDrag()).toBeNull();
    expect(getSlots().leftTop).toBe("market");
    expect(endPanelDrag()).toBeNull();
  });

  it("ドラッグ中は body にクラスが付き、終了で外れる", () => {
    startPanelDrag("leftTop", 0, 0);
    expect(document.body.classList.contains("is-dragging-panel")).toBe(true);
    endPanelDrag();
    expect(document.body.classList.contains("is-dragging-panel")).toBe(false);
  });

  it("開始していないのに終了しても落ちない", () => {
    expect(endPanelDrag()).toBeNull();
    expect(() => cancelPanelDrag()).not.toThrow();
  });
});
