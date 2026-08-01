import type { AppSettings, BuiltinProviderId, ProviderId } from "@/types";

/** 組み込みプロバイダのメタ情報。 */
export interface BuiltinProviderMeta {
  id: BuiltinProviderId;
  label: string;
  /** APIキー入力欄のプレースホルダ */
  keyPlaceholder: string;
  /** モデル名入力欄のヒント */
  modelHint: string;
  /** キーの取得先 */
  keySource: string;
}

export const BUILTIN_PROVIDERS: BuiltinProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-proj-…",
    modelHint: "例: gpt-4o / gpt-4o-mini",
    keySource: "platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPlaceholder: "sk-ant-…",
    modelHint: "例: claude-opus-5 / claude-sonnet-5",
    keySource: "console.anthropic.com",
  },
  {
    id: "gemini",
    label: "Google (Gemini)",
    keyPlaceholder: "AIza…",
    modelHint: "例: gemini-2.5-pro / gemini-2.5-flash",
    keySource: "aistudio.google.com/apikey",
  },
];

const BUILTIN_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_PROVIDERS.map((p) => [p.id, p.label]),
);

export function isBuiltin(id: ProviderId): boolean {
  return id in BUILTIN_LABELS;
}

/** 表示用のラベル。カスタムはユーザーが付けた名前を返す。 */
export function providerLabel(settings: AppSettings | null, id: ProviderId): string {
  if (BUILTIN_LABELS[id]) return BUILTIN_LABELS[id];
  const custom = settings?.customProviders.find((c) => c.id === id);
  return custom?.label.trim() || id;
}

/** インジケーターなど狭い場所向けの短いラベル。 */
export function providerShortLabel(settings: AppSettings | null, id: ProviderId): string {
  return providerLabel(settings, id).split(" ")[0];
}

/** そのプロバイダで実際に送信できる状態か（キー・Base URL・モデルが揃っているか）。 */
export function providerReadiness(
  settings: AppSettings | null,
  id: ProviderId,
): { ready: boolean; reason: string | null } {
  if (!settings) return { ready: false, reason: "設定を読み込めていません。" };

  const configured = settings.keys.find((k) => k.provider === id)?.configured ?? false;
  if (!configured) return { ready: false, reason: "APIキーが未設定です。" };

  if (isBuiltin(id)) return { ready: true, reason: null };

  const custom = settings.customProviders.find((c) => c.id === id);
  if (!custom) return { ready: false, reason: "プロバイダが見つかりません。" };
  if (!custom.baseUrl.trim()) return { ready: false, reason: "Base URL が未設定です。" };
  if (!custom.model.trim()) return { ready: false, reason: "モデル名が未設定です。" };
  return { ready: true, reason: null };
}
