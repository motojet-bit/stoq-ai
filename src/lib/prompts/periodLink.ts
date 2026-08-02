import { detectFiscalPeriod, matchQuarter, type FiscalPeriod } from "@/lib/parser/fiscalPeriod";
import type { Quarter, QuarterlySeries } from "@/types";
import type { PromptDocument } from "@/lib/prompts/buildPrompt";
import { t } from "@/lib/i18n/i18n";

/**
 * 添付資料の決算期を割り出し、当時の Yahoo Finance の四半期と結びつける。
 *
 * **突き合わせに失敗しても分析は止めない。** Yahoo が返す四半期は 4〜8 期しかないので、
 * 少し古い決算 PDF を読ませれば当たらないほうが普通。
 * 当たらなければ「当時のデータは無い」と書いて PDF 単体で進める。
 */

export interface PeriodLink {
  period: FiscalPeriod;
  /** 決算期を読み取れた資料の名前 */
  documentName: string;
  /** 当時の四半期データ。突き合わせできなければ null */
  matched: Quarter | null;
}

/**
 * 資料群から決算期を 1 つ決める。
 *
 * **最初に読み取れたものを採る。** 複数の資料を入れたときに期がばらけることはあるが、
 * どれを正とするかを機械的に決める根拠が無い。
 * 先頭（＝ユーザーが最初に入れた資料）を主資料とみなす。
 */
export function linkFiscalPeriod(
  documents: PromptDocument[],
  quarterly: QuarterlySeries | null,
): PeriodLink | null {
  for (const doc of documents) {
    const period = detectFiscalPeriod(doc.text);
    if (!period) continue;
    return {
      period,
      documentName: doc.name,
      matched: matchQuarter(period, quarterly?.quarters ?? []),
    };
  }
  return null;
}

/**
 * 決算期のセクションをプロンプト用に組み立てる。
 *
 * **突き合わせできなかったことも明記する。** 黙って省くと、
 * AI は「当時の株価が渡されている」前提で書いてしまう。
 */
export function buildPeriodSection(link: PeriodLink | null): string {
  if (!link) return "";

  const { period, documentName, matched } = link;
  const lines = [
    t("prompt.periodHeading"),
    "",
    t("prompt.periodDetected", {
      key: period.key,
      text: period.matchedText,
      document: documentName,
    }),
  ];

  if (matched) {
    lines.push(
      "",
      t("prompt.periodMatched", { label: matched.label, endDate: matched.endDate }),
      "",
      [
        `| ${t("prompt.periodColItem")} | ${t("prompt.periodColValue")} |`,
        "| --- | --- |",
        `| ${t("prompt.periodRevenue")} | ${matched.revenueDisplay} |`,
        `| ${t("prompt.periodNetIncome")} | ${matched.netIncomeDisplay} |`,
        `| ${t("prompt.periodYoy")} | ${pct(matched.revenueYoy)} |`,
        `| ${t("prompt.periodQoq")} | ${pct(matched.revenueQoq)} |`,
        `| ${t("prompt.periodEps")} | ${num(matched.epsActual)} |`,
      ].join("\n"),
      "",
      t("prompt.periodCompare"),
    );
  } else {
    lines.push("", t("prompt.periodUnmatched"));
  }

  return lines.join("\n");
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function num(value: number | null): string {
  return value === null ? "—" : String(value);
}
