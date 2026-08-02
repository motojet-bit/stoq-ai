import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  clampOffset,
  isCentered,
  MODAL_OVERLAY_CLASS,
  offsetFromDrag,
  type Offset,
} from "@/lib/ui/modalDrag";
import { IconClose, IconGrip } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  title: string;
  icon?: ReactNode;
  /** 本体の最大幅（Tailwind のクラス） */
  maxWidthClass?: string;
  children: ReactNode;
  /** 下部に固定するボタン行など */
  footer?: ReactNode;
  /**
   * 閉じる手段をすべて取り上げる（Esc も ✕ も無し）。
   * 免責事項の同意のように、**応えないと先へ進めてはいけない**ものに使う。
   */
  blocking?: boolean;
  onClose: () => void;
}

/**
 * モーダルの共通枠。
 *
 * - **ヘッダーをドラッグして自由な位置へ動かせる。**
 *   設定を見ながら本体画面を確認できるようにするため
 * - **外側の暗い部分をクリックしても閉じない。**
 *   入力途中の内容が消えるのを防ぐ。閉じるのは ✕ / キャンセル / Esc だけ
 */
export default function ModalShell({
  open,
  title,
  icon,
  maxWidthClass = "max-w-3xl",
  children,
  footer,
  blocking = false,
  onClose,
}: Props) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<{ start: Offset; origin: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);

  // 開き直したら中央へ戻す
  useEffect(() => {
    if (open) setOffset({ x: 0, y: 0 });
  }, [open]);

  const fit = useCallback((next: Offset): Offset => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return next;
    return clampOffset({
      offset: next,
      size: { width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }, []);

  const onPointerMove = useCallback(
    (e: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setOffset(fit(offsetFromDrag(drag.start, drag.origin, { x: e.clientX, y: e.clientY })));
    },
    [fit],
  );

  useEffect(() => {
    if (!dragging) return;

    const stop = () => {
      dragRef.current = null;
      setDragging(false);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
  }, [dragging, onPointerMove]);

  // ウィンドウを縮めたときに画面外へ取り残さない
  useEffect(() => {
    if (!open) return;
    const onResize = () => setOffset((current) => fit(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, fit]);

  useEffect(() => {
    if (!open || blocking) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, blocking, onClose]);

  if (!open) return null;

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { start: offset, origin: { x: e.clientX, y: e.clientY } };
    setDragging(true);
  };

  return (
    /*
     * **背景に onClick を付けない**のが要点。
     * 誤ってクリックしたときに入力途中の内容が消えないようにする。
     * 閉じるのは ✕ / キャンセル / Esc だけ。
     * 背後の操作は塞ぐ（クリックが裏側へ抜けると意図しない状態になるため）。
     */
    <div
      className={`fixed inset-0 z-100 flex items-center justify-center p-6 ${MODAL_OVERLAY_CLASS}`}
    >
      <div
        ref={cardRef}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        className={`flex max-h-full w-full ${maxWidthClass} flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-white/5`}
      >
        <header
          onPointerDown={startDrag}
          title={t("modal.dragHint")}
          className={`flex min-h-12 shrink-0 select-none items-center justify-between gap-2 border-b border-slate-800 px-4 ${
            dragging ? "cursor-grabbing bg-slate-800/60" : "cursor-grab"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <IconGrip className="h-4 w-4 shrink-0 text-slate-600" />
            {icon}
            <h2 className="truncate t-body font-semibold text-slate-100">{title}</h2>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!isCentered(offset) && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setOffset({ x: 0, y: 0 })}
                className="rounded px-2 py-1 t-label text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                {t("modal.recenter")}
              </button>
            )}
            {!blocking && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                aria-label={t("modal.closeAria", { title })}
                className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >
                <IconClose className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer}
      </div>
    </div>
  );
}
