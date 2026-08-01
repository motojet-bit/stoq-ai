import { Channel, invoke, isTauri } from "@/lib/tauri";
import type { ChatMessage, LlmEvent, ProviderId } from "@/types";

export interface LlmRequest {
  /** 未指定なら設定の既定プロバイダ */
  provider?: ProviderId;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface StreamHandlers {
  /** 実際に使われたプロバイダとモデルが確定したとき */
  onStart?: (provider: string, model: string) => void;
  /** トークンが届くたび */
  onDelta?: (text: string) => void;
}

/**
 * LLM へ送信し、応答をストリーミングで受け取る。
 *
 * 実際の HTTP は Rust 側が行う（CORS 回避と APIキー秘匿のため）。
 * 完了時に本文全体を返し、失敗時は Error を throw する。
 */
export async function streamChat(
  request: LlmRequest,
  handlers: StreamHandlers = {},
): Promise<string> {
  if (!isTauri()) {
    throw new Error(
      "ブラウザで実行中のため LLM を呼び出せません。`npm run tauri:dev` で起動してください。",
    );
  }

  let settled = false;
  let resolveResult!: (text: string) => void;
  let rejectResult!: (error: Error) => void;

  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const channel = new Channel<LlmEvent>();
  channel.onmessage = (event) => {
    switch (event.type) {
      case "start":
        handlers.onStart?.(event.provider, event.model);
        break;
      case "delta":
        handlers.onDelta?.(event.text);
        break;
      case "done":
        settled = true;
        resolveResult(event.text);
        break;
      case "error":
        settled = true;
        rejectResult(new Error(event.message));
        break;
    }
  };

  try {
    await invoke("llm_send", { request, onEvent: channel });
  } catch (e) {
    // Channel 経由で error を受け取っていればそちらを優先する
    if (!settled) {
      settled = true;
      rejectResult(new Error(String(e)));
    }
  }

  // invoke は解決したが done/error が届かなかった場合の保険
  if (!settled) {
    settled = true;
    rejectResult(new Error("LLM からの応答が完了しませんでした。"));
  }

  return result;
}
