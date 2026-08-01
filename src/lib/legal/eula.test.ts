import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agreedAtLabel,
  EULA_CLAUSE_IDS,
  eulaClauses,
  eulaPlainText,
  isBlocked,
} from "@/lib/legal/eula";
import { setLocale } from "@/lib/i18n/i18n";

afterEach(() => {
  setLocale("ja");
});

describe("条項", () => {
  it("**指定の 3 条項がこの順で並ぶ**", () => {
    expect(EULA_CLAUSE_IDS).toEqual(["selfResponsibility", "apiBilling", "asIs"]);
    expect(eulaClauses()).toHaveLength(3);
    expect(eulaClauses().map((c) => c.id)).toEqual([...EULA_CLAUSE_IDS]);
  });

  it("日本語で要点を伝えている", () => {
    setLocale("ja");
    const [self, api, asIs] = eulaClauses();

    expect(self.body).toContain("投資助言");
    expect(self.body).toContain("自己責任");
    expect(self.body).toContain("責任を負いません");

    expect(api.body).toContain("API");
    expect(api.body).toContain("課金");

    expect(asIs.body).toContain("現状有姿");
    expect(asIs.body).toContain("消失");
  });

  it("英語でも同じ 3 点を伝えている", () => {
    setLocale("en");
    const [self, api, asIs] = eulaClauses();

    expect(self.body).toContain("not investment advice");
    expect(api.body).toContain("API keys");
    expect(asIs.body).toContain("AS-IS");
  });

  it("**訳し漏れが無い**（キーがそのまま出ていない）", () => {
    for (const code of ["ja", "en"]) {
      setLocale(code);
      for (const clause of eulaClauses()) {
        expect(clause.title, `${code}/${clause.id}`).not.toContain("eula.");
        expect(clause.body, `${code}/${clause.id}`).not.toContain("eula.");
        expect(clause.title.length, `${code}/${clause.id}`).toBeGreaterThan(3);
        expect(clause.body.length, `${code}/${clause.id}`).toBeGreaterThan(40);
      }
    }
  });

  it("日英で内容が入れ替わっていない", () => {
    setLocale("ja");
    const ja = eulaClauses().map((c) => c.body);
    setLocale("en");
    const en = eulaClauses().map((c) => c.body);

    expect(ja[0]).not.toBe(en[0]);
    expect(en.join("")).not.toContain("投資");
  });
});

describe("同意が済むまで塞ぐ", () => {
  it("未同意ならブロックする", () => {
    expect(isBlocked({ agreed: false })).toBe(true);
  });

  it("**状態が分からないうちもブロックする**", () => {
    // 読み込み中に素通りさせると、未同意のまま一瞬でも操作できてしまう
    expect(isBlocked(null)).toBe(true);
  });

  it("同意済みなら通す", () => {
    expect(isBlocked({ agreed: true })).toBe(false);
  });
});

describe("同意日時", () => {
  it("未同意なら空", () => {
    expect(agreedAtLabel(0)).toBe("");
    expect(agreedAtLabel(-1)).toBe("");
  });

  it("同意済みなら日時を出す", () => {
    expect(agreedAtLabel(1_700_000_000_000)).not.toBe("");
    expect(agreedAtLabel(1_700_000_000_000)).toContain("2023");
  });
});

describe("あとから確認できる", () => {
  it("全文をプレーンテキストにできる", () => {
    setLocale("ja");
    const text = eulaPlainText();

    for (const [i, clause] of eulaClauses().entries()) {
      expect(text).toContain(`${i + 1}. ${clause.title}`);
      expect(text).toContain(clause.body);
    }
  });
});

describe("同意モーダルの組み方", () => {
  const SOURCE = readFileSync(
    join(process.cwd(), "src/components/EulaModal.tsx"),
    "utf-8",
  );

  it("**閉じる手段を持たない**（Esc・✕・背景クリックのいずれでも消えない）", () => {
    expect(SOURCE).toContain("blocking");
    // 「あとで」「キャンセル」といった逃げ道を置かない
    expect(SOURCE).not.toContain("あとで");
    expect(SOURCE).not.toContain("キャンセル");
  });

  it("同意ボタンだけが先へ進む道になっている", () => {
    expect(SOURCE).toContain("agreeEula");
    expect(SOURCE).toContain('t("eula.agree")');
  });

  it("表示するのは未同意のときだけ", () => {
    expect(SOURCE).toContain("useEulaBlocked");
    expect(SOURCE).toContain("open={blocked}");
  });

  it("文言を直書きしていない（日英どちらでも読める）", () => {
    expect(SOURCE).not.toContain("同意して利用を開始する");
    expect(SOURCE).toContain("useT");
  });

  it("ModalShell が blocking のとき Esc と ✕ を外している", () => {
    const shell = readFileSync(
      join(process.cwd(), "src/components/ModalShell.tsx"),
      "utf-8",
    );
    expect(shell).toContain("if (!open || blocking) return;");
    expect(shell).toContain("{!blocking && (");
  });
});
