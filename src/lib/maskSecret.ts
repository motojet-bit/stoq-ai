/**
 * APIキーなどの秘密情報を、画面表示用にマスクする。
 * 先頭のプレフィックスと末尾 4 文字だけを残す。
 *
 *   maskSecret("sk-proj-abcdefghijklmnop3f9a") -> "sk-…3f9a"
 */
export function maskSecret(secret: string | undefined | null): string | null {
  const value = secret?.trim();
  if (!value) return null;

  const tail = value.slice(-4);

  // "sk-" や "sk-ant-" のようなプレフィックスがあれば残す
  const prefixMatch = value.match(/^[A-Za-z]+-(?:[A-Za-z]+-)?/);
  const prefix = prefixMatch ? prefixMatch[0] : value.slice(0, 2);

  if (value.length <= prefix.length + 4) return "…" + tail;
  return `${prefix}…${tail}`;
}
