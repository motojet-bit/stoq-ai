/**
 * ポリシーページ（利用規約 / プライバシー / 返金）を組み立てる。
 *
 * **3 枚に同じ枠を手で書き写さない。** ヘッダー・フッター・言語切替は
 * どのページでも同じで、直すたびに 3 か所を触ることになる。
 * 中身だけを持ち、枠はここが被せる。
 *
 *   node build-policy.mjs
 *
 * 出力先はこのファイルと同じ場所（terms.html / privacy.html / refund.html）。
 * **生成物もコミットする**（GitHub Pages は静的ファイルしか配れないため）。
 *
 * # 置き場所（2026-08-10 に移した）
 *
 * もとは `StockAnalyzer/lp/` にあった。LP を `stoq-lp`（公開先 `stoq-ai`）へ
 * 切り出したあとも生成元だけが残り、**LP が 2 か所に存在する**状態になっていた。
 * 実際、公開中の HTML を手で直したあとで「回せば戻る」ことに気づいている。
 * **生成元は、生成物と同じリポジトリに置く。**
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 問い合わせ先。**1 か所で持つ**（散らすと直し漏れる） */
const SUPPORT_EMAIL = "superpuzanoza@gmail.com";

/**
 * 販売元の所在地。**国と都市（県）までは常時掲示する。**
 *
 * カード決済の国際規約では、販売元の**国または都市名**の明記が求められる。
 * 「請求に応じて開示」だけで所在地がどこにも無いと、
 * **販売元が不審**と見なされて審査が止まる。
 *
 * **番地までは出さない。** 求められているのは所在の特定であって、
 * 自宅の住所を公開することではない。
 */
const SELLER_LOCATION = "Chaiyaphum, Thailand";
const SELLER_LOCATION_JA = "タイ王国 チャイヤプーム県";

/**
 * 屋号。製品名と同じにしてある（アプリ・LP と綴りを揃えること）。
 *
 * **「Lemon Squeezy が Merchant of Record」という記述は外した。**
 * 審査が通っておらず、事実と違う。**販売経路が決まるまで、誰が売主かを
 * 名乗らない。** 分かっていないことを書くほうが危ない。
 *
 * 直販（Stripe 直）に切り替える場合、売主はご本人になる。
 * そのときは**氏名・所在地の常時掲示**が要るかを確かめたうえで、
 * ここへ Legal Notice を入れること。
 * 問われたときに答えられる状態は保ちつつ、常時公開はしない。
 */
