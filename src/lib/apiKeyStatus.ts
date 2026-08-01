import type { ApiKeyStatus, LlmProvider } from "@/types";
import { maskSecret } from "@/lib/maskSecret";

/**
 * APIキーの設定状況を返す。
 *
 * Phase 1 は `.env` の `VITE_*` を読むだけの暫定実装。
 * Phase 2 で、キーを OS のセキュアストレージに置き Rust 側から
 * 「設定済みか否か」だけを受け取る形に置き換える（フロントに実キーを渡さない）。
 */
const PROVIDERS: { provider: LlmProvider; label: string; envKey: string }[] = [
  { provider: "openai", label: "OpenAI", envKey: "VITE_OPENAI_API_KEY" },
  { provider: "claude", label: "Claude", envKey: "VITE_ANTHROPIC_API_KEY" },
  { provider: "gemini", label: "Gemini", envKey: "VITE_GEMINI_API_KEY" },
];

export function getApiKeyStatuses(): ApiKeyStatus[] {
  const env = import.meta.env as Record<string, string | undefined>;

  return PROVIDERS.map(({ provider, label, envKey }) => {
    const masked = maskSecret(env[envKey]);
    return { provider, label, configured: masked !== null, masked };
  });
}
