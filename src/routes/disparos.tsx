import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Send, Plus, X, Tag as TagIcon, Workflow as WorkflowIcon, RefreshCw, Pause, Play, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fullDateTimeSP } from "@/lib/datetime";

export const Route = createFileRoute("/disparos")({ component: DisparosPage });

type Flow = { id: string; name: string };
type Tag = { id: string; name: string; color: string };
type Broadcast = {
  id: string;
  name: string;
  flow_id: string;
  tag_id: string;
  min_interval_seconds: number;
  max_interval_seconds: number;
  total_leads: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "○ Pendente",    cls: "bg-muted text-muted-foreground" },
    running:   { label: "● Em andamento", cls: "bg-warning/10 text-warning" },
    paused:    { label: "❚❚ Pausado",     cls: "bg-muted text-foreground" },
    completed: { label: "✓ Concluído",   cls: "bg-success/10 text-success" },
    cancelled: { label: "✕ Cancelado",   cls: "bg-destructive/10 text-destructive" },
  };
  const m = map[status] || { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${m.cls}`}>{m.label}</span>;
}

function DisparosPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [progress, setProgress] = useState<Record<string, { sent: number; pending: number; failed: number }>>({});
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [{ data: f }, { data: t }, { data: b }] = await Promise.all([
      supabase.from("flows").select("id,name").eq("is_active", true).order("name"),
      supabase.from("tags").select("id,name,color").eq("is_active", true).order("name"),
      supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setFlows((f || []) as Flow[]);
    setTags((t || []) as Tag[]);
    const bcs = (b || []) as Broadcast[];
    setBroadcasts(bcs);
    if (bcs.length) {
      const ids = bcs.map((x) => x.id);
      const { data: targets } = await supabase
        .from("broadcast_targets").select("broadcast_id, status").in("broadcast_id", ids);
      const map: Record<string, { sent: number; pending: number; failed: number }> = {};
      for (const id of ids) map[id] = { sent: 0, pending: 0, failed: 0 };
      (targets || []).forEach((tg: any) => {
        const m = map[tg.broadcast_id];
        if (!m) return;
        if (tg.status === "sent") m.sent++;
        else if (tg.status === "pending" || tg.status === "dispatching") m.pending++;
        else if (tg.status === "failed") m.failed++;
      });
      setProgress(map);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const channel = supabase
      .channel("broadcasts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_targets" }, () => load())
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, []);

  const pause = async (id: string) => {
    const { error } = await supabase.from("broadcasts").update({ status: "paused" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Disparo pausado");
  };
  const resume = async (id: string) => {
    const { error } = await supabase.from("broadcasts").update({ status: "running" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Disparo retomado");
  };
  const cancel = async (id: string) => {
    if (!confirm("Cancelar este disparo? Os leads ainda não enviados serão ignorados.")) return;
    const { error: e1 } = await supabase.from("broadcasts").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", id);
    const { error: e2 } = await supabase.from("broadcast_targets")
      .update({ status: "skipped", error_message: "Broadcast cancelado", processed_at: new Date().toISOString() })
      .eq("broadcast_id", id).in("status", ["pending", "dispatching"]);
    if (e1 || e2) toast.error((e1 || e2)!.message); else toast.success("Disparo cancelado");
  };

  return (
    <>
      <PageHeader
        title="Disparos"
        subtitle="Envio em massa por etiqueta"
        actions={
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Novo Disparo
          </button>
        }
      />

      <div className="space-y-3 p-8">
        {broadcasts.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhum disparo realizado ainda.</p>
        )}
        {broadcasts.map((b) => {
          const p = progress[b.id] || { sent: 0, pending: 0, failed: 0 };
          const total = b.total_leads || 0;
          const done = p.sent + p.failed;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const flow = flows.find((f) => f.id === b.flow_id);
          const tag = tags.find((t) => t.id === b.tag_id);
          const isRunning = b.status === "running";
          const isPaused = b.status === "paused";
          const canCancel = b.status !== "completed" && b.status !== "cancelled";
          return (
            <div key={b.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">{b.name}</h3>
                    {statusBadge(b.status)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><WorkflowIcon className="h-3 w-3" />{flow?.name || "—"}</span>
                    <span className="inline-flex items-center gap-1"><TagIcon className="h-3 w-3" style={{ color: tag?.color }} />{tag?.name || "—"}</span>
                    <span>Intervalo: {b.min_interval_seconds}s – {b.max_interval_seconds}s</span>
                    <span>Criado: {new Date(b.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right text-xs">
                    <div className="text-2xl font-bold text-foreground">{done}/{total}</div>
                    <div className="text-muted-foreground">{p.pending} restantes • {p.failed} falhas</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {isRunning && (
                      <button onClick={() => pause(b.id)} title="Pausar" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pause className="h-4 w-4" /></button>
                    )}
                    {isPaused && (
                      <button onClick={() => resume(b.id)} title="Retomar" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Play className="h-4 w-4" /></button>
                    )}
                    {canCancel && (
                      <button onClick={() => cancel(b.id)} title="Cancelar" className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <BroadcastModal
          flows={flows}
          tags={tags}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </>
  );
}

function BroadcastModal({ flows, tags, onClose, onCreated }: {
  flows: Flow[]; tags: Tag[]; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("Disparo");
  const [flowId, setFlowId] = useState("");
  const [tagId, setTagId] = useState("");
  const [minSec, setMinSec] = useState(30);
  const [maxSec, setMaxSec] = useState(120);
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!tagId) { setCount(null); return; }
    (async () => {
      const { data } = await supabase.from("lead_tags").select("lead_id").eq("tag_id", tagId);
      const ids = Array.from(new Set((data || []).map((r: any) => r.lead_id)));
      if (ids.length === 0) { setCount(0); return; }
      const { count: c } = await supabase
        .from("leads").select("id", { count: "exact", head: true })
        .in("id", ids).eq("status", "active");
      setCount(c || 0);
    })();
  }, [tagId]);

  const submit = async () => {
    if (!flowId) return toast.error("Selecione um fluxo");
    if (!tagId) return toast.error("Selecione uma etiqueta");
    if (minSec < 1 || maxSec < minSec) return toast.error("Intervalo inválido");
    setSaving(true);
    try {
      const { data: json, error } = await supabase.functions.invoke("broadcast-start", {
        body: {
          name, flow_id: flowId, tag_id: tagId,
          min_interval_seconds: minSec, max_interval_seconds: maxSec,
        },
      });
      if (error) throw new Error(error.message || "Falha ao criar disparo");
      if ((json as any)?.error) throw new Error((json as any).error);
      toast.success(`Disparo criado: ${(json as any).total} leads agendados`);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Novo Disparo</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome do disparo</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tag (quais leads receberão)</label>
            <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">Selecionar...</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {count !== null && (
              <p className="mt-1 text-[11px] text-muted-foreground">Leads elegíveis: {count} lead(s) ativo(s) com esta tag</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fluxo a enviar</label>
            <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">Selecionar...</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Intervalo mínimo (s)</label>
              <input type="number" min={1} value={minSec} onChange={(e) => setMinSec(Number(e.target.value))} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Intervalo máximo (s)</label>
              <input type="number" min={1} value={maxSec} onChange={(e) => setMaxSec(Number(e.target.value))} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <RefreshCw className="mr-1 inline h-3 w-3" />
            O sistema sorteia um intervalo entre o mínimo e o máximo a cada disparo. Recomendado: 30s mín · 120s máx.
          </p>
          <p className="rounded-md bg-warning/10 p-2 text-[11px] text-warning">
            ⚠ Se o lead já estiver em um funil ativo, o disparo aguarda automaticamente até esse funil terminar (ou pelo intervalo máximo) antes de iniciar.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={submit} disabled={saving || !flowId || !tagId} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Iniciando..." : "▶ Iniciar Disparo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
