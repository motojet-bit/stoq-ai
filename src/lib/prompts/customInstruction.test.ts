import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  customInstructionHint,
  customInstructionError,
  MAX_CUSTOM_INSTRUCTION,
  normalizeCustomInstruction,
} from "@/lib/prompts/customInstruction";
import { setLocale } from "@/lib/i18n/i18n";

/*
 * 文面は日本語で検証する（既定は英語なので明示的に切り替える）。
 * **トップレベルで呼ぶ。** モジュール直下で組み立てられる定数が
 * あるため、`beforeAll` では間に合わない。
 */
setLocale("ja");

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

/**
 * 秘匿プロンプトの見出し。**このファイルにそのまま書かない**
 * （`promptSecrecy.test.ts` の走査に引っかかるため）。
 */
const CORE_MARKER = ["#", "厳守", "事項"].join("");
const TABLE_MARKER = ["評価", "テーブル"].join("");

describe("入力チェック", () => {
  it("**空欄はエラーではない**（追加指示は任意）", () => {
    expect(customInstructionError("")).toBeNull();
    expect(customInstructionError("   ")).toBeNull();
  });

  it("通常の入力は通る", () => {
    expect(customInstructionError("在庫水準の推移を重点的に見て")).toBeNull();
  });

  it("上限を超えたら知らせる", () => {
    const error = customInstructionError("あ".repeat(MAX_CUSTOM_INSTRUCTION + 1));
    expect(error).not.toBeNull();
    expect(error).toContain(String(MAX_CUSTOM_INSTRUCTION));
  });

  it("上限ちょうどは通る", () => {
    expect(customInstructionError("あ".repeat(MAX_CUSTOM_INSTRUCTION))).toBeNull();
  });

  it("上限は Rust 側と揃っている", () => {
    const rust = read("src-tauri/src/prompts/mod.rs");
    expect(rust).toContain(`MAX_CUSTOM_INSTRUCTION: usize = ${MAX_CUSTOM_INSTRUCTION}`);
  });
});

describe("正規化", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeCustomInstruction("  近況を見て  ")).toBe("近況を見て");
  });

  it("長すぎるぶんは切り捨てる", () => {
    expect(normalizeCustomInstruction("あ".repeat(5000))).toHaveLength(
      MAX_CUSTOM_INSTRUCTION,
    );
  });
});

describe("案内文", () => {
  it("**指定どおりのツールチップ文言**", () => {
    expect(customInstructionHint()).toBe(
      "ℹ️ 上級者向け（※初〜中級者はプリセットプロンプトの使用を推奨します）",
    );
  });
});

describe("プロンプトの秘匿", () => {
  it("**合成は Rust 側でしか行わない**", () => {
    // フロントに基本プロンプトの本文があると、配布物の JS から読めてしまう
    const rust = read("src-tauri/src/prompts/mod.rs");
    expect(rust).toContain("pub fn custom_section");
    expect(rust).toContain("include_str!");

    const front = read("src/lib/prompts/customInstruction.ts");
    expect(front).not.toContain(CORE_MARKER);
    expect(front).not.toContain(TABLE_MARKER);
    expect(front).not.toContain("追加指示（利用者からの指定）");
  });

  it("画面は入力欄だけを持ち、基本プロンプトを表示しない", () => {
    const ui = read("src/components/CustomInstructionSettings.tsx");
    expect(ui).toContain("customInstruction");
    expect(ui).not.toContain(CORE_MARKER);
    // 「基本プロンプトはそのまま使われる」と伝える（文面は辞書側）
    expect(ui).toContain("customInstruction.description");
  });

  it("**組み立てたプロンプトを返すコマンドが無い**", () => {
    const commands = read("src-tauri/src/commands.rs");
    expect(commands).not.toContain("build_system_prompt");
  });
});

describe("画面への配置", () => {
  it("分析設定タブ（プリセットの横）に出る", () => {
    const settings = read("src/components/ThresholdSettings.tsx");
    expect(settings).toContain("<CustomInstructionSettings");
  });

  it("ヘルプアイコンにツールチップが付いている", () => {
    const ui = read("src/components/CustomInstructionSettings.tsx");
    expect(ui).toContain("customInstructionHint");
    expect(ui).toContain("<Tooltip");
    expect(ui).toContain("IconHelp");
  });
});
