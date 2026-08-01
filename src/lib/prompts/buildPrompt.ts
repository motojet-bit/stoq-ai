import { estimateTokens } from "@/lib/parser/tokenCount";
import { buildSystemPrompt } from "@/lib/prompts/systemPrompt";
import type { Fundamentals } from "@/types";

/** プロンプトに載せる 1 件の一次資料 */
export interface PromptDocument {
  name: string;
  text: string;
}

/** SEC 提出書類の本文 */
export interface PromptFiling {
  form: string;
  filed: string;
  period: string;
  url: string;
  text: string;
}

export interface PromptSources {
  ticker: string;
  fundamentals: Fundamentals | null;
  filing: PromptFiling | null;
  documents: PromptDocument[];
  /** 入力トークンの上限（設定の maxPromptTokens） */
  tokenLimit: number;
  /** 応答のために空けておくトークン数 */
  reserveForOutput: number;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  /** 全体の概算トークン数 */
  tokens: number;
  /** 切り詰めが起きた場合の説明。UI にそのまま出せる日本語 */
  notes: string[];
}

/** SEC 本文からこの順で拾う。10-K / 10-Q で分析価値が高い節。 */
const KEY_SECTIONS = [
  { pattern: /item\s*1a\.?\s*risk\s*factors/i, label: "Item 1A. Risk Factors" },
  {
    pattern: /item\s*7\.?\s*management'?s?\s*discussion/i,
    label: "Item 7. MD&A",
  },
  {
    pattern: /item\s*2\.?\s*management'?s?\s*discussion/i,
    label: "Item 2. MD&A (10-Q)",
  },
  { pattern: /item\s*1\.?\s*business/i, label: "Item 1. Business" },
  {
    pattern: /item\s*7a\.?\s*quantitative\s*and\s*qualitative/i,
    label: "Item 7A. Market Risk",
  },
];

/**
 * 財務データ・SEC 提出書類・一次資料を 1 本のプロンプトに詰める。
 *
 * トークン上限を超えないよう、優先度に応じて配分する。
 * 1. 財務指標 — 小さいので常に全量
 * 2. ユーザーが投入した一次資料 — 意図的に選ばれたものなので優先
 * 3. SEC 提出書類 — 最も大きいので最初に切り詰める
 */
export function buildAnalysisPrompt(sources: PromptSources): BuiltPrompt {
  const notes: string[] = [];
  const system = buildSystemPrompt();

  const header = buildHeader(sources.ticker);
  const metrics = buildMetricsSection(sources.fundamentals);

  const fixedTokens =
    estimateTokens(system) +
    estimateTokens(header) +
    estimateTokens(metrics) +
    // 見出しや区切りの分の余裕
    500;

  const available = sources.tokenLimit - sources.reserveForOutput - fixedTokens;

  if (available <= 0) {
    notes.push(
      "トークン上限が小さすぎるため、財務指標のみで分析します。設定で上限を引き上げてください。",
    );
    return finish(system, [header, metrics], notes);
  }

  // 資料と SEC で予算を分ける。片方が使い切らなければ他方へ回す。
  const docsTokens = sources.documents.reduce((s, d) => s + estimateTokens(d.text), 0);
  const filingTokens = sources.filing ? estimateTokens(sources.filing.text) : 0;

  let docsBudget = Math.floor(available * 0.55);
  let filingBudget = available - docsBudget;

  if (docsTokens < docsBudget) {
    filingBudget += docsBudget - docsTokens;
    docsBudget = docsTokens;
  } else if (filingTokens < filingBudget) {
    docsBudget += filingBudget - filingTokens;
    filingBudget = filingTokens;
  }

  const documentsSection = buildDocumentsSection(sources.documents, docsBudget, notes);
  const filingSection = buildFilingSection(sources.filing, filingBudget, notes);

  const built = finish(system, [header, metrics, filingSection, documentsSection], notes);

  // 節ごとの切り詰めは概算なので、最後に全体で上限を検算する
  return enforceLimit(built, sources.tokenLimit - sources.reserveForOutput);
}

function finish(system: string, parts: string[], notes: string[]): BuiltPrompt {
  const user = parts.filter((p) => p.length > 0).join("\n\n");
  return { system, user, tokens: estimateTokens(system) + estimateTokens(user), notes };
}

/**
 * 上限をまだ超えている場合の最後の砦。
 *
 * user 部分だけを段階的に切り詰める（system は評価基準そのものなので削らない）。
 */
function enforceLimit(built: BuiltPrompt, limit: number): BuiltPrompt {
  if (built.tokens <= limit) return built;

  const systemTokens = estimateTokens(built.system);
  const userBudget = Math.max(limit - systemTokens, 500);

  let user = built.user;
  // 概算の誤差を詰めるため、収まるまで少しずつ削る
  for (let attempt = 0; attempt < 6 && estimateTokens(user) > userBudget; attempt++) {
    user = headTail(user, Math.floor(userBudget * (1 - attempt * 0.05)));
  }

  return {
    system: built.system,
    user,
    tokens: systemTokens + estimateTokens(user),
    notes: [
      ...built.notes,
      "入力トークン上限に収めるため、資料全体をさらに切り詰めました。設定で上限を引き上げると、より多くの資料を渡せます。",
    ],
  };
}

// ---------------------------------------------------------------- 各セクション

function buildHeader(ticker: string): string {
  return `# 分析対象

ティッカー: ${ticker}

以下の資料に基づいて、20項目の評価を行ってください。`;
}

