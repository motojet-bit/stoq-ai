import { describe, expect, it } from "vitest";
import {
  isLocalPreset,
  isPresetAdded,
  normalizeUrl,
  presetById,
  PROVIDER_PRESETS,
} from "@/lib/config/providerPresets";

describe("プリセットの定義", () => {
  it("DeepSeek / SiliconFlow / Ollama が含まれる", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(ids).toContain("deepseek");
    expect(ids).toContain("siliconflow");
    expect(ids).toContain("ollama");
  });

  it("**接続先の情報だけを持つ**（APIキーは含めない）", () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.baseUrl).toMatch(/^https?:\/\//);
      expect(preset.model).not.toBe("");
      // 鍵を持たせる項目そのものが無いこと（signupUrl の "api_keys" に反応させない）
      expect(Object.keys(preset)).not.toContain("apiKey");
      expect(Object.keys(preset)).not.toContain("key");
      expect(preset.baseUrl).not.toMatch(/sk-/);
    }
  });

  it("id は重複しない（保存や表示で取り違えない）", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id で引ける。無ければ null", () => {
    expect(presetById("deepseek")?.label).toBe("DeepSeek");
    expect(presetById("unknown")).toBeNull();
  });
});

describe("追加済みの判定", () => {
  const deepseek = presetById("deepseek")!;

  it("**Base URL で見る**（表示名は変えられるので名前では見ない）", () => {
    expect(isPresetAdded(deepseek, [{ baseUrl: "https://api.deepseek.com/v1" }])).toBe(true);
    // 名前を変えられていても同じ接続先なら追加済み
    expect(isPresetAdded(deepseek, [{ baseUrl: "https://api.deepseek.com/v1/" }])).toBe(true);
  });

  it("大文字小文字と末尾のスラッシュを吸収する", () => {
    expect(normalizeUrl("HTTPS://API.DEEPSEEK.COM/v1//")).toBe("https://api.deepseek.com/v1");
  });

  it("別の接続先は追加済みにしない", () => {
    expect(isPresetAdded(deepseek, [{ baseUrl: "https://api.groq.com/openai/v1" }])).toBe(false);
    expect(isPresetAdded(deepseek, [])).toBe(false);
  });
});

describe("ローカル判定", () => {
  it("**ローカルはキーが要らない**ので、未設定でも警告しない", () => {
    expect(isLocalPreset(presetById("ollama")!)).toBe(true);
    expect(isLocalPreset(presetById("deepseek")!)).toBe(false);
  });
});
