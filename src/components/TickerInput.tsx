import { useEffect, useState, type FormEvent } from "react";
import { IconSearch } from "@/components/Icons";
import Tooltip from "@/components/Tooltip";
import { tooltip } from "@/lib/ui/tooltipText";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  /** ティッカーが確定したときに呼ばれる（大文字化済み） */
  onSubmit: (ticker: string) => void;
  /**
   * 外から入力欄にセットしたい値（検討中銘柄のクリックなど）。
   * 同じ銘柄を続けて選べるよう、値ではなく `seq` の変化で反映する。
   */
  preset?: { ticker: string; seq: number } | null;
}

/** ティッカー入力フォーム */
export default function TickerInput({ onSubmit, preset = null }: Props) {
  const t = useT();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (preset) setValue(preset.ticker);
    // seq が変わったときだけ反映する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.seq]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    onSubmit(ticker);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Tooltip content={tooltip("ticker")} placement="bottom" widthClass="w-80">
        <span className="relative">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-ticker-input="true"
          placeholder={t("command.tickerPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          className="selectable min-h-8 w-80 rounded-md border border-slate-700 bg-slate-950 pl-8 pr-3 t-body text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
        </span>
      </Tooltip>
      {/*
        **ここは指標の取得。** AI 分析は分析パネルの「AI分析を実行」で走る。
        「分析」と書くと、押した時点で AI が動いたと受け取られる。
      */}
      <button
        type="submit"
        title={t("command.analyzeHint")}
        className="min-h-8 shrink-0 whitespace-nowrap rounded-md bg-emerald-600 px-3.5 t-body font-medium text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
      >
        {t("command.analyze")}
      </button>
    </form>
  );
}
