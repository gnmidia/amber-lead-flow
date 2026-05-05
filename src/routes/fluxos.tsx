import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Plus, GitBranch, Pencil, Trash2, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/fluxos")({ component: FluxosPage });

type Flow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_value: string | null;
  is_active: boolean;
};
type Tag = { id: string; name: string; color: string };

const TRIGGER_LABELS: Record<string, string> = {
  new_lead: "Lead novo",
  keyword: "Palavra-chave",
  tag_assigned: "Tag atribuída",
  manual: "Manual",
  comprovante: "Comprovante",
};

function FluxosPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Flow | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const [{ data: f }, { data: t }] = await Promise.all([
      supabase.from("flows").select("*").order("created_at", { ascending: false }),
      supabase.from("tags").select("id,name,color").eq("is_active", true).order("name"),
    ]);
    setFlows((f || []) as Flow[]);
    setTags((t || []) as Tag[]);
    if (f) {
      const c: Record<string, number> = {};
      for (const fl of f as Flow[]) {
        const { count } = await supabase
          .from("flow_blocks")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", fl.id);
        c[fl.id] = count || 0;
      }
      setCounts(c);
    }
  };
  useEffect(() => { load(); }, []);

  const onDelete = async (f: Flow) => {
    if (!confirm(`Excluir o fluxo ${f.name}?`)) return;
    const { error } = await supabase.from("flows").delete().eq("id", f.id);
    if (error) toast.error(error.message);
    else { toast.success("Fluxo excluído"); load(); }
  };

  return (
    <>
      <PageHeader
        title="Fluxos"
        subtitle="Construtor de jornada — funis + agentes IA"
        actions={
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Novo Fluxo
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2 xl:grid-cols-3">
        {flows.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground">Nenhum fluxo cadastrado.</p>
        )}
        {flows.map((f) => (
          <div
            key={f.id}
            onClick={() => navigate({ to: "/fluxos/$id", params: { id: f.id } })}
            className="cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <GitBranch className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{f.name}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${f.is_active ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}`}>
                    {f.is_active ? "● Ativo" : "○ Inativo"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.description || "—"}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-warning" />
                <span className="text-muted-foreground">Gatilho:</span>
                <span className="font-medium">{TRIGGER_LABELS[f.trigger_type] || f.trigger_type}</span>
              </div>
              <div className="text-muted-foreground">{counts[f.id] ?? 0} blocos configurados</div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => onDelete(f)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-destructive/40 hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
              <button onClick={() => setEditing(f)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/40 hover:text-primary">
                <Pencil className="h-3 w-3" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <FlowModal
          flow={editing}
          tags={tags}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function FlowModal({ flow, tags, onClose, onSaved }: { flow: Flow | null; tags: Tag[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(flow?.name || "");
  const [description, setDescription] = useState(flow?.description || "");
  const [triggerType, setTriggerType] = useState(flow?.trigger_type || "new_lead");
  const [triggerValue, setTriggerValue] = useState(flow?.trigger_value || "");
  const [isActive, setIsActive] = useState(flow?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    const payload = {
      name,
      description: description || null,
      trigger_type: triggerType,
      trigger_value: ["keyword", "tag_assigned"].includes(triggerType) ? (triggerValue || null) : null,
      is_active: isActive,
    };
    const { error } = flow
      ? await supabase.from("flows").update(payload).eq("id", flow.id)
      : await supabase.from("flows").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(flow ? "Fluxo atualizado" : "Fluxo criado"); onSaved(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{flow ? "Editar Fluxo" : "Novo Fluxo"}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Gatilho</label>
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="new_lead">Lead novo entra via WhatsApp</option>
              <option value="keyword">Lead envia palavra-chave</option>
              <option value="tag_assigned">Tag atribuída ao lead</option>
              <option value="manual">Ativado manualmente</option>
              <option value="comprovante">Comprovante confirmado</option>
            </select>
          </div>
          {triggerType === "keyword" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Palavra-chave</label>
              <input value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="Ex: quero comprar" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          )}
          {triggerType === "tag_assigned" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tag</label>
              <select value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Ativo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
