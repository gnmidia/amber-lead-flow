import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { Search, Plus, X, DollarSign, Tag as TagIcon, Check, ChevronDown } from "lucide-react";
import { SaleModal } from "@/components/SaleModal";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

const PAGE_SIZE = 100;

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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [activatingLead, setActivatingLead] = useState<Lead | null>(null);
  const [sellingLead, setSellingLead] = useState<Lead | null>(null);

  const { currentOperationId } = useOperation();

  // Tags da operação
  const { data: tags = [] } = useQuery({
    queryKey: ["tags-list", currentOperationId],
    enabled: !!currentOperationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, color")
        .eq("operation_id", currentOperationId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; color: string }[];
    },
  });

  // IDs de leads que possuem alguma das tags selecionadas
  const { data: taggedLeadIds } = useQuery({
    queryKey: ["lead-tags-filter", selectedTagIds],
    enabled: selectedTagIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tags")
        .select("lead_id")
        .in("tag_id", selectedTagIds);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.lead_id as string)));
    },
  });

  const tagFilterActive = selectedTagIds.length > 0;
  const tagFilterReady = !tagFilterActive || !!taggedLeadIds;

  const { data: result, isLoading, isFetching } = useQuery({
    queryKey: ["leads", currentOperationId, page, search, taggedLeadIds ?? null],
    enabled: !!currentOperationId && tagFilterReady,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Se filtro de tag ativo mas nenhum lead corresponde, retorne vazio
      if (tagFilterActive && (taggedLeadIds?.length ?? 0) === 0) {
        return { rows: [] as Lead[], total: 0 };
      }
      let q = supabase
        .from("leads")
        .select("*", { count: "exact" })
        .eq("operation_id", currentOperationId!)
        .order("last_interaction_at", { ascending: false });

      if (tagFilterActive && taggedLeadIds) {
        q = q.in("id", taggedLeadIds);
      }
      if (search.trim()) {
        const s = search.trim().replace(/[%,]/g, "");
        q = q.or(`name.ilike.%${s}%,push_name.ilike.%${s}%,whatsapp_number.ilike.%${s}%`);
      }

      const to = (page + 1) * PAGE_SIZE - 1;
      const { data, error, count } = await q.range(0, to);
      if (error) throw error;
      return { rows: (data ?? []) as Lead[], total: count ?? 0 };
    },
  });

  const leads = result?.rows ?? [];
  const total = result?.total ?? 0;
  const hasMore = (page + 1) * PAGE_SIZE < total;

  const queryClient = useQueryClient();
  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);

  // Vendas (com oferta) dos leads atualmente exibidos
  const { data: salesByLead = {} } = useQuery({
    queryKey: ["lead-sales", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("lead_id, sale_date, offer:offers(id, name)")
        .in("lead_id", leadIds)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      const map: Record<string, { id: string; name: string }[]> = {};
      for (const row of (data ?? []) as any[]) {
        const off = row.offer;
        if (!off) continue;
        const arr = map[row.lead_id] ?? (map[row.lead_id] = []);
        if (!arr.some((o) => o.id === off.id)) arr.push({ id: off.id, name: off.name });
      }
      return map;
    },
  });

  const toggleTag = (id: string) => {
    setPage(0);
    setSelectedTagIds((prev) => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };
  const clearFilters = () => { setSelectedTagIds([]); setSearch(""); setPage(0); };

  const handleSaleClose = () => {
    setSellingLead(null);
    queryClient.invalidateQueries({ queryKey: ["lead-sales"] });
  };

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`CRM de leads do WhatsApp${total ? ` · ${total} no total` : ""}`}
      />

      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setPage(0); setSearch(e.target.value); }}
              placeholder="Buscar lead por nome ou telefone..."
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm"
            />
          </div>
          {(selectedTagIds.length > 0 || search) && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive">
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" /> Tags:
            </span>
            {tags.map((t) => {
              const active = selectedTagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  style={active ? { backgroundColor: t.color, borderColor: t.color, color: "#fff" } : { borderColor: t.color, color: t.color }}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase transition-colors">
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Lead</th>
                <th className="px-4 py-3 text-left">Tags</th>
                <th className="px-4 py-3 text-left">Ofertas</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Última interação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
              )}
              {!isLoading && leads.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum lead encontrado.</td></tr>
              )}
              {leads.map((l) => (
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
                    {(salesByLead[l.id] ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(salesByLead[l.id] ?? []).map((o) => (
                          <span
                            key={o.id}
                            title={o.name}
                            className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
                            <DollarSign className="h-2.5 w-2.5 shrink-0" /> {o.name}
                          </span>
                        ))}
                      </div>
                    )}
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

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Exibindo {leads.length} de {total} leads</span>
          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={isFetching}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-60">
              {isFetching ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </div>
      </div>

      {activatingLead && (
        <ActivateFunnelModal lead={activatingLead} onClose={() => setActivatingLead(null)} />
      )}
      {sellingLead && (
        <SaleModal lead={sellingLead} onClose={handleSaleClose} />
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
