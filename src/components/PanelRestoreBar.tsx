import { PANEL_TITLES, SLOT_IDS, type SlotId, type Slots } from "@/lib/ui/layoutStore";
import { IconRestore } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

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
 * 無駄な余白になるため（プロ向けトレーディングツールと同じ考え方）。
 *
 * 見落とすと「パネルが消えた」と誤解されるので、
 * 黄色のアクセント背景＋白の太字で強く目立たせている。
 */
export default function PanelRestoreBar({ slots, collapsedSlots, onRestore }: Props) {
  const t = useT();
  const hidden = SLOT_IDS.filter((slot) => collapsedSlots[slot]);
  if (hidden.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="shrink-0 whitespace-nowrap font-bold text-amber-300">
        {t("panel.minimized")}
      </span>
      {hidden.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onRestore(slot)}
          title={t("panel.restoreOne", { title: t(PANEL_TITLES[slots[slot]]) })}
          className="flex min-h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-amber-500 px-2 font-bold text-white shadow-sm shadow-amber-900/40 ring-1 ring-amber-300/60 transition-colors duration-150 hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <IconRestore className="h-3 w-3 shrink-0" />
          {t(PANEL_TITLES[slots[slot]])}
        </button>
      ))}
    </div>
  );
}
