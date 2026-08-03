import { errorDetail, parseAppError } from "@/lib/errors/errorMessage";
import { t } from "@/lib/i18n/i18n";

/**
 * 失敗の原因を切り分けて、次にやることを示す。
 *
 * **「通信に失敗しました」で止めない。** 原因が 429（待てば直る）か
 * 401（キーが違う）かで、やることが正反対になる。
 * どちらか分からないまま再試行させると、直らないものを何度も叩くことになる。
 */

export type FailureKind =
  /** レート制限。待てば直る */
  | "rateLimit"
  /** 認証。キーが誤っているか失効している */
  | "auth"
  /** 権限・モデルへのアクセス不可 */
  | "forbidden"
  /** モデル名や Base URL の誤り */
  | "notFound"
  /** 残高不足・上限超過 */
  | "quota"
  /** 出力上限で切れた */
  | "truncated"
  /** ネットワークに届いていない */
  | "network"
  /** 上記に当てはまらない */
  | "unknown";

export interface Diagnosis {
  kind: FailureKind;
  /** 何が起きたか（1 文） */
  title: string;
  /** 次にやること */
  action: string;
  /** もう一度試す価値があるか。**待てば直るものだけ true** */
  retryable: boolean;
  /** 設定画面を開く導線を出すか */
  openSettings: boolean;
  /** 元のメッセージ（折りたたんで見せる用） */
  detail: string;
}

/** 本文から HTTP ステータスらしき数字を拾う。 */
function statusOf(text: string): number | null {
  const m = text.match(/\b(4\d{2}|5\d{2})\b/);
  return m ? Number(m[1]) : null;
}

const has = (text: string, ...words: string[]) =>
  words.some((w) => text.toLowerCase().includes(w));

/** 失敗の中身を読み、種別を決める。 */
export function classifyFailure(cause: unknown): FailureKind {
  const parsed = parseAppError(cause);
  const text = `${parsed.code ?? ""} ${errorDetail(cause) ?? ""} ${String(cause)}`;
  const status = statusOf(text);

  if (status === 429 || has(text, "rate limit", "rate_limit", "too many requests")) {
    return "rateLimit";
  }
  if (has(text, "insufficient_quota", "quota", "billing", "credit balance")) return "quota";
  if (status === 401 || has(text, "invalid api key", "invalid_api_key", "unauthorized")) {
    return "auth";
  }
  if (status === 403 || has(text, "forbidden", "permission")) return "forbidden";
  if (status === 404 || has(text, "not found", "model_not_found")) return "notFound";
  if (has(text, "max_tokens", "length", "truncated", "incomplete")) return "truncated";
  if (has(text, "timed out", "timeout", "dns", "connect", "network", "econnrefused")) {
    return "network";
  }
  return "unknown";
}

/** 種別ごとの案内。文面は辞書から引く。 */
export function diagnose(cause: unknown): Diagnosis {
  const kind = classifyFailure(cause);
  const detail = errorDetail(cause) ?? String(cause);

  const table: Record<
    FailureKind,
    { retryable: boolean; openSettings: boolean }
  > = {
    // 待てば直る。キーを触らせない（触ると別の問題を作る）
    rateLimit: { retryable: true, openSettings: false },
    auth: { retryable: false, openSettings: true },
    forbidden: { retryable: false, openSettings: true },
    notFound: { retryable: false, openSettings: true },
    // 残高不足は各社のダッシュボードでの操作が要る。アプリ側では直らない
    quota: { retryable: false, openSettings: false },
    // 分割実行が入っているので、再開すれば続きから進める
    truncated: { retryable: true, openSettings: false },
    network: { retryable: true, openSettings: false },
    unknown: { retryable: true, openSettings: false },
  };

  return {
    kind,
    title: t(`diagnose.${kind}.title`),
    action: t(`diagnose.${kind}.action`),
    ...table[kind],
    detail,
  };
}
