import { useEffect, useState } from "react";
import type { ChatSession, DroppedDocument, WorkspaceTab } from "@/types";
import { INITIAL_TABS, SAMPLE_SESSIONS } from "@/lib/sampleData";
import { loadSettings, useSettings, useSettingsError } from "@/lib/config/settingsStore";

import MenuBar, { type MenuAction } from "@/components/MenuBar";
import CommandBar from "@/components/CommandBar";
import Sidebar from "@/components/Sidebar";
import TabBar from "@/components/TabBar";
import WorkspacePanel from "@/components/WorkspacePanel";
import SplitPane from "@/components/SplitPane";
import AnalysisPanel from "@/components/AnalysisPanel";
import ChatPanel from "@/components/ChatPanel";
import StatusBar from "@/components/StatusBar";
import SettingsModal from "@/components/SettingsModal";

const newId = () => crypto.randomUUID();

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(SAMPLE_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    SAMPLE_SESSIONS[0]?.id ?? null,
  );

  const [tabs, setTabs] = useState<WorkspaceTab[]>(INITIAL_TABS);
  const [activeTabId, setActiveTabId] = useState<string>(INITIAL_TABS[0].id);

  const [documents, setDocuments] = useState<DroppedDocument[]>([]);
  const [currentTicker, setCurrentTicker] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settings = useSettings();
  const settingsError = useSettingsError();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // 起動時に Rust 側から設定を読み込む
  useEffect(() => {
    void loadSettings();
  }, []);

  // Ctrl+B でサイドバー開閉 / Ctrl+, で設定
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey) return;
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleMenuAction = (action: MenuAction) => {
    if (action === "open-settings") setSettingsOpen(true);
  };

  const handleNewChat = () => {
    const session: ChatSession = {
      id: newId(),
      title: "新しいチャット",
      ticker: null,
      updatedLabel: "たった今",
    };
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
  };

  /** ティッカーが確定したら、その銘柄の分析タブを開く */
  const handleTickerSubmit = (ticker: string) => {
    setCurrentTicker(ticker);

    const existing = tabs.find((t) => t.kind === "analysis" && t.ticker === ticker);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const tab: WorkspaceTab = {
      id: newId(),
      title: ticker,
      kind: "analysis",
      ticker,
      closable: true,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleNewTab = () => {
    const tab: WorkspaceTab = {
      id: newId(),
      title: "ワークスペース",
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

  const handleAddDocuments = (files: File[]) => {
    if (files.length === 0) return;
    setDocuments((prev) => [
      ...prev,
      ...files.map((f) => ({ id: newId(), name: f.name, size: f.size })),
    ]);
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-slate-200">
      <MenuBar onAction={handleMenuAction} />

      <CommandBar
        settings={settings}
        documents={documents}
        onTickerSubmit={handleTickerSubmit}
        onAddDocuments={handleAddDocuments}
        onRemoveDocument={handleRemoveDocument}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {settingsError && (
        <div className="selectable shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-3 py-1.5 text-[12px] text-amber-300">
          {settingsError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onSelectSession={setActiveSessionId}
          onNewChat={handleNewChat}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTabId}
            onClose={handleCloseTab}
            onNewTab={handleNewTab}
          />

          <SplitPane
            top={<WorkspacePanel tab={activeTab} />}
            bottom={
              <div className="flex h-full">
                <div className="min-w-0 flex-1">
                  <AnalysisPanel />
                </div>
                <div className="min-w-0 flex-1">
                  <ChatPanel
                    settings={settings}
                    onOpenSettings={() => setSettingsOpen(true)}
                  />
                </div>
              </div>
            }
          />
        </main>
      </div>

      <StatusBar ticker={currentTicker} documentCount={documents.length} />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
