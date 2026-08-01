import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 核心プロンプトがフロントエンドに残っていないことを見張る。
 *
 * **配布物の JS は開けば読める。** 分析ノウハウは Rust バイナリ側にしか
 * 置かない、という約束をテストで固定する。
 * うっかりフロントへ戻したら、ここが落ちて気づける。
 */

const SRC = join(process.cwd(), "src");

/** Rust の秘匿プロンプトにしか現れない言い回し。 */
const SECRET_PHRASES = [
  "提供された資料のみに基づいて",
  "# 厳守事項",
  "根拠欄に「提供資料からは判断不能」",
  "前年同期比（YoY）の変化を成長判断の主軸にする",
  "厳密に適用して合格/不合格を判定せよ",
  "キャッシュランウェイ（Cash Runway）",
  "完全希薄化後株式数",
  "EV/Gross Profit",
  "バリュートラップ",
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** このテスト自身は語句を列挙しているので対象外にする。 */
const isSelf = (path: string) => path.endsWith("promptSecrecy.test.ts");

describe("プロンプトの秘匿", () => {
  const files = walk(SRC).filter((f) => !isSelf(f));

  it("フロントエンドに核心プロンプトの語句が残っていない", () => {
    const leaks: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      for (const phrase of SECRET_PHRASES) {
        if (text.includes(phrase)) {
          leaks.push(`${file.replace(process.cwd(), "")} : ${phrase}`);
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it("systemPrompt.ts は削除されている（Rust 側へ移設済み）", () => {
    expect(files.some((f) => f.endsWith("systemPrompt.ts"))).toBe(false);
  });

  it("評価項目は見出しだけを持ち、AI への指示文を持たない", async () => {
    const criteria = readFileSync(join(SRC, "lib/prompts/criteria.ts"), "utf-8");
    expect(criteria).not.toContain("hint");

    const mod = await import("@/lib/prompts/criteria");
    expect(mod.CRITERIA).toHaveLength(20);
    // 描画とパースに要る項目だけ
    expect(Object.keys(mod.CRITERIA[0]).sort()).toEqual(["category", "id", "label"]);
  });

  it("組み立て済みシステムプロンプトを受け取る型が存在しない", async () => {
    const built = readFileSync(join(SRC, "lib/prompts/buildPrompt.ts"), "utf-8");
    // BuiltPrompt に system フィールドが無いこと
    expect(built).not.toMatch(/^\s*system:\s*string;/m);
  });

  it("LLM へは役割 ID と閾値だけを渡す", () => {
    const runner = readFileSync(join(SRC, "lib/prompts/analysisRunner.ts"), "utf-8");
    expect(runner).toContain("analysisPreset");
    expect(runner).not.toContain("system: prompt.system");
  });
});
