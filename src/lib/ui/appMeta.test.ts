import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_VERSION,
  appCopyright,
  appName,
  appNameAccent,
  appNameRest,
  COPYRIGHT_YEAR,
  PRODUCT_NAME,
} from "@/lib/ui/appMeta";
import { disclaimerSections } from "@/lib/legal/disclaimer";
import { buildHelpSystemPrompt } from "@/lib/prompts/helpKnowledge";
import { featureRequestUrl } from "@/lib/ui/tooltipText";
import { mergeBindings } from "@/lib/ui/shortcutStore";
import { setLocale } from "@/lib/i18n/i18n";
import { detectLocale } from "@/lib/i18n/locales";

/**
 * アプリ名と権利表記の**一貫性**、および言語による切り替え。
 *
 * 名称は辞書（`app.name` / `app.copyright`）だけが持つ。画面ごとに
 * 直書きされていると、ロゴだけ旧名が残る／免責文だけ旧名が残る、といった
 * 中途半端な改名が起きる。ここはそれを検出する。
 */
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

function locale(name: string): Record<string, string> {
  return JSON.parse(read(`src/locales/${name}.json`)) as Record<string, string>;
}

afterEach(() => {
  setLocale("ja");
});

describe("言語による名称の切り替え", () => {
  it("**日本語では「株究」を名乗る**", () => {
    setLocale("ja");
    expect(appName()).toBe("株究 - StoQ AI Analyzer");
    expect(appCopyright()).toBe("© 2026 株究 - StoQ AI Analyzer. All Rights Reserved.");
  });

  it("**英語では英語名だけになる**（読めない文字を出さない）", () => {
    setLocale("en");
    expect(appName()).toBe("StoQ AI Analyzer");
    expect(appName()).not.toContain("株究");
    expect(appCopyright()).toBe("© 2026 StoQ AI Analyzer. All Rights Reserved.");
  });

  it("ロゴの分割をつなぐと表示名に戻る（区切りの空白も欠けない）", () => {
    for (const code of ["ja", "en"]) {
      setLocale(code);
      expect(`${appNameAccent()}${appNameRest()}`, code).toBe(appName());
      expect(appNameAccent().length, code).toBeGreaterThan(0);
    }
  });

  it("日本語のロゴは「株究」から始まる", () => {
    setLocale("ja");
    expect(appNameAccent()).toBe("株究");
  });

  it("権利表記は年と表示名から組み立てられている", () => {
    for (const code of ["ja", "en"]) {
      setLocale(code);
      expect(appCopyright(), code).toBe(
        `© ${COPYRIGHT_YEAR} ${appName()}. All Rights Reserved.`,
      );
      expect(appCopyright(), code).toMatch(/^© \d{4} .+\. All Rights Reserved\.$/);
    }
  });
});

describe("OS 言語の自動判定", () => {
  it("**日本語環境は ja、それ以外は en**", () => {
    expect(detectLocale("ja")).toBe("ja");
    expect(detectLocale("ja-JP")).toBe("ja");
    expect(detectLocale("en-US")).toBe("en");
    // 未対応の言語で日本語を出しても読めない
    expect(detectLocale("de-DE")).toBe("en");
    expect(detectLocale("fr")).toBe("en");
    expect(detectLocale("zh-TW")).toBe("en");
  });

  it("判定できない値でも落ちない", () => {
    expect(detectLocale(undefined)).toBe("en");
    expect(detectLocale("")).toBe("en");
    expect(detectLocale(123)).toBe("en");
  });
});

describe("名称の一貫性", () => {
  it("辞書の app.name が両言語にある", () => {
    expect(locale("ja")["app.name"]).toBe("株究 - StoQ AI Analyzer");
    expect(locale("en")["app.name"]).toBe("StoQ AI Analyzer");
  });

  it("「〜について」の項目にその言語の名称が入っている", () => {
    expect(locale("ja")["menu.help.about"]).toContain(locale("ja")["app.name"]);
    expect(locale("en")["menu.help.about"]).toContain(locale("en")["app.name"]);
  });

  it("**免責事項がいまの言語の名称を名乗る**", () => {
    // 旧名のまま配布すると「どのツールの免責か」が争点になりうる
    setLocale("ja");
    expect(disclaimerSections().map((s) => s.body).join("\n")).toContain(appName());

    setLocale("en");
    expect(disclaimerSections().map((s) => s.body).join("\n")).toContain(appName());
  });

  it("ヘルプ AI がいまの言語の名称を名乗る", () => {
    setLocale("en");
    const prompt = buildHelpSystemPrompt(null, mergeBindings([]));
    expect(prompt).toContain("StoQ AI Analyzer");
    expect(prompt).not.toContain("株究");
  });

  it("機能リクエストの件名にいまの名称が入る", () => {
    setLocale("ja");
    expect(decodeURIComponent(featureRequestUrl())).toContain("株究");
  });

  it("**表示側が名称を直書きしていない**", () => {
    for (const path of [
      "src/components/MenuBar.tsx",
      "src/components/WelcomeTour.tsx",
      "src/components/FreeTierLimitModal.tsx",
      "src/components/StatusBar.tsx",
      "src/lib/legal/disclaimer.ts",
      "src/lib/prompts/helpKnowledge.ts",
      "src/lib/ui/tooltipText.ts",
    ]) {
      expect(read(path), `${path} が名称を直書きしている`).not.toContain("株究");
    }
  });

  it("**権利表記の文面が他の場所に散っていない**", () => {
    // 「All Rights Reserved」を持ってよいのは辞書だけ
    for (const path of [
      "src/components/StatusBar.tsx",
      "src/components/MenuBar.tsx",
      "src/lib/ui/appMeta.ts",
      "src/lib/legal/disclaimer.ts",
    ]) {
      expect(read(path), `${path} に権利表記が直書きされている`).not.toContain(
        "All Rights Reserved",
      );
    }
  });
});

describe("配布物の名前", () => {
  it("**基盤名は言語で変わらない**（実行ファイル名に使うため）", () => {
    setLocale("ja");
    expect(PRODUCT_NAME).toBe("StoQ AI Analyzer");
    // 非 ASCII を混ぜると Windows インストーラー（WiX）の生成が通らない
    // eslint-disable-next-line no-control-regex
    expect(PRODUCT_NAME).toMatch(/^[\x20-\x7E]+$/);
  });

  it("tauri.conf.json の productName と一致している", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      productName: string;
      app: { windows: { title: string }[] };
    };

    expect(PRODUCT_NAME).toBe(tauri.productName);
    // 起動直後の既定タイトル。表示言語が決まったら Rust 側で差し替える
    expect(tauri.app.windows[0].title).toBe(tauri.productName);
    expect(read("index.html")).toContain(tauri.productName);
  });

  it("版は package.json / tauri.conf.json と揃っている", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string };
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };

    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toBe(tauri.version);
  });
});
