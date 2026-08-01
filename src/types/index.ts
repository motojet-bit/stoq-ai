/** アプリ全体で共有する型定義 */

/** ID が固定の組み込みプロバイダ */
export type BuiltinProviderId = "openai" | "anthropic" | "gemini";

/**
 * プロバイダ ID。組み込みの 3 種、またはユーザーが追加した
 * OpenAI互換プロバイダの採番済み ID（例: `custom-1738…`）。
 */
export type ProviderId = string;

/** ユーザーが追加した OpenAI互換プロバイダ 1 件 */
export interface CustomProvider {
  id: ProviderId;
  /** 画面に出す識別ラベル（例: DeepSeek, Moonshot） */
  label: string;
  baseUrl: string;
  model: string;
}

/** APIキーの設定状況（キー本体は保持せず、マスク済み文字列のみ持つ） */
export interface KeyStatus {
  provider: ProviderId;
  configured: boolean;
  /** 例: "sk-…3f9a"。未設定なら null */
  masked: string | null;
}

/** Rust 側から返る設定の安全な表現。生の APIキーは含まれない。 */
export interface AppSettings {
  provider: ProviderId;
  /** 組み込みプロバイダのモデル名 */
  models: Record<string, string>;
  customProviders: CustomProvider[];
  secUserAgent: string;
  maxPromptTokens: number;
  /** 組み込み + カスタムの全プロバイダのキー状態 */
  keys: KeyStatus[];
}

/** settings_save に渡す差分。指定した項目だけ更新される。 */
export interface SettingsPatch {
  provider?: ProviderId;
  models?: Record<string, string>;
  secUserAgent?: string;
  maxPromptTokens?: number;
}

/** settings_update_custom_provider に渡す差分 */
export interface CustomProviderPatch {
  label?: string;
  baseUrl?: string;
  model?: string;
}

/** LLM に渡す会話 1 メッセージ */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 画面に表示する会話 1 件（エラーやストリーミング中の状態を持つ） */
export interface DisplayMessage extends ChatMessage {
  id: string;
  streaming?: boolean;
  error?: string;
}

/** Rust 側からストリーミングで届くイベント */
export type LlmEvent =
  | { type: "start"; provider: string; model: string }
  | { type: "delta"; text: string }
  | { type: "done"; text: string; cancelled: boolean }
  | { type: "error"; message: string };

/** SEC 提出書類の本文（プロンプトに載せる用） */
export interface SecFilingText {
  ticker: string;
  company: string;
  form: string;
  filed: string;
  period: string;
  url: string;
  text: string;
  charCount: number;
  truncated: boolean;
}

/** 左サイドバーに並ぶ会話履歴の 1 件 */
export interface ChatSession {
  id: string;
  title: string;
  ticker: string | null;
  updatedLabel: string;
}

/** メインエリアのタブ */
export type TabKind = "workspace" | "analysis" | "document";

export interface WorkspaceTab {
  id: string;
  title: string;
  kind: TabKind;
  ticker: string | null;
  closable: boolean;
}

// ---------------------------------------------------------------- 財務データ

/** 指標 1 項目 */
export interface Metric {
  label: string;
  /** 整形済みの表示文字列。取得できなかった場合は "—" */
  value: string;
  /** 生の数値 */
  raw: number | null;
}

export interface MetricGroup {
  title: string;
  metrics: Metric[];
}

/** Yahoo Finance から取得した主要指標 */
export interface Fundamentals {
  ticker: string;
  name: string;
  currency: string;
  exchange: string;
  price: number | null;
  priceDisplay: string;
  changePercent: number | null;
  groups: MetricGroup[];
  /** 一部だけ取得できた場合の注意書き */
  warning: string | null;
  fetchedAtMs: number;
}

/** 四半期 1 期分 */
export interface Quarter {
  label: string;
  endDate: string;
  revenue: number | null;
  revenueDisplay: string;
  netIncome: number | null;
  netIncomeDisplay: string;
  /** 純利益率 (%) */
  netMargin: number | null;
  /** 前四半期比 (%) */
  revenueQoq: number | null;
  /** 前年同期比 (%) */
  revenueYoy: number | null;
  epsActual: number | null;
  epsEstimate: number | null;
  epsSurprisePct: number | null;
}

export interface Momentum {
  latestYoy: number | null;
  previousYoy: number | null;
  /** YoY が拡大していれば true、縮小していれば false、判定不能なら null */
  accelerating: boolean | null;
  marginImproving: boolean | null;
  summary: string;
}

/** 直近 4 四半期の推移 */
export interface QuarterlySeries {
  ticker: string;
  currency: string;
  quarters: Quarter[];
  momentum: Momentum;
  source: string;
  note: string | null;
  fetchedAtMs: number;
}

/** SEC 提出書類 1 件の要約（本文は含まない） */
export interface FilingRef {
  form: string;
  filed: string;
  period: string;
  url: string;
}

/** SEC EDGAR の提出状況 */
export interface FilingStatus {
  ticker: string;
  company: string;
  cik: string;
  status: "ok" | "userAgentMissing" | "notInEdgar" | "noFilings";
  latest10k: FilingRef | null;
  latest10q: FilingRef | null;
  message: string | null;
  fetchedAtMs: number;
}

/** 1 銘柄分の取得状態 */
export interface TickerAnalysis {
  ticker: string;
  fundamentalsLoading: boolean;
  fundamentals: Fundamentals | null;
  fundamentalsError: string | null;
  filingLoading: boolean;
  filing: FilingStatus | null;
  filingError: string | null;
  quarterlyLoading: boolean;
  quarterly: QuarterlySeries | null;
  quarterlyError: string | null;
}

// ---------------------------------------------------------------- 一次資料

/** 一時保存（ステージング）中の資料 */
export interface StagedDocument {
  id: string;
  /** ユーザーが変更できる表示名 */
  displayName: string;
  /** ドロップ時のファイル名（変更不可） */
  originalName: string;
  sizeBytes: number;
  charCount: number;
  /** 概算トークン数 */
  tokenEstimate: number;
  savedAtMs: number;
}

/** 取り込み処理中のファイル（抽出 → 保存の途中経過） */
export interface IngestingFile {
  id: string;
  name: string;
  phase: "extracting" | "saving";
}
