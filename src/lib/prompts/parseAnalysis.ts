import { CRITERIA, criterionById } from "@/lib/prompts/criteria";
import { SECTION_HEADINGS } from "@/lib/prompts/systemPrompt";

/** 20項目の評価 1 行 */
export interface CriterionResult {
  id: number;
  label: string;
  category: string;
  /** 0〜5。パースできなかった場合は null */
  score: number | null;
  verdict: string;
  rationale: string;
}

export interface AnalysisResult {
  rows: CriterionResult[];
  strengths: string[];
  risks: string[];
  valuation: string;
  conclusion: string;
  /** 平均スコア（判定不能の 0 を除く）。該当なしなら null */
  averageScore: number | null;
  /** 20行そろっているか */
  complete: boolean;
}

/**
 * LLM の Markdown 出力を構造化する。
 *
 * **ストリーミング中の途中経過に対しても呼べる**（途中まででも解釈する）ため、
 * 欠けている行や節があっても例外を投げない。
 */
export function parseAnalysis(markdown: string): AnalysisResult {
  const rows = parseTable(markdown);
  const scored = rows.filter((r) => r.score !== null && r.score > 0);

  return {
    rows,
    strengths: parseBullets(markdown, SECTION_HEADINGS.strengths),
    risks: parseBullets(markdown, SECTION_HEADINGS.risks),
    valuation: parseParagraph(markdown, SECTION_HEADINGS.valuation),
    conclusion: parseParagraph(markdown, SECTION_HEADINGS.conclusion),
    averageScore:
      scored.length > 0
        ? scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length
        : null,
    complete: rows.length === CRITERIA.length,
  };
}

// ---------------------------------------------------------------- テーブル

function parseTable(markdown: string): CriterionResult[] {
  const results = new Map<number, CriterionResult>();

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = splitRow(trimmed);
    // #, 項目, スコア, 評価, 根拠 の 5 列
    if (cells.length < 5) continue;

    const id = Number(cells[0]);
    if (!Number.isInteger(id) || id < 1) continue;

    const criterion = criterionById(id);
    // 表の区切り行（| --- | --- |）や見出し行を除外
    if (!criterion) continue;

    results.set(id, {
      id,
      label: criterion.label,
      category: criterion.category,
      score: parseScore(cells[2]),
      verdict: cells[3],
      rationale: cells[4],
    });
  }

  return [...results.values()].sort((a, b) => a.id - b.id);
}

/** `| a | b | c |` を ["a","b","c"] にする。 */
function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function parseScore(cell: string): number | null {
  const match = /-?\d+/.exec(cell);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 0 && n <= 5 ? n : null;
}

// ---------------------------------------------------------------- 本文の節

/** 指定した見出しから次の `## ` までを取り出す。 */
function sectionBody(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";

  const after = markdown.slice(start + heading.length);
  const next = after.search(/\n##\s/);
  return (next < 0 ? after : after.slice(0, next)).trim();
}

function parseBullets(markdown: string, heading: string): string[] {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*・]\s+/.test(l))
    .map((l) => l.replace(/^[-*・]\s+/, "").trim())
    .filter((l) => l.length > 0);
}

function parseParagraph(markdown: string, heading: string): string {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("|"))
    .join("\n");
}
