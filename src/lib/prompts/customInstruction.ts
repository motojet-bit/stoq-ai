import { t } from "@/lib/i18n/i18n";
/**
 * 分析への追加指示（自由記述）の入力チェック。
 *
 * **合成は Rust 側（`prompts::custom_section`）が行う。**
 * ここは画面での入力補助だけを持ち、基本プロンプトには一切触れない。
 */

/** 受け付ける最大文字数。Rust 側の `MAX_CUSTOM_INSTRUCTION` と揃える。 */
export const MAX_CUSTOM_INSTRUCTION = 2000;

/**
 * ヘルプアイコンに出す案内。
 * **定数にしない**（読み込み時に固めると言語切替に追従しない）。
 */
export function customInstructionHint(): string {
  return t("customInstruction.hint");
}

/**
 * 入力が使えない理由。問題なければ null。
 *
 * **空欄は「未設定」であってエラーではない。** 追加指示は任意なので、
 * 書かなければプリセットだけで分析する。
 */
export function customInstructionError(value: string): string | null {
  const length = value.trim().length;
  if (length > MAX_CUSTOM_INSTRUCTION) {
    return t("customInstruction.tooLong", { max: MAX_CUSTOM_INSTRUCTION, length });
  }
  return null;
}

/** 保存する形に整える。 */
export function normalizeCustomInstruction(value: string): string {
  return value.trim().slice(0, MAX_CUSTOM_INSTRUCTION);
}
