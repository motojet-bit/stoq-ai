/**
 * ポリシーページ（利用規約 / プライバシー / 返金）を組み立てる。
 *
 * **3 枚に同じ枠を手で書き写さない。** ヘッダー・フッター・言語切替は
 * どのページでも同じで、直すたびに 3 か所を触ることになる。
 * 中身だけを持ち、枠はここが被せる。
 *
 *   node lp/build-policy.mjs
 *
 * 出力先は lp/terms.html / lp/privacy.html / lp/refund.html。
 * **生成物もコミットする**（GitHub Pages は静的ファイルしか配れないため）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 問い合わせ先。**1 か所で持つ**（散らすと直し漏れる） */
const SUPPORT_EMAIL = "superpuzanoza@gmail.com";

/**
 * 販売者。
 *
 * **Lemon Squeezy の登録名と綴りを揃えること。** 食い違うと、
 * 決済画面と本サイトで「誰が売っているのか」が別人に見える。
 *
 * **住所は載せない。** 記載の代わりに「請求があれば遅滞なく開示する」と書く。
 * 個人の住所を常時公開する必要はないが、問われたときに答えられる状態にはしておく。
 */
const SELLER_NAME = "SAENGDAO HASUDA";
/** 屋号。製品名と同じにしてある（アプリ・LP と綴りを揃えること） */
const TRADE_NAME = "StoQ AI Analyzer";
/** 最終更新日。文面を直したらここも直す */
const UPDATED = "2026-08-05";

/**
 * 枠。
 *
 * **`index.html` と同じ見た目にする。** 別デザインのページへ飛ぶと、
 * 同じ製品のものか一瞬迷う。言語切替の仕組みもそのまま持ち込む。
 */
function page({ slug, titleEn, titleJa, leadEn, leadJa, body }) {
  return `<!doctype html>
<html lang="en" class="scroll-smooth">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${titleEn} — StoQ AI Analyzer</title>
    <meta name="robots" content="index,follow" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      html[lang="en"] [data-ja] { display: none; }
      html[lang="ja"] [data-en] { display: none; }
    </style>
  </head>
  <body class="bg-slate-950 font-sans text-slate-200 antialiased">
    <header class="border-b border-slate-900 bg-slate-950/90 backdrop-blur">
      <div class="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
        <a href="./index.html" class="text-sm font-semibold text-slate-100">
          StoQ AI Analyzer
        </a>
        <a
          href="./index.html"
          class="ml-auto rounded-md px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:text-slate-100"
        >
          <span data-en>&larr; Back to the site</span><span data-ja>&larr; トップへ戻る</span>
        </a>
        <button
          type="button"
          id="lang-toggle"
          class="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
          aria-label="Switch language"
        >
          <span data-en>🇯🇵 日本語</span><span data-ja>🇺🇸 English</span>
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-5 py-12">
      <h1 class="text-2xl font-semibold text-slate-50">
        <span data-en>${titleEn}</span><span data-ja>${titleJa}</span>
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-slate-400">
        <span data-en>${leadEn}</span><span data-ja>${leadJa}</span>
      </p>
      <p class="mt-1 text-xs text-slate-600">
        <span data-en>Last updated: ${UPDATED}</span><span data-ja>最終更新日: ${UPDATED}</span>
      </p>

      <div class="mt-10 space-y-8">
${body}
      </div>

      <div
        class="mt-12 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-sm leading-relaxed text-slate-400"
      >
        <p class="mb-1 font-medium text-slate-300">
          <span data-en>Questions?</span><span data-ja>お問い合わせ</span>
        </p>
        <p>
          <a href="mailto:${SUPPORT_EMAIL}" class="text-emerald-400 hover:text-emerald-300">
            ${SUPPORT_EMAIL}
          </a>
        </p>
        <p class="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-500">
          <span data-en>
            Published by ${SELLER_NAME}, trading as ${TRADE_NAME}.
            Sold through Lemon Squeezy (merchant of record).
            Business address disclosed on request.
          </span>
          <span data-ja>
            提供: ${SELLER_NAME}（屋号: ${TRADE_NAME}）／
            販売: Lemon Squeezy（Merchant of Record）／
            所在地はご請求に応じて開示いたします。
          </span>
        </p>
      </div>
    </main>

    <footer class="border-t border-slate-900 bg-slate-950 py-10">
      <div
        class="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-5 text-xs text-slate-500 sm:flex-row"
      >
        <p>&copy; 2026 StoQ AI Analyzer. All Rights Reserved.</p>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="./terms.html" class="transition-colors hover:text-slate-300">
            <span data-en>Terms</span><span data-ja>利用規約</span>
          </a>
          <a href="./privacy.html" class="transition-colors hover:text-slate-300">
            <span data-en>Privacy</span><span data-ja>プライバシー</span>
          </a>
          <a href="./refund.html" class="transition-colors hover:text-slate-300">
            <span data-en>Refunds</span><span data-ja>返金について</span>
          </a>
          <a href="mailto:${SUPPORT_EMAIL}" class="transition-colors hover:text-slate-300">
            <span data-en>Contact</span><span data-ja>お問い合わせ</span>
          </a>
        </div>
      </div>
    </footer>

    <script>
      (function () {
        var root = document.documentElement;
        var stored = null;
        try {
          stored = localStorage.getItem("stoq.lp.lang");
        } catch (e) {}
        root.lang =
          stored || ((navigator.language || "en").toLowerCase().indexOf("ja") === 0 ? "ja" : "en");
        document.getElementById("lang-toggle").addEventListener("click", function () {
          var next = root.lang === "ja" ? "en" : "ja";
          root.lang = next;
          try {
            localStorage.setItem("stoq.lp.lang", next);
          } catch (e) {}
        });
      })();
    </script>
  </body>
</html>
`;
}

