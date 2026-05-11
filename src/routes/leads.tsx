import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Search, Filter, Plus, X, DollarSign } from "lucide-react";
import { SaleModal } from "@/components/SaleModal";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
});

type Lead = {
  id: string;
  name: string | null;
  push_name: string | null;
  whatsapp_number: string;
  tags: string[];
  status: string;
  last_interaction_at: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function LeadsPage() {
  const [search, setSearch] = useState("");
  const [activatingLead, setActivatingLead] = useState<Lead | null>(null);
  const [sellingLead, setSellingLead] = useState<Lead | null>(null);

  const { currentOperationId } = useOperation();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", currentOperationId],
    enabled: !!currentOperationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads").select("*")
        .eq("operation_id", currentOperationId!)
        .order("last_interaction_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Lead[];
    },
  });

  const filtered = leads.filter((l) =>
    !search ||
    (l.name ?? l.push_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    l.whatsapp_number.includes(search)
  );

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="CRM de leads do WhatsApp"
        actions={
          <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/40">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </button>
        }
      />

      <div className="space-y-4 p-8">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead por nome ou telefone..."
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Lead</th>
                <th className="px-4 py-3 text-left">Tags</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Última interação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum lead encontrado.</td></tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.name ?? l.push_name ?? "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{l.whatsapp_number}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(l.tags ?? []).map((t) => (
                        <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">{l.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(l.last_interaction_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSellingLead(l)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:border-success/40 hover:text-success">
                        <DollarSign className="h-3 w-3" /> Registrar Venda
                      </button>
                      <button
                        onClick={() => setActivatingLead(l)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:border-primary/40 hover:text-primary">
                        <Plus className="h-3 w-3" /> Adicionar ao Funil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activatingLead && (
        <ActivateFunnelModal lead={activatingLead} onClose={() => setActivatingLead(null)} />
      )}
    </>
  );
}

function ActivateFunnelModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [funnelId, setFunnelId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { currentOperationId } = useOperation();

  const { data: funnels = [] } = useQuery({
    queryKey: ["funnels-list", currentOperationId],
    enabled: !!currentOperationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels").select("id, name")
        .eq("operation_id", currentOperationId!)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const submit = async () => {
    if (!funnelId) {
      toast.error("Selecione um funil");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/funnel-scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          funnel_id: funnelId,
          trigger_time: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao agendar");
      const funnelName = funnels.find((f) => f.id === funnelId)?.name ?? "funil";
      toast.success(`Lead adicionado ao ${funnelName}. ${json.scheduled} mensagens agendadas.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Adicionar ao Funil</h2>
            <p className="text-xs text-muted-foreground">{lead.name ?? lead.push_name ?? lead.whatsapp_number}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Funil</label>
        <select
          value={funnelId}
          onChange={(e) => setFunnelId(e.target.value)}
          className="mb-6 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="">Selecione…</option>
          {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancelar</button>
          <button onClick={submit} disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {submitting ? "Ativando…" : "Ativar funil"}
          </button>
        </div>
      </div>
    </div>
  );
}
