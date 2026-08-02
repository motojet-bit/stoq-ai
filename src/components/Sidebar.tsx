import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { ChatSession } from "@/types";
import ChatHistoryItem from "@/components/ChatHistoryItem";
import ConfirmDialog from "@/components/ConfirmDialog";
import CandidateStocksPanel from "@/components/CandidateStocksPanel";
import PortfolioPanel from "@/components/PortfolioPanel";
import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  orderedModes,
  readSidebarWidth,
  setSidebarMode,
  storeSidebarWidth,
  useSidebarMode,
} from "@/lib/ui/sidebarMode";
import { clampFirstSize } from "@/lib/ui/splitMath";
import { IconArchive, IconPanelLeft, IconPlus } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

const HEIGHT_KEY = "stockanalyzer.candidatesHeight";
const COLLAPSED_KEY = "stockanalyzer.candidatesCollapsed";
const DEFAULT_HEIGHT = 160;

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても動作は続ける
  }
}

interface Props {
  collapsed: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onToggleCollapse: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onArchiveSession: (id: string, archived: boolean) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  /** 検討中銘柄をクリックしたとき */
  onSelectTicker: (ticker: string) => void;
  /** 検討中銘柄のインポートモーダル（ショートカットからも開ける） */
  candidateImportOpen: boolean;
  onCandidateImportOpenChange: (open: boolean) => void;
  /** チェックした銘柄を横並び比較する */
  onCompareTickers: (tickers: string[]) => void;
}

