import { useEffect, useState } from "react";
import { saveSettings } from "@/lib/config/settingsStore";
import ModelCombo from "@/components/ModelCombo";
import { modelSuggestions } from "@/lib/config/modelCatalog";
import { IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";
import type { AppSettings } from "@/types";

interface Props {
  settings: AppSettings | null;
}

/**
 * ディベート（批判側）に使うプロバイダとモデルの設定。
 *
 * **メイン分析とは独立して選ぶ。**
 * 同じモデルに自分の出力を批判させても、同じ癖・同じ思い込みがそのまま残る。
 * 別系統にぶつけて初めて、見落としが見落としとして出てくる。
 */
export default function DebateSettings({ settings }: Props) {
  const t = useT();
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProvider(settings?.debate.provider ?? "");
    setModel(settings?.debate.model ?? "");
  }, [settings?.debate.provider, settings?.debate.model]);

  if (!settings) return <p className="t-body text-slate-400">{t("common.loading")}</p>;

  const status = settings.debate;
  const options = [
    { id: "", label: t("debate.sameAsMain") },
    ...settings.keys
      .filter((k) => !k.provider.startsWith("market:"))
      .map((k) => ({ id: k.provider, label: providerLabel(settings, k.provider) })),
  ];

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({ debateProvider: provider, debateModel: model });
    } finally {
      setSaving(false);
    }
  };

  const dirty = provider !== (status.provider ?? "") || model !== (status.model ?? "");

  return (
    <div className="space-y-4">
      <p className="t-body leading-relaxed text-slate-400">{t("debate.settingsIntro")}</p>

      {/* ------------------------------------------------ プロバイダ */}
      <label className="block">
        <span className="mb-1 block t-label text-slate-500">{t("debate.provider")}</span>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            // プロバイダを変えたらモデルは既定へ戻す（別系列のモデル名が残ると必ず失敗する）
            setModel("");
          }}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 t-body text-slate-100"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* ------------------------------------------------ モデル */}
      <label className="block">
        <span className="mb-1 block t-label text-slate-500">{t("debate.model")}</span>
        <ModelCombo
          value={model}
          onChange={setModel}
          suggestions={modelSuggestions(provider === "" ? settings.provider : provider)}
          placeholder={status.effectiveModel}
          ariaLabel={t("debate.model")}
        />
        <span className="mt-1 block t-label text-slate-600">{t("debate.modelHint")}</span>
      </label>

      {/* ------------------------------------------------ いまの状態 */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
        <p className="t-label text-slate-400">
          {t("debate.effective", {
            provider: providerLabel(settings, status.effectiveProvider),
            model: status.effectiveModel,
          })}
        </p>
        {!status.ready && (
          <p className="mt-1.5 flex items-start gap-1.5 t-label text-amber-400">
            <IconWarning className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t("debate.noKey")}</span>
          </p>
        )}
        {status.ready && status.sameAsMain && (
          <p className="mt-1.5 flex items-start gap-1.5 t-label text-amber-400/90">
            <IconWarning className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t("debate.sameWarning")}</span>
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={saving || !dirty}
        onClick={() => void save()}
        className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
      >
        {saving ? t("settings.saving") : t("settings.save")}
      </button>
    </div>
  );
}

/** プロバイダ ID から表示名を引く。カスタムはユーザーが付けたラベルを使う。 */
function providerLabel(settings: AppSettings, id: string): string {
  const custom = settings.customProviders.find((c) => c.id === id);
  if (custom) return custom.label;
  switch (id) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Claude (Anthropic)";
    case "gemini":
      return "Gemini (Google)";
    default:
      return id;
  }
}
