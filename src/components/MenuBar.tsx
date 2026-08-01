import { useEffect, useRef, useState } from "react";

/** メニュー項目。action が未設定のものは未実装。 */
interface MenuItem {
  label: string;
  shortcut?: string;
  separatorBefore?: boolean;
  /** 実装済みの動作。親へ通知される。 */
  action?: MenuAction;
}

export type MenuAction = "open-settings";

interface Menu {
  label: string;
  items: MenuItem[];
}

const MENUS: Menu[] = [
  {
    label: "ファイル",
    items: [
      { label: "新規チャット", shortcut: "Ctrl+N" },
      { label: "PDFを開く…", shortcut: "Ctrl+O" },
      { label: "分析結果を書き出す…", separatorBefore: true },
      { label: "設定…", shortcut: "Ctrl+,", separatorBefore: true, action: "open-settings" },
      { label: "終了", shortcut: "Alt+F4" },
    ],
  },
  {
    label: "表示",
    items: [
      { label: "サイドバーの表示切替", shortcut: "Ctrl+B" },
      { label: "下部パネルの表示切替", shortcut: "Ctrl+J" },
      { label: "拡大", shortcut: "Ctrl++", separatorBefore: true },
      { label: "縮小", shortcut: "Ctrl+-" },
      { label: "等倍に戻す", shortcut: "Ctrl+0" },
    ],
  },
  {
    label: "分析",
    items: [
      { label: "ファンダメンタル分析を実行", shortcut: "Ctrl+Enter" },
      { label: "SEC提出書類を取得" },
      { label: "株価・指標を更新" },
      { label: "決算PDFを要約", separatorBefore: true },
      { label: "銘柄を比較…" },
    ],
  },
  {
    label: "ヘルプ",
    items: [
      { label: "APIキーの設定…", action: "open-settings" },
      { label: "使い方" },
      { label: "キーボードショートカット", shortcut: "Ctrl+/" },
      { label: "StockAnalyzer について", separatorBefore: true },
    ],
  },
];

interface Props {
  onAction: (action: MenuAction) => void;
}

/** 最上部の水平機能メニューバー */
export default function MenuBar({ onAction }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 外側クリックと Esc で閉じる
  useEffect(() => {
    if (openIndex === null) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenIndex(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex]);

  return (
    <div
      ref={barRef}
      className="relative z-50 flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900 px-2"
    >
      <div className="mr-2 flex items-center gap-2 pl-1 pr-3">
        <span className="text-[13px] font-semibold tracking-tight text-emerald-400">
          StockAnalyzer
        </span>
      </div>

      {MENUS.map((menu, i) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            onPointerEnter={() => openIndex !== null && setOpenIndex(i)}
            className={`rounded px-3 py-1 text-[13px] transition-colors ${
              openIndex === i
                ? "bg-slate-700 text-slate-100"
                : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            {menu.label}
          </button>

          {openIndex === i && (
            <div className="absolute left-0 top-full mt-px min-w-56 rounded-md border border-slate-700 bg-slate-800 py-1 shadow-xl shadow-black/40">
              {menu.items.map((item) => (
                <div key={item.label}>
                  {item.separatorBefore && <div className="my-1 border-t border-slate-700" />}
                  <button
                    type="button"
                    onClick={() => {
                      setOpenIndex(null);
                      if (item.action) onAction(item.action);
                    }}
                    className={`flex w-full items-center justify-between gap-8 px-3 py-1.5 text-left text-[13px] hover:bg-slate-700 hover:text-slate-100 ${
                      item.action ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="font-mono text-[11px] text-slate-500">{item.shortcut}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
