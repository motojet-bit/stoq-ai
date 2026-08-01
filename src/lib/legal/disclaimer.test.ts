import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCLAIMER_SECTIONS,
  DISCLAIMER_TICKER_TEXT,
  DISCLAIMER_TITLE,
  disclaimerPlainText,
} from "@/lib/legal/disclaimer";
import {
  closeDisclaimer,
  isDisclaimerOpen,
  openDisclaimer,
  subscribeDisclaimer,
  toggleDisclaimer,
} from "@/lib/legal/disclaimerStore";
import { MENUS, type MenuAction } from "@/components/MenuBar";

/**
 * 免責の文面は法的リスクの遮断が目的なので、
 * **必要な条項が落ちていないこと**をテストで固定する。
 */
describe("免責事項の文面", () => {
  it("4 つの条項がそろっている", () => {
    expect(DISCLAIMER_SECTIONS).toHaveLength(4);
    const titles = DISCLAIMER_SECTIONS.map((s) => s.title);
    expect(titles[0]).toContain("投資助言の否定");
    expect(titles[1]).toContain("ハルシネーション");
    expect(titles[2]).toContain("自己責任");
    expect(titles[3]).toContain("データソース");
  });

  it("金融商品取引法への言及がある（非勧誘の明示）", () => {
    expect(DISCLAIMER_SECTIONS[0].body).toContain("金融商品取引法");
    expect(DISCLAIMER_SECTIONS[0].body).toContain("投資助言");
    expect(DISCLAIMER_SECTIONS[0].body).toContain("推奨するものではありません");
  });

  it("AI の出力が変動しうることを明記している", () => {
    const body = DISCLAIMER_SECTIONS[1].body;
    expect(body).toContain("ハルシネーション");
    expect(body).toContain("毎回変動");
    expect(body).toContain("一切保証いたしません");
  });

  it("損害賠償責任を負わないことを明記している", () => {
    const body = DISCLAIMER_SECTIONS[2].body;
    expect(body).toContain("一切の法的責任を負いません");
    expect(body).toContain("自己責任");
  });

  it("外部データソースを名指しで挙げている", () => {
    const body = DISCLAIMER_SECTIONS[3].body;
    for (const source of ["Yahoo Finance", "FMP", "Alpha Vantage", "SEC EDGAR"]) {
      expect(body).toContain(source);
    }
  });

  it("本文が空の条項が無い", () => {
    for (const section of DISCLAIMER_SECTIONS) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(30);
    }
  });

  it("プレーンテキストは番号付きで全条項を含む", () => {
    const text = disclaimerPlainText();
    expect(text).toContain(DISCLAIMER_TITLE);
    for (let i = 0; i < DISCLAIMER_SECTIONS.length; i++) {
      expect(text).toContain(`${i + 1}. ${DISCLAIMER_SECTIONS[i].title}`);
    }
  });
});

describe("テロップの文面", () => {
  it("警告記号で始まる", () => {
    expect(DISCLAIMER_TICKER_TEXT.startsWith("⚠️【免責事項】")).toBe(true);
  });

  it("要点（非助言・誤情報・免責・自己責任）がすべて入っている", () => {
    for (const phrase of [
      "投資助言ではありません",
      "ハルシネーション",
      "一切の責任を負いません",
      "自己責任",
    ]) {
      expect(DISCLAIMER_TICKER_TEXT).toContain(phrase);
    }
  });

  it("全文を開けることを案内している", () => {
    expect(DISCLAIMER_TICKER_TEXT).toContain("（クリックで全文を表示）");
  });

  it("流れ続けるので改行を含まない", () => {
    expect(DISCLAIMER_TICKER_TEXT).not.toContain("\n");
  });
});

describe("免責モーダルの開閉", () => {
  beforeEach(() => {
    closeDisclaimer();
  });

  it("初期状態は閉じている", () => {
    expect(isDisclaimerOpen()).toBe(false);
  });

  it("開いて閉じられる", () => {
    openDisclaimer();
    expect(isDisclaimerOpen()).toBe(true);
    closeDisclaimer();
    expect(isDisclaimerOpen()).toBe(false);
  });

  it("二重に開いても状態は壊れない", () => {
    openDisclaimer();
    openDisclaimer();
    expect(isDisclaimerOpen()).toBe(true);
    closeDisclaimer();
    expect(isDisclaimerOpen()).toBe(false);
  });

  it("閉じているときに閉じても落ちない", () => {
    expect(() => closeDisclaimer()).not.toThrow();
    expect(isDisclaimerOpen()).toBe(false);
  });

  it("トグルできる", () => {
    toggleDisclaimer();
    expect(isDisclaimerOpen()).toBe(true);
    toggleDisclaimer();
    expect(isDisclaimerOpen()).toBe(false);
  });

  it("**変化したときだけ**購読者へ通知する（無駄な再描画を出さない）", () => {
    const notify = vi.fn();
    const unsubscribe = subscribeDisclaimer(notify);

    openDisclaimer();
    expect(notify).toHaveBeenCalledTimes(1);

    // すでに開いているので通知しない
    openDisclaimer();
    expect(notify).toHaveBeenCalledTimes(1);

    closeDisclaimer();
    expect(notify).toHaveBeenCalledTimes(2);

    // すでに閉じているので通知しない
    closeDisclaimer();
    expect(notify).toHaveBeenCalledTimes(2);

    unsubscribe();
    openDisclaimer();
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("メニューバーからの呼び出し", () => {
  const helpMenu = MENUS.find((m) => m.label === "ヘルプ")!;

  it("ヘルプメニューに免責事項の項目がある", () => {
    const item = helpMenu.items.find((i) => i.label.includes("免責事項"));
    expect(item).toBeDefined();
    expect(item?.action).toBe("open-disclaimer");
  });

  it("項目のラベルに英語表記も併記されている", () => {
    const item = helpMenu.items.find((i) => i.action === "open-disclaimer");
    expect(item?.label).toBe("免責事項（Legal Disclaimer）");
  });

  it("免責アクションを受けるとモーダルが開く（App のハンドラ相当）", () => {
    closeDisclaimer();

    const handle = (action: MenuAction) => {
      if (action === "open-disclaimer") openDisclaimer();
    };
    handle("open-disclaimer");

    expect(isDisclaimerOpen()).toBe(true);
  });

  it("別のアクションでは開かない", () => {
    closeDisclaimer();

    const handle = (action: MenuAction) => {
      if (action === "open-disclaimer") openDisclaimer();
    };
    handle("open-settings");

    expect(isDisclaimerOpen()).toBe(false);
  });
});

describe("テロップのクリック", () => {
  beforeEach(() => {
    closeDisclaimer();
  });

  it("クリックで全文モーダルが開く", () => {
    expect(isDisclaimerOpen()).toBe(false);
    // DisclaimerTicker の onClick と同じハンドラ
    openDisclaimer();
    expect(isDisclaimerOpen()).toBe(true);
  });

  it("開いた状態で再クリックしても閉じない（誤操作で消えない）", () => {
    openDisclaimer();
    openDisclaimer();
    expect(isDisclaimerOpen()).toBe(true);
  });
});
