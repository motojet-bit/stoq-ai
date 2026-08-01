import { estimateTokens } from "@/lib/parser/tokenCount";
import { condenseDocument } from "@/lib/prompts/condense";
import type { Fundamentals, QuarterlySeries } from "@/types";

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
  quarterly: QuarterlySeries | null;
  filing: PromptFiling | null;
  documents: PromptDocument[];
  /** 入力トークンの上限（設定の maxPromptTokens） */
  tokenLimit: number;
  /** 応答のために空けておくトークン数 */
  reserveForOutput: number;
  /**
   * システムプロンプトの概算トークン数。
   * **本文は Rust 側にあるので受け取らない。** 予算計算に長さだけ使う。
   */
  systemTokens: number;
}

export interface BuiltPrompt {
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

  const header = buildHeader(sources.ticker);
  const metrics = buildMetricsSection(sources.fundamentals);
  const quarterly = buildQuarterlySection(sources.quarterly);

  const fixedTokens =
    sources.systemTokens +
    estimateTokens(header) +
    estimateTokens(metrics) +
    estimateTokens(quarterly) +
    // 見出しや区切りの分の余裕
    500;

  const available = sources.tokenLimit - sources.reserveForOutput - fixedTokens;

  if (available <= 0) {
    notes.push(
      "トークン上限が小さすぎるため、財務指標のみで分析します。設定で上限を引き上げてください。",
    );
    return finish(sources.systemTokens, [header, metrics, quarterly], notes);
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

  const built = finish(
    sources.systemTokens,
    [header, metrics, quarterly, filingSection, documentsSection],
    notes,
  );

  // 節ごとの切り詰めは概算なので、最後に全体で上限を検算する
  return enforceLimit(
    built,
    sources.tokenLimit - sources.reserveForOutput,
    sources.systemTokens,
  );
}

function finish(systemTokens: number, parts: string[], notes: string[]): BuiltPrompt {
  const user = parts.filter((p) => p.length > 0).join("\n\n");
  return { user, tokens: systemTokens + estimateTokens(user), notes };
}

/**
 * 上限をまだ超えている場合の最後の砦。
 *
 * user 部分だけを段階的に切り詰める
 * （system は評価基準そのものなので削らない。そもそも Rust 側にあり触れない）。
 */
function enforceLimit(
  built: BuiltPrompt,
  limit: number,
  systemTokens: number,
): BuiltPrompt {
  if (built.tokens <= limit) return built;

  const userBudget = Math.max(limit - systemTokens, 500);

  // ここでもスマート圧縮を使う（中間の一括カットはしない）
  let user = built.user;
  for (let attempt = 0; attempt < 5 && estimateTokens(user) > userBudget; attempt++) {
    user = condenseDocument(
      user,
      Math.floor(userBudget * (1 - attempt * 0.05)),
      "資料全体",
    ).text;
  }

  return {
    user,
    tokens: systemTokens + estimateTokens(user),
    notes: [
      ...built.notes,
      "入力トークン上限に収めるため、資料全体をさらに圧縮しました。設定で上限を引き上げると、より多くの原文を渡せます。",
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

  const condensed = condenseFiling(filing.text, budget, filing.form, notes);
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
      // 中間カットではなく、セクション採点にもとづくスマート圧縮
      const condensed = condenseDocument(doc.text, perOversized, doc.name);
      body = condensed.text;
      notes.push(...condensed.notes);
      truncatedCount += 1;
    }
    parts.push(`### ${doc.name}\n\n${body}`);
  });

  if (truncatedCount === 0) return parts.join("\n\n");
  return parts.join("\n\n");
}

// ---------------------------------------------------------------- 切り詰め

/**
 * SEC 本文を予算内に収める。
 *
 * まず分析価値の高い節（Risk Factors / MD&A 等）を抜き出し、
 * それでも入らない節は**文単位のスマート圧縮**にかける（中間カットはしない）。
 */
function condenseFiling(
  text: string,
  budget: number,
  form: string,
  notes: string[],
): string {
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

  if (found.length === 0) {
    const condensed = condenseDocument(text, budget, `${form} 本文`);
    notes.push(...condensed.notes);
    return condensed.text;
  }

  const perSection = Math.floor(budget / found.length);
  const kept = found.map((s) => s.label).join(" / ");
  let compressed = 0;

  const body = found
    .map((s) => {
      if (estimateTokens(s.body) <= perSection) return `#### ${s.label}\n\n${s.body}`;
      compressed += 1;
      const condensed = condenseDocument(s.body, perSection, `${form} ${s.label}`);
      return `#### ${s.label}\n\n${condensed.text}`;
    })
    .join("\n\n");

  notes.push(
    `${form} の本文が長いため、分析価値の高い節（${kept}）を抽出しました` +
      (compressed > 0
        ? `。うち ${compressed} 節は文単位で重要箇所を選別しています（中間の一括カットはしていません）。`
        : "。"),
  );

  return body;
}

// ---------------------------------------------------------------- 四半期推移

/**
 * 直近 4 四半期の推移。モメンタム（加速 / 減速）の判定材料として渡す。
 *
 * 季節性の強い企業では QoQ が誤解を招くため、YoY を併記し、
 * どちらを重視すべきかもプロンプトで明示する。
 */
function buildQuarterlySection(series: QuarterlySeries | null): string {
  if (!series || series.quarters.length === 0) return "";

  const lines = [
    "## 四半期推移（直近4四半期）",
    "",
    `出典: ${series.source}`,
    "",
    "| 四半期 | 期末 | 売上高 | 前四半期比 | 前年同期比 | 純利益 | 純利益率 | EPS実績 | EPS予想 | サプライズ |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const q of series.quarters) {
    lines.push(
      `| ${q.label} | ${q.endDate} | ${q.revenueDisplay} | ${pct(q.revenueQoq)} | ${pct(q.revenueYoy)} | ` +
        `${q.netIncomeDisplay} | ${pct(q.netMargin)} | ${num(q.epsActual)} | ${num(q.epsEstimate)} | ${pct(q.epsSurprisePct)} |`,
    );
  }

  lines.push("", `**モメンタム判定**: ${series.momentum.summary}`);
  if (series.note) lines.push("", `※ ${series.note}`);

  return lines.join("\n");
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function num(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}
