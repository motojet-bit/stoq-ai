/**
 * 更新履歴（リリースノート）のページを組み立てる。
 *
 *   node build-blog.mjs
 *
 * 出力先は `blog/`（`blog/index.html` と記事 1 本ずつ）。
 * **生成物もコミットする**（GitHub Pages は静的ファイルしか配れないため）。
 *
 * # なぜ LP に置くのか
 *
 * **いま「何が変わったか」を日本語で読める場所が、GitHub Releases しかない。**
 * 買う前の人がそこまで見に行くことはほとんど無く、
 * 買ったあとの人にも「直ったのか」を確かめる場所が無い。
 *
 * # 🔴 いちばんの利点は「免責を機械が貼ること」
 *
 * 枠（`lp-frame.mjs`）に乗せると、**免責と「特定銘柄の推奨ではない」の一文が
 * 全記事へ自動で入る。** note で書くと毎回手で書くことになり、
 * **1 本忘れたときにいちばん困る種類のもの。**
 *
 * # 書いてよいもの／避けるもの
 *
 * | 書ける（道具の説明） | 避ける（助言に寄る） |
 * | --- | --- |
 * | 版で何が変わったか | 「◯◯は買い」 |
 * | 指標の読み方・BYOK とは何か | 「いま仕込むべき小型株 5 選」 |
 *
 * 実銘柄を出すときは、**過去の日付で・画面の実例として・結論を書かない。**
 *
 * # 詳しさの程度
 *
 * **利用者が付くまでは、区分だけ。** 判断の理由は
 * `StockAnalyzer/docs/リリース手順.md` の「リリースノートの書き方」にある。
 * **GitHub Releases の本文と食い違わせないこと**——
 * 片方が詳しく片方が粗いと、隠していると読まれる。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { page, section } from "./lp-frame.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "blog");

/** ダウンロード（固定名。リリースのたびに URL を直さずに済む） */
const DOWNLOAD_URL =
  "https://github.com/motojet-bit/stoq-releases/releases/latest/download/StoQ-AI-Analyzer-x64-setup.exe";

/**
 * 🔴 全記事の末尾へ必ず入る免責。**記事ごとに書かない。**
 *
 * 手で書く運用にすると、**忘れた 1 本がいちばん問題になる。**
 * ここに置いておけば、記事を足すだけで付いてくる。
 */
function disclaimer() {
  return section("Important notice", "ご注意", [
    [
      "StoQ AI Analyzer is a research-support tool that reads disclosure documents and produces summaries. <strong>It does not provide investment advice, and is not a solicitation to buy or sell any security.</strong>",
      "StoQ AI Analyzer は、開示書類を読み取って要約を作るリサーチ支援ソフトです。<strong>投資助言を行うものではなく、特定の有価証券の売買を推奨・勧誘するものでもありません。</strong>",
    ],
    [
      "Everything it produces is AI-generated output based on the documents you supply. No warranty is made as to accuracy or completeness. How you use the output is your own decision.",
      "出力はいずれも、お客様が与えた資料に基づく AI の生成物です。正確性・完全性について保証はいたしません。出力をどのように用いるかは、お客様ご自身のご判断によります。",
    ],
  ]);
}

/** ダウンロードへの導線。記事の下に置く */
function downloadBox() {
  return `        <section>
          <p class="mt-3 text-sm leading-relaxed text-slate-300">
            <a
              href="${DOWNLOAD_URL}"
              class="inline-block rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-2 font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40"
            >
              <span data-en>Download the latest version</span><span data-ja>最新版をダウンロード</span>
            </a>
          </p>
          <p class="mt-2 text-xs leading-relaxed text-slate-500">
            <span data-en>
              Windows. The installer is unsigned, so Windows shows a warning &mdash;
              choose &ldquo;More info&rdquo; then &ldquo;Run anyway&rdquo;.
              If you already have it installed, the app offers the update itself.
            </span>
            <span data-ja>
              Windows 版です。署名証明書が無いため Windows の警告が出ます。
              「詳細情報」→「実行」で進めてください。
              すでにお使いの場合は、アプリ側から更新をご案内します。
            </span>
          </p>
        </section>`;
}

/**
 * 記事。**新しい順に並べる**（`POSTS` の先頭が最新）。
 *
 * `date` は表示にも並べ替えにも使うので `YYYY-MM-DD` で書く。
 */
