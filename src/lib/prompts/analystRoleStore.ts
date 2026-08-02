import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import type { AnalystRole } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * 20項目分析の「役割」。
 *
 * **プロンプト本文は Rust 側にあり、フロントは概要しか受け取らない。**
 * ここが持つのは一覧（ID・表示名・概要・重点項目）と、いま選んでいる ID だけ。
 * 選択は端末ごとの好みなので localStorage に置く。
 */

const ACTIVE_KEY = "stockanalyzer.analystRole";
export const DEFAULT_ROLE_ID = "general";

let roles: AnalystRole[] = [];
let activeId: string = readActiveId();

const listeners = new Set<() => void>();

function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? DEFAULT_ROLE_ID;
  } catch {
    return DEFAULT_ROLE_ID;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnalystRoles(): AnalystRole[] {
  return useSyncExternalStore(
    subscribe,
    () => roles,
    () => roles,
  );
}

export function useActiveRoleId(): string {
  return useSyncExternalStore(
    subscribe,
    () => activeId,
    () => activeId,
  );
}

export function getActiveRoleId(): string {
  return activeId;
}

export function getRoles(): AnalystRole[] {
  return roles;
}

export function activeRole(): AnalystRole | null {
  return roles.find((r) => r.id === activeId) ?? null;
}

export function setActiveRole(id: string): void {
  activeId = id;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // 保存できなくても動作は続ける
  }
  emit();
}

export async function loadAnalystRoles(): Promise<void> {
  if (!isTauri()) return;
  try {
    roles = await invoke<AnalystRole[]>("analysis_roles");
    // 保存されていた ID が消えていたら既定へ戻す
    if (!roles.some((r) => r.id === activeId)) setActiveRole(DEFAULT_ROLE_ID);
    else emit();
  } catch (e) {
    toastError(t("toast.role.loadFailed"), e);
  }
}

/**
 * 組み立て後のシステムプロンプトの概算トークン数。
 * **本文は受け取らず、長さだけ**を Rust から取る（資料の予算計算用）。
 */
export async function systemPromptTokens(
  roleId: string,
  thresholds: Record<string, number>,
): Promise<number> {
  if (!isTauri()) return 0;
  try {
    return await invoke<number>("analysis_prompt_tokens", {
      preset: { roleId, thresholds },
    });
  } catch {
    // 取れなくても分析は進める。概算なので保守的に多めを返す
    return 4_000;
  }
}

/** 設定画面のプレビュー用。ユーザー自身の閾値部分だけが返る。 */
export async function thresholdPreview(
  thresholds: Record<string, number>,
): Promise<string> {
  if (!isTauri()) return t("toast.role.appOnly");
  try {
    return await invoke<string>("analysis_threshold_preview", { thresholds });
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
}
