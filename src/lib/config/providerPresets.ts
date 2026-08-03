/**
 * OpenAI 互換プロバイダの定型設定。
 *
 * **Base URL を覚えている人はいない。** 追加のたびに調べさせると、
 * 安いモデルを使いたい人がそこで諦める。
 * 1 押しで枠を作り、あとはキーを入れるだけにする。
 *
 * ここに載せるのは**接続先の情報だけ**。APIキーは含めない
 * （プリセットに鍵を持たせない、というのが前提）。
 */

export interface ProviderPreset {
  /** 内部キー。**保存データに入らない**（表示と初期値の選択にだけ使う） */
  id: string;
  /** 追加したときに付く表示名 */
  label: string;
  baseUrl: string;
  /** 既定で入れておくモデル名 */
  model: string;
  /** キーの取得先。画面から開けるようにする */
  signupUrl: string;
  /** 一行の説明を引く辞書キー */
  noteKey: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-reasoner",
    signupUrl: "https://platform.deepseek.com/api_keys",
    noteKey: "preset.note.deepseek",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow（硅基流动）",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-72B-Instruct",
    signupUrl: "https://cloud.siliconflow.cn/account/ak",
    noteKey: "preset.note.siliconflow",
  },
  {
    id: "ollama",
    label: "Ollama（ローカル）",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5",
    signupUrl: "https://ollama.com/download",
    noteKey: "preset.note.ollama",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-r1",
    signupUrl: "https://openrouter.ai/keys",
    noteKey: "preset.note.openrouter",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    signupUrl: "https://console.groq.com/keys",
    noteKey: "preset.note.groq",
  },
];

export function presetById(id: string): ProviderPreset | null {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * その接続先がもう追加されているか。
 *
 * **Base URL で見る。** 表示名は変えられるので、名前で見ると
 * 同じ接続先を何度も足せてしまう。
 */
export function isPresetAdded(
  preset: ProviderPreset,
  existing: { baseUrl: string }[],
): boolean {
  const target = normalizeUrl(preset.baseUrl);
  return existing.some((p) => normalizeUrl(p.baseUrl) === target);
}

/** 末尾のスラッシュと大文字小文字の差を吸収する。 */
export function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * ローカルで動かすものか。
 *
 * **キーが要らない**ので、未設定でも警告を出さないために使う。
 */
export function isLocalPreset(preset: ProviderPreset): boolean {
  const url = normalizeUrl(preset.baseUrl);
  return url.includes("localhost") || url.includes("127.0.0.1");
}
