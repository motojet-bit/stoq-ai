import { useEffect, useState } from "react";
import type { WorkspaceTab } from "@/types";
import { INITIAL_TABS } from "@/lib/sampleData";
import {
  archiveSession,
  createSession,
  deleteSession,
  loadChatSessions,
  renameSession,
  selectSession,
  useActiveSessionId,
  useChatSessions,
} from "@/lib/chat/chatStore";
import { loadCandidates } from "@/lib/candidates/candidateStore";
import { loadPrompts } from "@/lib/prompts/promptLibrary";
import { loadAnalystRoles } from "@/lib/prompts/analystRoleStore";
import { openDisclaimer } from "@/lib/legal/disclaimerStore";
import {
  loadArchive,
  loadPortfolios,
} from "@/lib/portfolio/portfolioStore";
import { loadLicense } from "@/lib/license/licenseStore";
import { checkAccess, useTicker } from "@/lib/license/freeTierStore";
import type { BlockReason } from "@/lib/license/freeTier";
import FreeTierLimitModal from "@/components/FreeTierLimitModal";
import { bindingFromEvent } from "@/lib/ui/shortcutKeys";
import { loadShortcuts, resolveAction } from "@/lib/ui/shortcutStore";
import { loadSettings, useSettings, useSettingsError } from "@/lib/config/settingsStore";
import { loadTicker, useAnalyses } from "@/lib/api/analysisStore";
import {
  ingestFiles,
  loadStagedDocuments,
  useStagedDocuments,
} from "@/lib/parser/documentStore";
import {
  cancelAnalysis,
  clearAnalysis,
  restoreAnalysis,
  runAnalysis,
  useAnalysisRuns,
} from "@/lib/prompts/analysisRunner";
import { providerReadiness } from "@/lib/config/providers";
import { initFontSize } from "@/lib/ui/fontStore";
import { initLocale, useT } from "@/lib/i18n/i18n";
import { SLOT_IDS, useSlots, type PanelId, type SlotId } from "@/lib/ui/layoutStore";

import MenuBar, { type MenuAction } from "@/components/MenuBar";
import CommandBar from "@/components/CommandBar";
import Sidebar from "@/components/Sidebar";
import TabBar from "@/components/TabBar";
import WorkspacePanel from "@/components/WorkspacePanel";
import ResizableSplit from "@/components/ResizableSplit";
import AnalysisPanel from "@/components/AnalysisPanel";
import ChatPanel from "@/components/ChatPanel";
import StatusBar from "@/components/StatusBar";
import SettingsModal, { type SettingsTab } from "@/components/SettingsModal";
import ToastHost from "@/components/ToastHost";
import DocumentTray from "@/components/DocumentTray";
import ConfirmDialog from "@/components/ConfirmDialog";
import PanelRestoreBar from "@/components/PanelRestoreBar";
import HelpAssistant from "@/components/HelpAssistant";
import WelcomeTour from "@/components/WelcomeTour";
import LegalDisclaimerModal from "@/components/LegalDisclaimerModal";
import EulaModal from "@/components/EulaModal";
import UpdateModal from "@/components/UpdateModal";
import { checkForUpdate } from "@/lib/update/updateStore";
import DisclaimerTicker from "@/components/DisclaimerTicker";
import ComparePanel from "@/components/ComparePanel";
import PortfolioHistoryPanel from "@/components/PortfolioHistoryPanel";
import SaveToPortfolioModal from "@/components/SaveToPortfolioModal";
import { useSidebarMode } from "@/lib/ui/sidebarMode";
import { usePortfolioSplit } from "@/lib/ui/portfolioLayout";

const newId = () => crypto.randomUUID();

/** 初回チュートリアルを見たかどうかの印 */
const TOUR_SEEN_KEY = "stockanalyzer.tourSeen";

