import { t } from "@/lib/i18n/i18n";

/**
 * APIキー設定・活用ガイド。
 *
 * **文面は辞書（`apiGuide.*`）に置く。** ヘルプは問い合わせを減らすための
 * ものなので、利用者の言語で読めなければ意味がない。
 * ここは構造（何を何個並べるか）だけを持つ。
 */

/** 取得手順の並び。**この順がそのまま画面の番号になる。** */
export const API_GUIDE_STEP_IDS = [
  "account",
  "billing",
  "create",
  "copy",
  "paste",
] as const;

export type ApiGuideStepId = (typeof API_GUIDE_STEP_IDS)[number];

/** よく来るエラー。コードで引けるようにしておく。 */
export const API_GUIDE_ERROR_CODES = ["429", "401"] as const;

export type ApiGuideErrorCode = (typeof API_GUIDE_ERROR_CODES)[number];

export interface GuideStep {
  id: ApiGuideStepId;
  title: string;
  body: string;
}

export interface GuideTrouble {
  code: ApiGuideErrorCode;
  cause: string;
  fix: string;
}

export interface ApiKeyGuide {
  title: string;
  why: { title: string; points: string[] };
  steps: GuideStep[];
  limit: { title: string; body: string };
  trouble: { title: string; items: GuideTrouble[] };
}

/** キー発行ページ。言語で変わらないので定数で持つ。 */
export const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
export const OPENAI_BILLING_URL = "https://platform.openai.com/settings/organization/billing";
export const OPENAI_LIMITS_URL = "https://platform.openai.com/settings/organization/limits";

/** いまの言語でガイドを組み立てる。 */
export function apiKeyGuide(): ApiKeyGuide {
  return {
    title: t("apiGuide.title"),
    why: {
      title: t("apiGuide.why.title"),
      points: [
        t("apiGuide.why.direct"),
        t("apiGuide.why.cost"),
        t("apiGuide.why.local"),
      ],
    },
    steps: API_GUIDE_STEP_IDS.map((id) => ({
      id,
      title: t(`apiGuide.step.${id}.title`),
      body: t(`apiGuide.step.${id}.body`),
    })),
    limit: {
      title: t("apiGuide.limit.title"),
      body: t("apiGuide.limit.body"),
    },
    trouble: {
      title: t("apiGuide.trouble.title"),
      items: API_GUIDE_ERROR_CODES.map((code) => ({
        code,
        cause: t(`apiGuide.trouble.${code}.cause`),
        fix: t(`apiGuide.trouble.${code}.fix`),
      })),
    },
  };
}

/** 全文をプレーンテキストにする（コピー用・テスト用）。 */
export function apiKeyGuidePlainText(): string {
  const guide = apiKeyGuide();
  const steps = guide.steps
    .map((step, i) => `${i + 1}. ${step.title}\n${step.body}`)
    .join("\n");
  const troubles = guide.trouble.items
    .map((item) => `Error ${item.code}: ${item.cause} → ${item.fix}`)
    .join("\n");

  return [
    `【${guide.title}】`,
    `${guide.why.title}\n${guide.why.points.join("\n")}`,
    steps,
    `${guide.limit.title}\n${guide.limit.body}`,
    `${guide.trouble.title}\n${troubles}`,
  ].join("\n\n");
}
