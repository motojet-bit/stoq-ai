import { estimateTokens } from "@/lib/parser/tokenCount";

/**
 * 長文資料のスマート圧縮。
 *
 * **単純な中間カット（head-tail）は使わない。**
 * 決算資料や書き起こしでは、セグメント業績・ガイダンス・アナリスト Q&A といった
 * 最重要情報が中盤に集中するため、中間を落とすと分析価値が失われる。
 *
 * 代わりに次の順で圧縮する。
 * 1. 資料を構造（見出し・ページ・スライド・Q&A）でセクションに分割する
 * 2. 各セクションを「分析価値」で採点する（キーワード + 数値密度 − 定型文）
 * 3. 予算を配点に比例して配り、収まるセクションは全量残す
 * 4. はみ出すセクションだけ**文単位で抽出圧縮**する（重要な文を原文のまま残す）
 * 5. 落とした箇所には必ずマーカーを残し、欠落を可視化する
 *
 * 文はすべて原文のまま残すため、要約による事実の改変（幻覚）が起きない。
 */

export interface CondenseResult {
  text: string;
  /** UI にそのまま出せる日本語の説明 */
  notes: string[];
}

interface Section {
  title: string;
  body: string;
  score: number;
  tokens: number;
}

// ---------------------------------------------------------------- 採点

/** 分析価値の高い語ほど重い。日本語・英語の両方を見る。 */
const KEYWORD_WEIGHTS: { words: string[]; weight: number }[] = [
  {
    weight: 3,
    words: [
      "セグメント", "segment", "事業別", "地域別",
      "質疑応答", "q&a", "質問", "回答", "アナリスト",
      "ガイダンス", "guidance", "見通し", "outlook", "通期", "業績予想", "forecast",
    ],
  },
  {
    weight: 2,
    words: [
      "売上", "revenue", "net sales",
      "営業利益", "operating income", "operating margin",
      "純利益", "net income", "利益率", "margin", "粗利", "gross",
      "eps", "一株当たり", "earnings per share",
      "キャッシュフロー", "cash flow", "フリーキャッシュ", "free cash",
      "成長率", "growth", "前年同期", "yoy", "前四半期", "qoq",
      "受注", "backlog", "arr", "解約", "churn",
      "設備投資", "capex", "配当", "dividend", "自社株買い", "buyback",
      "在庫", "inventory", "顧客", "customer", "シェア", "share",
    ],
  },
  {
    weight: 1,
    words: [
      "リスク", "risk", "訴訟", "litigation", "規制", "regulation",
      "為替", "currency", "競合", "competition", "戦略", "strategy",
      "投資", "investment", "買収", "acquisition", "人員", "headcount",
    ],
  },
];

/** 情報価値がほぼ無い定型文。強い減点をして真っ先に落とす。 */
const BOILERPLATE = [
  "将来見通しに関する注意", "将来に関する記述", "forward-looking statement", "safe harbor",
  "免責事項", "disclaimer", "本資料に含まれる", "いかなる保証", "予告なく変更",
  "all rights reserved", "無断転載", "禁じられて", "著作権", "copyright",
  "本プレゼンテーション", "このプレゼンテーション", "注記事項",
];

/** 分析価値の点数。1 文にも 1 セクションにも使える。 */
function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const group of KEYWORD_WEIGHTS) {
    for (const word of group.words) {
      if (lower.includes(word)) score += group.weight;
    }
  }

  for (const phrase of BOILERPLATE) {
    if (lower.includes(phrase)) score -= 5;
  }

  // 数値が多い箇所（業績テーブルなど）は価値が高い
  const digits = (text.match(/\d/g) ?? []).length;
  const density = digits / Math.max(text.length, 1);
  score += Math.min(density * 40, 6);

  return score;
}

// ---------------------------------------------------------------- 分割

