import { useState } from "react";
import type { AppSettings, MarketProviderId } from "@/types";
import {
  marketHealthCheck,
  saveSettings,
  setMarketKey,
} from "@/lib/config/settingsStore";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Props {
  settings: AppSettings | null;
}

interface ProviderMeta {
  id: MarketProviderId;
  /** 注記。利用上の前提をここで必ず伝える */
  note: string;
  recommended?: boolean;
  keyPlaceholder?: string;
  /** キーの取得先 */
  signupUrl?: string;
}

const META: ProviderMeta[] = [
  {
    id: "yahoo",
    note: "※個人利用・デモ用。非公式取得のため将来の動作保証はありません",
  },
  {
    id: "fmp",
    note: "※安定・商用利用に推奨。無料枠あり/有料。別途 FMP 公式サイトにて API キーの取得が必要です",
    recommended: true,
    keyPlaceholder: "FMP の APIキー",
    signupUrl: "https://site.financialmodelingprep.com/developer/docs",
  },
  {
    id: "alphavantage",
    note: "※無料枠あり/有料。別途 Alpha Vantage 公式サイトにて API キーの取得が必要です",
    keyPlaceholder: "Alpha Vantage の APIキー",
    signupUrl: "https://www.alphavantage.co/support/#api-key",
  },
];

/**
 * 市場データの取得元の選択と、取得元ごとの APIキー。
 *
 * **取得元ごとに利用規約と安定性が違う**ため、注記を必ず併記する。
 * キーは Rust 側に保存され、画面にはマスク済み文字列しか戻らない。
 */
export default function MarketProviderSettings({ settings }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MarketProviderId | null>(null);

  if (!settings) {
    return <p className="t-body text-slate-400">設定を読み込んでいます…</p>;
  }

  const statusOf = (id: MarketProviderId) =>
    settings.marketProviders.find((p) => p.id === id);

  const select = async (id: MarketProviderId) => {
    try {
      await saveSettings({ marketProvider: id });
    } catch (e) {
      toastError("データ取得元を切り替えられませんでした", e);
    }
  };

  const saveKey = async (id: MarketProviderId) => {
    const value = (drafts[id] ?? "").trim();
    if (value === "") return;
    try {
      await setMarketKey(id, value);
      setDrafts((prev) => ({ ...prev, [id]: "" }));
      toastSuccess("APIキーを保存しました");
    } catch (e) {
      toastError("APIキーを保存できませんでした", e);
    }
  };

  const check = async (id: MarketProviderId) => {
    setChecking(id);
    try {
      toastSuccess(await marketHealthCheck(id));
    } catch (e) {
      toastError("接続を確認できませんでした", e);
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="t-label leading-relaxed text-slate-500">
        株価・財務指標をどこから取得するかを選びます。
        選んだ取得元は「分析」実行時の指標取得に使われます。
        <br />
        四半期推移（4Q モメンタム）は SEC XBRL との突き合わせが必要なため、
        取得元の選択にかかわらず Yahoo Finance ＋ SEC EDGAR を使います。
      </p>

      {META.map((meta) => {
        const status = statusOf(meta.id);
        const active = settings.marketProvider === meta.id;
        const keyStatus = settings.keys.find((k) => k.provider === `market:${meta.id}`);

        return (
          <div
            key={meta.id}
            className={`rounded-lg border p-3 transition-colors ${
              active
                ? "border-emerald-600 bg-emerald-950/20"
                : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="market-provider"
                checked={active}
                onChange={() => void select(meta.id)}
                className="mt-1 shrink-0 accent-emerald-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="t-body font-medium text-slate-100">
                    {status?.label ?? meta.id}
                  </span>
                  {meta.recommended && (
                    <span className="shrink-0 rounded bg-emerald-600 px-1.5 t-label font-medium text-white">
                      推奨
                    </span>
                  )}
                  {status?.requiresKey && (
                    <span
                      className={`shrink-0 rounded px-1.5 t-label ${
                        keyStatus?.configured
                          ? "bg-slate-700 text-emerald-300"
                          : "bg-amber-950/60 text-amber-300"
                      }`}
                    >
                      {keyStatus?.configured
                        ? `キー設定済み（${keyStatus.masked}）`
                        : "キー未設定"}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block t-label leading-relaxed text-slate-500">
                  {meta.note}
                </span>
              </span>
            </label>

            {status?.requiresKey && (
              <div className="mt-2.5 space-y-2 border-t border-slate-800 pt-2.5">
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block t-label text-slate-500">
                      {status.label} APIキー
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={drafts[meta.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [meta.id]: e.target.value }))
                      }
                      placeholder={
                        keyStatus?.configured ? "変更する場合のみ入力" : meta.keyPlaceholder
                      }
                      className="selectable min-h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveKey(meta.id)}
                    disabled={(drafts[meta.id] ?? "").trim() === ""}
                    className="min-h-8 shrink-0 rounded-md bg-emerald-600 px-3 t-label font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                  >
                    保存
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void check(meta.id)}
                    disabled={!status.ready || checking !== null}
                    title={status.reason ?? "AAPL を 1 件引いて確認します"}
                    className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {checking === meta.id ? "確認中…" : "接続テスト"}
                  </button>
                  {keyStatus?.configured && (
                    <button
                      type="button"
                      onClick={() => setDeleting(meta.id)}
                      className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-400 transition-colors hover:border-red-800 hover:text-red-300"
                    >
                      キーを削除
                    </button>
                  )}
                  {meta.signupUrl && (
                    <span className="selectable t-label text-slate-600">
                      キーの取得: {meta.signupUrl}
                    </span>
                  )}
                </div>

                {!status.ready && (
                  <p className="rounded border border-amber-900/60 bg-amber-950/30 px-2.5 py-1.5 t-label text-amber-300">
                    {status.reason}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={deleting !== null}
        title="APIキーの削除"
        message="登録されているAPIキーを削除しますか？"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        destructive
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void setMarketKey(target, "").catch((e) => toastError("削除できませんでした", e));
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
