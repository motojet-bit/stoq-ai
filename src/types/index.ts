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

/** 市場データの取得元 */
export type MarketProviderId = "yahoo" | "fmp" | "alphavantage";

/** 取得元 1 件の状態 */
export interface MarketProviderStatus {
  id: MarketProviderId;
  label: string;
  /** APIキーが必要か */
  requiresKey: boolean;
  /** いま取得できる状態か */
  ready: boolean;
  /** 使えない理由。使えるなら null */
  reason: string | null;
}

/** Rust 側から返る設定の安全な表現。生の APIキーは含まれない。 */
export interface AppSettings {
  provider: ProviderId;
  /** 組み込みプロバイダのモデル名 */
  models: Record<string, string>;
  customProviders: CustomProvider[];
  secUserAgent: string;
  maxPromptTokens: number;
  /** 選択中の市場データ取得元 */
  marketProvider: MarketProviderId;
  /** 取得元ごとの状態 */
  marketProviders: MarketProviderStatus[];
  /** AI の合否判定に使う閾値。既定から変更した項目だけ入る */
  thresholds: Record<string, number>;
  /** ライセンスの状態 */
  license: LicenseStatus;
  /** 無料版で分析した銘柄（大文字） */
  freeTickers: string[];
  /** クラウド同期の状態 */
  cloud: CloudStatus;
  /** 組み込み + カスタムの全プロバイダのキー状態 */
  keys: KeyStatus[];
}

/** クラウド同期（Google Drive アプリ専用領域）の状態。生のトークンは含まない。 */
export interface CloudStatus {
  /** Google と連携済みか */
  connected: boolean;
  clientIdConfigured: boolean;
  /** マスク済みのクライアント ID。未設定なら null */
  clientIdMasked: string | null;
  /** 起動時に自動バックアップするか */
  autoBackup: boolean;
  /** 最後にバックアップした時刻（ミリ秒）。未実施なら 0 */
  lastBackupMs: number;
  /** 要求しているアクセス範囲（アプリ専用領域のみ） */
  scope: string;
}

/** クラウド上のバックアップ 1 件 */
export interface CloudBackupFile {
  id: string;
  name: string;
  /** RFC 3339 の更新日時 */
  modifiedTime: string;
  sizeBytes: number;
}

/** バックアップの結果 */
export interface CloudBackupResult {
  fileName: string;
  sizeBytes: number;
  uploadedAtMs: number;
  /** バックアップに含めたファイル名 */
  included: string[];
}

/** 復元の結果 */
export interface CloudRestoreResult {
  fileName: string;
  createdAtMs: number;
  /** 実際に書き戻したファイル名 */
  restored: string[];
}

/** settings_save に渡す差分。指定した項目だけ更新される。 */
export interface SettingsPatch {
  provider?: ProviderId;
  models?: Record<string, string>;
  secUserAgent?: string;
  maxPromptTokens?: number;
  marketProvider?: MarketProviderId;
  /** 渡した内容で丸ごと置き換える */
  thresholds?: Record<string, number>;
}

/** settings_update_custom_provider に渡す差分 */
export interface CustomProviderPatch {
  label?: string;
  baseUrl?: string;
  model?: string;
}

/** 20項目分析の役割（概要のみ。プロンプト本文は Rust 側にある） */
export interface AnalystRole {
  id: string;
  label: string;
  /** ドロップダウンに出す一行説明 */
  summary: string;
  /** 重点的に見る観点 */
  focus: string[];
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

/** SQLite に保存された分析結果 */
export interface SavedAnalysis {
  ticker: string;
  /** LLM の生の Markdown 出力 */
  raw: string;
  provider: string | null;
  model: string | null;
  promptTokens: number;
  notes: string[];
  /** 分析に使ったデータ元 */
  basis: string[];
  /** 構造化した分析データ（JSON 文字列）。未保存なら `{}` */
  record: string;
  savedAtMs: number;
}

/** ライセンスの状態（生のキーは含まない） */
export interface LicenseStatus {
  activated: boolean;
  /** 例: `A1B2…7890`。未設定なら null */
  masked: string | null;
  message: string;
}

/** 分析アーカイブ 1 件（本文は含まない） */
export interface ArchiveEntry {
  id: string;
  ticker: string;
  provider: string | null;
  model: string | null;
  /** 20項目の平均スコア */
  averageScore: number | null;
  /** 対象四半期などのラベル（例: FY2026 Q3） */
  periodLabel: string | null;
  /** 構造化した分析データ（JSON 文字列）。未保存なら `{}` */
  record: string;
  savedAtMs: number;
}

/** ポートフォリオ（銘柄リスト／フォルダ）1 件 */
export interface Portfolio {
  id: string;
  name: string;
  /** 所属銘柄（追加順） */
  tickers: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

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

/** 左サイドバーに並ぶ会話履歴の 1 件（SQLite に保存される） */
export interface ChatSession {
  id: string;
  title: string;
  ticker: string | null;
  /** アーカイブ済みか。削除せずに一覧から退避させた状態 */
  isArchived: boolean;
  messageCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

/** サイドバーの「検討中銘柄」1 件（SQLite に保存される） */
export interface CandidateStock {
  id: string;
  ticker: string;
  /** 社名。未入力なら空文字 */
  name: string;
  /** ジャンル・テーマ。未入力なら空文字 */
  genre: string;
  createdAtMs: number;
}

/** ストックした AI の役割設定（システムプロンプト）1 件 */
export interface StoredPrompt {
  id: string;
  title: string;
  body: string;
  /** 既定で用意した役割か */
  builtin: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

/** 保存されたチャットメッセージ 1 件 */
export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtMs: number;
}

/** メインエリアのタブ */
export type TabKind = "workspace" | "analysis" | "document" | "compare";

export interface WorkspaceTab {
  id: string;
  title: string;
  kind: TabKind;
  ticker: string | null;
  closable: boolean;
  /** 比較タブで並べる銘柄 */
  tickers?: string[];
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
