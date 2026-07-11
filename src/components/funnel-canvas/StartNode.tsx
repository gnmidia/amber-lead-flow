import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";

// Nó "Início": fixo (não deletável), sempre presente no canvas.
// A edge que sai dele define EXPLICITAMENTE o primeiro bloco do funil
// (funnels.start_block_id) — o motor segue essa ligação, sem dedução.
export const StartNode = memo(function StartNode({ data }: NodeProps) {
  const connected = (data as any)?.connected as boolean;
  return (
    <div
      className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 shadow-lg ${
        connected
          ? "border-success bg-success/15 text-success"
          : "border-warning bg-warning/10 text-warning"
      }`}
    >
      <Play className="h-4 w-4 fill-current" />
      <span className="text-xs font-bold uppercase tracking-wider">Início</span>
      <Handle
        type="source"
        position={Position.Right}
        className={`!h-3 !w-3 ${connected ? "!bg-success" : "!bg-warning"}`}
      />
    </div>
  );
});
