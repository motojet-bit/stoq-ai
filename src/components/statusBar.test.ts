import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  APP_VERSION,
  COPYRIGHT,
  COPYRIGHT_YEAR,
} from "@/lib/ui/appMeta";

/**
 * ステータスバーの表示。
 *
 * このプロジェクトには DOM を描画するテスト環境（React Testing Library）を
 * 入れていないので、**表記の内容と組み方をソースの構造で確かめる**。
 * 「中央に置いた」「表記が合っている」が崩れたらここが落ちる。
 */
const SOURCE = readFileSync(
  join(process.cwd(), "src/components/StatusBar.tsx"),
  "utf-8",
);

describe("権利表記の文面", () => {
  it("指定どおりの文面になっている", () => {
    expect(COPYRIGHT).toBe("© 2026 StoQ AI Analyzer. All Rights Reserved.");
  });

  it("アプリ名と年から組み立てている（直書きしていない）", () => {
    expect(COPYRIGHT).toContain(APP_NAME);
    expect(COPYRIGHT).toContain(String(COPYRIGHT_YEAR));
  });

  it("版はアプリ設定と揃っている", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8"),
    ) as { version: string };
    const tauri = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf-8"),
    ) as { version: string };

    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toBe(tauri.version);
  });
});

describe("ステータスバーの組み方", () => {
  it("権利表記を定数から出している（文面が 2 か所に散らない）", () => {
    expect(SOURCE).toContain("COPYRIGHT");
    expect(SOURCE).not.toContain("All Rights Reserved");
  });

  it("**左・中央・右の 3 分割**にしている（左右の長さで中心がずれない）", () => {
    expect(SOURCE).toContain("grid-cols-[1fr_auto_1fr]");
  });

  it("権利表記が中央寄せで折り返さない", () => {
    expect(SOURCE).toContain("justify-self-center");
    expect(SOURCE).toContain("text-center");
    expect(SOURCE).toContain("whitespace-nowrap");
  });

  it("左の状態表示と右のヘルプ・版が残っている", () => {
    expect(SOURCE).toContain("準備完了");
    expect(SOURCE).toContain("銘柄:");
    expect(SOURCE).toContain("読み込み済み資料:");
    expect(SOURCE).toContain("ヘルプ");
    expect(SOURCE).toContain("APP_VERSION");
  });

  it("文字サイズはバー全体の `t-label` に揃えている", () => {
    // footer 側に t-label があり、中央だけ別サイズを指定していない
    expect(SOURCE).toMatch(/<footer[^>]*t-label/s);
  });

  it("版表記に古い「Phase 1」が残っていない", () => {
    expect(SOURCE).not.toContain("Phase 1");
  });
});
