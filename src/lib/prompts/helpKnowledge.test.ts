import { describe, expect, it } from "vitest";
import type { AppSettings } from "@/types";
import {
  buildHelpSystemPrompt,
  HELP_EXAMPLES,
  marketLabel,
  settingsSummary,
  shortcutTable,
} from "@/lib/prompts/helpKnowledge";
import { mergeBindings, SHORTCUTS } from "@/lib/ui/shortcutStore";
import { TOOLTIPS } from "@/lib/ui/tooltipText";

const settings = (over: Partial<AppSettings> = {}): AppSettings => ({
  provider: "anthropic",
  models: { anthropic: "claude-opus-5" },
  customProviders: [],
  secUserAgent: "StoQ test@example.com",
  maxPromptTokens: 180_000,
  marketProvider: "yahoo",
  thresholds: {},
  license: { activated: false, masked: null, message: "未登録" },
  marketProviders: [
    { id: "yahoo", label: "Yahoo Finance", requiresKey: false, ready: true, reason: null },
    {
      id: "fmp",
      label: "Financial Modeling Prep",
      requiresKey: true,
      ready: false,
      reason: "Financial Modeling Prep の APIキーが未設定です。",
    },
    {
      id: "alphavantage",
      label: "Alpha Vantage",
      requiresKey: true,
      ready: false,
      reason: "Alpha Vantage の APIキーが未設定です。",
    },
  ],
  keys: [
    { provider: "anthropic", configured: true, masked: "sk-ant-…3f9a" },
    { provider: "openai", configured: false, masked: null },
  ],
  ...over,
});

describe("shortcutTable", () => {
  it("すべてのアクションを表に並べる", () => {
    const table = shortcutTable(mergeBindings([]), false);
    for (const def of SHORTCUTS) {
      expect(table).toContain(def.label);
    }
    expect(table).toContain("Ctrl+N");
    expect(table).toContain("Ctrl+Shift+A");
  });

  it("**既定ではなく現在の割り当て**を出す（変更後に誤案内しないため）", () => {
    const table = shortcutTable(mergeBindings([{ action: "chat.new", binding: "F2" }]), false);
    expect(table).toContain("F2");
    expect(table).not.toContain("| Ctrl+N |");
  });

  it("macOS では記号表記になる", () => {
    const table = shortcutTable(mergeBindings([{ action: "chat.new", binding: "Meta+N" }]), true);
    expect(table).toContain("⌘+N");
  });

  it("未割り当ては — で示す", () => {
    const table = shortcutTable(mergeBindings([{ action: "chat.new", binding: "" }]), false);
    expect(table).toContain("| — |");
  });
});

describe("settingsSummary", () => {
  it("登録済みの LLM キーを挙げる", () => {
    const text = settingsSummary(settings());
    expect(text).toContain("anthropic");
    expect(text).not.toContain("openai");
  });

  it("市場データのキーは LLM のキー一覧に混ぜない", () => {
    const text = settingsSummary(
      settings({
        keys: [
          { provider: "anthropic", configured: true, masked: "sk-…1234" },
          { provider: "market:fmp", configured: true, masked: "abc…7890" },
        ],
      }),
    );
    expect(text).not.toContain("market:fmp");
  });

  it("取得元が使えないときは理由まで書く", () => {
    const text = settingsSummary(settings({ marketProvider: "fmp" }));
    expect(text).toContain("Financial Modeling Prep");
    expect(text).toContain("APIキーが未設定");
  });

  it("SEC User-Agent の有無が分かる", () => {
    expect(settingsSummary(settings())).toContain("SEC User-Agent: 設定済み");
    expect(settingsSummary(settings({ secUserAgent: "" }))).toContain("未設定");
  });

  it("設定が読めていなくても落ちない", () => {
    expect(settingsSummary(null)).toContain("読み込めていません");
  });
});

describe("buildHelpSystemPrompt", () => {
  const prompt = () => buildHelpSystemPrompt(settings(), mergeBindings([]), false);

  it("指定された役割の文言を含む", () => {
    expect(prompt()).toContain("StoQ AI Analyzer の操作案内AIアシスタント");
  });

  it("3 つのデータ取得元をすべて説明する", () => {
    const text = prompt();
    expect(text).toContain("Yahoo Finance");
    expect(text).toContain("Financial Modeling Prep");
    expect(text).toContain("Alpha Vantage");
    expect(text).toContain("financialmodelingprep.com");
    expect(text).toContain("alphavantage.co");
  });

  it("APIキーの設定手順と保存場所を含む", () => {
    const text = prompt();
    expect(text).toContain("AI設定");
    expect(text).toContain("マスク済み");
  });

  it("現在のショートカットを埋め込む", () => {
    const text = buildHelpSystemPrompt(
      settings(),
      mergeBindings([{ action: "sidebar.toggle", binding: "F9" }]),
      false,
    );
    expect(text).toContain("F9");
  });

  it("投資助言をしないよう明示する", () => {
    expect(prompt()).toContain("投資判断そのもの");
  });

  it("無い機能をでっち上げないよう釘を刺す", () => {
    expect(prompt()).toContain("このアプリに無い機能");
  });

  it("設定が未読み込みでも組み立てられる", () => {
    expect(() => buildHelpSystemPrompt(null, mergeBindings([]), false)).not.toThrow();
  });
});

describe("ティッカー形式の案内", () => {
  const prompt = () => buildHelpSystemPrompt(settings(), mergeBindings([]), false);

  it("米国株の例を挙げている", () => {
    const text = prompt();
    expect(text).toContain("米国株");
    expect(text).toContain("AAPL");
    expect(text).toContain("NVDA");
  });

  it("**日本株の .T 表記**を具体例つきで案内している", () => {
    const text = prompt();
    expect(text).toContain("日本株");
    expect(text).toContain("7203.T");
    expect(text).toContain("トヨタ自動車");
    expect(text).toContain("9984.T");
  });

  it("その他の市場のサフィックスにも触れている", () => {
    const text = prompt();
    expect(text).toContain("ASML.AS");
    expect(text).toContain("0700.HK");
  });

  it("SEC EDGAR が米国上場のみであることを伝えている", () => {
    expect(prompt()).toContain("SEC EDGAR は米国上場企業のみ");
  });

  it("入力欄のツールチップと同じ内容を案内している（食い違わない）", () => {
    const text = prompt();
    // ツールチップが挙げる 3 例が、ナレッジ側にもすべてある
    for (const example of ["AAPL", "NVDA", "7203.T", "9984.T"]) {
      expect(TOOLTIPS.ticker).toContain(example);
      expect(text).toContain(example);
    }
    expect(TOOLTIPS.ticker).toContain(".T");
  });
});

describe("補助", () => {
  it("質問例が用意されている", () => {
    expect(HELP_EXAMPLES.length).toBeGreaterThan(0);
    expect(HELP_EXAMPLES).toContain("ショートカットキーはどこで変える？");
  });

  it("取得元の表示名が引ける", () => {
    expect(marketLabel("fmp")).toBe("Financial Modeling Prep");
    expect(marketLabel("alphavantage")).toBe("Alpha Vantage");
    expect(marketLabel("yahoo")).toBe("Yahoo Finance");
  });
});
