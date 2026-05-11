import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Plus, Bot, Pencil, Trash2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/agentes-ia")({ component: AgentesPage });

type TagItem = { id: string; name: string; color: string };
type Agent = {
  id: string;
  name: string;
  objective: string | null;
  product: string | null;
  tone: string | null;
  exit_condition: string | null;
  prompt: string | null;
  is_active: boolean;
  exit_tags: string[];
};

function AgentesPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("agents").select("*").order("created_at", { ascending: false });
    setAgents((data || []) as Agent[]);
    const { data: t } = await supabase.from("tags").select("id,name,color").eq("is_active", true).order("name");
    setTags((t || []) as TagItem[]);
  };
  useEffect(() => { load(); }, []);

  const onDelete = async (a: Agent) => {
    if (!confirm(`Excluir o agente ${a.name}?`)) return;
    const { error } = await supabase.from("agents").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success("Agente excluído"); load(); }
  };

  return (
    <>
      <PageHeader
        title="Agentes IA"
        subtitle="Agentes conversacionais autônomos"
        actions={
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Novo Agente
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2 xl:grid-cols-3">
        {agents.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground">Nenhum agente cadastrado.</p>
        )}
        {agents.map((a) => {
          const exit = tags.filter((t) => a.exit_tags?.includes(t.id));
          return (
            <div key={a.id} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{a.name}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${a.is_active ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}`}>
                      {a.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.objective || "—"}</p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-xs">
                <Row k="Produto" v={a.product || "—"} />
                <Row k="Tom" v={a.tone || "—"} />
                <Row k="Saída" v={a.exit_condition || "—"} />
              </dl>

              {exit.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags ao concluir</p>
                  <div className="flex flex-wrap gap-1">
                    {exit.map((t) => (
                      <span key={t.id} style={{ backgroundColor: t.color + "33", color: t.color, borderColor: t.color }} className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
                <button onClick={() => onDelete(a)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-destructive/40 hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
                <button onClick={() => setEditing(a)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/40 hover:text-primary">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <AgentModal
          agent={editing}
          tags={tags}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium text-foreground">{v}</dd>
    </div>
  );
}

function AgentModal({ agent, tags, onClose, onSaved }: { agent: Agent | null; tags: TagItem[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(agent?.name || "");
  const [objective, setObjective] = useState(agent?.objective || "");
  const [product, setProduct] = useState(agent?.product || "");
  const [tone, setTone] = useState(agent?.tone || "Misto");
  const [exitCondition, setExitCondition] = useState(agent?.exit_condition || "");
  const [prompt, setPrompt] = useState(agent?.prompt || "");
  const [isActive, setIsActive] = useState(agent?.is_active ?? true);
  const [exitTags, setExitTags] = useState<Set<string>>(new Set(agent?.exit_tags || []));
  const [saving, setSaving] = useState(false);

  const toggleTag = (id: string) => {
    const s = new Set(exitTags);
    if (s.has(id)) s.delete(id); else s.add(id);
    setExitTags(s);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    const payload = {
      name, objective: objective || null, product: product || null, tone,
      exit_condition: exitCondition || null, prompt: prompt || null,
      is_active: isActive, exit_tags: Array.from(exitTags),
    };
    const { error } = agent
      ? await supabase.from("agents").update(payload).eq("id", agent.id)
      : await supabase.from("agents").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(agent ? "Agente atualizado" : "Agente criado"); onSaved(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{agent ? "Editar Agente" : "Novo Agente"}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></Field>
          <Field label="Objetivo"><textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Produto"><input value={product} onChange={(e) => setProduct(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></Field>
            <Field label="Tom">
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option>Formal</option><option>Misto</option><option>Informal</option>
              </select>
            </Field>
          </div>
          <Field label="Condição de saída"><input value={exitCondition} onChange={(e) => setExitCondition(e.target.value)} placeholder="Ex: comprovante enviado" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></Field>
          <Field label="Prompt"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-xs" /></Field>

          <Field label="Atribuir tags ao concluir">
            <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-2">
              {tags.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma tag cadastrada.</p>}
              {tags.map((t) => {
                const sel = exitTags.has(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                    style={sel ? { backgroundColor: t.color + "33", color: t.color, borderColor: t.color } : undefined}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${sel ? "" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {sel && <Check className="h-2.5 w-2.5" />}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