/** 節 1 つ。見出しと段落を日英で持つ */
function section(headingEn, headingJa, paragraphs) {
  const body = paragraphs
    .map(
      ([en, ja]) => `          <p class="mt-3 text-sm leading-relaxed text-slate-300" data-en>${en}</p>
          <p class="mt-3 text-sm leading-relaxed text-slate-300" data-ja>${ja}</p>`,
    )
    .join("\n");
  return `        <section>
          <h2 class="text-base font-semibold text-emerald-300">
            <span data-en>${headingEn}</span><span data-ja>${headingJa}</span>
          </h2>
${body}
        </section>`;
}

// ---------------------------------------------------------------- 利用規約

const terms = page({
  slug: "terms",
  titleEn: "Terms of Use",
  titleJa: "利用規約",
  leadEn: "Please read these terms before purchasing or using StoQ AI Analyzer.",
  leadJa: "StoQ AI Analyzer をご購入・ご利用になる前にお読みください。",
  body: [
    section("1. Not investment advice", "1. 投資助言ではありません", [
      [
        "StoQ AI Analyzer is a research-support tool. It does not provide investment advice and is not a solicitation to buy or sell any security. The &ldquo;fundamental assessment&rdquo; and &ldquo;overall call&rdquo; it produces are AI-generated output based on the data you supply; no warranty is made as to accuracy, completeness or future performance.",
        "本アプリはリサーチ支援ツールであり、投資助言を行うものではありません。特定の有価証券の売買を推奨・勧誘するものでもありません。表示される「ファンダメンタル評価」「総合投資判断」は、入力されたデータに基づく AI の生成物であり、正確性・完全性・将来の運用成果を保証するものではありません。",
      ],
      [
        "All investment decisions, and any resulting gains or losses, are yours alone. The developer accepts no liability.",
        "投資の最終判断およびその結果生じる損益は、すべてお客様ご自身に帰属します。開発者は一切の責任を負いません。",
      ],
    ]),
    section("2. Your API keys and their cost", "2. APIキーと利用料", [
      [
        "This app uses a bring-your-own-key model. You obtain and configure the AI and market-data API keys yourself, and the providers bill you directly. The app never charges you per use.",
        "本アプリは BYOK（Bring Your Own Key）方式です。AI および市場データの APIキーはお客様ご自身で取得・設定していただき、利用料は各提供元からお客様へ直接請求されます。本アプリから従量課金を行うことはありません。",
      ],
      [
        "Individual technical support for obtaining or configuring API keys is not provided.",
        "APIキーの取得・設定手順についての個別技術サポートは提供いたしません。",
      ],
      [
        "Creating a new API key dedicated to this app is strongly recommended, so that usage and cost stay easy to track.",
        "本アプリ専用の新規 APIキーを作成することを強く推奨します。利用量と費用を切り分けて把握できるようになります。",
      ],
    ]),
    section("3. Licence", "3. ライセンス", [
      [
        "The licence key is for the purchaser&rsquo;s own use. Transferring, lending, sharing or reselling it to a third party is prohibited.",
        "ライセンスキーは購入者ご本人のみがご利用いただけます。第三者への譲渡・貸与・共有・再販は禁止されています。",
      ],
      [
        "This is a one-time purchase, not a subscription. There is no recurring charge and nothing to cancel.",
        "本製品は買い切り型であり、サブスクリプションではありません。継続課金は発生せず、解約手続きも不要です。",
      ],
    ]),
    section("4. Beta status and updates", "4. β版であることと、今後の更新", [
      [
        "This app is distributed as a paid beta. The core features shown on this site are verified to work, but it is not guaranteed to be free of bugs. Fixes and improvements ship as free minor updates.",
        "本アプリは有料β版として配布しています。本サイトで紹介している主要機能は動作確認済みですが、不具合が皆無であることを保証するものではありません。修正・改善は無料のマイナーアップデートとして提供します。",
      ],
      [
        "A future major update may be offered as a paid upgrade, at a preferential price for existing users (for example, the difference in price). Ordinary bug fixes and minor updates remain free.",
        "将来の大規模なメジャーアップデートについては、既存ユーザー向けの特別価格（差額等）での有償アップグレードとなる場合があります。通常の不具合修正およびマイナーアップデートは無料です。",
      ],
      [
        "The interface is currently available in Japanese and English only.",
        "対応インターフェース言語は、現時点では日本語および英語のみです。",
      ],
    ]),
    section("5. Dependence on external services", "5. 外部サービスへの依存", [
      [
        "This app relies on external APIs (LLM providers, market data, SEC EDGAR). If a provider changes its specification, restricts access or discontinues a service, some features may be limited or stop working without notice.",
        "本アプリは外部の API（LLM 提供元・市場データ・SEC EDGAR 等）に依存しています。提供元の仕様変更・アクセス制限・サービス終了により、一部機能が予告なく制限される、または利用できなくなる場合があります。",
      ],
    ]),
    section("6. Seller", "6. 販売者", [
      [
        `This product is developed and published by <strong>${SELLER_NAME}</strong>, trading as <strong>${TRADE_NAME}</strong>.`,
        `本製品は <strong>${SELLER_NAME}</strong>（屋号: <strong>${TRADE_NAME}</strong>）が開発・提供しています。`,
      ],
      [
        `Payments are handled by Lemon Squeezy, which acts as the merchant of record. Your contract of sale is with Lemon Squeezy; your receipt and card statement will show them, not the developer.`,
        `決済は Lemon Squeezy を通じて行われ、同社が Merchant of Record（記録上の販売者）となります。売買契約の相手方は Lemon Squeezy であり、領収書やカードの明細には開発者ではなく同社が表示されます。`,
      ],
      [
        `The seller&rsquo;s business address is not published here; it will be disclosed without delay on request to ${SUPPORT_EMAIL}. For questions about the app itself, use the same address.`,
        `販売者の所在地は本サイトには掲載していませんが、${SUPPORT_EMAIL} へご請求いただければ遅滞なく開示いたします。アプリ自体に関するお問い合わせも同じ窓口で承ります。`,
      ],
    ]),
  ].join("\n\n"),
});

