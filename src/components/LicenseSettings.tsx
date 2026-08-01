import { useEffect, useState } from "react";
import {
  activateLicense,
  clearLicense,
  loadLicense,
  useLicense,
} from "@/lib/license/licenseStore";
import { IconBadge } from "@/components/Icons";

/**
 * ライセンス認証（骨組み）。
 *
 * いまはキーの**形式チェックと保存**まで。発行元サーバーへの照会は
 * `license.rs` の `activate` を差し替えればつながる。
 * 生のキーはフロントに持たず、マスク済み文字列だけを表示する。
 */
export default function LicenseSettings() {
  const license = useLicense();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadLicense();
  }, []);

  const activate = async () => {
    setBusy(true);
    try {
      if (await activateLicense(key)) setKey("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
          license.activated
            ? "border-emerald-900/60 bg-emerald-950/25"
            : "border-slate-800 bg-slate-900/50"
        }`}
      >
        <IconBadge
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            license.activated ? "text-emerald-400" : "text-slate-600"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="t-body font-medium text-slate-100">
              {license.activated ? "ライセンス有効" : "未認証"}
            </span>
            {license.masked && (
              <span className="shrink-0 rounded bg-slate-800 px-1.5 font-mono t-label text-slate-300">
                {license.masked}
              </span>
            )}
          </span>
          <span className="mt-0.5 block t-label leading-relaxed text-slate-500">
            {license.message}
          </span>
        </span>
      </div>

      <label className="block">
        <span className="mb-1 block t-label text-slate-500">
          ライセンスキー（購入時にメールで届きます）
        </span>
        <div className="flex items-end gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            onKeyDown={(e) => {
              if (e.key === "Enter") void activate();
            }}
            className="selectable min-h-9 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono t-body uppercase text-slate-100 placeholder:text-slate-600 placeholder:normal-case focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy || key.trim() === ""}
            className="min-h-9 shrink-0 whitespace-nowrap rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy ? "確認中…" : "ライセンス有効化"}
          </button>
        </div>
      </label>

      {license.activated && (
        <button
          type="button"
          onClick={() => void clearLicense()}
          className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-400 transition-colors hover:border-red-800 hover:text-red-300"
        >
          このパソコンのライセンスを解除
        </button>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
        <p className="t-label leading-relaxed text-slate-500">
          キーは OS のアプリ設定ディレクトリに保存され、画面にはマスク済みの文字列しか出ません。
          <br />
          いまは形式の確認のみを行っています（オフライン）。
          発行元サーバーでの照会はこの後の対応です。
        </p>
      </div>
    </div>
  );
}
