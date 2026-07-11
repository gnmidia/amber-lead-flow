import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { useState } from "react";
import { Plus, Trash2, X, GitBranch } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";
import { toast } from "sonner";

export const Route = createFileRoute("/funil/")({
  component: FunilPage,
});

// Card clean: só nome + slug + ENVIOS. As configurações de comportamento
// (janela de envio, início, canais, consecutivo) continuam no banco e são
// editadas no painel de configurações DENTRO do builder (funil.$id).
type Funnel = {
  id: string;
  name: string;
  internal_id: string;
  envios: number;
  position: number;
};

function FunilPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { currentOperationId } = useOperation();
  const [creating, setCreating] = useState(false);

  const funnelsQ = useQuery({
    queryKey: ["funnels", currentOperationId],
    enabled: !!currentOperationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels")
        .select("id, name, internal_id, envios, position")
        .eq("operation_id", currentOperationId!)
        .order("position");
      if (error) throw error;
      return data as Funnel[];
    },
  });

  const deleteFunnel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funnels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Funil excluído");
      qc.invalidateQueries({ queryKey: ["funnels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const funnels = funnelsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Funil"
        subtitle="Funis de mensagens e automação"
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Novo Funil
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2 xl:grid-cols-3">
        {funnelsQ.isLoading && (
          <p className="col-span-full text-sm text-muted-foreground">Carregando…</p>
        )}
        {funnelsQ.data && funnels.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum funil ainda.</p>
            <button
              onClick={() => setCreating(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeiro funil
            </button>
          </div>
        )}

        {funnels.map((f) => (
          <div
            key={f.id}
            onClick={() => navigate({ to: "/funil/$id", params: { id: f.id } })}
            className="cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <GitBranch className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-foreground">{f.name}</h3>
                <p className="truncate font-mono text-xs text-muted-foreground">{f.internal_id}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Excluir funil "${f.name}"?`)) deleteFunnel.mutate(f.id);
                }}
                className="rounded-md border border-border p-2 text-destructive hover:border-destructive/40"
                title="Excluir funil"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Envios
              </p>
              <p className="text-xl font-bold text-primary">{f.envios}</p>
            </div>
          </div>
        ))}
      </div>

      {creating && <NewFunnelModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewFunnelModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { currentOperationId } = useOperation();
  const [name, setName] = useState("");
  const [internalId, setInternalId] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !internalId.trim()) {
        throw new Error("Nome e ID interno são obrigatórios");
      }
      if (!currentOperationId) throw new Error("Operação não selecionada");
      const { data, error } = await supabase
        .from("funnels")
        .insert({
          name,
          internal_id: internalId,
          operation_id: currentOperationId,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (data) => {
      toast.success("Funil criado");
      qc.invalidateQueries({ queryKey: ["funnels"] });
      onClose();
      // Abre direto o builder do funil recém-criado.
      navigate({ to: "/funil/$id", params: { id: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Novo Funil</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              ID Interno (único)
            </label>
            <input
              value={internalId}
              onChange={(e) => setInternalId(e.target.value)}
              placeholder="funil_up1"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {save.isPending ? "Criando…" : "Criar e abrir builder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
