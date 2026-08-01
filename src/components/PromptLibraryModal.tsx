import { useEffect, useState } from "react";
import type { StoredPrompt } from "@/types";
import { removePrompt, savePrompt, usePrompts } from "@/lib/prompts/promptLibrary";
import ConfirmDialog from "@/components/ConfirmDialog";
import { IconPersona, IconPlus, IconTrash } from "@/components/Icons";
import ModalShell from "@/components/ModalShell";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 役割（システムプロンプト）ライブラリの管理。追加・編集・削除ができる。 */
export default function PromptLibraryModal({ open, onClose }: Props) {
  const prompts = usePrompts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StoredPrompt | null>(null);

  // 開き直したら編集中の内容は捨てる
  useEffect(() => {
    if (open) startNew();
  }, [open]);

  const startNew = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
  };

  const startEdit = (prompt: StoredPrompt) => {
    setEditingId(prompt.id);
    setTitle(prompt.title);
    setBody(prompt.body);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await savePrompt(editingId, title, body);
      startNew();
    } catch {
      // トーストで通知済み
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="AI の役割ライブラリ"
      icon={<IconPersona className="h-4 w-4 text-emerald-400" />}
      onClose={onClose}
    >
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-[16rem_1fr]">
          {/* ---------------------------------------------- 一覧 */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="t-label font-medium uppercase tracking-wider text-slate-500">
                ストック（{prompts.length}）
              </h3>
              <button
                type="button"
                onClick={startNew}
                className="flex min-h-6 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 t-label text-slate-300 hover:border-emerald-700 hover:text-emerald-300"
              >
                <IconPlus className="h-3 w-3" />
                新規
              </button>
            </div>

            <ul className="space-y-0.5">
              {prompts.map((prompt) => (
                <li key={prompt.id}>
                  <div
                    className={`group flex items-center gap-1 rounded px-2 py-1.5 ${
                      prompt.id === editingId
                        ? "bg-slate-800 text-emerald-300"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => startEdit(prompt)}
                      className="min-w-0 flex-1 truncate text-left t-body"
                    >
                      {prompt.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(prompt)}
                      aria-label={`${prompt.title} を削除`}
                      title="この役割を削除"
                      className="shrink-0 rounded p-1 text-slate-600 opacity-0 hover:bg-red-950/60 hover:text-red-300 group-hover:opacity-100"
                    >
                      <IconTrash className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ---------------------------------------------- 編集 */}
          <div className="min-w-0 space-y-3">
            <h3 className="t-label font-medium uppercase tracking-wider text-slate-500">
              {editingId ? "役割を編集" : "新しい役割"}
            </h3>

            <label className="block">
              <span className="mb-1 block t-label text-slate-500">名前</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                spellCheck={false}
                placeholder="例: 高成長・グロース株アナリスト"
                className="selectable min-h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 t-body text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1 block t-label text-slate-500">
                内容（システムプロンプト。AI の立場・重視する観点・禁止事項を書く）
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                spellCheck={false}
                placeholder="あなたは〜のアナリストです。〜を重視して評価してください。"
                className="selectable w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 t-body leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            <div className="flex justify-end gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={startNew}
                  className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 hover:bg-slate-800"
                >
                  編集をやめる
                </button>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || title.trim() === "" || body.trim() === ""}
                className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                {busy ? "保存中…" : editingId ? "更新" : "追加"}
              </button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={deleting !== null}
          title="この役割を削除しますか？"
          message={`「${deleting?.title ?? ""}」を削除します。\nこの操作は取り消せません。`}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          destructive
          onConfirm={() => {
            if (deleting) {
              if (deleting.id === editingId) startNew();
              void removePrompt(deleting.id);
            }
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
    </ModalShell>
  );
}