export default function App() {
  const t = useT();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sessions = useChatSessions();
  const activeSessionId = useActiveSessionId();

  const [tabs, setTabs] = useState<WorkspaceTab[]>(INITIAL_TABS);
  const [activeTabId, setActiveTabId] = useState<string>(INITIAL_TABS[0].id);

  const [currentTicker, setCurrentTicker] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("providers");
  // 検討中銘柄をクリックしたときに入力欄へ流し込む値。
  // 同じ銘柄を続けて選べるよう連番を添える
  const [tickerPreset, setTickerPreset] = useState<{ ticker: string; seq: number } | null>(
    null,
  );
  // 検討中銘柄のインポート。ショートカットからも開けるよう App が持つ
  const [candidateImportOpen, setCandidateImportOpen] = useState(false);
  // 使い方を案内するヘルプ AI（最下部バーの「ヘルプ」から開く）
  const [helpOpen, setHelpOpen] = useState(false);
  // 分析結果をどのリストに残すか選ぶダイアログ
  const [savingTicker, setSavingTicker] = useState<string | null>(null);
  // 無料版の上限に達したときに出す案内
  const [limitedTicker, setLimitedTicker] = useState<string | null>(null);
  const [limitReason, setLimitReason] = useState<BlockReason>("tickerLimit");
  const sidebarMode = useSidebarMode();
  const portfolioSplit = usePortfolioSplit();
  // 初回だけ自動で開くチュートリアル。閉じたら印を残して二度と自動表示しない
  const [tourOpen, setTourOpen] = useState(false);

  // 枠ごとの折りたたみ状態。畳んだ枠は描画せず、最上部バーの復元ボタンに退避する
  const slots = useSlots();
  const [collapsedSlots, setCollapsedSlots] = useState<Record<SlotId, boolean>>({
    leftTop: false,
    leftBottom: false,
    right: false,
  });

  const visibleSlots = SLOT_IDS.filter((slot) => !collapsedSlots[slot]);
  // 最後の 1 枚まで畳むと画面が空になるので、それだけは許さない
  const collapseDisabledReason =
    visibleSlots.length <= 1 ? t("app.collapseLast") : null;

  const collapseSlot = (slot: SlotId) => {
    if (collapseDisabledReason !== null) return;
    setCollapsedSlots((prev) => ({ ...prev, [slot]: true }));
  };

  const restoreSlot = (slot: SlotId) => {
    setCollapsedSlots((prev) => ({ ...prev, [slot]: false }));
  };

  // 一次資料が無い状態で分析を実行しようとしたときの確認
  const [confirmingNoDocs, setConfirmingNoDocs] = useState(false);

  const settings = useSettings();
  const settingsError = useSettingsError();
  const analyses = useAnalyses();
  const documents = useStagedDocuments();
  const analysisRuns = useAnalysisRuns();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeTicker = activeTab?.ticker ?? null;
  const activeAnalysis = activeTicker ? analyses[activeTicker] : undefined;
  const activeRun = activeTicker ? analysisRuns[activeTicker] : undefined;

  const llm = settings
    ? providerReadiness(settings, settings.provider)
    : { ready: false, reason: t("app.settingsUnavailable") };

  /**
   * 無料版の枠を確認する。使えるなら使用済みに登録して true を返す。
   *
   * **すでに分析した銘柄は何度でも通す。** 決算のたびに見直す使い方を
   * 妨げないため、数えるのは「銘柄数」であって実行回数ではない。
   */
  const ensureAccess = (ticker: string): boolean => {
    const access = checkAccess(ticker);
    if (!access.allowed) {
      setLimitReason(access.reason);
      setLimitedTicker(ticker.toUpperCase());
      return false;
    }
    void useTicker(ticker);
    return true;
  };

  /**
   * 分析を開始する。
   * 一次資料が 1 件も無いときは、より良い結果が得られる旨を伝えて確認する。
   */
  const handleRunAnalysis = () => {
    if (!activeTicker) return;
    if (!ensureAccess(activeTicker)) return;
    if (documents.length === 0) {
      setConfirmingNoDocs(true);
      return;
    }
    startAnalysis();
  };

  const startAnalysis = () => {
    if (!activeTicker) return;
    void runAnalysis({
      ticker: activeTicker,
      settings,
      fundamentals: activeAnalysis?.fundamentals ?? null,
      quarterly: activeAnalysis?.quarterly ?? null,
      // EDGAR に登録がある銘柄のときだけ本文を取りに行く
      fetchFiling: activeAnalysis?.filing?.status === "ok",
      documents,
    });
  };

  // 起動時に Rust 側から設定と一時保存中の資料を読み込む
  useEffect(() => {
    initFontSize();
    initLocale();
    void loadSettings();
    void loadStagedDocuments();
    void loadChatSessions();
    void loadCandidates();
    void loadPrompts();
    void loadShortcuts();
    void loadAnalystRoles();
    void loadPortfolios();
    void loadArchive();
    void loadLicense();
    // 起動時の更新確認。**見つからなければ何も出さない**（毎回の通知は邪魔になる）
    void checkForUpdate();

    try {
      if (localStorage.getItem(TOUR_SEEN_KEY) !== "1") setTourOpen(true);
    } catch {
      // 読めなくてもアプリは動かす
    }
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      // 保存できなくても動作は続ける
    }
  };

  /** 枠に入っているパネルを描画する。ドラッグで入れ替えられる。 */
  const renderPanel = (slot: SlotId) => {
    const panel: PanelId = slots[slot];
    const onToggleCollapse = () => collapseSlot(slot);

    switch (panel) {
      case "market":
        return (
          <WorkspacePanel
            tab={activeTab}
            analysis={activeAnalysis}
            slot={slot}
            onToggleCollapse={onToggleCollapse}
            collapseDisabledReason={collapseDisabledReason}
            onRetry={(ticker) => void loadTicker(ticker)}
          />
        );
      case "analysis":
        return (
          <AnalysisPanel
            ticker={activeTicker}
            run={activeRun}
            ready={llm.ready}
            readyReason={llm.reason}
            slot={slot}
            onToggleCollapse={onToggleCollapse}
            collapseDisabledReason={collapseDisabledReason}
            onRun={handleRunAnalysis}
            onCancel={() => activeTicker && void cancelAnalysis(activeTicker)}
            onClear={() => activeTicker && void clearAnalysis(activeTicker)}
            onSaveToPortfolio={() => activeTicker && setSavingTicker(activeTicker)}
            analysis={activeAnalysis}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        );
      case "chat":
        return (
          <ChatPanel
            settings={settings}
            ticker={activeTicker}
            slot={slot}
            onToggleCollapse={onToggleCollapse}
            collapseDisabledReason={collapseDisabledReason}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        );
    }
  };

  /**
   * マイポートフォリオ選択時の専有レイアウト。
   *
   * **市場データ・分析結果の枠は出さない。** 過去ログを読みながら
   * AI に聞く画面なので、2 ペインに絞って広く使う。
   */
  const renderPortfolioWorkspace = () => {
    const history = (
      <PortfolioHistoryPanel
        onToggleCollapse={() => {}}
        collapseDisabledReason={t("app.collapsePortfolio")}
      />
    );
    const chat = (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-slate-800">
        <ChatPanel
          settings={settings}
          ticker={activeTicker}
          onToggleCollapse={() => {}}
          collapseDisabledReason={t("app.collapsePortfolio")}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
    );

    return (
      <ResizableSplit
        key={portfolioSplit}
        direction={portfolioSplit === "vertical" ? "vertical" : "horizontal"}
        initialFirstSize={
          portfolioSplit === "vertical"
            ? Math.round(window.innerHeight * 0.5)
            : Math.round(window.innerWidth * 0.45)
        }
        minFirstSize={220}
        minSecondSize={260}
        first={history}
        second={chat}
      />
    );
  };

  /**
   * 本文の分割レイアウトを組み立てる。
   *
   * **畳んだ枠は分割そのものから外す。** 帯として残すと、
   * 残ったパネルが画面いっぱいに広がらず無駄な余白になるため。
   */
  const renderWorkspace = () => {
    const leftOpen = (["leftTop", "leftBottom"] as SlotId[]).filter(
      (slot) => !collapsedSlots[slot],
    );
    const rightOpen = !collapsedSlots.right;

    const pane = (slot: SlotId, className: string) => (
      <div className={className}>{renderPanel(slot)}</div>
    );

    const left =
      leftOpen.length === 2 ? (
        <ResizableSplit
          direction="vertical"
          initialFirstSize={Math.round(window.innerHeight * 0.45)}
          minFirstSize={140}
          minSecondSize={140}
          first={renderPanel("leftTop")}
          second={pane("leftBottom", "flex min-h-0 flex-1 flex-col border-t border-slate-800")}
        />
      ) : leftOpen.length === 1 ? (
        pane(leftOpen[0], "flex min-h-0 min-w-0 flex-1 flex-col")
      ) : null;

    const right = rightOpen
      ? pane("right", "flex min-h-0 min-w-0 flex-1 flex-col border-l border-slate-800")
      : null;

    if (left && right) {
      return (
        <ResizableSplit
          direction="horizontal"
          initialFirstSize={Math.round(window.innerWidth / 2)}
          minFirstSize={280}
          minSecondSize={320}
          first={left}
          second={right}
        />
      );
    }
    // 片方だけのときは分割せず、そのまま 100% を占有させる
    return left ?? right;
  };

  /*
   * ショートカットキーの入り口。割り当ては `shortcutStore` が持ち、
   * 設定画面から変更できる（既定は `SHORTCUTS`）。
   *
   * 入力欄にフォーカスがあるときは、文字入力を奪わないよう
   * `allowInInput` のアクションしか発火させない。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const def = resolveAction(bindingFromEvent(e), inInput);
      if (!def) return;

      e.preventDefault();
      switch (def.action) {
        case "chat.new":
          handleNewChat();
          break;
        case "candidates.add":
          setSidebarCollapsed(false);
          setCandidateImportOpen(true);
          break;
        case "ticker.focus":
          document.querySelector<HTMLInputElement>('input[data-ticker-input="true"]')?.focus();
          break;
        case "analysis.run":
          handleRunAnalysis();
          break;
        case "sidebar.toggle":
          setSidebarCollapsed((v) => !v);
          break;
        case "app.settings":
          setSettingsOpen(true);
          break;
        case "chat.send":
          // 入力欄側で処理する
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // 銘柄タブを開いたら、保存済みの分析結果を復元する。
  // 表示中・実行中の結果があるときは何もしない（restoreAnalysis 側で判定）。
  useEffect(() => {
    if (activeTicker) void restoreAnalysis(activeTicker);
  }, [activeTicker]);

  const handleMenuAction = (action: MenuAction) => {
    if (action === "open-settings") setSettingsOpen(true);
    else if (action === "open-disclaimer") openDisclaimer();
  };

  const handleNewChat = () => {
    void createSession(activeTicker);
  };

  /**
   * 検討中銘柄をクリックしたとき。
   * 上部の入力欄にセットしたうえで、そのまま分析を開始する。
   */
  const handleCandidateSelect = (ticker: string) => {
    setTickerPreset({ ticker, seq: Date.now() });
    handleTickerSubmit(ticker);
  };

  /** ティッカーが確定したら分析タブを開き、YF と SEC の取得を開始する */
  const handleTickerSubmit = (ticker: string) => {
    // データ取得の時点で枠を確認する（4 銘柄目は取得も止める）
    if (!ensureAccess(ticker)) return;

    setCurrentTicker(ticker);

    const existing = tabs.find((t) => t.kind === "analysis" && t.ticker === ticker);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const tab: WorkspaceTab = {
        id: newId(),
        title: ticker,
        kind: "analysis",
        ticker,
        closable: true,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    }

    // 同じ銘柄を再度送信した場合は再取得（更新）になる
    void loadTicker(ticker);
  };

  /**
   * 検討中銘柄で選んだ複数銘柄を比較タブで開く。
   * 同じ組み合わせのタブがあれば作り直さず、そちらへ移る。
   */
  const handleCompare = (tickers: string[]) => {
    const key = tickers.join(",");
    const existing = tabs.find(
      (t) => t.kind === "compare" && (t.tickers ?? []).join(",") === key,
    );
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const tab: WorkspaceTab = {
      id: newId(),
      title: t("app.compareTab", { tickers: tickers.join(" / ") }),
      kind: "compare",
      ticker: null,
      tickers,
      closable: true,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleNewTab = () => {
    const tab: WorkspaceTab = {
      id: newId(),
      title: t("app.workspace"),
      kind: "workspace",
      ticker: null,
      closable: true,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleCloseTab = (id: string) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId && next.length > 0) {
        setActiveTabId(next[Math.min(index, next.length - 1)].id);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-slate-200">
      <MenuBar
        onAction={handleMenuAction}
        right={
          <PanelRestoreBar
            slots={slots}
            collapsedSlots={collapsedSlots}
            onRestore={restoreSlot}
          />
        }
      />

      <CommandBar
        settings={settings}
        onTickerSubmit={handleTickerSubmit}
        tickerPreset={tickerPreset}
        onFiles={(files) => void ingestFiles(files)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <DocumentTray tokenLimit={settings?.maxPromptTokens ?? 180_000} />

      {settingsError && (
        <div className="selectable t-label shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-3 py-1.5 text-amber-300">
          {settingsError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onSelectSession={(id) => void selectSession(id)}
          onRenameSession={(id, title) => void renameSession(id, title)}
          onArchiveSession={(id, archived) => void archiveSession(id, archived)}
          onDeleteSession={(id) => void deleteSession(id)}
          onNewChat={handleNewChat}
          onSelectTicker={handleCandidateSelect}
          candidateImportOpen={candidateImportOpen}
          onCandidateImportOpenChange={setCandidateImportOpen}
          onCompareTickers={handleCompare}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTabId}
            onClose={handleCloseTab}
            onNewTab={handleNewTab}
          />

          {/*
            2 カラム構造。左右の仕切りが画面最下部まで一直線に伸びる。
              左カラム: 上＝市場データ / 下＝対話ウィンドウ
              右カラム: 20項目の分析結果（縦長）
            最小化した枠はここに現れず、残ったパネルが 100% を占有する。
          */}
          {sidebarMode === "portfolio" ? (
            renderPortfolioWorkspace()
          ) : activeTab?.kind === "compare" ? (
            <section className="panel bg-slate-950">
              <ComparePanel
                tickers={activeTab.tickers ?? []}
                onOpenTicker={handleTickerSubmit}
              />
            </section>
          ) : (
            renderWorkspace()
          )}
        </main>
      </div>

      {/* 免責は常時見えるところに置く。クリックで全文が開く */}
      <DisclaimerTicker />

      <StatusBar
        ticker={currentTicker}
        documentCount={documents.length}
        helpOpen={helpOpen}
        onToggleHelp={() => setHelpOpen((v) => !v)}
      />

      <HelpAssistant
        open={helpOpen}
        settings={settings}
        onClose={() => setHelpOpen(false)}
        onOpenSettings={() => {
          setHelpOpen(false);
          setSettingsOpen(true);
        }}
        onOpenTour={() => {
          setHelpOpen(false);
          setTourOpen(true);
        }}
      />

      <WelcomeTour
        open={tourOpen}
        onClose={closeTour}
        onOpenSettings={() => {
          closeTour();
          setSettingsOpen(true);
        }}
        onOpenHelp={() => {
          closeTour();
          setHelpOpen(true);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
      />

      {/* 一次資料が無いまま分析しようとしたときの案内 */}
      <ConfirmDialog
        open={confirmingNoDocs}
        title={t("app.noDocsTitle")}
        message={
          t("app.noDocsBody")
        }
        confirmLabel={t("app.analyzeAnyway")}
        cancelLabel={t("tour.back")}
        onConfirm={() => {
          setConfirmingNoDocs(false);
          startAnalysis();
        }}
        onCancel={() => setConfirmingNoDocs(false)}
      />

      <FreeTierLimitModal
        open={limitedTicker !== null}
        ticker={limitedTicker}
        reason={limitReason}
        onClose={() => setLimitedTicker(null)}
        onOpenLicense={() => {
          setLimitedTicker(null);
          setSettingsOpen(true);
          setSettingsTab("license");
        }}
      />

      <SaveToPortfolioModal
        open={savingTicker !== null}
        ticker={savingTicker}
        onClose={() => setSavingTicker(null)}
      />

      <LegalDisclaimerModal />

      {/* 同意するまで操作を塞ぐ。すべての上に出すため最後に置く */}
      <EulaModal />

      <UpdateModal />

      <ToastHost />
    </div>
  );
}
