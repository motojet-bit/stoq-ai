import {
  apiKeyGuide,
  apiKeyGuidePlainText,
  OPENAI_BILLING_URL,
  OPENAI_KEYS_URL,
  OPENAI_LIMITS_URL,
} from "@/lib/help/apiKeyGuide";
import { toastSuccess } from "@/lib/ui/toastStore";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  /** 設定画面（APIキー・モデルタブ）を開く */
  onOpenSettings: () => void;
}

/**
 * APIキーの取得と設定のガイド。
 *
 * **AI に聞かなくても読めるようにする。** キーが未設定のうちは
 * ヘルプ AI 自体が動かないので、いちばん必要な案内を AI 越しにしか
 * 出せないと、詰まった人を助けられない。
 */
export default function ApiKeyGuide({ onOpenSettings }: Props) {
  const t = useT();
  const guide = apiKeyGuide();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKeyGuidePlainText());
      toastSuccess(t("apiGuide.copied"));
    } catch {
      // コピーできなくても本文は読めるので黙って諦める
    }
  };

  return (
    <div className="space-y-4">
      {/* なぜ必要か */}
      <section>
        <h3 className="mb-1.5 t-body font-semibold text-slate-100">{guide.why.title}</h3>
        <ul className="space-y-1.5">
          {guide.why.points.map((point) => (
            <li
              key={point}
              className="selectable rounded border border-slate-800 bg-slate-900/50 px-2.5 py-2 t-label leading-relaxed text-slate-300"
            >
              {point}
            </li>
          ))}
        </ul>
      </section>

      {/* 取得の 5 ステップ */}
      <section>
        <h3 className="mb-1.5 t-body font-semibold text-slate-100">
          {t("apiGuide.steps.title")}
        </h3>
        <ol className="space-y-2">
          {guide.steps.map((step, i) => (
            <li key={step.id} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-900/60 font-mono t-label text-emerald-300">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block t-label font-medium text-slate-200">{step.title}</span>
                <span className="selectable mt-0.5 block t-label leading-relaxed text-slate-400">
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <GuideLink href={OPENAI_KEYS_URL}>{t("apiGuide.openKeys")}</GuideLink>
          <GuideLink href={OPENAI_BILLING_URL}>{t("apiGuide.openBilling")}</GuideLink>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2.5 py-1 t-label text-emerald-300 transition-colors hover:bg-emerald-900/40"
          >
            {t("settings.tab.providers")}
          </button>
        </div>
      </section>

      {/* 使いすぎ防止 */}
      <section className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2.5">
        <h3 className="mb-1 t-body font-semibold text-amber-200">💡 {guide.limit.title}</h3>
        <p className="selectable t-label leading-relaxed text-amber-100/80">{guide.limit.body}</p>
        <div className="mt-2">
          <GuideLink href={OPENAI_LIMITS_URL}>{t("apiGuide.openLimits")}</GuideLink>
        </div>
      </section>

      {/* トラブルシューティング */}
      <section>
        <h3 className="mb-1.5 t-body font-semibold text-slate-100">{guide.trouble.title}</h3>
        <ul className="space-y-1.5">
          {guide.trouble.items.map((item) => (
            <li
              key={item.code}
              className="rounded border border-slate-800 bg-slate-900/50 px-2.5 py-2"
            >
              <span className="font-mono t-label text-red-300">Error {item.code}</span>
              <p className="selectable mt-0.5 t-label leading-relaxed text-slate-300">
                {item.cause}
              </p>
              <p className="selectable mt-0.5 t-label leading-relaxed text-emerald-300/80">
                → {item.fix}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={() => void copy()}
        className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
      >
        {t("apiGuide.copy")}
      </button>
    </div>
  );
}

/** 外部リンク。既定のブラウザで開く。 */
function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="rounded-full border border-slate-700 px-2.5 py-1 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
    >
      {children} ↗
    </a>
  );
}
