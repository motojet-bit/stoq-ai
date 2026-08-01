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
    { id: "gpt-5.6", note: "最新世代（temperature は既定値のみ）" },
    { id: "gpt-4o", note: "汎用・マルチモーダル" },
    { id: "gpt-4o-mini", note: "低コスト・高速" },
  ],
  anthropic: [
    { id: "claude-opus-5", note: "最上位。長期のエージェント処理に強い" },
    { id: "claude-sonnet-5", note: "速度と知能のバランス" },
    { id: "claude-opus-4-8", note: "前世代の Opus" },
    { id: "claude-haiku-4-5", note: "最速・最安" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", note: "高性能" },
    { id: "gemini-2.5-flash", note: "低コスト・高速" },
  ],
};

/** OpenAI互換 API 向け。Base URL から提供元を推測して候補を切り替える。 */
const CUSTOM_SUGGESTIONS: { match: string; models: ModelSuggestion[] }[] = [
  {
    match: "deepseek",
    models: [
      { id: "deepseek-chat", note: "汎用" },
      { id: "deepseek-reasoner", note: "推論特化" },
    ],
  },
  {
    match: "moonshot",
    models: [
      { id: "moonshot-v1-8k", note: "コンテキスト 8K" },
      { id: "moonshot-v1-32k", note: "コンテキスト 32K" },
      { id: "moonshot-v1-128k", note: "コンテキスト 128K" },
    ],
  },
  {
    match: "openrouter",
    models: [
      { id: "openai/gpt-4o", note: "OpenRouter 経由" },
      { id: "anthropic/claude-opus-5", note: "OpenRouter 経由" },
      { id: "google/gemini-2.5-pro", note: "OpenRouter 経由" },
    ],
  },
  {
    match: "groq",
    models: [
      { id: "llama-3.3-70b-versatile", note: "汎用" },
      { id: "llama-3.1-8b-instant", note: "高速" },
    ],
  },
  {
    match: "localhost",
    models: [
      { id: "llama3", note: "ローカル（Ollama 等）" },
      { id: "qwen2.5", note: "ローカル（Ollama 等）" },
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
