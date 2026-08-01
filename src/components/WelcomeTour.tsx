import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import { IconHelp } from "@/components/Icons";
import { APP_NAME } from "@/lib/ui/appMeta";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

interface Step {
  title: string;
  body: string;
  /** この手順で押すボタンがあれば */
  action?: { label: string; kind: "settings" | "help" };
}

const STEPS: Step[] = [
  {
    title: `ようこそ、${APP_NAME} へ`,
    body:
      "米国株・グローバル株のファンダメンタル分析を、AI と一緒に進めるためのアプリです。\n\n" +
      "取得した財務データと、あなたが読み込ませた決算資料をまとめて AI に渡し、\n" +
      "20 項目の評価を作ります。まずは 4 ステップだけ確認しましょう。",
  },
  {
    title: "1. まず APIキーを登録する",
    body:
      "AI を動かすには、OpenAI / Anthropic / Gemini のいずれかの APIキーが必要です。\n" +
      "上部の「AI設定」ボタンから登録してください。\n\n" +
      "キーは OS のアプリ設定ディレクトリに保存され、画面にはマスク済みの文字列しか出ません。\n" +
      "SEC EDGAR を使うには「アプリ名 メールアドレス」形式の User-Agent も必要です。",
    action: { label: "設定を開く", kind: "settings" },
  },
  {
    title: "2. 銘柄を調べる",
    body:
      "上部の入力欄にティッカー（例: NVDA、7203.T）を入れて「分析」を押すと、\n" +
      "株価・財務指標・四半期推移・SEC の提出状況を取得します。\n\n" +
      "左サイドバー下部の「検討中銘柄」には、\n" +
      "AAPL|Apple|Phone のような一覧をそのまま貼り付けて一括登録できます。",
  },
  {
    title: "3. 一次資料を読み込ませる",
    body:
      "決算説明会資料や 10-K の PDF / DOCX / PPTX をドロップゾーンに入れてください。\n" +
      "資料があるほど分析の精度が上がります。\n\n" +
      "長い資料は自動で圧縮されますが、要約ではなく原文抽出なので事実の改変は起きません。",
  },
  {
    title: "4. 分析して、迷ったら聞く",
    body:
      "分析結果パネルの「AI分析を実行」で 20 項目の評価が生成されます。\n" +
      "合格ラインの数値は設定の「分析ルール・閾値」タブで自由に変えられます。\n\n" +
      "操作で迷ったら、画面右下の「? ヘルプ」からいつでも AI に質問できます。",
    action: { label: "ヘルプを開く", kind: "help" },
  },
];

/**
 * 初回起動時のチュートリアル。
 *
 * 一度閉じたら二度と自動では出さない（localStorage に印を残す）。
 * ヘルプから明示的に開き直せる。
 */
export default function WelcomeTour({ open, onClose, onOpenSettings, onOpenHelp }: Props) {
  const [index, setIndex] = useState(0);
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const isLast = index >= STEPS.length - 1;

  const close = () => {
    setIndex(0);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="はじめかた"
      icon={<IconHelp className="h-4 w-4 text-emerald-400" />}
      maxWidthClass="max-w-xl"
      onClose={close}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-emerald-500" : "w-1.5 bg-slate-700"
                }`}
              />
            ))}
          </span>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={close}
              className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              スキップ
            </button>
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
              >
                戻る
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? close() : setIndex((i) => i + 1))}
              className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500"
            >
              {isLast ? "はじめる" : "次へ"}
            </button>
          </div>
        </footer>
      }
    >
      <div className="px-6 py-6">
        <h3 className="t-body text-[15px] font-semibold text-slate-50">{step.title}</h3>
        <p className="selectable mt-3 whitespace-pre-wrap t-body leading-relaxed text-slate-300">
          {step.body}
        </p>

        {step.action && (
          <button
            type="button"
            onClick={() => {
              close();
              if (step.action?.kind === "settings") onOpenSettings();
              else onOpenHelp();
            }}
            className="mt-4 min-h-8 rounded-md border border-emerald-700 bg-emerald-950/40 px-3.5 t-body text-emerald-300 transition-colors hover:bg-emerald-900/40"
          >
            {step.action.label}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
