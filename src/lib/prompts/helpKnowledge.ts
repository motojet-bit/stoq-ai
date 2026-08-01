import type { AppSettings, MarketProviderId } from "@/types";
import { displayBinding, isMac } from "@/lib/ui/shortcutKeys";
import { SHORTCUTS, type BindingMap } from "@/lib/ui/shortcutStore";

/**
 * ヘルプ AI に渡すナレッジベース。
 *
 * **アプリの「いまの状態」を含めて渡すのが要点。**
 * ショートカットはユーザーが変更できるので、固定の説明文だけを持たせると
 * 「Ctrl+N です」と実際と違う案内をしてしまう。
 */

const OVERVIEW = `# StoQ AI Analyzer とは
米国株・グローバル株のファンダメンタル分析デスクトップアプリ（Tauri + React）。
Yahoo Finance / SEC EDGAR から取得したデータと、ユーザーが読み込ませた一次資料
（決算短信・10-K/10-Q・決算説明会資料の PDF / DOCX / PPTX）をまとめて
LLM に渡し、20 項目のファンダメンタル評価を生成する。

# 画面の見方
- 最上部: メニューバー（ファイル / 表示 / 分析 / ヘルプ）。右端に最小化パネルの復元ボタンと文字サイズ調整
- その下: コマンドバー（ティッカー入力＋「分析」ボタン / 資料のドロップゾーン / AI設定）
- さらに下: 一時保存中の資料トレイ（トークン概算メーター付き）
- 左サイドバー: チャット履歴（📁 でアーカイブ）と「検討中銘柄」の小窓
- 中央: タブごとのワークスペース。既定は 左上＝市場データ / 左下＝対話 / 右＝分析結果
- 各パネルのヘッダー左のグリップ（サイコロの 6）をドラッグすると、パネルの位置を入れ替えられる
- 各パネルの「_」で最小化。最小化したパネルはメニューバー右端の黄色いボタンから戻せる
- 最下部: ステータスバー。右端に「?」ヘルプボタン

# 使い方の流れ
1. 設定（AI設定ボタン）で LLM の APIキーとモデルを登録する
2. 上部にティッカーを入力して「分析」を押すと、株価・指標・SEC 提出状況を取得する
3. 決算資料などをドロップゾーンに入れる（PDF / DOCX / PPTX / HTML / TXT / MD / CSV）
4. 分析結果パネルの「AI分析を実行」を押すと、20 項目の評価が生成される
5. 生成結果は SQLite に自動保存され、同じ銘柄のタブを開くと復元される

# 分析のコツ
- 一次資料を入れないと、財務指標と SEC 情報だけの評価になる。決算説明会資料を足すと精度が上がる
- 資料が長いときは自動で圧縮されるが、**要約ではなく原文抽出**なので事実の改変は起きない
- 対話パネルのヘッダーから AI の「役割」を切り替えると、評価の観点が変わる
- 四半期モメンタムは YoY（前年同期比）が主軸。QoQ だけで判断しない

# APIキーの設定方法
- 上部の「AI設定」ボタン、メニューの「ファイル > 設定…」、または「ヘルプ > APIキーの設定…」から設定画面を開く
- 「APIキー・モデル」タブで OpenAI / Anthropic / Gemini のキーとモデル名を登録する
- OpenAI互換 API（DeepSeek / Moonshot / OpenRouter など）は「プロバイダーを追加」で任意個追加できる
- **キーは OS のアプリ設定ディレクトリに保存され、画面にはマスク済み文字列しか表示されない**
- SEC EDGAR は「アプリ名 メールアドレス」形式の User-Agent が必須。同じ画面で設定する`;

