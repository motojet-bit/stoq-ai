import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  APP_NAME_ACCENT,
  APP_NAME_REST,
  APP_VERSION,
  COPYRIGHT,
  COPYRIGHT_YEAR,
} from "@/lib/ui/appMeta";
import { DISCLAIMER_SECTIONS } from "@/lib/legal/disclaimer";
import { buildHelpSystemPrompt } from "@/lib/prompts/helpKnowledge";
import { FEATURE_REQUEST_URL } from "@/lib/ui/tooltipText";
import { mergeBindings } from "@/lib/ui/shortcutStore";

/**
 * アプリ名と権利表記の**一貫性**。
 *
 * 名称を変えるときに直すのは `appMeta.ts` と辞書 JSON だけで済むようにする。
 * 画面ごとに直書きされていると、ロゴだけ旧名が残る、免責文だけ旧名が残る、
 * といった中途半端な改名が起きる。ここはそれを検出する。
 */
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

function locale(name: string): Record<string, string> {
  return JSON.parse(read(`src/locales/${name}.json`)) as Record<string, string>;
}

describe("権利表記", () => {
  it("アプリ名と年から組み立てている（直書きしていない）", () => {
    expect(COPYRIGHT).toBe(`© ${COPYRIGHT_YEAR} ${APP_NAME}. All Rights Reserved.`);
  });

  it("年は 4 桁で妥当な範囲にある", () => {
    expect(COPYRIGHT_YEAR).toBeGreaterThanOrEqual(2024);
    expect(String(COPYRIGHT_YEAR)).toHaveLength(4);
  });

  it("**権利表記の文面が他の場所に散っていない**", () => {
    // 「All Rights Reserved」を持ってよいのは appMeta.ts だけ
    for (const path of [
      "src/components/StatusBar.tsx",
      "src/components/MenuBar.tsx",
      "src/lib/legal/disclaimer.ts",
      "src/locales/ja.json",
      "src/locales/en.json",
    ]) {
      expect(read(path), `${path} に権利表記が直書きされている`).not.toContain(
        "All Rights Reserved",
      );
    }
  });
});

describe("アプリ名の一貫性", () => {
  it("辞書の app.name が定数と一致している", () => {
    expect(locale("ja")["app.name"]).toBe(APP_NAME);
    expect(locale("en")["app.name"]).toBe(APP_NAME);
  });

  it("「〜について」の項目にアプリ名が入っている", () => {
    expect(locale("ja")["menu.help.about"]).toContain(APP_NAME);
    expect(locale("en")["menu.help.about"]).toContain(APP_NAME);
  });

  it("**免責事項が現在のアプリ名を名乗っている**", () => {
    // 旧名のまま配布すると「どのツールの免責か」が争点になりうる
    const body = DISCLAIMER_SECTIONS.map((s) => s.body).join("\n");
    expect(body).toContain(APP_NAME);
  });

  it("ヘルプ AI が現在のアプリ名を名乗っている", () => {
    expect(buildHelpSystemPrompt(null, mergeBindings([]))).toContain(APP_NAME);
  });

  it("機能リクエストの件名にアプリ名が入っている", () => {
    expect(decodeURIComponent(FEATURE_REQUEST_URL)).toContain(APP_NAME);
  });

  it("ロゴの分割が名称から導かれている", () => {
    expect(`${APP_NAME_ACCENT} ${APP_NAME_REST}`.trim()).toBe(APP_NAME);
    expect(APP_NAME_ACCENT.length).toBeGreaterThan(0);
  });

  it("**表示側がアプリ名を直書きしていない**", () => {
    for (const path of [
      "src/components/MenuBar.tsx",
      "src/components/WelcomeTour.tsx",
      "src/components/FreeTierLimitModal.tsx",
      "src/lib/legal/disclaimer.ts",
      "src/lib/prompts/helpKnowledge.ts",
      "src/lib/ui/tooltipText.ts",
    ]) {
      expect(read(path), `${path} がアプリ名を直書きしている`).not.toContain(APP_NAME);
    }
  });
});

describe("版の一致", () => {
  it("package.json / tauri.conf.json と揃っている", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string };
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      version: string;
    };

    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toBe(tauri.version);
  });

  it("ウィンドウ名と HTML の表題が製品名と揃っている", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      productName: string;
      app: { windows: { title: string }[] };
    };

    // インストーラー名・ウィンドウ名・タブ名がばらけないこと
    expect(tauri.app.windows[0].title).toContain(tauri.productName);
    expect(read("index.html")).toContain(tauri.productName);
  });
});