const TRADE_NAME = "StoQ AI Analyzer";
/** 最終更新日。文面を直したらここも直す */
const UPDATED = "2026-08-10";

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
    <!-- アイコンは index.html と同じもの（＝アプリ本体のアイコン） -->
    <link rel="icon" type="image/png" sizes="32x32" href="./favicon-32.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="./favicon.png" />
    <link rel="apple-touch-icon" href="./favicon.png" />
    <meta name="theme-color" content="#020617" />
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
            Published under the trade name ${TRADE_NAME}.
            Seller location: ${SELLER_LOCATION}.
            Legal name and full address disclosed on request.
          </span>
          <span data-ja>
            提供: ${TRADE_NAME}（屋号）／
            所在地: ${SELLER_LOCATION_JA}／
            氏名および詳細住所はご請求に応じて開示いたします。
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
    /*
     * **「総合投資判断」という語を製品の機能として書かない。**
     *
     * 「投資助言ではありません」と断った直後に「総合投資判断を AI が生成する」
     * と書いてあれば、読む側には**実質は投資判断ツール**に見える。
     * 免責の文言ではなく、**何を出力する製品なのか**で判断されるので、
     * 出力物の呼び名そのものを「要約・整理」の側へ統一する。
     */
    section("1. What this software produces", "1. 本ソフトが出力するもの", [
      [
        "StoQ AI Analyzer is a research-support tool that reads disclosure documents and produces <strong>summaries</strong>: extracted figures, an overall summary, and comparisons across periods. It does not provide investment advice and is not a solicitation to buy or sell any security.",
        "本アプリは、開示書類を読み取って<strong>要約</strong>を作るリサーチ支援ソフトです。出力するのは、抜き出した数値・全体の要約・期をまたいだ比較です。投資助言を行うものではなく、特定の有価証券の売買を推奨・勧誘するものでもありません。",
      ],
      [
        "Everything it produces is AI-generated output based on the documents you supply. No warranty is made as to accuracy or completeness, and the same question may be answered differently on different runs.",
        "出力はいずれも、お客様が与えた資料に基づく AI の生成物です。正確性・完全性について保証はいたしません。同じ問いでも、実行のたびに答えが変わる場合があります。",
      ],
      [
        "How you use the output is entirely your own decision, as are any consequences of doing so. The developer accepts no liability.",
        "出力をどのように用いるかは、すべてお客様ご自身のご判断によります。その結果生じる事柄についても同様であり、開発者は一切の責任を負いません。",
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
    /*
     * **「譲渡・貸与・共有・再販は禁止」の 1 文は外した（2026-08-10・本人判断）。**
     *
     * 禁止事項を並べると、読む人に「そこが守られていない」と教えることになる。
     * 第 6 節の「**購入者ご本人がお使いになる** 2 台まで」が、
     * 使い方の範囲を肯定形で示している——同じことを、警告の形にせずに言える。
     */
    section("3. Licence", "3. ライセンス", [
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
    /*
     * **「オフライン不可」と一括りにしない。**
     *
     * 実装は、通信が要る動作と要らない動作が分かれている
     * （`license_grace.rs` / 記録はローカル保存）。
     * それを「オフラインでの利用は想定していません」と丸めると、
     * **LP の「読み返すだけなら接続不要」と正面から食い違う。**
     * 規約と売り文句が矛盾していると、どちらを信じればよいのか分からなくなる。
     *
     * 実装のとおりに、**要る場面を挙げて書く。**
     */
    /*
     * **ライセンスの確認には触れない（2026-08-10）。**
     *
     * SendOwl へ移り、照合はオフラインになった。通信しないので
     * 「起動時に確認する」も「14 日の猶予」も事実でなくなった。
     * かといって「オフラインで確認します」とも書かない——
     * **規約に実装の仕組みを書くと、読む人に「サーバー照会が無い」と教えることになる。**
     * 権利と義務だけを書く。
     */
    section("5. Internet connection", "5. インターネット接続", [
      [
        "Internet access is required for fetching documents and market data, and for running the AI. Content you have already saved can be read offline.",
        "資料・市場データの取得、および AI の実行には、インターネット接続が必要です。すでに保存された内容の閲覧は、オフラインでも可能です。",
      ],
    ]),

    /*
     * **制限ではなく許諾として書く（2026-08-10）。**
     *
     * 以前は「上限があります。旧端末の登録を外して枠を空けてください」だった。
     * SendOwl に端末数を数える機能が無く、**端末登録という仕組みそのものが無い。**
     * 存在しない手順を書くほうが、台数を書くよりよほど気付かれる
     * ——言われたとおり設定を探した人が、そんな項目が無いことに気づく。
     *
     * 「2 台まで使える」は読み手には特典に見える。**「上限」「超過」とは書かない。**
     *
     * **第 3 節の禁止事項を外した以上、使い方の範囲を示すのはここだけになった。**
     * 「購入者ご本人がお使いになる」を落とさないこと——落とすと、
     * 誰が使ってよいのかが規約のどこにも書かれていない状態になる。
     *
     * ⚠ **2 台は契約上の取り決めで、技術的には強制していない。**
     */
    /*
     * **対象外であることを、理由つきで書く（2026-08-11）。**
     *
     * アプリは銘柄の種類を見ていないので、**ETF を入れても止まらない。**
     * 決算書が 1 枚も無いまま評価を書かせることになり、AI は「資料が無い」と
     * 言わず学習知識で埋めるので、**読んだように見える出力が出る。**
     *
     * 実装で塞ぐのが本筋（`StockAnalyzer/docs/未解決事項.md` の項目 19）。
     * それまでの間、**文言だけが唯一の歯止め**になる。
     * 「対象外」と「なぜ対象外か」の両方を書く——理由が無いと、
     * 単に未対応で後から足されるものだと読まれる。
     */
    section("6. What can be analysed", "6. 分析の対象", [
      [
        "This app reads the filings a company publishes &mdash; 10-K, 10-Q and the like &mdash; and summarises them. Its scope is therefore limited to <strong>shares of individual companies that publish such filings</strong>.",
        "本アプリは、企業が提出する決算書（10-K / 10-Q など）を読み取って要約する道具です。したがって対象は、<strong>決算書を提出する個別企業の株式</strong>に限られます。",
      ],
      [
        "ETFs, mutual funds, indices, cryptocurrencies, currency pairs, commodities and futures publish nothing of the kind, so there is nothing to read and no analysis can be produced. <strong>If you enter one, the app stops before running.</strong>",
        "ETF・投資信託・指数・暗号資産・為替・商品・先物などは決算書を提出しないため、分析の前提となる資料が存在せず、分析は成立しません。<strong>これらを入力した場合、アプリが実行を中止します。</strong>",
      ],
    ]),

    section("7. Devices", "7. 利用できる端末", [
      [
        "One licence may be used on up to <strong>two devices</strong> belonging to the purchaser &mdash; for example, a desktop and a laptop.",
        "1 つのライセンスは、購入者ご本人がお使いになる <strong>2 台まで</strong>の端末でご利用いただけます（例: デスクトップと持ち運び用のノート）。",
      ],
    ]),

    section("8. Dependence on external services", "8. 外部サービスへの依存", [
      [
        "This app relies on external APIs (LLM providers, market data, SEC EDGAR). If a provider changes its specification, restricts access or discontinues a service, some features may be limited or stop working without notice.",
        "本アプリは外部の API（LLM 提供元・市場データ・SEC EDGAR 等）に依存しています。提供元の仕様変更・アクセス制限・サービス終了により、一部機能が予告なく制限される、または利用できなくなる場合があります。",
      ],
    ]),
    section("9. Seller", "9. 販売者", [
      [
        `This product is developed and published under the trade name <strong>${TRADE_NAME}</strong>.`,
        `本製品は屋号 <strong>${TRADE_NAME}</strong> として開発・提供しています。`,
      ],
      [
        `Payment is handled by an external payment provider. Details of the seller of record, and what will appear on your receipt and card statement, are stated on the checkout page before you pay.`,
        `決済は外部の決済事業者を通じて行われます。売主が誰か、領収書やカードの明細に何が表示されるかは、お支払いの前に購入手続きのページに明示されます。`,
      ],
      [
        `The publisher&rsquo;s legal name and business address are not published here; both will be disclosed without delay on request to ${SUPPORT_EMAIL}. For questions about the app itself, use the same address.`,
        `提供者の氏名および所在地は本サイトには掲載していませんが、${SUPPORT_EMAIL} へご請求いただければ、いずれも遅滞なく開示いたします。アプリ自体に関するお問い合わせも同じ窓口で承ります。`,
      ],
    ]),
  ].join("\n\n"),
});

// ---------------------------------------------------------------- プライバシー

const privacy = page({
  slug: "privacy",
  titleEn: "Privacy Notice",
  titleJa: "プライバシーポリシー",
  leadEn:
    "Two separate things. Buying the app means we receive your name, e-mail and purchase record from the payment provider, and we write to you about this product \u2014 updates, fixes and version news. Using the app means nothing at all is sent to us; it runs on your machine.",
  leadJa:
    "話は 2 つに分かれます。<strong>購入時</strong>は、決済事業者を通じてお名前・メールアドレス・購入記録を受け取り、<strong>本製品に関するお知らせ</strong>（更新・修正・新しい版のご案内）をお送りします。<strong>利用時</strong>は、当方へ送信されるものは一切ありません（お客様の PC 内で動作します）。",
  body: [
    section("1. What we receive when you buy", "1. 購入時に受け取る情報", [
      [
        "When you purchase, the payment provider passes us the following so that we can deliver the licence and support it: <strong>your name, your e-mail address, and the record of the purchase</strong> (date, product, amount, and the last four digits of the card as shown to us by the provider).",
        "ご購入時、ライセンスの引き渡しとその後の対応のため、決済事業者から次の情報を受け取ります。<strong>お名前・メールアドレス・購入記録</strong>（日時・商品・金額、および決済事業者の画面に表示される範囲のカード下 4 桁）。",
      ],
      [
        "<strong>We never receive your full card number, expiry date or security code.</strong> Those are handled entirely by the payment provider and never reach us.",
        "<strong>カード番号の全桁・有効期限・セキュリティコードを当方が受け取ることはありません。</strong> これらは決済事業者が取り扱い、当方へ渡ることはありません。",
      ],
    ]),
    section("2. What we use it for", "2. 利用目的", [
      [
        "Issuing and re-issuing your licence key. Answering enquiries and handling refunds.",
        "ライセンスキーの発行・再発行。お問い合わせへの対応と返金処理。",
      ],
      [
        "<strong>Sending notices about this product.</strong> Updates and new versions, bug fixes and minor improvements, security fixes, changes to these terms, paid major-version upgrades (including how to upgrade by paying the difference), and the end of support. These come with your purchase: they are how a fix reaches you.",
        "<strong>本製品に関するお知らせの送付。</strong> アップデートや新しい版のご案内、バグ修正・軽微な改善、セキュリティ修正、規約の変更、差額のお支払いによる大型バージョンアップのご案内、提供終了のお知らせなど。これらはご購入に付随するもので、<strong>修正をお届けする手段そのもの</strong>です。",
      ],
      [
        "<strong>We do not advertise unrelated products to you.</strong> Your address is used for this product only, and is never passed to anyone else for their own marketing.",
        "<strong>本製品と関係のない商品の宣伝は送りません。</strong> メールアドレスは本製品に関する連絡にのみ使用し、第三者の営業目的で渡すことはありません。",
      ],
    ]),
    section("3. Who else sees it", "3. 第三者への提供", [
      [
        "<strong>We do not sell, rent or share your information.</strong> It is handled only by the payment and delivery providers we use to run the store, acting on our behalf.",
        "<strong>お客様の情報を販売・貸与・共有することはありません。</strong> 取り扱うのは、店舗の運営のために当方が利用する決済・配信の各事業者のみで、いずれも当方の委託先として扱います。",
      ],
      [
        "We disclose information beyond this only where the law requires it.",
        "これ以外に開示するのは、法令に基づく請求があった場合に限られます。",
      ],
    ]),
    section("4. How long we keep it", "4. 保存期間", [
      [
        "Purchase records are kept for as long as needed to support the licence and to meet accounting and tax obligations. You may ask us to delete your e-mail address from our records at any time; note that doing so means we can no longer re-issue a lost licence key to you.",
        "購入記録は、ライセンスの対応と会計・税務上の義務に必要な期間、保存します。メールアドレスの削除はいつでもご請求いただけますが、その場合<strong>紛失したライセンスキーの再発行はできなくなります</strong>のでご承知おきください。",
      ],
      [
        "To ask about, correct or delete what we hold, write to the address at the foot of this page.",
        "保有情報の確認・訂正・削除のご請求は、本ページ下部の連絡先までお願いします。",
      ],
    ]),
    section("5. What the app itself collects", "5. アプリが収集する情報", [
      [
        "<strong>Nothing.</strong> The app has no analytics, no telemetry and no crash reporting, and there is no server of ours for it to send anything to.",
        "<strong>ありません。</strong> 本アプリにはアクセス解析・利用統計・クラッシュレポートのいずれも組み込まれておらず、送信先となる当方のサーバも存在しません。",
      ],
      /*
       * **送信していないものを「送信します」と書かない（2026-08-10）。**
       * オフライン照合になったので、キーも端末名もどこへも出ない。
       * プライバシー通知としては、こちらのほうが強い。
       */
      [
        "<strong>Your licence key is not transmitted anywhere.</strong> It is checked on your own machine and is stored only in the app&rsquo;s settings on that machine.",
        "<strong>ライセンスキーは、どこへも送信されません。</strong> 確認はお客様の端末内で行われ、キーはその端末のアプリ設定内にのみ保存されます。",
      ],
    ]),
    section("6. Where your work is stored", "6. 作業内容の保存場所", [
      [
        "Everything you produce in the app \u2014 saved sessions, chat history, notes, staged documents and settings \u2014 is stored in a local database on your PC. API keys are kept in your operating system&rsquo;s application-settings directory and are shown on screen only as a masked string.",
        "アプリ内で作成したもの（保存した内容・対話履歴・メモ・一時保存した資料・設定）は、すべてお客様の PC 内のローカルデータベースに保存されます。APIキーは OS のアプリ設定ディレクトリに保存され、画面にはマスクされた文字列のみが表示されます。",
      ],
      /*
       * **「アンインストールで消える」と書かない。**
       *
       * 実際には消えない。インストーラはアプリのデータを残すので、
       * 入れ直しても保存内容はそのまま戻ってくる。
       * **消えると書いておいて残るのは、順序が逆で始末が悪い**——
       * 消したつもりの人が消せていないことになる。
       * 消し方まで書く。
       */
      [
        "None of it is sent to us. <strong>It is not removed when you uninstall the app</strong> &mdash; the data directory is left in place, so that reinstalling does not lose your work. Delete that directory yourself if you want the data gone.",
        "これらが当方へ送信されることはありません。<strong>アンインストールしても消去されません。</strong> 入れ直したときに作業内容が失われないよう、データディレクトリはそのまま残されます。消去をご希望の場合は、このディレクトリをお客様ご自身で削除してください。",
      ],
      /*
       * **設定ファイルの外に書くものは、書いてあると明かす。**
       *
       * 無料期間の起点をレジストリにも持たせた（第225章）。
       * 場所も目的も伏せる必要は無く、伏せるほうがかえって筋が悪い。
       */
      [
        "On Windows, the app also records <strong>the date it was first launched</strong> in the registry, under <code>HKEY_CURRENT_USER\\Software\\StoQ AI Analyzer</code>. This is so the free trial period is counted correctly even if the settings file is deleted. It is a date and nothing else &mdash; no personal information &mdash; and it also remains after uninstalling.",
        "また Windows では、<strong>初回に起動した日時</strong>をレジストリ（<code>HKEY_CURRENT_USER\\Software\\StoQ AI Analyzer</code>）にも記録します。設定ファイルが削除された場合でも、無料トライアル期間を正しく数えるためです。記録するのは日時のみで、個人情報は含みません。これもアンインストール後に残ります。",
      ],
    ]),
    section("7. Where the app sends data", "7. アプリが外部へ送信する先", [
      [
        "To do its job the app talks directly to the following third parties. These requests go from your machine to the service; <strong>they do not pass through us.</strong>",
        "機能の提供のため、本アプリは以下の第三者と直接通信します。通信はお客様の PC から各サービスへ直接行われ、<strong>当方を経由しません。</strong>",
      ],
      [
        "<strong>AI providers</strong> &mdash; OpenAI, Anthropic, Google (Gemini), or any OpenAI-compatible provider you add. The app sends the prompt and any documents you attached. Each provider&rsquo;s own privacy policy applies.",
        "<strong>AI 提供元</strong> &mdash; OpenAI / Anthropic / Google (Gemini)、およびお客様が追加した OpenAI 互換プロバイダ。プロンプトと添付された資料が送信されます。各社のプライバシーポリシーが適用されます。",
      ],
      [
        "<strong>Document and market data sources</strong> &mdash; SEC EDGAR, Yahoo Finance, and (if you choose them) Financial Modeling Prep or Alpha Vantage. The app sends the ticker symbol and, for SEC EDGAR, the User-Agent string you configured.",
        "<strong>資料・市場データの取得先</strong> &mdash; SEC EDGAR / Yahoo Finance、およびお客様が選択した場合は Financial Modeling Prep / Alpha Vantage。銘柄コードと、SEC EDGAR についてはお客様が設定した User-Agent が送信されます。",
      ],
      // ライセンス発行元への送信は無くなった（オフライン照合・2026-08-10）
      [
        "<strong>Google Drive</strong> &mdash; only if you connect it. The app requests the <code>drive.appdata</code> scope only, which can read and write nothing but its own backup file. It cannot see your other files.",
        "<strong>Google Drive</strong> &mdash; お客様が連携した場合のみ。要求するのは <code>drive.appdata</code> スコープのみで、本アプリ自身のバックアップファイル以外は読み書きできません。お客様の他のファイルは参照できません。",
      ],
    ]),
    section("8. This website", "8. 本サイトについて", [
      [
        "A static page. Your language preference is kept in your browser&rsquo;s local storage and never leaves your device.",
        "本サイトは静的ページです。言語設定はブラウザのローカルストレージに保存され、お客様の端末から出ることはありません。",
      ],
      [
        "<strong>Access analytics.</strong> We may use a web analytics service (such as Google Analytics) to see which pages are read and where visitors arrive from. Where it is in use, that service sets cookies and receives your IP address, browser and referring page, under the operator&rsquo;s own privacy policy. It is used to understand how the site is used, never to identify an individual. Cookies can be refused in your browser settings, and Google publishes an opt-out add-on.",
        "<strong>アクセス解析について。</strong> どのページが読まれているか、どこから来られたかを把握するため、<strong>Google Analytics などのアクセス解析を利用する場合があります。</strong> 利用している場合、当該サービスは Cookie を設定し、IP アドレス・ブラウザの種類・参照元ページを取得します（各社のプライバシーポリシーが適用されます）。利用状況の把握のためだけに用い、個人の特定には使用しません。Cookie はブラウザの設定で拒否でき、Google はオプトアウト用のアドオンを公開しています。",
      ],
      [
        "The checkout runs on the payment provider&rsquo;s own pages, under their privacy policy.",
        "購入手続きは決済事業者のページ上で行われ、同社のプライバシーポリシーが適用されます。",
      ],
    ]),
  ].join("\n\n"),
});

// ---------------------------------------------------------------- 返金

const refund = page({
  slug: "refund",
  titleEn: "Refund Policy",
  titleJa: "返金ポリシー",
  leadEn:
    "Purchases are non-refundable as a rule. Please use the free trial to confirm it works on your PC before you buy.",
  leadJa:
    "ご購入後の返金には原則として対応いたしません。ご購入前に、無料トライアルでお客様の PC で動作することをお確かめください。",
  body: [
    section("1. Try it before you buy", "1. 購入前にお試しください", [
      [
        "A free trial is available: three weeks, up to ten items, with every feature unlocked and no card required. Please confirm on your own PC that the app runs and that your own API key works before purchasing.",
        "「3 週間・10 件まで」の無料トライアルをご用意しています。全機能が使え、クレジットカードも不要です。ご購入前に、お客様の PC で動作すること、およびご自身の APIキーで実行できることを必ずお確かめください。",
      ],
      [
        "The trial exists so that you do not have to buy in order to find out. Please use it.",
        "「買わないと分からない」状態を無くすために用意しています。ぜひご活用ください。",
      ],
    ]),
    section("2. Refunds", "2. 返金について", [
      [
        "This is downloadable digital software. Once the licence key has been issued, <strong>purchases are non-refundable as a rule</strong>.",
        "本製品はダウンロード版のデジタルソフトウェアです。ライセンスキーの発行後は、<strong>原則として返金に対応いたしません</strong>。",
      ],
      /*
       * **窓口の案内は言語で書き分ける。** 対応できる言語を先に伝えておかないと、
       * 書いた側は「送ったのに返事が来ない」と受け取る。
       */
      [
        `<strong>If something is not working, write to us first</strong> &mdash; ${SUPPORT_EMAIL}. Support is handled in English. Most problems turn out to be a setting, and can be fixed without a refund.`,
        `<strong>不具合がある場合は、まずご連絡ください</strong>（${SUPPORT_EMAIL}）。<strong>日本語でご連絡いただけます。</strong> 多くは設定に起因するもので、返金によらず解決できます。`,
      ],
      [
        "<strong>For questions about how to use it, the built-in AI assistant is often faster.</strong> It answers questions about the app itself, inside the app, at any hour.",
        "<strong>使い方が分からない点は、アプリ内の AI チャットボットもご活用ください。</strong> アプリの操作について、その場で、時間を問わず答えます。",
      ],
    ]),
    section("3. No subscription to cancel", "3. 解約手続きは不要です", [
      [
        "This is a one-time purchase, not a subscription. There is no recurring charge, so there is nothing to cancel. To stop using the app, uninstall it from your PC.",
        "本製品は買い切り型であり、サブスクリプションではありません。継続課金は発生しないため、解約・退会の手続きは不要です。ご利用を終了される場合は、PC からアンインストールしてください。",
      ],
      [
        "AI usage fees are billed by your API providers, not by this app. Stopping use of the app does not by itself close any provider account you set up.",
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
  console.log(`generated ${name}`);
}
