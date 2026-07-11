import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Type, Mic, Image as ImageIcon, Video, FileText, Tag as TagIcon, Clock,
  Trash2, GripVertical, Plus,
} from "lucide-react";
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ACTION_LABEL, DND_MIME, PALETTE,
  type ActionType, type FunnelActionRow,
} from "./types";

const ACTION_ICON: Record<ActionType, React.ComponentType<{ className?: string }>> = {
  texto: Type, audio: Mic, imagem: ImageIcon, video: Video,
  documento: FileText, tag: TagIcon, delay: Clock,
};

export type BlockNodeData = {
  title: string;
  actions: FunnelActionRow[];
  onRename: (title: string) => void;
  onDeleteBlock: () => void;
  onAddAction: (type: ActionType) => void;
  onEditAction: (action: FunnelActionRow) => void;
  onDeleteAction: (actionId: string) => void;
  onReorderActions: (orderedIds: string[]) => void;
};

function actionSummary(a: FunnelActionRow): string {
  const c = a.config || {};
  if (a.type === "texto") return c.content?.trim() || "(sem texto)";
  if (a.type === "delay") {
    const unit = c.unit === "hours" ? "h" : c.unit === "minutes" ? "min" : "s";
    return `Aguardar ${c.value ?? 0}${unit}`;
  }
  if (a.type === "tag") return c.tag_operation === "remove" ? "Remover tag" : "Atribuir tag";
  return c.file_name || c.media_url || "(sem arquivo)";
}

export const BlockNode = memo(function BlockNode({ data, selected }: NodeProps) {
  const d = data as unknown as BlockNodeData;
  const [dragOver, setDragOver] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = d.actions.map((a) => a.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    d.onReorderActions(arrayMove(ids, oldIdx, newIdx));
  };

  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-lg transition-colors ${
        dragOver ? "border-primary" : selected ? "border-primary/60" : "border-border"
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_MIME)) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        const t = e.dataTransfer.getData(DND_MIME) as ActionType;
        setDragOver(false);
        if (t && PALETTE.includes(t)) {
          e.preventDefault();
          d.onAddAction(t);
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-muted-foreground" />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={d.title}
          onChange={(e) => d.onRename(e.target.value)}
          className="nodrag w-full bg-transparent text-xs font-bold uppercase tracking-wider outline-none"
          placeholder="Bloco"
        />
        <button
          onClick={d.onDeleteBlock}
          className="nodrag rounded p-1 text-destructive hover:bg-destructive/10"
          title="Excluir bloco"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Lista ordenada de ações (roda de cima pra baixo) */}
      <div className="nodrag max-h-72 space-y-1 overflow-y-auto p-2">
        {d.actions.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
            Arraste ações da paleta para cá
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={d.actions.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            {d.actions.map((a) => (
              <SortableAction
                key={a.id}
                action={a}
                onEdit={() => d.onEditAction(a)}
                onDelete={() => d.onDeleteAction(a.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Fallback sem drag: menu "+ ação" */}
        <div className="relative">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3 w-3" /> ação
          </button>
          {showAdd && (
            <div className="absolute bottom-8 left-0 z-10 w-full rounded-md border border-border bg-popover p-1 shadow-xl">
              {PALETTE.map((t) => {
                const Icon = ACTION_ICON[t];
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setShowAdd(false);
                      d.onAddAction(t);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <Icon className="h-3 w-3 text-muted-foreground" /> {ACTION_LABEL[t]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary" />
    </div>
  );
});

function SortableAction({
  action, onEdit, onDelete,
}: {
  action: FunnelActionRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: action.id });
  const Icon = ACTION_ICON[action.type];
  const isDelay = action.type === "delay";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${
        isDelay ? "border-warning/40 bg-warning/5" : "border-border bg-background"
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Arrastar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <Icon className={`h-3 w-3 shrink-0 ${isDelay ? "text-warning" : "text-muted-foreground"}`} />
        <span className="truncate text-[11px]">{actionSummary(action)}</span>
      </button>
      <button
        onClick={onDelete}
        className="rounded p-0.5 text-destructive hover:bg-destructive/10"
        aria-label="Excluir ação"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
