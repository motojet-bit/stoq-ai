import { appName } from "@/lib/ui/appMeta";

/**
 * 初心者向けの案内文。
 *
 * **表示場所ごとに散らさず 1 か所にまとめる。**
 * 同じ機能の説明が画面によって食い違うのを防ぐため。
 */
export const TOOLTIPS = {
  help:
    "操作で迷ったらここをクリック！\n" +
    "AIアシスタントが使い方を何でも案内します",

  shortcuts:
    "💡 ヒント: 無理に全部覚える必要はありません。\n" +
    "一度設定をクリアして、よく使う操作だけを\n" +
    "好きなキーに割り当てるのがおすすめです",

  promptRole:
    "💡 提示される数値だけでなく、CAPEX（設備投資）過多による\n" +
    "業界全体の価格競争（泥沼化）リスクなど、\n" +
    "定性面も考慮して総合判断しましょう",

  candidates:
    "AIで出したティッカーリスト（AAPL|Apple|Phone など）を\n" +
    "そのまま貼り付けて一括ストックできます",

  ticker:
    "💡 米国株は `AAPL` や `NVDA`、\n" +
    "日本株は `7203.T`（トヨタ）や `9984.T` のように\n" +
    "末尾に `.T` を付けて入力してください",

  thresholds:
    "AI が合格/不合格を判定する基準です。\n" +
    "成長株を探すなら成長率を高く、割安株なら PER を低く。\n" +
    "設定した数値はそのままプロンプトに埋め込まれます",
} as const;

/**
 * 機能リクエストの宛先。ヘルプ画面から案内する。
 * `mailto:` なので、押すと利用者の既定メーラーが件名つきで立ち上がる。
 */
export const FEATURE_REQUEST_EMAIL = "xxxx@xxx.com";
/** 件名には**そのときの表示名**を入れるので、定数ではなく関数にする。 */
export function featureRequestUrl(): string {
  return (
    `mailto:${FEATURE_REQUEST_EMAIL}` +
    `?subject=${encodeURIComponent(`【${appName()}】機能リクエスト`)}`
  );
}
