import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Placement = "top" | "bottom" | "left" | "right";

interface Props {
  /** 表示する説明文。改行はそのまま反映される */
  content: string;
  placement?: Placement;
  /** 吹き出しの幅 */
  widthClass?: string;
  children: ReactNode;
}

/**
 * ホバーで説明を出す吹き出し。
 *
 * `title` 属性だと表示まで 1〜2 秒待たされ、改行も装飾もできない。
 * 初心者向けの案内は**すぐ出て読みやすい**必要があるので自前で持つ。
 * 文字サイズは `.ui-fixed` で固定する（本文を拡大しても吹き出しは崩さない）。
 */
export default function Tooltip({
  content,
  placement = "top",
  widthClass = "w-64",
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [flipped, setFlipped] = useState<Placement>(placement);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // 画面外にはみ出すときは反対側へ寄せる
  useLayoutEffect(() => {
    if (!open || !bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();

    if (placement === "top" && rect.top < 8) setFlipped("bottom");
    else if (placement === "bottom" && rect.bottom > window.innerHeight - 8) setFlipped("top");
    else if (placement === "left" && rect.left < 8) setFlipped("right");
    else if (placement === "right" && rect.right > window.innerWidth - 8) setFlipped("left");
    else setFlipped(placement);
  }, [open, placement]);

  const position: Record<Placement, string> = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
    left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
    right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
  };

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}

      {open && (
        <span
          ref={bubbleRef}
          role="tooltip"
          className={`ui-fixed pointer-events-none absolute z-300 ${position[flipped]} ${widthClass} whitespace-pre-wrap rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 leading-relaxed text-slate-100 shadow-xl shadow-black/50`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
