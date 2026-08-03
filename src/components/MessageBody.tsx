import { useState } from "react";
import { hasTable, splitBlocks } from "@/lib/chat/markdownTable";
import { QUOTE_MARK } from "@/lib/chat/chatDraft";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  body: string;
}

/**
 * 会話 1 件の本文。
 *
 * **表は表として描く。** 転送した評価テーブルが素のテキストのままだと、
 * パイプ記号が並ぶだけで読み取れない。
 * ただし**元のテキストも見られるようにする**（コピーして他所へ貼るときに要る）。
 */
export default function MessageBody({ body }: Props) {
  const t = useT();
  const [raw, setRaw] = useState(false);
  const showToggle = hasTable(body);

  if (raw || !showToggle) {
    return (
      <>
        {showToggle && <ViewToggle raw={raw} onChange={setRaw} label={t("chat.viewVisual")} />}
        <QuotedText text={body} />
      </>
    );
  }

  return (
    <>
      <ViewToggle raw={raw} onChange={setRaw} label={t("chat.viewRaw")} />
      <div className="space-y-2">
        {splitBlocks(body).map((block, i) =>
          block.kind === "table" ? (
            <div key={i} className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-900/70">
                    {block.table.header.map((cell, c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap border-b border-slate-800 px-2 py-1 text-left t-label font-medium text-slate-400"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.table.rows.map((row, r) => (
                    <tr key={r} className="border-b border-slate-800/60 last:border-0">
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className="selectable px-2 py-1 align-top t-label leading-relaxed text-slate-300"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <QuotedText key={i} text={block.text} />
          ),
        )}
      </div>
    </>
  );
}

function ViewToggle({
  raw,
  onChange,
  label,
}: {
  raw: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!raw)}
      className="mb-1.5 rounded border border-slate-700 px-1.5 py-0.5 t-label text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300"
    >
      {label}
    </button>
  );
}

/**
 * 引用として差し込まれた部分を赤字で見せる。
 *
 * **自分が書いた文と、貼り込んだ引用を見分けられるようにする。**
 * 混ざると、どこまでが過去の分析でどこからが今回の質問か分からなくなる。
 */
function QuotedText({ text }: { text: string }) {
  return (
    <p className="selectable t-body whitespace-pre-wrap break-words text-slate-300">
      {text.split("\n").map((line, i) => (
        <span
          key={i}
          className={line.startsWith(QUOTE_MARK) ? "block text-red-400/90" : "block"}
        >
          {line === "" ? " " : line}
        </span>
      ))}
    </p>
  );
}
