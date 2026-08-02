import { describe, expect, it } from "vitest";
import { isAutoFallback, planFilingFetch } from "@/lib/prompts/secFallback";
import type { FilingStatus } from "@/types";

const status = (patch: Partial<FilingStatus> = {}): FilingStatus => ({
  ticker: "AAPL",
  company: "Apple Inc.",
  cik: "0000320193",
  status: "ok",
  latest10k: { form: "10-K", filed: "2025-11-01", period: "2025-09-27", url: "u" },
  latest10q: { form: "10-Q", filed: "2026-02-01", period: "2025-12-27", url: "u" },
  message: null,
  fetchedAtMs: 0,
  ...patch,
});

describe("SEC 取得の判断", () => {
  it("**添付が無ければ自動で補う**（裏付けの無い分析にしない）", () => {
    const plan = planFilingFetch({ documentCount: 0, status: status() });
    expect(plan.mode).toBe("autoFallback");
    expect(isAutoFallback(plan)).toBe(true);
  });

  it("添付があるときは従来どおり併用扱い（自動補完の表示は出さない）", () => {
    const plan = planFilingFetch({ documentCount: 2, status: status() });
    expect(plan.mode).toBe("requested");
    expect(isAutoFallback(plan)).toBe(false);
  });

  it("**10-Q を先に試す**（直近の状況を見たいので四半期が先）", () => {
    expect(planFilingFetch({ documentCount: 0, status: status() }).forms).toEqual([
      "10-Q",
      "10-K",
    ]);
  });
});

describe("取りに行かない場合", () => {
  it("EDGAR に無い銘柄（非米国上場）", () => {
    const plan = planFilingFetch({ documentCount: 0, status: status({ status: "notInEdgar" }) });
    expect(plan).toEqual({ mode: "skip", reason: "notInEdgar", forms: [] });
  });

  it("User-Agent 未設定（SEC に 403 で弾かれる）", () => {
    expect(
      planFilingFetch({ documentCount: 0, status: status({ status: "userAgentMissing" }) }).reason,
    ).toBe("userAgentMissing");
  });

  it("提出書類が無い", () => {
    expect(
      planFilingFetch({ documentCount: 0, status: status({ status: "noFilings" }) }).reason,
    ).toBe("noFilings");
  });

  it("**status が ok でも 10-K / 10-Q が両方無ければ取りに行かない**（空振りする）", () => {
    const plan = planFilingFetch({
      documentCount: 0,
      status: status({ latest10k: null, latest10q: null }),
    });
    expect(plan).toEqual({ mode: "skip", reason: "noFilings", forms: [] });
  });

  it("状況をまだ確認できていないときは取りに行かない", () => {
    expect(planFilingFetch({ documentCount: 0, status: null }).reason).toBe("unknown");
  });

  it("片方だけでも残っていれば取りに行く", () => {
    expect(
      planFilingFetch({ documentCount: 0, status: status({ latest10q: null }) }).mode,
    ).toBe("autoFallback");
  });
});
