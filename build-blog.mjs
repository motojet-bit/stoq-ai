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
    slug: "v0-9-12",
    date: "2026-09-05",
    version: "0.9.12",
    titleEn: "Version 0.9.12",
    titleJa: "バージョン 0.9.12",
    leadEn: "The top toolbar and the fiscal period shown on results are easier to read.",
    leadJa: "上部の操作バーと、分析結果の決算期表示を改良しました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>The top toolbar no longer overlaps</strong> &mdash; the ticker box, the document drop area and the buttons on the right sit on their own rows at any window width.",
          "<strong>上部の操作バーの表示を改良しました</strong> &mdash; 銘柄入力・資料のドロップ領域・右のボタンが、窓の幅にかかわらず重ならなくなりました。",
        ],
        [
          "<strong>Results show the fiscal period, not a bare date</strong> &mdash; for example <code>FY2027 Q2 (period ended 2026-07-26)</code> instead of just the end date.",
          "<strong>分析結果の決算期表示を改良しました</strong> &mdash; 日付だけではなく、<code>FY2027 Q2（期末 2026-07-26）</code> のように決算期と並べて出ます。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "Nothing needs redoing. Saved analyses keep the wording they were generated with.",
          "やり直していただくことはありません。保存済みの分析は生成したときのままです。",
        ],
        [
          "Your licence key, saved analyses, notes and settings are kept as they are.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-11",
    date: "2026-09-04",
    version: "0.9.11",
    titleEn: "Version 0.9.11",
    titleJa: "バージョン 0.9.11",
    leadEn: "Japanese filings can now be read.",
    leadJa: "日本語の決算資料を取り込めるようになりました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>Japanese filings now import</strong> &mdash; documents that used to be rejected as &ldquo;an image-only PDF&rdquo; are read properly.",
          "<strong>日本語の決算資料を取り込めます</strong> &mdash; これまで「画像だけの PDF」と表示されて読み込めなかった資料が読めるようになりました。",
        ],
        [
          "<strong>PDF export remembers the page orientation</strong> &mdash; you no longer have to pick landscape every time.",
          "<strong>PDF で書き出すときの用紙の向きを覚えます</strong> &mdash; 毎回選び直す必要がなくなりました。",
        ],
        [
          "<strong>The download notice closes anywhere</strong> &mdash; click outside the card instead of hunting for the &times;.",
          "<strong>ダウンロードの通知カードを、画面のどこかを押せば閉じられます</strong> &mdash; ×印を探さずに済みます。",
        ],
        [
          "<strong>A tidier record list</strong> &mdash; tickers with no analyses left are removed from the list.",
          "<strong>分析記録の一覧を改良しました</strong> &mdash; 記録の無くなった銘柄が一覧に残らなくなりました。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "If a document failed to import before, try it again &mdash; nothing else needs redoing.",
          "取り込めなかった資料は、もう一度お試しください。ほかにやり直していただくことはありません。",
        ],
        [
          "Your licence key, saved analyses, notes and settings are kept as they are.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-10",
    date: "2026-08-28",
    version: "0.9.10",
    titleEn: "Version 0.9.10",
    titleJa: "バージョン 0.9.10",
    leadEn: "Better exports of your analysis.",
    leadJa: "分析結果の書き出しを改良しました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>The file name now carries the fiscal period you actually read</strong> &mdash; taken from the filing itself, not from the day you exported it.",
          "<strong>書き出したファイルの名前と見出しに、読んだ決算資料の決算期が入ります</strong> &mdash; 書き出した日ではなく、資料そのものから取ります。",
        ],
        [
          "<strong>When the period cannot be determined, it says so</strong> &mdash; the file is labelled &ldquo;period unknown&rdquo; rather than left blank.",
          "<strong>決算期が分からないときは「期不明」と表示します</strong> &mdash; 空欄にせず、分からないことが分かるようにしました。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "Files you exported before keep the name they were given. Only new exports are affected.",
          "すでに書き出したファイルの名前は変わりません。これから書き出すぶんに反映されます。",
        ],
        [
          "Your licence key, saved analyses, notes and settings are kept as they are.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-9",
    date: "2026-08-28",
    version: "0.9.9",
    titleEn: "Version 0.9.9",
    titleJa: "バージョン 0.9.9",
    leadEn: "More accurate analysis of past fiscal periods.",
    leadJa: "過去の決算期を分析するときの精度を上げました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>Everything is now taken as of that period</strong> &mdash; when you analyse a past quarter, the quarterly trend and the share price are both from that point in time, not today.",
          "<strong>当時の資料と株価に揃えました</strong> &mdash; 過去の期を選ぶと、四半期推移も株価もその時点のものを使います。今日の数字が混ざりません。",
        ],
        [
          "<strong>Only one window</strong> &mdash; opening the app a second time brings the existing window to the front.",
          "<strong>二重起動を止めました</strong> &mdash; 2 つ目を開くと、いま開いている画面が前に出ます。",
        ],
        [
          "<strong>Better exports</strong> &mdash; export one file per fiscal period, and the file name now matches what is inside.",
          "<strong>書き出しを改良</strong> &mdash; 決算期ごとに分けて書き出せます。ファイル名も中身に合わせました。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "Your licence key, saved analyses, notes and settings are kept as they are.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-8",
    date: "2026-08-28",
    version: "0.9.8",
    titleEn: "Version 0.9.8",
    titleJa: "バージョン 0.9.8",
    leadEn: "You can now choose which fiscal period to analyse.",
    leadJa: "分析の期を、ご自身で選べるようになりました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>A better setup screen</strong> &mdash; choose which fiscal period to analyse (full years too). Pick the SEC filings to read, preview them, and save the originals before you run.",
          "<strong>分析開始画面を改良</strong> &mdash; いつの決算で分析するかを選べます（通期も）。SEC の書類を選び、中身を確かめてから実行できます。原本の保存もできます。",
        ],
        [
          "<strong>Better analysis of past periods</strong> &mdash; the 10-K, the earnings release and the share price are all taken as of that period.",
          "<strong>過去の期の分析を改良</strong> &mdash; その期の 10-K・決算発表資料・当時の株価を使います。",
        ],
        [
          "<strong>Better exports</strong> &mdash; the PDF now lists the sources used, and you can export a single period.",
          "<strong>書き出しを改良</strong> &mdash; PDF に「分析に使った資料」が入り、決算期を選んで書き出せます。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "Your licence key, saved analyses, notes and settings are kept as they are.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-6",
    date: "2026-08-26",
    version: "0.9.6",
    titleEn: "Version 0.9.6",
    titleJa: "バージョン 0.9.6",
    leadEn: "Improvements to how the setup screen shown before an analysis presents things.",
    leadJa: "分析開始画面の表現を改善しました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>A tidier setup screen</strong> &mdash; the list of SEC filings now appears in one place instead of two.",
          "<strong>分析開始画面の表現を整理</strong> &mdash; SEC の書類の一覧を 1 か所にまとめました。",
        ],
        [
          "<strong>Fiscal periods are shown</strong> &mdash; each SEC filing now says which period it covers (for example <code>FY2026 Q3</code>), not just when it was filed.",
          "<strong>決算期を表示</strong> &mdash; SEC の書類がどの期のものか（例: <code>FY2026 Q3</code>）が分かるようになりました。提出日だけでは分かりませんでした。",
        ],
        [
          "<strong>Better handling of fiscal periods</strong> &mdash; choosing a period now works correctly for companies whose financial year does not end in December.",
          "<strong>決算期の取り扱いを改善</strong> &mdash; 12 月決算以外の企業でも、期の指定が正しく働くようになりました。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "Your licence key, saved analyses, notes and settings are kept as they are.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-5",
    date: "2026-08-25",
    version: "0.9.5",
    titleEn: "Version 0.9.5",
    titleJa: "バージョン 0.9.5",
    leadEn: "Improvements to the setup screen shown before an analysis, and to the chat composer.",
    leadJa: "分析開始時の初期設定画面と、対話画面の入力まわりを改良しました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>The setup screen shown before an analysis</strong> &mdash; you can now choose which SEC filings to read (10-Q and 10-K) with checkboxes. Both are ticked by default; untick anything you do not need.",
          "<strong>分析開始時の初期設定画面を改良</strong> &mdash; SEC から読む書類（10-Q・10-K）を<strong>チェックボックスで選べる</strong>ようになりました。既定では両方にチェックが入っています。不要なものがあれば外してください。",
        ],
        [
          "<strong>The chat composer</strong> &mdash; how much you are about to send is now shown before you press send.",
          "<strong>対話画面の入力まわりを改良</strong> &mdash; 送る量が<strong>押す前に分かる</strong>ようになりました。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "Your licence key, saved analyses, notes and settings are kept as they are. The consent screen does not appear again.",
          "ライセンスキー・保存済みの分析・メモ・設定はそのままです。同意画面が再び出ることもありません。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-4",
    date: "2026-08-25",
    version: "0.9.4",
    titleEn: "Version 0.9.4",
    titleJa: "バージョン 0.9.4",
    leadEn:
      "System requirements are now stated up front, and the installer asks before fetching anything.",
    leadJa:
      "動作環境の案内を追加しました。アプリの機能に変更はありません。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>The installer asks first</strong> &mdash; if the Microsoft Edge WebView2 Runtime is not found on your PC, the installer now tells you and asks whether to download and install it (about 2 MB). Until now it did so without saying anything.",
          "<strong>インストーラーが先に尋ねます</strong> &mdash; Microsoft Edge WebView2 ランタイムがパソコンに見つからない場合、取得してインストールしてよいかを確認するようになりました（約 2 MB）。これまでは何も言わずに導入していました。",
        ],
        [
          "<strong>System requirements</strong> &mdash; they are now written at the top of the licence agreement shown during installation, and on the sales page.",
          "<strong>動作環境</strong> &mdash; インストール時に表示される使用許諾契約書の冒頭と、販売ページに記載しました。",
        ],
      ]),
      section("What the app needs", "動作環境", [
        [
          "Windows 10 or 11 (64-bit); the Microsoft Edge WebView2 Runtime; an internet connection; and your own API keys for the AI and market-data providers.",
          "Windows 10 または 11（64bit）／Microsoft Edge WebView2 ランタイム／インターネット接続／AI と市場データの APIキー（ご自身でご用意ください）。",
        ],
        [
          "<strong>Neither the .NET Framework nor the Visual C++ Redistributable is required.</strong> The WebView2 Runtime ships with Windows 11 and is already present on most Windows 10 machines, so in most cases nothing extra is installed.",
          "<strong>.NET Framework と Visual C++ 再頒布可能パッケージは必要ありません。</strong> WebView2 ランタイムは Windows 11 に標準で入っており、Windows 10 でも多くの場合すでに導入されているため、たいていは何も追加されません。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "<strong>Nothing changes for you.</strong> The app itself is unchanged, and the consent screen does not appear again. Your licence key, saved analyses, notes and settings are kept as they are.",
          "<strong>とくに何もありません。</strong> アプリ本体に変更は無く、同意画面が再び出ることもありません。ライセンスキー・保存済みの分析・メモ・設定はそのままです。",
        ],
      ]),
    ],
  },
  {
    slug: "v0-9-3",
    date: "2026-08-25",
    version: "0.9.3",
    titleEn: "Version 0.9.3",
    titleJa: "バージョン 0.9.3",
    leadEn:
      "The licence terms are now shown during installation, and the in-app consent list has been extended.",
    leadJa:
      "利用条件（使用許諾契約書）の追加です。インストール時に表示されるようになりました。",
    body: [
      section("What changed", "変更点", [
        [
          "<strong>Licence agreement at install time</strong> &mdash; the installer now shows an End User Licence Agreement, in Japanese and English, which you accept before the app is installed.",
          "<strong>インストール時の使用許諾契約書</strong> &mdash; インストーラーに使用許諾契約書のページを追加しました（日本語・英語）。インストールの前にご確認いただけます。",
        ],
        [
          "<strong>What you may not do</strong> &mdash; the consent list inside the app now states plainly that copying, redistribution and reverse engineering are not permitted. The same points are on the sales page and in the Terms of Use.",
          "<strong>禁止事項</strong> &mdash; アプリ内の同意事項に「複製・再頒布・リバースエンジニアリングの禁止」を追加しました。同じ内容を販売ページと利用規約にも掲載しています。",
        ],
      ]),
      section("If you are already using it", "すでにお使いの方へ", [
        [
          "<strong>The consent screen appears once more after this update.</strong> Points have been added since you last accepted, so we ask you to read them and confirm again.",
          "<strong>更新後の初回起動時に、同意画面がもう一度表示されます。</strong> 前回ご同意いただいたあとに項目を追加したため、あらためてご確認をお願いします。",
        ],
        [
          "Your licence key stays valid &mdash; there is nothing to re-enter. Saved analyses, notes and settings are kept as they are.",
          "ライセンスキーは有効なままです。入れ直す必要はありません。保存済みの分析・メモ・設定もそのまま残ります。",
        ],
        [
          "The app checks for updates on its own and will offer this version. You can also update from Settings &rarr; General &rarr; Check for updates.",
          "アプリが自動で更新を確認し、この版をご案内します。設定 &rarr;「一般」&rarr;「更新プログラムを確認」からも実行できます。",
        ],
      ]),
    ],
  },
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