// ---------------------------------------------------------------- プライバシー

const privacy = page({
  slug: "privacy",
  titleEn: "Privacy Policy",
  titleJa: "プライバシーポリシー",
  leadEn:
    "Short version: the developer runs no server and collects nothing. Everything stays on your machine.",
  leadJa:
    "要点: 開発者はサーバを持たず、いかなる情報も収集していません。データはお客様の PC 内に留まります。",
  body: [
    section("1. What the developer collects", "1. 開発者が収集する情報", [
      [
        "Nothing. This app has no analytics, no telemetry and no crash reporting. There is no developer-operated server for it to send anything to.",
        "ありません。本アプリにはアクセス解析・利用統計・クラッシュレポートのいずれも組み込まれていません。送信先となる開発者のサーバも存在しません。",
      ],
      [
        "Licence activation is performed offline, on your machine. Your licence key is not transmitted to the developer.",
        "ライセンス認証はお客様の PC 内でオフラインに行われます。ライセンスキーが開発者へ送信されることはありません。",
      ],
    ]),
    section("2. Where your data is stored", "2. データの保存場所", [
      [
        "Analyses, chat history, notes, staged documents and settings are stored in a local database on your PC. API keys are stored in your operating system&rsquo;s application-settings directory and are shown on screen only as a masked string.",
        "分析結果・対話履歴・メモ・一時保存した資料・設定は、お客様の PC 内のローカルデータベースに保存されます。APIキーは OS のアプリ設定ディレクトリに保存され、画面にはマスクされた文字列のみが表示されます。",
      ],
      [
        "None of this is sent to the developer. Uninstalling the app or deleting its data directory removes it.",
        "これらが開発者へ送信されることはありません。アプリのアンインストール、またはデータディレクトリの削除により消去できます。",
      ],
    ]),
    section("3. Where your data does go", "3. 外部へ送信される先", [
      [
        "To make the app work, it talks directly to the following third parties. These requests go from your machine to the service; they do not pass through the developer.",
        "機能の提供のため、本アプリは以下の第三者と直接通信します。通信はお客様の PC から各サービスへ直接行われ、開発者を経由しません。",
      ],
      [
        "<strong>AI providers</strong> &mdash; OpenAI, Anthropic, Google (Gemini), or any OpenAI-compatible provider you add. The app sends the prompt, the market data and any documents you attached. Each provider&rsquo;s own privacy policy applies.",
        "<strong>AI 提供元</strong> &mdash; OpenAI / Anthropic / Google (Gemini)、およびお客様が追加した OpenAI 互換プロバイダ。プロンプト・市場データ・添付された資料が送信されます。各社のプライバシーポリシーが適用されます。",
      ],
      [
        "<strong>Market and filing data</strong> &mdash; Yahoo Finance, SEC EDGAR, and (if you choose them) Financial Modeling Prep or Alpha Vantage. The app sends the ticker symbol and, for SEC EDGAR, the User-Agent string you configured.",
        "<strong>市場データ・開示資料</strong> &mdash; Yahoo Finance / SEC EDGAR、およびお客様が選択した場合は Financial Modeling Prep / Alpha Vantage。銘柄コードと、SEC EDGAR についてはお客様が設定した User-Agent が送信されます。",
      ],
      [
        "<strong>Google Drive</strong> &mdash; only if you connect it. The app requests the <code>drive.appdata</code> scope only, which can read and write nothing but its own backup file. It cannot see your other files.",
        "<strong>Google Drive</strong> &mdash; お客様が連携した場合のみ。要求するのは <code>drive.appdata</code> スコープのみで、本アプリ自身のバックアップファイル以外は読み書きできません。お客様の他のファイルは参照できません。",
      ],
    ]),
    section("4. Payment information", "4. 決済情報", [
      [
        "Payment is processed by Lemon Squeezy. Your card details are handled by Lemon Squeezy and are never obtained or held by the developer.",
        "決済は Lemon Squeezy を通じて処理されます。クレジットカード情報等は Lemon Squeezy が取り扱い、開発者が取得・保持することはありません。",
      ],
    ]),
    section("5. This website", "5. 本サイトについて", [
      [
        "This site is a static page hosted on GitHub Pages. It sets no tracking cookies and runs no analytics. Your language preference is kept in your browser&rsquo;s local storage and never leaves your device.",
        "本サイトは GitHub Pages 上の静的ページです。トラッキング Cookie もアクセス解析も使用していません。言語設定はブラウザのローカルストレージに保存され、お客様の端末から出ることはありません。",
      ],
    ]),
  ].join("\n\n"),
});

