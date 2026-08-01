/**
 * 概算トークン数と、入力上限に対する消費量の判定。
 *
 * 正確なトークン数はモデルのトークナイザ依存なので、ここでの値は目安。
 * Rust 側（`src-tauri/src/documents.rs::estimate_tokens`）と同じ規則で数える。
 */

/** 1 文字 ≒ 1 トークンとして扱う文字（CJK・ハングル・全角形） */
function isCjk(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

/** CJK は 1 文字 1 トークン、それ以外は 4 文字 1 トークンとして概算する。 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (isCjk(ch.codePointAt(0) ?? 0)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export type TokenLevel = "ok" | "warning" | "over";

export interface TokenUsage {
  tokens: number;
  limit: number;
  /** 0.0–1.0 を超えることもある（超過時） */
  ratio: number;
  level: TokenLevel;
  label: string;
}

/** 上限の 75% 未満なら 🟢、100% 未満なら 🟡、超えたら 🔴。 */
export function tokenUsage(tokens: number, limit: number): TokenUsage {
  const safeLimit = Math.max(limit, 1);
  const ratio = tokens / safeLimit;

  const level: TokenLevel = ratio >= 1 ? "over" : ratio >= 0.75 ? "warning" : "ok";
  const label =
    level === "over"
      ? "入力上限を超過"
      : level === "warning"
        ? "入力上限に接近"
        : "余裕あり";

  return { tokens, limit: safeLimit, ratio, level, label };
}

/** 12,345 → "12.3k" のような短縮表記。 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
