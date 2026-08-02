import type { AppSettings, MarketProviderId } from "@/types";
import { displayBinding, isMac } from "@/lib/ui/shortcutKeys";
import { SHORTCUTS, type BindingMap } from "@/lib/ui/shortcutStore";
import { appName } from "@/lib/ui/appMeta";
import { t } from "@/lib/i18n/i18n";

/**
 * ヘルプ AI に渡すナレッジベース。
 *
 * **アプリの「いまの状態」を含めて渡すのが要点。**
 * ショートカットはユーザーが変更できるので、固定の説明文だけを持たせると
 * 「Ctrl+N です」と実際と違う案内をしてしまう。
 *
 * **本文は辞書（`help.knowledge.*`）に置く。** 英語で使っている人に
 * 日本語のナレッジを読ませると、訳しながら答えることになり精度が落ちる。
 */

/** 現在のショートカット割り当てを表にする。 */
export function shortcutTable(bindings: BindingMap, mac = isMac()): string {
  const rows = SHORTCUTS.map(
    (def) =>
      `| ${t(def.labelKey)} | ${displayBinding(bindings[def.action], mac)} | ${t(def.hintKey)} |`,
  );
  const header = `| ${t("help.shortcutTable.action")} | ${t("help.shortcutTable.key")} | ${t("help.shortcutTable.hint")} |`;
  return [header, "| --- | --- | --- |", ...rows].join("\n");
}

/** 現在のアプリ設定を要約する。 */
export function settingsSummary(settings: AppSettings | null): string {
  if (!settings) {
    return `${t("help.settings.title")}\n${t("help.settings.unavailable")}`;
  }

  const configured = settings.keys
    .filter((k) => k.configured && !k.provider.startsWith("market:"))
    .map((k) => k.provider);
  const market = settings.marketProviders.find((p) => p.id === settings.marketProvider);

  return [
    t("help.settings.title"),
    t("help.settings.provider", { provider: settings.provider }),
    t("help.settings.keys", {
      list: configured.length > 0 ? configured.join(", ") : t("help.settings.none"),
    }),
    t("help.settings.market", { label: market?.label ?? settings.marketProvider }) +
      (market && !market.ready
        ? t("help.settings.marketUnset", { reason: market.reason ?? "" })
        : ""),
    t("help.settings.userAgent", {
      state: settings.secUserAgent ? t("help.settings.uaSet") : t("help.settings.uaUnset"),
    }),
  ].join("\n");
}

/** ヘルプ AI のシステムプロンプトを組み立てる。 */
export function buildHelpSystemPrompt(
  settings: AppSettings | null,
  bindings: BindingMap,
  mac = isMac(),
): string {
  const app = appName();

  return [
    t("help.knowledge.role", { app }),
    t("help.knowledge.overview", { app }),
    t("help.knowledge.providers"),
    `${t("help.knowledge.shortcutHeading")}\n${shortcutTable(bindings, mac)}\n` +
      t("help.knowledge.shortcutNote"),
    settingsSummary(settings),
    t("help.knowledge.rules"),
  ].join("\n\n");
}

/** 最初に見せる質問例。何を聞けばよいか分からない人向け。 */
export function helpExamples(): string[] {
  return [
    t("help.example.shortcuts"),
    t("help.example.fmpKey"),
    t("help.example.tips"),
    t("help.example.candidates"),
  ];
}

/** 取得元 ID から表示名を引く（UI とプロンプトで表記を揃えるため）。 */
export function marketLabel(id: MarketProviderId): string {
  switch (id) {
    case "fmp":
      return "Financial Modeling Prep";
    case "alphavantage":
      return "Alpha Vantage";
    default:
      return "Yahoo Finance";
  }
}
