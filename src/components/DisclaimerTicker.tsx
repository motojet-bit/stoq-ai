import { disclaimerTickerText } from "@/lib/legal/disclaimer";
import { openDisclaimer } from "@/lib/legal/disclaimerStore";
import { IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

/**
 * 画面下部を右から左へ流れ続ける免責テロップ。
 *
 * - クリックで全文モーダルを開く
 * - ホバー中はアニメーションを止める（読ませるため。`styles.css` の `:hover` で制御）
 * - 同じ文面を 2 回並べ、`-50%` まで動かすことで**継ぎ目なくループ**させる
 */
export default function DisclaimerTicker() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={openDisclaimer}
      aria-label={t("ticker.showFull")}
      title={t("ticker.clickHint")}
      className="ticker ui-fixed flex min-h-6 w-full shrink-0 items-center gap-2 overflow-hidden border-t border-amber-900/70 bg-amber-950/40 px-2 text-left text-amber-200 transition-colors hover:bg-amber-950/70"
    >
      <IconWarning className="h-3.5 w-3.5 shrink-0 text-amber-400" />

      <span className="ticker-viewport min-w-0 flex-1 overflow-hidden">
        <span className="ticker-track">
          <span className="ticker-item">{disclaimerTickerText()}</span>
          {/* 継ぎ目を消すための 2 枚目。読み上げには不要なので隠す */}
          <span className="ticker-item" aria-hidden="true">
            {disclaimerTickerText()}
          </span>
        </span>
      </span>
    </button>
  );
}
