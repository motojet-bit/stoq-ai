import { t } from "@/lib/i18n/i18n";
/**
 * モデル名入力欄（コンボボックス）に出す候補。
 *
 * ここに無いモデルもキーボードで自由に入力できる。あくまで入力補助であり、
 * 実際に使えるかは各プロバイダの契約とモデルの提供状況による。
 */

export interface ModelSuggestion {
  id: string;
  /** 候補の横に出る短い説明 */
  note: string;
}

/** 組み込みプロバイダの候補 */
export const MODEL_SUGGESTIONS: Record<string, ModelSuggestion[]> = {
  openai: [
    { id: "gpt-5.6", note: t("model.latestGen") },
    { id: "gpt-4o", note: t("model.generalMultimodal") },
    { id: "gpt-4o-mini", note: t("model.cheapFast") },
  ],
  anthropic: [
    { id: "claude-opus-5", note: t("model.topTier") },
    { id: "claude-sonnet-5", note: t("model.balanced") },
    { id: "claude-opus-4-8", note: t("model.previousOpus") },
    { id: "claude-haiku-4-5", note: t("model.fastestCheapest") },
  ],
  gemini: [
    { id: "gemini-2.5-pro", note: t("model.highPerformance") },
    { id: "gemini-2.5-flash", note: t("model.cheapFast") },
  ],
};

/** OpenAI互換 API 向け。Base URL から提供元を推測して候補を切り替える。 */
const CUSTOM_SUGGESTIONS: { match: string; models: ModelSuggestion[] }[] = [
  {
    match: "deepseek",
    models: [
      { id: "deepseek-chat", note: t("model.general") },
      { id: "deepseek-reasoner", note: t("model.reasoning") },
    ],
  },
  {
    match: "siliconflow",
    models: [
      { id: "Qwen/Qwen2.5-72B-Instruct", note: t("model.general") },
      { id: "Qwen/Qwen2.5-32B-Instruct", note: t("model.cheapFast") },
      { id: "deepseek-ai/DeepSeek-R1", note: t("model.reasoningCheap") },
    ],
  },
  {
    match: "moonshot",
    models: [
      { id: "moonshot-v1-8k", note: t("model.context8k") },
      { id: "moonshot-v1-32k", note: t("model.context32k") },
      { id: "moonshot-v1-128k", note: t("model.context128k") },
    ],
  },
  {
    match: "openrouter",
    models: [
      { id: "openai/gpt-4o", note: t("model.viaOpenRouter") },
      { id: "anthropic/claude-opus-5", note: t("model.viaOpenRouter") },
      { id: "google/gemini-2.5-pro", note: t("model.viaOpenRouter") },
    ],
  },
  {
    match: "groq",
    models: [
      { id: "llama-3.3-70b-versatile", note: t("model.general") },
      { id: "llama-3.1-8b-instant", note: t("model.fast") },
    ],
  },
  {
    match: "localhost",
    models: [
      { id: "llama3", note: t("model.local") },
      { id: "qwen2.5", note: t("model.local") },
    ],
  },
];

/**
 * 指定プロバイダのモデル候補を返す。
 * カスタムプロバイダは Base URL から提供元を推測する。
 */
export function modelSuggestions(providerId: string, baseUrl?: string): ModelSuggestion[] {
  const builtin = MODEL_SUGGESTIONS[providerId];
  if (builtin) return builtin;

  const url = (baseUrl ?? "").toLowerCase();
  const matched = CUSTOM_SUGGESTIONS.find((entry) => url.includes(entry.match));
  return matched?.models ?? [];
}
