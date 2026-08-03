import { useEffect, useRef, useState } from "react";
import { countUpValue, isCountUpDone } from "@/lib/ui/countUp";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  /** 確定した平均スコア。まだ出揃っていなければ null */
  score: number | null;
  /** 生成中か。**走っている間は出さない**（途中の平均は意味を持たない） */
  running: boolean;
}

/**
 * 平均スコアのカウントアップ表示。
 *
 * **生成中は出さない。** 段ごとに採点しているので、途中の平均は
 * 「まだ採点していない項目を除いた平均」でしかなく、
 * 見えていると確定値と取り違える。
 * 全段が終わってから、0 から回して確定させる。
 */
export default function ScoreCountUp({ score, running }: Props) {
  const t = useT();
  const [shown, setShown] = useState<number | null>(null);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    if (running || score === null) {
      setShown(null);
      startedFor.current = null;
      return;
    }
    // 同じスコアで何度も回さない（再描画のたびに演出が走ると鬱陶しい）
    if (startedFor.current === score) return;
    startedFor.current = score;

    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      setShown(countUpValue(score, elapsed));
      if (!isCountUpDone(elapsed)) {
        frame = requestAnimationFrame(tick);
      } else {
        setShown(score);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, running]);

  if (shown === null) return null;

  const settled = shown === score;

  return (
    <span
      className={`t-label shrink-0 font-mono tabular-nums transition-colors ${
        settled ? "text-emerald-400" : "text-emerald-600"
      }`}
    >
      {t("analysis.averageScore", { score: shown.toFixed(1) })}
    </span>
  );
}
