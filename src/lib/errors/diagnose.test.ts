import { describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n/i18n";
import { classifyFailure, diagnose } from "@/lib/errors/diagnose";

setLocale("ja");

describe("失敗の切り分け", () => {
  it("429 はレート制限", () => {
    expect(classifyFailure(new Error("HTTP 429 Too Many Requests"))).toBe("rateLimit");
    expect(classifyFailure(new Error("rate_limit_exceeded"))).toBe("rateLimit");
  });

  it("401 は認証", () => {
    expect(classifyFailure(new Error("401 Unauthorized"))).toBe("auth");
    expect(classifyFailure(new Error("Invalid API key provided"))).toBe("auth");
  });

  it("**残高不足は認証と分ける**（キーを入れ直しても直らない）", () => {
    expect(classifyFailure(new Error("insufficient_quota"))).toBe("quota");
    expect(classifyFailure(new Error("Your credit balance is too low"))).toBe("quota");
  });

  it("404 はモデル名や URL の誤り", () => {
    expect(classifyFailure(new Error("404 model_not_found"))).toBe("notFound");
  });

  it("出力上限で切れた場合", () => {
    expect(classifyFailure(new Error("finish_reason: length"))).toBe("truncated");
  });

  it("通信そのものが届いていない場合", () => {
    expect(classifyFailure(new Error("connect ECONNREFUSED"))).toBe("network");
    expect(classifyFailure(new Error("request timed out"))).toBe("network");
  });

  it("判別できなければ unknown", () => {
    expect(classifyFailure(new Error("何かが起きました"))).toBe("unknown");
  });
});

describe("案内の出し分け", () => {
  it("**レート制限は再試行を勧め、設定は開かせない**（触ると別の問題を作る）", () => {
    const d = diagnose(new Error("429"));
    expect(d.retryable).toBe(true);
    expect(d.openSettings).toBe(false);
  });

  it("**認証エラーは再試行させず、設定へ導く**（何度叩いても直らない）", () => {
    const d = diagnose(new Error("401 invalid api key"));
    expect(d.retryable).toBe(false);
    expect(d.openSettings).toBe(true);
  });

  it("残高不足はアプリ側では直らないので設定も開かせない", () => {
    const d = diagnose(new Error("insufficient_quota"));
    expect(d.retryable).toBe(false);
    expect(d.openSettings).toBe(false);
  });

  it("出力上限は再開すれば続きから進む", () => {
    expect(diagnose(new Error("finish_reason: length")).retryable).toBe(true);
  });

  it("文面と元のメッセージが両方入る", () => {
    const d = diagnose(new Error("429 slow down"));
    expect(d.title).not.toBe("");
    expect(d.action).not.toBe("");
    expect(d.detail).toContain("429");
  });
});

describe("推論モデルのパラメータ拒否", () => {
  it("Unsupported parameter を出力上限と取り違えない", () => {
    const raw =
      "HTTP 400: Unsupported parameter: 'max_tokens' is not supported with this model. " +
      "Use 'max_completion_tokens' instead.";
    expect(classifyFailure(new Error(raw))).toBe("badRequest");
  });

  it("temperature の不適合も同じ扱い", () => {
    const raw = "HTTP 400: Unsupported value: 'temperature' does not support 0.2 with this model.";
    expect(classifyFailure(new Error(raw))).toBe("badRequest");
  });

  it("受け付けられていないので再試行を勧めない", () => {
    const d = diagnose(new Error("HTTP 400: unsupported parameter: reasoning_effort"));
    expect(d.retryable).toBe(false);
    expect(d.openSettings).toBe(true);
  });

  it("生ログをそのまま残す", () => {
    const raw = "HTTP 400: Unsupported parameter: 'max_tokens'";
    expect(diagnose(new Error(raw)).detail).toContain("max_tokens");
  });

  it("本当の出力上限は truncated のまま", () => {
    expect(classifyFailure(new Error("finish_reason: length"))).toBe("truncated");
  });
});
