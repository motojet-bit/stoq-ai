import { formatTokens, tokenUsage } from "@/lib/parser/tokenCount";

interface Props {
  tokens: number;
  limit: number;
}

const STYLE = {
  ok: { emoji: "🟢", bar: "bg-emerald-500", text: "text-emerald-400" },
  warning: { emoji: "🟡", bar: "bg-amber-500", text: "text-amber-400" },
  over: { emoji: "🔴", bar: "bg-red-500", text: "text-red-400" },
} as const;

/** LLM 入力上限に対するトークン消費量メーター。 */
export default function TokenMeter({ tokens, limit }: Props) {
  const usage = tokenUsage(tokens, limit);
  const style = STYLE[usage.level];
  const percent = Math.min(usage.ratio, 1) * 100;

  return (
    <div
      title={`${usage.label}｜概算 ${tokens.toLocaleString()} / 上限 ${usage.limit.toLocaleString()} トークン（${(usage.ratio * 100).toFixed(1)}%）`}
      className="flex shrink-0 items-center gap-2"
    >
      <span aria-hidden="true" className="text-[11px]">
        {style.emoji}
      </span>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5 font-mono text-[11px]">
          <span className={style.text}>{formatTokens(usage.tokens)}</span>
          <span className="text-slate-600">/ {formatTokens(usage.limit)} tok</span>
        </div>
        <div
          className="h-1 w-28 overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-valuenow={Math.round(usage.ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="トークン消費量"
        >
          <div
            className={`h-full rounded-full transition-all ${style.bar}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
