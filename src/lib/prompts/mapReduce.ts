import { estimateTokens } from "@/lib/parser/tokenCount";
import { t } from "@/lib/i18n/i18n";

/**
 * 巨大な資料を分割して読ませ、あとで統合する。
 *
 * **10-K のような資料は 1 回では読み切れない。** 入力上限に収めようと
 * 切り詰めると、削った部分の情報が最初から無かったことになる。
 * 分けて要約し、要約を突き合わせるほうが、落ちる情報が少ない。
 */

/**
 * ここを超えたら分割する。
 *
 * **小さい資料まで分けない。** 分割は呼び出し回数が増えるぶん
 * 費用と時間がかかるので、1 回で読める資料はそのまま読ませる。
 */
export const SPLIT_THRESHOLD_TOKENS = 20_000;

/** 1 チャンクの目安。上限そのものではなく、要約させやすい大きさ。 */
export const CHUNK_TARGET_TOKENS = 12_000;

export interface Chunk {
  /** 1 始まりの通し番号 */
  index: number;
  /** そのチャンクが属する節の見出し（拾えれば） */
  heading: string | null;
  text: string;
}

/** 分割が要るか。 */
export function needsSplit(text: string, threshold = SPLIT_THRESHOLD_TOKENS): boolean {
  return estimateTokens(text) > threshold;
}

/*
 * 節の切れ目とみなす行。
 *
 * **意味の切れ目で分けるのが要点。** 文字数だけで切ると、
 * 表や文が途中で割れて、どちらのチャンクからも読めなくなる。
 */
const HEADING_PATTERNS: RegExp[] = [
  /^#{1,3}\s+\S/,
  /^ITEM\s+\d+[A-Z]?\.?\s/i,
  /^第\s*\d+\s*[章節]/,
  /^\d+\.\s*\S{2,}$/,
  /^【.+】$/,
];

const isHeading = (line: string) => HEADING_PATTERNS.some((p) => p.test(line.trim()));

/**
 * 資料をチャンクに割る。
 *
 * 見出しで区切り、それでも大きい塊は行単位で分ける。
 * **見出しの無い資料でも必ず割れる**ようにしておく（PDF から抽出した
 * テキストには見出しが残らないことがある）。
 */
export function splitIntoChunks(text: string, targetTokens = CHUNK_TARGET_TOKENS): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];

  let buffer: string[] = [];
  let heading: string | null = null;
  let pendingHeading: string | null = null;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body === "") {
      buffer = [];
      return;
    }
    chunks.push({ index: chunks.length + 1, heading, text: body });
    buffer = [];
    heading = pendingHeading;
    pendingHeading = null;
  };

  for (const line of lines) {
    const startsSection = isHeading(line);
    const tooBig = estimateTokens(buffer.join("\n")) >= targetTokens;

    // 見出しに当たったら、それなりに溜まっている場合だけ切る
    if (startsSection && estimateTokens(buffer.join("\n")) >= targetTokens / 3) {
      pendingHeading = line.trim();
      flush();
    } else if (tooBig) {
      // 見出しが来ないまま膨らんだ場合も切る（見出しの無い資料への保険）
      pendingHeading = heading;
      flush();
    }

    if (startsSection && buffer.length === 0 && heading === null) heading = line.trim();
    buffer.push(line);
  }

  flush();

  /*
   * **行で割れなかった塊は、文字数で割る。**
   * PDF から抽出したテキストは改行が入らず 1 行になることがあり、
   * 行単位の分割だけでは 1 つも切れない。
   */
  const split = chunks.flatMap((chunk) => forceSplit(chunk, targetTokens));
  return split.map((c, i) => ({ ...c, index: i + 1 }));
}

/** 1 チャンクが大きすぎるときに、文字数で等分する。 */
function forceSplit(chunk: Chunk, targetTokens: number): Chunk[] {
  if (estimateTokens(chunk.text) <= targetTokens) return [chunk];

  // 1 トークン ≒ 4 文字として、目安の長さに切る
  const size = Math.max(1000, targetTokens * 4);
  const parts: Chunk[] = [];
  for (let at = 0; at < chunk.text.length; at += size) {
    parts.push({
      index: chunk.index,
      heading: chunk.heading,
      text: chunk.text.slice(at, at + size),
    });
  }
  return parts;
}

/**
 * 1 チャンクを要約させる指示（Map）。
 *
 * **評価はさせない。** ここで点を付けさせると、他のチャンクを知らないまま
 * 出した点が最後まで残る。抜き出すだけにして、判断は統合側に寄せる。
 */
export function mapInstruction(chunk: Chunk, total: number): string {
  return [
    t("mapReduce.mapHeading", {
      index: chunk.index,
      total,
      heading: chunk.heading ?? t("common.none"),
    }),
    "",
    t("mapReduce.mapTask"),
    t("mapReduce.mapItem1"),
    t("mapReduce.mapItem2"),
    t("mapReduce.mapItem3"),
    t("mapReduce.mapItem4"),
    "",
    t("mapReduce.mapRule"),
    "",
    "--- DOCUMENT CHUNK ---",
    chunk.text,
  ].join("\n");
}

/**
 * 中間要約を 1 本にまとめ、統合の材料にする（Reduce の入力）。
 *
 * **どのチャンク由来かを残す。** 統合側が矛盾に気づいたときに、
 * どこを見直せばよいかが分からなくなる。
 */
export function reduceSource(summaries: { index: number; heading: string | null; text: string }[]): string {
  if (summaries.length === 0) return "";

  const sections = summaries.map((s) =>
    [
      t("mapReduce.summaryHeading", {
        index: s.index,
        heading: s.heading ?? t("common.none"),
      }),
      s.text.trim(),
    ].join("\n"),
  );

  return [t("mapReduce.reduceHeading", { count: summaries.length }), "", ...sections].join("\n\n");
}

/** 分割分析の進み具合（0〜1）。 */
export function splitProgress(input: {
  mapped: number;
  total: number;
  reducing: boolean;
}): number {
  if (input.total <= 0) return input.reducing ? 0.9 : 0;
  // 抽出に 8 割、統合に 2 割。統合は 1 回だが待ち時間は長い
  const mapPart = Math.min(1, input.mapped / input.total) * 0.8;
  return Math.min(1, input.reducing ? 0.8 + 0.15 : mapPart);
}
