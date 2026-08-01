import type { ProviderId } from "@/types";

/** 設定画面に並べるプロバイダのメタ情報。 */
export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** APIキー入力欄のプレースホルダ */
  keyPlaceholder: string;
  /** モデル名入力欄のヒント */
  modelHint: string;
  /** キーの取得先 */
  keySource: string;
  /** Base URL の入力欄が必要か（OpenAI互換のみ） */
  needsBaseUrl: boolean;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-proj-…",
    modelHint: "例: gpt-4o / gpt-4o-mini",
    keySource: "platform.openai.com/api-keys",
    needsBaseUrl: false,
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPlaceholder: "sk-ant-…",
    modelHint: "例: claude-opus-5 / claude-sonnet-5",
    keySource: "console.anthropic.com",
    needsBaseUrl: false,
  },
  {
    id: "gemini",
    label: "Google (Gemini)",
    keyPlaceholder: "AIza…",
    modelHint: "例: gemini-2.5-pro / gemini-2.5-flash",
    keySource: "aistudio.google.com/apikey",
    needsBaseUrl: false,
  },
  {
    id: "custom",
    label: "OpenAI互換 (DeepSeek 等)",
    keyPlaceholder: "sk-…",
    modelHint: "例: deepseek-chat / deepseek-reasoner",
    keySource: "各サービスのコンソール",
    needsBaseUrl: true,
  },
];

export function providerMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerLabel(id: string): string {
  return providerMeta(id)?.label ?? id;
}
