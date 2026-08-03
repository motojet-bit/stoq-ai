import { t } from "@/lib/i18n/i18n";

/**
 * Rust から返るエラーを、表示言語の文面へ直す。
 *
 * **Rust は「何が起きたか」の記号だけを返す**（`{code, detail}`）。
 * 訳をここに集約することで、画面を英語にしたときにエラーだけ日本語で
 * 残る、という食い違いが起きない。
 */

/** Rust の `ErrorPayload` と同じ形。 */
export interface AppErrorPayload {
  code: string;
  detail: string;
}

/** コードの形。辞書キーに使うので英数字と `_` だけ。 */
const CODE_PATTERN = /^ERR_[A-Z0-9_]+$/;

/**
 * 受け取ったものからコードと詳細を取り出す。
 *
 * **何が来ても落ちない。** `invoke` の失敗は文字列だったり Error だったり
 * オブジェクトだったりするので、判別できないものは「原因不明」に寄せる。
 */
export function parseAppError(cause: unknown): AppErrorPayload {
  if (cause && typeof cause === "object") {
    const value = cause as Record<string, unknown>;
    if (typeof value.code === "string" && CODE_PATTERN.test(value.code)) {
      return {
        code: value.code,
        detail: typeof value.detail === "string" ? value.detail : "",
      };
    }
  }

  const text =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  // 文字列でコードだけ返ってくることもある
  const trimmed = text.trim();
  if (CODE_PATTERN.test(trimmed)) {
    return { code: trimmed, detail: "" };
  }
  /*
   * ストリーミングの失敗は 1 本の文字列で運ばれる（`AppError::wire`）。
   * **ここで割らないと本文が「原因不明」に丸められる。**
   */
  const joined = trimmed.match(/^(ERR_[A-Z0-9_]+):\s*([\s\S]+)$/);
  if (joined) {
    return { code: joined[1], detail: joined[2] };
  }
  return { code: "ERR_UNEXPECTED", detail: text };
}

/**
 * 表示用の一文にする。
 *
 * 訳が無いコードでも**コードそのものを出す**。空文字を返すと、
 * 何が起きたのか画面から一切分からなくなる。
 */
export function errorMessage(cause: unknown): string {
  const { code, detail } = parseAppError(cause);
  const key = `errors.${code}`;
  const translated = t(key);
  const head = translated === key ? code : translated;
  return detail ? `${head}（${detail}）` : head;
}

/** 詳細だけを取り出す（トーストの副題に使う）。 */
export function errorDetail(cause: unknown): string {
  return parseAppError(cause).detail;
}
