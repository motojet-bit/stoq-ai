import { useEffect, useRef, useState, type ReactNode } from "react";
import FontSizeControl from "@/components/FontSizeControl";
import { useT } from "@/lib/i18n/i18n";

/** メニュー項目。action が未設定のものは未実装。 */
interface MenuItem {
  /** 辞書キー。表示は `t()` で引く */
  labelKey: string;
  shortcut?: string;
  separatorBefore?: boolean;
  /** 実装済みの動作。親へ通知される。 */
  action?: MenuAction;
}

export type MenuAction = "open-settings" | "open-disclaimer";

interface Menu {
  labelKey: string;
  items: MenuItem[];
}

/** テストから参照できるよう公開する。 */
export const MENUS: Menu[] = [
  {
    labelKey: "menu.file",
    items: [
      { labelKey: "menu.file.newChat", shortcut: "Ctrl+N" },
      { labelKey: "menu.file.openPdf", shortcut: "Ctrl+O" },
      { labelKey: "menu.file.exportAnalysis", separatorBefore: true },
      {
        labelKey: "menu.file.settings",
        shortcut: "Ctrl+,",
        separatorBefore: true,
        action: "open-settings",
      },
      { labelKey: "menu.file.quit", shortcut: "Alt+F4" },
    ],
  },
  {
    labelKey: "menu.view",
    items: [
      { labelKey: "menu.view.toggleSidebar", shortcut: "Ctrl+B" },
      { labelKey: "menu.view.toggleBottom", shortcut: "Ctrl+J" },
      { labelKey: "menu.view.zoomIn", shortcut: "Ctrl++", separatorBefore: true },
      { labelKey: "menu.view.zoomOut", shortcut: "Ctrl+-" },
      { labelKey: "menu.view.zoomReset", shortcut: "Ctrl+0" },
    ],
  },
  {
    labelKey: "menu.analysis",
    items: [
      { labelKey: "menu.analysis.run", shortcut: "Ctrl+Enter" },
      { labelKey: "menu.analysis.fetchSec" },
      { labelKey: "menu.analysis.refresh" },
      { labelKey: "menu.analysis.summarizePdf", separatorBefore: true },
      { labelKey: "menu.analysis.compare" },
    ],
  },
  {
    labelKey: "menu.help",
    items: [
      { labelKey: "menu.help.apiKeys", action: "open-settings" },
      { labelKey: "menu.help.usage" },
      { labelKey: "menu.help.shortcuts", shortcut: "Ctrl+/" },
      {
        labelKey: "menu.help.disclaimer",
        separatorBefore: true,
        action: "open-disclaimer",
      },
      { labelKey: "menu.help.about" },
    ],
  },
];

interface Props {
  onAction: (action: MenuAction) => void;
  /** 右端に差し込む要素（最小化したパネルの復元ボタンなど） */
  right?: ReactNode;
}

/**
 * 最上部の水平機能メニューバー。
 *
 * **このバー自体は `.ui-fixed` で文字サイズ連動から切り離している。**
 * ここにフォント調整 UI を置くため、バーの高さが変わると
 * スライダーがカーソルの下から動いてしまうため。
 */
export default function MenuBar({ onAction, right }: Props) {
  const t = useT();
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
      className="ui-fixed relative z-50 flex h-9 shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-900 px-2"
    >
      <div className="mr-2 flex items-center gap-2 pl-1 pr-3">
        <span className="text-[13px] font-semibold tracking-tight">
          <span className="text-emerald-400">StoQ</span>
          <span className="ml-1 text-slate-300">AI Analyzer</span>
        </span>
      </div>

      {MENUS.map((menu, i) => (
        <div key={menu.labelKey} className="relative">
          <button
            type="button"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            onPointerEnter={() => openIndex !== null && setOpenIndex(i)}
            className={`rounded px-3 py-1 transition-colors ${
              openIndex === i
                ? "bg-slate-700 text-slate-100"
                : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            {t(menu.labelKey)}
          </button>

          {openIndex === i && (
            <div className="absolute left-0 top-full mt-px min-w-56 rounded-md border border-slate-700 bg-slate-800 py-1 shadow-xl shadow-black/40">
              {menu.items.map((item) => (
                <div key={item.labelKey}>
                  {item.separatorBefore && <div className="my-1 border-t border-slate-700" />}
                  <button
                    type="button"
                    onClick={() => {
                      setOpenIndex(null);
                      if (item.action) onAction(item.action);
                    }}
                    className={`flex w-full items-center justify-between gap-8 px-3 py-1.5 text-left hover:bg-slate-700 hover:text-slate-100 ${
                      item.action ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    <span>{t(item.labelKey)}</span>
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

      {/* 右端: 最小化パネルの復元ボタン ＋ 全域フォントサイズ調整 */}
      <div className="ml-auto flex shrink-0 items-center gap-3 pl-3">
        {right}
        <FontSizeControl />
      </div>
    </div>
  );
}
