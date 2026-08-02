import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  API_GUIDE_ERROR_CODES,
  API_GUIDE_STEP_IDS,
  apiKeyGuide,
  apiKeyGuidePlainText,
  OPENAI_BILLING_URL,
  OPENAI_KEYS_URL,
  OPENAI_LIMITS_URL,
} from "@/lib/help/apiKeyGuide";
import { setLocale } from "@/lib/i18n/i18n";

afterEach(() => {
  setLocale("ja");
});

describe("構成", () => {
  it("**取得手順は 5 ステップ**", () => {
    expect(API_GUIDE_STEP_IDS).toEqual([
      "account",
      "billing",
      "create",
      "copy",
      "paste",
    ]);
    expect(apiKeyGuide().steps).toHaveLength(5);
  });

  it("よく来るエラー 2 種を扱う", () => {
    expect(API_GUIDE_ERROR_CODES).toEqual(["429", "401"]);
    expect(apiKeyGuide().trouble.items.map((i) => i.code)).toEqual(["429", "401"]);
  });

  it("「なぜ必要か」を 3 点で説明する", () => {
    expect(apiKeyGuide().why.points).toHaveLength(3);
  });
});

describe("多言語で読める", () => {
  it("**日英どちらでも訳し漏れが無い**（キーがそのまま出ていない）", () => {
    for (const code of ["ja", "en"]) {
      setLocale(code);
      const guide = apiKeyGuide();
      const texts = [
        guide.title,
        guide.why.title,
        ...guide.why.points,
        ...guide.steps.flatMap((s) => [s.title, s.body]),
        guide.limit.title,
        guide.limit.body,
        guide.trouble.title,
        ...guide.trouble.items.flatMap((i) => [i.cause, i.fix]),
      ];

      for (const text of texts) {
        expect(text, `${code}: ${text}`).not.toContain("apiGuide.");
        expect(text.length, `${code}: ${text}`).toBeGreaterThan(3);
      }
    }
  });

  it("日本語と英語で別の文面になっている", () => {
    setLocale("ja");
    const ja = apiKeyGuide();
    setLocale("en");
    const en = apiKeyGuide();

    expect(ja.title).not.toBe(en.title);
    expect(en.why.points.join("")).not.toMatch(/[ぁ-んァ-ヶ]/);
  });

  it("辞書に両言語ぶんのキーがそろっている", () => {
    const read = (name: string) =>
      JSON.parse(
        readFileSync(join(process.cwd(), `src/locales/${name}.json`), "utf-8"),
      ) as Record<string, string>;

    const ja = Object.keys(read("ja")).filter((k) => k.startsWith("apiGuide."));
    const en = Object.keys(read("en")).filter((k) => k.startsWith("apiGuide."));

    expect(ja.length).toBeGreaterThan(15);
    expect(ja.sort()).toEqual(en.sort());
  });
});

describe("内容", () => {
  it("**費用の目安を具体的に示す**（いくらかかるか分からないのが一番の障壁）", () => {
    setLocale("ja");
    expect(apiKeyGuide().why.points.join("")).toContain("5〜15 円");
  });

  it("キーが端末内にしか保存されないことを伝える", () => {
    setLocale("ja");
    const text = apiKeyGuide().why.points.join("");
    expect(text).toContain("この端末");
    expect(text).toContain("送信することはありません");
  });

  it("**使いすぎ防止の設定を案内する**", () => {
    setLocale("ja");
    const limit = apiKeyGuide().limit;
    expect(limit.body).toContain("Usage limit");
    expect(limit.body).toContain("$10");
    expect(limit.body).toContain("防げます");
  });

  it("429 と 401 の原因と直し方を書く", () => {
    setLocale("ja");
    const [rate, auth] = apiKeyGuide().trouble.items;

    expect(rate.cause).toContain("クレジットカード");
    expect(rate.cause).toContain("残高");
    expect(auth.cause).toContain("コピー");
    expect(auth.fix.length).toBeGreaterThan(5);
  });

  it("キーは一度しか表示されないと警告する", () => {
    setLocale("ja");
    const copyStep = apiKeyGuide().steps.find((s) => s.id === "copy")!;
    expect(copyStep.body).toContain("一度だけ");
  });

  it("$5 のチャージを勧める", () => {
    setLocale("ja");
    const billing = apiKeyGuide().steps.find((s) => s.id === "billing")!;
    expect(billing.title).toContain("$5");
  });
});

describe("リンク", () => {
  it("OpenAI の公式ドメインを指している", () => {
    for (const url of [OPENAI_KEYS_URL, OPENAI_BILLING_URL, OPENAI_LIMITS_URL]) {
      expect(url.startsWith("https://platform.openai.com/")).toBe(true);
    }
  });
});

describe("コピー用テキスト", () => {
  it("全項目が入る", () => {
    setLocale("ja");
    const text = apiKeyGuidePlainText();
    const guide = apiKeyGuide();

    for (const [i, step] of guide.steps.entries()) {
      expect(text).toContain(`${i + 1}. ${step.title}`);
    }
    expect(text).toContain("Error 429");
    expect(text).toContain("Error 401");
    expect(text).toContain(guide.limit.body);
  });
});

describe("画面の組み方", () => {
  const SOURCE = readFileSync(
    join(process.cwd(), "src/components/ApiKeyGuide.tsx"),
    "utf-8",
  );

  it("文言を直書きしていない（言語を切り替えても残らない）", () => {
    expect(SOURCE).not.toContain("APIキー設定");
    expect(SOURCE).not.toContain("Usage limit");
    expect(SOURCE).toContain("apiKeyGuide()");
  });

  it("**キー未設定でも読める**（AI に聞かずに済む導線）", () => {
    const help = readFileSync(
      join(process.cwd(), "src/components/HelpAssistant.tsx"),
      "utf-8",
    );
    // 未設定のときはガイドのタブを最初に開く
    expect(help).toContain('useState<"ask" | "guide">(ready ? "ask" : "guide")');
    expect(help).toContain("<ApiKeyGuide");
  });
});