/** 見出しらしい行かどうか。 */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 80) return false;

  return (
    /^---\s*(p\.|slide)\s*\d+/i.test(t) || // 自前のページ / スライド区切り
    /^#{1,6}\s/.test(t) || // Markdown 見出し
    /^item\s*\d+[a-z]?\.?\s/i.test(t) || // SEC の Item
    /^[【〔［\[(（]/.test(t) || // 【セグメント別業績】
    /^[■●◆▼○□・]/.test(t) ||
    // Q: / A: は見出しにしない。1 問 1 答を別セクションに割ると、
    // Q&A だけで予算を食い尽くしてセグメント業績などが落ちてしまう。
    /^\d+[-.）)]\s?\S/.test(t) || // 1. / 1-1
    (/^[A-Z0-9 &/,'-]{6,}$/.test(t) && !/[.。]$/.test(t)) // ALL CAPS 見出し
  );
}

/** 資料を構造単位に分割する。見出しが無ければ空行のまとまりで区切る。 */
function splitSections(text: string): Section[] {
  const lines = text.split("\n");
  const chunks: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } = { title: "冒頭", lines: [] };

  for (const line of lines) {
    if (!isHeading(line)) {
      current.lines.push(line);
      continue;
    }

    const hasContent = current.lines.some((l) => l.trim().length > 0);
    if (hasContent) {
      chunks.push(current);
    } else if (current.title !== "冒頭") {
      // 見出しが連続する場合（例: 「質疑応答」の直後に「Q: …」）、
      // 前の見出しを本文なしのセクションとして残す。上書きすると章題が消える。
      chunks.push({ title: current.title, lines: [] });
    }
    current = { title: line.trim(), lines: [] };
  }
  chunks.push(current);

  const sections = chunks
    .map((c) => {
      const body = c.lines.join("\n").trim();
      const full = `${c.title}\n${body}`;
      return { title: c.title, body, score: scoreText(full), tokens: estimateTokens(full) };
    })
    .filter((s) => s.body.length > 0 || s.title.length > 0);

  // 見出しが一切無い資料は 1 セクション扱いになる。段落で分けておく。
  if (sections.length === 1 && sections[0].tokens > 2000) {
    return splitByParagraph(text);
  }
  return sections;
}

function splitByParagraph(text: string): Section[] {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
  // 細かすぎると配分が効かないので、おおよそ 20 個にまとめる
  const groupSize = Math.max(1, Math.ceil(blocks.length / 20));
  const sections: Section[] = [];

  for (let i = 0; i < blocks.length; i += groupSize) {
    const body = blocks.slice(i, i + groupSize).join("\n\n");
    sections.push({
      title: `（本文 ${sections.length + 1}）`,
      body,
      score: scoreText(body),
      tokens: estimateTokens(body),
    });
  }
  return sections;
}

// ---------------------------------------------------------------- 文単位の抽出圧縮

/** 単位つきの数値（287億ドル / 14.1% など）を含むか。 */
function hasFigure(text: string): boolean {
  return /\d[\d,.]*\s*(%|％|億|兆|百万|万|billion|million|ドル|円|usd|jpy)/i.test(text);
}

/**
 * 数値明細のセクションか（セグメント別業績・業績ハイライトなど）。
 *
 * 同じ形の行が並び、その大半に金額や増減率が入っているものを指す。
 * こうした表は一部だけ残すと誤読を招くため、圧縮時に優先して丸ごと確保する。
 */
function isDataSection(section: Section): boolean {
  const sentences = splitSentences(section.body);
  if (sentences.length < 3) return false;
  const withFigure = sentences.filter(hasFigure).length;
  return withFigure / sentences.length >= 0.6;
}

/**
 * 文単位の加点。
 *
 * 業績数値の入った文（「売上高は512億ドル、前年同期比8.2%増」）は
 * 分析にそのまま使えるため、確実に残るよう強く優遇する。
 */
function sentenceBonus(text: string): number {
  let bonus = 0;

  // 金額・パーセントなど、単位つきの数値を含む
  const figures = text.match(
    /\d[\d,.]*\s*(%|％|億|兆|百万|万|billion|million|ドル|円|usd|jpy)/gi,
  );
  if (figures) bonus += Math.min(figures.length * 2.5, 7);

  // Q&A の一問一答は対で価値がある
  if (/^(q|a|質問|回答)\s*[:：.]/i.test(text.trim())) bonus += 3;

  return bonus;
}

/**
 * 日本語（。！？）と英語（.!?）の両方で文に割る。改行も区切りとして扱う。
 *
 * Q&A は質問と回答をひとかたまりにする。片方だけ残っても分析に使えないため。
 */
function splitSentences(text: string): string[] {
  const raw = text
    .split(/(?<=[。．！？!?])\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const units: string[] = [];
  for (const sentence of raw) {
    const isAnswer = /^(a|回答)\s*[:：.]/i.test(sentence);
    const prevIsQuestion =
      units.length > 0 && /^(q|質問)\s*[:：.]/i.test(units[units.length - 1]);

    if (isAnswer && prevIsQuestion) {
      units[units.length - 1] += `\n${sentence}`;
    } else {
      units.push(sentence);
    }
  }
  return units;
}

/**
 * セクションを予算内に収める。重要な文を**原文のまま**選んで順序を保つ。
 * 落とした箇所には省略マーカーを入れる。
 */
function condenseSection(section: Section, budgetTokens: number): string {
  const header = section.title;
  const headerTokens = estimateTokens(header);
  const bodyBudget = Math.max(budgetTokens - headerTokens, 40);

  const sentences = splitSentences(section.body);
  if (sentences.length === 0) return header;

  const scored = sentences.map((text, index) => ({
    index,
    text,
    tokens: estimateTokens(text),
    // トークン数で割ると短い文ばかりが残り、情報量の多い文
    // （「サービス部門の売上高は287億ドル、前年同期比14.1%増」など）が落ちる。
    // 長さのペナルティを弱め（0.35 乗）、冗長な文だけを不利にする。
    value:
      (scoreText(text) + sentenceBonus(text) + 1) /
      Math.pow(Math.max(estimateTokens(text), 1), 0.35),
  }));

  const keep = new Set<number>();
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.value - a.value)) {
    if (used + s.tokens > bodyBudget) continue;
    keep.add(s.index);
    used += s.tokens;
  }

  // 何も入らないほど予算が小さい場合でも、先頭の 1 文は残す
  if (keep.size === 0) keep.add(0);

  const parts: string[] = [];
  let dropped = 0;
  for (const s of scored) {
    if (keep.has(s.index)) {
      if (dropped > 0) {
        parts.push(`…（${dropped}文を省略）…`);
        dropped = 0;
      }
      parts.push(s.text);
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0) parts.push(`…（${dropped}文を省略）…`);

  return `${header}\n${parts.join("\n")}`;
}

// ---------------------------------------------------------------- 本体

/**
 * 資料を予算内に圧縮する。
 *
 * 予算内に収まっていればそのまま返す。
 */
export function condenseDocument(
  text: string,
  budgetTokens: number,
  label: string,
): CondenseResult {
  const original = estimateTokens(text);
  if (original <= budgetTokens) return { text, notes: [] };

  const sections = splitSections(text);
  if (sections.length === 0) return { text: "", notes: [] };

  // 価値の低いセクション（定型文など）は最初に切り捨て候補にする
  const positives = sections.filter((s) => s.score > 0);
  const pool = positives.length > 0 ? positives : sections;
  const droppedLowValue = sections.length - pool.length;

  const allocations = new Map<Section, number>();

  // ① 数値明細セクション（セグメント別業績・業績ハイライトなど）を丸ごと確保する。
  //    一部の行だけ残すと「最も伸びている事業だけ欠けた表」になり、
  //    分析を誤らせるため、全量入るなら優先的に枠を取る。
  let remaining = budgetTokens;
  const dataSections = pool
    .filter(isDataSection)
    .sort((a, b) => b.score - a.score);

  for (const s of dataSections) {
    // 予算を食い尽くさない範囲で確保する。
    // 数値明細は分析価値が高いので、他のセクションより優先度を上げてある
    // （0.75 = 残り予算の 3/4 まで 1 セクションに割り当てる）。
    if (s.tokens <= remaining * 0.75) {
      allocations.set(s, s.tokens);
      remaining -= s.tokens;
    }
  }

  // ② 残りを配点 × 分量で按分する。
  //    配点だけで按分すると、中身の詰まったセクションが短いセクションと
  //    同じ枠しかもらえず明細が落ちるため、分量も加味する。
  const weight = (s: Section) =>
    Math.pow(Math.max(s.score, 0.1), 1.5) * Math.sqrt(Math.max(s.tokens, 1));
  const rest = pool.filter((s) => !allocations.has(s));
  const totalScore = rest.reduce((sum, s) => sum + weight(s), 0) || 1;

  let leftover = 0;
  const overflowing: Section[] = [];

  for (const s of rest) {
    const share = Math.floor((remaining * weight(s)) / totalScore);
    if (s.tokens <= share) {
      allocations.set(s, s.tokens);
      leftover += share - s.tokens;
    } else {
      allocations.set(s, share);
      overflowing.push(s);
    }
  }

  if (overflowing.length > 0 && leftover > 0) {
    const bonus = Math.floor(leftover / overflowing.length);
    for (const s of overflowing) {
      allocations.set(s, (allocations.get(s) ?? 0) + bonus);
    }
  }

  const parts: string[] = [];
  for (const s of pool) {
    const budget = allocations.get(s) ?? 0;
    parts.push(
      s.tokens <= budget ? `${s.title}\n${s.body}`.trim() : condenseSection(s, budget),
    );
  }

  const result = parts.join("\n\n").trim();
  const notes = [
    `「${label}」が長いため、セクション（見出し・ページ・Q&A）ごとに分析価値を採点し、` +
      `重要な文を原文のまま残す方式で ${Math.round((estimateTokens(result) / original) * 100)}% に圧縮しました` +
      `（中間の一括カットはしていません）。`,
  ];
  if (droppedLowValue > 0) {
    notes.push(
      `「${label}」の定型文セクション ${droppedLowValue} 件（免責事項・将来見通しの注意書き等）を除外しました。`,
    );
  }

  return { text: result, notes };
}
