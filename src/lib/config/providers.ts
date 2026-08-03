import type { AppSettings, BuiltinProviderId, ProviderId } from "@/types";
import { t } from "@/lib/i18n/i18n";

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
    modelHint: t("provider.hint.openai"),
    keySource: "platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPlaceholder: "sk-ant-…",
    modelHint: t("provider.hint.anthropic"),
    keySource: "console.anthropic.com",
  },
  {
    id: "gemini",
    label: "Google (Gemini)",
    keyPlaceholder: "AIza…",
    modelHint: t("provider.hint.gemini"),
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
  if (!settings) return { ready: false, reason: t("provider.err.noSettings") };

  const status = settings.keys.find((k) => k.provider === id);
  /*
   * **自分の PC 上の接続先は鍵が要らない。**
   * Ollama や LM Studio は認証を持たないので、
   * 未設定を理由に弾くとそもそも使えない。
   */
  if (!(status?.configured ?? false) && !(status?.local ?? false)) {
    return { ready: false, reason: t("provider.err.noKey") };
  }

  if (isBuiltin(id)) return { ready: true, reason: null };

  const custom = settings.customProviders.find((c) => c.id === id);
  if (!custom) return { ready: false, reason: t("provider.err.notFound") };
  if (!custom.baseUrl.trim()) return { ready: false, reason: t("provider.err.noBaseUrl") };
  if (!custom.model.trim()) return { ready: false, reason: t("provider.err.noModel") };
  return { ready: true, reason: null };
}
