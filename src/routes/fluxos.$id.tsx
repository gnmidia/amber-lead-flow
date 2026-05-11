import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowDown, Plus, Trash2, ChevronUp, ChevronDown, GitBranch, Bot, Tag as TagIcon, GitMerge, Clock, X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/fluxos/$id")({ component: FlowCanvas });

type Flow = {
  id: string; name: string; description: string | null;
  trigger_type: string; trigger_value: string | null; is_active: boolean;
};
type Block = {
  id: string;
  flow_id: string;
  order_index: number;
  block_type: "funnel" | "agent" | "tag_assign" | "tag_remove" | "condition" | "wait";
  reference_id: string | null;
  condition_type: string | null;
  condition_value: string | null;
  branch_yes_block_id: string | null;
  branch_no_block_id: string | null;
  wait_minutes: number;
};
type Funnel = { id: string; name: string; start_min: number; start_max: number; window_start: string; window_end: string };
type Agent = { id: string; name: string; objective: string | null };
type Tag = { id: string; name: string; color: string };

const TRIGGER_LABELS: Record<string, string> = {
  new_lead: "Lead novo entra via WhatsApp",
  keyword: "Lead envia palavra-chave",
  tag_assigned: "Tag atribuída ao lead",
  manual: "Ativado manualmente",
  comprovante: "Comprovante confirmado",
};

