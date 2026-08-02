import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocale,
  interpolate,
  localeOptions,
  promptLanguageName,
  setLocale,
  subscribeLocale,
  t,
  translate,
} from "@/lib/i18n/i18n";
import {
  DEFAULT_LOCALE,
  localeDefinition,
  LOCALES,
  normalizeLocale,
} from "@/lib/i18n/locales";

describe("辞書の登録簿", () => {
  it("日本語と英語がそろっている", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["ja", "en"]);
    // 英語を原文とし、訳し漏れは英語で出す
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("**すべての言語が同じキーを持つ**（訳し忘れを見つける）", () => {
    const base = Object.keys(localeDefinition(DEFAULT_LOCALE)!.dictionary).sort();

    for (const locale of LOCALES) {
      const keys = Object.keys(locale.dictionary).sort();
      expect(keys, `${locale.code} のキーが原文（${DEFAULT_LOCALE}）と違う`).toEqual(base);
    }
  });

  it("空の訳が無い（`status.documentsUnit` のように意図的な空は除く）", () => {
    const intentionallyEmpty = new Set(["status.documentsUnit"]);
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(locale.dictionary)) {
        if (intentionallyEmpty.has(key)) continue;
        expect(value.trim(), `${locale.code} の ${key} が空`).not.toBe("");
      }
    }
  });

  it("設定画面の選択肢はその言語での表記を出す", () => {
    expect(localeOptions()).toEqual([
      { code: "ja", label: "日本語" },
      { code: "en", label: "English" },
    ]);
  });
});

describe("normalizeLocale", () => {
  it("対応済みの言語はそのまま", () => {
    expect(normalizeLocale("ja")).toBe("ja");
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("  en  ")).toBe("en");
  });

  it("**地域つきでも言語部分で拾う**（`en-US` → `en`）", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("ja-JP")).toBe("ja");
  });

  it("知らない言語は既定（英語）へ落ちる", () => {
    expect(normalizeLocale("fr")).toBe("en");
    expect(normalizeLocale("")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
    expect(normalizeLocale(42)).toBe("en");
  });
});

describe("translate", () => {
  const en = { greet: "Hello", only: "English only" };
  const ja = { greet: "こんにちは" };

  it("その言語の訳を返す", () => {
    expect(translate(ja, en, "greet")).toBe("こんにちは");
  });

  it("**訳が無ければ英語へフォールバックする**", () => {
    // 読めない文字を出すより、英語で意味を伝える
    expect(translate(ja, en, "only")).toBe("English only");
  });

  it("どこにも無ければキーをそのまま返す（画面から文字が消えない）", () => {
    expect(translate(ja, en, "missing.key")).toBe("missing.key");
  });
});

describe("interpolate", () => {
  it("`{{name}}` を差し替える", () => {
    expect(interpolate("最大{{max}}社", { max: 5 })).toBe("最大5社");
    expect(interpolate("{{a}} と {{b}}", { a: "X", b: "Y" })).toBe("X と Y");
  });

  it("値が無いプレースホルダはそのまま残す（欠落に気づける）", () => {
    expect(interpolate("{{missing}} です", { other: 1 })).toBe("{{missing}} です");
  });

  it("変数を渡さなければ何もしない", () => {
    expect(interpolate("そのまま")).toBe("そのまま");
  });
});

describe("言語の切り替え", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("切り替えると訳が変わる", () => {
    expect(t("settings.title")).toBe("設定");
    setLocale("en");
    expect(t("settings.title")).toBe("Settings");
  });

  it("localStorage に残る", () => {
    setLocale("en");
    expect(localStorage.getItem("stockanalyzer.locale")).toBe("en");
    expect(getLocale()).toBe("en");
  });

  it("`<html lang>` も合わせる（読み上げ・フォント選択のため）", () => {
    setLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("知らない言語を渡しても既定（英語）へ落ちる", () => {
    setLocale("klingon");
    expect(getLocale()).toBe("en");
  });

  it("**同じ言語を選び直しても通知しない**（無駄な再描画を出さない）", () => {
    const notify = vi.fn();
    const unsubscribe = subscribeLocale(notify);

    setLocale("en");
    expect(notify).toHaveBeenCalledTimes(1);
    setLocale("en");
    expect(notify).toHaveBeenCalledTimes(1);
    setLocale("ja");
    expect(notify).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("変数つきの訳も言語に追従する", () => {
    expect(t("sidebar.compare", { max: 5 })).toContain("最大5社");
    setLocale("en");
    expect(t("sidebar.compare", { max: 5 })).toContain("up to 5");
  });
});

describe("AI へ渡す言語名", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("表示言語に対応する英語名を返す", () => {
    expect(promptLanguageName("ja")).toBe("Japanese");
    expect(promptLanguageName("en")).toBe("English");
  });

  it("省略すると現在の言語を使う", () => {
    setLocale("en");
    expect(promptLanguageName()).toBe("English");
  });

  it("知らない言語でも落ちない", () => {
    // 原文が英語なので、判定できないときも英語で答えさせる
    expect(promptLanguageName("klingon")).toBe("English");
  });
});
