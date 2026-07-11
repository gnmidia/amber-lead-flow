import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Shuffle, Trash2, Plus, Minus } from "lucide-react";
import type { AbOutputRow } from "./types";

export type AbSplitNodeData = {
  title: string;
  outputs: AbOutputRow[];
  onRename: (title: string) => void;
  onDeleteBlock: () => void;
  onAddOutput: () => void;
  onRemoveOutput: () => void; // remove a última saída
};

// Divisor A/B: 1 entrada, 2–10 saídas com probabilidade igual (1/N).
// weight fica no banco preparado para pesos custom; aqui mostramos a %
// normalizada (peso / soma) — com pesos default (1) é exatamente 1/N.
export const AbSplitNode = memo(function AbSplitNode({ data, selected }: NodeProps) {
  const d = data as unknown as AbSplitNodeData;
  const outputs = [...d.outputs].sort((a, b) => a.output_index - b.output_index);
  const totalWeight = outputs.reduce((s, o) => s + Number(o.weight || 1), 0) || 1;

  return (
    <div
      className={`w-56 rounded-xl border bg-card shadow-lg ${
        selected ? "border-primary/60" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-muted-foreground" />

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Shuffle className="h-3.5 w-3.5 shrink-0 text-info" />
        <input
          value={d.title}
          onChange={(e) => d.onRename(e.target.value)}
          className="nodrag w-full bg-transparent text-xs font-bold uppercase tracking-wider outline-none"
          placeholder="A/B Split"
        />
        <button
          onClick={d.onDeleteBlock}
          className="nodrag rounded p-1 text-destructive hover:bg-destructive/10"
          title="Excluir nó"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1 p-2">
        {outputs.map((o, i) => {
          const pct = (Number(o.weight || 1) / totalWeight) * 100;
          return (
            <div
              key={o.id}
              className="relative flex items-center justify-between rounded-md border border-border bg-background px-2 py-1.5"
            >
              <span className="text-[11px] font-semibold">
                Saída {String.fromCharCode(65 + i)}
              </span>
              <span className="text-[11px] font-mono text-info">{pct.toFixed(1)}%</span>
              <Handle
                id={`out-${o.output_index}`}
                type="source"
                position={Position.Right}
                className="!h-3 !w-3 !bg-info"
                style={{ top: "50%", right: -14 }}
              />
            </div>
          );
        })}

        <div className="nodrag flex items-center justify-between pt-1">
          <button
            onClick={d.onRemoveOutput}
            disabled={outputs.length <= 2}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
          >
            <Minus className="h-3 w-3" /> saída
          </button>
          <span className="text-[10px] text-muted-foreground">{outputs.length}/10</span>
          <button
            onClick={d.onAddOutput}
            disabled={outputs.length >= 10}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> saída
          </button>
        </div>
      </div>
    </div>
  );
});
