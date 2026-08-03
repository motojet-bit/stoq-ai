/**
 * 添付資料が、いま選んでいる銘柄のものかを確かめる。
 *
 * **別会社の資料で分析すると、結果は最後まで成立してしまう。**
 * TSLA を選んで Apple の決算資料を入れても、AI は Apple の数字で
 * 20 項目を埋め、TSLA の分析として保存される。
 * 出力を読んでも気づけないので、実行前に止める。
 */

/** 資料から読み取れた身元。 */
export interface DocumentIdentity {
  /** 資料内に出てきたティッカー候補（大文字） */
  tickers: string[];
  /** 資料の先頭寄りに出てきた企業名の候補 */
  companyNames: string[];
}

export type MatchStatus =
  /** 選択中の銘柄と一致した */
  | "match"
  /** 別の会社の資料だと判定できた */
  | "mismatch"
  /** 判定できるだけの手がかりが無い */
  | "unknown";

export interface MatchResult {
  status: MatchStatus;
  /** 資料から読み取れたティッカー（mismatch のとき）*/
  foundTicker: string | null;
  /** 資料から読み取れた企業名（分かれば） */
  foundName: string | null;
}

/**
 * 判定に使う本文の長さ。
 *
 * 表紙とヘッダーで足りる。長く取ると、本文中の競合他社への言及を
 * その資料の発行元と取り違える。
 */
const HEAD_CHARS = 3000;

/*
 * ティッカーらしき並び。
 *
 * `(NASDAQ: AAPL)` `NYSE: TSLA` `Ticker: MSFT` `証券コード 7203` を拾う。
 * **裸の大文字 3〜5 文字は拾わない。** 見出しの略語や単位（EPS, FCF, USD）を
 * 会社の識別子と取り違え、正しい資料を弾いてしまう。
 */
const TICKER_PATTERNS: RegExp[] = [
  /\b(?:NASDAQ|NYSE|AMEX|OTC|TSE|TYO)\s*[::]\s*([A-Z]{1,5}(?:\.[A-Z]{1,2})?)/g,
  // 日本語ラベルの前に \b は置けない（非 ASCII では単語境界が成立しない）
  /(?:Ticker|Symbol|ティッカー|銘柄コード|証券コード)\s*[::]\s*([A-Za-z0-9]{1,6}(?:\.[A-Za-z]{1,2})?)/gi,
  /\(\s*(?:NASDAQ|NYSE|AMEX)\s*[::]\s*([A-Z]{1,5})\s*\)/g,
];

/** 企業名らしき並び。法人格の接尾辞まで含めて拾う。 */
const COMPANY_PATTERNS: RegExp[] = [
  /\b([A-Z][A-Za-z0-9&.\-' ]{2,40}?(?:,?\s+(?:Inc|Corp|Corporation|Company|Co|Ltd|LLC|PLC|Holdings|Group|Technologies|Motors)\.?))\b/g,
  /([一-龥ァ-ヶА-я\w][^\s、。]{1,20}?(?:株式会社|ホールディングス))/g,
  /(株式会社[^\s、。]{1,20})/g,
];

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

/** 資料の先頭から、ティッカーと企業名の候補を拾う。 */
export function detectDocumentIdentity(text: string, fileName = ""): DocumentIdentity {
  // ファイル名も手がかりにする（表紙がロゴ画像だけの資料がある）
  const head = `${fileName}\n${text.slice(0, HEAD_CHARS)}`;

  const tickers = new Set<string>();
  for (const pattern of TICKER_PATTERNS) {
    for (const m of head.matchAll(pattern)) {
      const value = m[1]?.toUpperCase();
      if (value) tickers.add(value);
    }
  }

  const companyNames = new Set<string>();
  for (const pattern of COMPANY_PATTERNS) {
    for (const m of head.matchAll(pattern)) {
      const value = clean(m[1] ?? "");
      if (value.length >= 3) companyNames.add(value);
    }
  }

  return { tickers: [...tickers], companyNames: [...companyNames] };
}

/** 比較用に均す。記号と接尾辞を落として、表記ゆれを吸収する。 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(inc|corp|corporation|company|co|ltd|llc|plc|holdings|group|technologies|motors)\b\.?/g,
      "",
    )
    .replace(/株式会社|ホールディングス/g, "")
    .replace(/[^a-z0-9぀-ヿ一-鿿]/g, "");
}

/** ティッカーの本体部分（`7203.T` → `7203`、`BRK.B` → `BRK`）。 */
function baseTicker(ticker: string): string {
  return ticker.trim().toUpperCase().split(".")[0];
}

/**
 * 選択中の銘柄と資料の身元を突き合わせる。
 *
 * **判定できないときは `unknown` を返して止めない。**
 * ティッカーを書かない資料は珍しくないので、
 * 分からないだけで弾くと、正しい資料まで使えなくなる。
 */
export function checkTickerMatch(input: {
  /** 選択中のティッカー */
  selected: string;
  /** 選択中の銘柄の会社名（Yahoo から取れていれば） */
  selectedName?: string | null;
  identity: DocumentIdentity;
}): MatchResult {
  const selected = baseTicker(input.selected);
  if (selected === "") return { status: "unknown", foundTicker: null, foundName: null };

  const found = input.identity.tickers.map(baseTicker).filter((v) => v !== "");

  if (found.length > 0) {
    // 1 つでも一致すれば、その資料は対象銘柄のもの
    if (found.includes(selected)) {
      return { status: "match", foundTicker: selected, foundName: null };
    }
    return {
      status: "mismatch",
      foundTicker: found[0],
      foundName: input.identity.companyNames[0] ?? null,
    };
  }

  // ティッカーが無ければ社名で見る。**社名は一致の確認にだけ使う**
  const selectedName = normalizeName(input.selectedName ?? "");
  if (selectedName.length >= 3) {
    for (const name of input.identity.companyNames) {
      const normalized = normalizeName(name);
      if (normalized.length < 3) continue;
      if (normalized.includes(selectedName) || selectedName.includes(normalized)) {
        return { status: "match", foundTicker: null, foundName: name };
      }
    }
  }

  /*
   * **社名が違うだけでは mismatch にしない。**
   * 子会社名・ブランド名・監査法人名が先に出てくる資料があり、
   * 「一致しなかった」を「別会社だ」と読み替えると誤検知が増える。
   */
  return { status: "unknown", foundTicker: null, foundName: null };
}

/** 実行時の中止に使う合図。**AI にこの文字列を出させる。** */
export const MISMATCH_MARKER = "MISMATCH_TICKER_ERROR";

/**
 * 生成された本文の冒頭に、不一致の合図が出ていないか見る。
 *
 * **先頭 200 文字だけを見る。** 本文の途中に出てくる同じ語
 * （たとえば注意書きの引用）で誤って止めないため。
 */
export function detectMismatchSignal(raw: string): string | null {
  const head = raw.slice(0, 200);
  const index = head.indexOf(MISMATCH_MARKER);
  if (index < 0) return null;

  const rest = head.slice(index + MISMATCH_MARKER.length).replace(/^[\s::]+/, "");
  return rest.split("\n")[0].trim();
}
