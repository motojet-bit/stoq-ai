import { PANEL_TITLES, SLOT_IDS, type SlotId, type Slots } from "@/lib/ui/layoutStore";
import { IconRestore } from "@/components/Icons";

interface Props {
  slots: Slots;
  collapsedSlots: Record<SlotId, boolean>;
  onRestore: (slot: SlotId) => void;
}

/**
 * 最小化したパネルの復元ボタン。
 *
 * **畳んだパネルは画面から完全に取り除き、ここへ退避させる。**
 * 畳んだ枠を帯として残すと、残ったパネルが画面幅いっぱいに広がらず
 * 無駄な余白になるため（IBKR 等のプロ向けツールと同じ考え方）。
 */
export default function PanelRestoreBar({ slots, collapsedSlots, onRestore }: Props) {
  const hidden = SLOT_IDS.filter((slot) => collapsedSlots[slot]);
  if (hidden.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="shrink-0 whitespace-nowrap text-slate-600">最小化中:</span>
      {hidden.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onRestore(slot)}
          title={`${PANEL_TITLES[slots[slot]]} を元に戻す`}
          className="flex min-h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 text-slate-300 hover:border-emerald-700 hover:text-emerald-300"
        >
          <IconRestore className="h-3 w-3 shrink-0" />
          {PANEL_TITLES[slots[slot]]}
        </button>
      ))}
    </div>
  );
}