function buildMetricsSection(f: Fundamentals | null): string {
  if (!f) {
    return `## 財務指標（Yahoo Finance）

取得できませんでした。指標に依存する項目はスコア 0（判定不能）としてください。`;
  }

  const lines = [
    `## 財務指標（Yahoo Finance / 取得: ${new Date(f.fetchedAtMs).toLocaleString("ja-JP")}）`,
    "",
    `銘柄名: ${f.name}`,
    `取引所: ${f.exchange || "不明"}`,
    `現在値: ${f.priceDisplay}${
      f.changePercent !== null ? `（前日比 ${f.changePercent.toFixed(2)}%）` : ""
    }`,
    "",
  ];

  for (const group of f.groups) {
    lines.push(`### ${group.title}`);
    for (const m of group.metrics) {
      lines.push(`- ${m.label}: ${m.value}`);
    }
    lines.push("");
  }

  if (f.warning) lines.push(`※ ${f.warning}`);

  return lines.join("\n").trim();
}

function buildFilingSection(
  filing: PromptFiling | null,
  budget: number,
  notes: string[],
): string {
  if (!filing) return "";

  const head = `## SEC 提出書類（${filing.form} / 提出 ${filing.filed} / 対象期間 ${filing.period}）

出典: ${filing.url}

`;

  const original = estimateTokens(filing.text);
  if (original <= budget) return head + filing.text;

  const condensed = condenseFiling(filing.text, budget);
  notes.push(
    `${filing.form} の本文が長いため、重要な節（Risk Factors / MD&A 等）を優先して ` +
      `約 ${Math.round((budget / original) * 100)}% に絞り込みました。`,
  );
  return head + condensed;
}

function buildDocumentsSection(
  documents: PromptDocument[],
  budget: number,
  notes: string[],
): string {
  if (documents.length === 0) return "";

  const parts: string[] = ["## 添付された一次資料"];

  // まず均等割りし、収まりきる資料は全量残す。
  // 余った分を、はみ出す資料へ再配分する（小さい資料が枠を余らせないように）
  const sizes = documents.map((d) => estimateTokens(d.text));
  const equalShare = Math.floor(budget / documents.length);

  const fitsWhole = sizes.map((s) => s <= equalShare);
  const usedByWhole = sizes.reduce((sum, s, i) => sum + (fitsWhole[i] ? s : 0), 0);
  const oversized = fitsWhole.filter((f) => !f).length;
  const perOversized = oversized > 0 ? Math.floor((budget - usedByWhole) / oversized) : 0;

  let truncatedCount = 0;

  documents.forEach((doc, i) => {
    let body = doc.text;
    if (!fitsWhole[i]) {
      body = headTail(doc.text, perOversized);
      truncatedCount += 1;
    }
    parts.push(`### ${doc.name}\n\n${body}`);
  });

  if (truncatedCount > 0) {
    notes.push(
      `添付資料 ${truncatedCount} 件が長いため、前半と末尾を残して中間を省略しました。`,
    );
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------- 切り詰め

/**
 * SEC 本文を予算内に収める。
 *
 * まず分析価値の高い節（Risk Factors / MD&A 等）を抜き出し、
 * それでも入らない場合は各節を前半・末尾に切り詰める。
 * 節が見つからない書類は素朴な head+tail にフォールバックする。
 */
function condenseFiling(text: string, budget: number): string {
  const found: { label: string; body: string }[] = [];

  for (const section of KEY_SECTIONS) {
    const match = section.pattern.exec(text);
    if (!match) continue;

    const start = match.index;
    // 次の "Item N." までを 1 節とみなす
    const rest = text.slice(start + match[0].length);
    const nextItem = /\n\s*item\s*\d+[a-z]?\.?\s/i.exec(rest);
    const end = nextItem ? start + match[0].length + nextItem.index : text.length;

    const body = text.slice(start, end).trim();
    if (body.length > 200) found.push({ label: section.label, body });
  }

  if (found.length === 0) return headTail(text, budget);

  const perSection = Math.floor(budget / found.length);
  return found
    .map((s) => {
      const body =
        estimateTokens(s.body) > perSection ? headTail(s.body, perSection) : s.body;
      return `#### ${s.label}\n\n${body}`;
    })
    .join("\n\n");
}

/** 前半 65% と末尾 35% を残し、中間を省略する。 */
function headTail(text: string, budgetTokens: number): string {
  const chars = [...text];
  const budgetChars = Math.max(charsForTokens(text, budgetTokens), 200);
  if (chars.length <= budgetChars) return text;

  const headChars = Math.floor(budgetChars * 0.65);
  const tailChars = budgetChars - headChars;

  const head = chars.slice(0, headChars).join("");
  const tail = chars.slice(chars.length - tailChars).join("");
  const omitted = chars.length - headChars - tailChars;

  return `${head}\n\n…（中略：約 ${omitted.toLocaleString()} 文字を省略）…\n\n${tail}`;
}

/**
 * 指定トークン数に収まる文字数を求める。
 *
 * CJK は 1 文字 ≒ 1 トークン、英数字は 4 文字 ≒ 1 トークンなので、
 * 固定の係数を使うと日本語資料で大幅に超過する。
 * そこで**その文章自身の「文字あたりトークン数」から逆算**する。
 */
function charsForTokens(text: string, budgetTokens: number): number {
  const charCount = [...text].length;
  if (charCount === 0) return 0;

  const tokensPerChar = estimateTokens(text) / charCount;
  // 0 除算と過大見積もりの両方を防ぐ
  return Math.floor(budgetTokens / Math.max(tokensPerChar, 0.25));
}
