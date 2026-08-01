import { describe, expect, it } from "vitest";
import {
  buildThresholdSection,
  clampThreshold,
  customizedIds,
  definitionOf,
  formatRule,
  mergeThresholds,
  THRESHOLDS,
} from "@/lib/prompts/thresholds";
import { buildSystemPrompt } from "@/lib/prompts/systemPrompt";

describe("閾値の定義", () => {
  it("ID が重複していない", () => {
    const ids = THRESHOLDS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("既定値が必ず範囲内にある", () => {
    for (const def of THRESHOLDS) {
      expect(def.defaultValue).toBeGreaterThanOrEqual(def.min);
      expect(def.defaultValue).toBeLessThanOrEqual(def.max);
      expect(def.min).toBeLessThan(def.max);
      expect(def.step).toBeGreaterThan(0);
    }
  });

  it("主要な指標がそろっている", () => {
    const ids = THRESHOLDS.map((t) => t.id);
    expect(ids).toContain("revenueGrowth");
    expect(ids).toContain("roe");
    expect(ids).toContain("per");
  });
});

describe("clampThreshold", () => {
  const per = definitionOf("per")!;
  const de = definitionOf("debtToEquity")!;

  it("範囲内はそのまま", () => {
    expect(clampThreshold(per, 25)).toBe(25);
  });

  it("上下限を超えたら丸める", () => {
    expect(clampThreshold(per, 9999)).toBe(per.max);
    expect(clampThreshold(per, -5)).toBe(per.min);
  });

  it("刻みに応じて桁を揃える", () => {
    expect(clampThreshold(per, 25.7)).toBe(26);
    expect(clampThreshold(de, 1.25)).toBe(1.3);
  });

  it("NaN / Infinity は既定値に戻す", () => {
    expect(clampThreshold(per, Number.NaN)).toBe(per.defaultValue);
    expect(clampThreshold(per, Number.POSITIVE_INFINITY)).toBe(per.defaultValue);
  });
});

describe("mergeThresholds（保存値の復元）", () => {
  it("保存が無ければ既定値がそろう", () => {
    const values = mergeThresholds(null);
    for (const def of THRESHOLDS) {
      expect(values[def.id]).toBe(def.defaultValue);
    }
  });

  it("保存された項目だけ差し替わる", () => {
    const values = mergeThresholds({ per: 18 });
    expect(values.per).toBe(18);
    expect(values.roe).toBe(definitionOf("roe")!.defaultValue);
  });

  it("知らない ID は無視する（古い設定が残っていても壊れない）", () => {
    const values = mergeThresholds({ legacyMetric: 42, per: 18 });
    expect(values.legacyMetric).toBeUndefined();
    expect(Object.keys(values).sort()).toEqual(THRESHOLDS.map((t) => t.id).sort());
  });

  it("数値以外の保存値は無視する", () => {
    const values = mergeThresholds({ per: "とても安い" as unknown as number });
    expect(values.per).toBe(definitionOf("per")!.defaultValue);
  });

  it("範囲外の保存値は丸めて返す", () => {
    expect(mergeThresholds({ per: 9999 }).per).toBe(definitionOf("per")!.max);
  });

  it("何度通しても結果が変わらない", () => {
    const once = mergeThresholds({ per: 18.4 });
    expect(mergeThresholds(once)).toEqual(once);
  });
});

describe("customizedIds", () => {
  it("既定のままなら空", () => {
    expect(customizedIds(mergeThresholds(null))).toEqual([]);
  });

  it("変更した項目だけ挙げる", () => {
    expect(customizedIds(mergeThresholds({ per: 18 }))).toEqual(["per"]);
  });
});

describe("formatRule", () => {
  it("「以上」の項目は >= で表す", () => {
    expect(formatRule(definitionOf("roe")!, 20)).toBe("ROE（自己資本利益率） >= 20%");
  });

  it("「以下」の項目は <= で表す", () => {
    expect(formatRule(definitionOf("per")!, 18)).toBe("PER（株価収益率） <= 18倍");
  });
});

describe("buildThresholdSection（プロンプトへの埋め込み）", () => {
  it("設定した数値がそのまま文字列に入る", () => {
    const text = buildThresholdSection(mergeThresholds({ revenueGrowth: 25, per: 18 }));
    expect(text).toContain("売上高成長率（YoY） >= 25%");
    expect(text).toContain("PER（株価収益率） <= 18倍");
  });

  it("全項目が 1 行ずつ並ぶ", () => {
    const text = buildThresholdSection(mergeThresholds(null));
    for (const def of THRESHOLDS) {
      expect(text).toContain(def.label);
    }
  });

  it("合格/不合格を判定させる指示を含む", () => {
    const text = buildThresholdSection(mergeThresholds(null));
    expect(text).toContain("厳密に適用して合格/不合格を判定せよ");
    expect(text).toContain("根拠欄");
  });

  it("**データが無いことを不合格にしない**よう明記する", () => {
    const text = buildThresholdSection(mergeThresholds(null));
    expect(text).toContain("基準未判定");
    expect(text).toContain("不合格として扱わない");
  });

  it("例示の数値も設定値に追従する（説明と基準がずれない）", () => {
    const text = buildThresholdSection(mergeThresholds({ revenueGrowth: 25 }));
    expect(text).toContain("基準 25% 以上");
    expect(text).not.toContain("基準 15% 以上");
  });

  it("壊れた保存値でも組み立てられる", () => {
    expect(() => buildThresholdSection({ per: Number.NaN })).not.toThrow();
    expect(buildThresholdSection({})).toContain("PER");
  });
});

describe("システムプロンプトへの反映", () => {
  it("閾値を渡すとプロンプト本体に差し込まれる", () => {
    const prompt = buildSystemPrompt(mergeThresholds({ per: 18 }));
    expect(prompt).toContain("# 閾値基準");
    expect(prompt).toContain("PER（株価収益率） <= 18倍");
  });

  it("閾値を渡さなくても既定値で差し込まれる", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("# 閾値基準");
    expect(prompt).toContain(`PER（株価収益率） <= ${definitionOf("per")!.defaultValue}倍`);
  });

  it("既存の厳守事項や出力フォーマットは残っている", () => {
    const prompt = buildSystemPrompt(mergeThresholds({ per: 18 }));
    expect(prompt).toContain("# 厳守事項");
    expect(prompt).toContain("## 評価テーブル");
    expect(prompt).toContain("# モメンタム評価");
  });
});
