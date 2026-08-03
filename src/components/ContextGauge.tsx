import {
  contextUsage,
  formatCompactTokens,
  gaugeBlocks,
} from "@/lib/chat/contextGauge";
import type { ChatMessage } from "@/types";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  messages: Pick<ChatMessage, "content">[];
  systemPrompt?: string;
  model: string | null;
}

/**
 * コンテキストの消費量ゲージ。
 *
 * **使い切ってから気づくのでは遅い。** 上限に当たると古い発言が落ちて
 * 話が噛み合わなくなる。要約して新しい会話へ移す判断は、埋まる前にしかできない。
 */
export default function ContextGauge({ messages, systemPrompt, model }: Props) {
  const t = useT();
  const usage = contextUsage({ messages, systemPrompt, model });
  const { filled, total } = gaugeBlocks(usage.ratio);

  const color =
    usage.level === "danger"
      ? "bg-red-500"
      : usage.level === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500";

  const textColor =
    usage.level === "danger"
      ? "text-red-400"
      : usage.level === "warn"
        ? "text-amber-400"
        : "text-slate-500";

  return (
    <span
      title={t("chat.contextHint")}
      className="ui-fixed flex shrink-0 items-center gap-1.5 text-[11px]"
    >
      <span className="text-slate-600">{t("chat.context")}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-1.5 rounded-[1px] ${i < filled ? color : "bg-slate-800"}`}
          />
        ))}
      </span>
      <span className={`font-mono ${textColor}`}>
        {Math.round(usage.ratio * 100)}%
      </span>
      <span className="font-mono text-slate-600">
        ({formatCompactTokens(usage.used)} / {formatCompactTokens(usage.limit)})
      </span>
    </span>
  );
}
