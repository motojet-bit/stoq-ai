import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_MARGIN, placeMenu, type Rect } from "@/lib/ui/menuPosition";
import { MODAL_OVERLAY_CLASS } from "@/lib/ui/modalDrag";
import {
  closeMenu,
  isAnyMenuOpen,
  openMenu,
  resetOverlays,
  subscribeOverlay,
} from "@/lib/ui/overlayStore";
import {
  countTooltipShown,
  getTooltipShownCount,
  HINT_INTERVAL,
  offHint,
  resetTooltipCount,
  shouldShowHint,
  withHint,
} from "@/lib/ui/tooltipHint";
import {
  getPortfolioSplit,
  normalizeDirection,
  setPortfolioSplit,
  subscribePortfolioSplit,
  togglePortfolioSplit,
} from "@/lib/ui/portfolioLayout";
import { setLocale } from "@/lib/i18n/i18n";

/* 文面は日本語で検証する（既定は英語）。定数の組み立てに間に合うようトップレベルで呼ぶ */
setLocale("ja");

const viewport = { width: 1200, height: 800 };

function anchor(over: Partial<Rect> = {}): Rect {
  return {
    top: 100,
    bottom: 124,
    left: 500,
    right: 620,
    width: 120,
    height: 24,
    ...over,
  };
}

// ---------------------------------------------------------------- 位置決め

