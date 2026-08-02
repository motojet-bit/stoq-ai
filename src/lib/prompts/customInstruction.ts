/**
 * 分析への追加指示（自由記述）の入力チェック。
 *
 * **合成は Rust 側（`prompts::custom_section`）が行う。**
 * ここは画面での入力補助だけを持ち、基本プロンプトには一切触れない。
 */

/** 受け付ける最大文字数。Rust 側の `MAX_CUSTOM_INSTRUCTION` と揃える。 */
export const MAX_CUSTOM_INSTRUCTION = 2000;

/** ヘルプアイコンに出す案内。 */
export const CUSTOM_INSTRUCTION_HINT =
  "ℹ️ 上級者向け（※初〜中級者はプリセットプロンプトの使用を推奨します）";

/**
 * 入力が使えない理由。問題なければ null。
 *
 * **空欄は「未設定」であってエラーではない。** 追加指示は任意なので、
 * 書かなければプリセットだけで分析する。
 */
export function customInstructionError(value: string): string | null {
  const length = value.trim().length;
  if (length > MAX_CUSTOM_INSTRUCTION) {
    return `${MAX_CUSTOM_INSTRUCTION} 文字までです（現在 ${length} 文字）。超えたぶんは送信時に切り詰められます。`;
  }
  return null;
}

/** 保存する形に整える。 */
export function normalizeCustomInstruction(value: string): string {
  return value.trim().slice(0, MAX_CUSTOM_INSTRUCTION);
}
