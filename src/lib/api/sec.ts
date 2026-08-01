import { invoke, isTauri } from "@/lib/tauri";
import type { FilingStatus } from "@/types";

/**
 * SEC EDGAR の提出状況（10-K / 10-Q の有無と最終提出日）を確認する。
 *
 * 本文はダウンロードしない。EDGAR に無い銘柄や User-Agent 未設定は
 * 例外ではなく `status` フィールドで返る。
 */
export async function fetchFilingStatus(ticker: string): Promise<FilingStatus> {
  if (!isTauri()) {
    throw new Error(
      "ブラウザで実行中のため SEC のデータを取得できません。`npm run tauri:dev` で起動してください。",
    );
  }
  return invoke<FilingStatus>("sec_filing_status", { ticker });
}

/** 資料準備インジケーターの信号色。 */
export type FilingSignal = "green" | "yellow" | "red";

export interface FilingSignalInfo {
  signal: FilingSignal;
  emoji: string;
  label: string;
  detail: string;
}

/**
 * 提出状況を 🟢 / 🟡 / 🔴 に落とし込む。
 *
 * - 🟢 10-K と 10-Q が両方そろっている
 * - 🟡 片方のみ / User-Agent 未設定 / 提出書類なし（設定や時間で解消しうる）
 * - 🔴 EDGAR に登録がない（非米国上場など、構造的に取得できない）
 */
export function filingSignal(status: FilingStatus | null): FilingSignalInfo {
  if (!status) {
    return { signal: "yellow", emoji: "🟡", label: "未取得", detail: "まだ確認していません。" };
  }

  if (status.status === "notInEdgar") {
    return {
      signal: "red",
      emoji: "🔴",
      label: "取得不可",
      detail: status.message ?? "SEC EDGAR に登録がありません。",
    };
  }

  if (status.status === "userAgentMissing") {
    return {
      signal: "yellow",
      emoji: "🟡",
      label: "要設定",
      detail: status.message ?? "SEC の User-Agent が未設定です。",
    };
  }

  if (status.status === "noFilings") {
    return {
      signal: "yellow",
      emoji: "🟡",
      label: "書類なし",
      detail: status.message ?? "10-K / 10-Q が見つかりませんでした。",
    };
  }

  const has10k = status.latest10k !== null;
  const has10q = status.latest10q !== null;

  if (has10k && has10q) {
    return {
      signal: "green",
      emoji: "🟢",
      label: "準備完了",
      detail: `10-K (${status.latest10k?.filed}) と 10-Q (${status.latest10q?.filed}) を取得できます。`,
    };
  }

  return {
    signal: "yellow",
    emoji: "🟡",
    label: "一部のみ",
    detail: has10k
      ? `10-K (${status.latest10k?.filed}) のみ取得できます。`
      : `10-Q (${status.latest10q?.filed}) のみ取得できます。`,
  };
}
