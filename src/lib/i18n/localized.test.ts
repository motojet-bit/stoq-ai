import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/locales";

/**
 * 辞書化が済んだファイルに、日本語が**戻ってこない**ようにする。
 *
 * 一度 `t()` へ置き換えても、あとから機能を足すときに日本語を直書きすると
 * 静かに戻ってしまう。ここに並べたファイルは「辞書化済み」の宣言であり、
 * 日本語リテラルが 1 つでもあれば落ちる。
 *
 * **新しく辞書化したファイルは、このリストへ足すこと。**
 */
const LOCALIZED = [
  "src/App.tsx",
  "src/components/AnalysisPanel.tsx",
  "src/components/AnalystRoleMenu.tsx",
  "src/components/ApiKeyGuide.tsx",
  "src/components/CandidateImportModal.tsx",
  "src/components/CandidateStocksPanel.tsx",
  "src/components/ChatHistoryItem.tsx",
  "src/components/ChatPanel.tsx",
  "src/components/CloudSyncGuide.tsx",
  "src/components/CloudSyncSettings.tsx",
  "src/components/CommandBar.tsx",
  "src/components/ComparePanel.tsx",
  "src/components/ConfirmDialog.tsx",
  "src/components/ContextMenu.tsx",
  "src/components/CriterionScoreRow.tsx",
  "src/components/CustomInstructionSettings.tsx",
  "src/components/DisclaimerTicker.tsx",
  "src/components/DisplaySettings.tsx",
  "src/components/DocumentPreviewModal.tsx",
  "src/components/DocumentTray.tsx",
  "src/components/EulaModal.tsx",
  "src/components/EulaSettings.tsx",
  "src/components/ExportMenu.tsx",
  "src/components/FilingStatusBadge.tsx",
  "src/components/FontSizeControl.tsx",
  "src/components/FreeTierLimitModal.tsx",
  "src/components/HelpAssistant.tsx",
  "src/components/Icons.tsx",
  "src/components/LegalDisclaimerModal.tsx",
  "src/components/LicenseSettings.tsx",
  "src/components/MarketProviderSettings.tsx",
  "src/components/MenuBar.tsx",
  "src/components/MetricCard.tsx",
  "src/components/MetricCardSkeleton.tsx",
  "src/components/ModalShell.tsx",
  "src/components/ModelCombo.tsx",
  "src/components/PanelHeader.tsx",
  "src/components/PanelRestoreBar.tsx",
  "src/components/PdfDropZone.tsx",
  "src/components/PortalMenu.tsx",
  "src/components/PortfolioHeatmap.tsx",
  "src/components/PortfolioHistoryPanel.tsx",
  "src/components/PortfolioPanel.tsx",
  "src/components/PromptLibraryMenu.tsx",
  "src/components/PromptLibraryModal.tsx",
  "src/components/ProviderMenu.tsx",
  "src/components/QuarterlyTrend.tsx",
  "src/components/ResizableSplit.tsx",
  "src/components/SaveToPortfolioModal.tsx",
  "src/components/SettingsModal.tsx",
  "src/components/ShortcutSettings.tsx",
  "src/components/Sidebar.tsx",
  "src/components/StagedFileChip.tsx",
  "src/components/StatusBar.tsx",
  "src/components/TabBar.tsx",
  "src/components/ThresholdSettings.tsx",
  "src/components/TickerInput.tsx",
  "src/components/ToastHost.tsx",
  "src/components/TokenMeter.tsx",
  "src/components/Tooltip.tsx",
  "src/components/WelcomeTour.tsx",
  "src/components/WorkspacePanel.tsx",

  // --- B: 通知・エラーメッセージ ---
  "src/lib/api/analysisStore.ts",
  "src/lib/api/sec.ts",
  "src/lib/api/yahoo.ts",
  "src/lib/candidates/candidateStore.ts",
  "src/lib/candidates/parseCandidates.ts",
  "src/lib/chat/chatStore.ts",
  "src/lib/cloud/cloudBackup.ts",
  "src/lib/cloud/cloudStore.ts",
  "src/lib/config/providers.ts",
  "src/lib/config/settingsStore.ts",
  "src/lib/export/exportStore.ts",
  "src/lib/legal/eulaStore.ts",
  "src/lib/license/freeTier.ts",
  "src/lib/license/freeTierStore.ts",
  "src/lib/license/licenseStore.ts",
  "src/lib/license/lockMessages.ts",
  "src/lib/llm/client.ts",
  "src/lib/parser/documentStore.ts",
  "src/lib/parser/docx.ts",
  "src/lib/parser/extractText.ts",
  "src/lib/parser/pptx.ts",
  "src/lib/parser/tokenCount.ts",
  "src/lib/portfolio/portfolioStore.ts",
  "src/lib/portfolio/saveTarget.ts",
  "src/lib/prompts/analysisRunner.ts",
  "src/lib/prompts/analystRoleStore.ts",
  "src/lib/prompts/customInstruction.ts",
  "src/lib/ui/shortcutStore.ts",

  // --- C: 分析ドメインのラベル（内部キーは英語 ID のまま保持） ---
  "src/lib/prompts/criteria.ts",
  "src/lib/compare/compareData.ts",
  "src/lib/prompts/thresholds.ts",
  "src/lib/export/analysisRecord.ts",
  "src/lib/export/exportAnalysis.ts",
  "src/lib/config/modelCatalog.ts",
  "src/lib/prompts/parseAnalysis.ts",

  // --- E: 法務・案内文 / F: エラーコードの変換 ---
  "src/lib/legal/disclaimer.ts",
  "src/lib/ui/tooltipText.ts",
  "src/lib/errors/errorMessage.ts",
  "src/lib/ui/toastStore.ts",

  // --- 自動更新 ---
  "src/components/UpdateModal.tsx",
  "src/components/UpdateSettings.tsx",
  "src/lib/update/updateStore.ts",
  "src/lib/update/updateVersion.ts",

  // --- 67章: 残りの日本語 ---
  "src/lib/prompts/helpKnowledge.ts",
  "src/lib/prompts/promptLibrary.ts",
  "src/lib/portfolio/heatmap.ts",
  "src/lib/sampleData.ts",
  "src/lib/ui/tooltipHint.ts",
  "src/lib/i18n/locales.ts",
];

