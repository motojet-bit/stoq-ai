import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 対話の添付は**上部ドロップゾーンの「一時保存中の資料」を汚さない**。
 * 混ざると、1 度だけ見せたつもりのプレスリリースが
 * それ以降のすべての分析に載り続けてしまう。
 */

const extractText = vi.fn(async (file: File) => `${file.name} の中身`);
const isSupported = vi.fn((name: string) => !name.endsWith(".exe"));

vi.mock("@/lib/parser/extractText", () => ({
  extractText: (file: File) => extractText(file),
  isSupported: (name: string) => isSupported(name),
}));

/** 一時保存側が呼ばれていないことを見張る */
const ingestFiles = vi.fn();
const stagedDocuments: unknown[] = [];
vi.mock("@/lib/parser/documentStore", () => ({
  ingestFiles: (...args: unknown[]) => ingestFiles(...args),
  useStagedDocuments: () => stagedDocuments,
  getStagedDocuments: () => stagedDocuments,
}));

const invoke = vi.fn();
vi.mock("@/lib/tauri", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}));

const toastError = vi.fn();
vi.mock("@/lib/ui/toastStore", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
  toastSuccess: vi.fn(),
  pushToast: vi.fn(),
}));

function file(name: string, size = 100): File {
  return new File(["x".repeat(size)], name, { type: "text/plain" });
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/chat/chatAttachments");
}

beforeEach(() => {
  extractText.mockClear();
  isSupported.mockClear();
  ingestFiles.mockClear();
  invoke.mockClear();
  toastError.mockClear();
});

describe("対話の添付ファイル", () => {
  it("添付するとテキストが抽出されて保持される", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("press.pdf")]);

    const items = store.getChatAttachments();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("press.pdf");
    expect(items[0].text).toBe("press.pdf の中身");
    expect(items[0].tokenEstimate).toBeGreaterThan(0);
  });

  it("**一時保存（グローバル状態）を一切触らない**", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("press.pdf")]);

    expect(ingestFiles).not.toHaveBeenCalled();
    // Rust 側の保存コマンドも呼ばない
    expect(invoke).not.toHaveBeenCalled();
  });

  it("同じ名前のファイルは差し替える（貼り直しで最新にできる）", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("press.pdf")]);
    await store.attachChatFiles([file("press.pdf")]);

    expect(store.getChatAttachments()).toHaveLength(1);
  });

  it("上限を超えたら古いものから外す（押しても無反応にしない）", async () => {
    const store = await freshStore();
    const many = Array.from({ length: store.MAX_CHAT_ATTACHMENTS + 3 }, (_, i) =>
      file(`doc${i}.txt`),
    );
    await store.attachChatFiles(many);

    const items = store.getChatAttachments();
    expect(items).toHaveLength(store.MAX_CHAT_ATTACHMENTS);
    expect(items[items.length - 1].name).toBe(`doc${many.length - 1}.txt`);
  });

  it("対応していない形式は理由を出して飛ばす", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("virus.exe"), file("ok.txt")]);

    expect(toastError).toHaveBeenCalled();
    expect(store.getChatAttachments().map((a) => a.name)).toEqual(["ok.txt"]);
  });

  it("抽出に失敗しても残りの取り込みは続ける", async () => {
    const store = await freshStore();
    extractText.mockRejectedValueOnce(new Error("壊れた PDF"));

    await store.attachChatFiles([file("broken.pdf"), file("ok.txt")]);

    expect(toastError).toHaveBeenCalled();
    expect(store.getChatAttachments().map((a) => a.name)).toEqual(["ok.txt"]);
  });

  it("個別に外せる", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("a.txt"), file("b.txt")]);
    const target = store.getChatAttachments()[0];

    store.removeChatAttachment(target.id);
    expect(store.getChatAttachments().map((a) => a.name)).toEqual(["b.txt"]);
  });

  it("**送信後にまとめて捨てる**（使い捨てなので持ち越さない）", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("a.txt")]);

    store.clearChatAttachments();
    expect(store.getChatAttachments()).toEqual([]);
  });

  it("空配列を渡しても何も起きない", async () => {
    const store = await freshStore();
    await store.attachChatFiles([]);
    expect(extractText).not.toHaveBeenCalled();
  });

  it("状態が変わったときだけ購読者へ通知する", async () => {
    const store = await freshStore();
    const notify = vi.fn();
    const unsubscribe = store.subscribeChatAttachments(notify);

    store.clearChatAttachments(); // 空なので何も起きない
    expect(notify).not.toHaveBeenCalled();

    await store.attachChatFiles([file("a.txt")]);
    expect(notify).toHaveBeenCalled();

    unsubscribe();
  });
});

describe("buildAttachmentContext", () => {
  it("資料をタグで囲んで本文の前に置く形にする", async () => {
    const store = await freshStore();
    await store.attachChatFiles([file("press.pdf")]);

    const text = store.buildAttachmentContext(store.getChatAttachments());
    expect(text).toContain('<資料 name="press.pdf"');
    expect(text).toContain("press.pdf の中身");
    expect(text).toContain("</資料>");
    expect(text).toContain("1 件");
  });

  it("添付が無ければ何も足さない", async () => {
    const store = await freshStore();
    expect(store.buildAttachmentContext([])).toBe("");
  });
});
