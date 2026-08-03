import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorDetail, errorMessage, parseAppError } from "@/lib/errors/errorMessage";
import { setLocale } from "@/lib/i18n/i18n";

/*
 * 文面は言語を明示して検証する（既定は英語）。
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("エラーの読み取り", () => {
  it("Rust から来た形をそのまま読む", () => {
    expect(parseAppError({ code: "ERR_DB_OPEN", detail: "locked" })).toEqual({
      code: "ERR_DB_OPEN",
      detail: "locked",
    });
  });

  it("詳細が無くても読める", () => {
    expect(parseAppError({ code: "ERR_NOT_FOUND" })).toEqual({
      code: "ERR_NOT_FOUND",
      detail: "",
    });
  });

  it("**何が来ても落ちない**", () => {
    for (const value of [null, undefined, 42, [], {}, new Error("boom"), "plain text"]) {
      expect(() => parseAppError(value)).not.toThrow();
      expect(parseAppError(value).code).toMatch(/^ERR_/);
    }
  });

  it("判別できないものは原因不明に寄せ、元の文言は詳細に残す", () => {
    const parsed = parseAppError(new Error("boom"));
    expect(parsed.code).toBe("ERR_UNEXPECTED");
    expect(parsed.detail).toBe("boom");
  });

  it("コードだけの文字列も拾う", () => {
    expect(parseAppError("ERR_HTTP")).toEqual({ code: "ERR_HTTP", detail: "" });
  });

  it("コードらしくない値は本文として扱う", () => {
    // 「err_http」「ERROR」などをコードと誤認しない
    expect(parseAppError("err_http").code).toBe("ERR_UNEXPECTED");
    expect(parseAppError({ code: "なにか" }).code).toBe("ERR_UNEXPECTED");
  });
});

describe("表示用の文面", () => {
  it("**表示言語に追従する**", () => {
    setLocale("ja");
    expect(errorMessage({ code: "ERR_API_KEY_MISSING" })).toContain("APIキー");
    setLocale("en");
    expect(errorMessage({ code: "ERR_API_KEY_MISSING" })).toContain("API key");
    setLocale("ja");
  });

  it("詳細があれば添える（原因を捨てない）", () => {
    setLocale("ja");
    const text = errorMessage({ code: "ERR_DB_OPEN", detail: "database is locked" });
    expect(text).toContain("database is locked");
  });

  it("**訳の無いコードでもコードそのものを出す**（画面から消えない）", () => {
    expect(errorMessage({ code: "ERR_TOTALLY_NEW" })).toContain("ERR_TOTALLY_NEW");
  });

  it("詳細だけ取り出せる", () => {
    expect(errorDetail({ code: "ERR_IO", detail: "no such file" })).toBe("no such file");
  });
});

describe("Rust とフロントの対応", () => {
  const rust = read("src-tauri/src/error.rs");
  const codes = [...rust.matchAll(/"(ERR_[A-Z0-9_]+)"/g)]
    .map((m) => m[1])
    // ドキュメントコメント中の例は除く
    .filter((c) => c !== "ERR_XXX");

  const dict = (name: string) =>
    JSON.parse(read(`src/locales/${name}.json`)) as Record<string, string>;

  it("**Rust の全コードに訳がある**（未訳だとコードが生で出る）", () => {
    const ja = dict("ja");
    const en = dict("en");
    for (const code of new Set(codes)) {
      expect(ja[`errors.${code}`], `ja に ${code} が無い`).toBeTruthy();
      expect(en[`errors.${code}`], `en に ${code} が無い`).toBeTruthy();
    }
  });

  it("**辞書に余分な訳が無い**（消したコードが残らない）", () => {
    const known = new Set(codes);
    for (const key of Object.keys(dict("ja"))) {
      if (!key.startsWith("errors.")) continue;
      expect(known.has(key.slice("errors.".length)), `${key} は Rust に無い`).toBe(true);
    }
  });

  it("Rust 側が日本語のエラー文面を組み立てていない", () => {
    // `AppError::msg("…")` を復活させない
    expect(rust).not.toContain("AppError::msg");
  });
});

describe("コードと本文が 1 本の文字列で来る場合", () => {
  it("コードと詳細に割る", () => {
    const parsed = parseAppError(
      new Error("ERR_LLM_RESPONSE_INVALID: HTTP 400: Unsupported parameter: 'max_tokens'"),
    );
    expect(parsed.code).toBe("ERR_LLM_RESPONSE_INVALID");
    expect(parsed.detail).toContain("max_tokens");
  });

  it("改行を含む本文も落とさない", () => {
    const parsed = parseAppError(["ERR_HTTP: 一行目", "二行目"].join("\n"));
    expect(parsed.detail).toContain("二行目");
  });

  it("コードだけならこれまで通り", () => {
    expect(parseAppError("ERR_DB_QUERY")).toEqual({ code: "ERR_DB_QUERY", detail: "" });
  });
});
