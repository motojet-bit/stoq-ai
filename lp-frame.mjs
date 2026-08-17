/**
 * LP の共通の枠。**ポリシーページとブログで同じものを使う。**
 *
 * # なぜ切り出したか（2026-08-17）
 *
 * リリースノートを LP へ置くにあたり、`build-policy.mjs` を写して
 * `build-blog.mjs` を作ろうとした。**写すと枠が 2 つになる。**
 *
 * 枠にはヘッダー・フッター・言語切替に加えて、**販売元の表示**が入っている。
 * これは決済審査で見られる部分で、**片方だけ直すと食い違う。**
 * 「3 枚に同じ枠を手で書き写さない」という `build-policy.mjs` の判断を、
 * ファイルをまたいでも通す。
 *
 * **ここを直すと、ポリシー 3 枚とブログの全記事に効く。**
 * 直したら両方を回し直すこと（`node build-policy.mjs && node build-blog.mjs`）。
 */

/** 問い合わせ先。**1 か所で持つ**（散らすと直し漏れる） */
export const SUPPORT_EMAIL = "superpuzanoza@gmail.com";

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
export const SELLER_LOCATION = "Chaiyaphum, Thailand";
export const SELLER_LOCATION_JA = "タイ王国 チャイヤプーム県";

/** 屋号。製品名と同じにしてある（アプリ・LP と綴りを揃えること） */
export const TRADE_NAME = "StoQ AI Analyzer";

/**
 * 問い合わせフォームの URL。
 *
 * **まだ用意していない間は `null` のままにする。**
 * `null` のときはフォームへの導線を一切出さず、`mailto:` だけが残る——
 * **リンク先の無いボタンを置くくらいなら、置かないほうがよい。**
 *
 * URL を入れると、次の 3 つが自動で付く。
 *   1. 各ページの問い合わせ欄に、フォームへのボタン
 *   2. フッターの「お問い合わせ」がフォームへ向く（`mailto:` は欄に残す）
 *   3. **プライバシーポリシーに、第三者を経由する旨の節**（`build-policy.mjs`）
 *
 * 🔴 **URL を入れるときは `CONTACT_FORM_SERVICE` も一緒に埋める。**
 * サービス名が空のままだと、プライバシーポリシーが
 * 「どこを経由するか」を書けない（**それは書かずに出してはいけない**）。
 */
export const CONTACT_FORM_URL = "https://forms.gle/bFMkMw83yfu1J9uN8";

/** 経由するサービスの名前（プライバシーポリシーに明示する） */
export const CONTACT_FORM_SERVICE = { en: "Google Forms", ja: "Google フォーム" };

/** フォームを出してよい状態か。**両方そろって初めて出す。** */
export function contactFormReady() {
  return Boolean(CONTACT_FORM_URL) && Boolean(CONTACT_FORM_SERVICE.ja);
}

/**
 * 枠。
 *
 * **`index.html` と同じ見た目にする。** 別デザインのページへ飛ぶと、
 * 同じ製品のものか一瞬迷う。言語切替の仕組みもそのまま持ち込む。
 *
 * `base` は、トップから見た相対の深さ（`blog/` の記事なら `"../"`）。
 * **リンクを絶対パスにしない**——GitHub Pages のプロジェクトページと
 * 独自ドメインで、ルートの位置が変わるため。
 */
export function page({ titleEn, titleJa, leadEn, leadJa, body, updated, base = "./" }) {
  const contact = contactFormReady()
    ? `
        <p class="mt-2">
          <a
            href="${CONTACT_FORM_URL}"
            target="_blank"
            rel="noreferrer noopener"
            class="inline-block rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-300 transition-colors hover:bg-emerald-900/40"
          >
            <span data-en>Open the contact form &nearr;</span><span data-ja>お問い合わせフォームを開く &nearr;</span>
          </a>
        </p>
        <!--
          **外部で開くことを、押す前に言う。** 押してから別サイトへ飛ぶと、
          販売ページから離れたことに気づかない人がいる。
          経由先を伏せないのは、プライバシーポリシーの記載とも揃える意味がある。
        -->
        <p class="mt-1.5 text-xs text-slate-500">
          <span data-en>
            Opens an external form (${CONTACT_FORM_SERVICE.en}) in a new tab.
            Please do not enter API keys or licence keys.
          </span>
          <span data-ja>
            外部フォーム（${CONTACT_FORM_SERVICE.ja}）が別のタブで開きます。
            APIキー・ライセンスキーは入力しないでください。
          </span>
        </p>`
    : "";

  return `<!doctype html>
<html lang="en" class="scroll-smooth">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${titleEn} — StoQ AI Analyzer</title>
    <meta name="robots" content="index,follow" />
    <!-- アイコンは index.html と同じもの（＝アプリ本体のアイコン） -->
    <link rel="icon" type="image/png" sizes="32x32" href="${base}favicon-32.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="${base}favicon.png" />
    <link rel="apple-touch-icon" href="${base}favicon.png" />
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
        <a href="${base}index.html" class="text-sm font-semibold text-slate-100">
          StoQ AI Analyzer
        </a>
        <a
          href="${base}index.html"
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
        <span data-en>Last updated: ${updated}</span><span data-ja>最終更新日: ${updated}</span>
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
        </p>${contact}
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
          <a href="${base}terms.html" class="transition-colors hover:text-slate-300">
            <span data-en>Terms</span><span data-ja>利用規約</span>
          </a>
          <a href="${base}privacy.html" class="transition-colors hover:text-slate-300">
            <span data-en>Privacy</span><span data-ja>プライバシー</span>
          </a>
          <a href="${base}refund.html" class="transition-colors hover:text-slate-300">
            <span data-en>Refunds</span><span data-ja>返金について</span>
          </a>
          <a href="${base}blog/index.html" class="transition-colors hover:text-slate-300">
            <span data-en>Release notes</span><span data-ja>更新履歴</span>
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
export function section(headingEn, headingJa, paragraphs) {
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
