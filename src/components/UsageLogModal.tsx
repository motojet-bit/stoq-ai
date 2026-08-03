import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import {
  clearUsageLog,
  loadUsageLog,
  useUsageLoading,
  useUsageLog,
} from "@/lib/usage/usageStore";
import { costOf, toUsageCsv, totalUsage } from "@/lib/usage/usageLog";
import { formatJpy, formatTokens, formatUsd } from "@/lib/llm/cost";
import ModalShell from "@/components/ModalShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { IconChart, IconDownload, IconTrash } from "@/components/Icons";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 分析の実行ログと消費トークンの一覧。
 *
 * **中断・エラーの実行も並べる。** そこまでのトークンは実際に払っているので、
 * 完走したものだけ数えると、請求額と噛み合わない。
 */
export default function UsageLogModal({ open, onClose }: Props) {
  const t = useT();
  const entries = useUsageLog();
  const loading = useUsageLoading();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) void loadUsageLog();
  }, [open]);

  const totals = useMemo(() => totalUsage(entries), [entries]);

  const header = [
    t("usageLog.col.time"),
    t("usageLog.col.ticker"),
    "provider",
    "model",
    t("usageLog.col.role"),
    t("usageLog.col.input"),
    t("usageLog.col.output"),
    t("usageLog.col.total"),
    "USD",
    "JPY",
    t("usageLog.col.status"),
  ];

  const exportCsv = async () => {
    if (!isTauri()) return;
    try {
      const path = await invoke<string>("export_write_file", {
        fileName: `stoq-usage_${new Date().toISOString().slice(0, 10)}.csv`,
        contents: toUsageCsv(entries, header),
      });
      toastSuccess(t("toast.export.done"), path);
    } catch (e) {
      toastError(t("toast.export.failed"), e);
    }
  };

  const statusLabel = (status: string) =>
    status === "done"
      ? t("usageLog.status.done")
      : status === "cancelled"
        ? t("usageLog.status.cancelled")
        : t("usageLog.status.error");

  return (
    <ModalShell
      open={open}
      title={t("usageLog.title")}
      icon={<IconChart className="h-4 w-4 text-emerald-400" />}
      maxWidthClass="max-w-5xl"
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="t-label text-slate-600">{t("usageLog.note")}</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={entries.length === 0}
              className="flex min-h-8 items-center gap-1.5 rounded-md border border-slate-700 px-3 t-body text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
            >
              <IconDownload className="h-3.5 w-3.5" />
              {t("usageLog.exportCsv")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={entries.length === 0}
              className="flex min-h-8 items-center gap-1.5 rounded-md border border-slate-700 px-3 t-body text-slate-300 transition-colors hover:border-red-800 hover:text-red-300 disabled:opacity-40"
            >
              <IconTrash className="h-3.5 w-3.5" />
              {t("usageLog.clear")}
            </button>
          </div>
        </footer>
      }
    >
      <div className="px-4 py-3">
        {/* ------------------------------------------------ 累計 */}
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Total label={t("usageLog.runs")} value={String(totals.count)} />
          <Total label={t("usageLog.totalTokens")} value={formatTokens(totals.totalTokens)} />
          <Total
            label={t("usageLog.totalCost")}
            value={`${formatJpy(totals.jpy)} (${formatUsd(totals.usd)})`}
          />
        </div>

        {/* 金額に含めなかった件数は隠さない（実際より安く見せない） */}
        {totals.unpricedCount > 0 && (
          <p className="mb-3 t-label text-amber-400/90">
            {t("usageLog.unpriced", { count: totals.unpricedCount })}
          </p>
        )}

        {loading ? (
          <p className="t-body text-slate-500">{t("common.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="t-body text-slate-500">{t("usageLog.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-900/70">
                  {[
                    t("usageLog.col.time"),
                    t("usageLog.col.ticker"),
                    t("usageLog.col.model"),
                    t("usageLog.col.role"),
                    t("usageLog.col.input"),
                    t("usageLog.col.output"),
                    t("usageLog.col.total"),
                    t("usageLog.col.cost"),
                    t("usageLog.col.status"),
                  ].map((label, i) => (
                    <th
                      key={label}
                      className={`whitespace-nowrap border-b border-slate-800 px-2 py-1 t-label font-medium text-slate-400 ${
                        i >= 4 && i <= 7 ? "text-right" : "text-left"
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const cost = costOf(entry);
                  const total = entry.inputTokens + entry.outputTokens;
                  return (
                    <tr key={entry.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="whitespace-nowrap px-2 py-1 t-label text-slate-500">
                        {new Date(entry.savedAtMs).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 font-mono t-label font-medium text-emerald-300">
                        {entry.ticker}
                      </td>
                      <td className="max-w-56 truncate px-2 py-1 t-label text-slate-400">
                        {entry.provider ?? "—"} / {entry.model ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 t-label text-slate-500">
                        {entry.roleId ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono t-label text-slate-400">
                        {entry.inputTokens.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right font-mono t-label text-slate-400">
                        {entry.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right font-mono t-label text-slate-200">
                        {total.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right font-mono t-label text-slate-300">
                        {cost.unknownModel ? "—" : formatJpy(cost.jpy)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1 t-label ${
                          entry.status === "done"
                            ? "text-emerald-400"
                            : entry.status === "cancelled"
                              ? "text-slate-500"
                              : "text-red-400"
                        }`}
                      >
                        {statusLabel(entry.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={t("usageLog.clearTitle")}
        message={t("usageLog.clearBody")}
        confirmLabel={t("usageLog.clear")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          setConfirming(false);
          void clearUsageLog();
        }}
        onCancel={() => setConfirming(false)}
      />
    </ModalShell>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <p className="t-label text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono t-heading font-semibold text-slate-100">{value}</p>
    </div>
  );
}
