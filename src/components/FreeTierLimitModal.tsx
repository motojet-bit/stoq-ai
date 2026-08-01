import { FREE_TICKER_LIMIT } from "@/lib/license/freeTier";
import { useUsedTickers } from "@/lib/license/freeTierStore";
import ModalShell from "@/components/ModalShell";
import { IconBadge, IconKey } from "@/components/Icons";
import { APP_NAME } from "@/lib/ui/appMeta";

interface Props {
  open: boolean;
  /** 制限に引っかかった銘柄 */
  ticker: string | null;
  onClose: () => void;
  /** 設定の「ライセンス認証」タブを開く */
  onOpenLicense: () => void;
}

/**
 * 無料版の上限に達したときの案内。
 *
 * **何が使えなくなったのかを具体的に示す。** 「上限です」だけだと、
 * すでに分析した銘柄まで使えなくなったのかが分からず不安になる。
 */
export default function FreeTierLimitModal({
  open,
  ticker,
  onClose,
  onOpenLicense,
}: Props) {
  const used = useUsedTickers();

  return (
    <ModalShell
      open={open}
      title={`🔒 無料版の分析上限（${FREE_TICKER_LIMIT}銘柄）に達しました`}
      icon={<IconBadge className="h-4 w-4 text-amber-400" />}
      maxWidthClass="max-w-lg"
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            あとで
          </button>
          <button
            type="button"
            onClick={onOpenLicense}
            className="flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <IconKey className="h-3.5 w-3.5" />
            ライセンスキーを入力
          </button>
        </footer>
      }
    >
      <div className="px-6 py-5">
        <p className="selectable t-body leading-relaxed text-slate-300">
          {APP_NAME} をご利用いただきありがとうございます。
          {FREE_TICKER_LIMIT + 1}銘柄目以降の無制限分析を行うには、
          ライセンスキーを有効化してください。
        </p>

        {ticker && (
          <p className="mt-3 t-label text-slate-500">
            分析しようとした銘柄:{" "}
            <span className="font-mono text-slate-300">{ticker}</span>
          </p>
        )}

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
          <p className="mb-1.5 t-label font-medium uppercase tracking-wider text-slate-500">
            分析済みの銘柄（{used.length} / {FREE_TICKER_LIMIT}）
          </p>
          <div className="flex flex-wrap gap-1.5">
            {used.map((item) => (
              <span
                key={item}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 font-mono t-label text-emerald-300"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-2 t-label leading-relaxed text-slate-500">
            この{used.length}銘柄は、無料版のまま**何度でも**再分析・対話・
            過去ログの閲覧ができます。制限がかかるのは新しい銘柄だけです。
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
