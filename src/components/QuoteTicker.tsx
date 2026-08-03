import { useEffect, useRef, useState } from "react";
import type { MarketQuote } from "@/types";
import { fetchQuote } from "@/lib/api/marketQuote";
import {
  formatPercent,
  isMarketOpen,
  rangePosition,
  toneArrow,
  toneClass,
  toneOf,
} from "@/lib/market/quoteTone";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  /** 表示中の銘柄。null なら何も出さない */
  ticker: string | null;
}

/** 取り直す間隔。**短くしない**（Yahoo に叩かれ過ぎと見なされると弾かれる） */
const REFRESH_MS = 60_000;

/**
 * 選択中の銘柄の株価フィード。
 *
 * **失敗しても操作を止めない。** 株価は分析の前提ではなく添え物で、
 * 取得できないことを理由に画面が止まれば本来の作業まで巻き添えになる。
 * 取れなければ「株価取得オフライン」と出して、それ以上は何もしない。
 */
export default function QuoteTicker({ ticker }: Props) {
  const t = useT();
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  /** 銘柄を切り替えた直後に古い応答が届いても、それを表示しないための番号 */
  const seq = useRef(0);

  useEffect(() => {
    if (!ticker) {
      setQuote(null);
      setFailed(false);
      return;
    }

    const mine = ++seq.current;
    let timer: number | undefined;

    const load = async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      const next = await fetchQuote(ticker);
      // 切り替え後に届いた応答は捨てる
      if (mine !== seq.current) return;
      setLoading(false);
      if (next) {
        setQuote(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
    };

    void load(true);
    timer = window.setInterval(() => void load(false), REFRESH_MS);

    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [ticker]);

  if (!ticker) return null;

  if (loading && !quote) {
    return (
      <div className="flex shrink-0 items-center gap-2 t-label text-slate-500">
        <span className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-emerald-500" />
        {t("quote.loading")}
      </div>
    );
  }

  if (!quote) {
    return (
      <div
        title={t("quote.offlineHint")}
        className="flex shrink-0 items-center gap-1.5 t-label text-slate-500"
      >
        <span aria-hidden="true">⚠</span>
        {t("quote.offline")}
      </div>
    );
  }

  const tone = toneOf(quote.changePercent);
  const position = rangePosition(quote.price, quote.week52Low, quote.week52High);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-3">
      {/* 株価と前日比。**記号と符号を必ず添える**（色だけに頼らせない） */}
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="selectable t-body font-medium tabular-nums text-slate-100">
          {quote.priceDisplay}
        </span>
        <span className={`selectable t-label tabular-nums ${toneClass(tone)}`}>
          <span aria-hidden="true">{toneArrow(tone)}</span> {quote.changeDisplay}（
          {formatPercent(quote.changePercent)}）
        </span>
      </div>

      {/* 52週レンジ。今どのあたりかは数字より棒のほうが早い */}
      {position !== null && (
        <div
          title={`${t("quote.range52")}: ${quote.week52LowDisplay} 〜 ${quote.week52HighDisplay}`}
          className="hidden w-24 shrink-0 lg:block"
        >
          <div className="relative h-1 rounded-full bg-slate-800">
            <span
              className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-slate-300"
              style={{ left: `${position * 100}%` }}
            />
          </div>
        </div>
      )}

      {quote.marketCap !== null && (
        <span className="hidden shrink-0 t-label text-slate-500 xl:inline">
          {t("quote.marketCap")} {quote.marketCapDisplay}
        </span>
      )}

      {/* 引け後の値を「今の株価」と誤解させない */}
      {!isMarketOpen(quote.marketState) && (
        <span className="shrink-0 t-label text-slate-600">{t("quote.closed")}</span>
      )}

      {failed && (
        <span title={t("quote.offlineHint")} className="shrink-0 t-label text-amber-500">
          {t("quote.stale")}
        </span>
      )}
    </div>
  );
}
