import type { ComponentProps } from "react";
import AnalysisPanel from "@/components/AnalysisPanel";
import DebatePanel from "@/components/DebatePanel";
import ResizableSplit from "@/components/ResizableSplit";
import { useDebatePaneOpen } from "@/lib/ui/debateLayout";

type AnalysisProps = ComponentProps<typeof AnalysisPanel>;

/**
 * 分析ペインと批判的検証ペインの 2 分割。
 *
 * **閉じているときは分割そのものを作らない。**
 * 幅ゼロのペインを残すと、リサイズの当たり判定だけが画面に残って
 * 掴めるのに何も動かない、という状態になる。
 */
export default function AnalysisWithDebate(props: AnalysisProps) {
  const open = useDebatePaneOpen();

  if (!open) return <AnalysisPanel {...props} />;

  // 検証の対象はメイン分析の生成本文。空なら DebatePanel 側で実行を止める
  const analysisText = props.run?.raw?.trim() ? props.run.raw : null;

  return (
    <ResizableSplit
      direction="horizontal"
      initialFirstSize={Math.round(window.innerWidth * 0.55)}
      minFirstSize={280}
      minSecondSize={260}
      first={<AnalysisPanel {...props} />}
      second={
        <DebatePanel
          ticker={props.ticker}
          analysisText={analysisText}
          onOpenSettings={props.onOpenSettings}
        />
      }
    />
  );
}