function FlowCanvas() {
  const { id } = Route.useParams();
  const { currentOperationId } = useOperation();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Block | null>(null);

  const load = async () => {
    if (!currentOperationId) return;
    const [{ data: f }, { data: b }, { data: fn }, { data: ag }, { data: tg }] = await Promise.all([
      supabase.from("flows").select("*").eq("id", id).eq("operation_id", currentOperationId).maybeSingle(),
      supabase.from("flow_blocks").select("*").eq("flow_id", id).order("order_index"),
      supabase.from("funnels").select("id,name,start_min,start_max,window_start,window_end").eq("operation_id", currentOperationId),
      supabase.from("agents").select("id,name,objective").eq("operation_id", currentOperationId).eq("is_active", true),
      supabase.from("tags").select("id,name,color").eq("operation_id", currentOperationId).eq("is_active", true),
    ]);
    setFlow(f as Flow);
    setBlocks((b || []) as Block[]);
    setFunnels((fn || []) as Funnel[]);
    setAgents((ag || []) as Agent[]);
    setTags((tg || []) as Tag[]);
  };
  useEffect(() => { load(); }, [id, currentOperationId]);

  const toggleActive = async (v: boolean) => {
    await supabase.from("flows").update({ is_active: v }).eq("id", id);
    setFlow((f) => f ? { ...f, is_active: v } : f);
    toast.success(v ? "Fluxo ativado" : "Fluxo desativado");
  };

  const addBlock = async (type: Block["block_type"]) => {
    const { data, error } = await supabase.from("flow_blocks").insert({
      flow_id: id, order_index: blocks.length, block_type: type, wait_minutes: 0,
    }).select().single();
    setPicking(false);
    if (error) { toast.error(error.message); return; }
    setEditing(data as Block);
    load();
  };

  const move = async (block: Block, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === block.id);
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const other = blocks[target];
    await supabase.from("flow_blocks").update({ order_index: target }).eq("id", block.id);
    await supabase.from("flow_blocks").update({ order_index: idx }).eq("id", other.id);
    load();
  };

  const remove = async (block: Block) => {
    if (!confirm("Excluir este bloco?")) return;
    await supabase.from("flow_blocks").delete().eq("id", block.id);
    // reindex
    const remaining = blocks.filter((b) => b.id !== block.id);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order_index !== i) {
        await supabase.from("flow_blocks").update({ order_index: i }).eq("id", remaining[i].id);
      }
    }
    toast.success("Bloco removido");
    load();
  };

  if (!flow) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background/60 px-8 py-6 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to="/fluxos" className="rounded-md border border-border p-2 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-[0.14em]">{flow.name}</h1>
            <p className="mt-1 text-xs text-muted-foreground">Gatilho: {TRIGGER_LABELS[flow.trigger_type]}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={flow.is_active} onChange={(e) => toggleActive(e.target.checked)} />
          {flow.is_active ? "Ativo" : "Inativo"}
        </label>
      </header>

      <div className="p-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 rounded-lg border border-border bg-card p-4 text-center text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gatilho</span>
            <p className="mt-1 font-semibold text-primary">{TRIGGER_LABELS[flow.trigger_type]}</p>
          </div>

          {blocks.map((b, i) => (
            <div key={b.id}>
              <div className="flex justify-center">
                <ArrowDown className="my-1 h-4 w-4 text-muted-foreground" />
              </div>
              <BlockCard
                block={b}
                funnels={funnels} agents={agents} tags={tags} blocks={blocks}
                onEdit={() => setEditing(b)}
                onMoveUp={() => move(b, -1)}
                onMoveDown={() => move(b, 1)}
                onDelete={() => remove(b)}
                canUp={i > 0}
                canDown={i < blocks.length - 1}
              />
            </div>
          ))}

          <div className="mt-6 flex justify-center">
            <button onClick={() => setPicking(true)} className="inline-flex items-center gap-2 rounded-full border border-dashed border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">
              <Plus className="h-3.5 w-3.5" /> Adicionar bloco
            </button>
          </div>
        </div>
      </div>

      {picking && <BlockPicker onPick={addBlock} onClose={() => setPicking(false)} />}
      {editing && (
        <BlockDrawer
          block={editing}
          funnels={funnels} agents={agents} tags={tags} blocks={blocks}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function BlockCard({
  block, funnels, agents, tags, blocks,
  onEdit, onMoveUp, onMoveDown, onDelete, canUp, canDown,
}: {
  block: Block; funnels: Funnel[]; agents: Agent[]; tags: Tag[]; blocks: Block[];
  onEdit: () => void; onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void;
  canUp: boolean; canDown: boolean;
}) {
  const findFunnel = (id: string | null) => funnels.find((f) => f.id === id);
  const findAgent = (id: string | null) => agents.find((a) => a.id === id);
  const findTag = (id: string | null) => tags.find((t) => t.id === id);

  let icon = <GitBranch className="h-4 w-4" />;
  let title = "";
  let subtitle = "";
  let border = "border-border";
  let bg = "bg-muted text-muted-foreground";

  if (block.block_type === "funnel") {
    const f = findFunnel(block.reference_id);
    icon = <GitBranch className="h-4 w-4" />;
    title = "Funil";
    subtitle = f ? `${f.name} · ${f.start_min}-${f.start_max}min` : "(não configurado)";
    border = "border-primary/30"; bg = "bg-primary/15 text-primary";
  } else if (block.block_type === "agent") {
    const a = findAgent(block.reference_id);
    icon = <Bot className="h-4 w-4" />;
    title = "Agente IA";
    subtitle = a ? a.name : "(não configurado)";
    border = "border-info/30"; bg = "bg-info/15 text-info";
  } else if (block.block_type === "tag_assign" || block.block_type === "tag_remove") {
    const t = findTag(block.reference_id);
    icon = <TagIcon className="h-4 w-4" />;
    const op = block.block_type === "tag_assign" ? "Atribuir" : "Remover";
    title = "Ação de Tag";
    subtitle = `${op}: ${t?.name || "(não configurado)"}`;
    border = block.block_type === "tag_assign" ? "border-success/30" : "border-destructive/30";
    bg = block.block_type === "tag_assign" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive";
  } else if (block.block_type === "condition") {
    icon = <GitMerge className="h-4 w-4" />;
    title = "Condição";
    const map: Record<string, string> = {
      sent_comprovante: "Lead enviou comprovante?",
      has_tag: "Lead possui a tag?",
      replied: "Lead respondeu?",
      keyword: "Lead enviou palavra-chave?",
    };
    subtitle = map[block.condition_type || ""] || "(não configurado)";
    border = "border-warning/30"; bg = "bg-warning/15 text-warning";
  } else if (block.block_type === "wait") {
    icon = <Clock className="h-4 w-4" />;
    title = "Aguardar";
    subtitle = `${block.wait_minutes} minuto(s)`;
    border = "border-border"; bg = "bg-muted text-foreground";
  }

  return (
    <div className={`group relative rounded-xl border ${border} bg-card p-4`}>
      <div className="flex items-center gap-3 cursor-pointer" onClick={onEdit}>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-sm font-semibold">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={!canUp} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
          <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={!canDown} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {block.block_type === "condition" && (
        <div className="mt-3 grid grid-cols-2 gap-2 pl-12">
          <div className="rounded-md border border-success/30 bg-success/10 p-2 text-xs">
            <span className="font-semibold text-success">SIM →</span> próximo bloco
          </div>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
            <span className="font-semibold text-destructive">NÃO →</span>{" "}
            {(() => {
              const target = blocks.find((b) => b.id === block.branch_no_block_id);
              if (!target) return "fim";
              if (target.block_type === "funnel") return findFunnel(target.reference_id)?.name || "funil";
              return target.block_type;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockPicker({ onPick, onClose }: { onPick: (t: Block["block_type"]) => void; onClose: () => void }) {
  const items: { type: Block["block_type"]; label: string; desc: string; icon: any }[] = [
    { type: "funnel", label: "Funil de Mensagens", desc: "Sequência pré-configurada", icon: <GitBranch className="h-5 w-5" /> },
    { type: "agent", label: "Agente IA", desc: "Agente conversacional autônomo", icon: <Bot className="h-5 w-5" /> },
    { type: "tag_assign", label: "Atribuir Tag", desc: "Adiciona uma etiqueta ao lead", icon: <TagIcon className="h-5 w-5" /> },
    { type: "tag_remove", label: "Remover Tag", desc: "Remove uma etiqueta do lead", icon: <TagIcon className="h-5 w-5" /> },
    { type: "condition", label: "Condição", desc: "Ramifica o fluxo (SIM/NÃO)", icon: <GitMerge className="h-5 w-5" /> },
    { type: "wait", label: "Aguardar", desc: "Pausa o fluxo por um tempo", icon: <Clock className="h-5 w-5" /> },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Selecione o tipo de bloco</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2">
          {items.map((it) => (
            <button key={it.type} onClick={() => onPick(it.type)} className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/40">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{it.icon}</div>
              <div>
                <p className="text-sm font-semibold">{it.label}</p>
                <p className="text-xs text-muted-foreground">{it.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BlockDrawer({
  block, funnels, agents, tags, blocks, onClose, onSaved,
}: {
  block: Block; funnels: Funnel[]; agents: Agent[]; tags: Tag[]; blocks: Block[];
  onClose: () => void; onSaved: () => void;
}) {
  const [referenceId, setReferenceId] = useState(block.reference_id || "");
  const [conditionType, setConditionType] = useState(block.condition_type || "sent_comprovante");
  const [conditionValue, setConditionValue] = useState(block.condition_value || "");
  const [branchNo, setBranchNo] = useState(block.branch_no_block_id || "");
  const [waitMinutes, setWaitMinutes] = useState(block.wait_minutes || 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload: any = {};
    if (block.block_type === "funnel" || block.block_type === "agent" || block.block_type === "tag_assign" || block.block_type === "tag_remove") {
      payload.reference_id = referenceId || null;
    }
    if (block.block_type === "condition") {
      payload.condition_type = conditionType;
      payload.condition_value = conditionValue || null;
      payload.branch_no_block_id = branchNo || null;
    }
    if (block.block_type === "wait") {
      payload.wait_minutes = waitMinutes;
    }
    const { error } = await supabase.from("flow_blocks").update(payload).eq("id", block.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Bloco salvo"); onSaved(); }
  };

  const titleMap: Record<string, string> = {
    funnel: "Configurar Funil", agent: "Configurar Agente",
    tag_assign: "Atribuir Tag", tag_remove: "Remover Tag",
    condition: "Configurar Condição", wait: "Configurar Espera",
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{titleMap[block.block_type]}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {block.block_type === "funnel" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Funil</label>
              <select value={referenceId} onChange={(e) => setReferenceId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {funnels.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.start_min}-{f.start_max}min</option>)}
              </select>
            </div>
          )}
          {block.block_type === "agent" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Agente</label>
              <select value={referenceId} onChange={(e) => setReferenceId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.objective ? ` — ${a.objective}` : ""}</option>)}
              </select>
            </div>
          )}
          {(block.block_type === "tag_assign" || block.block_type === "tag_remove") && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tag</label>
              <select value={referenceId} onChange={(e) => setReferenceId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {block.block_type === "condition" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Condição</label>
                <select value={conditionType} onChange={(e) => setConditionType(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="sent_comprovante">Lead enviou comprovante confirmado?</option>
                  <option value="has_tag">Lead possui a tag</option>
                  <option value="replied">Lead respondeu alguma mensagem?</option>
                  <option value="keyword">Lead enviou a palavra</option>
                </select>
              </div>
              {conditionType === "has_tag" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Tag</label>
                  <select value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="">Selecionar...</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {conditionType === "keyword" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Palavra</label>
                  <input value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
              )}
              <div className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">SIM → próximo bloco da sequência</div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Se NÃO, ir para</label>
                <select value={branchNo} onChange={(e) => setBranchNo(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Encerrar fluxo</option>
                  {blocks.filter((b) => b.id !== block.id).map((b) => (
                    <option key={b.id} value={b.id}>#{b.order_index + 1} {b.block_type}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {block.block_type === "wait" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Aguardar (minutos)</label>
              <input type="number" min={0} value={waitMinutes} onChange={(e) => setWaitMinutes(Number(e.target.value))} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              <p className="mt-2 text-xs text-muted-foreground">Pausa a jornada antes de continuar para o próximo bloco.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Send className="mr-1 inline h-3 w-3" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