const PROVIDERS = `# データ取得元（設定画面の「データ取得元」タブ）
| 取得元 | キー | 位置づけ |
| --- | --- | --- |
| Yahoo Finance | 不要 | 非公式取得。個人利用・デモ向けで、将来の動作保証はない |
| Financial Modeling Prep (FMP) | 必要 | 公式 API。安定していて商用利用にも向く。**推奨**。無料枠あり/有料 |
| Alpha Vantage | 必要 | 公式 API。無料枠あり/有料。無料枠はレート制限が厳しい |

- FMP のキーは https://site.financialmodelingprep.com/developer/docs で取得する
- Alpha Vantage のキーは https://www.alphavantage.co/support/#api-key で取得する
- キーを登録したら「接続テスト」で疎通を確認できる
- 四半期推移（4Q モメンタム）は SEC XBRL との突き合わせが要るため、
  取得元の選択にかかわらず Yahoo Finance ＋ SEC EDGAR を使う`;

const RULES = `# 回答のしかた
- 日本語で、丁寧かつ簡潔に答える
- 手順は「どのボタンを押すか」まで具体的に示す
- **このアプリに無い機能を、あるかのように答えない。** 分からないことは分からないと言う
- 投資判断そのもの（買うべきか等）は助言しない。操作方法とアプリの見方の案内に徹する
- ショートカットキーを聞かれたら、下の「現在の割り当て」をそのまま答える（既定値ではなく実際の設定）`;

/** 現在のショートカット割り当てを表にする。 */
export function shortcutTable(bindings: BindingMap, mac = isMac()): string {
  const rows = SHORTCUTS.map(
    (def) => `| ${def.label} | ${displayBinding(bindings[def.action], mac)} | ${def.hint} |`,
  );
  return ["| 操作 | キー | 説明 |", "| --- | --- | --- |", ...rows].join("\n");
}

/** 現在のアプリ設定を要約する。 */
export function settingsSummary(settings: AppSettings | null): string {
  if (!settings) return "# 現在の設定\n読み込めていません。";

  const configured = settings.keys
    .filter((k) => k.configured && !k.provider.startsWith("market:"))
    .map((k) => k.provider);
  const market = settings.marketProviders.find((p) => p.id === settings.marketProvider);

  return [
    "# 現在の設定",
    `- LLM プロバイダ: ${settings.provider}`,
    `- APIキー登録済み: ${configured.length > 0 ? configured.join(", ") : "なし"}`,
    `- データ取得元: ${market?.label ?? settings.marketProvider}` +
      (market && !market.ready ? `（未設定: ${market.reason ?? ""}）` : ""),
    `- SEC User-Agent: ${settings.secUserAgent ? "設定済み" : "未設定（SEC の取得ができません）"}`,
  ].join("\n");
}

/** ヘルプ AI のシステムプロンプトを組み立てる。 */
export function buildHelpSystemPrompt(
  settings: AppSettings | null,
  bindings: BindingMap,
  mac = isMac(),
): string {
  return [
    "あなたは StoQ AI Analyzer の操作案内AIアシスタントです。" +
      "アプリの機能、ショートカットキー一覧、APIキーの設定方法、" +
      "データプロバイダーの違いなどを丁寧に解説してください。",
    OVERVIEW,
    PROVIDERS,
    `# ショートカットキー（現在の割り当て）\n${shortcutTable(bindings, mac)}\n` +
      "変更は設定画面の「ショートカット」タブから行う。" +
      "「変更」を押してから割り当てたいキーを押す（Esc で中止、✕ で既定に戻す）。",
    settingsSummary(settings),
    RULES,
  ].join("\n\n");
}

/** 最初に見せる質問例。何を聞けばよいか分からない人向け。 */
export const HELP_EXAMPLES: string[] = [
  "ショートカットキーはどこで変える？",
  "FMP のキーはどう入手する？",
  "分析のコツは？",
  "検討中銘柄はどう登録する？",
];

/** 取得元 ID から表示名を引く（UI とプロンプトで表記を揃えるため）。 */
export function marketLabel(id: MarketProviderId): string {
  switch (id) {
    case "fmp":
      return "Financial Modeling Prep";
    case "alphavantage":
      return "Alpha Vantage";
    default:
      return "Yahoo Finance";
  }
}