describe("placeMenu（ドロップダウンの位置）", () => {
  it("下に余裕があればアンカーの直下に出す", () => {
    const placement = placeMenu(anchor(), { width: 320, height: 200 }, viewport);
    expect(placement.top).toBe(124);
    expect(placement.flipped).toBe(false);
    expect(placement.maxHeight).toBeNull();
  });

  it("既定はアンカーの右端そろえ", () => {
    const placement = placeMenu(anchor(), { width: 320, height: 200 }, viewport);
    expect(placement.left).toBe(620 - 320);
  });

  it("左へはみ出すなら左端そろえに切り替える", () => {
    const placement = placeMenu(
      anchor({ left: 40, right: 160 }),
      { width: 320, height: 200 },
      viewport,
    );
    expect(placement.left).toBe(40);
  });

  it("**右へはみ出しても画面内に収める**", () => {
    const placement = placeMenu(
      anchor({ left: 1100, right: 1180 }),
      { width: 320, height: 200 },
      viewport,
    );
    expect(placement.left + 320).toBeLessThanOrEqual(viewport.width - MENU_MARGIN);
  });

  it("下に入らなければ上へ出す", () => {
    const placement = placeMenu(
      anchor({ top: 700, bottom: 724 }),
      { width: 320, height: 300 },
      viewport,
    );
    expect(placement.flipped).toBe(true);
    expect(placement.top).toBe(700 - 300);
  });

  it("上下どちらにも入らないときは広いほうへ出して高さを制限する", () => {
    const tall = { width: 320, height: 2000 };

    // 下のほうが広い
    const below = placeMenu(anchor({ top: 100, bottom: 124 }), tall, viewport);
    expect(below.flipped).toBe(false);
    expect(below.maxHeight).toBeGreaterThan(0);
    expect(below.maxHeight!).toBeLessThan(tall.height);

    // 上のほうが広い
    const above = placeMenu(anchor({ top: 700, bottom: 724 }), tall, viewport);
    expect(above.flipped).toBe(true);
    expect(above.maxHeight).toBeGreaterThan(0);
  });

  it("極端に狭い画面でも負の座標にしない", () => {
    const placement = placeMenu(
      anchor({ left: 0, right: 40, top: 0, bottom: 20 }),
      { width: 600, height: 600 },
      { width: 300, height: 200 },
    );
    expect(placement.left).toBeGreaterThanOrEqual(0);
    expect(placement.top).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------- 重なり

describe("メニューとツールチップの重なり", () => {
  beforeEach(() => {
    resetOverlays();
  });

  it("メニューが開いている間は「開いている」と判定される", () => {
    expect(isAnyMenuOpen()).toBe(false);
    openMenu();
    expect(isAnyMenuOpen()).toBe(true);
    closeMenu();
    expect(isAnyMenuOpen()).toBe(false);
  });

  it("**複数のメニューが開いても、全部閉じるまで閉じたことにしない**", () => {
    openMenu();
    openMenu();
    closeMenu();
    expect(isAnyMenuOpen()).toBe(true);
    closeMenu();
    expect(isAnyMenuOpen()).toBe(false);
  });

  it("開いていないのに閉じても壊れない", () => {
    closeMenu();
    closeMenu();
    expect(isAnyMenuOpen()).toBe(false);
    openMenu();
    expect(isAnyMenuOpen()).toBe(true);
  });

  it("状態が変わったときだけ通知する（無駄な再描画を出さない）", () => {
    const notify = vi.fn();
    const unsubscribe = subscribeOverlay(notify);

    openMenu();
    expect(notify).toHaveBeenCalledTimes(1);
    openMenu(); // 2 つ目。すでに「開いている」ので通知しない
    expect(notify).toHaveBeenCalledTimes(1);
    closeMenu();
    expect(notify).toHaveBeenCalledTimes(1);
    closeMenu(); // 全部閉じた
    expect(notify).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});

// ---------------------------------------------------------------- ヒント

describe("ツールチップの OFF 案内", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTooltipCount();
  });

  it(`${HINT_INTERVAL} 回に 1 回だけ出す`, () => {
    const shown = [];
    for (let i = 1; i <= 12; i++) shown.push(shouldShowHint(i));

    expect(shown.filter(Boolean)).toHaveLength(2);
    expect(shouldShowHint(5)).toBe(true);
    expect(shouldShowHint(10)).toBe(true);
    expect(shouldShowHint(4)).toBe(false);
    expect(shouldShowHint(6)).toBe(false);
  });

  it("0 回・負の回数では出さない", () => {
    expect(shouldShowHint(0)).toBe(false);
    expect(shouldShowHint(-5)).toBe(false);
    expect(shouldShowHint(Number.NaN)).toBe(false);
  });

  it("出す回は本文の後ろに案内を添える", () => {
    expect(withHint("本文", 5)).toBe(`本文\n\n${offHint()}`);
    expect(withHint("本文", 4)).toBe("本文");
  });

  it("案内文が指定どおり", () => {
    expect(offHint()).toBe("💡 ツールチップは [設定] ➔ [表示] タブからオフにできます");
  });

  it("表示のたびにカウントが進み、localStorage に残る", () => {
    expect(countTooltipShown()).toBe(1);
    expect(countTooltipShown()).toBe(2);
    expect(getTooltipShownCount()).toBe(2);
    expect(localStorage.getItem("stockanalyzer.tooltipShowCount")).toBe("2");
  });

  it("5 回目でヒントが出る（通しの流れ）", () => {
    const hints: boolean[] = [];
    for (let i = 0; i < 5; i++) hints.push(shouldShowHint(countTooltipShown()));
    expect(hints).toEqual([false, false, false, false, true]);
  });
});

describe("モーダル背景のスタイル", () => {
  it("**ぼかしを使わない**（背後の株価や分析テキストを読めるようにする）", () => {
    expect(MODAL_OVERLAY_CLASS).not.toContain("blur");
  });

  it("ワントーン暗くするだけの薄い半透明", () => {
    expect(MODAL_OVERLAY_CLASS).toMatch(/^bg-black\/\d+$/);
    const opacity = Number(MODAL_OVERLAY_CLASS.split("/")[1]);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------- 分割方向

describe("マイポートフォリオの分割方向", () => {
  beforeEach(() => {
    localStorage.clear();
    setPortfolioSplit("horizontal");
  });

  it("既定は左右分割", () => {
    expect(getPortfolioSplit()).toBe("horizontal");
  });

  it("切り替えられ、localStorage に残る", () => {
    setPortfolioSplit("vertical");
    expect(getPortfolioSplit()).toBe("vertical");
    expect(localStorage.getItem("stockanalyzer.portfolioSplit")).toBe("vertical");
  });

  it("トグルで往復する", () => {
    togglePortfolioSplit();
    expect(getPortfolioSplit()).toBe("vertical");
    togglePortfolioSplit();
    expect(getPortfolioSplit()).toBe("horizontal");
  });

  it("壊れた保存値は既定へ丸める", () => {
    expect(normalizeDirection("diagonal")).toBe("horizontal");
    expect(normalizeDirection(null)).toBe("horizontal");
    expect(normalizeDirection("vertical")).toBe("vertical");
  });

  it("同じ向きを選び直しても通知しない", () => {
    const notify = vi.fn();
    const unsubscribe = subscribePortfolioSplit(notify);

    setPortfolioSplit("vertical");
    expect(notify).toHaveBeenCalledTimes(1);
    setPortfolioSplit("vertical");
    expect(notify).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
