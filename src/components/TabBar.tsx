import type { WorkspaceTab } from "@/types";
import { IconClose, IconPlus, IconChart, IconFile, IconMessage } from "@/components/Icons";

interface Props {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

const KIND_ICON = {
  workspace: IconMessage,
  analysis: IconChart,
  document: IconFile,
} as const;

/** Cursor 風のマルチタブバー */
export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }: Props) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-slate-800 bg-slate-900">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const Icon = KIND_ICON[tab.kind];
          return (
            <div
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`group flex h-full min-w-32 max-w-56 shrink-0 cursor-pointer items-center gap-2 border-r border-slate-800 px-3 text-[13px] transition-colors ${
                active
                  ? "border-t-2 border-t-emerald-500 bg-slate-950 pt-0.5 text-slate-100"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${active ? "text-emerald-400" : "text-slate-600"}`}
              />
              <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              {tab.closable ? (
                <button
                  type="button"
                  aria-label={`${tab.title} を閉じる`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  className="rounded p-0.5 text-slate-500 opacity-0 hover:bg-slate-700 hover:text-slate-200 group-hover:opacity-100"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              ) : (
                <span className="w-4" />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNewTab}
        title="新しいタブ (Ctrl+T)"
        className="flex shrink-0 items-center border-l border-slate-800 px-2.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
      >
        <IconPlus className="h-4 w-4" />
      </button>
    </div>
  );
}