// ---------------------------------------------------------------- 返金

const refund = page({
  slug: "refund",
  titleEn: "Refund Policy",
  titleJa: "返金ポリシー",
  leadEn: "Please try the free trial before you buy.",
  leadJa: "ご購入前に、無料トライアルで動作をお確かめください。",
  body: [
    section("1. Try before you buy", "1. まずは無料でお試しください", [
      [
        "A free trial is available: three weeks, up to ten tickers. Please confirm on your own PC that the app runs and that your own API key produces an analysis before purchasing.",
        "「3 週間・10 銘柄まで」の無料トライアルをご用意しています。ご購入前に、お客様の PC で動作すること、およびご自身の APIキーで分析が実行できることを必ずお確かめください。",
      ],
    ]),
    section("2. Refunds", "2. 返金について", [
      [
        "Because this is downloadable digital software, purchases are non-refundable once the licence key has been issued.",
        "本製品はダウンロード版のデジタルソフトウェアという性質上、ライセンスキー発行後のキャンセル・返金には原則として応じられません。",
      ],
      [
        `If the app does not work as described on this site, please contact ${SUPPORT_EMAIL} before requesting a refund. Most problems are configuration issues that can be resolved.`,
        `本サイトの説明どおりに動作しない場合は、返金をご請求になる前に ${SUPPORT_EMAIL} までご連絡ください。多くは設定に起因するもので、解決できる場合があります。`,
      ],
    ]),
    section("3. No subscription to cancel", "3. 解約手続きは不要です", [
      [
        "This is a one-time purchase, not a subscription. There is no recurring charge, so there is nothing to cancel. To stop using the app, uninstall it from your PC.",
        "本製品は買い切り型であり、サブスクリプションではありません。継続課金は発生しないため、解約・退会の手続きは不要です。ご利用を終了される場合は、PC からアンインストールしてください。",
      ],
      [
        "AI usage fees are billed by your API providers, not by this app. Stopping use of the app does not by itself cancel any provider account you set up.",
        "AI の利用料は各 API 提供元からお客様へ請求されるもので、本アプリが課金するものではありません。本アプリの利用を終了しても、お客様が開設した提供元のアカウントが自動的に解約されるわけではありません。",
      ],
    ]),
  ].join("\n\n"),
});

for (const [name, html] of [
  ["terms.html", terms],
  ["privacy.html", privacy],
  ["refund.html", refund],
]) {
  writeFileSync(join(HERE, name), html, "utf-8");
  console.log(`generated lp/${name}`);
}