/**
 * **内部キーとして残してよい日本語。**
 *
 * Rust 側が返す指標名との突き合わせに使う文字列で、表示用ではない。
 * 訳すと `findMetric` がヒットしなくなり、値が全部「—」になる。
 */
const INTERNAL_KEYS: Record<string, string[]> = {
  // 言語の「自称」。日本語の選択肢を英語表記にすると、日本語話者が見つけられない
  "src/lib/i18n/locales.ts": ["日本語"],
  "src/lib/compare/compareData.ts": [
    "現金・同等物",
    "営業CF",
    "EV / 売上高",
    "粗利率",
    "売上成長率（YoY）",
    "時価総額",
    "営業利益率",
    "PER（実績）",
    "負債比率 (D/E)",
  ],
  "src/lib/export/analysisRecord.ts": [
    "時価総額",
    "粗利率",
    "PER（実績）",
    "負債比率 (D/E)",
  ],
};

const CJK = /[぀-ヿ一-鿿]/;

/** 正規表現リテラルが始まる位置か（直前のトークンで判断する）。 */
function startsRegex(before: string): boolean {
  const prev = before.replace(/\s+$/, "").slice(-1);
  return prev === "" || "(,=:[!&|?{};+".includes(prev);
}

/**
 * コメントと正規表現リテラルを空白に潰す。文字列の中の `//` は残す。
 *
 * **正規表現も飛ばすのが要点。** 文字クラスに引用符が入っている正規表現
 * （CSV のエスケープ判定など）を、文字列の開始と誤読して以降を丸ごと拾ってしまう。
 */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "str" | "regex" = "code";
  let quote = "";

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1] ?? "";

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        state = "str";
        quote = c;
        out += c;
        i += 1;
        continue;
      }
      if (c === "/" && startsRegex(out)) {
        state = "regex";
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    if (state === "regex") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "/" || c === "\n") state = "code";
      i += 1;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }

    // 文字列の中
    if (c === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    out += c;
    if (c === quote) state = "code";
    i += 1;
  }

  return out;
}

/** 日本語を含む文字列リテラルと JSX テキストを拾う。 */
function japaneseLiterals(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];

  const literal = /(['"])((?:\\.|(?!\1)[^\\])*)\1|`((?:\\.|[^\\`])*)`/gs;
  for (const m of code.matchAll(literal)) {
    const value = m[2] ?? m[3] ?? "";
    if (CJK.test(value)) found.push(value.trim());
  }

  for (const m of code.matchAll(/>([^<>{}]*)</g)) {
    if (CJK.test(m[1])) found.push(m[1].trim());
  }

  /*
   * **`{式}` の直後に続く地の文も拾う。**
   * 上の正規表現は `{` `}` を含む区間を弾くので、
   * `{count} 期分` のような「値のあとに単位を書き足した」形を素通りさせていた。
   */
  for (const m of code.matchAll(/\}([^<>{}]*)</g)) {
    if (CJK.test(m[1])) found.push(m[1].trim());
  }

  return found;
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("既定言語", () => {
  it("**英語が原文（Source of Truth）**", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    // 原文の言語が登録簿にあること
    expect(LOCALES.map((l) => l.code)).toContain(DEFAULT_LOCALE);
  });
});

describe("辞書化が済んだファイル", () => {
  it.each(LOCALIZED)("%s に日本語の直書きが残っていない", (path) => {
    const allowed = new Set(INTERNAL_KEYS[path] ?? []);
    const found = japaneseLiterals(read(path)).filter((v) => !allowed.has(v));
    expect(found).toEqual([]);
  });

  it("**内部キーの許可リストが実際に使われている**（免罪符として空振りしない）", () => {
    for (const [path, keys] of Object.entries(INTERNAL_KEYS)) {
      const found = new Set(japaneseLiterals(read(path)));
      for (const key of keys) {
        expect(found.has(key), `${path} の「${key}」はもう存在しない`).toBe(true);
      }
    }
  });

  it("走査が空振りしていない（検出器が壊れたら気づける）", () => {
    // わざと日本語を含むソースを食わせて、拾えることを確かめる
    const sample = `const a = "日本語"; // コメントは無視\n<div>本文</div>`;
    expect(japaneseLiterals(sample)).toEqual(["日本語", "本文"]);
  });

  it("**`{式}` の直後に続く地の文も拾う**（単位の書き足しを見逃さない）", () => {
    // 値のあとに単位だけ足す書き方は、辞書化の抜けとして最も残りやすい
    expect(japaneseLiterals(`<span>{n} 期分</span>`)).toEqual(["期分"]);
  });

  it("コメントの日本語は数えない（識別子は英語・コメントは日本語の方針）", () => {
    expect(japaneseLiterals(`// 説明\n/* 補足 */\nconst a = 1;`)).toEqual([]);
  });
});
