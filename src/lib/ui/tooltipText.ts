import { appName } from "@/lib/ui/appMeta";
import { t } from "@/lib/i18n/i18n";

/**
 * 初心者向けの案内文。
 *
 * **表示場所ごとに散らさず 1 か所にまとめる。**
 * 同じ機能の説明が画面によって食い違うのを防ぐため。
 */
/**
 * 初心者向けの案内文。
 *
 * **表示場所ごとに散らさず 1 か所にまとめる。**
 * 同じ機能の説明が画面によって食い違うのを防ぐため。
 * **定数にしない**（読み込み時に固めると言語切替に追従しない）。
 */
export function tooltips(): Record<TooltipId, string> {
  return {
    help: t("tooltip.help"),
    shortcuts: t("tooltip.shortcuts"),
    promptRole: t("tooltip.promptRole"),
    candidates: t("tooltip.candidates"),
    ticker: t("tooltip.ticker"),
    thresholds: t("tooltip.thresholds"),
  };
}

export type TooltipId =
  | "help"
  | "shortcuts"
  | "promptRole"
  | "candidates"
  | "ticker"
  | "thresholds";

/** 1 件だけ引く。 */
export function tooltip(id: TooltipId): string {
  return t(`tooltip.${id}`);
}

/**
 * 機能リクエストの宛先。ヘルプ画面から案内する。
 * `mailto:` なので、押すと利用者の既定メーラーが件名つきで立ち上がる。
 */
export const FEATURE_REQUEST_EMAIL = "superpuzanoza@gmail.com";
/** 件名には**そのときの表示名**を入れるので、定数ではなく関数にする。 */
export function featureRequestUrl(): string {
  return (
    `mailto:${FEATURE_REQUEST_EMAIL}` +
    `?subject=${encodeURIComponent(t("tooltip.featureRequest", { app: appName() }))}`
  );
}
