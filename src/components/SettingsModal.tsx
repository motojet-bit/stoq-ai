import { useEffect, useState } from "react";
import type { AppSettings, ProviderId } from "@/types";
import { PROVIDERS } from "@/lib/config/providers";
import { saveSettings, setApiKey } from "@/lib/config/settingsStore";
import { IconClose, IconKey } from "@/components/Icons";

interface Props {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
}

/**
 * APIキー・モデル・SEC User-Agent の設定モーダル。
 *
 * 入力された APIキーは Rust 側へ渡してディスクに保存し、
 * 画面にはマスク済み文字列だけが戻ってくる。
 */
export default function SettingsModal({ open, settings, onClose }: Props) {
  // 未保存の入力値。プロバイダ ID をキーにする。
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState("");
  const [secUserAgent, setSecUserAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // モーダルを開いた時点の設定値を入力欄の初期値にする
  useEffect(() => {
    if (!open || !settings) return;
    setKeyDrafts({});
    setModelDrafts({ ...settings.models });
    setBaseUrl(settings.customBaseUrl);
    setSecUserAgent(settings.secUserAgent);
    setError(null);
    setSavedAt(null);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelectProvider = async (provider: ProviderId) => {
    setError(null);
    try {
      await saveSettings({ provider });
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      // 入力されたキーだけを個別に保存する
      for (const [provider, value] of Object.entries(keyDrafts)) {
        if (value.trim().length > 0) {
          await setApiKey(provider as ProviderId, value);
        }
      }
      await saveSettings({
        models: modelDrafts,
        customBaseUrl: baseUrl,
        secUserAgent,
      });
      setKeyDrafts({});
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClearKey = async (provider: ProviderId) => {
    setError(null);
    try {
      await setApiKey(provider, "");
      setKeyDrafts((prev) => ({ ...prev, [provider]: "" }));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4">
          <div className="flex items-center gap-2">
            <IconKey className="h-4 w-4 text-emerald-400" />
            <h2 className="text-[14px] font-semibold text-slate-100">設定</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="設定を閉じる"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!settings ? (
            <p className="text-[13px] text-slate-400">設定を読み込んでいます…</p>
          ) : (
            <>
              <section className="mb-5">
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-slate-500">
                  使用するプロバイダ
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map((p) => {
                    const active = settings.provider === p.id;
                    const configured = settings.keys.find(
                      (k) => k.provider === p.id,
                    )?.configured;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProvider(p.id)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                          active
                            ? "border-emerald-500 bg-emerald-950/60 text-emerald-200"
                            : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            configured ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                        />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mb-5 space-y-3">
                <h3 className="text-[12px] font-medium uppercase tracking-wider text-slate-500">
                  APIキーとモデル
                </h3>

                {PROVIDERS.map((p) => {
                  const status = settings.keys.find((k) => k.provider === p.id);
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-slate-200">
                          {p.label}
                        </span>
                        {status?.configured ? (
                          <span className="flex items-center gap-2 text-[11px] text-emerald-400">
                            <span className="font-mono">{status.masked}</span>
                            <button
                              type="button"
                              onClick={() => handleClearKey(p.id)}
                              className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-400 hover:border-red-800 hover:text-red-300"
                            >
                              削除
                            </button>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-600">未設定</span>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] text-slate-500">
                            APIキー（{p.keySource}）
                          </span>
                          <input
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            value={keyDrafts[p.id] ?? ""}
                            onChange={(e) =>
                              setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            placeholder={
                              status?.configured ? "変更する場合のみ入力" : p.keyPlaceholder
                            }
                            className="selectable h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-[11px] text-slate-500">
                            モデル名（{p.modelHint}）
                          </span>
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={modelDrafts[p.id] ?? ""}
                            onChange={(e) =>
                              setModelDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="selectable h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono text-[12px] text-slate-100 focus:border-emerald-500 focus:outline-none"
                          />
                        </label>
                      </div>

                      {p.needsBaseUrl && (
                        <label className="mt-2 block">
                          <span className="mb-1 block text-[11px] text-slate-500">
                            Base URL（末尾の /chat/completions は不要）
                          </span>
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="https://api.deepseek.com/v1"
                            className="selectable h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                          />
                        </label>
                      )}

                      {p.id === "anthropic" && (
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                          Claude Opus 5 では <code className="text-slate-400">temperature</code>{" "}
                          が廃止されているため送信しません。出力の深さは{" "}
                          <code className="text-slate-400">effort</code> で制御しています。
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>

              <section className="mb-2">
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-slate-500">
                  SEC EDGAR
                </h3>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500">
                    User-Agent（「アプリ名 メールアドレス」形式。SEC が必須としています）
                  </span>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={secUserAgent}
                    onChange={(e) => setSecUserAgent(e.target.value)}
                    placeholder="StockAnalyzer you@example.com"
                    className="selectable h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                </label>
              </section>

              {error && (
                <p className="selectable mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-[12px] leading-relaxed text-red-300">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4">
          <span className="text-[11px] text-slate-600">
            {savedAt
              ? `保存しました（${savedAt}）`
              : "APIキーは OS のアプリ設定ディレクトリに保存され、画面には表示されません。"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-slate-700 px-3.5 text-[13px] text-slate-300 hover:bg-slate-800"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !settings}
              className="h-8 rounded-md bg-emerald-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
