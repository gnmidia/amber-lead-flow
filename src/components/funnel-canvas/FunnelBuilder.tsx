import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Type, Mic, Image as ImageIcon, Video, FileText, Tag as TagIcon, Clock, Plus, Shuffle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { AbSplitNode, type AbSplitNodeData } from "./AbSplitNode";
import { StartNode } from "./StartNode";
import { BlockEditorDrawer } from "./BlockEditorDrawer";
import {
  ACTION_LABEL, DND_MIME, PALETTE,
  type ActionType, type AbOutputRow, type FunnelActionRow,
  type FunnelBlockRow, type FunnelEdgeRow,
} from "./types";

const nodeTypes = { block: BlockNode, ab_split: AbSplitNode, start: StartNode };

const DND_NODE_MIME = "application/x-funnel-node";
const START_ID = "__start__";
const START_EDGE_ID = "__start-edge__";

const PALETTE_ICON: Record<ActionType, React.ComponentType<{ className?: string }>> = {
  texto: Type, audio: Mic, imagem: ImageIcon, video: Video,
  documento: FileText, tag: TagIcon, delay: Clock,
};

// Tabelas novas ainda não estão nos tipos gerados do Supabase.
const tbl = (name: string) => supabase.from(name as any) as any;

export function FunnelBuilder({
  funnelId,
  operationId,
}: {
  funnelId: string;
  operationId: string;
}) {
  const [blocks, setBlocks] = useState<FunnelBlockRow[]>([]);
  const [actions, setActions] = useState<FunnelActionRow[]>([]);
  const [abOutputs, setAbOutputs] = useState<AbOutputRow[]>([]);
  const [dbEdges, setDbEdges] = useState<FunnelEdgeRow[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [startBlockId, setStartBlockId] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 40, y: 160 });
  const [loaded, setLoaded] = useState(false);

  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<any>(null);

  // ───── Carga (TUDO escopado por operation_id) ─────
  const load = useCallback(async () => {
    const [b, e, f] = await Promise.all([
      tbl("funnel_blocks").select("*").eq("funnel_id", funnelId).eq("operation_id", operationId),
      tbl("funnel_edges").select("*").eq("funnel_id", funnelId).eq("operation_id", operationId),
      tbl("funnels").select("start_block_id, start_node_x, start_node_y").eq("id", funnelId).eq("operation_id", operationId).maybeSingle(),
    ]);
    if (b.error || e.error) {
      toast.error(b.error?.message || e.error?.message);
      return;
    }
    const blockRows = (b.data || []) as FunnelBlockRow[];
    const blockIds = blockRows.map((x) => x.id);
    let actionRows: FunnelActionRow[] = [];
    let outputRows: AbOutputRow[] = [];
    if (blockIds.length > 0) {
      const [a, o] = await Promise.all([
        tbl("funnel_actions").select("*").eq("operation_id", operationId).in("block_id", blockIds).order("order_index"),
        tbl("funnel_ab_outputs").select("*").eq("operation_id", operationId).in("block_id", blockIds).order("output_index"),
      ]);
      actionRows = (a.data || []) as FunnelActionRow[];
      outputRows = (o.data || []) as AbOutputRow[];
    }
    setBlocks(blockRows);
    setActions(actionRows);
    setAbOutputs(outputRows);
    setDbEdges((e.data || []) as FunnelEdgeRow[]);
    setStartBlockId((f.data as any)?.start_block_id ?? null);
    setStartPos({ x: (f.data as any)?.start_node_x ?? 40, y: (f.data as any)?.start_node_y ?? 160 });
    setLoaded(true);
  }, [funnelId, operationId]);

  useEffect(() => {
    load();
  }, [load]);

  // ───── Mutações ─────

  const addBlock = async (nodeType: "block" | "ab_split", pos?: { x: number; y: number }) => {
    const { data, error } = await tbl("funnel_blocks")
      .insert({
        funnel_id: funnelId,
        operation_id: operationId,
        title: nodeType === "ab_split" ? "A/B Split" : `Bloco ${blocks.filter((x) => x.node_type === "block").length + 1}`,
        node_type: nodeType,
        position_x: pos?.x ?? 80 + blocks.length * 40,
        position_y: pos?.y ?? 80 + blocks.length * 40,
      })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    // A/B nasce com 2 saídas iguais (50/50).
    if (nodeType === "ab_split") {
      const { error: oErr } = await tbl("funnel_ab_outputs").insert([
        { block_id: data.id, operation_id: operationId, output_index: 0, weight: 1 },
        { block_id: data.id, operation_id: operationId, output_index: 1, weight: 1 },
      ]);
      if (oErr) return toast.error(oErr.message);
    }
    await load();
  };

  const deleteBlock = async (blockId: string) => {
    if (!confirm("Excluir este nó? As ações e ligações dele somem junto.")) return;
    const { error } = await tbl("funnel_blocks")
      .delete().eq("id", blockId).eq("operation_id", operationId);
    if (error) return toast.error(error.message);
    await load();
  };

  const renameBlock = (blockId: string, title: string) => {
    // Otimista local; persiste sem recarregar (evita perder foco do input).
    setBlocks((prev) => prev.map((x) => (x.id === blockId ? { ...x, title } : x)));
    tbl("funnel_blocks").update({ title }).eq("id", blockId).eq("operation_id", operationId)
      .then(({ error }: any) => error && toast.error(error.message));
  };

  const addAction = async (blockId: string, type: ActionType) => {
    const count = actions.filter((a) => a.block_id === blockId).length;
    const defaults: Record<ActionType, object> = {
      texto: { content: "" },
      audio: {}, imagem: {}, video: {}, documento: {},
      tag: { tag_id: null, tag_operation: "assign" },
      delay: { value: 5, unit: "seconds" },
    };
    const { data, error } = await tbl("funnel_actions")
      .insert({
        block_id: blockId,
        operation_id: operationId,
        type,
        order_index: count + 1,
        config: defaults[type],
      })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    await load();
    // Abre o editor do BLOCO (todas as ações juntas) para configurar.
    void data;
    setEditingBlockId(blockId);
  };

  const deleteAction = async (actionId: string) => {
    const { error } = await tbl("funnel_actions")
      .delete().eq("id", actionId).eq("operation_id", operationId);
    if (error) return toast.error(error.message);
    await load();
  };

  const reorderActions = async (blockId: string, orderedIds: string[]) => {
    // Otimista
    setActions((prev) =>
      prev.map((a) =>
        a.block_id === blockId ? { ...a, order_index: orderedIds.indexOf(a.id) + 1 } : a,
      ),
    );
    const updates = orderedIds.map((id, i) =>
      tbl("funnel_actions").update({ order_index: i + 1 }).eq("id", id).eq("operation_id", operationId),
    );
    const results = await Promise.all(updates);
    const err = results.find((r: any) => r.error)?.error;
    if (err) {
      toast.error(err.message);
      await load();
    }
  };

  const addAbOutput = async (blockId: string) => {
    const outs = abOutputs.filter((o) => o.block_id === blockId);
    if (outs.length >= 10) return;
    const nextIdx = Math.max(...outs.map((o) => o.output_index)) + 1;
    const { error } = await tbl("funnel_ab_outputs")
      .insert({ block_id: blockId, operation_id: operationId, output_index: nextIdx, weight: 1 });
    if (error) return toast.error(error.message);
    await load();
  };

  const removeAbOutput = async (blockId: string) => {
    const outs = abOutputs
      .filter((o) => o.block_id === blockId)
      .sort((a, b) => a.output_index - b.output_index);
    if (outs.length <= 2) return;
    const last = outs[outs.length - 1];
    // Remove a saída e qualquer edge pendurada nela.
    const { error } = await tbl("funnel_ab_outputs")
      .delete().eq("id", last.id).eq("operation_id", operationId);
    if (error) return toast.error(error.message);
    await tbl("funnel_edges")
      .delete()
      .eq("source_block_id", blockId)
      .eq("source_handle", `out-${last.output_index}`)
      .eq("operation_id", operationId);
    await load();
  };

  const persistPosition = (blockId: string, x: number, y: number) => {
    if (blockId === START_ID) {
      setStartPos({ x, y });
      tbl("funnels")
        .update({ start_node_x: x, start_node_y: y })
        .eq("id", funnelId)
        .eq("operation_id", operationId)
        .then(({ error }: any) => error && toast.error(error.message));
      return;
    }
    tbl("funnel_blocks")
      .update({ position_x: x, position_y: y })
      .eq("id", blockId)
      .eq("operation_id", operationId)
      .then(({ error }: any) => error && toast.error(error.message));
  };

  const onConnect = async (c: Connection) => {
    if (!c.source || !c.target) return;
    if (c.source === c.target) return toast.error("Um nó não pode ligar nele mesmo");
    if (c.target === START_ID) return toast.error("Nada pode ligar NO Início");
    // Edge saindo do Início: define o primeiro bloco do funil.
    if (c.source === START_ID) {
      // Otimista: mostra a seta imediatamente.
      setStartBlockId(c.target);
      setEdges((eds) => [
        ...eds.filter((e) => e.id !== START_EDGE_ID),
        {
          id: START_EDGE_ID,
          source: START_ID,
          target: c.target,
          animated: true,
          style: { stroke: "#22c55e", strokeWidth: 2 },
        },
      ]);
      const { error } = await tbl("funnels")
        .update({ start_block_id: c.target })
        .eq("id", funnelId)
        .eq("operation_id", operationId);
      if (error) {
        setStartBlockId(null);
        setEdges((eds) => eds.filter((e) => e.id !== START_EDGE_ID));
        return toast.error(error.message);
      }
      return;
    }
    const sourceHandle = c.sourceHandle || null;
    // Uma saída só pode ter UMA ligação: substitui a existente do mesmo handle.
    let del = tbl("funnel_edges")
      .delete()
      .eq("source_block_id", c.source)
      .eq("operation_id", operationId);
    del = sourceHandle === null ? del.is("source_handle", null) : del.eq("source_handle", sourceHandle);
    const { error: delErr } = await del;
    if (delErr) return toast.error(delErr.message);
    const { error } = await tbl("funnel_edges").insert({
      funnel_id: funnelId,
      operation_id: operationId,
      source_block_id: c.source,
      source_handle: sourceHandle,
      target_block_id: c.target,
    });
    if (error) return toast.error(error.message);
    await load();
  };

  const onEdgesChangeHandler = (changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    for (const ch of changes) {
      if (ch.type === "remove") {
        if (ch.id === START_EDGE_ID) {
          setStartBlockId(null);
          tbl("funnels")
            .update({ start_block_id: null })
            .eq("id", funnelId)
            .eq("operation_id", operationId)
            .then(({ error }: any) => error && toast.error(error.message));
          continue;
        }
        tbl("funnel_edges")
          .delete().eq("id", ch.id).eq("operation_id", operationId)
          .then(({ error }: any) => error && toast.error(error.message));
      }
    }
  };

  const onNodesChangeHandler = (changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    // Delete pelo teclado também remove no banco (com confirm no botão do nó;
    // aqui é o atalho — mantém consistência do canvas).
    for (const ch of changes) {
      if (ch.type === "remove") {
        if (ch.id === START_ID) continue;
        tbl("funnel_blocks")
          .delete().eq("id", ch.id).eq("operation_id", operationId)
          .then(({ error }: any) => error && toast.error(error.message));
      }
    }
  };

  // ───── Domínio → React Flow ─────
  const rfNodes = useMemo<Node[]>(() => {
    const startNode: Node = {
      id: START_ID,
      type: "start",
      position: startPos,
      deletable: false,
      data: { connected: !!startBlockId } as any,
    };
    const blockNodes = blocks.map((b) => {
      if (b.node_type === "ab_split") {
        const data: AbSplitNodeData = {
          title: b.title || "A/B Split",
          outputs: abOutputs.filter((o) => o.block_id === b.id),
          onRename: (t) => renameBlock(b.id, t),
          onDeleteBlock: () => deleteBlock(b.id),
          onAddOutput: () => addAbOutput(b.id),
          onRemoveOutput: () => removeAbOutput(b.id),
        };
        return {
          id: b.id,
          type: "ab_split",
          position: { x: b.position_x, y: b.position_y },
          data: data as any,
        };
      }
      const data: BlockNodeData = {
        title: b.title || "Bloco",
        actions: actions
          .filter((a) => a.block_id === b.id)
          .sort((x, y) => x.order_index - y.order_index),
        onRename: (t) => renameBlock(b.id, t),
        onDeleteBlock: () => deleteBlock(b.id),
        onAddAction: (t) => addAction(b.id, t),
        onEditBlock: () => setEditingBlockId(b.id),
        onDeleteAction: (id) => deleteAction(id),
        onReorderActions: (ids) => reorderActions(b.id, ids),
      };
      return {
        id: b.id,
        type: "block",
        position: { x: b.position_x, y: b.position_y },
        data: data as any,
      };
    });
    return [startNode, ...blockNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, actions, abOutputs, startBlockId, startPos]);

  const rfEdges = useMemo<Edge[]>(() => {
    const list: Edge[] = dbEdges.map((e) => ({
      id: e.id,
      source: e.source_block_id,
      sourceHandle: e.source_handle || undefined,
      target: e.target_block_id,
      animated: true,
    }));
    if (startBlockId) {
      list.unshift({
        id: START_EDGE_ID,
        source: START_ID,
        target: startBlockId,
        animated: true,
        style: { stroke: "#22c55e", strokeWidth: 2 },
      });
    }
    return list;
  }, [dbEdges, startBlockId]);

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  return (
    <div className="flex h-full w-full">
      {/* Paleta de ações */}
      <aside className="flex w-44 shrink-0 flex-col gap-3 border-r border-border bg-card p-3">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Nós
          </p>
          <div className="space-y-1.5">
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_NODE_MIME, "block");
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addBlock("block")}
              className="flex w-full cursor-grab items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs font-medium hover:border-primary/40 hover:text-primary active:cursor-grabbing"
              title="Arraste para o canvas (ou clique)"
            >
              <Plus className="h-3.5 w-3.5" /> Bloco
            </div>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_NODE_MIME, "ab_split");
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addBlock("ab_split")}
              className="flex w-full cursor-grab items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs font-medium hover:border-info/40 hover:text-info active:cursor-grabbing"
              title="Arraste para o canvas (ou clique)"
            >
              <Shuffle className="h-3.5 w-3.5" /> A/B Split
            </div>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Ações (arraste p/ bloco)
          </p>
          <div className="space-y-1.5">
            {PALETTE.map((t) => {
              const Icon = PALETTE_ICON[t];
              return (
                <div
                  key={t}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, t);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className={`flex cursor-grab items-center gap-2 rounded-md border px-2.5 py-2 text-xs active:cursor-grabbing ${
                    t === "delay"
                      ? "border-warning/40 bg-warning/5 text-warning"
                      : "border-border bg-background"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {ACTION_LABEL[t]}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Canvas */}
      <div
        className="min-w-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_NODE_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const t = e.dataTransfer.getData(DND_NODE_MIME);
          if (t !== "block" && t !== "ab_split") return;
          e.preventDefault();
          const pos = rfInstance
            ? rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
            : undefined;
          addBlock(t as "block" | "ab_split", pos);
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChangeHandler}
          onEdgesChange={onEdgesChangeHandler}
          onConnect={onConnect}
          onInit={setRfInstance}
          onNodeDragStop={(_e, n) => persistPosition(n.id, n.position.x, n.position.y)}
          fitView={loaded && blocks.length > 0}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>
      </div>

      {editingBlockId && (
        <BlockEditorDrawer
          blockTitle={blocks.find((b) => b.id === editingBlockId)?.title || "Bloco"}
          actions={actions
            .filter((a) => a.block_id === editingBlockId)
            .sort((x, y) => x.order_index - y.order_index)}
          funnelId={funnelId}
          operationId={operationId}
          onClose={() => setEditingBlockId(null)}
          onSaved={() => {
            setEditingBlockId(null);
            load();
          }}
          onDeleteAction={async (id) => {
            await deleteAction(id);
          }}
        />
      )}
    </div>
  );
}