/** Chatbox 風の会話履歴サイドバー（折りたたみ可能） */
export default function Sidebar({
  collapsed,
  sessions,
  activeSessionId,
  onToggleCollapse,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
  onNewChat,
  onSelectTicker,
  candidateImportOpen,
  onCandidateImportOpenChange,
  onCompareTickers,
}: Props) {
  const t = useT();
  const mode = useSidebarMode();
  const [width, setWidth] = useState(() => readSidebarWidth());
  const [widthDragging, setWidthDragging] = useState(false);
  const [deleting, setDeleting] = useState<ChatSession | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const [candidatesHeight, setCandidatesHeight] = useState(() =>
    readStored(HEIGHT_KEY, DEFAULT_HEIGHT),
  );
  const [candidatesCollapsed, setCandidatesCollapsed] = useState(
    () => readStored(COLLAPSED_KEY, 0) === 1,
  );
  const [resizing, setResizing] = useState(false);

  /*
   * 境界線のドラッグ。カーソル位置からサイドバー下端までを小窓の高さにする。
   * 履歴側の最小（160px）を割り込まないよう `clampFirstSize` で丸める。
   */
  const onPointerMove = useCallback((e: globalThis.PointerEvent) => {
    const rect = asideRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCandidatesHeight(
      clampFirstSize({
        desired: rect.bottom - e.clientY,
        total: rect.height,
        minFirst: 64,
        minSecond: 160,
      }),
    );
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const stop = () => setResizing(false);
    document.body.classList.add("is-resizing-v");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    return () => {
      document.body.classList.remove("is-resizing-v");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
  }, [resizing, onPointerMove]);

  useEffect(() => {
    store(HEIGHT_KEY, String(Math.round(candidatesHeight)));
  }, [candidatesHeight]);

  useEffect(() => {
    store(COLLAPSED_KEY, candidatesCollapsed ? "1" : "0");
  }, [candidatesCollapsed]);

  /*
   * サイドバーの幅を変える。左端からの距離をそのまま幅にする。
   * 「💼 マイポートフォリオ」が省略される幅まで狭められないよう下限を設ける。
   */
  const onWidthMove = useCallback((e: globalThis.PointerEvent) => {
    const rect = asideRef.current?.getBoundingClientRect();
    if (!rect) return;
    setWidth(clampSidebarWidth(e.clientX - rect.left));
  }, []);

  useEffect(() => {
    if (!widthDragging) return;

    const stop = () => setWidthDragging(false);
    document.body.classList.add("is-resizing-h");
    document.addEventListener("pointermove", onWidthMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    return () => {
      document.body.classList.remove("is-resizing-h");
      document.removeEventListener("pointermove", onWidthMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
  }, [widthDragging, onWidthMove]);

  useEffect(() => {
    storeSidebarWidth(width);
  }, [width]);

  const startResize = (e: PointerEvent) => {
    if (candidatesCollapsed) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setResizing(true);
  };

  const archived = sessions.filter((s) => s.isArchived);
  const shown = showArchived ? archived : sessions.filter((s) => !s.isArchived);

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-900 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title={t("sidebar.open")}
          className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <IconPanelLeft className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          onClick={onNewChat}
          title={t("menu.file.newChat")}
          className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-emerald-400"
        >
          <IconPlus className="h-4.5 w-4.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-slate-800 bg-slate-900"
    >
      {/* 右端をドラッグして幅を変えられる */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resizeAria")}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setWidthDragging(true);
        }}
        title={t("sidebar.resizeHint", { min: MIN_SIDEBAR_WIDTH, max: MAX_SIDEBAR_WIDTH })}
        className={`absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize ${
          widthDragging ? "bg-emerald-500" : "hover:bg-emerald-600"
        }`}
      />
      {/*
        対話とポートフォリオの切替。見たいものが違うので同居させない。
        **選択中のタブを先頭へ寄せ、ラベルを省略させない**（いま見ている
        モード名が読めないのがいちばん困るため）。
      */}
      <div className="flex shrink-0 items-stretch gap-1 overflow-hidden border-b border-slate-800 px-2 py-1.5">
        {orderedModes(mode).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSidebarMode(item.id)}
            aria-pressed={mode === item.id}
            title={t(item.labelKey)}
            className={`rounded-md px-2 py-1 t-label transition-all ${
              mode === item.id
                ? "shrink-0 whitespace-nowrap bg-slate-700 font-medium text-emerald-300"
                : "min-w-0 flex-1 truncate text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-2.5 t-body text-slate-200 transition-colors hover:border-emerald-700 hover:bg-slate-700 hover:text-emerald-300"
        >
          <IconPlus className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("menu.file.newChat")}</span>
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          title={t("sidebar.close")}
          className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <IconPanelLeft className="h-4.5 w-4.5" />
        </button>
      </div>

      {mode === "portfolio" ? (
        <PortfolioPanel onSelectTicker={onSelectTicker} onCompare={onCompareTickers} />
      ) : (
        <>
      <div className="flex shrink-0 items-center justify-between gap-1 px-3 pb-1 pt-2">
        <span className="t-label font-medium uppercase tracking-wider text-slate-500">
          {showArchived ? t("sidebar.archive") : t("sidebar.history")}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-mono t-label text-slate-600">{shown.length}</span>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? t("sidebar.backToHistory") : t("sidebar.viewArchive", { count: archived.length })}
            aria-pressed={showArchived}
            className={`rounded p-1 ${
              showArchived
                ? "bg-slate-700 text-emerald-300"
                : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            }`}
          >
            <IconArchive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/*
        履歴だけが伸縮し、独立して縦スクロールする。
        min-h-0 が無いと中身の高さを主張して「検討中銘柄」を押し出してしまう。
      */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center t-label leading-relaxed text-slate-600">
            {showArchived ? (
              <>
                {t("sidebar.emptyArchive")}
                <br />
                {t("sidebar.archiveTip")}
              </>
            ) : (
              <>
                {t("sidebar.emptyChats")}
                <br />
                {t("sidebar.autoSaveTip")}
              </>
            )}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((session) => (
              <ChatHistoryItem
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                onSelect={() => onSelectSession(session.id)}
                onRename={(title) => onRenameSession(session.id, title)}
                onArchive={() => onArchiveSession(session.id, !session.isArchived)}
                onDelete={() => setDeleting(session)}
              />
            ))}
          </ul>
        )}
      </nav>
        </>
      )}

      <CandidateStocksPanel
        onSelectTicker={onSelectTicker}
        height={candidatesHeight}
        collapsed={candidatesCollapsed}
        onToggleCollapsed={() => setCandidatesCollapsed((v) => !v)}
        onResizeStart={startResize}
        importOpen={candidateImportOpen}
        onImportOpenChange={onCandidateImportOpenChange}
        onCompare={onCompareTickers}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t("sidebar.deleteTitle")}
        message={
          t("sidebar.deleteBody", {
            title: deleting?.title ?? "",
            count: deleting?.messageCount ?? 0,
          })
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.back")}
        destructive
        onConfirm={() => {
          if (deleting) onDeleteSession(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </aside>
  );
}
