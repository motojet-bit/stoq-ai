import { useId } from "react";
import type { ModelSuggestion } from "@/lib/config/modelCatalog";

interface Props {
  value: string;
  onChange: (value: string) => void;
  suggestions: ModelSuggestion[];
  /** 候補が無いときに出すプレースホルダ */
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * モデル名のコンボボックス。
 *
 * `<datalist>` を使い、代表的なモデルをドロップダウンから選べると同時に
 * 任意の文字列を手入力できる（新しいモデルが出てもアプリ更新なしで使える）。
 */
export default function ModelCombo({
  value,
  onChange,
  suggestions,
  placeholder,
  ariaLabel,
}: Props) {
  const listId = useId();

  return (
    <div className="relative">
      <input
        type="text"
        // list 属性を付けた input はブラウザが自動でコンボボックスとして扱うため、
        // role="combobox" を手で足すと ARIA の状態管理が壊れる
        list={listId}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="selectable h-8 w-full rounded-md border border-slate-700 bg-slate-950 pl-2.5 pr-7 font-mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />
      {suggestions.length > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500"
        >
          ▼
        </span>
      )}
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.note}
          </option>
        ))}
      </datalist>
    </div>
  );
}