const POSTS = [
  {
    slug: "v0-9-2",
    date: "2026-08-17",
    version: "0.9.2",
    titleEn: "Version 0.9.2",
    titleJa: "バージョン 0.9.2",
    leadEn:
      "Improvements to printing and export, plus corrections to the calculation and labelling of some metrics.",
    leadJa:
      "印刷・書き出しまわりの改善と、一部の指標の計算・表記の修正です。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>Printing and export</strong> &mdash; the exported PDF now carries the overall score chart (a donut, plus a bar for each block).",
          "<strong>印刷・書き出し</strong> &mdash; 書き出した PDF に、総合スコアの図（ドーナツとブロック別の棒）を載せました。",
        ],
        [
          "<strong>Appendix</strong> &mdash; a &ldquo;terms and how to read them&rdquo; section is now added to the end of the PDF. If you do not need it, you can delete that page on its own.",
          "<strong>巻末付録</strong> &mdash; PDF の末尾に「用語と読み方」を追加しました。不要な場合は、そのページだけ削除できます。",
        ],
        [
          "<strong>Disclaimer</strong> &mdash; the notice now sits on its own final page.",
          "<strong>免責事項</strong> &mdash; 最終ページに独立して掲載するようにしました。",
        ],
        [
          "<strong>Metrics</strong> &mdash; the calculation and labelling of some indicators have been corrected.",
          "<strong>指標</strong> &mdash; 一部の指標について、計算と表記を修正しました。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "The app checks for updates on its own and will offer this version. You can also update from Settings &rarr; General &rarr; Check for updates.",
          "アプリが自動で更新を確認し、この版をご案内します。設定 &rarr;「一般」&rarr;「更新プログラムを確認」からも実行できます。",
        ],
        [
          "Your saved analyses, notes and settings are kept. Nothing needs to be re-entered.",
          "保存済みの分析・メモ・設定はそのまま残ります。入力し直す必要はありません。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-1",
    date: "2026-08-17",
    version: "0.9.1",
    titleEn: "Version 0.9.1",
    titleJa: "バージョン 0.9.1",
    leadEn: "Fixes for the problems found after the first public release.",
    leadJa: "公開後に見つかった不具合をまとめて修正しました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>Important fixes</strong> &mdash; resuming an analysis that stopped part-way, and the accuracy of the usage log.",
          "<strong>重要な不具合の修正</strong> &mdash; 途中で止まった分析の再開と、消費ログの記録について直しました。",
        ],
        [
          "<strong>Minor fixes</strong> &mdash; wording, readability and layout, including how the top bar behaves in a narrow window.",
          "<strong>軽微な不具合の修正</strong> &mdash; 表示の分かりにくさやレイアウトを整えました。ウィンドウを狭めたときの上部の並びも含みます。",
        ],
        [
          "<strong>Improvements</strong> &mdash; the built-in AI assistant now explains what it can and cannot do, and asks for the material it needs instead of guessing.",
          "<strong>機能面の向上</strong> &mdash; アプリ内の AI が、できること・できないことを正しく伝えるようになりました。分からないことを推測で埋めず、必要な資料をお願いします。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "The app checks for updates on its own and will offer this version. You can also update from Settings &rarr; General &rarr; Check for updates.",
          "アプリが自動で更新を確認し、この版をご案内します。設定 &rarr;「一般」&rarr;「更新プログラムを確認」からも実行できます。",
        ],
        [
          "Your saved analyses, notes and settings are kept. Nothing needs to be re-entered.",
          "保存済みの分析・メモ・設定はそのまま残ります。入力し直す必要はありません。",
        ],
      ]),
    ],
  },
];

// ---------------------------------------------------------------- 書き出し

mkdirSync(OUT_DIR, { recursive: true });

for (const post of POSTS) {
  const html = page({
    base: "../",
    updated: post.date,
    titleEn: post.titleEn,
    titleJa: post.titleJa,
    leadEn: post.leadEn,
    leadJa: post.leadJa,
    /* **免責は最後。** 本文を読んだうえで目に入る位置に置く */
    body: [...post.body, downloadBox(), disclaimer()].join("\n\n"),
  });

  writeFileSync(join(OUT_DIR, `${post.slug}.html`), html, "utf-8");
  console.log(`generated blog/${post.slug}.html`);
}

/** 一覧。**新しい順**（`POSTS` の並びのまま） */
const list = POSTS.map(
  (post) => `        <section>
          <h2 class="text-base font-semibold text-emerald-300">
            <a href="./${post.slug}.html" class="hover:text-emerald-200">
              <span data-en>${post.titleEn}</span><span data-ja>${post.titleJa}</span>
            </a>
          </h2>
          <p class="mt-1 text-xs text-slate-600">${post.date}</p>
          <p class="mt-3 text-sm leading-relaxed text-slate-300" data-en>${post.leadEn}</p>
          <p class="mt-3 text-sm leading-relaxed text-slate-300" data-ja>${post.leadJa}</p>
        </section>`,
).join("\n\n");

writeFileSync(
  join(OUT_DIR, "index.html"),
  page({
    base: "../",
    updated: POSTS[0].date,
    titleEn: "Release notes",
    titleJa: "更新履歴",
    leadEn: "What changed in each version of StoQ AI Analyzer, newest first.",
    leadJa: "StoQ AI Analyzer の各バージョンで何が変わったかを、新しい順に掲載しています。",
    body: [list, disclaimer()].join("\n\n"),
  }),
  "utf-8",
);
console.log("generated blog/index.html");
