import { useState, type FormEvent } from "react";
import { IconSearch } from "@/components/Icons";

interface Props {
  /** ティッカーが確定したときに呼ばれる（大文字化済み） */
  onSubmit: (ticker: string) => void;
}

/** ティッカー入力フォーム */
export default function TickerInput({ onSubmit }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    onSubmit(ticker);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ティッカー（例: NVDA, 7203.T, ASML.AS）"
          spellCheck={false}
          autoComplete="off"
          className="selectable min-h-8 w-80 rounded-md border border-slate-700 bg-slate-950 pl-8 pr-3 t-body text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
      </div>
      <button
        type="submit"
        className="min-h-8 rounded-md bg-emerald-600 px-3.5 t-body font-medium text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
      >
        分析
      </button>
    </form>
  );
}
