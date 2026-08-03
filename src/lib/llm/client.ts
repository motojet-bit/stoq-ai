import { Channel, invoke, isTauri } from "@/lib/tauri";
import { t, getLocale  } from "@/lib/i18n/i18n";
import type { ChatMessage, LlmEvent, ProviderId } from "@/types";

export interface LlmRequest {
  /** 中断に使う ID。未指定なら自動採番される */
  requestId?: string;
  /** 未指定なら設定の既定プロバイダ */
  provider?: ProviderId;
  /** 自由入力のシステムプロンプト（対話・ヘルプ用） */
  system?: string;
  /**
   * 20項目分析のプリセット。**役割 ID と閾値だけ**を渡す。
   * 秘匿プロンプトとの結合は Rust 側で行われ、本文は戻ってこない。
   */
  analysisPreset?: {
    roleId: string;
    thresholds: Record<string, number>;
    locale?: string;
  };
  /**
   * ディベートの担当。指定すると **Rust 側の秘匿プロンプト**が system になる。
   * `system` / `analysisPreset` より優先される。
   */
  debate?: "bear" | "bull";
  /**
   * モデルの上書き。ディベートに別モデルを充てるときだけ使う。
   * 未指定ならプロバイダの既定モデル。
   */
  model?: string;
  /**
   * 出力言語（`ja` / `en` …）。
   * **指定しなければ送信時に現在の表示言語が入る。**
   * 画面ごとに書き分けると設定と食い違うため。
   */
  locale?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface StreamHandlers {
  /** 実際に使われたプロバイダとモデルが確定したとき */
  onStart?: (provider: string, model: string) => void;
  /** トークンが届くたび */
  onDelta?: (text: string) => void;
}

/** 1 回の呼び出しで消費したトークン。取れなければ 0。 */
export interface TokenUsage {
  input: number;
  output: number;
}

export interface StreamResult {
  text: string;
  /** 中断によって途中で終わったか */
  cancelled: boolean;
  /** 実測の消費トークン。**推定で埋めない**（請求額とかけ離れた数字を出さないため） */
  usage?: TokenUsage;
}

/** 生成中の呼び出しを中断する。それまでのテキストは破棄されない。 */
export async function cancelChat(requestId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("llm_cancel", { requestId });
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
): Promise<StreamResult> {
  if (!isTauri()) {
    throw new Error(
      t("err.browserLlm"),
    );
  }

  let settled = false;
  let resolveResult!: (result: StreamResult) => void;
  let rejectResult!: (error: Error) => void;

  const result = new Promise<StreamResult>((resolve, reject) => {
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
        resolveResult({
          text: event.text,
          cancelled: event.cancelled,
          usage: event.usage,
        });
        break;
      case "error":
        settled = true;
        rejectResult(new Error(event.message));
        break;
    }
  };

  try {
    // 言語は 1 か所でだけ決める。画面ごとに書き分けると設定と食い違う
    const withLocale = { ...request, locale: request.locale ?? getLocale() };
    await invoke("llm_send", { request: withLocale, onEvent: channel });
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
    rejectResult(new Error(t("err.llmIncomplete")));
  }

  return result;
}
