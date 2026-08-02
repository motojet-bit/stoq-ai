import { describe, expect, it } from "vitest";
import {
  critiqueInput,
  debateGate,
  isRunning,
  nextPhase,
  rebuttalInput,
  type DebatePhase,
} from "@/lib/debate/debateTurn";
import type { DebateStatus } from "@/types";

const ready: DebateStatus = {
  provider: "anthropic",
  model: "claude-opus-5",
  effectiveProvider: "anthropic",
  effectiveModel: "claude-opus-5",
  ready: true,
  sameAsMain: false,
};

describe("実行できるかの判定", () => {
  it("分析があってキーが入っていれば実行できる", () => {
    expect(debateGate({ analysisText: "本文", status: ready, phase: "idle" })).toEqual({
      canRun: true,
      reason: null,
    });
  });

  it("**分析が無ければ実行できない**（批判する対象が存在しない）", () => {
    expect(debateGate({ analysisText: null, status: ready, phase: "idle" }).reason).toBe(
      "noAnalysis",
    );
    expect(debateGate({ analysisText: "   ", status: ready, phase: "idle" }).reason).toBe(
      "noAnalysis",
    );
  });

  it("キーが無ければ実行できない", () => {
    const status = { ...ready, ready: false };
    expect(debateGate({ analysisText: "本文", status, phase: "idle" }).reason).toBe("noKey");
    expect(debateGate({ analysisText: "本文", status: null, phase: "idle" }).reason).toBe("noKey");
  });

  it("**走っている間は二重に実行できない**（費用が二重にかかる）", () => {
    for (const phase of ["critique", "rebuttal"] as DebatePhase[]) {
      expect(debateGate({ analysisText: "本文", status: ready, phase }).reason).toBe("running");
    }
  });

  it("完了後はもう一度実行できる", () => {
    expect(debateGate({ analysisText: "本文", status: ready, phase: "done" }).canRun).toBe(true);
  });
});

describe("進行段階", () => {
  it("**1 往復で止まる**（批判 → 反論 → 完了）", () => {
    expect(nextPhase("idle")).toBe("critique");
    expect(nextPhase("critique")).toBe("rebuttal");
    expect(nextPhase("rebuttal")).toBe("done");
  });

  it("完了・失敗からは最初へ戻る（同じ往復をやり直せる）", () => {
    expect(nextPhase("done")).toBe("critique");
    expect(nextPhase("error")).toBe("critique");
  });

  it("生成中の判定", () => {
    expect(isRunning("critique")).toBe(true);
    expect(isRunning("rebuttal")).toBe(true);
    expect(isRunning("idle")).toBe(false);
    expect(isRunning("done")).toBe(false);
    expect(isRunning("error")).toBe(false);
  });

  it("done から nextPhase を繰り返しても無限には進まない", () => {
    // 3 往復ぶん回しても、段階は critique / rebuttal / done の 3 つしか出てこない
    let phase: DebatePhase = "idle";
    const seen = new Set<DebatePhase>();
    for (let i = 0; i < 9; i += 1) {
      phase = nextPhase(phase);
      seen.add(phase);
    }
    expect([...seen].sort()).toEqual(["critique", "done", "rebuttal"]);
  });
});

describe("渡す本文", () => {
  it("批判側には分析本文を渡す", () => {
    const text = critiqueInput("AAPL", "  営業CF は堅調  ");
    expect(text).toContain("Ticker: AAPL");
    expect(text).toContain("営業CF は堅調");
    // 前後の空白は落とす（そのまま渡すと本文の頭が下がって読み取りが揺れる）
    expect(text).not.toContain("  営業CF");
  });

  it("**反論側には元の分析と指摘の両方を渡す**（指摘だけだと謝るだけになる）", () => {
    const text = rebuttalInput("NVDA", "元の分析", "指摘の中身");
    expect(text).toContain("元の分析");
    expect(text).toContain("指摘の中身");
    expect(text.indexOf("元の分析")).toBeLessThan(text.indexOf("指摘の中身"));
  });

  it("ティッカーが空でも組み立てられる", () => {
    expect(critiqueInput("", "本文")).toContain("Ticker: -");
  });
});
