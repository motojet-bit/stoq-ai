import { invoke, isTauri } from "@/lib/tauri";
import type { FilingStatus } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * SEC EDGAR の提出状況（10-K / 10-Q の有無と最終提出日）を確認する。
 *
 * 本文はダウンロードしない。EDGAR に無い銘柄や User-Agent 未設定は
 * 例外ではなく `status` フィールドで返る。
 */
export async function fetchFilingStatus(ticker: string): Promise<FilingStatus> {
  if (!isTauri()) {
    throw new Error(
      t("err.browserSec"),
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
    return { signal: "yellow", emoji: "🟡", label: t("sec.state.unknown"), detail: t("sec.state.unknownWhy") };
  }

  if (status.status === "notInEdgar") {
    return {
      signal: "red",
      emoji: "🔴",
      label: t("sec.state.unavailable"),
      detail: status.message ?? t("sec.state.unavailableWhy"),
    };
  }

  if (status.status === "userAgentMissing") {
    return {
      signal: "yellow",
      emoji: "🟡",
      label: t("sec.state.needsSetup"),
      detail: status.message ?? t("sec.state.needsSetupWhy"),
    };
  }

  if (status.status === "noFilings") {
    return {
      signal: "yellow",
      emoji: "🟡",
      label: t("sec.state.none"),
      detail: status.message ?? t("sec.state.noneWhy"),
    };
  }

  const has10k = status.latest10k !== null;
  const has10q = status.latest10q !== null;

  if (has10k && has10q) {
    return {
      signal: "green",
      emoji: "🟢",
      label: t("sec.state.ready"),
      detail: t("sec.state.readyWhy", {
      tenK: status.latest10k?.filed ?? "",
      tenQ: status.latest10q?.filed ?? "",
    }),
    };
  }

  return {
    signal: "yellow",
    emoji: "🟡",
    label: t("sec.state.partial"),
    detail: has10k
      ? t("sec.state.onlyTenK", { filed: status.latest10k?.filed ?? "" })
      : t("sec.state.onlyTenQ", { filed: status.latest10q?.filed ?? "" }),
  };
}
